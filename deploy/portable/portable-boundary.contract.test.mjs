import { ok, strictEqual } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * RANH GIOI PORTABLE — HOP DONG, khong phai mot y dinh tot.
 *
 * ============================================================================================
 * VI SAO BAI NAY TON TAI.
 *
 * #224 doi mot dieu cu the: mot Ubuntu sach phai dung duoc stack MA KHONG CAN `gcloud`. Cai lam
 * hong yeu cau do khong bao gio la mot ban viet lai — no la MOT DONG. Ai do them mot
 * `gcloud storage cp` vao `backup.sh` cho tien, va sau do tang portable chi con portable tren
 * giay. Va no se KHONG lo ra luc chay: tren VM GCP moi thu van xanh.
 *
 * Nen ranh gioi phai duoc DO, khong duoc mo ta. Bai duoi day doc chinh cac tep trong
 * `deploy/portable/` va do nguoc: co dong LENH nao (khong phai chu thich) goi mot cong cu rieng
 * cua mot nha cung cap khong.
 *
 * ============================================================================================
 * CHU THICH DUOC PHEP NHAC TEN NHA CUNG CAP.
 *
 * Bai nay bo qua dong bat dau bang `#`. Do la co y: cach duy nhat de giai thich VI SAO mot ranh
 * gioi ton tai la duoc phep goi ten cai nam ben kia no. Cam ca chu thich se buoc nguoi viet phai
 * im lang ve chinh dieu quan trong nhat.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PORTABLE = HERE;
const PROVIDERS = resolve(HERE, '../providers');
const SECRET_SOURCE = join(PORTABLE, 'secret-source.sh');

/**
 * Cong cu/diem cuoi RIENG cua mot nha cung cap. Chuoi tran, khong regex: mot bieu thuc co escape
 * di qua heredoc/CI de mat mot lop backslash roi khop nham ma van "xanh".
 */
const PROVIDER_TOKENS = [
  'gcloud', 'gsutil', 'gs://', 'storage.googleapis.com', 'metadata.google.internal',
  'GOOGLE_APPLICATION_CREDENTIALS', 'artifactregistry', 'secretmanager.googleapis.com',
  'aws ', 'az ', 'doctl', 'hcloud',
];

/** Dong lenh = dong khong rong va khong bat dau bang `#` sau khi bo khoang trang dau. */
function commandLines(text) {
  return text.split('\n')
    .map((line, index) => ({ n: index + 1, s: line.trim() }))
    .filter(({ s }) => s.length > 0 && !s.startsWith('#'));
}

function shellFilesIn(dir) {
  return readdirSync(dir).filter((f) => f.endsWith('.sh')).map((f) => join(dir, f));
}

describe('ranh gioi portable', () => {
  it('khong tep nao trong deploy/portable/ GOI mot cong cu rieng cua nha cung cap', () => {
    const offences = [];
    for (const file of shellFilesIn(PORTABLE)) {
      for (const { n, s } of commandLines(readFileSync(file, 'utf8'))) {
        for (const token of PROVIDER_TOKENS) {
          if (s.includes(token)) offences.push(`${file}:${n}: ${token} -> ${s}`);
        }
      }
    }
    strictEqual(offences.join('\n'), '', `tang portable goi cong cu nha cung cap:\n${offences.join('\n')}`);
  });

  it('hien thuc GCP ton tai va nam NGOAI portable/', () => {
    const impl = join(PROVIDERS, 'gcp', 'secret-source.sh');
    const body = readFileSync(impl, 'utf8');
    ok(body.includes('netviet_secret_backend_read'), 'provider phai dinh nghia netviet_secret_backend_read');
    ok(body.includes('gcloud secrets versions access'), 'provider GCP van phai giu duong GCP that su');
  });

  it('moi script shell ket thuc dong bang LF, khong CRLF', () => {
    // MOT SCRIPT CRLF KHONG CHAY DUOC TREN LINUX, va loi no nem ra la thu kho doan nhat trong ca
    // repo nay: bash bao 'command not found' cho mot ky tu vo hinh, roi 'syntax error near
    // unexpected token' ngay tai mot dong khong co gi sai. Nguoi doc se di tim loi cu phap trong
    // chinh dong do va khong tim thay.
    //
    // `.gitattributes` da co `*.sh text eol=lf`, nhung `deploy-remote.sh` day len host bang rsync
    // tu WORKING TREE chu khong tu mot lan checkout sach — nen mot may Windows cau hinh khac van
    // co the day mot ban CRLF len may khach. Do o day de no chet o CI, khong chet o may khach.
    const CR = String.fromCharCode(13);
    const offences = [];
    for (const dir of [PORTABLE, join(PROVIDERS, 'gcp')]) {
      for (const file of shellFilesIn(dir)) {
        if (readFileSync(file, 'utf8').includes(CR)) offences.push(file);
      }
    }
    strictEqual(offences.join(', '), '', `script shell co CRLF: ${offences.join(', ')}`);
  });

  it('install-host.sh khong cai agent cua mot nha cung cap', () => {
    const body = readFileSync(join(PORTABLE, 'install-host.sh'), 'utf8');
    for (const { n, s } of commandLines(body)) {
      ok(!s.includes('google-cloud-ops-agent'), `install-host.sh:${n} cai ops agent cua Google`);
      ok(!s.includes('dl.google.com'), `install-host.sh:${n} tai tu dl.google.com`);
    }
  });
});

