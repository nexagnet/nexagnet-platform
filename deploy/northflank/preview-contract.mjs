/**
 * HOP DONG DEPLOY CUA BAN XEM TRUOC TREN NORTHFLANK (Autopilot V4 / Phase 3) — ham thuan, khong I/O.
 *
 * ---------------------------------------------------------------------------------------------
 * PHAM VI CO Y HEP: MOT muc duy nhat, `transport-preview/gd1-test`, tren Developer Sandbox. Khong
 * production, khong tenant khach, khong GCP. Moi quyet dinh "co duoc deploy khong" nam o day de
 * test duoc ma khong can Northflank, GitHub hay Docker; `deploy-preview.mjs` chi dieu phoi I/O.
 *
 * MAC DINH LA TU CHOI. Moi kiem tra nem `PreviewDeployError` mang MA CO KIEU (loc duoc, khong phai
 * cau van xuoi). Khong co duong "doan roi chay tiep": thieu SHA, thieu token, sai provider, sai
 * muc tieu, image khong bam digest -> dung truoc khi cham vao Northflank.
 *
 * EXACT-SHA. Chuoi bang chung cua mot lan deploy la:
 *   SHA da chung minh boi CI  ->  image build tu checkout CHINH SHA do (`BUILD_REVISION` nuong trong
 *   image)  ->  Northflank chay `imagePath@sha256:<digest>` do  ->  tien trinh DANG CHAY tu bao cao
 *   cung SHA do (`release.json` do lan deploy nay mount, doi chieu voi `BUILD_REVISION` luc boot).
 * Mat bat ky mat xich nao thi lan deploy KHONG duoc tinh la bang chung.
 *
 * KHONG CHUA BI MAT. Moi gia tri bi mat (mat khau nguoi van hanh, SESSION_SECRET, API_KEY, URL
 * Postgres) song trong secret group cua project Northflank va KHONG di qua tep nay.
 */

import {
  describeRuntimeContract,
  resolveDeploymentProfile,
} from '../netviet/deployment-profiles.mjs';

export const NORTHFLANK_PROVIDER = 'northflank';

/** Muc tieu DUY NHAT. Hang so, khong doc tu registry/Issue/payload: registry chi CHON no, khong dat ten no. */
export const PREVIEW_TARGET = Object.freeze({
  tenant: 'transport-preview',
  environment: 'gd1-test',
  profile: 'transport-preview-gd1-test',
  stackSlug: 'transport-preview-gd1-test',
});

/** Duong dan goi mau trong image xem truoc (la goi tong hop, khong co du lieu khach). */
export const TENANT_DIR_IN_IMAGE = '/app/tenants/transport-preview';
export const RELEASE_MANIFEST_PATH = '/runtime/release.json';
export const OPERATOR_SECRET_GROUP = 'preview-secrets';
export const OPERATOR_USERNAME = 'preview-operator';
export const OPERATOR_PASSWORD_KEY = 'PILOT_OPERATOR_PASSWORD';

export const SHA_PATTERN = /^[a-f0-9]{40}$/;
/** GHCR, bam DIGEST (khong phai tag): tag co the bi day de, digest thi khong. */
export const IMAGE_REF_PATTERN =
  /^ghcr\.io\/[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)+@sha256:[a-f0-9]{64}$/;
/** Slug Northflank cho project/service/secret group. */
export const NORTHFLANK_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Ma loi co kieu. Moi ma la mot hong hoc khac nhau — dung gop. */
export const PREVIEW_ERRORS = Object.freeze({
  providerMismatch: 'PROVIDER_NOT_NORTHFLANK',
  targetNotAllowed: 'TARGET_NOT_ALLOWED',
  gitShaInvalid: 'GIT_SHA_INVALID',
  imageRefInvalid: 'IMAGE_REF_INVALID',
  idInvalid: 'NORTHFLANK_ID_INVALID',
  refNotMain: 'REF_NOT_MAIN',
  ciNotSuccess: 'CI_NOT_SUCCESS',
  credentialsMissing: 'NORTHFLANK_CREDENTIALS_MISSING',
});

