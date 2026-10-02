# KẾ HOẠCH — TỔNG QUAN & TRẠNG THÁI (nguồn sự thật duy nhất)

> **Vai trò:** tài liệu DUY NHẤT giữ **trạng thái** mọi kế hoạch (đang ở đâu, xong gì, chờ gì, quyết định treo, dữ liệu thiếu). Các kế hoạch con CHỈ mô tả phạm vi/thiết kế — **không chứa trạng thái**; muốn biết tiến độ, quay về đây.
> **Kế hoạch con:** [gd1-ultty.md](gd1-ultty.md) (**GĐ1 theo spec khách, đọc trước khi làm tiếp**) · [nen-tang.md](dot-0-nen-tang.md) (Đợt 0 — nền phải xong) · [tinh-nang-dai-han.md](tinh-nang-dai-han.md) (Đợt 1-4 — 6 tính năng mới) · [nen-tang-da-khach.md](../../kien-truc/nen-tang-da-khach.md) (**Đợt B1-B5 — base dùng chung cho nhiều khách**, lập 11/08 khi có khách thứ 2 Amico; đề xuất D26-D31).
> **Thủ tục bật pilot:** [van-hanh/checklist-go-live.md](../van-hanh/checklist-go-live.md) — **đọc trước khi đụng vào biến môi trường của stack khách**.
> **Thay thế (11/07/2026):** `tien-do-va-ke-hoach.md` + `checklist-du-lieu-khach.md` + phần trạng thái của `ke-hoach-dai-han.md` + 2 plan code trong `.claude/plans/` — tất cả đã xóa, git history còn.
> Cập nhật: **21/08/2026 (phiên 6)** — **Pha 6**: hội thoại nhiều lượt (bot hỏi lại khách rồi chốt
> đơn, mỗi khách một mạch riêng trong cùng nhóm) + agent tư vấn **có công cụ** tự tra cứu nguồn sự
> thật. Tìm ra nguyên nhân "AI trả lời y hệt nhau": `ADVICE_COMPOSER` rỗng trên **mọi** stack nên
> câu trả lời chưa từng đi qua LLM. Chi tiết §1.-6.
> Cập nhật: **21/08/2026** — dựng **stack `ultty-gd1-test` RIÊNG** trên cùng VM, không đụng stack DEV
> `zalo-ultty`. Hạ tầng nay keyed theo **STACK SLUG = tenant + môi trường**; `dev`/`production` suy ra
> lại đúng tên cũ nên không stack nào phải di chuyển. **Rà lại bảng SAI LỆCH nghiệp vụ**: 5 hàng lỗi
> thời, code ĐI TRƯỚC tài liệu. **Deploy đã xanh** (run 32408247990). 10 lỗi tiềm ẩn lộ ra, đều
> cùng một hình dạng. Chi tiết §7.
> Cập nhật: **20/08/2026** — refactor foundation đa khách hoàn tất: tenant contract v2, capability-aware
> Nest composition, web experience registry, fixture knowledge-only không Zalo/order và CI tự kiểm
> toàn bộ `tenants/`. Không triển khai hoặc suy diễn domain/UI khách thứ ba. Chi tiết §1.-5 và
> [audit code đa khách](../../kien-truc/multi-customer-code-review.md).
> Cập nhật: **19/08/2026 (phiên 4)** — **kế hoạch 5 pha HOÀN TẤT**: Pha 5 (retrieval FAQ theo BM25 + mở rộng viết tắt) xong; vá lỗ trích dẫn của lớp cơ sở `ChannelAdapter`; neo luật ignore `agents/`. Chi tiết §1.-4.
> Cập nhật: **18/08/2026 (phiên 3)** — đã thực thi kế hoạch 5 pha agent tư vấn (Pha 0-4 xong, Pha 5 còn), gỡ bỏ MockParser khỏi cấu hình (**breaking**), đổi parser sang DeepSeek V4 Flash. Chi tiết §1.-3.
> Cập nhật: **12/08/2026** — GĐ1 **code-complete** (G1-01…G1-14, 8 commit trên `gd1/code-complete`); 9 cổng go-live đạt 1/9, phần còn lại là dữ liệu + pháp lý + công tắc vận hành.

---

## 1. Ảnh chụp nhanh (12/08/2026)

- **🟢 PHẠM VI GĐ1 ĐÃ CHỐT (12/08/2026):** AI được tự gửi vào nhóm. Đơn hợp lệ có tổng số lượng `≤` ngưỡng tenant (Ultty hiện chốt **50**) → rules tính → gửi xác nhận → trạng thái `sent`/hàng việc báo Sale nhập KiotViet thủ công; `>` ngưỡng hoặc thiếu dữ liệu → Sale can thiệp trước gửi. GĐ1 không gọi ERP/KiotViet. Business policy nằm trong gói tenant; `AUTO_SEND` chỉ là kill switch runtime có audit.
- **🟢 DRIVE ĐÃ KIỂM KÊ TOÀN CÂY (12/08/2026):** 122 thư mục, 825 file. Boundary chốt: binary gốc ở Drive/object storage; provenance, product mapping, FAQ, link catalog/video và nội dung tư vấn ở DB/config, quản trị qua `/settings`. Chỉ 5 FAQ dạng DOCX có nội dung; EUS Felix có media nhưng FAQ trống. **Không có bảng giá tháng 8** và **không có nguồn xác nhận công thức 30+1/10+1** ⇒ A6/A7 còn thiếu, không fallback/không suy diễn.
- **✅ GĐ1 P1 AUTO-CONFIRM XONG THEO TDD (12/08/2026):** policy tenant inclusive (Ultty 50) tách khỏi risk 30 SP/20 triệu; `50` gửi, `51` giữ Sale; `OrdersService.sendConfirmation()` dừng ở `sent`, không phụ thuộc/gọi ERP; `salesHandoff` bền trong `OrderView` + SSE + hàng “Việc Sale” và có thao tác hoàn tất; gửi/rerun/reject lặp bị chặn theo state, hai thao tác gửi đồng thời trong một process dùng chung một outbound; endpoint/UI không hỏi lại văn bản D4. *(Cập nhật 12/08 sau audit: ba điểm "còn lệch" ghi ở đây — tư vấn giá dùng `wholesale`, chưa có campaign/scheduler, knowledge Drive chưa có schema/import/settings — **đều đã được làm** và đã wire vào runtime. Xem bảng §1.1. Ba điểm lệch tiếp theo (baseline đỏ · RBAC hở · readiness mồ côi) **cũng đã đóng** ở Đợt A/B/D.)*

### 1.-6 ▶️▶️▶️▶️▶️▶️▶️ PHA 6 (21/08/2026) — HỘI THOẠI NHIỀU LƯỢT + AGENT TƯ VẤN CÓ CÔNG CỤ

**Phản ánh của khách:** hỏi vài câu khác nhau về V08, AI trả lời **y hệt nhau**. Người dùng chỉ đúng: một mô hình xác suất không thể lặp lại nguyên văn. Kết luận sau khi đo trên container đang chạy — **câu trả lời đó chưa từng đi qua LLM**.

| Đo 21/08 | `zalo-ultty` (pilot) | `zalo-ultty-gd1-test` |
|---|---|---|
| `ADVICE_COMPOSER` | *(rỗng)* → Noop | *(rỗng)* → Noop |
| `ANTHROPIC_API_KEY` | *(không đặt)* | *(không đặt)* |
| Nội dung `active` | FAQ 99 · advice 3 · ảnh 102 | FAQ **1**/95, còn lại `draft` |

Hai nguyên nhân độc lập, cùng một triệu chứng:

1. **`render-secrets.sh` chưa bao giờ phát `ANTHROPIC_API_KEY` lẫn `ADVICE_COMPOSER`** ⇒ `NoopAdviceComposer` trên mọi stack ⇒ câu trả lời = `body.join('
')` = **dán nguyên văn FAQ**. Cảnh báo này đã nằm trong [kịch bản test 19/08](../kiem-thu/2026-08-19-kich-ban-test-agent-tu-van.md) nhưng chưa ai nối nó với phản ánh của khách.
2. **Nội dung gói tenant nạp ở `draft`**, mà `productAdvice()` chỉ đọc `active` ⇒ `safeHandoff()` trả về **một chuỗi hard-code** cho mọi câu hỏi.

**Và bot chưa bao giờ hành động theo mạch:** tin thiếu dữ liệu → `needs_edit` → nằm chờ Sale. Tệ hơn, `FakeParser` điền `quantity=1` cho dòng không có số, nên `"gui ghe felix ve TN cho c"` thành đơn **1 chiếc**, không sinh cảnh báo nào, dưới ngưỡng 50 nên **gửi thẳng cho khách**.

#### Đã làm

- **Mạch chốt đơn theo từng khách** (`apps/api/src/conversations/`). Đơn **nửa vời** (`ParseResult.draft`) biểu diễn được "biết bán ghế Felix, chưa biết mấy cái"; hệ thống hỏi lại, gộp câu trả lời, rồi chốt. Khoá `(chatId, senderExternalId)` — hai khách hỏi cùng lúc là hai mạch độc lập. Bền trên Postgres (`ConversationThread`), TTL 45 phút, tối đa 2 câu hỏi rồi chuyển Sale.
- **Agent tư vấn có công cụ** (`apps/api/src/advisor/`). 6 công cụ **chỉ đọc** (`tra_cuu_san_pham`, `tra_cuu_tai_lieu`, `bao_gia`, `tinh_don`, `tra_cuu_chinh_sach`, `lich_su_don`) để LLM tự tra cứu nguồn sự thật rồi tự viết câu trả lời. Thay hẳn `AdviceComposer` — không giữ hai đường soạn song song.
- **Bất biến #5 không đảo ngược.** LLM không *tính* tiền: con số đến từ `bao_gia`/`tinh_don` (rules engine tất định), và `unverifiedAmounts()` kiểm lại sau khi LLM viết. Lọt một con số không có trong kết quả công cụ ⇒ **bỏ bản soạn**, lùi về đường tất định.
- **Vá hai lỗ im lặng của parser thật:** tool `extract_order` của Claude không khai `draft` (nên Claude buộc phải bịa số lượng), và `normalizeParserOutput` không ép kiểu trong `draft` (LLM trả `"20"` ⇒ cả `parseResultSchema` hỏng ⇒ `intent=khac` ⇒ câu trả lời của khách bị vứt, không log).
- **Hạ tầng:** `render-secrets.sh` phát `ANTHROPIC_API_KEY` (optional secret) + tự bật `ADVICE_COMPOSER=claude` khi có khoá; `deploy.ps1` thêm `<prefix>-anthropic-api-key` vào cả danh sách tạo secret lẫn danh sách cấp IAM.

#### Vận hành đã làm tay (21/08)

- Tạo secret `zalo-ultty-gd1-test-anthropic-api-key` + cấp `secretAccessor` cho `netviet-vm@`.
- Duyệt nội dung trên `gd1-test`: FAQ **94** · advice 3 · link 4 · ảnh 102 lên `active`.

#### Còn chờ NGƯỜI quyết

- **`AUTO_SEND` trên `gd1-test` đang `off` (ép cứng trong runtime profile).** Câu hỏi lại chịu **chung** kill switch với bản xác nhận — một câu hỏi tự động cũng là một tin tự động. Nên trên `gd1-test` thấy được `pendingDraft`/`draftGaps`/`conversation` trên console, nhưng **không tin nào ra nhóm**. Muốn nghiệm thu nhóm D/E đầu-cuối phải bật `AUTO_SEND` — [ci-cd.md §8](../van-hanh/ci-cd.md) xếp đây vào loại "dừng lại và hỏi người".
- Stack `zalo-ultty` (pilot) chưa có secret `zalo-ultty-anthropic-api-key`; chưa tạo thì agent tư vấn vẫn tắt ở đó.

Kịch bản test đã viết lại theo Pha 6: [2026-08-19-kich-ban-test-agent-tu-van.md](../kiem-thu/2026-08-19-kich-ban-test-agent-tu-van.md) — thêm nhóm D (hỏi lại & chốt đơn) và nhóm E (nhiều khách cùng lúc).

**Test:** api **825 pass / 24 skip** (+32 ca mới) · shared 89 · tenant 48 · web 89 · poc 4 · caddy 22 · stack-identity 9 · deployment-targets 5 · gd1-test-preflight 23.

### 1.-5 ▶️▶️▶️▶️▶️▶️ REFACTOR FOUNDATION ĐA KHÁCH (20/08/2026) — HOÀN TẤT

- **Tenant v2:** `identity`, `branding`, `experience`, `capabilities`, `policies`, `integrations`,
  `persona`, `bootstrap`; v1/unknown version bị chặn, không silent fallback. Hai gói tenant hiện tại
  đã migrate.
- **Capability boundary:** registry requirement typed chỉ chứa capability có code thật. Nest root
  compose foundation + controller/provider/module được bật; full operations graph của tenant hiện
  tại giữ nguyên.
- **Sales-order không còn là platform prerequisite:** fixture `knowledge-only` load và boot API mà
  không khai Zalo/channel, parser/ERP, dealer, price, order hoặc group mapping.
- **Experience boundary:** console ba cột được move nguyên vào `operations-console`; route runtime
  resolve qua `ExperienceRegistry`. `knowledge-workspace` là composition tối thiểu dùng lại
  knowledge UI, không phải thiết kế khách thứ ba.
- **CI:** `tenant-packs.spec.ts` tự enumerate mọi thư mục `tenants/`; workflow không giữ matrix tên
  khách. Deploy allowlist vẫn thủ công như một safety gate và là backlog nếu cần inventory quản trị.
- **Không đổi:** Prisma schema/order state/rules/auto-confirm, mô hình mỗi tenant một DB, image dùng
  chung, dữ liệu tenant ngoài image, quy trình rollout chỉ qua CI/CD.
- **DB-backed proof:** Postgres thật, 15 migration apply, seed thành công;
  `RUN_PRISMA_IT=1` → 112 file pass, 809 test pass, chỉ 1 DeepSeek external eval skip.

Debt còn lại sau structural slice: notification Zalo vẫn import vendor SDK trực tiếp; readiness và
knowledge repository internals còn sales-order-shaped dù surface không mount cho tenant khác;
content source contract đã khai nhưng runtime binding vẫn local; route `/zalo` legacy còn tồn tại.
Không mục nào được che bằng fake capability hoặc nhánh theo tenant.

### 1.-4 ▶️▶️▶️▶️▶️ BÀN GIAO PHIÊN 19/08/2026 (PHIÊN 4) — PHA 5 XONG, KẾ HOẠCH 5 PHA HOÀN TẤT

**HEAD:** `fe7a123` trên `main`. **Test:** api **771 pass / 24 skip** · shared 84 · tenant 30 · web 70 · poc-parser 4. Đã chạy **đủ 4 lệnh cổng** của [ci-cd.md §3](../van-hanh/ci-cd.md) — `lint` + `typecheck` + `test` + hợp đồng route Caddy (17/17) — lần đầu tiên trong chuỗi phiên này.

| Commit | Nội dung |
|---|---|
| `d074aef` | **fix** — `sendContent` của lớp cơ sở nuốt mất `options` của Pha 4 |
| `456e24f` | **Pha 5** — retrieval FAQ theo BM25 + mở rộng viết tắt qua glossary |
| `fe7a123` | **chore** — neo luật ignore `agents/` vào gốc + sửa doc `PARSER_MODE=mock` lạc hậu |

#### PHA 5 — RETRIEVAL FAQ (xong)

Bộ xếp hạng cũ đếm số từ ≥3 ký tự của **câu hỏi FAQ** xuất hiện trong tin khách bằng `String.includes`. Hai lỗ hổng độc lập, cả hai đều đóng:

1. **`includes` khớp chuỗi con, không khớp token** — `"gia"` khớp bên trong `"giao hang"`, nên FAQ về giá bị kéo lên khi khách hỏi giao hàng.
2. **Không biết gì về viết tắt** — mà viết tắt không dấu là đặc thù đầu vào ghi trong CLAUDE.md. Khách gõ `"bn tien"`, `"cs bn w"`, `"ve sinh ntn"` thì không khớp từ nào với FAQ viết đủ → `safeHandoff(['matching_faq'])` → chuyển Sale.

`content/faq-ranking.ts` (module riêng, 10 test độc lập):
- **BM25 trên token.** IDF dùng biến **không-bao-giờ-âm** `ln(1 + (N−n+0.5)/(n+0.5))` — tập FAQ một sản phẩm chỉ 1-21 câu, biến cổ điển có thể ra số âm và **lật ngược thứ tự**.
- **Mở rộng viết tắt qua glossary tenant** (Ultty đã có sẵn 51 mục). Viết tắt một từ khớp theo **token nguyên vẹn**, không khớp chuỗi con — nếu không thì `c`=chị sẽ nổ trong mọi từ có chữ "c". Mục nhiều từ khớp theo cụm. Nghĩa có chú thích trong ngoặc được bóc trước khi tách token.
- Mở rộng là **cộng thêm**, không thay thế: token gốc ở lại trong túi truy vấn, nên một bản dịch sai chỉ thêm nhiễu chứ không làm mất tín hiệu thật. Và nó **chỉ ảnh hưởng việc CHỌN FAQ nào** — không một chữ nào của khách bị viết lại.
- **Stopword cố ý giữ ngắn, có ghi lý do trong code.** Sau khi bỏ dấu, nhiều hư từ trùng mặt chữ với từ nội dung. Đã cân nhắc rồi **loại**: `khi` (trùng "khí" — máy lọc không khí), `voi` (vòi), `cua` (cửa), `ban` (bàn/bán), `chi` (chi phí), `gio` (gió/giờ), `day` (dây), `dau` (đầu/dầu).
- `MAX_FAQ_ANSWERS` 3 → **5**, chỉ an toàn vì có thêm `RELATIVE_SCORE_FLOOR` = 30% điểm câu dẫn đầu chặn câu khớp yếu.

`productAdvice(text, products, glossary?)` — glossary đi từ `AgentOrchestrator` qua `KnowledgeService.glossary()`. Tham số tuỳ chọn nên gọi cũ không vỡ, và `ContentService` **không** phải phụ thuộc `KnowledgeService`.

