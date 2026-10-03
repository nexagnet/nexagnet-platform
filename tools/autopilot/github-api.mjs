// AUTOPILOT V4 / Phase 2 — client GitHub toi thieu cho cac CLI (khong them dependency).
//
// Hai token KHONG bao gio tron: `GITHUB_TOKEN` (chi doc, quyen khai theo job) dung de LAY bang chung;
// token App V4 ngan han chi dung de GHI (comment/nhan/dispatch/merge). Moi CLI dung hai client rieng.

import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// `GITHUB_API_URL` do runner dat san (GHES/proxy); mac dinh la api.github.com. Test tro no ve may chu cuc bo.
const apiBase = () => process.env.GITHUB_API_URL || 'https://api.github.com';

export class GitHubError extends Error {
  constructor(method, path, status, detail) {
    super(`${method} ${path} -> HTTP ${status}${detail ? ` ${detail}` : ''}`);
    this.name = 'GitHubError';
    this.status = status;
  }
}

/** @param {{ token: string, fetchImpl?: typeof fetch }} options */
export function createClient({ token, fetchImpl = fetch }) {
  if (!token) throw new Error('thieu token GitHub');
  const request = async (method, path, body) => {
    const response = await fetchImpl(`${apiBase()}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      let detail = '';
      try {
        detail = String((await response.json()).message ?? '').slice(0, 300);
      } catch {
        // than loi khong phai JSON — chi giu ma HTTP
      }
      throw new GitHubError(method, path, response.status, detail);
    }
    return response.status === 204 ? null : response.json();
  };

  /** Doc moi trang; `key` la khoa chua mang khi API boc ket qua (vd `check_runs`). */
  const paginate = async (path, key) => {
    const items = [];
    for (let page = 1; page <= 30; page += 1) {
      const sep = path.includes('?') ? '&' : '?';
      const data = await request('GET', `${path}${sep}per_page=100&page=${page}`);
      const chunk = key ? data[key] : data;
      items.push(...chunk);
      if (chunk.length < 100) return items;
    }
    throw new Error(`qua 30 trang khi doc ${path}`);
  };

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    paginate,
    graphql: async (query, variables) => {
      const data = await request('POST', '/graphql', { query, variables });
      if (data?.errors?.length) throw new Error(`GraphQL: ${data.errors[0].message}`);
      return data.data;
    },
  };
}

/** Ghi output cho step; gia tri nhieu dong dung delimiter ngau nhien (khong ai doan truoc duoc). */
export function writeOutputs(outputs, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) return;
  const lines = [];
  for (const [key, value] of Object.entries(outputs)) {
    const text = String(value ?? '');
    if (text.includes('\n')) {
      const delimiter = `EOF_${randomUUID()}`;
      lines.push(`${key}<<${delimiter}`, text, delimiter);
    } else lines.push(`${key}=${text}`);
  }
  appendFileSync(outputPath, `${lines.join('\n')}\n`);
}

export const writeSummary = (text, summaryPath = process.env.GITHUB_STEP_SUMMARY) => {
  if (summaryPath) appendFileSync(summaryPath, `${text}\n`);
};

export const repositoryParts = (repository) => {
  const [owner, repo, ...rest] = String(repository ?? '').split('/');
  if (!owner || !repo || rest.length > 0)
    throw new Error(`GITHUB_REPOSITORY khong hop le: ${repository}`);
  return { owner, repo };
};

/** Nap Issue Task Contract: tieu de + than, cat bot de khong thoi phong prompt. */
export function formatContract(issue, max = 20000) {
  const text = `# Issue #${issue.number}: ${issue.title}\n\n${issue.body ?? ''}`;
  return text.length > max ? `${text.slice(0, max)}\n\n[...truncated]` : text;
}
