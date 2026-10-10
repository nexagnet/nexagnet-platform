# ADR-0002 — Văn phòng pháp lý: bốn miền nghiệp vụ trên nền tảng đa khách

|                      |                                                                                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trạng thái**       | **ĐỀ XUẤT (W0, chỉ tài liệu)** — chưa có mã nào triển khai. Chưa chấp nhận cho tới khi merge qua cổng R2                                                                                                                                             |
| **Ngày**             | 2026-10-10                                                                                                                                                                                                                                           |
| **Nguồn quyết định** | Issue [#448](https://github.com/nexagnet/nexagnet-platform/issues/448) (chủ sở hữu, 2026-10-10) · Task [#449](https://github.com/nexagnet/nexagnet-platform/issues/449) · điều phối [#426](https://github.com/nexagnet/nexagnet-platform/issues/426) |
| **Đặc tả nghiệp vụ** | [dac-ta-nghiep-vu-chuan.md](../khach-hang/van-phong-hai-ba-trung/nghiep-vu/dac-ta-nghiep-vu-chuan.md)                                                                                                                                                |
| **Bản đồ phụ thuộc** | [legal-office-dependency-map.md](../phat-trien/ke-hoach/legal-office-dependency-map.md)                                                                                                                                                              |
| **Giao diện**        | [Figma](https://www.figma.com/design/bueSNVniMoYD6lQFHwqeHz?node-id=92-3) — bản đề xuất UX, **không** phải luật hay đặc tả thực thi; fidelity `NOT_PROVEN`                                                                                           |

Nhãn nguồn dùng trong ADR: `[OWNER]` chủ sở hữu xác nhận · `[LUẬT]` suy ra từ nguồn pháp lý do BA cung cấp · `[THIẾT KẾ]` suy luận thiết kế · `[CHƯA GIẢI QUYẾT]` tuân thủ pháp lý chưa xác minh.

## Bối cảnh

`[OWNER]` Khách là một văn phòng pháp lý ba địa điểm cần quản lý **toàn bộ** nghiệp vụ, không chỉ Vi bằng: Vi bằng, Tống đạt, Xác minh điều kiện thi hành án, Tổ chức thi hành án, cộng quản trị văn phòng dùng chung. Điều phối cũ (#426–#435) viết khi phạm vi còn là Vi bằng + sổ cái thanh toán; #448 thay thế các điểm mâu thuẫn.

## Quyết định

1. `[OWNER]` **Một repo, một codebase/image, modular monolith đa tenant.** Không repo mới, không nhánh theo tên khách trong lõi (`CLAUDE.md` quyết định #6). Mọi thứ riêng khách nằm ở cấu hình tenant (`packages/tenant`, `tenants/<slug>/`).
2. `[THIẾT KẾ]` **Ranh giới miền** (kỹ sư xác nhận lại với repo ở W1): `vi-bang`, `tong-dat`, `xac-minh-tha`, `to-chuc-tha`, cộng `legal-office` cho năng lực dùng chung. Mỗi thực thể dùng chung có đúng **một** bounded context sở hữu; không nhân đôi danh tính/tệp/tenant của nền tảng.
3. `[OWNER]` **Không có sổ cái tiền trong Nexagnet.** MISA là hệ thống ghi nhận duy nhất cho kế toán/thu/công nợ/phí. Nexagnet chỉ giữ cổng quy trình pháp lý `NOT_CONFIRMED / CONFIRMED_FULL` do Kế toán nhập tay (không số tiền, không tích hợp API MISA giai đoạn đầu). Đảo ngược quyết định cũ về `ViBangCharge/ViBangPayment` — xem bản đồ phụ thuộc.
4. `[OWNER]` **Vai trò ứng dụng tách khỏi thẩm quyền pháp lý.** Phê duyệt trong ứng dụng (Admin hoặc Trưởng VP) là cổng nội bộ; chữ ký pháp lý thuộc người có thẩm quyền thực tế. Hệ thống không suy thẩm quyền ký từ quyền ứng dụng.
5. `[OWNER]` LLM không cho phép chuyển trạng thái pháp lý, không quyết thanh toán/an ninh/kết quả pháp lý/cưỡng chế.
6. `[OWNER]` Thư viện biểu mẫu TT06 (phụ lục I–IX) chỉ tra cứu/tải. Mẫu N-xx/sổ S-xx của TT08 là đầu ra của văn phòng. Tuyên bố khớp mẫu in cần nguồn chuẩn đã xác minh + so sánh golden/snapshot.

## Ma trận nguồn sự thật

| Dữ liệu                                              | Nguồn sự thật                           | Ghi chú                                                                                |
| ---------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| Hồ sơ, bên liên quan, trạng thái pháp lý, số Vi bằng | PostgreSQL (Prisma) của tenant          | `[OWNER]` Business truth = Postgres. Cấp số nguyên tử, idempotent, đặt lại theo năm    |
| Kế toán, thu/thanh toán, công nợ, phí, chứng từ      | **MISA (hệ thống ngoài)**               | `[OWNER]` Nexagnet chỉ giữ boolean xác nhận + người/giờ/tham chiếu an toàn             |
| Tệp chứng cứ pháp lý (bản nháp, bản ký+dấu, quét)    | File Platform (object storage riêng tư) | `[THIẾT KẾ]` Phiên bản, checksum, MIME policy; bản quét giai đoạn 1 chỉ là bản quản lý |
| Bản giấy gốc                                         | Văn phòng                               | `[OWNER]` Không thay thế bằng bản quét                                                 |
| Lịch sử và bằng chứng thao tác                       | AuditLog + observability                | `[OWNER]` Không rò PII vào audit                                                       |
| Thực thi workflow bền                                | Workflow engine                         | `[OWNER]`                                                                              |
| Trạng thái phát hành                                 | GitHub                                  | `[OWNER]`                                                                              |
| Sổ S-03                                              | Sở Tư pháp (không phải của văn phòng)   | `[LUẬT]` văn phòng xuất S-02                                                           |

## Ánh xạ vào kiến trúc hiện có

Đã xác minh trong repo ngày 2026-10-10:

| Thành phần dùng lại                            | Vị trí                                                                  | Dùng cho                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Cấu hình tenant + schema                       | `packages/tenant`, `tenants/<slug>/`                                    | Thương hiệu, chi nhánh, preset quyền; không logo Nexagnet cho khách    |
| `PermissionDomainRegistry`                     | `apps/api/src/auth/access/permission-domain.registry.ts`                | Quyền theo miền/chi nhánh; fail-closed ở API                           |
| File Platform + `FileDomainAuthorizerRegistry` | `apps/api/src/files/` (`file-authorization.port.ts`, `files.module.ts`) | Mỗi miền đăng ký bộ cấp quyền tệp riêng                                |
| `AuditLog`                                     | model trong `apps/api/prisma/schema.prisma`                             | Before/after, lý do, người, giờ                                        |
| Experience composition (Next.js)               | `apps/web/experiences/experience-registry`                              | Ghép giao diện theo tenant; trạng thái UI theo state machine từ server |
| NestJS capability composition                  | `apps/api/src/app-composition.ts` và các module capability              | Mỗi miền là capability; đăng ký owner rõ ràng                          |

`[THIẾT KẾ]` Mỗi capability miền giữ từ vựng quyết định riêng (`*-decisions.ts`) theo quy tắc observability của repo. `[CHƯA GIẢI QUYẾT]` Kỹ sư phải xác minh lại tên/chữ ký của các điểm mở rộng ở trên khi bắt đầu W1; bảng này là ánh xạ ý định, không phải hợp đồng API.

## Chính sách repo công khai

Repo PUBLIC. Không chứa văn bản gốc của khách, PII, chữ ký, con dấu, hợp đồng định danh, secret hay cấu hình tenant thật. Chỉ dữ liệu tổng hợp và biểu mẫu trống đã khử định danh được phép công bố hợp pháp. Không sửa `.github/**`, deploy, infra, `tools/autopilot` trong R0–R2.

## Hệ quả

- Hồ sơ cũ #427–#435 và PR #440 phải được đối chiếu với quyết định này **trước** khi tái sử dụng (xem bản đồ phụ thuộc).
- Mỗi miền độc lập hợp đồng Task; không miền nào giả định miền khác đã merge.
- Kế hoạch triển khai theo sóng W0–W5, dẫn bởi phụ thuộc, không theo thứ tự "Vi bằng xong mới làm ba miền còn lại".

## Chưa giải quyết (không được tuyên bố đã tuân thủ)

| Mục                                                                                                     | Trạng thái                               |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Khách chưa được phê duyệt lưu hồ sơ ngoài trụ sở; cần xác minh khả năng áp dụng và đồng ý trước go-live | `[CHƯA GIẢI QUYẾT]`                      |
| Bản quét ban đầu chưa phải số hoá hợp pháp; quy trình tuân thủ chữ ký số là việc riêng                  | `[CHƯA GIẢI QUYẾT]`                      |
| Đối chiếu bản chính thức NĐ 151/2026, TT 08/2026, TT 06/2026                                            | `NOT_PROVEN`                             |
| Khớp mẫu in pháp lý                                                                                     | `NOT_PROVEN`                             |
| Giao diện Figma đạt yêu cầu khách                                                                       | `NOT_PROVEN` (khách nghiệm thu riêng)    |
| Production, dữ liệu thật, nộp hồ sơ ra ngoài                                                            | Bị chặn tới khi chủ sở hữu duyệt rõ ràng |
