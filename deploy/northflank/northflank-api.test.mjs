import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NorthflankApiError, createNorthflankClient, scrub } from './northflank-api.mjs';

// Dung luc chay: khong co chuoi literal nao trong repo giong mot credential.
const TOKEN = `nf-${randomBytes(18).toString('hex')}`;

/** fetch gia: ghi lai moi yeu cau, tra ve phan hoi lan luot. */
function fakeFetch(...responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift() ?? { status: 200, body: { data: {} } };
    if (next instanceof Error) throw next;
    return new Response(next.raw ?? JSON.stringify(next.body ?? {}), {
      status: next.status ?? 200,
    });
  };
  return { impl, calls };
}

test('thieu / rong token thi KHONG tao duoc client', () => {
  for (const token of [undefined, null, '', '   ', 5]) {
    assert.throws(
      () => createNorthflankClient({ token, fetchImpl: async () => new Response('{}') }),
      TypeError,
    );
  }
});

test('token chi di vao header Authorization — khong vao URL, khong vao than yeu cau', async () => {
  const { impl, calls } = fakeFetch({ body: { data: { id: 'nexagnet-dev' } } });
  const client = createNorthflankClient({ token: TOKEN, fetchImpl: impl });
  const project = await client.getProject('nexagnet-dev');
  assert.deepEqual(project, { id: 'nexagnet-dev' });

  const [{ url, init }] = calls;
  assert.equal(url, 'https://api.northflank.com/v1/projects/nexagnet-dev');
  assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(url.includes(TOKEN), false);
  assert.equal(init.body, undefined);
});

test('duong dan dung cho tung loi goi, va PATCH mang than JSON', async () => {
  const { impl, calls } = fakeFetch({}, {}, {}, {}, {});
  const client = createNorthflankClient({ token: TOKEN, fetchImpl: impl });
  await client.getService('p-1', 'api');
  await client.listContainers('p-1', 'api');
  await client.getSecretDetails('p-1', 'preview-secrets');
  await client.patchDeploymentService('p-1', 'web', { deployment: { instances: 1 } });

  assert.deepEqual(
    calls.map(
      ({ init, url }) => `${init.method} ${url.replace('https://api.northflank.com/v1', '')}`,
    ),
    [
      'GET /projects/p-1/services/api',
      'GET /projects/p-1/services/api/containers',
      'GET /projects/p-1/secrets/preview-secrets/details',
      'PATCH /projects/p-1/services/deployment/web',
    ],
  );
  assert.equal(calls[3].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[3].init.body), { deployment: { instances: 1 } });
});

test('restartService: POST .../restart voi than rong, token chi o header, id bi chan neu khong phai slug', async () => {
  const { impl, calls } = fakeFetch({ body: { data: {} } });
  const client = createNorthflankClient({ token: TOKEN, fetchImpl: impl });
  await client.restartService('p-1', 'api');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].url, 'https://api.northflank.com/v1/projects/p-1/services/api/restart');
  assert.equal(calls[0].url.includes(TOKEN), false);
  assert.equal(calls[0].init.body, '{}');
  await assert.rejects(async () => client.restartService('p-1', '../x'), TypeError);
  assert.equal(calls.length, 1);
});

test('id khong phai slug (../, /, ?, hoa, rong) bi chan TRUOC khi goi mang', async () => {
  const { impl, calls } = fakeFetch();
  const client = createNorthflankClient({ token: TOKEN, fetchImpl: impl });
  for (const bad of ['../secrets', 'a/b', 'a?x=1', 'A', '', undefined, 'a b']) {
    await assert.rejects(async () => client.getProject(bad), TypeError, String(bad));
    await assert.rejects(async () => client.getService('ok', bad), TypeError, String(bad));
  }
  assert.equal(calls.length, 0, 'khong duoc co yeu cau nao toi Northflank');
});

