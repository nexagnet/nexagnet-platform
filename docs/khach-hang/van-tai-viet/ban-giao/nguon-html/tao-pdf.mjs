/* global document */
// Sinh HTML in được + PDF cho lãnh đạo từ MỘT nguồn Markdown.
//
//   node docs/khach-hang/van-tai-viet/ban-giao/nguon-html/tao-pdf.mjs [ten-tai-lieu]
//
// Mặc định: gioi-thieu-he-thong-cho-lanh-dao. Đọc `../<ten>.md`, ghi `./<ten>.html` (nguồn tái sinh
// mà guardrail tài liệu khách đòi phải có) và `../<ten>.pdf`. Markdown là bản gốc; không sửa tay
// HTML hay PDF.
//
// Chỉ dùng thứ đã có trong repo: markdown-it (phụ thuộc bắc cầu trong kho pnpm) và Playwright của
// apps/web (Chromium in PDF có mục lục bookmark + chữ chọn/tìm được). Không cần mạng.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BAN_GIAO = path.resolve(HERE, '..');
const REPO = path.resolve(HERE, '../../../../..');
const NAME = process.argv[2] ?? 'gioi-thieu-he-thong-cho-lanh-dao';
const COMPANY = 'Vận tải Việt';

function loadMarkdownIt() {
  const store = path.join(REPO, 'node_modules/.pnpm');
  const dir = readdirSync(store).find((entry) => entry.startsWith('markdown-it@'));
  if (!dir) throw new Error(`Không thấy markdown-it trong ${store} — chạy pnpm install trước.`);
  return createRequire(import.meta.url)(path.join(store, dir, 'node_modules/markdown-it'));
}

async function loadChromium() {
  const entry = path.join(REPO, 'apps/web/node_modules/@playwright/test/index.mjs');
  const { chromium } = await import(pathToFileURL(entry).href);
  return chromium;
}

const slugify = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderMarkdown(source) {
  const MarkdownIt = loadMarkdownIt();
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
  const headings = [];
  md.renderer.rules.heading_open = (tokens, idx) => {
    const token = tokens[idx];
    const text = tokens[idx + 1].content.replace(/\*\*/g, '');
    const id = slugify(text);
    headings.push({ level: Number(token.tag.slice(1)), text, id });
    return `<${token.tag} id="${id}">`;
  };
  let figure = 0;
  const html = md
    .render(source)
    .replace(/src="assets\//g, 'src="../assets/')
    .replace(/<p><img src="([^"]+)" alt="([^"]*)"><\/p>/g, (_, src, alt) => {
      figure += 1;
      return `<figure><img src="${src}" alt="${alt}"><figcaption>Hình ${figure}. ${alt}</figcaption></figure>`;
    });
  return { html, headings };
}

function buildPage({ html, headings }) {
  const cut = html.indexOf('<hr>');
  const cover = html.slice(0, cut);
  const body = html.slice(cut).replace(/<hr>\n?/g, '');
  const toc = headings
    .filter((h) => h.level === 2)
    .map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`)
    .join('');
  const title = headings.find((h) => h.level === 1)?.text ?? NAME;
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<!-- Tệp SINH TỰ ĐỘNG từ ../${NAME}.md bởi tao-pdf.mjs — sửa Markdown, đừng sửa tệp này. -->
<style>
  @page { size: A4; margin: 16mm 15mm 18mm 15mm; }
  :root { --ink: #1f2a30; --muted: #5d666c; --line: #ddd6ca; --paper: #faf8f4; --teal: #1f5566; --accent: #e0662b; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.3pt; line-height: 1.55; color: var(--ink); }
  h1, h2, h3 { font-family: Cambria, Georgia, serif; line-height: 1.25; break-after: avoid; }
  h2 { font-size: 17pt; margin: 20pt 0 8pt; padding-top: 8pt; border-top: 2px solid var(--teal); color: var(--teal); }
  h3 { font-size: 12.5pt; margin: 16pt 0 6pt; }
  p, li { orphans: 3; widows: 3; }
  ul, ol { padding-left: 18pt; margin: 4pt 0 8pt; }
  li { margin: 2pt 0; }
  li > ul, li > ol { margin: 2pt 0; }
  strong { font-weight: 650; }
  em { color: var(--muted); }
  a { color: var(--teal); text-decoration: none; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0 12pt; font-size: 9.4pt; line-height: 1.45; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { background: #efe9df; text-align: left; font-weight: 650; }
  th, td { border: 1px solid var(--line); padding: 5pt 7pt; vertical-align: top; }
  figure { margin: 10pt 0 6pt; break-inside: avoid; }
  figure img { display: block; width: 100%; border: 1px solid var(--line); border-radius: 6px; }
  /* Ảnh điện thoại (dọc): giữ vừa nửa trang để chữ hướng dẫn nằm cạnh ảnh của nó. */
  figure img[src*="/tai-xe/"] { width: auto; max-width: 100%; height: 100mm; margin: 0 auto; }
  figure:has(img[src*="/tai-xe/"]) figcaption { text-align: center; }
  figure + ol, figure + ul { break-before: avoid; }
  figcaption { font-size: 8.6pt; color: var(--muted); margin-top: 4pt; }
  .cover { min-height: 250mm; display: flex; flex-direction: column; break-after: page; }
  .cover-band { background: var(--paper); border: 1px solid var(--line); border-left: 8px solid var(--teal); border-radius: 10px; padding: 26pt 26pt 20pt; margin-top: 30mm; }
  .cover h1 { font-size: 27pt; margin: 0 0 10pt; color: var(--teal); }
  .cover-band > p:first-of-type { font-size: 11.5pt; color: var(--muted); margin: 0 0 14pt; }
  .cover .toc { margin-top: 18pt; }
  .cover .toc h2 { border: 0; padding: 0; margin: 0 0 6pt; font-size: 12pt; color: var(--ink); }
  .cover .toc ol { columns: 2; column-gap: 18pt; font-size: 10pt; list-style: none; padding-left: 0; }
  .cover .toc li { break-inside: avoid; }
</style>
</head>
<body>
<section class="cover">
  <div class="cover-band">${cover}</div>
  <nav class="toc" aria-label="Mục lục"><h2>Nội dung</h2><ol>${toc}</ol></nav>
</section>
<main>
${body}
</main>
</body>
</html>
`;
}

async function printPdf(htmlPath, pdfPath, title) {
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      outline: true,
      tagged: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-family:'Segoe UI',Arial;font-size:7.5pt;color:#7a8288;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>${escapeHtml(title)} · ${COMPANY}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
  } finally {
    await browser.close();
  }
}

const source = readFileSync(path.join(BAN_GIAO, `${NAME}.md`), 'utf8');
const htmlPath = path.join(HERE, `${NAME}.html`);
const pdfPath = path.join(BAN_GIAO, `${NAME}.pdf`);
const rendered = renderMarkdown(source);
writeFileSync(htmlPath, buildPage(rendered));
await printPdf(htmlPath, pdfPath, rendered.headings.find((h) => h.level === 1)?.text ?? NAME);
console.log(`Đã ghi ${path.relative(REPO, htmlPath)} và ${path.relative(REPO, pdfPath)}`);
