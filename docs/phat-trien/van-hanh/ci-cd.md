# Quy trình CI/CD — tài liệu cho AI coding agent

Đối tượng đọc: **AI coding agent** làm việc trong repo này, và kỹ sư trực deploy. Đọc hết trước khi
sửa bất cứ thứ gì trong `.github/workflows/` hoặc `deploy/`.

> **Một lần deploy phát ra bốn tín hiệu, không phải một dấu ✓/✗** (từ 26/08/2026):
> ROLLOUT · HEALTH · DETERMINISTIC RUNTIME SMOKE · LIVE AI SMOKE. Ý nghĩa từng màu và cách đọc
> nhanh trên GitHub Actions: [tin-hieu-deploy.md](tin-hieu-deploy.md). Ba tín hiệu đầu **chặn**
> deploy; live AI báo riêng để một lần model đoán sai không bị đọc nhầm thành "release chưa lên".

> 🔒 **`main` được bảo vệ bằng ruleset kể từ 28/08/2026** — và **bảy job trong `ci.yml` nay là
> status check BẮT BUỘC**: `verify` · `integration` · `workflow-integration` · `tenant-packs` ·
> `e2e` · `audit` · `images`. Required check khớp theo **TÊN JOB**. **Đổi tên một job ở đây mà
> không sửa ruleset ⇒ check bắt buộc không bao giờ được báo cáo ⇒ mọi PR kẹt vĩnh viễn** ở trạng
> thái "Expected", kể cả khi CI thực tế xanh. Đổi tên là thao tác hai bước, làm trong cùng một PR.
> Thêm job mới thì nó **không** tự thành bắt buộc. Chi tiết + lệnh sửa ruleset:
> [github-governance.md](github-governance.md).

---

## 0. Ai là ai (hiểu sai chỗ này là đặt tên sai cả code lẫn tài liệu)

| Tên | Vai | Xuất hiện trong repo dưới dạng |
|---|---|---|
| **Nexagnet** | Chủ repo, chủ nền tảng | `nexagnet-platform` (tên repo), `@nexagnet/marketing`, `nexagnet247.com` |
| **NetViet** | Đối tác, cũng làm giải pháp phần mềm | `netviet-host-968934832433` (GCP project), `deploy/netviet/`, `@netviet/api`, VM `netviet`, mạng `netviet-edge` |
| **Ultty, Amico, …** | **Khách hàng** (của NetViet hoặc của Nexagnet) | `tenants/<slug>/`; stack/secret `zalo-<slug>` là tên hạ tầng legacy hiện hành, không phải platform domain |

Nền tảng này phục vụ **cả khách của NetViet lẫn khách riêng của Nexagnet**. Ultty chỉ là khách đầu
tiên, không phải chủ đề của dự án.

> **KHÔNG đổi tên các định danh hạ tầng mang chữ `netviet`.** GCP project ID không đổi được sau khi
> tạo; tên compose project quyết định **tên volume**, đổi là mất dữ liệu PostgreSQL của khách đang
> chạy. Chữ `netviet` trong hạ tầng là **tên riêng của một hệ thống đang chạy**, không phải nhãn
> thương hiệu cần đồng bộ. Chỉ tầng ứng dụng và tài liệu mới trung tính hoá.

---

## 1. Bản đồ pipeline

```
push main ──┬─→ ci.yml ─────────────── 7 job, chặn mọi thứ nếu đỏ
            │
            └─→ deploy-marketing.yml ─ chỉ khi đụng apps/marketing/** hoặc pnpm-lock.yaml

chạy tay ───→ deploy-tenant.yml ─────→ reusable-deploy-tenant.yml (chọn tenant + env dev/production)
                       │
                       └─ transport-preview/gd1-test ─→ reusable-deploy-northflank.yml (KHÔNG GCP — xem northflank-preview.md)

push main (R0/R1 Autopilot) ─→ ci.yml xanh ─→ autopilot-runtime-proof.yml ─→ reusable-deploy-northflank.yml
```