test('loi HTTP: mang status + duong dan + thong bao cua Northflank; token bi xoa neu API lap lai no', async () => {
  const { impl } = fakeFetch({
    status: 401,
    body: { error: { message: `Invalid token ${TOKEN} for Bearer ${TOKEN}` } },
  });
  const client = createNorthflankClient({ token: TOKEN, fetchImpl: impl });
  const error = await client.getProject('nexagnet-dev').catch((e) => e);
  assert.ok(error instanceof NorthflankApiError);
  assert.equal(error.status, 401);
  assert.equal(error.path, '/projects/nexagnet-dev');
  assert.equal(error.message.includes(TOKEN), false);
  assert.match(error.message, /\[REDACTED\]/);
});

test('loi mang / het gio -> status 0, va token khong lot vao thong bao', async () => {
  const { impl } = fakeFetch(new Error(`connect ECONNREFUSED while sending Bearer ${TOKEN}`));
  const client = createNorthflankClient({ token: TOKEN, fetchImpl: impl });
  const error = await client.getProject('nexagnet-dev').catch((e) => e);
  assert.ok(error instanceof NorthflankApiError);
  assert.equal(error.status, 0);
  assert.equal(error.message.includes(TOKEN), false);
});

test('phan hoi khong phai JSON van duoc xu ly: ok -> null, loi -> thong bao mac dinh', async () => {
  const ok = fakeFetch({ raw: 'not json', status: 200 });
  assert.equal(
    await createNorthflankClient({ token: TOKEN, fetchImpl: ok.impl }).getProject('a-1'),
    null,
  );
  const bad = fakeFetch({ raw: '<html>502</html>', status: 502 });
  const error = await createNorthflankClient({ token: TOKEN, fetchImpl: bad.impl })
    .getProject('a-1')
    .catch((e) => e);
  assert.equal(error.status, 502);
  assert.equal(
    error.message.includes('<html>'),
    false,
    'khong dua thang than phan hoi vao thong bao',
  );
});

test('thong bao loi khong bao gio chua than yeu cau (env, tep runtime)', async () => {
  const { impl } = fakeFetch({ status: 400, body: { error: { message: 'invalid body' } } });
  const client = createNorthflankClient({ token: TOKEN, fetchImpl: impl });
  const error = await client
    .patchDeploymentService('p-1', 'api', {
      runtimeEnvironment: { SESSION_SECRET: 'super-secret-value' },
    })
    .catch((e) => e);
  assert.equal(error.status, 400);
  assert.equal(error.message.includes('super-secret-value'), false);
  assert.equal(error.message.includes('SESSION_SECRET'), false);
});

test('loi validation 400: bao TEN truong vi pham, khong bao gio bao thong diep nhac lai gia tri', async () => {
  const { impl } = fakeFetch({
    status: 400,
    body: {
      error: {
        message: 'Request failed payload validation - see details.',
        details: {
          'healthChecks.0.periodSeconds': ['must be >= 10. Received "super-secret-value"'],
          'bad key with spaces and "quotes"': ['x'],
        },
      },
    },
  });
  const client = createNorthflankClient({ token: TOKEN, fetchImpl: impl });
  const error = await client.patchDeploymentService('p-1', 'web', {}).catch((e) => e);
  assert.equal(error.status, 400);
  assert.match(error.message, /\[truong vi pham: healthChecks\.0\.periodSeconds\]/);
  assert.equal(error.message.includes('super-secret-value'), false);
  assert.equal(error.message.includes('quotes'), false);
});

test('scrub: xoa Bearer, JWT va moi gia tri bi mat truyen vao; cat do dai', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwx';
  const text = scrub(`a Bearer abc.def-123 b ${jwt} c super-secret-value d`, [
    'super-secret-value',
  ]);
  assert.doesNotMatch(text, /abc\.def-123|eyJhbGci|super-secret-value/);
  assert.equal(scrub('x'.repeat(1000)).length, 200);
  // Gia tri bi mat QUA NGAN (< 8) khong duoc dung de xoa: se pha hong ca thong bao.
  assert.equal(scrub('abc abc', ['abc']), 'abc abc');
  assert.equal(scrub(undefined), '');
});
