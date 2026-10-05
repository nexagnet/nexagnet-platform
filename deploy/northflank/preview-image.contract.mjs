import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

/**
 * KIEM TRA IMAGE XEM TRUOC THAT (Northflank) — khong phai kiem Dockerfile, ma mo image da build ra xem.
 *
 * Cung khuon `deploy/netviet/image-isolation.contract.mjs`: ten KHONG co `.test.` de `pnpm test` khong
 * quet no (can Docker), va chay trong job `images` cua CI ngay sau khi lop mong duoc build.
 *
 * Chay:
 *   docker build -f deploy/netviet/Dockerfile -t netviet-zalo:test .
 *   docker build -f deploy/northflank/Dockerfile --build-arg BASE_IMAGE=netviet-zalo:test \
 *     --build-arg GIT_SHA=<40 hex> -t netviet-preview:test .
 *   PREVIEW_IMAGE=netviet-preview:test PREVIEW_GIT_SHA=<40 hex> \
 *     node --test deploy/northflank/preview-image.contract.mjs
 *
 * Thieu bien -> skip, de may khong co Docker khong bi ep.
 *
 * DAY LA BANG CHUNG DUY NHAT, TRUOC KHI CO PROJECT NORTHFLANK, rang image va Caddyfile dung duoc:
 * Caddyfile hop le, edge + Next len that trong MOT container, va route API toi duoc upstream chu
 * khong roi xuong Next (404). Phan con lai (rollout/smoke tren Northflank that) can project that.
 */

const IMAGE = process.env.PREVIEW_IMAGE?.trim();
const SHA = process.env.PREVIEW_GIT_SHA?.trim();
const skip = IMAGE && SHA ? false : 'Dat PREVIEW_IMAGE va PREVIEW_GIT_SHA de chay kiem tra nay';

/** Chay mot lenh shell BEN TRONG image, tra ve stdout da trim. */
function inImage(shellCommand, { env = {} } = {}) {
  const envArgs = Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
  return execFileSync('docker', ['run', '--rm', ...envArgs, IMAGE, 'sh', '-c', shellCommand], {
    encoding: 'utf8',
    timeout: 120_000,
  }).trim();
}

test('image chi mang DUNG MOT goi khach: transport-preview (goi tong hop)', { skip }, () => {
  assert.equal(inImage('ls -1 /app/tenants'), 'transport-preview');
  // Quet CA image: moi tep nhan dang goi khach chi duoc nam trong goi mau.
  const found = inImage(
    'find / -xdev \\( -name knowledge.json -o -name tenant.json -o -name demo-messages.json \\) ' +
      "-not -path '*/node_modules/*' 2>/dev/null || true",
  );
  for (const path of found.split('\n').filter(Boolean)) {
    assert.ok(
      path.startsWith('/app/tenants/transport-preview/'),
      `tep nhan dang goi khach nam ngoai goi mau: ${path}`,
    );
  }
  assert.ok(found.includes('/app/tenants/transport-preview/tenant.json'));
});

test('danh tinh: BUILD_REVISION == SHA da build, va nhan OCI revision == SHA', { skip }, () => {
  assert.equal(inImage('cat /app/BUILD_REVISION'), SHA);
  const label = execFileSync(
    'docker',
    ['inspect', '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}', IMAGE],
    { encoding: 'utf8' },
  ).trim();
  assert.equal(label, SHA);
});

test(
  'assert-image-identity chay duoc TRONG image: khop -> 0, lech / thieu manifest -> 1',
  { skip },
  () => {
    const run = (manifest) =>
      inImage(
        manifest === null
          ? 'RELEASE_MANIFEST_PATH=/tmp/none.json node deploy/northflank/assert-image-identity.mjs; echo EXIT=$?'
          : `printf '%s' '${manifest}' > /tmp/release.json; RELEASE_MANIFEST_PATH=/tmp/release.json node deploy/northflank/assert-image-identity.mjs; echo EXIT=$?`,
      );
    assert.match(run(JSON.stringify({ gitSha: SHA })), /EXIT=0$/);
    assert.match(run(JSON.stringify({ gitSha: 'c'.repeat(40) })), /EXIT=1$/);
    assert.match(run(null), /EXIT=1$/);
  },
);

