# 05 — Sitemap/IA mới, ánh xạ 8 khu, wireframe cấu trúc

IA theo hướng chủ dự án đã duyệt cho blueprint (issue §B10). Văn bản, số liệu, lời cam kết trong wireframe
chỉ là **chỗ giữ vị trí**; nội dung thật `UNCONFIRMED` tới khi BMSL duyệt.

## 1. Sitemap mục tiêu

```
/                         Trang chủ
/gioi-thieu/              Giới thiệu
/dich-vu/                 Dịch vụ (tổng quan)
  /dich-vu/quan-ly-van-hanh/
  /dich-vu/bao-ve/
  /dich-vu/ve-sinh/
  /dich-vu/pccc/
/du-an/                   Dự án đang vận hành (danh sách, lọc)
  /du-an/<slug>/          Hồ sơ dự án
/quy-trinh-minh-bach/     Quy trình & Minh bạch (+ tài liệu tải về)
/kien-thuc/               Kiến thức & tin tức (danh sách, 5 danh mục)
  /kien-thuc/<danh-muc>/
  /kien-thuc/<danh-muc>/<slug>/
/tuyen-dung/              Tuyển dụng (danh sách)
  /tuyen-dung/<slug>/
/lien-he/                 Liên hệ (form, hotline, Zalo, bản đồ)
/sitemap.xml  /robots.txt
```

CTA chính `Đặt lịch khảo sát` (PROPOSAL): nút cố định ở header, dẫn tới `/lien-he/` với loại yêu cầu "khảo sát".
Hotline và Zalo là CTA phụ. Số hotline/Zalo thật: `CONTACT_DETAILS_REQUIRES_BMSL_CONFIRMATION`.
Nhãn menu dùng ngắn "Dự án", "Kiến thức"; tiêu đề trang dùng đúng tên 8 khu của hợp đồng.

## 2. Ánh xạ 8 khu hợp đồng → page / template / CMS model

| # | Khu (hợp đồng) | URL | Template | CMS model (xem 06 §3) | Nội dung |
|---|---|---|---|---|---|
| 1 | Trang chủ | `/` | `home` | `HomePage` (singleton), tham chiếu `ServiceArea`, `Project`, `Article` | Hero + CTA, 4 dịch vụ, dự án nổi bật, bài mới, CTA liên hệ |
| 2 | Giới thiệu | `/gioi-thieu/` | `about` | `AboutPage` (singleton) | Giới thiệu, cơ cấu, lịch sử, văn phòng — toàn bộ `UNCONFIRMED` |
| 3 | Dịch vụ | `/dich-vu/` + 4 trang con | `service-index`, `service-detail` | `ServiceArea` (4 bản ghi cố định: quản lý vận hành, bảo vệ, vệ sinh, PCCC) | Phạm vi dịch vụ; không đưa giấy phép/cam kết khi chưa duyệt |
| 4 | Dự án đang vận hành | `/du-an/`, `/du-an/<slug>/` | `project-index`, `project-detail` | `Project` (≤21), `MediaAsset` (≤10 ảnh/dự án) | Danh sách, hồ sơ; trường trống thì ẩn |
| 5 | Quy trình & minh bạch | `/quy-trinh-minh-bach/` | `process` | `ProcessPage` (singleton), `Document` (≤5 tải về ban đầu) | Quy trình, tài liệu minh bạch/giá — `UNCONFIRMED` tới khi duyệt |
| 6 | Kiến thức & tin tức | `/kien-thuc/...` | `article-index`, `article-detail` | `Article`, `ArticleCategory` (5) | 10 bài đầu, BMSL tự đăng sau |
| 7 | Tuyển dụng | `/tuyen-dung/...` | `job-index`, `job-detail` | `JobPosting` (≤5 ban đầu) | Lương/quyền lợi: `UNCONFIRMED`, không đăng khi chưa có |
| 8 | Liên hệ | `/lien-he/` | `contact` | `ContactPage` (singleton), `ContactLead` (ghi, không sửa qua CMS public) | Form, hotline, Zalo, bản đồ, chống spam |

Thành phần dùng chung: `SiteSettings` (singleton: liên hệ, mạng xã hội, mã GA4), `SeoMeta` (nhúng trong mọi model có URL), `Redirect`.

## 3. Wireframe cấu trúc (dạng khối, không phải thiết kế hình ảnh)

Thiết kế riêng theo nhận diện BMSL; bộ nhận diện chưa có trong gói nguồn → thiết kế UI/visual là việc W2 sau khi BMSL cấp tài sản thương hiệu.
Responsive: desktop / tablet / mobile. Mobile: menu thu gọn, thanh CTA gọi/Zalo cố định ở đáy.

**Khung chung:** `Header (logo · menu 8 khu · CTA Đặt lịch khảo sát)` → nội dung → `Footer (liên hệ · menu · nhóm dịch vụ · bản quyền)`.

**Trang chủ:** Hero (tiêu đề, 1 CTA chính, 1 CTA gọi) → Dải 4 dịch vụ → Dự án nổi bật (3–6 thẻ) → Quy trình & minh bạch (tóm tắt, liên kết) → Bài mới (3) → Khối kêu gọi liên hệ/khảo sát. Số liệu công ty chỉ hiện khi đã duyệt.

**Giới thiệu:** Tiêu đề → Giới thiệu ngắn → Lịch sử → Cơ cấu tổ chức → Văn phòng (địa chỉ chờ xác nhận) → CTA.

**Dịch vụ (index):** 4 thẻ dịch vụ. **Dịch vụ (detail):** Tiêu đề → Phạm vi → Quy trình thực hiện → Dự án liên quan → Form khảo sát rút gọn.

**Dự án (index):** Lưới thẻ + lọc (khu vực/dịch vụ, nếu dữ liệu đủ). **Dự án (detail):** Tên → Ảnh (≤10) → Thông tin (vị trí, quy mô, dịch vụ, thời gian vận hành: chỉ hiện trường có dữ liệu) → Phản hồi BQT (chỉ khi có duyệt) → Dự án khác.

**Quy trình & minh bạch:** Các bước quy trình → Cam kết (chờ duyệt) → Danh sách tài liệu tải về (sự kiện `document_download`) → Liên hệ.

**Kiến thức & tin tức:** Lọc 5 danh mục → Danh sách có phân trang → Bài (tiêu đề, ngày, ảnh, nội dung, bài liên quan, CTA).

**Tuyển dụng:** Danh sách vị trí → Chi tiết vị trí (mô tả, yêu cầu, quyền lợi nếu đã duyệt, cách ứng tuyển).

**Liên hệ:** Form (họ tên, điện thoại, email tuỳ chọn, loại yêu cầu, nội dung, đồng ý xử lý dữ liệu) + hotline + Zalo + bản đồ nhúng + địa chỉ (chờ xác nhận).

## 4. Điều W2–W5 không được tự phát minh

Số lượng mục, vai trò CMS, danh sách model, quy tắc URL, trường lead, sự kiện analytics đã cố định ở 05–06.
Muốn đổi → mở thay đổi có ghi lý do, không đổi ngầm.
