# HỢP ĐỒNG TRANSPORT DOMAIN v2 — R0 (nội bộ-B trước)

- **Ngày lập:** 07/09/2026
- **Mốc:** `TRANSPORT DOMAIN v2 / R0`
- **Đo trên:** `origin/main` = `07163b1d4758c81ee8105d3d3127ec0c93f0731b` (07/09/2026 10:50 +0700)
- **Chỉ thị:** Issue #229 (lộ trình) + Issue #230 (hợp đồng thực thi R0→R1)
- **Nguồn nghiệp vụ:** [`../khach-hang/van-tai-viet/nghiep-vu/nguon-su-that-van-tai.md`](../khach-hang/van-tai-viet/nghiep-vu/nguon-su-that-van-tai.md) (T0)
- **Hợp đồng đang chạy:** [`transport-domain-contract.md`](transport-domain-contract.md) (T1)

> **File này KHÔNG thay thế T1.** T1 là hợp đồng của cái **đang chạy** (T2–T7 as-built, đã có mã trên
> `main`, đã có dữ liệu UAT thật trên `transport-preview/gd1-test`). File này ghi **phán quyết R0**
> về lộ trình v2: chỗ nào lộ trình đúng, chỗ nào lộ trình mô tả sai hiện trạng, chỗ nào lộ trình
> mâu thuẫn với chính T1, và tranche nào được làm trước. Khi một mục v2 được hiện thực và chạy thật,
> mục as-built của nó về T1 §18 theo đúng quy ước cũ.

> **Quy ước tài liệu nền tảng vẫn áp dụng.** `kien-truc/` không nhắc tên khách. Khách vận tải xuất
> hiện ở đây chỉ dưới vai *reference tenant*; tham số riêng nằm ở T0 hoặc `tenants/<slug>/`.

---

## 0. Phán quyết tóm tắt

`ROADMAP_VERDICT = AMENDED`.

Lộ trình #229 **đúng về hướng** và **sai về hiện trạng ở bốn chỗ**. Ba trong bốn chỗ đó mô tả một
việc như *chưa làm* trong khi nó **đã chạy trên `main` từ T3/T4**, và một chỗ đề xuất một cấu trúc
**không có nguồn nghiệp vụ nào** — kể cả nguồn của chính chủ sở hữu.

| Mục #229 | Phán quyết | Lý do một dòng |
|---|---|---|
| §0 Nguyên tắc kiến trúc (10 mục) | **ACCEPT** | Trùng khớp guardrail T1 §16; không mục nào mâu thuẫn |
| §1 Counterparty đa vai | **AMEND** | Đa vai **đã có** (`TransportPartnerRole`). Khoảng trống thật là **danh tính** giữa ba bảng bên, không phải vai |
| §1 Order / Run / Leg | **AMEND — hoãn** | **Không có một sự kiện T0 nào** về chiều rỗng/km rỗng. Đây là chỉ đạo của chủ sở hữu, phải được ghi thành giả định có tên trước khi thành cột |
| §2 Operational Proof | **ACCEPT có điều kiện** | Mâu thuẫn trực diện với T1 §15 non-goal #2 và `GD-17`. Chủ sở hữu có quyền đảo, nhưng phải đảo **thành văn**, không đảo ngầm |
| §3 Địa không gian (PostGIS/MapLibre) | **ACCEPT** | Xem §4 ma trận công nghệ |
| §4 App lái xe / chống giả GPS | **AMEND — đổi thứ tự** | Xem `F-07` |
| §5 Offline outbox | **ACCEPT** | Đúng, và `GD-19` đã ghi sẵn "demo online-only" như một giả định phải đảo |
| §6 Nhiên liệu = công nợ công ty | **AMEND — đã xong 90%** | `VT-041` là **sự kiện khách đã xác nhận**, và `SUPPLIER_ACCOUNT → COMPANY_DIRECT` đã chạy từ T4 |
| §7 Vision/OCR | **ACCEPT** | Khớp guardrail `NO_LLM_FINANCIAL_DECISION`; trục `verificationStatus` đã có sẵn chỗ để cắm |
| §8 ETC — chỉ nghiên cứu | **ACCEPT** | Xem §4 |
| §9 Driver Fund v2 / ExpenseClaim | **AMEND — hoãn** | Duyệt một phần là **ẩn số nghiệp vụ do chính #230 §F liệt kê**. Code trước là khoá một luật chưa ai quyết |
| §10 Số dư âm = khoản phải hoàn | **ACCEPT — đã xong** | T1 §9.4 + `describeFundBalance()` đã trả `COMPANY_OWES_DRIVER` từ T3R |
| §11 Payroll accrual ≠ payment | **AMEND — rủi ro pháp lý** | Xem `F-08` |
| §12 Bảo dưỡng — khảo sát trước | **ACCEPT** | Và R0 tìm được **bằng chứng cụ thể** cho câu "không khớp thực tế": xem `F-09` |
| §13 Analytics | **ACCEPT** | Phụ thuộc §1; hoãn theo §1 |
| §14 Hệ sinh thái A/B/C | **ACCEPT** | Không làm bây giờ; §1 amend đã chừa chỗ cắm |

---

## 1. Kiểm kê mô hình hiện tại — `KEEP / EXTEND / MIGRATE / DEPRECATE / UNKNOWN`

Đo bằng cách đọc `apps/api/prisma/schema.prisma` (2.866 dòng, 43 bảng `Transport*`) và 195 tệp
`apps/api/src/transport/**`. Cột **Phán quyết** trả lời đúng một câu: *lộ trình v2 làm gì với nó?*

### 1.1. `transport-core` — chuyến, đội xe, bên đối tác

| Model / service | Phán quyết | Ghi chú |
|---|---|---|
| `TransportVehicle` | `EXTEND` | `status` là cột ghi tay; trạng thái **hiệu lực** đã được suy riêng ở `resolveEffectiveVehicleState`. v2 thêm toạ độ/geofence bãi thì thêm bảng, không sửa bảng này |
| `TransportDriver` | `KEEP` | `authUserId` unique đã là cầu nối phiên → hồ sơ; đủ cho app lái xe |
| `TransportVehicleAssignment` | `KEEP` | Lịch sử, partial unique một bản hiệu lực. Đúng mẫu cần cho `RunLeg` sau này |
| `TransportCustomer` | `EXTEND` | Bảng bên **thuê** vận chuyển |
| `TransportPartner` + `TransportPartnerRole` | `KEEP` | **Đa vai đã có**: `(partnerId, role)` khoá kép, `CARRIER` + `ORDER_REFERRER` |
| `TransportFuelSupplier` | `EXTEND` | Bảng bên **bán dầu**, tách có chủ đích (xem `F-03`) |
| `TransportTrip` | `EXTEND` | Aggregate root. **Không migrate**, không đổi tên — 8 bảng khác trỏ FK vào nó |
| `TransportTripAssignment` | `KEEP` | — |
| `TripService.assign()` | `EXTEND` | Xem `F-09`: không tra lệnh bảo dưỡng |
| `trip-lifecycle.ts` | `KEEP` | 5 trạng thái + cạnh cho phép, tất định, có mã lý do từ chối |

### 1.2. `transport-costing` — giá thành + sổ quỹ

| Model / service | Phán quyết | Ghi chú |
|---|---|---|
| `TransportDriverFundAccount` | `KEEP` | **Không có cột `balance`** — số dư là `SUM(signedAmount)` |
| `TransportDriverFundEntry` | `KEEP` | Bất biến, `correlationKey` unique, `reversalOfId` unique |
| `TransportTripExpense` | `EXTEND` | `fundedBy: DRIVER_FUND \| COMPANY_DIRECT` — đây chính là cái §6 lộ trình đòi |
| `TransportDriverFundPeriod` + `Snapshot` | `KEEP` | EXCLUDE constraint chống chồng kỳ; snapshot append-only |
| `driver-fund-ledger.ts` | `KEEP` | `describeFundBalance()` → `COMPANY_OWES_DRIVER` (xem `F-02`) |

`ExpenseClaim` (§9 lộ trình): **`UNKNOWN`** — chưa có bảng, và chưa nên có (xem `F-06`).

### 1.3. `transport-fuel`

| Model / service | Phán quyết | Ghi chú |
|---|---|---|
| `TransportFuelEntry` | `EXTEND` | Hai trục trạng thái độc lập; `sourceStatementId` chống tự-khớp-với-chính-mình |
| `TransportFuelPaymentMethod` | `EXTEND` | `DRIVER_CASH` \| `SUPPLIER_ACCOUNT` — xem `F-01` |
| `TransportFuelReceiptEvidence` | `MIGRATE → #223` | Bảng con giữ `locator`; khi File Platform có `fileId` thật thì đây là chỗ đổi |
| `TransportFuelSupplierStatement` / `StatementLine` | `KEEP` | CSV/XLSX qua cổng, cột khai trong gói khách |
| `TransportFuelReconciliation` / `Match` / `Discrepancy` | `KEEP` | 5 loại chênh lệch có tên, 5 cách quyết có tên |
| `TransportFuelSettlementHandoff` | `KEEP` | Chuỗi bản sửa đổi + dấu vân tay kinh tế |
| `fuel-statement-mapping.ts` | `EXTEND` | Adapter cho bảng kê; chỗ cắm của R4 |

### 1.4. `transport-settlement` · `transport-asset-compliance` · `transport-workforce`

| Model / service | Phán quyết | Ghi chú |
|---|---|---|
| `TransportSettlementDocument` + `Allocation` | `KEEP` | Đã có phân bổ một khoản thu/chi vào nhiều chứng từ |
| `TransportSettlementPeriod` / `CustomerTerms` / `CommissionRule*` | `KEEP` | — |
| `TransportMaintenancePlan` / `WorkOrder` | ~~`UNKNOWN`~~ → **`EXTEND`** | `TX-06b` bù bảy nguyên hàm còn thiếu (xưởng, phụ tùng/công thợ, bằng chứng, hỏng dọc đường, kế hoạch-vs-thực tế, downtime, bản chất lệnh). Xem §15 |
| `TransportComplianceDocument` | `KEEP` | Đã tách khỏi bảo dưỡng đúng như §12 đòi |
| `TransportPayrollPeriod` / `Run` / `Payslip` / `Component` | `EXTEND` | Đã có `SUPPLEMENTAL`/`REVERSAL`, `policySnapshot`, `missingInputs` |
| Chi trả / `Disbursement` | ~~`UNKNOWN`~~ → **`AS-BUILT`** | **Đã có từ `TX-07b`** (R5, PR của Lane D) — `TransportDriverCashout` + `…Allocation`. Xem §14 |

### 1.5. Nền tảng mà v2 sẽ dựa vào

| Thứ | Trạng thái đo được | Ý nghĩa cho v2 |
|---|---|---|
| `MediaStore` (`none`/`local`/`gcs`/`s3`) | Có `put`/`get`/`check` | #223 sở hữu; v2 **không** dựng kho thứ hai |
| `TransportEvidenceService` | Đã bọc `MediaStore`, khoá đục, chặn theo content-type + dung lượng | Chỗ cắm sẵn cho ảnh chứng cứ vị trí |
| Hatchet (`apps/api/src/workflow/**`) | Có adapter + outbox + worker | Dùng cho trích xuất OCR nền, **không** giữ sự thật nghiệp vụ |
| OTel + `BusinessDecision` ledger | Đang chạy | Mọi quyết định rủi ro của v2 phải có **mã lý do**, không phải câu chữ |
| `CAPABILITY_IDS` | **enum đóng** trong `packages/tenant` | Thêm capability v2 phải sửa enum + gói khách; không gate được cái chưa tồn tại |
| Địa không gian / GPS | **Không có một dòng nào** | Không `latitude`, không `geofence`, không `TelematicsPort`. Guardrail `NO_DIRECT_VENDOR_GPS_SDK_IN_DOMAIN` hôm nay đúng vì *chưa ai viết gì*, không vì có cổng |

---

## 2. Mười hai phát hiện phản biện — có bằng chứng, có địa chỉ

Mỗi phát hiện ghi: **cái lộ trình nói** → **cái đo được** → **phải làm gì**.

### `F-01` — "Nhiên liệu không trừ vào sổ quỹ" đã là **sự kiện khách xác nhận** và đã chạy từ T4

#229 §6 trình bày điều này như một **quyết định kinh doanh mới**. Nó không mới.

`VT-041` (T0 §7, trạng thái `CONFIRMED`, dẫn tr.5 §6 của nguồn khách):

> *Lái xe **không trả tiền mặt mà ký nhận (ký nợ)** tại cây xăng; công ty thanh toán thẳng cho cây
> xăng theo kỳ sau khi đối chiếu.*

Và mã đã làm đúng thế từ T4 (`apps/api/src/transport/fuel/fuel.service.ts:973`):

```ts
method === 'DRIVER_CASH' ? 'DRIVER_FUND' : 'COMPANY_DIRECT';
```

`SUPPLIER_ACCOUNT` → `TripExpense(fundedBy = COMPANY_DIRECT)`, **không** sinh bút toán quỹ. Đường
mà #229 §6 mô tả là đường **đã có sẵn**.

