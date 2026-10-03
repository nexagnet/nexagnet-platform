// Fixture + GitHub gia (trong bo nho) cho test Phase 2. Khong phai test (khong ten `*.test.mjs`).

import {
  GENERATED_LABEL,
  REQUIRED_CHECKS,
  TRUSTED_BOT_LOGIN,
  REVIEWER_RUN_NAME_PREFIX,
  REVIEWER_WORKFLOW_PATH,
} from './autopilot-core.mjs';
import { GitHubError } from './github-api.mjs';
import { buildReviewComment } from './review-result.mjs';

export const REPO = 'nexagnet/nexagnet-platform';
export const HEAD = 'a'.repeat(40);
export const OTHER_HEAD = 'b'.repeat(40);
export const REVIEW_RUN_ID = 5550001;
const RUN_STARTED = '2026-10-03T10:00:00Z';
const AFTER_RUN = '2026-10-03T10:05:00Z';

export const makePr = (overrides = {}) => ({
  number: 77,
  node_id: 'PR_node_77',
  state: 'open',
  merged: false,
  draft: true,
  body: 'Closes #50\n\nOpened by workflow autopilot-builder',
  labels: [{ name: GENERATED_LABEL }],
  changed_files: 2,
  head: { ref: 'autopilot/issue-50-1', sha: HEAD, repo: { full_name: REPO } },
  base: { ref: 'main', repo: { full_name: REPO } },
  ...overrides,
});

export const makeIssue = (risk = 'R1', overrides = {}) => ({
  number: 50,
  title: 'Them truong X',
  body: 'Task Contract: them truong X.',
  state: 'open',
  labels: risk ? [{ name: `risk:${risk}` }] : [],
  ...overrides,
});

export const greenChecks = (head = HEAD) =>
  REQUIRED_CHECKS.map((name, i) => ({
    id: 100 + i,
    name,
    head_sha: head,
    status: 'completed',
    conclusion: 'success',
    app: { slug: 'github-actions' },
  }));

export const reviewResult = (verdict = 'PASS', head = HEAD) => ({
  verdict,
  head_sha: head,
  summary: 'Tom tat review.',
  findings:
    verdict === 'PASS'
      ? [{ severity: 'nit', path: 'a.ts', line: 1, message: 'dat ten lai' }]
      : [{ severity: 'major', path: 'src/x.ts', line: 12, message: 'thieu kiem tra null' }],
});

export const botUser = { login: TRUSTED_BOT_LOGIN, type: 'Bot' };

export const reviewComment = ({
  id = 900,
  verdict = 'PASS',
  head = HEAD,
  risk = 'R1',
  runId = REVIEW_RUN_ID,
  user = botUser,
  createdAt = AFTER_RUN,
} = {}) => ({
  id,
  user,
  created_at: createdAt,
  body: buildReviewComment({
    result: reviewResult(verdict, head),
    risk,
    runId,
    runUrl: `https://github.com/${REPO}/actions/runs/${runId}`,
  }),
});

export const reviewerRun = (overrides = {}) => ({
  id: REVIEW_RUN_ID,
  path: REVIEWER_WORKFLOW_PATH,
  event: 'workflow_run',
  display_title: `${REVIEWER_RUN_NAME_PREFIX} ${HEAD}`,
  status: 'in_progress',
  conclusion: null,
  run_started_at: RUN_STARTED,
  ...overrides,
});

/**
 * GitHub gia: `read` va `write` dung chung mot trang thai, nen comment/nhan ma `write` dang thi `read`
 * thay o lan goi sau. Moi lenh ghi duoc ghi vao `calls`.
 */
export function fakeGitHub({
  pr = makePr(),
  issue = makeIssue(),
  comments = [],
  checkRuns = greenChecks(),
  files = [{ filename: 'apps/api/src/x.ts' }, { filename: 'apps/api/src/x.spec.ts' }],
  runs = { [REVIEW_RUN_ID]: reviewerRun() },
  mergeError = null,
} = {}) {
  const state = { pr: { ...pr, labels: [...pr.labels] }, comments: [...comments], calls: [] };
  let nextId = 2000;
  const notFound = (path) => new GitHubError('GET', path, 404, 'Not Found');
  const prPath = new RegExp(`^/repos/${REPO}/pulls/${pr.number}$`);

  const get = async (path) => {
    if (prPath.test(path)) return state.pr;
    const issueMatch = new RegExp(`^/repos/${REPO}/issues/(\\d+)$`).exec(path);
    if (issueMatch) {
      if (Number(issueMatch[1]) === issue.number) return issue;
      throw notFound(path);
    }
    const runMatch = new RegExp(`^/repos/${REPO}/actions/runs/(\\d+)$`).exec(path);
    if (runMatch) {
      const run = runs[runMatch[1]];
      if (!run) throw notFound(path);
      return run;
    }
    if (path.startsWith('/users/')) return { id: 424242 };
    throw notFound(path);
  };

  const paginate = async (path, key) => {
    if (/\/issues\/\d+\/comments$/.test(path)) return state.comments;
    if (/\/check-runs$/.test(path) && key === 'check_runs') return checkRuns;
    if (/\/pulls\/\d+\/files$/.test(path)) return files;
    throw notFound(path);
  };

  const post = async (path, body) => {
    state.calls.push({ method: 'POST', path, body });
    if (/\/issues\/\d+\/comments$/.test(path)) {
      const created = {
        id: nextId++,
        user: botUser,
        created_at: '2026-10-03T10:30:00Z',
        body: body.body,
      };
      state.comments.push(created);
      return created;
    }
    if (/\/issues\/\d+\/labels$/.test(path)) {
      for (const label of body.labels) state.pr.labels.push({ name: label });
      return null;
    }
    if (/\/dispatches$/.test(path)) return null;
    throw notFound(path);
  };

  const put = async (path, body) => {
    state.calls.push({ method: 'PUT', path, body });
    if (mergeError) throw mergeError;
    return { sha: 'c'.repeat(40), merged: true };
  };

  const graphql = async (query, variables) => {
    state.calls.push({ method: 'GRAPHQL', query, variables });
    state.pr.draft = false;
    return { markPullRequestReadyForReview: { pullRequest: { isDraft: false } } };
  };

  return {
    state,
    read: { get, paginate },
    write: { get, paginate, post, put, graphql },
    calls: (kind) => state.calls.filter((c) => (kind ? c.path?.includes(kind) : true)),
  };
}
