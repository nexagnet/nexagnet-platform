/**
 * TIN HIEU CUA MOT LAN DEPLOY — bon tang, bon cau tra loi khac nhau.
 *
 * VAN DE NAY CO THAT. Truoc 26/08/2026 ca duong deploy nam trong MOT buoc bash duy nhat voi
 * `set -euo pipefail`, nen mot lan LLM phan loai tin mau thanh `khac` thay vi `dat_don` cho ra
 * DUNG mot dau X do nhu khi image chua len hay container chet. Nguoi truc doc mai thanh
 * "deploy do nhung chac lai model thoi" — va do la cach mot lan do THAT bi bo qua.
 *
 * Module nay KHONG quan sat gi ca; no chi PHAN XU. Tang shell tren VM ghi ra mot so nhat ky
 * (`##DEPLOY-SIGNAL## {json}`) khi di qua tung tang, con day doc so do va tra loi:
 *
 *   - tang nao that bai,
 *   - tang nao CHUA CHAY (khac han voi "chay va hong"),
 *   - va that bai do co phai loi ha tang khong.
 *
 * Cung ho voi `verify-deployment.mjs` (quan sat/phan xu tach doi), nhung khac muc dich: file do
 * phan xu BANG CHUNG THU THU CONG sau khi deploy xong, con file nay phan xu CHINH LAN DEPLOY.
 *
 * NEN TANG, KHONG PHAI CUA MOT KHACH: khong duoc nhac ten khach nao trong tep nay (CLAUDE.md
 * quyet dinh 6) — co test khoa dieu do.
 */

/** Tien to cua mot dong so nhat ky. Chon de khong dung voi bat ky dong log docker/compose nao. */
export const DEPLOY_SIGNAL_PREFIX = '##DEPLOY-SIGNAL##';

/**
 * THU TU CO Y NGHIA: mot tang chi chay khi tang truoc no da qua. Nho vay "chua chay" (`pending`)
 * doc duoc thanh "khong ket luan gi", thay vi bi lan thanh that bai.
 */
export const DEPLOY_SIGNAL_LAYERS = Object.freeze([
  'rollout',
  'health',
  'deterministicSmoke',
  'liveAiSmoke',
  'observability',
  'channelListener',
]);

/** Ba tang dau la HA TANG/HOP DONG — do o day la do that va phai chan lan deploy. */
const HARD_LAYERS = Object.freeze(['rollout', 'health', 'deterministicSmoke']);

/**
 * TANG QUAN SAT — bao cao, KHONG chan.
 *
 * Vi sao khong chan: `.claude/rules/ecc/common/code-review.md` dat mot bat bien — quan sat khong
 * duoc la dependency cua thanh cong nghiep vu. Mot ClickHouse hic lan khong duoc phep chan mot
 * ban va loi. Cung ly le cho kenh doc: mot socket Zalo dut la su co VAN HANH, khong phai bang
 * chung rang ban phat hanh nay hong.
 *
 * Vi sao van phai nam TRONG bang tin hieu: neu chung khong o day thi khong ai nhin, va do dung
 * la trang thai 44 gio cua §7.1 — ba tin hieu xanh trong khi kenh doc chinh khong mang ve mot
 * tin nao. Chung xuat hien voi trang thai THAT cua minh, va mot ket qua khong `pass` di ra
 * `softFailures` de may doc duoc.
 */
const SOFT_LAYERS = Object.freeze(['observability', 'channelListener']);

/**
 * Muc do NANG dan. Mot tang bao lai nhieu lan thi ban NANG NHAT thang — neu de ban sau de len
 * ban truoc, mot buoc thu lai thanh cong se xoa dau vet cua lan hong dau tien, va do la duong
 * ngan nhat toi mot mau xanh gia.
 */
const STATUS_SEVERITY = Object.freeze({
  pass: 0,
  skipped: 1,
  unavailable: 2,
  timeout: 3,
  fail: 4,
});

const PENDING = Object.freeze({ status: 'pending', reason: 'NOT_REACHED', detail: null });

/** Nhan cua tung tang — bao cao doc len phai ra viec, khong ra ten bien. */
const LAYER_LABELS = Object.freeze({
  rollout: 'ROLLOUT',
  health: 'HEALTH',
  deterministicSmoke: 'DETERMINISTIC RUNTIME SMOKE',
  liveAiSmoke: 'LIVE AI SMOKE',
  observability: 'OBSERVABILITY',
  channelListener: 'CHANNEL LISTENER',
});

const LAYER_MEANING = Object.freeze({
  rollout: 'Ban phat hanh da len dung image/SHA chua',
  health: 'Ban da len co song khong',
  deterministicSmoke: 'Hop dong runtime tat dinh con dung khong',
  liveAiSmoke: 'Model/provider co dat fixture khong (phu thuoc ngoai)',
  observability:
    'Kho quan sat co NHAN va TRA LOI duoc khong, va span co dung khach/ban phat hanh khong',
  channelListener: 'Kenh doc dang o pha nao, va lan cuoi co tin la bao gio',
});

