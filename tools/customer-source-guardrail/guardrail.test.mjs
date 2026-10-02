import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ALLOWLIST,
  VIOLATION_CODES,
  allowlistEntryFor,
  checkAllowlistEvidence,
  findHistoryViolations,
  findStaleAllowlistEntries,
  findViolations,
  isInCustomerSourceArea,
  isRawArtifact,
  parseChangedPaths,
} from './guardrail.mjs';

/**
 * Bo test cua hop dong NO_RAW_CUSTOMER_ARTIFACT_IN_GIT.
 *
 * Moi bai deu chay tren duong dan TONG HOP. Khong bai nao tao mot tai lieu khach that de chung
 * minh rang tai lieu khach that bi chan — do se la chinh cai viec ma cong nay sinh ra de cam.
 */

/** Chi lay duong dan — phan lon cac bai chi quan tam "co bi chan khong", khong quan tam ma nao. */
const paths = (violations) => violations.map((row) => row.path);

test('tai lieu goc cua khach trong vung nguon goc thi bi chan', () => {
  const violations = findViolations([
    'docs/khach-hang/khach-tong-hop/nguon-goc/hop-dong-khung.pdf',
    'docs/khach-hang/khach-tong-hop/nguon-goc/bang-gia-thang.xlsx',
    'docs/khach-hang/khach-tong-hop/trao-doi/anh-chup-don.heic',
    'docs/khach-hang/khach-tong-hop/nghiep-vu/ho-so.docx',
  ]);
  assert.deepEqual(paths(violations), [
    'docs/khach-hang/khach-tong-hop/nghiep-vu/ho-so.docx',
    'docs/khach-hang/khach-tong-hop/nguon-goc/bang-gia-thang.xlsx',
    'docs/khach-hang/khach-tong-hop/nguon-goc/hop-dong-khung.pdf',
    'docs/khach-hang/khach-tong-hop/trao-doi/anh-chup-don.heic',
  ]);
});

test('vung lam viec rieng trong repo va thu muc nguon cua goi khach cung duoc canh', () => {
  assert.deepEqual(
    paths(
      findViolations([
        '.customer-sources/khach-tong-hop/khao-sat.docx',
        'tenants/khach-tong-hop/sources/bang-gia.pdf',
      ]),
    ),
    [
      '.customer-sources/khach-tong-hop/khao-sat.docx',
      'tenants/khach-tong-hop/sources/bang-gia.pdf',
    ],
  );
});

// KHONG BAO DONG GIA. Mot cong keu oan la mot cong se bi tat.
test('tai san hop le cua repo khong bi bao nham', () => {
  assert.deepEqual(
    findViolations([
      'apps/web/public/netviet-logo.png',
      'apps/api/src/source-registry/source-lifecycle.ts',
      'docs/kien-truc/he-thong.md',
      'docs/khach-hang/khach-tong-hop/nghiep-vu/mo-ta-nghiep-vu.md',
      'docs/khach-hang/khach-tong-hop/nguon-goc/de-xuat-giai-phap.md',
      'tools/excel-template/generate_a4_template.py',
      'pnpm-lock.yaml',
    ]),
    [],
  );
});

// Ranh gioi duong dan: MOT tep nhi phan y het nhau, o hai cho khac nhau, cho ra hai ket qua khac
// nhau. Do dung la y nghia cua "quy tac theo duong dan" o muc 9 cua hop dong nhiem vu.
test('cung mot duoi tep: trong vung khach thi chan, ngoai vung thi khong', () => {
  assert.equal(findViolations(['docs/khach-hang/x/nguon-goc/a.pdf']).length, 1);
  assert.equal(findViolations(['docs/kien-truc/so-do.pdf']).length, 0);
  assert.equal(findViolations(['tools/poc-observability/mau.pdf']).length, 0);
});

test('dinh dang chung ta TRICH XUAT RA thi khong bi chan', () => {
  assert.deepEqual(
    findViolations([
      'docs/khach-hang/x/nguon-goc/trich-xuat.md',
      'docs/khach-hang/x/nguon-goc/su-that.json',
    ]),
    [],
  );
});

/* ------------------------------------------------------------------ *
 * DINH DANG TAI LIEU GOC MA BAN TRUOC BO LOT
 * ------------------------------------------------------------------ */

