# LẬP KẾ HOẠCH VÒNG CHẠY DO HỆ THỐNG QUẢN — Lane L (#276)

- **Chỉ thị:** Issue #276 (Lane L), điều phối bởi Issue #274 (TV2 Phase 3)
- **Nền:** [`transport-domain-v2.md`](transport-domain-v2.md) §1.1 (mô hình Order / Run / Leg của Lane A, #234)
- **Phạm vi:** `apps/api/src/transport/planning/**` + phần vòng đời **chặng** thêm vào `movement/`

> Tài liệu nền tảng: không nhắc tên khách. Khách vận tải xuất hiện ở đây chỉ dưới vai _reference
> tenant_; tham số riêng nằm ở `tenants/<slug>/tenant.json`.

---

## 0. Một câu

`TransportVehicleRun` và `TransportRunLeg` vẫn là sự thật vận hành duy nhất, nhưng **không còn là
thứ người dùng phải tự tạo và tự đóng**. Sếp/kế toán làm việc với **ĐƠN**; hệ thống suy ra vòng
chạy, chặng có hàng, chặng rỗng, và tự đóng vòng chạy khi hết việc.

```text
BOSS / ACCOUNTING
        ↓
      ORDER                     ← thứ duy nhất người dùng chạm vào
        ↓
  PlanningService               ← chính sách gom nhóm + bãi xe + chặng rỗng
        ↓
VehicleRun + RunLeg(s)          ← sự thật vận hành, hệ thống lập và hệ thống đóng
```

**Hai bất biến không được đảo:**

```text
RUN CLOSED  !=  ORDER COMPLETED
RUN CLOSED  !=  SETTLEMENT APPROVED
```

`PlanningService` không có một dòng nào chạm tới `TransportOrder.status`. Hoàn thành thương mại là
quyết định **của người**, thuộc Lane K. Nếu một ngày lớp này gọi `transitionOrder()`, hai trục đã bị
trộn lại và cổng kế toán đã bị đi vòng.

---

## 1. Lane này KHÔNG thêm mô hình vòng chạy thứ hai

Nó thêm đúng một bảng — `TransportOrderRunPlan` — trả lời ba câu mà `TransportRunLeg` không trả lời
được:

| Câu hỏi                                                                   | Vì sao chặng không trả lời được                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| _Ai đã gán đơn này vào vòng chạy này, lúc nào, theo chế độ gom nhóm nào?_ | Chặng chỉ nói "đơn X đang ở trên vòng chạy Y"                                        |
| _Một đơn có đúng một kế hoạch đang hiệu lực không?_                       | Không có chỗ nào đặt được ràng buộc đó → hai yêu cầu cùng lúc gán một đơn lên hai xe |
| _Huỷ kế hoạch rồi lập lại thì lịch sử ở đâu?_                             | Xoá chặng là mất dấu; `GD-02` cấm xoá                                                |

### Vì sao không đặt `UNIQUE` thẳng lên `TransportRunLeg.orderId`

Rẻ hơn (một index, không bảng mới) và **sai**. Khối chú thích của `TransportOrder` trong
`schema.prisma` viết rõ quan hệ đơn/chặng là **một-nhiều** (_"một đơn có thể trải trên nhiều chặng
— chuyển tải, ghép xe"_). Một unique trên `orderId` gỡ mất khả năng đó — tức lane này lặng lẽ thu
hẹp một mô hình mà lane khác đã khai.

Bảng kế hoạch cấm đúng điều #276 L3 thật sự cấm (_"one Order must never be silently attached to two
active loaded legs"_) ở đúng grain của nó: **một kế hoạch đang hiệu lực cho một đơn**. Chặng vẫn tự do.

---

## 2. Chính sách — `policies.transportPlanning`

Cấu hình của gói khách, **không** phải một nhánh `if (tenant === ...)`. Cả ba khối đều tuỳ chọn:
khai `policy: 'transportPlanning'` trong `capabilityRequirements` sẽ biến một khối hoàn toàn tuỳ
chọn thành **điều kiện boot** cho mọi khách vận tải đang chạy — đúng cái bẫy mà `transportCore` /
`transportToll` đã ghi lại.

```jsonc
"transportPlanning": {
  "runGrouping": "MULTI_ORDER_RUN",              // mặc định: ONE_ORDER_PER_RUN
  "depots": [{ "code": "DEPOT-HN", "label": "Bãi xe Hà Nội" }], // từ #395: cấu hình khởi đầu CŨ (§2.2)
  "closure": { "idleHours": 12 }                 // mặc định: null = không đóng vì hết giờ
}
```

### 2.1. `runGrouping` — mặc định là cái KHÔNG ĐỔI GÌ

| Chế độ                           | Hành vi                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `ONE_ORDER_PER_RUN` _(mặc định)_ | Mỗi đơn một vòng chạy riêng. Không bao giờ nối vào vòng chạy đang chạy — kể cả khi xe đang chạy dở |
| `MULTI_ORDER_RUN`                | Một vòng chạy mang nhiều chặng có hàng của nhiều đơn, xen kẽ chặng rỗng khi có di chuyển thật      |

#276 L1 đòi _"safe default must preserve current behavior"_. Hôm nay không khách nào có lần lập kế
hoạch nào gom hai đơn lại, nên mặc định phải là chế độ không bao giờ gom.

**Đổi chính sách chỉ ảnh hưởng lần lập kế hoạch TIẾP THEO.** `TransportOrderRunPlan.grouping` được
chốt **lúc ghi**, không đọc lại từ cấu hình khi báo cáo — một báo cáo đọc chính sách _hiện tại_ sẽ
kể lại lịch sử theo một chế độ chưa hề áp dụng.

### 2.2. `depots` — một bãi hôm nay, nhiều bãi không bị đóng cửa

#276 L5 đòi hai thứ cùng lúc: _"current tenant can have exactly one active depot"_ **và** _"data
model/API must not make future multi-depot impossible"_. Nên đây là một **mảng không giới hạn**, còn
quy tắc "đúng một bãi đang hoạt động" sống ở tầng miền (`resolveDepot()`):

| Cấu hình                 | Kết quả          | Hệ quả với kế hoạch                                                     |
| ------------------------ | ---------------- | ----------------------------------------------------------------------- |
| không khai bãi nào       | `NOT_CONFIGURED` | Không sinh chặng rỗng đầu tiên. Hợp lệ                                  |
| đúng một bãi `active`    | `RESOLVED`       | Chặng rỗng bãi → điểm lấy hàng, khi hai nhãn khác nhau                  |
| hai bãi `active` trở lên | `AMBIGUOUS`      | **Không đoán bừa.** Vẫn lập kế hoạch được, chỉ là không sinh chặng rỗng |

Bãi xe là **cơ sở vận hành của B**, không phải một `TransportCounterparty`. Khách hàng A có địa điểm
riêng (`TransportCounterpartySite`, #267 H1); hai thứ không được trộn.

#### Từ `#395` (25/09/2026): bãi xe là hàng rào `DEPOT` do Giám đốc quản lý

Bãi xe nay được khai trên màn **"Địa điểm vận hành"** — một hàng rào `DEPOT`, capability
`transport-proof` ([transport-geospatial.md](transport-geospatial.md) §7.2) — và **cùng một** bãi đó
là bãi của màn quản trị, của địa điểm đã biết khi Tạo đơn, của chặng RỖNG, của đóng vòng chạy và
của điều xe. `transport-core` không được phụ thuộc `transport-proof`, nên chiều phụ thuộc bị đảo
(cùng khuôn `RunClosureBlockerSource`):

- **Cổng `DepotDirectory`** (`planning/depot-directory.ts`, `transport-core`): `list()` trả các
  `DepotEntry` — `code`, `label`, `active`, `source` (`MANAGED` | `TENANT_CONFIG`), và chỉ với nguồn
  quản lý: `geofenceId`, `point`, `radiusMetres`. Mặc định của core đọc cấu hình gói khách
  (`ConfigDepotDirectory`) — đúng hành vi trước `#395`. `DepotDirectoryHub` do `TransportModule` cung
  cấp và export; `transport-proof` đăng ký nguồn được quản lý (`GeofenceDepotDirectory`) **trong hàm
  dựng** của `TransportPlacesRegistrar`, không ở `onModuleInit` — để lượt quét đầu tiên (chạy trong
  `onModuleInit` của `RunClosureSweepScheduler`) đã đọc đúng nguồn. Đăng ký lần hai thì ném lúc boot.
- **Luật ưu tiên:** có **bất kỳ** hàng rào `DEPOT` nào (kể cả đã tắt) → nguồn `MANAGED` là sự thật:
  chỉ bãi đang bật được dùng, và **không bao giờ** lùi về cấu hình. Chưa có hàng rào `DEPOT` nào →
  `TENANT_CONFIG` (`transportPlanning.depots`). Hệ quả có chủ đích: Giám đốc tắt bãi cuối cùng thì
  khâu lập kế hoạch nói `NOT_CONFIGURED` (không sinh chặng rỗng đầu tiên), không lặng lẽ hồi sinh một
  bãi trong tệp cấu hình mà màn hình không hiện.
- **Một bãi đang bật** là bất biến của DB (chỉ mục unique một phần `TransportGeofence_one_active_depot`)
  nên với nguồn quản lý không thể ra `AMBIGUOUS`; bảng ba kết quả ở trên giữ nguyên
  (`resolveDepotFrom()` — hàm thuần trên danh bạ đã đọc; `resolveDepot(policy)` còn cho spec cũ). Bãi
  mới tạo khi đã có bãi đang bật là bãi dự phòng (tắt). **Đổi bãi chính**
  (`POST /transport/places/admin/:id/make-primary-depot`) là một giao dịch: tắt bãi cũ rồi bật bãi mới
  — khâu lập kế hoạch không bao giờ thấy khoảnh khắc "chưa khai bãi".
- **Đọc một lần, trước khoá vòng chạy.** `PlanningService` đọc danh bạ **một** lần cho mỗi thao tác
  (đề xuất, chiếu xe, phán xử đóng) và dùng lại cho cả hai lần phán xử của `settleRunClosure()`;
  `RunClosureService.sweep()` đọc **một** lần cho cả lượt quét rồi truyền cho mọi ứng viên. Khoá hàng
  vòng chạy không khoá hàng rào nào — đọc lại bên trong chỉ tốn thêm một kết nối lúc đang giữ khoá.
  Phụ thuộc mới là tham số **cuối, tuỳ chọn**; vắng mặt thì đọc cấu hình.
- Quyết định `planning.depot` giữ nguyên ba lý do (`DEPOT_RESOLVED` / `DEPOT_NOT_CONFIGURED` /
  `DEPOT_AMBIGUOUS`), `detail` thêm `{ source, code }`. `GET /transport/planning/policy` trả thêm
  `depot.source`.

**Cổng việc đang mở.** Chặng rỗng và đóng vòng chạy **so nhãn** (§3), nên đổi tên bãi đang bật, tắt
bãi đang bật, hay đổi bãi chính đổi câu trả lời cho việc đang chạy: một vòng chạy có chặng về bãi theo
nhãn cũ không còn đóng được bằng `DEPOT_RETURN` (chỉ còn `IDLE_TIMEOUT`, hoặc nằm `holding` mãi khi
khách không khai `idleHours`), và một đơn mang nhãn cũ bị coi là một chỗ khác bãi. Cổng đọc
`DepotOpenWorkReader` (`planning/depot-open-work.ts`, `transport-core`, chỉ một phương thức đọc) đếm
việc theo **loại thay đổi**: tắt bãi đang bật hay đổi bãi chính (`RELOCATE`) đếm vòng chạy
`PLANNED`/`ACTIVE` có chặng chưa huỷ đi từ / về nhãn bãi (`sameSite()`); **đổi tên** (`RENAME`) chỉ
đếm vòng chạy có chặng chưa huỷ **về** bãi — chặng đã rời bãi không bị tên mới ảnh hưởng. Cả hai đều
đếm đơn chưa `CANCELLED`/`FULFILLED` có điểm lấy / giao mang nhãn đó. Đổi tên chỉ khác chữ hoa/thường
hay khoảng trắng thì không qua cổng (so nhãn vẫn khớp). Có việc mà chưa xác nhận →
`409 DEPOT_CHANGE_AFFECTS_OPEN_WORK` `detail: { runs, orders, idleHours }`; gửi lại với
`acknowledgeOpenWork: true` thì ghi, và danh sách việc đi vào dấu vết kiểm toán. Đổi **vị trí / bán
kính** của bãi không qua cổng này — hai khâu trên không so toạ độ. Tạo đơn khoá ô tên khi chọn một bãi
xe đã biết ("Tên bãi xe lấy từ Địa điểm vận hành.").

**Khách còn dùng cấu hình — không phải di chuyển gì.** Khách chưa có hàng rào `DEPOT` nào tiếp tục đọc
`transportPlanning.depots` y như trước; `tenant.schema.ts` giữ khối này, ghi rõ là cấu hình khởi đầu
cũ cho khách chưa có bãi được quản lý (vd chỉ bật `transport-core`). Gói `tenants/transport-preview`
đã bỏ `depots`: bãi của nó là hàng rào `DEPOT-HN` "Bãi xe Hà Nội" do máy gieo dữ liệu mẫu tạo — **cùng
mã** với cấu hình cũ, nên lịch sử chặng rỗng giữ một danh tính; máy gieo bỏ qua bãi mẫu khi đã có bất
kỳ hàng rào `DEPOT` nào (`DEPOT_ALREADY_MANAGED`). Một DB của gói này chưa có hàng rào `DEPOT` nào thì
khâu lập kế hoạch nói `NOT_CONFIGURED` cho tới khi có người khai bãi.

### 2.3. `closure.idleHours` — KHÔNG có mặc định, và đó là câu trả lời trung thực

Không nguồn nào nói một chiếc xe nghỉ bao lâu thì coi là hết vòng chạy — khách chưa trả lời. #276 L4
cho phép một quy tắc đóng theo thời gian nghỉ rồi ràng buộc ngay: _"do not invent a financial
meaning ... use a clearly synthetic preview value, not a hidden magic constant."_

Nên: **không khai = không bao giờ đóng vì hết giờ**; chỉ còn đường đóng khi xe về bãi. Gói xem trước
(`tenants/transport-preview`) khai `idleHours: 12` và tài liệu này nói rõ đó là **giá trị tổng hợp
của bản xem trước**, không phải con số của khách.

---

## 3. Chặng rỗng — chỉ khi có di chuyển thật

Một lần lập kế hoạch sinh ra **nhiều nhất hai chặng**:

```text
[EMPTY]  <điểm kết thúc trước đó> → <điểm lấy hàng>     ← chỉ khi hai nhãn KHÁC nhau
[LOADED] <điểm lấy hàng>          → <điểm giao hàng>     ← luôn có
```

Ba nguồn của "điểm kết thúc trước đó", và chúng không thay thế nhau được:

| Nguồn                      | Khi nào                           | Không có thì                  |
| -------------------------- | --------------------------------- | ----------------------------- |
| `DEPOT`                    | vòng chạy mới + khách có khai bãi | —                             |
| `PREVIOUS_LEG_DESTINATION` | nối vào vòng chạy đang chạy       | —                             |
| `ORDER_ORIGIN`             | không biết xe đang ở đâu          | **Không sinh chặng rỗng nào** |

**KHÔNG sinh chặng rỗng về bãi ở cuối.** #276 L2 viết đúng chữ: _"Do not fabricate a
return-to-depot leg just to close the Run."_ Xe có về bãi hay không là một sự thật vận hành sẽ được
ghi khi nó xảy ra, không phải một dòng mà báo cáo cần.

**So sánh địa điểm** hôm nay là so chuỗi đã chuẩn hoá (bỏ khoảng thừa, gộp khoảng trắng, không phân
biệt hoa/thường). **Không bỏ dấu**: bỏ dấu sẽ gộp "Ha Noi" và "Hà Nội" thành một — một phép đoán về
địa lý mà lane này không có nguồn. Sai theo hướng _không gộp_ an toàn hơn: nó sinh một chặng rỗng
thừa mà người đọc nhìn thấy và sửa được, thay vì nuốt mất một di chuyển thật. Khi Lane M mang về
khoá địa điểm/toạ độ thật, `sameSite()` đổi hiện thực — không đổi chữ ký.

> **Ghi chú #379 (23/09/2026):** đơn hàng nay **mang toạ độ** điểm lấy/giao
> (`Order.originPoint`/`destinationPoint`), và điều xe dùng toạ độ đó
> ([transport-dispatch-intelligence.md](transport-dispatch-intelligence.md) `D-01`). **Lập kế hoạch
> vẫn so nhãn**: `sameSite()` và `planOrderAssignment()` không đổi trong #379, vì một phía của phép
> so — điểm cuối chặng trước (`RunLeg`) và bãi xe (`TransportPlanningPolicy.depots`) — vẫn chỉ có
> nhãn, không có toạ độ. So toạ độ của đơn với nhãn của chặng sẽ là một phép so lệch hệ; đổi hiện
> thực khi chặng/bãi có toạ độ. `plannedDistanceKm` cũng **không** được lấp tự động từ toạ độ đơn:
> một ước lượng tổng hợp ghi vào cột số nguyên sẽ mất nhãn `SYNTHETIC` (`#277 M5`).
>
> _Từ `#395`: bãi được quản lý mang toạ độ (`DepotEntry.point`), nhưng chặng vẫn chỉ có nhãn — lập
> kế hoạch và đóng vòng chạy vẫn so nhãn bãi (§2.2)._

---

## 4. Đã đi vs Dự định (#276 L6)

Hai cột, và một quy tắc đọc **không đối xứng**:

| Cột                                 | Nghĩa                                                   | Ai ghi                                                          |
| ----------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| `TransportRunLeg.distanceKm`        | quãng đường **đã ghi nhận** (`GD-14`, nhập tay/odo/GPS) | vận hành, thường **sau** khi chặng đóng                         |
| `TransportRunLeg.plannedDistanceKm` | quãng đường **dự kiến**                                 | khâu lập kế hoạch, sau này là nhà cung cấp dẫn đường của Lane M |

`summariseRunMovement()` trả **hai ô**:

- `actual` — chỉ đếm chặng `COMPLETED`, và **chỉ đọc `distanceKm`**. Một ước lượng không bao giờ trở
  thành quãng đường đã đi chỉ vì chặng đó đóng lại.
- `planned` — đếm chặng `PLANNED`/`IN_TRANSIT`, đọc `plannedDistanceKm ?? distanceKm`. Chiều này
  _có_ nhận cả số ghi tay, và đó là đúng: một con số nhập trên chặng chưa chạy xong vẫn chỉ là kỳ vọng.

Chặng `CANCELLED` **không vào ô nào**, được đếm riêng ở `cancelledLegs`. `null` vẫn là _chưa biết_,
không phải 0 — và khi còn một chặng thiếu km thì `emptyRatio` trả `null` thay vì một con số rỗng.

`summariseRunDistance()` (`GET /transport/runs/:id/distance`) **giữ nguyên hình dạng và ý nghĩa cũ**.
Sửa nó để trả cả hai ô sẽ làm mọi độc giả đang có nhận một con số mang ý nghĩa khác.

---

## 5. Vòng đời chặng — thứ Lane A chưa có

Trước lane này `setLegStatus()` **không có người gọi nào**: một chặng được tạo ra rồi nằm mãi ở
`PLANNED`. Thiếu đó làm cả §6 không thể có — một vòng chạy không bao giờ "hết việc" thì không bao giờ
đóng được.

```text
PLANNED --> IN_TRANSIT --> COMPLETED
   |
   +--> CANCELLED
```

- **Không có cạnh `PLANNED → COMPLETED`**: một chặng chưa bao giờ bắt đầu mà "hoàn thành" được thì
  `startedAt` sẽ mãi `null`, và mọi phép đo thời gian chạy sau này phải đoán xem cột đó vắng vì
  chặng không chạy hay vì ai đó bấm tắt.
- **Không có cạnh `IN_TRANSIT → CANCELLED`**: chặng đã lăn bánh là một di chuyển **có thật**; huỷ nó
  làm quãng đường đó biến mất khỏi mọi báo cáo — tức biến một lần bấm thành một cách xoá km rỗng.
- **Chặng đầu lăn bánh thì vòng chạy tự sang `ACTIVE`.** Bắt sếp bấm "bắt đầu vòng chạy" chính là
  thao tác quản lý vòng chạy mà cả phase này đi bỏ.

`COMPLETED` được khoá **hai lớp**: cổng ở tầng miền (`evaluateLegTransition`) và
`transport_run_leg_completed_is_immutable` dưới Postgres — trigger chặn cả một câu `UPDATE` viết tay
trên psql. Bảy cột bị khoá; `distanceKm`, `plannedDistanceKm` và `note` **cố ý** không bị khoá, vì
chúng về sau khi chặng đã đóng.

---

## 6. Đóng vòng chạy — tất định, không ai bấm

`evaluateRunClosure()` là hàm **thuần**, không có tham số nào tên `force`, và không nhận một ý muốn
nào của người dùng.

**Điều kiện chặn** (còn bất kỳ cái nào thì không đóng):

| Mã                     | Nghĩa                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `RUN_NOT_ACTIVE`       | vòng chạy chưa chạy hoặc đã ở điểm cuối                                                |
| `LEG_STILL_OPEN`       | còn chặng `PLANNED`/`IN_TRANSIT`                                                       |
| `PLAN_STILL_OPEN`      | còn kế hoạch chưa huỷ mà chặng có hàng chưa kết thúc                                   |
| `NO_COMPLETED_WORK`    | chưa chặng nào hoàn thành — đóng một vòng chạy chưa làm gì là xoá nó bằng một tên khác |
| `CARGO_STILL_CARRIED`  | _(nạp từ ngoài)_ xe còn hàng trên thùng                                                |
| `OPEN_WAITING_SESSION` | _(nạp từ ngoài)_ còn phiên chờ người nhận                                              |

**Ba trạng thái đầu ra, không phải hai:**

```text
closable            → trigger nói vì sao đóng
blockers != []      → còn việc đang chạy. KHÔNG đóng
holding             → hết việc rồi nhưng chưa đến điều kiện đóng. KHÔNG phải lỗi
```

Gộp `holding` vào `blockers` sẽ làm một trạng thái bình thường của đội xe (xe xong hàng, chưa về bãi)
trông như một sự cố, và bảng điều hành sẽ đỏ rực lên mỗi buổi chiều.

**Hai điều kiện đóng:**

| Trigger        | Khi nào                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| `DEPOT_RETURN` | chặng hoàn thành sau cùng kết thúc **tại bãi đã khai**                          |
| `IDLE_TIMEOUT` | xe dừng việc xa bãi quá `closure.idleHours` — chỉ chạy khi khách có khai ngưỡng |

"Chặng hoàn thành sau cùng" đọc theo `completedAt` (đồng hồ **máy chủ**), và **`sequence` để phá
hoà**: hai chặng đóng trong cùng một mili giây sẽ hoà, và khi đó thứ tự đọc của kho sẽ quyết định
"xe đang ở đâu" — với một vòng chạy hai chặng, đó là khác biệt giữa _xe ở cảng_ và _xe ở kho_.

### Ai kích hoạt — `#293` Lane R

> ⚠️ **Cập nhật 10/09/2026 (`#293`).** Mục này đã đổi. `POST /transport/planning/runs/:runId/closure`
> **đã bị gỡ bỏ**: nó không ép đóng được, nhưng nó vẫn là một lần **bấm của người** làm vòng chạy
> chuyển sang `COMPLETED`, và câu hỏi `#293` R1 đặt ra là _"có phải bấm không"_ — câu trả lời phải
> là không. Cùng lúc đó, `POST /transport/runs/:id/transition` **không còn nhận `COMPLETED`**: máy
> trạng thái từ chối bằng `RUN_COMPLETE_REQUIRES_SYSTEM_PATH`, đối xứng với
> `RUN_CANCEL_REQUIRES_DEDICATED_PATH`. Đường duy nhất dẫn tới `COMPLETED` là
> `MovementService.closeRunAsSystem()`, và nó không nhận `to`.

Mọi lần phán xử đi qua **một** đường ứng dụng: `RunClosureService` (`planning/run-closure.service.ts`).

| Đường                                                | Khi nào                                                   |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `POST /transport/runs/:runId/legs/:legId/transition` | mỗi lần một chặng đổi trạng thái — `LEG_CHANGED`          |
| `POST /transport/runs/:runId/legs/:legId/cancel`     | chặng bị huỷ — `LEG_CHANGED`                              |
| `POST /transport/planning/plans/:planId/cancel`      | kế hoạch cuối bị gỡ — `PLAN_CANCELLED`                    |
| `RunClosureSweepScheduler`                           | `IDLE_SWEEP`, và `BACKSTOP_SWEEP` cho sự kiện đã thất lạc |

`RunClosureService` gom ba việc vào một chỗ mà trước đây mỗi controller phải tự nhớ: hỏi **nguồn sự
thật bên ngoài** (`RunClosureBlockerSource`), **fail-closed** khi nguồn đó hỏng, và ghi sổ quyết định.

**Luồng quét** (`sweep()`) là cơ chế bền vững cho nhánh không có sự kiện nào đánh thức:

- chạy trong tiến trình `api` (không phải tiến trình worker), bật mặc định, tắt bằng
  `TRANSPORT_RUN_CLOSURE_SWEEP=off`;
- tập ứng viên suy ra **từ sự thật nguồn** mỗi lượt (`ACTIVE`, mọi chặng đã ở trạng thái cuối, lần
  hoàn thành muộn nhất đã cũ hơn cửa sổ) — **không có con trỏ sống nào**, nên tiến trình chết giữa
  hai lượt quét không làm mất gì;
- cửa sổ ứng viên = `min(idleHours, 2 phút)`. Hai phút là **đường bảo hiểm cho nhánh về bãi**: nếu
  sự kiện `LEG_CHANGED` thất lạc, vòng chạy vẫn được phán xử lại thay vì nằm chờ tới hết nguồn nghỉ;
- **có trần** `sweep.batchSize` (mặc định 50), nhịp `sweep.intervalSeconds` (mặc định 60) — hai số
  **vận hành**, cấu hình được theo khách, và **không** phải nguồn nghỉ nghiệp vụ (`closure.idleHours`
  vẫn là con số duy nhất quyết định một vòng chạy có được đóng hay không);
- khách không khai `idleHours` thì lượt quét **vẫn chạy** nhưng không bao giờ đóng một chiếc xe đang
  ở xa bãi: nó giữ nguyên `holding`.

**Không đóng hai lần dưới hai worker.** `evaluateRunClosure()` chỉ là _phán xử_; lớp chặn thật là
`MovementRepository.completeRunIfActive()` — một `UPDATE ... WHERE status = 'ACTIVE'` trả về số hàng
đã đổi. Người thua cuộc nhận `transitioned: false` và **không** ghi thêm một dòng
`transport.run.close.system` nào.

**Ứng viên phải là "có thể đóng được", không chỉ "đã xong việc".** Một trang chỉ có `batchSize`
chỗ, và một ứng viên không đóng được sẽ quay lại lượt sau với nguyên `updatedAt` cũ — tức nằm mãi ở
đầu trang, và những vòng chạy phía sau **không bao giờ được nhìn tới**. Đó là một cách hỏng im lặng.
Nguy hiểm nhất là những vòng chạy không bao giờ đóng được bằng thời gian: khách không khai
`closure.idleHours` thì một chiếc xe xong việc ở **xa bãi** nằm nguyên ở `holding` mãi mãi (đúng như
thiết kế). Nên khi khách chưa khai ngưỡng nghỉ, ứng viên bị thu hẹp về những vòng chạy **có thể** đóng
được: một chặng đã hoàn thành kết thúc tại bãi đang hoạt động. Phép lọc là so sánh chuỗi thẳng, không
`sameSite()` — hai bản hiện thực của cùng một kho phải cùng **một** luật, và lệch nhãn chỉ làm **bỏ
sót** một ứng viên (đường sự kiện vẫn đóng nó ngay), không bao giờ làm đóng bừa.

### Vì sao nền tảng này KHÔNG dùng Hatchet cho lượt quét

`OWNER_ARCHITECTURE_CLARIFICATION_2026_09_10` xếp Hatchet là **ưu tiên** cho đường bền vững, và nói
rõ: _"If an already-accepted bounded durable mechanism proves better for a measured case, keep it."_
Đây là phép đo cho trường hợp của lane này.

| Câu hỏi                           | Đo được                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hatchet có phải hạ tầng bắt buộc? | **Không.** `WORKFLOW_ENGINE=on` **và** khách khai `integrations.workflowEngine` mới bật (`workflow-engine-switch.ts`). Mặc định là `DisabledWorkflowEngineAdapter`. |
| Nếu chỉ dùng Hatchet thì sao?     | Mọi khách không bật engine **không bao giờ** đóng được vòng chạy xa bãi. Một năng lực phải chạy cho mọi khách vận tải không được phụ thuộc vào hạ tầng tuỳ chọn.    |
| Trạng thái đóng nằm ở đâu?        | **Postgres.** Timer chỉ đánh thức; tập ứng viên được suy lại từ sự thật nguồn mỗi lượt. Không có con trỏ nào sống trong tiến trình.                                 |

Kết luận: giữ cơ chế đã được repo chấp nhận (`setInterval` + `.unref()` + trạng thái trong DB, đúng
khuôn `CampaignScheduler`/`WorkflowScheduler`), và **không** dựng thêm một đường Hatchet chỉ để có
Hatchet. Đổi lại, đây là hai điều phải nói thẳng:

- đây **không** phải một `durable wait` cấp từng thực thể; nó là một lượt quét có trần, và tính bền
  của nó đến từ việc **suy lại từ Postgres**, không từ engine;
- nếu sau này khách bật engine và cần một lần đánh thức đúng hạn cho từng vòng chạy, đường
  `WorkflowOutbox` → Hatchet `durableTask`/`sleepFor` đã có sẵn khuôn để nối vào **cùng** hàm phán
  xử này. Việc đó không được phép sinh ra đường ghi thứ hai.

---

### Đóng vòng chạy chạy trên một đường đã serialize (`#293` R2)

Trước lát cắt này, đường đóng có **hai** khoảng trống, và cả hai đều chỉ hiện ra khi có hai người
ghi cùng lúc.

**Khoảng trống 1 — TOCTOU.** Phân xử đọc vòng chạy/chặng/kế hoạch, _rồi_ mới ghi trạng thái. Giữa
hai bước đó, một người lập kế hoạch chèn được một chặng mới, và vòng chạy đóng lại mang theo một
việc chưa làm. `UPDATE ... WHERE status = 'ACTIVE'` **không** chặn được điều này: nó chỉ chặn _hai
lần đóng_.

**Khoảng trống 2 — dấu vết không nguyên tử.** Dòng `transport.run.close.system` được ghi bằng một
lần gọi kho **riêng**, _sau_ khi bước chuyển đã commit. Một cú chết ở giữa để lại một vòng chạy
`COMPLETED` mà không một dòng bằng chứng nào nói ai đóng nó và vì sao — và dấu vết đó **chính là**
bằng chứng nghiệm thu của lane này.

Cả hai được đóng bằng **một đơn vị công việc**, `MovementRepository.closeRunAsSystemSerialized()`:

```
BEGIN (ReadCommitted)
  SELECT id FROM "TransportVehicleRun" WHERE id = ? FOR UPDATE   -- khoá ranh giới vòng chạy
  đọc lại vòng chạy + chặng TRÊN giao dịch này
  decide(snapshot)        -- PlanningService phân xử LẠI, hỏi lại nguồn chặn ngoài
  UPDATE ... WHERE status = 'ACTIVE'
  INSERT INTO "AuditLog" ...                                     -- cùng COMMIT
COMMIT
```

Điều làm cho khoá này có tác dụng là **phía kia cũng giành nó**: `createLeg()` mở giao dịch, khoá
đúng hàng vòng chạy đó, rồi mới ghi. Nên cửa sổ biến thành một thứ tự:

| Ai commit trước | Kết quả                                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| chặng mới       | lần đóng đọc lại (dưới khoá) thấy chặng còn mở → `RUN_CLOSURE_BLOCKED`, giữ lại        |
| lần đóng        | `createLeg` đọc thấy `COMPLETED` → `LEG_RUN_TERMINAL`, đúng mã mà đường tuần tự trả về |

Không có kết cục thứ ba. Kế hoạch (`OrderRunPlan`) **không** được đọc dưới khoá, và đó không phải
một bỏ sót: một kế hoạch bao giờ cũng sinh chặng trước, nên nó không thể xuất hiện mà không kéo
theo một chặng mới mà bước đọc lại nhìn thấy.

**Còn lại gì.** Nguồn chặn **ngoài** `transport-core` (phiên chờ, hàng trên thùng) được hỏi lại
trên đường đã khoá, nhưng người ghi ra chúng **chưa** giành khoá này — nên một phiên chờ mở ngay
sau lần hỏi vẫn lọt. Đóng nốt khoảng đó là việc của `WAITING_SESSION_BINDING`, và nó chờ #290 vào
`main` trước. Cái đã đóng được ở đây là sự thật mà lane này **là nguồn**.

Bằng chứng: `run-closure-concurrency.int.spec.ts` R-IT-07 (đóng ⟂ thêm chặng), R-IT-08 (đóng ⟂
chốt kế hoạch, chế độ `MULTI_ORDER_RUN`), R-IT-09 (dấu vết ghi hỏng thì bước chuyển cuộn lại).
Cả ba **đỏ** khi gỡ khoá/gỡ phân xử lại/đưa dấu vết ra ngoài giao dịch.

---

## 7. Bề mặt HTTP — Lane M tiêu thụ được (#276 L7)

Mọi đường **ghi** đều bắt đầu bằng một **đơn**, không bằng một vòng chạy.

| Đường                                                     | Quyền                  | Ghi?                                                  |
| --------------------------------------------------------- | ---------------------- | ----------------------------------------------------- |
| `GET  /transport/planning/policy`                         | `transport.run.read`   | không                                                 |
| `GET  /transport/planning/orders/:orderId/plans`          | `transport.run.read`   | không                                                 |
| `POST /transport/planning/orders/:orderId/preview`        | `transport.run.read`   | **không** — xem trước tuyệt đối không có tác dụng phụ |
| `POST /transport/planning/orders/:orderId/plan`           | `transport.run.manage` | có                                                    |
| `POST /transport/planning/plans/:planId/cancel`           | `transport.run.manage` | có                                                    |
| `GET  /transport/planning/vehicles/:vehicleId/projection` | `transport.run.read`   | không                                                 |
| `GET  /transport/planning/runs/:runId/closure`            | `transport.run.read`   | không — chỉ đọc, xem chú thích dưới                   |
| `GET  /transport/runs/:id/movement`                       | `transport.run.read`   | không                                                 |
| `POST /transport/runs/:runId/legs/:legId/transition`      | `transport.run.manage` | có                                                    |
| `POST /transport/runs/:runId/legs/:legId/cancel`          | `transport.run.manage` | có                                                    |

> **Chặng CÓ HÀNG và sự thật hiện trường — `#332` (21/09/2026).** `TransportRunLeg.status` và mốc
> của lái xe là hai trục độc lập: mốc **không** đẩy trạng thái chặng. Hai quy tắc giữ cho hai trục
> không nói ngược nhau:
>
> - `…/legs/:legId/transition` với `to: 'COMPLETED'` trên chặng `LOADED` bị từ chối bằng
>   `LEG_FIELD_DELIVERY_NOT_RECORDED` khi hiện trường của chặng đó chưa `DELIVERED`
>   (`DELIVERY_ACCEPTED`), trừ khi thân yêu cầu mang `overrideReason` (ghi đè tường minh). Khi đó
>   lần hoàn tất ghi hành động kiểm toán riêng `transport.run.leg.complete.override`, gồm lý do và
>   giai đoạn hiện trường lúc ghi đè. Chặng `EMPTY`, bước `IN_TRANSIT`, và khách không bật
>   `transport-checkpoint` (nguồn `NoLegFieldTruthSource`) giữ hành vi cũ.
> - Mốc mang nghĩa hàng hoá (`PICKUP_ARRIVAL` … `DELIVERY_ACCEPTED`) không neo được vào chặng `EMPTY`
>   (`CHECKPOINT_CARGO_ON_EMPTY_LEG`), qua cả đường lái xe lẫn đường điều hành. Màn Hiện trường cũng
>   không mời những mốc đó trên chặng rỗng.
>
> Ngữ nghĩa đóng vòng chạy (`LEG_STILL_OPEN`, `PLAN_STILL_OPEN`, `CARGO_STILL_CARRIED`) không đổi.

> **Chặng đã kết thúc không nhận mốc mới — `#354` (22/09/2026).** Chặng `COMPLETED`/`CANCELLED` từ
> chối mọi mốc **mới** bằng `CHECKPOINT_LEG_TERMINAL` (409, _"Chặng đã kết thúc — không ghi thêm mốc
> vào chặng này."_), qua cả đường lái xe lẫn đường điều hành; màn Hiện trường không mời nút mốc trên
> chặng đó. Gửi lại **đúng** lệnh đã thành công trước khi chặng kết thúc vẫn trả mốc cũ. Mốc hàng hoá
> trên chặng `EMPTY` vẫn là `CHECKPOINT_CARGO_ON_EMPTY_LEG` (phạm vi đứng trước trạng thái chặng), và
> vòng chạy đã đóng vẫn là `CHECKPOINT_RUN_TERMINAL`.
>
> **Một ranh giới serialize:** khoá hàng `TransportVehicleRun` (`FOR UPDATE`) sẵn có. Lần đổi trạng
> thái chặng (`setLegStatus`, gọi từ `transitionLeg`/`cancelLeg`) giành chính khoá đó và ghi **có
> điều kiện** (`WHERE status = <trạng thái đã phân xử>`); lần ghi mốc đọc lại chặng dưới khoá
> (`RunWriteScope.legs`). Chặng bị người khác đổi trong khe đọc→khoá thì lệnh sau nhận đúng mã của
> đường tuần tự (`LEG_ALREADY_TERMINAL`, `LEG_CANCEL_ALREADY_STARTED`…), nên một chặng đã huỷ không
> bao giờ sống lại. Bằng chứng Postgres: `checkpoint-terminal-leg.int.spec.ts`.

> **Chặng đã kết thúc không mở phiên chờ mới — `#358` (22/09/2026).** Lệnh mở phiên chờ người nhận
> trên chặng `COMPLETED`/`CANCELLED` bị từ chối bằng `WAITING_LEG_TERMINAL` (409, _"Chặng đã kết thúc
> — không mở phiên chờ trên chặng này."_) — mã riêng, không dùng lại `WAITING_RUN_TERMINAL`: vòng chạy
> vẫn `ACTIVE`, chỉ chặng đã xong. Màn Hiện trường không mời nút "Bắt đầu chờ" trên chặng đó.
>
> Lý do: phiên chờ chỉ đóng bình thường bằng mốc `DELIVERY_ACCEPTED`, mà từ `#354` chặng đã kết thúc
> không nhận mốc mới — một phiên mở ở đó không bao giờ tự đóng, chỉ còn giữ vòng chạy ở
> `OPEN_WAITING_SESSION`. Nên luật của phiên chờ **là** luật của mốc đóng nó: `legAcceptsNewWaiting`
> uỷ thác cho `legAcceptsNewCheckpoints`, và được dùng ở cả kiểm sớm, dưới khoá lẫn màn Hiện trường.
>
> Cùng **một** ranh giới serialize với `#354`, không thêm khoá: lệnh mở đọc lại chặng dưới khoá hàng
> vòng chạy (`RunWriteScope.legs`), còn lần hoàn tất/huỷ chặng (`setLegStatus`) giành chính khoá đó.
> Dưới khoá, vòng chạy đứng trước chặng (`WAITING_RUN_TERMINAL` giữ nguyên). Gửi lại **đúng** lệnh đã
> thành công trước khi chặng kết thúc vẫn trả phiên cũ. Một phiên đã mở hợp lệ trước khi chặng kết
> thúc là lịch sử thật: nó vẫn chặn đóng vòng chạy (`OPEN_WAITING_SESSION`, thất bại đóng) và điều
> hành vẫn đóng được bằng tay. Bằng chứng Postgres: `waiting-terminal-leg.int.spec.ts`.
>
> **Chưa quyết ở `#358`:** chứng từ trên chặng đã kết thúc vẫn được mời ở màn Hiện trường và vẫn ghi
> được (`evaluateDocumentRecord` chỉ chặn theo vòng chạy) — chính sách đó để một issue riêng.

> **Khách đã nhận hàng thì không mở phiên chờ mới — `#363` (23/09/2026).** Chặng đã có mốc
> `DELIVERY_ACCEPTED` từ chối lệnh mở phiên chờ **mới** bằng `WAITING_DELIVERY_ALREADY_ACCEPTED` (409)
> — kể cả khi mốc đó commit **trong khe** giữa phép kiểm sớm và lúc lệnh mở lấy khoá. Trước `#363` mã
> này chỉ là phép kiểm trước khoá; dưới khoá lệnh mở chỉ đọc lại vòng chạy + chặng, nên một lần nhận
> hàng commit trong khe để lại một phiên `OPEN` mở _sau_ khi khách đã nhận hàng — cầu nối
> `closeByAcceptance` đã chạy xong và không thấy phiên nào để đóng, phiên giữ vòng chạy ở
> `OPEN_WAITING_SESSION`. Màn Hiện trường vẫn ẩn "Bắt đầu chờ" khi đã thấy mốc nhận hàng — không đổi.
>
> Cùng **một** ranh giới serialize, không thêm khoá: lần ghi mốc đã giành khoá hàng vòng chạy
> (`#293` R2). Dưới khoá, lệnh mở hỏi **gửi lại** trước (cùng `legId + clientEventId` đã thành công thì
> trả phiên cũ, kể cả khi bản gửi lại xếp hàng sau lần nhận hàng), rồi đọc lại vòng chạy → chặng →
> **mốc nhận hàng qua chính giao dịch đang giữ khoá** (`CheckpointRepository.listForLeg(legId, tx)`,
> chỉ đọc). Thứ tự mã giữ như phép kiểm sớm: nhận hàng đứng trước `WAITING_ALREADY_OPEN`. Chỉ còn hai
> thứ tự: mở trước → mốc xếp hàng sau, commit, cầu nối đóng đúng phiên đó (`RECEIVER_ACCEPTED`);
> nhận hàng trước → lệnh mở bị từ chối, không phiên nào.
>
> **Giờ nhận của mốc lấy dưới khoá.** Khoá quyết định thứ tự commit, không quyết định thứ tự đóng dấu
> giờ: trước `#363` một lần nhận hàng tới cửa khoá trước (giờ sớm) rồi xếp hàng sau một lệnh mở đã lấy
> khoá (giờ muộn) mang `receivedAt` < `startedAt`, cầu nối từ chối đóng (`WAITING_END_BEFORE_START`)
> và phiên ở lại `OPEN` dù thứ tự commit hợp lệ. Nay `receivedAt` — và ngày nghiệp vụ — lấy **sau**
> khi có khoá, nên mốc của một vòng chạy mang giờ theo đúng thứ tự commit (trên cùng một đồng hồ máy
> chủ). Bằng chứng Postgres: `waiting-delivery-accepted.int.spec.ts`.

> **Văn phòng tiến chặng và xác nhận đơn trên web — `#376` (23/09/2026).** Hai đường ghi ở trên
> (`…/legs/:legId/transition`, `POST /transport/orders/:id/transition`) đã có từ `#276`/`#332`, nhưng
> web chưa có thao tác nào gọi chúng: lái xe bấm "Khách đã nhận hàng" xong thì chặng vẫn `PLANNED`,
> Bảng điều hành vẫn "Đã lên kế hoạch", và đơn không bao giờ vào "Kết thúc đơn". Nay màn **Đơn hàng
> & vòng chạy** có:
>
> - khối **Tiến độ vòng chạy** trong chi tiết đơn (cả chặng RỖNG — vòng chạy chỉ đóng khi mọi chặng
>   xong), và cùng bảng đó ở phần "Vòng chạy của xe": cột **Hiện trường** đọc giai đoạn từ báo cáo
>   vòng chạy, cột **Việc văn phòng** có `Bắt đầu chạy` (`PLANNED → IN_TRANSIT`) và `Hoàn tất chặng`
>   (`IN_TRANSIT → COMPLETED`), mỗi lần đều qua hộp xác nhận;
> - chặng `LOADED` mà hiện trường chưa `DELIVERED` chỉ còn `Hoàn tất có ghi đè…` — hộp thoại **bắt
>   buộc** lý do (`overrideReason`). Máy chủ vẫn là cổng thật: một lần từ chối
>   `LEG_FIELD_DELIVERY_NOT_RECORDED` (đọc từ `reason` có kiểu của `#168 B7`) chuyển nút sang ghi đè;
> - dòng **Đóng vòng chạy (hệ thống tự quyết)** chỉ **đọc** `GET …/closure` và `closure` mà chính lần
>   tiến chặng trả về (chưa chạy / chưa đóng + lý do / đang giữ / đã đóng). Không có nút đóng vòng
>   chạy, và web không có đường nào gọi `POST /transport/runs/:id/transition` ngoài `ACTIVE`;
> - khối **Giao xong đơn**: `Xác nhận đã giao xong` (`OPEN → FULFILLED`), có người bấm, không tự suy
>   từ mốc hay từ lần đóng vòng chạy; cảnh báo (không chặn) khi chặng có hàng của đơn chưa xong.
>
> Mỗi lần ghi — thành công **hoặc** bị từ chối — làm tươi đơn, vòng chạy, báo cáo vòng chạy, Bảng điều
> hành và hàng chờ "Kết thúc đơn" (`useLegTransition`/`useOrderFulfilment`).
>
> **Còn lại, KHÔNG sửa ở `#376`:** ghi đè khi hiện trường còn ghi hàng trên xe (`LOADING`,
> `IN_TRANSIT`, `ARRIVED`) để lại `CARGO_STILL_CARRIED` mãi — chặng đã hoàn tất không nhận mốc mới
> (`#354`), nên không mốc nào gỡ được nó và lượt quét cũng không đóng. Hộp thoại ghi đè nói trước điều
> đó; đường thường (lái xe bấm "Khách đã nhận hàng" trước khi văn phòng hoàn tất) không mắc phải.

`idempotencyKey` là **bắt buộc** ở đường chốt. Không có khoá thì không có gì để nhận ra lần thứ hai
là lần thứ hai, và #276 L9 bài 1 không thể đạt được.

`vehicles/:vehicleId/projection` là nguồn Lane M cần: xe sẽ dừng ở đâu, và từ bao giờ nó hết việc.
`freeFrom` **cố ý** để `null` khi còn chặng chưa chạy xong — đoán giờ rảnh của một chiếc xe đang trên
đường đòi một phép tính đường đi mà lane này không có nguồn, và một con số đoán trông y hệt một con
số đo được.

---

## 8. Ràng buộc ở tầng lưu trữ

Ba cổng của lane này đều có **hai lớp**: một cổng ở tầng miền và một ràng buộc ở tầng kho. Lớp thứ
hai tồn tại vì một đoạn mã dịch vụ chỉ chứng minh được rằng _đường đó_ không sai — không chứng minh
được rằng không còn đường nào khác.

| Ràng buộc                                                                                             | Chặn cái gì                                                       |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `TransportOrderRunPlan_activeOrder_key` _(unique một phần, `WHERE cancelledAt IS NULL`)_              | hai yêu cầu cùng lúc gán một đơn lên hai xe                       |
| `TransportOrderRunPlan_oneOrderPerRun_key` _(unique một phần, thêm `grouping = 'ONE_ORDER_PER_RUN'`)_ | chế độ một-đơn nhận kế hoạch thứ hai trên một vòng chạy           |
| `TransportOrderRunPlan_idempotencyKey_key`                                                            | hai lần bấm cùng khoá thành hai kế hoạch                          |
| `transport_run_leg_completed_is_immutable` _(trigger)_                                                | viết lại một chặng đã hoàn thành                                  |
| `TransportRunLeg_planned_distance_non_negative`                                                       | km dự kiến âm (`NULL` vẫn hợp lệ = _chưa biết_)                   |
| `TransportOrderRunPlan_legs_distinct`                                                                 | chặng rỗng và chặng có hàng của cùng một kế hoạch là **một** hàng |
| `TransportOrderRunPlan_cancellation_paired`                                                           | huỷ mà không có lý do                                             |

Migration `20260911140000_transport_run_planning` **chỉ thêm**: hai enum, một bảng, một cột nullable
trên `TransportRunLeg`, một `CHECK` trên chính cột mới đó, và một trigger. Không cột nào đổi kiểu,
không ràng buộc nào bị gỡ. Đường lui nằm ở `README-rollback.sql` cùng thư mục.

---

## 9. Khoảng cách đã ghi tên

> ⚠️ **Cập nhật 10/09/2026 (`#293` Lane R).** Hai hàng đầu và hàng thứ ba đã đóng lại; bảng dưới
> giữ nguyên hàng cũ kèm trạng thái mới, để người đọc sau thấy được cái gì đã đổi và cái gì chưa.

| Khoảng cách                                          | Trạng thái                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CARGO_STILL_CARRIED` chưa có nguồn                  | **ĐÃ ĐÓNG.** `CheckpointRunClosureBlockerSource` suy ra nó từ `buildRunTimeline()` của `#243` F6 (giai đoạn `LOADING`/`IN_TRANSIT`/`ARRIVED` = hàng còn trên thùng). `transport-core` vẫn không phụ thuộc ngược: cổng `RunClosureBlockerSource` do `transport-core` khai, `transport-checkpoint` ghi đè ở tầng composition |
| `OPEN_WAITING_SESSION` chưa có nguồn                 | **CHỜ LANE O.** Cổng đã có và đã kiểm bằng adapter giả; `TransportDeliveryWaitingSession` (#243 F3) vẫn chưa vào `main`, và lane này **không** dựng một bảng giả. Xem `WAITING_SESSION_BINDING` ở báo cáo cuối lane                                                                                                        |
| `IDLE_TIMEOUT` cần một lần quét                      | **ĐÃ ĐÓNG.** `RunClosureSweepScheduler` + `RunClosureService.sweep()` — bền vững, có trần, khôi phục được sau khi tiến trình chết, và không đóng hai lần dưới hai worker                                                                                                                                                   |
| So sánh địa điểm bằng nhãn chữ                       | **CÒN.** Chưa có khoá địa điểm/toạ độ ở grain chặng. Lane M sở hữu phần đó. #379 đưa toạ độ vào **đơn** (điều xe dùng), nhưng lập kế hoạch vẫn so nhãn — xem ghi chú ở §3                                                                                                                                                  |
| Vòng chạy mồ côi khi hai yêu cầu song song cùng thua | **CÒN.** Bản thua ở `plans.create` để lại một vòng chạy `PLANNED` rỗng việc; nó được dọn bằng đường huỷ bình thường. Cùng khuôn với `SiteIntakeService`                                                                                                                                                                    |

### Nguồn sự thật bên ngoài — cổng, không phải một DI tuỳ nghi

`RunClosureFacts.additionalBlockers` vẫn là một tham số của hàm thuần. Cái mới của `#293` R4 là một
**cổng chỉ đọc** để lấp nó ở tầng ứng dụng:

```ts
RunClosureBlockerSource.blockersForRun(runId) -> RunClosureBlocker[]
```

Ba tính chất, và cả ba đều được kiểm:

1. **Chỉ đọc.** Một phương thức, không `record()`, không `clear()` — một cổng đọc mà ghi được sẽ sớm
   thành chỗ "tạm gỡ vật cản ra".
2. **Fail-closed.** Nguồn ném → `EXTERNAL_BLOCKER_SOURCE_UNAVAILABLE`; nguồn trả về thứ không đọc
   được → `EXTERNAL_BLOCKER_SOURCE_AMBIGUOUS`. Cả hai là **mã chặn thật**, đi qua đúng con đường mà
   mọi mã chặn khác đi, và hiện lên bảng điều hành. Không bao giờ trả `[]` khi có sự cố: `[]` nghĩa
   là _"đã hỏi, và không có gì chặn"_.
3. **Vắng mặt là một câu trả lời hợp lệ.** Khách không bật `transport-checkpoint` nhận
   `NoRunClosureBlockerSource` — không có cổng nào để hỏi, khác hẳn với hỏi rồi nhận về "không chặn".