/** Ma phan loai cuoi cung. Co KIEU de loc duoc, khong phai mot cau van xuoi. */
const CLASSIFICATION = Object.freeze({
  rolloutFailed: 'ROLLOUT_FAILED',
  runtimeUnhealthy: 'RUNTIME_UNHEALTHY',
  deterministicFailed: 'DETERMINISTIC_RUNTIME_CONTRACT_FAILED',
  incomplete: 'DEPLOY_SIGNAL_INCOMPLETE',
  healthy: 'APPLICATION_ROLLED_OUT_HEALTHY',
  liveAiFailed: 'APPLICATION_ROLLED_OUT_HEALTHY__LIVE_AI_SMOKE_FAILED',
  liveAiTimeout: 'APPLICATION_ROLLED_OUT_HEALTHY__LIVE_AI_SMOKE_TIMEOUT',
  liveAiUnavailable: 'APPLICATION_ROLLED_OUT_HEALTHY__LIVE_AI_PROVIDER_UNAVAILABLE',
  liveAiSkipped: 'APPLICATION_ROLLED_OUT_HEALTHY__LIVE_AI_SMOKE_SKIPPED',
});

const HARD_CLASSIFICATION = Object.freeze({
  rollout: CLASSIFICATION.rolloutFailed,
  health: CLASSIFICATION.runtimeUnhealthy,
  deterministicSmoke: CLASSIFICATION.deterministicFailed,
});

const LIVE_AI_CLASSIFICATION = Object.freeze({
  fail: CLASSIFICATION.liveAiFailed,
  timeout: CLASSIFICATION.liveAiTimeout,
  unavailable: CLASSIFICATION.liveAiUnavailable,
  skipped: CLASSIFICATION.liveAiSkipped,
});

/**
 * Cung bo tu vung voi `verify-deployment.mjs`: mot truong mang ten nghe nhu bi mat thi bi LOAI
 * khoi bao cao, khong phai bi che mot phan. Bao cao deploy duoc dan len GitHub va giu lai lau,
 * nen o day chon phia mat du lieu chu khong phia lo du lieu.
 */
const SECRET_FIELD_PATTERN =
  /(?:password|secret|token|cookie|authorization|api[-_]?key|credential)/i;

/** Do dai toi da cua mot chuoi trong `detail`. Fixture tin mau la thu duy nhat dai that. */
const MAX_DETAIL_STRING = 160;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Doc so nhat ky. Dong nao khong phai tin hieu thi BO QUA — so nay di chung duong ong voi log
 * cua docker/compose, va mot bao cao chet vi mot dong log la mot bao cao khong ai tin duoc.
 */
export function parseSignalJournal(text) {
  const entries = [];
  const malformed = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const index = raw.indexOf(DEPLOY_SIGNAL_PREFIX);
    if (index < 0) continue;
    const payload = raw.slice(index + DEPLOY_SIGNAL_PREFIX.length).trim();
    try {
      const parsed = JSON.parse(payload);
      if (isPlainObject(parsed) && nonEmptyString(parsed.layer)) entries.push(parsed);
      else malformed.push(payload);
    } catch {
      malformed.push(payload);
    }
  }
  return { entries, malformed };
}

