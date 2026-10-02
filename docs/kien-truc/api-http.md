# API HTTP — tham chiếu

> **Vai trò:** hợp đồng HTTP của `apps/api` (NestJS). Đúng cho **mọi khách**, không chứa dữ liệu
> hay tên khách nào. Trạng thái triển khai nằm ở
> [`phat-trien/ke-hoach/tong-quan.md`](../phat-trien/ke-hoach/tong-quan.md); thủ tục bật ở
> [`phat-trien/van-hanh/checklist-go-live.md`](../phat-trien/van-hanh/checklist-go-live.md).
>
> **Nguồn sự thật là code.** Danh sách dưới đây sinh từ các `*.controller.ts`; khi sửa route phải
> sửa cả tài liệu này **và** danh sách `@api` trong [`deploy/netviet/Caddyfile`](../../deploy/netviet/Caddyfile)
> — `caddy-route-contract.test.mjs` đọc ngược từ controller và làm đỏ CI nếu Caddy thiếu đường đi.

---

## 1. Nguyên tắc chung

| Mục | Giá trị |
|---|---|
| Kiểu dữ liệu | JSON (`Content-Type: application/json`), UTF-8 |
| Phiên bản | **Không có** `/v1`. API nội bộ, đổi cùng lúc với app web trong một lần deploy |
| Múi giờ | Mọi mốc thời gian là chuỗi ISO-8601 UTC (`2026-08-13T01:23:45.678Z`) |
| Tiền | Số nguyên VND, **không** thập phân, không dấu phân cách |
| Chọn khách | Theo tiến trình, bằng biến `TENANT` / `TENANT_DIR` lúc boot — **không** truyền qua header hay query. Một tiến trình phục vụ đúng một khách |
| Cổng vào | Người dùng đi qua Caddy: hostname `operator.*` và `demo.*`. Đường nào không nằm trong matcher `@api` sẽ rơi xuống Next.js và trả **trang 404 HTML** chứ không phải JSON |

### Header dùng chung

| Header | Bắt buộc | Ý nghĩa |
|---|---|---|
| `x-api-key` | khi `AUTH_MODE=api-key` | Khoá tĩnh, so sánh theo thời gian hằng số |
| `x-actor` | không | Người thao tác, ghi vào nhật ký thay đổi. Thiếu → `operator`. **Miền vận tải KHÔNG đọc header này** — xem ghi chú dưới bảng |
| `x-request-id` | không | Nối một thao tác với dòng nhật ký của nó |
| `Origin` | với mutation, khi `NODE_ENV=production` và `AUTH_MODE≠none` | Chống CSRF cho nhóm `/zalo` và `/settings`; sai origin → **403** |
| `x-csrf-token` | với mutation, khi `AUTH_MODE=session` | Lấy từ `GET /auth/csrf` hoặc `POST /auth/login` |

> ⚠️ **`x-actor` không phải danh tính đã xác thực — nó là một dòng chữ do bên gọi tự khai.** Sáu bề
> mặt nền tảng (`orders`, `settings`, `campaigns`, `content`, `notifications`, `channels`) vẫn nhận
> nó vì lịch sử, và ở đó nó chỉ ghi vào nhật ký thay đổi.
>
> **Miền vận tải (`/transport/*`) đã bỏ hẳn header này** kể từ T3R: `recordedBy`, `closedBy`,
> `takenBy` và `AuditLog.actor` của vận tải đi vào các bảng **không sửa, không xoá** (`INV-20`), nên
> một cái tên tự khai ở đó là bằng chứng giả **vĩnh viễn**. Danh tính vận tải chỉ đến từ
> `transportActorOf()` (`apps/api/src/transport/transport-actor.ts`) với ba nguồn do **máy chủ**
> dựng lên. Xem [transport-domain-contract.md](transport-domain-contract.md).
>
> Danh tính bền vững cho **toàn nền tảng** (`AuditLog.actorUserId` thay cho tên đăng nhập) là việc
> riêng ở tầng nền tảng, chưa làm.

### Hình dạng lỗi

Chuẩn NestJS, không bọc thêm:

```json
{ "statusCode": 400, "message": "Cần manifest để xem trước", "error": "Bad Request" }
```

Vận tải và quản trị tài khoản (`/settings/users`, `/auth`) **thêm** trường `reason` (mã có kiểu) và
đôi khi `detail` — ba trường chuẩn giữ nguyên. Bảng mã của tài khoản ở §3.4 "Người dùng"; của
quyền vận tải, nối tài khoản và địa điểm vận hành ở §3.11.

| Mã | Khi nào |
|---|---|
| `400` | Body/param không qua zod. Thông điệp nêu đúng trường sai |
| `401` | Chưa đăng nhập / sai `x-api-key` |
| `403` | Sai vai, sai `Origin`, thao tác ngoài allowlist nhóm, hoặc thiếu quyền hành động vận tải (`reason: "ACTION_NOT_PERMITTED"`, §3.11) |
| `404` | Không có bản ghi — **hoặc** đường dẫn chưa được Caddy định tuyến (khi đó thân trả về là HTML) |
| `409` | Xung đột trạng thái (duyệt đơn đã gửi, chuyển trạng thái campaign không hợp lệ) |
| `429` | Vượt giới hạn tần suất của route |
| `503` | Thành phần phụ thuộc chưa cấu hình (ví dụ kho thành viên nhóm) |

---

## 2. Xác thực

Một biến quyết định toàn bộ: **`AUTH_MODE`**.

