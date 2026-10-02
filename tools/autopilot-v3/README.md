# tools/autopilot-v3 — cổng kích hoạt + khoá bất biến của `claude-builder`

Thư mục này **không phải** một gói orchestration. Nó chỉ có:

| Tệp | Vai | Chạy ở đâu |
|---|---|---|
| `gate.mjs` | Cổng kích hoạt lớp 2: đọc lại Issue + quyền người gắn nhãn qua API, quyết định với mã lý do có kiểu. Không phụ thuộc gói ngoài | Job `gate` của [`.github/workflows/claude-builder.yml`](../../.github/workflows/claude-builder.yml) — token chỉ đọc, **không** secret |
| `gate.test.mjs` | Hành vi của cổng trước mọi đường không tin cậy (người lạ, bot, Issue của người lạ, trùng login khác ID, re-run, nhãn khác, trạng thái đổi, API lỗi, token không lọt log) | `pnpm test` → job `verify` |
| `claude-builder.contract.test.mjs` | 19 bất biến cấu hình của workflow mà ranh giới an ninh dựa vào — hàng rào của phiên Claude kiểm **theo nghĩa** của luật deny, không theo chuỗi — cộng 2 bài **đối chứng âm chạy mỗi lần** (gỡ từng guard → bộ kiểm phải báo đúng lỗi) | `pnpm test` → job `verify` |

Bối cảnh, ranh giới tin cậy, tắt khẩn cấp:
[`docs/phat-trien/van-hanh/autopilot-v3-cloud-builder.md`](../../docs/phat-trien/van-hanh/autopilot-v3-cloud-builder.md).

## Chạy

```bash
pnpm test:autopilot-v3        # cũng nằm trong `pnpm test` của CI
```

Không gọi mạng, không cần secret, không cần DB.

## Bất biến được khoá

1. Kênh kích hoạt duy nhất: `issues.labeled` — không `issue_comment`, `pull_request(_target)`,
   `workflow_dispatch`, `workflow_run`, `schedule`, `push`.
2. `permissions: {}` ở gốc và ở job `build`; job `gate` chỉ đọc; **không** `id-token` ở đâu cả.
3. `if:` của `gate` đủ năm điều kiện (người gắn là `User`, ID người gắn = ID chủ repo, ID tác giả Issue =
   ID chủ repo, `triggering_actor` = chủ repo, Issue mở), chỉ nối bằng `&&`.
4. `gate` chạy `gate.mjs`, không chạm secret; `build` cần `gate` và chỉ chạy khi `authorized == 'true'`.
5. Chỉ hai secret (`CLAUDE_CODE_OAUTH_TOKEN`, `NEXAGENT_AUTOPILOT_PRIVATE_KEY`), chỉ trong job `build`.
6. Mọi `uses:` ghim SHA 40 hex đúng bản đã audit, và tài liệu vận hành ghi cùng SHA đó.
7. Token App xin đúng `contents`/`issues`/`pull-requests: write` — không `workflows`, không gì khác.
8. Action Claude ghi bằng token App, chỉ đọc comment của chủ repo, `use_commit_signing: true`, không
   `allowed_non_write_users`, `allowed_bots`, `show_full_output`, `display_report`, `anthropic_api_key`.
9. `claude_args` chỉ có `--max-turns` và `--append-system-prompt` — không cờ nào nới hay ghi đè chính
   sách (`--setting-sources` bỏ được nguồn `user` nơi action ghi `settings`; `--allowedTools`/`--mcp-config`
   cấp thêm công cụ ghi; `--permission-mode` đổi chế độ).
10. Settings của phiên: `blockReadsOutsideWorkingDirectories: true`; deny `Bash`, `WebFetch`, `WebSearch`,
    `Read(.git/**)`; **không** có luật `Write(...)`/`MultiEdit(...)`/`NotebookEdit(...)`/`Glob(...)`
    (Claude Code không bao giờ xét chúng); không `defaultMode`, không `allow`.