| Workflow | Kích hoạt | Cổng duyệt | Đích |
|---|---|---|---|
| `ci.yml` | push `main`, mọi PR | — | 7 job: `verify`, `integration`, `workflow-integration`, `tenant-packs`, `e2e`, `audit`, `images` |
| `deploy-tenant.yml` | **chạy tay** | `dev` = không; `production` = có | Stack một khách trên VM |
| `deploy-marketing.yml` | push `main` (đường dẫn marketing) | không | Cloud Run `nexagnet-marketing` |
| `reusable-deploy-tenant.yml` | `workflow_call` | theo `environment` truyền vào | — (thư viện, không tự chạy); **chỉ provider `gcp-vm`** — hàng `northflank` bị từ chối trước bước GCP auth |
| `reusable-deploy-northflank.yml` | `workflow_call` | `gd1-test` | Bản xem trước `transport-preview` trên Northflank Sandbox; không `id-token`; xem [`northflank-preview.md`](northflank-preview.md) |
| `autopilot-runtime-proof.yml` | `workflow_run` của `ci` (push `main`, CI xanh) | `gd1-test` + preflight chỉ đọc | Deploy **đúng SHA vừa xanh** của PR Autopilot R0/R1 lên Northflank (gọi workflow ở trên), rồi comment `RUNTIME_PROOF_*` |

**Stack khách KHÔNG deploy theo push.** Với nhiều khách thì "deploy khi push" không trả lời được câu
hỏi *đưa lên khách nào*; và trên thực tế đường tự động cũ (`deploy.yml`) chưa deploy thành công lần
nào — mọi run đều kết thúc `cancelled` ở cổng duyệt. Tệ hơn: một run **đang chờ duyệt vẫn chiếm làn
concurrency** của khách đó nên nó chặn cả những lần deploy tay hợp lệ. Đã xoá 17/08/2026; chỉ còn
`deploy-tenant.yml`, muốn có cổng duyệt thì chọn `environment: production`.

**Chỉ có MỘT bản logic deploy stack khách**, nằm trong `reusable-deploy-tenant.yml`. Nếu bạn định
sửa bước deploy, sửa ở đó — đừng chép sang file khác.

---

## 2. Bảy bất biến — vi phạm là hỏng dữ liệu khách, không phải hỏng build

1. **Một image, mọi khách.** Image không được mang tên, dữ liệu hay thương hiệu của bất kỳ khách
   nào. `.dockerignore` loại `tenants/` và `**/e2e`. Hai test canh cổng này:
   `deploy/netviet/caddy-route-contract.test.mjs` và `apps/web/tenant-runtime.contract.mjs`
   (build một lần, chạy hai gói giả có experience khác nhau, đòi branding/composition đổi theo).
2. **Gói khách đi ngoài image.** `tenants/<slug>/` được upload riêng theo từng stack và mount
   **chỉ-đọc**. Một gói nằm trong image nghĩa là ai `docker save` cũng đọc được giá sỉ của khách kia.
3. **STACK SLUG là một nguồn duy nhất.** `STACK SLUG = tenant + môi trường`
   (`deploy/netviet/stack-identity.mjs`). Nó quyết định *đồng thời*: thư mục stack, tên compose
   project (⇒ **tên volume**), tiền tố secret, alias mạng, hostname, unit systemd, tiền tố backup.
   Đừng để một đường suy ra slug còn đường kia mặc định — đó chính là lỗi 17/08 (xem §6.1).
   `dev`/`production`/`legacy` suy ra **đúng tenant slug**, nên stack đang chạy không đổi tên;
   môi trường khác (`gd1-test`) ra một stack hoàn toàn riêng. **Tenant slug vẫn là thứ chọn GÓI
   KHÁCH** — một khách có hai stack thì vẫn chỉ có một `tenants/<slug>/`, không fork.
4. **Mỗi khách một mạng Docker riêng.** Docker tự đăng ký tên service làm alias DNS trên **mọi**
   mạng đã join; chung mạng là hai khách cùng trả lời cho `api`/`flowise` và DNS round-robin sẽ
   trộn chúng vào nhau. Edge `docker network connect` **ngược vào** từng mạng khách.