| `AUTH_MODE` | Cách gọi | Dùng ở đâu |
|---|---|---|
| `none` | Không cần gì cả. CORS mở, không kiểm `Origin`, `RolesGuard` **cho qua hết** | Chỉ demo/dev với dữ liệu TEST. Đang bật trên pilot theo quyết định vận hành 04/08/2026 |
| `api-key` | Gửi `x-api-key: <API_KEY>` | Máy gọi máy |
| `session` | Cookie phiên + `x-csrf-token`. **Chỉ ở chế độ này phân quyền theo vai mới có hiệu lực** | Bắt buộc trước khi chạy dữ liệu khách thật |

> ⚠️ `RolesGuard` trả `true` ngay khi `AUTH_MODE≠session`. Cột "Vai" ở các bảng dưới mô tả **luật
> sẽ áp dụng khi bật `session`** — không phải thứ đang được thi hành trên bản demo hiện tại.

### Luồng đăng nhập (`AUTH_MODE=session`)

```
GET  /auth/config           -> { "mode": "session" }
POST /auth/login            -> { user, csrfToken }        + đặt cookie phiên
GET  /auth/me               -> { user, roles, permissions }
POST /auth/logout
```

Đổi mật khẩu: `POST /auth/credentials/change` — trả `{ user, csrfToken }` với token **mới** (phiên
được tạo lại): client phải thay token cũ bằng token này, nếu không lần ghi kế tiếp trượt CSRF. Mọi
mutation sau đăng nhập phải kèm `x-csrf-token`; token lấy lại bất cứ lúc nào bằng `GET /auth/csrf`.

**`#395` — quyền và mật khẩu tạm:**

- `GET /auth/me.permissions` là tập quyền **hiệu lực** do máy chủ tính: quyền nền tảng
  (`platform.accounts.manage` — chỉ `ADMIN`) cộng quyền của mọi miền đã đăng ký (vận tải:
  `transport.*`, gồm vai khởi điểm ± quyền riêng của tài khoản). Web chỉ hiện lại, không tự suy từ vai.
- `user` của `/auth/login` và `/auth/me` mang thêm `mustChangePassword`, `temporaryPasswordExpiresAt`,
  `jobTitle`, `permissionGrants` (thêm trường, không đổi trường cũ).
- Tài khoản mới tạo hoặc vừa được đặt lại mật khẩu dùng **mật khẩu tạm** (72 giờ). Khi
  `mustChangePassword = true`, mọi route trả **`403 { reason: "PASSWORD_CHANGE_REQUIRED" }`** trừ
  `GET /auth/me`, `POST /auth/credentials/change`, `POST /auth/logout`. Cổng nằm trong
  `SessionAuthGuard` — chỗ duy nhất đặt `request.authUser` — nên REST, SSE `/events` và tải tệp
  `/files` đều qua nó.
- Đăng nhập bằng mật khẩu tạm đã hết hạn (sau khi mật khẩu đúng) →
  **`401 { reason: "TEMPORARY_PASSWORD_EXPIRED" }`**, "Mật khẩu tạm đã hết hạn. Nhờ Giám đốc cấp mật
  khẩu mới."; phiên đang mở của tài khoản đó cũng hết hiệu lực (401).
- Đổi vai / quyền riêng có hiệu lực ở **yêu cầu kế tiếp** của cùng phiên (không cần đăng nhập lại).
  Khoá tài khoản hoặc đặt lại mật khẩu làm **mọi phiên cũ** của tài khoản đó chết (401).

### Bốn vai

`SALE` · `ACCOUNTING` · `MANAGER` · `ADMIN`.

Nguyên tắc đang áp dụng: **đọc mở cho cả bốn vai; mọi thao tác chạm nguồn sự thật, chạm tiền, hoặc
chạm công tắc vận hành đều siết còn `MANAGER` + `ADMIN`.** Quản lý người dùng chỉ `ADMIN`. Miền vận
tải dùng vai làm **vai khởi điểm** cộng quyền riêng của từng tài khoản — §3.11.

---

## 3. Bản đồ endpoint

Ký hiệu: **·** = không khai báo vai (mọi phiên hợp lệ đều gọi được) · **PUBLIC** = không cần đăng nhập.

### 3.1 Xác thực — `/auth`

| Method | Path | Vai | Giới hạn |
|---|---|---|---|
| GET | `/auth/config` | PUBLIC | |
| GET | `/auth/csrf` | PUBLIC | |
| POST | `/auth/login` | PUBLIC | 5 lần / 60s |
| GET | `/auth/me` | · | Mở cả khi đang dùng mật khẩu tạm |
| POST | `/auth/logout` | · | Mở cả khi đang dùng mật khẩu tạm |
| POST | `/auth/credentials/change` | · | Mở cả khi đang dùng mật khẩu tạm; trả `csrfToken` mới |

### 3.2 Dòng sự kiện — `/events`

| Method | Path | Vai |
|---|---|---|
| SSE | `/events` | SALE · ACCOUNTING · MANAGER · ADMIN |

`text/event-stream`, mỗi sự kiện là một JSON trong trường `data`. Đây là đường app web nhận tiến
trình 6 vai agent, đơn mới và đổi trạng thái theo thời gian thực. Caddy tắt buffer cho route này
(`flush_interval -1`).

### 3.3 Đơn hàng — `/orders` (bí danh `/messages`)

Hai tiền tố trỏ cùng một controller; `/messages` giữ cho tương thích ngược.

| Method | Path | Vai | Ghi chú |
|---|---|---|---|
| GET | `/orders` | 4 vai | Danh sách đơn |
| GET | `/orders/:id` | 4 vai | |
| POST | `/orders/:id/approve` | SALE · MANAGER · ADMIN | Sale duyệt đơn đang chờ; gửi lặp bị chặn theo trạng thái |
| POST | `/orders/:id/reject` | SALE · MANAGER · ADMIN | |
| POST | `/orders/:id/sales-handoff/complete` | SALE · MANAGER · ADMIN | Đánh dấu **đã nhập ERP thủ công**. GĐ1 không gọi ERP nên đây là cách duy nhất đóng hàng việc |

