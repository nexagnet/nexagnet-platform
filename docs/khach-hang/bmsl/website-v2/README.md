# BMSL Website v2 — W0: Legacy audit + content inventory + blueprint

> **Trạng thái:** W0 (tài liệu, chưa có code). Issue nguồn: nexagnet/nexagnet-platform#424.
> **Ngày chụp nguồn legacy:** 2026-10-03 (người điều phối lấy ngoài sandbox, ghi trong issue).
> **Repo này public.** Không có hợp đồng gốc, số tài khoản, PII hay tư liệu thô của khách ở đây.

## Phạm vi và nguyên tắc

- Website BMSL là **sản phẩm giao độc lập**, không phải tenant UI của Nexagent, không nằm trong
  `apps/bmsl`. Repo triển khai dự kiến: `nexagnet/bmsl-website` (W0 **không** tạo repo này).
- Website phải chạy **không cần BMSL AI**. Chỉ có một đường nối tương lai (xem 06 §8).
- Mọi dữ kiện về pháp lý, năng lực, số liệu, liên hệ, trạng thái dự án lấy từ site cũ hoặc hợp đồng
  đều là **nguồn, không phải sự thật hiện hành**, và mang nhãn dưới đây cho tới khi BMSL duyệt.

### Nhãn trạng thái dữ kiện

| Nhãn | Nghĩa |
|---|---|
| `LEGACY-SOURCE` | Có trên site cũ ngày 2026-10-03. Chưa được BMSL xác nhận là còn đúng. |
| `UNCONFIRMED` | Chưa được BMSL xác nhận. Không đưa lên site thành sự thật chính thức. |
| `OWNER-DECISION` | Cần chủ hợp đồng/chủ dự án quyết; W0 không chọn thay. |
| `PROPOSAL` | Đề xuất thiết kế của W0, chưa chốt. |
| `CONFIRMED` | BMSL đã duyệt bằng văn bản. **W0 không có mục nào ở mức này.** |

### Giới hạn của W0 (nói thẳng)

- Danh sách 47 URL, quan sát legacy và ghi nhận mâu thuẫn hợp đồng lấy **từ gói nguồn trong issue**.
  Builder **không** truy cập được `binhminhsonglo.vn` và không đọc được hợp đồng gốc.
- Phân loại KEEP/REWRITE/MERGE/DROP của từng bài dựa trên **slug và nhóm nội dung đã nêu trong
  issue**, chưa đọc toàn văn từng bài. Cột "Ghi chú" nói rõ khi chỉ suy ra từ slug.
- Tên danh mục mới, URL mới, chọn 10 bài đầu: đều là `PROPOSAL`.

## Mục lục

| Tệp | Nội dung |
|---|---|
| [01-url-inventory.md](01-url-inventory.md) | 47 URL sitemap, phân loại, KEEP/REWRITE/MERGE/DROP |
| [02-redirect-map.md](02-redirect-map.md) | Redirect OLD → NEW và chiến lược |
| [03-project-inventory.md](03-project-inventory.md) | Dự án legacy so với trần 21 của hợp đồng, dữ liệu còn thiếu |
| [04-article-inventory.md](04-article-inventory.md) | 10 bài migrate đầu (đề xuất) và backlog |
| [05-ia-wireframes.md](05-ia-wireframes.md) | Sitemap/IA mới, 8 khu → page/template/CMS model, wireframe cấu trúc |
| [06-technical-blueprint.md](06-technical-blueprint.md) | CMS entities, auth, media, lead, SEO, analytics, backup, deploy, migration |
| [07-open-questions.md](07-open-questions.md) | Cần BMSL xác nhận, CONTRACT OWNER REVIEW, task contract W1–W5 gợi ý |

## Ánh xạ nghiệm thu W0

| # | Yêu cầu | Nằm ở |
|---|---|---|
| 1 | 100% URL sitemap được phân loại (47/47) | 01 |
| 2 | Không dự án legacy nào biến mất | 03 (18 URL → 17 hồ sơ; HVQP trùng ghi cả hai nguồn) |
| 3 | 8 khu hợp đồng → page/template/CMS model | 05 §2 |
| 4 | Chiến lược redirect | 02 |
| 5 | Dữ liệu chưa xác nhận được đánh dấu | toàn bộ; tổng hợp ở 07 §1 |
| 6 | Đủ cho W1–W5 | 05, 06, 07 §4 |
| 7 | Open questions / factual gaps | 07 §1 |
| 8 | Mâu thuẫn hợp đồng/legacy ghi lại, không chọn bên | 07 §2, 07 §3 |
| 9 | Chỉ đổi docs trong path này | commit chỉ chứa `docs/khach-hang/bmsl/website-v2/**` |