5. **Khách chính giữ tên miền trần.** `PRIMARY_TENANT` (hiện là `ultty`) dùng
   `operator.<ip>.sslip.io`; khách khác mang slug. Không phải thẩm mỹ: `OPERATOR_DOMAIN` đi thẳng
   vào `PUBLIC_BASE_URL` và Zalo **tự tải ảnh catalog** từ URL đó — đổi tên miền của khách đang
   chạy sẽ làm chết ảnh trong mọi tin đã gửi.
6. **LLM không tính tiền.** Parser chỉ phân loại ý định + trích xuất. Giá/ship/VAT/chính sách do
   rules engine TypeScript tính từ nguồn sự thật. Đừng đảo ngược để "cho nhanh".
7. **Cổng smoke không được làm yếu.** Khách chưa có nguồn sự thật thì smoke **bỏ qua đường đặt hàng
   và báo to** (`SMOKE_SKIPPED_ORDER_PATH=1`), chứ không im lặng đi qua như thể đã kiểm.

---

## 3. Trước khi push — test TẬP TRUNG; regression đầy đủ là việc của CI

> Đổi 21/09/2026. Trước đó mục này bắt chạy `pnpm lint && pnpm typecheck && pnpm test` toàn
> monorepo trước mỗi lần push — trùng hệt job `verify`, và trên máy phát triển mất 10–25 phút.

```text
sửa code → test tập trung đúng module/spec bị ảnh hưởng → git push → GitHub CI chạy full regression → CI xanh mới review/merge
```

| Ai | Chạy gì |
|---|---|
| Người/agent đang code | Test **tập trung** đúng vùng sửa, và **báo rõ đã chạy lệnh nào, kết quả ra sao**. Không bắt buộc full monorepo trước push |
| Hook pre-push cục bộ | Chỉ check nhanh theo vùng sửa (bảng dưới) — vài giây, tối đa ~15s |
| GitHub CI — 7 check bắt buộc của `main` | `verify` (lint, typecheck, `pnpm test`, build) · `integration` (Postgres) · `workflow-integration` (Hatchet) · `tenant-packs` · `e2e` (Playwright) · `audit` · `images` |

Test tập trung — ví dụ:

```bash
pnpm --filter @netviet/api exec vitest run src/<mien>        # hoặc đúng một tệp spec
pnpm --filter @netviet/web exec vitest run <duong-dan>
pnpm --filter @netviet/api typecheck                          # khi đổi kiểu dùng chung
pnpm --filter @netviet/web build && pnpm test:tenant-runtime  # khi đụng apps/web hoặc packages/tenant
pnpm --filter @nexagnet/marketing build                       # khi đụng apps/marketing
```

### Hook pre-push cục bộ

Cài **một lần cho mỗi clone** (mọi worktree dùng chung): `pnpm hooks:install`. Kiểm:
`pnpm hooks:install --check`. Lệnh này đặt `core.hooksPath` ở scope **local** — thắng scope global
— trỏ vào thư mục hook chung `<git-common-dir>/hooks`, nơi có hai shim:

- `pre-push` → gọi [`tools/git-hooks/pre-push.mjs`](../../../tools/git-hooks/pre-push.mjs) của chính
  worktree đang push (nhánh cũ chưa có tệp này thì không chạy gì).
- `pre-commit` → chuyển tiếp sang hook global cùng tên (bộ quét secret của ECC) — không đổi hành vi.

Lệnh cài còn **gỡ `core.hooksPath` ghim ở scope worktree** (`.git/worktrees/<tên>/config.worktree`)
nếu nó trỏ vào thư mục hook global: scope worktree **thắng** scope local, và Claude Code chép giá trị
đang có hiệu lực vào đó lúc tạo worktree — đo 21/09/2026 có 46/55 worktree ghim hook ECC, nên chỉ đặt
scope local thôi thì push trong các worktree đó vẫn chạy full suite. Giá trị ghim khác thì lệnh không
đụng, chỉ cảnh báo. Kiểm một worktree: `git config --show-scope --get core.hooksPath` phải ra `local`.

Pre-push so với merge-base của `origin/main` — đúng phạm vi PR mà CI sẽ chấm — và chỉ chạy:

