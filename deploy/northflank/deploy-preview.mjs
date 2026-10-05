/**
 * DIEU PHOI MOT LAN DEPLOY XEM TRUOC LEN NORTHFLANK — chi dieu phoi I/O; moi quyet dinh nam o
 * `preview-contract.mjs`. Phat ra CUNG nhat ky `##DEPLOY-SIGNAL##` ma duong VM phat, nen `deploy-
 * signals/v1`, evaluator va runtime proof (Phase 3) dung chung mot schema — khong co schema thu hai.
 *
 * CAC TANG, THEO THU TU, MOI TANG CHI `pass` HOAC `fail`:
 *   rollout            validate yeu cau -> project ton tai -> doc mat khau van hanh -> PATCH web ->
 *                      PATCH api -> doi Northflank bao COMPLETED voi DUNG image@digest va co container
 *                      moi chay
 *   health             edge song, API song QUA EDGE (chung minh web -> api), trang web tra duoc
 *   deterministicSmoke chay NGUYEN `deterministic-smoke.mjs` qua URL cong khai (qua edge, nhu smoke
 *                      tren VM), voi EXPECTED_RELEASE_SHA = SHA da chung minh
 *
 * KHONG BAO GIO phat `timeout`/`unavailable` cho tang cung: evaluator cu chi coi `fail` la that bai
 * cung, nen mot tang cung mang trang thai khac se bi doc nham thanh "khong hong". Het gio = `fail`
 * voi ly do `*_TIMEOUT`.
 *
 * THOI GIAN VA MANG DUOC TIEM (`clock`, `fetchImpl`, `createClient`, `runSmoke`) de test tat dinh.
 */

import { spawn } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import {
  DEPLOY_SIGNAL_PREFIX,
  evaluateDeploySignals,
  formatDeploySummary,
  parseSignalJournal,
  toMachineResult,
} from '../netviet/deploy-signals.mjs';
import { NorthflankApiError, createNorthflankClient, scrub } from './northflank-api.mjs';
import {
  NORTHFLANK_PROVIDER,
  OPERATOR_PASSWORD_KEY,
  OPERATOR_SECRET_GROUP,
  OPERATOR_USERNAME,
  PreviewDeployError,
  assertPreviewRequest,
  buildReleaseManifest,
  buildServicePatch,
} from './preview-contract.mjs';

const MS = 1000;
export const DEFAULT_TIMEOUTS = Object.freeze({
  pollIntervalMs: 10 * MS,
  webOriginMs: 2 * 60 * MS,
  rolloutMs: 15 * 60 * MS,
  healthMs: 8 * 60 * MS,
  probeRequestMs: 10 * MS,
});

/** Mot tang da ghi `fail` — dung dieu phoi, KHONG phai mot loi bat ngo. */
export class StageAborted extends Error {
  constructor(layer, reason) {
    super(`${layer}: ${reason}`);
    this.name = 'StageAborted';
    this.layer = layer;
    this.reason = reason;
  }
}

class StageFailure extends Error {
  constructor(reason, detail = {}) {
    super(reason);
    this.reason = reason;
    this.detail = detail;
  }
}

export const realClock = Object.freeze({
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

// ---------------------------------------------------------------------------------------------
// NHAT KY
// ---------------------------------------------------------------------------------------------

/**
 * @param {{ logPath?: string, write?: (text: string) => void }} options
 * Moi dong vua vao bo nho (de danh gia), vua vao tep (cho buoc bao cao), vua ra stdout (cho nguoi doc).
 */
export function createJournal({ logPath, write = (text) => process.stdout.write(text) } = {}) {
  const lines = [];
  const push = (line) => {
    lines.push(line);
    write(`${line}\n`);
    if (logPath) appendFileSync(logPath, `${line}\n`, 'utf8');
  };
  return {
    emit: (entry) => push(`${DEPLOY_SIGNAL_PREFIX} ${JSON.stringify(entry)}`),
    /** Dong tin hieu da co san (do smoke phat ra), giu nguyen. */
    raw: (line) => push(line),
    text: () => `${lines.join('\n')}\n`,
  };
}

// ---------------------------------------------------------------------------------------------
// DOC TRANG THAI NORTHFLANK
// ---------------------------------------------------------------------------------------------

/** `imagePath` Northflank tra co the bo ten mien; so sanh khong phan biet chuyen do. */
const normalizeImage = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^ghcr\.io\//, '');

export const sameImage = (expected, actual) =>
  normalizeImage(expected) !== '' && normalizeImage(expected) === normalizeImage(actual);

/** `createdAt` la so giay (vi du 1611241087), nhung chap nhan ca mili-giay va chuoi ISO. */
export function toEpochSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.NaN : Math.floor(parsed / 1000);
  }
  return Number.NaN;
}

