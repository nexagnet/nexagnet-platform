# 01 — Kiểm kê 47 URL sitemap legacy

Nguồn: `wp-sitemap.xml` ngày 2026-10-03 (WordPress 6.7.1), gói nguồn trong issue #424 §B.
Tổng = 36 bài + 2 trang + 8 taxonomy + 1 tác giả = **47**. Bảng dưới có đủ 47 dòng.

Hành động: **KEEP** giữ nội dung gần nguyên · **REWRITE** giữ chủ đề, viết lại · **MERGE** gộp vào
trang khác · **DROP** không còn là trang công khai (vẫn có redirect, xem 02) ·
**OWNER-DECISION** chưa chọn.
Mọi nội dung là `LEGACY-SOURCE`; dữ kiện trong đó `UNCONFIRMED` tới khi BMSL duyệt.
Phân loại bài dựa trên **slug** (chưa đọc toàn văn), trừ những chỗ issue đã nêu rõ nội dung.
Slug là đường dẫn dưới `https://binhminhsonglo.vn/`.

## A. Bài viết (36)

| # | Slug | Loại | Hành động | Đích mới (PROPOSAL) | Ghi chú |
|---|---|---|---|---|---|
| 1 | `gioi-thieu-tong-qua` | Giới thiệu | REWRITE | `/gioi-thieu/` | Có tuyên bố lĩnh vực/giấy phép → `UNCONFIRMED` |
| 2 | `duoc-tang-danh-hieu-nguoi-tot-viec-tot-vi-da-tra-lai-tui-xach-co-500-trieu-dong-cho-kho-chu` | Tin hoạt động | KEEP (backlog) | `/kien-thuc/tin-cong-ty/` | Có thể có tên/ảnh cá nhân → duyệt quyền hình ảnh |
| 3 | `xu-huong-phat-trien-nganh-dich-vu-bao-ve-co-hoi-va-thach-thuc` | Kiến thức ngành | KEEP (ứng viên 10 bài) | `/kien-thuc/kien-thuc-nganh/` | Số liệu ngành nếu có cần kiểm nguồn |
| 4 | `dich-vu-quan-ly-van-hanh-toa-nha-doi-hoi-nhan-su-gioi-chuyen-nghiep-va-uy-tin-2` | Dịch vụ/kiến thức | MERGE | nội dung → `/dich-vu/quan-ly-van-hanh/` | Hậu tố `-2` → nghi bản trùng; cần BMSL xác nhận |
| 5 | `chung-cu-hoc-vien-quoc-phong-dang-van-hanh` | Dự án | MERGE (canonical) | `/du-an/hoc-vien-quoc-phong/` | Trùng với #21 |
| 6 | `chung-cu-ecolife-tay-ho-dang-van-hanh` | Dự án | KEEP | `/du-an/ecolife-tay-ho/` | |
| 7 | `cum-nha-chung-cu-ct1-ct2-ct3-newtatco-lai-xa-dang-van-hanh` | Dự án (cụm) | KEEP | `/du-an/newtatco-lai-xa/` | Đếm 1 hay 3 hồ sơ: xem 03 |
| 8 | `4-chung-cu-phenikaa-dang-van-hanh` | Dự án (cụm 4) | KEEP | `/du-an/phenikaa/` | idem |
| 9 | `chung-cu-jsc34-dang-van-hanh` | Dự án | KEEP | `/du-an/jsc34/` | |
| 10 | `cum-chung-cu-a6-nam-trung-yen-dang-van-hanh` | Dự án (cụm) | KEEP | `/du-an/a6-nam-trung-yen/` | |
| 11 | `cum-chung-cu-b6-nam-trung-yen-dang-van-hanh` | Dự án (cụm) | KEEP | `/du-an/b6-nam-trung-yen/` | |
| 12 | `chung-cu-bo-khoa-hoc-cong-nghe-dang-van-hanh` | Dự án | KEEP | `/du-an/bo-khoa-hoc-cong-nghe/` | |
| 13 | `chung-cu-b10-nam-trung-yen` | Dự án | KEEP | `/du-an/b10-nam-trung-yen/` | Slug không ghi trạng thái → `UNCONFIRMED` |
| 14 | `toa-nha-b11a-nam-trung-yen-dang-van-hanh` | Dự án | KEEP | `/du-an/b11a-nam-trung-yen/` | |
| 15 | `chung-cu-no-1b-kdt-linh-dam-dang-van-hanh` | Dự án | KEEP | `/du-an/no-1b-linh-dam/` | |
| 16 | `chung-cu-no-1a-kdt-linh-dam-dang-van-hanh` | Dự án | KEEP | `/du-an/no-1a-linh-dam/` | |
| 17 | `toa-nha-b3-lang-quoc-te-thang-long` | Dự án | KEEP | `/du-an/b3-lang-quoc-te-thang-long/` | Slug không ghi trạng thái → `UNCONFIRMED` |
| 18 | `toa-nha-b5-lang-quoc-te-thang-long` | Dự án | KEEP | `/du-an/b5-lang-quoc-te-thang-long/` | idem |
| 19 | `chung-cu-ct1-a1a2-linh-dam-dang-van-hanh` | Dự án | KEEP | `/du-an/ct1-a1a2-linh-dam/` | |
| 20 | `toa-nha-himlam-da-van-hanh` | Dự án | KEEP | `/du-an/himlam/` | Slug ghi "**đã** vận hành" (không phải "đang") → `OWNER-DECISION` có hiện trong "Dự án đang vận hành" không |
| 21 | `chung-cu-hoc-vien-quoc-phong-dang-van-hanh-2` | Dự án (trùng) | MERGE | → canonical #5 | Cùng tiêu đề và trường lõi với #5 (issue §B7). Ghi cả hai nguồn |
| 22 | `252-2` | Dự án: Toà nhà B-IA20 Ciputra Hà Nội | KEEP | `/du-an/b-ia20-ciputra/` | Slug mờ. Issue ghi: 700 căn, vận hành từ 2025 — `LEGACY-SOURCE` |
| 23 | `chuong-trinh-tat-nien-2023-chao-don-nam-moi-2024-cua-cbnv-cong-ty-binh-minh-song-lo` | Văn hoá nội bộ | KEEP (backlog) | `/kien-thuc/van-hoa/` | Ảnh nhân sự → quyền hình ảnh |
| 24 | `du-lich-ba-vi-2024-gan-ket-tinh-dong-nghiep-phan-thuong-cho-cbnv` | Văn hoá nội bộ | KEEP (backlog) | `/kien-thuc/van-hoa/` | |
| 25 | `tap-huan-nghiep-vu-phong-chay-chua-chay-nam-2024` | Đào tạo PCCC | KEEP (ứng viên 10 bài) | `/kien-thuc/tin-cong-ty/` | Không suy ra giấy phép PCCC từ bài này |
| 26 | `nhung-bong-hoa-khoi-van-phong-cong-ty-binh-minh-song-lo-gioi-giang-xinh-dep` | Văn hoá nội bộ | KEEP (backlog) | `/kien-thuc/van-hoa/` | |
| 27 | `cong-ty-binh-minh-song-lo-tang-hoa-va-qua-cho-cbnv-nu-nhan-ngay-20-10` | Văn hoá nội bộ | KEEP (backlog) | `/kien-thuc/van-hoa/` | |
| 28 | `354-2` | Trụ sở văn phòng công ty (**không phải dự án**) | MERGE | → `/gioi-thieu/` mục "Văn phòng" | Địa chỉ: `CONTACT_DETAILS_REQUIRES_BMSL_CONFIRMATION` |
| 29 | `cac-hoat-dong-mung-ngay-doanh-nhan-viet-nam-ngay-quoc-te-dan-ong-va-ngay-sinh-nhat-nhan-vien` | Văn hoá nội bộ | KEEP (backlog) | `/kien-thuc/van-hoa/` | |
| 30 | `cong-ty-binh-minh-song-lo-chuc-mung-ngay-dai-doan-ket-18-11-hang-nam-tai-mot-so-du-an-cong-ty-dang-quan-ly-van-hanh` | Hoạt động tại dự án | KEEP (backlog) | `/kien-thuc/tin-cong-ty/` | Nhắc danh sách dự án → đối chiếu 03 |
| 31 | `cong-ty-binh-minh-song-lo-ki-niem-5-nam-thanh-lap-va-phat-trien` | Lịch sử công ty | REWRITE | lịch sử → `/gioi-thieu/`; có thể giữ bản tin | Mốc lịch sử `UNCONFIRMED` |
| 32 | `chuc-mung-ngay-quoc-te-phu-nu-8-3` | Văn hoá nội bộ | KEEP (backlog) | `/kien-thuc/van-hoa/` | |
| 33 | `chuc-mung-sinh-nhat-chu-tich-hoi-dong-quan-tri-cong-ty-binh-minh-song-lo` | Văn hoá, có thông tin cá nhân lãnh đạo | KEEP (backlog) + `OWNER-DECISION` | `/kien-thuc/van-hoa/` | BMSL quyết có đăng lại không |
| 34 | `cong-ty-binh-minh-song-lo-cung-cbnv-don-tet-nguyen-dan-2025` | Văn hoá nội bộ | KEEP (backlog) | `/kien-thuc/van-hoa/` | |
| 35 | `binh-minh-song-lo-long-nhan-ai-la-trach-nhiem-voi-cong-dong-ma-doanh-nghiep-ben-bi-theo-duoi` | Trách nhiệm xã hội | KEEP (ứng viên 10 bài) | `/kien-thuc/tin-cong-ty/` | |
| 36 | `tong-quan-co-cau-to-chuc-va-cac-phong-ban-chuyen-mon-tai-binh-minh-song-lo` | Cơ cấu tổ chức | MERGE | → `/gioi-thieu/` mục "Cơ cấu" | Nhân sự/phòng ban `UNCONFIRMED` |

