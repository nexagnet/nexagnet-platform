# NỀN ĐỊA KHÔNG GIAN CHO TRANSPORT v2 — quyết định có số đo

> Lane B của #235 · sửa đổi phán quyết `POSTGIS` của R0 trong
> [transport-domain-v2.md §3.1](transport-domain-v2.md) · đo ngày **07/09/2026** trên
> `main = 669bfef61ba5baf2125ef41e064e29d5158e3c57`.

## 0. Phán quyết một dòng

**KHÔNG thêm PostGIS bây giờ.** Lưu toạ độ bằng hai cột `double precision` và đánh chỉ mục bằng
`cube` + `earthdistance` — hai extension **đã nằm sẵn trong mọi bản Postgres tiêu chuẩn**, kể cả
image `postgres:16-alpine` mà CI và `deploy/netviet/compose.yaml` đang chạy. Đo được: ở mọi quy mô
đã thử, bốn dạng truy vấn mà Lane B thật sự cần chạy **ngang nhau** trên hai đường, với **cùng một
dung lượng đĩa**.

PostGIS vẫn là câu trả lời đúng cho những việc Lane B **chưa** làm — hàng rào đa giác, lưu tuyến
`LINESTRING`, `ST_Simplify`, bản đồ nhiệt. Đường nâng cấp được giữ mở và chỉ cộng thêm (§6).

---

## 1. Ba điều R0 nói mà số đo không xác nhận

### `G-01` — `postgis/postgis:16-3.6` **không tồn tại**

R0 §3.1 ghi *"đổi image `postgres:16` → `postgis/postgis:16-3.6`"*. Liệt kê tag thật trên Docker
Hub (07/09/2026): mọi tag PostGIS **3.6** đều dựng trên **PG 17, 18 hoặc 19beta** —
`18-3.6`, `17-3.6-alpine`, `19beta1-3.6`, … **Không có `16-3.6`.** Bản mới nhất cho PG16 là
**`16-3.5`** / `16-3.5-alpine`.

Sai lệch này không phải chuyện chữ nghĩa: một lệnh `docker pull postgis/postgis:16-3.6` trong một
runbook sẽ **hỏng lúc triển khai**, và nó hỏng ở đúng bước mà cơ sở dữ liệu của khách đang dừng.

### `G-02` — ước lượng dung lượng của R0 thấp hơn thực đo khoảng **2 lần**

R0 §5 ước *"30 giây × 50 xe × 1 năm ≈ 2,4 GB dữ liệu bảng, cộng chỉ mục"*. Phần **heap** thì R0
ước đúng (90–110 byte/hàng; đo được 84,5 B/hàng cho cột `double precision`, 101 B/hàng cho
`geography`). Cái bị bỏ sót là **chỉ mục lớn gần bằng heap**. Tổng thực đo:
**228 byte/hàng** — nên con số phải là **≈ 5,0 GB**, không phải 2,4 GB.

### `G-03` — `earthdistance` **không** bị khai tử

Giả thiết dễ mắc (và tôi đã mắc trước khi kiểm) là `earthdistance` đã bị đánh dấu lỗi thời để đẩy
sang PostGIS. Đọc thẳng tài liệu: trang `earthdistance` của **PG 18** và của **nhánh phát triển
(PG 19)** đều **không có** một dòng khai tử, lỗi thời hay dự kiến gỡ bỏ nào. Điều tài liệu có nói
là mô hình của nó: *"the Earth is assumed to be perfectly spherical"* — tức hình cầu, không phải
ellipsoid, và gợi ý PostGIS **nếu độ chính xác đó chưa đủ**. §3 đo xem "đủ" là bao nhiêu.

---

## 2. Số đo

Hai container trên cùng một máy, cùng dữ liệu tổng hợp trong hành lang Hà Nội–Hải Phòng
(kinh 105,6–107,2 · vĩ 20,5–21,9), cùng lược đồ 7 cột, cùng hai chỉ mục (không gian + `(xe, thời
điểm)`).

- **A** — `postgis/postgis:16-3.5-alpine`, cột `geography(Point,4326)`, chỉ mục **GiST**,
  truy vấn `ST_DWithin`.
- **B** — `postgres:16-alpine` (đúng image CI đang chạy), hai cột `double precision`, chỉ mục
  **GiST trên `ll_to_earth(lat,lon)`**, truy vấn `earth_box(...) @> ... AND earth_distance(...)`.

### 2.1. Dung lượng và thời gian dựng — 4.380.000 hàng

| | A · PostGIS | B · Postgres tiêu chuẩn |
|---|---|---|
| heap | 422 MB | 353 MB |
| chỉ mục không gian | 304 MB | 366 MB |
| chỉ mục `(xe, thời điểm)` | 132 MB | 132 MB |
| **tổng** | **952 MB** | **944 MB** |
| **byte/hàng** | **228** | **226** |
| nạp 4,38 M hàng | 102,5 s | 81,1 s |
| dựng chỉ mục không gian | **145,3 s** | **435,9 s** |
| image | 724 MB | **420 MB** |

