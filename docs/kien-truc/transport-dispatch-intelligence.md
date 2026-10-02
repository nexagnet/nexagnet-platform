# ĐIỀU XE THÔNG MINH — cổng định tuyến trung tính và cách xếp hạng đội xe

> Lane M của [#277](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/277) ·
> điều phối [#274](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/274) ·
> đo ngày **08/09/2026** trên `main = f5868144905d683c5c67ffce30f6d46810561717`.
>
> **As-built [#379](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/379)
> (23/09/2026):** đơn hàng **mang toạ độ** điểm lấy/giao. `D-01` bên dưới đã viết lại; điểm lấy hàng
> không còn được suy từ nhãn chữ.

## 0. Phán quyết một dòng

**Cổng `TransportRoutingPort` trung tính; mặc định chạy bằng bộ ước lượng tổng hợp có nhãn;
HERE là ứng viên thương mại duy nhất còn đứng vững cho Việt Nam; Google Routes bị loại vì
không phủ Việt Nam ở phần định tuyến xe tải; Valhalla là đường tự dựng để mở khi có nhu cầu
thật.** Không mua gì, không xin khoá nào, và không một dòng nghiệp vụ nào biết tên nhà cung cấp.

---

## 1. Ba điều đo được trước khi thiết kế

### `D-01` — Đơn hàng **mang toạ độ**; nhãn chữ chỉ để hiển thị (#379)

Từ [#379](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/379), `TransportOrder`
lưu toạ độ điểm lấy và điểm giao (`originPoint`/`destinationPoint`, bốn cột `DOUBLE PRECISION` có
ràng buộc CHECK — xem [transport-domain-v2.md](transport-domain-v2.md) §12). Người nhập đơn chọn
chúng trên bản đồ; `originLabel`/`destinationLabel` chỉ còn là chữ **hiển thị**. Đơn vẫn **không**
mang hạn lấy hàng và khối lượng hàng.

**Thứ tự giải điểm lấy hàng** (`pickup-resolution.ts`):

| Thứ tự | Nguồn                                                            | Mã quyết định                                               |
| ------ | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| 1      | Người gọi **chỉ định tường minh**: `POINT` / `SITE` / `GEOFENCE` | `PICKUP_FROM_EXPLICIT_REQUEST` — thắng cả toạ độ của đơn    |
| 2      | Toạ độ điểm lấy **lưu trên đơn**                                 | `PICKUP_FROM_ORDER_COORDINATES`, nguồn `ORDER_PICKUP_POINT` |
| 3      | Đơn cũ (toạ độ `NULL`) hoặc toạ độ hỏng                          | từ chối `DISPATCH_ORDER_PICKUP_COORDINATES_MISSING` (400)   |

**Không còn bước suy từ nhãn.** Trước #379 có một bước giữa 2 và 3: khớp `originLabel` với tên một
hàng rào. Bước đó đã bị gỡ có chủ ý — một nhãn trùng tên hàng rào là một sự trùng hợp chính tả,
không phải một lần khảo sát, và một bảng xếp hạng dựa trên nó trông y hệt một bảng xếp hạng thật.
Đơn cũ không bao giờ được geocode từ chữ thành toạ độ; muốn điều xe cho nó thì người điều xe chỉ
định điểm lấy tường minh.

Điểm lấy hàng từ toạ độ đơn **không phụ thuộc `transport-proof`**: khách không bật capability đó
(không sổ hàng rào, không vị trí xe) vẫn giải được điểm lấy. Khi ấy:

- xe **rảnh** (không còn chặng mở) bị loại `VEHICLE_HAS_NO_USABLE_ORIGIN` — không biết nó đang ở
  đâu, và nó cũng không có việc nào cho biết nó sẽ rảnh ở đâu;
- xe **bận** mà chặng mở cuối cùng kết thúc ở một đơn **có toạ độ** vẫn hiện ra với chế độ
  `NEXT_FREE_NEAR`: điểm xuất phát là điểm giao của đơn đó (`ORDER_DELIVERY_POINT`), còn
  `availableAt` là `null` (kèm khoảng trống `CURRENT_POSITION_UNKNOWN`) vì không biết xe đang ở
  đâu thì không tính được giờ rảnh. Đây là hành vi **có chủ ý**: người điều xe thấy "xe này sẽ rảnh
  ở gần đây, chưa biết lúc nào" thay vì mất hẳn chiếc xe khỏi bảng.

**Điểm đến của chặng còn lại** (phép chiếu "xe sẽ rảnh ở đâu", `remaining-leg-plan.ts`): `RunLeg`
**chưa** có cột toạ độ, nên:

- chặng `LOADED` **cuối cùng** của một đơn trong việc còn lại của xe → điểm **giao** của đơn đó
  (`ORDER_DELIVERY_POINT`);
- chặng `EMPTY` đứng ngay trước (cùng vòng chạy, `sequence + 1`) chặng `LOADED` **đầu tiên** của
  một đơn → điểm **lấy** của đơn kế tiếp (`ORDER_PICKUP_POINT`);
- còn lại (chặng của đơn cũ, chặng rỗng về bãi, chặng không gắn đơn, chặng giữa của một đơn chạy
  nhiều chặng có tải) → vẫn giải theo **nhãn chặng** bằng `place-resolution.ts` như trước. Đơn chỉ
  ghi hai điểm; chặng giữa đi tới một chỗ (bãi trung chuyển) mà đơn không ghi. Đây là phép chiếu,
  không phải suy điểm lấy của đơn đang điều.

Mỗi đơn được đọc **đúng một lần** mỗi lượt đề nghị (bộ đệm theo lượt); ngân sách
`maxProjectionRouteCalls` giữ nguyên nghĩa. Hạn lấy hàng và yêu cầu tải trọng vẫn đến từ **người
gọi**; khi không ai khai, bước xếp hạng tương ứng bị **bỏ qua** chứ không chạy với một giá trị bịa.

### `D-02` — Xe **không có kích thước**

`TransportVehicle` có `vehicleClass`, `allowedPayloadKg` (nullable), `currentOdoKm`. Không chiều
cao, không chiều rộng, không tải trọng trục. Nên `TruckProfile` gần như rỗng, mang `complete: false`
và một danh sách trường thiếu; mọi ứng viên gắn nhãn `TRUCK_PROFILE_INCOMPLETE`.

Con số ở chế độ này dùng để **xếp hạng** (cả đội xe thiếu như nhau) chứ **không** để **dẫn đường**
— một gầm cầu thấp không tha thứ cho một trường `null`.

### `D-03` — PostGIS **không cần thêm cho Lane M**

[transport-geospatial.md](transport-geospatial.md) đã đo và chốt: **không thêm PostGIS**, lưu toạ độ
bằng hai cột `double precision`, và chỉ mục không gian dùng `cube`+`earthdistance` khi cần. Lane M
**không** xét lại kết luận đó, và cũng **không** cần đến chỉ mục ấy:

| Truy vấn của Lane M            | Bậc độ lớn                                    | Cần chỉ mục không gian? |
| ------------------------------ | --------------------------------------------- | ----------------------- |
| vị trí gần nhất của **một** xe | O(1) qua `(session → vehicle)`                | không                   |
| lọc sơ bộ ứng viên             | O(số xe) ≈ 10 hôm nay                         | không                   |
| ma trận đường bộ               | O(số ứng viên) — chặn ở `maxRoutedCandidates` | không                   |

Chỉ mục không gian phục vụ truy vấn **lịch sử** ("xe nào đã qua đây") — việc của bảng điều khiển,
không phải của luồng điều xe. Cái đắt trong tầng này là **lần gọi nhà cung cấp**, và nó được chặn
bằng `maxRoutedCandidates`/`maxMatrixElements`/`maxProjectionRouteCalls`, không bằng một chỉ mục.

**⇒ `POSTGIS = NOT_ADOPTED`**, cùng lý do đã đo ở Lane B, và đường nâng cấp vẫn để mở.

---

## 2. Ba sự thật, ba kiểu, không đổi chỗ cho nhau

```text
CURRENT        bản định vị THẬT (đồng hồ máy chủ, sai số, nguồn)  -> bằng chứng
NEXT_FREE      suy từ các chặng chưa xong                         -> phép chiếu
RouteEstimate  ước lượng của nhà cung cấp                         -> dự báo
```

`#277 M10` cấm thay bằng chứng bằng phép chiếu. Trong code điều đó là ba kiểu riêng
(`VehicleCurrentState` / `VehicleNextFree` / `RouteEstimate`), và một bài kiểm thử khẳng định toạ độ
trong khung nhìn vẫn đúng bản đã quan sát sau khi định tuyến chạy xong.

`NEXT_FREE` mang `completeness` ba giá trị (`COMPLETE`/`PARTIAL`/`UNKNOWN`) và một danh sách `gaps`
có tên. Không có đường "rơi về bãi xe": `#277 M1` viết _"never invent depot/zero ETA"_.

---

## 3. Xếp hạng — khoá có tên, không phải điểm số

`#277 M6`: _"Do not create one opaque magic score whose meaning cannot be inspected."_

```text
DEADLINE_FEASIBILITY   kịp giờ trước không kịp   (BỎ QUA khi đơn không có hạn)
NO_WORK_INTERRUPTION   không cắt ngang trước cắt ngang
EMPTY_ROAD_DISTANCE    km chạy rỗng thêm vào, ít hơn thắng
PICKUP_ETA             đến sớm hơn thắng
STABLE_IDENTITY        biển số, rồi mã xe
```

Cả danh sách đi ra DTO (`DispatchSuggestionView.orderingKeys`), nên một màn hình giải thích được
thứ tự mà không phải đọc source. Khoá `NO_WORK_INTERRUPTION` là **bổ sung của Lane M** so với danh
sách gợi ý của `M7`, và lý do nằm trong `dispatch-policy.ts`: với một xe đang chở hàng, "chỗ đang
đứng" chỉ đến được bằng cách **bỏ dở** chuyến đang chạy.

Khoảng cách **chim bay** xuất hiện đúng **một lần** — cắt danh sách xuống `maxRoutedCandidates` —
rồi biến mất. Mọi con số đi vào xếp hạng đều là con số **đường bộ** (`#277 M3`).

---

## 4. So sánh nhà cung cấp — theo tài liệu chính thức, đọc 08/09/2026

### 4.1. HERE — `SUPPORTED_BY_DOCS / RUNTIME_NOT_PROVEN`

| Hạng mục           | Đo được                                                                                                                                                                                         | Nguồn                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Định tuyến         | `GET https://router.hereapi.com/v8/routes`, `transportMode=truck`                                                                                                                               | [routing-v8-truck-routing](https://docs.here.com/routing/docs/routing-v8-truck-routing)           |
| Tham số xe         | khuôn `vehicle[<tên>]`; `height` tính bằng **xentimét** (ví dụ tài liệu: `270` cho 2,7 m); còn `width`, `length`, `weightPerAxle`, `currentWeight`, `grossWeight`, `trailerCount`, `tiresCount` | [routing-v8-vehicle-properties](https://docs.here.com/routing/docs/routing-v8-vehicle-properties) |
| Ràng buộc hàng hoá | `truck[shippedHazardousGoods]`, `truck[tunnelCategory]` (hạng B–E)                                                                                                                              | như trên                                                                                          |
| Phản hồi           | `routes[] → sections[] → summary` với `length` (**mét**) và `duration` (**giây**)                                                                                                               | [routing-v8-route-summary](https://docs.here.com/routing/docs/routing-v8-route-summary)           |
| Hình tuyến         | _flexible polyline_ — định dạng nén riêng, **cần một bộ giải mã**                                                                                                                               | như trên                                                                                          |
| Ma trận            | `POST https://matrix.router.hereapi.com/v8/matrix?async=false`, thân có `origins`/`destinations`/`regionDefinition`/`matrixAttributes`                                                          | [get-started-matrix](https://docs.here.com/routing/docs/get-started-matrix)                       |
| Giới hạn ma trận   | tới **10.000 × 10.000** với `regionDefinition` + profile; **15×100 hoặc 100×1** khi dùng tuỳ chọn riêng + giao thông động                                                                       | [matrix-routing-intro](https://docs.here.com/routing/docs/matrix-routing-intro)                   |
| Xác thực           | `apiKey` (hoặc OAuth)                                                                                                                                                                           | tài liệu API                                                                                      |

**Đã hiện thực:** `here-truck-routing.ts` (dựng yêu cầu + đọc phản hồi, **hàm thuần**, có bài kiểm
thử ngoại tuyến) và `here-truck-routing.adapter.ts` (lớp gọi mạng). **Chưa chạy thật** — không môi
trường nào có khoá, và `#277 M11` cấm đi xin.

**Hai chỗ dễ sai đã được khoá bằng test:** phép đổi đơn vị (cm/kg giữ nguyên từ gốc, không đổi hai
lần) và cách đọc ma trận **phẳng theo hàng** (`i * numDestinations + j` — đọc nhầm vẫn cho ra một
bảng trông hoàn hảo với khoảng cách của những cặp điểm khác).

**Không phát tham số chưa xác nhận được.** `axleCount` là ví dụ: nó xuất hiện trong tài liệu của
vài nhà cung cấp khác, nhưng trang thuộc tính xe của HERE **không** liệt kê. Gửi một tham số máy chủ
không hiểu là một lỗi 400 giữa một ca điều xe.

### 4.2. Google Routes — `NOT_USED (không phủ Việt Nam)`

Đây là kết quả **đổi quyết định**, nên nó phải được ghi rõ.

| Hạng mục                    | Đo được                                                                                                                                               | Nguồn                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Ma trận                     | `POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`; **bắt buộc** `X-Goog-FieldMask`                                            | [computeRouteMatrix](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRouteMatrix) |
| Giới hạn                    | ≤ **625** phần tử; ≤ **100** khi `TRAFFIC_AWARE_OPTIMAL`                                                                                              | như trên                                                                                                                    |
| `travelMode`                | `DRIVE`, `TWO_WHEELER`, `WALK`, `TRANSIT` — **không có** chế độ xe tải                                                                                | như trên                                                                                                                    |
| Định tuyến xe lớn (LVR)     | **chỉ** 48 bang lục địa Hoa Kỳ (GA) và **Nhật Bản** (thử nghiệm); phải **liên hệ Google để xin quyền**                                                | [Large vehicle routing](https://developers.google.com/maps/documentation/routes/lvr)                                        |
| Cảnh báo của chính tài liệu | có trường hợp API trả tuyến _"best effort"_ **vẫn đi qua đoạn bị cấm**, gắn cờ `routeRestrictionsPartiallyIgnored`; không hỗ trợ phí cầu đường xe tải | như trên                                                                                                                    |

**Kết luận:** khách của hệ này chạy xe tải ở **Việt Nam**. Vùng phủ của LVR không bao gồm Việt Nam,
và `computeRouteMatrix` thường không có chế độ xe tải. Dùng `DRIVE` để định tuyến một xe đầu kéo là
đưa một con số **của xe con** vào một quyết định **của xe tải** — sai theo cách không nhìn ra được
trên bảng. Nên Google **không** phải ứng viên cho bài toán này, và điều đó cần được ghi lại để lần
sau không ai phải đo lại.

### 4.3. Valhalla — `EVALUATED / NOT_DEPLOYED`

| Hạng mục             | Đo được                                                                                                                                                                                    | Nguồn                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Giấy phép / vận hành | mã nguồn mở, **tự dựng được** (`localhost:8002/route?json={}`)                                                                                                                             | [Valhalla API reference](https://valhalla.github.io/valhalla/api/route/api-reference/) |
| Chi phí xe tải       | `costing=truck` + `costing_options.truck`                                                                                                                                                  | như trên                                                                               |
| Tham số              | `height` (m, mặc định 4,11), `width` (m, 2,6), `length` (m, 21,64), `weight` (tấn, 21,77), `axle_load` (tấn, 9,07), `axle_count` (5), `hazmat`, `hgv_no_access_penalty`, `use_truck_route` | như trên                                                                               |
| Ma trận              | dịch vụ ma trận riêng của Valhalla                                                                                                                                                         | như trên                                                                               |

**Vì sao chưa dựng:** nó thêm **một tiến trình + một bộ dữ liệu bản đồ** vào hồ sơ triển khai, và
[#224](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/224) đang đo tính khả
chuyển của đúng hồ sơ đó. Nó là đường đúng **khi** có một nhu cầu thật (không muốn đưa địa chỉ khách
ra bên thứ ba, hoặc chi phí gọi API thành đáng kể) — không phải hôm nay.

Một cảnh báo phải giữ: mặc định của Valhalla **không rỗng** (xe cao 4,11 m, nặng 21,77 tấn). Với
một `TruckProfile` rỗng như hôm nay, Valhalla sẽ định tuyến cho **một chiếc xe mặc định** chứ không
báo thiếu. Đó là lý do `TruckProfile.complete` phải đi kèm mọi kết quả.

### 4.4. Đường mặc định — bộ ước lượng tổng hợp

`synthetic-detour-v1`: cung lớn × hệ số đường vòng (1,3) và tốc độ trung bình (13,9 m/s).
Tất định, ngoại tuyến, miễn phí, và **mọi kết quả mang `quality: 'SYNTHETIC'`** đi suốt tới câu giải
thích người dùng đọc.

Nó sai theo một kiểu đoán trước được: sai ít trên hành lang có cao tốc thẳng, sai nhiều ở vùng phải
vòng qua sông/núi, và **sai hoàn toàn** khi giữa hai điểm không có đường bộ — ở đó nó vẫn trả về một
con số trông bình thường, trong khi một nhà cung cấp thật trả `ROUTE_NOT_FOUND`.

---

## 5. Chi phí và chặn trên

| Chặn                      | Giá trị | Chặn cái gì                                    |
| ------------------------- | ------- | ---------------------------------------------- |
| `maxRoutedCandidates`     | 12      | số điểm xuất phát đi vào ma trận               |
| `maxMatrixElements`       | 100     | số ô **một** lần gọi ma trận                   |
| `maxProjectionRouteCalls` | 60      | tổng số lần hỏi lẻ cho phép chiếu "xe sẽ rảnh" |
| `routeCacheTtlSeconds`    | 300     | tuổi tối đa của một ô trong bộ đệm             |

Bộ đệm nằm **trong bộ nhớ**, khoá theo **cặp điểm** (không theo cả ma trận), và mọi bản lấy ra mang
`fromCache: true` **giữ nguyên `computedAt` gốc** — `#277 M12`: _"stale route estimate cannot be
presented as live without timestamp."_ Thất bại **không** được nhớ lại.

`CachedRoutingAdapter.stats()` đếm số lần gọi, số ô, số ô lấy từ đệm và số lần hỏng — đó là phần
"instrumentation" mà `M12` đòi, và nó bọc **cả** đường tổng hợp để số đo không biến mất ở cấu hình
mặc định.

---

## 6. Đề nghị ⟂ phân công

```text
POST /transport/orders/:orderId/dispatch-suggestions   transport.dispatch.suggest.read   CHỈ ĐỌC
POST /transport/orders/:orderId/dispatch-assignment    transport.run.manage              GHI
```

Đường đọc chạm **duy nhất** các cổng chỉ-đọc ở `dispatch-facts.port.ts`, nên câu _"xem một bảng đề
nghị không đổi một hàng dữ liệu nào"_ là một tính chất **kiểm được lúc biên dịch**.

Đường ghi **tính lại** bảng trên sự thật hiện tại, đối chiếu với chiếc xe con người đã chọn, rồi
chuyển cho `DispatchAssignmentPlanner`. Sự thật đã đổi ⇒ `DISPATCH_RECOMMENDATION_STALE`, không ép
quyết định cũ đi tiếp (`#277 M9`).

Cổng ghi nối thẳng vào `PlanningService` của Lane L
([#276](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/276), đã lên `main` ở
`41e9bbe`). Lane M **không** giữ một đường ghi vòng chạy của riêng mình: `#274` giao quyền lập kế
hoạch cho L, và một bản hiện thực thứ hai — dù đúng — sẽ để trong hệ **hai bộ luật gom đơn**, và
lần lệch đầu tiên sẽ không ai biết bên nào đúng.

Chống lặp đến từ `idempotencyKey` **suy tất định** từ `(đơn, xe)`: hai lần bấm của cùng một người
trên cùng một dòng bảng cho cùng một khoá, nên lần thứ hai đọc lại kế hoạch cũ. Đổi xe là một
**quyết định khác**, nên khoá đổi theo, và L từ chối bằng `PLAN_ORDER_ALREADY_PLANNED` — đúng câu
trả lời, từ đúng bên sở hữu luật.

### Một chỗ hai lane cùng tính, và vì sao giữ nguyên

Lane L cũng có `projectVehicle()` trả về `endpointLabel`/`freeFrom` (`#276` L7, khối chú thích của
nó ghi thẳng _"nguồn cho Lane M"_). Lane M **không** dùng nó, và đó là một lựa chọn có lý do chứ
không phải bỏ sót: `VehicleEndpointSource` của L có nhánh `DEPOT` — khi xe không còn vòng chạy nào
mở, L trả về bãi xe. Đúng cho **lập kế hoạch**; sai cho câu hỏi của Lane M, vì `#277 M1` cấm
_"invent depot"_ khi trả lời _"xe đang ở đâu"_. Một chiếc xe rảnh chưa bật bám vị trí phải hiện ra
là `VEHICLE_HAS_NO_USABLE_ORIGIN`, không phải "đang ở bãi".

Hai bên đọc **cùng một nguồn** (các chặng chưa xong, sắp cùng thứ tự) nên hôm nay chúng đồng ý về
điểm kết thúc. Nếu một ngày cần gộp, chỗ đúng là cho L nhận một cờ _"không rơi về bãi"_ — không
phải cho M đọc rồi lọc lại.

### Toạ độ chịu một cổng nữa

Mã `transport.dispatch.suggest.read` mở **bảng**; toạ độ xe chỉ hiện khi người gọi **cũng** có
`transport.location.history.read` (hôm nay: `ADMIN`, không phải `ACCOUNTING`). Kế toán thấy km rỗng,
giờ đến, tuổi bản định vị và lý do — đủ để đối soát — nhưng không thấy chiếc xe đang đứng ở đâu.
Một chiếc xe không tự nó là một con người, nhưng có **một** con người ngồi trong nó.

---

## 7. Cái tầng này chưa làm

| Việc                                  | Vì sao chưa                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Khớp vết GPS lên đường (`matchTrace`) | chưa báo cáo nào đòi; `#277 M10` chỉ yêu cầu **giữ rõ ranh giới** giữa vết thô và vết khớp     |
| Hình tuyến vẽ lên bản đồ              | HERE trả _flexible polyline_, repo chưa có bộ giải mã; Lane N sẽ quyết khi cần vẽ thật         |
| Định mức thời gian tại điểm dừng      | `stopServiceSeconds = 0`, và hệ thống **nói ra** hậu quả bằng `availableAtIsLowerBound`        |
| Gom nhiều đơn vào một vòng chạy       | thuộc `#276 L3`; viết bản thứ hai ở đây sẽ để lại hai bộ luật gom đơn                          |
| PostGIS                               | xem `D-03`                                                                                     |
| Toạ độ ở grain chặng (`RunLeg`)       | #379 đưa toạ độ vào **đơn**; chặng không trỏ tới một đơn có toạ độ vẫn giải theo nhãn (`D-01`) |
