# Đặc tả nghiệp vụ chuẩn — Văn phòng Hai Bà Trưng (4 miền)

Nguồn chuẩn: Issue [#448](https://github.com/nexagnet/nexagnet-platform/issues/448) (quyết định của chủ sở hữu, 2026-10-10) ·
Task Contract mạng: [#426](https://github.com/nexagnet/nexagnet-platform/issues/426)–[#435](https://github.com/nexagnet/nexagnet-platform/issues/435), [#449](https://github.com/nexagnet/nexagnet-platform/issues/449)–[#464](https://github.com/nexagnet/nexagnet-platform/issues/464) ·
Giao diện đề xuất (không phải luật, không phải đặc tả thực thi): [Figma](https://www.figma.com/design/bueSNVniMoYD6lQFHwqeHz?node-id=92-3).

**Quy tắc ưu tiên:** #448 thắng mọi câu chữ cũ trong #426–#435. Khi mâu thuẫn, #448 là căn cứ và thay đổi
được ghi ở [bản đồ phụ thuộc](../../../phat-trien/ke-hoach/legal-office-dependency-map.md); không âm thầm khôi phục sổ cái tiền.

## Nhãn nguồn gốc (dùng ở mọi mục)

| Nhãn                | Nghĩa                                                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[OWNER]`           | Chủ sở hữu đã xác nhận trong #448                                                                                                                                             |
| `[LUẬT]`            | Suy ra từ nguồn pháp lý do BA cung cấp: Nghị định 151/2026/NĐ-CP, Thông tư 08/2026/TT-BTP (mẫu TP-THV-N-01…N-11, sổ TP-THV-S-01…S-06), Thông tư 06/2026/TT-BTP (phụ lục I–IX) |
| `[THIẾT KẾ]`        | Suy luận thiết kế triển khai — kỹ sư sở hữu, có thể đổi                                                                                                                       |
| `[CHƯA GIẢI QUYẾT]` | Tuân thủ pháp lý chưa xác minh; **không** được tuyên bố đã phù hợp                                                                                                            |

> **Không có tuyên bố tuân thủ pháp luật nào trong tài liệu này.** Nguồn pháp lý chưa được đối chiếu bản chính thức
> trong repo; mọi dòng `[LUẬT]` là tham chiếu để BA kiểm chứng, không phải kết luận pháp lý.

## 1. Văn phòng và vai trò

- `[OWNER]` Một văn phòng pháp lý, ba địa điểm: Trụ sở chính, Đông Anh, Bắc Ninh. Một Admin trung tâm. Một dãy số Vi bằng toàn văn phòng theo năm; chi nhánh nằm trên từng hồ sơ và báo cáo.
- `[OWNER]` Vai trò: Admin, Trưởng Văn phòng, Thừa hành viên (THV = Thừa phát lại trong ngữ cảnh này), Thư ký, Văn thư, Kế toán.
- `[OWNER]` **Vai trò ứng dụng ≠ thẩm quyền pháp lý.** Người ký pháp lý phải có thẩm quyền theo luật, độc lập với quyền được cấp trong ứng dụng. Phê duyệt trong ứng dụng **không** trao quyền ký.
- `[OWNER]` THV xem được hồ sơ mọi địa điểm, chỉ thao tác trên hồ sơ được giao (nơi miền yêu cầu giao việc). Thư ký xem và làm xử lý hỗ trợ được phép trên mọi hồ sơ Vi bằng. Admin cấu hình phạm vi chi nhánh chọn được (nhiều chi nhánh) cho Văn thư và Kế toán.

| Việc                                           | Ai làm                                               |
| ---------------------------------------------- | ---------------------------------------------------- |
| Tạo hồ sơ Vi bằng                              | THV, Thư ký, Văn thư, Admin                          |
| Giao THV chịu trách nhiệm (đúng một người)     | **Chỉ Admin**                                        |
| Giao việc Tống đạt                             | Admin **hoặc** Trưởng Văn phòng (vẫn phải đúng luật) |
| Duyệt chuyển giao/uỷ quyền liên miền trong app | Admin **hoặc** Trưởng Văn phòng                      |
| Ký văn bản pháp lý, bàn giao thực tế           | Người có thẩm quyền pháp lý thực tế                  |

## 2. Miền 1 — Vi bằng

- `[OWNER]` Khách hàng là CÁ NHÂN hoặc TỔ CHỨC; hợp đồng không bắt buộc lúc tiếp nhận; một hợp đồng ứng nhiều hồ sơ. Tiếp nhận tối thiểu, hoàn thiện dần; dữ liệu có cấu trúc tách khỏi tệp đính kèm.
- `[OWNER]` Nhân viên được sửa trực tiếp trường nội bộ trong **đúng 48 giờ liên tục kể từ lúc tạo** (tính cả cuối tuần). Sau đó: Yêu cầu thay đổi → Admin duyệt/từ chối, lưu trước/sau/lý do/thời điểm. Văn bản đã ký, phát hành, đóng dấu cần thủ tục sửa pháp lý riêng, **bất kể 48 giờ**.
- `[OWNER]` **MISA là hệ thống ghi nhận duy nhất** cho kế toán, thu/thanh toán, công nợ/quá hạn, phí, chứng từ. **Không** triển khai `ViBangCharge`, `ViBangPayment`, sổ cái UNPAID/PARTIALLY_PAID, trả góp, phân bổ tiền, phải thu, nhắc quá hạn, VAT/giá, báo cáo tài chính. **Không** tích hợp API MISA ở giai đoạn đầu.
- `[OWNER]` **Cổng quy trình pháp lý giữ lại:** Kế toán có quyền chi nhánh tự kiểm MISA rồi ghi **chỉ** `NOT_CONFIRMED / CONFIRMED_FULL`, người thực hiện, thời điểm, tham chiếu an toàn; không có số tiền, không bút toán. **Chỉ khi `CONFIRMED_FULL`** Văn thư mới cấp số.
- `[OWNER]` Xác nhận sai: Kế toán đề nghị thu hồi, **Admin duyệt/từ chối**, kiểm toán đầy đủ. Đã cấp số nhưng chưa trả mà xác nhận bị tranh chấp/thu hồi: **chặn trả**, giữ nguyên số đã cấp và văn bản đã ký, yêu cầu xác nhận hợp lệ mới. Không tái sử dụng số.
- `[OWNER]` Số `<số>/<năm>/VB-THV` toàn văn phòng, reset mỗi năm dương lịch, cấp phát nguyên tử trong DB, idempotent, không trùng. Admin xác nhận/cấu hình số cuối đã dùng của năm hiện tại cho giai đoạn chuyển tiếp; hồ sơ cũ nhập sau. Không xoá cứng hồ sơ/số; huỷ có lý do + kiểm toán (lưu giữ/xoá theo luật là việc riêng).
- `[OWNER]` Không bắt buộc duyệt dự thảo trực tuyến trước khi cấp số. Hỗ trợ **sinh tự động N-03/N-04** từ dữ liệu chuẩn **và** nhập DOCX/PDF soạn ngoài; phân biệt bản nháp với bản cuối đã ký/đóng dấu, có phiên bản. Theo chính sách MIME của File Platform; mở rộng định dạng cần phân tích bảo mật riêng.
- `[OWNER]` THV xác nhận đã ký; Văn thư xác nhận đã đóng dấu; **bản quét cuối đủ ký + dấu phải được tải lên và kiểm tra TRƯỚC khi trả khách**. Bản giấy gốc giữ nguyên; bản quét giai đoạn 1 là bản quản lý, **không** phải bản gốc điện tử có giá trị pháp lý. Sửa lỗi kỹ thuật theo N-11 là quy trình riêng có người ký đúng; hỗ trợ yêu cầu cấp bản sao hợp lệ.
- `[OWNER]` Nhân viên gọi/nhắn khách thủ công; hệ thống chỉ nhắc NỘI BỘ và lưu lần liên hệ/kết quả. Đã liên hệ ≠ đã trả. Việc trả có thể trước khi cập nhật/đăng ký Sở; theo dõi riêng với hạn pháp định (3 ngày làm việc nếu áp dụng) và bằng chứng dự phòng. Cập nhật lỗi sau khi đã trả: giữ trạng thái RETURNED và văn bản cuối; sự cố chuyển Admin + THV. `[LUẬT]` Sổ S-03 là **sổ của Sở Tư pháp**, không phải sổ của văn phòng; văn phòng xuất S-02.
- `[OWNER]` Không nhắn SMS/Zalo/email ra ngoài theo quy trình thường; không tích hợp tự động với Sở; không OCR/AI trên đường găng.

## 3. Miền 2 — Tống đạt

- `[OWNER]` Một yêu cầu/hồ sơ chứa **nhiều văn bản**; mỗi văn bản có người nhận, địa chỉ, hạn, người phụ trách, các lần thực hiện, kết quả, N-02/chứng cứ đã ký, thông báo cho cơ quan yêu cầu. Không đóng hồ sơ cha khi còn văn bản chưa xử lý xong.
- `[OWNER]` Admin hoặc Trưởng VP giao việc. `[LUẬT]` N-01 hợp đồng, N-02 biên bản, S-01 sổ; ngoại lệ pháp lý khi giao trực tiếp thất bại (không tự coi là thành công khi không có người nhận); nhắc thời hạn báo cáo áp dụng. Giữ kiểm tra thẩm quyền/địa bàn/phạm vi theo NĐ/TT08.

## 4. Miền 3 — Xác minh điều kiện thi hành án

- `[OWNER]` Một hồ sơ có **nhiều đợt xác minh** và nhiều nguồn thông tin. Mỗi đợt: mục tiêu, đối tượng, người thực hiện có thẩm quyền, nguồn, chứng cứ, kết quả. Kết luận chung được rà soát riêng, **không** do LLM suy ra.
- `[LUẬT]` N-05 hợp đồng dịch vụ, N-06 quyết định do **Trưởng Văn phòng** theo thẩm quyền, S-04 sổ; hạn pháp định, thông báo/chứng cứ, quyền riêng tư và giới hạn mục đích.
- `[OWNER]` Uỷ quyền cần văn bản đồng ý của người yêu cầu và thông báo bằng văn bản đúng quy định; duyệt trong ứng dụng bởi Admin hoặc Trưởng VP chỉ là cổng nội bộ, không thay thế chữ ký.

## 5. Miền 4 — Tổ chức thi hành án

- `[OWNER]` Kiến trúc lấy hồ sơ làm trung tâm: nhiều bên được thi hành, nhiều nghĩa vụ (mỗi nghĩa vụ có kết quả tăng dần/chứng cứ còn lại), nhiều tài sản liên quan (mỗi tài sản có sự kiện pháp lý chỉ-thêm: phát hiện, xác minh, biện pháp đề nghị, tranh chấp, bàn giao…), quyết định/chứng cứ, chuyển giao, kết thúc. Hồ sơ **không** tự hoàn thành khi một nghĩa vụ hoàn thành.
- `[OWNER]` Chỉ theo dõi nghiệp vụ pháp lý, **không** kế toán/thu chi. Số tiền (nếu có trong bản án/nghĩa vụ) là dữ kiện pháp lý, **không** phải sổ cái MISA hay động cơ thanh toán.
- `[LUẬT]` N-07 hợp đồng, N-08 bàn giao, S-05 sổ. `[OWNER]` Không ngụ ý THV tự quyết kê biên/phong toả; biện pháp cần quyết định của cơ quan thi hành án có thẩm quyền thì thuộc cơ quan đó. Tách **đề nghị** khỏi **quyết định thực tế**; kiểm toán mọi người thực hiện và chứng cứ.
- `[OWNER]` Chuyển giao/uỷ quyền: đề xuất → Admin HOẶC Trưởng VP duyệt TRONG ỨNG DỤNG → chữ ký hợp pháp và bàn giao thực tế.

## 6. Văn phòng dùng chung

- `[OWNER]` Quản lý khách hàng/hợp đồng; công văn đi/đến; sổ quyết định và văn bản; thư viện biểu mẫu; kho giấy/mực/văn phòng phẩm theo **FIFO theo lô** (KHÔNG phải kho tài sản pháp lý bị kê biên); tìm kiếm; sổ S-01/S-02/S-04/S-05/S-06 theo năm/tháng; xuất Excel/PDF; báo cáo in N-09/N-10 khi có nguồn chính xác; lịch sử/kiểm toán; truy cập nhiều chi nhánh; bảng điều khiển theo vai trò; làm việc hiện trường trên di động.
- `[OWNER]` Phụ lục I–IX của TT06 chỉ là **thư viện tra cứu/xem/tải**, không tự điền, không tự phát hành, không giả vờ văn phòng ký biểu mẫu của cơ quan thi hành án nhà nước.
- `[OWNER]` Logo văn phòng là placeholder; **không** hiện logo Nexagnet trên màn hình khách; thương hiệu theo tenant lúc chạy.

## 7. Lưu trữ và cổng sản xuất

- `[OWNER]` Đám mây là kho quản lý điện tử chính; bản giấy gốc ở văn phòng. Khách **chưa** được phê duyệt lưu hồ sơ ngoài trụ sở — phải hoàn tất trước go-live. `[CHƯA GIẢI QUYẾT]` Khả năng áp dụng pháp lý và sự đồng ý.
- `[THIẾT KẾ]` Object storage riêng tư đã duyệt, mã hoá, kiểm soát truy cập, sao lưu, checksum/phiên bản, khả năng phục hồi.
- `[OWNER]` Bản quét ban đầu **không** phải số hoá hợp pháp cần chữ ký số; quy trình tuân thủ đó là việc riêng sau này, chưa được tuyên bố hoàn tất.
- `[OWNER]` **Không** triển khai production, dùng tài liệu/PII thật, secret hay nộp hồ sơ ra ngoài cho đến khi chủ sở hữu duyệt rõ ràng và đủ điều kiện pháp lý.

## 8. Điều không được làm (bất biến)

1. Không ghi nhận tiền/thanh toán/công nợ trong Nexagnet (MISA là nguồn duy nhất).
2. LLM không cấp quyền chuyển trạng thái pháp lý, không quyết thanh toán, an ninh, kết quả pháp lý hay cưỡng chế.
3. Không `if (tenant === ...)` trong mã sản phẩm; không repo mới.
4. API đóng-khi-lỗi (fail-closed) cho PII/văn bản pháp lý, không chỉ UI; không rò PII vào kiểm toán.
5. Không tải văn bản gốc, hợp đồng định danh, chữ ký, con dấu của khách lên repo công khai.

## 9. Trạng thái bằng chứng

| Hạng mục                                                        | Trạng thái                                                                                                                                                                  |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quy tắc #448 chuyển vào tài liệu này                            | Lấy từ phần nguồn tự chứa trong #449; runner chưa đọc trực tiếp #448                                                                                                        |
| Fidelity giao diện Figma                                        | `NOT_PROVEN` — Figma không truy cập được từ runner; chỉ dùng mô tả văn bản (100+ màn hình; trang: hướng dẫn, 4 miền, văn phòng, di động, design system, trạng thái bị chặn) |
| Đối chiếu bản gốc pháp lý (NĐ 151/2026, TT 08/2026, TT 06/2026) | `NOT_PROVEN`                                                                                                                                                                |
| Khớp mẫu in pháp lý                                             | `NOT_PROVEN` — cần nguồn chuẩn + so sánh golden/snapshot                                                                                                                    |
| Runtime                                                         | Không có; tài liệu thuần                                                                                                                                                    |
