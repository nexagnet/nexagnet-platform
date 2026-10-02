# ADR-0002 — Autopilot V3: mặt phẳng điều khiển GitHub-native, bộ thực thi thay được

| | |
|---|---|
| **Trạng thái** | **ĐỀ XUẤT** trong PR của [#362](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/362) — có hiệu lực khi chủ repo merge PR đó |
| **Ngày** | 22/09/2026 |
| **Nguồn quyết định** | [#361](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/361) (kiến trúc V3) · [#362](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/362) (Phase A) |
| **`main` lúc viết** | `ea178ecf9863271f5a3d21edb064cea1a11eddb7` |
| **Thay thế** | Phần *"mặt phẳng thực thi = gh-aw"* của [ADR-0001](adr-0001-autopilot-official-first.md). Nguyên tắc *"trạng thái nghiệp vụ = trạng thái GitHub gốc"* của ADR-0001 **giữ nguyên** |
| **Vận hành** | [autopilot-v3-cloud-builder.md](../phat-trien/van-hanh/autopilot-v3-cloud-builder.md) |

## Bối cảnh

- **V0** (giao thức + orchestrator + dispatcher + bridge tự viết) đã bị thay thế; các PR của nó đã
  đóng. Phần còn nằm trên `main` được kiểm kê ở §8 tài liệu vận hành và chỉ xoá ở Phase D.
- **V2** (ADR-0001) chọn gh-aw làm nền thực thi bắt buộc, nhưng chưa chạy tới nơi lần nào: gh-aw bỏ qua
  `CLAUDE_CODE_OAUTH_TOKEN`, repo không có ghế Copilot và không có API key (đo 16/09/2026).
- `anthropics/claude-code-action` chính thức nhận `claude_code_oauth_token` của gói Pro/Max và hỗ trợ
  GitHub App tự tạo thay cho App `claude` — đo lại trên mã nguồn và tài liệu upstream ngày 22/09/2026.

## Quyết định

```text
DECISION = GITHUB_NATIVE_CONTROL_PLANE + SWAPPABLE_EXECUTION_ADAPTER
```

1. **Mặt phẳng điều khiển là GitHub**: Issue, nhãn, PR, check, ruleset, Environment. Không có máy
   trạng thái, sổ cái hay bộ định tuyến tự viết.
2. **Bộ thực thi hôm nay**: `anthropics/claude-code-action` ghim SHA, chạy trên runner GitHub-hosted
   dùng một lần, xác thực bằng `CLAUDE_CODE_OAUTH_TOKEN` (gói Claude Max của chủ repo). Ghi GitHub bằng
   token 1 giờ của App `nexagent-autopilot`, chỉ `contents`/`issues`/`pull-requests`.
3. **Kích hoạt tin cậy, fail-closed**: Issue do chủ repo tạo **và** chủ repo gắn nhãn `agent:claude`.
   Xác minh theo **ID tài khoản** trên event payload (trước khi cấp runner) rồi đọc lại qua API trong
   một job không có secret. Nhãn và nội dung Issue **không** phải thẩm quyền.
4. **Agent viết code, không giữ quyền merge/release**: một bước tất định mở PR draft; CI 7 check +
   ruleset `main-protection` + người quyết merge.
5. **gh-aw** chỉ dùng khi nó là cách chính thức đơn giản nhất cho tự động hoá theo sự kiện/lịch (triage,
   báo cáo, bảo trì, Safe Outputs) — không còn là nền bắt buộc cho coding agent.
6. **Không hồi sinh**: Local Dispatcher, Conversation Bridge, Protocol V0 như runtime, orchestrator/mặt
   phẳng ghi tự viết, đánh thức ChatGPT qua trình duyệt, daemon Windows, bộ định tuyến provider/CSDL task.

## Hệ quả

- **Đổi bộ thực thi (Phase E) = thay job `build`.** Job `gate`, bước mở PR, CI và ruleset không đổi.
- **Mã tự viết mới rất nhỏ**: một workflow + một cổng kích hoạt không phụ thuộc gói ngoài
  (`tools/autopilot-v3/gate.mjs`) + test khoá bất biến của chính repo.
- **Job chứa agent không có `id-token: write`**: provider GCP Workload Identity của repo nhận token OIDC
  từ mọi workflow của repo (`deploy/netviet/setup-github-oidc.sh`). Vì vậy **không** dùng đường App
  `claude` chính thức (đường đó bắt buộc OIDC) mà dùng App tự tạo — cũng là đường upstream hỗ trợ.
- **Quyền merge không đổi**: repo một chủ, chưa cưỡng chế được người duyệt thứ hai. Review ngữ nghĩa độc
  lập là Phase B.
- **Rủi ro chấp nhận có ghi rõ** (token gắn tài khoản cá nhân, quota dùng chung với phiên desktop, prompt
  injection từ nội dung repo): §9 tài liệu vận hành.