| Check | Khi nào | Thời gian đo |
|---|---|---|
| `customer-source-history` — guardrail nguồn khách `--range` | luôn | <1s |
| `eslint` trên đúng các tệp đổi | có tệp `.ts/.tsx/.js/.mjs/.cjs` đổi | ~3–10s |
| `source-manifest` | đổi `apps/api/src/`, `tools/source-manifest/`, `package.json` | ~6s |
| `deploy-routes` — hợp đồng Caddy | đổi `deploy/` | <1s |
| `git-hooks` — tự kiểm hook | đổi `tools/git-hooks/` | <1s |

Guardrail chạy ở đây vì repo **public**: byte đã push là nằm vĩnh viễn trong lịch sử công khai, CI chỉ
bắt được sau khi đã lộ. Hook **không bao giờ** chạy `pnpm test`, `pnpm -r …`, build, typecheck toàn
repo, Playwright, Postgres/Hatchet IT hay Docker —
[`pre-push.test.mjs`](../../../tools/git-hooks/pre-push.test.mjs) khoá điều đó, và khoá luôn việc 7
job ở trên vẫn còn trong `ci.yml`.

**Nhận diện hook cũ:** log push có `[ECC pre-push] Running: test` = repo chưa cài hook cục bộ, hook
global `~/.codex/git-hooks/pre-push` của ECC đang chạy `lint → typecheck → test → build` toàn
monorepo. Chạy `pnpm hooks:install`. Không dùng `--no-verify` (bị hook ECC chặn); lối thoát khẩn cấp
là `ECC_SKIP_PREPUSH=1`, chỉ khi đã chứng minh hook hỏng vì máy chứ không vì code.

Test Prisma (`*.int.spec.ts`) **không chạy được nếu không có Postgres**; chúng tự bỏ qua. Job
`integration` trên CI là nơi duy nhất chứng minh chúng. Đừng tuyên bố "đã kiểm" khi mới chỉ thấy
chúng `skipped`.

**24 bài IT của workflow engine cũng vậy, và đã từng tốn thật.** Sáu tệp trong
`apps/api/src/workflow/*.int.spec.ts` gate bằng `RUN_WORKFLOW_IT` (18/24 bài gate **cả**
`RUN_PRISMA_IT`). Từ khi chúng ra đời cho tới 24/08/2026, `RUN_WORKFLOW_IT` **không xuất hiện ở dòng
nào** trong `ci.yml` — nên chúng tự bỏ qua chính chúng ở **cả hai** job `verify` và `integration`,
im lặng, và suốt thời gian đó "CI xanh" được trích dẫn như thể đã chứng minh workflow engine. Job
`workflow-integration` dựng một cụm Hatchet thật rồi chạy chúng; nó là nơi **duy nhất** chứng minh
chúng.

Chạy lại cùng một thứ trên máy mình bằng đúng một dòng:

```bash
export WORKFLOW_ENGINE_TOKEN="$(bash tools/poc-workflow-engine/start-engine.sh)"
```

rồi (cần Postgres nghiệp vụ đã `prisma migrate deploy`):

```bash
RUN_PRISMA_IT=1 RUN_WORKFLOW_IT=1 WORKFLOW_ENGINE_HOST_PORT=127.0.0.1:7744 WORKFLOW_ENGINE_TLS_STRATEGY=none pnpm --filter @netviet/api exec vitest run src/workflow --no-file-parallelism
```

`--no-file-parallelism` **không phải tuỳ chọn cho đẹp**: năm tệp IT đăng ký cùng tên
`integration-handoff.v1` với cùng một engine, chạy song song thì worker của tệp này nhận run của tệp
kia — 9 bài đỏ. Đó chính là bất biến "mỗi khách/môi trường MỘT engine" đang tự bảo vệ; xem
`deploy/netviet/workflow-isolation.contract.test.mjs`.

Job `tenant-packs` chạy `tenant-packs.spec.ts`, tự liệt kê **mọi thư mục** trong `tenants/`, nạp
từng gói bằng loader thật và kiểm slug trùng tên thư mục. Không thêm matrix tên khách vào CI. Job
này kiểm package contract; nó không thay thế DB integration hoặc web single-artifact contract.

---

## 4. Deploy

### 4.1 Một khách đã có sẵn

```bash
gh workflow run deploy-tenant.yml -f tenant=ultty -f environment=dev
```