## B. Trang (2)

| # | URL | Loại | Hành động | Đích mới | Ghi chú |
|---|---|---|---|---|---|
| 37 | `/` | Trang chủ | REWRITE | `/` | Title cũ `binhminhsonglo`, không có meta description hữu ích → viết mới. Giữ meta xác minh Search Console khi cutover |
| 38 | `/trang-lien-he/` | Liên hệ | REWRITE | `/lien-he/` | Liên hệ: `CONTACT_DETAILS_REQUIRES_BMSL_CONFIRMATION` |

## C. Taxonomy (8)

| # | URL | Hành động | Đích mới | Ghi chú |
|---|---|---|---|---|
| 39 | `/category/he-thong-to-chuc/` | MERGE | `/gioi-thieu/` | Chủ đề cơ cấu tổ chức |
| 40 | `/category/van-hoa-binh-minh-song-lo/` | REWRITE | `/kien-thuc/van-hoa/` | Danh mục mới (PROPOSAL) |
| 41 | `/category/cong-ty/` | REWRITE | `/kien-thuc/tin-cong-ty/` | |
| 42 | `/category/thong-tin-thong-bao/` | MERGE | `/kien-thuc/tin-cong-ty/` | Có thể tách "Thông báo" riêng — `OWNER-DECISION` (trần 5 danh mục) |
| 43 | `/category/kinh-doanh-bds/` | OWNER-DECISION | tạm → `/kien-thuc/` | Kinh doanh BĐS không nằm trong 4 dịch vụ hợp đồng; không thành mục công khai khi chưa duyệt |
| 44 | `/category/tin-tuc/` | MERGE | `/kien-thuc/` | |
| 45 | `/category/dich-vu-cong-ty/cung-cap-dich-vu-quan-ly-van-hanh-toa-nha-chung-cu/` | MERGE | `/dich-vu/quan-ly-van-hanh/` | |
| 46 | `/category/du-an/` | REWRITE | `/du-an/` | |

## D. Tác giả (1)

| # | URL | Hành động | Đích mới | Ghi chú |
|---|---|---|---|---|
| 47 | `/author/admin/` | DROP | 301 → `/` (PROPOSAL) | URL kỹ thuật WordPress; site mới không có trang tác giả công khai |

## Tổng kết (đếm từ bảng trên)

| Hành động | Số URL |
|---|---|
| KEEP | 29 (bài #2, 3, 6–20, 22–27, 29, 30, 32–35) |
| REWRITE | 7 (bài #1, 31; trang #37, 38; taxonomy #40, 41, 46) |
| MERGE | 9 (bài #4, 5, 21, 28, 36; taxonomy #39, 42, 44, 45) |
| DROP | 1 (#47) |
| OWNER-DECISION | 1 (#43) |
| **Tổng** | **47** |

Ngoài ra #20 và #33 là KEEP kèm một `OWNER-DECISION` phụ.