const scratch = mkdtempSync(join(tmpdir(), 'portable-secrets-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** `chmod` la no-op tren mot so filesystem (vd o dia Windows). Do that, dung doan. */
function chmodIsEffective() {
  const probe = join(scratch, '.chmod-probe');
  writeFileSync(probe, 'x');
  chmodSync(probe, 0o600);
  return (statSync(probe).mode & 0o777) === 0o600;
}

function runSecret(script, env = {}) {
  return spawnSync('bash', ['-c', `. "${SECRET_SOURCE}"\n${script}`], {
    encoding: 'utf8',
    env: { ...process.env, SECRET_DIR: join(scratch, 'secrets'), ...env },
  });
}

describe('nguon bi mat: backend file', () => {
  const dir = join(scratch, 'secrets');
  writeFileSync(join(scratch, '.keep'), '');
  spawnSync('mkdir', ['-p', dir]);
  writeFileSync(join(dir, 'ok'), 'gia-tri-that');
  writeFileSync(join(dir, 'crlf'), 'co-cr\r');
  writeFileSync(join(dir, 'loose'), 'de-doc');
  if (chmodIsEffective()) {
    chmodSync(join(dir, 'ok'), 0o600);
    chmodSync(join(dir, 'crlf'), 0o600);
    chmodSync(join(dir, 'loose'), 0o644);
  }

  it('doc duoc mot bi mat 0600', { skip: !chmodIsEffective() && 'chmod khong hieu luc tren fs nay' }, () => {
    const r = runSecret('secret ok');
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.stdout, 'gia-tri-that');
  });

  it('CAT ky tu CR o cuoi', { skip: !chmodIsEffective() && 'chmod khong hieu luc tren fs nay' }, () => {
    strictEqual(runSecret('secret crlf').stdout, 'co-cr');
  });

  it('TU CHOI mot bi mat ai cung doc duoc', { skip: !chmodIsEffective() && 'chmod khong hieu luc tren fs nay' }, () => {
    const r = runSecret('secret loose');
    ok(r.status !== 0, 'phai that bai tren tep 0644');
    ok(r.stderr.includes('0600'), `phai noi ro quyen can co, thay: ${r.stderr}`);
  });

  it('bi mat BAT BUOC thieu -> chet ngay', () => {
    ok(runSecret('secret khong-ton-tai').status !== 0);
  });

  it('bi mat TUY CHON thieu -> rong, khong chet', () => {
    const r = runSecret('optional_secret khong-ton-tai');
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.stdout, '');
  });

  it('backend khong co hien thuc -> bao ro, khong am tham tra rong', () => {
    const r = runSecret('secret ok', { SECRET_BACKEND: 'khong-co-that' });
    ok(r.status !== 0, 'backend la thi phai that bai');
  });
});