export class PreviewDeployError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PreviewDeployError';
    this.code = code;
  }
}

const refuse = (code, message) => {
  throw new PreviewDeployError(code, message);
};

/**
 * Chan mot yeu cau deploy TRUOC khi cham vao Northflank. Nem o loi dau tien; thu tu di tu "dung muc
 * tieu khong" toi "co duoc phep khong" toi "du dau vao khong".
 *
 * Gia tri token KHONG BAO GIO vao thong bao loi: chi biet co hay khong.
 *
 * `requireImage: false` chi danh cho PREFLIGHT (chay TRUOC khi build, nen chua co image): moi kiem tra
 * khac giu nguyen. Deploy that luon dung mac dinh `true`.
 */
export function assertPreviewRequest(request, { requireImage = true } = {}) {
  const r = request ?? {};
  if (r.provider !== NORTHFLANK_PROVIDER) {
    refuse(
      PREVIEW_ERRORS.providerMismatch,
      `Muc tieu phai chay tren provider '${NORTHFLANK_PROVIDER}', khong phai '${String(r.provider)}'.`,
    );
  }
  for (const key of ['tenant', 'environment', 'profile', 'stackSlug']) {
    if (r[key] !== PREVIEW_TARGET[key]) {
      refuse(
        PREVIEW_ERRORS.targetNotAllowed,
        `Northflank Sandbox chi nhan ${PREVIEW_TARGET.tenant}/${PREVIEW_TARGET.environment} ` +
          `(${key} = '${String(r[key])}').`,
      );
    }
  }
  if (typeof r.gitSha !== 'string' || !SHA_PATTERN.test(r.gitSha)) {
    refuse(PREVIEW_ERRORS.gitShaInvalid, 'git_sha phai la full SHA 40 ky tu chu thuong.');
  }
  if (requireImage && (typeof r.imageRef !== 'string' || !IMAGE_REF_PATTERN.test(r.imageRef))) {
    refuse(
      PREVIEW_ERRORS.imageRefInvalid,
      'Image phai la ghcr.io/<owner>/<repo>/...@sha256:<64 hex> (bam digest, khong bam tag).',
    );
  }
  for (const key of ['projectId', 'apiServiceId', 'webServiceId']) {
    if (typeof r[key] !== 'string' || !NORTHFLANK_ID_PATTERN.test(r[key])) {
      refuse(PREVIEW_ERRORS.idInvalid, `${key} khong phai slug Northflank hop le.`);
    }
  }
  if (r.githubRef !== 'refs/heads/main') {
    refuse(PREVIEW_ERRORS.refNotMain, 'Moi truong gd1-test chi duoc deploy tu refs/heads/main.');
  }
  if (r.ciConclusion !== 'success') {
    refuse(
      PREVIEW_ERRORS.ciNotSuccess,
      `CI cua dung SHA nay phai ket luan 'success' (dang la '${String(r.ciConclusion ?? 'khong-co')}').`,
    );
  }
  if (typeof r.token !== 'string' || r.token.trim() === '') {
    refuse(
      PREVIEW_ERRORS.credentialsMissing,
      'Thieu NORTHFLANK_API_TOKEN (GitHub Environment secret) — khong co thong tin dang nhap Northflank.',
    );
  }
}

// ---------------------------------------------------------------------------------------------
// HO SO DICH VU
// ---------------------------------------------------------------------------------------------

