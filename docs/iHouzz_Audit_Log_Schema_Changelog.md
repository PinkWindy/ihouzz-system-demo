# Changelog — Schema Audit `/logs` (demo json-server)

**Cập nhật:** 2026-05-20  
**Mục tiêu:** Mọi luồng demo ghi log thống nhất qua **`postEntityAudit`** / **`postAuditLog`** (`src/utils/listingWorkflow.js`), khớp yêu cầu vận hành & export F11: `user_id`, `action_type`, `listing_id` (khi có tin), `property_id`, `old_status` / `new_status`, `timestamp`, `reason`, `modified_fields` (khi có chỉnh sửa có cấu trúc), cộng thêm `detail` / field legacy qua **`extra`** khi cần.

---

## 1. Chuẩn body POST `/logs` (json-server)

Server nhận object JSON; các trường dưới đây do **`postEntityAudit`** ghép (một số trường chỉ gửi khi có giá trị).

| Trường | Bắt buộc / thường có | Ý nghĩa |
|--------|----------------------|---------|
| `timestamp` | Luôn (ISO 8601) | Thời điểm ghi log |
| `action` | Luôn | Mô tả đọc nhanh (có thể có tiền tố `[UC004/UC005]`, `[F2]`, `[F11]`…) |
| `action_type` | Luôn (khuyến nghị) | Mã canonical — bảng mục 3 |
| `entityId` | Luôn (chuỗi, có thể rỗng) | Id “đối tượng” trên json-server: thường là **LT-** (tin), **LS-** (tài sản), `SYSTEM`, `ACCOUNT`, … |
| `user` | Luôn | Tên hiển thị người thực hiện |
| `user_id` | Luôn (chuỗi, có thể rỗng) | Id user chuẩn hóa session (`normalizeUserId`) |
| `listing_id` | Khi liên quan tin | Mã/id bài đăng; export F11 ưu tiên cột này |
| `property_id` | Khi liên quan tài sản | Mã LS hoặc id nội bộ property |
| `old_status` / `new_status` | Khi đổi trạng thái | Trạng thái nghiệp vụ (tin hoặc tài sản tuỳ luồng) |
| `reason` | Khi từ chối / gỡ / ghi chú bắt buộc | Lý do text |
| `detail` | Tuỳ chọn | Ngữ cảnh thêm (một dòng hoặc tóm tắt) |
| `modified_fields` | Tuỳ chọn | Object JSON (vd. diff field, chỉnh sửa MKT) |

**`extra` (tham số hàm, không phải tên field API):** object được **merge phẳng** vào body (tương thích field cũ như F3 `changes`, `approver`, `warehouseType`, …). Tránh đặt trong `extra` các key trùng tên cột chuẩn nếu không chủ ý ghi đè.

**Tin đăng:** ưu tiên **`postAuditLog`** — tự set `entityId` = `listingId` và gửi `listing_id`.

---

## 2. API & helper trong code

| Thành phần | Vai trò |
|------------|---------|
| `postEntityAudit(p)` | Hàm gốc: POST `http://localhost:5000/logs` (fetch), gộp `extra` |
| `postAuditLog(payload)` | Bọc cho **bài đăng**: map `actionText` → `action`, `listingId` → `listing_id` + `entityId`, v.v. |
| `postDuplicateWarningAckAudit(...)` | Ghi nhận user xác nhận cảnh báo trùng tin (`DUPLICATE_WARNING_ACK`) |
| `AUDIT_ACTION_TYPE` | Enum chuỗi — **mục 3** |

---

## 3. Bảng mã `action_type` (canonical)

Nguồn duy nhất: `export const AUDIT_ACTION_TYPE` trong `src/utils/listingWorkflow.js`.

