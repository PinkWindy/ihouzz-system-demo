/**
 * UC005 — Job niêm yết (SRS AC5-009 / AC5-010 / BR5-007…009).
 * - Nhắc một lần khi còn đúng 7 ngày lịch (UTC) tới ngày hết hạn.
 * - Tự hết hạn: listing → "Hết hạn", tài sản Lv2 → "Chưa niêm yết", log + notification.
 *
 * Cấu hình env (tùy chọn):
 * - IHOUZZ_EXPIRY_CRON_ENABLED   (default "false") — "true" bật quét định kỳ; **false** = không tự ghi DB (giữ nguyên demo cũ).
 * - IHOUZZ_EXPIRY_CRON_MS        (default 3600000 = 1 giờ) — chu kỳ quét.
 * - IHOUZZ_EXPIRY_RUN_ON_START   (default "false") — "true" chạy một lần sau ~3s khi API khởi động.
 * - IHOUZZ_EXPIRY_VIRTUAL_NOW_ISO — ví dụ 2026-06-07T12:00:00.000Z để demo nhắc hạn mà không đổi ngày máy.
 * - IHOUZZ_EXPIRY_INTERNAL_TOKEN — nếu set, POST /internal/listing-expiry-run cần header Authorization: Bearer <token>.
 */
import {
  LISTING_APPROVAL_VALID_DAYS,
  formatListingId,
  propertyMatchesExternalRef,
  AUDIT_ACTION_TYPE,
} from './src/utils/listingWorkflow.js';

const MS_DAY = 86400000;

function envBool(name, defaultValue) {
  const v = process.env[name];
  if (v == null || v === '') return defaultValue;
  return String(v).toLowerCase() === 'true' || v === '1';
}

