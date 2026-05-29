/**
 * json-server v1 + kiểm tra trùng tin server-side (BR-UC004-01).
 * POST /listings, PATCH /listings/:id → Đã duyệt: cần X-Force-Duplicate: true nếu trùng.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from '@tinyhttp/app';
import { cors } from '@tinyhttp/cors';
import { json } from 'milliparsec';
import { JSONFile } from 'lowdb/node';
import { Low } from 'lowdb';
import { createApp } from 'json-server/lib/app.js';
import {
  findActiveDuplicateListings,
  formatListingId,
  formatPropertyId,
} from './src/utils/listingWorkflow.js';
import { getListingExpiryJobConfig, runListingExpiryTick } from './listingExpiryJob.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5000;
const FORCE_HDR = 'x-force-duplicate';

function duplicatePayload(propertyRef, duplicates, message) {
  return {
    code: 'DUPLICATE_LISTING',
    message: message || 'Tài sản đã có tin đăng đang hoạt động.',
    propertyRef: formatPropertyId(propertyRef),
    duplicates: duplicates.map((d) => ({
      listingId: formatListingId(d.listingCode || d.id),
      createdBy: d.createdBy || d.createdBy_name || null,
      createdAt: d.createdAt || null,
      expiredAt: d.expiredAt || null,
      listing_status: d.listing_status,
    })),
  };
}

function duplicateGuard(db) {
  return (req, res, next) => {
    const force = String(req.headers[FORCE_HDR] || '').toLowerCase() === 'true';
    const listings = db.data?.listings || [];

    if (req.method === 'POST' && req.path === '/listings') {
      const propertyRef = req.body?.property_id;
      if (propertyRef) {
        const dups = findActiveDuplicateListings(listings, propertyRef, null);
        if (dups.length > 0 && !force) {
          return res.status(409).json(duplicatePayload(propertyRef, dups));
        }
      }
    }

    if (req.method === 'PATCH' && /^\/listings\/[^/]+$/.test(req.path)) {
      const id = decodeURIComponent(req.path.split('/').pop());
      const nextStatus = req.body?.listing_status;
      if (nextStatus === 'Đã duyệt') {
        const current = listings.find((l) => String(l.id) === String(id));
        const propertyRef = req.body?.property_id || current?.property_id;
        if (propertyRef) {
          const dups = findActiveDuplicateListings(listings, propertyRef, id);
          if (dups.length > 0 && !force) {
            return res.status(409).json(
              duplicatePayload(
                propertyRef,
                dups,
                'Phê duyệt bị chặn tạm thời — cần xác nhận cảnh báo trùng tin.',
              ),
            );
          }
        }
      }
    }

    next();
  };
}

const file = join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const db = new Low(adapter, {});
await db.read();

const apiApp = createApp(db);
const server = new App();

server.use((req, res, next) =>
  cors({
    allowedHeaders: req.headers['access-control-request-headers']?.split(',').map((h) => h.trim()),
  })(req, res, next),
);
server.options('*', cors());
server.use(json());

function internalListingExpiryAuth(req, res, next) {
  const token = process.env.IHOUZZ_EXPIRY_INTERNAL_TOKEN;
  if (!token) return next();
  const h = String(req.headers.authorization || '');
  if (h !== `Bearer ${token}`) {
    return res.status(401).json({ ok: false, error: 'Thiếu hoặc sai Bearer token (IHOUZZ_EXPIRY_INTERNAL_TOKEN).' });
  }
  return next();
}

server.get('/internal/listing-expiry-config', (_req, res) => {
  res.json({ ok: true, ...getListingExpiryJobConfig() });
});

server.post('/internal/listing-expiry-run', internalListingExpiryAuth, async (_req, res) => {
  try {
    const summary = await runListingExpiryTick(db);
    await db.write();
    res.json({ ok: true, ...summary });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

server.use(duplicateGuard(db));

// Middleware to prevent secondary body-parsers from hanging or overwriting already-parsed req.body
server.use((req, res, next) => {
  if (req.body !== undefined) {
    const parsedBody = req.body;
    
    // Lock req.body to the already parsed object
    Object.defineProperty(req, 'body', {
      get() { return parsedBody; },
      set() { /* prevent override */ },
      configurable: true,
      enumerable: true
    });
    
    // Mock stream event emitter for 'data' and 'end' since the stream is already consumed
    const originalOn = req.on;
    req.on = function(event, listener) {
      if (event === 'end') {
        process.nextTick(listener);
        return this;
      }
      if (event === 'data') {
        return this;
      }
      return originalOn.apply(this, arguments);
    };
  }
  next();
});

server.use(apiApp);

const expiryCfg = getListingExpiryJobConfig();
const tickAndPersist = async () => {
  try {
    await runListingExpiryTick(db);
    await db.write();
  } catch (e) {
    console.error('[listing-expiry-job]', e);
  }
};

if (expiryCfg.cronEnabled) {
  setInterval(tickAndPersist, expiryCfg.cronMs);
  if (expiryCfg.runOnStart) setTimeout(() => void tickAndPersist(), 3000);
  console.log(
    `[listing-expiry-job] bật · mỗi ${expiryCfg.cronMs}ms · runOnStart=${expiryCfg.runOnStart} · virtualNow=${expiryCfg.virtualNow || '(theo đồng hồ máy)'}`,
  );
} else {
  console.log('[listing-expiry-job] quét định kỳ tắt mặc định. Bật: IHOUZZ_EXPIRY_CRON_ENABLED=true');
}
console.log(
  `[listing-expiry-job] POST http://localhost:${PORT}/internal/listing-expiry-run — chạy tay (thuyết trình); GET /internal/listing-expiry-config`,
);

server.listen(PORT, () => {
  console.log(`iHouzz API http://localhost:${PORT} (duplicate guard BR-UC004-01)`);
});
