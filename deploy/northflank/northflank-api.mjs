/**
 * CLIENT REST NORTHFLANK TOI THIEU — chi nhung loi goi ma lan deploy xem truoc can.
 *
 * Vi sao khong dung `@northflank/js-client`: day la cong cu deploy nam ngoai workspace pnpm (cung ly
 * do `seed-transport-demo.mjs` khong import tu root), va 5 loi goi khong dang mot dependency moi
 * trong cay cua mot job co token. `fetch` co san tu Node 20.
 *
 * BI MAT:
 *   · Token chi di vao header `Authorization`. Khong bao gio vao URL, log hay thong bao loi.
 *   · Than yeu cau (co the chua env va tep runtime) khong bao gio duoc ghi lai.
 *   · Thong bao loi chi mang: phuong thuc, duong dan da loai query, HTTP status, va `error.message`
 *     do Northflank tra (cat ngan, xoa chuoi giong token).
 *
 * `fetchImpl` va `sleep` duoc tiem de test chay tat dinh ma khong cham mang.
 */

const API_BASE = 'https://api.northflank.com/v1';
const SEGMENT = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_MESSAGE = 200;

export class NorthflankApiError extends Error {
  constructor({ method, path, status, message }) {
    super(`Northflank ${method} ${path} -> ${status}: ${message}`);
    this.name = 'NorthflankApiError';
    this.method = method;
    this.path = path;
    this.status = status;
  }
}

/** Xoa moi thu giong bi mat khoi mot chuoi sap vao log. Bao thu: thieu con hon thua. */
export function scrub(text, secrets = []) {
  let out = String(text ?? '');
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 8)
      out = out.split(secret).join('[REDACTED]');
  }
  return out
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED-JWT]')
    .slice(0, MAX_MESSAGE);
}

function segment(value, label) {
  if (typeof value !== 'string' || !SEGMENT.test(value)) {
    throw new TypeError(`${label} khong phai slug Northflank hop le.`);
  }
  return value;
}

/**
 * @param {{ token: string, fetchImpl?: typeof fetch, baseUrl?: string, timeoutMs?: number }} options
 */
export function createNorthflankClient({
  token,
  fetchImpl = globalThis.fetch,
  baseUrl = API_BASE,
  timeoutMs = 30_000,
}) {
  if (typeof token !== 'string' || token.trim() === '') {
    throw new TypeError('Thieu token Northflank.');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('Khong co fetch.');

  async function request(method, path, body) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // Loi mang/timeout: khong co status. 0 = "khong toi duoc Northflank".
      throw new NorthflankApiError({
        method,
        path,
        status: 0,
        message: scrub(error instanceof Error ? error.message : String(error), [token]),
      });
    }
    const text = await response.text();
    let json = null;
    try {
      json = text === '' ? null : JSON.parse(text);
    } catch {
      json = null;
    }
    if (!response.ok) {
      throw new NorthflankApiError({
        method,
        path,
        status: response.status,
        message: scrub(json?.error?.message ?? json?.message ?? 'khong co noi dung', [token]),
      });
    }
    return json?.data ?? json;
  }

  const project = (projectId) => `/projects/${segment(projectId, 'projectId')}`;
  const service = (projectId, serviceId) =>
    `${project(projectId)}/services/${segment(serviceId, 'serviceId')}`;

  return Object.freeze({
    getProject: (projectId) => request('GET', project(projectId)),
    getService: (projectId, serviceId) => request('GET', service(projectId, serviceId)),
    listContainers: (projectId, serviceId) =>
      request('GET', `${service(projectId, serviceId)}/containers`),
    /** Khoi dong lai mot service (cung quyen `Services > General > Update` nhu PATCH). */
    restartService: (projectId, serviceId) =>
      request('POST', `${service(projectId, serviceId)}/restart`, {}),
    /** Mot PATCH nguyen tu: image + env + tep runtime + cong + health check cung mot revision. */
    patchDeploymentService: (projectId, serviceId, body) =>
      request(
        'PATCH',
        `${project(projectId)}/services/deployment/${segment(serviceId, 'serviceId')}`,
        body,
      ),
    getSecretDetails: (projectId, secretId) =>
      request('GET', `${project(projectId)}/secrets/${segment(secretId, 'secretId')}/details`),
  });
}
