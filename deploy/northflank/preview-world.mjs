import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { evaluateDeploySignals as evaluateRuntimeProof } from '../../tools/autopilot/runtime-proof-core.mjs';
import {
  StageAborted,
  createJournal,
  finalizeSignals,
  runPreflight,
  runPreviewDeploy,
} from './deploy-preview.mjs';
import { NorthflankApiError } from './northflank-api.mjs';

/**
 * THE GIOI GIA cua bo dieu phoi deploy: Northflank, mang, smoke va dong ho — khong I/O that, khong cho
 * that. Dung chung cho cac tep `deploy-preview*.test.mjs`. `world(options)` bat tung hong hoc.
 */

export const SHA = 'a'.repeat(40);
export const OTHER_SHA = 'c'.repeat(40);
export const DIGEST = 'b'.repeat(64);
export const IMAGE = `ghcr.io/nexagnet/nexagnet-platform/preview@sha256:${DIGEST}`;
// Gia tri gia dung luc chay: khong co chuoi literal nao trong repo giong mot credential.
export const TOKEN = `nf-${randomBytes(18).toString('hex')}`;
export const PASSWORD = `op-${randomBytes(18).toString('hex')}`;
export const WEB_DNS = 'p01--web--abc123.code.run';
// Phan hoi token an danh cua GHCR (khong phai bi mat): ten truong + gia tri tach khoi mot phep gan.
const ANONYMOUS_FIELD = 'token';
export const ANONYMOUS_PULL_VALUE = `anon-${randomBytes(6).toString('hex')}`;

export const TARGET = 'transport-preview/gd1-test';

export const baseEnv = (overrides = {}) => ({
  PROVIDER: 'northflank',
  TENANT: 'transport-preview',
  ENVIRONMENT: 'gd1-test',
  DEPLOYMENT_PROFILE: 'transport-preview-gd1-test',
  STACK_SLUG: 'transport-preview-gd1-test',
  GIT_SHA: SHA,
  IMAGE_REF: IMAGE,
  NORTHFLANK_PROJECT_ID: 'nexagnet-dev',
  NORTHFLANK_API_SERVICE_ID: 'api',
  NORTHFLANK_WEB_SERVICE_ID: 'web',
  NORTHFLANK_API_TOKEN: TOKEN,
  GITHUB_REF: 'refs/heads/main',
  GITHUB_RUN_ID: '999',
  GD1_TEST_CI_CONCLUSION: 'success',
  ...overrides,
});

export const TIMEOUTS = Object.freeze({
  pollIntervalMs: 10,
  webOriginMs: 50,
  rolloutMs: 100,
  healthMs: 100,
  probeRequestMs: 1,
});

export const smokeSignal = (status, reason, extra = {}) =>
  `##DEPLOY-SIGNAL## ${JSON.stringify({ layer: 'deterministicSmoke', status, reason, detail: extra })}`;

/**
 * THE GIOI GIA: Northflank, mang, smoke va dong ho. Khong co I/O that, khong cho that.
 * `options` bat tung hong hoc.
 */
