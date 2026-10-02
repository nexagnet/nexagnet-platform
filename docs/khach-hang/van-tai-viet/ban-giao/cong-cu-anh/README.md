# Công cụ chụp ảnh cho tài liệu bàn giao

Chỉ phục vụ tài liệu. **Không** thuộc mã sản phẩm, không chạy trong CI.

| Tệp                | Làm gì                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `chup-tai-xe.mjs`  | Tạo một đơn có toạ độ, giao xe, đi hết các mốc trên điện thoại lái xe; chụp `assets/tai-xe/*.jpg` và ghi `trang-thai.json` |
| `chup-ke-toan.mjs` | Làm tiếp phần kế toán trên chính đơn đó; chụp `assets/ke-toan/*.jpg`                                                       |
| `khoanh-vung.mjs`  | Vẽ khung + số lên trang trước khi chụp, vị trí lấy từ chính phần tử                                                        |
| `phien.mjs`        | Trình duyệt, đăng nhập theo vai, gọi máy chủ bằng phiên của người dùng đó                                                  |
| `xuat-anh.mjs`     | Đổi PNG sang JPEG (guardrail chỉ mở ngoại lệ cho `.jpg`)                                                                   |

## Chạy

Cần một bản **cục bộ** đang chạy: API ở `http://localhost:3421`, web ở `http://localhost:3422` (đổi bằng `DOCS_API_URL` / `DOCS_WEB_URL`), gói khách `transport-preview` đã gieo dữ liệu mẫu, và `MEDIA_STORE=local` để tải được ảnh biên nhận.

```bash
DOCS_DEMO_PASSWORD=<mật khẩu nhân vật mẫu của bản cục bộ> node docs/khach-hang/van-tai-viet/ban-giao/cong-cu-anh/chup-tai-xe.mjs
DOCS_DEMO_PASSWORD=<…> node docs/khach-hang/van-tai-viet/ban-giao/cong-cu-anh/chup-ke-toan.mjs
node docs/khach-hang/van-tai-viet/ban-giao/nguon-html/tao-pdf.mjs huong-dan-tai-xe
node docs/khach-hang/van-tai-viet/ban-giao/nguon-html/tao-pdf.mjs huong-dan-ke-toan
```

- `DOCS_DRIVER=lx.xxx` chọn lái xe (mặc định `lx.thang`). Lái xe đang có vòng xe mở thì kịch bản dừng và báo chọn người khác.
- `DOCS_FROM=<số bước>` cho kịch bản kế toán chạy tiếp từ một bước.
- `DOCS_OUT_DIR` là nơi để ảnh PNG gốc và `trang-thai.json` (mặc định `tmp/docs-anh`, đã bị git bỏ qua).

## Vì sao chỉ chạy cục bộ

Hai kịch bản **ghi dữ liệu**: tạo đơn, bấm mốc, kết thúc đơn, đối soát, ghi tiền về, xác thực phiếu dầu. `phien.mjs` từ chối mọi địa chỉ không phải `localhost` / `127.0.0.1`, để không ai lỡ tay để lại đơn thử trên bản demo dùng chung. Mật khẩu chỉ đọc từ biến môi trường, không bao giờ nằm trong mã.

Ảnh của **tài liệu lãnh đạo** thì khác: chụp trên bản demo đang chạy, chỉ đọc (xem `../assets/lanh-dao/NGUON-ANH.md`).