### 3.4 Nguồn sự thật vận hành — `/settings`

Mặc định lớp: đọc cho cả 4 vai.

| Method | Path | Vai | Giới hạn |
|---|---|---|---|
| GET | `/settings/summary` | 4 vai | |
| GET | `/settings/readiness` | 4 vai | 9 cổng go-live máy tự chấm |
| GET | `/settings/audit` | 4 vai | Lọc theo `actor`/`action`/`entityType`/`entityId` |
| GET | `/settings/source-truth/:resource` | 4 vai | |
| PUT | `/settings/source-truth/:resource` | MANAGER · ADMIN | |
| PUT | `/settings/source-truth/:resource/:id` | MANAGER · ADMIN | |
| GET | `/settings/rules` | 4 vai | |
| POST | `/settings/rules` | MANAGER · ADMIN | Tạo bản nháp (`{ payload }`) |
| POST | `/settings/rules/:id/preview` | MANAGER · ADMIN | Chạy thử trên đơn mẫu |
| POST | `/settings/rules/:id/activate` | MANAGER · ADMIN | Body `{ "confirmed": true }` |
| PUT | `/settings/automation/auto-send` | MANAGER · ADMIN | Body `{ "enabled": boolean }` — kill switch, **không phải** policy tenant |
| PUT | `/settings/groups/:chatId/mapping` | MANAGER · ADMIN | Gán nhóm Zalo cho đại lý |
| PUT | `/settings/groups/:chatId/hidden` | MANAGER · ADMIN | Gỡ/đưa lại nhóm. **Không xoá hàng** |

#### Kỳ giá — `/settings/price-periods`

Cổng go-live nặng nhất đi qua đây: tra giá **fail-closed**, chỉ nhận kỳ `active` đúng tháng hiện tại.

| Method | Path | Vai | Giới hạn |
|---|---|---|---|
| GET | `/settings/price-periods` | 4 vai | |
| POST | `/settings/price-periods` | MANAGER · ADMIN | 20 / 60s |
| POST | `/settings/price-periods/:id/copy` | MANAGER · ADMIN | 20 / 60s |
| POST | `/settings/price-periods/:id/import/preview` | MANAGER · ADMIN | |
| POST | `/settings/price-periods/:id/import/apply` | MANAGER · ADMIN | 10 / 60s |
| POST | `/settings/price-periods/:id/validate` | MANAGER · ADMIN | |
| POST | `/settings/price-periods/:id/activate` | MANAGER · ADMIN | |

Trình tự bắt buộc: tạo kỳ → nhập/sửa giá → `validate` → `activate`. Không có đường ghi thẳng.

#### Dữ liệu chủ — `/settings/master-data`

| Method | Path | Vai | Giới hạn |
|---|---|---|---|
| GET | `/settings/master-data` | · | |
| POST | `/settings/master-data/import/preview` | SALE · MANAGER · ADMIN | 10 / 60s |
| POST | `/settings/master-data/import/apply` | MANAGER · ADMIN | 5 / 60s |
| PUT | `/settings/master-data/dealers/:id` | SALE · MANAGER · ADMIN | 30 / 60s |
| DELETE | `/settings/master-data/dealers/:id` | MANAGER · ADMIN | 15 / 60s |
| PUT | `/settings/master-data/deals/:id` | SALE · MANAGER · ADMIN | 30 / 60s |
| DELETE | `/settings/master-data/deals/:id` | MANAGER · ADMIN | 15 / 60s |
| PUT | `/settings/master-data/groups/:chatId` | SALE · MANAGER · ADMIN | 30 / 60s |
| DELETE | `/settings/master-data/groups/:chatId/mapping` | MANAGER · ADMIN | 15 / 60s |

#### Nội dung tư vấn — `/settings/content`

`:kind` ∈ `asset` · `faq` · `advice` · `link`.

| Method | Path | Vai | Giới hạn |
|---|---|---|---|
| GET | `/settings/content` | · | |
| POST | `/settings/content/reload` | MANAGER · ADMIN | 10 / 60s |
| POST | `/settings/content/import/preview` | SALE · MANAGER · ADMIN | 20 / 60s |
| POST | `/settings/content/import/apply` | SALE · MANAGER · ADMIN | 10 / 60s — body `{ manifest, confirmed: true }` |
| POST | `/settings/content/:kind` | SALE · MANAGER · ADMIN | 30 / 60s |
| PUT | `/settings/content/:kind/:id` | SALE · MANAGER · ADMIN | 30 / 60s |
| PUT | `/settings/content/:kind/:id/status` | MANAGER · ADMIN | 30 / 60s |

Vòng đời bắt buộc: `draft → reviewed → approved → active`. **Chỉ `active` mới được dùng để trả lời
khách**; nội dung nhập từ gói khách luôn vào ở `draft`.

#### Người dùng — `/settings/users`

Tài khoản & phân quyền (`#395`). Mọi route chỉ `ADMIN` — quyền nền tảng `platform.accounts.manage`,
**không cấp được bằng quyền riêng** (một `MANAGER` được cấp mọi quyền vận tải vẫn nhận 403 ở đây).
Mọi route nằm dưới `/settings/users*` — tiền tố Caddy đã cổng; không mở tiền tố mới.

