# Nguồn gốc ảnh — hướng dẫn cho lái xe

Tệp này dành cho **người bảo trì tài liệu**. Mỗi ảnh `NN-*.jpg` trong thư mục phải có một dòng ở bảng dưới; bài kiểm tra trong `tools/customer-source-guardrail/` bắt việc này.

## Chung

- **Chụp bằng kịch bản**, không chụp tay: `../../cong-cu-anh/chup-tai-xe.mjs` (xem `../../cong-cu-anh/README.md`). Kịch bản tạo một đơn có điểm lấy và điểm giao trên bản đồ, giao xe, rồi đi hết các mốc trên điện thoại. Khung cam và số khoanh lấy vị trí từ chính phần tử trên trang.
- **Nơi chụp:** bản cài **cục bộ** dựng từ phiên bản mã `0ee5a521` — cùng phần ứng dụng với `main` lúc chụp. Gói khách `transport-preview`, dữ liệu mẫu, cơ sở dữ liệu riêng của máy. Đăng nhập vai lái xe trên bản demo dùng chung cần mật khẩu mà người soạn không được dùng, và kịch bản phải ghi mốc — nên chỉ chạy cục bộ.
- **Vai đăng nhập:** một lái xe mẫu, khung điện thoại 390 × 844 (×2).
- **Vị trí** trong ảnh là **toạ độ mẫu** của hai địa điểm đã biết trong dữ liệu demo (nhà máy thép và kho nhựa), không phải vị trí thật của ai. Ảnh biên nhận tải lên là một tấm "GIẤY TỜ MẪU" do kịch bản tự vẽ.
- **Thời điểm chụp:** rạng sáng 24/09/2026.

## Từng ảnh

| Tệp                       | Màn hình                                           |
| ------------------------- | -------------------------------------------------- |
| `01-trang-chu.jpg`        | Trang chủ — việc được điều từ văn phòng            |
| `02-hien-truong.jpg`      | Hiện trường trước khi tới điểm lấy                 |
| `03-tai-diem-lay.jpg`     | Tại điểm lấy hàng — ba nút mốc                     |
| `04-tren-duong.jpg`       | Đang trên đường — nút "Đã đến nơi (cần vị trí)"    |
| `05-chua-bat-vi-tri.jpg`  | Máy chưa cho quyền vị trí — mốc không được ghi     |
| `06-da-den-noi.jpg`       | Đã đến nơi — "Bắt đầu chờ" và "Khách đã nhận hàng" |
| `07-dang-cho.jpg`         | Đang chờ người nhận                                |
| `08-chup-bien-nhan.jpg`   | Chụp biên nhận giao hàng                           |
| `09-da-gui-bien-nhan.jpg` | Biên nhận đã gửi, bản giấy đang ở lái xe           |
| `10-nhien-lieu.jpg`       | Ghi phiếu đổ nhiên liệu — chọn cách thanh toán     |
| `11-phieu-da-gui.jpg`     | Phiếu đổ dầu vừa gửi                               |
| `12-chi-phi.jpg`          | Ghi khoản chi — chưa ghi được cho vòng xe          |
| `13-quy.jpg`              | Quỹ của bạn                                        |
| `14-phieu-luong.jpg`      | Phiếu lương và bảng quyết toán                     |
