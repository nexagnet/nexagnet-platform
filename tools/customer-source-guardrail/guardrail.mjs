/**
 * NO_RAW_CUSTOMER_ARTIFACT_IN_GIT — hop dong repo.
 *
 * `nexagnet-platform` la repo PUBLIC. Mot tai lieu goc cua khach dua vao day la CONG BO no ra
 * ngoai, va git khong quen: xoa o ban sau khong go duoc ban da day len. Vi the cong nay chan o
 * luc THEM, khong phai luc phat hien.
 *
 * KHONG phai mot san pham DLP. No khong doc noi dung, khong doan nhay cam. No thi hanh dung mot
 * cau: **byte goc cua khach song trong kho rieng, repo chi giu SHA-256 va metadata** — dung giao
 * thuc o `docs/phat-trien/van-hanh/nguon-khach-hang.md`.
 *
 * VI SAO KHONG CAM MU MOT LOAT DUOI FILE. Mot lenh cam `*.pdf` toan repo se do ngay o ba tep ban
 * giao do CHINH CHUNG TA sinh ra tu `ban-giao/nguon-html/` — va cach duy nhat di tiep se la tat
 * cong di. Mot cong bi tat thi khong bao ve gi ca. Nen quy tac o day di theo DUONG DAN, va moi
 * ngoai le deu phai mang BANG CHUNG KIEM CHUNG DUOC.
 *
 * ## VI SAO "LY DO DOC DUOC" LA KHONG DU (sua 30/08/2026)
 *
 * Ban truoc cho phep mot ngoai le chi bang mot cau van xuoi. Cau van do khong ai do lai, va mot
 * trong hai ngoai le hoa ra **noi sai**: `a4-dai-ly-map-nhom-ultty.xlsx` duoc mo voi ly do "bieu
 * mau RONG — khong co sharedStrings, tuc khong chua mot o du lieu nao". Do lai thi:
 *
 *   · dung la tep khong co `sharedStrings.xml`;
 *   · nhung no chua **31 o chuoi** duoi dang `inlineStr` ngay trong `xl/worksheets/*.xml` —
 *     ba ten dai ly va **hai chat ID nhom Zalo**.
 *
 * "Khong co sharedStrings" khong phai bat bien cua XLSX: openpyxl ghi chuoi noi tuyen. Tuc la mot
 * ngoai le duoc mo bang mot khang dinh ky thuat SAI, va no da o do tu 13/07/2026.
 *
 * Nen tu ban nay, moi ngoai le phai mang mot trong hai loai BANG CHUNG DO DUOC:
 *
 *   · `digest` — SHA-256 ghim san. Byte doi mot bit thi ngoai le dong lai.
 *   · `sourceFile` — mot tep NGUON trong repo tai sinh ra no. Do la thu chung minh "cai nay do
 *     chung ta soan ra" ma khong phai tin vao mot cau van.
 *
 * Va cong FAIL CLOSED: khong do duoc bang chung thi ngoai le KHONG duoc tinh. Mot ngoai le khong
 * kiem chung duoc va mot ngoai le sai la cung mot thu doi voi mot repo public.
 *
 * ## VA GHIM HASH CUNG KHONG DU (sua tiep 30/08/2026)
 *
 * Ban ngay truoc do giu lai `a4-dai-ly-map-nhom-ultty.xlsx` bang mot ngoai le `digest`. Nhung
 * SHA-256 tra loi cau hoi "co dung van la tep do khong", chu KHONG tra loi "tep do co duoc phep
 * cong khai khong". Ghim hash mot tep chua chat ID nhom cua khach chi lam cho ro ri do ON DINH.
 *
 * Do lai lan nua thi hai chat ID trong tep do **khong xuat hien o bat ky tep van ban nao khac
 * trong repo** — tuc chinh tep nhi phan do la noi duy nhat cong bo chung. Va chinh sheet huong
 * dan cua no ghi: "3 dong dai ly + 2 nhom da dien san la du lieu that tu khao sat".
 *
 * Ket cuc: tep bi go khoi HEAD, generator doi sang du lieu VI DU tong hop, ban build vao
 * `.gitignore`, va bo test cua importer dung fixture rieng. Ngoai le `digest` van con nhu mot CO
 * CHE (co bai test rieng), nhung khong con dong nao dung no — va do la trang thai dung: mot vung
 * nguon goc cua khach khong nen co ngoai le nhi phan nao ca.
 */