function redact(value, depth = 0) {
  if (depth > 4) return null;
  if (typeof value === 'string') {
    return value.length > MAX_DETAIL_STRING ? `${value.slice(0, MAX_DETAIL_STRING)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (!isPlainObject(value)) return null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_FIELD_PATTERN.test(key))
      .map(([key, child]) => [key, redact(child, depth + 1)]),
  );
}

function collectSignals(entries) {
  const signals = Object.fromEntries(DEPLOY_SIGNAL_LAYERS.map((layer) => [layer, { ...PENDING }]));
  for (const entry of entries) {
    const layer = nonEmptyString(entry.layer);
    if (!layer || !DEPLOY_SIGNAL_LAYERS.includes(layer)) continue;
    const status = nonEmptyString(entry.status);
    if (!status || !(status in STATUS_SEVERITY)) continue;
    const current = signals[layer];
    const currentSeverity = current.status === 'pending' ? -1 : STATUS_SEVERITY[current.status];
    // NGANG BANG THI BAN DAU TIEN THANG. Tang shell co mot cai bay `EXIT` phat ra mot ly do CHUNG
    // CHUNG cho giai doan dang chay, va no chay SAU khi bai kiem da phat ra ly do CU THE cua no.
    // De ban sau de len se doi mot chan doan dung ("model doan sai") lay mot chan doan vo dung
    // ("giai doan smoke that bai").
    if (STATUS_SEVERITY[status] <= currentSeverity) continue;
    signals[layer] = {
      status,
      reason: nonEmptyString(entry.reason) ?? 'UNSPECIFIED',
      detail: isPlainObject(entry.detail) ? redact(entry.detail) : null,
    };
  }
  return signals;
}

function collectRelease(entries) {
  const metaEntry = [...entries].reverse().find((entry) => entry.layer === 'meta');
  if (!metaEntry) return null;
  return {
    tenant: nonEmptyString(metaEntry.tenant) ?? null,
    environment: nonEmptyString(metaEntry.environment) ?? null,
    stack: nonEmptyString(metaEntry.stack) ?? null,
    gitSha: nonEmptyString(metaEntry.gitSha) ?? null,
    // NHA CUNG CAP da deploy ban nay (`northflank`). TUY CHON va CONG THEM: duong VM/GCP cu khong
    // phat truong nay nen no ra `null`, giu nguyen hinh dang cu. Runtime proof (Phase 3) dung no de
    // tu choi mot bang chung den tu duong khac voi duong da duoc phep (xem runtime-proof-core.mjs).
    provider: nonEmptyString(metaEntry.provider) ?? null,
    appDigest: nonEmptyString(metaEntry.appDigest) ?? null,
    flowiseDigest: nonEmptyString(metaEntry.flowiseDigest) ?? null,
    workflowRunId: nonEmptyString(metaEntry.workflowRunId) ?? null,
  };
}

/**
 * PHAN XU.
 *
 * `remoteExitCode` la ma thoat cua tang shell tren VM. No la LUOI AN TOAN cuoi cung: shell chet
 * o mot cho chua duoc gan tin hieu thi khong tang nao bao `fail`, va neu chi doc so nhat ky thi
 * ket qua se ra "moi thu deu qua". Truong hop do phai ra `DEPLOY_SIGNAL_INCOMPLETE` — khong bao
 * gio ra mau xanh.
 */
export function evaluateDeploySignals({ entries = [], remoteExitCode = 0 } = {}) {
  const signals = collectSignals(entries);
  const release = collectRelease(entries);

  const failedHardLayer = HARD_LAYERS.find((layer) => signals[layer].status === 'fail');
  const pendingHardLayer = HARD_LAYERS.find((layer) => signals[layer].status === 'pending');
  const liveAi = signals.liveAiSmoke;
  /*
   * TANG QUAN SAT khong `pass` va khong `skipped` thi di ra day.
   *
   * `pending` DUOC TINH LA MOT THAT BAI MEM, khong duoc bo qua: mot tang quan sat khong bao gi
   * nghia la buoc do khong chay — va mot bao cao im lang ve chinh cho no khong nhin la dung hinh
   * dang cua su co §7.1. `skipped` thi khac: do la mot cau tra loi that ("ban trien khai nay
   * khong bat cum quan sat"), nen no khong phai that bai.
   */
  const softFailures = SOFT_LAYERS.filter(
    (layer) => signals[layer].status !== 'pass' && signals[layer].status !== 'skipped',
  );

  // Mot tang cung bi do -> do la cau tra loi, va cac tang duoi giu nguyen `pending`.
  if (failedHardLayer) {
    return {
      ok: false,
      hardFailure: true,
      liveAiFailure: false,
      classification: HARD_CLASSIFICATION[failedHardLayer],
      failedLayer: failedHardLayer,
      softFailures,
      signals,
      release,
    };
  }

  // KHONG XANH GIA. Khong tang cung nao bao do, nhung hoac shell chet, hoac co tang chua bao gi:
  // ca hai deu nghia la lan deploy nay CHUA duoc chung minh.
  if (pendingHardLayer || liveAi.status === 'pending' || remoteExitCode !== 0) {
    return {
      ok: false,
      hardFailure: true,
      liveAiFailure: false,
      classification: CLASSIFICATION.incomplete,
      failedLayer: pendingHardLayer ?? (liveAi.status === 'pending' ? 'liveAiSmoke' : null),
      softFailures,
      signals,
      release,
    };
  }

  const liveAiFailure = liveAi.status !== 'pass' && liveAi.status !== 'skipped';
  const classification =
    liveAi.status === 'pass' ? CLASSIFICATION.healthy : LIVE_AI_CLASSIFICATION[liveAi.status];

  return {
    ok: !liveAiFailure,
    hardFailure: false,
    liveAiFailure,
    classification,
    failedLayer: liveAiFailure ? 'liveAiSmoke' : null,
    softFailures,
    signals,
    release,
  };
}

const STATUS_LABEL = Object.freeze({
  pass: 'PASS',
  fail: 'FAIL',
  timeout: 'TIMEOUT',
  unavailable: 'UNAVAILABLE',
  skipped: 'SKIPPED',
  pending: 'CHUA CHAY',
});

function renderValue(value) {
  return isPlainObject(value) || Array.isArray(value) ? JSON.stringify(value) : String(value);
}

function detailLines(detail) {
  if (!isPlainObject(detail)) return [];
  return Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `  - ${key}: \`${renderValue(value)}\``);
}

