# Mục lục tài liệu

Tài liệu tách theo **tuổi thọ và chủ sở hữu**, không theo định dạng file. Ba nhánh cấp 1:

| Khu vực                                        | Vai trò                                                                           | Nhịp thay đổi                     | Điểm vào                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| [`kien-truc/`](kien-truc/nen-tang-da-khach.md) | **Canonical.** Hệ thống được thiết kế thế nào — đúng cho mọi khách, mọi thời điểm | Hiếm; đổi là quyết định kiến trúc | [`kien-truc/nen-tang-da-khach.md`](kien-truc/nen-tang-da-khach.md)     |
| [`phat-trien/`](phat-trien/README.md)          | **Công việc.** Đang làm gì, xong gì, kiểm thử ra sao                              | Liên tục                          | [`phat-trien/ke-hoach/tong-quan.md`](phat-trien/ke-hoach/tong-quan.md) |
| [`khach-hang/`](khach-hang/README.md)          | **Theo khách.** Hồ sơ nguồn, trao đổi, nghiệp vụ, bản bàn giao                    | Theo từng khách                   | [`khach-hang/ultty/README.md`](khach-hang/ultty/README.md)             |

### Bốn tài liệu NỀN TẢNG mới (27/08/2026)

| File                                                                                       | Là gì                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`kien-truc/reference-platform-stack.md`](kien-truc/reference-platform-stack.md)           | **Hợp đồng stack tham chiếu** — `ultty-gd1-test` phải chứng minh được gì, thang parity L0–L5, 4 mặt phẳng nền tảng, **CANONICAL CURRENT TRUTH**, known risks |
| [`kien-truc/tech-radar.md`](kien-truc/tech-radar.md)                                       | **ADOPT/TRIAL/ASSESS/HOLD/AVOID** kèm bằng chứng, và **FRAMEWORK DECISION**                                                                                  |
| [`kien-truc/agentic-ops.md`](kien-truc/agentic-ops.md)                                     | Bốn mức tự động hoá vận hành — **định hướng dài hạn, chưa triển khai gì**                                                                                    |
| [`phat-trien/ke-hoach/platform-roadmap-v2.md`](phat-trien/ke-hoach/platform-roadmap-v2.md) | Lộ trình **nền tảng** P0→P15; mỗi phase có WHY/ENTRY/DELIVERABLES/RUNTIME PROOF/EXIT + **DO NOT DO**                                                         |

> Trạng thái hiện tại của nền tảng: xem
> [`reference-platform-stack.md §6`](kien-truc/reference-platform-stack.md#6-canonical-current-truth-27082026).
> Trạng thái kế hoạch (✅/⬜) vẫn chỉ ở
> [`tong-quan.md`](phat-trien/ke-hoach/tong-quan.md) — nay có thêm **§12** cho tầng nền tảng.

### Ba tài liệu trong `kien-truc/` khác vai nhau

| File                                                                   | Là gì                                                                                                                                                                           | Không phải gì                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`nen-tang-da-khach.md`](kien-truc/nen-tang-da-khach.md)               | **Kiến trúc tổng quát cao nhất** — core/tenant, port/adapter, silo, cách ly dữ liệu, bất biến bảo mật                                                                           | Không phải kế hoạch, không chứa trạng thái, không nhắc tên khách          |
| [`he-thong.md`](kien-truc/he-thong.md)                                 | **Thiết kế kỹ thuật & as-built** — sơ đồ, quyết định kỹ thuật, phụ lục PoC                                                                                                      | Không được mâu thuẫn với file trên                                        |
| [`api-http.md`](kien-truc/api-http.md)                                 | **Hợp đồng HTTP** — xác thực, phân quyền, toàn bộ endpoint, giới hạn tần suất, hình dạng lỗi                                                                                    | Không phải hướng dẫn vận hành, không chứa dữ liệu khách                   |
| [`business-decision-ledger.md`](kien-truc/business-decision-ledger.md) | **Sổ cái quyết định nghiệp vụ** — bốn mặt phẳng sự thật, khi nào dùng sổ cái / telemetry / audit log, chống trùng, chính sách thất bại theo mức nghiêm trọng, hợp đồng riêng tư | Không phải Evidence Graph, không phải Replay, không phải Diagnostic Agent |
| [`nen-tang-tep.md`](kien-truc/nen-tang-tep.md) | **Nền tảng Tệp** — mã tệp đục, `biết mã ≠ được đọc`, vòng đời rút/cách ly/dọn byte, cổng quyền theo miền, trung lập nhà cung cấp | Không nhắc taxonomy của miền nào; **chưa có backfill**, chưa có primitive web |

> ⚠️ Đừng nhầm [`kien-truc/nen-tang-da-khach.md`](kien-truc/nen-tang-da-khach.md) (kiến trúc) với
> [`phat-trien/ke-hoach/dot-0-nen-tang.md`](phat-trien/ke-hoach/dot-0-nen-tang.md) (kế hoạch Đợt 0).
> Tên từng gần giống nhau nên đã đổi tên file kế hoạch cho khỏi lẫn.

