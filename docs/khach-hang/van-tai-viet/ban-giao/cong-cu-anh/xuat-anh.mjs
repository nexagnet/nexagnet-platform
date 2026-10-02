/**
 * Đổi ảnh chụp PNG sang JPEG cho tài liệu — guardrail tài liệu khách chỉ mở ngoại lệ cho `.jpg`
 * trong `ban-giao/assets/<vai>/`, và JPEG nhẹ hơn nhiều khi vào PDF.
 *
 * `sharp` chỉ có trong kho pnpm như một phụ thuộc bắc cầu; dùng lại, không cài thêm.
 */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { REPO_ROOT } from './phien.mjs';

let sharp = null;
function loadSharp() {
  if (sharp !== null) return sharp;
  const store = join(REPO_ROOT, 'node_modules/.pnpm');
  const dir = readdirSync(store).find((entry) => entry.startsWith('sharp@'));
  if (!dir) throw new Error(`Không thấy sharp trong ${store} — chạy pnpm install trước.`);
  sharp = createRequire(import.meta.url)(join(store, dir, 'node_modules/sharp'));
  return sharp;
}

export async function toJpeg(pngPath, jpgPath) {
  await loadSharp()(pngPath)
    .jpeg({ quality: 86, progressive: true, mozjpeg: true })
    .toFile(jpgPath);
}
