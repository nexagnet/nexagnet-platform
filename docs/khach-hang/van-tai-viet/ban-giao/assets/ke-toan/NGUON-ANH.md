# Nguồn gốc ảnh — hướng dẫn cho kế toán

Tệp này dành cho **người bảo trì tài liệu**. Mỗi ảnh `NN-*.jpg` trong thư mục phải có một dòng ở bảng dưới; bài kiểm tra trong `tools/customer-source-guardrail/` bắt việc này.

## Chung

- **Chụp bằng kịch bản**, không chụp tay: `../../cong-cu-anh/chup-ke-toan.mjs`, chạy sau `chup-tai-xe.mjs` (xem `../../cong-cu-anh/README.md`). Khung cam và số khoanh lấy vị trí từ chính phần tử trên trang.
- **Nơi chụp:** bản cài **cục bộ** dựng từ phiên bản mã `0ee5a521` — cùng phần ứng dụng với `main` lúc chụp (commit sau đó chỉ đổi tài liệu). Gói khách `transport-preview`, dữ liệu mẫu tháng vận hành, cơ sở dữ liệu riêng của máy.
- **Vì sao cục bộ:** kịch bản phải **ghi** (kết thúc đơn, đối soát, ghi tiền về, xác thực phiếu dầu). Làm việc đó trên bản demo dùng chung sẽ để lại dữ liệu thử cho mọi người; kịch bản từ chối chạy khi địa chỉ không phải `localhost`.
- **Vai đăng nhập:** kế toán mẫu. Khung nhìn 1440 × 900; riêng ảnh 12 rộng 1680 để thấy cột "Ghi chú".
- **Thời điểm chụp:** rạng sáng 24/09/2026.

## Từng ảnh

| Tệp                            | Màn hình                                        |
| ------------------------------ | ----------------------------------------------- |
| `01-ket-thuc-don.jpg`          | Kết thúc đơn — lọc "Chờ kết thúc"               |
| `02-ket-thuc-don-xac-nhan.jpg` | Hộp xác nhận "Đã kết thúc" có ghi căn cứ        |
| `03-phai-thu-cho-doi-soat.jpg` | Phải thu khách hàng — việc đối soát và thu tiền |
| `04-chot-mot-don.jpg`          | Chốt số với khách cho một đơn                   |
| `05-nhap-tien-ve.jpg`          | Ghi nhận tiền khách đã trả                      |
| `06-gan-tien-vao-no.jpg`       | Gắn tiền vào chứng từ phải thu                  |
| `07-phai-tra.jpg`              | Phải trả đối tác và cây xăng                    |
| `08-xac-thuc-phieu-dau.jpg`    | Hộp xác thực phiếu dầu lái xe trả tiền mặt      |
| `09-phan-bo-gia-thanh-dau.jpg` | Phân bổ giá thành dầu vào vòng xe               |
| `10-doi-soat-bang-ke.jpg`      | Kỳ đối soát bảng kê cây xăng                    |
| `11-quy-lai-xe.jpg`            | Quỹ lái xe — dòng "Chi phí vòng xe"             |
| `12-hieu-qua-tung-don.jpg`     | Hiệu quả từng chuyến — lọc "Đơn theo vòng xe"   |