**Log `FAQ truot: …`** khi rơi vào `matching_faq` — đây chính là phép đo mà kế hoạch yêu cầu (điểm chưa xác minh #2 của phiên 2: *tỉ lệ FAQ trượt thực tế do viết tắt*). Ghi câu **đã chuẩn hoá**, không ghi tin gốc.

#### HAI LỖI PHÁT HIỆN NGOÀI KẾ HOẠCH

**1. `sendContent` của lớp cơ sở nuốt mất trích dẫn (`d074aef`).** Pha 4 nối dây 8 trường quote xuyên suốt adapter → router → client, nhưng `ChannelAdapter.sendContent` nhận `options` rồi gọi `sendMessage` **không kèm nó**. Đó là đường của MockAdapter (co-pilot) và của **mọi adapter không override** — tức bản tư vấn có ảnh/link gửi đi không trích dẫn gì, đúng cái mà bàn giao phiên 3 tuyên bố là đã làm. `ZcaAdapter` có truyền, trừ nhánh lùi về khi tải ảnh hỏng. `BotPlatformAdapter` **giữ nguyên**: Bot Platform không có API quote, bỏ đi là trung thực.

> Lỗ hổng này lộ ra vì `pnpm lint` (`options` khai mà không dùng). **Phiên 3 chưa chạy lệnh này**, nên nó ở lại qua cả 7 commit. Bài học: 4 lệnh cổng của `ci-cd.md` §3 là **bốn**, không phải hai.

**2. `.gitignore` đang nuốt module 6-agent production (`fe7a123`).** Luật trần `agents/` (không có `/` đầu) khớp **mọi** thư mục cùng tên ở **mọi** độ sâu. Ý định ban đầu là bỏ qua `./agents` ở gốc (vendor tools), nhưng thực tế nó bỏ qua cả `apps/api/src/agents/`. 8 file hiện có sống sót vì đã track từ trước — **không mất dữ liệu** — nhưng file MỚI đặt vào đó sẽ bị bỏ im lặng, và `git add` một file đã track trong đó cũng bị từ chối. Đã đổi thành `/agents/`.

#### TRẠNG THÁI KẾ HOẠCH 5 PHA — HOÀN TẤT

| Pha | Trạng thái |
|---|---|
| 0 — schema drift `direction` | ✅ phiên 3 |
| 1 — bot nhớ hội thoại | ✅ phiên 3 |
| 2 — prompt caching | ✅ phiên 3 |
| 3 — model thành cấu hình | ✅ phiên 3 |
| 4 — reply đúng tin | ✅ phiên 3, **vá lỗ lớp cơ sở** phiên 4 |
| 5 — retrieval FAQ | ✅ **phiên 4** |

#### CÒN LẠI (không thuộc kế hoạch 5 pha)

- **Bake-off model (Quyết định #3) — chưa chạy.** Cần tin nhắn thật + khoá API. Pilot chạy `PARSER_MODE=deepseek` nên `ClaudeParser` **không nằm trên đường đo**; muốn so Sonnet 5 vs DeepSeek V4 Flash phải đo ngoài luồng chạy.
- **Chưa xác minh trên hệ thật:** `cache_read_input_tokens > 0` từ tin thứ 2 (đã có log `[cache]` để đọc) · bot reply đúng tin trên nhóm Zalo test (cần phiên zca sống) · tỉ lệ FAQ trượt thật (đã có log `FAQ truot:` để đếm).
- **RAG tiếng Việt bằng `pgvector`** — đường nâng cấp đã khảo sát ở phiên 2, chưa mở. BM25 hiện tại là bước trước nó, không phải bước thay nó.

#### KỊCH BẢN NGHIỆM THU

[kiem-thu/2026-08-19-kich-ban-test-agent-tu-van.md](../kiem-thu/2026-08-19-kich-ban-test-agent-tu-van.md) — 23 ca thủ công theo 6 nhóm (viết tắt · âm tính · nhớ hội thoại · đơn hàng · reply đúng tin · caching), kèm bảng "pha nào quan sát được ở đâu" và điều kiện tiên quyết duyệt FAQ lên `active`. Nhóm A/B đã đối chiếu với 21 FAQ thật của BB-GREY.

#### LỆNH XÁC MINH

```bash
pnpm lint && pnpm typecheck && pnpm test && node --test deploy/netviet/caddy-route-contract.test.mjs
```

---

### 1.-3 ▶️▶️▶️▶️ BÀN GIAO PHIÊN 18/08/2026 (PHIÊN 3) — ĐÃ THỰC THI KẾ HOẠCH 5 PHA

**HEAD:** `e4e5727` trên `main`, working tree sạch, **chưa push, chưa deploy**.
**Test:** api **758 pass / 24 skip** · shared 84 · tenant 30 · web 70 · poc-parser 4. Typecheck xanh.
*(Baseline đầu phiên: api 703/24 — +55 test, không ca cũ nào đổi trạng thái.)*

6 commit, mỗi commit là một chốt chặn TDD (RED → GREEN):

| Commit | Nội dung |
|---|---|
| `53eec84` | Pha 0 — gỡ schema drift `direction` |
| `9955b19` | RED: reproducer Pha 1 |
| `e8f1323` | Pha 1 — bot nhớ được cuộc trò chuyện |
| `51fd15a` | Pha 2 — prompt caching |
| `594be17` | Pha 3 — model thành cấu hình |
| `ed5cae1` | Pha 4 — reply đúng tin |
| `e4e5727` | **BREAKING** — gỡ bỏ MockParser khỏi cấu hình |

#### ĐÃ XONG

**Pha 0 — schema drift.** `schema.prisma` thiếu `direction` (migration `20260815140000` đã thêm cột trên DB). Đã thêm `direction` + `senderRole` + index `(chatId, sentAt)`, migration mới `20260818170000_message_sender_role`. `migrate diff` không còn báo lệch trên bảng `Message` — chỉ còn 2 artifact `updatedAt` có sẵn từ trước ở `DealerPriceOverride`/`User`, không liên quan.

**Pha 1 — bot nhớ được cuộc trò chuyện.** Đây là nguyên nhân gốc lớn nhất và đã đóng hết 5 điểm:
- `OutboundRecorder` mới lưu tin hệ thống đã gửi. `ChannelAdapter.sendMessage()` trả `OutboundReceipt`; zca lấy được `msgId` **thật** từ zca-js, Bot Platform lấy `message_id`, mock tự sinh `out:<uuid>`. `OutboundChannelRouter` là chốt chặn; `CampaignService` gửi thẳng qua adapter nên được nối riêng.
- **Xoá** `sameParticipant()` — hội thoại nhóm là của cả nhóm; `findRecent` bỏ tham số `senderExternalId`.
- `boundedRecent`: `continue` → `break` (lịch sử không còn thủng lỗ).
- Cửa sổ 6 tin/4k ký tự → **16 tin/8k**.
- `conversation-transcript.ts` là nơi **duy nhất** định dạng lịch sử: `[KHACH Tên] (5 phut truoc): …` / `[BOT]` / `[SALE]`. Cả parser-prompt lẫn advice-composer dùng chung. Mốc thời gian lấy từ `message.sentAt`, không lấy đồng hồ máy chủ → rerun cho ra cùng prompt.

**Pha 2 — prompt caching.** Tách `buildStaticPrompt()` (persona, 7 intent + few-shot, danh mục SKU, glossary) khỏi `buildTurnContext()` (đại lý, lịch sử). `ClaudeParser` gửi `system` dạng **mảng block**: block 0 đánh dấu `cache_control: ephemeral`, phần biến động nằm sau điểm cắt. Log `[cache] doc=.. ghi=..` mỗi lần gọi. Test khoá đúng bất biến thật: phần tĩnh của hai tin ở hai nhóm khác nhau phải **giống hệt** (`a === b`).
→ **Rủi ro "SDK không hỗ trợ `cache_control`" đã đóng**: `@anthropic-ai/sdk@0.68.0` có sẵn `CacheControlEphemeral` + `usage.cache_read_input_tokens`. Không phải nâng SDK.

**Pha 3 — model thành cấu hình.** Thêm `PARSER_MODEL` (mặc định `claude-sonnet-5`), `ADVICE_MODEL` (mặc định `claude-opus-5`), `DEEPSEEK_MODEL` (mặc định `deepseek-v4-flash`). Hết hardcode `claude-haiku-4-5` trong mã nguồn.
→ **Giữ nguyên `ADVICE_COMPOSER` mặc định `off` trong base, có chủ ý**: bật = thêm một bên nhận dữ liệu vào luồng, phải là quyết định của người vận hành (`env.ts:72`), và lật mặc định trong base sẽ bật cho **mọi khách** cùng lúc — trái Quyết định #6. Bật bằng biến môi trường khi triển khai.

**Pha 4 — reply đúng tin.** `ZaloQuoteTarget` (8 trường của `SendMessageQuote`) bắt lúc nhận, đi theo cột JSON có sẵn (`Message.raw`, `Order.view`) nên **không cần migration**. `sendMessage(chatId, text, options?)` xuyên suốt adapter → router → `ZaloUserClient`. Xác nhận đơn, tư vấn và auto-ack đều trích dẫn tin gốc. Không có quote thì gửi chuỗi thuần y như cũ.
→ **Điểm treo #1 của kế hoạch đã đóng — không cần phiên zca sống.** Typing zca-js cho thấy `TMessage.msgId` là *string* còn `TQuote.globalMsgId` là *number*: **cùng một global id**, khác cách serialize. Test `khong gian ID cua zca-js khop giua tin den va quote` khoá lại: tin lưu theo `msgId` tra cứu được bằng `String(globalMsgId)` và resolve **về dòng trong DB**, không rơi xuống nhánh inline. Không thêm khoá dự phòng `(uidFrom, ts)` — không có bằng chứng nó cần.

**Ngoài kế hoạch — đổi parser sang DeepSeek V4 Flash (yêu cầu trong phiên).** Thông số tra cứu 18/08: MoE 284B tổng / 13B kích hoạt, context **1M token**, output tối đa 384K, giá gốc **$0.14/1M vào — $0.28/1M ra** (cache hit $0.0028/1M), GPQA Diamond 89.6%, TAU-Bench 77.5%, MIT, API nói cả giao thức OpenAI lẫn Anthropic. Ghi đầy đủ trong doc comment `deepseek-parser.ts`.
**Lý do đổi `flowise` → `deepseek`** (ghi trong `render-secrets.sh`): Flowise là **một tầng trung gian nữa** đặt trên cùng DeepSeek ở đầu kia — không thêm chất lượng, chỉ thêm một chỗ có thể hỏng và một chỗ khó lần vết. Gọi thẳng bỏ tầng đó, và parser lấy lại được prompt chung do **repo** quản lý (7 intent + few-shot + glossary + cửa sổ hội thoại Pha 1) thay vì một bản sao nằm trong Agentflow không ai review. Đảo ngược bằng một dòng: `PARSER_MODE=flowise`.

**Ngoài kế hoạch — gỡ bỏ MockParser (BREAKING, yêu cầu trong phiên).** `mock` vừa là lựa chọn hợp lệ vừa là **mặc định** của `PARSER_MODE`, và `parser.provider.ts` còn nhánh bắt-tất-cả `return new MockParser()`. Nghĩa là **bất kỳ cấu hình sai nào** — quên đặt biến, thiếu khoá, gõ nhầm tên mode — đều dẫn production tới một parser khớp-mẫu không gọi LLM, không log lỗi, không ai biết.
- `PARSER_MODE: z.enum(['claude','deepseek','flowise']).default('deepseek')`
- thiếu `DEEPSEEK_API_KEY` → fail-fast lúc khởi động (nhánh claude đã có từ trước, deepseek thì thiếu)
- `mock-parser.ts` → `src/pipeline/__tests__/fake-parser.ts` (`FakeParser`); e2e chọn nó bằng `vi.mock` trên provider, không qua biến môi trường
- cổng `DATA_CLASSIFICATION=customer` **vẫn ép** `PARSER_MODE=claude` — DeepSeek chưa nằm trong danh sách bên thứ 3 được duyệt

#### ⛔ VIỆC NGƯỜI VẬN HÀNH PHẢI LÀM TRƯỚC KHI DEPLOY

1. **Space Hugging Face** (`deploy/hf-demo`) trước chạy `PARSER_MODE=mock` nên không cần secret nào. Nay **phải đặt `DEEPSEEK_API_KEY` trong Secrets của Space**, nếu không API fail-fast lúc khởi động — **có chủ ý**, thay vì chạy parser giả âm thầm.
2. **Stack khách** (`deploy/netviet`): `render-secrets.sh` nay render `PARSER_MODE=deepseek`. Xác nhận `DEEPSEEK_API_KEY` đã có trong Secret Manager trước khi deploy. Muốn giữ Flowise: `PARSER_MODE=flowise ./render-secrets.sh …`.
3. **Chưa push, chưa deploy.** 6 commit đang nằm ở local `main`.

#### CÒN LẠI

**Pha 5 — retrieval FAQ (chưa làm).** `content.service.ts:215` `rankFaqs()` vẫn là đếm từ trùng thô; `normalize()` bỏ dấu ✅ nhưng **không xử lý viết tắt** — mà viết tắt là đặc thù đầu vào. Khách gõ `"bn tien"`, `"co ship ko"`, `"sp nay"` thì không khớp từ nào, dẫn tới `!selectedFaqs.length` và chuyển Sale. Việc cần làm: BM25-ish, mở rộng viết tắt qua glossary tenant (đã có sẵn), nới `MAX_FAQ_ANSWERS`, log ca `safeHandoff(['matching_faq'])` để đo tỉ lệ trượt thật. Ước lượng 2h, độc lập hoàn toàn với 5 pha trên.

**Bake-off model (Quyết định #3) — chưa chạy.** Cần tin nhắn thật + khoá API. Lưu ý pilot nay chạy `PARSER_MODE=deepseek` nên `ClaudeParser` **không nằm trên đường đo** — muốn so Sonnet 5 vs DeepSeek V4 Flash phải đo ngoài luồng chạy.

**Chưa xác minh trên hệ thật:** `cache_read_input_tokens > 0` từ tin thứ 2 (cần một phiên chạy thật, đã có log `[cache]` để đọc) và bot reply đúng tin trên nhóm Zalo test (cần phiên zca sống).

#### LỆNH XÁC MINH

```bash
cd apps/api && pnpm prisma generate && pnpm typecheck && pnpm test
```

Kiểm drift (DB local là `netviet`, không phải `ultty` như `.env` trỏ):

```bash
DATABASE_URL="postgresql://netviet:netviet_local@localhost:5432/netviet" pnpm prisma migrate status
```

---

### 1.-2 ▶️▶️▶️ BÀN GIAO PHIÊN 18/08/2026 (PHIÊN 2) — KHẢO SÁT + KẾ HOẠCH, CHƯA SỬA CODE

**Commit:** không có. Phiên này **chỉ khảo sát và lập kế hoạch**, không sửa một dòng code nào. HEAD lúc bàn giao: `8e1334e`, working tree sạch.

**Yêu cầu gốc:** agent tư vấn bán hàng phải thông minh hơn — bot reply đúng tin nhắn muốn trả lời, LLM thấy được khách đang reply tin nào, và nạp được lịch sử chat nhóm vào LLM một cách hợp lý. Kèm khảo sát nguyên nhân AI trả lời kém thông minh/kém tự nhiên khi tư vấn và chốt đơn, rà soát công nghệ đã chuẩn chưa, và chạy `search-first` xem có giải pháp sẵn.

#### ⛔ ĐIỂM CHẶN PHẢI GỠ ĐẦU TIÊN — SCHEMA DRIFT

Migration `20260815140000_message_direction` (commit `69e7c4f`) đã thêm cột `direction` vào bảng `Message` **trên DB**, nhưng `schema.prisma` **không có field này** và **không dòng code nào dùng nó**. Việc làm dở của một phiên trước.

Hệ quả: chạy `pnpm prisma migrate dev` ở trạng thái hiện tại sẽ sinh migration **DROP cột `direction`** — vì với Prisma, `schema.prisma` mới là nguồn sự thật, không phải thư mục migrations.

Gỡ trước mọi thứ khác — thêm vào `apps/api/prisma/schema.prisma`, model `Message`:

```prisma
direction String @default("inbound")
```

rồi `pnpm prisma generate` và `pnpm prisma migrate status` để xác nhận hết drift.

#### BA NGUYÊN NHÂN GỐC (đã xác minh trong code)

**1. Bot không bao giờ thấy câu trả lời của chính nó.** Hai chỗ cộng hưởng:

- `messages/conversation-context.ts:97` — `sameParticipant()` chỉ lấy tin có `senderExternalId` trùng người gửi hiện tại, và fail-closed khi thiếu id. Nên "lịch sử" đưa cho LLM là 6 tin gần nhất **của riêng khách**: không có câu bot đã trả lời, cũng không có tin của Sale.
- `messages.save()` chỉ được gọi tại **một chỗ duy nhất** là `pipeline/pipeline.service.ts:375` — tức chỉ tin inbound. Mọi tin bot gửi đi (`orders/orders.service.ts:97` và `:125`, `ingest/zca-listener.ts:111`, `campaigns/campaign.service.ts:147`) **không bao giờ vào DB**.

Vì vậy bot lặp lại chính nó và không hiểu "cái đó", "vậy giá bao nhiêu", "còn loại kia thì sao" — vế trước của mạch hội thoại đã bị xoá khỏi context trước khi tới LLM. Comment trong `content/advice-composer.ts` ghi *"để trả lời tiếp mạch, không lặp lại điều đã nói"*, nhưng dữ liệu để làm việc đó chưa từng tồn tại. **Đây là nguyên nhân lớn nhất của "trả lời kém tự nhiên".**

**2. Không reply đúng tin, dù zca-js hỗ trợ sẵn.** `channels/channel-adapter.ts:22` khai `sendMessage(chatId, text)` — không có tham số quote; `channels/zalo-user.client.ts:427` truyền string thuần vào `api.sendMessage`. Trong khi zca-js 2.1.2 đã có sẵn:

```ts
// node_modules/zca-js/dist/apis/sendMessage.d.ts
export type MessageContent = { msg: string; quote?: SendMessageQuote; mentions?: Mention[]; ... };
export type SendMessageQuote = { content; msgType; propertyExt; uidFrom; msgId; cliMsgId; ts; ttl };
```

Cả 8 trường của `SendMessageQuote` đều là trường của `TMessage` inbound. Cột `raw Json?` đã có sẵn trong model `Message` nhưng chưa dùng để giữ payload này. **Không cần thư viện mới — chỉ cần nối dây.**

**3. Quote resolution nhiều khả năng đang hỏng vì lệch ID space.** `ingest/zca-message.ts:38` lưu tin theo `data.msgId` (**string**), nhưng `:53` tra cứu tin được quote theo `String(quote.globalMsgId)` (**number**), fallback `quote.cliMsgId`. Nếu hai không gian ID này khác nhau thì `findByExternalMessage()` luôn trượt, rơi xuống nhánh inline fallback ở `conversation-context.ts:78` — chỉ còn `quote.msg` text thô, **mất ảnh và mất danh tính người gửi đã chuẩn hoá**. ⚠️ **Chưa xác minh được** trong phiên này vì cần phiên zca sống.

#### CÔNG NGHỆ — BỐN ĐIỂM CHƯA CHUẨN

**4. Cả hai chỗ ra quyết định ngôn ngữ đều chạy model rẻ nhất.**

| Vị trí | Hiện tại |
|---|---|
| `pipeline/claude-parser.ts:12` | `claude-haiku-4-5-20251001` |
| `content/advice-composer.ts:47` | `claude-haiku-4-5-20251001` |
| `packages/shared/src/env.ts:77` | `ADVICE_COMPOSER` default = **`'off'`** |

Điểm cuối đáng chú ý nhất: khi `ADVICE_COMPOSER=off`, `composeAdvice()` trả `null` và hệ thống **nối nguyên văn FAQ bằng `body.join('\n')`**. Đó chính xác là "trả lời như robot" — vì nó *đúng là* đang copy-paste bảng FAQ chứ không sinh câu trả lời. Model hiện hành phù hợp hơn: `claude-sonnet-5` hoặc `claude-opus-5`.

**5. Prompt caching = 0, và thứ tự prompt đang tự phá cache.** Grep `cache_control` toàn repo: không có kết quả nào. Mỗi tin nhắn trả full giá cho toàn bộ danh mục SKU + glossary + 7 định nghĩa intent + few-shot. Tệ hơn, `pipeline/parser-prompt.ts` xếp **phần biến động trước phần ổn định**:

```text
input.dealerNameRaw,              <- đổi theo nhóm
context,                          <- ĐỔI MỖI TIN NHẮN
`Danh muc SKU:\n${skus}`,         <- ổn định, nhưng nằm SAU phần biến động
`Tu dien viet tat: ${glossary}`,  <- ổn định, nằm SAU
```

Prompt caching là **prefix match** — mọi thứ sau byte đầu tiên thay đổi đều mất cache. Kể cả thêm `cache_control` hôm nay, danh mục SKU và glossary **vẫn sẽ không bao giờ cache được**. Phải đảo thứ tự trước. Đây cũng là thứ đang chặn việc nâng model: chi phí và độ trễ bị thổi lên vô ích nên nâng Haiku → Sonnet trông đắt hơn thực tế.

**6. Retrieval FAQ là đếm từ trùng thô.** `content/content.service.ts:215` `rankFaqs()` đếm số từ ≥3 ký tự của câu hỏi FAQ xuất hiện trong tin khách. `normalize()` có bỏ dấu ✅ nhưng **không xử lý viết tắt** — mà viết tắt chính là đặc thù đầu vào đã ghi trong CLAUDE.md. Khách gõ `"bn tien"`, `"co ship ko"`, `"sp nay"` thì không khớp từ nào với FAQ viết đủ, dẫn tới `!selectedFaqs.length` và chuyển Sale. AI im lặng không phải vì thiếu dữ liệu, mà vì **không tìm ra dữ liệu mình đang có**.

**7. Cửa sổ context hẹp và có lỗ hổng thứ tự.** `conversation-context.ts:19` đặt `maxMessages: 6, maxCharacters: 4_000`. Trong `boundedRecent()` dùng `continue` thay vì `break` khi vượt `maxCharacters` — một tin dài bị bỏ qua nhưng vẫn xét tiếp tin **cũ hơn**, làm lịch sử đưa cho LLM **thủng lỗ giữa chừng** mà LLM không biết: nó tưởng hai tin liền kề trong khi thực tế có tin ở giữa đã biến mất. Ngoài ra `formatContext` gắn ISO timestamp đầy đủ (tốn token, khó đọc) và **không có nhãn vai trò**; `advice-composer.ts` còn gán cứng `'Khach'` cho mọi tin không có displayName.

#### KẾT QUẢ `search-first`

Preflight: `rg` ✅ · `npm` 11.16.0 ✅ · `gh` ✅ (đã auth) · skills dir ✅ — không kênh nào bị bỏ qua.

| Nhu cầu | Kết luận | Lý do |
|---|---|---|
| Reply/quote Zalo | 🟢 **ADOPT** — zca-js 2.1.2 đã có | `MessageContent.quote` native, zero dependency mới |
| Prompt caching | 🟢 **ADOPT** — Anthropic native | `cache_control: {type:'ephemeral'}`; phải đảo thứ tự prompt trước |
| Conversation memory | 🟠 **BUILD** (mỏng, có tham khảo) | `mem0ai` 3.1.6 (Apache-2.0), `@mastra/memory` 1.26.2 (Apache-2.0), `langchain` 1.5.9 (MIT) đều kéo cả framework agent vào — xung đột trực tiếp với **Quyết định #5** (LLM không tính tiền/không quyết chính sách). License đều sạch, vấn đề là kiến trúc. Sliding window + rolling summary ~150 dòng TS, không đáng đánh đổi. |
| RAG tiếng Việt | 🟡 **Đợt sau** | `pgvector` 0.3.0 (MIT) + Postgres đã có sẵn → đường nâng cấp rõ. Trước mắt nới `rankFaqs` (BM25-ish + mở rộng viết tắt qua glossary đã có). |

Đã kiểm license trước khi đề xuất theo yêu cầu mô hình bán dịch vụ: cả ba framework memory đều Apache-2.0/MIT, **không** dính điều khoản cấm multi-tenant kiểu Dify.

#### KẾ HOẠCH 5 PHA (đã lập, chờ thực thi)

| Pha | Nội dung | Phức tạp | Ước lượng |
|---|---|---|---|
| **0** | Gỡ schema drift `direction` (mục ⛔ ở trên) | Thấp | 15 phút |
| **1** | Bot nhớ được cuộc trò chuyện: migration `senderRole` + index `(chatId, sentAt)`; `ChannelAdapter.sendMessage()` trả `OutboundReceipt`; `OutboundChannelRouter` lưu tin outbound; **xoá** `sameParticipant`; `continue`→`break`; nới cửa sổ 6→16 tin; gắn nhãn `[KHÁCH]`/`[BOT]`/`[SALE]` + thời gian tương đối | **Cao** (chạm 8+ file, đổi chữ ký interface) | 4-6h |
| **2** | Prompt caching: tách `buildStaticPrompt()` / `buildTurnContext()`, `cache_control` ở block cuối, context chuyển sang `messages`; log `usage.cache_read_input_tokens` để xác minh | Trung bình | 2-3h |
| **3** | Nâng model + bật composer: thêm `PARSER_MODEL`/`ADVICE_MODEL` vào env (hết hardcode), bake-off 20-30 tin thật theo **Quyết định #3** | Thấp (code) / TB (đo) | 1h + 2h |
| **4** | Quote/reply đúng tin: **spike đo lệch ID space trước**, lưu raw quote payload, `sendMessage(chatId, text, opts?)`, truyền object `{msg, quote}` | Trung bình | 3-4h |
| **5** | Retrieval FAQ: BM25-ish, mở rộng viết tắt qua glossary, nới `MAX_FAQ_ANSWERS`, log FAQ trượt cho vòng feedback | Thấp | 2h |

**Tổng 14-19h.** Riêng Pha 0+1 (≈5h) đã giải quyết nguyên nhân gốc lớn nhất.

**Thứ tự phụ thuộc:** `0 → 1 → 2 → 3`; Pha 4 làm song song được (spike chạy độc lập); Pha 5 độc lập hoàn toàn. **Pha 3 phải sau Pha 2** — nâng model trước khi có cache sẽ thổi chi phí lên nhiều lần và làm sai lệch đánh giá bake-off.

#### PATTERN PHẢI BÁM (đã khảo sát, đừng phát minh lại)

| Hạng mục | Nguồn | Pattern |
|---|---|---|
| Migration | `prisma/migrations/20260815140000_message_direction/` | Thư mục `YYYYMMDDHHMMSS_snake_name/`, raw SQL, dùng `IF NOT EXISTS` |
| Seam memory\|prisma | `app.module.ts:159-167` | `useFactory` đọc `loadEnv().PERSISTENCE`, inject `PrismaService` |
| Dependency tuỳ chọn | `agents/agent-orchestrator.service.ts:88-94` | `@Optional() private readonly x?: T` — thiếu thì degrade, không crash |
| Fail-safe LLM | `content/advice-composer.ts:104` | Lỗi → `return null` → caller giữ nguyên đường cũ. **Không bao giờ để LLM hỏng làm rớt tin** |
| Kiểu union bất biến | `messages/messages.repository.ts:24` | `MessageMedia` — hoặc thành công hoặc lỗi, không bao giờ cả hai |
| Chốt chặn outbound | `channels/outbound-channel.router.ts` | Một điểm duy nhất định tuyến `bot`/`zca`/`mock` — chỗ hợp lý để lưu tin outbound |

#### HAI QUYẾT ĐỊNH CẦN CHỐT TRƯỚC KHI CODE PHA 3

**(a) Chọn model** — đây là quyết định chi phí, không phải kỹ thuật:

| Lựa chọn | Giá (in/out /1M) | Ghi chú |
|---|---|---|
| `claude-sonnet-5` | $3/$15 — **đang giảm $2/$10 đến 31/08/2026** | Gần chất lượng Opus trên tác vụ agentic |
| `claude-opus-5` | $5/$25 | Chất lượng cao nhất |
| Giữ `claude-haiku-4-5` | $1/$5 | Hiện trạng — chính là nguyên nhân "kém thông minh" |

Phương án lai đề xuất: **parser = Sonnet 5** (trích xuất có ràng buộc, không cần suy luận sâu), **composer = Opus 5** (viết câu cho khách đọc).

**(b) Phạm vi thực thi** — làm tuần tự cả 5 pha, hay ưu tiên Pha 0+1 trước để thấy kết quả sớm rồi đánh giá lại.

#### HAI ĐIỂM CHƯA XÁC MINH — CẦN DỮ LIỆU THẬT

1. **`data.msgId` có bằng `String(quote.globalMsgId)` không** — quyết định Pha 4 làm được hay phải đổi khoá tra cứu sang `(uidFrom, ts)`. Đo bằng một phiên zca ngắn, log cả hai giá trị khi có người reply.
2. **Tỉ lệ FAQ trượt thực tế do viết tắt** — quyết định mức đầu tư cho Pha 5. Đo bằng cách log các ca `safeHandoff(['matching_faq'])`.

#### RỦI RO ĐÃ NHẬN DIỆN

| Rủi ro | Khả năng | Mức độ | Giảm thiểu |
|---|---|---|---|
| `prisma migrate dev` xoá cột `direction` | **Cao** nếu bỏ Pha 0 | 🔴 Mất dữ liệu | Pha 0 là chốt chặn bắt buộc |
| Đổi chữ ký `ChannelAdapter` làm vỡ nhiều test | Cao | 🟡 | Đổi kiểu trả về trước, giữ tham số cũ; chạy test sau mỗi adapter |
| ID space zca không map được | Trung bình | 🟠 Chặn Pha 4 | Spike trước khi code; dự phòng `(uidFrom, ts)` |
| Nâng model tăng chi phí ngoài dự kiến | Trung bình | 🟠 | Pha 2 trước; log token usage; `PARSER_MODEL` env đảo ngược tức thì |
| Lịch sử dài hơn → lộ nhiều PII sang LLM hơn | Trung bình | 🔴 Pháp lý | Với `PARSER_MODE=deepseek` **cấm tuyệt đối** dữ liệu thật (CLAUDE.md mục Bảo mật). Chỉ mở rộng context khi `PARSER_MODE=claude` |
| Phiên Claude song song cùng sửa repo | Trung bình | 🟡 | `git status` trước mỗi commit |
| SDK `@anthropic-ai/sdk@^0.68.0` không hỗ trợ `cache_control` | Thấp | 🟡 | Xác minh ở task đầu Pha 2, nâng SDK nếu cần |

#### LỆNH XÁC MINH

```bash
cd apps/api && pnpm prisma migrate status && pnpm prisma generate && pnpm typecheck && pnpm test
```

⚠️ Mốc test trong bàn giao phiên trước là **698 pass / 24 skip** (API). **Re-baseline trước khi bắt đầu** — HEAD đã tiến tới `8e1334e` sau đó.

#### NGHIỆM THU

- [ ] `prisma migrate status` không báo drift
- [ ] Bot đọc được reply của chính nó trong context (có test)
- [ ] Lịch sử không thủng lỗ khi có tin dài (có test)
- [ ] `cache_read_input_tokens > 0` từ tin thứ 2 trong cùng nhóm
- [ ] Bot reply đúng tin trên nhóm Zalo test
- [ ] Bake-off cho thấy cải thiện đo được so với Haiku
- [ ] `pnpm test` xanh, không ca cũ nào đổi trạng thái
- [ ] Không có tên khách nào rò vào `apps/` hay `packages/` (**Quyết định #6**)

---

### 1.-1 ▶️▶️ BÀN GIAO PHIÊN 18/08/2026 — ĐỌC MỤC NÀY TRƯỚC MỌI THỨ

**Commit:** `b92bb82` trên `main`, đã push, đã deploy `ultty → dev` (run `32101561978`, 4/4 phép kiểm §5 đạt, cách ly mạng trả đúng một địa chỉ).

**Đã sửa trong phiên này (code review 6 phát hiện, đóng 5):**

1. **`matchProduct` trả sai SKU khi alias là chuỗi con** — `rules.ts` duyệt danh mục rồi trả về khớp ĐẦU TIÊN; alias `wfx` của `WFX` là chuỗi con của `combo wfx`, mà `WFX` đứng trước trong danh mục. Ba trong năm cách gọi bộ combo — kể cả tên đầy đủ chính thức — ra 1.750.000đ thay vì 1.950.000đ, `matched=true`, không warning, nên `shouldAutoConfirmOrder` cho qua và AUTO_SEND gửi giá sai cho khách. Nay lấy khớp DÀI NHẤT. Cùng bẫy ở `productsInText` (đường báo giá) đã vá bằng thuật toán khớp-dài-trước + tiêu thụ vùng. **Test cũ không bắt được vì fixture chỉ 2 SP không chồng alias** — nay có 7 test chạy trên danh mục THẬT của gói khách.
2. **Kỳ giá tháng 8 không có nguồn gốc** — `c6306b3` đổi `validMonth` 2026-07→2026-08 mà không đổi giá nào. A6 nay đã có câu trả lời: nguồn có thẩm quyền là `ho-so-khao-sat/gd1/AI Zalo_/Thông báo giá tháng 7.2026.pdf` (19 SP, đối chiếu khớp từng dòng), khách xác nhận 18/08 rằng tháng 8 không có thông báo mới. Thêm trường `note` vào `tenant.schema.ts` + `KnowledgeSnapshot`, seed ghi xuống DB. **Đổi nhãn tháng mà không ghi căn cứ là cái QĐ #10 cấm; ghi căn cứ thì hợp lệ.**
3. **Đồng bộ thành viên hỏng vĩnh viễn sau khi Sale phân loại** — code chỉ cho gộp hàng trùng khi hàng route còn nguyên mặc định, mà tab "Thành viên" tồn tại chính để Sale phân loại những hàng đó (`update()` ghi `source='manual'`). Càng dùng đúng càng chắc hỏng. Nay `participant-identity-merge.ts` gộp thật: giữ hàng có `globalId`, hút phân loại sang, không bao giờ hạ cấp `manual`. Chỉ còn ném khi routing UID thuộc `globalId` KHÁC, và là **409** kèm tên thành viên + cả hai id (trước là 502 Bad Gateway — sai loại lỗi, khiến người vận hành đi tìm nhầm phía Zalo).
4. **Báo giá trong nhóm đại lý trả GIÁ SỈ** (quyết định nghiệp vụ 18/08) — AgentTrace ghi "báo giá theo cấp X" nhưng code không hề đọc `senderType`, luôn trả `minRetailPrice`; đại lý hỏi ELNI nhận 3.100.000đ trong khi giá họ mua là 2.150.000đ. Nay `dai_ly`/`ctv` → `wholesale`, kèm qualifier riêng.
5. **`/settings` → Kỳ giá** nay bật được cờ kỳ TEST (UAT): cơ chế `test_only` đã có sẵn ở backend nhưng UI không có đường nào bật, nên cách duy nhất để test auto-confirm là đổi nhãn bảng giá thật. Thêm ô tick, nút "Tạo kỳ trống", nhãn "CHỈ ĐỂ TEST", nút "Lưu trữ kỳ này".

**Kiểm:** typecheck + lint exit 0 · API **698 pass / 24 skip** (mốc 681/24, +17 test, không ca cũ nào đổi trạng thái) · shared 84 · tenant 30 · web 70 · poc-parser 4 · route 17 · `web build` + `test:tenant-runtime` xanh.

#### ⛔ HAI ĐIỂM CHẶN PHẢI GỠ TRƯỚC KHI GIAO CHO ĐỒNG NGHIỆP

**(a) Kỳ giá tháng 8 trên pilot chỉ có 2 SKU.** Truy vấn DB pilot 18/08:

```text
P|cmsr863hs0003qq01mkg146c7|2026-08|active  |test_only |skus=2    <- kỳ đang áp dụng
P|cmsr6qh190002mv0154fxqpg0|2026-08|archived|test_only |skus=2
P|migrated-202607          |2026-07|active  |migration |skus=19
```

Bảng 19 SKU nằm ở kỳ **tháng 7**, mà tra giá fail-closed đúng tháng hiện tại ⇒ trên pilot **chỉ 2 SKU có giá**, 17 SKU còn lại rơi hết về Sale, và bài kiểm bẫy combo không định giá được. Deploy **không** chạy lại tenant seed nên kỳ `seed-2026-08` kèm `note` provenance chưa lên pilot. Gỡ bằng một trong hai: chạy `tsx prisma/seed.ts` trên pilot, hoặc dựng kỳ 2026-08 đủ 19 SKU qua `/settings` → Kỳ giá → *Sao chép kỳ này sang nháp mới* từ kỳ 2026-07 rồi kích hoạt.

**(b) Bảng `User` trả về RỖNG** trong khi `AUTH_MODE=session` và `/zalo/status` trả 401. Nếu đúng là rỗng thì **không ai đăng nhập được**, kể cả đồng nghiệp. Xác minh lại trước khi giao:

```sql
select email, role from "User";
```

(DB pilot: container `zalo-ultty-postgres`, user `netviet_admin`, db `zalo` — **không** phải `netviet`/`postgres`.)

#### Trạng thái pilot lúc bàn giao

```text
CHANNEL_MODE=zca   AUTO_SEND=off   PARSER_MODE=flowise   PERSISTENCE=prisma
AUTH_MODE=session  DATA_CLASSIFICATION=<rỗng → mặc định test>
zca listener: connected (đăng nhập bằng phiên đã lưu, KHÔNG cần quét QR lại)
Group mapped: 2 (Meta HN, Thái Nguyên) · Dealer: 3 · GroupParticipant: 2 · Order: 153
demo:     https://demo.35-187-235-82.sslip.io
operator: https://operator.35-187-235-82.sslip.io
```

**Quyết định của chủ dự án 18/08:** `CHANNEL_MODE=zca` + `AUTO_SEND=on` đúng là cấu hình muốn giao cho đồng nghiệp test. `AUTO_SEND` bật bằng badge **Tự gửi** trên console (`PUT /settings/automation/auto-send`, vai MANAGER/ADMIN, có audit) — recreate API luôn đưa về `off`, đó là thiết kế. Điều kiện chặn chưa gỡ: tài khoản Zalo phụ + văn bản chấp nhận rủi ro ToS (D16); và `PARSER_MODE=flowise` → DeepSeek chưa nằm trong danh sách bên thứ 3 được duyệt nên chỉ dùng nhóm/dữ liệu TEST.

⚠️ **Kiểm allowlist trước khi bật AUTO_SEND** — hai nhóm đang mapped là nhóm đại lý thật. Bật tự gửi là bot nhắn thẳng vào đó.

⚠️ **`apps/marketing/**` (~24 file) trong cây làm việc là của phiên Claude song song, CHƯA commit.** Commit `b92bb82` cố ý không đụng tới. Push chung lên `main` sẽ tự động deploy trang marketing chưa ai review.

---

### 1.0 ▶️ BÀN GIAO CHO PHIÊN SAU (cập nhật 12/08/2026 — đọc mục này TRƯỚC)

**Nhánh:** `gd1/code-complete` (tách khỏi `main` tại `d14f7a4`). **Chưa push, chưa merge.**

**🟢 GĐ1 ĐÃ CODE-COMPLETE (12/08/2026).** Toàn bộ G1-01…G1-14 xong theo định nghĩa
[gd1-ultty.md §15](gd1-ultty.md). **Chưa go-live** — phần còn thiếu là **dữ liệu khách + văn bản
pháp lý + công tắc vận hành**, không phải code. Xem [van-hanh/checklist-go-live.md](../van-hanh/checklist-go-live.md).

**8 commit đã tạo:**

| Commit | Nội dung |
|---|---|
| `a2091f4` | Đợt A — trả baseline về xanh (G1-01…04) |
| `351e912` | Đợt B — RBAC 6 controller còn hở (G1-05) |
| `b2c7769` | Đợt C — gỡ số tiền phỏng đoán khỏi cấu hình (G1-06) |
| `d193b98` | Đợt D — **sửa 3 lỗi làm API không boot được** + nối readiness (G1-07, G1-08) |
| `bb3a56b` | Đợt E — reply/quote kênh Bot + bằng chứng kỳ giá (G1-09…11) |
| `5b4b6c6` | Đợt F — chọn adapter ERP theo gói khách + route/cột trung tính (G1-12) |
| `fe13f7b` | Đợt G — E2E đường tin Zalo trên **đồ thị DI thật** (G1-13) |
| `21265d5`, `809c0f6`, `c024e29` | dọn ảnh design sai + sắp xếp lại tài liệu |

**Baseline hiện tại — XANH TOÀN BỘ:** `api 600 pass/23 skip` · `web 62` · `shared 83` ·
`tenant 30` · `poc-parser 4` · `deploy-routes 11` · `typecheck 0` · `lint 0` · `build 0`.

### ✅ ĐÃ DEPLOY VÀ CHẠY THẬT TRÊN PILOT (13/08/2026)

Lần deploy đầu tiên kể từ 08/08. `DEPLOY EXIT: 0`, smoke test trên stack thật đạt:

```
Pilot smoke OK: SSE + 6-agent trace + approve; SMOKE_ORDER_STATUS=sent
Persistence smoke OK: 8a078e7b-facd-48ee-bca9-c459bc921265   (sống qua restart)
```

**Ba lỗi CHỈ lộ ra khi deploy thật** — cả ba đều là "code xanh nhưng đường đi hỏng":

1. **Caddy thiếu đường đi cho 10 route API.** `/settings/readiness`, `/settings/price-periods*`,
   `/settings/content*`, `/settings/users*`, `/campaigns*`, `/auth*`, `/health/media`… đều rơi
   xuống Next.js và trả **trang 404 HTML**. Nặng nhất là `price-periods`: đó là màn Sale nhập bảng
   giá tháng hiện hành, tức **cổng go-live số 1 không đóng được qua bản đã deploy** — trong khi kế
   hoạch ghi "UI nhập đã có sẵn, chỉ thiếu số" (đúng trong code, sai trên bản chạy). Đã sửa;
   `caddy-route-contract.test.mjs` nay **đọc ngược từ controller** nên lệch lần nữa là CI đỏ.
2. **Smoke test của deploy đòi hợp đồng CŨ** — Sale duyệt thì đơn phải `synced` và có
   `kiotVietCode`. GĐ1 dừng ở `sent` + hàng việc nhập ERP tay, còn `kiotVietCode` đã đổi tên thành
   `erpCode` ở G1-12 ⇒ **mọi lần deploy kể từ G1-12 đều chết ở bước smoke, sau khi đã build và đẩy
   image xong**. Không ai thấy vì pilot chưa deploy lại. Bài kiểm nay bám hợp đồng GĐ1 và chặt hơn.
3. **`scp --recurse` retry làm lồng gói khách một cấp** (`tenant-pack/<slug>/tenant.json`) khi SSH
   rớt giữa chừng — deploy chết ở bước kiểm gói khách. Nay tự gỡ phẳng rồi đi tiếp.

**▶️ 9 cổng go-live nay đạt 4/9** (đo thật trên `GET /settings/readiness`, 13/08):
`tenant.loaded` ✅ · `dealers.configured` ✅ · `groups.mapped` ✅ · **`media.production` ✅ (mới)**.
Năm cổng còn thiếu: `price.current_period` · `parser.production` · `channel.production` ·
`auth.production` · `golden.evaluated`. Đường ngắn nhất tới pilot, đúng thứ tự:

1. **A6 — bảng giá tháng hiện hành.** Chặn *thực tế* nặng nhất: tra giá fail-closed chỉ nhận kỳ
   `active` đúng tháng hiện tại, seed là `2026-07` ⇒ **0 giá active ⇒ MỌI đơn rơi handoff, kể cả đơn
   ≤50**. Bật kênh Zalo trước khi có bảng giá = bật một hệ thống không tự chốt được đơn nào.
   UI nhập đã có sẵn, chỉ thiếu số.
2. **D16 + D20** — văn bản chấp nhận rủi ro ToS Zalo + ai đứng tên tài khoản phụ. Không có hai thứ
   này thì `CHANNEL_MODE` không được rời `mock`.
3. **A4** (map nhóm ↔ đại lý cho nhóm pilot) · **A2/A3** (deal riêng, biểu phí COD/ship).
4. **Công tắc deploy đang khóa có chủ ý:** `render-secrets.sh` ép `CHANNEL_MODE='mock'` và
   `AUTH_MODE='none'` mỗi lần deploy; `DATA_CLASSIFICATION` chưa render nên mặc định `test`. Mở
   từng cái theo trình tự §5 của checklist go-live, **không mở đồng loạt**.
   *(`MEDIA_STORE` đã hết là việc tồn: từ 13/08 render-secrets đặt `gcs` khi biết bucket.)*
5. **B1-B2** — golden dataset; chưa có thì `golden.evaluated` không bao giờ `ready`.
6. **Parser**: stack pilot chạy `PARSER_MODE=flowise` → DeepSeek, **chưa nằm trong danh sách bên thứ
   3 được duyệt** (KiotViet + Claude). Dữ liệu khách thật phải đổi `claude` hoặc bổ sung DPA.

### Dữ liệu khách đã nhập (13/08/2026)

- **FAQ:** 4 file DOCX trong hồ sơ khách → **95 FAQ thật + 3 bài tổng quan + 4 link video** cho 5 SKU
  (BB-GREY · BB-ROSE · SKJ-CR022 · HERCULES · V08), đóng gói thành
  `tenants/ultty/data/content-manifest.json` và nạp lúc boot qua đúng đường import của `/settings`.
  Đã xác nhận trên pilot: **95 FAQ, tất cả ở `draft`**, provenance `local_manifest:ultty-faq-bo-san-pham`.
  Ngày 14/08 thêm file import thủ công `tenants/ultty/data/demo-content-manifest.json` gồm **4 FAQ
  demo có nhãn rõ** cho PRINCESS-EASYFILL, PRINCESS-12L và AROMA; file này không tự nạp như dữ liệu
  khách thật. Readiness chỉ bắt buộc FAQ/advice `active`; ảnh và link là nội dung bổ sung tùy chọn.
  Muốn thử phải import rồi duyệt `draft → reviewed → approved → active`.
  ⚠️ 3 câu trả lời của khách có ghi **số tiền** (giá niêm yết CR022, giá màng lọc) — phải đối chiếu
  kỳ giá hiện hành trước khi duyệt lên `active`; giá thuộc bảng giá, không thuộc FAQ.
- **Viết tắt:** `Viết tắt_.docx` → **27 cặp mới**, glossary gói khách 24 → **51**. Pilot đã đồng bộ
  đủ 51 qua `PUT /settings/source-truth/glossary/:term` (có audit).
  ⚠️ **Bất đối xứng cần biết:** `content-manifest.json` tự nạp mỗi lần boot, còn `knowledge.json`
  thì **không** — sau lần seed đầu, Postgres là nguồn sự thật (quyết định kiến trúc 6). Nên thêm từ
  viết tắt vào gói khách **không** tự vào DB; phải ghi qua `/settings` hoặc chạy lại seed.

**⚠️ BẪY MÔI TRƯỜNG — phiên sau phải biết, nếu không sẽ mất thời gian đúng như phiên này:**
1. `pnpm dev:api` cần `TENANT=ultty`. File `.env` ở gốc repo **thiếu dòng này** (đã thêm cục bộ
   12/08; `.env` bị gitignore nên máy khác vẫn thiếu). `.env.example` đã có sẵn dòng đúng.
2. Sau `pnpm install` phải chạy tay `pnpm --filter @netviet/api exec prisma generate`.
3. Dùng `pnpm` trực tiếp, **không** `corepack pnpm` (corepack chạy v11, project pin 10.34.4).
4. Hook `pre-commit` quét bí mật cần **>2 phút** cho commit lớn — đặt timeout dài, đừng cho là treo.
   Nó cảnh báo cả chuỗi mật khẩu **mẫu trong test** ≥12 ký tự; cách xử lý đúng là gom vào hằng số
   có tên không phải `password` (xem `auth.service.spec.ts`), **không** dùng `--no-verify`.
5. **Test xanh KHÔNG có nghĩa là chạy được.** Mọi spec API dựng service bằng `new Service(...)` nên
   không chạm DI. Đã thêm `app.module.boot.spec.ts` compile đồ thị DI thật — **đừng xóa/skip nó**.
6. **Cây làm việc phải SẠCH trước khi deploy** — `deploy.ps1:512` chặn nếu còn thay đổi chưa commit,
   và nó chặn **trước** bước build. Sửa file giữa lúc deploy đang chạy = hỏng cả lần deploy.
7. **`pnpm dev:web` không đọc `.env` ở gốc repo** (Next.js chỉ đọc `apps/web/.env*`) nên trang chết
   với "Thieu bien TENANT". Đặt `TENANT=ultty` trong `apps/web/.env.local`. Cùng họ bẫy với mục 1.

---

### 1.1 BẢNG TRẠNG THÁI GĐ1 — kiểm lại bằng code, 12/08/2026

> ⚠️ **Bảng cũ ("P2/P3/P4 ⬜ chưa làm") đã SAI.** Audit 12/08 cho thấy phần lớn code P2/P3/P4/
> parser-context/auth **đã tồn tại và đã wire vào runtime**. Ngược lại, baseline đang **đỏ**
> (typecheck/lint/build fail) — điều bảng cũ không phản ánh. Trạng thái dưới đây kiểm bằng
> code/call-site/schema/migration/test, không đọc lại tài liệu cũ.

**Baseline — ✅ ĐÃ XANH sau Đợt A (commit `a2091f4`, nhánh `gd1/code-complete`):**

| Kiểm tra | Trước Đợt A | Sau Đợt A |
|---|---|---|
| `pnpm typecheck` | ❌ 3 lỗi TS (campaign) | ✅ exit 0 |
| `pnpm lint` | ❌ `env.ts:175` biến thừa | ✅ exit 0 |
| `pnpm build` | ❌ exit 2 | ✅ exit 0 |
| API test | ❌ 2 fail / 542 pass | ✅ **544 pass** / 23 skip |
| Web test | ❌ 7 fail / 36 pass | ✅ **43 pass** |
| shared · tenant · poc-parser · deploy-routes | ✅ 83 · 23 · 4 · 10 | ✅ không đổi |

Kèm một lỗi **thật** được sửa trong Đợt A: `lib/auth.ts` không cache token khi `/auth/csrf`
không trả trường nào ⇒ **mọi** mutation bắt thêm một vòng `/auth/csrf`, im lặng và không bao
giờ dừng. Nay cache `?? null`.

> ### ⚠️ ĐÍNH CHÍNH audit (phát hiện ở Đợt D): **API trước đó KHÔNG khởi động được**
>
> Bảng audit ngày 12/08 đánh P2.1 và P4-import là **DONE** dựa trên code + call-site + migration
> + test. Kết luận đó **sai ở một điểm quyết định**: toàn bộ test API dựng service bằng
> `new Service(...)` nên **chưa từng chạm container DI của Nest**. Khi chạy thật `pnpm dev:api`,
> ứng dụng ngã ở boot vì **ba lỗi** — nghĩa là các module Codex thêm vào **chưa từng chạy lần nào**:
>
> 1. `PricePeriodsService` tiêm `KnowledgeService` trong khi `OperationalSettingsModule` không có
>    provider đó (`KnowledgeService` khi ấy là provider riêng của `AppModule`).
> 2. `MasterDataService` khai báo phụ thuộc bằng **kiểu cấu trúc** (`RuntimePrisma`/`KnowledgeReloader`/
>    `AuditAppender`) nên Nest chỉ thấy `Object` — không thể là provider lớp trần.
> 3. `.env` được nạp **sau** khi `AppModule` đã import xong, mà `AppModule` kéo theo `knowledge/seed.ts`
>    đọc `process.env.TENANT` ngay lúc import ⇒ từ khi B1 bỏ giá trị mặc định của `TENANT`,
>    `pnpm dev:api` **không boot được bằng `.env`** dù `.env.example` vẫn hướng dẫn đặt ở đó.
>
> Đã sửa cả ba (KnowledgeModule `@Global` giữ **một** thể hiện · factory cho `MasterDataService` ·
> tách `config/load-dotenv.ts` import đầu tiên). **Bài học ghi lại:** "có code + test xanh" không
> đồng nghĩa "chạy được". Đã thêm `app.module.boot.spec.ts` compile **toàn bộ đồ thị DI thật**, nên
> lỗi cùng kiểu sẽ đỏ ngay ở CI thay vì chờ tới lúc deploy.

| Capability | Status | Evidence | Gap |
|---|---|---|---|
| Kiến trúc canonical | **DONE** | `nen-tang-da-khach.md` generic, không tên khách, không trạng thái | — |
| Tenant isolation | **DONE** | không có nhánh `if tenant===`; tên khách chỉ trong comment; `TENANT` không mặc định; adapter ERP chọn theo gói khách + route/cột trung tính (`5b4b6c6`) | — |
| P1 auto-confirm | **DONE** (code) | `order-auto-confirmation.ts` + `pipeline.service.ts:272`; ngưỡng từ `tenant.orderAutomation`; inclusive 50 | Hiện **không chạy được** vì không có kỳ giá active → xem P2.1 |
| P2.1 price period | **DONE** | `knowledge/price-periods.ts` chỉ nhận đúng tháng + `active`, **không fallback**; wire ở `knowledge.repository.ts:20`, `knowledge.service.ts:46`, `prisma-knowledge.repository.ts:19`; migration `20260812123000_price_periods` | Seed là `2026-07`, tháng hiện tại `2026-08` ⇒ **0 giá active ⇒ mọi đơn handoff**. Cần A6 + G1-10 |
| P2.2 retail advice | **DONE** | `tenant.retailAdvice{priceField,qualifier}`; dùng ở `risk-rules.ts:58`, `agent-orchestrator.service.ts:328,362` | — |
| P4 content schema | **DONE** | 8 model: `SourceProvenance/Asset/ProductAsset/FAQ/AdviceContent/ContentLink/ContentReadiness`; migration `20260812141000_product_content` | — |
| P4 import | **DONE** (code) | `content/content-import.service.ts` + `ContentSourcePort` + `local-manifest`/`google-drive` adapter | Chưa nhập dữ liệu thật (thiếu quyền Drive) |
| P4 settings UI | **DONE** | `ContentSettings.tsx` gắn trong `SettingsShell` (9 tab) | — |
| Agent bán hàng | **DONE** | `ContentService.productAdvice()` nối vào `AgentOrchestrator:306`, fail-safe → handoff khi thiếu content approved; gửi ảnh theo `channel-capabilities`, video/PDF/catalog gửi **link** (Bot Platform `sendVideo`/`sendFile` trả 404 — đã đo 11/08) | — |
| P3 campaign domain | **DONE** | `Campaign/CampaignTarget/CampaignDelivery` + 3 enum; migration `20260812150000_campaigns` | — |
| P3 scheduler | **DONE** | `campaign.scheduler.ts` `setInterval` theo `tickIntervalSeconds`; claim bền có `claimExpiresAt` lease + `$transaction` + SQL claim; retry/cancel có; compile xanh từ `a2091f4` | — |
| P3 campaign UI | **DONE** | `CampaignSettings.tsx` trong `SettingsShell` | — |
| Parser context/reply | **DONE** | `ConversationContextBuilder` bounded (6 tin/4.000 ký tự), khóa theo nhóm **và thành viên**; burst tối đa 4 tin/4.000 ký tự trong `MESSAGE_BURST_WINDOW_MS` được gửi một lần cho Agent Điều phối/LLM kèm timestamp; `validateContextualParse` fail-safe → `intent=khac`; cả `zca-message.ts` và `bot-poller.ts` map quote → `replyTo` | Sửa/hủy đơn đã tồn tại còn chờ D10 |
| Auth (session) | **DONE** (code) | `AuthModule`, `Session` model, argon2, `csrf-sync`, migration `20260812162000_auth_sessions`; `AUTH_MODE=session` ép `SESSION_SECRET`≥32 + prisma ở production | Web test đỏ (G1-03) |
| RBAC | **DONE** | `@Roles` phủ cả 6 controller từng hở (`settings`·`orders`·`knowledge`·`demo`·`zalo`·`group-participants`) + campaign · content · master-data · users · broadcast; `roles-coverage.spec.ts` chặn hồi quy (`351e912`) | — |
| CSRF/session security | **DONE** (code) | `CsrfGuard` + `SessionAuthGuard` + `RolesGuard` đăng ký `APP_GUARD` | Test đỏ (G1-03) |
| Production parser gate | **DONE** | `env.ts:207` `DATA_CLASSIFICATION=customer` ép `PARSER_MODE=claude` + `ANTHROPIC_API_KEY` + prisma + auth | — |
| Media readiness | **DONE** | `env.ts:221` kênh thật + `MEDIA_STORE=none` → fail; `MEDIA_STORE=s3` thiếu config → fail-fast; `MediaHealthController` đã đăng ký | Vận hành chưa bật S3 |
| Golden eval | **DONE** (code) | harness thật ở `tools/poc-parser/src/eval-core.ts` (field/intent/SKU/quantity/dealer); `golden-eval-report.ts` đã nối vào `ReadinessService` (`d193b98`) — chưa có dataset thì `GO_LIVE_READY=false, reason=missing_golden_dataset` | Thiếu **dữ liệu** B1-B2 |
| Readiness UI | **DONE** | `operational-readiness.ts` + `ReadinessController` (`GET /settings/readiness`) + tab "Sẵn sàng vận hành" trong `SettingsShell` (`d193b98`); 9 cổng bắt buộc, không bịa dữ liệu khách | — |
| Zalo E2E | **DONE** (code) · **BLOCKED_EXTERNAL** (chạy thật) | `apps/api/src/e2e/zalo-order-path.e2e.spec.ts` chạy trên **đồ thị DI thật**, chỉ giả lập biên giới mạng Zalo; phủ auto-confirm/handoff/I1/trùng/**restart**/**reconnect** (`fe13f7b`). Đã đo có răng bằng mutation | Đăng nhập tài khoản thật: D16 + D20 + credential |
| Go-live checklist | **DONE** | [van-hanh/checklist-go-live.md](../van-hanh/checklist-go-live.md) — 9 cổng máy chấm, 2 công tắc khóa có chủ ý, 5 chặn pháp lý, trình tự bật 8 bước, rollback | — |
| VAT | **BLOCKED_BUSINESS** | `rules.ts:122` `vat=false` + warning; `tenant.readiness.blockedCapabilities` hiển thị qua `settings-query.service.ts:42` | D8. Drive X5: hợp đồng **đã hứa tính VAT** |
| COD + ship | **BLOCKED_BUSINESS** | `rules.ts:118,120` ép 0 + warning; `computeShipping()` ném lỗi, không call-site thật | A3. Drive X2: ngưỡng "miễn phí từ 2 SP" **có nguồn**, số tiền cước thì không |
| Công nợ 7 ngày | **BLOCKED_BUSINESS** | không có enum/rule mới | D15. Drive X1: PO ký gửi ghi "thanh toán trong 7 ngày kể từ ngày xuất hóa đơn" ⇒ nghiêng về **điều khoản của `ky_gui`** |
| Khuyến mãi | **BLOCKED_BUSINESS** | không có promotion engine | A7 |
| Bảng giá T8 | **BLOCKED_EXTERNAL** | — | A6 — UI nhập đã có, chỉ thiếu dữ liệu |
| Golden dataset | **BLOCKED_EXTERNAL** | — | B1-B2 |

**Kết luận (cập nhật cuối 12/08/2026):** ba điểm lệch của bảng trên đã đóng hết — baseline xanh
(`a2091f4`), RBAC phủ 6 controller (`351e912`), readiness + golden-eval đã nối vào runtime
(`d193b98`). Cùng với G1-12 (`5b4b6c6`) và G1-13 (`fe13f7b`), **GĐ1 đạt code-complete theo
[§15](gd1-ultty.md)**. Mọi hạng mục còn `BLOCKED_*` dưới đây đều thiếu **dữ liệu hoặc quyết định
nghiệp vụ của khách**, không thiếu code — và tất cả đều đang **fail-closed** (ép 0 + cảnh báo ⇒
chuyển Sale), hiện rõ trên tab "Sẵn sàng vận hành".

- **✅ ĐỢT A′ TASK 1 XONG (11/08/2026) — tin chỉ-ảnh không còn bị vứt.** Làm theo TDD, 4 commit: `f29efda` (RED) → `5608b4a` (GREEN) → `170e975` (refactor) → `9af3ee0` (phủ nốt + chứng minh vào đến DB). Bằng chứng đầy đủ: [TDD Task 1](../kiem-thu/tdd/2026-08-11-tin-chi-anh.md). Đã sửa: `channelMessageSchema` bỏ `.min(1)` trên `text` + thêm `.refine(text.trim() !== '' || imageUrl)` (**`text` giữ nguyên kiểu `string`, KHÔNG optional** — nên không call-site nào phía sau phải đổi); hai mapper `zca-message.ts` + `bot-poller.ts` chỉ bỏ tin khi **không có cả chữ lẫn ảnh**. **Phát sinh phải bịt cùng lúc:** sau thay đổi, `photo_url` thành căn cứ DUY NHẤT giữ tin không caption, mà `bot-poller` trước đó gán thẳng vào `imageUrl` không kiểm ⇒ một URL hỏng làm `safeParse` rớt **cả tin, kể cả tin có chữ**; đã thêm `toHttpUrl` (zca vốn đã có guard này) rồi gom hai bản sao vào `ingest/http-url.ts`. Kiểm: **api 389 passed / 21 skipped** (mốc cũ 378+21, +11 test mới, không test cũ nào đổi trạng thái) · shared 69 · web 29 · route 8 · typecheck · lint — xanh. Đánh đổi đã biết: tin **chỉ toàn khoảng trắng và không có ảnh** nay bị từ chối (trước `.min(1)` cho `'   '` đi qua) — không mất nội dung, và zca vốn đã bỏ tin này bằng `trim()`. ⚠️ Task 1 mới chặn đường mất TIN, chưa chặn đường mất ẢNH — **đã làm nốt ở Task 2 (mục dưới)**.
- **✅ ĐỢT A′ TASK 2 XONG (11/08/2026) — ảnh được TẢI VỀ kho bền vững, không còn chỉ là cái link.** TDD, 3 commit: `03a6a03` (RED) → `4c6f1fa` (GREEN) → `8205ba3` (refactor + phủ nốt). Bằng chứng: [TDD Task 2](../kiem-thu/tdd/2026-08-11-luu-anh-ben-vung.md). Đã có: module `apps/api/src/media/` 7 file nhân bản khuôn `channels/` (`MediaStore` interface + `media.provider.ts` chọn theo `MEDIA_STORE=none|local|s3` + 3 store + `media-policy.ts` thuần + `MediaFetcherService`); Prisma `Message` **+4 cột nullable** (`mediaKey`/`mediaBytes`/`mediaFetchedAt`/`mediaError`) kèm migration `20260811120000_message_media`; `deploy/netviet/gcs-lifecycle.json` **+2 rule prefix `media/`** (60n → Nearline, 365n → Coldline, **KHÔNG có rule Delete**). Thư viện: `sharp` 0.35.3 + `p-limit` 7.3.1 + `@aws-sdk/client-s3` 3.1107.0 (**chuẩn S3**, không `@google-cloud/storage` — để đổi GCP → OVHcloud không phải sửa code). **Phát sinh phải bịt cùng lúc:** trước Task 2 không chỗ nào trong `apps/api/src` tải một URL do người khác đưa vào; Task 2 tạo ra đúng điều đó ⇒ đã thêm cổng chặn **SSRF** `MEDIA_ALLOWED_HOSTS` (mặc định `zdn.vn`, khớp theo **biên dấu chấm** nên `evil-zdn.vn` bị chặn, để rỗng = chặn hết), chặn **trước khi ra mạng**. Hai bất biến là test: tải ảnh hỏng (404 · không phải ảnh · quá lớn · kho lỗi · **DB lỗi**) KHÔNG làm rớt tin — chỉ ghi `mediaError`; tải chạy **ngoài** đường đi của tin (`schedule`, không `await`) nên mạng chậm không làm chậm chốt đơn. Kiểm: **api 430 passed / 21 skipped** (mốc cũ 389+21, **+41 test mới, không test cũ nào đổi trạng thái**) · coverage `src/media` **97,88% stmt / 95,65% branch** · typecheck · lint — xanh.
  **⚠️ CHƯA LƯU ẢNH NÀO CHO TỚI KHI VẬN HÀNH BẬT:** mặc định vẫn `MEDIA_STORE=none` (demo/CI offline). **▶️ VIỆC TIẾP THEO là việc VẬN HÀNH, không phải lập trình:** cấp khóa HMAC cho bucket + đặt `MEDIA_STORE=s3` · `MEDIA_BUCKET` · `MEDIA_ENDPOINT=https://storage.googleapis.com` · `MEDIA_ACCESS_KEY_ID` · `MEDIA_SECRET_ACCESS_KEY`. **Bẫy:** rule lifecycle gắn vào **bucket sao lưu** (`$BackupBucket`, [deploy.ps1:367](../../../deploy/netviet/deploy.ps1:367)) ⇒ `MEDIA_BUCKET` phải trỏ đúng bucket đó, nếu không rule `media/` không có tác dụng mà cũng không báo lỗi. Chưa có: đường **đọc lại** ảnh (endpoint/UI), hiển thị `mediaError` trên `/settings`, backfill ảnh cũ (chưa cần — `CHANNEL_MODE=mock` từ 08/08 nên chưa có tin Zalo thật trong DB).
- **Nền tảng server — CHỐT 11/08/2026:** **giữ nguyên GCP**, sau này chuyển **OVHcloud**. ⇒ tầng lưu ảnh phải dùng **chuẩn S3** (`@aws-sdk/client-s3`), **KHÔNG** dùng `@google-cloud/storage`. Yêu cầu khách: **giữ ảnh ≥ 60 ngày**. *(Đã cân nhắc chuyển server về VN cho gọn nghĩa vụ Điều 18 NĐ 356/2025 — user quyết định giữ GCP; nghĩa vụ hồ sơ chuyển dữ liệu xuyên biên giới vì vậy vẫn còn, xem D22.)*
- **Nhánh hiện tại:** `gd1/code-complete` (chưa push, chưa merge vào `main`).
- **Pilot GCP đã khóa `CHANNEL_MODE=mock` ngày 08/08/2026:** không đọc/gửi Bot Platform hoặc zca, không dùng PII thật. Source deploy cũng luôn render `mock` để lần deploy sau không tự bật lại kênh Zalo; Flowise/PostgreSQL/SSE vẫn dùng dữ liệu TEST qua luồng bơm tin demo.
- **📚 NHẬT KÝ SỰ CỐ ẢNH 11/08 — ĐÃ KHẮC PHỤC BẰNG A′ TASK 1-2:** đo cũ xác nhận URL Zalo chết trong ≤35 ngày và tin chỉ-ảnh từng bị bỏ. Code hiện đã nhận tin chỉ-ảnh và có `MediaFetcher`/S3 store; việc còn lại là vận hành bật `MEDIA_STORE=s3` như mục trên. Nghiệp vụ nhóm vận chuyển 2.3 vẫn ngoài phạm vi GĐ1, độc lập với việc lưu media đầu vào.
- **🟢 KẾT LUẬN "BOT PLATFORM CHẾT" ĐÃ SAI — kênh sống lại, đo lại 11/08/2026.** Dùng đúng token đang có: `getUpdates` trả **HTTP 200 + `error_code:408 Request timeout`** và **tôn trọng đúng tham số `timeout`** — 1s→1.196ms, 5s→5.092ms, 20s→20.111ms. Theo chú thích sẵn có trong [zalo-bot.client.ts:3](../../../apps/api/src/channels/zalo-bot.client.ts:3), `408` = *rảnh, không có tin mới* ⇒ **long-poll khỏe mạnh bình thường**, không còn 504-ở-5,13s. Đường **gửi cũng sống**: `sendMessage` và `sendPhoto` trả `410 "The chat_id is invaild"` (endpoint đã validate chat_id) khi thử với chat_id không tồn tại — **không tin nào tới người thật**. ⇒ Sự cố 05/08 là **gián đoạn tạm thời phía Zalo, nay đã hết**; có kênh chính thức hợp pháp cho cả đọc lẫn gửi. **Ràng buộc còn nguyên:** mention-gating (bot chỉ nhận tin @mention) ⇒ D2 thành câu hỏi quyết định kiến trúc; và `sendVideo`/`sendFile` trả **404 — API không tồn tại** ⇒ video/catalog phải gửi bằng link. Chi tiết: [gd1-ultty.md §2](gd1-ultty.md). *(Đoạn dưới giữ nguyên làm nhật ký điều tra 05/08 — không còn là trạng thái hiện tại.)*
- **⛔ KÊNH BOT PLATFORM CHẾT — xác nhận bằng token mới (05/08/2026).** Người vận hành cấp lại `ZALO_BOT_TOKEN`; token cũ nay trả **401 Unauthorized** (đã thu hồi thật), token mới `getMe` **200 OK** cùng bot id `4055584533866160964`. **Nhưng `getUpdates` vẫn 504** — thử `{timeout:20|5|1}` và body rỗng, cả POST lẫn GET, từ máy local lẫn từ VM: **lần nào cũng 504 ở đúng ~5,13 giây** (nginx của Zalo bỏ cuộc chờ upstream), tham số `timeout` không có tác dụng nào. `getWebhookInfo` trả **404** ⇒ Bot Platform **không có đường webhook** để thay long-polling. ⇒ Kết luận: **sự cố phía Zalo, không có cách sửa bằng code, không có đường vòng.** Từ 08/08 runtime đã khóa `CHANNEL_MODE=mock`, vì vậy BotPoller và zca đều không chạy; token version 2 chỉ còn lưu trong Secret Manager, không làm kênh hoạt động.
- **Trang vận hành `/settings` (03/08/2026)** — 6 tab cho người non-technical: trạng thái/đăng xuất kênh Zalo + đồng bộ thành viên nhóm allowlist bằng zca; phân loại từng thành viên (`customerRank` · `operationalRole` · `handlingMode`, mặc định `unknown + inherit_group` nên sync KHÔNG tự đổi hành vi pipeline); CRUD đại lý/SKU/giá/override; rules typed có draft → preview → activate (không cho nhập công thức tự do); công tắc `AUTO_SEND` dùng chung một state với TopBar; lịch sử thay đổi (audit append-only, đã lọc token/PII). **Rank thành viên không đổi đơn giá** — giá vẫn là `DealerPriceOverride > Price.wholesale`.
- **`/settings` — sửa lỗi KHÔNG AI VÀO ĐƯỢC (04/08/2026, đợt 2):** trang 6 tab ở trên đã deploy và đọc/ghi Postgres thật (19 SKU, 3 đại lý), nhưng người vận hành báo "chưa có giao diện sửa nguồn sự thật / chưa có danh sách thành viên". Đối chiếu code: **giao diện có đủ, chỉ là không có đường đi tới** — (a) không một link `/settings` nào trong toàn app (mục "Link Settings" của plan §9 bị bỏ sót); (b) Caddy `@blocked` trả 404 cho `demo.../settings`; (c) matcher `/settings/*` nuốt luôn `/settings/` (dấu `/` cuối) đẩy sang API → 404. Đã sửa cả ba: nút **⚙ Cấu hình** trên TopBar + link chéo `/zalo ↔ /settings`, bỏ `@blocked`, tách từng endpoint API dưới `/settings`. Kèm 3 lỗi cùng gốc: **mọi thao tác ghi đều im lặng** (chỉ có tone `error`, không có `success`) → thêm `SettingsPanelState tone="success"` + banner sau "Lưu và bắt đầu nhận tin" (hiện số nhóm đang nghe + lối sang bước đồng bộ thành viên) và sau đồng bộ (hiện số thành viên, phân biệt đủ/thiếu); nút "Mở Admin nâng cao" dẫn tới `/admin` đang 404 vì `ADMIN_UI=off` → summary trả thêm `adminUi`, UI ẩn nút khi tắt; đồng bộ thành viên nay **loại tài khoản zca của chính mình và UID Bot Platform** khỏi danh sách.
- **Test với dữ liệu Zalo THẬT (04/08/2026) — 2 lỗi chỉ lộ khi chạy thật:** sau khi người vận hành đăng nhập tài khoản phụ `Nhân Viên AI` và allowlist 2 nhóm, lộ ra: (1) **chatId trong nguồn sự thật là ID cũ** (`2508…`, `3787…`) không khớp ID thật (`5418…`, `6732…`) → `POST /zalo/groups/:id/members/sync` trả 400 "Nhom Zalo chua duoc map vao nguon su that", và mọi đơn từ 2 nhóm này sẽ không tra được đại lý ⇒ không có giá. Đã map lại qua tab "Map nhóm Zalo" (2 bản ghi mới, giữ bản cũ để không mất lịch sử). (2) **Zalo trả `GroupInfo.memberIds` RỖNG** và dồn toàn bộ thành viên vào `currentMems` — code chỉ đọc `memberIds` nên sync trả `expectedCount: 0` mà vẫn báo `complete: true` (**hỏng âm thầm**, không có lỗi nào). Đã sửa: gộp cả hai nguồn và dùng luôn hồ sơ nhúng trong `currentMems` (`dName`/`zaloName`/`avatar`) nên **không cần gọi `getGroupMembersInfo`** cho các thành viên đã có sẵn.
- **✅ FIX ĐỔI TÀI KHOẢN ZCA (14/08/2026):** kết luận "giữ bản cũ + tạo bản mới" ở trên chỉ chữa triệu chứng. `groupId`/UID của zca phụ thuộc tài khoản; `globalId` mới là identity ổn định. Schema/runtime nay lưu `Group.globalId` và `GroupParticipant.globalId`, reconcile allowlist theo transaction, chỉ nối legacy sau xác nhận rõ của người vận hành, hợp nhất bản `pending` trùng vào Group canonical và giữ dealer/lịch sử/thành viên/campaign. Không bao giờ đoán theo tên; thiếu `globalId` thì fail-closed. QR tài khoản mới cách ly allowlist cũ. Seed Postgres không còn tạo Group từ routing ID trong gói tenant, nên deploy sau không hồi sinh hai ID cũ.
- **Khai thác hai kênh hybrid (04/08/2026, đợt 3) — 4 lỗ hổng "biết mà không ghi":** soát lại toàn bộ đường dữ liệu sau câu hỏi của người vận hành *"tại sao lại có đoạn map nhóm trong khi bạn có thể lấy được id nhóm, tên nhóm"*. Hệ thống đã biết đủ id + tên nhóm và id + tên người gửi trên **cả hai kênh** nhưng không ghi lại gì cả. Đã sửa cả bốn:
  1. **Tin của nhóm chưa map bị VỨT, không lưu** — `ZcaListener` và `BotPoller` đều `return` trước khi gọi pipeline; Zalo không phát lại ⇒ mất vĩnh viễn, trái `CLAUDE.md` "Lưu mọi tin nhắn/đơn về DB ngay khi nhận". Cổng chặn có lý do đúng (không đẩy PII sang DeepSeek) nhưng đặt sai chỗ. Nay `PipelineService.intake()` **lưu trước, lọc parser sau**, trả kết quả **có nhãn** (`processed`/`stored_only`/`duplicate`/`ignored`) dạng union phân biệt. Sửa kèm một **lỗi tiềm ẩn sẵn có**: listener gọi `guard.release()` cho mọi giá trị `null`, tức coi "bỏ qua có chủ ý" là thất bại và để tin chạy lại. `isGroupMapped` **fail-closed**: thiếu `KnowledgeService` thì coi như chưa map (đoán "đã map" = rò PII nếu DI hỏng trong im lặng).
  2. **Nhóm không tự vào nguồn sự thật** dù `Group.status`/`source`/`lastSeenAt` có sẵn trong schema từ đầu mà **chưa hề có writer nào**. Nay `GroupDiscoveryService.observe()` upsert theo khoá tự nhiên `(platform, chatId)` ngay khi thấy tin đầu tiên (`pending` + `auto_suggest`, throttle 5 phút/nhóm, chỉ cập nhật `lastSeenAt` cho hàng đã có nên nhóm đã `mapped` không bị hạ cấp). Bỏ log *"copy ID này vào seed.ts"* — hệ thống không còn bắt người vận hành chép chatId vào mã nguồn.
  3. **Map nhóm phải gõ chatId tay** (19 chữ số) dù UI đã hiện sẵn cả ID lẫn tên — chính chỗ này gây sai hôm nay. Nay `PUT /settings/groups/:chatId/mapping` + **dropdown chọn đại lý ngay trên bảng nhóm**; kiểm dealer tồn tại trước khi chạm bảng `Group`; gọi `knowledge.reload()` để pipeline thấy ngay. `/settings/summary` trả thêm `groups[].status`, parser web mặc định `pending`.
  4. **Bot Platform bỏ qua allowlist** — chỉ `ZcaListener` kiểm, nên nhóm người vận hành **cố ý không chọn** vẫn được xử lý qua kênh Bot nếu tình cờ đã map. `shouldAcceptBotMessage` áp allowlist cho cả hai kênh trong hybrid; bot thuần (allowlist rỗng) không bị áp.
- **✅ Đã có đường vòng cho bế tắc danh sách thành viên (04/08/2026, đợt 3).** Dò Bot Platform bằng token thật: `getChat`, `getChatMemberCount`, `getChatMembersCount`, `getChatAdministrators` **đều 404** trong khi `getMe` 200 (`account_type: BASIC`) ⇒ kênh chính thức **không có API thành viên**, ngõ này đóng hẳn. Nguồn còn lại **duy nhất** là chính luồng tin: cả hai kênh đều kèm uid + tên người gửi ở **mọi** tin (`data.uidFrom`/`dName` và `from.id`/`display_name`) — hai trường này vốn đã được lưu vào bảng `Message` rồi bỏ đó, trong khi pipeline tra participant theo đúng cặp đó và tra hụt thì lặng lẽ đi tiếp. Nay `recordSeen()` (2 repository + enum `ParticipantSource.message_stream`) ghi người gửi vào danh sách, chạy cho **cả nhóm chưa map** — chỉ nội dung bị chặn khỏi LLM, danh tính thì không. **Ba bất biến là test chứ không phải quy ước:** không bao giờ đánh `active=false` (đây là lát cắt, không phải ảnh chụp đầy đủ) · không đè phân loại của người vận hành · không hạ cấp `source`. UI nói rõ danh sách là **"những người đã nhắn"**, không phải toàn bộ nhóm, kèm nhãn nguồn + lần nhắn gần nhất. ⚠️ Giới hạn: người **chưa bao giờ nhắn** vẫn không xuất hiện; với nhóm 4-6 người thì hội tụ nhanh, nhóm lớn thì không.
- **⛔ CHẶN (nguyên nhân gốc vẫn treo): Zalo không trả danh sách thành viên nhóm (04/08/2026).** *Đã có đường vòng ở mục trên, nhưng bản thân `getGroupInfo` vẫn hỏng.* Tài khoản phụ `Nhân Viên AI` thấy nhóm và `totalMember` đúng (4 và 6) nhưng `getGroupInfo` trả **mọi trường mảng đều rỗng** (`memberIds`, `currentMems`, `adminIds`) trong khi **mọi trường vô hướng đều đầy đủ** (`name`, `totalMember`, `setting`, `creatorId`). Đã loại trừ bằng bằng chứng: **(a)** không phải lỗi parse — các trường có mặt, chỉ rỗng; **(b)** không phải quyền nhóm — `lockViewMember=0`, `e2ee=0`; **(c)** không phải cache version — `getGroupInfo` của zca-js luôn gửi `gridVerMap = 0` nên lần nào cũng xin bản đầy đủ. Còn lại 2 khả năng **chưa kiểm**: zca-js 2.1.2 (pin có chủ ý) lệch so với API `group/getmg-v2` hiện hành của Zalo, hoặc tài khoản phụ bị hạn chế ở mức tài khoản. **Cập nhật 05/08/2026 (đợt 4):** tìm ra `memVerList` — một trường UID nữa trong **cùng** response mà code chưa đọc; đã đọc thêm, nhưng chưa biết Zalo có điền nó không (xem đợt 4 bên dưới). ⇒ Nút **"Đồng bộ"** có thể vẫn vô dụng với dữ liệu thật (tab thì đã dùng được nhờ đường vòng học-từ-luồng-tin ở trên). Lưới an toàn đã có: sync trả `complete: false`, **không** đánh inactive ai, UI báo đỏ "Zalo không trả về danh sách thành viên" thay vì "đã đồng bộ 0 thành viên".
- **Ba lỗi từ một buổi vận hành (05/08/2026, đợt 4).** Người vận hành bấm "Đồng bộ" và báo hai chuyện: lỗi đồng bộ, và *"tôi còn không xóa được mấy nhóm có id 2508…, 3787…"*. Soát ra ba nguyên nhân khác hẳn nhau:
  1. **`getGroupInfo` còn một trường chưa ai đọc.** Log VM ngày 04/08 cho thấy `totalMember=4-5` nhưng `memberIds=0`, `currentMems=0`, trong khi `lockViewMember=0` và `e2ee=0` — nhóm **không khoá gì cả**. Đọc lại kiểu của zca-js 2.1.2 thì response còn `memVerList: string[]` (danh sách `"uid_version"` Zalo dùng để bắt cache) mà code chưa đụng tới. Nay `fetchGroupMembers` gộp nó làm **nguồn UID thứ ba**; hồ sơ còn thiếu vẫn lấy qua `getGroupMembersInfo` như cũ, không tốn thêm request nào. Parser cố tình **không ném lỗi** với phần tử dị dạng — đây là nguồn vét vát, một phần tử lạ không được làm hỏng cả lần đồng bộ. ⚠️ **Chưa xác minh trên dữ liệu thật**: dòng log cũ không đếm `memVerList` nên chưa biết Zalo có điền trường này không; log mới đã thêm số đếm, cứ bấm Đồng bộ một lần là biết.
  2. **Thông báo lỗi đang nói sai nguyên nhân.** UI bảo *"tài khoản này chưa đủ quyền xem thành viên"* và bảo người vận hành đi mở nhóm trên Zalo — trong khi nhật ký chứng minh ngược lại. Đã viết lại theo sự thật (giới hạn phía Zalo, không phải quyền tài khoản) và chỉ sang cơ chế học-từ-luồng-tin đang chạy sẵn.
  3. **Không có đường nào gỡ một nhóm khỏi danh sách.** Enum `GroupMappingStatus` có `ignored` **từ migration đầu tiên** nhưng chưa ai từng ghi giá trị đó; `SettingsQueryService` thì liệt kê **mọi** hàng `Group` bất kể trạng thái. Nên hai nhóm `source=seed` sót từ đợt test trước kẹt vĩnh viễn trong bảng — đúng như người vận hành mô tả. Nay có `PUT /settings/groups/:chatId/hidden` (có audit, `knowledge.reload()`) + khu **"Nhóm đã gỡ"** có nút *Đưa lại*. **Cố ý không xoá hàng:** `Message.groupId` và `Order.groupId` đều trỏ tới `Group` và **không** cascade, nên `delete` sẽ vi phạm khoá ngoại ngay khi nhóm từng nhận tin — mà `CLAUDE.md` thì cấm xoá tin. Gỡ **không** đụng `dealerId` nên đưa lại là chạy tiếp, không phải chọn lại. Kèm theo: `prisma/seed.ts` thôi ghi đè `status`/`dealerId` ở nhánh `update`, nếu không thì chạy lại seed là nhóm đã gỡ sống dậy.
- **Lưu trữ:** mặc định in-memory (`PERSISTENCE=memory` → demo/CI không cần DB); bật Postgres bằng `PERSISTENCE=prisma`. **MỌI tin nhắn được lưu vào bảng `messages` ngay khi nhận** (11/07, commit `6d1a539` — trước khi qua pipeline, chống trùng unique, nối `orders.messageId`).
- **Nguồn sự thật ĐỘNG:** sửa qua panel `/admin` (AdminJS) hoặc MCP tool (8 tool) → ghi Postgres + pipeline nạp lại ngay.
- **✅ ĐỒNG BỘ THÀNH VIÊN ĐÃ CHẠY ĐƯỢC VỚI DỮ LIỆU THẬT (05/08/2026) — gỡ bỏ mục ⛔ CHẶN bên dưới.** Sau khi deploy đợt 4, bấm "Đồng bộ" trên VM trả về: Meta HN `complete: true, fetchedCount: 3`, Thái Nguyên `complete: true, fetchedCount: 4` (trước đó cả hai đều `fetchedCount: 0, complete: false`). DB có đủ 7 hàng `GroupParticipant` kèm tên thật và avatar. ⚠️ **Chưa quy được công cho đường nào:** cảnh báo "Zalo khong tra danh sach thanh vien" **không** kích hoạt, và log đường link mời **cũng không** — nghĩa là UID đến từ `memberIds`/`currentMems`/`memVerList` (đều là "đường chính"), nhưng không phân biệt được là do `memVerList` mới đọc hay do Zalo tự trả lại 2 trường cũ. Đường **link mời chưa từng chạy thật lần nào** ⇒ vẫn là mã chưa được kiểm chứng ngoài test. Dòng log đã đếm `memVerList` nên nếu tái phát sẽ thấy ngay. Ghi nhận thêm: hàng `Phùng Việt` giữ nguyên `source=manual` sau đồng bộ — bất biến "không hạ cấp source" đúng trên dữ liệu thật.
- **Nguyên nhân gốc bế tắc danh sách thành viên: ĐÃ RÕ (05/08/2026) — và nó bác bỏ cả hai giả thuyết cũ.** Issue [#359](https://github.com/RFS-ADRENO/zca-js/issues/359)/[#349](https://github.com/RFS-ADRENO/zca-js/issues/349) của zca-js cho thấy **Zalo chủ động chặn đọc danh sách thành viên ở diện rộng từ giữa 2026** (*"trước quét được giờ bị zalo lock rồi"*; người bảo trì xác nhận *"Zalo họ biết và có thể là đã sửa lỗi này rồi"*). Không phải zca-js lệch phiên bản, không phải tài khoản phụ bị hạn chế ⇒ **nâng thư viện không cứu được**, và cơ chế học-từ-luồng-tin là **giải pháp chính**, không phải tạm bợ. Đã cài thêm đường vét vát cuối: `getGroupLinkInfo` (endpoint khác — `group/link/ginfo`) chỉ chạy khi cả ba trường UID rỗng **và** nhóm đã sẵn có link mời bật; hệ thống **không bao giờ tự bật link mời** vì đó là đổi cài đặt nhóm của khách. Chi tiết: [kiến trúc hệ thống](../../kien-truc/he-thong.md) Phụ lục A.
- **✅ ĐỢT B1 — TRUNG TÍNH HÓA NHÂN XONG (12/08/2026).** Base không còn mang tên một khách: gói `@ultty/*` → `@netviet/*`; nguồn sự thật Ultty (19 SP + bảng giá + 3 đại lý + 24 glossary) rời `apps/api/src/knowledge/seed.ts` sang **gói khách** `tenants/ultty/data/knowledge.json`; tên khách rời `parser-prompt.ts` sang `tenants/ultty/tenant.json` (`persona.parserIntro`); `KiotVietAdapter` → **`ErpPort`** với `KiotVietMockAdapter` là một hiện thực (`apps/api/src/erp/`). Chọn khách bằng `TENANT=<slug>` hoặc `TENANT_DIR=<path>` cho khách chạy hạ tầng riêng — [tenants/README.md](../../../tenants/README.md). Nghiệm thu đợt đầu: **430 test API cũ xanh nguyên** (+8 test mới cho loader gói khách).
  **Phần còn lại của B1 XONG (12/08/2026)** — 4 commit: `e526ec2` (gói `@netviet/tenant`) → `bf8c561` (dọn chuỗi khách khỏi nhân) → `a5ff251` (branding web) → docs. Thêm: loader tách ra **`packages/tenant`** để app web dùng chung schema đã validate; **`TENANT` bỏ giá trị mặc định** (quên đặt trên stack khách B mà lặng lẽ nạp dữ liệu khách A là sự cố rò rỉ ⇒ thiếu biến thì ném lúc boot); `BOT_NAME` thôi mặc định `'Bot ultty AI orders'` — nguồn là `persona.mentionName`, biến env đổi vai trò thành **đường ghi đè** (`channels/bot-name.ts`); 4 tin mẫu demo chứa SKU khách → `tenants/<slug>/data/demo-messages.json`; **chuỗi thương hiệu web** (`layout.tsx`/`TopBar`/`Composer`/`SettingsShell`) → `tenant.json.branding`, đọc ở Server Component rồi truyền xuống qua `useBranding()`; AdminJS `companyName`, `IS_PUBLIC_KEY`, tên MCP server, credential dev, `DATABASE_URL` mặc định, `ADMIN_EMAIL` → `netviet-*` (kèm `docker-compose.yml` + CI + Dockerfile). Bằng chứng: bản build web chứa `<title>Ultty AI — Trung tâm điều hành</title>` **đến từ gói khách**, không còn trong mã nguồn. Nghiệm thu: shared **69** · tenant **11** · api **433/21 skip** · web **29** · route **8** · typecheck · lint xanh; **đúng một test cũ đổi trạng thái có chủ ý** (`env.test.ts` khẳng định `BOT_NAME` chứa `'Bot'` — chính là thứ vừa bị bỏ khỏi nhân). ⚠️ Đổi tên DB dev/CI `ultty`→`netviet`: production dùng secret nên không ảnh hưởng, **máy local cần `docker compose down -v` một lần**. Chi tiết + bảng "còn phụ thuộc khách" + **phân tích D28 (`PolicyType`) chờ chốt**: [nen-tang-da-khach.md §9 + §9b](../../kien-truc/nen-tang-da-khach.md). **Còn treo:** B2 (`tenants/amico` + CI hai gói) · B3 (bỏ `zalo-ultty` khỏi **23 file / 88 lần** trong deploy + đổi tên `kiotVietCode` + route `/kiotviet`) · B4 (Nhanh.vn/MISA/PDF cho Amico).
- **Chất lượng (05/08/2026, sau đợt 4):** **378** test API pass + 21 skip · **64** shared · **29** web · **4** Playwright E2E `/settings` · **7** contract route · lint · typecheck đều xanh. (Mốc sau đợt 3: 360 API / 3 E2E; mốc đầu ngày 04/08: 312 API / 27 web / 6 route.) Số liệu chi tiết bên dưới là của đợt 03/08.
- **Chất lượng (03/08/2026):** 308 test API (+21 integration/eval skip khi không có DB; bật `RUN_PRISMA_IT=1` trên Postgres thật → **328 xanh**) + 60 shared + 26 web + 2 contract route + **2 Playwright E2E `/settings`** xanh; coverage mục tiêu phần hybrid đạt 93,29% statement/line, 87,32% branch, 86,66% function; Flowise contract thật xanh; eval Flowise **35/35 intent**; lint · typecheck · build xanh; không còn audit high/critical (còn 6 moderate). Field-accuracy vẫn chờ golden B1-B2.
- **Pilot GCP `netviet` — TẮT TOÀN BỘ XÁC THỰC + LUÔN CHẠY (04/08/2026, quyết định người vận hành):** VM được chốt là **môi trường dev/demo**, không dùng PII thật, nên bỏ hết rào đăng nhập cho đỡ vướng khi demo. Đã tắt 4 lớp: Basic Auth `demo`/`netviet` ở Caddy · guard `x-api-key` · kiểm `Origin` chống CSRF cho mutation · đăng nhập AdminJS. Công tắc duy nhất là biến mới **`AUTH_MODE`** (`api-key` mặc định · `none` cho VM này); CORS cũng mở khi `none`. **Flowise vẫn đòi đăng nhập** — Flowise 3.x bắt buộc tài khoản, không có cờ tắt. Luôn chạy: `restart: always` cho 5 service + unit `netviet-stack.service` chạy lúc boot + `health-check.sh` tự khôi phục service chết (log `NETVIET_HEALTH_HEAL`). ⚠️ **Đánh đổi:** VM mở public 80/443 → ai biết URL cũng đọc/sửa được nguồn sự thật và gọi được `/broadcast`. Chỉ hợp lệ khi dùng nhóm/dữ liệu TEST; **trước khi chạy dữ liệu khách thật phải đặt lại `AUTH_MODE=api-key` + bật lại Basic Auth** (D5 auth theo vai vẫn treo). Cách bật lại: [deploy/netviet/README.md](../../../deploy/netviet/README.md).
- **Pilot GCP `netviet`:** HTTPS public; Flowise có đăng nhập riêng. Contract, SSE + 6 vai/1 LLM, restart-persistence, backup/restore và rollback `deepseek → flowise` đều đạt. Soak 24 giờ kết thúc **PASS 01/08** (RAM tối đa 56%, disk 21%, không OOM/restart bất thường). ZCA đã chọn Meta HN (`2508572440887686813`) và Thái Nguyên (`3787434804745256898`); còn xác nhận lại E2E duyệt/gửi sau sửa group ID.

### Cách chạy nhanh

```bash
# Demo offline (không cần DB)
pnpm dev:api && pnpm dev:web

# Bản thật: Postgres + panel chỉnh nguồn sự thật
docker compose up -d postgres
pnpm --filter @netviet/api exec prisma migrate deploy
pnpm --filter @netviet/api exec tsx prisma/seed.ts
PERSISTENCE=prisma ADMIN_UI=on pnpm --filter @netviet/api dev   # → /admin

# MCP tool (agent sửa nguồn sự thật bằng hội thoại)
pnpm --filter @netviet/api mcp
```

---

## 2. Bức tranh lớn: lộ trình 3 giai đoạn (NetViet) + vị trí hiện tại

```mermaid
flowchart LR
    subgraph P0["Chuẩn bị ✅"]
        A1["Scaffold monorepo ✅"]
        A2["PoC Bot + zca ✅"]
        A3["Nguồn sự thật thật ✅"]
        A4["Bake-off parser (100%) ✅"]
    end

    subgraph G1["GĐ1 — Tự xác nhận có kiểm soát (⬅ CODE-COMPLETE, chờ dữ liệu + pháp lý)"]
        B1["Pipeline: intent + trích xuất<br/>+ rules + validation ✅"]
        B2["Đơn hợp lệ ≤ ngưỡng tenant:<br/>gửi → sent → báo Sale nhập ERP ✅"]
        B3["> ngưỡng / thiếu dữ liệu:<br/>Sale can thiệp trước gửi ✅"]
        B4["Giá lẻ + freshness · campaign<br/>· nguồn Drive/settings ✅"]
        B5["Pilot nhóm test, đo KPI ⬜<br/>chờ A6 + D16/D20 + B1-B2"]
    end

    subgraph G2["GĐ2 — Tự động hóa & đa kênh ⬜"]
        C1["ERP/KiotViet + Base API"]
        C2["Zalo OA 1:1 + ZNS"]
        C3["Đối soát ký gửi/công nợ<br/>+ tự động hoàn toàn sau ERP"]
    end

    subgraph G3["GĐ3 — Tối ưu & chủ động ⬜"]
        D1["Dự báo mùa vụ, cảnh báo tồn"]
        D2["Up-sell / nhắc tái đặt"]
    end

    P0 --> G1 --> G2 --> G3
```

Đợt 1-4 của [tinh-nang-dai-han.md](tinh-nang-dai-han.md) (6 tính năng mới) đứng TRÊN nền Đợt 0 và đan vào GĐ2-3 NetViet.

---

## 3. BẢNG TRẠNG THÁI kế hoạch (nơi duy nhất có ✅/⬜)

### 3.1 [nen-tang.md](dot-0-nen-tang.md) — Đợt 0 (việc đang dở, chắc chắn làm)

| Hạng mục (phạm vi chi tiết ở kế hoạch con) | Trạng thái |
|---|---|
| Phase 0-2 — scaffold · PoC · pipeline · rules · console SSE · kênh zca · dữ liệu thật | ✅ XONG |
| Phase 3 — Postgres/Prisma + repo seam + panel `/admin` + MCP tool + seed thật | ✅ XONG |
| Phase 3 còn lại — **lưu MỌI tin vào DB** (`messages`) | ✅ 11/07/2026 — `MessagesRepository` seam memory\|prisma, pipeline lưu TRƯỚC khi xử lý (lỗi lưu không chặn đơn; rerun không lưu lại), chống trùng unique `(platform, externalMessageId)`, nối `orders.messageId`; IT Postgres gated `RUN_PRISMA_IT=1` |
| Phase 3 còn lại — **rules-config động** + sửa nghiệp vụ theo nguồn gốc (VAT-default **D8** · phí COD dạng bảng · xác minh `cong_no_7` **D15** · ship/ngưỡng thành config) | ⬜ chờ D8/D15 + A3 |
| **GĐ1 P1 — policy auto-confirm tenant + biên 50/51 + `sent` không ERP + hàng việc Sale** | ✅ xong TDD 12/08/2026; full suite: shared 69 · tenant 20 · web 34 · API 442 pass/21 skip · deploy routes 10; Playwright `/settings` 4/4; typecheck + lint toàn monorepo xanh. Coverage lát cắt P1: 93,38% statements/lines · 80,39% branch · 81,81% function |
| **GĐ1 P2 — tư vấn lẻ theo field/qualifier tenant + price freshness** | ✅ code xong (audit 12/08, xem §1.1); còn thiếu **dữ liệu** bảng giá T8 (A6) nên hiện 0 giá active |
| **GĐ1 P3 — campaign base có approval/schedule/distribution/retry/audit** | ✅ domain + scheduler + UI đã có và wire; lỗi type của scheduler đã sửa ở Đợt A (`a2091f4`), compile xanh |
| **GĐ1 P4 — Drive content provenance/import/settings** | ✅ schema (8 model) + importer + tab UI đã có; còn thiếu **dữ liệu** vì chưa truy cập được Drive |
| Phase 3 còn lại — **import Excel A4** (đại lý + map nhóm, dùng `read-excel-file` — 🔄 11/07 thay `exceljs`) | 🟡 **mẫu gửi khách ĐÃ soạn 13/07** — `docs/khach-hang/ultty/trao-doi/a4-dai-ly-map-nhom-ultty.xlsx` (3 sheet, dropdown khớp enum `Dealer`/`Group`, kèm 3 đại lý + 2 nhóm thật) sinh từ `tools/excel-template/`; **importer** đọc file khách trả về ⬜ chờ A4 |
| Phase 4 — ERP/KiotViet Excel/API + map SKU↔mã số · Base | ⬜ **sau GĐ1**, không nằm trên đường găng task hiện tại; C1 vẫn cần khi mở phase |
| Phase 5 — auth theo vai (2 cổng KSNB) + ghi `kpi_events` + feedback loop | ⬜ chờ D5 |
| Phase 6 — deploy 1 VM + webhook always-on + sao lưu + **pilot 1-2 nhóm → go/no-go** | 🟡 hạ tầng `netviet` đã public qua HTTPS ở chế độ dev/demo không auth; Flowise/DeepSeek/Postgres thật, KiotViet và kênh Zalo mock; smoke · persistence · backup/restore · monitoring · rollback · soak 24 giờ đạt. Console `/settings` đã deploy; **CI/CD đã có** (`.github/workflows/ci.yml` gồm Prisma IT + Playwright + audit + `images` + `tenant-packs` tự enumerate toàn bộ thư mục tenant; CD keyless qua Workload Identity Federation). **Job `verify` chết timeout 20 phút liên tục từ 15/08 tới 17/08** — gói khách giả trong `apps/web/tenant-runtime.contract.mjs` thiếu 4 trường bắt buộc mà `tenantConfigSchema` thêm sau đó, nên `next start` không phục vụ nổi request; tệ hơn, `next start` hỏng vẫn không bị dọn nên `node --test` treo đến hết timeout thay vì báo lỗi sau 2 phút. Đã sửa 17/08 (fixture + dọn tiến trình con + giữ stderr): 20 phút → 3,9 giây. 2 repository variable đã đặt; environment `production` yêu cầu người duyệt và chỉ cho deploy từ `main`. **CD đa khách hoàn tất 17/08**: một bản logic duy nhất ở `reusable-deploy-tenant.yml`, gọi từ một cửa `deploy-tenant.yml` (chạy tay, chọn khách + môi trường `dev`/`production`). Đường tự động theo push `deploy.yml` đã xoá — nó chưa deploy thành công lần nào và một run chờ duyệt còn chiếm làn concurrency chặn cả deploy tay. Trang marketing đi đường riêng `deploy-marketing.yml` → Cloud Run `nexagnet-marketing`, deploy theo git SHA. Repo đổi tên `ultty-ai-orders` → **`nexagnet-platform`** (kèm cập nhật 2 chốt WIF `assertion.repository`/`principalSet`, nếu không CD chết ở bước `auth`). Việc bật kênh Zalo thật được tách khỏi nghiệm thu hạ tầng D18c |
| **GĐ1 G1-01…G1-14 — đợt A→G lập lại từ as-built** | ✅ XONG 12/08/2026 (8 commit, xem §1.0). GĐ1 **code-complete**; phần chưa chạy được là dữ liệu khách + văn bản pháp lý + công tắc vận hành → [van-hanh/checklist-go-live.md](../van-hanh/checklist-go-live.md) |
| Việc "thật hơn" treo — đọc 6 quy trình gốc chưa phản ánh · nghiệp vụ vận chuyển 2.3 · PWA 5 tab | ⬜ sau GĐ1 |

### 3.2 [tinh-nang-dai-han.md](tinh-nang-dai-han.md) — Đợt 1-4 (6 tính năng mới, định hướng)

| Đợt | Gồm | Trạng thái | Cổng vào (chi tiết ở kế hoạch con) |
|---|---|---|---|
| 1 — Giá trị nhanh | F6a gọi nhân viên → F1 sửa đơn NL → F3 dashboard v1 | ⬜ chưa bắt đầu | Đợt 0 xong phần nền + D10 · D11 · D14 |
| 2 — Dòng tiền | F2 QR + payments → F5 v1 nhắc công nợ | ⬜ chưa bắt đầu | D9 · D13 |
| 3 — Năng lực AI | F4 ảnh viết tay (PoC trước) · F6b chống gian lận v1 | ⬜ chưa bắt đầu | D12 · D14 |
| 4 — Tối ưu (GĐ3) | F5 v2 đối soát · F6b v2 baseline · dự báo/up-sell | ⬜ chưa bắt đầu | vài tháng dữ liệu thật sau pilot |

Ghi chú trạng thái đã chốt cho kế hoạch dài hạn: **lộ trình Đợt 1→4 đã được duyệt** (10/07/2026) · **thư viện/dịch vụ đã chốt qua search-first** (danh sách trong kế hoạch con §7) · ⚠️ deadline kỹ thuật: **DeepSeek khai tử model cũ 24/07/2026** — demo đã chuyển `deepseek-v4-flash` ✅.

### 3.3 Vận tải — quản trị tài khoản, phân quyền, địa điểm vận hành

| Hạng mục (hợp đồng chi tiết ở tài liệu kiến trúc) | Trạng thái |
|---|---|
| **#395 — Giám đốc quản trị tài khoản + phân quyền (vai khởi điểm + quyền riêng ALLOW/DENY) + địa điểm vận hành trên bản đồ**: API `/settings/users*` + mật khẩu tạm; cưỡng chế quyền vận tải theo từng tài khoản + nối tài khoản với hồ sơ lái xe; "Địa điểm vận hành" = sổ hàng rào, một bãi xe đang dùng làm bãi của lập kế hoạch; màn web nhóm QUẢN TRỊ. Hợp đồng: [api-http.md](../../kien-truc/api-http.md) §3.4 + §3.11 · [transport-domain-contract.md](../../kien-truc/transport-domain-contract.md) §11.5–11.6 · [transport-geospatial.md](../../kien-truc/transport-geospatial.md) §7.2 · [transport-run-planning.md](../../kien-truc/transport-run-planning.md) §2.2 | ✅ **code trên nhánh** `claude/admin-account-permissions-fb485a` (S0 nền + S1–S4, 25/09/2026); ⬜ **chưa merge, chưa deploy, chưa có bằng chứng runtime**. Khi deploy: hai di trú chỉ thêm `20260925100000_auth_user_access` + `20260925100100_transport_place_admin` (di trú thứ hai dừng có chủ đích nếu DB đã có hơn một hàng rào `DEPOT` đang bật hoặc mã bãi trùng); gói `transport-preview` bỏ `transportPlanning.depots` nên bãi xe của bản xem trước là hàng rào `DEPOT-HN` trong DB |

---

## 4. DỮ LIỆU CÒN THIẾU (chặn gì — hỏi chị Nguyễn Thu Phương)

> Nguồn sự thật đã **động** → thiếu A2/A3/A4 **không chặn BUILD** (nhập dần qua `/admin`/MCP) nhưng vẫn chặn **chạy thật đúng số**. B1-B2 là **cổng go-live**, không thay thế được.
> Trạng thái: ⬜ chưa có · 🟡 đã hỏi, đang chờ · ✅ đã nhận & kiểm tra.

**Ưu tiên đỏ:** 🔴 A3 (rules hết "tạm tính") · 🔴 A4 (áp đúng đại lý) · 🔴 A2 (deal riêng) · 🔴 A6 (giá T8) · 🔴 A7 (nguồn công thức khuyến mãi) · 🟠 B1-B2 (cổng go-live). C1 là phase sau GĐ1.

> 📋 **Bản hỏi Sale (không kỹ thuật):** [docs/khach-hang/ultty/trao-doi/checklist-hoi-sale.md](../../khach-hang/ultty/trao-doi/checklist-hoi-sale.md)
> — cùng nội dung A/B/D dưới đây nhưng viết lại thành câu hỏi nghiệp vụ cho chị Phương trả lời trực
> tiếp. Bảng ở đây là bản kỹ thuật; đừng gửi bảng này cho khách.

### A0 — 🔴 PHÁT HIỆN TỪ ẢNH CHỤP TIN NHẮN THẬT (12/08/2026) — cần khách xác nhận

> Nguồn: 6 ảnh chụp nhóm Zalo thật khách gửi (`nguon-goc/ho-so-khao-sat/gd1/anh_chup_tin_nhan_khach/`,
> gitignore). Đây là **bằng chứng vận hành thật**, mạnh hơn tài liệu — nhưng **mâu thuẫn với bảng
> giá T7**, nên không được tự sửa nguồn sự thật theo nó. Phải hỏi chị Phương.

| # | Quan sát trong ảnh | Mâu thuẫn với | Cần chốt |
|---|---|---|---|
| A0.1 | Ghế **FELIX bán 1.150.000** cho SL 5 — xuất hiện ở **2 đại lý khác nhau** (KNA 24/07, Vua Nhà Bếp Đức 25/07), cùng một mức | Bảng giá T7 ghi `wholesale = 1.250.000` | Đây là **deal riêng theo SL** hay **giá CTV thật đã đổi**? → quyết định A2 vs sửa bảng giá |
| A0.2 | **ELNI bán 1.900.000** (`HN_25.7_BHHP / 1 x Elni ---1900k`) | Bảng giá T7 ghi `wholesale = 2.150.000` | Cùng câu hỏi như A0.1 |
| A0.3 | **"Tặng 1 Elna"** khi mua 1 ELNI | Chưa có promotion engine (A7) | Khuyến mãi này còn hiệu lực không? Điều kiện gì? → đây là **nguồn thật đầu tiên** cho A7 |
| A0.4 | Đại lý hỏi *"Đơn này nhà mình có xuất hoá đơn ko c ạ"* → Sale trả lời **"có e nhé"** | D8 (VAT mặc định) đang treo | VAT xuất **theo yêu cầu từng đơn**, không mặc định? → gợi ý câu trả lời cho D8 |

**Hệ quả nếu không chốt:** hệ thống sẽ báo giá theo bảng T7 (1.250.000/2.150.000) trong khi Sale
thực tế chốt 1.150.000/1.900.000 ⇒ **mọi đơn đều lệch tiền**. Golden eval sẽ đỏ đúng ở điểm này —
đó là hành vi đúng, không phải lỗi harness.

**Ghi nhận thêm — 3 nhóm đại lý trong ảnh chưa có trong nguồn sự thật:** `BHHP` (C1 Bách Hóa),
`KNA`, `Vua Nhà Bếp Đức`. Cần bổ sung vào A4 trước khi pilot các nhóm này.

**Format xác nhận thật của Sale** (khớp TH1 trong CLAUDE.md, dùng làm mẫu outbound):

```text
E gửi xác nhận đơn ạ
HN_24.07_KNA
5 ghế trẻ em ô tô EUS FELIX x 1150
Tổng thanh toán: 5.750.000
```

### A — Nguồn sự thật

| # | Cần gì | Chi tiết hỏi | Chặn | TT |
|---|---|---|---|---|
| A1 | Danh mục SKU | Có 19 SKU seed T7; Drive Sheet có 39 dòng hàng hóa/phụ kiện. Cần mapping/deduplicate trước khi gọi là đầy đủ | Nguồn sự thật sản phẩm | 🟡 |
| A2 | Deal riêng theo đại lý | Ai có deal riêng, SKU nào, giá nào (cơ chế `DealerPriceOverride` sẵn, đang rỗng) | Giá đúng cho đại lý SL lớn | ⬜ |
| A3 | **Biểu phí COD + biểu cước ship + ngưỡng công nợ** | Bảng phí thu hộ COD ("biểu mẫu riêng"); mức cước Grab nội thành/Viettel tỉnh; định nghĩa "nội thành"; ngưỡng SL áp công nợ 30 vs 45 | Rules hết **tạm tính** (COD 20k, ship 30k/40k đang là giả định) | ⬜ |
| A4 | Danh sách đại lý/CTV + map nhóm Zalo | Tên, cấp, chính sách mặc định, SĐT + nhóm Zalo nào thuộc đại lý nào (từ tag Zalo đang dùng); ưu tiên 10-20 nhóm pilot; gửi file mẫu cho Sale điền dần | Áp đúng đại lý/chính sách (cơ chế nhập sẵn: `/admin` + hộp thư nhóm chưa map + import `read-excel-file`) | ⬜ |
| A5 | Inventory Drive/EUS/FAQ/media/catalog | Đã duyệt 122 thư mục/825 file; lưu manifest/provenance + mapping/readiness trong DB, không copy binary vào source | Schema/import/settings P4 | ✅ inventory 12/08; import ⬜ |
| A6 | **Bảng giá tháng 08/2026** | Drive chỉ có “Thông báo giá tháng 7.2026”; không được fallback hoặc seed thành T8 | Tư vấn/chốt giá hiện hành | ⬜ thiếu |
| A7 | **Nguồn xác nhận công thức khuyến mãi** | Cách tính 30+1/10+1, tích lũy, SKU tặng, ảnh hưởng tổng; không có nguồn thì rule inactive | Rules khuyến mãi | ⬜ thiếu |
| A8 | Dữ liệu campaign thực tế | Nhóm đích, nội dung, lịch/ngày sinh/lịch âm, cửa sổ mong muốn. Không chặn xây engine generic | Nạp campaign thật | ⬜ |

### B — Dữ liệu kiểm thử AI (CỔNG GO-LIVE)

| # | Cần gì | Chi tiết | TT |
|---|---|---|---|
| B1 | **20-30 tin đặt hàng THẬT** | Nguyên văn (giữ viết tắt/không dấu), đủ dạng TH1/TH2/sửa đổi/nhiều SP, kèm nhóm/đại lý | ⬜ |
| B2 | Đơn ĐÚNG tương ứng (golden) | Đơn cuối lên KiotViet cho từng tin B1 — đo field-accuracy + bake-off model | ⬜ |
| B3 | 5-10 ảnh chụp bảng đặt hàng | Cho <20% đơn ảnh (sau này là bộ eval F4) | ⬜ |
| B4 | Từ điển viết tắt bổ sung | Đã có 24 mục từ `Viết tắt_.docx`; nhờ Sale bổ sung tên gọi tắt SP/đại lý | 🟡 |
| B5 | Mẫu format xác nhận Sale đang gửi | 2-3 tin xác nhận TH1 + TH2 thật (đúng giọng hiện tại) | ⬜ |

### C — Truy cập hệ thống (hỏi sớm vì chờ lâu)

| # | Cần gì | Chi tiết | TT |
|---|---|---|---|
| C1 | KiotViet — gói & API | **Sau GĐ1.** Gói nào, có mục Thiết lập → API không; xin file Excel export/mẫu import khi mở Phase ERP | ⬜ tương lai |
| C2 | Base — phạm vi dùng & API | App nào (Workflow/Wework), đầu mối kỹ thuật, format đơn nhập Base (ảnh màn hình) | ⬜ |
| C3 | Hóa đơn VAT | Phần mềm nào, thông tin chuẩn bị khi xuất (STK công ty/cá nhân) | ⬜ |

### D — Quyết định cần chốt (bảng thống nhất — đánh số CHUẨN từ 11/07/2026)

> D1-D7 giữ nguyên số cũ của checklist; D9-D14 giữ nguyên số của kế hoạch dài hạn; 2 câu hỏi rules (trước tạm gọi "D6/D7 mới" — bị trùng số) đổi thành **D8/D15**.

| # | Quyết định | Chặn gì | TT |
|---|---|---|---|
| D1 | Nhóm Zalo test + add bot PoC | — | ✅ 07/07 |
| D2 | Đại lý có chấp nhận **tag bot** khi đặt hàng? | Bật Bot mode (kênh phụ) | 🟡 |
| D3 | Design PWA là spec hay tham khảo UX? Console PC hay PWA mobile 5 tab? | Hướng app Sale sau demo | ⬜ |
| D4 | AI có được **tự gửi/trả lời** trong nhóm? | Đã có văn bản đồng ý; GĐ1 auto-confirm theo ngưỡng tenant + fail-safe | ✅ 12/08/2026 |
| D5 | Danh sách người dùng app (tên + SĐT + vai: BPKD/KSNB/kế toán/quản lý) | Phase 5 auth | ⬜ |
| D6 | Mẫu thông báo/nhãn hệ thống tự động | Không phải cổng xin quyền auto-send; câu nhãn lấy từ persona/config tenant | 🟡 nội dung vận hành |
| D7 | Phạm vi GĐ1 | Phạm vi đã chốt; KPI/mốc pilot tách thành việc nghiệm thu còn mở | ✅ phạm vi 12/08/2026 |
| **D8** | **VAT-default** theo chính sách/đại lý (PO công nợ B2B ghi "giá đã gồm GTGT") hay giữ "chỉ VAT khi khách ghi rõ"? | Increment rules-config (Đợt 0) | ⬜ |
| D9 | STK nhận tiền + chọn SePay/Open API bank/bán tự động + bổ sung hợp đồng xử lý dữ liệu giao dịch | F2 (Đợt 2) | ⬜ |
| D10 | Đơn trạng thái nào còn được sửa/hủy qua AI; đơn đã giao đi quy trình hoàn trả nào | F1 (Đợt 1) | ⬜ |
| D11 | Danh sách chỉ số dashboard (đề xuất: 4 KPI + doanh thu đại lý/chi nhánh + phễu đơn) | F3 (Đợt 1) | ⬜ |
| D12 | Cấp Claude API credit + 20-30 ảnh đơn viết tay thật kèm đáp án | F4 (Đợt 3) | ⬜ |
| D13 | Ngưỡng công nợ chính thức (A3) + cách xác định "ngày nhận hàng" + số dư công nợ đầu kỳ từ Excel BPKD | F5 (Đợt 2) | ⬜ |
| D14 | Danh sách Sale trực + kênh nhận cảnh báo + case đơn ảo/gian lận thật + ngưỡng | F6 (Đợt 1+3) | ⬜ |
| **D15** | **"Công nợ 7 ngày"** là chính sách riêng hay điều khoản TT-7-ngày của ký gửi? | Increment rules-config (Đợt 0) | ⬜ |
| **D16** | **Văn bản chấp nhận rủi ro ToS** cho kênh zca (tài khoản phụ) | Chạy thật kênh zca | ⬜ |
| **D17** | ~~DeepSeek: bổ sung vào thỏa thuận HAY đổi `PARSER_MODE=claude`?~~ → **CHỈ CÒN 1 ĐƯỜNG: đổi sang Claude.** Khảo sát 28/07: DeepSeek lưu dữ liệu tại Trung Quốc và **không có DPA để ký**; Privacy Policy loại trừ chính luồng open-platform API đang dùng. Phương án "bổ sung vào thỏa thuận" **bất khả thi** | Chạy thật với dữ liệu khách | 🟡 đã rõ hướng |
| **D18a** | **Quyết định + spike Flowise thay Dify.** NestJS giữ vai trò điều phối; Flowise chỉ gọi LLM để phân loại/trích xuất. Lý do giấy phép ghi chính xác: core Flowise ngoài thư mục enterprise là Apache 2.0; một số phần enterprise dùng điều khoản thương mại, không phải toàn bộ Flowise là Apache | Hướng kỹ thuật phần AI | ✅ 28/07, rà lại 31/07 |
| **D18b** | **Tích hợp Flowise runtime:** `FlowiseParser`, Agentflow V2 versioned, fail-fast env, contract auth/schema, rollback `PARSER_MODE=deepseek`; eval intent 35/35 | Nghiệm thu lớp parser | 🟡 code + contract + intent eval đã đạt 31/07; chưa được đánh ✅ vì chưa có golden B1-B2 để so field-accuracy |
| **D18c** | **Pilot trên GCP:** project `netviet-host-968934832433`, VM `netviet`, stack riêng `/srv/netviet/apps/zalo-ultty`; SSH IAP-only, web/operator public HTTPS dev/demo không auth, Flowise có đăng nhập riêng, backup/monitoring/rollback/soak | Nghiệm thu hạ tầng pilot | ✅ 08/08 — soak mới nhất `soak-20260804T110005Z.tsv`: 1.401 mẫu, failures=0, RAM tối đa 75%, disk tối đa 48%; 5 container healthy, restart=0, OOM=false; endpoint public 200. Runtime đã khóa `CHANNEL_MODE=mock` |
| **D19** | **Mô hình đổi: 5 dự án NỘI BỘ → 5 KHÁCH NGOÀI TRẢ TIỀN.** Kéo theo: DPA từng khách, hồ sơ chuyển dữ liệu xuyên biên giới, cách ly dữ liệu bằng kiến trúc, SLA, on-call, offboarding | Mọi giả định hạ tầng + pháp lý | ✅ 28/07 |
| **D20** | **Ai đứng tên 5 tài khoản Zalo phụ** — bạn hay khách? Nếu bạn đứng tên thì **bạn** là bên vi phạm ToS Zalo và D16 mất phần lớn ý nghĩa | Chạy thật kênh zca | ⬜ |
| **D21** | **ĐO số TIN/ngày thật** trên nhóm khách. Sizing + báo giá hiện dựa trên "10-20 đơn/ngày" nhưng zca đọc **mọi tin** của 200-350 nhóm ⇒ sai 2-3 bậc độ lớn về RAM/disk/hóa đơn LLM | Chốt cỡ máy + báo giá khách | ⬜ |
| **D22** | **Hồ sơ ĐGTĐXLDL + ĐGTĐCDL (Mẫu số 09)** theo Luật 91/2025 + NĐ 356/2025 — 2 điểm chuyển (Singapore + LLM), nộp trong 60 ngày, chế tài tới **5% doanh thu năm liền trước** | Ký hợp đồng khách đầu tiên | ⬜ |
| **D23** | **Đơn vị kinh tế**: giá bán/khách, biên lợi nhuận, điểm hòa vốn. Hiện chỉ biết hạ tầng ~$44/khách/tháng; chưa có chi phí LLM, nhân sự, onboarding (hàng chục giờ công/khách) | Chốt mô hình kinh doanh | ⬜ |
| **D24** | **Ai trực + SLA** khi có 5 khách trả tiền (bus factor hiện = 1). Lưu ý: SLA 99.9% ≈ 43 phút/tháng — kiến trúc 1 droplet/1 vùng **không cam kết nổi** | Ký hợp đồng khách đầu tiên | ⬜ |
| **D25** | **Hai Bot cùng một nhóm:** native @mention Bot Zalo → Bot Platform xử lý/trả lời; không tag → tài khoản zca xử lý/trả lời. Chỉ metadata mention native được tính; nếu không lấy được Bot UID thì zca fail-closed | Kiến trúc kênh hybrid | ✅ user duyệt + code 03/08, **đã deploy pilot 03/08**; còn E2E live trên nhóm test |
| **D26** | Mô hình silo: mỗi khách một stack/DB, không thêm `tenantId` khi chưa dùng DB chung | Base đa khách | ✅ bất biến kiến trúc hiện hành; refactor 20/08 giữ nguyên |
| **D27** | Nơi đặt hạ tầng khách sau | Hợp đồng/hồ sơ dữ liệu | ⬜ |
| **D28** | `tenant.json.policies.salesOrder.supportedDealerPolicies` là tập con của enum chung; chưa dựng bảng Policy | Schema tenant | ✅ migrate contract v2 ngày 20/08/2026 |
| **D29** | Có dựng Flowise cho khách mới hay gọi parser trực tiếp | Cỡ máy/bề mặt tấn công | ⬜ |
| **D30** | Tên thương hiệu nền tảng | Package/UI chung | ⬜ |
| **D31** | Ai giữ secret khi khách tự host | Deploy/hợp đồng | ⬜ |

### E — Hạ tầng production (chặn chạy 24/7)

| # | Cần gì | TT |
|---|---|---|
| E1 | Máy chủ 24/7 + domain + HTTPS (webhook always-on) — ai cung cấp/trả tiền | 🟡 VM NetViet đã có IP tĩnh + HTTPS public qua `sslip.io`, Basic Auth tách demo/operator và đăng nhập Flowise; official Bot hiện còn dùng long-poll, cần webhook endpoint/secret + kiểm chứng always-on trước production; domain thương hiệu/chi phí dài hạn chưa chốt |
| E2 | Postgres production + lịch sao lưu (managed hay tự host) | 🟡 pilot self-host Postgres, backup GCS 7 ngày + 4 tuần và restore check hai DB đã đạt 31/07; mô hình production vẫn chưa chốt |
| E3 | Ai vận hành hằng ngày sau bàn giao (NetViet managed?) + SLA | ⬜ |
| E4 | Kênh nhận cảnh báo sự cố (bot/kênh chết → báo ai, qua đâu) | ⬜ |

### F — Tài khoản & chi phí

| # | Cần gì | TT |
|---|---|---|
| F1 | Chủ sở hữu bot Zalo + tài khoản Zalo phụ (zca) production — ai giữ token/SIM | 🟡 secret `zalo-ultty-zalo-bot-token` đã tạo 03/08 (nạp từ `.env` qua `deploy.ps1`) nên hybrid deploy được; **câu hỏi quản trị "ai giữ token/SIM" vẫn chưa chốt** |
| F2 | Ai add bot/tài khoản phụ vào ~200 nhóm, theo đợt nào (khớp A4) | ⬜ |
| F3 | Gói Zalo Bot Premium nếu cần (giới hạn nhóm/rate limit — hỏi Zalo) | ⬜ |
| F4 | Tài khoản + ngân sách LLM API (ai trả, hạn mức/tháng) | ⬜ |

### G — AI/LLM production

| # | Cần gì | TT |
|---|---|---|
| G1 | Chốt model qua bake-off trên B1-B2 (demo tạm DeepSeek 35/35) | ⬜ |
| G2 | Quyền gửi dữ liệu cá nhân (SĐT/địa chỉ đơn TH2) sang LLM — tối thiểu hóa. ⚠️ **Cơ sở pháp lý đã đổi**: NĐ 13/2023 **hết hiệu lực**, nay là **Luật 91/2025/QH15 + NĐ 356/2025** (từ 01/01/2026) | ⬜ |

### H — Chặn kỹ thuật trước khi bán dịch vụ (phát hiện 28/07/2026, đã xác minh trong code)

| # | Vấn đề | Bằng chứng | TT |
|---|---|---|---|
| **H1** | Mất tin khi LLM lỗi | `MessageGuard` + `processWithRetry`: lưu tin thô trước xử lý, tối đa 3 lượt, chỉ đánh dấu xong khi thành công | ✅ 28/07 |
| **H2** | API trước đây không xác thực | `ApiKeyGuard` toàn cục; production bắt buộc `API_KEY`; gateway nội bộ tự gắn header, chỉ bind loopback | ✅ 28/07 |
| **H3** | Cách ly nhiều khách | v1 dùng **mỗi dự án một Compose project, DB/user/secret/volume/network riêng**; vì không chia DB nên chưa cần `tenantId`. Nếu chuyển sang DB dùng chung phải mở lại quyết định này | ✅ cho kiến trúc pilot 31/07 |
| **H4** | Đóng gói/vận hành production | CI lint/typecheck/test/build, image theo git SHA+digest, Compose, Secret Manager, backup/restore, Ops Agent, health/restart/RAM/disk alert đã có. Heartbeat zca vẫn cần trước pilot nhóm thật | 🟡 pilot mock đạt phạm vi; zca thật còn treo |

### Gợi ý cách hỏi hiệu quả

1. Gửi khách **đúng 1 email/tin Zalo** kèm bảng A+B (đính file Excel mẫu cho A4, B1-B2 để Sale điền thẳng) — tránh hỏi rải rác.
2. Đề xuất **1 buổi call 30-45 phút với chị Phương** đi qua A3 (chính sách) + B4 (viết tắt) — hỏi miệng nhanh hơn chờ điền form.
3. B1-B2: hướng dẫn Sale mở 10 nhóm gần nhất có đơn → copy tin + chụp đơn KiotViet tương ứng — ~1 giờ đủ 20-30 cặp.
4. Nhấn mạnh: **A + B là điều kiện bật AI thật** ("chuẩn hóa nguồn sự thật trước khi bật AI" — NetViet §1).

---

## 5. Việc nội bộ đang treo (không phải quyết định của khách)

| Việc | Ghi chú |
|---|---|
| Đưa nhánh đã duyệt vào `main` | Chỉ làm sau khi pilot hạ tầng/soak đạt; không còn nhánh console riêng cần merge |
| KiotViet: làm `KiotVietExcelAdapter` ngay hay chờ xác nhận API (C1) | Khảo sát ghi "chưa có API" |
| Regen 3 PDF lãnh đạo (`docs/khach-hang/ultty/ban-giao/`) theo bộ tài liệu mới 11/07 | Cần mạng (mermaid CDN); lệnh trong `docs/khach-hang/ultty/ban-giao/nguon-html/README.md` |
| ~~**Việc kế tiếp đề xuất #1 (11/07):** soạn **mẫu file Excel A4** gửi khách điền~~ | ✅ **13/07/2026** — `docs/khach-hang/ultty/trao-doi/a4-dai-ly-map-nhom-ultty.xlsx` (generator `tools/excel-template/generate_a4_template.py` + README bảng map cột→field). **Gửi chị Phương điền** rồi build importer đọc lại (cổng A4) |
| **Việc kế tiếp đề xuất #2 (11/07):** ghi **`kpi_events`** (message_received · order_created · approved/rejected · sửa field) | Phase 5 phần KHÔNG cần dữ liệu khách; model có sẵn chưa ghi — nền cho dashboard F3 ([nen-tang.md §3](dot-0-nen-tang.md)) |
| Worktree cũ `.claude/worktrees/cool-maxwell-2f02b3/` | Được loại khỏi phạm vi lint; không xóa dữ liệu người dùng |

## 6. Chuyển đổi Dify → Flowise và pilot GCP (28-31/07/2026)

**Mốc nền trước chuyển đổi:**

| Commit | Nội dung |
|---|---|
| `6a69b27` | **H1 mất tin nhắn** — `MessageGuard` + `processWithRetry` dùng chung cho `ZcaListener`/`BotPoller`: chỉ đánh dấu khi pipeline **thành công**, thử lại 2 lần, hết lượt thì log ERROR kèm id. **H2 xác thực** — `ApiKeyGuard` toàn cục + `@Public` cho `/health`; `API_KEY` trống = guard mở (demo/CI/HF nguyên vẹn), `NODE_ENV=production` **bắt buộc** có key nếu không fail fast. Test 148 → 166 (api), 33 → 37 (shared) |
| `3cfd364` | Căn cứ pháp lý: NĐ 13/2023 hết hiệu lực → **Luật 91/2025/QH15 + NĐ 356/2025** (7 chỗ / 5 file) |
| `a2a8c3c` | Sửa cùng căn cứ trong nguồn PDF bàn giao lãnh đạo |

**Mốc triển khai Flowise/GCP:**

| Commit | Nội dung |
|---|---|
| `6f62307` | Tích hợp `FlowiseParser`, workflow versioned, test/contract/eval, stack private GCP, backup/restore/health/soak và tài liệu vận hành |
| `8725b52` | Image runtime đã triển khai sau khi hoàn thiện reconcile database, bootstrap Flowise và readiness gate |
| `1f384f1` | Monitoring idempotent qua API, gồm log metric, email channel và ba alert policy |
| `8d2d5fd` | Runtime public: `CHANNEL_MODE=zca`, trang đăng nhập QR + allowlist nhóm, Caddy HTTPS/auth và smoke pre-login an toàn |

**Spike cũ:** VM trong project `ultty-flowise-spike-2607` đã xóa; project giữ 0 VM/đĩa. Số đo Flowise 3.1.2 lúc rảnh là 558 MB; đây chỉ là dữ liệu lịch sử sizing, không phải bản pilot.

### D18a — quyết định + spike

- Bỏ hướng Flowise gọi ngược `/internal/*`. NestJS vẫn là orchestrator và nguồn sự thật.
- Luồng chính thức: `Zalo/Mock → lưu tin thô → FlowiseParser → Agentflow V2 → parseResultSchema → rules TypeScript → SSE/Sale duyệt`.
- Flowise không được tính giá/VAT/ship/COD/chính sách, ghi DB, gọi MCP/tool hay tự gửi Zalo.
- Giấy phép: core ngoài `enterprise/` là Apache 2.0; một số phần enterprise chịu giấy phép thương mại theo [LICENSE chính thức](https://github.com/FlowiseAI/Flowise/blob/main/LICENSE.md). Không mô tả toàn bộ Flowise là Apache 2.0.

### D18b — runtime đã cài đặt, còn cổng nghiệm thu dữ liệu

- `PARSER_MODE=flowise` fail-fast với `FLOWISE_BASE_URL`, `FLOWISE_FLOW_ID`, `FLOWISE_API_KEY`, `FLOWISE_TIMEOUT_MS`.
- `FlowiseParser` chỉ nhận `response.json`, validate lại bằng schema dùng chung; timeout/401/404/429/5xx/schema sai đều ném lỗi để ingest retry tối đa 3 lượt.
- Workflow `zalo-order-parser-v1` là artifact đã bỏ credential: Start form → một LLM structured output → kết thúc; không memory/tool/code/MCP/HTTP callback.
- Flowise khóa bản [3.1.4](https://github.com/FlowiseAI/Flowise/releases/tag/flowise%403.1.4) bằng image digest. Image dẫn xuất có patch source-guarded để gửi `thinking:{type:"disabled"}` cho DeepSeek V4 và expose structured output Agentflow tại `response.json`.
- Contract thật đạt: import idempotent, prediction key chặn request thiếu/sai key, output qua `parseResultSchema`, đúng một LLM call.
- Eval Flowise trên bộ hiện có: **35/35 intent = 100%**, ngang baseline DeepSeek trực tiếp. Bộ hiện có chưa có golden field; vì vậy D18b chưa được đánh ✅ trước B1-B2.

### D18c — pilot `netviet`

- Project `netviet-host-968934832433` (`NetViet Host`), VM đúng tên `netviet`, `asia-southeast1-b`, `e2-standard-2`, Ubuntu 24.04, đĩa balanced 80 GB.
- SSH vẫn chỉ qua IAP. Caddy public duy nhất cổng 80/443: demo/operator đang ở chế độ dev/demo không auth; Flowise dùng đăng nhập riêng. API thô, PostgreSQL, `127.0.0.1:8080` và Flowise thô `127.0.0.1:3002` không public. Chỉ giữ cấu hình này khi `CHANNEL_MODE=mock` và không có PII thật.
- Stack Zalo tách riêng ở `/srv/netviet/apps/zalo-ultty`, Compose project `zalo-ultty`; DB user/password/volume/network riêng cho Zalo và Flowise.
- Runtime app từ commit `8d2d5fd`, digest `sha256:2d0ea92b…`; Flowise dẫn xuất digest `sha256:8e03db16…`. Image được đẩy Artifact Registry và deploy bằng digest; secret ở Secret Manager.
- Contract Flowise và smoke pre-login đạt; SSE có đủ 6 vai/đúng 1 LLM call, draft còn nguyên sau restart API. Operator đã đăng nhập và chọn đúng hai nhóm test; bản sửa dùng group ID cấu hình đã deploy, còn cần xác nhận lại thao tác duyệt/gửi thành công.
- Backup hai DB đã tải lên GCS và restore check độc lập đạt. Cloud Ops Agent, health/backup timer, log metric, email channel và alert health/restart/RAM/disk đều active.
- Diễn tập rollback sang image trước + `PARSER_MODE=deepseek` đạt E2E; sau đó khôi phục digest hiện tại + `flowise` và E2E lại đạt.
- Soak gần nhất kết thúc **PASS 05/08/2026**: báo cáo GCS `soak/soak-20260804T110005Z.tsv` có 1.401 mẫu, `failures=0`, RAM tối đa 75%, disk tối đa 48%. `netviet-soak.service` có `Result=success`; tại lần kiểm tra 08/08, cả 5 container healthy, restart=0, OOM=false, RAM hiện dùng 20%, disk 49%, các endpoint demo/operator/Flowise đều HTTP 200.
- Pilot hiện chỉ dùng dữ liệu TEST với `CHANNEL_MODE=mock`, `PARSER_MODE=flowise`, DeepSeek và `AUTO_SEND=off`. Đây là **kill switch của môi trường pilot**, không phủ định policy GĐ1 production đã chốt. Bot Platform/zca đều bị vô hiệu hóa; không dùng PII thật.

**Cổng còn lại ngoài D18c:** nhận B1-B2 để đo field-accuracy cho D18b; D21 vẫn cần trước sizing 200-350 nhóm thật. Việc bật lại Bot/zca là quyết định vận hành riêng, không nằm trong nghiệm thu hạ tầng D18c.

---

## 7. Bàn giao phiên — môi trường Ultty GD1-test (21/08/2026)

### 7.1 Vì sao phải tách stack

Trước phiên này, `ultty/dev` và `ultty/production` là **CÙNG MỘT STACK** dưới hai cổng duyệt: mọi tên
hạ tầng (thư mục · compose project ⇒ **tên volume** · tiền tố secret · mạng · alias edge · hostname ·
unit systemd) đều suy ra từ **tenant slug** một mình. Deploy một nhãn `gd1-test` sẽ **ghi đè thẳng
lên stack DEV đang chạy**.

Nguồn danh tính nay là **STACK SLUG = tenant + môi trường** (`deploy/netviet/stack-identity.mjs`).
Bất biến 3 (ci-cd.md) **giữ nguyên chứ không nới**: vẫn MỘT giá trị quyết định đồng thời tất cả tên
đó. `dev`/`production`/`legacy` suy ra lại đúng tenant slug ⇒ **không stack nào phải di chuyển**.

**Gói khách KHÔNG fork** — vẫn một `tenants/ultty/` cho cả hai stack.

### 7.1b KẾT QUẢ — đã deploy thật

Deploy thành công lần thứ **4**: run
[`32408247990`](https://github.com/phungtienviet14-sketch/nexagnet-platform/actions/runs/32408247990),
git SHA `dd89e05`, 14 phút. Ba lần trước đỏ vì 3 lỗi khác nhau (§7.3 mục 6, 7 và 8) — **không lần
nào chạm tới máy chủ**, vì cổng fail-fast nằm trước bước build và trước mọi thay đổi trên VM.

| | |
|---|---|
| Stack | `ultty-gd1-test` — 4 container **healthy** |
| Cách ly | `getent hosts flowise` trả **đúng 1** địa chỉ; `crossTenantReachable=false` |
| DEV | **không bị đụng** — PostgreSQL của nó `Up 7 days` xuyên suốt cả 4 lần deploy |
| Smoke | `SMOKE_ORDER_STATUS=pending_review` — đúng với `AUTO_SEND=off`, không tin nào gửi ra |
| Verifier | 7 thành phần **REAL**; tổng thể **FAIL** vì chưa có tin Zalo thật — đúng ở thời điểm này |

Bằng chứng đầy đủ: [`van-hanh/ultty-gd1-test-proof.md`](../van-hanh/ultty-gd1-test-proof.md).

### 7.2 Đã dựng

| | |
|---|---|
| Secret | 15 secret `zalo-ultty-gd1-test-*`, VM đọc được, **sạch CR/LF** (kiểm mức byte) |
| GitHub | environment `gd1-test` + `GD1_TEST_APPROVED_GROUP_HASHES` (hash 2 nhóm TEST; **ID thật không vào git**) |
| Runtime | prisma · zca · deepseek · gcs · session · **AUTO_SEND=off** — ép cứng trong `render-secrets.sh` |
| Verify | `collect-deployment-evidence.mjs` (chỉ **quan sát**) + `verify-deployment.mjs` (chỉ **phán xử**) |
| Runbook | [`van-hanh/ultty-gd1-test-runbook.md`](../van-hanh/ultty-gd1-test-runbook.md) |
| Backup | tách theo stack (`stacks/<slug>/`) — trước đó 2 stack chia đôi cửa sổ 7 đêm của nhau |

### 7.3 Mười lỗi tiềm ẩn lộ ra — **cùng một hình dạng**

Không lỗi nào nhìn thấy được bằng đọc code; tất cả chỉ lộ khi **chạy thật vào đích thật**.

| # | Lỗi | Nếu không phát hiện |
|---|---|---|
| 1 | Probe preflight gọi `node` trên VM host — VM **không có** node ngoài container | 13/13 secret báo "VM không đọc được" — báo động giả ở đúng chỗ không được phép sai |
| 2 | Collector trỏ `/readiness`, đọc tenant từ `/health` — route thật là `/settings/readiness` (có auth) | Bằng chứng luôn thiếu trường, verify không bao giờ xanh |
| 3 | Preflight gọi `secrets versions list` từ CI runner — `github-deployer@` **không có role Secret Manager nào** | Chặn deploy vì một vấn đề **không tồn tại** |
| 4 | Cổng rollback bắt buộc 2 digest cho **mọi** lần deploy gd1-test | Lần deploy đầu — lần duy nhất chắc chắn không có digest — bị chặn |
| 5 | `printf` rollback thêm trường `"stack"` mà thiếu tham số | Mọi trường sau lệch; `capturedAt` rỗng; **chỉ lộ đúng lúc cần rollback** |
| 6 | `require()` trên tệp `mktemp` không đuôi → nạp JSON như JavaScript | Deploy chết **ngay sau khi preflight vừa báo PASS** |
| 7 | Bản vá áp **một nửa**: `deploy-remote.sh` dùng `$first_release` mà không định nghĩa | Cổng cũ chặn đúng lần deploy mà cờ sinh ra để cho phép |
| 8 | **Deploy chưa bao giờ gieo nguồn sự thật.** Với `PERSISTENCE=prisma`, DB rỗng ⇒ danh mục rỗng ⇒ parser phân loại `khac` | Đúng cho **MỌI** stack mới. Các stack cũ chỉ trông ổn vì **đã gieo bằng tay** — quy trình "lên khách mới" thiếu hẳn một bước |
| 9 | Collector không spawn được `gcloud` trên Windows (`ENOENT` → `EINVAL` sau CVE-2024-27980) | Công cụ thu bằng chứng không chạy được trên máy người vận hành |
| 10 | Probe xác thực gọi `http://api:3001` — cookie phiên mang `Secure` nên không bao giờ được gửi | Triệu chứng `403 CSRF` **trông như sai mật khẩu trong khi thật ra sai giao thức** |

Lỗi 3 **không** sửa bằng cấp thêm quyền cho CI: probe trên VM (bằng chính SA của VM) đã chứng minh
cả ba tính chất — tồn tại, có version enabled, đọc được — về đúng principal thật sự cần secret.

### 7.4 Rà nghiệp vụ — bảng SAI LỆCH §13 **lỗi thời 5 hàng**

Chiều lệch **ngược với dự đoán**: code **ĐI TRƯỚC** tài liệu.

| Hàng | Bảng nói | Code thật |
|---|---|---|
| 1 VAT · 2 COD · 3 ship | 20k / 30k / 40k / VAT 0,1 | **Bỏ hết số đoán** → `null` + cảnh báo + chuyển Sale |
| 13 giá lẻ | trả giá sỉ, thiếu qualifier | ✅ xong 18/08 — **phân theo người hỏi** |
| 14 campaign | `/broadcast` gửi ngay bằng `sleep` | ✅ xong — có scheduler; đường cũ **ném lỗi** |

Hàng 13: cách sửa của code **tốt hơn** đề xuất trong bảng — trả giá lẻ cho đại lý là báo **cao hơn
~44%** so với giá họ thật sự mua.

**Hai điều phát hiện thêm khi đọc code:**

1. **Mọi cảnh báo đều chặn auto-confirm** (`warnings.length > 0 → false`), nên TH2 và đơn xin VAT về
   Sale **nhìn từ ngoài giống hệt nhau** → phải đối chiếu **lý do**, không chỉ kết cục.
2. **`AUTO_SEND=off` chặn auto-confirm hoàn toàn** — trên gd1-test **không đơn nào** tự xác nhận, kể
   cả đơn hợp lệ ≤50. Đã ghi rõ vào hướng dẫn test, nếu không quan sát đúng đầu tiên của người test
   sẽ bị ghi thành lỗi.

**Cần bạn xác nhận:** `blockedCapabilities` (VAT · COD · công nợ 7 ngày · khuyến mãi) trong
`operational-readiness.ts` là `blocking: false` — **không chặn go-live**. Nghĩa là Pilot có thể bật
khi 4 mảng đó còn trống. Hợp lý (hệ thống từ chối tự xử lý, đẩy Sale) nhưng là **quyết định nghiệp
vụ**, nên cần người chốt.

### 7.5 Việc kế tiếp — cần người, không tự làm được

1. **Gieo allowlist** 2 nhóm TEST vào `.runtime/zalo/zalo-allowed-groups.json` của stack mới (lệnh
   trong runbook §4.1).
2. **Quét QR bằng tài khoản Zalo PHỤ** — một tài khoản chỉ chịu được **một** listener; stack DEV
   đang giữ tài khoản hiện tại.
3. **Gửi một tin TEST thật** mang marker → chạy collector + verifier → mới có proof E2E.

### 7.6 Cố ý KHÔNG làm

- Chưa deploy Pilot/production, WATA, Amico.
- Không đổi tên hạ tầng legacy, không xoá volume/secret, không nới cổng an toàn nào.
- Stack DEV `zalo-ultty` giữ nguyên `AUTO_SEND=on` — ngoài phạm vi phiên này.
- `/tmp/netviet-deploy-*` trên VM còn sót từ các lần deploy hỏng (chứa gói khách, mode 0700 root).
  `deploy-remote.sh` chỉ dọn khi **thành công** — đáng dọn, nhưng là việc riêng.

---

## 8. Hội thoại chốt đơn + quản lý đơn qua công cụ (21/08/2026)

Nguồn: buổi test thật của anh Việt trên console demo. Kế hoạch thi công:
[`.claude/plans/hoi-thoai-chot-don-quan-ly-don.plan.md`](../../../.claude/plans/hoi-thoai-chot-don-quan-ly-don.plan.md).

### 8.1 Đánh giá thư viện — **KHÔNG** dùng LangGraph

| Gói | License | Kết luận |
|---|---|---|
| `@langchain/langgraph` 1.4.12 | MIT | ❌ Không dùng |
| `@langchain/mcp-adapters` 1.1.4 | MIT | ❌ Không dùng |
| `@modelcontextprotocol/sdk` 1.29 | MIT | ✅ Đã có sẵn — mở rộng |

Ba lý do đo được, không phải cảm tính:
1. **132 gói bắc cầu**; `@langchain/core` phụ thuộc **cứng** vào `langsmith` (client telemetry).
   Tracing là opt-in qua env var, nhưng nó tạo đường xuất dữ liệu **cách đúng một biến môi
   trường** — trong repo mà danh sách bên thứ 3 được duyệt là hữu hạn và ghi trong hợp đồng.
2. `@langchain/langgraph-checkpoint-postgres` dùng `pg` thô, **tự tạo và tự migrate**
   `checkpoints`/`checkpoint_blobs`/`checkpoint_writes`/`checkpoint_migrations`. Repo pin
   **Prisma 6**. Hai hệ migration cùng ghi vào Postgres của khách đang chạy = drift.
3. Thứ nó thay thế (FSM 4 trạng thái, thuần) **đang chạy đúng**. Ba lỗi khách gặp là lỗi logic ở
   dispatch/handoff/status — thay orchestrator sẽ viết lại phần đang đúng, để nguyên phần đang sai.

Thay vào đó: **một registry công cụ, hai cổng** — advisor in-process (đường nhanh cho Zalo) và
MCP stdio (cho agent ngoài) dùng chung định nghĩa.

### 8.2 Ba lỗi đã sửa (đều có test hồi quy)

| Lỗi | Nguyên nhân gốc | ✅ |
|---|---|---|
| Tư vấn bị đẩy sang Sale quá dễ | Cổng tất định chấm `handoff` chỉ nhìn tin hiện tại; `markComposedRole` **OR** cờ cũ vào kết quả mới; `shouldAutoReplyProduct` chỉ xét `hoi_san_pham` → **6/7 intent** không bao giờ tự trả lời được | ✅ |
| Không huỷ/sửa được đơn | Sau khi chốt, mạch `closed` → `isLive` loại → ngữ cảnh bị vứt; không có intent/công cụ nào sửa được đơn | ✅ |
| Không có nút "Duyệt & gửi" dùng được | `approve()` → `sendConfirmation()` ném 422 khi `priced` rỗng — tức **mọi tin tư vấn**; `sendProductAdvice()` không có route | ✅ |

### 8.3 Cổng chống lệch ERP (bất biến mới)

Mốc khoá là **`salesHandoff`**, không phải `status`:

| Trạng thái | `salesHandoff` | LLM sửa được? |
|---|---|---|
| `draft`/`pending_review`/`needs_edit`/`approved` | — | ✅ chưa gửi khách |
| `sent` | `pending` | ✅ Sale **chưa** nhập ERP |
| `sent` | `completed` | ❌ **đã vào ERP** — khoá cứng |
| `rejected`/`synced` | — | ❌ |

**Sửa đơn = huỷ + thay thế** (`supersedesOrderId`/`supersededByOrderId`), không sửa tại chỗ:
con số khách đã nhận xác nhận là một bản ghi, không phải một biến.

### 8.4 Công cụ GHI của agent — ranh giới bảo mật

`apps/api/src/advisor/order-tools.ts` (tách khỏi `advisor-tools.ts` chỉ-đọc). Ba công cụ:
`tra_cuu_don`, `huy_don`, `sua_don`.

**Tin nhắn Zalo là dữ liệu KHÔNG tin cậy** và đi thẳng vào prompt. Phạm vi vì thế được ép trong
handler, **không** bằng lời dặn trong prompt:
- chỉ chạm được đơn cùng `chatId` **và** cùng `senderExternalId`;
- ngoài phạm vi trả *"không tìm thấy"* (không phải *"không được phép"* — một lời từ chối cũng là
  một xác nhận rằng mã đơn đó có thật);
- kênh không cấp uid người gửi → agent chỉ còn quyền đọc;
- **không có công cụ xoá**; huỷ là một trạng thái.

### 8.5 Còn treo

- ⬜ Chưa có eval thật với LLM sống cho luồng sửa đơn (test hiện dùng port giả). Cần một buổi
  test tay như buổi 21/08 để xác nhận DeepSeek gọi đúng `sua_don`.
- ⬜ Bộ từ khoá `amend-detect.ts` là hữu hạn; cách nói mới sẽ lọt. Mở rộng theo log thật.
- ⬜ Công cụ đã nghĩ ra nhưng **chưa làm**: `doi_thong_tin_nhan` (sửa người nhận TH2),
  `ghi_chu_don`, `chuyen_sale` có cấu trúc, `luu_tri_nho_khach` (địa chỉ quen theo group+sender).

---

## 9. Nền tảng quan sát (observability) — 21/08/2026

> Nền tảng + bảng chấm điểm công nghệ: [docs/kien-truc/observability-review.md](../../kien-truc/observability-review.md)
> · Runbook lần vết: [docs/phat-trien/van-hanh/debugging.md](../van-hanh/debugging.md)

### 9.1 Vấn đề đã giải

Không phải "thiếu log" (42 file đã dùng Nest `Logger`, **0** `console.log`) mà là **không có sợi
chỉ xuyên suốt** + **tầng AI hoàn toàn không quan sát được**.

Đường tin Zalo không đi qua HTTP nên không có chỗ gắn `x-request-id`, và **ba trong bốn** kết cục
của `intake` (`ignored`, `duplicate`, `stored_only`) không bao giờ tới chỗ sinh `orderId` — tức
đúng những ca khó debug nhất lại là những ca không có định danh nào.

### 9.2 Quyết định công nghệ — giữ nguyên, **không** thêm backend

| Ứng viên | Quyết định | Lý do |
|---|---|---|
| OpenTelemetry | **ADOPT quy ước, KHÔNG lấy runtime** | Giữ W3C `traceparent` + GenAI semconv; đã cài rồi **gỡ** cả 4 gói `@opentelemetry/*` |
| Langfuse | ❌ REJECT | 6 service, 4 vCPU + 8 GB *riêng*, cho 10–20 đơn/ngày |
| Grafana Tempo | ❌ REJECT | Kéo theo Redpanda/Kafka **kể cả single-binary** |
| Loki / SigNoz / Sentry / Collector | ⏸ DEFER | Chưa cần ở quy mô hiện tại |
| Prisma instrumentation | ⏸ DEFER | Bản `6.19.3` khớp pin, bật sau |

**Lý do quyết định không phải chi phí** (VM nâng được) mà là **cách ly silo**: mỗi khách đang có
Postgres/mạng riêng — có sự cố thật 17/08 khi dùng chung — nên một backend dùng chung sẽ **gom PII
năm khách vào một kho**. Cách ly bằng `tenantId` trong label là cách ly bằng lời hứa.

**Kết quả ròng: 0 dependency runtime mới, 0 container mới.**

> ### ⚠️ §9.2 ĐÃ BỊ ĐẢO MỘT PHẦN — 24/08/2026
>
> Dòng *"OpenTelemetry — ADOPT quy ước, KHÔNG lấy runtime"* ở bảng trên **hết hiệu lực**. POC ngày
> 24/08 đã dựng **runtime OTel thật** và chấm **GO (8/10 tiêu chí)**; các gói `@opentelemetry/*`
> nay **có mặt và đang được dùng** (`apps/api/src/observability/otel/`). Ai đọc bảng trên rồi đi
> gỡ chúng sẽ phá một thứ đang chạy.
>
> Điều **không** đổi là lý do gốc: cấm **backend DÙNG CHUNG cho nhiều khách**. Hướng đang theo là
> **một backend cho MỖI stack**, vẫn giữ nguyên silo.
>
> Trạng thái cổng (24/08/2026, phiên 14):
>
> | Cổng | Kết quả |
> |---|---|
> | Runtime OpenTelemetry chạy trong tiến trình thật | ✅ PASS |
> | POC ClickStack/HyperDX | ✅ PASS — **vẫn ở mức POC**, chưa production |
> | Tương quan trace xuyên Nexagnet → Hatchet → worker → HTTP | ✅ PASS |
> | Worker crash/recovery giữ tương quan + tác dụng phụ đúng 1 lần | ✅ PASS |
> | Riêng tư trên dây của tiến trình worker | ✅ PASS |
> | Bài gỡ rối cho NGƯỜI | ✅ PASS bằng **CASE A** — chủ dự án chỉ dùng ClickStack/HyperDX, không đọc source/log/SQL, xác định đúng AI/Flowise HTTP 500, trace `5ed5fd27b185f020f6110c32f4569567`. **CASE B đã dựng và đã kiểm chứng là giải được nhưng KHÔNG chạy** — đóng theo quyết định chủ dự án. Đây **không** phải "CASE B PASS". |
> | Nạp preload OTel vào compose triển khai | ⬜ **cố ý chưa làm** — xem nợ §K của bàn giao |
>
> Chi tiết + bằng chứng: [ban-giao-phien-14.md](ban-giao-phien-14.md) ·
> [ban-giao-phien-13.md](ban-giao-phien-13.md). **Prisma instrumentation** ở bảng trên cũng không
> còn "DEFER": đã bật, đã ghim `@6.19.3`, và đã phải viết bộ lọc vì nó phát 7 span/truy vấn.


### 9.3 Đã dựng

- `apps/api/src/observability/` — `TelemetryService` (`step`/`decision`/`stateChange`/`dataChange`/`aiCall`),
  `trace-context.ts` (ALS mang traceId W3C), **mã lý do có kiểu** (từ 24/08/2026 tách theo capability:
  `observability/decision-vocabulary.ts` giữ khuôn, mỗi capability giữ `*-decisions.ts` của nó),
  `telemetry-redaction.ts` (bộ lọc tập trung, quét **cả giá trị**), `structured-logging.ts` (NDJSON),
  `recent-traces.sink.ts` (vòng đệm có trần cho console).
- `tools/trace-view.mjs` — dựng cây nghiệp vụ từ NDJSON (`pnpm trace`).
- Console: nút **"Xem luồng xử lý"** + `TraceViewer.tsx`; mặc định ẩn bước kỹ thuật.
- `docs/phat-trien/van-hanh/debugging.md` — runbook 3 ca thật + bảng tra mã lý do.
- Quy tắc viết code: `.claude/rules/ecc/common/code-review.md` §Observability.

### 9.4bis Lỗi thứ BẢY — chỉ tin nhắn Zalo thật mới lộ ra (22/08/2026)

`COMPOSER_DISABLED` được gọi là "mã quan trọng nhất trong cả hệ thống quan sát" (§9.4 mục 1) —
và trên bản deploy nó **chưa bao giờ chạy**. Trace thật `6c46754f…` ghi:

```
* AI compose noop/noop 0ms          ← một span AI cho lần gọi CHƯA HỀ XẢY RA
~ advisor.compose -> degraded LLM_RETURNED_NOTHING
```

Nguyên nhân: cổng viết là `if (!this.advisor)`, nhưng `content.module.ts` **luôn** tiêm một
`AdvisorAgent`; `ADVICE_COMPOSER` rỗng thì cái được tiêm là `NoopAdvisorAgent`, **không phải
`undefined`**. Orchestrator đi tiếp, gọi `reply()` (trả `null` tức thì), rồi ghi nhãn "LLM không
trả về gì" — đúng cái nhãn đẩy người debug về phía mô hình, trong khi mô hình chưa từng được gọi.
Cùng loại lỗi với mục 5 (**nhãn sai tệ hơn không có nhãn**), lần này ở tầng quyết định.

**Vì sao test không bắt được:** `observability-e2e.spec.ts` khẳng định `COMPOSER_DISABLED` với
`advisor: undefined` — một cấu hình DI không bao giờ tồn tại trên stack. Test xanh, stack sai.

**Đã sửa:** `AdvisorAgent.composes` (cờ có kiểu, `NoopAdvisorAgent` đặt `false`) — không so sánh
theo `name`, vì đổi tên một bản Noop là gây lại lỗi cũ. Test nay chạy **cả hai** cấu hình, và bản
`NoopAdvisorAgent` đã được xác nhận ĐỎ trước khi sửa.

### 9.4 Sáu lỗi thật do chính việc này tìm ra

Đều đã khoá bằng test hồi quy hoặc ghi vào runbook:

1. **BẢO MẬT** — `scrubSecrets` dùng `(match, ...groups)` rồi đoán nhóm bắt bằng `typeof === 'string'`;
   `String.replace` còn truyền **cả chuỗi gốc** vào cuối đối số, nên `Bearer <token>` bị thay bằng
   chính chuỗi gốc và **token vẫn nằm nguyên** trong telemetry.
2. Span gốc **tự làm cha của chính nó** → mọi cây trace bị trải phẳng.
3. `DEPLOYMENT_ENVIRONMENT` render vào `secrets.env` nhưng **không có trong compose** → chưa bao
   giờ tới container (do contract test của task song song bắt).
4. Khoá giả trong test bị bộ quét secret của pre-commit chặn — **đúng**, không phải cảnh báo thừa.
5. **`AI parse deepseek/claude-sonnet-5`** — provider đúng, **model sai**: orchestrator đọc
   `PARSER_MODEL` (mặc định Claude) trong khi chạy DeepSeek. Nhãn model sai **tệ hơn không có nhãn**.
6. `/observability/traces` thiếu ở matcher `@api` của Caddy → trên bản deploy trả 404 Next.js,
   trong khi local vẫn chạy (do `caddy-route-contract.test.mjs` bắt).

### 9.5 Trạng thái triển khai

- ✅ Merge main: PR #25 (`eafaa88`) + PR #26 (`fe671fb`, `7ec817d`).
- ✅ Deploy `ultty-gd1-test` release `0767ab8a` — biến đã tới container
  (`LOG_FORMAT=json`, `DEPLOYMENT_ENVIRONMENT=gd1-test`, `RELEASE_GIT_SHA`, `DATA_CLASSIFICATION=test`),
  log production **đã là NDJSON**, zca listener **connected**.
- ✅ Trace thật đầu tiên trên stack (từ smoke test lúc deploy) — dựng được cây nghiệp vụ đầy đủ.

### 9.6 Trạng thái sau phiên 22/08/2026

- ✅ **Proof bằng tin nhắn Zalo THẬT** trên `ultty-gd1-test`, release `1e009a44`:
  trace **`6c46754f16819d5ef410e1259a553df2`**, nhóm allowlist `7845230969630877446`,
  `externalMessageId=8179411825589`, người gửi *Phùng Việt*, nội dung `"v08 bao nhieu tien"`,
  lúc `2026-08-22T01:57:34.891Z`. Đường đi là `ZcaListener → intake()` (`channel=zca_listener`),
  **không** phải `/demo/simulate`. Đủ cả `message.persist` (9 ms) + `message.intake → ACCEPTED`,
  và đối chiếu được với DB: `Message cmt3qagx00002nx0194i1fna1` → `OrderMessage` →
  `Order a614c70e-a4cf-45c0-809a-b8180f94454c` (`pending_review`, `hoi_gia`).
- ✅ **Token của CẢ HAI đường LLM.** Phát hiện khi đối chiếu trace thật: đường `parse` **cũng chưa
  từng** có token (bản ghi trước 22/08 không có trường nào) — `ClaudeParser` chỉ log chuỗi
  `[cache]`, `DeepSeekParser` không đọc `usage`. Nay cả `parse` lẫn `compose` báo qua
  `ParserInput.reportUsage` / `AdvisorRequest.reportUsage` (`observability/llm-usage.ts`), cộng dồn
  qua mọi vòng công cụ, ghi cả khi LLM trả `null`. Không đụng `@netviet/shared`.
- ✅ **`traceparent` W3C sang Flowise** — `FlowiseParser` đính header của lượt đang chạy. Không đổi
  Flowise, không thêm backend. Cố ý **không** dùng `overrideConfig.sessionId` (đó là khoá bộ nhớ
  hội thoại của Flowise; ghi đè sẽ đổi hành vi nghiệp vụ để phục vụ debug).
- ✅ **Xác định chính xác dữ liệu mất** — bảng ở
  [debugging.md §9.1](../van-hanh/debugging.md). Tóm tắt: `docker restart` mất vòng đệm, **giữ**
  `docker logs`; **redeploy mất luôn `docker logs`** (container mới). Dữ liệu nghiệp vụ trong
  Postgres không bao giờ mất. ⏸ **Không** lưu trace vào Postgres — xem §9.7.

### 9.8 BÀN GIAO phiên 22/08/2026 (phiên 2) — đã ship, còn một việc CẦN NGƯỜI

**Đã merge + deploy.** PR #28 → `main` = `33e1bda`. Stack `ultty-gd1-test` đang chạy đúng SHA đó.
17/17 container healthy trước và sau. Không đụng edge, không đụng stack khác.

**Đã xác minh TRÊN STACK THẬT** (trace `73fd484a80d1b78045dd600a41e49ad8`, release `33e1bda9ac4d`):

| Việc | Bằng chứng |
|---|---|
| Token đếm được — **lần đầu tiên** | `* AI parse deepseek/deepseek-v4-flash 1018ms **4140->41 tok**` |
| `COMPOSER_DISABLED` chạy được | `x advisor.compose -> denied COMPOSER_DISABLED` |
| Hết `AI compose noop/noop` | không còn bản ghi `ai_call` nào cho `compose` |
| Hết `LLM_RETURNED_NOTHING` sai chỗ | không xuất hiện |
| Kill switch | `AUTO_SEND=off`, cả hai cổng `KILL_SWITCH_OFF` |

⚠️ **Lượt trên là smoke test lúc deploy** (`channel=copilot_paste`), **không phải tin Zalo thật.**

**VIỆC CẦN NGƯỜI — checkpoint cuối của Phase A:**

Gửi **một tin bất kỳ** vào nhóm allowlist (`7845230969630877446` hoặc `8827137437588696665`),
rồi chạy:

```bash
gcloud compute ssh netviet --zone asia-southeast1-b --tunnel-through-iap --command "docker logs zalo-ultty-gd1-test-api-1 2>&1 | grep -a '\"traceId\"'" > logs.ndjson && node tools/trace-view.mjs --no-color < logs.ndjson
```

Phải thấy **thêm** hai dòng mà smoke test không có: `. message.persist` và
`v message.intake -> allowed ACCEPTED`, kèm `channel=zca_listener`. Đủ hai dòng đó là Phase A xanh
hoàn toàn.

**Phase B (bật AI composer thật) — audit đã xong, chỉ còn MỘT dòng chặn:**

| Câu hỏi | Trả lời (đọc từ source, không suy đoán) |
|---|---|
| `ADVICE_COMPOSER` nhận gì? | `off` · `claude` · `deepseek` (`env.ts:86`), mặc định `off` |
| gd1-test sẽ dùng provider nào? | **`deepseek`** — `render-secrets.sh` đã **ép cứng** cho `gd1-test`, không cần sửa gì |
| Model thật? | `ADVICE_DEEPSEEK_MODEL`, mặc định `deepseek-v4-flash` |
| Secret đã có chưa? | ✅ `DEEPSEEK_API_KEY` đã ở trong container; `zalo-ultty-gd1-test-anthropic-api-key` cũng đã tạo (nhưng khoá Anthropic hết credit 21/08) |
| Dữ liệu gửi ra provider? | Nội dung tin + lịch sử hội thoại của nhóm. Chỉ hợp lệ vì `DATA_CLASSIFICATION=test` + nhóm TEST (CLAUDE.md §Bảo mật). **Chạy dữ liệu khách thật phải đổi sang `claude`.** |
| Còn thiếu gì? | **Chỉ `compose.yaml`** — khối `environment:` của service `api` chưa liệt kê `ADVICE_COMPOSER`, nên giá trị `render-secrets.sh` phát ra **không bao giờ tới container**. Đúng cái bẫy đã làm hỏng 19–21/08. |

**Vì sao chưa làm:** 7 dòng vá đó đang nằm trong **working tree của task WATA song song**
(cùng `deploy/netviet/secrets-passthrough.contract.test.mjs` để test nó), **chưa commit**. Deploy
chạy từ SHA đã merge chứ không từ working tree, nên Phase B không thể chạy tới khi hunk đó được
commit. Hunk hoàn toàn không liên quan WATA — nó là passthrough của agent tư vấn. **Quyết định
ai commit nó là việc của người**, không tự ý lấy code chưa commit của phiên khác.

**Phase C đã xong trước hạn:** `apps/api/src/advisor/di-reachability.contract.spec.ts` — hợp đồng
kiểm mã lý do reachable bằng **đúng dây nối production** (`createAdvisorAgent()` tách khỏi
`content.module.ts`, cùng khuôn `parser.provider.ts`). Phủ `COMPOSER_DISABLED`,
`DETERMINISTIC_PATH_SUFFICIENT`, composer thật đã bật, và nhãn provider/model của parser.

**Backup NDJSON trước deploy** (chứa nội dung tin thật — **không commit**):
`~/netviet-trace-backups/gd1-test-predeploy-1e009a44-20260822T101112Z.ndjson`

**Chưa đủ điều kiện bắt đầu n8n.**

### 9.9 BÀN GIAO phiên 22/08/2026 (phiên 3) — Phase B XONG, composer thật đã chạy

**Đã merge + deploy.** PR #29 → `main` = **`64fc1e91bf5822f986daa7f96d836f618e424b0f`**.
Deploy run `32552097651`, `ultty`/`gd1-test`, success. 17/17 container healthy. Không đụng edge,
không production, không WATA.

#### Việc đã làm: một dòng chặn suốt ba ngày

`render-secrets.sh` đã ép cứng `ADVICE_COMPOSER=deepseek` cho `gd1-test` từ 21/08 và **đã ghi
đúng vào `secrets.env` trên VM**. Nhưng khối `environment:` của service `api` trong `compose.yaml`
liệt kê biến **tường minh**, và biến này không có trong danh sách — nên giá trị không bao giờ tới
container. Agent tư vấn là `Noop` sau **mọi** lần deploy thành công. Hỏng **im lặng**: không lỗi,
không cảnh báo, không health check nào đỏ.

Đo được trước khi vá, trên stack thật:

| Nguồn | Giá trị |
|---|---|
| `/srv/netviet/apps/zalo-ultty-gd1-test/.runtime/secrets.env` | `ADVICE_COMPOSER=deepseek` |
| `docker exec … printenv ADVICE_COMPOSER` | **rỗng** |

**Bản vá đi kèm một HỢP ĐỒNG**, không chỉ bốn dòng yaml:
`deploy/netviet/secrets-passthrough.contract.test.mjs` đọc heredoc ghi `secrets.env` trong
`render-secrets.sh`, đọc mọi `${BIEN}` trong `compose.yaml`, và đòi giao của hai bên không bỏ sót
ai. Biến có lý do chính đáng để **không** vào container (vd `PILOT_OPERATOR_PASSWORD` —
`bootstrap-auth-user.mjs` đọc thẳng từ `secrets.env`) phải khai trong `NOT_FOR_COMPOSE` **kèm lý
do**, nên danh sách miễn trừ khó phình ra trong im lặng. Chạy trong CI qua
`pnpm test:deploy-contracts`.

Đã xác nhận test **ĐỎ** trên `compose.yaml` của `main` (`33e1bda`) trước khi vá:
`orphans: ANTHROPIC_API_KEY, ADVICE_COMPOSER`.

> 7 dòng vá đó nằm trong working tree của task WATA song song (§9.8). Đã **tách đúng phần chung**:
> commit chỉ gồm `compose.yaml` + hợp đồng + 1 dòng `package.json`. Thay đổi WATA giữ nguyên
> chưa commit, không đụng tới.

#### Env container sau deploy (bước verify)

```
RELEASE_GIT_SHA       = 64fc1e91bf5822f986daa7f96d836f618e424b0f
ADVICE_COMPOSER       = deepseek          (trước deploy: RỖNG)
ADVICE_DEEPSEEK_MODEL = deepseek-v4-flash
AUTO_SEND (env)       = off               (xem mục công tắc bên dưới)
DEEPSEEK_API_KEY      = có mặt (không in giá trị)
17/17 container healthy · zca-js listener: connected
```

Bằng chứng bản vá chạy: **cùng một smoke test lúc deploy**, trên `33e1bda` ra
`advisor.compose → denied COMPOSER_DISABLED`; trên `64fc1e9` ra `DETERMINISTIC_PATH_SUFFICIENT`
(trace `66a31722951fc720e44dcc969ac5c4b8`) — tức advisor đã là agent thật (`composes=true`) và
**tự** từ chối vì đơn đã tính đủ giá, không phải vì công tắc tắt.

#### Proof bằng ba tin Zalo THẬT — nhóm `8827137437588696665`, `channel=zca_listener`

| | CASE 1 | CASE 2 | CASE 3 |
|---|---|---|---|
| tin | `v08 bao nhieu tien` | `V08 với Felix cái nào hợp nhà khoảng 70m2 có mèo hơn?` | `thế còn bảo hành bao lâu?` |
| **traceId** | `b44d631ccf83ac96706585179a91c2a6` | `943157fdc0f81124fbcd035f1723a5ec` | `cbd3524071ca39238d996d166c43b2e7` |
| intent → vai | `hoi_gia` → policy_finance | `hoi_san_pham` → product_advisor | `bao_hanh_khieu_nai` → after_sales |
| AI parse | deepseek-v4-flash 582ms **4143→18 tok** | 691ms **4194→21 tok** | 788ms **4449→23 tok** |
| AI compose | deepseek-v4-flash 2658ms **10031→161 tok** | 7912ms **15382→778 tok** | 3444ms **11041→262 tok** |
| công cụ | `tra_cuu_san_pham`,`bao_gia` (2 vòng) | `tra_cuu_san_pham`×3,`tra_cuu_tai_lieu` (4 vòng) | `tra_cuu_san_pham`,`tra_cuu_tai_lieu` (2 vòng) |
| `advisor.compose` | COMPOSED handoff=0 | COMPOSED handoff=0 | COMPOSED handoff=0 |
| `order.auto_confirm` | denied KILL_SWITCH_OFF | denied NOT_ORDER_INTENT | denied NOT_ORDER_INTENT |
| `advice.auto_reply` | denied KILL_SWITCH_OFF | **allowed** → gửi 310ms | **allowed** → gửi 227ms |

Cả sáu lần gọi LLM đều **đếm được token**, kể cả đường `compose`. Provider/model thật ở cả hai
đường: `deepseek / deepseek-v4-flash`.

**CASE 1 — bất biến #5 đo được.** `hoi_gia` không phải `dat_don` nên không đi nhánh
`DETERMINISTIC_PATH_SUFFICIENT`; agent gọi `bao_gia` (rules engine) rồi mới viết câu. Câu ra
*"…V08 có giá là 4.900.000đ/chiếc"*; bảng `Price`: `V08.wholesale = 4900000`, người hỏi là
`dai_ly` → đúng cấp giá, **con số do tool trả về, không phải LLM tính**. Không có
`LLM_RETURNED_NOTHING`, không có `COMPOSER_DISABLED`.

**CASE 2 — bắt được câu hỏi sai tiền đề.** 4 vòng công cụ, 778 token ra. Không so sánh bừa: tra
danh mục, thấy `FELIX` là **ghế nâng trẻ em** chứ không phải máy hút bụi, rồi hỏi lại khách — kèm
đúng thông số V08 lấy từ `tra_cuu_tai_lieu`. `handoff=false`.

**CASE 3 — mạch hội thoại, bằng chứng đanh nhất.** Tin gốc **không có một chữ nào** nhắc sản phẩm.
Trả lời: *"…**V08** được bảo hành **24 tháng**, 1 đổi 1 trong vòng 7 ngày đầu…"* — khớp **từng
chữ** với FAQ `status=active` của **V08** trong DB, trong khi cùng bảng đó có BB-GREY *3 năm*,
HERCULES *2 năm*, SKJ-CR022 *2 năm*. Chọn đúng vì **ngữ cảnh**, không phải đoán. Prompt parse phình
đúng chiều: 4143 → 4194 → **4449** token.

#### Công tắc AUTO_SEND trên gd1-test — đã bật CÓ CHỦ Ý

`AuditLog`: `2026-08-22 05:24:46.273 | operator | automation.auto_send | off → on`, bật từ giao
diện `/settings` giữa CASE 1 và CASE 2. **Đây là quyết định của người vận hành và được phép trên
`gd1-test`** (nhóm TEST, `DATA_CLASSIFICATION=test`). Ba câu trả lời AI đã gửi thật vào nhóm; CASE 1
đi qua đường Sale duyệt tay, CASE 2/3 đi qua `advice.auto_reply`.

⚠️ **Bẫy cho phiên sau:** công tắc nằm **trong bộ nhớ** (`RuntimeSettingsService`), env vẫn là
`AUTO_SEND=off`. Nên `docker exec … printenv AUTO_SEND` trả `off` **trong khi hệ thống đang tự
gửi** — hai nguồn nói hai điều khác nhau, và env là cái **sai**. Mọi lần restart/redeploy API sẽ
đưa công tắc về `off`; muốn bật lại phải vào `/settings`. Đọc trạng thái thật ở
`/settings/summary`, đừng suy từ `printenv`.

#### ❗ Việc còn treo #1 — một tin ra nhóm khách mà KHÔNG có vết nào

Trace `b44d631c` kết thúc lúc `05:24:44.128Z` bằng `advice.auto_reply → denied KILL_SWITCH_OFF`.
**3,8 giây sau**, lúc `05:24:47.909Z`, câu trả lời CASE 1 vẫn ra nhóm (`Message`
`direction=outbound`, `source=system_outbound`). Grep toàn bộ `docker logs` cửa sổ
`05:24:44–05:24:59`: **không một dòng nào**. `AuditLog` từ 05:20: chỉ `auth.login` +
`automation.auto_send`.

Nguyên nhân: `POST /orders/:id/approve` (`orders.controller.ts:23` → `orders.service.ts:209`) gọi
thẳng `sendConfirmation()`/`sendProductAdvice()` mà **không `telemetry.*`, không `audit.append()`**.

**Hậu quả:** đọc trace lượt đó sẽ kết luận *"hệ thống không gửi gì"* — **SAI**. Đúng loại lỗi
"nhãn sai tệ hơn không có nhãn" mà cả Pha 9 sinh ra để diệt, lần này ở đường **người bấm nút**.
Cố ý **không** sửa trong phiên 3 (ngoài phạm vi Phase B). Việc cần làm: bọc `telemetry.step` +
`telemetry.decision` với **mã lý do có kiểu** (nay ở `orders/sales-order-decisions.ts`), thêm
`audit.append()` cho approve/reject/completeSalesHandoff, và quyết định (kèm ghi lý do vào code)
xem lượt duyệt tay nên nối vào **đúng `traceId` của tin gốc** qua `OrderMessage` hay tạo trace mới.

#### ❗ Việc còn treo #2 — nút "Xem luồng xử lý" chưa có người xác nhận

Verify được từ phía server: edge route `/observability/traces*` tới được API (trả **401**, không
phải 404 → route đúng, guard đúng), ba trace nằm trong vòng đệm, có `orderId` thật để tra
(`9b174290…`, `9e68ea16…`, `1bdde1ce…`). Phần **bấm nút** cần session — console chạy
`AUTH_MODE=session`, và tác nhân AI không nhập mật khẩu thay người. Mở
`https://operator-ultty-gd1-test.35-187-235-82.sslip.io/` rồi bấm trên một trong ba đơn đó.

#### Backup NDJSON (chứa nội dung tin thật — KHÔNG commit)

```
~/netviet-trace-backups/gd1-test-phaseB-64fc1e91-20260822T052633Z.ndjson
~/netviet-trace-backups/gd1-test-predeploy-33e1bda9-20260822T042801Z.ndjson
```

Nhớ [debugging.md §9.1](../van-hanh/debugging.md): **redeploy là mất `docker logs` vĩnh viễn.**
Kéo log ra file TRƯỚC khi deploy bản sửa.

#### Kết luận cho n8n

**Phase B đạt.** Composer thật chạy, provider/model/token/công cụ/mạch hội thoại đều chứng minh
được bằng tin Zalo thật, không phải `/demo/simulate`.

**Chưa nên bắt đầu n8n** cho tới khi đóng **việc còn treo #1**. Lý do không phải hình thức: n8n sẽ
thêm một **đường gửi thứ ba**, mà hệ hiện tại đã có một đường gửi không để lại vết. Nối
orchestration vào một hệ còn chỗ mù thì mỗi lỗi mới sẽ tốn gấp đôi thời gian tìm — đúng cái giá
19–21/08 đã trả một lần rồi. Sửa trước rẻ hơn nhiều.

### 9.7 Cố ý KHÔNG làm

- Không thêm Tempo/Loki/Langfuse/SigNoz — xem §9.2.
- Không auto-instrumentation (làm nổ số span; một lượt phải nhìn ra 5–15 bước, không phải hàng trăm).
- Không đổi nghiệp vụ để phục vụ UI debug. `shouldAutoConfirmOrder` giữ nguyên chữ ký; bản có lý do
  là hàm **mới** (`evaluateAutoConfirm`), hàm cũ uỷ quyền cho nó.
- Không bật `AUTO_SEND` để test quan sát.

---

## 10. Nền tảng tự động hoá — đóng chỗ mù thao tác người + quyết định n8n (22/08/2026, phiên 4)

> Tài liệu kiến trúc đầy đủ: [docs/kien-truc/automation-architecture.md](../../kien-truc/automation-architecture.md)

### 10.1 ✅ Việc còn treo #1 của §9.9 — ĐÃ ĐÓNG (chưa deploy)

Đường `POST /orders/:id/approve` · `reject` · `sales-handoff/complete` nay có **trace + quyết định
có mã + chuyển trạng thái + audit + danh tính người bấm**.

Nguyên nhân gốc hoá ra là **hai tầng**, không phải một "quên gọi logger":

1. **Không có gốc trace ở biên HTTP.** `telemetry.runTurn()` chỉ được gọi ở hai chỗ, cả hai trong
   `pipeline.service.ts`. Nên kể cả khi `OrdersService` có phát telemetry, bản ghi cũng mang
   `traceId: 'no-trace'` — và `RecentTracesSink.record()` **vứt thẳng** loại bản ghi đó.
2. `OrdersService` **không tiêm** `TelemetryService` lẫn `AuditLogService`.

**Quyết định trace cho thao tác người: trace MỚI + `causationTraceId`** (không dùng lại `traceId`
của tin gốc). Lý do đầy đủ ở [automation-architecture.md §1.3](../../kien-truc/automation-architecture.md);
tóm tắt: một trace là một giao dịch, và cú bấm chuột xảy ra sau đó vài giây tới vài giờ. Dùng lại
traceId cũ sẽ khiến `totalMs` của mọi lượt tự động bị tính bằng thời gian suy nghĩ của con người —
chôn vùi tín hiệu độ trễ thật. OpenTelemetry giải bài này bằng **link**, không phải parent-child.

Thêm: `by-order` (nút "Xem luồng xử lý") **giữ nguyên nghĩa "lượt gốc"** — lượt dẫn xuất bị loại
bằng chính mô hình dữ liệu (`causationTraceId` có mặt ⟺ do lượt khác gây ra).

| Kiểm chứng | Kết quả |
|---|---|
| Test hồi quy mới `orders/manual-action-observability.spec.ts` | **ĐỎ 8/10 trên HEAD `f4ed3ee`** trước khi vá (`expected 0 to be greater than 0` — không một bản ghi telemetry nào), **10/10 xanh** sau khi vá |
| Hợp đồng DI bằng container Nest thật `orders/manual-action-di.contract.spec.ts` | xanh — `@Optional()` không được nối dây sẽ lặng lẽ thành `undefined`, đúng hình dạng sự cố `NoopAdvisorAgent` |
| Toàn bộ suite API | **993 passed / 0 failed / 25 skipped** · deploy contracts 53/53 |
| `tsc --noEmit` · `eslint` | sạch |
| Rà soát bảo mật (`security-reviewer`) | 2 phát hiện **đã sửa** (chặn `x-actor` bịa; audit hỏng nay lọc được qua bước `audit.persist`); 1 phát hiện **CAO có trước** — neo trace không qua bộ lọc nên UID Zalo của khách lọt ra NDJSON — tách thành việc riêng, xem [automation-architecture.md §1.6](../../kien-truc/automation-architecture.md) |

⚠️ **Chưa merge, chưa deploy.** Đang nằm trên nhánh `feat/hoi-thoai-chot-don-main` cùng worktree
với việc WATA (không đụng tới).

### 10.2 ⏸ n8n — QUYẾT ĐỊNH: **DEFER**

Hai chặn, cả hai đo được:

**1. Giấy phép — P0.** Sustainable Use License cho phép dùng *"cho mục đích kinh doanh nội bộ của
chính bạn"*, và cấm đích danh *"hosting n8n and charging people money to access it"* +
*"white-labeling n8n and offering it to your customers for money"*. Help Center của n8n nói thẳng:
vận hành workflow/credential **của khách** trong instance của mình ⇒ **Enterprise license**; nhúng
vào sản phẩm ⇒ **Embed license**. Từ 28/07/2026 Nexagnet bán dịch vụ cho khách ngoài, nên MODEL 1
và MODEL 2 đều rơi vào diện phải trả tiền.

**2. Community edition không có ranh giới tenant nào.** Projects và RBAC là tính năng **trả tiền**.
Nên shared-instance-project-per-tenant hoặc là đụng giấy phép, hoặc là không cách ly được — không
có cấu hình nào tránh được cả hai. Điều này đâm thẳng vào bất biến §9.2 (*cách ly bằng nhãn là cách
ly bằng lời hứa*, có sự cố thật 17/08).

**Và kể cả không có hai chặn trên thì hôm nay vẫn chưa nên làm:** `ErpPort.pushOrder()` **không có
một call-site nào** ngoài thư mục `erp/` — số tích hợp ngoài đang chạy là **0**. n8n sẽ không bỏ
được dòng code nào, không giảm độ phức tạp nào, và không cải thiện độ tin cậy nào (retry + lease +
idempotency đã chạy sẵn trong `CampaignDelivery`). Ba lần "không" ⇒ không thêm service.

**Phát hiện đáng giá nhất của phần audit:** repo **đã có** một transactional outbox, chỉ chưa đặt
tên — `CampaignDelivery` + `claimDue()` (`FOR UPDATE … SKIP LOCKED`, lease, `attempts`,
`nextAttemptAt`, backoff, `idempotencyKey @unique`, rate limit) + `CampaignScheduler`. Khi có việc
tự động hoá đầu tiên, **khái quát hoá khuôn này**, đừng thêm Redis/BullMQ/Kafka.

**Con đường sạch giấy phép nếu sau này cần:** khách **tự host** automation của họ (n8n/Make/Cloud
Function), Nexagnet chỉ bắn webhook có ký + `traceparent` + `idempotencyKey` tới một endpoint khai
trong gói tenant. n8n xác nhận trường hợp này **không cần** giấy phép thương mại nào của ta, và
cách ly tenant là tuyệt đối vì hạ tầng nằm bên khách.

**Điều kiện mở lại:** (a) có use case tích hợp ngoài thật đã chốt với khách; (b) khách tự host và
chỉ cần webhook; (c) có xác nhận bằng văn bản từ `license@n8n.io`; (d) số adapter tự viết vượt ~3
cái mỗi khách.

### 10.3 ⚠️ Nợ kỹ thuật phát hiện trong lúc làm — CHƯA sửa

`CampaignService` tiêm `AuditLogService` **bắt buộc**, nhưng `AuditLogService` thuộc capability
`operations`, còn `campaign` chỉ phụ thuộc `messaging`. Một khách khai `campaign` mà không khai
`operations` sẽ **không boot được**. Chưa nổ vì `ultty`/`amico` đều khai đủ 6 capability. Cần hợp
đồng boot theo **tổ hợp** capability, không chỉ hai đầu mút `knowledge-only` và `đủ-hết`.

### 10.4 Công tắc AUTO_SEND trên gd1-test — đã VERIFY, không đụng vào

Đọc từ nguồn thật chứ không suy từ `printenv` (env vẫn là `off` và env là cái **sai**):

| Bằng chứng | Giá trị |
|---|---|
| `AuditLog` mới nhất cho `automation.auto_send` | `2026-08-22 05:24:46 · operator · {"autoSend": "on"}` |
| `docker inspect` API container | `StartedAt = 2026-08-22T04:51:43Z`, **`RestartCount = 0`** |
| Thời điểm đọc | `2026-08-22T07:10Z`, cùng tiến trình đó |

Toggle đặt lúc 05:24:46 nằm **sau** lúc container khởi động và **chưa có lần restart nào** ⇒
`RuntimeSettingsService` vẫn giữ **`on`**. Đây là quyết định có chủ ý của người vận hành, **không
thay đổi**. Mọi lần redeploy sẽ đưa về `off`; muốn bật lại phải vào `/settings` — máy không tự bật.

> Sổ audit này cũng là bằng chứng thực nghiệm cho §10.1: **không có một dòng `order.approve` nào**
> trong bảng, dù CASE 1 đi qua đúng đường đó lúc 05:24:47.

### 10.5 Việc kế tiếp

1. **Cần người:** review + merge phần Phase 0 ở §10.1, rồi deploy. Nhớ kéo NDJSON ra file **trước**
   khi deploy (redeploy là mất `docker logs` vĩnh viễn).
2. Sau deploy: bấm "Duyệt & gửi" một đơn trên `gd1-test`, rồi
   `docker logs … | node tools/trace-view.mjs` — phải thấy một `TRACE … ← từ <trace tin gốc>` kèm
   `nguoi=<username>`, và một dòng `order.approve` trong `AuditLog`.
3. Việc còn treo #2 của §9.9 (nút "Xem luồng xử lý" chưa có người xác nhận) vẫn treo — cần phiên
   đăng nhập, tác nhân AI không nhập mật khẩu thay người.
4. **Không** dựng `AutomationPort` cho tới khi một trong bốn điều kiện §10.2 xảy ra.

---

## 11. Durable workflow engine — nghiên cứu + POC chạy thật (22/08/2026, phiên 5)

> Tài liệu đầy đủ: [workflow-engine-evaluation.md](../../kien-truc/workflow-engine-evaluation.md) ·
> POC: [`tools/poc-workflow-engine/`](../../../tools/poc-workflow-engine/README.md)

### 11.1 ✅ QUYẾT ĐỊNH: **ADOPT HATCHET — cho NỀN TẢNG, chưa cho production**

Điểm có trọng số: **Hatchet 85** · Temporal 83 · Trigger.dev 78 · Windmill 54.

| Ứng viên | Giấy phép | Kết luận |
|---|---|---|
| **Hatchet** v0.101.27 | **MIT thuần** (không có `ee/`) | 🟢 **CHỌN** |
| Temporal | MIT (server) | 🟢 dự phòng nghiêm túc — thắng rõ về versioning |
| Trigger.dev v4.5.12 | Apache 2.0 | 🟢 license sạch nhưng **loại** (xem 11.3) |
| Windmill | AGPLv3 + CE độc quyền | 🔴 **LOẠI** — cấm "serve as a managed service / wrap" |

### 11.2 POC đã CHẠY THẬT — không phải bảng so sánh

Hatchet self-host dựng bằng Docker Compose: **58 giây**, **3 container**, **~270 MB RAM lúc rảnh**,
**không cần RabbitMQ** (`SERVER_MSGQUEUE_KIND=postgres`). Phụ thuộc bắt buộc duy nhất: PostgreSQL.

Workflow TypeScript 5 bước (`validate → map → dispatch → await-approval → finalize`) đã chứng minh:

| Kịch bản | Kết quả |
|---|---|
| Run thành công nhiều bước | ✅ |
| Run lỗi có **mã lý do** đọc được | ✅ `PAYLOAD_INVALID: customer,totalQuantity` |
| Retry + backoff luỹ thừa thật | ✅ 3 lần thử, giãn 3 s → 8 s |
| **Giết cứng worker giữa chừng** | ✅ run tiếp tục trên worker MỚI, **bước đã xong không chạy lại** (đếm được: đúng 1 lần gọi ra ngoài) |
| Chờ + tiếp tục (sự kiện người duyệt) | ✅ |
| Huỷ | ✅ |
| Replay (run đã huỷ & run đã lỗi) | ✅ — **lưu ý: replay CHẠY LẠI tác dụng phụ** |
| `traceparent` W3C của Nexagnet → tận hệ ngoài | ✅ nguyên vẹn |
| Xem input / output / cây bước / lần thử | ✅ |

**Giá trị so với `CampaignDelivery`:** engine thay được **~90%** hạ tầng ta *định* tự viết
(`AutomationRun/Job/Step/Attempt`, lease, retry, replay, lịch sử, chờ bền vững, huỷ, dashboard).
`CampaignDelivery` chỉ phủ ô đầu tiên (hàng đợi bền vững) — nó **không** có bước, lần thử có lịch
sử, replay, chờ, phiên bản, hay giao diện vận hành.

### 11.3 ⚠️ Ba điều phải nhớ, không được giấu

1. **Hatchet KHÔNG ghim phiên bản code cho run đang chạy.** POC chứng minh bằng dữ liệu: cùng một
   run có bước `validate` chạy code **v1** và `finalize` chạy code **v2**. → Bắt buộc có chuẩn code
   (chỉ thêm bước ở cuối; đổi phá vỡ ⇒ workflow tên mới). **Rủi ro số 1** của lựa chọn này.
2. **`input` của run được lưu NGUYÊN VĂN** và ai vào dashboard cũng đọc được. → **Che dữ liệu
   phải làm TRƯỚC khi gọi engine**, không phải trong bước đầu của workflow (Luật BVDLCN 91/2025/QH15).
3. **Trigger.dev bị loại vì `Checkpoints: Cloud ✅ / Self-hosted ❌`** (tài liệu chính thức) — đúng
   ca dùng "chờ Sale duyệt" của ta — cộng với yêu cầu tối thiểu **≥ 7 vCPU / 14 GB RAM** mỗi stack.

### 11.4 Việc kế tiếp

1. **Cần người:** mở `http://localhost:8744` xác nhận dashboard bằng mắt — bước duy nhất chưa xong
   (tác nhân AI không nhập mật khẩu thay người, giống việc còn treo #2 ở §10.5).
2. Chốt chuẩn code cho versioning (11.3.1) + quy tắc che dữ liệu trước khi gọi engine (11.3.2)
   **trước** khi nối vào `apps/api`.
3. Rồi mới: `WorkflowEnginePort` + adapter + ràng buộc workflow↔tenant trong `tenants/<slug>/tenant.json`.
4. Workflow thật đầu tiên nên là **chiến dịch CSKH** — vì `CampaignDelivery` là đường lui an toàn.
5. **Không** tự viết lớp versioning cho Hatchet. Nếu 11.3.1 thành nỗi đau thật → mở lại **Temporal**.

### 11.5 Cố ý KHÔNG làm — ⚠️ **PHẠM VI CỦA PHIÊN 5, HẾT HIỆU LỰC 24/08/2026**

> Mục này ghi phạm vi **lúc ra quyết định ở phiên 5 (22/08/2026)**. Giữ nguyên câu chữ vì nó là hồ
> sơ của một quyết định có thật, **không phải mô tả hiện trạng**. Hiện trạng ở §11.6.

- ~~**Không** nối Hatchet vào `apps/api`, **không** deploy lên VM, **không** thêm vào `AppModule`.~~
  → **đã làm cả ba** (§11.6).
- **Không** POC Windmill (license chặn) và **không** POC n8n (đã DEFER ở §10.2 cùng lý do). *(còn đúng)*
- **Không** tự dựng `AutomationRun/Job/Attempt` nữa — §10.5 mục 4 nay có câu trả lời: engine lo. *(còn đúng)*

### 11.6 Trạng thái workflow engine — cập nhật 24/08/2026

> Bằng chứng thô + nhật ký từng phiên: [`ban-giao-workflow-engine.md`](ban-giao-workflow-engine.md).
> Vận hành: [`../van-hanh/workflow-engine-runbook.md`](../van-hanh/workflow-engine-runbook.md).
> Cách chạy kiểm: [`../van-hanh/chay-kiem-workflow-engine.md`](../van-hanh/chay-kiem-workflow-engine.md).

| Việc | Trạng thái |
|---|---|
| Nền tảng trong `apps/api/src/workflow/` — cổng, adapter, outbox giao dịch, cầu nối, ràng buộc tenant | ✅ |
| Readiness của tiến trình worker (`/ready` · `/live`) — điều kiện chặn của compose | ✅ 23/08 |
| Worker là **container riêng** `workflow-worker-v1` (không nằm trong `api`) | ✅ |
| Deploy cụm Hatchet lên VM, stack `ultty-gd1-test` — 4 container healthy | ✅ 24/08, deploy run `32683218604` |
| Đúc token idempotent từ VM (`bootstrap-workflow-engine.sh`) | ✅ 24/08 |
| DRAIN thật trên container Linux (SIGTERM → exit 0) | ✅ 24/08 |
| **24 bài IT chạy trên engine thật TRONG CI** (job `workflow-integration`) | ✅ 24/08, merge SHA `7942121`, `201 passed (201)` |
| Bật engine cho khách **production** | ⬜ **KHÔNG** — công tắc `WORKFLOW_ENGINE` mặc định `off`, chỉ bật cho `gd1-test` |
| Workflow **nghiệp vụ** đầu tiên (khuôn hiện tại `integration-handoff.v1` là trung tính) | ⬜ chưa bắt đầu |
| TLS gRPC nội bộ (đang `tls none` trên mạng `internal: true`) | ⬜ quyết định Q2-A, chưa đổi |

> ⚠️ **"D8" ở tài liệu này và "D8" của workflow engine là HAI thứ khác nhau.** Ở đây D8 =
> **VAT-default** (§ bảng quyết định — vẫn ⬜). Trong `ban-giao-workflow-engine.md`, D8 = mốc đưa
> engine lên VM (đã xong 24/08/2026). Đừng đọc lẫn hai hệ đánh số.

---

## 12. TRẠNG THÁI NỀN TẢNG — Documentation Truth Reset (27/08/2026)

> **Đọc mục này trước §1–§11.** Các mục trên được viết tới **22/08/2026**; từ 24 đến 27/08 các PR
> #37→#58 đã thay đổi kiến trúc và mục này là bản cập nhật. Chỗ nào §1–§11 mâu thuẫn với bảng dưới
> đây, **bảng dưới đây đúng**.
>
> Nơi giữ ✅/⬜ của kế hoạch vẫn là tài liệu này. Nhưng **hợp đồng** và **bằng chứng runtime** của
> nền tảng nay nằm ở `kien-truc/` — xem liên kết ở §12.4.

### 12.1 CANONICAL CURRENT TRUTH

> ⚠️ Bảng này là **bản sao rút gọn**. Bản được viện dẫn nằm ở
> [kien-truc/reference-platform-stack.md §6](../../kien-truc/reference-platform-stack.md#6-canonical-current-truth-28082026);
> hai bản mâu thuẫn thì bản kia đúng.

| Hạng mục | Trạng thái |
|---|---|
| Release Identity Closure | **CLOSED / RUNTIME-PROVEN** |
| Deploy Signal Reliability | **CLOSED / RUNTIME-PROVEN** |
| OTel code support | **RUNTIME-PROVEN** trên gd1-test |
| OTel export trên gd1-test | **RUNTIME-PROVEN** — cả 3 tiến trình (api + 2 worker) phát span |
| ClickStack | **RUNTIME-PROVEN** — bền, retention 30 ngày, backup→restore→query đạt |
| Historical Debug traces | **CLOSED / RUNTIME-PROVEN** — 4/4 proof ở mức Debug View |
| `ultty-gd1-test` | **REFERENCE STACK, NOT YET PARITY-CLOSED** — vướng đúng một mục: một tin `zca_listener` thật |

Bằng chứng gần nhất: deploy run `33172218761`, release `98013f87b5b3932414ca46f10d5ff688e9108b0e` —
**sáu** tín hiệu `pass`, `classification=APPLICATION_ROLLED_OUT_HEALTHY`, `hardFailure=false`. Trong
kho quan sát: 4953 span của release `270ef27` **vẫn còn** sau khi stack đã chuyển sang `1ad92be`
(PROOF 3 ở mức kho), và span cũ giữ **đúng** release SHA cũ (PROOF 4 ở mức kho).

### 12.2 Những gì đã đổi từ 24/08 mà §1–§11 chưa phản ánh

| PR | Đổi gì về kiến trúc |
|---|---|
| #37 | Nền OpenTelemetry — trace đi được qua Hatchet |
| #38, #40 | Tách capability `turn-processing` khỏi `sales-order` |
| #41–#43 | `sales-handoff-followup.v1` — workflow **nghiệp vụ** đầu tiên trên Hatchet *(dòng "⬜ chưa bắt đầu" ở §11 nay đã lỗi thời)* |
| #45 | Nối trace qua internal callback của workflow |
| #46, #49, #50, #51 | Debug View + tương quan mã nguồn + mở IDE |
| #52 | Tách bốn tín hiệu deploy (rollout/health/deterministic/live-AI) |
| #53–#58 | Đóng danh tính release; làm cứng preflight; sửa cổng provider smoke |
| #61–#64 | Bật cụm quan sát trên gd1-test; sửa `nexagnet.tenant`; bằng chứng runtime P2 |
| #65 | Đường lùi lịch sử của Debug View; sức khoẻ kênh đọc + tự nối lại; backup kho quan sát; hai tầng tín hiệu deploy mềm |

### 12.3 Known risks

| Mục | Trạng thái (28/08) |
|---|---|
| `zca_listener` im lặng | **`FIXED` — chờ chứng minh**: bảy mức sức khoẻ và tầng deploy signal **đã runtime-proven**; còn (a) một lần nối lại chạy thật, (b) **một tin thật đi hết đường — cần người nhắn** |
| preflight ghi đè `autoSend` | **`RESOLVED`** — preflight thật chạy qua |
| `bot-poller.spec.ts` flaky | **`RESOLVED`** |
| OTel mang release identity thứ hai | **`RESOLVED`** |
| Hai nhà cung cấp AI của gd1-test chết | **`RESOLVED`** — DeepSeek đã nạp lại |
| Đường đọc lịch sử chưa chạy thật | **`RESOLVED`** — 4/4 proof đo ở mức Debug View (release `98013f8`) |
| **`main` chưa được bảo vệ** | **`RESOLVED` 28/08/2026** — ruleset `main-protection`, bắt buộc PR + 7 check, chặn force-push, `bypass_actors: []`; push thẳng/force-push đã thử bằng token admin và bị từ chối. Còn `UNRESOLVED` mức TRUNG BÌNH: repo một chủ nên **không cưỡng chế được review người thứ hai**; repo vẫn public. Xem [github-governance.md](../van-hanh/github-governance.md) |

Bằng chứng đầy đủ và cổng đóng của từng mục:
[kien-truc/reference-platform-stack.md §7](../../kien-truc/reference-platform-stack.md#7-known-risks--unresolved).

### 12.4 Milestone triển khai kế tiếp

**`REFERENCE STACK PARITY v0`** (P2) — **không phải** Fleet View. Phạm vi chính xác, cổng vào/ra và
bốn khẳng định runtime phải đạt: [platform-roadmap-v2.md](platform-roadmap-v2.md#p2--reference-stack-parity-v0--milestone-triển-khai-kế-tiếp).

### 12.5 Tài liệu canonical mới

- [kien-truc/reference-platform-stack.md](../../kien-truc/reference-platform-stack.md) — hợp đồng stack tham chiếu, parity levels L0–L5, 4 mặt phẳng, ma trận hiện trạng, known risks
- [kien-truc/tech-radar.md](../../kien-truc/tech-radar.md) — ADOPT/TRIAL/ASSESS/HOLD/AVOID kèm bằng chứng, và **FRAMEWORK DECISION**
- [kien-truc/agentic-ops.md](../../kien-truc/agentic-ops.md) — bốn mức tự động hoá vận hành (định hướng dài hạn)
- [platform-roadmap-v2.md](platform-roadmap-v2.md) — lộ trình nền tảng P0→P15