| Method | Path | Vai | Giới hạn | Ghi chú |
|---|---|---|---|---|
| GET | `/settings/users?q=&status=active\|pending\|disabled&role=` | ADMIN | | `AccountView[]`; `pending` = chờ đổi mật khẩu tạm |
| GET | `/settings/users/permission-catalog` | ADMIN | | `{ domains: [{ id, groups, presets }], platform }` |
| POST | `/settings/users/suggest-username` | ADMIN | | `{ name, prefix? }` → `{ username }` (bỏ dấu, `đ`→`d`, thêm `.2`… khi trùng); `200` |
| POST | `/settings/users` | ADMIN | 10 / 60s | Xem "Tạo / đặt lại" dưới đây |
| PATCH | `/settings/users/:id` | ADMIN | | `{ name?, email?, phone?, jobTitle? }`; `username` bất biến |
| GET | `/settings/users/:id/access` | ADMIN | | `AccessBreakdown`: vai khởi điểm, quyền riêng, trạng thái từng việc, câu "Người này làm được gì?" |
| PUT | `/settings/users/:id/access` | ADMIN | | `{ role, grants, confirmEscalation?, dryRun? }` — thay **trọn** bộ quyền riêng; `dryRun` → `AccessBreakdown` của bộ đề xuất (không ghi, không kiểm toán); ghi thật → `{ account, access }` |
| PATCH | `/settings/users/:id/role` | ADMIN | | Đường cũ: `{ role, confirmEscalation? }` — đổi vai **và xoá mọi quyền riêng** trong cùng một giao dịch |
| POST | `/settings/users/:id/disable` | ADMIN | | `{ confirmed: true, reason?: string ≤ 500 }`; `200` |
| POST | `/settings/users/:id/enable` | ADMIN | | **Mới.** `{ confirmed: true }`; **không** đổi mật khẩu; `200` |
| POST | `/settings/users/:id/credentials/reset` | ADMIN | 5 / 60s | `{ password? }` — xem dưới |
| GET | `/settings/users/:id/history?limit=` | ADMIN | | `[{ at, actor, action, summary, before, after }]` từ `AuditLog` (`entityType = 'User'`), gồm cả `auth.login` |

`AccountView` = người dùng như `/auth/me.user` **cộng** `mustChangePassword`,
`temporaryPasswordExpiresAt`, `jobTitle`, `permissionGrants: [{ permission, effect: ALLOW|DENY }]`,
`isProtected`.

**Tạo / đặt lại — thay đổi hợp đồng (thêm trường, không bỏ trường nào):**

- Phản hồi `POST /settings/users` và `POST …/credentials/reset` vẫn là tài khoản **ở mức ngoài**
  như trước, **thêm** `credential: { temporaryPassword, expiresAt }`. Mật khẩu tạm chỉ xuất hiện
  trong **đúng phản hồi này** — không vào sổ kiểm toán, telemetry hay log.
- `password` **tuỳ chọn** ở cả hai: bỏ trống thì máy chủ sinh mật khẩu tạm 16 ký tự
  (`xxxx-xxxx-xxxx-xxxx`, bảng chữ không gây nhầm). Dù có nhập hay không, tài khoản **luôn** phải đổi
  mật khẩu ở lần đăng nhập đầu (`mustChangePassword = true`, hạn 72 giờ) — kể cả trên màn hình
  `/settings` của các khách vận hành.
- Tạo mới thêm `jobTitle?`, `grants?` (mặc định `[]`), `confirmEscalation?`. Tạo vai `ADMIN` bắt buộc
  `confirmEscalation: true`.