/**
 * Theo `CLAUDE.md`, duoi 20% don hang Ultty vao he thong duoi dang ANH CHUP BANG. Tuc anh la mot
 * trong nhung dinh dang tai lieu goc pho bien nhat cua khach nay — va ban truoc cua cong nay cho
 * no di thang qua.
 */
test('anh chup cua khach bi chan — day la dinh dang tai lieu goc pho bien nhat cua Ultty', () => {
  assert.deepEqual(
    paths(
      findViolations([
        'docs/khach-hang/x/trao-doi/anh-chup-don-hang.jpg',
        'docs/khach-hang/x/trao-doi/bang-gia-chup-man.png',
        '.customer-sources/x/screenshot.jpeg',
        'tenants/x/sources/bang-ke.webp',
      ]),
    ),
    [
      '.customer-sources/x/screenshot.jpeg',
      'docs/khach-hang/x/trao-doi/anh-chup-don-hang.jpg',
      'docs/khach-hang/x/trao-doi/bang-gia-chup-man.png',
      'tenants/x/sources/bang-ke.webp',
    ],
  );
});

// Trong mot vung nguon goc cua khach, mot CSV gan nhu chac chan la ban xuat khach gui sang: thu
// chung ta trich xuat RA la `.md` va `.json`, khong phai `.csv`.
test('ban xuat CSV/TSV trong vung khach bi chan', () => {
  assert.deepEqual(
    paths(
      findViolations([
        'docs/khach-hang/x/nguon-goc/danh-sach-dai-ly.csv',
        'tenants/x/sources/ton-kho.tsv',
      ]),
    ),
    ['docs/khach-hang/x/nguon-goc/danh-sach-dai-ly.csv', 'tenants/x/sources/ton-kho.tsv'],
  );
  // Ngoai vung khach thi khong dinh — bang du lieu cua chinh chung ta van song binh thuong.
  assert.deepEqual(findViolations(['docs/phat-trien/so-lieu/benchmark.csv']), []);
});

/* ------------------------------------------------------------------ *
 * NGOAI LE PHAI CO BANG CHUNG DO DUOC
 * ------------------------------------------------------------------ */

test('ngoai le phai co ly do doc duoc, khong duoc de trong', () => {
  for (const entry of ALLOWLIST) {
    assert.ok(
      entry.reason && entry.reason.trim().length > 40,
      `Ngoai le ${entry.pattern} thieu ly do`,
    );
    // "Da co tu truoc" khong phai mot ly do — ngoai le phai noi duoc vi sao tep KHONG phai cua khach.
    assert.doesNotMatch(entry.reason, /da co tu truoc|legacy|tam thoi/i);
  }
});

// Bai QUAN TRONG NHAT cua tep nay. Mot cau van xuoi khong phai bang chung: ngoai le `.xlsx` cu
// noi "khong co sharedStrings tuc khong co du lieu", va cau do SAI — tep chua ba ten dai ly va
// hai chat ID nhom, ghi duoi dang inlineStr.
test('moi ngoai le phai mang bang chung do duoc, khong chi mot cau van', () => {
  for (const entry of ALLOWLIST) {
    assert.ok(entry.evidence, `Ngoai le ${entry.pattern} khong co bang chung`);
    assert.ok(
      ['digest', 'sourceFile'].includes(entry.evidence.kind),
      `Ngoai le ${entry.pattern} mang loai bang chung khong kiem chung duoc`,
    );
    if (entry.evidence.kind === 'digest') {
      assert.match(entry.evidence.sha256, /^[0-9a-f]{64}$/, 'sha256 phai la 64 ky tu hex');
    }
  }
});

test('ngoai le chi mo dung tep no noi, khong mo ca thu muc', () => {
  // Ban giao do chung ta sinh ra, VA co nguon HTML tai sinh duoc: mo.
  assert.deepEqual(
    findViolations([
      'docs/khach-hang/x/ban-giao/01-nghiep-vu.pdf',
      'docs/khach-hang/x/ban-giao/nguon-html/01-nghiep-vu.html',
    ]),
    [],
  );
  // Nhung mot tai lieu goc cua khach nem vao CUNG thu muc do thi VAN chan.
  assert.deepEqual(paths(findViolations(['docs/khach-hang/x/ban-giao/hop-dong-khach-ky.docx'])), [
    'docs/khach-hang/x/ban-giao/hop-dong-khach-ky.docx',
  ]);
});

