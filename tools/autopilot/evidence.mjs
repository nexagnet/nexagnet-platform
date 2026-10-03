// AUTOPILOT V4 / Phase 2 — lay LAI bang chung tu GitHub (khong tin payload cua event).
//
// Dung chung cho reviewer-preflight / review-report / repair-preflight / merge-evaluate: moi CLI deu
// bat dau bang "PR nay co that su la PR cua Autopilot, dung HEAD, Issue dung rui ro khong?".

import { evaluatePullRequest, linkedIssueNumbers } from './autopilot-core.mjs';

/**
 * @param {{ read: ReturnType<import('./github-api.mjs').createClient>, repository: string, prNumber: number, expectedHeadSha?: string }} input
 * @returns {Promise<{ pr: any, issue: any | null, evaluation: ReturnType<typeof evaluatePullRequest> }>}
 */
export async function loadPullEvidence({ read, repository, prNumber, expectedHeadSha }) {
  const pr = await read.get(`/repos/${repository}/pulls/${prNumber}`);

  // Pha 1: khong can Issue de loai PR sai ngay (nhan/nhanh/repo/HEAD) — khong ton them mot loi goi API.
  const early = evaluatePullRequest({ pr, issue: null, repository, expectedHeadSha });
  if (early.decision === 'BLOCK' && early.reason !== 'ISSUE_NOT_FETCHED')
    return { pr, issue: null, evaluation: early };

  const [issueNumber] = linkedIssueNumbers(pr.body);
  const issue = await read.get(`/repos/${repository}/issues/${issueNumber}`);
  return { pr, issue, evaluation: evaluatePullRequest({ pr, issue, repository, expectedHeadSha }) };
}

export const loadComments = (read, repository, prNumber) =>
  read.paginate(`/repos/${repository}/issues/${prNumber}/comments`);

export const parsePrNumber = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};