| `action_type` | Luồng / Feature demo | Ghi chú ngắn |
|---------------|----------------------|--------------|
| `LISTING_APPROVE` | F5 MKT duyệt tin | Kèm `listing_id`, `property_id`, old/new status |
| `LISTING_APPROVE_WITH_ADJUSTMENT` | F5 duyệt có chỉnh sửa | Thường có `modified_fields` |
| `LISTING_REJECT` | F5 từ chối tin | Có `reason` |
| `DUPLICATE_WARNING_ACK` | F4 / Mobile — xác nhận cảnh báo trùng | Qua `postDuplicateWarningAckAudit` |
| `LISTING_SUBMIT_FOR_REVIEW` | F4 / Mobile — gửi duyệt tin | |
| `LISTING_RESUBMIT_FOR_REVIEW` | F4 / Mobile — gửi lại sau từ chối | Có thể có `modified_fields` |
| `JOB_EXPIRY_REMINDER_SENT` | `listingExpiryJob.mjs` | Nhắc hết hạn |
| `JOB_LISTING_AUTO_EXPIRED` | `listingExpiryJob.mjs` | Tự động hết hạn tin |
| `UC006_REQUEST_UNLIST` | F6 | Đầu chủ yêu cầu gỡ tin |
| `UC006_CANCEL_UNLIST_REQUEST` | F6 | Hủy yêu cầu gỡ tin |
| `UC007_APPROVE_UNLIST` | F7 | Admin/MKT duyệt gỡ tin |
| `UC007_REJECT_UNLIST` | F6/F7 | Từ chối gỡ tin (tuỳ tab/handler) |
| `PROPERTY_F2_ESIGN_CONFIRMED` | F2 Web | Xác nhận KH đã ký (nhánh eSign) |
| `PROPERTY_F2_SEND_POS_ESIGN` | F2 Web | Gửi duyệt POS sau KH ký |
| `PROPERTY_F2_UPDATE_REQUEST` | F2 Web / Mobile | Gửi yêu cầu cập nhật kho chờ GĐ POS |
| `PROPERTY_F2_DRAFT_UPDATE` | F2 Web / Mobile | Cập nhật bản nháp đã có |
| `PROPERTY_F2_DRAFT_SAVE` | F2 Web | Tạo mới bản ghi nháp |
| `PROPERTY_F2_SUBMIT_WAREHOUSE` | F2 Web / Mobile | Gửi duyệt kho (nhánh 1/2/3, tạo TS mobile trực tiếp, gửi lại sau từ chối, …) |
| `PROPERTY_F2_MOBILE_ESIGN_CONFIRMED` | Mobile | Xác nhận KH đã ký |
| `PROPERTY_F2_MOBILE_SEND_POS_ESIGN` | Mobile | Gửi POS sau ký |
| `PROPERTY_F2_MOBILE_SUBMIT_WAREHOUSE` | Mobile | Gửi duyệt theo nhánh từ modal nháp |
| `PROPERTY_F3_APPROVE_UPDATE` | F3 | Duyệt cập nhật tài sản; `extra.changes` |
| `PROPERTY_F3_APPROVE_WAREHOUSE` | F3 | Duyệt vào kho chuẩn / đảm bảo |
| `PROPERTY_F3_REJECT_UPDATE` | F3 | Từ chối cập nhật |
| `PROPERTY_F3_REJECT_WAREHOUSE` | F3 | Từ chối vào kho |
| `PROPERTY_F8_UNSOURCE_REQUEST` | F8 / Mobile | Yêu cầu gỡ nguồn |
| `PROPERTY_F8_UNSOURCE_APPROVE` | F8 | Duyệt gỡ nguồn |
| `PROPERTY_F8_UNSOURCE_REJECT` | F8 | Từ chối gỡ nguồn |
| `IAM_USER_LOCK` | F10 | Khóa user |
| `IAM_USER_UNLOCK` | F10 | Mở khóa |
| `IAM_USER_INACTIVE` | F10 | Vô hiệu hóa |
| `IAM_USER_ACTIVATE` | F10 | Kích hoạt |
| `IAM_USER_CREATE` | F10 | Tạo user |
| `IAM_USER_UPDATE` | F10 | Cập nhật user |
| `IAM_POS_CREATE` | F10 | Tạo POS |
| `IAM_POS_UPDATE` | F10 | Cập nhật POS |
| `IAM_PERMISSION_MATRIX_SAVE` | F10 | Lưu ma trận quyền |
| `AUTH_CREDENTIALS_FAILED` | F1 / `App.jsx` | Sai email/MK, lockout đang hiệu lực, sai OTP, OTP hết hạn đếm ngược |
| `AUTH_CREDENTIALS_BLOCKED` | F1 | Tài khoản `inactive` / `locked` (Admin) |
| `AUTH_MFA_CHALLENGE_CREATED` | F1 | Bước 1 thành công — tạo thử thách MFA |
| `AUTH_OTP_ISSUED` | F1 | OTP gửi (demo mô phỏng kênh) |
| `AUTH_OTP_RESENT` | F1 | Gửi lại OTP sau cooldown |
| `AUTH_MFA_VERIFY_SUCCESS` | F1 | OTP đúng |
| `AUTH_MFA_VERIFY_FAILED` | F1 | OTP sai / hết hạn |
| `AUTH_SESSION_ESTABLISHED` | F1 | Phiên demo (`localStorage`) sau MFA |
| `AUTH_ACCOUNT_TEMP_LOCKED` | F1 | Khóa 30 phút sau 5 lần sai MK |
| `AUTH_PASSWORD_RESET_REQUESTED` | F1 | Yêu cầu quên MK (phương án B) |
| `AUTH_PASSWORD_RESET_BY_ADMIN` | F10 | Reset MK bởi Admin (modal sửa user — demo + audit UC001) |
| `AUTH_LOGOUT` | `App.jsx` | Đăng xuất layout |
| `AUTH_SESSION_EXPIRED` | `App.jsx` (`DashboardLayout`) | Idle timeout phiên demo (mặc định 60 phút; QA: `localStorage.ihouzz_demo_idle_ms`) |
| `AUDIT_EXPORT_RUN` | F11 | Export CSV audit |
| `MOBILE_AUDIT_GENERIC` | Mobile / POS Desktop | Hành động demo chưa tách mã riêng (vd. gỡ tin đơn giản hóa trên property, log kho POS Desktop) |