// Day la lo hong that su cua ngoai le "theo duong dan": mot PDF cua khach doi ten cho khop mau
// se di qua. Bay gio no phai co nguon HTML tai sinh duoc trong repo moi qua.
test('PDF trong thu muc ban-giao ma KHONG co nguon HTML thi van bi chan', () => {
  const violations = findViolations(['docs/khach-hang/x/ban-giao/hop-dong-khach-gui.pdf']);
  assert.deepEqual(paths(violations), ['docs/khach-hang/x/ban-giao/hop-dong-khach-gui.pdf']);
  assert.equal(violations[0].code, VIOLATION_CODES.SOURCE_FILE_MISSING);
});

// Anh minh hoa cho tai lieu ban giao la dau ra cua chung ta. Ngoai le mo DUNG mot hinh dang: .jpg,
// trong `ban-giao/assets/<vai>/`, ten `NN-...`, va cung thu muc co so nguon goc anh.
test('anh ban giao co so nguon goc thi qua, thieu so thi van chan', () => {
  const shot = 'docs/khach-hang/x/ban-giao/assets/lanh-dao/01-tong-quan.jpg';
  const manifest = 'docs/khach-hang/x/ban-giao/assets/lanh-dao/NGUON-ANH.md';
  assert.deepEqual(findViolations([shot, manifest]), []);

  const violations = findViolations([shot]);
  assert.deepEqual(paths(violations), [shot]);
  assert.equal(violations[0].code, VIOLATION_CODES.SOURCE_FILE_MISSING);
});

test('ngoai le anh ban giao khong mo png, ten tu do, hay thu muc khac', () => {
  const blocked = [
    'docs/khach-hang/x/ban-giao/assets/lanh-dao/01-tong-quan.png',
    'docs/khach-hang/x/ban-giao/assets/lanh-dao/anh-khach-gui.jpg',
    'docs/khach-hang/x/ban-giao/assets/lanh-dao/01-Anh-Zalo.jpg',
    'docs/khach-hang/x/ban-giao/anh/01-tong-quan.jpg',
    'docs/khach-hang/x/trao-doi/assets/lanh-dao/01-tong-quan.jpg',
  ];
  const manifests = [
    'docs/khach-hang/x/ban-giao/assets/lanh-dao/NGUON-ANH.md',
    'docs/khach-hang/x/ban-giao/anh/NGUON-ANH.md',
    'docs/khach-hang/x/trao-doi/assets/lanh-dao/NGUON-ANH.md',
  ];
  assert.deepEqual(paths(findViolations([...blocked, ...manifests])), [...blocked].sort());
});

// CO CHE `digest` van duoc khoa lai, du hom nay KHONG con dong ALLOWLIST nao dung no — xem
// header cua guardrail.mjs: ngoai le xlsx da bi go vi ghim hash chi chung minh "van la tep do",
// khong chung minh "tep do duoc phep cong khai". Bai test dung mot dong ngoai le TU DUNG de co
// che khong chet theo, va de dong ngoai le that tiep theo (neu co) khong phai lam lai tu dau.
const DIGEST_FIXTURE = {
  pattern: /^docs\/khach-hang\/x\/trao-doi\/bieu-mau\.xlsx$/,
  reason: 'Dong ngoai le gia, chi de kiem chung co che digest.',
  evidence: { kind: 'digest', sha256: 'a'.repeat(64) },
};
const DIGEST_TARGET = 'docs/khach-hang/x/trao-doi/bieu-mau.xlsx';

test('ngoai le ghim hash: byte dung thi qua, byte khac thi chan', () => {
  assert.equal(
    checkAllowlistEvidence(DIGEST_TARGET, DIGEST_FIXTURE, {
      digestOf: () => DIGEST_FIXTURE.evidence.sha256,
    }),
    null,
  );

  assert.equal(
    checkAllowlistEvidence(DIGEST_TARGET, DIGEST_FIXTURE, { digestOf: () => 'f'.repeat(64) }),
    VIOLATION_CODES.DIGEST_MISMATCH,
  );
});