Thứ còn lại là `DRIVER_CASH` — một nhánh `DERIVED_DESIGN`, **không có sự kiện T0 nào đòi**. Nó tồn
tại vì một lần đổ dầu ở cây xăng ngoài hợp đồng là chuyện có thật.

**Phải làm gì:** *không* xoá `DRIVER_CASH` (xoá là phá dữ liệu UAT đang có và cắt một đường vận
hành thật). Thay vào đó **đưa nó ra sau một chính sách của gói khách**, mặc định **cấm**, và khi
cấm thì cổng nằm ở tầng miền có mã lý do, không phải ở giao diện. Đây là tranche nhỏ nhất thoả mãn
§6 mà không phá gì — xem §10.

### `F-02` — "Số dư âm = khoản phải hoàn cho lái xe" đã xong từ T3R

#229 §10 mô tả nó như thiết kế tương lai. T1 §9.4 đã chốt đúng chiều đọc đó ngày 30/08/2026
(`DA-T3-01`), và nó được khoá **bằng kiểu dữ liệu**, không bằng câu chữ: `describeFundBalance()`
trong `driver-fund-ledger.ts` trả `DRIVER_HOLDS_COMPANY_CASH | SETTLED | COMPANY_OWES_DRIVER`.
Không nhãn nào nói "lái xe nợ công ty". `GD-12` đã tắt hẳn đường trừ lương.

**Phải làm gì:** ghi nhận là **đã xong**. Phần chưa có là **đường chi trả** (§11 lộ trình) — xem
`F-08`.

### `F-03` — Counterparty đa vai đã có; khoảng trống thật là **danh tính**, và nó có lý do đã ghi

#229 §1 đề xuất `Counterparty` với `roles: CUSTOMER | CARRIER | REFERRER | FUEL_SUPPLIER | OTHER`.

Đo được: `TransportPartnerRole` là **một bảng vai**, khoá kép `(partnerId, role)`, đúng mẫu #229
muốn — và bình luận trong schema nói rõ vì sao nó không phải một cột `partnerType`. Đa vai
`CARRIER` ⟂ `ORDER_REFERRER` **đã chạy**.

Cái *không* có: một tổ chức vừa là khách thuê vừa là nhà xe phải tồn tại **hai hàng ở hai bảng**
(`TransportCustomer` + `TransportPartner`). Cây xăng là bảng thứ ba.

Nhưng việc tách đó **không phải sơ suất** — schema ghi lý do: T1 §9.1 xếp năm luồng công nợ thành
năm sổ, và nguồn của chúng không đồng nhất; `PARTNER_CARRIER`/`PARTNER_COMMISSION` là hai *vai* của
một đối tác, còn `FUEL` là một *nguồn riêng* đóng bằng **một bảng kê** thay vì một kỳ đối tác.

**Phải làm gì:** **không gộp ba bảng**. Gộp là dời FK của các bảng tài chính đang có dữ liệu thật —
đắt, rủi ro, và phá chính lý do ba bảng tồn tại. Đường cộng thêm đúng là một **xương sống danh
tính**: một bảng `TransportCounterparty` + bảng liên kết trỏ tới hàng sẵn có ở ba bảng kia. Không
FK nào phải dời, không truy vấn nào phải sửa, và §14 (hệ sinh thái A/B/C) có sẵn chỗ cắm danh tính
tổ chức về sau.

### `F-04` — Order / Run / Leg **không có một sự kiện nguồn nào**

#229 §1 đòi `VehicleRun` + `RunLeg` với `loaded | empty/deadhead` và bộ chỉ số km rỗng / tỷ lệ rỗng.

Đo được trong T0: **không có `VT-*` nào** nói về chiều về, chạy rỗng, hay km rỗng. `VT-021` liệt kê
thông tin chuyến và dừng ở *điểm đi/điểm đến*. Mục §14 `MISSING` của T0 cũng **không** liệt kê nó —
tức đây không phải "tài liệu chưa nhận", mà là **chưa ai từng nêu**.

`GD-05` đã chốt v1 một điểm đi / một điểm đến, và ghi sẵn chi phí đảo ngược **trung bình**.

Chính #229 đặt ra luật này cho R0: *"R0 must not claim customer truth where owner has not supplied
it."* Luật đó áp cho **cả #229**. Chủ sở hữu hoàn toàn có quyền cấp một sự kiện mới — nhưng nó phải
được ghi **thành một dòng có mã** ở T0 hoặc thành một `GD-xx`, trước khi thành một cột.

**Phải làm gì:** **không** đưa Order/Run/Leg vào tranche đầu. Xem `Q-01` ở §7 — câu trả lời quyết
định `RunLeg` là *bảng con của chuyến* hay *chuyến là bảng con của Run*. Hai hình dạng đó khác nhau
về gốc, và chọn sai thì lần sửa thứ hai đắt hơn lần đầu nhiều lần.

### `F-05` — Proof/GPS mâu thuẫn trực diện với T1 §15 và `GD-17`

T1 §15 liệt kê **non-goal #2: "Hệ thống theo dõi GPS"**. `GD-17` chốt *"Không GPS trong demo"*, và
guardrail `NO_DIRECT_VENDOR_GPS_SDK_IN_DOMAIN` được đánh dấu "cưỡng chế được ngay" — nhưng đo lại
thì lý do nó cưỡng chế được là **chưa ai viết một dòng nào**: toàn repo không có `latitude`,
`longitude`, `geofence`, hay `TelematicsPort`.

#229 §2–§4 đảo ngược non-goal đó. Đấy là quyền của chủ sở hữu. Cái **không** được phép là để hai
tài liệu nền tảng nói ngược nhau trong im lặng.

**Phải làm gì:** khi R2 mở, T1 §15 và `GD-17` phải được sửa **cùng lúc**, dẫn về #229 như nguồn của
việc đảo. Cho tới lúc đó, T1 vẫn đúng với cái đang chạy.

### `F-06` — `ExpenseClaim` duyệt-một-phần là ẩn số do **chính #230 liệt kê**

#229 §9 đòi vòng đời `PENDING_REVIEW → APPROVED | REJECTED | PARTIALLY_APPROVED`, giữ cả *số đề
nghị* lẫn *số được duyệt*.

Nhưng #230 §F đặt "partial approval of expenses" vào danh sách **câu hỏi cần B trả lời**. Và T0 có
sẵn một xung đột chưa gỡ ở đúng vùng này: `C-02` (`VT-048` *"cảnh báo kiểm tra thủ công"* ⟂
`VT-062` *"trừ vào lương... nếu thiếu chứng từ"*), là lý do `GD-12` tắt đường trừ lương.

Viết máy trạng thái duyệt bây giờ là **khoá một luật tiền chưa ai quyết** — đúng nghĩa STOP
condition #1 của #229 nếu làm.

**Phải làm gì:** hoãn tới khi có câu trả lời (`Q-04`). Đường hiện tại (`TripExpense` + `REVERSAL`)
vẫn ghi được mọi khoản chi và sửa được mọi sai sót; nó chỉ thiếu *cổng duyệt trước khi vào giá
thành*, không thiếu *khả năng ghi*.

### `F-07` — Xe đầu kéo ở Việt Nam **đã bắt buộc có hộp GPS hợp quy từ 01/01/2025**

Đây là phát hiện làm đổi thứ tự cả R2–R3.

| Văn bản | Hiệu lực | Nội dung |
|---|---|---|
| Luật TTATGT đường bộ 2024 (36/2024/QH15) Đ.35 k.2 | 01/01/2025 | Xe kinh doanh vận tải phải có thiết bị giám sát hành trình **và** thiết bị ghi nhận hình ảnh người lái |
| **Nghị định 158/2024/NĐ-CP** | 01/01/2025 | Thay `NĐ 10/2020`; **gọi đích danh xe đầu kéo** |
| **QCVN 06:2024/BCA** (TT 62/2024/TT-BCA) | 01/01/2025 | Quy chuẩn kỹ thuật, thay `QCVN 31:2014/BGTVT`; thiết bị cũ phải nâng cấp trước **12/2027** |
| Thông tư 71/2024/TT-BCA | 01/01/2025 | Dữ liệu truyền thẳng về máy chủ Cục CSGT |
| Nghị định 238/2026/NĐ-CP | **15/08/2026** | Phạt tới 5.000.000đ; làm sai lệch dữ liệu → có thể **thu hồi giấy phép kinh doanh vận tải** |

Nghĩa là: **mỗi xe đầu kéo của B đã có một nguồn vị trí thứ hai, độc lập, hợp quy, do bên thứ ba
vận hành, lưu ≥1 năm trên máy chủ nhà cung cấp** — và nó tồn tại dù chúng ta có làm gì hay không.
Chi phí dịch vụ khoảng **70.000–100.000đ/xe/tháng** mà B **đã** trả.

Một nguồn độc lập như thế đối chiếu chéo được với khai báo của lái xe **mà không cần một dòng mã
chống giả mạo nào**. Đó là tín hiệu chống gian lận rẻ nhất đang nằm sẵn trên bàn.

**Nhưng** — và đây là chỗ phải trung thực — **không nhà cung cấp lớn nào có API công khai cho khách
lấy dữ liệu đội xe của chính mình**. Đã kiểm: BA GPS (mở thẳng trang đăng nhập nền tảng — không một
chữ nào về API/tích hợp/xuất dữ liệu), VNPT Tracking, Viettel Vtracking, Adsun: chỉ có trang tiếp
thị. Vietmap **có** API công khai nhưng đó là **sản phẩm bản đồ** (routing/geocoding), *không* phải
cổng lấy telemetry của thiết bị GSHT đã lắp — hai thứ khác nhau, đừng nhầm.

**Phải làm gì:** ba việc, theo thứ tự.
1. Hỏi B: đang dùng nhà cung cấp nào, có tài khoản dashboard không (`Q-02`).
2. Khai `VehicleTelematicsPort` như một **cổng có hiện thực đầu tiên là nhập tay/CSV**, không phải
   một cổng chờ API không tồn tại.
3. **Hạ ưu tiên R3** (app lái xe chống giả GPS). Xây một app native để chống mock-location trong khi
   một nguồn vị trí hợp quy đang chạy sẵn trên cùng chiếc xe là đầu tư sai chỗ. R3 chỉ đúng khi
   `Q-02` trả lời rằng dữ liệu kia **không lấy về được**.

### `F-08` — Trả lương dồn nhiều tháng **rất có thể là vi phạm pháp luật lao động**

#229 §11 nói: *"B may allow drivers to accumulate salary for several months and receive one large
payment later"*, và dựng cả một tầng phân bổ thanh toán trên tiền đề đó.

Bộ luật Lao động 2019:

- **Điều 94** — trả lương *trực tiếp, đầy đủ, đúng hạn*;
- **Điều 97 k.1** — người hưởng lương tháng được trả **ít nhất mỗi tháng một lần**, vào một ngày cố
  định đã thoả thuận;
- **Điều 97 k.4** — bất khả kháng thì chậm **tối đa 30 ngày**, và chậm **từ 15 ngày trở lên** thì
  phải **trả thêm tiền lãi** theo lãi suất huy động kỳ hạn 1 tháng.

Tức là: dồn lương **nhiều tháng** rồi trả một cục không phải một lựa chọn vận hành — nó là hành vi
có trần 30 ngày và có lãi phạt.

**Phải làm gì:** **giữ** phần cấu trúc của §11 (tách *ghi nhận* khỏi *chi trả* là đúng, và cần cho
khoản hoàn ứng ở `F-02`), **bỏ** phần tiền đề (coi việc dồn tháng là dòng chảy bình thường). Thay
vào đó, khi một phiếu lương quá hạn, hệ thống phải **nói ra** — một cảnh báo có mã lý do
(`WAGE_PAYMENT_OVERDUE`), không phải một cột im lặng. Đây là việc của R5; ghi lại ở đây để R5 không
xây nhầm.

Kèm hai điểm nữa cùng gốc, đã đổi **chín tuần trước**:

- Trần **4 giờ lái liên tục** vẫn còn (Đ.64 Luật 36/2024), nhưng Luật 118/2025/QH15 (hiệu lực
  **01/07/2026**) **thêm ngoại lệ bất khả kháng** — nếu sau này có cảnh báo giờ lái thì phải ghi
  được lý do ngoại lệ.
- Trần **10 giờ/ngày và 48 giờ/tuần** *dành riêng cho lái xe* đã bị **bỏ** từ 01/07/2026; giờ làm
  quay về trần chung của Bộ luật Lao động (Đ.105, Đ.107). Bất kỳ luật cứng nào viết theo hai con số
  cũ **từ hôm nay là sai**.

### `F-09` — Tài liệu bàn giao đang nói với khách một tính chất an toàn mà mã **không có**

`docs/khach-hang/van-tai-viet/ban-giao/bat-dau-nhanh.md:68` viết:

> *Xe có lệnh bảo dưỡng đang mở bị khoá khỏi việc phân chuyến.*