/**
 * Hai dich vu, MOT image. `api` boot theo `start-api.sh` (migrate + seed + Nest); `web` chay Next sau
 * mot Caddy cung container (xem `Caddyfile`): Developer Sandbox chi co 2 service nen khong co cho
 * cho gateway rieng, ma hop dong route mot-origin (cookie `lax` + `X-Forwarded-Proto https`) van
 * phai giu.
 *
 * CHI `web` CONG KHAI. `api` chi nhan luu luong noi bo tu Caddy qua DNS cua project. Do la ly do khong
 * can khoa origin: ban Northflank + Cloudflare truoc day (PR #324) phai cong khai ca api cho Worker
 * goi, roi moi phat hien policy cong cua Sandbox bi API nuot im lang (do 18/09/2026) va phai chuyen
 * khoa vao ung dung. O day khong co duong nao di vong qua edge de phai khoa.
 */
export const SERVICE_ROLES = Object.freeze({
  api: Object.freeze({
    port: 3001,
    public: false,
    command: 'sh /app/deploy/northflank/start-api.sh',
    healthPath: '/health',
  }),
  web: Object.freeze({
    port: 3000,
    public: true,
    command: 'sh /app/deploy/northflank/start-web.sh',
    // Rieng cua edge, KHONG di qua API: web khong duoc "chet" chi vi API dang khoi dong.
    healthPath: '/__edge_health',
  }),
});

/**
 * Bien moi truong KHONG BI MAT. Suy tu ho so (`describeRuntimeContract`) thay vi chep tay, de env
 * Northflank khong the lech khoi ho so `transport-preview-gd1-test`.
 *
 * MOT CHO LECH CO Y, VA NO PHAI DUOC NOI RA: ho so khai `mediaStore: 'gcs'` (bucket GCS) — GCP — nen
 * o day dat `MEDIA_STORE=none`. He qua THAT: nen tang tep (anh/bang chung chuyen) tra 403
 * `FILE_STORE_DISABLED`, khong mat byte nao vi khong byte nao duoc nhan. Postgres van ben vung.
 * Sandbox chi co 1 addon (da dung cho Postgres) nen khong co cho cho MinIO/S3.
 */
export function buildRuntimeEnvironment(role, { webOrigin }) {
  if (!Object.hasOwn(SERVICE_ROLES, role)) {
    throw new PreviewDeployError(PREVIEW_ERRORS.targetNotAllowed, `Vai tro dich vu la: ${role}`);
  }
  const contract = describeRuntimeContract(resolveDeploymentProfile(PREVIEW_TARGET.profile));
  const common = {
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    TENANT_DIR: TENANT_DIR_IN_IMAGE,
    DEPLOYMENT_ENVIRONMENT: PREVIEW_TARGET.environment,
    DATA_CLASSIFICATION: contract.PROFILE_DATA_CLASSIFICATION,
  };
  if (role === 'web') {
    return Object.freeze({
      ...common,
      PORT: String(SERVICE_ROLES.web.port),
      // Dia chi noi bo cua api trong cung project Northflank (DNS = service id).
      API_UPSTREAM: `api:${SERVICE_ROLES.api.port}`,
    });
  }
  const environment = {
    ...common,
    PORT: String(SERVICE_ROLES.api.port),
    PERSISTENCE: 'prisma',
    PARSER_MODE: contract.PROFILE_PARSER_MODE,
    CHANNEL_MODE: contract.PROFILE_CHANNEL_MODE,
    ADVICE_COMPOSER: contract.PROFILE_ADVICE_COMPOSER,
    AUTO_SEND: contract.PROFILE_AUTO_SEND,
    AUTH_MODE: 'session',
    MEDIA_STORE: 'none',
    ADMIN_UI: 'off',
    STREAM_MODE: 'on',
    LOG_FORMAT: 'json',
    LOG_LEVEL: 'log',
    WORKFLOW_ENGINE: 'off',
    OTEL_TRACING: 'off',
    RELEASE_MANIFEST_PATH,
    PILOT_OPERATOR_USERNAME: OPERATOR_USERNAME,
    PILOT_OPERATOR_NAME: 'Preview Operator',
    // Man hinh quan tri tai khoan KHONG duoc khoa/ha vai/doi mat khau tai khoan he thong nay.
    PROTECTED_ACCOUNT_USERNAMES: OPERATOR_USERNAME,
  };
  if (webOrigin) {
    environment.CORS_ORIGIN = webOrigin;
    environment.PUBLIC_BASE_URL = webOrigin;
  }
  return Object.freeze(environment);
}

