# Nguồn HTML của PDF bàn giao Vận tải Việt

`gioi-thieu-he-thong-cho-lanh-dao.html` là **nguồn tái sinh** của `../gioi-thieu-he-thong-cho-lanh-dao.pdf`. Guardrail tài liệu khách chỉ cho phép một PDF trong `ban-giao/` khi có HTML cùng tên ở đây.

**Bản gốc là Markdown** `../gioi-thieu-he-thong-cho-lanh-dao.md`. Không sửa tay HTML hay PDF. Muốn đổi nội dung thì sửa Markdown, rồi chạy lại lệnh dưới.

## Tái sinh

```bash
node docs/khach-hang/van-tai-viet/ban-giao/nguon-html/tao-pdf.mjs
```

Lệnh này làm ba việc:

1. đọc Markdown bằng `markdown-it`, lấy từ kho `node_modules/.pnpm`;
2. ghi lại tệp HTML ở thư mục này, với ảnh trỏ về `../assets/`;
3. in PDF A4 bằng Chromium của Playwright trong `apps/web`.

PDF có mục lục bookmark, chữ chọn và tìm được. Chân trang ghi tên tài liệu và số trang.

**Yêu cầu:**

- đã `pnpm install`;
- đã có trình duyệt của Playwright.

Không cần mạng. Font Segoe UI và Cambria có sẵn trên Windows; máy khác sẽ dùng font dự phòng.

## Sau khi tái sinh

- Mở PDF và soát bằng mắt: ngắt trang, ảnh không bị cắt, tiếng Việt đủ dấu.
- Lời văn cho lãnh đạo không được có:
  - số Issue hay PR;
  - mã phiên bản;
  - tên API, class hay bảng;
  - chữ "lợi nhuận ròng".

  Dùng "biên trực tiếp".

- Ảnh thay mới phải khai trong `../assets/lanh-dao/NGUON-ANH.md`.