/**
 * Vung chua NGUON GOC cua khach. Trong nhung thu muc nay, mot tep nhi phan mac dinh la tai lieu
 * cua khach cho den khi co nguoi noi nguoc lai — VA chung minh duoc.
 */
export const CUSTOMER_SOURCE_AREAS = [
  /^docs\/khach-hang\/[^/]+\//,
  /^\.customer-sources\//,
  /^tenants\/[^/]+\/sources\//,
];

/**
 * Duoi tep cua tai lieu goc.
 *
 * `.md`/`.json` KHONG nam trong danh sach: do la dinh dang chung ta trich xuat RA, va chan chung
 * se chan chinh cai viec ma tang nguon su that sinh ra de lam.
 *
 * `.csv`/`.tsv` thi CO, tu ban nay. Ly do doi: trong mot vung nguon goc cua khach, mot tep CSV
 * gan nhu chac chan la ban xuat khach gui sang chu khong phai thu ta soan ra — ta soan ra `.md`
 * va `.json`. Do lai repo hom nay: **khong co mot tep `.csv` nao** trong ba vung do, nen quy tac
 * nay khong pha viec gi dang chay.
 *
 * ANH cung CO, va day la lo hong dang ke nhat cua ban truoc. Theo chinh `CLAUDE.md`, duoi 20% don
 * hang cua Ultty vao he thong duoi dang **anh chup bang** — tuc anh la mot trong nhung dinh dang
 * tai lieu goc PHO BIEN NHAT cua khach nay, va no di thang qua cong cu.
 */
export const RAW_ARTIFACT_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'xlsm',
  'ppt',
  'pptx',
  'csv',
  'tsv',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'tif',
  'tiff',
  'heic',
  'mov',
  'mp4',
  'zip',
  'rar',
  '7z',
  'msg',
  'eml',
];

/**
 * NGOAI LE — moi dong phai co LY DO doc duoc VA bang chung do duoc.
 *
 * "Da co tu truoc" khong phai mot ly do. Va tu ban nay, mot ly do dung cung khong du: phai co
 * `evidence`.
 */
export const ALLOWLIST = [
  {
    pattern: /^docs\/khach-hang\/([^/]+)\/ban-giao\/(.+)\.pdf$/,
    reason:
      'Ban giao do CHINH CHUNG TA soan va sinh ra tu ban-giao/nguon-html/ — dau ra gui cho khach, khong phai tai lieu goc khach gui sang.',
    // Bang chung CAU TRUC: phai co dung tep HTML tai sinh ra no nam trong repo. Ghim SHA-256 o
    // day se sai kieu — ba tep nay duoc sinh lai moi lan sua noi dung, con cai bat bien that su
    // la "co nguon de sinh lai". Mot PDF khach ky nem vao cung thu muc se khong co nguon do.
    evidence: {
      kind: 'sourceFile',
      resolve: (match) => `docs/khach-hang/${match[1]}/ban-giao/nguon-html/${match[2]}.html`,
    },
  },
  {
    // Chi .jpg, chi `ban-giao/assets/<vai>/`, chi ten `NN-ten-khong-dau` — hep dung dieu tai lieu
    // ban giao can. Anh khach gui sang (png/jpeg tu dien thoai, ten tu do, nam o thu muc khac) van
    // bi chan nhu cu.
    pattern: /^docs\/khach-hang\/([^/]+)\/ban-giao\/assets\/([a-z0-9-]+)\/\d{2}-[a-z0-9-]+\.jpg$/,
    reason:
      'Anh chup man hinh san pham CUA CHUNG TA tren du lieu mau, minh hoa cho tai lieu ban giao — dau ra gui cho khach, khong phai anh khach gui sang.',
    // Bang chung CAU TRUC nhu dong PDF: cung thu muc phai co so nguon goc anh. Bai test
    // "moi anh ban giao deu khai nguon" doi so do ghi DUNG TEN tung anh, nen them mot anh ma khong
    // khai nguon thi do.
    evidence: {
      kind: 'sourceFile',
      resolve: (match) => `docs/khach-hang/${match[1]}/ban-giao/assets/${match[2]}/NGUON-ANH.md`,
    },
  },
];