Đo được: `TripService.assign()` (`apps/api/src/transport/trips/trip.service.ts:156`) kiểm **đúng ba
thứ** — chuyến chưa ở điểm cuối, xe tồn tại, lái xe tồn tại. Nó **không** tra lệnh bảo dưỡng, và
cũng không đọc `TransportVehicle.status = UNDER_MAINTENANCE`. Hàm `resolveEffectiveVehicleState()`
chỉ có **một** người gọi: `asset-compliance-read.service.ts` — một đường **đọc**.

Nói cách khác: hệ thống **suy ra** trạng thái và **cảnh báo**, nó không **chặn**.

Đây vừa là một lỗi tài liệu phải sửa, vừa là bằng chứng cụ thể cho câu #229 §12 nói chung chung
("bảo dưỡng chưa khớp thực tế"). Và nó chạm đúng một ẩn số mà #230 §F đã liệt kê: *"what legally
blocks dispatch vs merely warns"*.

**Phải làm gì:** sửa **tài liệu** cho đúng cái mã làm (rẻ, và đang nói sai với khách). **Không**
thêm cổng chặn cho tới khi `Q-05` có câu trả lời — thêm một cổng chặn sai chỗ trong nghiệp vụ vận
tải là làm cả đội xe đứng bánh.

### `F-10` — Từ 01/06/2025 **mọi lần bán xăng dầu ở Việt Nam đều phát hoá đơn điện tử từng lần**

#229 §7 dựng cả một chương quanh việc đọc **ảnh** phiếu đổ dầu bằng VLM/OCR.

**Nghị định 70/2025/NĐ-CP**, hiệu lực **01/06/2025**, buộc **mọi** cửa hàng bán lẻ xăng dầu phát
**hoá đơn điện tử khởi tạo từ máy tính tiền theo từng lần bán hàng**, kết nối dữ liệu với cơ quan
thuế, **kể cả bán cho khách lẻ trả tiền mặt**. Không tuân thủ có thể bị thu hồi giấy phép.

Và PVOIL Easy (ký hợp đồng với một đơn vị, đổ ở mọi trạm toàn quốc, **quyết toán cuối kỳ**) **tự
động gửi hoá đơn điện tử qua email sau mỗi lần giao dịch**.

Tức là dữ liệu đổ dầu của B **không bị kẹt trên giấy**. Nó tồn tại dưới dạng XML có cấu trúc, phát
tại thời điểm bán.

**Phải làm gì:** đảo thứ tự trong R4. Đường **thứ nhất** là *nhập hoá đơn điện tử* (có cấu trúc,
chính xác, không cần suy đoán). OCR/VLM lùi về đúng vai của nó: đọc **ảnh phiếu lái xe chụp tại
chỗ** để đối chiếu thời gian thực (`VT-042`) và làm đường lùi khi không có hoá đơn. Cổng
`FuelStatementSourcePort` đã có sẵn — thêm một adapter hoá đơn điện tử rẻ hơn nhiều so với đuổi
theo độ chính xác OCR trên phiếu nhiệt nhàu, thứ mà **không có một benchmark công khai nào** đo cho
tiếng Việt trên giấy in nhiệt.

### `F-11` — Vị trí GPS của người lao động **rất có thể là dữ liệu cá nhân nhạy cảm**, và văn bản cơ sở pháp lý **chưa có**

Luật BVDLCN 91/2025/QH15 (hiệu lực 01/01/2026) + NĐ 356/2025/NĐ-CP (thay NĐ 13/2023). Dữ liệu vị
trí được nhiều nguồn pháp lý thứ cấp xếp vào nhóm **nhạy cảm**; ảnh giao hàng có mặt người thứ ba
chạm tới dữ liệu sinh trắc của người **không phải nhân viên**.

Cơ sở xử lý hợp pháp có thể là *thực hiện thoả thuận* (hợp đồng lao động / nội quy lao động) —
nhưng **phải được ghi thành văn bản**, không mặc nhiên.

T0 §14 `MISSING` đã ghi sẵn: **"Văn bản đồng ý xử lý dữ liệu cá nhân (lái xe)" — chưa có.**

Kèm một hệ quả cho `F-10`: gửi **ảnh** phiếu ra một API nước ngoài là **chuyển dữ liệu qua biên
giới** nếu ảnh có mặt người/biển số, kéo theo nghĩa vụ hồ sơ đánh giá tác động của NĐ 356/2025. Nội
dung *chữ* trên phiếu (tên cây xăng, số lít, tiền) thì không phải dữ liệu cá nhân. Cách rẻ nhất để
câu hỏi này biến mất: **cắt ảnh về đúng khung tờ phiếu ngay trên máy lái xe** trước khi gửi đi.

**Phải làm gì:** đây là **điều kiện chặn của R2/R3**, không phải của R1. Không lưu một điểm toạ độ
liên tục nào của người lao động trước khi văn bản đó tồn tại. Bằng chứng theo **sự kiện** (lúc bắt
đầu / lúc đổ dầu / lúc giao hàng) là mức tối thiểu hoá dữ liệu đúng và cũng là mức R2 nên dừng lại.

### `F-12` — `CAPABILITY_IDS` là enum đóng, nên mọi capability v2 phải sửa `packages/tenant`

Không phải phản biện lộ trình, mà là ràng buộc thi công: `CAPABILITY_IDS` và `EXPERIENCE_IDS` là
`as const` trong `packages/tenant/src/tenant.schema.ts`, và gói khách được zod validate lúc boot.
Thêm `transport-proof` hay `transport-telematics` **không** gate được bằng dữ liệu — phải sửa enum,
build lại `@netviet/tenant`, rồi mới khai trong `tenants/<slug>/tenant.json`.

Hệ quả trực tiếp: một tranche v2 chạm capability **luôn** đụng `packages/tenant`, tức luôn có khả
năng va với #223/#224. Tranche đầu tiên nên **tránh** thêm capability mới.

---

## 3. Ma trận công nghệ — có phiên bản, có ngày, có giấy phép

