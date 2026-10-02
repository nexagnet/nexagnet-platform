<!-- gh-aw-pin: v0.88.7 -->
<!-- gh-aw-sha: bde367913adeb3132f0a171594c88a17f4b7d08c -->
<!-- gh-aw-audit: 2026-09-16 -->

# ADR-0001 — Mặt phẳng điều khiển Autopilot: official-first

> ⚠️ **22/09/2026 — phần "mặt phẳng thực thi = gh-aw" bị thay bởi
> [ADR-0002](adr-0002-autopilot-v3-github-native.md) (#361, #362).** Nguyên tắc "trạng thái nghiệp vụ =
> trạng thái GitHub gốc" vẫn giữ. Tệp này và pilot `agent-builder` ở lại làm lịch sử cho tới Phase D.

| | |
|---|---|
| **Trạng thái** | **ĐÃ CHẤP NHẬN** — PR [#310](https://github.com/phungtienviet14-sketch/nexagnet-platform/pull/310) qua review độc lập và merge vào `main` thành `86d106e527043dbd0df3d4b93789fa202e77d608`. Cổng §14 của [#309](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/309) **đã qua** |
| **Ngày** | 15/09/2026 · cập nhật 16/09/2026 (Issue [#311](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/311) Phase A) |
| **`main` lúc quyết định** | `de30a0825572684ce2c524058f94a4bd79e07668` |
| **`main` lúc chấp nhận** | `86d106e527043dbd0df3d4b93789fa202e77d608` |
| **Bằng chứng đầy đủ** | [autopilot-v2-official-first.md](../phat-trien/van-hanh/autopilot-v2-official-first.md) |
| **Thay thế** | `KEEP_CUSTOM` của #194 / PR #199 (05/09/2026) |
| **Bản ghim gh-aw** | `v0.88.7` / `bde367913adeb3132f0a171594c88a17f4b7d08c` — **re-audit 16/09/2026**, vẫn là bản stable mới nhất |
| **Sửa sau review độc lập lần 1** | 4 mục: repin re-audit · Codex reviewer hạ xuống NOT PROVEN · mô tả `GITHUB_TOKEN` + CI · tách cổng merge khỏi cổng deploy |
| **Sửa ở Phase A của #311** | 3 mục: đo lại toàn bộ trạng thái live · `risk:high` chuyển từ cổng prompt sang **cổng tất định** · sửa lại mức Codex reviewer sau khi đo đúng trường danh tính |

---

## Quyết định

```text
DECISION = ADOPT_GITHUB_NATIVE_GH_AW
```

- **Trạng thái nghiệp vụ** = trạng thái GitHub gốc: Issue · nhãn · PR · check-run · review state ·
  ruleset · Environment. **Không còn giao thức tự viết.**
- **Mặt phẳng thực thi** = GitHub Agentic Workflows, ghim `v0.88.7` /
  `bde367913adeb3132f0a171594c88a17f4b7d08c` — **re-audit 15/09/2026: vẫn là bản stable mới nhất**
  (mọi tag cao hơn, tới `v0.89.15`, đều `prerelease: true`). Xem "Về bản ghim" bên dưới.
- **Builder ban đầu** = engine `copilot` (đổi engine = sửa một dòng).
- **Reviewer** = Codex qua App `chatgpt-codex-connector` (**đã cài sẵn trong repo này**), giữ tính
  chất Builder ≠ Reviewer mà không cần cầu nối trình duyệt. **Ở mức đọc độc lập, không phải mức
  review chính thức của GitHub** — xem "Codex reviewer: chưa chứng minh" bên dưới.
- **Cổng rủi ro cao** = nhãn `risk:high`, cưỡng chế bằng **điều kiện tất định của GitHub Actions**
  (`on.steps` + `if:`) — xem mục "`risk:high` — từ cổng prompt sang cổng tất định" bên dưới. Ở mức
  *người*, GitHub vẫn có **hai cổng KHÁC NHAU, không được gộp**: cổng **merge** (ruleset) và cổng
  **deploy** (Environment). Xem "Hai cổng người" bên dưới. `required_approving_review_count` vẫn là
  `0` và ADR này **không** đề xuất nâng nó.

Quyết định này **không** phải `BLOCKED_MANDATORY_GAP`: không có năng lực bắt buộc nào bị thiếu.

## Đo lại 16/09/2026 — bốn thứ đổi, một thứ không

Issue #311 cấm dùng snapshot của #310. Đo lại toàn bộ, và ghi cả cái **không** đổi:

| Đã đo | 15/09 (#310) | 16/09 (#311 A1) |
|---|---|---|
| gh-aw stable mới nhất | `v0.88.7` | **`v0.88.7` — không đổi.** Không bản stable nào ra giữa hai ngày; `v0.89.15` (14/09) vẫn là tag cao nhất và vẫn `prerelease: true` |
| SHA của tag | `bde3679…` | **trùng** — đo lại bằng `git/ref/tags/v0.88.7` |
| Advisory mới | 10 cái, mới nhất 29/08 | **không có cái nào mới.** Mọi dải ảnh hưởng vẫn kết thúc dưới `v0.88.7` |
| 7 required check + `strict` + `bypass_actors` | 7 / `true` / `[]` | **trùng từng mục** — đo bằng `/rules/branches/main`, không bằng `enforcement` của đối tượng ruleset |
| Credential engine | không có | **vẫn không có.** Hai secret, năm biến, ba Environment đều rỗng; `suggestedActors` vẫn chỉ trả về chủ repo |
| Codex phát review event | 0/13 PR | **0/30 PR** — và xem mục ngay dưới, vì lần này đo ra một thứ khác hẳn |

Cái **không** đổi là quan trọng nhất: bản ghim vẫn đúng, nên ADR này **không repin**. Chỉ ngày
`gh-aw-audit` tiến lên `2026-09-16`, vì đó là ngày *đo lại*, không phải ngày ghim.

## Codex: không chỉ "chưa duyệt" — mà còn không phải một danh tính riêng

#310 kết luận đúng chiều (**NOT PROVEN**) nhưng **đếm sai bằng chứng**, và lần đo 16/09 cho thấy
lý do. Quét bằng `user.login` khớp chuỗi `codex` trên 482 comment gần nhất ra **0** — nghe như App
đã ngừng chạy. Nhưng đó là **rỗng giả**: đo bằng đúng trường thì

```text
performed_via_github_app.slug == "chatgpt-codex-connector"  -> 198 comment
  moi nhat: 2026-09-16T02:00:23Z  (comment tren chinh Issue #311)
  user.login cua MOI comment do: phungtienviet14-sketch  [User]
```

Nên sự thật đo được là: **App Codex đăng comment dưới danh tính user của chủ repo, không phải một
bot account riêng.** Hai hệ quả, cả hai đều siết chặt hơn kết luận cũ:

1. Con số "40 comment" của #310 là một lát cắt hẹp; con số thật trong cùng khoảng là **198**. App
   vẫn đang chạy — không hề ngừng.
2. Quan trọng hơn: kể cả khi Codex phát được một review event, event đó sẽ mang **danh tính của
   chính chủ repo**. GitHub cấm tự duyệt PR của mình, nên nó **không thể** tính vào
   required-approvals. Tức con đường "người duyệt thứ hai qua Codex" không chỉ *chưa* chứng minh
   được — nó **bị chặn bởi một tính chất của GitHub**, không phải bởi một nút chưa bật.

Điều này **không** cứu PR #206 (cầu nối trình duyệt) — nó càng dìm: một extension cũng chỉ đánh
thức được cùng một danh tính đó. Và nó làm **ghế Copilot** trở thành đường duy nhất còn lại cho
tình huống 5 của #309 §9, vì §4.2 của tài liệu bằng chứng là chỗ duy nhất GitHub tài liệu hoá việc
một approval không-phải-người được tính.

## `risk:high` — từ cổng prompt sang cổng tất định (#311 A4)

Bản trước ghi thẳng rằng `risk:high` chỉ dừng ở **hành vi của agent** — prompt bắt dừng. Đó là một
cổng phụ thuộc vào việc mô hình chịu nghe. #311 A4 yêu cầu thay bằng một điều kiện tất định, và
gh-aw `v0.88.7` **có** thứ đó: `on.steps` (Pre-Activation Steps) cộng `if:` ở gốc frontmatter.

```yaml
on:
  steps:
    - id: risk_gate
      env: { LABELS: "${{ toJSON(github.event.issue.labels.*.name) }}" }
      run: <tu choi neu co risk:high, hoac neu thieu ca risk:low/medium>

if: needs.pre_activation.outputs.risk_gate_result == 'success'
```

Biên dịch ra: job `activation` mang `if: … && risk_gate_result == 'success' && …`, và job `agent`
`needs: activation`. Nên một Issue `risk:high` **không có đường nào tới job agent** — không prompt,
không engine, không safe output, không PR.

Ba phương án khác đã cân và bị loại, ghi ra để lần sau không phải cân lại:

| Phương án | Vì sao không |
|---|---|
| `skip-if-match:` | Chạy một câu **tìm kiếm** GitHub. Không có qualifier theo số hiệu Issue nên không pin được vào đúng Issue đang kích hoạt; và chỉ mục tìm kiếm có độ trễ — nhãn vừa gắn có thể chưa index, truy vấn trả 0, cổng **fail-open**. Sai chiều |
| `manual-approval: <env>` | Là cổng Environment thật, nhưng **không điều kiện**: chặn mọi lần chạy kể cả `risk:low`. Và Environment không gác merge (xem "Hai cổng người" bên dưới) |
| `safe-outputs.*.required-labels` | Có thật, nhưng schema của bản ghim **không** có nó cho `create-pull-request` — tức đúng đường ghi cần gác thì lại không có |

Cổng này **fail-closed hai chiều**: có `risk:high` thì từ chối, mà **thiếu** phân loại rủi ro cũng
từ chối. Và nó từ chối *ồn ào* — job `pre_activation` hỏng, run hiện ❌ — chứ không im lặng bỏ qua.
Prompt trong thân pilot được giữ nguyên làm **lớp thứ hai**, không phải lớp thứ nhất.

Cái vẫn **chưa** chứng minh: cổng này chưa chạy thật lần nào, vì chưa có credential engine. Nó là
`CONFIG_ONLY` cho tới tình huống 7 của Phase B.

## Về bản ghim — re-audit 15/09/2026

Review độc lập yêu cầu repin lên bản stable hiện tại và nêu rằng upstream đã tới `v0.89.12`.
**Đo lại thì `v0.89.12` là một prerelease, không phải stable** — và `v0.88.7` vẫn đang là bản
stable mới nhất. Hai đường đo độc lập, cùng một câu trả lời:

```text
gh api repos/github/gh-aw/releases/latest
  -> tag=v0.88.7  prerelease=false  published=2026-09-08T15:34:49Z

gh api "repos/github/gh-aw/releases?per_page=40"
  -> v0.89.15 v0.89.13 v0.89.12 ... v0.88.8   deu prerelease=true
  -> v0.88.7                                  prerelease=false   <-- stable moi nhat
```

Nâng lên `v0.89.12` sẽ **mâu thuẫn với chính tiêu chí** mà ADR này dùng để bác `v0.88.4` ở #199:
`v0.88.4` bị loại **vì nó là prerelease**. Dùng cùng một cây thước thì `v0.89.12` cũng bị loại
bởi cùng một lý do. Nên quyết định repin là: **giữ `v0.88.7`, và ghi ngày đo vào chính bản ghim**
(`# gh-aw-audit:` trong pilot, và chú thích HTML cùng tên ở đầu ADR lẫn tài liệu bằng chứng) để
lần sau phân biệt được *"vẫn là bản stable mới nhất"* với *"không ai kiểm lại từ tháng trước"*.

Delta `v0.88.7...v0.89.15` là **180 commit**. Về **security**: **không advisory mới nào** kể từ
29/08/2026 — cả 10 advisory đã công bố đều có dải ảnh hưởng kết thúc **dưới** `v0.88.7`, đo lại
ngày 15/09 bằng `repos/github/gh-aw/security-advisories` (có đối chứng âm trên một repo khác để
chắc rằng "rỗng" là rỗng thật). Về **capability**: delta gồm bump firewall
(`gh-aw-firewall` v0.28.15→v0.28.16, `gh-aw-mcpg` v0.4.21), các vòng audit threat-spec hằng ngày,
`add-labels` siết giới hạn target, và **hai bản vá đường token GitHub App** (#59743, #60137 — giữ
quyền `contents` cho checkout do built-in job dựng). Không commit nào đổi một bất biến mà pilot
dựa vào (`staged`, strict permissions, chặn fork, `on.roles`).

**Ghi thẳng cái chưa đóng:** hai bản vá App-token ở trên nằm **sau** bản ta ghim. Chúng chỉ chạm
nhánh có checkout do built-in job dựng — pilot hiện không đi nhánh đó — nhưng đây là lý do phải
đo lại bản ghim **trước** bước activation, không phải sau.

## Codex reviewer: chưa chứng minh

Bản trước của ADR này xếp "người duyệt chính thức độc lập" là **đã chạy thật**, lấy 40 comment của
App `chatgpt-codex-connector` làm bằng. **Đó là bằng sai loại.** Đo lại 15/09/2026 trên 13 PR
(#310 #307 #306 #305 #302 #290 #263 #206 #199 #191 #155 #151 #136):
`GET /pulls/<n>/reviews` **không trả về một review event nào** của App đó. Đối chứng âm cho thấy
endpoint hoạt động bình thường — review của người (`COMMENTED`) vẫn hiện ở #305, #302, #290, #206.

Nên sự thật đo được là: **Codex đăng issue comment, chưa từng phát một GitHub Code Review nào trong
repo này.** Một issue comment không vào `/pulls/*/reviews`, không tính vào required-approvals, và
không phải thứ #309 §9 tình huống 5 hỏi. Tình huống đó nay là **NOT PROVEN**.

Điều này **không** đổi quyết định bác PR #206 (6.889 dòng cầu nối trình duyệt): App chính thức vẫn
đang chạy trong repo và vẫn rẻ hơn một extension. Nó đổi **mức** ta được phép tuyên bố — "người
đọc độc lập", không phải "người duyệt chính thức".

## Hai cổng người — merge và deploy là hai thứ khác nhau

Bản trước gộp chúng làm một khi viết *"cổng người là Environment"*. Tách ra:

| | Cổng **merge** | Cổng **deploy** |
|---|---|---|
| Chặn cái gì | PR vào `main` | Một **job** khai `environment:` |
| Ai cưỡng chế | Ruleset `main-protection` | GitHub Environment |
| Trạng thái đo 15/09 | `required_approving_review_count: 0` + 7 required check (`strict: true`) | `production`: required reviewer = chủ repo, `prevent_self_review: false` |
| Dùng ở đâu | mọi PR | job `deploy-silo` của `reusable-deploy-tenant.yml` |
| Tự duyệt được? | **không** — GitHub cấm tự duyệt PR của mình | **có** |

Hệ quả phải nói thẳng: **hôm nay repo này không có cổng người ở bước merge.** Cái đang có là cổng
người ở bước **deploy**. Environment không biết gì về PR; nó chỉ giữ một job lại.

Muốn Environment chặn được merge thì phải biến job có `environment:` thành **required status check
thứ 8** — việc đó đụng thẳng bất biến 7 của `tools/autopilot-v2-contract` (*đúng 7 check*), và có
một cái giá đã đo: chú thích đầu `.github/workflows/deploy-tenant.yml` ghi lại sự cố 17/08/2026,
một run đang **chờ duyệt** chiếm làn concurrency và chặn 26 phút một lần deploy hợp lệ. ADR này
**không** đề xuất làm vậy.

Nên hai câu phải tách bạch, và bản #311 sửa đúng chỗ #310 nói thiếu:

- **Cổng chặn agent** — nay là **tất định**, không còn ở tầng prompt: `on.steps` + `if:` khiến job
  agent không chạy với `risk:high`. Xem mục riêng ở trên.
- **Cổng người ở bước merge** — vẫn **NOT PROVEN**, và vẫn phụ thuộc ghế Copilot (§4.2 của tài liệu
  bằng chứng). Đo 16/09 còn siết thêm: Codex đăng dưới danh tính chủ repo, nên nó không thể là
  người duyệt thứ hai dù có bật gì đi nữa.

Hai thứ đó khác nhau: cái thứ nhất chặn **máy tự làm**, cái thứ hai chặn **merge vào `main`**.
Có cái thứ nhất không có nghĩa là đã có cái thứ hai.

## Bối cảnh

Repo đã tích luỹ **30.733 dòng** mã Autopilot tự viết — 10.000 trên `main`, 20.733 nằm trong 12 PR
mở. Trong khi đó tech radar của chính repo đã xếp *"Runtime cho coding agent"* vào **AVOID BUILDING**
từ 27/08/2026.

Kết quả vận hành sau 395 lần chạy orchestrator trên `main`: **0 lần ghi thành công**. Biến
`AUTOPILOT_DRY_RUN` vẫn là `true`; lần ghi thật duy nhất từng thử trả `403` và PR sửa (#191) mở từ
04/09 tới nay chưa merge. README của chính gói ghi nhận trong mục NOT PROVEN rằng đường ghi chưa từng
chạy thật, và rằng trigger `check_suite` **sẽ không bao giờ** kích hoạt trong repo này.

## Các phương án đã cân

| Phương án | Kết quả |
|---|---|
| **A. gh-aw** (ADOPT) | ✅ **CHỌN** — strict mode *từ chối biên dịch* job agent xin quyền ghi; sandbox + firewall; threat detection; chặn fork mặc định; staged mode; ghim SHA/digest; engine hoán đổi được |
| **B. Copilot cloud agent** (gán Issue cho agent) | ❌ Không dùng được: `suggestedActors(CAN_BE_ASSIGNED)` chỉ trả về chủ repo ⇒ chưa có ghế Copilot. Và khi ruleset không tương thích, cách gỡ chính thức là thêm **bypass actor** — mở lại đúng lỗ mà `bypass_actors: []` đang bịt |
| **C. `claude-code-action`** | 🟡 **Đường lui tạm, không phải đích.** Là đường duy nhất chạy được *ngay* (nhận `CLAUDE_CODE_OAUTH_TOKEN` sẵn có). Nhưng ít lan can hơn, và mang CVE-2026-47751 trong tiền sử |
| **D. Local Dispatcher** (PR #263) | ❌ Bác. 7.187 dòng daemon Windows để làm việc mà một runner GitHub làm được |
| **E. Conversation Bridge** (PR #206) | ❌ Bác. 6.889 dòng extension + native host để đánh thức ChatGPT — trong khi App Codex chính thức **đã đăng 40 comment trong repo này** từ 01/09/2026 |
| **F. Giữ nguyên tự viết** (`KEEP_CUSTOM` của #194) | ❌ Bác. Bốn bằng chứng của #199 trả lời câu hỏi *"có nên nhúng mã gh-aw vào orchestrator không"*, không phải *"có nên thay orchestrator bằng gh-aw không"*. Và bản được audit (`v0.88.4`) là **prerelease**, đứng sau stable 109 commit |

## Hệ quả

**Tích cực**

- Xoá **10.000** dòng khỏi `main`; **20.733** dòng nữa không bao giờ vào. Ròng ≈ **−29.300**.
- Các bất biến chuyển từ *"test tĩnh đọc YAML"* sang *"trình biên dịch từ chối"* và *"GitHub cưỡng
  chế bằng token"*.
- Có thêm ba lớp mà bản tự viết chưa từng có: chống prompt injection, phát hiện rò rỉ bí mật/patch
  độc, kiểm soát egress mạng.
- Suy biến an toàn: tầng AI hỏng thì Issue/PR/CI/deploy vẫn chạy nguyên vẹn.

**Tiêu cực / phải chấp nhận**

- **Chưa chạy được hôm nay.** Repo không có credential nào gh-aw chấp nhận: chỉ có
  `CLAUDE_CODE_OAUTH_TOKEN`, mà gh-aw **cố tình bỏ qua** token đó. Cần đúng một khoản mua — khuyến
  nghị **ghế Copilot Pro (~$10/tháng)**, vì nó mở cả engine Builder lẫn cổng approval.
- Phụ thuộc một sản phẩm **public preview**, minor hàng tuần. Hạ rủi ro bằng ghim tag+SHA, commit
  lock file, chỉ dùng built-in đã chín.
- Mất khoá idempotency khi đăng comment. Chấp nhận được vì trạng thái nay nằm ở nhãn, không ở comment.
- **Rào CI của `GITHUB_TOKEN` — mô tả chính xác.** Nói *"không kích hoạt CI"* là chưa đúng. Đo trên
  chính repo này (PR #136, SHA `509b566`): GitHub **CÓ tạo** run `pull_request` cho SHA mới —
  run `33676122047`, workflow `ci` — nhưng nó dừng ở `conclusion=action_required` với **0 job**,
  `triggering_actor=github-actions[bot]`. Tức là **có bản ghi run, và nó không tự chạy**; hai trạng
  thái "không có run" và "có run nhưng 0 job" nhìn rất khác nhau lúc gỡ lỗi.
- **Lối thoát đã đo được một nửa.** Cùng repo, PR #151: commit `472b721` đẩy bằng installation
  token của App `nexagent-autopilot` → run `33717371535`: `triggering_actor=nexagent-autopilot[bot]`,
  `run_attempt=1`, **7/7 job chạy thật, `success`**, không ai bấm Approve. Ranh giới không nằm ở
  *"commit tự động"* mà ở **danh tính người đẩy**. gh-aw dùng đúng cơ chế đó qua
  `github-token-for-extra-empty-commit: app` — đã nối dây trong pilot, **chưa chạy end-to-end** vì
  chưa có credential engine.

## Điều kiện đảo ngược

Nếu đo end-to-end cho thấy `github-token-for-extra-empty-commit: app` **không** làm run của PR
thoát khỏi `action_required`, thì Builder lùi về phương án **C** (`claude-code-action`) — vẫn giữ
nguyên phần trạng thái gốc và kế hoạch xoá của ADR này. Đảo về tự viết thì không: mã đó đã có 395 lần
chạy và 0 lần ghi.

Vật liệu để đo đã có sẵn và **tên đã được kiểm lại bằng API**, không suy từ trí nhớ:
`vars.NEXAGENT_AUTOPILOT_CLIENT_ID` + `secrets.NEXAGENT_AUTOPILOT_PRIVATE_KEY` (chú ý:
`NEXAGENT`, **không** phải `NEXAGNET` — bản trước của tài liệu này viết sai một chữ, và sai một chữ
thì `secrets.*` ra chuỗi rỗng mà không có thông báo lỗi nào).

## Cổng chặn trước khi thực hiện — cập nhật 16/09/2026

Cổng §14 của #309 (*review độc lập trước khi biên dịch*) **đã qua**: PR #310 được review và merge
thành `86d106e`. Nên hai việc trước đây bị cấm nay đã làm, trong Phase A của #311:

- ✅ **biên dịch `.lock.yml`** — bằng đúng `gh aw v0.88.7`, đã commit, mọi `uses:` ghim SHA 40 ký
  tự và mọi image ghim digest. Bất biến 12 khoá việc lock phải do đúng bản ghim sinh ra.
- ✅ **cổng rủi ro tất định** — thay cổng prompt.

Còn lại, và **vẫn bị chặn**:

- ❌ **bỏ `staged: true`** — việc của Phase B, và chỉ có nghĩa sau khi có credential engine.
- ❌ **xoá mã Autopilot đã trên `main`** — việc của Phase C, và chỉ khi đủ 7/7 tình huống PROVEN.
- ⛔ **Cổng hành động của chủ repo.** Không credential nào gh-aw chấp nhận tồn tại trong repo hôm
  nay, nên pilot **không chạy được đến nơi** dù đã biên dịch. Đây là một khoản chi, không phải một
  khoảng trống kỹ thuật — xem §5 của tài liệu bằng chứng. Khuyến nghị vẫn là **một ghế Copilot
  Pro**, vì sau phép đo Codex ở trên, nó là đường duy nhất còn lại mở được *cả* engine Builder
  *lẫn* cổng người-duyệt-thứ-hai.
