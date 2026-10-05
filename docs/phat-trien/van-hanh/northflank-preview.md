# Bản xem trước trên Northflank (Autopilot V4 / Phase 3)

> **Phạm vi:** đúng một mục — `transport-preview/gd1-test` — trên **Northflank Developer Sandbox**.
> Không production, không tenant khách, không Google Cloud. Issue: #443 (điều phối: #422). Rủi ro: **R3**.
>
> Liên quan: [ci-cd.md](ci-cd.md) (7 bất biến) · [tin-hieu-deploy.md](tin-hieu-deploy.md) (4 tín hiệu deploy) ·
> [danh-tinh-release.md](danh-tinh-release.md) (release identity).

## 1. Vì sao có tài liệu này

Runtime proof của Phase 3 (`autopilot-runtime-proof.yml`) từng deploy lên VM GCP qua Workload Identity
Federation và chết ở `google-github-actions/auth` (`unauthorized_client`). Chủ repo đã bỏ Google Cloud, nên
**không sửa WIF** — đường deploy của mục xem trước được chuyển sang Northflank. Đường VM/GCP cho Ultty,
Amico, Wata **giữ nguyên từng ký tự** (`reusable-deploy-tenant.yml` chỉ thêm một bước từ chối hàng không
phải `gcp-vm`).

## 2. Kiến trúc

```
main (R0/R1 auto-merge) ─► ci.yml xanh ở đúng SHA
        └─► autopilot-runtime-proof ─► preflight (chỉ đọc, không OIDC)
                └─► reusable-deploy-northflank.yml   (git_sha = SHA CI vừa xanh, KHÔNG phải main hiện tại)
                        1. checkout đúng SHA, HEAD == git_sha
                        2. resolver (chung với đường VM) → provider = northflank
                        3. exact-main CI (vô điều kiện)
                        4. PREFLIGHT Northflank: token · project · mật khẩu vận hành
                        5. build image chung → lớp mỏng (gói mẫu + Caddy + BUILD_REVISION) → GHCR, theo DIGEST
                        6. PATCH web rồi api · đợi rollout · health QUA EDGE · smoke tất định (2 pha quanh restart)
                        7. deploy-signals/v1 (artifact) ─► runtime-report ─► RUNTIME_PROOF_PASSED / FAILED

Northflank project `nexagnet-dev`  (Sandbox: tối đa 2 service + 2 job + 1 addon)
 ├─ service `web`  ─ CÔNG KHAI ─ Caddy :3000 ─┬─ 35 route API ──► api:3001   (X-Forwarded-Proto https ép cứng)
 │                                            └─ còn lại ───────► Next :3100 (loopback)
 ├─ service `api`  ─ NỘI BỘ  ─ migrate → operator → seed → Nest :3001
 ├─ addon  `postgres` (PostgreSQL 16)
 └─ secret group `preview-secrets` (API_KEY, SESSION_SECRET, PILOT_OPERATOR_PASSWORD,
                                    TRANSPORT_DEMO_DRIVER_PASSWORD + DATABASE_URL liên kết từ addon)
```

Chỉ `web` công khai: Sandbox chỉ có 2 service nên Caddy ở **cùng container** với Next, và `api` không có đường
nào đi vòng qua edge (bản Northflank + Cloudflare ở PR #324 phải công khai cả api rồi mới phát hiện chính sách
cổng của Sandbox bị API nuốt im lặng — ở đây không có gì để khóa).

## 3. Chuỗi bằng chứng exact-SHA

PASS chỉ khi **cả năm mắt xích** khớp; mất một là `RUNTIME_PROOF_FAILED`.