/** Ma cua tung duong tu choi. Mot cong co N duong tu choi phai phan biet duoc N ly do. */
export const VIOLATION_CODES = {
  /** Tai lieu goc trong vung khach, khong co ngoai le nao. */
  NOT_ALLOWLISTED: 'RAW_ARTIFACT_NOT_ALLOWLISTED',
  /** Co ngoai le, nhung nguoi goi khong cung cap duoc cach do byte ⇒ FAIL CLOSED. */
  EVIDENCE_UNVERIFIABLE: 'ALLOWLIST_EVIDENCE_UNVERIFIABLE',
  /** Co ngoai le ghim hash, nhung byte hien tai khong khop. */
  DIGEST_MISMATCH: 'ALLOWLIST_DIGEST_MISMATCH',
  /** Co ngoai le dua tren tep nguon, nhung tep nguon do khong con trong repo. */
  SOURCE_FILE_MISSING: 'ALLOWLIST_SOURCE_FILE_MISSING',
  /** Da vao lich su roi bi xoa lai trong cung mot khoang commit — cay cuoi cung sach, git thi khong. */
  INTRODUCED_THEN_REMOVED: 'RAW_ARTIFACT_INTRODUCED_THEN_REMOVED',
};

const extensionOf = (path) => {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
};

export const isInCustomerSourceArea = (path) =>
  CUSTOMER_SOURCE_AREAS.some((area) => area.test(path));

export const isRawArtifact = (path) => RAW_ARTIFACT_EXTENSIONS.includes(extensionOf(path));

export const allowlistEntryFor = (path) =>
  ALLOWLIST.find((entry) => entry.pattern.test(path)) ?? null;

/**
 * Ngoai le nay CO DUNG cho tep nay khong — va chung minh duoc chua.
 *
 * Tra ve `null` khi dat, hoac mot ma tu choi. FAIL CLOSED la mac dinh: neu khong do duoc thi
 * khong dat, chu khong phai "cho qua vi khong biet".
 */
export function checkAllowlistEvidence(path, entry, { paths = [], digestOf } = {}) {
  const match = entry.pattern.exec(path);
  if (!match) return VIOLATION_CODES.NOT_ALLOWLISTED;

  if (entry.evidence?.kind === 'sourceFile') {
    const required = entry.evidence.resolve(match);
    return paths.includes(required) ? null : VIOLATION_CODES.SOURCE_FILE_MISSING;
  }

  if (entry.evidence?.kind === 'digest') {
    if (typeof digestOf !== 'function') return VIOLATION_CODES.EVIDENCE_UNVERIFIABLE;
    const actual = digestOf(path);
    if (!actual) return VIOLATION_CODES.EVIDENCE_UNVERIFIABLE;
    return actual.toLowerCase() === entry.evidence.sha256.toLowerCase()
      ? null
      : VIOLATION_CODES.DIGEST_MISMATCH;
  }

  return VIOLATION_CODES.EVIDENCE_UNVERIFIABLE;
}

/**
 * Ham THUAN: nhan danh sach duong dan (da chuan hoa dau `/`), tra ve cac vi pham kem MA.
 *
 * Tach khoi git de bai test dua vao duoc duong dan TONG HOP — khong bai test nao duoc phep tao
 * mot tep khach that de chung minh rang tep khach that bi chan.
 *
 * `digestOf` la tuy chon vi ham nay phai chay duoc tren duong dan khong ton tai tren dia. Nhung
 * thieu no thi ngoai le loai `digest` KHONG duoc tinh — do la cho fail-closed nam.
 */
export function findViolations(paths, { digestOf } = {}) {
  return paths
    .filter((path) => isInCustomerSourceArea(path) && isRawArtifact(path))
    .map((path) => {
      const entry = allowlistEntryFor(path);
      if (!entry) return { path, code: VIOLATION_CODES.NOT_ALLOWLISTED };
      const failure = checkAllowlistEvidence(path, entry, { paths, digestOf });
      return failure ? { path, code: failure } : null;
    })
    .filter((row) => row !== null)
    .sort((a, b) => a.path.localeCompare(b.path));
}

/* ------------------------------------------------------------------ *
 * HEAD SACH ≠ LICH SU SACH
 * ------------------------------------------------------------------ */

