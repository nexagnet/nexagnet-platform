# 03 — Kiểm kê dự án legacy vs trần 21 của hợp đồng

Nguồn: sitemap + category `du-an` ngày 2026-10-03 (issue #424 §B7). Tất cả `LEGACY-SOURCE`; **trạng thái vận hành,
quy mô, thời gian vận hành, chủ đầu tư/BQT đều `UNCONFIRMED`** tới khi BMSL duyệt.

## 1. Số liệu

| Đại lượng | Giá trị | Ghi chú |
|---|---|---|
| Trần hợp đồng | tối đa 21 hồ sơ dự án, mỗi hồ sơ tối đa 10 ảnh | Là **giới hạn**, không phải số dự án thật |
| URL dự án legacy | **18** (17 bài + `/252-2/`) | Bài #5–#22 trong 01 |
| Hồ sơ phân biệt sau gộp trùng | **17** | #5 và #21 (Học viện Quốc phòng) gộp |
| Còn dư so với trần | 4 | Chỉ là chỗ trống tối đa; **không** suy ra có 21 dự án |
| Số dự án hiện đang vận hành thật | **chưa biết** | `UNCONFIRMED` — BMSL xác nhận danh sách và trạng thái |

Cảnh báo đếm: một số mục là **cụm nhiều toà** (Newtatco CT1–CT2–CT3, Phenikaa 4 chung cư, cụm A6, cụm B6).
Hợp đồng tính theo "hồ sơ dự án"; nếu BMSL muốn tách từng toà thành hồ sơ riêng, số hồ sơ có thể vượt 21 →
`OWNER-DECISION` (giữ theo cụm, hoặc xin sửa trần hợp đồng). W0 giữ theo **một URL legacy = một hồ sơ**.

## 2. Bảng dự án

Cột "Thiếu" liệt kê dữ liệu chưa có trong gói nguồn của W0; mọi dự án đều thiếu **ảnh đã duyệt quyền sử dụng** và **phản hồi BQT**.

| # | Hồ sơ | URL legacy (xem 01) | Slug mới (PROPOSAL) | Trạng thái theo slug | Thiếu |
|---|---|---|---|---|---|
| 1 | Chung cư Học viện Quốc phòng | #5 và #21 (trùng) | `hoc-vien-quoc-phong` | đang vận hành | Legacy: 2 toà / 610 căn, vận hành từ 09/2020, dịch vụ quản lý vận hành (`LEGACY-SOURCE`); xác nhận có phải một dự án |
| 2 | Ecolife Tây Hồ | #6 | `ecolife-tay-ho` | đang vận hành | quy mô, thời gian vận hành |
| 3 | Cụm CT1-CT2-CT3 Newtatco Lai Xá | #7 | `newtatco-lai-xa` | đang vận hành | quy mô, thời gian, số hồ sơ |
| 4 | 4 chung cư Phenikaa | #8 | `phenikaa` | đang vận hành | quy mô, thời gian, số hồ sơ |
| 5 | Chung cư JSC34 | #9 | `jsc34` | đang vận hành | quy mô, thời gian |
| 6 | Cụm A6 Nam Trung Yên | #10 | `a6-nam-trung-yen` | đang vận hành | quy mô, thời gian |
| 7 | Cụm B6 Nam Trung Yên | #11 | `b6-nam-trung-yen` | đang vận hành | quy mô, thời gian |
| 8 | Chung cư Bộ Khoa học Công nghệ | #12 | `bo-khoa-hoc-cong-nghe` | đang vận hành | quy mô, thời gian |
| 9 | Chung cư B10 Nam Trung Yên | #13 | `b10-nam-trung-yen` | **không ghi** | trạng thái, quy mô, thời gian |
| 10 | Toà B11A Nam Trung Yên | #14 | `b11a-nam-trung-yen` | đang vận hành | quy mô, thời gian |
| 11 | Chung cư Nơ 1B KĐT Linh Đàm | #15 | `no-1b-linh-dam` | đang vận hành | quy mô, thời gian |
| 12 | Chung cư Nơ 1A KĐT Linh Đàm | #16 | `no-1a-linh-dam` | đang vận hành | quy mô, thời gian |
| 13 | Toà B3 Làng Quốc tế Thăng Long | #17 | `b3-lang-quoc-te-thang-long` | **không ghi** | trạng thái, quy mô, thời gian |
| 14 | Toà B5 Làng Quốc tế Thăng Long | #18 | `b5-lang-quoc-te-thang-long` | **không ghi** | trạng thái, quy mô, thời gian |
| 15 | Chung cư CT1 A1-A2 Linh Đàm | #19 | `ct1-a1a2-linh-dam` | đang vận hành | quy mô, thời gian |
| 16 | Toà Himlam | #20 | `himlam` | **"đã vận hành"** (có thể đã kết thúc) | trạng thái hiện tại; có nên hiện ở "Đang vận hành" |
| 17 | Toà B-IA20 Ciputra Hà Nội | #22 (`/252-2/`) | `b-ia20-ciputra` | đang vận hành (theo nội dung) | Legacy: 700 căn, vận hành từ 2025, quản lý vận hành (`LEGACY-SOURCE`) |

Không phải dự án (loại khỏi inventory dự án): `/354-2/` = trụ sở văn phòng công ty (→ Giới thiệu).

## 3. Trường dữ liệu legacy hay có (để thiết kế model, xem 06 §3)

Địa chỉ/vị trí · quy mô (số căn, số toà) · chủ đầu tư/BQT (nếu có) · năm/thời điểm bắt đầu vận hành (nếu có) ·
dịch vụ cung cấp · ảnh dự án. Mọi trường là tuỳ chọn; trường trống thì **ẩn**, không điền giá trị suy đoán.

## 4. Dữ liệu còn thiếu cần BMSL cung cấp (tổng hợp ở 07 §1)

1. Danh sách dự án hiện vận hành chính thức và trạng thái từng dự án (đang/đã kết thúc/sắp tới).
2. Thời gian vận hành, quy mô (số toà/số căn) từng dự án.
3. Phản hồi/nhận xét BQT (chỉ đăng khi có văn bản đồng ý của BQT/BMSL).
4. Ảnh: tối đa 10/dự án, kèm xác nhận quyền sử dụng; ảnh có người → đồng ý hiển thị.
5. Quyết định về cụm nhiều toà (một hồ sơ hay nhiều) và các dự án trạng thái không rõ (B10, B3, B5, Himlam).