| #   | Mắt xích                                                                                     | Ai khẳng định                                                                                                        | Nơi kiểm                                                                     |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | SHA đã có CI `success` trên `main`                                                           | GitHub Actions API                                                                                                   | `Verify exact main SHA passed CI` + `assertPreviewRequest`                   |
| 2   | Image build từ checkout **đúng SHA** đó                                                      | `docker build` (nhãn revision) + `BUILD_REVISION` nướng trong image                                                  | bước `Build and push preview image`                                          |
| 3   | Northflank chạy `ghcr.io/…@sha256:<digest>` đó, có container **mới**, không còn container cũ | Northflank API (`imagePath`, containers)                                                                             | `waitForRollout` (`sameImage`, `freshRunning`)                               |
| 4   | **Tiến trình đang chạy** tự khai cùng SHA                                                    | `release.json` mount cùng PATCH + `assert-image-identity.mjs` lúc boot (image == manifest) + `/observability/traces` | `deterministic-smoke.mjs` (`EXPECTED_RELEASE_SHA`, nguồn phải là `manifest`) |
| 5   | Bằng chứng đến từ **đúng provider**                                                          | `release.provider == northflank` trong `deploy-signals/v1`                                                           | `evaluateDeploySignals` (`SIGNALS_PROVIDER_MISMATCH`)                        |

Fail closed ở mọi chỗ: thiếu/sai SHA, thiếu/hết hạn token, sai provider, sai mục tiêu, image không bám digest,
image GHCR chưa công khai, Northflank chạy digest khác, container cũ còn sống, health/smoke hỏng, restart
không lên, thiếu baseline cho pha sau restart. Tầng cứng **chỉ phát `pass` hoặc `fail`** (không bao giờ
`timeout`): evaluator cũ chỉ coi `fail` là hỏng cứng.

## 4. Giới hạn đã biết — và lệch CÓ CHỦ Ý so với VM