/**
 * `release.json` cua LAN DEPLOY NAY. Khong chua bi mat (dung khuon `write-release-manifest.sh`).
 * Duoc mount nguyen tu CUNG MOT PATCH voi image (`runtimeFiles`) nen khong co cua so "image moi,
 * manifest cu".
 */
export function buildReleaseManifest({ gitSha, imageRef, workflowRunId, deployedAt }) {
  return Object.freeze({
    tenant: PREVIEW_TARGET.tenant,
    environment: PREVIEW_TARGET.environment,
    stack: PREVIEW_TARGET.stackSlug,
    target: 'northflank-sandbox',
    provider: NORTHFLANK_PROVIDER,
    gitSha,
    appDigest: imageRef,
    workflowRunId: String(workflowRunId ?? '0'),
    deployedAt,
  });
}

const base64 = (text) => Buffer.from(text, 'utf8').toString('base64');

/** Than `PATCH /v1/projects/{p}/services/deployment/{s}` — MOT yeu cau, nguyen tu. */
export function buildServicePatch(role, { imageRef, webOrigin, manifest }) {
  const spec = SERVICE_ROLES[role];
  const body = {
    deployment: {
      instances: 1,
      external: { imagePath: imageRef },
      docker: { configType: 'customCommand', customCommand: spec.command },
    },
    ports: [{ name: 'http', internalPort: spec.port, public: spec.public, protocol: 'HTTP' }],
    runtimeEnvironment: buildRuntimeEnvironment(role, { webOrigin }),
    healthChecks: buildHealthChecks(role),
  };
  if (role === 'api') {
    body.runtimeFiles = {
      [RELEASE_MANIFEST_PATH]: {
        data: base64(`${JSON.stringify(manifest, null, 2)}\n`),
        encoding: 'utf-8',
      },
    };
  }
  return body;
}

// Rang buoc cua API Northflank (PATCH deployment service), DO TRUC TIEP tu loi HTTP 400 cua API that
// 05/10/2026 (run 37265249316 + probe payload co y sai de khong doi service):
//   - initialDelaySeconds >= 1, periodSeconds >= 10
//   - successThreshold CHI duoc phep khi type == 'readinessProbe' (them vao startup/liveness la 400).
// Tai lieu .md cua endpoint khong neu cac can duoi nay: tin phan hoi cua API, khong tin tai lieu.
export const HEALTH_CHECK_MIN_INITIAL_DELAY_SECONDS = 1;
export const HEALTH_CHECK_MIN_PERIOD_SECONDS = 10;

function buildHealthChecks(role) {
  const { port, healthPath } = SERVICE_ROLES[role];
  const probe = (type, overrides) => ({
    protocol: 'HTTP',
    type,
    path: healthPath,
    port,
    initialDelaySeconds: HEALTH_CHECK_MIN_INITIAL_DELAY_SECONDS,
    periodSeconds: HEALTH_CHECK_MIN_PERIOD_SECONDS,
    timeoutSeconds: 5,
    failureThreshold: 3,
    ...overrides,
  });
  return [
    // api: migrate + seed chay LUC KHOI DONG nen can mot cua so khoi dong rong (30 x 10s = 5 phut,
    // giu y do 60 x 5s truoc day) truoc khi liveness bat dau — neu khong liveness se giet container
    // dang migrate.
    probe('startupProbe', { timeoutSeconds: 3, failureThreshold: 30 }),
    probe('readinessProbe', { successThreshold: 1 }),
    probe('livenessProbe', { periodSeconds: 20, failureThreshold: 5 }),
  ];
}
