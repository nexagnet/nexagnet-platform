/**
 * DOI CHIEU DANH TINH TRONG TIEN TRINH LUC BOOT: SHA nuong trong image == SHA trong release.json.
 *
 * Hai ve khong phai la mot nguon:
 *   · `/app/BUILD_REVISION` duoc ghi LUC BUILD tu `--build-arg GIT_SHA`, tu checkout cua chinh commit
 *     do. No la cai IMAGE tu khai.
 *   · `/runtime/release.json` duoc mount boi lan DEPLOY (cung PATCH voi image). No la cai DEPLOY khai.
 * Hai cai phai bang nhau. Lech nhau nghia la image va manifest khong den tu cung mot lan chay —
 * vi du mot tag/digest cu duoc gan vao mot manifest moi — va tien trinh KHONG DUOC phep len: thoat
 * 1 de Northflank bao rollout that bai thay vi phuc vu mot ban phat hanh khong ai chung minh duoc.
 *
 * Day la cong chan o tang TIEN TRINH, cung ho voi `RELEASE_IDENTITY_MISMATCH` cua `deploy-stack.sh`
 * tren VM. Smoke tat dinh o ngoai van doi chieu lai SHA ma tien trinh khai qua HTTP.
 *
 * Khong doc, khong in bi mat: chi hai SHA.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const BUILD_REVISION_PATH = '/app/BUILD_REVISION';
export const DEFAULT_MANIFEST_PATH = '/runtime/release.json';
const SHA = /^[a-f0-9]{40}$/;

/**
 * @returns {{ ok: true, gitSha: string } | { ok: false, reason: string }}
 */
export function checkImageIdentity({
  read = (path) => readFileSync(path, 'utf8'),
  env = process.env,
  revisionPath = BUILD_REVISION_PATH,
} = {}) {
  let baked;
  try {
    baked = read(revisionPath).trim();
  } catch {
    return { ok: false, reason: 'BUILD_REVISION_MISSING' };
  }
  if (!SHA.test(baked)) return { ok: false, reason: 'BUILD_REVISION_INVALID' };

  const manifestPath = env.RELEASE_MANIFEST_PATH?.trim() || DEFAULT_MANIFEST_PATH;
  let manifest;
  try {
    manifest = JSON.parse(read(manifestPath));
  } catch (error) {
    // Khong co tep va tep hong la hai hong hoc khac nhau: mot la mount hong, mot la ghi hong.
    return {
      ok: false,
      reason: error?.code === 'ENOENT' ? 'RELEASE_MANIFEST_MISSING' : 'RELEASE_MANIFEST_INVALID',
    };
  }
  const declared = typeof manifest?.gitSha === 'string' ? manifest.gitSha.trim() : '';
  if (!SHA.test(declared)) return { ok: false, reason: 'RELEASE_MANIFEST_INVALID' };
  if (declared !== baked) return { ok: false, reason: 'RELEASE_IDENTITY_MISMATCH' };
  return { ok: true, gitSha: baked };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkImageIdentity();
  if (!result.ok) {
    process.stderr.write(`Danh tinh ban phat hanh KHONG khop: ${result.reason}\n`);
    process.exit(1);
  }
  process.stdout.write(`Danh tinh ban phat hanh: image == manifest == ${result.gitSha}\n`);
}
