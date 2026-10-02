# Orchestrator V0 — read-only

> ⚠️ **DEPRECATED — Autopilot V3 ([#361](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/361)).**
> Không mở rộng mã này. Đường đang triển khai: [autopilot-v3-cloud-builder.md](../../docs/phat-trien/van-hanh/autopilot-v3-cloud-builder.md).
> Mã giữ nguyên trên `main` cho tới Phase D (xoá sau khi đường thay thế được chứng minh).


Chạy [Giao thức Autopilot V0](../../docs/phat-trien/van-hanh/autopilot-protocol-v0.md) trên **sự
kiện GitHub thật**. Hợp đồng task: Issue #165.

Nó làm đúng hai việc: **đăng một comment kết quả** và **đổi nhãn trạng thái**. Không merge, không
ghi mã nguồn, không gọi agent nào. Workflow không xin `contents: write`, nên ranh giới đó do GitHub
cưỡng chế chứ không phải do tài liệu hứa.

## Vì sao nó tồn tại

PR #155 đưa giao thức lên `main` với 122 bài test — nhưng toàn bộ chạy trên payload **tổng hợp**.
Package này đóng hai mục NOT PROVEN của PR đó:

| NOT PROVEN của #155                                              | Đóng bằng                                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| #1 Giao thức chưa từng chạy trên sự kiện GitHub thật             | `src/main.mjs` + fixture bắt từ REST thật trong `tests/fixtures/` |
| #3 `requiredChecksFromRuleset` đọc tệp trong repo, không hỏi API | `src/evidence.mjs` gọi `/rules/branches/main`                     |

## Ba trigger, một lối quyết định

Hợp đồng #165 khai ba sự kiện. Chúng **không phải ba nhánh xử lý** — chúng là **ba cách một bộ điều
kiện trở nên đầy đủ**, và cả ba đi chung đúng một lối quyết định (`decideOnComment`):

| Trigger         | Cái đến **sau cùng**         | Thông điệp lấy từ đâu              |
| --------------- | ---------------------------- | ---------------------------------- |
| `issue_comment` | thông điệp `BUILD_READY`     | **ngay trong payload**             |
| `check_suite`   | CI chạy xong                 | tra cứu trong luồng comment của PR |
| `pull_request`  | HEAD đứng yên (mở lại PR, …) | tra cứu trong luồng comment của PR |

Khác biệt đó có hậu quả **ngữ nghĩa**, không chỉ kỹ thuật:

- Thông điệp **vừa đến** thì được **phán xét** — hỏng thì từ chối, và từ chối được đăng ra.
- Thông điệp **tra cứu được** thì chỉ được **dùng** khi nó buộc vào đúng HEAD hiện tại.

Nếu đường tra cứu cũng lôi comment cũ ra phán xét, thì mỗi lần push sẽ sinh một `HEAD_MISMATCH` cho
một `BUILD_READY` mà **không ai vừa phát** — tiếng ồn do chính orchestrator tạo ra.

Vì ba đường có thể cùng đủ điều kiện trên **một** HEAD, mọi lần đăng đều qua cổng chống trùng
(`findPostedClaim`), so bằng **khoá idempotency của giao thức**. V0 read-only không có sổ ledger bên
ngoài, nên **luồng comment chính là sổ ledger**.

## Mười ba tệp, hai tệp bẩn

| Tệp                   | Thuần? | Việc                                                                                                          |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `src/reasons.mjs`     | ✅     | Mã lý do **của tầng orchestrator** — tách hẳn khỏi 59 mã của giao thức. Có test khoá hai bộ không trùng nhau. |
| `src/events.mjs`      | ✅     | Sự kiện webhook → PR mục tiêu + thông điệp kèm theo (nếu có). Fail-closed.                                    |
| `src/evidence.mjs`    | ✅     | Hình dạng GitHub REST → tham số validator. Fail-closed.                                                       |
| `src/inbox.mjs`       | ✅     | Luồng comment → tra cứu `BUILD_READY` ở đúng HEAD, và cổng chống trùng.                                       |
| `src/registry.mjs`    | ✅     | Sơ đồ `principal → vai`. Đọc từ biến môi trường, **không ghi cứng login nào**.                                |
| `src/permissions.mjs` | ✅     | Bảng "lời gọi API ↔ quyền". Một nguồn cho cả preflight lẫn bài kiểm hợp đồng workflow.                        |
| `src/decide.mjs`      | ✅     | Sự kiện + bằng chứng → mô tả việc phải làm.                                                                   |
| `src/ledger.mjs`      | ✅     | Đọc **trọn vẹn** luồng comment bằng phân trang. Đọc thiếu ⇒ fail-closed, không quyết định trên một phần sổ. |
| `src/labels.mjs`      | ✅     | Hoà giải nhãn, **đọc kết quả từng lời gọi**. Chỉ `404` khi gỡ nhãn vắng mới là thành công.                  |
| `src/mutations.mjs`   | ✅     | Job này có được ghi không. Mặc định `forbidden`.                                                              |
| `src/github.mjs`      | ❌     | Client REST. Nơi **duy nhất** gọi mạng.                                                                        |
| `src/main.mjs`        | ❌     | Nơi **duy nhất** ghi (đăng comment, đổi nhãn).                                                                 |
| `src/preflight.mjs`   | ❌     | Đo quyền của token bằng cách **gọi thật**. Chỉ đọc, không ghi.                                                 |

Tách như vậy để "read-only" là thứ kiểm được: mọi quyết định nằm trong hàm thuần, và chỉ một tệp
có quyền ghi.

## Bảy cạm bẫy đã đo được, không phải suy đoán

**1. API và tệp ruleset có hình dạng KHÁC NHAU.** `/rules/branches/main` trả về **mảng phẳng**;
`requiredChecksFromRuleset` lại đợi `{ rules: [...] }`. Đưa thẳng mảng API vào nó thì **không lỗi,
không ném** — chỉ trả mảng rỗng, tức "không có check bắt buộc nào". Có một bài test khoá đúng chỗ
này.

**2. `permissions:` là một danh sách ĐÓNG.** Khai một khối `permissions` tường minh thì mọi quyền
**không** được kể ra đều bằng `none`. Đây là blocker B1 của PR #167: `main.mjs` gọi
`/commits/{sha}/check-runs` và `/actions/runs` trong khi khối `permissions` chưa kể `checks: read`
và `actions: read` — nên lần chạy **thật sau khi merge** sẽ hỏng *trước khi* sinh ra được bằng
chứng CI.

Hai cái chặn, vì một cái không đủ:

- `tests/workflow-contract.test.mjs` đối chiếu `src/permissions.mjs` với khối YAML — chạy offline,
  trong mọi PR;
- job `preflight` **gọi thật** năm đường đó bằng chính `GITHUB_TOKEN` của workflow.

**3. Hai trong ba trigger chạy bản workflow trên NHÁNH MẶC ĐỊNH.** Tài liệu GitHub xếp
`issue_comment` và `check_suite` vào nhóm *"chỉ kích hoạt nếu tệp workflow có trên nhánh mặc định"*.
Nên một thay đổi ở hai đường đó **không thể chứng minh từ chính PR thêm nó** — CI xanh của PR không
có nghĩa là orchestrator đã chạy thật.

`pull_request` là **ngoại lệ**: nó không nằm trong nhóm đó, nó chạy bản của chính PR
(`GITHUB_REF` = `refs/pull/N/merge`). Đó là lý do `preflight` nằm đúng ở trigger ấy — đây là chỗ
**duy nhất** trong repo này đo được một thay đổi quyền **trước khi** nó lên `main`.

**4. Mặc định là DRY-RUN.** Nó quyết định và ghi log đầy đủ nhưng không đăng comment, không đổi
nhãn. Bật thật bằng biến repo `AUTOPILOT_DRY_RUN=false`.

**5. `pull_request` chạy MÃ NGUỒN CỦA PR — kể cả chính tệp YAML.** Đây là blocker B4 của PR #167.
Trên trigger đó, một PR chưa duyệt quyết định cả `main.mjs`, các tệp giao thức nó import, **và**
khối `permissions:` của workflow. Nên workflow tách làm hai đường, và ranh giới là **quyền** chứ
không phải lời hứa:

| Đường            | Job                                    | Trigger                        | Quyền     |
| ---------------- | -------------------------------------- | ------------------------------ | --------- |
| không tin cậy    | `preflight`, `orchestrate-readonly`    | `pull_request`                 | toàn đọc  |
| tin cậy          | `orchestrate`                          | `issue_comment`, `check_suite` | có ghi    |

Đường tin cậy **ghim checkout vào nhánh mặc định** thay vì tin `github.sha` — nếu `github.sha` của
`check_suite` có lúc trả về `head_sha` của một PR thì checkout mặc định sẽ kéo mã nguồn PR vào
đúng job đang cầm quyền ghi. Và **không** được "sửa" bằng `pull_request_target` rồi checkout mã
nguồn PR: làm vậy là lấy lại đúng bộ quyền ấy và trao cho đúng đoạn mã ấy, chỉ khác tên trigger.

Cái giá phải trả, nói thẳng: đường `pull_request` **không còn đăng được comment kết quả**. Một bộ
điều kiện trở nên đầy đủ ở đó sẽ chờ `issue_comment`/`check_suite` kế tiếp mới được phát.

**6. Comment đăng xong rồi nhãn hỏng là một trạng thái KHÔNG SỬA ĐƯỢC** — blocker B5. Bản trước
đăng comment trước, đổi nhãn sau, và **bỏ qua** mọi kết quả của lời gọi nhãn. Lần chạy kế tiếp thấy
comment cũ rồi dừng ngay ở cổng chống trùng, nên không bao giờ về tới phần nhãn: nhãn kẹt ở trạng
thái cũ vĩnh viễn, và chính cổng chống trùng là cái chặn đường sửa. Nay comment đăng **một lần**,
nhãn hoà giải **mọi lần** — và chỉ `404` khi gỡ một nhãn vốn không có mới được tính là thành công.

**7. Luồng comment là sổ ledger, nên phải đọc HẾT** — blocker B6. Bản trước đọc đúng
`?per_page=100`, tức **trang đầu**. Dưới 100 comment thì "trang đầu" và "cả luồng" trùng nhau nên
bug nằm im; quá 100 thì chúng tách ra, và hỏng theo **hai** hướng khác hẳn nhau: một `BUILD_READY`
hợp lệ ở trang sau biến mất (`NO_BUILD_READY_AT_HEAD` sai), và một comment đã đăng ở trang sau lọt
cổng chống trùng (đăng trùng). Chạm trần trang thì báo `PR_COMMENTS_TRUNCATED` — một cái trần im
lặng chính là bug này được dời chỗ, từ 100 lên 2000.

## Cấu hình

| Biến                          | Bắt buộc | Mặc định           |
| ----------------------------- | -------- | ------------------ |
| `AUTOPILOT_REPO_OWNER_LOGIN`  | ✅       | — (thiếu ⇒ job đỏ) |
| `AUTOPILOT_REVIEWER_APP_SLUG` | ✅       | — (thiếu ⇒ job đỏ) |
| `AUTOPILOT_ACTIONS_APP_SLUG`  | —        | `github-actions`   |
| `AUTOPILOT_DRY_RUN`           | —        | `true`             |
| `AUTOPILOT_MUTATIONS`         | —        | `forbidden`        |

`AUTOPILOT_REVIEWER_APP_SLUG` **không có giá trị dự phòng, và đó là một quyết định** (blocker B3 của
PR #167). Workflow từng viết `${{ vars.AUTOPILOT_REVIEWER_APP_SLUG || 'chatgpt-codex-connector' }}`,
nên một biến repo bị xoá — hay chưa bao giờ được đặt — sẽ **lặng lẽ** trao vai `CHATGPT_REVIEWER`
cho một app ghi cứng trong mã nguồn. Vai đó quyết định `REVIEW_PASS` **của ai** được tính. Cấp nó
bằng một giá trị mặc định là cấp quyền mà không ai ký.

`AUTOPILOT_ACTIONS_APP_SLUG` thì khác và vẫn có mặc định: slug đó do GitHub sở hữu chứ không do repo
này chọn, và nó không cấp vai duyệt cho ai.

Hai cái chặn cho đường này: `tests/workflow-contract.test.mjs` canh khối YAML, và
`tests/fail-closed.test.mjs` chạy thật `node src/main.mjs` rồi đo **mã thoát**. Cần cả hai — một
bài gọi thẳng `registryInputFromEnv({})` vẫn xanh trong khi hệ thống thật thì fail-open, vì cái sai
nằm ở **chỗ nối** giữa YAML và mã.

## Sơ đồ principal, và vì sao một repo một chủ vẫn thoả phân lập nhiệm vụ

Đo trên comment thật của PR #155:

```
BUILD_READY  -> user.login = <chủ repo>,  performed_via_github_app = null
             => principal USER:<chủ repo>    -> BUILDER, FIXER, ARCHITECT, HUMAN

REVIEW_PASS  -> user.login = <chủ repo>,  performed_via_github_app.slug = <app của ChatGPT>
             => principal APP:<app ChatGPT>  -> REVIEWER
```

`principalFromGithubEvent` ưu tiên app slug hơn login, nên **cùng một tài khoản GitHub cho ra hai
principal khác nhau**. Nhờ đó `CHATGPT_REVIEWER` đứng một mình và bất biến "không ai vừa làm vừa
duyệt" được thoả — điều mà nếu chỉ nhìn `user.login` thì không thể.

## NOT PROVEN — nói thẳng

1. **`check_suite` chưa từng kích hoạt lần chạy nào, và trong repo này thì nó sẽ không.** Tài liệu
   GitHub: *"to prevent recursive workflows, this event does not trigger workflows if the check
   suite was created by GitHub Actions"*. Mọi check của repo này đều do GitHub Actions tạo. Đường đó
   được cài đặt đầy đủ và fail-closed đúng theo hợp đồng #165, **nhưng trên thực tế nó nằm im**.
   Muốn "CI xong sau cùng" thật sự kích hoạt được thì phải dùng cơ chế khác (`workflow_run`) — mà
   đổi cơ chế là **sửa phạm vi hợp đồng**, nên phải là task riêng, không lặng lẽ đổi ở đây.
2. **`issue_comment` cũng chưa chạy thật**, và không thể chạy thật cho tới khi bản này lên `main`
   (cạm bẫy 3).
3. **`pull_request` chỉ chứng minh được phần ĐỌC.** Từ blocker B4, job chạy trên trigger đó không
   còn được cầm `issues: write` — nên `preflight` **không thể** đo quyền ghi bằng một lời gọi thật
   nữa, và sẽ không bao giờ đo được: không thể vừa cho mã nguồn PR chạy vừa cho nó cầm quyền ghi để
   đo. Quyền ấy nay được canh bằng một hợp đồng **tĩnh** (`tests/workflow-contract.test.mjs` đọc
   thẳng khối `permissions:` của job `orchestrate`; từ blocker B7 thì so khớp **chính xác** với bảng
   `WRITE_CALLS` — thừa một dòng `: write` là đỏ). Đó là một bằng chứng yếu hơn hẳn một lời gọi 200,
   và nói ra ở đây chứ không giấu.
4. **Đường ghi chưa từng chạy thật.** Nó chỉ chạy trên `issue_comment`/`check_suite`, tức chỉ sau
   khi bản này lên `main` (cạm bẫy 3). Trong PR, đường ghi được đo bằng `tests/recovery.test.mjs` —
   chạy thật `node src/main.mjs` hai lần với mạng được dựng lại, không phải bằng một lần chạy
   GitHub thật.
5. **Vẫn chưa có người thứ hai đọc mã** (repo một chủ).

## Chạy test

```bash
pnpm --filter @netviet/autopilot-orchestrator test
```

Fixture trong `tests/fixtures/` được bắt trực tiếp từ REST của chính repo này tại lúc PR #155 xanh
7/7. Chúng là dữ liệu thật, không phải payload người viết nghĩ ra. **Vỏ sự kiện** trong
`tests/events.test.mjs` thì tổng hợp — đúng theo hình dạng GitHub khai trong tài liệu, nhưng không
phải bản bắt được từ webhook thật; ranh giới đó được ghi rõ ngay đầu tệp test.