// FAIL CLOSED. Mot ngoai le khong kiem chung duoc va mot ngoai le sai la cung mot thu doi voi mot
// repo public — nen khong do duoc byte thi khong duoc cho qua.
test('ngoai le ghim hash ma khong do duoc byte thi KHONG duoc cho qua', () => {
  assert.equal(
    checkAllowlistEvidence(DIGEST_TARGET, DIGEST_FIXTURE, {}),
    VIOLATION_CODES.EVIDENCE_UNVERIFIABLE,
  );
  assert.equal(
    checkAllowlistEvidence(DIGEST_TARGET, DIGEST_FIXTURE, { digestOf: () => null }),
    VIOLATION_CODES.EVIDENCE_UNVERIFIABLE,
  );
});

// Va cai quan trong hon: cai tep that su KHONG con duoc mo cua nua.
test('a4-dai-ly-map-nhom-ultty.xlsx khong con ngoai le nao — no la ban build, khong vao git', () => {
  const target = 'docs/khach-hang/ultty/trao-doi/a4-dai-ly-map-nhom-ultty.xlsx';
  assert.equal(allowlistEntryFor(target), null);

  const violations = findViolations([target], { digestOf: () => 'a'.repeat(64) });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].code, VIOLATION_CODES.NOT_ALLOWLISTED);
});

test('phan loai duong dan va duoi tep tach bach nhau', () => {
  assert.equal(isInCustomerSourceArea('docs/khach-hang/x/nguon-goc/a.md'), true);
  assert.equal(isInCustomerSourceArea('docs/kien-truc/a.pdf'), false);
  assert.equal(isRawArtifact('a.PDF'), true, 'duoi tep viet hoa van phai bat duoc');
  assert.equal(isRawArtifact('a.JPG'), true);
  assert.equal(isRawArtifact('a.md'), false);
});

/* ------------------------------------------------------------------ *
 * Doi chieu voi REPO THAT
 * ------------------------------------------------------------------ */

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

/** Do byte y het CLI: uu tien index, roi HEAD, cuoi cung moi den dia. */
const digestOf = (path) => {
  for (const ref of [`:${path}`, `HEAD:${path}`]) {
    try {
      const blob = execFileSync('git', ['show', ref], {
        encoding: 'buffer',
        maxBuffer: 256 * 1024 * 1024,
      });
      return createHash('sha256').update(blob).digest('hex');
    } catch {
      // Thu ref ke tiep.
    }
  }
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    return null;
  }
};

// Bai nay la thu duy nhat trong tep noi ve HOM NAY. Cac bai tren chung minh quy tac dung; bai nay
// chung minh repo dang SACH theo quy tac do.
test('repo hien tai khong chua tai lieu goc nao cua khach', () => {
  assert.deepEqual(findViolations(tracked, { digestOf }), []);
});

// Doi chung chong bai test rong: neu quy tac bong bi noi long toi muc khong con chan gi, bai tren
// van xanh. Bai nay giu lai bang cach doi cong PHAI chan mot tep tong hop dat trong vung khach.
test('cong that su con chan — doi chung chong bai test rong', () => {
  const withPlant = [...tracked, 'docs/khach-hang/khach-tong-hop/nguon-goc/hop-dong-gia-dinh.pdf'];
  assert.deepEqual(paths(findViolations(withPlant, { digestOf })), [
    'docs/khach-hang/khach-tong-hop/nguon-goc/hop-dong-gia-dinh.pdf',
  ]);
});

// Danh sach ngoai le no ra theo thoi gian cho toi luc khong ai dam sua. Bai nay giu no bang dung
// so tep no thuc su dang che.
test('khong con ngoai le nao da het tac dung', () => {
  assert.deepEqual(
    findStaleAllowlistEntries(tracked).map((entry) => String(entry.pattern)),
    [],
  );
});