export function world(options = {}) {
  const t = { ms: 1_800_000_000_000 };
  const clock = {
    now: () => t.ms,
    sleep: async (ms) => {
      t.ms += ms;
    },
  };
  const log = {
    patches: [],
    restarts: [],
    clientsCreated: 0,
    smokeCalls: [],
    masked: [],
    fetched: [],
    order: [],
  };
  const services = {
    web: { patched: false, polls: 0 },
    api: { patched: false, polls: 0 },
  };
  let restarted = false;

  const failWith = (status) =>
    new NorthflankApiError({ method: 'GET', path: '/x', status, message: 'boom' });

  const client = {
    getProject: async () => {
      log.order.push('getProject');
      if (options.projectStatus) throw failWith(options.projectStatus);
      return { id: 'nexagnet-dev' };
    },
    getSecretDetails: async () => {
      log.order.push('getSecretDetails');
      if (options.secretStatus) throw failWith(options.secretStatus);
      const variables =
        'secretVariables' in options
          ? options.secretVariables
          : { PILOT_OPERATOR_PASSWORD: PASSWORD, SESSION_SECRET: 'x'.repeat(40) };
      return { secrets: { variables } };
    },
    patchDeploymentService: async (_project, serviceId, body) => {
      log.order.push(`patch:${serviceId}`);
      if (options.patchStatus?.[serviceId]) throw failWith(options.patchStatus[serviceId]);
      services[serviceId].patched = true;
      services[serviceId].polls = 0;
      log.patches.push({ serviceId, body });
      return {};
    },
    getService: async (_project, serviceId) => {
      const service = services[serviceId];
      const ports =
        serviceId === 'web' && !options.noWebDns
          ? [{ name: 'http', public: true, dns: WEB_DNS }]
          : [{ name: 'http', public: false }];
      if (!service.patched) {
        return {
          ports,
          status: { deployment: { status: 'COMPLETED' } },
          deployment: { external: { imagePath: 'old/preview@sha256:old' } },
        };
      }
      service.polls += 1;
      let status = service.polls >= 2 ? 'COMPLETED' : 'IN_PROGRESS';
      if (options.rolloutFails && service.polls >= 2) status = 'FAILED';
      if (options.neverCompletes) status = 'IN_PROGRESS';
      const imagePath = options.deployedImage ?? IMAGE.replace(/^ghcr\.io\//, ''); // Northflank co the bo ten mien
      return { ports, status: { deployment: { status } }, deployment: { external: { imagePath } } };
    },
    restartService: async (_project, serviceId) => {
      log.order.push(`restart:${serviceId}`);
      if (options.restartStatus) throw failWith(options.restartStatus);
      log.restarts.push(serviceId);
      restarted = true;
      return {};
    },
    listContainers: async () => {
      const stale = options.staleContainers || (options.restartStale && restarted);
      const containers = [
        {
          name: 'c-1',
          status: 'TASK_RUNNING',
          createdAt: stale ? 100 : Math.floor(t.ms / 1000) + 1,
        },
      ];
      // Container CU van dang chay cung container moi: khong duoc tinh la "rollout xong".
      const lingering = restarted ? options.restartOldLingers : options.oldContainerLingers;
      if (lingering) containers.push({ name: 'c-0', status: 'TASK_RUNNING', createdAt: 100 });
      return { containers };
    },
  };

  const response = (status, body, type = 'application/json') =>
    new Response(body, { status, headers: { 'content-type': type } });
  const fetchImpl = async (url, init = {}) => {
    const { pathname, origin } = new URL(url);
    log.fetched.push(`${origin}${pathname}`);
    if (origin === 'https://ghcr.io') {
      log.ghcr = [
        ...(log.ghcr ?? []),
        { pathname, method: init.method ?? 'GET', auth: init.headers?.Authorization },
      ];
      if (options.ghcrThrows) throw new Error('ECONNRESET');
      if (pathname === '/token') {
        return options.ghcrToken === false
          ? response(options.ghcrTokenStatus ?? 200, JSON.stringify({}))
          : response(200, JSON.stringify({ [ANONYMOUS_FIELD]: ANONYMOUS_PULL_VALUE }));
      }
      return response(options.ghcr ?? 200, '');
    }
    if (options.fetchThrows) throw new Error('ECONNREFUSED');
    if (pathname === '/__edge_health')
      return response(options.edge ?? 200, 'edge ok', 'text/plain');
    if (pathname === '/health') {
      const brokenNow = options.healthFailsAfterRestart && restarted;
      return response(
        brokenNow ? 502 : (options.apiHealth ?? 200),
        options.apiHealthBody ?? '{"status":"ok"}',
      );
    }
    if (pathname === '/') {
      return response(options.page ?? 200, '<html></html>', options.pageType ?? 'text/html');
    }
    return response(404, '');
  };

  const runSmoke = async (input) => {
    log.smokeCalls.push(input);
    log.order.push(`smoke:${input.phase}`);
    const override = options.smokeByPhase?.[input.phase] ?? options.smoke;
    if (override) return override;
    const baseline = options.noBaseline
      ? ''
      : `\nDETERMINISTIC_BASELINE={"releaseSha":"${input.gitSha}"}`;
    return {
      exitCode: 0,
      stdout: `${smokeSignal('pass', 'DETERMINISTIC_CONTRACT_OK', { releaseSha: input.gitSha })}${baseline}\n`,
    };
  };

  const createClient = ({ token }) => {
    log.clientsCreated += 1;
    assert.equal(token, TOKEN, 'client phai nhan dung token tu env');
    return options.client ?? client;
  };

  return {
    clock,
    log,
    preflight: async (envOverrides = {}) => {
      const journal = createJournal({ write: () => {} });
      let aborted = null;
      let ready = false;
      try {
        ready = await runPreflight({
          env: baseEnv(envOverrides),
          journal,
          createClient,
          fetchImpl,
          mask: (value) => log.masked.push(value),
        });
      } catch (error) {
        if (!(error instanceof StageAborted)) throw error;
        aborted = error;
      }
      const final = finalizeSignals({ journalText: journal.text(), exitCode: aborted ? 1 : 0 });
      return { aborted, ready, journalText: journal.text(), ...final };
    },
    run: async (envOverrides = {}) => {
      const journal = createJournal({ write: () => {} });
      let aborted = null;
      try {
        await runPreviewDeploy({
          env: baseEnv(envOverrides),
          journal,
          createClient,
          fetchImpl,
          runSmoke,
          clock,
          timeouts: TIMEOUTS,
          mask: (value) => log.masked.push(value),
        });
      } catch (error) {
        if (!(error instanceof StageAborted)) throw error;
        aborted = error;
      }
      const final = finalizeSignals({ journalText: journal.text(), exitCode: aborted ? 1 : 0 });
      return { aborted, journalText: journal.text(), ...final };
    },
  };
}

export const proof = (machine, mergeSha = SHA) =>
  evaluateRuntimeProof({ signals: machine, mergeSha, target: TARGET });

// ---------------------------------------------------------------------------------------------