Nguyên tắc chấm: **tính di động sang máy chủ của khách** (#224) và **dữ liệu có rời máy chủ không**
được chấm ngang với chi phí. Đo ngày 07/09/2026.

### 3.1. Địa không gian — `POSTGIS = ADOPT, nhưng chỉ khi R2 mở`

> ⚠️ **ĐÃ SỬA ĐỔI 07/09/2026 bởi Lane B (#235).** Mục này là bản ghi của R0 và giữ nguyên làm lịch
> sử, nhưng **ba điều trong bảng dưới không đứng vững khi đo lại**: image `postgis/postgis:16-3.6`
> **không tồn tại** (PostGIS 3.6 chỉ có cho PG 17/18/19; PG16 dừng ở `16-3.5`), ước lượng dung
> lượng thấp hơn thực đo ~2 lần, và ở mọi quy mô đã đo thì `cube`+`earthdistance` **có sẵn trong
> Postgres tiêu chuẩn** chạy ngang PostGIS cho đúng bốn truy vấn mà tầng này cần. Phán quyết đang
> có hiệu lực nằm ở **[transport-geospatial.md](transport-geospatial.md)**.

| Hạng mục | Kết luận | Bằng chứng |
|---|---|---|
| Phiên bản | PostGIS **3.6.x** (3.6.3 — 14/04/2026); 3.7.0rc1 — 24/08/2026 chưa GA | postgis.net/news |
| Tương thích | PostGIS 3.6.0 cần PostgreSQL **12–18**; ta đang ở **PG16** ⇒ nằm giữa dải, **không có rủi ro phiên bản** | Release notes 3.6.0 |
| Cài đặt | Đổi image `postgres:16` → **`postgis/postgis:16-3.6`**, giữ nguyên volume dữ liệu. `CREATE EXTENSION postgis` cần **superuser** | docker-postgis, PostgreSQL docs |
| Rủi ro dữ liệu | **Gần bằng không** — chỉ thêm kiểu/hàm/`spatial_ref_sys`; không đụng một bảng nào đang có | PostgreSQL `CREATE EXTENSION` |
| Kiểu cột | **`geography(Point, 4326)`** | Việt Nam **vắt qua hai múi UTM** VN-2000 (EPSG:3405 zone 48N ⟂ EPSG:3406 zone 49N, ranh 108°E). Không có **một** CRS chiếu nào đúng cho cả nước ⇒ `geometry` + chiếu là sai từ gốc |
| Truy vấn geofence | `ST_DWithin(geog, geog, mét)` — đơn vị **luôn là mét** với geography, và nó **dùng chỉ mục**; chính PostGIS khuyến nghị nó thay cho `ST_Distance(...) < r` | postgis.net/docs/ST_DWithin |
| Chỉ mục | **GiST** trên bảng nóng. **SP-GiST không hỗ trợ KNN trên geography** — chọn nó là mất luôn truy vấn "xe nào gần điểm này nhất". BRIN chỉ đúng trên phân vùng lạnh đã sắp xếp vật lý | Crunchy Data, PostgreSQL GiST docs |
| Bẫy | Chỉ mục một phần `WHERE recorded_at > now() - interval '7 days'` **không** là cửa sổ trượt — Postgres đóng băng `now()` lúc build. Đúng cách là **phân vùng theo thời gian** | PostgreSQL semantics |
| Nén tuyến | `ST_Simplify` (Douglas-Peucker) đủ cho **một** LINESTRING chuyến; `ST_SimplifyPreserveTopology` chậm hơn và chỉ cần khi nhiều hình phải khớp nhau | postgis.net/docs |
| Đường nhẹ hơn | `cube` + `earthdistance` (có sẵn trong Postgres, **có** chỉ mục GiST qua `earth_box()`) — nhưng chỉ hình cầu, **không polygon, không LINESTRING**. Haversine tay **không dùng được chỉ mục** ⇒ chỉ đúng cho phép so một cặp điểm, không đúng cho tìm kiếm | PostgreSQL earthdistance docs |

**Phán quyết:** PostGIS là lựa chọn đúng **khi có dữ liệu để lưu**. Hôm nay chưa có một điểm toạ độ
nào, và `F-11` chặn việc lưu. Nên: **không thêm PostGIS trong R1.**

### 3.2. Bản đồ — `MAPS = MapLibre + PMTiles tự dựng`

| Hạng mục | Kết luận |
|---|---|
| Renderer | **MapLibre GL JS 6.7.0**, **BSD-3-Clause**; MapLibre Native BSD-2. Không token, không tài khoản, không hạn mức khi tự phục vụ tile. Đúng nghĩa không khoá nhà cung cấp |
| Tile | **PMTiles tự dựng** (Protomaps; hiện thực BSD-3, **đặc tả CC0**). Một **tệp tĩnh** phục vụ bằng HTTP range request — **không tiến trình tile-server nào phải chạy**. Đây là điểm quyết định cho một VM nhỏ |
| Kích thước | `vietnam-latest.osm.pbf` ≈ **310 MB** *(số lấy từ bản cache của Geofabrik, ba lần fetch trực tiếp đều lỗi — **kiểm lại trước khi mua đĩa**)*. Tile dựng ra **ước tính ~215 MB** (suy từ tỷ lệ Hà Lan 1,3 GB → 910 MB; **là ước tính, hãy dựng rồi đo**) |
| Không dùng | **Tile raster của OpenStreetMap.** Chính sách của OSMF **cấm tải hàng loạt và cache offline**, và ghi rõ dịch vụ thương mại có thể bị chặn bất cứ lúc nào |
| Cẩn trọng | MapTiler/Stadia gói miễn phí **chỉ phi thương mại**; bản tự dựng của MapTiler bị khoá sau đăng ký trả phí |
| Geocoding | Nominatim/Photon tự dựng: **kém** với địa chỉ hẻm/ngõ Việt Nam. Một benchmark (arXiv 2609.01612) đo địa chỉ "lộn xộn" làm geocoder mã nguồn mở mất tới ~25 điểm recall, và bản thương mại hơn tới ~49 điểm. Goong.io là bản Việt hoá tốt nhất — nhưng đưa địa chỉ khách ra bên thứ ba, tức quay lại đúng câu hỏi `F-11` |
| Định tuyến | OSRM (BSD-2) / Valhalla (MIT) / GraphHopper (Apache-2.0) — cả ba đều hợp lý ở quy mô một nước; con số RAM công bố đều là quy mô **hành tinh** và không áp dụng. **Dựng thử nửa ngày rồi đo**, đừng nghiên cứu thêm |

### 3.3. Chống giả mạo trên thiết bị — `ANDROID_INTEGRITY` / `IOS_INTEGRITY`

| Tín hiệu | Nó chứng minh gì | Nó **không** bắt được gì |
|---|---|---|
| `Location.isMock()` (**API 31**, thay `isFromMockProvider()` đã lỗi thời) | Bản định vị đến từ **test provider** đã đăng ký qua `addTestProvider` — tức Developer Options → "Chọn ứng dụng vị trí giả" | Mọi thứ khác. Có **module đang phát hành công khai** ép chính hai hàm này trả `false` và quét sạch cờ ẩn trong `Bundle` (LSPosed: `UnMock GPS`, `Hide Mock Location`, `XposedFakeLocation`). ROM tuỳ biến sửa thẳng `frameworks/base` |
| Play Integrity | Ba trục **tách rời**: `appRecognitionVerdict` (bản này có phải bản Play biết không), `appLicensingVerdict` (người dùng có quyền không), `deviceRecognitionVerdict` (thiết bị có toàn vẹn không) | **Không** đòi niêm yết công khai — app chưa liên kết Play vẫn gọi được bằng `setCloudProjectNumber()`, và **closed testing** (200 danh sách × 2.000 người, không niêm yết, không giới hạn thời gian) là đường phát hành nội bộ chính thức. APK cài tay chỉ làm hai trục ĐẦU thành `UNLICENSED`/`UNRECOGNIZED_VERSION`; trục **thiết bị vẫn dùng được**. Chỉ hỏng hẳn khi máy **không có Play Services** (`PLAY_SERVICES_NOT_FOUND`). Hạn mức mặc định 10.000 lượt/ngày — thừa xa cho một đội xe |
| Key attestation phần cứng (Android) | Khoá thật sự nằm trong phần cứng | Không nói gì về vị trí. Và **không có plugin Flutter/RN nào** phơi ra chuỗi chứng chỉ — phải viết module native |
| App Attest / DeviceCheck (iOS) | Phiên bản ứng dụng là thật, chạy trên thiết bị Apple thật | **Không** phát hiện jailbreak, và **không** phát hiện giả mạo vị trí |
| Giả mạo tầng vô tuyến (SDR) | — | **Không cờ phần mềm nào bắt được, theo thiết kế.** Máy thu GPS báo trung thực một fix tính từ tín hiệu giả. Nguồn bình duyệt: Chan et al., *NAVIGATION* 69(3), 2022 — và chính bài đó khuyên đối chiếu chéo GNSS ⟂ vị trí mạng, và bất thường AGC/C-N0 |

**Phán quyết:** giữ nguyên nguyên tắc #229 §4 — **không bao giờ tuyên bố chống được GPS giả**. Và
`F-07` nói thêm một điều mạnh hơn: tín hiệu đối chiếu chéo tốt nhất **không nằm trên điện thoại lái
xe**, nó nằm ở hộp GSHT hợp quy đã gắn trên xe.

Kèm một cảnh báo vận hành cho bất kỳ app nào sau này: **chính sách Google Play về vị trí nền đang
siết** — công cụ khai báo mở **11/2026**, hạn tuân thủ **27/01/2027**, và văn bản chính sách yêu cầu
truy cập vị trí qua foreground service phải *"user-initiated and temporary"*. Một dịch vụ bám vị trí
suốt ca lái **không** hiển nhiên là "tạm thời"; phải đóng gói theo mẫu "navigation / ride-share
tracking" mà Google có liệt kê, và phải qua duyệt.

### 3.4. Ứng dụng lái xe — `MOBILE_STACK = HOÃN, có điều kiện`

Không chốt bây giờ, vì `F-07` có thể làm cả R3 không cần thiết. Nhưng ghi sẵn kết luận để khỏi
nghiên cứu lại:

- **Nếu** cần app: **React Native + Expo SDK 57 + EAS Build** (không phải Expo Go — vị trí nền,
  camera và SQLite đều không chạy thật trong Expo Go). Lý do quyết định là **cùng ngôn ngữ với
  backend NestJS**: schema `zod` và kiểu DTO dùng chung được, Dart thì không. Và `@expo/app-integrity`
  là gói **duy nhất có nhà cung cấp đứng sau** bọc cả Play Integrity lẫn App Attest — dù còn *alpha*.
- **Chi phí ẩn phải nói ra:** bám vị trí nền **đáng tin** trên Xiaomi/Oppo/Vivo/Samsung — đúng bốn
  hãng phủ thị trường Việt Nam — trên thực tế phải mua SDK đóng của Transistor Software
  (`flutter_background_geolocation` 5.7.0 ⟂ `react-native-background-geolocation` 5.5.0 là **cùng
  một sản phẩm, cùng một hãng**), **399–999 USD/ứng dụng**. Wrapper là Apache-2.0, **nhị phân native
  thì không**, và bản release **cần giấy phép trả tiền**. Đây là rủi ro một-nhà-cung-cấp, và nó
  **không** phụ thuộc việc chọn Flutter hay RN.
- **Đừng dùng WatermelonDB** cho hàng đợi offline: repo **không có commit nào ~13 tháng**
  (`pushed_at` 11/08/2025), 303 issue mở. Dùng `expo-sqlite` (chính chủ) hoặc `op-sqlite`.
- Không framework nào xoá được phần native khó: gỡ lỗi OEM giết tiến trình, key attestation Android,
  và làm cứng camera đều phải có người đọc được Kotlin.

### 3.5. Trích xuất chứng từ — `VISION_OCR = ĐẢO THỨ TỰ`

| Ứng viên | Giấy phép | Chi phí | Dữ liệu rời máy chủ? | Phán quyết |
|---|---|---|---|---|
| **Hoá đơn điện tử** (NĐ 70/2025) | — | ~0 | **Không** | **Đường thứ nhất.** Có cấu trúc, phát tại điểm bán, không suy đoán. Xem `F-10` |
| PaddleOCR **PP-OCRv5** 3.7.0 | **Apache-2.0** | Chỉ hạ tầng; **21–31 ms/ảnh trên CPU** (benchmark của chính hãng) | **Không** | **Đường thứ hai**, tự dựng. Model 16–81 MB. Tiếng Việt `vi` **có** trong gói `latin_PP-OCRv5_mobile_rec`, nhưng **không có số đo riêng cho tiếng Việt** |
| DeepSeek `deepseek-v4-flash-vision-exp` | API độc quyền | Rẻ nhất (~0,35–0,70 USD/1000 ảnh, ước tính) | **Có — lưu và xử lý tại Trung Quốc**, và **dùng để huấn luyện theo mặc định** | **Không dùng cho ảnh thật.** Chính `CLAUDE.md` đã ghi DeepSeek chưa nằm trong danh sách bên thứ ba được duyệt; nghiên cứu này chỉ xác nhận lý do |
| Claude vision | API độc quyền | ~3,5–17 USD/1000 ảnh | Có (Hoa Kỳ) — **ảnh là phù du, không dùng huấn luyện** (FAQ chính thức) | Đường lùi hợp lệ nếu cần VLM đám mây |
| PaddleOCR-VL / olmOCR | — | — | Không | **Loại** — hãng của chính PaddleOCR-VL nói không nên chạy CPU trong production; olmOCR đòi **GPU ≥12 GB VRAM** |

**Không có benchmark công khai nào** đo tiếng Việt trên **giấy in nhiệt nhàu, chụp tay, thiếu sáng**
— trên bất kỳ ứng viên nào. SROIE/CORD/OmniDocBench đều là chứng từ phẳng, sáng, không phải tiếng
Việt. Nên mọi con số độ chính xác trong lộ trình phải được coi là **chưa biết** cho tới khi ta tự đo.

**Bẫy bắt buộc phải xử lý ở tầng tất định:** tiếng Việt dùng **`.` làm dấu nghìn và `,` làm dấu
thập phân**. `"1.150.000đ"` là một triệu một trăm năm mươi nghìn, không phải 1,15. Một `parseFloat`
vô tư đọc sai **ba bậc độ lớn** mà không báo lỗi. Kèm ba phép kiểm rẻ: `số lít × đơn giá ≈ thành
tiền` trong dung sai; **odo phải tăng** theo xe; và **đơn giá phải nằm trong khung giá bán lẻ đã
công bố** của kỳ điều hành — phép kiểm cuối gần như là một nguồn đối chiếu độc lập.

### 3.6. `OFFLINE`

`GD-19` đã ghi sẵn "demo online-only" là một giả định phải đảo. Khi đảo: hàng đợi bền vững trên
SQLite + khoá idempotency do client sinh + **hai mốc thời gian** (`capturedAt` của client ⟂
`receivedAt` của máy chủ, và **máy chủ không bao giờ tin đồng hồ client**). Dung sai lệch đồng hồ hội
tụ quanh **5 phút** ở ba nguồn độc lập (chữ ký webhook Stripe, `leeway` của RFC 7519, và Kerberos
RFC 4120); nhưng với **telemetry** thì lệch lớn thường chỉ là "máy đang offline", nên đúng cách là
**gắn cờ cho người xem**, không tự chặn.

Tải tệp lớn: giao thức **tus 1.0.0**, máy chủ `@tus/server` **2.4.5** (do chính tổ chức tus giữ; gói cũ
`tus-node-server` đã bị đánh dấu lỗi thời). Một cạm bẫy phải biết trước: `tus-js-client` trên React
Native **luôn có `canStoreURLs === false`** vì RN không có Web Storage — tức **nối lại phiên sau khi
app bị kill không tự động**, ứng dụng phải tự lưu URL tải lên. Không có phần nào của việc này cần chạy
trước `Q-02`.

---

## 4. Mô hình mối đe doạ với chứng cứ vận hành

Bảng này là **hợp đồng của sự trung thực**: cột cuối nói cái gì **vẫn phải để người xem**.

| Mối đe doạ | Tín hiệu phát hiện được | Vẫn cần người |
|---|---|---|
| GPS giả bằng app (không root) | `isMock()`; lệch với vị trí mạng | Không — chặn được, ghi cờ |
| GPS giả có root / LSPosed | **Không có** tín hiệu phía client đáng tin | **Có** — chỉ đối chiếu chéo với GSHT (`F-07`) mới nói được |
| Giả mạo tầng vô tuyến (SDR) | Bất thường AGC/C-N0; lệch GNSS ⟂ mạng | **Có** |
| Phát lại ảnh/vị trí cũ | **as-built** (#235, `TransportProofChallenge`): nonce máy chủ dùng **một lần**, hạn `challengeTtlSeconds` = 300 s; `capturedAt` ⟂ `receivedAt` | Một phần — xem §4b |
| Ảnh lấy từ thư viện thay vì chụp tại chỗ | Chụp trong app (không mở picker); EXIF; nonce | **Có** — không tuyệt đối |
| Sửa đồng hồ máy | Máy chủ **chỉ tin `receivedAt`**; lệch quá ngưỡng thì gắn cờ | Không |
| Gửi trùng khi offline | Khoá idempotency client + `correlationKey` unique **đã có sẵn ở miền** | Không |
| Lái xe A đọc/ghi dữ liệu của B | **Đã chặn bằng cấu trúc**: `SELF_SCOPE_ACTIONS`, `Driver.authUserId`, quyền sở hữu phân công | Không |
| App bị sửa / cài tay | `deviceRecognitionVerdict` rỗng khi máy đã root hoặc bị hook. Bộ công cụ cộng đồng (Play Integrity Fix + TrickyStore) **đôi khi** vượt được, nhưng mong manh và phải cập nhật liên tục | **Có** — coi đây là một điểm trong thang rủi ro, không phải cổng chặn nhị phân |
| Mất mạng | Hàng đợi offline + huy hiệu trạng thái | Không |
| Máy mất / dùng chung | Ràng buộc thiết bị ⟂ phiên | **Có** |
| Rút chứng từ sau khi kế toán đã khoá | **Đã có** ở `main` từ 07/09/2026 (migration `transport_fuel_inbox_evidence_withdrawal`) | Không |

Ba dòng "**Có**" đầu bảng là lý do câu *"không bao giờ tuyên bố chống được GPS giả"* phải nằm trong
hợp đồng, không phải trong ghi chú.

### 4b. Lời thách thức máy chủ: ranh giới của nó, viết ra trước khi ai đó tin quá mức

`POST /transport/me/proofs/challenge` phát một `nonce` 32 byte, **dùng một lần**, sống 300 giây.
Chứng cứ đính kèm nó được ghi `challengeVerified = true`.

**Nó chứng minh:** lần **gửi** chứng cứ xảy ra trong 300 giây kể từ một lần khứ hồi mà **máy chủ
quan sát được**. Một chứng cứ lập sẵn từ hôm qua không mang được một `nonce` còn hạn, vì `nonce` đó
chưa tồn tại vào lúc đó.

**Nó KHÔNG chứng minh:** rằng tấm ảnh hay bản định vị được **chụp** đúng lúc đó. Một máy khách có
thể xin một `nonce` rồi đính kèm một tấm ảnh cũ. Kết hợp với `observationId` (phải thuộc phiên của
chính lái xe, mang `receivedAt` của máy chủ) thì khoảng có thể nói dối bị **thu hẹp** — không **bị
đóng**.

**Đường ngoại tuyến cố ý không có nó.** Xin một `nonce` đòi một lần khứ hồi, mà một lái xe trong
vùng lõm thì không có. Bắt buộc sẽ làm mất bằng chứng ở đúng đoạn đường bằng chứng có giá trị nhất.
Chứng cứ không kèm `nonce` **vẫn được ghi**, với `challengeVerified = false`, và khung nhìn vận hành
bày ra sự khác biệt — cùng khuôn với ảnh chụp trong ứng dụng ⟂ ảnh lấy từ thư viện.

Bốn cửa từ chối, mỗi cửa một mã: `CHALLENGE_NOT_FOUND` · `CHALLENGE_EXPIRED` ·
`CHALLENGE_ALREADY_USED` · `CHALLENGE_NOT_OWNED`. Gộp thành một `boolean` sẽ làm người trực không
phân biệt được *"máy khách gửi một chuỗi bịa"* với *"lái xe bấm chậm quá năm phút"* với *"một bản
ghi bị phát lại"*.

---

## 5. Khối lượng dữ liệu và lưu giữ

Giả định ghi rõ, số học ghi ra — **đây là ước tính cấu trúc, không phải đo thật**.

Một hàng điểm định vị `geography(Point,4326)`: 25 byte payload EWKB + 1 byte varlena ≈ **26 byte**
cho riêng cột. Cả hàng (id, vehicleId, điểm, thời điểm, tốc độ, hướng) ≈ **90–110 byte** sau căn
lề, **chưa kể chỉ mục GiST** (cỡ tương đương — phải đo, không có hệ số quy đổi tin cậy).

| Chế độ | 10 xe | 50 xe | 100 xe |
|---|---|---|---|
| **Chỉ theo sự kiện** (bắt đầu · đổ dầu · giao hàng ≈ 6 điểm/xe/ngày) | ~6 KB/ngày | ~30 KB/ngày | ~60 KB/ngày |
| 30 giây/lần, chạy 10 h/ngày | ~1,3 MB/ngày | ~6,5 MB/ngày | ~13 MB/ngày |
| 10 giây/lần, chạy 10 h/ngày | ~3,9 MB/ngày | ~19,4 MB/ngày | ~39 MB/ngày |

Một năm ở mức 30 giây × 50 xe ≈ **2,4 GB** dữ liệu bảng, cộng chỉ mục. Không lớn về đĩa — nhưng
`F-11` nói rằng câu hỏi không phải đĩa, mà là **cơ sở pháp lý**.

`LINESTRING(N)` ≈ `13 + 16N` byte: N=1.000 ≈ 16 KB (**vượt ngưỡng TOAST ~2 KB**, bị đẩy ra ngoài
dòng); N=100 sau `ST_Simplify` ≈ 1,6 KB (**nằm trong dòng**). Tức là rút gọn tuyến không chỉ để vẽ
bản đồ — nó là ranh giới giữa một lần đọc và một lần TOAST cho mọi truy vấn lịch sử.

**Khuyến nghị cho R2:** bắt đầu ở **chỉ theo sự kiện**. Nó là mức tối thiểu hoá dữ liệu đúng theo
`F-11`, rẻ gần như bằng không, và đủ để làm mọi thứ #229 §2 mô tả.

Ảnh chứng cứ: `GD-20` hiện giữ **vô thời hạn, không job dọn**. Khi #223 xong thì vòng đời tệp là
việc của File Platform, không phải của miền vận tải.

**Xung đột lưu giữ phải giải trước khi go-live:** luật vận tải buộc dữ liệu GSHT lưu **≥1 năm** ở
máy chủ nhà cung cấp, trong khi Luật BVDLCN mặc định **xoá dữ liệu người lao động khi chấm dứt hợp
đồng**. Hai nghĩa vụ này phải được hoà giải bằng văn bản, không bằng suy luận của đội kỹ thuật.

---

## 6. Bản đồ phụ thuộc với #222 · #223 · #224

| Issue | Sở hữu | Vùng tệp đang nóng | Giao với v2 |
|---|---|---|---|
| **#222** hotfix UAT | Hành vi UX vận tải đang chạy | `apps/web/experiences/transport-operations/**`, controller chứng cứ, đường đọc phiếu dầu, `TransportFuelReceiptEvidence` | **Cao.** Đã có `20260907090000_transport_fuel_inbox_evidence_withdrawal` trên `main` hôm nay ⇒ nhánh vẫn nóng. **Tranche đầu của v2 không được chạm `transport/fuel` hay bất kỳ tệp web nào** |
| **#223** File Platform | Vòng đời tệp, ACL, audit, retention | `apps/api/src/media/**`, và sẽ định nghĩa `fileId` thật | **Trung bình, một chiều.** `TransportFuelReceiptEvidence.locator` và `TransportTripExpense.evidenceLocator` sẽ **migrate** sang khi #223 xong. v2 **không** được dựng kho tệp thứ hai — mọi ảnh chứng cứ vị trí của R2 đi qua File Platform |
| **#224** tính di động / chi phí | Triển khai không cần `gcloud`, backup offsite | `deploy/**`, sizing VM | **Trung bình.** Hai quyết định của v2 chạm trực tiếp: (a) đổi sang image `postgis/postgis` làm image DB nặng thêm và phải vào ma trận sizing của #224; (b) **PMTiles tự dựng thêm ~200–300 MB đĩa** nhưng **không thêm một tiến trình nào** — đó là lý do nó thắng tile-server |
| **#230** (task này) | Ngữ nghĩa miền v2, chứng cứ, vị trí, nhiên liệu, quyết toán lái xe | — | — |

**Luật va chạm cho tranche đầu:** chỉ được thêm **thư mục mới** dưới `apps/api/src/transport/`, cộng
một **khối mới** trong `schema.prisma` và một migration mới. Không sửa tệp web, không sửa
`packages/tenant`, không sửa `apps/api/src/media/**`, không sửa `deploy/**`.

---

## 7. Câu hỏi nghiệp vụ chưa có lời — cần chủ sở hữu / B trả lời

Sắp theo **cái gì bị chặn**, không theo chủ đề.

| Mã | Câu hỏi | Chặn cái gì | Vì sao không tự quyết được |
|---|---|---|---|
| ~~`Q-01`~~ **ĐÃ TRẢ LỜI 07/09/2026 — #232 `D-01`** | Một chuyến hàng và một **vòng chạy của xe** có phải hai thứ khác nhau trong cách B làm việc không? Cụ thể: (a) B có tính km rỗng/chiều về không, và tính để làm gì; (b) một chuyến có bao giờ gồm **nhiều đơn hàng của nhiều khách** không; (c) chiều về có khi nào là đơn của **đối tác C** không | **Order/Run/Leg (R1-A gốc), R8 analytics** | ~~`F-04`~~ **Chủ sở hữu đã cấp sự kiện nguồn** trong #232 §1 `D-01`: hai trục **độc lập**, `RunLeg` thuộc `VehicleRun`, và Run **không** là cha/con của `TransportTrip`. Đã hiện thực — xem §12 |
| `Q-02` | Xe của B đang dùng **hộp GSHT của hãng nào**, B có tài khoản dashboard không, và hãng đó có cho **xuất dữ liệu/API** không | **Toàn bộ R2 + R3** | `F-07`: nếu lấy được, R3 (app chống giả GPS) gần như không cần |
| `Q-03` | Đã có **văn bản** về xử lý dữ liệu cá nhân của lái xe (vị trí, ảnh, GPLX, lương) chưa | **R2, R3** — điều kiện chặn cứng | `F-11` + T0 §14 `MISSING` |
| `Q-04` | Kế toán có được **duyệt một phần** một khoản chi lái xe đề nghị không? Nếu có, số bị cắt đi về đâu | **ExpenseClaim (§9 lộ trình)** | `F-06`; `C-02` của T0 vẫn chưa gỡ. **#232 `D-06` đã gỡ phần chặn**: duyệt TRỌN KHOẢN (`approvedAmount = claimedAmount`) được làm trước, duyệt MỘT PHẦN vẫn chờ `Q-04` |
| `Q-05` | Cái gì **thật sự cấm** điều một xe đi (lệnh sửa đang mở? giấy tờ hết hạn?) và cái gì chỉ **cảnh báo** | **Bảo dưỡng v2 (R6)**, và cách sửa `F-09` | Thêm một cổng chặn sai là làm cả đội xe đứng bánh |
| `Q-06` | B trả lương lái xe **thật sự** theo chu kỳ nào, và có đang chậm không | **R5** | `F-08`: dồn nhiều tháng vướng Đ.97 BLLĐ 2019. Cần biết thực tế trước khi mô hình hoá |
| `Q-07` | B nạp và quyết toán **ETC** thế nào; tài khoản VETC/ePass đứng tên ai, đối soát bằng gì | **R7** — phần *hạch toán* | **Đã đo, xem [transport-etc-toll.md](transport-etc-toll.md).** Không nhà cung cấp nào có API công khai (đo 08/09/2026); phí quản lý tài khoản đã **công bố 01/08/2026 rồi tạm dừng ~20/08/2026** theo đề nghị của Cục Đường bộ. Câu **còn treo**: tài khoản đứng tên công ty hay cá nhân |
| `Q-08` | B mua dầu qua **hợp đồng cây xăng** hay **thẻ/app** (PVOIL Easy, Flexicard)? Hoá đơn điện tử đang gửi về đâu | **R4** | `F-10`: quyết định adapter đầu tiên là email hoá đơn hay bảng kê |
| `Q-09` | Ảnh giao hàng có **bắt buộc** không, và có được phép có mặt người nhận trong ảnh không | **R2** | Chạm dữ liệu sinh trắc của **người thứ ba**, không phải nhân viên |

Không câu nào trong số này chặn tranche đầu ở §10.

> **Cập nhật 07/09/2026.** `Q-01` đã có lời — không phải do khảo sát thêm, mà do **chủ sở hữu
> cấp một quyết định** trong #232 §1 `D-01`. Phán quyết `AMEND — hoãn` của `F-04` đúng **tại
> thời điểm R0**: lúc đó chưa ai nêu chiều rỗng, và luật R0 tự đặt ra (*"không được khẳng định
> sự thật của khách khi chủ sở hữu chưa cấp"*) áp cho chính nó. Nay sự thật đã được cấp thành
> văn, nên điều kiện hoãn không còn. `F-04` **không bị xoá** — nó ghi lại vì sao tranche này
> không được làm sớm hơn.

---

## 8. Chiến lược di trú — chỉ cộng thêm

Bốn luật, áp cho mọi tranche v2:

1. **Không đổi tên, không dời khoá ngoại.** `TransportTrip` là gốc của 8 quan hệ đang có dữ liệu
   thật trên `transport-preview/gd1-test`, gồm chuyến UAT `UAT-VIET-01` mà #222 yêu cầu giữ.
2. **Bảng mới, cột nullable, backfill tất định.** Mỗi migration phải chạy được trên cơ sở dữ liệu
   đang có mà không khoá bảng lâu và không mất một hàng nào.
3. **Ràng buộc `CHECK`/`EXCLUDE` viết trong SQL thô** và có spec đọc thẳng tệp migration để đo — đây
   là quy ước đã có từ T2.1/T3/T4, và `prisma migrate dev` **sẽ sinh lệnh xoá chúng** nếu ai chạy nó
   rồi commit thẳng.
4. **Lịch sử tài chính không bao giờ bị ghi đè.** Sửa bằng `REVERSAL`/chứng từ điều chỉnh/phiếu bổ
   sung — ba đường đã có, không thêm đường thứ tư.

---

## 9. Trình tự tranche được sửa lại

| Tranche | #229 gọi là | Phán quyết R0 |
|---|---|---|
| **R1-A′** | *(mới)* | **Xương sống danh tính đối tác** — cộng thêm, không chạm vùng nóng. **Làm ngay** |
| R1-B | R1 "fuel disconnected from Driver Fund" | Chờ #222 hạ cánh (`F-01` + §6 va chạm). Nhỏ, một chính sách gói khách |
| R1-C | R1 "Order/Run/Leg" | **Chặn ở `Q-01`** |
| R1-D | R1 "ExpenseClaim" | **Chặn ở `Q-04`** |
| R2 | Proof + geospatial | **Chặn ở `Q-03`** (pháp lý), định hình lại theo `Q-02` |
| R3 | App lái xe | **Hạ ưu tiên** — chỉ đúng nếu `Q-02` trả lời "không lấy được dữ liệu GSHT" |
| R4 | Fuel intelligence | Đảo thứ tự: **hoá đơn điện tử trước, OCR sau** (`F-10`). Chờ `Q-08` |
| R5 | Driver settlement + payroll | **XONG** — `TX-07b`, xem §14. `Q-06` đã được chủ sở hữu trả lời ở #237 |
| R6 | Maintenance v2 | **PARTIAL** — nguyên hàm xong (§15); cổng chặn điều chuyến vẫn chờ `Q-05`, và `blocking` cố ý RỖNG |
| R7 | ETC | **XONG phần nghiên cứu + hợp đồng cổng** — [transport-etc-toll.md](transport-etc-toll.md) + `TollProviderPort`. Hạch toán vẫn chờ `Q-07` |
| R8 | Analytics | **PARTIAL** — chỉ số vận hành đối soát được đã xong (§16); các mặt còn lại (L/100km, phương sai trạm, AR/AP hợp nhất) **chưa** — xem §16.3 |
| R9 | Hệ sinh thái | Phụ thuộc R1-C |

---

## 10. Tranche đầu tiên — `R1-A′` xương sống danh tính đối tác

### 10.1. Vì sao là cái này

Bốn phép thử của #230 (*nhỏ nhất · an toàn · độ tin cậy cao · mở đường cho sau*):

- **An toàn:** chỉ thêm hai bảng và một thư mục mới. Không sửa một tệp web nào ⇒ **không va #222**.
  Không thêm capability ⇒ không sửa `packages/tenant` (`F-12`) ⇒ **không va #223/#224**.
- **Độ tin cậy cao:** khoảng trống là **đo được**, không phải suy đoán — một tổ chức vừa thuê xe vừa
  chạy hộ hôm nay phải tồn tại hai hàng ở hai bảng, và không có gì nối chúng lại.
- **Mở đường:** đây đúng là mảnh danh tính mà #229 §14 (cổng/API cho A và C) sẽ cần, và nó cũng là
  thứ báo cáo công nợ cần để trả lời *"tổng cộng ta đang đứng ở đâu với công ty X"*.
- **Không khoá một luật tiền nào.** Không đụng sổ quỹ, không đụng công nợ, không đụng lương.

### 10.2. Hình dạng

```text
TransportCounterparty                 ← DANH TÍNH: một pháp nhân trong đời thật
  id · name · taxCode? (unique) · status · note

TransportCounterpartyLink             ← LIÊN KẾT tới hàng chuyên môn đã có
  (kind, subjectId) là KHOÁ CHÍNH     ← một hàng chuyên môn thuộc TỐI ĐA một pháp nhân
  kind ∈ { CUSTOMER, PARTNER }
  subjectId → TransportCustomer.id | TransportPartner.id
```

**Hai loại, không phải ba.** Nhu cầu **có nguồn** là A và C — một tổ chức vừa thuê vận chuyển vừa
chạy hộ/mang đơn về. Cây xăng (`TransportFuelSupplier`) *không* được thêm vào khi chưa ai cần: T1
§9.1 xếp nhiên liệu là một **nguồn riêng**, không phải một vai đối tác. Thêm sau là một
`ALTER TYPE … ADD VALUE`, tức cộng thêm và rẻ.

`subjectId` **cố ý không phải khoá ngoại**: nó trỏ tới hai bảng khác nhau tuỳ `kind`, và Postgres
không có khoá ngoại đa đích. Tính hợp lệ được kiểm ở tầng miền qua một cổng
(`CounterpartySubjectPort`) mà tầng lắp ráp hiện thực bằng đúng những kho **đang bật** — nên một
loại chủ thể chưa có adapter bị từ chối **có tên** (`SUBJECT_KIND_UNAVAILABLE`), chứ không im lặng.
Cổng tồn tại chính vì loại thứ ba sẽ tới: khi nó tới, capability sở hữu nó đăng ký adapter của
riêng nó, và `transport-core` không phải import một kho mà khách chưa bật.

**Không** cột `roles` trên `TransportCounterparty`: vai đã ở `TransportPartnerRole`, và nhân đôi nó
là tạo ra hai nguồn sự thật cho cùng một câu hỏi.

### 10.3. Hạt giống nghiệm thu

- `CP-001` — một pháp nhân có **hai** liên kết (`CUSTOMER` + `PARTNER`) đọc ra **một** danh tính.
- `CP-002` — liên kết một hàng chuyên môn **đã thuộc** pháp nhân khác bị từ chối với lý do có tên
  (`SUBJECT_ALREADY_LINKED`), không ghi đè.
- `CP-003` — liên kết tới một `subjectId` **không tồn tại** bị từ chối (`SUBJECT_NOT_FOUND`).
- `CP-004` — liên kết một loại chủ thể **chưa có adapter** bị từ chối (`SUBJECT_KIND_UNAVAILABLE`),
  và cổng **không hỏi kho** — vì hỏi ở đó sẽ trả về `SUBJECT_NOT_FOUND` cho một `subjectId` hoàn
  toàn đúng.
- `CP-005` — dữ liệu vận tải **hiện có** (khách, đối tác, cây xăng, chuyến, công nợ) đọc và ghi
  **y như trước** khi chưa có một `TransportCounterparty` nào. Không đường nào của v1 phụ thuộc
  bảng mới.


---

## 11. `R1-A′` as-built — đo trên nhánh `claude/issue-230-transport-v2-r0`

Đây là mục **ghi cái đã chạy**, theo đúng quy ước T1 §18: mọi thứ ở §10 là thiết kế, mục này là
kết quả.

| Thứ | Ở đâu |
|---|---|
| Hai bảng + enum | `apps/api/prisma/schema.prisma` (khối cuối) |
| Migration | `apps/api/prisma/migrations/20260907140000_transport_counterparty/` — kèm `README-rollback.sql` |
| Hai `CHECK` | `TransportCounterparty_name_not_blank`, `TransportCounterparty_taxCode_shape` (SQL thô — Prisma không có cú pháp) |
| Miền | `apps/api/src/transport/counterparty/` — 10 tệp, không tệp nào ngoài thư mục này là mới |
| Hành động | `transport.counterparty.read` · `transport.counterparty.manage` |
| Đăng ký | `owned('transport-core', CounterpartyController)` — **không** capability mới |
| Nghiệm thu | 17 bài, `counterparty.service.spec.ts` (`CP-001`…`CP-005`) · `transport-counterparty-storage.spec.ts` · `counterparty.composition.spec.ts` |

**Tệp có sẵn bị sửa — đúng sáu, và mỗi cái một dòng lý do:**

- `schema.prisma` — thêm một khối ở **cuối tệp** (dễ gộp nhánh nhất);
- `transport-actions.ts` + `transport-actions.spec.ts` — hai mã hành động, và danh sách khoá cứng
  trong spec là **cố ý**: thêm một quyền phải là một lần sửa có ý thức;
- `transport.errors.ts` — gộp hai union lý do mới vào kiểu chung;
- `transport.module.ts` — hai provider + một cổng;
- `app-composition.ts` — một dòng đăng ký controller;
- `apps/web/experiences/transport-operations/transport-actions.ts` — **bản gương** của bảng phân
  quyền. Web giữ một bản sao, và `__tests__/transport-actions.spec.ts` **đọc thẳng tệp nguồn của
  API** rồi bắt khớp từng mã đúng thứ tự. Nên thêm một hành động ở API mà không sửa bản gương là
  **không push được** — đúng như cổng đó được dựng ra để làm.

**Ngoại lệ duy nhất với ranh giới #222** là tệp gương ngay trên: nó là một **danh sách hằng số**,
không phải giao diện, nên không thể va về mặt ngữ nghĩa với các lỗi UX mà #222 đang sửa (biểu mẫu
phân công, hộp thư dầu, gỡ chứng từ, đăng xuất). Ngoài nó ra, **không** tệp nào dưới `apps/web/**`,
`packages/tenant/**`, `apps/api/src/media/**` hay `deploy/**` bị chạm.


---

## 12. `R1-B` as-built — Order / Run / Leg, đo trên nhánh `claude/tv2-lane-a-order-run-leg`

Mục này ghi **cái đã chạy**, theo đúng quy ước T1 §18. Chỉ đạo: #234 A1 (LANE A), quyết định
#232 §1 `D-01`. Đây là tranche **đảo lại phán quyết hoãn** của `F-04` — xem ghi chú ở §7.

### 12.1. Hình dạng đã dựng

```text
TransportOrder            ← NGHĨA VỤ THƯƠNG MẠI (ai thuê, chở gì, bao nhiêu tiền)
TransportVehicleRun       ← VÒNG CHẠY VẬT LÝ của MỘT xe
 ├─ TransportRunLeg       ← từng chặng: LOADED (có thể trỏ Order) | EMPTY (không được trỏ)
 └─ TransportRunAssignment← lịch sử cầm lái, một bản hiệu lực/vòng chạy

TransportTripRunLegLink   ← BẢNG TƯƠNG ỨNG chuyến v1 ↔ chặng v2 (KHÔNG phải cha/con)
```

Hai trục **độc lập**: một đơn tồn tại và đọc được khi chưa có vòng chạy nào (`MV-005`).

### 12.2. Vì sao tương thích v1 đi qua một bảng tương ứng

`D-01` cấm biến Run thành cha hoặc con trực tiếp của `TransportTrip`. Nên **không** có cột `runId`
trên `TransportTrip` và **không** có cột `tripId` trên `TransportVehicleRun`. Cái nối hai thế giới
là `TransportTripRunLegLink` — cùng khuôn với `TransportCounterpartyLink` của `R1-A′`:

- `tripId` là **khoá chính**, `legId` là **UNIQUE** ⇒ quan hệ MỘT-MỘT hai chiều;
- chính cặp ràng buộc đó làm phép chiếu **tất định và lặp lại được**: chạy lại `projectTrip()`
  không thể sinh bản thứ hai (`MV-IT-05` đo trên Postgres thật);
- bỏ cả bảng đi thì **cả hai trục vẫn chạy nguyên vẹn** — đó là định nghĩa của "cộng thêm".

Phép chiếu **từ chối có tên** hai trường hợp thay vì bịa ra dữ liệu: chuyến thuê xe ngoài
(`PROJECTION_TRIP_OUTSOURCED` — xe không phải của mình, chiếu ra sẽ thổi phồng km đội xe) và chuyến
chưa phân công xe (`PROJECTION_TRIP_HAS_NO_VEHICLE`).

### 12.3. Bất biến ở tầng lưu trữ

| Ràng buộc (SQL thô) | Nó chặn gì |
|---|---|
| `TransportRunLeg_empty_carries_no_order` | Chặng chạy rỗng mang nghĩa vụ thương mại. **Bất biến trung tâm**: nếu nó chỉ sống ở tầng miền thì một lần ghi thẳng DB làm mọi con số km rỗng sau đó sai mà không ai biết |
| `TransportRunAssignment_activeRun_key` | Bản phân công thứ hai **đang** hiệu lực (unique một phần, `WHERE effectiveTo IS NULL`) |
| `TransportRunLeg_sequence_positive` | Chặng số 0 hoặc số âm |
| `TransportRunLeg_distance_non_negative` | Km âm. `NULL` **vẫn được phép** và có nghĩa riêng: *chưa biết*, không phải 0 |
| `TransportOrder_freightAmount_money_range` | Số ngoài khoảng `money()` — cột là `BIGINT` nên DB nhận được số lớn hơn `Number.MAX_SAFE_INTEGER` |
| `TransportOrder_code_not_blank` · `TransportVehicleRun_code_not_blank` | Mã rỗng chiếm mất chỗ UNIQUE của bản ghi thật |

### 12.4. Km rỗng **không được đoán**

`summariseRunDistance()` là hàm thuần, và nó từ chối đưa ra con số khi dữ liệu khuyết:

- `distanceKm = NULL` **không** được coi là 0 — coi là 0 sẽ làm tỷ lệ rỗng nhỏ đi một cách có hệ
  thống, tức sai theo hướng **làm đẹp số liệu**, kiểu sai không ai đi kiểm tra;
- còn một chặng thiếu km ⇒ `complete = false` và `emptyRatio = null`, kèm `legsMissingDistance`
  tách theo loại để người vận hành biết đi nhập chỗ nào (`MV-007`);
- chặng **đã huỷ** không được đếm: xe không chạy nó.

### 12.5. As-built

| Thứ | Ở đâu |
|---|---|
| Bốn enum + năm bảng | `apps/api/prisma/schema.prisma` (khối cuối) |
| Migration | `apps/api/prisma/migrations/20260907190000_transport_movement/` — kèm `README-rollback.sql` |
| Sáu `CHECK` + một unique một phần | SQL thô trong migration; `transport-movement-storage.spec.ts` đọc thẳng tệp và đo |
| Miền | `apps/api/src/transport/movement/` — 11 tệp nguồn |
| Hành động | `transport.order.read` · `transport.order.manage` · `transport.run.read` · `transport.run.manage` |
| Đăng ký | `owned('transport-core', …)` — **không** capability mới, nên không chạm `packages/tenant` (`F-12`) |
| Nghiệm thu | 36 bài: 12 `movement.service.spec.ts` (`MV-001`…`MV-012`) · **7 trên Postgres thật** `transport-movement.int.spec.ts` (`MV-IT-01`…`MV-IT-07`) · 14 storage · 3 composition |

**Tệp có sẵn bị sửa — đúng bảy, mỗi cái một dòng lý do:**

- `schema.prisma` — khối mới ở **cuối tệp**, cộng **bốn dòng quan hệ ngược** trên `TransportVehicle`,
  `TransportDriver`, `TransportCustomer`, `TransportTrip` (Prisma bắt buộc khai hai chiều; không cột
  dữ liệu nào của bốn bảng đó đổi);
- `transport-actions.ts` + `transport-actions.spec.ts` — bốn mã hành động, và danh sách khoá cứng
  trong spec là **cố ý**;
- `transport.errors.ts` — gộp hai union lý do mới vào kiểu chung;
- `transport.module.ts` — một provider kho + một service;
- `app-composition.ts` — hai dòng đăng ký controller;
- `apps/web/experiences/transport-operations/transport-actions.ts` — **bản gương** của bảng phân
  quyền, giữ đúng thứ tự với bản API (spec của web đọc thẳng tệp nguồn API và bắt khớp);
- `observability/source-manifest.generated.ts` — **sinh lại** bằng `pnpm gen:source-manifest`,
  không sửa tay.

**`TransportTrip` không đổi một cột nào.** Migration không có một `ALTER TABLE "TransportTrip"` nào;
chiều khoá ngoại chỉ đi **một hướng**: bảng mới → bảng cũ. `MV-IT-05` đọc lại chuyến sau khi chiếu
và đối chiếu từng trường để khoá tính chất này bằng một bài đo, không bằng một câu trong tài liệu.

### 12.6. `#379` as-built — toạ độ điểm lấy / điểm giao của `TransportOrder`

Từ `#379`, **toạ độ là sự thật** về vị trí của một đơn; `originLabel` / `destinationLabel` chỉ còn
để hiển thị. Trước đó điều xe phải *đoán* điểm lấy hàng bằng cách so nhãn chữ với tên hàng rào.

| Thứ | Hình dạng |
|---|---|
| Cột | `originLatitude` · `originLongitude` · `destinationLatitude` · `destinationLongitude` — `DOUBLE PRECISION`, **NULL-được, không `DEFAULT`**, cùng kiểu với `TransportGeofence` (giữ đường thêm cột `geography` sinh sau này, §3.1) |
| Miền | `Order.originPoint` / `Order.destinationPoint: GeoPoint \| null` (`movement.types.ts`); hai cột thiếu một ⇒ cả điểm là `null` |
| Biên HTTP | `POST /transport/orders` **bắt buộc** `originPoint` + `destinationPoint` `{ latitude, longitude }` (`.strict()`, không chặn khoảng ở zod). `PATCH` **không** sửa toạ độ. Mọi `GET`/`POST`/`PATCH` trả `Order` kèm hai trường (`null` với đơn cũ) |
| Ngưỡng duy nhất | `parseGeoPoint` (`geo/geo-point.ts`). Từ chối ⇒ `400` `ORDER_ORIGIN_POINT_INVALID` / `ORDER_DESTINATION_POINT_INVALID`, không ghi hàng nào |
| Quyết định | điểm `order.location` (`movement-decisions.ts`): `ORDER_LOCATION_CAPTURED` · `ORDER_LOCATION_ABSENT` · `ORDER_ORIGIN_POINT_REJECTED` · `ORDER_DESTINATION_POINT_REJECTED`. `detail` **không** mang toạ độ — chỉ mã từ chối, cờ có/không có điểm và cờ "ngoài vùng hoạt động" (gắn cờ, không từ chối) |
| Đơn không có toạ độ | Đơn cũ trước `#379`, đơn chiếu từ chuyến v1 (`planOrderProjection` ghi `null` **tường minh**), đơn seed mẫu. **Không backfill, không geocode nhãn cũ** — một toạ độ đoán sai còn tệ hơn không có, vì điều xe sẽ tin nó |

Ràng buộc SQL thô — migration `20260923140000_transport_order_location_points/` (kèm
`README-rollback.sql`); mọi hàng cũ có bốn cột `NULL` nên thoả ngay, không cần bước vá dữ liệu:

| Ràng buộc | Nó chặn gì |
|---|---|
| `TransportOrder_origin_point_paired` · `TransportOrder_destination_point_paired` | Nửa cặp toạ độ (có vĩ độ, mất kinh độ) — không phải một điểm trên mặt đất |
| `TransportOrder_origin_latitude_range` · `_origin_longitude_range` · `_destination_latitude_range` · `_destination_longitude_range` | Ngoài `[-90, 90]` / `[-180, 180]` — cùng khoảng với `parseGeoPoint` |
| `TransportOrder_origin_not_null_island` · `TransportOrder_destination_not_null_island` | `(0, 0)` — dấu hiệu định vị **chưa có**. Biểu thức `abs(lat) >= 1e-9 OR abs(lng) >= 1e-9` là phủ định **đúng chữ** của `parseGeoPoint` (từ chối khi cả hai `< 1e-9`), kể cả dấu `>=`: điểm `(1e-9, 0)` được cả hai tầng nhận, `(0, 0)` bị cả hai từ chối |

Nghiệm thu: `transport-order-location-storage.spec.ts` (đọc thẳng migration: tên + thân từng
`CHECK`, chỉ `ADD COLUMN`/`ADD CONSTRAINT`, không `DROP`/`DEFAULT`/backfill, có đường lui) ·
`movement.schemas.spec.ts` · `order-location.spec.ts` · `trip-order-projection.spec.ts` (khoá
`null` tường minh) · `transport-movement.int.spec.ts` `MV-IT-379-01`…`04` trên Postgres thật (toạ độ
khứ hồi không mất chữ số; hàng cũ đọc ra `null`; từng `CHECK` từ chối lần ghi thẳng theo **tên**;
`MV-IT-379-05` khoá biên null island `(1e-9, 0)` nhận / `(0, 0)` từ chối ở cả tầng miền lẫn DB).

---

## 13. `R1-C` as-built — ExpenseClaim + cổng duyệt, đo trên nhánh `claude/tv2-lane-a-expense-claim`

Chỉ đạo: #234 A2, quyết định #232 §1 `D-06`. Đây là tranche **gỡ một nửa** phán quyết hoãn của
`F-06`: chủ sở hữu đã cấp luật cho duyệt **trọn khoản**; duyệt **một phần** vẫn treo ở `Q-04`.

### 13.1. Câu duy nhất tranche này giữ

> **Chỉ khoản ĐÃ DUYỆT mới chạm vào giá thành và sổ quỹ.**

Nên `ExpenseClaimService` **không tự ghi một bút toán nào**. Lúc duyệt nó gọi
`CostingService.recordTripExpense()` — đúng cái cửa duy nhất mà T3 mở cho tiền đi vào (`INV-03`:
hai chân của một sự kiện kinh tế ghi trong MỘT giao dịch). Một đường ghi thứ hai ở đây sẽ tạo một
sổ cái song song, và hai số sẽ lệch nhau mà không có gì báo.

`correlationKey = claim:<id>` làm việc ghi sổ **tất định**: bấm duyệt hai lần không thể trừ tiền hai
lần (`EC-IT-05` đo điều đó trên Postgres thật).

### 13.2. Thứ tự các bước lúc duyệt là một phần hợp đồng

Ghi sổ chạy **trước** khi ghi quyết định. Nếu T3 từ chối — kỳ quỹ đóng băng, chuyến đã đối soát,
lái xe không còn phân công — thì **không có gì được ghi**, và người duyệt nhận đúng mã lý do của T3.
Đảo thứ tự sẽ đẻ ra một đề nghị mang nhãn *đã duyệt* trong khi tiền chưa bao giờ vào sổ.

### 13.3. Hai con số, ngay cả khi hôm nay chúng bằng nhau

`claimedAmount` là số lái xe đề nghị; `approvedAmount` là số kế toán duyệt. Hôm nay `D-06` chỉ cho
duyệt trọn khoản nên hai số luôn bằng nhau — nhưng **cả hai có cột ngay từ đầu**, và `CHECK` đòi
`approvedAmount <= claimedAmount` chứ **không** đòi bằng nhau.

Nhờ vậy khi `Q-04` có lời, duyệt một phần là **một lần nới lỏng ở tầng miền** — không phải một lần
đổi kiểu dữ liệu, và không phải một lần viết lại lịch sử của những đề nghị đã duyệt.

### 13.4. Người duyệt không được là người đề nghị

`CLAIM_REVIEWER_IS_SUBMITTER` — cùng lý lẽ đã ghi cho `transport.payslip.approve`: một người tự
duyệt khoản của chính mình là đúng cái mà kiểm soát nội bộ sinh ra để chặn. Bề mặt lái xe
(`/transport/me/expense-claims`) **không có đường duyệt nào**, và danh tính ở đó đến từ **phiên**
chứ không từ thân yêu cầu.

### 13.5. Nhiên liệu và ETC không đi đường này

`D-05` (dầu ở cây xăng có hợp đồng là công nợ công ty, không dùng vào quỹ lái xe — đường đó đã chạy
từ T4) và `D-07` (ETC là tiền công ty trả, quy trình quyết toán thật của khách **chưa ai biết**).

Chặn ở **hai chỗ**: tầng miền trả mã `CLAIM_CATEGORY_ROUTED_ELSEWHERE` (đọc được), và `CHECK`
`TransportExpenseClaim_category_not_reserved` là lưới cuối cho mọi đường ghi khác — `EC-IT-04` chứng
minh bằng cách ghi thẳng qua Prisma với `' fuel '`.

### 13.6. Duyệt mà chưa vào sổ được thì phải nói ra

Đường tiền của T3 đi qua một **chuyến**. Một đề nghị chỉ gắn vào vòng chạy/chặng vẫn duyệt được,
nhưng `settlementExpenseId` ở lại `null` và quyết định mang mã
`CLAIM_SETTLEMENT_DEFERRED_NO_TRIP`. Im lặng ở chỗ này là cách một khoản tiền biến mất.

### 13.7. As-built

| Thứ | Ở đâu |
|---|---|
| Hai enum + hai bảng | `apps/api/prisma/schema.prisma` (khối cuối) |
| Migration | `apps/api/prisma/migrations/20260907210000_transport_expense_claim/` — kèm `README-rollback.sql` |
| Chín `CHECK` | SQL thô trong migration; `transport-expense-claim-storage.spec.ts` đọc thẳng tệp và đo |
| Miền | `apps/api/src/transport/claims/` — 8 tệp nguồn |
| Hành động | `transport.expense.claim.read` · `.submit` · `.review` · `transport.driver.self.expense.claim.submit` |
| Đăng ký | `owned('transport-costing', …)` — **không** capability mới |
| Nghiệm thu | 38 bài: 12 miền (`EC-001`…`EC-012`) · **7 trên Postgres thật** (`EC-IT-01`…`EC-IT-07`) · 17 storage · 2 composition |

**Lịch sử quyết định chỉ ghi thêm.** Cổng lưu trữ **không có** `updateDecision` lẫn `deleteDecision`
— cùng lý do với `TransportDriverFundEntry`: cách chắc chắn nhất để không ai ghi đè là không cung
cấp cái nút đó. Đổi ý về sau là một quyết định **mới** (`sequence` kế tiếp), và sửa một khoản đã vào
sổ vẫn đi đường cũ: bút toán đảo của T3.
---

## 14. `R5` / `TX-07b` as-built — quyết toán lái xe (Lane D, Issue #237)

Mục này ghi **cái đã chạy**, theo đúng quy ước T1 §18.

### 14.1. Vì sao **không** có bảng `SettlementCredit`

#237 mô tả `monthly payroll credits + approved reimbursement payable → available balance`. Phản xạ
đầu tiên là một bảng `credit` ghi một hàng mỗi khi phiếu lương được duyệt. Bảng đó sẽ mang một **bản
sao** của `TransportPayslip.netAmount` — tức số tiền lương tồn tại ở **hai chỗ**, và kể từ lần lệch
đầu tiên giữa hai chỗ đó không ai còn biết bên nào đúng. #237 đòi đúng điều ngược lại: _"no double
counting between Driver Fund, fuel AP and reimbursement"_.

Hai nguồn tiền **đã là hai sổ cái có sẵn**, cả hai đều bất biến:

| Nguồn    | Sổ cái đã có                                  | Bất biến giữ nó                                                        |
| -------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| lương    | `TransportPayslip`                            | trigger `transport_payslip_posted_immutable` (đóng băng từ `APPROVED`) |
| hoàn ứng | số dư **âm** của `TransportDriverFundAccount` | `INV-01` — số dư là **kết quả cộng dồn**, không có cột                 |

Cái thực sự thiếu — và §1.4 đo đúng một dòng — là **bên chi**. Nên tranche này thêm đúng bên đó.

### 14.2. Vì sao một lần chi hoàn ứng **phải** ghi một bút toán quỹ

Số dư quỹ âm nghĩa là lái xe đang bỏ tiền túi (`DA-T3-01`, `COMPANY_OWES_DRIVER`). Khi công ty trả
lại, lái xe không còn bỏ tiền nữa ⇒ số dư phải về. Nếu lần chi chỉ được ghi ở bảng chứng từ chi mà
không chạm sổ quỹ, thì **sổ quỹ vĩnh viễn nói công ty còn nợ**, và lần đối soát sau sẽ trả một lần
nữa. Đó đúng nghĩa là đếm hai lần một khoản tiền, chỉ khác là nó nằm ở hai bảng.

Nên `TransportDriverFundEntryKind` nhận thêm **một** giá trị `REIMBURSEMENT` (luôn dương), và lệnh
ghi nó là `CostingService.postReimbursement` — **thuộc chính chủ sổ cái**, không phải `TX-07b`
(§4.1 luật 4). `TX-07b` gọi qua `DriverSettlementFundPort`, là **cổng ghi duy nhất** trong cả tranche.

### 14.3. Hình dạng

| Thứ                        | Ở đâu                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| Hai bảng + ba enum         | `apps/api/prisma/schema.prisma` (khối cuối)                                                              |
| Migration giá trị enum     | `apps/api/prisma/migrations/20260908110000_transport_driver_fund_reimbursement_kind/`                    |
| Migration bảng + ràng buộc | `apps/api/prisma/migrations/20260908120000_transport_driver_settlement/` kèm `README-rollback.sql`       |
| Sáu `CHECK` + hai trigger  | SQL thô — Prisma không có cú pháp; `transport-driver-settlement-storage.spec.ts` đọc thẳng tệp migration |
| Miền                       | `apps/api/src/transport/driver-settlement/` — thư mục mới                                                |
| Hành động                  | `transport.driver_settlement.read` · `.cashout` · `.reverse` · `transport.driver.self.settlement.read`   |
| Đăng ký                    | `owned('transport-workforce', …)` — **không** capability mới (`F-12`)                                    |
| Bề mặt web                 | `views/DriverSettlementView.tsx` + tóm tắt bốn con số trên `driver/DriverSurface.tsx`                    |
| Nghiệm thu                 | bài đơn vị của miền + **10 bài trên Postgres thật** (`transport-driver-settlement.int.spec.ts`)          |

**Hai migration chứ không một, và đó là ràng buộc của Postgres:** `ALTER TYPE … ADD VALUE` chạy được
trong một giao dịch từ PG 12, nhưng giá trị **mới không được dùng** trong chính giao dịch đó — mà
migration bảng phải viết lại `CHECK "TransportDriverFundEntry_sign_by_kind"`, một biểu thức **có
nhắc tên** `'REIMBURSEMENT'`. Prisma bọc mỗi tệp migration trong một giao dịch. Gộp hai việc làm một
tệp sẽ cho ra `unsafe use of new value of enum type` **lúc deploy**, không phải lúc test.

### 14.4. `F-08` được xử lý thế nào

`F-08` đọc Điều 97 BLLĐ 2019 và cấm dựng lộ trình trên tiền đề "dồn lương nhiều tháng là dòng chảy
bình thường". Chủ sở hữu đã trả lời `Q-06` ở #237: công ty **không** cố tình giữ lương; lái xe có thể
**tự chọn** để tiền tích luỹ rồi rút một lần lớn.

Nên hệ thống: **giữ** phần cấu trúc (tách _ghi nhận_ khỏi _chi trả_), **bỏ** tiền đề, và **nói ra**
khi một kỳ đã qua cửa sổ mà tiền chưa chi — một mã lý do có tên
(`WAGE_CREDIT_UNSETTLED_BEYOND_WINDOW`, cửa sổ mặc định 30 ngày theo Đ.97 k.4). Cảnh báo đó **không
chặn gì, không sinh một khoản phải trả nào, không kết luận ai sai**.

### 14.5. Còn chưa làm — có chủ đích

- **Không có vòng đời yêu cầu rút tiền** (`REQUESTED → APPROVED → PAID`). Hôm nay không nguồn nào mô
  tả lái xe yêu cầu rút qua hệ thống — họ nói với kế toán. Dựng một quy trình duyệt ở đây là bịa một
  bước nghiệp vụ (#232 §9.5). Thêm một bảng yêu cầu trỏ tới `TransportDriverCashout` sau này là một
  bước **cộng thêm**, không phải một lần viết lại.
- **`TransportPayslip.status = PAID` giữ nguyên nghĩa cũ** — mốc của bộ phận lương. Tầng chi tiền là
  sổ cái riêng, và không đường nào trong tranche này ghi vào phiếu lương.

---

## 15. `R6` / `TX-06b` as-built — bảo dưỡng v2 (Lane D, Issue #237)

### 15.1. Đo lại T6 trước — bảy khoảng trống, không phải "chưa khớp thực tế" chung chung

§12 lộ trình chỉ nói T6 *"chưa khớp thực tế"*. Đo lại `TransportMaintenanceWorkOrder` cho ra một
danh sách **đếm được**:

| #237 đòi | T6 as-built trước tranche | Kết luận |
|---|---|---|
| service/repair event | có `WorkOrder`, nhưng **không có bản chất** | thiếu — `kind` |
| planned vs actual | có `Plan` (chu kỳ) + `WorkOrder`, **không có mốc đã chụp** | thiếu — `plannedDate`/`plannedOdoKm` |
| odometer | `openedOdoKm` / `completedOdoKm` | **đã có** |
| workshop/vendor | — | thiếu |
| parts/labor/total cost | chỉ `costAmount` tổng | thiếu tách |
| evidence qua #223 | — | thiếu — `evidenceLocator` |
| roadside breakdown link | — | thiếu — `tripId` |
| downtime | suy được từ `openedAt`→`completedAt`, **không ai suy** | thiếu phép đọc |
| unavailable→available history | chính `WorkOrder` **đã là** lịch sử đó | **đã có**, chỉ thiếu cách đọc |
| tire lifecycle | — | **KHÔNG làm** — xem §15.4 |
| effective-state/warnings | `effective-vehicle-state.ts` + bảng cảnh báo | **đã có** |

### 15.2. `F-09` lặp lại — lần này trong chính mã nguồn

R0 tìm thấy `F-09` ở tài liệu bàn giao: câu *"Xe có lệnh bảo dưỡng đang mở bị khoá khỏi việc phân
chuyến"* mô tả một cổng chặn **không tồn tại**. Tài liệu đó đã được sửa.

Đo lại lần này thấy **cùng lỗi đó ở ba chỗ trong mã**, và mã thì khách không đọc được để phản đối:

| Chỗ | Câu cũ | Sự thật đo được |
|---|---|---|
| `asset-compliance-decisions.ts` nhãn `MAINTENANCE_WORK_ORDER_OPENED` | *"và khoá xe khỏi đội hình"* | `TripService.assign()` kiểm đúng ba thứ, không tra lệnh sửa |
| cùng tệp, nhãn `VEHICLE_UNDER_MAINTENANCE_LOCK` | *"nên không nhận chuyến"* | `evaluateTripTransition()` không nhận một đầu vào nào về xe |
| `transport-actions.ts`, chú thích `...work_order.open` | *"điều độ viên không điều chuyến lên nó nữa"* | như trên |

Cả ba đã được sửa **câu chữ**, không sửa hành vi. `Q-05` chưa có nguồn, nên không cổng chặn nào
được thêm — #237: *"do not invent a hard block"*.

### 15.3. Cổng chặn tương lai có hình dạng, chưa có nội dung

`evaluateDispatchReadiness()` trả về **hai** danh sách: `warnings` (có nội dung) và `blocking`
(**rỗng**). Khi B trả lời `Q-05`, thay đổi là chuyển một mã từ danh sách này sang danh sách kia —
không phải một lần dựng thêm cổng ở giữa đường điều độ.

Ba bài trong `vehicle-availability.spec.ts` khoá điều đó lại, và bài thứ ba đo ở **tầng mã nguồn**:
nó đọc `trips/trip-lifecycle.ts` và khẳng định máy trạng thái chuyến không nhắc một khái niệm bảo
dưỡng nào. Nếu một cổng chặn ra đời mà không ai tuyên bố, bài đó đỏ trước khi điều độ đi vào một
bản phát hành.

### 15.4. Không làm — có chủ đích

- **Vòng đời lốp.** #237 nói *"tire lifecycle chỉ nếu justified"*. Không nguồn nào của B mô tả họ
  theo dõi lốp theo vòng đời (lắp → luân chuyển → đắp lại → thải), và một bảng `Tyre` kéo theo vị
  trí lắp trên xe, số serial, và một quy trình luân chuyển — tất cả đều là suy đoán. Một lần thay
  lốp hôm nay ghi được là một `WorkOrder` kind `REPAIR` có phụ tùng; khi B mô tả cách họ thật sự
  quản lốp, bảng đó là một bước **cộng thêm**.
- **`totalDays` không hợp nhất khoảng chồng lấp.** Hai lệnh cùng mở là tình huống thật; gộp lại sẽ
  giấu mất việc xe vào xưởng hai việc. Con số này trả lời *"tổng ngày-lệnh"*, và một con số
  *"số ngày xe vắng mặt"* phải là một hàm **riêng có tên khác**.

---

## 16. `R8` as-built — chỉ số vận hành (Lane D, Issue #237)

### 16.1. Cái đã có sẵn, và cái thật sự còn thiếu

Điều đo được **trước** khi viết một dòng nào: hai phần ba phép tính mà `R8` cần **đã tồn tại**.

| Đã có | Ở đâu | Trả lời câu gì |
|---|---|---|
| `summariseRunDistance()` | `movement/run-distance.ts` (Lane A) | km có hàng / km rỗng / tỷ lệ rỗng của một tập chặng |
| `computeDirectMargin()` · `rollupDirectMargin()` | `settlement/direct-margin.ts` (`TX-05`) | một **chuyến** lãi bao nhiêu, có hoa hồng và công nợ nhà xe |

Nên `R8` **không viết lại** hai thứ đó. Phần còn thiếu nằm đúng ở **grain mới của Lane A**:

- biên trực tiếp theo **ĐƠN HÀNG** — `TX-05` tính theo *chuyến*, không theo đơn;
- biên trực tiếp theo **CẢ VÒNG CHẠY**, kể cả chặng rỗng — *"full VehicleRun/cycle margin"*;
- **doanh thu/km** và **chi phí/km** — chưa nơi nào tính;
- **đường đối soát**: `summariseRunDistance()` trả về *đếm*, không trả về *mã*.

`computeDirectMargin()` không bị thay thế và không bị gọi lại: nó trả lời một câu khác trên một
trục khác. Hai con số song song là **cố ý**; gộp lại sẽ mất một trong hai câu hỏi.

### 16.2. Đường chi phí — và vì sao nó đối soát được

```text
TransportRunLeg --(TransportTripRunLegLink, 1-1)--> TransportTrip --> TransportTripExpense
```

Cầu nối là một bảng **có thật** của Lane A, không phải phép đoán theo ngày/xe. Vì vậy mọi con số
tổng hợp mang theo `legIds` · `orderIds` · `tripIds`, và bộ test tích hợp không so báo cáo với một
hằng số viết tay mà với `SUM(signedAmount)` **đọc lại từ Postgres**
(`transport-analytics.int.spec.ts`, `RUN_PRISMA_IT=1`, 4/4 xanh).

Bốn quyết định đáng ghi, mỗi cái đóng một cách nói dối:

- **Chặng thiếu km không đóng góp `0`.** Nó vào `legIdsMissingDistance` và làm `emptyRatio` thành
  `null` (quy ước của Lane A). Coi là `0` sẽ kéo tỷ lệ rỗng xuống **theo hướng làm đẹp số liệu** —
  kiểu sai không ai đi kiểm tra.
- **Một đơn chạy hai chặng chỉ được cộng cước MỘT lần.** Chỗ dễ đếm đôi nhất; một `Set` là thứ duy
  nhất ngăn nó, và có một bài test mang đúng tên đó.
- **Chi phí chặng rỗng không thuộc đơn nào**, nhưng **có** trong biên vòng chạy. Một đơn có thể lãi
  trong khi cả vòng chạy lỗ — gộp hai phép đo sẽ giấu mất điều đó.
- **Đơn đã huỷ mà vẫn có chặng chạy** ⇒ `ORDER_CANCELLED_WITH_ACTIVE_LEG`, **không** tự bỏ doanh
  thu. Cùng khuôn `unexpectedInternalCost` của `TX-05`: mâu thuẫn dữ liệu được **báo ra**, không
  được tầng báo cáo tự xử.

**Không capability mới** (`F-12`): `R8` đến cùng `transport-costing`, capability đã khai
`dependencies: ['transport-core']`. Hai cổng ra ngoài (`analytics.ports.ts`) **không có một hàm ghi
nào** — `NO_CROSS_CONTEXT_REPOSITORY_WRITE` giữ bằng cấu trúc, và có bài test quét mã nguồn khoá nó.

### 16.3. CHƯA LÀM — nói thẳng, không giấu trong một dấu tích

`SettlementBuckets` mới chỉ là **kiểu + hợp đồng**, chưa có bề mặt nào bơm số vào. Bốn dòng của
`TX-05` khoá theo `Record<SettlementFlow, number>` nên thêm một dòng tiền thứ năm là **không biên
dịch được** — nhưng việc buộc nó vào bốn nguồn thật cần một quyết định *capability nào sở hữu báo
cáo hợp nhất*, và quyết định đó chưa ai ra. Mở một cổng từ `transport-costing` sang
`transport-settlement`/`transport-fuel`/`transport-workforce` sẽ biến một phụ thuộc **hợp đồng**
thành phụ thuộc **thật**, và một khách bật `transport-costing` mà tắt `transport-settlement` sẽ
không boot được.

Cũng **chưa** có: L/100km kèm ghi chú quy kết, phương sai/bất thường theo trạm, tỷ lệ chi phí ngoài
dự kiến, ngoại lệ chứng cứ/vị trí, và một báo cáo theo **cửa sổ thời gian** (hôm nay chỉ đo được
**một vòng chạy**, vì `MovementRepository` chưa có truy vấn theo khoảng ngày).
