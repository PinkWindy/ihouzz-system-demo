import { afterEach, describe, expect, it } from 'vitest';
import { runListingExpiryTick } from '../../listingExpiryJob.mjs';

afterEach(() => {
  delete process.env.IHOUZZ_EXPIRY_VIRTUAL_NOW_ISO;
});

describe('listingExpiryJob (UC005)', () => {
  it('AC5-009: nhắc một lần khi còn đúng 7 ngày lịch UTC tới ngày hết hạn', async () => {
    const db = {
      data: {
        listings: [
          {
            id: 'L1',
            listingCode: 'LT-00999',
            property_id: 'LS-00001',
            listing_status: 'Đã duyệt',
            approvedAt: '2026-05-15T10:00:00.000Z',
            expiredAt: '2026-06-14T10:00:00.000Z',
            createdBy: 'Đầu chủ Demo',
            updatedAt: '2026-05-15T10:00:00.000Z',
          },
        ],
        properties: [
          {
            id: 'LS-00001',
            propertyCode: 'LS-00001',
            level2_status: 'Đang niêm yết',
            statusLv2: 'Đang niêm yết',
            updatedAt: '2026-05-15T10:00:00.000Z',
          },
        ],
        logs: [],
        notifications: [],
      },
    };

    process.env.IHOUZZ_EXPIRY_VIRTUAL_NOW_ISO = '2026-06-07T12:00:00.000Z';
    const r = await runListingExpiryTick(db);
    expect(r.reminders).toBe(1);
    expect(r.expired).toBe(0);
    expect(db.data.listings[0].expiry_reminder_sent_at).toBeTruthy();
    expect(db.data.notifications.length).toBe(1);
    expect(db.data.logs.some((l) => String(l.action).includes('EXPIRY_REMINDER_SENT'))).toBe(true);
  });

  it('AC5-010: đến ngày hết hạn → Hết hạn + Lv2 Chưa niêm yết', async () => {
    const db = {
      data: {
        listings: [
          {
            id: 'L2',
            listingCode: 'LT-00998',
            property_id: 'LS-00002',
            listing_status: 'Đã duyệt',
            approvedAt: '2026-05-15T10:00:00.000Z',
            expiredAt: '2026-06-14T10:00:00.000Z',
            expiry_reminder_sent_at: '2026-06-07T12:00:00.000Z',
            createdBy: 'Đầu chủ Demo',
            updatedAt: '2026-06-07T12:00:00.000Z',
          },
        ],
        properties: [
          {
            id: 'LS-00002',
            propertyCode: 'LS-00002',
            level2_status: 'Đang niêm yết',
            statusLv2: 'Đang niêm yết',
            updatedAt: '2026-05-15T10:00:00.000Z',
          },
        ],
        logs: [],
        notifications: [],
      },
    };

    process.env.IHOUZZ_EXPIRY_VIRTUAL_NOW_ISO = '2026-06-14T00:00:00.000Z';
    const r = await runListingExpiryTick(db);
    expect(r.expired).toBe(1);
    expect(db.data.listings[0].listing_status).toBe('Hết hạn');
    expect(db.data.properties[0].level2_status).toBe('Chưa niêm yết');
    expect(db.data.properties[0].statusLv2).toBe('Chưa niêm yết');
    expect(db.data.logs.some((l) => String(l.action).includes('AUTO_EXPIRED'))).toBe(true);
  });
});