11. `mcp__github_file_ops__delete_files` bị deny — luật `Edit(...)` không ràng buộc công cụ MCP, và công
    cụ này tạo tree xoá cho **mọi** đường dẫn trong repo. `commit_files` (và server của nó) **không** bị
    deny: đó là đường commit duy nhất. Kiểm kê công cụ ghi gắn với SHA action đã ghim — nâng bản thì test đỏ
    tới khi đọc lại mã upstream.
12. Mặt phẳng điều khiển (`CONTROL_PLANE`, gồm cả tệp **chưa tồn tại** và tệp chỉ dẫn ở **cấp lồng**) bị một
    luật `Edit(...)` phủ: `AGENTS.md`, `CLAUDE.md`, `CLAUDE.local.md` ở mọi cấp; `.claude/` ở mọi cấp;
    `.mcp.json`; `tools/autopilot-v3/`; `.git/`; `.github/`; `deploy/`; `tenants/`.
13. Mọi luật `Edit(...)` có dạng mà tài liệu Claude Code viết rõ nghĩa (tên trần, `**/tên`, `dir/**`,
    `**/dir/**`, đường dẫn nhiều đoạn) — không tiền tố `/` (trong settings nguồn `user` nó neo ở
    `~/.claude/`), không glob ở giữa; luật `mcp__` không có ngoặc (Claude Code **bỏ qua** loại đó khi nạp
    settings).
14. Vùng làm việc bình thường (`EDITABLE`: mã ứng dụng, `packages/`, `docs/`, tệp pilot R0, `package.json`)
    **không** bị luật nào phủ.
15. Trên **mọi tệp đang có** trong cây: bị một luật `Edit(...)` phủ ⇔ thuộc đặc tả mặt phẳng điều khiển
    (viết độc lập với workflow) — lệch theo chiều nào cũng đỏ: `CLAUDE.md` tồn tại mà không bị rào, hay mã
    ứng dụng bị rào nhầm. Cây không có symlink (tiền đề của `commit_files`).
16. Không bước nào **sau** agent chạy mã từ workspace.
17. Nhãn kích hoạt khai nhất quán ở `if:`, `ACTIVATION_LABEL`, `label_trigger` — và không phải `agent:ready`.
18. Không biểu mẫu Issue nào tự gắn nhãn kích hoạt.
19. Runner `ubuntu-24.04` GitHub-hosted, có timeout; concurrency theo Issue, không huỷ lần đang chạy.

**Đối chứng âm chạy mỗi lần** (bài 20–21) — "test có cắn thật" không chỉ là một lần kiểm đột biến lúc
viết:

20. Từ chính sách **thật**, gỡ từng guard **theo nghĩa** (bỏ mọi luật đang phủ đường dẫn đó, không bỏ theo
    chuỗi) và đòi bộ kiểm báo đúng lỗi: gỡ deny `delete_files`, viết nó có ngoặc, deny cả server
    `file_ops`, đổi SHA action; gỡ rào của **từng** mục bắt buộc của review độc lập (`AGENTS.md`,
    `CLAUDE.md`, `.github/`, `.claude/`, `.mcp.json`, `tools/autopilot-v3/`, `deploy/`, `tenants/`) và các
    mục thêm (`CLAUDE.local.md`, `AGENTS.md` lồng, skill lồng trong `.claude/`, `.git/`); thêm `Edit(src)`
    (chặn nhầm mã ứng dụng); tiền tố `/`; `--setting-sources`. Bỏ một mục khỏi `CONTROL_PLANE` cũng đỏ.
21. Trên một cây fixture dựng trong thư mục tạm: mã ứng dụng trong thư mục tên `deploy/` (luật deny một
    đoạn chặn nhầm) → báo; symlink (junction trên Windows) → báo; `nested/CLAUDE.md` **tồn tại** mà rào
    của nó bị gỡ → báo; cây rỗng → bộ quét không được xanh.

