import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { actionsForRole, presetIncludes } from '../transport-actions.js';

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

/**
 * `transport-toll` la mot CAPABILITY RIENG, va no den/di tron ven.
 *
 * Quyet dinh kien truc #6: mot khach van tai chua doi soat ETC khong duoc nap mot bang nao cua
 * `TX-08` mo rong, va khong duoc nhin thay mot muc "ETC" khong lam gi.
 */
describe('composition cua transport-toll', () => {
  it('den cung `transport-toll`', () => {
    expect(controllerNames(['transport-core', 'transport-toll'])).toContain('TollController');
  });

  it('KHONG co mat o mot khach van tai chi bat `transport-core`', () => {
    expect(controllerNames(['transport-core'])).not.toContain('TollController');
  });

  it('KHONG co mat o mot khach khong dung van tai', () => {
    expect(controllerNames(['knowledge'])).not.toContain('TollController');
  });

  /**
   * ETC KHONG keo theo nhien lieu, va nhien lieu khong keo theo ETC.
   *
   * Hai ben giong nhau ve hinh dang nap tep, va do CHINH LA ly do bai nay ton tai: giong hinh dang
   * la mot cam do de noi hai capability lai, va lan noi do se bat mot khach chi muon doi soat ETC
   * phai khai ca dinh muc nhien lieu.
   */
  it('ETC va nhien lieu doc lap voi nhau', () => {
    const tollOnly = controllerNames(['transport-core', 'transport-toll']);
    expect(tollOnly).toContain('TollController');
    expect(tollOnly).not.toContain('FuelReconciliationController');
  });
});

/**
 * ===========================================================================
 * ETC LA CONG TY TRA — VA LAI XE KHONG DUNG DEN NO.
 *
 * #229 §8 + #237. Cong THAT nam o bang phan quyen, khong o giao dien: neu mot ngay ai do them mot
 * man hinh ETC vao be mat lai xe, bai nay do TRUOC khi mot dong phi duong bo kip di vao so quy.
 */
describe('phan quyen cua ETC', () => {
  it('lai xe KHONG co mot ma `transport.toll.*` nao', () => {
    const sale = actionsForRole('SALE');
    expect(sale.filter((action) => action.startsWith('transport.toll.'))).toEqual([]);
  });

  /** Doi soat ETC la viec cuoi thang cua Ke toan — ho co ca bon ma. */
  it('ke toan co du bon ma de nap va doi soat', () => {
    const accounting = actionsForRole('ACCOUNTING');
    expect(accounting).toContain('transport.toll.account.read');
    expect(accounting).toContain('transport.toll.account.manage');
    expect(accounting).toContain('transport.toll.import');
    expect(accounting).toContain('transport.toll.review.read');
    expect(accounting).toContain('transport.toll.review.resolve');
  });

  it('dieu hanh cung co du', () => {
    const admin = actionsForRole('ADMIN');
    expect(admin).toContain('transport.toll.import');
    expect(admin).toContain('transport.toll.review.resolve');
  });

  /**
   * NAP tach khoi QUYET, va do la mot cong that.
   *
   * Nap la mang mot ban sao cua su that nha cung cap vao he thong; doi soat la noi ban sao do khop
   * hay khong. Neu mot ngay ai do gop hai ma lam mot, bai nay do.
   */
  it('nap va quyet la HAI ma khac nhau', () => {
    expect('transport.toll.import').not.toBe('transport.toll.review.resolve');
    const admin = actionsForRole('ADMIN');
    expect(new Set(admin).size).toBe(admin.length);
  });
});

/**
 * ===========================================================================
 * KHONG MOT TEP NAO CUA `transport-toll` DUOC CHAM VAO SO QUY LAI XE.
 *
 * `TollStorageNeverTouchesDriverFund` giu bat bien do o tang KIEU cho cac TRUONG. Cai kieu khong
 * noi duoc la "khong tep nao trong thu muc nay IMPORT mot module cua so quy" — nen phai quet ma
 * nguon. Mot lan `import { CostingService }` vao day se lam bai nay do.
 */
describe('ETC khong bao gio cham so quy lai xe', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));

  const sourcesOf = (): { name: string; body: string }[] =>
    [
      'toll.service.ts',
      'toll-account.service.ts',
      'toll.controller.ts',
      'transport-toll.module.ts',
      'toll.repository.ts',
      'prisma-toll.repository.ts',
      'in-memory-toll.repository.ts',
      'toll-classification.ts',
      'toll-statement-mapping.ts',
      'toll.ports.ts',
      'toll.types.ts',
      // `#314` — be mat doc cua ke toan. Bao cao TIEN la noi de nhat cho mot dong ve so quy lot vao.
      'toll-report.service.ts',
      'toll-spend-report.ts',
      'toll-spend.reader.ts',
      'prisma-toll-spend.reader.ts',
    ].map((name) => ({ name, body: readFileSync(resolve(HERE, name), 'utf8') }));

  it('khong tep nao nhap mot module cua so quy / luong / cong no', () => {
    const forbidden = [
      '../costing/',
      '../driver-settlement/',
      '../workforce/',
      '../settlement/',
      '../claims/',
    ];
    for (const source of sourcesOf()) {
      for (const path of forbidden) {
        expect(source.body, `${source.name} nhap ${path}`).not.toContain(`from '${path}`);
      }
    }
  });

  /**
   * `toll.types.ts` bi LOAI TRU khoi phep quet nay, va do khong phai mot ngoai le de cho tien.
   *
   * Chinh `TollStorageNeverTouchesDriverFund` phai NHAC TEN `driverId` de khang dinh no VANG MAT
   * (`Extract<keyof T, 'driverId'>` chi la `never` khi truong do khong ton tai). Mot phep quet van
   * ban se bat dung cai bay bao ve. Bat bien do da duoc giu bang KIEU o `toll-provider.port.spec.ts`
   * — la cho dung de giu no.
   */
  it('khong tep nao KHAC nhac toi `driverId`', () => {
    for (const source of sourcesOf()) {
      if (source.name === 'toll.types.ts') continue;
      expect(source.body, source.name).not.toContain('driverId');
    }
  });

  /**
   * #269 J7 cam goi mot quyet dinh doi soat la `paid`/`settled`/`accounted`. Ba chu do noi ve TIEN
   * DA TRA; cai duy nhat mien nay biet la mot dong da co nguoi NHIN.
   */
  it('khong trang thai nao mang nghia da tra tien', () => {
    const types = readFileSync(resolve(HERE, 'toll.types.ts'), 'utf8');
    for (const word of ["'PAID'", "'SETTLED'", "'ACCOUNTED'", "'PAYABLE'"]) {
      expect(types, word).not.toContain(word);
    }
  });
});

