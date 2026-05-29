# Ghi chú phiên làm việc (Cursor) — 2026-05-23

Tài liệu này tóm tắt **nội dung đã xử lý trong phiên chat** liên quan bản demo `ihouzz-demo` (Vite, thường chạy tại `http://localhost:5173/`, API `http://localhost:5000`).

---

## 1. F11 — Không thấy dữ liệu audit

**Triệu chứng:** Màn Audit / F11 không hiển thị bản ghi dù `db.json` và thao tác nghiệp vụ có ghi log.

**Nguyên nhân:** `json-server` v1 coi `_order` là **tham số lọc** (where), không phải reserved. Query  
`GET /logs?_sort=timestamp&_order=desc&...` khiến mọi dòng phải có field `_order === "desc"` → **0 bản ghi**.

**Cách xử lý:** Đổi sang quy ước `sort-on`: **`_sort=-timestamp`**, bỏ `_order` (file `src/pages/Feature11_Audit.jsx`).

---

## 2. F11 — Không mở được / màn hình trắng

**Nguyên nhân:** Nhiều log có `entityId` kiểu **number** (ví dụ id user). Hàm `formatEntity` gọi `id.startsWith(...)` → **TypeError** khi render dropdown / badge.

**Cách xử lý:** Ép kiểu `String(id)` trong `formatEntity`; lọc search / dropdown đối tượng dùng `String(...)` để so khớp an toàn (`Feature11_Audit.jsx`).

---

## 3. F11 — Số trên thẻ thống kê khó đọc (nền tối)

**Cách xử lý:** Gán màu chữ sáng cho giá trị số (`#f0f6fc`) trên các thẻ Tổng sự kiện / Người dùng / Đối tượng / Hôm nay (`Feature11_Audit.jsx`).

---

## 4. Giao diện demo “sạch” — bỏ ghi chú BR / FR / US / SRS / UC trên UI

**Mục tiêu:** Người dùng cuối không thấy mã tài liệu (BR-, FR-, US…, SRS, UCxxx, ERR-F…) trên màn hình; giữ diễn đạt nghiệp vụ bằng tiếng Việt.

**Phạm vi đã chỉnh (tiêu biểu):**

| Khu vực | Việc đã làm |
|--------|----------------|
| `App.jsx` | Menu / idle / audit đăng xuất; đổi nhãn F11 sidebar & topbar → **Nhật ký thao tác** |
| `Home.jsx` | Badge & mô tả landing, bỏ tham chiếu SRS / “Feature 1” kiểu spec |
| `Feature1_Login.jsx` | Chuỗi audit bỏ tiền tố `[UC001]`; gợi ý lỗi không nhắc “Feature 10” |
| `listingWorkflow.js` | `LOG_PREFIX` từ `[UC004/UC005]` → **`[Tin đăng]`** (ảnh hưởng log hiển thị) |
| F2–F12, `SalesMobile.jsx` | Badge, toast, alert, tiêu đề phụ, tab minh họa F6: bỏ mã BR/FR/US/UC trên UI; audit text dễ đọc hơn |
| `Feature11_Audit.jsx` | Tiêu đề “Nhật ký thao tác”; export log không dùng `[F11]`; CSV footer gọn |

**Lưu ý:** Trong code vẫn có **comment** hoặc **`action_type`** dạng kỹ thuật (ví dụ enum audit) — không hiển thị như nhãn màn hình thông thường. Log **cũ** trong `db.json` có thể vẫn chứa chuỗi cũ cho đến khi dữ liệu được làm mới.

---

## 5. File mã nguồn chính đã đụng tới (phiên này)

- `src/pages/Feature11_Audit.jsx`
- `src/utils/listingWorkflow.js`
- `src/App.jsx`
- `src/pages/Home.jsx`
- `src/pages/Feature1_Login.jsx`
- `src/pages/Feature2_Create.jsx`
- `src/pages/Feature3_Approval.jsx`
- `src/pages/Feature4_CreateListing.jsx`
- `src/pages/Feature5_MKTApproval.jsx`
- `src/pages/Feature6_Unlist.jsx`
- `src/pages/Feature7_UnlistApproval.jsx`
- `src/pages/Feature8_Unsource.jsx`
- `src/pages/Feature9_Warehouse.jsx`
- `src/pages/Feature10_IAM.jsx`
- `src/pages/Feature12_Dashboard.jsx`
- `src/pages/SalesMobile.jsx`

*(Các file khác trong repo / submodule có thể đã thay đổi từ phiên khác — xem `git status` tại thời điểm commit.)*

---

## 6. Git commit

Phiên này **chỉ thêm file ghi chú** `docs/PHIEN_LAM_VIEC_Cursor_2026-05-23_F11_va_giao_dien_demo.md`.  
Nếu bạn muốn **commit** toàn bộ thay đổi mã nguồn, hãy nói rõ (theo quy tắc repo: chỉ commit khi bạn yêu cầu).

---

*Tạo tự động theo yêu cầu “lưu nội dung phiên làm việc” — có thể chỉnh sửa / bổ sung Change Log thủ công sau.*
