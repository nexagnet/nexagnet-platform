# @netviet/autopilot-protocol — Giao thuc Autopilot V0

> ⚠️ **DEPRECATED — Autopilot V3 ([#361](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/361)).**
> Không mở rộng mã này. Đường đang triển khai: [autopilot-v3-cloud-builder.md](../../docs/phat-trien/van-hanh/autopilot-v3-cloud-builder.md).
> Mã giữ nguyên trên `main` cho tới Phase D (xoá sau khi đường thay thế được chứng minh).


Ban MAY DOC cua giao thuc ChatGPT <-> GitHub <-> Claude: JSON Schema, may trang thai, cong nghiep
vu, khoa idempotency, va mot CLI tat dinh. Ban NGUOI DOC (canonical):
[`docs/phat-trien/van-hanh/autopilot-protocol-v0.md`](../../docs/phat-trien/van-hanh/autopilot-protocol-v0.md).

Hop dong goc: Issue #153. Trang thai: **FOUNDATION ONLY** — chua co orchestrator, chua co
dispatcher Claude, chua auto-merge. Goi nay khong goi mang.

## Cau truc

```text
schemas/
  common.schema.json            kieu dung chung: sha40, risk, env, ...
  task-contract.schema.json     hop dong task (mot Issue = mot hop dong)
  messages/*.schema.json        9 loai thong diep (TASK_READY ... TASK_DONE)
validator/
  constants.mjs                 STATES, EVENTS, MARKERS, RETRY_CEILINGS, ...
  reasons.mjs                   bo tu vung ly do co ma
  schemas.mjs                   nap + bien dich schema bang ajv (strict)
  messages.mjs                  comment <-> JSON canonical
  task-contract.mjs             kiem hop dong + trich tu than Issue
  state-machine.mjs             bang chuyen, nextState (fail closed)
  principal.mjs                 principal GitHub -> vai giao thuc (so do cai dat, fail closed)
  gates.mjs                     exact-SHA, CI, rui ro, retry, runtime proof
  idempotency.mjs               khoa + so khoa bat bien
  protocol.mjs                  bo giam: (task, thong diep, bang chung) -> task moi
  cli.mjs                       CLI
  index.mjs                     diem vao thu vien
tests/                          node --test; du lieu tong hop, khong SHA/issue that
```

## Chay

```bash
pnpm --filter @netviet/autopilot-protocol test        # cung chay trong `pnpm -r test` cua CI
pnpm --filter @netviet/autopilot-protocol typecheck   # JSDoc + checkJs

node tools/autopilot-protocol/validator/cli.mjs message   <file|->
node tools/autopilot-protocol/validator/cli.mjs contract  <file|->
node tools/autopilot-protocol/validator/cli.mjs transition <from|-> <event>
node tools/autopilot-protocol/validator/cli.mjs key       <file|->
node tools/autopilot-protocol/validator/cli.mjs required-checks [ruleset.json]
```

Ma thoat: `0` hop le · `1` khong hop le (JSON co `reason`) · `2` dung sai.

## Dung nhu thu vien

```js
import {
  createTask,
  applyMessage,
  applyMerge,
  readMessage,
  validateTaskContract,
} from './validator/index.mjs';

const contract = validateTaskContract(payload); // { ok, contract } | { ok: false, reason }
let task = createTask({ issue: 200, contract: contract.contract });
const msg = readMessage(commentBody); // { ok, message } | { ok: false, reason }
const next = applyMessage(task, msg.message, {
  // BAT BUOC: ai phat thong diep nay (comment.user.login / app.slug). Thieu => PRODUCER_UNKNOWN.
  actor,
  // bang chung do orchestrator lay tu GitHub
  checkRuns, // moi check-run PHAI co head_sha; thieu => CI_EVIDENCE_UNBOUND
  requiredChecks,
  humanApproval,
});
if (next.ok) task = next.task; // task cu KHONG bi sua
```

Ba dieu de sai nhat khi noi goi nay vao mot orchestrator that:

1. **`actor` khong phai tuy chon.** Khong biet ai phat la mot ly do tu choi (`PRODUCER_UNKNOWN`),
   khong phai mot truong hop duoc mien kiem `MESSAGE_PRODUCERS`.
2. **Check-run phai tu noi no thuoc HEAD nao.** `head_sha` thieu/rong => `CI_EVIDENCE_UNBOUND` cho
   ca lo; buoc bang chung vao HEAD la viec cua orchestrator luc lay tu API.
3. **Hop dong chi kich hoat co chu dinh.** `extractTaskContract` doi marker `AUTOPILOT_TASK_V0` o
   dong co noi dung DAU TIEN va khoi `json` NGAY SAU no — van xuoi dan vi du khong tao ra hop dong.

Moi tu choi mang ma trong `REASONS`. Doi mot ten trong `constants.mjs` la doi giao thuc — phai len
phien ban (`V1`), khong sua tai cho.