/** Bao cao cho NGUOI doc — dan thang vao `$GITHUB_STEP_SUMMARY`. */
export function formatDeploySummary(result) {
  const release = result.release ?? {};
  const shortSha = release.gitSha ? release.gitSha.slice(0, 12) : 'khong-ro';
  const rows = DEPLOY_SIGNAL_LAYERS.map((layer) => {
    const signal = result.signals[layer];
    return `| ${LAYER_LABELS[layer]} | **${STATUS_LABEL[signal.status]}** | \`${signal.reason}\` | ${LAYER_MEANING[layer]} |`;
  });

  const failing = result.failedLayer ? result.signals[result.failedLayer] : null;
  const evidence =
    failing && failing.detail
      ? [
          '',
          `**Bang chung — ${LAYER_LABELS[result.failedLayer]}**`,
          '',
          ...detailLines(failing.detail),
        ]
      : [];

  const soft = result.softFailures ?? [];
  // Cau nay TUNG la "Bon tin hieu deu dat.", va cau do se lai dung khi kenh doc da chet — dung
  // cai da xay ra suot 44 gio. Tang quan sat khong chan lan deploy, nhung no khong duoc phep bi
  // mot cau tong ket noi de len.
  const softNote =
    soft.length > 0
      ? `> Tang quan sat CHUA DAT: ${soft
          .map((layer) => `**${LAYER_LABELS[layer]}** (\`${result.signals[layer].reason}\`)`)
          .join(', ')}. Khong chan lan deploy, nhung phai co nguoi doc.`
      : null;

  const verdict = result.hardFailure
    ? '> Lan deploy nay **chua duoc chung minh**. Doc hang FAIL dau tien trong bang tren.'
    : result.liveAiFailure
      ? '> Ung dung **da len va dang khoe**. Tin hieu khong dat la **live AI** — mot phu thuoc ngoai, khong phai ha tang.'
      : soft.length > 0
        ? '> Ung dung **da len va dang khoe**. Con tang quan sat chua dat — xem dong ngay duoi.'
        : '> Moi tin hieu deu dat.';

  return [
    '## Deployment Signals',
    '',
    `- Khach: \`${release.tenant ?? 'khong-ro'}\``,
    `- Moi truong: \`${release.environment ?? 'khong-ro'}\``,
    `- Stack: \`${release.stack ?? 'khong-ro'}\``,
    `- Release: \`${shortSha}\``,
    `- App digest: \`${release.appDigest ?? 'khong-ro'}\``,
    `- Flowise digest: \`${release.flowiseDigest ?? 'khong-ro'}\``,
    `- Workflow run: \`${release.workflowRunId ?? 'khong-ro'}\``,
    '',
    '| Tin hieu | Ket qua | Ma ly do | Tra loi cau hoi |',
    '| --- | --- | --- | --- |',
    ...rows,
    ...evidence,
    '',
    '### FINAL CLASSIFICATION',
    '',
    `\`${result.classification}\``,
    '',
    verdict,
    ...(softNote ? ['', softNote] : []),
    '',
    '> Cach doc tung mau: `docs/phat-trien/van-hanh/tin-hieu-deploy.md`',
  ].join('\n');
}

/**
 * Ket qua cho MAY doc. Co y giu PHANG va nho: Fleet View sau nay phai tieu thu duoc no ma khong
 * phai parse log console, va mot khuon phang thi khong vo khi them tang moi.
 */
export function toMachineResult(result) {
  return {
    schema: 'deploy-signals/v1',
    release: result.release,
    ...Object.fromEntries(
      DEPLOY_SIGNAL_LAYERS.map((layer) => [layer, result.signals[layer].status]),
    ),
    reasons: Object.fromEntries(
      DEPLOY_SIGNAL_LAYERS.map((layer) => [layer, result.signals[layer].reason]),
    ),
    details: Object.fromEntries(
      DEPLOY_SIGNAL_LAYERS.map((layer) => [layer, result.signals[layer].detail]),
    ),
    classification: result.classification,
    failedLayer: result.failedLayer ?? null,
    hardFailure: result.hardFailure,
    liveAiFailure: result.liveAiFailure,
    // Tang quan sat khong dat. Danh sach RONG la mot khang dinh, khong phai mot cho trong.
    softFailures: result.softFailures ?? [],
    ok: result.ok,
  };
}