function publicDns(service) {
  const ports = Array.isArray(service?.ports) ? service.ports : [];
  const port = ports.find((candidate) => candidate?.public === true && candidate?.dns);
  return port?.dns ?? null;
}

/**
 * Doi mot loi tu Northflank thanh `StageFailure` co ma co kieu. CHI bao loi API that su
 * (`NorthflankApiError`): mot loi la (TypeError trong client, bug cua ta) di tiep nguyen ven de ranh
 * gioi tang ghi `DEPLOY_HARNESS_ERROR` — gan nhan no la loi cua Northflank se che mat mot bug cua ta.
 *
 * Chi tiet mang HTTP status + thong bao DA scrub (xem `northflank-api.mjs`), khong mang than yeu cau.
 */
function wrapApiError(error, notFound, detail = {}) {
  if (!(error instanceof NorthflankApiError)) return error;
  let reason = 'NORTHFLANK_API_ERROR';
  if (error.status === 401 || error.status === 403) reason = 'NORTHFLANK_AUTH_FAILED';
  else if (error.status === 404) reason = notFound;
  return new StageFailure(reason, { ...detail, httpStatus: error.status, message: error.message });
}

async function pollUntil({ clock, intervalMs, timeoutMs, attempt }) {
  const deadline = clock.now() + timeoutMs;
  let last = { done: false };
  for (;;) {
    last = await attempt();
    if (last.done) return last;
    if (clock.now() >= deadline) return { ...last, timedOut: true };
    await clock.sleep(intervalMs);
  }
}

async function waitForWebOrigin({ client, request, clock, timeouts }) {
  const result = await pollUntil({
    clock,
    intervalMs: timeouts.pollIntervalMs,
    timeoutMs: timeouts.webOriginMs,
    attempt: async () => {
      const service = await client.getService(request.projectId, request.webServiceId);
      const dns = publicDns(service);
      return dns ? { done: true, origin: `https://${dns}` } : { done: false };
    },
  });
  if (!result.done) throw new StageFailure('WEB_PUBLIC_URL_UNKNOWN');
  return result.origin;
}

/**
 * So container dang chay NEU TAT CA deu la container MOI (tao sau `sinceSeconds`); 0 neu con bat ky
 * container cu nao dang chay hoac khong co container nao. "Tat ca" chu khong phai "it nhat mot": khi
 * cuon (rolling) container cu song them mot luc, va mot lan smoke chay vao no se do danh tinh/ben vung
 * cua TIEN TRINH CU — dung cai ma smoke sau restart phai loai tru.
 */
function freshRunning(listing, sinceSeconds) {
  const containers = Array.isArray(listing?.containers) ? listing.containers : [];
  const running = containers.filter((container) => container?.status === 'TASK_RUNNING');
  const fresh = running.filter((container) => toEpochSeconds(container.createdAt) >= sinceSeconds);
  return fresh.length > 0 && fresh.length === running.length ? fresh.length : 0;
}

/**
 * Doi Northflank noi rollout XONG voi DUNG image, VA co mot container MOI dang chay (va khong con
 * container cu). Chi doc `status = COMPLETED` la khong du: ngay sau PATCH no con la trang thai cua
 * revision CU.
 */