`dev` không có cổng duyệt; `production` sẽ dừng chờ người duyệt. Hai lần deploy cùng một khách
không bao giờ chạy song song (`concurrency: deploy-tenant-<slug>`).

> **Merge xong ĐỪNG bấm deploy ngay.** Deploy đòi **đúng SHA** đang ở `main` phải có một lần chạy
> `ci.yml` **đã hoàn tất và xanh** — mà lần chạy đó chỉ bắt đầu khi merge. Bấm sớm thì fail ngay ở
> bước kiểm với dòng:
>
> ```
> Exact SHA <sha> does not have a successful completed CI run.
> ```
>
> Đây là cổng an toàn chứ không phải lỗi: nó chặn việc deploy một commit chưa ai kiểm. Đợi CI của
> `main` xanh rồi chạy lại — không cần sửa gì.
>
> ```bash
> gh run list --workflow=ci.yml --branch main --limit 1 --json headSha,status,conclusion
> ```
>
> Đã mất một lượt deploy vì chuyện này ngày 21/08/2026 (run 32444569841).

**Môi trường `gd1-test`** là một **stack RIÊNG** trên cùng VM, không phải một nhãn khác của stack
dev: nó có thư mục, compose project, volume, mạng, hostname và secret riêng. Xem
[`ultty-gd1-test-runbook.md`](ultty-gd1-test-runbook.md) trước khi đụng vào nó.

### 4.2 Lên một khách mới — thứ tự bắt buộc

1. Tạo `tenants/<slug>/tenant.json` + `tenants/<slug>/data/knowledge.json`. Zod validate lúc boot,
   sai là fail-fast. Job `tenant-packs` trên CI kiểm mọi gói.
