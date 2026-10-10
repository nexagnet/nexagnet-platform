# Tài liệu theo khách hàng

Nơi giữ tài liệu **của khách, làm việc với khách hoặc bàn giao cho khách**. Tài liệu kiến trúc/kế hoạch phục vụ coding nằm riêng tại [`../phat-trien/`](../phat-trien/README.md).

> **Đừng nhầm với [`tenants/`](../../tenants/README.md)** (đã có từ Đợt B1): thư mục này là
> **tài liệu cho người đọc** (hồ sơ, báo giá, trao đổi, ảnh design). `tenants/<slug>/` là
> **cấu hình máy đọc** (JSON có zod schema, dữ liệu seed) mà hệ thống nạp lúc chạy.
> Slug hai bên đặt trùng nhau. Xem [`../kien-truc/nen-tang-da-khach.md`](../kien-truc/nen-tang-da-khach.md).

## Quy ước

```
docs/khach-hang/<slug>/
  README.md              Mục lục riêng của khách.
  nguon-goc/             Hồ sơ gốc — đọc, không sửa nội dung.
  nghiep-vu/             Tài liệu dẫn xuất đã đối chiếu nguồn.
  trao-doi/              Thư từ, checklist và mẫu xin dữ liệu.
  thiet-ke-giao-dien/    Ảnh/bản vẽ giao diện khách gửi.
  ban-giao/              File gửi khách và nguồn tái sinh file.
```

- `<slug>` trùng với slug gói khách trong `tenants/` (`ultty`, `amico`) để tra chéo dễ.
- Tên file dùng chữ thường, không dấu, `kebab-case`; ngày dùng `YYYY-MM-DD`, tháng dùng `YYYY-MM`.
- Tài liệu chứa **PII/giá thật** phải nằm trong thư mục đã gitignore (xem bảng dưới).

## Đang có

| Khách                      | Đường dẫn                                                                                            | Nội dung                                                                                                                                                                                                                                   | Git                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| **U Ultty**                | `ultty/nguon-goc/khao-sat-khach-hang-2026-07.docx`                                                   | Hồ sơ khảo sát gốc (mẫu PO, SKU, bảng giá, link Drive mục 7). **Chứa PII thật** (tên + SĐT người liên hệ) → sống trong **kho riêng ngoài repo**. SHA-256 `61d410b2f8032d5dcd255d12fd8a25f483ca2522a5cbe5a27e3861492393aff1`, 322.790 bytes | **gitignored — PII** |
|                            | `ultty/nguon-goc/de-xuat-giai-phap-netviet.md`                                                       | Đề xuất giải pháp NetViet: kiến trúc nghiệp vụ, 6 vai agent (§5.1), lộ trình 3 GĐ, KPI. **GIỮ NGUYÊN.** _Tên gốc: `Thiet_ke_AI_Agent_U_Ultty.md`_                                                                                          | theo dõi             |
|                            | `ultty/nguon-goc/ho-so-khao-sat/`                                                                    | Quy trình + 3 PO + bảng giá + spec GĐ1. _Tên gốc: `HỒ SƠ THÔNG TIN KHẢO SÁT KHÁCH HÀNG/`_                                                                                                                                                  | **gitignored — PII** |
|                            | [`ultty/README.md`](ultty/README.md)                                                                 | Mục lục nghiệp vụ, trao đổi, thiết kế và bộ bàn giao của Ultty                                                                                                                                                                             | theo dõi             |
| **Amico**                  | [`amico/README.md`](amico/README.md)                                                                 | Báo giá nguồn 08/2026; task GĐ1 hiện tại không triển khai nghiệp vụ riêng Amico                                                                                                                                                            | theo dõi             |
| **Văn phòng Hai Bà Trưng** | [`van-phong-hai-ba-trung/README.md`](van-phong-hai-ba-trung/README.md)                               | Đặc tả nghiệp vụ chuẩn 4 miền thừa phát lại (đã khử định danh) + ADR-0002 + bản đồ phụ thuộc. Repo public: không có văn bản gốc/PII                                                                                                        | theo dõi             |
| **Vận tải Việt**           | [`van-tai-viet/README.md`](van-tai-viet/README.md)                                                   | Khách **vận tải** đầu tiên — reference tenant của vertical Transport. Mục lục + lý do hồ sơ gốc nằm ngoài repo                                                                                                                             | theo dõi             |
|                            | [`van-tai-viet/nghiep-vu/nguon-su-that-van-tai.md`](van-tai-viet/nghiep-vu/nguon-su-that-van-tai.md) | **T0** — nguồn sự thật nghiệp vụ vận tải, truy vết tới từng trang tài liệu khách                                                                                                                                                           | theo dõi             |
|                            | `Phan_tich_nghiep_vu_App_Van_Tai.pdf`                                                                | Hồ sơ gốc do khách viết (14 trang). **Không nằm trong repo** — repo public; truy vết bằng SHA-256 ghi trong T0 §1.1                                                                                                                        | **ngoài repo**       |

> **Vận tải Việt là khách đầu tiên KHÔNG dùng nghiệp vụ hội thoại/Zalo.** Nghiệp vụ của họ được
> tổng quát hóa thành một vertical dùng lại — hợp đồng miền trung tính nằm ở
> [`../kien-truc/transport-domain-contract.md`](../kien-truc/transport-domain-contract.md), không nằm
> trong thư mục khách.

## Thêm khách mới

1. Tạo `docs/khach-hang/<slug>/README.md` và các thư mục thực sự cần dùng trong cấu trúc chuẩn trên.
2. Bỏ hồ sơ gốc vào `nguon-goc/`, đặt tên theo quy ước trên và ghi tên gốc vào mục lục khách.
3. Nếu hồ sơ có PII hoặc bảng giá thật → để trong thư mục con khớp mẫu gitignore, hoặc thêm dòng mới vào `.gitignore`.
4. Thêm một dòng vào bảng "Đang có".