async function waitForRollout({ client, request, serviceId, sinceSeconds, clock, timeouts }) {
  const result = await pollUntil({
    clock,
    intervalMs: timeouts.pollIntervalMs,
    timeoutMs: timeouts.rolloutMs,
    attempt: async () => {
      const service = await client.getService(request.projectId, serviceId);
      const status = service?.status?.deployment?.status;
      if (status === 'FAILED') throw new StageFailure('ROLLOUT_FAILED', { serviceId });
      const deployedImage = service?.deployment?.external?.imagePath;
      if (status !== 'COMPLETED' || !sameImage(request.imageRef, deployedImage)) {
        return { done: false, status, imageMatches: sameImage(request.imageRef, deployedImage) };
      }
      const listing = await client.listContainers(request.projectId, serviceId);
      const fresh = freshRunning(listing, sinceSeconds);
      return fresh > 0
        ? { done: true, imagePath: deployedImage, runningContainers: fresh }
        : { done: false, status, imageMatches: true, runningContainers: 0 };
    },
  });
  if (!result.done) {
    throw new StageFailure('ROLLOUT_TIMEOUT', {
      serviceId,
      lastStatus: result.status ?? null,
      imageMatches: result.imageMatches ?? false,
    });
  }
  return { serviceId, imagePath: result.imagePath, runningContainers: result.runningContainers };
}

// ---------------------------------------------------------------------------------------------
// TANG ROLLOUT
// ---------------------------------------------------------------------------------------------

function buildRequest(env) {
  return {
    provider: env.PROVIDER,
    tenant: env.TENANT,
    environment: env.ENVIRONMENT,
    profile: env.DEPLOYMENT_PROFILE,
    stackSlug: env.STACK_SLUG,
    gitSha: env.GIT_SHA,
    imageRef: env.IMAGE_REF,
    projectId: env.NORTHFLANK_PROJECT_ID,
    apiServiceId: env.NORTHFLANK_API_SERVICE_ID,
    webServiceId: env.NORTHFLANK_WEB_SERVICE_ID,
    githubRef: env.GITHUB_REF,
    ciConclusion: env.GD1_TEST_CI_CONCLUSION,
    token: env.NORTHFLANK_API_TOKEN,
  };
}

async function readOperatorPassword({ client, request }) {
  let details;
  try {
    details = await client.getSecretDetails(request.projectId, OPERATOR_SECRET_GROUP);
  } catch (error) {
    throw wrapApiError(error, 'OPERATOR_SECRET_MISSING');
  }
  const password = details?.secrets?.variables?.[OPERATOR_PASSWORD_KEY];
  if (typeof password !== 'string' || password.length < 12) {
    throw new StageFailure('OPERATOR_SECRET_MISSING');
  }
  return password;
}

/**
 * Moi thu phai dung TRUOC KHI cham vao bat ky service nao: yeu cau hop le, token dung duoc, project
 * ton tai, doc duoc mat khau van hanh. Dung chung cho preflight (truoc khi build) va deploy that —
 * hai duong khong the lech nhau ve "the nao la du dieu kien".
 */
async function prepare({ request, createClient, fetchImpl, mask, requireImage }) {
  try {
    assertPreviewRequest(request, { requireImage });
  } catch (error) {
    if (error instanceof PreviewDeployError) throw new StageFailure(error.code);
    throw error;
  }

  const client = createClient({ token: request.token, fetchImpl });
  try {
    await client.getProject(request.projectId);
  } catch (error) {
    throw wrapApiError(error, 'NORTHFLANK_PROJECT_NOT_FOUND');
  }

  const password = await readOperatorPassword({ client, request });
  mask(password);
  return { client, password };
}

const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

/**
 * Northflank keo image tu GHCR KHONG kem thong tin dang nhap (khong co registry credentials nao duoc
 * cau hinh). Mot goi GHCR moi tao mac dinh la PRIVATE, nen lan deploy dau tien se chet o buoc keo image
 * voi trieu chung chung chung (rollout khong bao gio xong). Kiem tra keo AN DANH ngay truoc khi cham
 * vao service nao, de that bai co ten rieng va chua dong vao gi.
 *
 * Neu sau nay dung registry credentials rieng cho image private, kiem tra nay phai duoc bo qua co chu y.
 */