/**
 * ===========================================================================
 * MOT MA QUYEN DA KHAI KHONG CHUNG MINH CO MOT DUONG HTTP.
 *
 * Mot hang so trong `transport-actions.ts` va mot bai khoa danh sach do deu XANH ma van co the
 * khong ton tai route nao dung ma do. Bai duoi day doc metadata that cua Nest tren
 * `TollController` va doi chieu NGUOC: moi ma `transport.toll.*` phai duoc mot handler that su
 * doi hoi.
 */
describe('moi ma quyen ETC deu co mot duong HTTP that', () => {
  it('bon ma deu duoc mot handler cua TollController doi hoi', async () => {
    await import('reflect-metadata');
    const { TollController } = await import('./toll.controller.js');
    const { TRANSPORT_ACTION_KEY } = await import('../transport-action.guard.js');

    const prototype = TollController.prototype as unknown as Record<string, unknown>;
    const required = new Set<string>();
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === 'constructor') continue;
      const handler = prototype[name];
      if (typeof handler !== 'function') continue;
      const action = Reflect.getMetadata(TRANSPORT_ACTION_KEY, handler) as string | undefined;
      if (action !== undefined) required.add(action);
    }

    expect([...required].sort()).toEqual([
      'transport.toll.account.manage',
      'transport.toll.account.read',
      'transport.toll.import',
      'transport.toll.review.read',
      'transport.toll.review.resolve',
    ]);
  });

  it('controller mang tien to route cua mien ETC', async () => {
    await import('reflect-metadata');
    const { TollController } = await import('./toll.controller.js');
    expect(Reflect.getMetadata('path', TollController)).toBe('transport/toll');
  });
});

/**
 * ===========================================================================
 * `#314` — MOI DUONG HTTP CUA ETC DEU CO CONG, VA CONG DO DONG VOI LAI XE.
 *
 * Bai o tren doi chieu tu MA QUYEN ve route. Bai nay doi chieu theo CHIEU NGUOC LAI: moi handler
 * co `path` (tuc mot route that) phai doi mot ma `transport.toll.*`. Mot route moi quen gan
 * `@RequiresTransportAction` se MO cho moi vai da dang nhap — va `TransportActionGuard` tra `true`
 * cho handler khong khai ma (`if (!action) return true`), nen khong cong nao khac bat duoc.
 *
 * Ba duong doc them boi `#314` (lich su xe, dong doi ung, bao cao chi phi) duoc khoa RIENG ben
 * duoi voi dung ma cua chung — chung doc du lieu tien va du lieu doi soat.
 */
describe('moi duong HTTP cua ETC deu co cong quyen', () => {
  const routesOf = async (): Promise<
    readonly { readonly name: string; readonly path: string; readonly action: string | undefined }[]
  > => {
    await import('reflect-metadata');
    const { TollController } = await import('./toll.controller.js');
    const { TRANSPORT_ACTION_KEY } = await import('../transport-action.guard.js');
    const prototype = TollController.prototype as unknown as Record<string, unknown>;
    return Object.getOwnPropertyNames(prototype).flatMap((name) => {
      const handler = prototype[name];
      if (name === 'constructor' || typeof handler !== 'function') return [];
      const path = Reflect.getMetadata('path', handler) as string | undefined;
      if (path === undefined) return [];
      const action = Reflect.getMetadata(TRANSPORT_ACTION_KEY, handler) as string | undefined;
      return [{ name, path, action }];
    });
  };

  it('khong route nao thieu ma quyen `transport.toll.*`', async () => {
    const routes = await routesOf();
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(route.action, `${route.name} (${route.path})`).toMatch(/^transport\.toll\./);
    }
  });

  it('lai xe (`SALE`) va `MANAGER` KHONG qua duoc route nao; ke toan va quan tri qua duoc tat ca', async () => {
    for (const route of await routesOf()) {
      const action = route.action as Parameters<typeof presetIncludes>[1];
      expect(presetIncludes('SALE', action), `SALE ${route.path}`).toBe(false);
      expect(presetIncludes('MANAGER', action), `MANAGER ${route.path}`).toBe(false);
      expect(presetIncludes('ACCOUNTING', action), `ACCOUNTING ${route.path}`).toBe(true);
      expect(presetIncludes('ADMIN', action), `ADMIN ${route.path}`).toBe(true);
    }
  });

  it('ba duong doc cua `#314` ton tai voi DUNG ma quyen cua chung', async () => {
    const byPath = new Map((await routesOf()).map((route) => [route.path, route.action]));
    expect(byPath.get('vehicles/:vehicleId/links')).toBe('transport.toll.account.read');
    expect(byPath.get('candidates/:id/duplicate-peers')).toBe('transport.toll.review.read');
    expect(byPath.get('reports/spend')).toBe('transport.toll.review.read');
  });
});