/**
 * `findViolations` chay tren `git ls-files` — tuc no chi nhin thay CAY CUOI CUNG cua mot PR.
 *
 * Mot tai lieu goc them o commit A roi xoa o commit B trong cung PR do se cho ra mot cay cuoi cung
 * SACH, va cong bao dat. Nhung byte cua no thi da nam vinh vien trong lich su cua mot repo PUBLIC:
 * GitHub phuc vu blob theo SHA, va `refs/pull/N/head` giu lai commit cu sau ca khi nhanh bi xoa.
 *
 * Do dung la duong ma `a4-dai-ly-map-nhom-ultty.xlsx` da di. Go no khoi HEAD ngay 30/08/2026
 * khong go duoc hai chat ID nhom Zalo ra khoi cac commit truoc do — va chinh commit go do da
 * viet ra dieu nay: "hai chat ID do van nam trong LICH SU git".
 *
 * Nen cong nay them mot lat cat thu hai: khong hoi "cay cuoi cung co gi", ma hoi **"khoang commit
 * nay da DUA them nhung gi vao git"**. Cung mot bo quy tac, cung mot allowlist, cung fail-closed —
 * chi khac tap duong dan dau vao.
 *
 * KHONG quet lich su TOAN REPO. Lich su cu da cong bo roi, quet lai chi sinh ra mot danh sach
 * khong ai dong duoc; va mot cong luon do la mot cong se bi tat. Cong nay chan o DUONG VAO.
 */

/** Tach dau ra `git log --name-only` thanh danh sach duong dan khong lap. */
export function parseChangedPaths(gitLogOutput) {
  const seen = new Set();
  for (const line of gitLogOutput.split(/\r?\n/)) {
    const path = line.trim();
    if (path) seen.add(path);
  }
  return [...seen];
}

/**
 * Vi pham theo KHOANG COMMIT: nhung tai lieu goc ma khoang nay dua them vao git.
 *
 * `treePaths` la cay cuoi cung — chi dung de DO BANG CHUNG cua allowlist (tep nguon co con khong),
 * chu khong dung de mien tru. Mot tep bi xoa lai truoc khi PR khep lai van la mot tep da cong bo.
 */