Hai điều đáng nhớ: **dung lượng bằng nhau** (chênh 0,8%), và **PostGIS dựng chỉ mục nhanh gấp 3
lần**. Cái thứ hai là lợi thế thật của PostGIS, nhưng nó chỉ trả giá một lần lúc `REINDEX`, không
phải mỗi ngày.

### 2.1b. Cái quyết định cho #224: gói phần mềm phải cài thêm

Đây là chỗ hai đường **không** ngang nhau, và nó là lý do thật của phán quyết:

| | Trên image `postgres:16-alpine` | Trên Ubuntu 24.04 của khách |
|---|---|---|
| `cube` + `earthdistance` | **có sẵn** (đã kiểm bằng `pg_available_extensions` trong container) | **có sẵn** — `earthdistance.control` nằm ngay trong gói `postgresql-16`, không phải một gói contrib riêng |
| PostGIS | **không có** — phải đổi image | phải `apt install postgresql-16-postgis-3` |

Nói cách khác: đường `cube`/`earthdistance` chạy được trên một PostgreSQL **cài mặc định** mà không
thêm một gói nào. Với mục tiêu "máy chủ của khách" ở #224, khác biệt đó lớn hơn mọi con số mili giây
trong bảng trên. Và nó cũng là lý do CI hiện tại chạy được ngay: hai job `integration` và
`workflow-integration` đang dùng đúng image `postgres:16-alpine` này.

### 2.2. Bốn truy vấn, hai quy mô

Thời gian thực thi (`EXPLAIN ANALYZE`, lần chạy nóng, mili giây). **Đây là một lần đo trên một máy
Windows/Docker — coi chênh lệch dưới ~2 lần là nhiễu.**

| Truy vấn | A @219k | B @219k | A @4,38M | B @4,38M |
|---|---|---|---|---|
| `Q1` tìm mọi điểm trong bán kính 200 m trên toàn lịch sử | 47,8 | **2,1** | 102,9 | **91,3** |
| `Q1b` cùng việc, **không chỉ mục**, haversine viết tay | — | 172,6 | — | **1 927** |
| `Q2` một điểm ⟂ 50 hàng rào (việc làm lúc nhận tin) | **0,52** | 1,76 | **0,94** | 3,20 |
| `Q3` 5 điểm gần nhất (KNN) | 9,10 | 9,82 | 3,45 | **2,06** |
| `Q4` quét liên tục 1 000 điểm của một xe | **17,1** | 32,5 | 50,8 | **21,4** |

**Đọc bảng này cho đúng:** không cột nào thắng. Cái thắng rõ ràng là **`Q1b` thua** — bỏ chỉ mục
làm truy vấn chậm **21 lần** ở 4,38 M hàng và tệ dần tuyến tính. Nên kết luận không phải "PostGIS
hay không", mà là **"phải có một chỉ mục không gian"** — và Postgres tiêu chuẩn đã có sẵn một cái.

`Q2` là truy vấn **chạy nhiều nhất trong đời hệ thống** (mỗi bản định vị nhận vào đều phải chấm với
tập hàng rào). Ở đó cả hai đều dưới 4 ms, và cả hai đều **không đụng bảng lịch sử** — nên trên thực
tế nó sẽ không chạy trong SQL chút nào: xem §4.

---

## 3. Sai số của mô hình hình cầu có đổi được kết luận nào không

Câu hỏi thật không phải "cái nào chính xác hơn" (PostGIS `geography` chính xác hơn — nó tính trên
ellipsoid WGS84) mà là **"sai số 0,5% có làm đổi một quyết định nào của hệ này không"**:

| Việc | Đại lượng | Sai số mô hình cầu | Đổi kết luận? |
|---|---|---|---|
| Hàng rào kho, bán kính 200 m | 200 m | ±1 m | Không — và sai số **thiết bị** ở đây là 8–80 m, lớn hơn hai bậc |
| Di chuyển bất khả thi, ngưỡng 55 m/s | 55 m/s | ±0,3 m/s | Không |
| Quãng đường một chặng, để người đọc ước lượng | 100 km | ±500 m | Không |
| Đo đạc / ranh giới pháp lý | — | — | **Có** — nhưng đó không phải việc của hệ này |

Sai số của **máy thu GPS trong điện thoại** (8–80 m ngoài trời, hàng trăm mét trong đô thị dày) lớn
hơn sai số **mô hình Trái Đất** hai bậc độ lớn. Chọn ellipsoid để "chính xác hơn" ở đây là làm mịn
một con số mà thứ đứng trước nó đã thô sẵn.

---

## 4. Nên tính hàng rào ở đâu — và vì sao không phải trong SQL

Phán quyết hàng rào **là một quyết định nghiệp vụ**, không phải một truy vấn. Nó phải:

- sinh ra một **mã lý do có kiểu** đi vào sổ quyết định (quy ước `.claude/rules/ecc/common/code-review.md`);
- phân biệt được **`INSIDE` / `OUTSIDE` / `INDETERMINATE`** — xem dưới;
- lặp lại được **y hệt** khi chạy lại, không phụ thuộc phiên bản extension của máy khách.

Nên nó nằm trong TypeScript tất định (`apps/api/src/transport/geo/geofence.ts`), chạy **lúc nhận
tin**, đối chiếu với vài chục hàng rào đang có hiệu lực. Đó là O(số hàng rào), không phải O(lịch
sử) — không cần chỉ mục nào cả. Đây cũng đúng nguyên tắc #5 của `CLAUDE.md`: luật lệ tất định nằm
trong TypeScript, không nằm trong nơi lưu trữ.

Chỉ mục không gian chỉ phục vụ **`Q1`/`Q3`** — tra cứu lịch sử của người điều hành ("xe nào đã qua
đây", "điểm gần nhất"). Đó là tính năng của bảng điều khiển, không phải của luồng quyết định.

### `INDETERMINATE` — phán quyết thứ ba, và lý do nó phải tồn tại

Một bản định vị **không phải một điểm**: nó là một điểm **kèm một bán kính sai số**. Nếu so điểm
với bán kính hàng rào mà bỏ qua sai số thì:

- một xe đứng **đúng trong kho** với tín hiệu kém (sai số 80 m) bị ghi là **ngoài** hàng rào;
- một xe đứng **ngoài đường** với tín hiệu kém bị ghi là **trong** hàng rào.

Cả hai là **kết luận sai được phát ngôn với vẻ chắc chắn tuyệt đối** — thứ nguy hiểm nhất mà một hệ
bằng chứng có thể làm. Nên `assessGeofences()` trả về ba giá trị, và `INDETERMINATE` là câu trả lời
trung thực cho *"hình học không đủ để nói"*.

### Cái bẫy tương tự ở phép kiểm di chuyển bất khả thi

Quãng đường chia thời gian là công thức ai cũng viết được, và nó **sai ngay ngày đầu chạy thật**:
khi xe **đứng yên**, hai bản định vị liên tiếp vẫn lệch nhau vài chục mét do nhiễu. Chia 60 m cho
0,5 giây ra 120 m/s — hệ thống sẽ tố một chiếc xe đang đỗ là "dịch chuyển tức thời", vài phút một
lần, cả ngày. Người trực sẽ tắt hết cảnh báo, và tầng chống gian lận về không.

Cách chữa (`continuity.ts`): **trừ sai số của cả hai bản định vị ra khỏi quãng đường trước khi
chia**. Phần còn lại là phần dịch chuyển mà hình học **không** giải thích được bằng nhiễu.

---

## 5. Khối lượng và lưu giữ — theo 228 byte/hàng đã đo

Số hàng/xe/năm: chỉ-theo-sự-kiện **2 190** · 30 giây × 10 h/ngày **438 000** · 10 giây × 10 h/ngày
**1 314 000**.

| Chế độ | 10 xe | 50 xe | 100 xe |
|---|---|---|---|
| **Chỉ theo sự kiện** (bắt đầu · đổ dầu · giao hàng) | 21,9 k hàng · **5 MB** | 110 k · **25 MB** | 219 k · **50 MB** |
| 30 giây/lần khi đang chạy | 4,38 M · **1,0 GB** | 21,9 M · **5,0 GB** | 43,8 M · **10,0 GB** |
| 10 giây/lần khi đang chạy | 13,1 M · **3,0 GB** | 65,7 M · **15,0 GB** | 131,4 M · **30,0 GB** |

*(đã gồm cả hai chỉ mục; một năm; chưa tính WAL và bản sao lưu)*

### Chính sách lấy mẫu đề nghị

Ba điều kiện phát một điểm khi **và chỉ khi** một chuyến đang chạy:

```text
đã đi >= 500 m kể từ điểm trước        (kích hoạt theo quãng đường)
HOẶC đã 300 giây kể từ điểm trước khi đang di chuyển
HOẶC đã 900 giây kể từ điểm trước khi đứng yên
VÀ   >= 30 giây kể từ điểm trước       (chặn trên, KHÔNG BAO GIỜ phá)
```

Điều quan trọng nhất là **cái chặn dưới 30 giây**, vì nó là thứ **duy nhất** làm chi phí có trần
tính được: dù xe chạy nhanh đến đâu, một xe không bao giờ vượt dòng "30 giây" trong bảng trên. Hai
điều kiện quãng đường/thời gian chỉ **giảm** số hàng so với trần đó — trên đường trường ~90 km/h,
mốc 500 m rơi đúng vào khoảng 20 giây nên chặn dưới sẽ khống chế, còn xe đỗ ở bãi chỉ sinh 4
điểm/giờ.

### Lưu giữ có hạn

Mặc định đề nghị: **90 ngày** ở độ phân giải đầy đủ. Với 100 xe ở chế độ 30 giây, đó là
**≈ 2,5 GB** — nằm gọn trên một VPS của #224. Quá 90 ngày thì giữ lại **bằng chứng** (bắt đầu, đổ
dầu, giao hàng — thứ gắn với một chứng từ tài chính) và bỏ các điểm bám đường.