**Helper:** `accountAuditEntityId(email)` → `entityId` dạng `ACCOUNT:<email>` (UC001 / export F11).

**SRS:** `iHouzz_SRS_Phan_II_Section_2.2.1_Feature1_UC001.md` **v1.3** — **AC1-012** (đồng bộ với bảng trên).

---

## 4. File / script có ghi hoặc đọc `/logs`

**Ghi log (POST):**

- `src/utils/listingWorkflow.js` — `postEntityAudit`, `postAuditLog`, `postDuplicateWarningAckAudit`, `accountAuditEntityId`, `AUDIT_ACTION_TYPE` (gồm mã `AUTH_*` cho UC001)
- `src/App.jsx` — `AUTH_LOGOUT`, **`AUTH_SESSION_EXPIRED`** (idle `DashboardLayout`; helper `touchAuthSessionActivity` / `readDemoIdleSessionMs` trong `listingWorkflow.js`)
- `src/pages/Feature1_Login.jsx` — UC001 MFA & quên MK (`AUTH_*`)
- `src/pages/Feature2_Create.jsx` — F2 tài sản (Web)
- `src/pages/Feature3_Approval.jsx` — F3 GĐ POS
- `src/pages/Feature4_CreateListing.jsx` — F4 tin (qua `postAuditLog`)
- `src/pages/Feature5_MKTApproval.jsx` — F5 MKT
- `src/pages/Feature6_Unlist.jsx` — UC006 (+ helper `appendListingAudit` → `postAuditLog`)
- `src/pages/Feature7_UnlistApproval.jsx` — UC007
- `src/pages/Feature8_Unsource.jsx` — F8 gỡ nguồn
- `src/pages/Feature10_IAM.jsx` — F10 IAM (gồm **`AUTH_PASSWORD_RESET_BY_ADMIN`** khi reset MK từ modal sửa user)
- `src/pages/Feature11_Audit.jsx` — export F11 + đọc log
- `src/pages/SalesMobile.jsx` — Mobile (F2/F4/UC… + `postEntityAudit` / `postAuditLog`)
- `src/pages/POSDesktop.jsx` — demo kho POS (`MOBILE_AUDIT_GENERIC` + `detail`)
- `listingExpiryJob.mjs` — job nhắc / auto hết hạn (ghi trực tiếp vào `db.json` qua lowdb)

**Chỉ đọc / hiển thị log (GET):** `Feature5`, `Feature7`, `Feature9`, `Feature11`, `POSDesktop`, v.v.

---

## 5. Tài liệu SRS / FS / local (repo PinkWindy) — tham chiếu

- `iHouzz_SRS_Phan_II_Section_2.2.5_Feature5_UC005.md` — **v1.4**, **AC5-012**, §2.2.5.8 / §2.2.5.10
- `SRS_FS_UC005_Feature5_MKT_Duyet_Niem_yet_Template_v1_iHouzzDemo.md` — **v1.6**
- `iHouzz_Demo_Local_F5_UC005_MKT_Duyet_niem_yet.md` — **v2.3**
- `iHouzz_SRS_Phan_II_Section_2.2.6_Feature6_UC006.md` — **v1.3** (FR6-010 đối chiếu audit)
- `iHouzz_SRS_Phan_II_Section_2.2.1_Feature1_UC001.md` — **v1.3**, **AC1-012** (`AUTH_*`; F1 + `App.jsx` idle + F10 reset MK)

(Bổ sung tài liệu F2/F3/F8/F10/F11 trong repo gốc khi có phiên bản SRS/FS tương ứng.)

---

## 6. Ghi chú vận hành

- Log **cũ** trong `db.json` không tự cập nhật; chỉ bản ghi **mới** sau thay đổi code có đủ trường chuẩn.
- **Production** có thể map `action_type` → cột ENUM/lookup và `modified_fields` → JSONB/TEXT.
- Export CSV F11: **29 cột** — trong đó có `action_type`, `listing_id`, `modified_fields (JSON)`; `entityId` vẫn giữ để tương thích `GET /logs?entityId=`.

---

## 7. Lịch sử phiên bản tài liệu này

| Phiên bản | Nội dung |
|-------------|----------|
| **1.0** | AC5-012, F5/F4/F6/F7, job expiry, F11 29 cột |
| **1.1** (2026-05-20) | Chuẩn hóa toàn demo qua `postEntityAudit`; bảng đủ `AUDIT_ACTION_TYPE`; danh sách file/script; mô tả `extra` và schema POST |
| **1.2** (2026-05-20) | **UC001 trên demo:** mã `AUTH_*` + `accountAuditEntityId`; `Feature1_Login.jsx` + `App.jsx` gọi `postEntityAudit`; F11 nhận diện `entityId` dạng `ACCOUNT:`; SRS F1 v1.1 **AC1-012** |
| **1.3** (2026-05-20) | **`AUTH_SESSION_EXPIRED`** (idle + cảnh báo) trên `App.jsx`; **`AUTH_PASSWORD_RESET_BY_ADMIN`** trên F10; helper session idle trong `listingWorkflow.js`; SRS F1 **v1.3** |