- **Đặt lại mật khẩu KHÔNG còn mở khoá tài khoản.** Trước `#395` bản Prisma lặng lẽ xoá `disabledAt`
  khi đặt lại (bản bộ nhớ thì không). Tài khoản cũ bị di trú `20260812162000_auth_sessions` khoá
  (`legacy_*`, mật khẩu `!legacy-user-disabled-until-reset!` — chú thích "An administrator must
  explicitly reset/re-enable them") nay khôi phục bằng **`POST …/enable` rồi
  `POST …/credentials/reset`**.

**Lỗi có kiểu** — thân lỗi `{ statusCode, message (tiếng Việt), error, reason, detail? }`:

| `reason` | Mã | Khi nào |
|---|---|---|
| `SELF_LOCKOUT` | 403 | Tự khoá / tự đổi vai-quyền / tự đặt lại mật khẩu qua đường quản trị (dùng `/auth/credentials/change`) |
| `LAST_ACTIVE_ADMIN` | 409 | Khoá hoặc hạ vai Giám đốc **đang hoạt động cuối cùng**. Đếm dưới khoá (`SELECT … FOR UPDATE` trong một giao dịch) nên hai Giám đốc hạ vai nhau cùng lúc vẫn còn một |
| `PROTECTED_SERVICE_ACCOUNT` | 409 | Khoá / đổi vai-quyền / đặt lại tài khoản có tên trong env `PROTECTED_ACCOUNT_USERNAMES` (deploy GCP truyền `PILOT_OPERATOR_USERNAME` — người vận hành mà `bootstrap-auth-user.mjs` đòi là ADMIN đang hoạt động). Sửa tên vẫn được |
| `USERNAME_RESERVED` | 409 | **Chỉ khi tạo mới**: tên dành cho hệ thống (`operator`, `internal-service`, `system`, `import`, `mcp-agent`, `marketing-form` + tên miền khai, vd `demo-seed`). Tài khoản `operator` **đã có** (ADMIN thật trên gd1-test) vẫn đăng nhập bình thường |
| `ACCOUNT_LINKED_TO_DRIVER` | 409 | Đổi vai / quyền sang một vai **khác `SALE`** khi tài khoản đang nối hồ sơ lái xe — kể cả khi vai không đổi (tài khoản văn phòng còn nối do dữ liệu cũ); miền trả qua `checkAccessChange`. Gỡ nối ở `PUT /transport/drivers/:driverId/account` trước (§3.11) |
| `ACCESS_INVALID` | 409 | Bộ quyền bị từ chối; `detail.violations = [{ code, permission?, detail? }]` (vd `ADMIN_PRESET_IS_FULL`, `DRIVER_PRESET_IS_SELF_SCOPE_ONLY`, `SOD_CONFLICT`, `UNKNOWN_PERMISSION`, `PLATFORM_PERMISSION_NOT_GRANTABLE`, `GRANT_DUPLICATED`) |
| `ESCALATION_CONFIRMATION_REQUIRED` | 409 | Cấp vai Giám đốc hoặc quyền nhạy cảm mà thiếu `confirmEscalation: true`. `detail: { violations, actions }` — `actions` là các mã quyền nhạy cảm cần xác nhận (rỗng khi chỉ là nâng lên Giám đốc) |
| `ACCOUNT_NOT_FOUND` | 404 | |
| `ACCOUNT_IDENTITY_TAKEN` | 409 | Tên đăng nhập / email / số điện thoại đã thuộc tài khoản khác |
| `ACCOUNT_INPUT_INVALID` | 400 | Thân yêu cầu sai hình dạng (`detail.issues`) |

Mỗi thay đổi ghi `AuditLog` có `before` + `after` với khoá sống qua lớp che: `auth.user.create`,
`auth.user.profile.update` (`profile: { name, jobTitle, emailOnFile, phoneOnFile }`),
`auth.user.access.change` (`role`, `grants`), `auth.user.access.escalate` (lên Giám đốc hoặc thêm
quyền nhạy cảm — nêu từng mã), `auth.user.disable` (`disabledAt`, `reason`), `auth.user.enable`,
`auth.credentials.reset` / `auth.credentials.change`
(`onboarding: { passwordChangeRequired, temporaryCredentialExpiresAt }`).

### 3.5 Kênh Zalo — `/zalo`

Cả nhóm yêu cầu **MANAGER · ADMIN**, và mutation kiểm `Origin`.

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/zalo/status` | Trạng thái kênh + danh tính Bot |
| GET | `/zalo/qr` | Ảnh QR dạng data URL; chưa sẵn sàng → 404 |
| GET | `/zalo/groups` | Nhóm tài khoản đang thấy |
| POST | `/zalo/login` | Body **`{ acceptedRisk: true, acceptedSecondaryAccount: true }`** — hai xác nhận riêng (rủi ro ToS · tài khoản phụ/SIM riêng). Ghi `zalo.login.risk_accepted` vào nhật ký **trước** khi tạo QR |
| POST | `/zalo/logout` | Body `{ confirmed: true }` |
| PUT | `/zalo/allowed-groups` | Body `{ groupIds: string[] }`, tối đa 10 |
| POST | `/zalo/groups/:groupId/members/sync` | 5 / 60s. Ngoài allowlist → 403; chưa map → 400 |

### 3.6 Thành viên nhóm — `/groups`

| Method | Path | Vai |
|---|---|---|
| GET | `/groups/:groupId/participants` | SALE · MANAGER · ADMIN |
| PATCH | `/groups/:groupId/participants` | SALE · MANAGER · ADMIN |
| PATCH | `/groups/:groupId/participants/:participantId` | SALE · MANAGER · ADMIN |

Phân loại gồm `customerRank` · `operationalRole` · `handlingMode`. Đồng bộ **không bao giờ** đánh
ai là không hoạt động và **không** ghi đè phân loại người vận hành đã đặt.

### 3.7 Chiến dịch CSKH — `/campaigns`

| Method | Path | Vai | Giới hạn |
|---|---|---|---|
| GET | `/campaigns` | · | |
| GET | `/campaigns/policy` | · | Cấu hình phân bổ/spacing của tenant |
| GET | `/campaigns/:id` | · | |
| POST | `/campaigns` | SALE · MANAGER · ADMIN | 20 / 60s |
| POST | `/campaigns/:id/approve` | MANAGER · ADMIN | 10 / 60s |
| POST | `/campaigns/:id/schedule` | MANAGER · ADMIN | 10 / 60s |
| POST | `/campaigns/:id/retry-failed` | MANAGER · ADMIN | 10 / 60s |
| POST | `/campaigns/:id/cancel` | MANAGER · ADMIN | 10 / 60s |

Không có đường "gửi ngay": bản nháp phải được duyệt rồi lên lịch, và các lần gửi được phân bổ
trong cửa sổ thời gian.

### 3.8 Danh mục & demo

| Method | Path | Vai |
|---|---|---|
| GET | `/knowledge/summary` · `/knowledge/products` · `/knowledge/groups` · `/knowledge/glossary` | 4 vai |
| POST | `/knowledge/reload` | MANAGER · ADMIN |
| GET | `/demo/config` · `/demo/samples` · `/demo/groups` | SALE · MANAGER · ADMIN |
| POST | `/demo/simulate` | SALE · MANAGER · ADMIN |
| POST | `/demo/rerun/:id` | SALE · MANAGER · ADMIN |

`/demo/simulate` bơm một tin nhắn giả lập qua **đúng pipeline thật** — dùng cho kịch bản demo và
cho smoke test lúc deploy.

### 3.9 Nền tảng Tệp — `/files`

> Hợp đồng đầy đủ: [`nen-tang-tep.md`](nen-tang-tep.md) · nguồn: `#287`

| Method | Path | Vai | Ghi chú |
|---|---|---|---|
| POST | `/files` | 4 vai | `multipart/form-data`, trường `file` + `purpose`. 30 lần/phút |
| GET | `/files/:fileId` | 4 vai | Mô tả tệp — **không** định vị kho |
| GET | `/files/:fileId/content` | 4 vai | Trả byte; `nosniff` + `sandbox` + `no-store` |
| POST | `/files/:fileId/links` | 4 vai | Gắn tệp vào một đối tượng nghiệp vụ |
| POST | `/files/:fileId/withdraw` | 4 vai | Bịa mờ — byte vẫn còn, lịch sử ở lại |
| POST | `/files/:fileId/legal-hold` | **ADMIN** | Đặt/gỡ lệnh giữ pháp lý — chặn dọn byte |

**Bốn vai ở đây KHÔNG phải cổng thật.** Chúng chỉ trả lời "có phải một người đã đăng nhập không";
còn "người này có được xem TỜ NÀY không" là câu mà nền tảng hỏi lại **miền sở hữu** đối tượng
nghiệp vụ mà tệp đang gắn vào. Một tài khoản `ACCOUNTING` gọi `GET /files/:id` trên một tệp không
thuộc hồ sơ nào của họ nhận **403**, đúng như một tài khoản `SALE`.

`/files/:fileId/legal-hold` là tuyến duy nhất ở đây chốt bằng vai, và vì một lý do khác hẳn: lệnh
giữ thuộc về **hồ sơ lưu trữ của cả tổ chức**, không về một đối tượng nghiệp vụ cụ thể — nên không
có miền nào để hỏi.

**Mã lỗi:** một mã không tồn tại và một mã có thật nhưng không phải của người gọi trả **cùng** một
`403 FILE_NOT_AVAILABLE_TO_CALLER`. Nếu khác nhau, thử lần lượt các mã là đếm được bao nhiêu tệp có
thật trên hệ thống.

**Không có URL công khai vĩnh viễn nào.** `GET /files/:fileId/content` là đường duy nhất byte ra
ngoài, và nó đi qua cổng quyền mỗi lần.

### 3.10 Sức khoẻ & hệ thống ngoài

| Method | Path | Vai | Ghi chú |
|---|---|---|---|
| GET | `/health` | PUBLIC | `{ status, uptimeSeconds }` |
| GET | `/health/media` | · | Kèm `reachability` — kết quả **chạm thật** vào kho ảnh |
| GET | `/erp/products` · `/erp/orders` | · | Cổng `ErpPort`. **GĐ1 không gọi trong luồng đơn**; `/kiotviet/*` là bí danh cũ |
| POST | `/broadcast` | SALE · MANAGER · ADMIN | Mặt tiền tương thích ngược, **đã tắt đường gửi thật** — dùng `/campaigns` |

`/health/media` trả:

```json
{
  "storage": { "name": "gcs", "enabled": true, "state": "healthy" },
  "downloads": { "attempted": 0, "succeeded": 0, "failed": 0, "inflight": 0 },
  "reachability": { "healthy": true, "detail": "gcs: doc duoc bucket <ten> bang ADC" }
}
```

> `storage.state` suy ra từ **bộ đếm tải ảnh**, nên trước khi có ảnh đầu tiên nó luôn là `healthy`
> kể cả khi bucket không tồn tại. Chỉ `reachability` mới là bằng chứng cấu hình đúng.

### 3.11 Vận tải — quyền, nối tài khoản, địa điểm vận hành (`#395`)

> Bản đồ đầy đủ của `/transport/*` nằm ở các tài liệu miền `transport-*.md`; mục này chỉ ghi
> những gì `#395` đổi ở hợp đồng HTTP. Mô hình quyền: [transport-domain-contract.md](transport-domain-contract.md)
> §11.5 · địa điểm vận hành: [transport-geospatial.md](transport-geospatial.md) §7.2 · bãi xe của
> khâu lập kế hoạch: [transport-run-planning.md](transport-run-planning.md) §2.2.

**Cổng quyền của route vận tải.** Route khai `@RequiresTransportAction(<mã>)` được
`TransportActionGuard` quyết bằng **tập quyền hiệu lực** của tài khoản (vai khởi điểm ± quyền riêng,
đọc lại từ DB ở mỗi yêu cầu). Khi guard đó nằm trong chuỗi guard của route, `RolesGuard` **nhường**
cho nó: `@Roles(...)` trên route vận tải chỉ còn là tài liệu và lưới fail-closed khi route thiếu
guard miền. Hệ quả: một tài khoản `MANAGER` được cấp đúng mã gọi được route ghi `@Roles('ADMIN')`;
vai ghi ở tài liệu miền là **vai khởi điểm**, không phải trần. Thiếu quyền trả:

```json
{
  "statusCode": 403,
  "message": "Bạn không có quyền thực hiện thao tác này.",
  "error": "Forbidden",
  "reason": "ACTION_NOT_PERMITTED",
  "detail": { "action": "transport.vehicle.manage" }
}
```

Trước `#395` thân này chỉ có một câu không dấu kèm mã hành động trong `message`. Các chỗ kiểm quyền
**trong mã** (điều xe, che toạ độ theo dõi, quyền tải tệp chứng từ, địa điểm của đơn vị khác) hỏi
cùng một hàm `canPerformTransportAction` với guard.

**Nối tài khoản đăng nhập với hồ sơ** — quyền `transport.account_link.manage`, chỉ Giám đốc (không
cấp được bằng quyền riêng):

| Method | Path | Giới hạn | Ghi chú |
|---|---|---|---|
| PUT | `/transport/drivers/:driverId/account` | 20 / 60s | `{ authUserId: string \| null }` (strict); `null` = gỡ nối. Trả hồ sơ lái xe. Lần gọi không đổi gì thì không ghi gì |
| GET | `/transport/account-links/:authUserId` | | `{ driver: { id, name, phone, status, vehicle: { id, registrationPlate } \| null } \| null, stakeholder: { id, name, status } \| null }` |
| PUT | `/transport/asset-ownership/stakeholders/:id/account` | 20 / 60s | Đường cũ, **đổi mã quyền** từ `transport.asset_ownership.manage` sang `transport.account_link.manage`; kiểm thêm tài khoản tồn tại và đang hoạt động |

- `POST /transport/drivers` và `PATCH /transport/drivers/:id` **không còn nhận `authUserId`** (thân
  strict → `400`): route PUT ở trên là đường ghi duy nhất của `TransportDriver.authUserId` từ HTTP.
- Lỗi nối: `ACCOUNT_LINK_USER_NOT_FOUND` (404) · `ACCOUNT_LINK_USER_DISABLED` ·
  `ACCOUNT_LINK_ROLE_MISMATCH` (tài khoản không phải vai Lái xe `SALE`) · `DRIVER_ACCOUNT_TAKEN` (đã
  nối hồ sơ lái xe khác — kể cả khi hai lần nối đua nhau, unique của DB dịch ra cùng mã) ·
  `ACCOUNT_LINK_DRIVER_INACTIVE` · `ASSET_STAKEHOLDER_ACCOUNT_TAKEN` — đều 409; `DRIVER_NOT_FOUND`
  (404). Gỡ nối luôn được, kể cả hồ sơ đã ngừng.
- Kiểm toán `transport.driver.account_link` / `transport.driver.account_unlink`, `before`/`after`
  là hồ sơ lái xe.

**Địa điểm vận hành** — `/transport/places/admin`, capability `transport-proof`:

| Method | Path | Quyền | Giới hạn | Ghi chú |
|---|---|---|---|---|
| GET | `/transport/places/admin?kind=&status=&q=` | `transport.geofence.read` | | `kind` = `DEPOT` \| `CUSTOMER_SITE` \| `PARTNER_SITE` \| `LEGACY_CUSTOMER`; `status` = `active` \| `inactive` \| `all` (mặc định `all`, lọc theo `effectiveStatus`); `q` ≤ 100 ký tự → `PlaceAdminView[]` |
| POST | `/transport/places/admin` | `transport.geofence.manage` | 30 / 60s | Tạo; `201` |
| PATCH | `/transport/places/admin/:id` | `transport.geofence.manage` | 60 / 60s | `{ name?, address?, point?, radiusMetres?, note?, acknowledgeOpenWork? }` |
| POST | `/transport/places/admin/:id/deactivate` | `transport.geofence.manage` | | `{ reason (1..500), acknowledgeOpenWork? }`; `200` |
| POST | `/transport/places/admin/:id/activate` | `transport.geofence.manage` | | `{}`; `200` |
| POST | `/transport/places/admin/:id/make-primary-depot` | `transport.geofence.manage` | | `{ acknowledgeOpenWork? }`; `200` |
| GET | `/transport/places/admin/:id/history` | `transport.geofence.read` | | `[{ at, actor, action, entityType, before, after }]` — dấu vết của hàng rào và của địa điểm pháp nhân gắn với nó, mới nhất trước |

Không có route xoá. Mọi thân ghi là strict. Địa điểm của **đơn vị khác** (`COUNTERPARTY_SITE`) —
tạo, đổi tên, tắt, bật — đòi **thêm** `transport.counterparty.manage`, kiểm trong mã trên chính
người gọi; thiếu → `403 PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE`.

Thân tạo:

```text
{ kind: "DEPOT" | "COUNTERPARTY_SITE", name (1..200), address? (1..500 hoặc null),
  point: { latitude, longitude }, radiusMetres (số nguyên, trong khoảng bán kính của chính sách khách),
  note? (≤ 500), owner?, siteId? }
```

`owner` là **một** trong `{ counterpartyId }`, `{ customerId }`,
`{ newCounterparty: { name, taxCode? } }`; `siteId` gắn vị trí vào một địa điểm pháp nhân có sẵn
chưa có hàng rào. Bãi xe không nhận `owner`/`siteId`; máy chủ sinh mã `DEPOT-<CHỮ-KHÔNG-DẤU>` (thêm
`-2`, `-3`… khi trùng). Đã có bãi đang bật thì bãi mới được tạo **tắt** (bãi dự phòng).

`PlaceAdminView`:

```text
{ id, kind: DEPOT | COUNTERPARTY_SITE | CUSTOMER, displayKind, kindLabel, name, address,
  point: { latitude, longitude }, radiusMetres, status, effectiveStatus: ACTIVE | INACTIVE | OWNER_INACTIVE,
  note, owner: { counterpartyId, counterpartyName, customerId?, customerName?, siteId, siteName } | null,
  depot: { code, plannerStatus: IN_USE | STANDBY | AMBIGUOUS | NOT_IN_USE, source: MANAGED | TENANT_CONFIG } | null,
  conflicts: string[], updatedAt }
```

`kindLabel` là nhãn hiển thị: `Bãi xe` · `Địa điểm khách hàng` (pháp nhân chủ có liên kết khách
hàng) · `Nhà máy / kho đối tác` · `Điểm khách hàng (kiểu cũ)` (hàng rào `CUSTOMER` trước `#395`).
`conflicts` = tên các địa điểm đang hiệu lực khác trùng tên sau chuẩn hoá (dữ liệu cũ).

| `reason` | Mã | Khi nào |
|---|---|---|
| `PLACE_NOT_FOUND` | 404 | Không có hàng rào mang id đó, hoặc đó là loại không quản lý ở đây (cây xăng, điểm tạm). Chủ / địa điểm được chọn không tồn tại: `COUNTERPARTY_NOT_FOUND`, `CUSTOMER_NOT_FOUND`, `COUNTERPARTY_SITE_NOT_FOUND` (404) |
| `PLACE_OWNER_REQUIRED` · `PLACE_OWNER_INVALID` · `PLACE_SITE_OWNER_MISMATCH` · `PLACE_NOT_A_DEPOT` | 400 | Thiếu / sai chủ; địa điểm có sẵn không thuộc đơn vị đã chọn; "đổi bãi chính" trên một địa điểm không phải bãi |
| `GEOFENCE_COORDINATE_REJECTED` · `PLACE_OUTSIDE_SERVICE_AREA` · `GEOFENCE_RADIUS_OUT_OF_RANGE` | 400 | Toạ độ hỏng; ngoài vùng phục vụ; bán kính ngoài khoảng của chính sách khách |
| `PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE` | 403 | Xem trên |
| `PLACE_NAME_TAKEN` | 409 | Trùng tên (sau chuẩn hoá) với một địa điểm đang hiệu lực; `detail: { conflictName, conflictKindLabel, ownerName? }` |
| `DEPOT_CHANGE_AFFECTS_OPEN_WORK` | 409 | Đổi tên / tắt bãi đang bật, hoặc đổi bãi chính, khi còn vòng xe / đơn đang mở dùng bãi đó; `detail: { runs: [{ id, code }], orders: [{ id, code }], idleHours }`. Gửi lại với `acknowledgeOpenWork: true` để tiếp tục |
| `DEPOT_ALREADY_ACTIVE` · `DEPOT_CODE_TAKEN` | 409 | Bật một bãi khi bãi khác đang bật (dùng `make-primary-depot`); mã bãi trùng — cả hai cũng là chỉ mục unique của DB |
| `PLACE_OWNER_INACTIVE` · `PLACE_SITE_ALREADY_FENCED` · `COUNTERPARTY_SITE_NAME_TAKEN` · `COUNTERPARTY_TAX_CODE_TAKEN` | 409 | Chủ đã ngừng; địa điểm có sẵn đã có hàng rào; trùng tên địa điểm trong cùng pháp nhân; mã số thuế đã thuộc pháp nhân khác |

**Đường cũ đổi theo:**

- `POST /transport/geofences` đi qua **cùng** khoá ghi và luật trùng tên với mọi loại hàng rào
  (→ `409 PLACE_NAME_TAKEN`; va chạm chỉ mục bãi xe → `DEPOT_ALREADY_ACTIVE` / `DEPOT_CODE_TAKEN`),
  vẫn nhận mã bãi tuỳ ý, và nay ghi kiểm toán `transport.geofence.register`. Hàng rào cho địa điểm
  của đơn vị khác (`COUNTERPARTY_SITE`, `CUSTOMER`) qua đường này cũng cần thêm
  `transport.counterparty.manage` như màn quản trị → thiếu thì
  `403 PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE`.
- `PATCH /transport/counterparties/:counterpartyId/sites/:siteId` đổi **tên** hoặc **trạng thái** của
  một địa điểm đã có hàng rào (mọi trạng thái) → `409 COUNTERPARTY_SITE_MANAGED_AS_PLACE`; địa chỉ,
  ghi chú vẫn sửa được ở đây.
- `GET /transport/places/known` chỉ trả hàng rào **còn hiệu lực thật** (hàng rào, địa điểm, pháp
  nhân, khách đều đang hoạt động). Mỗi địa điểm thêm hai trường: **`kindLabel`** — cùng nhãn với
  `PlaceAdminView.kindLabel` (cùng hàm `fenceKindLabel()`), nên một kho của pháp nhân có liên kết
  khách hàng là "Địa điểm khách hàng" ở cả Tạo đơn lẫn màn quản trị — và **`address`** (`null` khi
  chưa nhập). `detail` = tên chủ (pháp nhân của `COUNTERPARTY_SITE`, khách của `CUSTOMER` cũ; bãi xe
  để trống).
- `GET /transport/planning/policy` trả thêm `depot.source` (`MANAGED` | `TENANT_CONFIG`).

---

## 4. Readiness — `GET /settings/readiness`

Máy tự chấm 9 cổng bắt buộc; `goLiveReady = true` **chỉ khi cả 9 cổng `ready`**.

Chín cổng: `tenant.loaded` · `price.current_period` · `dealers.configured` · `groups.mapped` ·
`parser.production` · `media.production` · `channel.production` · `auth.production` ·
`golden.evaluated`. Thiếu dữ liệu thì báo `missing` kèm mã máy đọc được — **không đoán là đạt**.

Hai nhóm không chặn: `campaign.data` và `business.*` (các nghiệp vụ tenant khai báo là đang khoá).

---

## 5. Những chỗ dễ hiểu nhầm

1. **404 kèm thân HTML ≠ không có bản ghi.** Đó là đường dẫn chưa nằm trong matcher `@api` của
   Caddy nên rơi xuống Next.js. Đã từng làm màn nhập bảng giá không dùng được trên bản deploy.
2. **Vai chỉ có hiệu lực khi `AUTH_MODE=session`.** Trên bản demo hiện tại mọi vai đều qua.
3. **API không tính lại tiền theo yêu cầu của client.** Giá/ship/VAT do rules engine tính từ nguồn
   sự thật; body gửi lên không ghi đè được số tiền.
4. **Không có endpoint xoá tin/đơn.** Zalo không phát lại tin nên mất là mất vĩnh viễn; muốn ngừng
   một nhóm thì dùng `PUT /settings/groups/:chatId/hidden` (đảo ngược được).
5. **`AUTO_SEND` là kill switch vận hành, không phải ngưỡng nghiệp vụ.** Ngưỡng tự xác nhận nằm
   trong gói khách (`orderAutomation.maxAutoConfirmQuantity`).