// So nguon goc la bang chung cua ngoai le tren — no chi co nghia khi ghi DUNG TEN tung anh. Mot anh
// moi them vao thu muc ma khong ai khai nguon thi bai nay do, du guardrail cau truc van qua.
test('moi anh ban giao dang theo doi deu duoc khai trong so nguon goc cung thu muc', () => {
  const shots = tracked.filter((path) =>
    /^docs\/khach-hang\/[^/]+\/ban-giao\/assets\/[a-z0-9-]+\/\d{2}-[a-z0-9-]+\.jpg$/.test(path),
  );
  for (const shot of shots) {
    const folder = shot.slice(0, shot.lastIndexOf('/'));
    const manifest = readFileSync(`${folder}/NGUON-ANH.md`, 'utf8');
    assert.ok(
      manifest.includes(shot.slice(folder.length + 1)),
      `${shot} chua duoc khai trong ${folder}/NGUON-ANH.md`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * HEAD SACH ≠ LICH SU SACH — cong quet theo KHOANG COMMIT
 * ------------------------------------------------------------------ */

/**
 * Lo hong ma cac bai o tren KHONG bat duoc.
 *
 * `findViolations` chi nhin thay CAY CUOI CUNG cua mot PR. Mot tai lieu goc them o commit A roi
 * xoa o commit B trong cung PR do se cho ra mot cay cuoi cung sach — va cong bao dat. Nhung byte
 * cua no da nam vinh vien trong lich su cua mot repo PUBLIC.
 *
 * Day dung la duong ma `a4-dai-ly-map-nhom-ultty.xlsx` da di: go khoi HEAD ngay 30/08/2026 khong
 * go duoc hai chat ID nhom Zalo ra khoi cac commit truoc do.
 */
test('LO HONG: cay cuoi cung sach van co the che mot tai lieu goc da vao lich su', () => {
  const finalTree = ['docs/khach-hang/khach-tong-hop/nghiep-vu/mo-ta.md'];
  const addedInRange = [
    'docs/khach-hang/khach-tong-hop/nguon-goc/khao-sat.xlsx',
    'docs/khach-hang/khach-tong-hop/nghiep-vu/mo-ta.md',
  ];

  // Cong cu: khong thay gi. Day la lo hong, khong phai bug cua ham nay.
  assert.deepEqual(findViolations(finalTree), []);

  // Cong moi: thay.
  assert.deepEqual(findHistoryViolations(addedInRange, { treePaths: finalTree }), [
    {
      path: 'docs/khach-hang/khach-tong-hop/nguon-goc/khao-sat.xlsx',
      code: VIOLATION_CODES.INTRODUCED_THEN_REMOVED,
    },
  ]);
});

test('tai lieu goc them roi GIU LAI trong khoang van bi chan — nhung bang ma cu', () => {
  const path = 'docs/khach-hang/khach-tong-hop/nguon-goc/khao-sat.xlsx';
  assert.deepEqual(findHistoryViolations([path], { treePaths: [path] }), [
    { path, code: VIOLATION_CODES.NOT_ALLOWLISTED },
  ]);
});

test('ngoai le van co gia tri trong che do khoang — ban giao co nguon HTML thi qua', () => {
  const pdf = 'docs/khach-hang/khach-tong-hop/ban-giao/tom-tat.pdf';
  const html = 'docs/khach-hang/khach-tong-hop/ban-giao/nguon-html/tom-tat.html';
  assert.deepEqual(findHistoryViolations([pdf], { treePaths: [pdf, html] }), []);
});

// FAIL CLOSED van la mac dinh: mot PDF mang dung ten ngoai le nhung khong con nguon de tai sinh
// thi KHONG duoc cho qua chi vi no da bi xoa lai.
test('che do khoang khong duoc noi tay hon che do cay', () => {
  const pdf = 'docs/khach-hang/khach-tong-hop/ban-giao/tom-tat.pdf';
  assert.deepEqual(findHistoryViolations([pdf], { treePaths: [] }), [
    { path: pdf, code: VIOLATION_CODES.SOURCE_FILE_MISSING },
  ]);
});

test('mot duong dan cham vao nhieu commit chi bao MOT lan', () => {
  const path = 'docs/khach-hang/khach-tong-hop/nguon-goc/khao-sat.xlsx';
  assert.equal(findHistoryViolations([path, path, path], { treePaths: [] }).length, 1);
});

// KHONG BAO DONG GIA — bai doi chung cua che do khoang.
test('che do khoang khong bao nham tai san hop le', () => {
  assert.deepEqual(
    findHistoryViolations(
      [
        'docs/khach-hang/khach-tong-hop/nghiep-vu/mo-ta.md',
        'tenants/khach-tong-hop/data/knowledge.json',
        'apps/marketing/public/anh-san-pham.png',
        'apps/api/src/settings/__fixtures__/mau-tong-hop.xlsx',
      ],
      { treePaths: [] },
    ),
    [],
  );
});

test('parseChangedPaths: bo dong rong, cat khoang trang, va khong lap', () => {
  assert.deepEqual(parseChangedPaths('a/b.xlsx\n\n a/b.xlsx \nc/d.pdf\n'), ['a/b.xlsx', 'c/d.pdf']);
  assert.deepEqual(parseChangedPaths(''), []);
});

/* ------------------------------------------------------------------ *
 * Doi chieu voi LICH SU THAT cua chinh su co nay
 * ------------------------------------------------------------------ */

/** Chay `git log` y het CLI che do `--range`. */
const changedPathsIn = (range) =>
  parseChangedPaths(
    execFileSync(
      'git',
      ['log', '--no-merges', '--diff-filter=AMR', '--name-only', '--pretty=format:', range],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    ),
  );

/**
 * Commit THAT `d05e1e4` (11/08/2026) — "gom tai lieu khach hang theo tung khach".
 *
 * No khong chi chuyen mot tep. No dua MUOI tai lieu goc cua khach vao dung vung nguon goc, trong
 * mot repo PUBLIC: mot ban khao sat `.docx` (ben trong co ten mot nhan su va SO DIEN THOAI LIEN HE
 * cua nguoi do), tam anh thiet ke khach gui, va ban `.xlsx` mang hai chat ID nhom Zalo.
 *
 * Cong CU khong bao mot dong nao ve commit nay — ca muoi tep deu bi xoa o cac commit sau, nen cay
 * cuoi cung sach. Bai nay ghim lai rang cong MOI thi bao du muoi. Do chinh la ly do no ton tai, va
 * day la con so that chu khong phai mot vi du dung.
 *
 * Ghim theo SHA co dinh nen khong the troi theo thoi gian.
 */
test('LICH SU THAT: commit d05e1e4 dua 10 tai lieu goc vao vung khach va cong moi phai bao du', () => {
  const range =
    'd05e1e482face8b34c28564f820b48a743b1ea98^..d05e1e482face8b34c28564f820b48a743b1ea98';
  const violations = findHistoryViolations(changedPathsIn(range), { treePaths: tracked, digestOf });
  assert.deepEqual(paths(violations), [
    'docs/khach-hang/ultty/design-app/01.jpg',
    'docs/khach-hang/ultty/design-app/02.jpg',
    'docs/khach-hang/ultty/design-app/03.jpg',
    'docs/khach-hang/ultty/design-app/04.jpg',
    'docs/khach-hang/ultty/design-app/05.jpg',
    'docs/khach-hang/ultty/design-app/06.jpg',
    'docs/khach-hang/ultty/design-app/07.jpg',
    'docs/khach-hang/ultty/design-app/08.jpg',
    'docs/khach-hang/ultty/nguon-goc/khao-sat-khach-hang-2026-07.docx',
    'docs/khach-hang/ultty/trao-doi/A4_dai-ly_map-nhom_U-Ultty.xlsx',
  ]);
  // Va tat ca deu mang dung mot ma: da day len roi xoa lai.
  assert.deepEqual(
    [...new Set(violations.map((row) => row.code))],
    [VIOLATION_CODES.INTRODUCED_THEN_REMOVED],
  );
});

// Nhanh hien tai khong duoc tu no dua them tai lieu goc nao vao lich su.
test('khoang commit cua chinh nhanh nay so voi origin/main la sach', () => {
  let range;
  try {
    range = `${execFileSync('git', ['merge-base', 'origin/main', 'HEAD'], { encoding: 'utf8' }).trim()}..HEAD`;
  } catch {
    return; // Khong co origin/main (clone nong) thi bo qua — bai tren da giu phan quy tac.
  }
  assert.deepEqual(
    findHistoryViolations(changedPathsIn(range), { treePaths: tracked, digestOf }),
    [],
  );
});