function parseVirtualNow() {
  const raw = process.env.IHOUZZ_EXPIRY_VIRTUAL_NOW_ISO;
  if (!raw || !String(raw).trim()) return null;
  const d = new Date(String(raw).trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

function utcDayStart(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Số ngày lịch (UTC) từ đầu ngày `now` đến đầu ngày hết hạn: 0 = hôm nay là ngày hết hạn, 7 = còn đúng 7 ngày. */
function calendarDaysFromTodayToExpiry(nowMs, expiryMs) {
  return Math.round((utcDayStart(expiryMs) - utcDayStart(nowMs)) / MS_DAY);
}

function randomLogId() {
  return Math.random().toString(36).slice(2, 12);
}

function resolveExpiryMs(listing) {
  if (listing.expiredAt) {
    const t = new Date(listing.expiredAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (listing.approvedAt) {
    const a = new Date(listing.approvedAt).getTime();
    if (!Number.isNaN(a)) return a + LISTING_APPROVAL_VALID_DAYS * MS_DAY;
  }
  return null;
}

function findProperty(properties, propertyRef) {
  return (properties || []).find((p) => propertyMatchesExternalRef(p, propertyRef)) || null;
}

function formatViDateFromMs(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * @param {import('lowdb').Low} db
 * @returns {Promise<{ nowIso: string, reminders: number, expired: number, errors: string[] }>}
 */
export async function runListingExpiryTick(db) {
  const virtual = parseVirtualNow();
  const nowMs = virtual ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const errors = [];
  let reminders = 0;
  let expired = 0;

  if (!db.data) db.data = {};
  const listings = db.data.listings || (db.data.listings = []);
  const properties = db.data.properties || (db.data.properties = []);
  const logs = db.data.logs || (db.data.logs = []);
  const notifications = db.data.notifications || (db.data.notifications = []);

  for (const listing of listings) {
    if (!listing || listing.listing_status !== 'Đã duyệt') continue;

    const expiryMs = resolveExpiryMs(listing);
    if (expiryMs == null) continue;

    const daysLeft = calendarDaysFromTodayToExpiry(nowMs, expiryMs);
    const listingCode = formatListingId(listing.listingCode || listing.id);
    const prop = findProperty(properties, listing.property_id);

    try {
      // --- AC5-009: nhắc khi còn đúng 7 ngày (một lần)
      if (
        daysLeft === 7 &&
        !listing.expiry_reminder_sent_at &&
        listing.listing_status === 'Đã duyệt'
      ) {
        listing.expiry_reminder_sent_at = nowIso;
        listing.updatedAt = nowIso;
        const expiryDateStr = formatViDateFromMs(expiryMs);
        const msg = `⏰ Bài đăng ${listingCode} sẽ hết hạn vào ${expiryDateStr} (UTC). Vui lòng đăng lại nếu cần.`;
        notifications.push({
          id: randomLogId(),
          propertyId: listing.property_id,
          listingId: listing.id,
          recipient: listing.createdBy || 'Đầu chủ',
          message: msg,
          type: 'warning',
          createdAt: nowIso,
          isRead: false,
        });
        logs.push({
          id: randomLogId(),
          timestamp: nowIso,
          action: `[UC005 Job] EXPIRY_REMINDER_SENT — ${listingCode} · days_remaining=7 · expiry_utc=${new Date(expiryMs).toISOString()}`,
          action_type: AUDIT_ACTION_TYPE.JOB_EXPIRY_REMINDER_SENT,
          entityId: String(listing.id),
          listing_id: String(listing.id),
          user: 'Hệ thống (Job niêm yết)',
          user_id: null,
          property_id: listing.property_id,
          old_status: 'Đã duyệt',
          new_status: 'Đã duyệt',
          detail: JSON.stringify({ listing_id: listing.id, property_id: listing.property_id, days_remaining: 7 }),
        });
        reminders += 1;
      }

      // --- AC5-010: hết hạn (đầu ngày hết hạn UTC trở đi)
      if (daysLeft <= 0) {
        listing.listing_status = 'Hết hạn';
        listing.auto_expired_at = nowIso;
        listing.updatedAt = nowIso;

        if (prop && prop.id) {
          prop.level2_status = 'Chưa niêm yết';
          prop.statusLv2 = 'Chưa niêm yết';
          prop.updatedAt = nowIso;
        }

        const msg = `Bài đăng ${listingCode} đã hết hạn niêm yết. Tài sản trở về Kho.`;
        notifications.push({
          id: randomLogId(),
          propertyId: listing.property_id,
          listingId: listing.id,
          recipient: listing.createdBy || 'Đầu chủ',
          message: msg,
          type: 'info',
          createdAt: nowIso,
          isRead: false,
        });
        logs.push({
          id: randomLogId(),
          timestamp: nowIso,
          action: `[UC005 Job] AUTO_EXPIRED — ${listingCode} · property=${listing.property_id}`,
          action_type: AUDIT_ACTION_TYPE.JOB_LISTING_AUTO_EXPIRED,
          entityId: String(listing.id),
          listing_id: String(listing.id),
          user: 'Hệ thống (Job niêm yết)',
          user_id: null,
          property_id: listing.property_id,
          old_status: 'Đã duyệt',
          new_status: 'Hết hạn',
          modified_fields: prop?.id
            ? { level2_status: { from: 'Đang niêm yết', to: 'Chưa niêm yết' }, listing_status: { from: 'Đã duyệt', to: 'Hết hạn' } }
            : { listing_status: { from: 'Đã duyệt', to: 'Hết hạn' } },
          detail: JSON.stringify({ listing_id: listing.id, property_id: listing.property_id }),
        });
        expired += 1;
      }
    } catch (e) {
      errors.push(`${listingCode}: ${e?.message || e}`);
    }
  }

  return { nowIso, reminders, expired, errors };
}

export function getListingExpiryJobConfig() {
  return {
    cronEnabled: envBool('IHOUZZ_EXPIRY_CRON_ENABLED', false),
    cronMs: Math.max(10_000, Number(process.env.IHOUZZ_EXPIRY_CRON_MS) || 3_600_000),
    runOnStart: envBool('IHOUZZ_EXPIRY_RUN_ON_START', false),
    virtualNow: process.env.IHOUZZ_EXPIRY_VIRTUAL_NOW_ISO || null,
    internalTokenSet: Boolean(process.env.IHOUZZ_EXPIRY_INTERNAL_TOKEN),
  };
}
