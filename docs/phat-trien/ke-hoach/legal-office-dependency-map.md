# Bản đồ phụ thuộc — Văn phòng pháp lý (4 miền)

Nguồn: Issue [#448](https://github.com/nexagnet/nexagnet-platform/issues/448) · task W0 [#449](https://github.com/nexagnet/nexagnet-platform/issues/449) · ADR [adr-0002](../../kien-truc/adr-0002-legal-office-four-domain.md) · đặc tả [dac-ta-nghiep-vu-chuan.md](../../khach-hang/van-phong-hai-ba-trung/nghiep-vu/dac-ta-nghiep-vu-chuan.md) · [Figma](https://www.figma.com/design/bueSNVniMoYD6lQFHwqeHz?node-id=92-3) (đề xuất UX, không phải luật).

> Tài liệu này **không** chứa trạng thái ✅/⬜ của kế hoạch tổng — nơi duy nhất là [tong-quan.md](tong-quan.md). Cột "Trạng thái ghi nhận" bên dưới chỉ phản ánh những gì #449 đã nêu ngày 2026-10-10 và có thể đã lỗi thời; hãy kiểm tra Issue thật.

## 1. Rà soát Issue cũ so với #448

| Issue                                                            | Nội dung cũ               | Trạng thái ghi nhận (2026-10-10)   | Xử lý theo #448                                             |
| ---------------------------------------------------------------- | ------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| [#426](https://github.com/nexagnet/nexagnet-platform/issues/426) | Điều phối Vi bằng         | Đã sửa lại (revised)               | Mở rộng thành 4 miền + văn phòng                            |
| [#427](https://github.com/nexagnet/nexagnet-platform/issues/427) | Nền tảng; PR #440 (draft) | **Không được chấp nhận**           | Phải review lại mới và test lại trước khi tái sử dụng       |
| [#428](https://github.com/nexagnet/nexagnet-platform/issues/428) | Quyền                     | Cần đối chiếu                      | Khớp mục vai trò §1 của đặc tả                              |
| [#429](https://github.com/nexagnet/nexagnet-platform/issues/429) | Cổng MISA / cấp số        | Cần đối chiếu                      | Chỉ boolean `NOT_CONFIRMED / CONFIRMED_FULL`; không số tiền |
| [#430](https://github.com/nexagnet/nexagnet-platform/issues/430) | Tệp                       | Cần đối chiếu                      | File Platform, MIME policy; bản nháp ≠ bản cuối             |
| [#431](https://github.com/nexagnet/nexagnet-platform/issues/431) | Web                       | Cần đối chiếu                      | UI chỉ thi hành state machine do server cấp quyền           |
| [#432](https://github.com/nexagnet/nexagnet-platform/issues/432) | Tìm kiếm / S-02           | Cần đối chiếu                      | S-03 là sổ của Sở, không phải của văn phòng                 |
| [#433](https://github.com/nexagnet/nexagnet-platform/issues/433) | Quá hạn (overdue) cũ      | **Đóng, `not_planned`**            | Huỷ: MISA sở hữu công nợ/quá hạn. Không hồi sinh            |
| [#434](https://github.com/nexagnet/nexagnet-platform/issues/434) | UAT tổng hợp 4 miền       | Cần đối chiếu                      | Dùng dữ liệu tổng hợp                                       |
| [#435](https://github.com/nexagnet/nexagnet-platform/issues/435) | Ánh xạ mẫu pháp lý        | Cần đối chiếu                      | Không tuyên bố khớp mẫu khi chưa có golden/snapshot         |
| [#440](https://github.com/nexagnet/nexagnet-platform/pull/440)   | PR nền tảng Vi bằng       | **Draft, chưa merge, verify fail** | Không coi là chấp nhận hay sẵn sàng merge                   |

**Thay đổi so với wording cũ:** `ViBangCharge`, `ViBangPayment`, trạng thái UNPAID/PARTIALLY_PAID, trả góp, phân bổ tiền, phải thu, nhắc quá hạn, VAT/giá, báo cáo tài chính **bị loại bỏ** khỏi phạm vi Nexagnet. Lý do: `[OWNER]` MISA là hệ thống ghi nhận duy nhất. Nếu Issue cũ mâu thuẫn, #448 là căn cứ; thay đổi đã ghi tại đây.

## 2. Mạng Task Contract

| Issue                                                                                                                                                                                                | Chủ đề                            | Sóng  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----- |
| [#449](https://github.com/nexagnet/nexagnet-platform/issues/449)                                                                                                                                     | Tài liệu chuẩn + ADR + bản đồ này | W0    |
| [#450](https://github.com/nexagnet/nexagnet-platform/issues/450)                                                                                                                                     | Shell bốn miền                    | W1    |
| [#451](https://github.com/nexagnet/nexagnet-platform/issues/451)                                                                                                                                     | Nền tảng pháp lý dùng chung       | W1    |
| [#452](https://github.com/nexagnet/nexagnet-platform/issues/452), [#453](https://github.com/nexagnet/nexagnet-platform/issues/453)                                                                   | Tống đạt                          | W2–W4 |
| [#454](https://github.com/nexagnet/nexagnet-platform/issues/454), [#455](https://github.com/nexagnet/nexagnet-platform/issues/455)                                                                   | Xác minh điều kiện thi hành án    | W2–W4 |
| [#456](https://github.com/nexagnet/nexagnet-platform/issues/456), [#457](https://github.com/nexagnet/nexagnet-platform/issues/457), [#458](https://github.com/nexagnet/nexagnet-platform/issues/458) | Tổ chức thi hành án               | W2–W4 |
| [#459](https://github.com/nexagnet/nexagnet-platform/issues/459), [#460](https://github.com/nexagnet/nexagnet-platform/issues/460)                                                                   | Văn phòng (khách hàng, FIFO…)     | W4    |
| [#461](https://github.com/nexagnet/nexagnet-platform/issues/461)                                                                                                                                     | Biểu mẫu / mẫu in                 | W3    |
| [#462](https://github.com/nexagnet/nexagnet-platform/issues/462)                                                                                                                                     | Báo cáo, sổ                       | W4    |
| [#463](https://github.com/nexagnet/nexagnet-platform/issues/463)                                                                                                                                     | Di động / hiện trường             | W4    |
| [#464](https://github.com/nexagnet/nexagnet-platform/issues/464)                                                                                                                                     | Duyệt chéo miền trong ứng dụng    | W2–W3 |

> Cột "Sóng" là gán gợi ý từ cấu trúc sóng của #448 `[THIẾT KẾ]`; hợp đồng Task của từng Issue mới là nguồn có thẩm quyền.

## 3. Sóng và thứ tự (theo phụ thuộc)

| Sóng   | Nội dung                                                                                                        | Điều kiện vào         |
| ------ | --------------------------------------------------------------------------------------------------------------- | --------------------- |
| **W0** | Tài liệu chuẩn + ADR + rà soát Issue cũ và PR #440, không đụng control plane                                    | Bắt đầu được ngay     |
| **W1** | Phân loại pháp lý dùng chung (chỉ khái niệm thực sự dùng chung), preset quyền, ghép trải nghiệm/cấu hình tenant | W0 merge              |
| **W2** | Nền tảng độc lập từng miền + state machine có cấp quyền; miền này không giả định miền khác đã merge             | W1 liên quan          |
| **W3** | Mẫu tài liệu, chứng cứ hồ sơ, bản cuối/phiên bản                                                                | W2 của miền tương ứng |
| **W4** | UI từng miền; sổ/báo cáo/di động; kho FIFO văn phòng                                                            | W2–W3 tương ứng       |
| **W5** | Chứng minh end-to-end tổng hợp liên miền trên preview                                                           | W4                    |

Thứ tự **dựa trên phụ thuộc**, không phải "Vi bằng xong hoàn toàn rồi mới làm ba miền còn lại". Các miền W2 có thể chạy song song.

## 4. Cổng merge và bằng chứng

- Mỗi PR: 7 check bắt buộc (`verify`, `integration`, `workflow-integration`, `tenant-packs`, `e2e`, `audit`, `images`) trên **đúng HEAD** của PR; reviewer độc lập cùng HEAD.
- R0 (như #449): auto-merge được phép theo chính sách V4; sau merge CI exact-main là đủ, không cần runtime proof.
- **R2** (PII, quyền, bản ghi pháp lý bền, migration DB, workflow pháp lý, lưu trữ đám mây): **chỉ chủ sở hữu merge**, CI exact-main sau merge, preview health và bằng chứng theo kịch bản. `RUNTIME-PROVEN` chỉ khi có chứng minh thật.
- Production luôn cần phê duyệt riêng của chủ sở hữu. R3 (`.github`, deploy, infra, secret) là quy trình người riêng, ngoài các task này.
- Nghiệm thu UX của khách tách khỏi hoàn tất mã và tách khỏi khớp mẫu in pháp lý.

## 5. Điều kiện dừng

Cần văn bản gốc chưa công bố hay dữ liệu định danh; cần đổi `.github`/AGENTS/CLAUDE hay tệp được bảo vệ; thẩm quyền pháp lý chưa rõ; dùng tài liệu/PII thật không được phép; vượt thẩm quyền liên miền; yêu cầu mâu thuẫn mà chủ sở hữu chưa quyết. Chi tiết triển khai cấp thấp chưa rõ là việc của kỹ sư, không phải cổng chủ sở hữu.
