# 02 — Redirect map và chiến lược

Toàn bộ URL đích là `PROPOSAL`. Không URL legacy nào có giá trị SEO bị bỏ mà không có dòng quyết định ở đây.
Bảng 47 dòng gốc nằm ở [01](01-url-inventory.md); tệp này chốt **luật** và **các trường hợp đặc biệt**.

## 1. Chiến lược

1. **301 vĩnh viễn** cho mọi URL legacy có đích tương ứng. Không chuỗi redirect (A→B→C): luật trỏ thẳng tới đích cuối.
2. Bảng redirect là **dữ liệu trong repo** (`redirects.json` do W1 tạo, kiểm bằng test), không cấu hình tay trên server.
   Test bắt buộc: mỗi URL trong 47 dòng có đúng một luật; đích trả HTTP 200; không vòng lặp.
3. Giữ dấu `/` cuối như WordPress cũ; chấp nhận cả hai dạng có/không dấu `/` và chuẩn hoá về dạng có dấu `/`.
4. Taxonomy `/category/*` và `/author/*` cũng redirect (không để 404) vì có thể có backlink.
5. Phân trang/feed WordPress (`/feed/`, `/page/N/`, `?s=`, `?p=`) không nằm trong sitemap: W1 phải kiểm
   bằng log/Search Console trước cutover rồi bổ sung; chưa biết có hay không → `UNCONFIRMED`.
6. URL legacy có tham số/ảnh `wp-content/uploads/**`: giữ đường dẫn media cũ nếu hosting mới cho phép,
   nếu không thì redirect theo lô sau migration media (06 §9). Một số media cũ dùng `http://` → chuẩn hoá `https://`.
7. **Cutover (đổi DNS) không thuộc W0.** Search Console: giữ nguyên chủ sở hữu/thẻ xác minh đang có,
   nộp sitemap mới sau cutover, theo dõi 404 trong 30 ngày (con số 30 là `PROPOSAL`).

## 2. Luật theo nhóm

| Nhóm legacy | Luật | Đích |
|---|---|---|
| Dự án (bài #5–#22, trừ #21) | 301 từng URL | `/du-an/<slug-mới>/` (xem 03) |
| Dự án trùng (#21) | 301 | cùng đích canonical của #5 |
| Bài văn hoá/tin/kiến thức (#2, 3, 23–27, 29, 30, 32–35) | 301 | `/kien-thuc/<danh-muc>/<slug>/` hoặc `/kien-thuc/<slug>/` (chốt ở W1, cùng slug bài) |
| Giới thiệu/cơ cấu/lịch sử/trụ sở (#1, 28, 31, 36) | 301 | `/gioi-thieu/` (neo mục) |
| Bài dịch vụ (#4) + category dịch vụ (#45) | 301 | `/dich-vu/quan-ly-van-hanh/` |
| Trang chủ (#37) | không đổi | `/` |
| Liên hệ (#38) | 301 | `/lien-he/` |
| Category (#39–#46) | 301 | theo 01 §C |
| Tác giả (#47) | 301 | `/` |

## 3. Trường hợp cần chú ý

| Trường hợp | Xử lý W0 | Trạng thái |
|---|---|---|
| `/chung-cu-hoc-vien-quoc-phong-dang-van-hanh/` và `...-2/` | Cả hai 301 về **một** canonical. Ghi cả hai nguồn trong inventory | `PROPOSAL`; BMSL xác nhận đó có phải hai dự án khác nhau không |
| `/252-2/` (Ciputra B-IA20) | 301 sang slug dự án có nghĩa | `PROPOSAL` |
| `/354-2/` (trụ sở) | 301 sang `/gioi-thieu/` — **không** sang `/du-an/` | `PROPOSAL` |
| `/category/kinh-doanh-bds/` | Tạm 301 về `/kien-thuc/` để không mất URL | `OWNER-DECISION` |
| `/author/admin/` | 301 `/`; thêm `noindex` ở site mới nếu có | `PROPOSAL` |
| Dự án đã bỏ khỏi danh sách (nếu BMSL quyết) | Không 404 cứng: 301 về `/du-an/` hoặc 410 do chủ quyết | `OWNER-DECISION` |

## 4. Việc W1+ phải làm

- Sinh `redirects.json` từ bảng 47 dòng và slug mới đã chốt; test độ phủ 47/47.
- Chạy crawl site cũ để bắt URL ngoài sitemap (feed, phân trang, ảnh đính kèm `attachment`).
- Không xoá site WordPress và không đổi DNS cho tới khi có Task Contract cutover riêng.
