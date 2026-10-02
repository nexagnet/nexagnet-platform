# Vận tải Việt — mục lục

**Công ty Vận tải Việt** là khách **vận tải đầu tiên** của nền tảng, và đóng vai **reference tenant**
của vertical Transport. Nghiệp vụ của họ là nguồn để tổng quát hóa thành
[Transport Domain](../../kien-truc/transport-domain-contract.md) — không phải để viết một phần mềm
riêng cho họ.

- Quy mô: ~10 xe đầu kéo.
- Giai đoạn hiện tại: **demo cho khách xem**. Nghiệp vụ chưa chốt hết; phần chưa chốt chạy trên
  giả định `GD-xx` được ghi tường minh ở [T1 §21](../../kien-truc/transport-domain-contract.md#21-giả-định-giai-đoạn-demo-gd-xx).
- Đã có màn hình vận hành đầy đủ, chạy trên gói demo `tenants/transport-preview` (tên hiển thị
  "Vận tải Việt", dữ liệu mẫu). Luồng hiện hành đi từ **Đơn hàng** (điểm lấy/giao chọn trên bản đồ)
  → **Vòng xe** → **Chặng rỗng / chặng có hàng** → mốc hiện trường → kết thúc đơn → đối soát, phải
  thu. Gói khách thật `tenants/van-tai-viet/` chưa tạo — chờ dữ liệu thật được duyệt về riêng tư.

> **Người đọc là lãnh đạo khách:** bắt đầu từ
> [**Giới thiệu hệ thống cho lãnh đạo**](ban-giao/gioi-thieu-he-thong-cho-lanh-dao.md)
> ([PDF](ban-giao/gioi-thieu-he-thong-cho-lanh-dao.pdf)).

## Tài liệu

| File                                                                                                                                                  | Nội dung                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ban-giao/gioi-thieu-he-thong-cho-lanh-dao.md`](ban-giao/gioi-thieu-he-thong-cho-lanh-dao.md) · [PDF](ban-giao/gioi-thieu-he-thong-cho-lanh-dao.pdf) | **Tài liệu chính cho lãnh đạo.** Một đơn đi qua công ty, từ cần biết, ai làm gì, 10 màn hình có khoanh, nhiên liệu và quỹ lái xe, hạn chế hiện tại, việc cần lãnh đạo quyết                         |
| [`ban-giao/huong-dan-ke-toan.md`](ban-giao/huong-dan-ke-toan.md) · [PDF](ban-giao/huong-dan-ke-toan.pdf)                                              | **Hướng dẫn kế toán** theo việc hằng ngày                                                                                                                                                           |
| [`ban-giao/huong-dan-tai-xe.md`](ban-giao/huong-dan-tai-xe.md) · [PDF](ban-giao/huong-dan-tai-xe.pdf)                                                 | **Hướng dẫn lái xe**, đọc trên điện thoại                                                                                                                                                           |
| [`ban-giao/`](ban-giao/README.md)                                                                                                                     | **T10 — Gói bàn giao.** Tài liệu lãnh đạo, bảng phân quyền, thủ tục chuyển sang dữ liệu thật; các tài liệu cũ viết theo chuyến (bắt đầu nhanh, kịch bản demo, vận hành bản demo) được đánh dấu _cũ_ |
| [`nghiep-vu/nguon-su-that-van-tai.md`](nghiep-vu/nguon-su-that-van-tai.md)                                                                            | **T0 — Nguồn sự thật.** 60+ sự kiện truy vết tới từng trang/mục của tài liệu khách, kèm 8 xung đột, 23 quyết định còn mở, 6 mục thiếu nguồn                                                         |
| [`../../kien-truc/transport-domain-contract.md`](../../kien-truc/transport-domain-contract.md)                                                        | **T1 — Hợp đồng Transport Domain.** Trung tính, không nhắc tên khách. Bounded context, aggregate, bất biến tài chính, capability, phân quyền, guardrail, 25 case nghiệm thu, 23 giả định demo       |

## Hồ sơ gốc

| Tài liệu                                                                                                              | Vị trí                                                                                            | Trong git? |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------- |
| `Phan_tich_nghiep_vu_App_Van_Tai.pdf` — tài liệu phân tích nghiệp vụ do chính khách viết, 14 trang, v1.0 tháng 7/2026 | **Ngoài repo:** `C:\Users\phung\Documents\vietpt\khoi_nghiep\van_tai\customer_docs\van_tai_viet\` | **Không**  |

> **Vì sao hồ sơ gốc không nằm trong repo.** `nexagnet-platform` là repo **public**. Một tài liệu
> phân tích nghiệp vụ nội bộ của khách đưa vào đây là công bố nó ra ngoài. Tính toàn vẹn được bảo
> đảm bằng **SHA-256** ghi ở [T0 §1.1](nghiep-vu/nguon-su-that-van-tai.md), không bằng một bản sao.
>
> Muốn đưa vào repo thì cần **văn bản đồng ý của khách** _và_ một dòng `.gitignore` thêm **trước**,
> theo đúng cách hồ sơ khảo sát Ultty đang được xử lý.

## Chưa có — cần xin khách

Ba nhóm dưới đây chặn phần lớn công việc tiếp theo (chi tiết ở [T0 §14](nghiep-vu/nguon-su-that-van-tai.md)):

1. **Một file bảng kê cây xăng thật** — không có nó thì đối soát nhiên liệu (T4) chỉ chạy trên dữ liệu bịa.
2. **Danh mục vận hành thật** — xe, lái xe, cây xăng, khách hàng, đối tác, giá tuyến.
3. **Văn bản đồng ý xử lý dữ liệu cá nhân của lái xe** — hệ thống lưu SĐT, GPLX, ảnh, lương; thuộc phạm vi Luật BVDLCN 91/2025/QH15 + NĐ 356/2025.