**Nghĩa của luật deny** mà bài 12–15, 20–21 dùng lấy từ tài liệu permissions của Claude Code (mục "Read
and Edit", đọc 23/09/2026), không đoán: cú pháp gitignore neo ở thư mục hiện tại; **tên trần khớp ở mọi
cấp** (`Read(.env)` ≡ `Read(**/.env)`); luật **deny** một đoạn thư mục (`deploy/**`) khớp thư mục đó ở
**mọi cấp**; luật nhiều đoạn (`tools/autopilot-v3/**`) chỉ khớp ở vị trí neo. Dạng khác → test đỏ. Đặc tả
`isControlPlane` cố ý neo `.github/`, `deploy/`, `tenants/` ở gốc: một thư mục lồng trùng tên sẽ làm bài 15
đỏ — mã ứng dụng bị chặn nhầm phải là quyết định có chủ đích, không im lặng.

## Đã kiểm bằng đột biến, không chỉ bằng "xanh" (23/09/2026, trên bộ test cuối)

Mỗi đột biến chạy trên **bản sao** (biến `AUTOPILOT_V3_WORKFLOW` / `AUTOPILOT_V3_TEMPLATES`, hoặc bản
sao `gate.mjs` ở thư mục tạm) — working tree không bị đụng. Luật tính: đối chứng trên bản gốc phải xanh
(21/21 + 17/17); đột biến phải đổi ít nhất một dòng **không phải chú thích** (lần chạy đầu có đúng một
"không bắt được" giả — thay thế rơi vào chú thích — đã sửa bộ chạy, không sửa test); bản đột biến của
`gate.mjs` phải qua `node --check`; chỉ bài test **có tên** mới được tính là "bắt được". **57/57 bị bắt;
3/3 đối chứng tương đương vẫn xanh** (test không báo động giả khi viết lại luật thành dạng cùng nghĩa). Số
ở cột phải là số bài ở trên. Các kịch bản cây fixture (symlink, `CLAUDE.md` lồng không rào, `deploy/` lồng,
cây rỗng) nay là bài 21, chạy mỗi lần — không còn nằm trong bộ chạy đột biến.

| # | Đột biến | Bài đỏ |
|---|---|---|
| M1 / M2 | thêm trigger `issue_comment` / `pull_request_target` | 1 |
| M3 | job `build` xin `id-token: write` | 2 |
| M4 / M5 / M18 | bỏ điều kiện `sender.id` / đổi một `&&` thành `\|\|` / bỏ `triggering_actor` | 3 |
| M6 | `github_token` = `secrets.GITHUB_TOKEN` | 5, 8 |
| M7 | token App xin thêm `permission-workflows: write` | 7 |
| M8 | `claude-code-action@v1` thay vì SHA | 6, 11 |
| M9 / M14 | `allowed_non_write_users: '*'` / bỏ `include_comments_by_actor` | 8 |
| M10 / M11 / P15 | bỏ `blockReadsOutsideWorkingDirectories` / bỏ deny `Bash` / bỏ `Read(.git/**)` | 10 |
| M20 / A5 | thêm luật `Write(tenants/**)` (không bao giờ được xét) / thêm `allow` | 10 |
| M12 | chạy `node tools/...` sau bước agent | 16 |
| M13 | `label_trigger: agent:ready` | 17 |
| M15 / M16 | thêm `runs-on: self-hosted` / `cancel-in-progress: true` | 19 |
| M17 | job `gate` đọc `secrets.CLAUDE_CODE_OAUTH_TOKEN` | 4, 5 |
| M19 | một biểu mẫu Issue có `labels: ["agent:claude"]` | 18 |
| **D1** | **bỏ deny `mcp__github_file_ops__delete_files`** | 11, 20 |
| D2 / D3 | gõ sai `…__delete_file` (thiếu `s`) / deny cả server `mcp__github_file_ops` (mất `commit_files`) | 11, 20 |
| D4 | `use_commit_signing: false` | 8, 11 |
| D5 | đổi SHA action mà không kiểm kê lại công cụ MCP | 6, 11 |
| D6 | `mcp__github_file_ops__delete_files(paths:*)` — có ngoặc, bị Claude Code bỏ qua | 11, 13, 20 |
| **P1** / P2 | **bỏ `Edit(**/AGENTS.md)`** / gõ sai thành `Edit(**/AGENT.md)` | 12, 15, 20, 21 |
| **P3** | **bỏ `Edit(**/CLAUDE.md)`** | 12, 15, 20, 21 |
| P4 | bỏ `Edit(**/CLAUDE.local.md)` | 12, 20 |
| P5 / P7 | bỏ `Edit(**/.claude/**)` / hẹp thành `Edit(.claude/settings.json)` | 12, 15, 20 |
| P6 | hẹp thành `Edit(.claude/*)` (một cấp) | 12, 13, 15, 20 |
| P8 / P14 | bỏ `Edit(.mcp.json)` / bỏ `Edit(.git/**)` | 12, 20 |
| P9 / P11 / P13 | bỏ `Edit(tools/autopilot-v3/**)` / `Edit(.github/**)` / `Edit(tenants/**)` | 12, 15, 20 |
| P10 | viết `Edit(/tools/autopilot-v3/**)` (neo ở `~/.claude/`) | 12, 13, 15, 20 |
| P12 | bỏ `Edit(deploy/**)` | 12, 15, 20, 21 |
| E1 / E4 | thêm `Edit(**)` / thêm `Edit` trần | 13 |
| E2 / E5 | thêm `Edit(apps/**)` / `Edit(src)` (tên trần khớp mọi cấp) | 14, 15 |
| E3 | thêm `Edit(docs/**)` | 14, 15, 21 |
| A1 | `claude_args` + `--setting-sources project` (bỏ nguồn `user` = bỏ cả deny) | 9 |
| A2 / A3 / A4 | `claude_args` + `--allowedTools mcp__github__delete_file` / `--mcp-config …` / `--permission-mode bypassPermissions` | 9 |
| Q1 / Q2 / Q3 | **tương đương**: `**/AGENTS.md`→`AGENTS.md`; `**/.claude/**`→`.claude/**`; `.mcp.json`→`./.mcp.json` | **xanh** — đúng kỳ vọng |
| G1 | bỏ kiểm `sender.id` trong `gate.mjs` | 3 bài của `gate.test.mjs` |
| G2 | so người gắn theo login thay vì ID | "trùng LOGIN mà khác ID" |
| G3 | bỏ kiểm Issue còn mở | "Issue đã đóng / nhãn đã gỡ" |
| G4 | cho quyền `write` qua cổng | "không còn quyền admin" |
| G5 | API lỗi → cho qua (fail open) | "API lỗi → từ chối" |
| G6 | in token vào dòng log | "token không bao giờ vào log" |

## Giới hạn đã biết — nói trước

- Bài hợp đồng đọc YAML **bằng văn bản** (thụt lề 2 dấu cách của chính tệp đó), không dùng thư viện —
  cùng lý do với `deploy/netviet/*.contract.test.mjs`. Đổi kiểu viết YAML thì test đỏ; sửa test cho khớp,
  đừng làm bộ tách thông minh hơn.
- Test khoá **cấu hình của repo này**, không kiểm hành vi của GitHub hay Anthropic. Việc workflow chạy
  đúng trên GitHub chỉ chứng minh được bằng pilot sau merge (tài liệu vận hành §6).
- "Luật deny phủ đường dẫn X" ở đây là **nghĩa theo tài liệu**, đọc bằng một bộ đọc viết trong test —
  không phải hành vi đã quan sát của Claude Code 2.1.278 trên runner. Việc phiên thật sự từ chối là
  CONFIG_ONLY cho tới probe hàng rào sau merge (tài liệu vận hành §6.4).