### Hợp đồng vertical (28/08/2026)

Ba file trên mô tả **nền tảng**. Bên cạnh chúng bắt đầu có **hợp đồng theo vertical** — mô tả một
miền nghiệp vụ dùng lại được cho nhiều khách cùng ngành:

| File                                                                         | Là gì                                                                                                                                                                                                                                                                                  | Không phải gì                                                                                                                                                              |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`transport-domain-contract.md`](kien-truc/transport-domain-contract.md)     | **Transport Domain v0** — bounded context, aggregate, bất biến tài chính, capability, phân quyền, guardrail, case nghiệm thu, giả định demo                                                                                                                                            | Không nhắc tên khách; không phải kế hoạch; **chưa có code**                                                                                                                |
| [`transport-domain-v2.md`](kien-truc/transport-domain-v2.md)                 | **Transport Domain v2 — R0**: kiểm kê mô hình đang chạy (`KEEP/EXTEND/MIGRATE/DEPRECATE`), phản biện lộ trình #229 kèm bằng chứng, ma trận công nghệ, mô hình mối đe doạ, câu hỏi nghiệp vụ còn treo, tranche kế tiếp                                                                  | Không thay thế v0; không phải kế hoạch có lịch; **§3.1 địa không gian đã bị đo lại và sửa đổi**                                                                            |
| [`transport-geospatial.md`](kien-truc/transport-geospatial.md)               | **Nền địa không gian** — số đo PostGIS ⟂ Postgres tiêu chuẩn ở hai quy mô, dung lượng/xe cho 10·50·100 xe, chính sách lấy mẫu có trần, lưu giữ có hạn, đường nâng cấp chỉ-cộng-thêm                                                                                                    | Phán quyết địa không gian **đang có hiệu lực**, thay cho v2 §3.1; chưa quyết bản đồ                                                                                        |
| [`transport-fuel-intelligence.md`](kien-truc/transport-fuel-intelligence.md) | **Fuel intelligence (Lane C)** — hoá đơn điện tử xăng dầu theo NĐ 70/2025: bản đồ trường XML (QĐ 1450/QĐ-TCT), vì sao dấu chấm ở đây là dấu thập phân **ngược** với bảng kê, danh tính cây xăng 5 kết cục, hai bất biến `INV-C2-DUP`/`INV-C2-NOMONEY`                                  | **NĐ 123/2020 Điều 10 không có trường biển số xe** ⇒ hoá đơn không nói được XE NÀO; bốn phép kiểm còn thiếu dữ liệu được ghi rõ ở §5                                       |
| [`transport-fuel-run-first.md`](kien-truc/transport-fuel-run-first.md)       | **Fuel Event Run-first (#364)** — phiếu dầu là sự kiện của XE; `tripId` chỉ để tương thích, vòng xe/chặng là ngữ cảnh tuỳ chọn; lớp phân bổ giá thành riêng, chỉ ghi thêm; quy tắc "một phiếu, một sổ cái"                                                                             | Không cộng vào `runMargin` (tồn đọng R-1); phiếu không vòng xe vẫn fail closed chờ quyết định chủ repo                                                                     |
| [`transport-etc-toll.md`](kien-truc/transport-etc-toll.md)                   | **ETC / phí đường bộ — NGHIÊN CỨU**: khung pháp lý (NĐ 119/2024, Luật Đường bộ Đ.43), hai nhà cung cấp, hoá đơn điện tử là nguồn giao dịch giàu nhất, ánh xạ tài khoản↔xe, hợp đồng `TollProviderPort`                                                                                 | `RESEARCH ONLY` — **không** có quy trình đối soát nào được dựng; ETC là công ty trả và không chạm sổ quỹ lái xe                                                            |
| [`transport-etc-ingestion.md`](kien-truc/transport-etc-ingestion.md)         | **ETC — nạp dữ liệu & đối soát (Lane J)**: đo lại VETC/ePass bằng **văn bản gốc Chính phủ**, phân loại bằng chứng bốn mức, bất biến **NĐ 119/2024 Đ.11 kh.3** (1 xe → ĐÚNG 1 tài khoản), VETC tự công bố trừ-2-lần → **hoàn 1 giao dịch RIÊNG**, `Đ.26 kh.2` là đường dữ liệu hợp pháp | `INGESTION FOUNDATION` — `API_STATUS=NOT_PUBLICLY_PROVEN` cả hai bên; bộ cột từng nhà cung cấp còn `BLOCKED_SAMPLE_REQUIRED`; **không** chính sách hạch toán nào được dựng |
| [`transport-driver-app.md`](kien-truc/transport-driver-app.md)               | **Ứng dụng lái xe** — chấm RN/Expo ⟂ Flutter ⟂ native theo đúng nhu cầu #235, chi phí SDK định vị nền không tránh được, **hai chặn phát hành mới của Google Play**, thang toàn vẹn thiết bị                                                                                            | Chốt nền tảng; **ứng dụng CHƯA được viết**, và tài liệu nói rõ nó chưa                                                                                                     |

Nguồn nghiệp vụ của nó nằm bên khách:
[`khach-hang/van-tai-viet/nghiep-vu/nguon-su-that-van-tai.md`](khach-hang/van-tai-viet/nghiep-vu/nguon-su-that-van-tai.md).
Ranh giới giữ nguyên như mọi chỗ khác trong `docs/`: **sự kiện của khách ở `khach-hang/`, thiết kế
của chúng ta ở `kien-truc/`**.

### Autopilot V3 — GitHub-native, Claude Max trên cloud (22/09/2026)

| File | Là gì | Không phải gì |
| ---- | ----- | ------------- |
| [`phat-trien/van-hanh/autopilot-v3-cloud-builder.md`](phat-trien/van-hanh/autopilot-v3-cloud-builder.md) | **Vận hành Phase A (#362)**: Issue của chủ repo + nhãn `agent:claude` → cổng xác minh theo ID → `claude-code-action` trên runner GitHub-hosted (gói Claude Max) → nhánh → PR draft → CI. Ranh giới tin cậy, quyền, tắt khẩn cấp, kiểm kê legacy | Chưa chạy trên GitHub: pilot chỉ chạy được sau khi merge (sự kiện `issues` dùng workflow của nhánh mặc định) |
| [`kien-truc/adr-0002-autopilot-v3-github-native.md`](kien-truc/adr-0002-autopilot-v3-github-native.md) | **ADR — `GITHUB_NATIVE_CONTROL_PLANE + SWAPPABLE_EXECUTION_ADAPTER`** (#361). Thay phần "nền thực thi = gh-aw" của ADR-0001 | Không xoá legacy — việc đó là Phase D |

### Autopilot — official-first (15/09/2026) — **nền thực thi gh-aw bị thay bởi ADR-0002**

| File                                                                                                      | Là gì                                                                                                                                                                                  | Không phải gì                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`phat-trien/van-hanh/autopilot-v2-official-first.md`](phat-trien/van-hanh/autopilot-v2-official-first.md) | **Kiểm kê + ma trận thay thế + kiến trúc đích + kế hoạch xoá** — đo lại gh-aw `v0.88.7` (re-audit 16/09/2026), năng lực chính thức của GitHub/Codex/Copilot, ràng buộc credential đo được của chính repo này | Chưa chạy — pilot **đã biên dịch nhưng vẫn `staged`**, và **chưa có credential engine** nên chưa từng chạy tới nơi. Chưa xoá gì khỏi `main`: Phase C của #311 chỉ mở khi đủ 7/7 tình huống `PROVEN` (hôm nay 0/7) |
| [`kien-truc/adr-0001-autopilot-official-first.md`](kien-truc/adr-0001-autopilot-official-first.md)         | **ADR — `DECISION = ADOPT_GITHUB_NATIVE_GH_AW`**: trạng thái nghiệp vụ về GitHub gốc, mặt phẳng thực thi về gh-aw ghim bản                                                            | Không còn là đề xuất — **ĐÃ CHẤP NHẬN** qua PR #310 (merge `86d106e`). Nhưng "đã chấp nhận" ≠ "đã chạy" |

### Giao thức Autopilot V0 (03/09/2026) — **SUPERSEDED bởi ADR-0001**

| File                                                                                           | Là gì                                                                                                                                                                                                        | Không phải gì                                                                                                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| [`phat-trien/van-hanh/autopilot-protocol-v0.md`](phat-trien/van-hanh/autopilot-protocol-v0.md) | **Giao thức ChatGPT ↔ GitHub ↔ Claude V0** — tác nhân, 9 thông điệp có marker, máy trạng thái, quy tắc SHA/CI/rủi ro/retry/idempotency, Task Contract; bản máy đọc + validator ở `tools/autopilot-protocol/` | Chưa có orchestrator, dispatcher Claude, auto-merge hay CD — **nền tảng giao thức**, không phải tự động hoá đang chạy |

## Quy ước đặt tên

- Tên thư mục/file dùng chữ thường, không dấu và `kebab-case`.
- Ngày trong tên file dùng ISO: `YYYY-MM-DD`; tài liệu theo tháng dùng `YYYY-MM`.
- Hồ sơ trong `nguon-goc/` không sửa nội dung. Nếu cần phân tích hoặc diễn giải, tạo tài liệu dẫn xuất ở `nghiep-vu/` hoặc `phat-trien/`.
- Chỉ [`phat-trien/ke-hoach/tong-quan.md`](phat-trien/ke-hoach/tong-quan.md) giữ trạng thái `✅/⬜`; kế hoạch con chỉ giữ phạm vi và thiết kế.
- File bàn giao và nguồn sinh file được đặt cạnh nhau dưới `khach-hang/<slug>/ban-giao/`.
- Không đưa dữ liệu riêng của khách vào tài liệu kiến trúc base nếu không cần; dùng đường dẫn tham chiếu sang hồ sơ khách.
