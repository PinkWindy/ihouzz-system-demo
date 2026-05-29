# Kịch bản thuyết trình — Job niêm yết (UC005 · AC5-009 / AC5-010)

Tài liệu mô tả **triển khai thật** trong `ihouzz-demo`: file `listingExpiryJob.mjs`, tích hợp `api-server.mjs`.  
**Mặc định:** quét định kỳ **tắt** (`IHOUZZ_EXPIRY_CRON_ENABLED` không set hoặc `false`) — **không** tự đổi `db.json` khi chỉ chạy API như trước.  
**Chạy job:** `POST /internal/listing-expiry-run` (chạy tay khi thuyết trình) hoặc bật cron bằng env.

---

## 1. Chuẩn bị (2 phút)

1. Terminal A: `cd ihouzz-demo` → `npm run api` (cổng **5000**).  
   Trong log có dòng `[listing-expiry-job]` và URL POST nội bộ.
2. Terminal B: `npm run dev` (Vite **5173**).
3. Đăng nhập **Marketing** hoặc **Admin** (để xem F5/F6, thông báo).
4. (Tuỳ chọn) Mở `db.json` backup hoặc `git checkout -- db.json` sau buổi demo nếu đã chạy job trên dữ liệu thật.

---

## 2. “Thời gian ảo” cho demo (không đổi ngày máy)

Job so sánh theo **đầu ngày UTC**. Biến:

`IHOUZZ_EXPIRY_VIRTUAL_NOW_ISO`

**PowerShell (chỉ phiên API hiện tại):**

```powershell
$env:IHOUZZ_EXPIRY_VIRTUAL_NOW_ISO = "2026-06-07T12:00:00.000Z"
npm run api
```

**Kịch bản A — Nhắc còn 7 ngày (AC5-009)**  
Chọn một tin trong `db.json` đang `listing_status` = `Đã duyệt`, có `expiredAt` (hoặc `approvedAt` + 30 ngày) rơi vào **2026-06-14** (UTC).  
Khi **virtual now = 2026-06-07** → còn đúng **7** ngày lịch UTC tới ngày hết hạn → job gửi **một lần** nhắc, ghi `expiry_reminder_sent_at`, thêm `notifications` + `logs` (`EXPIRY_REMINDER_SENT`).

**Kịch bản B — Tự hết hạn (AC5-010)**  
Đặt virtual now **≥ ngày hết hạn UTC** (ví dụ `2026-06-14T00:00:00.000Z` trở đi với ví dụ trên). Chạy POST job → tin → `Hết hạn`, tài sản Lv2 → `Chưa niêm yết`, thông báo + log `AUTO_EXPIRED`.

**Lưu ý:** Sau khi đổi env, **restart** `npm run api`.

---

## 3. Chạy job tay (thuyết trình trên máy không dùng virtual time)

**PowerShell:**

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:5000/internal/listing-expiry-run" -ContentType "application/json" -Body "{}"
```

**curl (Git Bash):**

```bash
curl -s -X POST http://localhost:5000/internal/listing-expiry-run -H "Content-Type: application/json" -d "{}"
```

Response mẫu: `{ "ok": true, "nowIso": "...", "reminders": 0, "expired": 0, "errors": [] }`.

Nếu đặt `IHOUZZ_EXPIRY_INTERNAL_TOKEN` trong env, thêm header:

`Authorization: Bearer <token>`

**Kiểm tra cấu hình:**

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/internal/listing-expiry-config"
```

---

## 4. Bật cron định kỳ (tuỳ chọn — “A đầy đủ” có lịch)

Mặc định **tắt** để không ảnh hưởng người chỉ chạy demo cũ.

```powershell
$env:IHOUZZ_EXPIRY_CRON_ENABLED = "true"
$env:IHOUZZ_EXPIRY_CRON_MS = "3600000"
$env:IHOUZZ_EXPIRY_RUN_ON_START = "false"
npm run api
```

- `IHOUZZ_EXPIRY_CRON_MS`: tối thiểu **10000** ms (10 giây) trong code (tránh vòng lặp quá dày). Mặc định **3600000** (1 giờ).  
- `IHOUZZ_EXPIRY_RUN_ON_START=true`: chạy một lần sau ~3 giây khi khởi động API (chỉ bật khi cần kiosk).

---

## 5. Luồng nói gợi ý (3–5 phút)

1. **Bối cảnh SRS:** “Sau khi MKT duyệt, tin có `expiredAt`; hệ thống thật có job 00:00 — ở demo ta mô phỏng bằng service trong `api-server`.”
2. **Không phá luồng cũ:** “Mặc định không quét tự động; F4/F5/F6 dùng như cũ. Khi cần chứng minh AC5-009/010, em gọi POST nội bộ hoặc bật env.”
3. **Thao tác:** Set `IHOUZZ_EXPIRY_VIRTUAL_NOW_ISO` cho mốc **nhắc 7 ngày** → POST run → mở app: tab thông báo / F5 tab Tất cả / `GET /logs` lọc `EXPIRY_REMINDER_SENT`.
4. **Tiếp:** Đổi virtual now sang **ngày hết hạn** → POST run → chỉ ra listing `Hết hạn`, tài sản Lv2 `Chưa niêm yết`, log `AUTO_EXPIRED`.
5. **Trùng tin (BR-UC004-01):** “Tin `Hết hạn` không còn là tin hoạt động — Đầu chủ có thể soạn tin mới (AC5-011) trong phạm vi demo F4.”

---

## 6. Kiểm tra nhanh sau demo

- `listing_status` có bản ghi `Hết hạn` và `level2_status` / `statusLv2` = `Chưa niêm yết` đúng tài sản.  
- `logs` có chuỗi `[UC005 Job]`.  
- `expiry_reminder_sent_at` chỉ xuất hiện sau khi đã nhắc (idempotent).

---

*Tệp code: `ihouzz-demo/listingExpiryJob.mjs`, `ihouzz-demo/api-server.mjs`.*
