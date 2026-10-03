# 04 — Kiểm kê bài viết: 10 bài migrate đầu và backlog

Hợp đồng: bên triển khai nhập ban đầu **tối đa 10 bài**; các bài sau BMSL tự đăng. Mục tiêu "120 bài" trong
bảng mô tả trang chỉ là định hướng SEO dài hạn, **không** là nghiệm thu migration (xem 07 §2).

Đã trừ khỏi nhóm "bài": 17 URL dự án hợp nhất (03), `/354-2/` (trụ sở), và các bài sẽ thành nội dung trang Giới thiệu/Dịch vụ.
Còn lại **bài tin/kiến thức/văn hoá**: #2, 3, 23–27, 29, 30, 32–35 (và #4, #31 nếu BMSL muốn giữ thêm bản bài) = 13 bài chắc chắn + 2 tuỳ chọn.

## 1. Danh mục bài mới (PROPOSAL, tối đa 5)

Hợp đồng chỉ nêu số lượng (5), không đặt tên. Đề xuất, `OWNER-DECISION`:

1. Kiến thức ngành
2. Tin công ty
3. Văn hoá & hoạt động
4. Thông báo
5. Dự phòng (ví dụ: Hướng dẫn cư dân) — chưa gán bài nào

## 2. 10 bài đề xuất migrate đầu (PROPOSAL)

Tiêu chí: hợp thông điệp B2B của site (quản lý vận hành, bảo vệ, PCCC, minh bạch); ít dữ liệu cá nhân;
không chứa số liệu pháp lý dễ lỗi thời. Lựa chọn dựa trên **slug**, chưa đọc toàn văn → BMSL duyệt lại.

| # | Bài legacy | Danh mục | Lý do chọn | Rủi ro cần duyệt |
|---|---|---|---|---|
| 1 | #3 `xu-huong-phat-trien-nganh-dich-vu-bao-ve-...` | Kiến thức ngành | Nội dung kiến thức, hợp SEO | Số liệu ngành, nguồn |
| 2 | #4 `dich-vu-quan-ly-van-hanh-toa-nha-...-2` (bản bài) | Kiến thức ngành | Hợp chủ đề dịch vụ lõi | Nghi trùng với trang dịch vụ; chỉ giữ nếu khác biệt |
| 3 | #25 `tap-huan-nghiep-vu-phong-chay-chua-chay-nam-2024` | Tin công ty | Bằng chứng hoạt động đào tạo PCCC | Ảnh/nhân sự; không suy ra giấy phép |
| 4 | #35 `binh-minh-song-lo-long-nhan-ai-...` | Tin công ty | Trách nhiệm cộng đồng | Ảnh/nhân vật |
| 5 | #2 `duoc-tang-danh-hieu-nguoi-tot-viec-tot-...` | Tin công ty | Hình ảnh đạo đức nghề nghiệp | Tên và ảnh cá nhân, nhân vật thứ ba |
| 6 | #30 `...chuc-mung-ngay-dai-doan-ket-18-11-...` | Tin công ty | Minh hoạ quan hệ với cư dân tại dự án | Danh sách dự án nêu trong bài (đối chiếu 03) |
| 7 | #31 `...ki-niem-5-nam-thanh-lap-...` (bản tin) | Tin công ty | Mốc thương hiệu | Mốc lịch sử `UNCONFIRMED` |
| 8 | #23 `chuong-trinh-tat-nien-2023-...` | Văn hoá & hoạt động | Văn hoá doanh nghiệp (tuyển dụng) | Ảnh nhân sự |
| 9 | #34 `...don-tet-nguyen-dan-2025` | Văn hoá & hoạt động | Mới nhất trong nhóm văn hoá | Ảnh nhân sự |
| 10 | #24 `du-lich-ba-vi-2024-...` | Văn hoá & hoạt động | Hỗ trợ trang Tuyển dụng | Ảnh nhân sự |

Phương án thay thế nếu BMSL bỏ bài rủi ro: #26, #27, #29, #32.
Điều kiện chung trước khi nhập: BMSL duyệt từng bài + xác nhận quyền dùng ảnh/tên người.

## 3. Backlog (không nhập đợt đầu)

| Bài legacy | Ghi chú |
|---|---|
| #26, #27, #29, #32 | Văn hoá nội bộ; ứng viên dự phòng ở trên |
| #33 chúc mừng sinh nhật Chủ tịch HĐQT | `OWNER-DECISION`: có đăng lại không (thông tin cá nhân người lãnh đạo) |
| #1, #28, #31, #36 | Không đi vào kho bài; nội dung chuyển sang trang Giới thiệu (viết lại) |

BMSL tự đăng thêm qua CMS sau bàn giao. Không đếm backlog vào nghiệm thu "10 bài".

## 4. Quy tắc migrate bài

- Giữ ngày đăng gốc (`publishedAt`) nếu BMSL đồng ý; slug mới giữ nguyên slug cũ khi có thể để redirect đơn giản.
- Mỗi bài có title ≤ ~60 ký tự và meta description riêng (hợp đồng yêu cầu); viết lại nếu legacy thiếu.
- Chuẩn hoá ảnh `http://` → `https://`, tối ưu ảnh; thiếu alt text thì bổ sung.
- Không dùng bài làm nơi công bố giấy phép/năng lực; nội dung đó chỉ đi qua trang Giới thiệu sau khi BMSL duyệt.