async function assertImagePullable({ imageRef, fetchImpl, timeouts }) {
  const match = /^ghcr\.io\/(.+)@(sha256:[a-f0-9]{64})$/.exec(imageRef);
  if (!match) throw new StageFailure('IMAGE_REF_INVALID');
  const [, name, digest] = match;
  const timeout = () => AbortSignal.timeout(Math.max(timeouts.probeRequestMs * 3, 1));
  try {
    const tokenResponse = await fetchImpl(
      `https://ghcr.io/token?service=ghcr.io&scope=repository:${name}:pull`,
      { signal: timeout() },
    );
    const anonymous = tokenResponse.ok ? (await tokenResponse.json())?.token : null;
    if (typeof anonymous !== 'string' || anonymous === '') {
      throw new StageFailure('IMAGE_NOT_PUBLIC', { httpStatus: tokenResponse.status });
    }
    const manifest = await fetchImpl(`https://ghcr.io/v2/${name}/manifests/${digest}`, {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${anonymous}`, Accept: MANIFEST_ACCEPT },
      signal: timeout(),
    });
    if (!manifest.ok) throw new StageFailure('IMAGE_NOT_PUBLIC', { httpStatus: manifest.status });
  } catch (error) {
    if (error instanceof StageFailure) throw error;
    throw new StageFailure('IMAGE_REGISTRY_UNREACHABLE');
  }
}

async function runRollout({ env, request, createClient, fetchImpl, clock, timeouts, mask }) {
  const { client, password } = await prepare({
    request,
    createClient,
    fetchImpl,
    mask,
    requireImage: true,
  });
  // Truoc moi PATCH: neu Northflank khong keo duoc image thi khong dong vao service nao.
  await assertImagePullable({ imageRef: request.imageRef, fetchImpl, timeouts });

  const manifest = buildReleaseManifest({
    gitSha: request.gitSha,
    imageRef: request.imageRef,
    workflowRunId: env.GITHUB_RUN_ID,
    deployedAt: new Date(clock.now()).toISOString(),
  });
  const sinceSeconds = Math.floor(clock.now() / MS) - 5;

  try {
    // web truoc: URL cong khai cua no la `CORS_ORIGIN`/`PUBLIC_BASE_URL` cua api.
    await client.patchDeploymentService(
      request.projectId,
      request.webServiceId,
      buildServicePatch('web', { imageRef: request.imageRef, webOrigin: undefined, manifest }),
    );
  } catch (error) {
    throw wrapApiError(error, 'NORTHFLANK_SERVICE_NOT_FOUND', { serviceId: request.webServiceId });
  }
  const webOrigin = await waitForWebOrigin({ client, request, clock, timeouts });

  try {
    await client.patchDeploymentService(
      request.projectId,
      request.apiServiceId,
      buildServicePatch('api', { imageRef: request.imageRef, webOrigin, manifest }),
    );
  } catch (error) {
    throw wrapApiError(error, 'NORTHFLANK_SERVICE_NOT_FOUND', { serviceId: request.apiServiceId });
  }

  const web = await waitForRollout({
    client,
    request,
    serviceId: request.webServiceId,
    sinceSeconds,
    clock,
    timeouts,
  });
  const api = await waitForRollout({
    client,
    request,
    serviceId: request.apiServiceId,
    sinceSeconds,
    clock,
    timeouts,
  });

  return {
    client,
    password,
    webOrigin,
    reason: 'ROLLOUT_COMPLETE',
    detail: {
      provider: NORTHFLANK_PROVIDER,
      projectId: request.projectId,
      imageRef: request.imageRef,
      web,
      api,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// TANG HEALTH
// ---------------------------------------------------------------------------------------------

async function probe(fetchImpl, url, timeoutMs) {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      body,
      type: response.headers.get('content-type') ?? '',
    };
  } catch {
    return { ok: false, status: 0, body: '', type: '' };
  }
}

async function waitFor({ clock, timeouts, check }) {
  const result = await pollUntil({
    clock,
    intervalMs: timeouts.pollIntervalMs,
    timeoutMs: timeouts.healthMs,
    attempt: async () => ({ done: await check() }),
  });
  return result.done;
}

async function runHealth({ webOrigin, fetchImpl, clock, timeouts }) {
  const get = (path) => probe(fetchImpl, `${webOrigin}${path}`, timeouts.probeRequestMs);

  if (!(await waitFor({ clock, timeouts, check: async () => (await get('/__edge_health')).ok }))) {
    throw new StageFailure('WEB_EDGE_UNREACHABLE');
  }
  // `/health` di QUA EDGE toi API: mot cau tra loi dung chung minh dinh tuyen web -> api.
  const apiHealthy = async () => {
    const result = await get('/health');
    if (!result.ok) return false;
    try {
      return JSON.parse(result.body)?.status === 'ok';
    } catch {
      return false;
    }
  };
  if (!(await waitFor({ clock, timeouts, check: apiHealthy }))) {
    throw new StageFailure('API_HEALTH_FAILED', { edge: 'ok' });
  }
  const page = await get('/');
  if (!page.ok || !/text\/html/i.test(page.type)) {
    throw new StageFailure('WEB_PAGE_FAILED', { status: page.status });
  }
  return { reason: 'HEALTHY', detail: { probes: ['edge', 'api-via-edge', 'web-page'] } };
}

// ---------------------------------------------------------------------------------------------
// TANG SMOKE
// ---------------------------------------------------------------------------------------------

/**
 * Chay `deterministic-smoke.mjs` voi MOI TRUONG TUONG MINH. Khong ke thua `process.env`: tien trinh
 * con khong duoc thay `NORTHFLANK_API_TOKEN` (hay bat ky bi mat nao khac cua job).
 */
export function runSmokeProcess({
  baseUrl,
  password,
  gitSha,
  phase = 'pre',
  baseline,
  repositoryRoot = process.cwd(),
}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['deploy/netviet/deterministic-smoke.mjs'], {
      cwd: repositoryRoot,
      env: {
        PATH: process.env.PATH ?? '',
        PILOT_BASE_URL: baseUrl,
        PILOT_AUTH_MODE: 'session',
        PILOT_OPERATOR_USERNAME: OPERATOR_USERNAME,
        PILOT_OPERATOR_PASSWORD: password,
        EXPECTED_RELEASE_SHA: gitSha,
        TENANT_DIR: `${repositoryRoot}/tenants/transport-preview`,
        DETERMINISTIC_PHASE: phase,
        // Baseline cua pha truoc: pha `post-restart` doi chieu knowledge/readiness/SHA voi no.
        ...(baseline ? { DETERMINISTIC_BASELINE: baseline } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', () => resolve({ exitCode: 1, stdout }));
    child.on('close', (code) => resolve({ exitCode: code ?? 1, stdout }));
  });
}

/**
 * Mot pha smoke. Tra ve `baseline` (dong `DETERMINISTIC_BASELINE=` cua smoke) de pha sau doi chieu.
 * `phase`: `pre` (ngay sau rollout) hoac `post-restart` (sau khi khoi dong lai — chung minh ben vung).
 */
async function runSmoke({ webOrigin, password, request, runSmoke: run, journal, phase, baseline }) {
  const { exitCode, stdout } = await run({
    baseUrl: webOrigin,
    password,
    gitSha: request.gitSha,
    phase,
    baseline,
  });
  const signalLines = stdout.split(/\r?\n/).filter((line) => line.includes(DEPLOY_SIGNAL_PREFIX));
  // Giu nguyen dong cua smoke: no mang ly do CU THE (model sai, route 404, SHA lech...).
  for (const line of signalLines) journal.raw(line);
  const smoke = parseSignalJournal(signalLines.join('\n')).entries.filter(
    (entry) => entry.layer === 'deterministicSmoke',
  );
  const passed = smoke.some((entry) => entry.status === 'pass');
  const failed = smoke.some((entry) => entry.status !== 'pass');
  if (exitCode === 0 && passed && !failed) {
    const baselines = [...stdout.matchAll(/^DETERMINISTIC_BASELINE=(.+)$/gm)];
    const found = baselines.at(-1)?.[1]?.trim();
    // Khong co baseline thi pha `post-restart` AM THAM bo qua phep doi chieu ben vung/SHA (smoke chi so
    // sanh khi co baseline) — mot cong bi lam yeu ma khong ai thay. Fail closed.
    if (phase === 'pre' && !found) throw new StageFailure('DETERMINISTIC_BASELINE_MISSING');
    return { baseline: found };
  }
  // Smoke chet ma khong ke ly do (hoac thoat 0 ma khong bao pass): van la that bai, khong doan.
  if (failed) throw new StageAborted('deterministicSmoke', 'SMOKE_REPORTED_FAILURE');
  throw new StageFailure(
    exitCode === 0 ? 'DETERMINISTIC_NO_SIGNAL' : 'DETERMINISTIC_HARNESS_ERROR',
  );
}

/**
 * KHOI DONG LAI roi kiem lai — nua con lai cua cong smoke ma VM da co (`deploy-stack.sh` chay smoke hai
 * pha quanh `--force-recreate api web`, bat bien 7 cua ci-cd.md: cong smoke khong duoc lam yeu).
 *
 * Restart api + web, doi TAT CA container dang chay deu la container MOI (khong smoke nham tien trinh
 * cu), roi health lai. Ket qua do duoc ghi vao tang `deterministicSmoke`: truoc khi co buoc nay,
 * "Postgres ben vung qua khoi dong lai" la mot cau khang dinh chua tung duoc do tren Northflank.
 */
async function runRestart({ client, request, webOrigin, fetchImpl, clock, timeouts }) {
  const services = [request.apiServiceId, request.webServiceId];
  const sinceSeconds = Math.floor(clock.now() / MS) - 5;
  for (const serviceId of services) {
    try {
      await client.restartService(request.projectId, serviceId);
    } catch (error) {
      if (!(error instanceof NorthflankApiError)) throw error;
      throw new StageFailure('RESTART_FAILED', {
        serviceId,
        httpStatus: error.status,
        message: error.message,
      });
    }
  }
  for (const serviceId of services) {
    const result = await pollUntil({
      clock,
      intervalMs: timeouts.pollIntervalMs,
      timeoutMs: timeouts.rolloutMs,
      attempt: async () => ({
        done:
          freshRunning(await client.listContainers(request.projectId, serviceId), sinceSeconds) > 0,
      }),
    });
    if (!result.done) throw new StageFailure('RESTART_TIMEOUT', { serviceId });
  }
  try {
    await runHealth({ webOrigin, fetchImpl, clock, timeouts });
  } catch (error) {
    throw new StageFailure('POST_RESTART_HEALTH_FAILED', {
      cause: error instanceof StageFailure ? error.reason : 'UNEXPECTED',
    });
  }
}

// ---------------------------------------------------------------------------------------------
// DIEU PHOI
// ---------------------------------------------------------------------------------------------

/** Che mat khau trong log cua GitHub Actions. CHI trong Actions: o may dev lenh nay se IN mat khau. */
export function defaultMask(env) {
  return (value) => {
    if (env.GITHUB_ACTIONS !== 'true') return;
    for (const line of String(value).split(/\r?\n/)) {
      if (line) process.stdout.write(`::add-mask::${line}\n`);
    }
  };
}

/**
 * Khai bao ban phat hanh DA DUOC YEU CAU ngay tu dau: ke ca khi that bai, bao cao noi duoc "dinh
 * deploy cai gi" (nhung tang cung se KHONG pass nen khong the duoc tinh la bang chung).
 */
function emitMeta(journal, request, env) {
  journal.emit({
    layer: 'meta',
    tenant: request.tenant,
    environment: request.environment,
    stack: request.stackSlug,
    gitSha: request.gitSha,
    provider: request.provider,
    appDigest: request.imageRef,
    workflowRunId: env.GITHUB_RUN_ID,
  });
}

/** Chay mot tang: pass -> ghi pass; loi -> ghi fail voi ma co kieu roi nem `StageAborted`. */
function makeStage(journal, request) {
  return async (layer, action) => {
    try {
      const result = await action();
      journal.emit({ layer, status: 'pass', reason: result.reason, detail: result.detail });
      return result;
    } catch (error) {
      const reason = error instanceof StageFailure ? error.reason : 'DEPLOY_HARNESS_ERROR';
      const detail =
        error instanceof StageFailure
          ? error.detail
          : {
              message: scrub(error instanceof Error ? error.message : String(error), [
                request.token,
              ]),
            };
      journal.emit({ layer, status: 'fail', reason, detail });
      throw new StageAborted(layer, reason);
    }
  };
}

/**
 * PREFLIGHT — chay TRUOC khi build/push image (build mat ~10 phut). Kiem dung nhung dieu kien ma deploy
 * that se kiem o dau tang `rollout` (yeu cau, token, project, mat khau van hanh) nhung KHONG cham vao
 * service nao va KHONG phat tin hieu pass: thanh cong khong chung minh gi ve ban phat hanh.
 * That bai thi phat `rollout: fail` voi ma co kieu, de bao cao runtime noi duoc ly do ngay lap tuc.
 *
 * Tra ve `true` neu du dieu kien; nem `StageAborted` neu khong (tin hieu fail da duoc ghi).
 */
export async function runPreflight({
  env,
  journal,
  createClient = createNorthflankClient,
  fetchImpl = globalThis.fetch,
  mask = defaultMask(env),
}) {
  const request = buildRequest(env);
  emitMeta(journal, request, env);
  const failed = makeStage(journal, request);
  try {
    await prepare({ request, createClient, fetchImpl, mask, requireImage: false });
  } catch (error) {
    // Chi duong that bai moi qua `makeStage`: thanh cong KHONG duoc ghi `pass`.
    await failed('rollout', async () => {
      throw error;
    });
  }
  return true;
}

export async function runPreviewDeploy({
  env,
  journal,
  createClient = createNorthflankClient,
  fetchImpl = globalThis.fetch,
  runSmoke: runSmokeImpl = ({ baseUrl, password, gitSha, phase, baseline }) =>
    runSmokeProcess({ baseUrl, password, gitSha, phase, baseline }),
  clock = realClock,
  timeouts = DEFAULT_TIMEOUTS,
  mask = defaultMask(env),
}) {
  const request = buildRequest(env);
  emitMeta(journal, request, env);
  const stage = makeStage(journal, request);

  const rollout = await stage('rollout', () =>
    runRollout({ env, request, createClient, fetchImpl, clock, timeouts, mask }),
  );
  await stage('health', () =>
    runHealth({ webOrigin: rollout.webOrigin, fetchImpl, clock, timeouts }),
  );

  // Tang smoke tat dinh gom HAI PHA quanh mot lan khoi dong lai (nhu VM). Moi that bai o day — ke ca
  // restart khong len — deu ghi `deterministicSmoke: fail`, vi do chinh la nua con lai cua cong do.
  const smokeLayer = async (action) => {
    try {
      return await action();
    } catch (error) {
      if (error instanceof StageAborted) throw error;
      const reason = error instanceof StageFailure ? error.reason : 'DETERMINISTIC_HARNESS_ERROR';
      const detail =
        error instanceof StageFailure
          ? error.detail
          : {
              message: scrub(error instanceof Error ? error.message : String(error), [
                request.token,
              ]),
            };
      journal.emit({ layer: 'deterministicSmoke', status: 'fail', reason, detail });
      throw new StageAborted('deterministicSmoke', reason);
    }
  };
  const smokeInput = {
    webOrigin: rollout.webOrigin,
    password: rollout.password,
    request,
    runSmoke: runSmokeImpl,
    journal,
  };
  const first = await smokeLayer(() => runSmoke({ ...smokeInput, phase: 'pre' }));
  await smokeLayer(() =>
    runRestart({
      client: rollout.client,
      request,
      webOrigin: rollout.webOrigin,
      fetchImpl,
      clock,
      timeouts,
    }),
  );
  await smokeLayer(() =>
    runSmoke({ ...smokeInput, phase: 'post-restart', baseline: first.baseline }),
  );

  // Ba tang con lai: CAU TRA LOI THAT cua ho so nay, khong phai `pending` (`pending` bi tinh la that
  // bai mem cho quan sat va la "chua chung minh" cho live AI).
  journal.emit({ layer: 'liveAiSmoke', status: 'skipped', reason: 'PROFILE_HAS_NO_PARSER' });
  journal.emit({ layer: 'observability', status: 'skipped', reason: 'OBSERVABILITY_STACK_OFF' });
  journal.emit({ layer: 'channelListener', status: 'skipped', reason: 'PROFILE_HAS_NO_CHANNEL' });
}

/** Danh gia nhat ky bang CHINH evaluator cua duong VM. `exitCode !== 0` => khong bao gio xanh. */
export function finalizeSignals({ journalText, exitCode }) {
  const parsed = parseSignalJournal(journalText);
  const result = evaluateDeploySignals({ entries: parsed.entries, remoteExitCode: exitCode });
  return {
    machine: toMachineResult(result),
    summary: formatDeploySummary(result),
    passed: result.ok && !result.hardFailure && exitCode === 0,
  };
}

export function writeFinalReport({ machine, summary }, { jsonPath, summaryPath }) {
  if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(machine, null, 2)}\n`, 'utf8');
  if (summaryPath) appendFileSync(summaryPath, `${summary}\n`, 'utf8');
}
