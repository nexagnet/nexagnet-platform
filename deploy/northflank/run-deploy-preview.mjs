/**
 * CLI ma workflow `reusable-deploy-northflank.yml` chay. Giu YAML xuong mot dong `node` de logic
 * test duoc va buoc nay khong thanh cho quy tac moi tich tu im lang.
 *
 * Doc env: PROVIDER, TENANT, ENVIRONMENT, DEPLOYMENT_PROFILE, STACK_SLUG, GIT_SHA, IMAGE_REF,
 * NORTHFLANK_PROJECT_ID, NORTHFLANK_API_SERVICE_ID, NORTHFLANK_WEB_SERVICE_ID, NORTHFLANK_API_TOKEN,
 * GITHUB_REF, GITHUB_RUN_ID, GD1_TEST_CI_CONCLUSION; tuy chon DEPLOY_SIGNAL_LOG, DEPLOY_SIGNAL_JSON,
 * GITHUB_STEP_SUMMARY.
 *
 * `--preflight`: chi kiem dieu kien (yeu cau, token, project, mat khau van hanh) TRUOC khi build image;
 * khong cham vao service nao. Thanh cong -> thoat 0 va KHONG ghi bao cao (khong chung minh gi ve ban
 * phat hanh). That bai -> ghi `rollout: fail` voi ma co kieu va thoat 1.
 *
 * MA THOAT la quyet dinh cung: 0 CHI KHI evaluator cua duong VM ket luan khong co that bai cung VA moi
 * tang cung `pass`. Bao cao (`deploy-signals.json`) luon duoc ghi, ke ca khi that bai — do la luc no
 * co gia tri nhat, va runtime proof doc no de dang `RUNTIME_PROOF_FAILED` kem ly do.
 */

import { writeFileSync } from 'node:fs';
import process from 'node:process';

import {
  StageAborted,
  createJournal,
  finalizeSignals,
  runPreflight,
  runPreviewDeploy,
  writeFinalReport,
} from './deploy-preview.mjs';
import { scrub } from './northflank-api.mjs';

const preflightOnly = process.argv.includes('--preflight');
const logPath = process.env.DEPLOY_SIGNAL_LOG ?? 'deploy-signals.log';
const jsonPath = process.env.DEPLOY_SIGNAL_JSON ?? 'deploy-signals.json';

// Tep nhat ky bat dau RONG moi lan chay: mot dong cua lan chay truoc khong bao gio duoc o lai.
writeFileSync(logPath, '', 'utf8');
const journal = createJournal({ logPath });

let exitCode = 0;
try {
  if (preflightOnly) await runPreflight({ env: process.env, journal });
  else await runPreviewDeploy({ env: process.env, journal });
} catch (error) {
  exitCode = 1;
  if (error instanceof StageAborted) {
    process.stderr.write(`Deploy Northflank DUNG o tang ${error.layer}: ${error.reason}\n`);
  } else {
    // Mot loi bat ngo KHONG duoc nuot: tang chua bao gi se de lai tin hieu `pending` va evaluator
    // se ket luan `DEPLOY_SIGNAL_INCOMPLETE`, khong bao gio ra mau xanh.
    process.stderr.write(
      `Deploy Northflank chet bat ngo: ${scrub(error instanceof Error ? error.message : String(error), [process.env.NORTHFLANK_API_TOKEN])}\n`,
    );
  }
}

if (preflightOnly && exitCode === 0) {
  process.stdout.write(
    'Preflight Northflank: du dieu kien deploy (chua deploy gi, chua chung minh gi).\n',
  );
  process.exit(0);
}

const final = finalizeSignals({ journalText: journal.text(), exitCode });
writeFinalReport(final, { jsonPath, summaryPath: process.env.GITHUB_STEP_SUMMARY });

if (!final.passed) {
  process.stderr.write('Deploy KHONG duoc chung minh — doc bang tin hieu o Step Summary.\n');
  process.exit(1);
}
process.stdout.write(
  `Deploy xong: provider=northflank tenant=${process.env.TENANT} environment=${process.env.ENVIRONMENT} git_sha=${process.env.GIT_SHA}\n`,
);
