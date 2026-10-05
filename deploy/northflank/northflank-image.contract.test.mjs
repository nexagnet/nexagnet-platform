import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

import { checkImageIdentity } from './assert-image-identity.mjs';
import { SERVICE_ROLES } from './preview-contract.mjs';

/**
 * Khoa HOP DONG cua cac artifact trong image xem truoc Northflank bang doc van ban + chay that o
 * muc ma may nay lam duoc. Daemon Docker khong co san o moi may, nen build that + `caddy validate` nam
 * o `preview-image.contract.mjs` (chay trong job `images` cua CI); bai nay giu moi thu con lai.
 */

const CRLF = new RegExp(`${String.fromCharCode(13)}${String.fromCharCode(10)}`, 'g');
const root = new URL('../../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, root), 'utf8').replace(CRLF, '\n');
const readRaw = (relative) => readFileSync(new URL(relative, root), 'utf8');

/** Bo chu thich de cau chu giai thich khong lam bai xanh/do gia. */
const hashComments = (text) =>
  text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

const dockerfile = hashComments(read('deploy/northflank/Dockerfile'));
const caddyfile = hashComments(read('deploy/northflank/Caddyfile'));
const vmCaddyfile = hashComments(read('deploy/netviet/edge/Caddyfile'));
const startApi = hashComments(read('deploy/northflank/start-api.sh'));
const startWeb = hashComments(read('deploy/northflank/start-web.sh'));

const apiRoutes = (text) => {
  const line = text.split('\n').find((candidate) => /^\s*@api path /.test(candidate));
  assert.ok(line, 'khong thay matcher @api path');
  return line.trim().split(/\s+/).slice(2);
};

// ---------------------------------------------------------------------------------------------
// DOCKERFILE
// ---------------------------------------------------------------------------------------------

test('Dockerfile la LOP MONG tren image chung: bat buoc BASE_IMAGE, khong build lai gi', () => {
  assert.match(dockerfile, /^ARG BASE_IMAGE$/m);
  assert.match(dockerfile, /^FROM \$\{BASE_IMAGE\}$/m);
  // Khong tai tao buoc nang: khong install/build/prisma o day.
  assert.doesNotMatch(dockerfile, /pnpm|npm |prisma|apt-get|corepack/);
  // Khong `COPY . .` ca ngu canh.
  assert.doesNotMatch(dockerfile, /^COPY \. /m);
});

test('Dockerfile chi them DUNG MOT goi khach: transport-preview (goi tong hop), khong goi nao khac', () => {
  const copies = dockerfile
    .split('\n')
    .filter((line) => /^COPY /.test(line) && /tenants/.test(line));
  assert.deepEqual(copies, ['COPY tenants/transport-preview /app/tenants/transport-preview']);
  assert.doesNotMatch(dockerfile, /ultty|amico|wata/i);
  assert.doesNotMatch(dockerfile, /tenants\/\*|COPY tenants /);
});

test('Caddy duoc ghim DIGEST, va la CUNG digest voi edge cua VM', () => {
  const pin = /^FROM (caddy:2-alpine@sha256:[a-f0-9]{64}) AS caddy$/m.exec(dockerfile);
  assert.ok(pin, 'Caddy phai ghim digest');
  const vmCompose = read('deploy/netviet/edge/compose.yaml');
  assert.ok(vmCompose.includes(pin[1]), 'khac digest Caddy cua edge VM');
  assert.match(dockerfile, /^COPY --from=caddy \/usr\/bin\/caddy \/usr\/local\/bin\/caddy$/m);
});

test('GIT_SHA bat buoc va chi nhan full SHA 40 hex; ghi /app/BUILD_REVISION; build DUNG neu sai', () => {
  assert.match(dockerfile, /^ARG GIT_SHA$/m);
  assert.match(dockerfile, /grep -Eq '\^\[a-f0-9\]\{40\}\$'/);
  assert.match(dockerfile, /> \/app\/BUILD_REVISION/);
  // `&&` noi cac buoc: kiem tra that bai thi khong ghi gi va RUN that bai.
  assert.match(
    dockerfile,
    /grep -Eq '\^\[a-f0-9\]\{40\}\$' \\\n\s+&& printf '%s' "\$\{GIT_SHA\}" > \/app\/BUILD_REVISION/,
  );
  assert.match(dockerfile, /LABEL org\.opencontainers\.image\.revision="\$\{GIT_SHA\}"/);
});

test('Dockerfile khong nuong bi mat, khong chay GCP, lenh mac dinh la api', () => {
  assert.doesNotMatch(dockerfile, /^(ENV|ARG) .*(SECRET|PASSWORD|TOKEN|API_KEY|DATABASE_URL)/im);
  assert.doesNotMatch(dockerfile, /gcloud|google|GCP|workload.?identity|os.?login/i);
  assert.match(dockerfile, /^CMD \["sh", "\/app\/deploy\/northflank\/start-api\.sh"\]$/m);
});

test('.dockerignore mo DUNG mot ngoai le cho goi khach: transport-preview', () => {
  const lines = read('.dockerignore')
    .split('\n')
    .filter((line) => /^!?tenants\//.test(line));
  assert.deepEqual(lines, [
    'tenants/*',
    '!tenants/transport-preview',
    '!tenants/transport-preview/**',
  ]);
});

// ---------------------------------------------------------------------------------------------
// CADDYFILE
// ---------------------------------------------------------------------------------------------

test('danh sach route API la CUNG MOT danh sach voi edge VM (khong lech tung duong)', () => {
  const preview = apiRoutes(caddyfile);
  const vm = apiRoutes(vmCaddyfile);
  assert.ok(preview.length >= 30, 'danh sach route qua ngan — co the da bi cat');
  assert.deepEqual(preview, vm);
  // Duong dan duoi /settings duoc liet ke tung cai, khong gop thanh /settings/*.
  assert.equal(preview.includes('/settings/*'), false);
  assert.ok(preview.includes('/health'));
  assert.ok(preview.includes('/observability/traces*'), 'smoke tat dinh can duong nay qua edge');
});

test('Caddyfile: HTTP :3000, tat admin va auto_https (TLS cat o ingress Northflank)', () => {
  assert.match(caddyfile, /^\s*admin off$/m);
  assert.match(caddyfile, /^\s*auto_https off$/m);
  assert.match(caddyfile, /^:3000 \{$/m);
  assert.ok(SERVICE_ROLES.web.port === 3000, 'hop dong cong web phai khop Caddyfile');
});

test('Caddyfile ep X-Forwarded-Proto https o MOI reverse_proxy (thieu thi 403 CSRF gia)', () => {
  const proxies = caddyfile.match(/reverse_proxy [^\n]+\{[^}]*\}/g) ?? [];
  assert.equal(proxies.length, 2);
  for (const block of proxies) assert.match(block, /header_up X-Forwarded-Proto https/);
});

test('Caddyfile: api qua API_UPSTREAM (bien), SSE khong dem, next chi loopback cong 3100', () => {
  assert.match(caddyfile, /reverse_proxy \{\$API_UPSTREAM\} \{/);
  assert.match(caddyfile, /flush_interval -1/);
  assert.match(caddyfile, /reverse_proxy 127\.0\.0\.1:3100 \{/);
  assert.match(startWeb, /next start apps\/web -p 3100 -H 127\.0\.0\.1/);
});

test('Caddyfile KHONG tiem x-api-key (route noi bo khong toi duoc tu Internet) va van cat Authorization', () => {
  assert.doesNotMatch(caddyfile, /x-api-key/i);
  assert.equal((caddyfile.match(/header_up -Authorization/g) ?? []).length, 2);
});

test('suc khoe cua edge duoc xu ly TRUOC route, khong di toi api, va khop health check cua hop dong', () => {
  const health = caddyfile.indexOf('handle /__edge_health');
  assert.ok(health >= 0);
  assert.ok(health < caddyfile.indexOf('@api path'), 'phai dung truoc matcher api');
  assert.ok(health < caddyfile.indexOf('handle @api'));
  assert.match(caddyfile, /handle \/__edge_health \{\n\s+respond "edge ok" 200\n\s+\}/);
  assert.equal(SERVICE_ROLES.web.healthPath, '/__edge_health');
});

// ---------------------------------------------------------------------------------------------
// SCRIPT KHOI DONG
// ---------------------------------------------------------------------------------------------

test('script .sh la LF thuan (CRLF lam sh chet voi "\\r: not found")', () => {
  for (const file of ['start-api.sh', 'start-web.sh']) {
    assert.equal(readRaw(`deploy/northflank/${file}`).includes('\r'), false, file);
  }
});

test('script co cu phap sh hop le', () => {
  for (const file of ['start-api.sh', 'start-web.sh']) {
    const result = spawnSync(
      'sh',
      ['-n', new URL(`deploy/northflank/${file}`, root).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

test('start-api: thu tu CONG CUNG — danh tinh, migrate, operator, seed, seed demo, roi moi Nest (exec)', () => {
  assert.match(startApi, /^set -eu$/m);
  const steps = [
    'node deploy/northflank/assert-image-identity.mjs',
    'apps/api/node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma',
    'node deploy/netviet/bootstrap-auth-user.mjs',
    'node deploy/netviet/seed-tenant-knowledge.mjs',
    'node deploy/netviet/seed-transport-demo.mjs',
    'exec node apps/api/dist/main.js',
  ];
  let cursor = -1;
  for (const step of steps) {
    const index = startApi.indexOf(step);
    assert.ok(index > cursor, `thieu hoac sai thu tu: ${step}`);
    cursor = index;
  }
  // Khong co buoc nao bi lam mem (`|| true`, `|| :`) — moi buoc hong phai lam container thoat.
  assert.doesNotMatch(startApi, /\|\|/);
  assert.doesNotMatch(startApi, /set \+e/);
});

test('moi tep ma start-api goi deu ton tai that trong repo', () => {
  for (const file of [
    'deploy/northflank/assert-image-identity.mjs',
    'deploy/netviet/bootstrap-auth-user.mjs',
    'deploy/netviet/seed-tenant-knowledge.mjs',
    'deploy/netviet/seed-transport-demo.mjs',
  ]) {
    assert.ok(existsSync(new URL(file, root)), file);
  }
});

test('start-web: can API_UPSTREAM, chay caddy + next, mot trong hai chet thi ca container thoat 1', () => {
  assert.match(startWeb, /^set -eu$/m);
  assert.match(startWeb, /: "\$\{API_UPSTREAM:\?/);
  assert.match(
    startWeb,
    /caddy run --config \/app\/deploy\/northflank\/Caddyfile --adapter caddyfile &/,
  );
  assert.match(
    startWeb,
    /while kill -0 "\$next_pid" 2>\/dev\/null && kill -0 "\$caddy_pid" 2>\/dev\/null; do/,
  );
  assert.match(startWeb, /\nexit 1\s*$/);
  assert.match(startWeb, /trap 'stop; exit 0' TERM INT/);
});

// ---------------------------------------------------------------------------------------------
// DOI CHIEU DANH TINH (assert-image-identity)
// ---------------------------------------------------------------------------------------------

const SHA = 'a'.repeat(40);
const identity = ({ revision, manifest, env = {} }) =>
  checkImageIdentity({
    env,
    revisionPath: '/app/BUILD_REVISION',
    read: (path) => {
      const value = path === '/app/BUILD_REVISION' ? revision : manifest;
      if (value instanceof Error) throw value;
      if (value === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return value;
    },
  });
const manifestOf = (gitSha) => JSON.stringify({ gitSha, tenant: 'transport-preview' });

test('danh tinh: image == manifest -> ok, doc manifest o duong dan mac dinh /runtime/release.json', () => {
  const seen = [];
  const result = checkImageIdentity({
    env: {},
    read: (path) => {
      seen.push(path);
      return path === '/app/BUILD_REVISION' ? `${SHA}\n` : manifestOf(SHA);
    },
  });
  assert.deepEqual(result, { ok: true, gitSha: SHA });
  assert.deepEqual(seen, ['/app/BUILD_REVISION', '/runtime/release.json']);
});

test('danh tinh: ton trong RELEASE_MANIFEST_PATH', () => {
  const seen = [];
  checkImageIdentity({
    env: { RELEASE_MANIFEST_PATH: '/custom/release.json' },
    read: (path) => {
      seen.push(path);
      return path === '/app/BUILD_REVISION' ? SHA : manifestOf(SHA);
    },
  });
  assert.equal(seen[1], '/custom/release.json');
});

test('danh tinh: image va manifest lech SHA -> RELEASE_IDENTITY_MISMATCH (tien trinh KHONG duoc len)', () => {
  assert.deepEqual(identity({ revision: SHA, manifest: manifestOf('c'.repeat(40)) }), {
    ok: false,
    reason: 'RELEASE_IDENTITY_MISMATCH',
  });
});

test('danh tinh: thieu/hong tung ve deu fail closed voi ma RIENG', () => {
  const cases = [
    [{ revision: undefined, manifest: manifestOf(SHA) }, 'BUILD_REVISION_MISSING'],
    [{ revision: 'abc', manifest: manifestOf(SHA) }, 'BUILD_REVISION_INVALID'],
    [{ revision: SHA.toUpperCase(), manifest: manifestOf(SHA) }, 'BUILD_REVISION_INVALID'],
    [{ revision: '', manifest: manifestOf(SHA) }, 'BUILD_REVISION_INVALID'],
    [{ revision: SHA, manifest: undefined }, 'RELEASE_MANIFEST_MISSING'],
    [{ revision: SHA, manifest: 'khong phai json' }, 'RELEASE_MANIFEST_INVALID'],
    [{ revision: SHA, manifest: '[]' }, 'RELEASE_MANIFEST_INVALID'],
    [{ revision: SHA, manifest: JSON.stringify({}) }, 'RELEASE_MANIFEST_INVALID'],
    [{ revision: SHA, manifest: manifestOf('abc') }, 'RELEASE_MANIFEST_INVALID'],
    [{ revision: SHA, manifest: manifestOf(SHA.toUpperCase()) }, 'RELEASE_MANIFEST_INVALID'],
    [{ revision: SHA, manifest: JSON.stringify({ gitSha: 5 }) }, 'RELEASE_MANIFEST_INVALID'],
  ];
  for (const [input, reason] of cases) {
    assert.deepEqual(identity(input), { ok: false, reason }, reason);
  }
});

// ---------------------------------------------------------------------------------------------
// TOAN THU MUC: khong GCP, khong bi mat
// ---------------------------------------------------------------------------------------------

function executableSources() {
  const dir = new URL('deploy/northflank/', root);
  return (
    readdirSync(dir)
      // Tep test va tep HO TRO test (`preview-world.mjs`: gia tri gia cua token/mat khau) khong phai ma chay that.
      .filter((file) => !/\.test\.mjs$|\.contract\.mjs$|^preview-world\.mjs$/.test(file))
      .map((file) => {
        const text = readFileSync(new URL(file, dir), 'utf8').replace(CRLF, '\n');
        const code = file.endsWith('.mjs')
          ? text
              .replace(/\/\*[\s\S]*?\*\//g, '')
              .split('\n')
              .filter((line) => !line.trimStart().startsWith('//'))
              .join('\n')
          : hashComments(text);
        return { file, code };
      })
  );
}

test('duong Northflank khong con GCP o phan THUC THI: khong gcloud, WIF, OS Login, VM, bucket GCS', () => {
  const sources = executableSources();
  assert.ok(sources.length >= 8, 'khong quet duoc du tep');
  for (const { file, code } of sources) {
    assert.doesNotMatch(
      code,
      /gcloud|google-github-actions|googleapis|GCP_|workload.?identity|os.?login|compute engine|--tunnel-through-iap|gs:\/\/|gcs:/i,
      file,
    );
  }
});

test('khong tep nao hardcode bi mat / token / mat khau', () => {
  for (const { file, code } of executableSources()) {
    assert.doesNotMatch(
      code,
      /nfa_[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|-----BEGIN/,
      file,
    );
    assert.doesNotMatch(code, /(PASSWORD|SECRET|TOKEN)\s*[:=]\s*['"][^'"\n$]{8,}['"]/, file);
  }
});