| Chủ đề                                                                                  | Trên Northflank                                                                                                                        | Hệ quả                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tệp/media**                                                                           | `MEDIA_STORE=none` (hồ sơ khai `gcs` — GCP). Sandbox chỉ có **1 addon** (đã dùng cho Postgres) nên không có MinIO/S3, và không volume. | Nền tảng tệp (ảnh bằng chứng chuyến) trả `403 FILE_STORE_DISABLED` — **fail-closed, không mất byte nào** vì không byte nào được nhận. **Postgres vẫn bền vững.** Runtime proof không cần tệp.                                                                                                                                                                                    |
| **Image mang gói khách**                                                                | Image xem trước = image chung + **một** gói tổng hợp `tenants/transport-preview`.                                                      | Lệch có kiểm soát so với bất biến #1/#2 ([ci-cd.md](ci-cd.md) §2): image **chung** vẫn không có gói nào (`image-isolation.contract.mjs`); chỉ artifact xem trước mang gói _tổng hợp, không dữ liệu khách_. Sandbox không có volume để mount gói từ ngoài như Compose. Cùng ngoại lệ `.dockerignore` mà Railway đã dùng. Test khóa: đúng một thư mục `tenants/transport-preview`. |
| **CSP / `x-api-key`**                                                                   | Edge không áp CSP của VM, không tiêm `x-api-key`.                                                                                      | Route nội bộ (`InternalServiceGuard`) không tới được từ Internet. Khoảng trống CSP là **chưa đo** trên Northflank.                                                                                                                                                                                                                                                               |
| **Smoke**                                                                               | Cùng `deterministic-smoke.mjs`, **hai pha** quanh restart api+web (như VM).                                                            | Không làm yếu cổng (bất biến #7).                                                                                                                                                                                                                                                                                                                                                |
| **Rollback**                                                                            | Không tự rollback (đúng chính sách runtime proof: không rollback, không promote).                                                      | Northflank giữ revision cũ để người đưa về.                                                                                                                                                                                                                                                                                                                                      |
| **Live AI / quan sát / kênh**                                                           | `skipped` có lý do (hồ sơ không bật).                                                                                                  | Không phải `pending`.                                                                                                                                                                                                                                                                                                                                                            |
| **Preflight GCP** (`gd1-test-baseline`: kiểm kê bí mật Secret Manager, digest rollback) | Không áp dụng.                                                                                                                         | Cổng exact-main CI, main-only và allowlist mục tiêu **giữ nguyên**.                                                                                                                                                                                                                                                                                                              |

## 5. Thiết lập MỘT LẦN (người có quyền — Claude không tự làm các bước đổi tiền/đổi vùng)

> **Chưa được chạy bởi Claude.** Các thân JSON dưới đây theo tài liệu API Northflank (`--help` của CLI đã
> kiểm cờ), **chưa thực thi** vì cần quyết định vùng + phương thức thanh toán. Sai lệch phát hiện ở lần chạy
> đầu → sửa tài liệu này.

### 5.0 Hai quyết định chỉ chủ tài khoản đưa ra được

1. **Vùng của project — KHÔNG đổi được sau khi tạo.** Các vùng hiện có (`northflank list regions`):
   `europe-west`, `europe-west-netherlands`, `europe-west-frankfurt`, `europe-west-zurich`, `us-central`,
   `us-east1`, `us-east-ohio`, `us-west`, `us-west-california`, `canada-central`, `southamerica-east`,
   `asia-southeast`, `asia-northeast`, `asia-east`, `asia-south-delhi`, `australia-southeast`, `africa-south`.
   Gợi ý: **`asia-southeast`** (GCP `asia-southeast1`, Singapore) — gần người dùng Việt Nam nhất. Lần thử trước
   (NF-1, 17–18/09/2026) dùng `europe-west`. Chưa biết Sandbox có giới hạn vùng không; vùng không ảnh hưởng mã.
2. **Phương thức thanh toán mặc định.** Northflank từ chối **mọi** lệnh `create` (HTTP 409) khi tài khoản chưa
   có, kể cả gói Developer Sandbox ("Please complete your account by adding a default payment method").
   Thêm thẻ là thao tác thanh toán — chỉ chủ tài khoản làm.

### 5.1 Project, addon, secret group, hai service

```bash
northflank create project --file project.json      # {"name":"nexagnet-dev","region":"<vùng đã chọn>","description":"Autopilot Phase 3 preview"}
northflank create addon   --projectId nexagnet-dev --file addon.json
northflank create secret  --projectId nexagnet-dev --file secret-group.json
northflank create service deployment --projectId nexagnet-dev --file api.json
northflank create service deployment --projectId nexagnet-dev --file web.json
```

- `addon.json`: `{"name":"postgres","type":"postgresql","version":"16-latest","billing":{"deploymentPlan":"nf-compute-10","storage":4096,"replicas":1}}`.
  Kiểm `SELECT * FROM pg_extension WHERE extname='btree_gist'` — migration `transport_costing` cần nó, và
  user runtime không có `CREATE` trên database (đã đo 18/09/2026 trên Northflank: extension có sẵn).
- `secret-group.json`: `name` **`preview-secrets`**, `secretType: "environment"`, `priority: 10`,
  `data`: `API_KEY`, `SESSION_SECRET` (≥ 32 ký tự), `PILOT_OPERATOR_PASSWORD` (12–128 ký tự),
  `TRANSPORT_DEMO_DRIVER_PASSWORD` — **sinh ngẫu nhiên, không in ra, không dán vào chat**;
  `addonDependencies: [{"addonId":"postgres","keys":[{"keyName":"POSTGRES_URI","aliases":["DATABASE_URL"]}]}]`;
  `restrictions: {"restricted":true,"nfObjects":[{"id":"api","type":"service"}]}`.
  Tên nhóm và khóa `PILOT_OPERATOR_PASSWORD` là hằng số của `preview-contract.mjs` — CI đọc mật khẩu này từ
  đây để smoke đăng nhập (không có bản sao trong GitHub).
- `api.json` / `web.json`: service **`api`** / **`web`** (đúng ID — registry `northflank-sandbox`), plan
  `nf-compute-10` hoặc `nf-compute-20` (Sandbox giới hạn cỡ; nếu API từ chối vì cỡ → dừng, đừng thử mù), một
  instance, image giữ chỗ công khai bất kỳ. **CI sẽ ghi đè** image, lệnh khởi động, cổng, biến môi trường, tệp
  runtime và health check ở mỗi lần deploy (`buildServicePatch`), nên không cần cấu hình chúng ở đây.
- Sau khi tạo, đọc lại bằng `northflank get service` để xác nhận ID `api` và `web`.

### 5.2 Gói GHCR phải công khai (một lần, sau lần push đầu tiên)

Northflank kéo `ghcr.io/<owner>/<repo>/preview` **không kèm thông tin đăng nhập**. Gói mới tạo mặc định
**private**. Sau lần push đầu: GitHub → Packages → `…/preview` → _Package settings_ → _Change visibility_ →
**Public**. Image không chứa bí mật (bí mật nằm ở secret group; gói mẫu là dữ liệu tổng hợp; mã nguồn của repo
đã công khai). Trước đó lần deploy dừng ở `IMAGE_NOT_PUBLIC` — **trước khi động vào service nào**.

### 5.3 Token Northflank cho GitHub Actions

Đăng nhập trình duyệt trên máy dev **không** phải xác thực cho GitHub Actions. Tạo:

1. **Role** (Team settings → API → Roles → Create role), tên gợi ý `github-actions-preview`,
   **giới hạn ở project `nexagnet-dev`**, đúng các quyền sau (tên nội bộ trong ngoặc):

   | Quyền                                                                                                                      | Dùng cho                                                                                                                                                                      |
   | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Project › Projects › Manage › **Read** (`ps_projects_manage_read`)                                                         | preflight: project có tồn tại                                                                                                                                                 |
   | Project › Services › General › **Read** (`ps_services_general_read`)                                                       | trạng thái rollout, container, URL công khai                                                                                                                                  |
   | Project › Services › General › **Update** (`ps_services_general_update`)                                                   | `PATCH …/services/deployment/{id}` và `POST …/restart`                                                                                                                        |
   | Project › Secrets › Services › **Update** (`ps_secrets_services_update`)                                                   | PATCH ghi `runtimeEnvironment`/`runtimeFiles` _(tài liệu API chỉ nêu quyền này cho endpoint runtime-environment cũ; nếu PATCH đã đủ với quyền Update ở trên thì bỏ dòng này)_ |
   | Project › Secrets › Secret groups › **Read keys** + **Read values** (`ps_secrets_secretGroups_read-keys`, `…_read-values`) | đọc `PILOT_OPERATOR_PASSWORD` để smoke đăng nhập                                                                                                                              |

   Nếu lần restart đầu trả 403 dù đã có Update → thêm `ps_services_general_restart`.
   **Không** cấp: tạo/xóa bất cứ thứ gì, addon, job, billing, phạm vi team/org, project khác.

2. **API token** sinh **từ role đó** (Team settings → API → Tokens → Create API token, _Associated RBAC Role_
   = role trên; nên đặt ngày hết hạn). Sao chép giá trị **một lần**.
3. **GitHub Environment secret** — repo `nexagnet/nexagnet-platform` → Settings → Environments → **`gd1-test`**
   → _Environment secrets_ → **`NORTHFLANK_API_TOKEN`**. (Environment, không phải repository secret: chỉ job
   khai `environment: gd1-test` đọc được, và chịu cổng duyệt của environment đó.)

Giá trị token **không bao giờ** vào repo, nhật ký, comment hay chat. Workflow đưa nó vào `env:` của đúng hai
bước (preflight, deploy) và **không** truyền cho tiến trình smoke (có test khóa).

### 5.4 Lần chạy đầu tiên

Chạy tay `deploy-tenant` (`tenant=transport-preview`, `environment=gd1-test`) từ `main` — nó đi qua đúng
`reusable-deploy-northflank.yml`. Đọc **Step Summary** + artifact `deploy-signals-transport-preview-gd1-test`.
Sau đó mới tạo Issue R0 `TARGET: transport-preview/gd1-test` để chứng minh đường tự động.

## 6. Mã lý do (đọc từ `deploy-signals.json` → `reasons`)

| Tầng               | Mã                                                                                                                                                 | Nghĩa / việc cần làm                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| rollout            | `PROVIDER_NOT_NORTHFLANK`, `TARGET_NOT_ALLOWED`, `GIT_SHA_INVALID`, `IMAGE_REF_INVALID`, `NORTHFLANK_ID_INVALID`, `REF_NOT_MAIN`, `CI_NOT_SUCCESS` | yêu cầu sai — lỗi ở registry/workflow, không phải Northflank                                                         |
| rollout            | `NORTHFLANK_CREDENTIALS_MISSING`                                                                                                                   | chưa đặt secret `NORTHFLANK_API_TOKEN` (§5.3)                                                                        |
| rollout            | `NORTHFLANK_AUTH_FAILED`                                                                                                                           | token hết hạn / sai role / sai project (HTTP 401/403 trong `details`)                                                |
| rollout            | `NORTHFLANK_PROJECT_NOT_FOUND`, `NORTHFLANK_SERVICE_NOT_FOUND`                                                                                     | chưa tạo project/service (§5.1) hoặc sai ID                                                                          |
| rollout            | `OPERATOR_SECRET_MISSING`                                                                                                                          | secret group `preview-secrets` thiếu/ngắn `PILOT_OPERATOR_PASSWORD`                                                  |
| rollout            | `IMAGE_NOT_PUBLIC`, `IMAGE_REGISTRY_UNREACHABLE`                                                                                                   | gói GHCR còn private (§5.2) / GHCR không tới được                                                                    |
| rollout            | `WEB_PUBLIC_URL_UNKNOWN`                                                                                                                           | service `web` chưa có cổng công khai                                                                                 |
| rollout            | `ROLLOUT_FAILED`, `ROLLOUT_TIMEOUT`                                                                                                                | Northflank báo FAILED / không xong trong 15 phút / chạy digest khác / container cũ còn sống (`details.imageMatches`) |
| health             | `WEB_EDGE_UNREACHABLE`, `API_HEALTH_FAILED`, `WEB_PAGE_FAILED`                                                                                     | edge chết / api không khỏe **qua edge** / Next hỏng                                                                  |
| deterministicSmoke | mã của chính smoke (`RELEASE_IDENTITY_MISMATCH`, `PERSISTENCE_CONTRACT_FAILED`, …)                                                                 | giữ nguyên lý do cụ thể                                                                                              |
| deterministicSmoke | `DETERMINISTIC_HARNESS_ERROR`, `DETERMINISTIC_NO_SIGNAL`, `DETERMINISTIC_BASELINE_MISSING`                                                         | smoke chết không kể lý do / không báo pass / không phát baseline                                                     |
| deterministicSmoke | `RESTART_FAILED`, `RESTART_TIMEOUT`, `POST_RESTART_HEALTH_FAILED`                                                                                  | nửa sau của cổng (bền vững qua restart)                                                                              |
| (bất kỳ)           | `DEPLOY_HARNESS_ERROR`                                                                                                                             | lỗi bất ngờ của chính công cụ — đọc `details.message` (đã xóa token)                                                 |

Runtime proof thêm: `SIGNALS_SHA_MISMATCH`, `SIGNALS_TARGET_MISMATCH`, `SIGNALS_PROVIDER_MISMATCH`,
`SIGNALS_NOT_PASSING`, `SIGNALS_MISSING`.

## 7. CHƯA được chứng minh (cho tới lần chạy live đầu tiên)

Toàn bộ tài liệu API Northflank được đọc từ tài liệu, **chưa gọi thật** (chưa có project/token). Các giả định
cần xác nhận ở lần chạy đầu — mỗi cái đều **fail closed** và có mã lý do riêng, nên sai thì lộ ra chứ không
cho xanh giả:

- `GET /services/{id}` trả `ports[].dns` và `status.deployment.status`; `deployment.external.imagePath` khớp
  image đã PATCH (so sánh bỏ tiền tố `ghcr.io/`).
- `PATCH` nhận `runtimeFiles` + `healthChecks` + `ports` trong một request và tạo **một** revision.
- `containers[].createdAt` là epoch **giây**; DNS nội bộ `api:3001` hoạt động giữa hai service cùng project.
- Plan Sandbox (`nf-compute-10/20`) đủ RAM cho api (Nest + Prisma + argon2) và web (Next + Caddy).
- Khởi động api (migrate + seed) hoàn tất trong cửa sổ startup probe (5 phút).
- `deterministic-smoke.mjs` chạy được qua edge HTTPS (cookie `secure` + `X-Forwarded-Proto`).
- Image, Caddyfile và container `web` (Caddy + Next) được kiểm trên binary thật **trong CI** (job `images`,
  `preview-image.contract.mjs`) — không cần Northflank.
