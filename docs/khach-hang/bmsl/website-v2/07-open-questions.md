# 07 — Câu hỏi mở, mâu thuẫn hợp đồng, task contract gợi ý

## 1. REQUIRES BMSL CONFIRMATION BEFORE MIGRATION/PUBLISH

Chưa mục nào dưới đây được xác nhận. Không đưa lên site production như sự thật chính thức.

| # | Hạng mục | Vì sao cần | Nơi liên quan |
|---|---|---|---|
| 1 | **Liên hệ chính thức** — `CONTACT_DETAILS_REQUIRES_BMSL_CONFIRMATION`: địa chỉ công khai, email công khai, thứ tự ưu tiên hotline, số/tài khoản Zalo, vị trí bản đồ | Trang legacy và hợp đồng mới **không trùng**; legacy lộ nhiều số điện thoại và một liên kết Zalo. W0 không chọn bên nào | 05 §2 #8, 06 §3 |
| 2 | Danh sách dự án hiện đang vận hành và trạng thái | Chưa biết số thật; B10, B3, B5 không ghi trạng thái; Himlam ghi "đã vận hành"; Học viện Quốc phòng có hai URL | 03 |
| 3 | Thời gian vận hành, quy mô (số toà/số căn) từng dự án | Chỉ có vài giá trị legacy (HVQP, Ciputra) | 03 |
| 4 | Giấy phép/năng lực pháp lý hiện hành (quản lý vận hành, PCCC, bảo vệ, vệ sinh) | Legacy có tuyên bố năng lực; hiệu lực hiện tại chưa kiểm | 01 #1, 05 |
| 5 | Số liệu công ty đã duyệt (số toà, số căn, số nhân sự) | Hợp đồng quy định là dữ kiện do khách xác nhận | 05 §3 |
| 6 | Lịch sử, đội ngũ, cơ cấu tổ chức | Nội dung legacy chưa duyệt | 01 #31, #36 |
| 7 | Cam kết dịch vụ chính xác | Không được tự viết cam kết | 05 §2 #3 |
| 8 | Phản hồi/nhận xét BQT | Cần văn bản đồng ý của người phát ngôn | 03 §4 |
| 9 | Tài liệu giá/minh bạch (≤5 tải về) | Chưa có tệp, chưa duyệt | 05 §2 #5 |
| 10 | Tuyển dụng: vị trí, lương, quyền lợi (≤5) | Chưa có dữ liệu | 05 §2 #7 |
| 11 | 10 bài đầu đã duyệt | Danh sách ở 04 là đề xuất theo slug | 04 |
| 12 | Quyền dùng ảnh/media legacy; đồng ý hiển thị người trong ảnh | Ảnh nhân sự, cư dân, dự án | 04, 06 §3 |
| 13 | Tên 5 danh mục bài; số hồ sơ cho cụm nhiều toà; có hiện "kinh doanh BĐS" hay không | Quyết định nội dung | 01 #43, 03 §1, 04 §1 |
| 14 | Hạ tầng: máy chủ/domain/host, quyền truy cập, backup của host | Quyết định deploy/backup | 06 §8 |
| 15 | Mã GA4, quyền Search Console, chính sách cookie | Đo lường | 06 §7 |
| 16 | Bộ nhận diện thương hiệu (logo, màu, phông) | "Thiết kế riêng theo nhận diện BMSL" | 05 §3 |
| 17 | Quy tắc lưu trữ/xoá lead; ai được xem lead | Dữ liệu cá nhân | 06 §5 |
| 18 | Quyền EDITOR xem lead hay không; có cần 2FA | Phân quyền | 06 §4 |

## 2. CONTRACT OWNER REVIEW — mâu thuẫn nguồn (ghi nhận, **không giải quyết**)

| # | Mâu thuẫn | Cách W0 xử lý |
|---|---|---|
| C1 | Thân hợp đồng nêu thời hạn thực hiện tổng cộng **10 ngày làm việc**; phụ lục chia giai đoạn **5 + 10 + 12 + 3 = 30 ngày làm việc** | Không chọn. Kế hoạch W1–W5 không cam kết số ngày ra ngoài |
| C2 | Giá/VAT/điều khoản thanh toán có số và chữ không khớp nhau | Không chọn, không trích số |
| C3 | Bảng mô tả trang "Kiến thức & tin tức" nhắc mục tiêu 120 bài, trong khi phạm vi nhập đầu là 10 bài | Nghiệm thu migration = 10 bài; 120 chỉ là định hướng SEO |
| C4 | Liên hệ legacy ≠ liên hệ trong hợp đồng mới | Xem §1 #1 |

Đây là việc của chủ hợp đồng/pháp lý/thương mại, **không chặn** blueprint kỹ thuật, nhưng cần chốt trước mọi cam kết bên ngoài.

## 3. Dữ kiện legacy nên giữ nhãn UNCONFIRMED (tóm tắt)

Lĩnh vực kinh doanh và tuyên bố năng lực/giấy phép trong "Giới thiệu tổng quan" · số liệu quy mô dự án · trạng thái "đang vận hành" ·
mọi thông tin liên hệ · mốc 5 năm thành lập · cơ cấu tổ chức · thông tin cá nhân người lãnh đạo/nhân sự trong bài.

## 4. Task contract gợi ý cho W1–W5 (PROPOSAL)

Mỗi task nên dùng repo `nexagnet/bmsl-website` (W0 không tạo repo). Phần tạo repo/hạ tầng cần chủ quyết trước.

| Task | Nội dung | Phụ thuộc | Điều kiện hoàn thành chính |
|---|---|---|---|
| **W1** | Khởi tạo repo, spike CMS (06 §1), CSDL, auth 2 vai trò, entities (06 §3), CI | Chủ tạo repo và duyệt stack | Entities + vai trò chạy; test phân quyền |
| **W2** | Template 8 khu (05), design system theo nhận diện BMSL, responsive | W1; bộ nhận diện (§1 #16) | 8 khu render dữ liệu mẫu giả, không dữ liệu khách chưa duyệt |
| **W3** | Import legacy + redirect (02, 06 §9), nhập tối đa 10 bài/21 hồ sơ/5 tuyển dụng/5 tài liệu **chỉ ở staging cho tới khi duyệt** | W1; §1 #2, #11, #12 | 47/47 URL có luật; không dự án mất; nội dung chưa duyệt không `published` ở production |
| **W4** | Lead, chống spam, SEO, structured data, GA4 + 4 sự kiện, hiệu năng, kiểm trình duyệt | W2; §1 #1, #15 | Lead lưu bền; test E2E; sự kiện bắn đúng |
| **W5** | Deploy lên hạ tầng khách, HTTPS, backup + thử restore, bàn giao (tài khoản ADMIN, backup source/DB, hướng dẫn, đào tạo ≤2 giờ), cutover (task riêng, cần phê duyệt chủ) | W4; §1 #14; §2 đã chốt | Staging duyệt bằng văn bản; restore thử thành công; DNS chỉ đổi khi chủ cho phép |

## 5. Ghi chú về phạm vi W0

Không có thay đổi mã. Không đụng `.github/**`, `deploy/**`, `infra/**`, `tools/autopilot/**`, `.claude/**`, `.mcp.json`, `AGENTS.md`, `CLAUDE.md`.
Thay đổi chưa commit sẵn có ở `tools/autopilot-protocol/validator/cli.mjs` được để nguyên, không stage, không commit.
