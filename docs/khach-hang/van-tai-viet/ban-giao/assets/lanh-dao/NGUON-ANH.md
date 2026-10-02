# Nguồn gốc ảnh — tài liệu cho lãnh đạo

Tệp này dành cho **người bảo trì tài liệu**, không phải cho lãnh đạo. Mỗi ảnh `NN-*.jpg` trong thư mục phải có một dòng ở bảng dưới. Có bài kiểm tra tự động trong `tools/customer-source-guardrail/` bắt việc này. Đây cũng là lý do ảnh được phép nằm trong vùng tài liệu khách: nó là ảnh chụp **sản phẩm của chúng ta** trên dữ liệu mẫu, không phải ảnh khách gửi sang.

## Chung cho cả bộ

- **Thời điểm chụp:** đêm 23 rạng sáng 24/09/2026.
- **Nơi chụp:** bản demo đang chạy, mở qua gateway công khai.
- **Phiên bản mã:** `0ee5a521`. API và web chạy cùng phiên bản này; cả hai lần triển khai đều thành công và trỏ đúng mã này.
- **Dữ liệu:** dữ liệu mẫu, không có dữ liệu thật của khách. Không làm lại hay gieo lại dữ liệu để chụp.
- **Chú thích:** khung cam và số khoanh được chèn vào trang lúc chụp. Không có dữ liệu nào bị sửa để chụp.
- **Xử lý sau chụp:** chỉ cắt lề trống bên phải và nén JPEG, bằng `sharp`. Riêng ảnh 04 được cắt sát cột nội dung vì chụp ở mức thu nhỏ 80%.

## Từng ảnh

| Tệp                           | Màn hình                                              | Vai đăng nhập | Nơi chụp                      |
| ----------------------------- | ----------------------------------------------------- | ------------- | ----------------------------- |
| `01-tong-quan.jpg`            | Tổng quan                                             | Kế toán       | Bản demo                      |
| `02-tao-don-tim-dia-diem.jpg` | Tạo đơn mới — tìm địa điểm                            | Kế toán       | Bản demo                      |
| `03-tao-don-phieu-tuyen.jpg`  | Tạo đơn mới — phiếu tuyến, địa điểm đã biết           | Kế toán       | Bản demo                      |
| `04-don-vong-xe-chang.jpg`    | Chi tiết đơn — vòng chạy, chặng, giao xong            | Kế toán       | Bản demo                      |
| `05-bang-dieu-hanh.jpg`       | Bảng điều hành                                        | Kế toán       | Bản demo                      |
| `06-dien-thoai-lai-xe.jpg`    | Điện thoại lái xe: Trang chủ, Hiện trường, Nhiên liệu | Lái xe        | **Bản cài cục bộ** (xem dưới) |
| `07-ket-thuc-don.jpg`         | Kết thúc đơn                                          | Kế toán       | Bản demo                      |
| `08-phai-thu-khach-hang.jpg`  | Phải thu khách hàng                                   | Kế toán       | Bản demo                      |
| `09-tong-hop-tai-chinh.jpg`   | Tổng hợp tài chính                                    | Kế toán       | Bản demo                      |
| `10-tong-hop-giam-doc.jpg`    | Tổng hợp giám đốc                                     | Kế toán       | Bản demo                      |

Kế toán thấy đúng cùng danh mục với giám đốc, nên các màn của giám đốc chụp bằng vai kế toán vẫn đúng.

**Ngoại lệ, ảnh 06.** Muốn đăng nhập vai lái xe trên bản demo phải có mật khẩu, mà người soạn tài liệu không được dùng. Vì vậy ba màn điện thoại được chụp như sau:

- trên một bản cài cục bộ dựng từ **đúng phiên bản mã** ở trên, với cơ sở dữ liệu riêng;
- khung điện thoại 390×844, lái xe mẫu;
- trên một đơn tạo riêng cho việc chụp, có điểm lấy và điểm giao trên bản đồ.

Ba ảnh sau đó được ghép ngang và khoanh bằng `sharp`.

`so-do-luong-don-hang.svg` là sơ đồ vẽ tay, không phải ảnh chụp.

## Khi cần thay ảnh

1. Chụp lại trên bản đang chạy, và chỉ khi phiên bản đó đã triển khai thành công.
2. Giữ đúng tên tệp, hoặc sửa cả bảng này lẫn tài liệu Markdown.
3. Tái sinh PDF bằng `node docs/khach-hang/van-tai-viet/ban-giao/nguon-html/tao-pdf.mjs`.
