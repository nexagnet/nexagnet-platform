import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAPLIBRE_WORKER_FILES,
  MAPLIBRE_WORKER_PUBLIC_DIR,
  copyMaplibreWorker,
  maplibreDistDir,
} from '../../../../maplibre-worker.mjs';
import { MAPLIBRE_WORKER_URL } from '../maplibre-worker-url';

/*
 * `#374` — worker cua MapLibre 6 phai duoc phuc vu DU va DUNG phien ban.
 *
 * Thieu worker thi nen OpenFreeMap tai style ve ma khong mot o tile nao hien (do 23/09/2026), va
 * khong mot bai unit nao khac nhin thay dieu do: CI chay nen cuc bo, khong co nguon tile. Nen hop
 * dong o day khoa nhung gi ma lan loi do phu thuoc vao.
 */

const relativeImports = (source: string): string[] =>
  [...source.matchAll(/(?:from|import)\s*["'](\.\/[^"']+)["']/g)].map((match) =>
    (match[1] ?? '').replace('./', ''),
  );

describe('worker MapLibre 6 duoc phuc vu tu public/', () => {
  let target: string | null = null;

  afterEach(() => {
    /* `target` = `<tmp>/maplibre-worker-XXXX/maplibre` — don ca thu muc tam cha. */
    if (target !== null) rmSync(join(target, '..'), { recursive: true, force: true });
    target = null;
  });

  it('ban sao giong TUNG BYTE ban cua MapLibre dang cai — khong troi phien ban', () => {
    target = join(mkdtempSync(join(tmpdir(), 'maplibre-worker-')), 'maplibre');

    expect(copyMaplibreWorker(target)).toEqual(MAPLIBRE_WORKER_FILES);
    for (const file of MAPLIBRE_WORKER_FILES) {
      const copied = readFileSync(join(target, file));
      const original = readFileSync(join(maplibreDistDir(), file));
      expect(copied.equals(original), file).toBe(true);
    }
  });

  /* `next start` trong image da build nap lai cau hinh: ban sao da dung thi KHONG ghi gi. */
  it('ban sao da dung → lan nap cau hinh sau khong ghi mot tep nao', () => {
    target = join(mkdtempSync(join(tmpdir(), 'maplibre-worker-')), 'maplibre');
    copyMaplibreWorker(target);

    expect(copyMaplibreWorker(target)).toEqual([]);
  });

  it('ban sao cu (sau khi nang cap MapLibre) → ghi lai dung tep lech', () => {
    target = join(mkdtempSync(join(tmpdir(), 'maplibre-worker-')), 'maplibre');
    copyMaplibreWorker(target);
    writeFileSync(join(target, MAPLIBRE_WORKER_FILES[0] ?? ''), '// ban cu');

    expect(copyMaplibreWorker(target)).toEqual([MAPLIBRE_WORKER_FILES[0]]);
  });

  /*
   * Worker la module ESM import TUONG DOI cac tep canh no. Mot phien ban MapLibre sau tach them mot
   * chunk thi worker se 404 o lan import dau — bai nay do truoc khi trinh duyet phai do.
   */
  it('moi tep ma worker import (ca gian tiep) deu nam trong danh sach duoc sao', () => {
    const pending = [MAPLIBRE_WORKER_FILES[0] ?? ''];
    const seen = new Set<string>();
    while (pending.length > 0) {
      const file = pending.pop() ?? '';
      if (seen.has(file)) continue;
      seen.add(file);
      pending.push(...relativeImports(readFileSync(join(maplibreDistDir(), file), 'utf8')));
    }

    expect([...seen].sort()).toEqual([...MAPLIBRE_WORKER_FILES].sort());
  });

  it('duong dan trinh duyet dung trung tep worker duoc sao', () => {
    expect(MAPLIBRE_WORKER_URL).toBe(
      `/${MAPLIBRE_WORKER_PUBLIC_DIR}/${MAPLIBRE_WORKER_FILES[0] ?? ''}`,
    );
  });

  it('next.config.mjs sao worker moi lan Next nap cau hinh', () => {
    const config = readFileSync(join(__dirname, '../../../../next.config.mjs'), 'utf8');

    expect(config).toMatch(/import \{ copyMaplibreWorker \} from '\.\/maplibre-worker\.mjs'/);
    /* `\r?` — worktree Windows (`core.autocrlf`) giu CRLF tren dia, CI Linux giu LF. */
    expect(config).toMatch(/^copyMaplibreWorker\(\);\r?$/m);
  });
});
