# iHouzz Internal Warehouse & Listing Management System

**Dự án:** iHouzz System Demo (ReactJS + JSON Server)  
**Tác giả / Nhóm:** [Tên của bạn/nhóm bạn]  
**Phiên bản:** 1.0.0 (Enterprise UAT Version)

---

## 📌 Giới thiệu dự án
Đây là bản Prototype thực tế của hệ thống **Quản trị Kho hàng và Niêm yết iHouzz**. Hệ thống được thiết kế theo tư duy Enterprise với các nguyên tắc cốt lõi:
- **Kiến trúc 2-Level Status:** Quản lý vòng đời Tài sản (Kho) và Tin đăng (Listing) song song.
- **Dynamic RBAC & Permission Matrix:** Phân quyền động, cho phép Admin cấp quyền xem/che dữ liệu (Data Masking) trực tiếp trên UI.
- **Immutable Audit Trail:** Ghi nhận nhật ký vận hành bất biến.
- **No Hard Delete:** Không có nút Xóa, đảm bảo toàn vẹn dữ liệu.

## 🚀 Tính năng chính (Features)
- **Feature 2:** Tạo tài sản với SmartAddress (Debounce check duplicate).
- **Feature 3:** GĐ POS duyệt kho (Kho chuẩn / Kho đảm bảo).
- **Feature 5 & 7:** MKT/Admin duyệt tin đăng và Yêu cầu gỡ tin (Luồng **Auto-Sync Level 2**).
- **Feature 8:** Yêu cầu gỡ nguồn & Phê duyệt (Luồng **Cascade** hủy tin tự động, block gỡ nguồn khi đang niêm yết - BR-010).
- **Feature 9:** Giám sát kho hàng với Data Masking (ẩn địa chỉ chi nhánh khác - BR-013).
- **Feature 10:** Quản lý User, POS và **Ma trận Phân quyền Động**.
- **Feature 11:** Nhật ký kiểm toán (Audit Trail) có khả năng Export CSV.

## ⚙️ Hướng dẫn cài đặt và Chạy hệ thống (Localhost)

Hệ thống sử dụng **ReactJS (Vite)** cho Frontend và **json-server** làm Mock Backend API (chạy ở port 5000).

### Yêu cầu môi trường:
- Node.js (phiên bản 16.x trở lên)
- Git

### Các bước chạy dự án:

1. **Clone repository này về máy:**
   ```bash
   git clone [Link-Github-Của-Bạn]
   cd ihouzz-demo
   ```

2. **Cài đặt các gói thư viện cần thiết:**
   ```bash
   npm install
   ```

3. **Khởi chạy hệ thống (Chạy song song Frontend và Backend):**
   *(Lưu ý: Mở 2 cửa sổ Terminal)*
   
   - **Terminal 1 (Chạy DB Backend):**
     ```bash
     npm run server
     ```
     *(Backend sẽ chạy ở `http://localhost:5000`)*

   - **Terminal 2 (Chạy Frontend):**
     ```bash
     npm run dev
     ```
     *(Frontend sẽ chạy ở `http://localhost:5173`)*

4. **Truy cập hệ thống:** Mở trình duyệt và truy cập `http://localhost:5173`

## 👥 Danh sách Account Test (Role)
*Mặc định hệ thống giả lập login, bạn có thể thay đổi Role trong phần mã nguồn (File F9, F10) hoặc UI để kiểm thử Masking Address.*
- Role: `admin` (Admin Tổng)
- Role: `pos_manager` (GĐ POS)
- Role: `sales` (Đầu chủ)
- Role: `marketing` (Chuyên viên MKT)

## 📁 Tài liệu đính kèm
- Business Requirement Document (BRD)
- Software Requirement Specification (SRS)
- Kịch bản UAT (Test Cases)
- Ma trận phân quyền (Access Control Matrix)

---
*Dự án được thực hiện phục vụ cho khóa học IT Business Analyst.*