test(
  'Caddyfile hop le voi binary Caddy THAT trong image, va adapt ra dung dinh tuyen',
  { skip },
  () => {
    const env = { API_UPSTREAM: 'api:3001' };
    inImage('caddy validate --config /app/deploy/northflank/Caddyfile --adapter caddyfile', {
      env,
    });
    const adapted = inImage(
      'caddy adapt --config /app/deploy/northflank/Caddyfile --adapter caddyfile',
      {
        env,
      },
    );
    assert.match(adapted, /api:3001/);
    assert.match(adapted, /127\.0\.0\.1:3100/);
    assert.match(adapted, /X-Forwarded-Proto/);
    assert.match(adapted, /\/__edge_health/);
    assert.doesNotMatch(adapted, /x-api-key/i);
  },
);

test(
  'moi tep ma start-api / start-web goi deu co that trong image, va script la sh hop le',
  { skip },
  () => {
    const out = inImage(
      [
        'test -f apps/api/dist/main.js',
        'test -x apps/api/node_modules/.bin/prisma',
        'test -x apps/web/node_modules/.bin/next',
        'test -d apps/web/.next',
        'test -f deploy/netviet/bootstrap-auth-user.mjs',
        'test -f deploy/netviet/seed-tenant-knowledge.mjs',
        'test -f deploy/netviet/seed-transport-demo.mjs',
        'sh -n deploy/northflank/start-api.sh',
        'sh -n deploy/northflank/start-web.sh',
        'echo OK',
      ].join(' && '),
    );
    assert.equal(out, 'OK');
  },
);

test(
  'CONTAINER WEB BOOT THAT: edge song, Next song sau edge, route API toi upstream (khong roi xuong Next)',
  {
    skip,
    timeout: 180_000,
  },
  async () => {
    const name = `nf-preview-web-${process.pid}`;
    const started = spawnSync(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '-p',
        '127.0.0.1::3000',
        '-e',
        'NODE_ENV=production',
        '-e',
        'TENANT_DIR=/app/tenants/transport-preview',
        // Upstream KHONG phan giai duoc: neu `/health` toi duoc Caddy-upstream thi se 502; neu roi xuong
        // Next thi se 404 — hai ket qua phan biet duoc va chi mot trong hai la dung.
        '-e',
        'API_UPSTREAM=api-khong-ton-tai:3001',
        IMAGE,
        'sh',
        '/app/deploy/northflank/start-web.sh',
      ],
      { encoding: 'utf8' },
    );
    assert.equal(started.status, 0, started.stderr);
    try {
      const mapped = execFileSync('docker', ['port', name, '3000/tcp'], {
        encoding: 'utf8',
      }).trim();
      const port = /:(\d+)$/m.exec(mapped)?.[1];
      assert.ok(port, `khong doc duoc cong: ${mapped}`);
      const base = `http://127.0.0.1:${port}`;

      // Doi edge len (Caddy len truoc Next; edge health khong phu thuoc Next hay api).
      let edge;
      for (let attempt = 0; attempt < 90; attempt += 1) {
        edge = await fetch(`${base}/__edge_health`).catch(() => null);
        if (edge?.ok) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      assert.ok(edge?.ok, 'edge khong len trong 90s');
      assert.equal(await edge.text(), 'edge ok');
      assert.equal(edge.headers.get('x-frame-options'), 'DENY');
      assert.equal(edge.headers.get('x-content-type-options'), 'nosniff');

      // Duong API: toi upstream (khong phan giai duoc -> 502), TUYET DOI khong phai 404 cua Next.
      for (const path of ['/health', '/auth/csrf', '/observability/traces', '/transport/runs']) {
        const response = await fetch(`${base}${path}`).catch(() => null);
        assert.ok(response, path);
        assert.equal(
          response.status,
          502,
          `${path} phai di toi upstream api (502), khong phai Next`,
        );
      }

      // Duong web: Next phuc vu sau edge (trang HTML hoac chuyen huong toi dang nhap).
      let page;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        page = await fetch(`${base}/`, { redirect: 'manual' }).catch(() => null);
        if (page && page.status < 500) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      assert.ok(page && page.status < 500, `Next khong len sau edge (status ${page?.status})`);
      assert.notEqual(page.status, 502, 'Next phai song sau edge');
    } finally {
      spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8' });
    }
  },
);
