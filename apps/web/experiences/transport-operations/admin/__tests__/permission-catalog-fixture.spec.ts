import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * DANH MUC QUYEN cua e2e (`e2e/transport/fixtures/permission-catalog.json`) la ban CHUP cua danh muc
 * may chu tra o `GET /settings/users/permission-catalog` (`#395`). Bo e2e "Tài khoản & quyền" chay
 * tren ban chup do — ban chup cu thi e2e XANH GIA tren mot danh muc may chu khong con tra.
 *
 * Bai nay dung lai DUNG than may chu tra (`permissionCatalog(registry)` voi mien van tai: moi mien
 * `{ id, ...catalog() }` + quyen nen tang) tu chinh ma nguon cua API va so tung truong voi ban chup.
 * Them/doi ten/doi co mot viec trong danh muc ma quen chup lai → do o `verify` trong vai giay.
 *
 * Nap bang `import()` dong tu duong dan tuyet doi: `tsc` cua web khong keo ma API vao chuong trinh
 * kieu cua web, con vitest van bien dich no nhu moi tep TS khac.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const API = resolve(HERE, '../../../../../api/src');
const FIXTURE = resolve(HERE, '../../../../e2e/transport/fixtures/permission-catalog.json');

const load = (file: string): Promise<Record<string, unknown>> =>
  import(/* @vite-ignore */ pathToFileURL(resolve(API, file)).href) as Promise<
    Record<string, unknown>
  >;

async function serverCatalog(): Promise<unknown> {
  const transport = await load('transport/permissions/transport-permission-catalog.ts');
  const platform = await load('auth/access/platform-permissions.ts');
  const catalogOf = transport.transportPermissionCatalog;
  const platformOf = platform.platformPermissionCatalog;
  if (typeof catalogOf !== 'function' || typeof platformOf !== 'function') {
    throw new Error('Khong tim thay ham danh muc quyen trong ma nguon API');
  }
  return {
    domains: [{ id: 'transport', ...(catalogOf() as Record<string, unknown>) }],
    platform: platformOf(),
  };
}

describe('ban chup danh muc quyen cua e2e khop danh muc may chu (#395)', () => {
  it('moi nhom, viec, co va vai khoi diem trung tung truong', async () => {
    const fixture: unknown = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    // JSON khu hoa: bo `undefined`, dung dung hinh dang than HTTP.
    const server: unknown = JSON.parse(JSON.stringify(await serverCatalog()));
    expect(fixture).toEqual(server);
  });
});