2. Nếu là bootstrap hạ tầng lần đầu hoặc khôi phục sự cố **đã được phê duyệt**, bootstrap secret +
   quyền bằng một lệnh idempotent:
   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy/netviet/deploy.ps1 -Tenant <slug>
   ```
   Lệnh này tạo đủ 15 secret `zalo-<slug>-*` **kèm version đầu tiên** rồi cấp
   `roles/secretmanager.secretAccessor` cho service account của VM — hai việc đi từ **một** danh
   sách nên không lệch nhau được. **Không dùng script này để rollout tenant đang vận hành.**
3. Thêm `<slug>` vào allowlist input `tenant` trong `.github/workflows/deploy-tenant.yml`. Danh sách
   deploy vẫn cố ý thủ công vì chọn production target là external action; inventory động có approval
   riêng là backlog, không dùng CI inventory để tự mở target deploy.
4. Deploy: `gh workflow run deploy-tenant.yml -f tenant=<slug> -f environment=dev`.
5. Kiểm (§5).

### 4.3 Trang marketing

Tự động khi push `main` có đụng `apps/marketing/**`. Deploy **theo git SHA**, không theo `:latest`.

---

## 5. Kiểm sau deploy — 4 phép, làm đủ

```bash
IP=35-187-235-82   # đổi theo static IP thực tế
S=<slug>           # khách chính: bỏ hậu tố "-$S"

# 1. Endpoint sống
curl -s -o /dev/null -w '%{http_code}\n' https://operator-$S.$IP.sslip.io/health       # 200
curl -s -o /dev/null -w '%{http_code}\n' https://operator-$S.$IP.sslip.io/zalo/status  # 401

# 2. Thương hiệu đúng khách
curl -s https://operator-$S.$IP.sslip.io/ | grep -o '<title>[^<]*</title>'

# 3. CÁCH LY MẠNG — phép quan trọng nhất, phải ra đúng một địa chỉ
gcloud compute ssh netviet --zone asia-southeast1-b --tunnel-through-iap --quiet \
  --command "docker exec \$(docker ps -q -f name=zalo-$S-api) getent hosts flowise"

# 4. Bốn tín hiệu của chính lần deploy đó — không phải grep log
gh run download <run-id> -n deploy-signals-$TENANT-$ENV && cat deploy-signals.json
```

Phép 3 phải trả về **đúng một** địa chỉ, và đó phải là Flowise của chính khách đó. Trả về hai địa
chỉ nghĩa là cách ly đã thủng — dừng lại, đừng deploy tiếp.

---

## 6. Sự cố đã xảy ra thật — nhận diện nhanh

### 6.1 Gói khách này ghi đè lên gói khách kia (17/08/2026)
`deploy.ps1` đọc `$env:TENANT` để chọn gói upload nhưng gọi `deploy-remote.sh` **thiếu** tham số
slug, nên VM rơi về mặc định `ultty`. **Dấu hiệu:** deploy khách B xong, khách A hiển thị bảng giá
của khách B. **Đã khoá bằng test**; nếu bạn thêm đường deploy mới, phải truyền slug tường minh.

### 6.2 Đổi tên repo → CD chết ở bước `auth`
`setup-github-oidc.sh` ràng `assertion.repository` và `principalSet` theo `owner/repo`. Git remote
vẫn chạy nhờ GitHub redirect nên **trông như không có gì hỏng**, nhưng token OIDC mang tên mới bị
từ chối. **Cách đổi tên không có khoảng chết:** nới điều kiện nhận cả hai tên → đổi tên → chạy thật
một lần deploy → siết lại còn một tên.

### 6.3 Job CI "bị huỷ" chứ không "thất bại" (15–17/08/2026)
`verify` chạm timeout 20 phút mỗi lần chạy suốt hai ngày. Gói khách giả thiếu 4 trường bắt buộc mà
schema thêm sau → `next start` không phục vụ nổi request; và server hỏng **không bị dọn** nên
`node --test` treo đến hết timeout. **Dấu hiệu duy nhất trong log:**
`Terminate orphan process: next-server`. Bài học: mọi tiến trình con phải bị dọn trên **nhánh lỗi**,
nếu không một test thất bại sẽ hiện ra như một job bị huỷ và không ai đi tìm nguyên nhân.

### 6.4 Ký tự CR trong secret → Caddy trả 502
Secret tạo từ máy Windows có thể mang `\r` ở cuối. `$( )` cắt `\n` nhưng **không** cắt `\r`. Đã lọc
tại nguồn trong `render-secrets.sh`. Triệu chứng: `invalid header field value for "X-Api-Key"`.

### 6.5 Secret tạo ra nhưng không có version / thiếu IAM binding
Vòng lặp bootstrap đứt giữa chừng để lại secret rỗng; hoặc secret có mà service account VM không
được cấp quyền đọc → stack chết với `PERMISSION_DENIED`. `deploy.ps1` nay làm cả hai từ một danh
sách. Mật khẩu Flowise phải đủ 4 nhóm ký tự (regex trong `Ensure-FlowiseAdminPasswordSecret`).

### 6.6 Upload chậm 48 phút vì mỗi tệp một tunnel IAP
`gcloud compute scp --recurse` mở một tunnel cho **mỗi tệp**. 102 ảnh catalog = 48 phút. Đã đổi
sang gói **một** archive tar rồi giải nén trên VM: 31 giây.

### 6.7 Khách KHÔNG bán hàng qua Zalo — 4 cổng tự vấp liên tiếp (21/08/2026)
Lên khách `wata` (`knowledge` + `operations`, **không** `messaging`, **không** `sales-order`) làm lộ
một giả định nằm rải khắp base: *mọi khách đều là khách bán hàng qua Zalo*. Bốn lần deploy, bốn chỗ
khác nhau, cùng một nguyên nhân — và mỗi lần chỉ lộ ra sau ~12 phút chạy pipeline:

| Vấp ở | Triệu chứng | Giả định sai |
|---|---|---|
| Gieo nguồn sự thật | `Goi khach thieu dealers` | seeder bắt **mọi** gói khách khai `dealers` |
| `api` boot | `Nest can't resolve dependencies of the SettingsQueryService` | provider của `operations` inject provider của `messaging` |
| Smoke | `Khong mo duoc SSE: HTTP 404` | nhánh rút gọn vẫn đòi mở `/events` (thuộc `sales-order`) |
| Public HTTPS | `Public HTTPS smoke test that bai` | cổng probe `/zalo` + `/zalo/status` (thuộc `messaging`) |

**Nguyên tắc rút ra:** cổng kiểm phải thu hẹp **theo năng lực khách**, và đọc không được gói khách
thì **ngả về phía kiểm nhiều hơn** — bất biến 7 cấm làm yếu cổng smoke. Thu hẹp tới đâu phải in ra
tới đó (`SMOKE_SKIPPED_ORDER_PATH`, `SMOKE_SKIPPED_SSE`), nếu không một lần deploy xanh sẽ bị đọc
nhầm là "đã kiểm hết".

**Đã khoá bằng test:** `apps/api/src/app.module.knowledge-operations.boot.spec.ts` boot thật
AppModule với tổ hợp `knowledge` + `operations`. Trước đó chỉ có spec `knowledge-only` — nó không
bật `operations` nên không bắt được gì; chính **tổ hợp** mới là chỗ trống. Ba cổng deploy còn lại có
assertion trong `deploy/netviet/caddy-route-contract.test.mjs`.

> **Lên khách mới không có `messaging`/`sales-order`:** chạy trước
> `pnpm --filter @netviet/api exec vitest run src/app.module.knowledge-operations.boot.spec.ts`
> và `node --test deploy/netviet/caddy-route-contract.test.mjs` — rẻ hơn 12 phút pipeline rất nhiều.

---

## 7. Rollback

```bash
gcloud compute ssh netviet --zone asia-southeast1-b --tunnel-through-iap --quiet \
  --command "sudo TENANT_SLUG=<slug> bash /srv/netviet/apps/zalo-<slug>/rollback.sh"
```

Backup chạy theo timer `netviet-backup@<slug>.timer`; khôi phục có `restore-check.sh`. Mọi tiến
trình đụng compose đều lấy chung một khoá (`.runtime/compose.lock`) — đừng thêm đường nào bỏ qua nó.

---

## 8. Đụng vào những chỗ này thì dừng lại và hỏi người

- Đổi `name:` trong `deploy/netviet/compose.yaml` (⇒ đổi tên volume ⇒ **mất dữ liệu PostgreSQL**).
- Đổi hostname của khách đang chạy (⇒ chết ảnh catalog trong tin Zalo đã gửi).
- Mở `admin` của Caddy ra ngoài loopback (⇒ container khách sửa được routing của khách khác).
- Bật `AUTO_SEND`, `CHANNEL_MODE=zca|bot`, `AUTH_MODE` — xem
  [`checklist-go-live.md`](checklist-go-live.md); hai công tắc đang khoá **có chủ ý**.
- Đưa dữ liệu thật của khách qua DeepSeek: **DeepSeek chưa nằm trong danh sách bên thứ ba được
  duyệt** (chỉ KiotViet + Claude API). Demo chỉ dùng nhóm/dữ liệu TEST.
- Xoá volume, xoá secret, `git push --force`.

---

## 9. Liên quan

- [`../ke-hoach/tong-quan.md`](../ke-hoach/tong-quan.md) — nguồn trạng thái duy nhất.
- [`northflank-preview.md`](northflank-preview.md) — **bản xem trước trên Northflank** (Autopilot Phase 3): kiến trúc,
  chuỗi bằng chứng exact-SHA, giới hạn có chủ ý (kể cả lệch so với bất biến #1/#2), thiết lập một lần, token tối thiểu.
- [`deployment-profiles.md`](deployment-profiles.md) — **hồ sơ triển khai**: danh mục đóng, cổng
  exact-main không bỏ qua được, ma trận bí mật theo hệ thống con, ma trận cách ly.
- [`chay-kiem-workflow-engine.md`](chay-kiem-workflow-engine.md) — **hướng dẫn dùng cổng `workflow-integration`**: đọc kết quả CI, chạy lại 24 bài trên máy mình, 4 kiểu đỏ đã đo.
- [`checklist-go-live.md`](checklist-go-live.md) — điều kiện bật pilot dữ liệu thật.
- [`ultty-gd1-test-runbook.md`](ultty-gd1-test-runbook.md) — môi trường kỹ thuật GD1-test.
- [`../../kien-truc/nen-tang-da-khach.md`](../../kien-truc/nen-tang-da-khach.md) — kiến trúc đa khách.
- [`../../../deploy/netviet/README.md`](../../../deploy/netviet/README.md) — chi tiết vận hành VM.