export function findHistoryViolations(changedPaths, { treePaths = [], digestOf } = {}) {
  const inTree = new Set(treePaths);
  return parseChangedPaths(changedPaths.join('\n'))
    .filter((path) => isInCustomerSourceArea(path) && isRawArtifact(path))
    .map((path) => {
      const entry = allowlistEntryFor(path);
      if (entry) {
        const failure = checkAllowlistEvidence(path, entry, { paths: treePaths, digestOf });
        return failure ? { path, code: failure } : null;
      }
      return {
        path,
        code: inTree.has(path)
          ? VIOLATION_CODES.NOT_ALLOWLISTED
          : VIOLATION_CODES.INTRODUCED_THEN_REMOVED,
      };
    })
    .filter((row) => row !== null)
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Ngoai le da het tac dung (tep khong con) — mot dang ro ri nguoc: danh sach ngoai le no ra theo
 * thoi gian cho toi luc khong ai dam sua no nua.
 */
export function findStaleAllowlistEntries(paths) {
  return ALLOWLIST.filter((entry) => !paths.some((path) => entry.pattern.test(path)));
}

const CODE_HINTS = {
  [VIOLATION_CODES.NOT_ALLOWLISTED]: 'tai lieu goc cua khach, khong co ngoai le nao',
  [VIOLATION_CODES.EVIDENCE_UNVERIFIABLE]: 'co ngoai le nhung khong do duoc byte de kiem chung',
  [VIOLATION_CODES.DIGEST_MISMATCH]: 'byte KHAC ban da ghim — noi dung tep da doi',
  [VIOLATION_CODES.SOURCE_FILE_MISSING]: 'khong con tep nguon trong repo de tai sinh ra no',
  [VIOLATION_CODES.INTRODUCED_THEN_REMOVED]:
    'da day len roi xoa lai trong cung khoang commit — xoa KHONG go duoc ban da cong bo',
};

export function formatReport(violations) {
  if (violations.length === 0) return 'NO_RAW_CUSTOMER_ARTIFACT_IN_GIT: dat.';
  const lines = [
    `NO_RAW_CUSTOMER_ARTIFACT_IN_GIT: ${violations.length} tep nguon goc cua khach dang nam trong git.`,
    '',
    'Repo nay PUBLIC. Git khong quen: xoa o ban sau khong go duoc ban da day len.',
    '',
    ...violations.map(
      (row) => `  · ${row.path}\n      ${row.code} — ${CODE_HINTS[row.code] ?? ''}`,
    ),
    '',
    'Cach xu ly (docs/phat-trien/van-hanh/nguon-khach-hang.md):',
    '  1. chuyen tep sang kho rieng NGOAI repo;',
    '  2. do SHA-256 va dang ky mot BusinessSource tro toi do;',
    '  3. git rm --cached tep, them dong .gitignore TRUOC khi commit lai;',
    '  4. neu tep that su la dau ra cua chung ta, them mot dong ALLOWLIST kem LY DO va BANG CHUNG',
    '     (ghim sha256, hoac chi ra tep nguon trong repo tai sinh duoc no).',
  ];
  return lines.join('\n');
}

export function formatHistoryReport(violations, range) {
  if (violations.length === 0) return `NO_RAW_CUSTOMER_ARTIFACT_IN_HISTORY (${range}): dat.`;
  return [
    `NO_RAW_CUSTOMER_ARTIFACT_IN_HISTORY (${range}): ${violations.length} tai lieu goc cua khach`,
    'da duoc DUA VAO git trong khoang commit nay.',
    '',
    'Xoa o mot commit sau KHONG go duoc ban da day len: GitHub phuc vu blob theo SHA, va',
    '`refs/pull/N/head` giu lai commit cu ke ca sau khi nhanh bi xoa. Sua o DAY, truoc khi merge,',
    'la lan cuoi cung con sua duoc ma khong phai viet lai lich su cong khai.',
    '',
    ...violations.map(
      (row) => `  · ${row.path}\n      ${row.code} — ${CODE_HINTS[row.code] ?? ''}`,
    ),
    '',
    'Cach xu ly (docs/phat-trien/van-hanh/nguon-khach-hang.md):',
    '  1. viet lai LICH SU CUA NHANH nay (rebase/amend) de byte do khong bao gio len main;',
    '  2. chuyen tep sang kho rieng NGOAI repo, do SHA-256 va dang ky mot BusinessSource;',
    '  3. them dong .gitignore TRUOC khi commit lai;',
    '  4. neu tep that su la dau ra cua chung ta, them mot dong ALLOWLIST kem LY DO va BANG CHUNG.',
    '',
    'Neu nhanh nay DA len main roi thi day khong con la viec cua cong nay — xem muc "lich su" o',
    'nguon-khach-hang.md: go lich su cong khai la mot quyet dinh rieng, co chu so huu rieng.',
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { execFileSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const { readFileSync } = await import('node:fs');

  // `git ls-files` luon in dau `/`, ke ca tren Windows — nen khong phai chuan hoa gi them.
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  /**
   * Do byte NHU GIT DANG GIU no.
   *
   * `git show :<path>` doc thang tu INDEX — do la ban se duoc day len, va la ban duy nhat dang
   * do. Doc tu dia se sai o bat ky repo nao co `.gitattributes` doi dau dong hoac co tep dang
   * sua do.
   */
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

  /**
   * `--range <base>..<head>` — quet KHOANG COMMIT thay vi cay cuoi cung.
   *
   * `--no-merges`: commit merge khong tu no dua byte moi vao, va tinh ca no thi mot PR se bao lai
   * moi thu nhanh nen da mang san. `AMR` chu khong chi `A`: sua noi dung mot tai lieu goc cung la
   * day byte moi len, va mot lan doi ten VAO vung khach cung phai bi hoi — dung nhu commit
   * `d05e1e4` da lam.
   */
  const rangeFlag = process.argv.indexOf('--range');
  if (rangeFlag !== -1) {
    const range = process.argv[rangeFlag + 1];
    if (!range) {
      console.error('Thieu doi so: --range <base>..<head>');
      process.exit(2);
    }

    let log;
    try {
      log = execFileSync(
        'git',
        ['log', '--no-merges', '--diff-filter=AMR', '--name-only', '--pretty=format:', range],
        { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
      );
    } catch {
      // FAIL CLOSED: khong doc duoc khoang thi khong duoc phep bao dat. Gap nhat la clone NONG —
      // `actions/checkout` mac dinh `fetch-depth: 1`, va mot cong im lang vi thieu du lieu la
      // dung cai bay `RUN_WORKFLOW_IT` da roi vao.
      console.error(`Khong doc duoc khoang commit "${range}".`);
      console.error('Neu chay o CI: `actions/checkout` phai dat `fetch-depth: 0`.');
      process.exit(2);
    }

    const rangeViolations = findHistoryViolations(parseChangedPaths(log), {
      treePaths: tracked,
      digestOf,
    });
    console.log(formatHistoryReport(rangeViolations, range));
    process.exit(rangeViolations.length === 0 ? 0 : 1);
  }

  const violations = findViolations(tracked, { digestOf });
  const stale = findStaleAllowlistEntries(tracked);

  console.log(formatReport(violations));
  for (const entry of stale) {
    console.log(`CANH BAO: ngoai le khong con khop tep nao — ${entry.pattern}`);
  }
  process.exit(violations.length === 0 ? 0 : 1);
}