Đây là điều mà #229 §3 gọi là "không lưu 1 Hz vô thời hạn", và cũng là **tối thiểu hoá dữ liệu** —
một nghĩa vụ kỹ thuật độc lập với việc chủ sở hữu đã xử lý xong phần pháp lý với lái xe (#232 D-02).

---

## 6. Đường nâng cấp lên PostGIS — chỉ cộng thêm, khi có việc cần

Ba việc mà `cube`/`earthdistance` **không** làm được, và nếu một trong ba xuất hiện thì đổi:

| Việc | Vì sao cần PostGIS |
|---|---|
| Hàng rào **đa giác** (khu công nghiệp hình chữ L mà hình tròn trùm cả quốc lộ) | `ST_Covers`; `earthdistance` chỉ có hình cầu và điểm |
| Lưu **tuyến** `LINESTRING` + `ST_Simplify` cho bản đồ | không có kiểu đường trong `cube` |
| Bản đồ nhiệt / gộp không gian cho phân tích | `ST_ClusterDBSCAN` và bạn bè |

Khi đó, các bước — **không đụng một hàng dữ liệu nào**:

1. đổi image sang `postgis/postgis:16-3.5-alpine` (**cùng PGDATA**, cùng volume: image PostGIS
   dựng trên chính image `postgres` chính thức nên không có bước nâng cấp dữ liệu);
2. `CREATE EXTENSION postgis;` — cần quyền superuser, và chỉ thêm kiểu/hàm/`spatial_ref_sys`;
3. thêm **cột sinh** `geography(Point,4326)` từ hai cột `double precision` đã có + chỉ mục GiST;
4. hai cột gốc **ở nguyên** làm nguồn sự thật khả chuyển.

Bước 3 là lý do phải lưu `double precision` ngay từ đầu: nó giữ cho nguồn sự thật **đọc được trên
một Postgres trắng** kể cả sau khi đã bật PostGIS.

> **Ranh giới sở hữu:** bước 1 sửa `deploy/netviet/compose.yaml`, mà tệp đó đang nằm trong PR #227
> (#224 tính khả chuyển). Lane B **không** đụng vào — và đó là một lý do nữa để đường "không cần
> extension" là đường đúng cho hôm nay.

---

## 7. Bản đồ — nền OpenFreeMap mặc định, lớp nghiệp vụ không đổi

*Cập nhật 23/09/2026 (#374, `OWNER_DECISION_UPDATE_2026_09_23`).* Lane N (#278) dựng bản đồ vòng chạy
bằng MapLibre + deck.gl trên một nền cục bộ **trống** (không tile). #374 thêm nền thật để người xem
thấy đường sá, địa danh, sông hồ. Kế hoạch đầu là Google Maps; chủ dự án không bật được thanh toán
GCP nên đổi quyết định: **nền mặc định là instance công khai của OpenFreeMap (style Liberty) qua
MapLibre sẵn có** — không khoá, không GCP, không thanh toán. Quyết định:

- **Nền là cấu hình, không phải kiến trúc.** Bốn nguồn: `OPENFREEMAP` (mặc định), `GOOGLE_MAPS`
  (**tuỳ chọn**, chỉ khi khai tường minh `provider=google`; Maps JavaScript API +
  `@deck.gl/google-maps`, mã tải lười), `CONFIGURED_STYLE_URL` (MapLibre + style tự khai — đường cho
  OpenFreeMap/PMTiles tự dựng), `LOCAL_FALLBACK` (CI, offline, cấu hình sai, nền ngoài hỏng).
- **Instance công khai không có SLA** ⇒ nền ngoài hỏng thì dựng lại bản đồ mới trên nền cục bộ, kèm
  lớp deck.gl mới; tuyến và mốc không bao giờ mất theo nền. Cần bảo đảm cao hơn: tự dựng hoặc chọn
  tường minh một nhà cung cấp thương mại — quyết định của chủ dự án.
- **Lớp nghiệp vụ chung mọi nền.** Tuyến, chặng RỖNG, mốc, vệt GPS thô là lớp deck.gl vẽ thẳng từ
  toạ độ máy chủ. Hình học của nền **không bao giờ** là sự thật quãng đường: `distanceKm` vẫn là số
  của nghiệp vụ, không tính lại, không ghi đè, không "bám đường".
- **Chỉ nền.** Không routing, Directions, Places, Geocoding, tối ưu tuyến — ở tầng nền. Tìm địa
  điểm cho màn tạo đơn (#379) **không** đi qua nhà cung cấp nền: nó là một cổng phía máy chủ riêng
  (§7.1).

Nhận xét của R0 về PMTiles vẫn đứng nguyên: kích thước tile Việt Nam **≈ 215 MB là ước tính suy từ
tỷ lệ của Hà Lan**, chưa dựng, chưa đo — đừng đưa con số đó vào một bảng chi phí.

Biến môi trường, phán quyết dự phòng, ghi nguồn, quyền riêng tư, đường nâng cấp, Google tuỳ chọn:
[`phat-trien/van-hanh/ban-do-nen.md`](../phat-trien/van-hanh/ban-do-nen.md).

### 7.1. Tìm địa điểm cho màn tạo đơn — cổng phía máy chủ, mặc định TẮT (#379)

*As-built 23/09/2026.* Đơn mới lưu **toạ độ** điểm lấy/giao (`TransportOrder.origin*`/
`destination*`); nhãn chữ chỉ để hiển thị. Người dùng có bốn cách đặt một điểm: bấm trên bản đồ,
chọn **địa điểm đã biết**, "Vị trí của tôi", hoặc **tìm theo chữ**. Chỉ cách cuối cần một bên thứ ba,
và nó là cách duy nhất được phép tắt mà màn hình vẫn tạo đơn được.

- **Cổng `TransportPlaceSearchPort`** (`apps/api/src/transport/places/`), capability
  `transport-core`. HTTP: `POST /transport/places/search` `{ query }` và
  `POST /transport/places/reverse` `{ latitude, longitude }` — **POST** để chuỗi tìm và toạ độ nằm
  trong thân, không nằm trong URL, nhật ký máy chủ hay `Referer` (cùng lý do `DispatchController`).
  Quyền: dùng lại `transport.order.manage` (ADMIN + ACCOUNTING), không thêm mã quyền mới.
- **Luôn 200, trạng thái có kiểu.** `OK | DISABLED | BUSY | UNAVAILABLE` kèm lý do
  (`PROVIDER_UNCONFIGURED`, `PROVIDER_NOT_APPROVED_FOR_CUSTOMER_DATA`, `PROVIDER_BUSY`,
  `PROVIDER_RATE_LIMITED`, `PROVIDER_UNAVAILABLE`). Tắt/bận/sập là trạng thái của tìm kiếm, không
  phải lỗi của người gọi; 400 chỉ cho đầu vào sai (chuỗi 2..200 ký tự, khoá lạ, điểm hỏng →
  `PLACE_POINT_INVALID`).
- **Mặc định TẮT** (`none`, không một lần gọi mạng). Nominatim chỉ bật khi khai tường minh **và**
  `DATA_CLASSIFICATION` khác `customer`: Nominatim **chưa** nằm trong danh sách bên thứ ba được duyệt
  cho dữ liệu khách thật (chỉ KiotViet + Claude API). Chỉ **chuỗi người dùng gõ** (hoặc điểm cần
  tìm ngược) đi ra ngoài — không mã khách, mã đơn, mã người dùng; danh sách tham số là đóng và có
  bài kiểm khoá cả tập khoá.
- **Cổng giới hạn toàn ứng dụng + bộ nhớ đệm.** Tối đa 1 lần gọi / 1100 ms cho cả tiến trình (chính
  sách Nominatim công khai: ≤ 1/giây): **1 lần gọi đang chạy + tối đa 3 yêu cầu chờ**; người chờ thứ
  tư nhận `BUSY` ngay, không ngủ vô hạn. Khoảng cách đo bằng đồng hồ đơn điệu (`performance.now`)
  và mỗi lần chờ bị kẹp ở 1100 ms — đồng hồ máy nhảy lùi không biến thành một lần chờ dài. Kết quả
  thành công được đệm 24 giờ trong **một** bộ nhớ đệm dùng chung cho tìm và tìm ngược (tổng tối đa
  500 mục, khoá `search|…` / `reverse|…`), khoá đã chuẩn hoá (NFC, gom khoảng trắng, chữ thường;
  tìm ngược làm tròn 5 chữ số); thất bại không đệm. Một tiến trình, một cổng — chạy nhiều
  bản sao api thì cần một kho dùng chung, và đó phải là một thay đổi có chủ đích.
- **Kết quả là GỢI Ý.** Toạ độ của một `PlaceCandidate` chỉ vào đơn khi người dùng bấm chọn; tầng
  này không ghi gì. Toạ độ nhà cung cấp đi qua `parseGeoPoint`, kết quả hỏng bị bỏ. Ghi nguồn
  `© OpenStreetMap contributors` (ODbL) đi kèm mọi kết quả thành công.
- **Địa điểm đã biết = hàng rào**, không phải một kho địa điểm thứ hai.
  `GET /transport/places/known` đọc `TransportGeofence` **còn hiệu lực thật** (từ `#395`, §7.2) qua
  cổng tuỳ chọn `KnownPlacesFacts` (adapter thuộc `transport-proof`): `DEPOT`, `COUNTERPARTY_SITE`
  (tên địa điểm + tên pháp nhân), `CUSTOMER` (+ tên khách); bỏ `FUEL_SUPPLIER` và `AD_HOC`. Từ
  `#395` mỗi địa điểm mang thêm `kindLabel` (cùng nhãn với màn "Địa điểm vận hành", bảng ở §7.2)
  và `address`. Khách không bật `transport-proof` nhận `{ available: false }` — khác với "có sổ,
  chưa khai địa điểm nào".
- **Telemetry**: bước `place.search` / `place.reverse`, quyết định `place.lookup` (từ vựng
  `places/place-decisions.ts`). `detail` chỉ có `operation`, `providerId`, `queryLength`,
  `resultCount`, `reason` — **không** chuỗi tìm, **không** toạ độ.
- **Đơn cũ không được geocode.** Đơn tạo trước #379, đơn chiếu từ chuyến v1 và đơn của bộ dữ liệu
  mẫu giữ toạ độ `NULL`; không đường nào suy toạ độ từ nhãn chữ cũ.
- **Điểm mẫu của bản xem trước** (`transport/demo/demo-places.ts`): bãi xe `DEPOT-HN` + hai địa điểm
  của hai pháp nhân mẫu, toạ độ **tổng hợp** (ghi chú nói rõ không phải toạ độ khảo sát), gieo từ
  `deploy/netviet/seed-transport-demo.mjs` và `reset-transport-demo.mjs`. Railway chạy bước này ở
  **mọi** lần khởi động, nên: mỗi điểm gieo **tối đa một lần** (hàng rào `recordedBy = demo-seed`
  cùng nhãn, mọi trạng thái, là dấu vết "đã gieo" — người vận hành đổi tên địa điểm hay mã số thuế
  thì lần sau không tạo bản sao); trùng nhãn chuẩn hoá với một hàng rào **đang hoạt động** thì bỏ qua
  (`LABEL_TAKEN_BY_ACTIVE_GEOFENCE`) thay vì tạo nhãn mơ hồ; **không** tạo liên kết khách; mỗi điểm
  chạy trong giao dịch `Serializable`, xung đột (P2034/P2002) thử lại đúng một lần; lỗi còn lại chỉ
  ghi log, không chặn api khởi động. Từ `#395`: bãi xe mẫu bỏ qua khi đã có **bất kỳ** hàng rào
  `DEPOT` nào, mọi trạng thái (`DEPOT_ALREADY_MANAGED`); dấu vết "đã gieo" của một địa điểm mẫu là
  pháp nhân mẫu **đã có một địa điểm mang hàng rào của máy gieo** (mọi trạng thái), không còn là nhãn
  — Giám đốc đổi tên ở màn "Địa điểm vận hành" thì lần khởi động sau không tạo lại bản mang tên cũ.

Biến môi trường và vận hành: [`ban-do-nen.md` §9](../phat-trien/van-hanh/ban-do-nen.md#9-tìm-địa-điểm-phía-máy-chủ-379--biến-môi-trường-của-api).

### 7.2. Địa điểm vận hành — một sổ, và sổ đó là sổ hàng rào (#395)

*As-built 25/09/2026, chưa có bằng chứng runtime.* Giám đốc khai bãi xe, kho của khách, nhà máy của
đối tác trên màn **"Địa điểm vận hành"** (nhóm QUẢN TRỊ, capability `transport-proof`). Không có
bảng địa điểm thứ hai: một địa điểm vận hành **là** một `TransportGeofence` — cùng sổ mà Tạo đơn,
điều xe, lập kế hoạch và chấm chứng cứ đã đọc. Hợp đồng HTTP: [api-http.md](api-http.md) §3.11.

**Loại và nhãn.** Màn này chỉ **tạo** hai loại hàng rào; hàng rào `CUSTOMER` cũ vẫn xem, sửa, tắt,
bật được nhưng không tạo mới; cây xăng (`FUEL_SUPPLIER`) và điểm tạm (`AD_HOC`) không quản lý ở đây.

| Hàng rào | Nhãn hiển thị | Chủ |
|---|---|---|
| `DEPOT` | **Bãi xe** | Chính công ty — không chọn chủ. Mã `DEPOT-<CHỮ-KHÔNG-DẤU>` do máy chủ sinh |
| `COUNTERPARTY_SITE`, pháp nhân chủ có liên kết khách hàng (`TransportCounterpartyLink` loại `CUSTOMER`) | **Địa điểm khách hàng** | Pháp nhân của khách |
| `COUNTERPARTY_SITE`, pháp nhân không liên kết khách | **Nhà máy / kho đối tác** | Pháp nhân đó |
| `CUSTOMER` (trước `#395`) | **Điểm khách hàng (kiểu cũ)** | Khách hàng |

Kho của một khách là một địa điểm của **pháp nhân** khách đó, đúng như dữ liệu mẫu đã gieo. Tạo một
địa điểm của đơn vị khác thì chọn chủ bằng **một** trong bốn cách: một khách hàng (dùng pháp nhân đã
nối; chưa có thì pháp nhân cùng mã số thuế; không có nữa thì tạo pháp nhân + liên kết `CUSTOMER`),
một pháp nhân có sẵn, một pháp nhân mới (tên, mã số thuế tuỳ chọn), hoặc gắn vị trí vào một địa
điểm pháp nhân có sẵn chưa có hàng rào (`siteId`). Pháp nhân, liên kết, địa điểm và hàng rào được ghi
trong **cùng một giao dịch**; mọi luật được kiểm trước lần ghi đầu tiên. Tên địa điểm pháp nhân **đi
theo** tên hàng rào (đổi tên là đổi cả hai, cùng giao dịch).

**Còn hiệu lực thật** (`isEffectivelyActive`, MỘT vị từ ở `geofence.repository.ts`): hàng rào
`ACTIVE`; với `COUNTERPARTY_SITE` thêm địa điểm **và** pháp nhân `ACTIVE`; với `CUSTOMER` thêm khách
`ACTIVE`; loại khác chỉ xét chính hàng rào. Dùng cho: địa điểm đã biết của Tạo đơn, sổ tra địa điểm
của điều xe, và luật trùng tên. Nhờ vậy tắt một pháp nhân / địa điểm / khách qua đường cũ **không**
cần lan sang hàng rào mà nơi đặt hàng rào vẫn biến mất ngay khỏi Tạo đơn và điều xe; màn quản trị
hiện nó là `OWNER_INACTIVE`. **Phán quyết chứng cứ không dùng vị từ này** — vẫn chấm theo trạng thái
thô của hàng rào, như trước `#395`.

**Luật trùng tên.** Một tên mới phải khác — sau `normalizePlaceLabel` (bỏ dấu, `đ`→`d`, chữ hoa, mọi
cụm ký tự không phải chữ-số thành một khoảng trắng; cùng hàm điều xe dùng để giải nhãn) — **mọi**
nhãn hàng rào còn hiệu lực thật của **mọi** loại và mọi tên địa điểm pháp nhân của chúng. Trùng →
`PLACE_NAME_TAKEN` (`detail: { conflictName, conflictKindLabel, ownerName? }`). Chỉ kiểm khi **tạo**,
**đổi tên** và **bật lại**: một lần sửa không đụng tới tên vẫn qua dù dữ liệu cũ đã có va chạm (màn
hình hiện va chạm đó trong `conflicts`). Lý do: hai hàng rào cùng khoá chuẩn hoá làm điều xe trả
`PICKUP_LABEL_AMBIGUOUS` cho cả hai.

**Tắt / bật, không xoá.** Không có đường xoá. Tắt một địa điểm pháp nhân tắt địa điểm **và mọi**
hàng rào của nó; bật lại bật địa điểm và hàng rào này sau khi kiểm lại tên, chủ còn hoạt động, và
(với bãi xe) không có bãi nào khác đang bật. Sửa vị trí, bán kính, hay tắt một địa điểm đổi phán
quyết chứng cứ của **cả những lần giao đã xong** (hàng rào chấm lúc đọc) — vì thế
`transport.geofence.manage` nằm trong `ACCOUNTING_DENIED` và là quyền leo thang
([transport-domain-contract.md](transport-domain-contract.md) §11.5). Địa điểm của đơn vị khác đòi thêm
`transport.counterparty.manage`.

**Bãi xe — hai bất biến sống ở DB** (di trú `20260925100100_transport_place_admin`, SQL thô, không
khai được trong `schema.prisma`):

```sql
CREATE UNIQUE INDEX "TransportGeofence_one_active_depot" ON "TransportGeofence" ((1))
  WHERE "subjectKind" = 'DEPOT' AND "status" = 'ACTIVE';          -- tối đa MỘT bãi đang bật
CREATE UNIQUE INDEX "TransportGeofence_depot_code_key" ON "TransportGeofence" ("subjectId")
  WHERE "subjectKind" = 'DEPOT';                                   -- mã bãi không trùng, kể cả bãi đã tắt
```

Di trú kiểm dữ liệu trước và dừng bằng một câu nói rõ cách sửa nếu đã có hơn một bãi đang bật hoặc
mã bãi trùng. Lần deploy hỏng đó để lại một dòng di trú hỏng trong `_prisma_migrations`: sửa dữ liệu
xong, **trước khi** deploy lại phải chạy
`prisma migrate resolve --rolled-back 20260925100100_transport_place_admin` — thiếu bước này
`migrate deploy` từ chối với `P3009` (câu báo lỗi của di trú và `README-rollback.sql` đều nói bước
này). `P2002` của hai chỉ mục được dịch thành `DEPOT_ALREADY_ACTIVE` / `DEPOT_CODE_TAKEN`. Bãi
mới tạo khi đã có bãi đang bật thì được tạo **tắt** (bãi dự phòng); đổi bãi chính
(`make-primary-depot`) là **một** giao dịch — tắt bãi cũ rồi bật bãi mới, không có khoảnh khắc nào
không bãi hay hai bãi. Bãi xe này là bãi của khâu lập kế hoạch
([transport-run-planning.md](transport-run-planning.md) §2.2).

**Cột `address`.** `TransportGeofence.address TEXT NULL` + `CHECK` không chuỗi trắng — chỉ để người
đọc; **không** phép so khớp nào dùng nó (vị trí là toạ độ + bán kính). Hàng rào cũ giữ `NULL`. Sổ
kiểm toán không bao giờ ghi địa chỉ thô (khoá `address` bị che) — chỉ ghi `addressChanged`.

**Đường ghi duy nhất.** Mọi lần ghi địa điểm — màn "Địa điểm vận hành" **và** route cũ
`POST /transport/geofences` cho mọi loại hàng rào — đi qua `PlaceWriteStore`
(`proof/place-write.store.ts`): Prisma chạy **một** `$transaction` `READ COMMITTED` mà câu lệnh đầu
tiên là `SELECT pg_advisory_xact_lock(39500030001)`, nên mọi phép đọc sau khoá thấy bản ghi người
trước vừa commit (điều `SERIALIZABLE` không cho — ảnh chụp của nó chụp trước khi chờ khoá); bản trong
bộ nhớ xếp hàng bằng một chuỗi promise. Khoá giữ luật trùng tên (đọc-rồi-ghi trên nhiều bảng); hai
chỉ mục của bãi xe chặn cả người ghi không đi qua khoá (máy gieo, script, psql). Route sửa địa điểm
pháp nhân cũ đổi **tên / trạng thái** của một địa điểm đã có hàng rào (mọi trạng thái) →
`409 COUNTERPARTY_SITE_MANAGED_AS_PLACE`.

**Kiểm toán và quan sát.** `transport.place.*` (`create`, `update`, `deactivate`, `activate`,
`make_primary_depot`), `entityType = TransportGeofence`, khoá `label`, `kind`, `code` (bãi xe), `point`,
`radiusMetres`, `status`, `addressChanged`, `owner`, `standby`, `acknowledgedOpenWork`, `reason`; địa
điểm pháp nhân giữ `transport.counterparty_site.*`, pháp nhân / liên kết mới ghi
`transport.counterparty.create` / `transport.counterparty.link`. Bước `place.write`, điểm quyết định
`place.write` — từ vựng `places/place-admin-decisions.ts`, chủ `transport-places-admin`, tách khỏi
`place.lookup` của §7.1. `detail` không mang toạ độ hay địa chỉ.

---

## 8. Cái vẫn phải để người xem

Lặp lại từ #229 §4 và R0 §4, vì nó là điều kiện của cả tầng này chứ không phải một ghi chú:

- **Không bao giờ tuyên bố chống được GPS giả.** Giả mạo ở tầng vô tuyến (SDR) không để lại một
  dấu vết phần mềm nào — máy thu báo trung thực một vị trí tính từ tín hiệu giả.
- Giả mạo có root/LSPosed vượt được `Location.isMock()`; các module làm việc đó đang được phát
  hành công khai và cập nhật.
- Mọi tín hiệu ở tầng này là **rủi ro để người xem lại**, không phải một cổng chặn nhị phân, và
  **không** bất thường nào được tự sinh ra công nợ, trừ lương hay kết luận gian lận (#232 D-02).

---

## 9. Cái tầng này để lại cho tranche sau

`apps/api/src/transport/geo/` — thuần hàm, không đọc DB, không đọc đồng hồ, không gọi mạng:

| Tệp | Việc |
|---|---|
| `geo-point.ts` | Kiểu `GeoPoint`, kiểm biên vào, **từ chối `(0,0)`**, khung hoạt động thô |
| `geodesy.ts` | Haversine, phương vị, tốc độ mặt đất |
| `geofence.ts` | Hàng rào tròn, phán quyết **ba giá trị**, phân định hoà bằng bán kính hẹp hơn |
| `continuity.ts` | Khoảng trống, dấu thời gian không tiến, di chuyển bất khả thi **đã trừ sai số** |
| `location-quality.ts` | Phân hạng `FINE`/`COARSE`/`POOR`/**`UNKNOWN`** |

51 bài kiểm (`GEO-001`, `GEO-002`, `GEO-003`, `GEO-010`, `GEO-020`, `GEO-030`, `GEO-031`,
`GEO-040`). Chưa có bảng, chưa có capability, chưa có tuyến HTTP — đó là tranche kế tiếp.
