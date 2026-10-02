import { loadTenantConfig, resetTenantCache } from '@netviet/tenant';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseGeoPoint } from '../geo/geo-point.js';
import { DemoTenantGuardError } from './demo-guard.js';
import {
  DEMO_DEPOT_MARKER,
  DEMO_SITE_MARKERS,
  SYNTHETIC_POINT_NOTE,
  backfillDemoPlaceMarkers,
  counterpartyLookup,
  type DemoPlacesPrisma,
  type DemoPlacesResult,
  type DemoPlacesTransactionOptions,
} from './demo-places.js';

/*
 * Prisma GIA trong bo nho — du cho dung ba bang ham nay cham toi, voi mot giao dich MO PHONG:
 *
 *   · moi giao dich doc "da commit + phan chinh no vua ghi", va chi ghi vao bang THAT luc commit;
 *   · ai commit SAU mot giao dich khac da commit trong luc minh chay (va minh cung ghi) thi nhan
 *     P2034 — nguoi commit truoc thang, dung hinh dang ma Postgres `Serializable` tra ve;
 *   · `failures` cho bai kiem ep mot lan commit that bai voi mot ma cho truoc.
 *
 * MOI bang ma giao dich cham toi deu ghi vao `touched` — bai "khong lien ket" doc no de chung minh
 * khong co bang nao ngoai ba bang tren.
 * Bai tren Postgres THAT nam o `demo-seed.int.spec.ts`.
 */
type Row = Record<string, unknown>;

interface Tables {
  counterparties: Row[];
  sites: Row[];
  geofences: Row[];
}

const emptyTables = (): Tables => ({ counterparties: [], sites: [], geofences: [] });

/** Bang nhau, hoac `{ in: [...] }` — du cho nhung dieu kien ham gieo dung. */
const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([key, value]) =>
    typeof value === 'object' && value !== null && 'in' in value
      ? (value as { in: unknown[] }).in.includes(row[key])
      : row[key] === value,
  );

function fakePrisma() {
  let sequence = 0;
  let version = 0;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;
  const tables = emptyTables();
  const writes: string[] = [];
  const transactions: DemoPlacesTransactionOptions[] = [];
  const failures: string[] = [];
  const touched = new Set<string>();
  const state = { conflicts: 0 };

  const delegates = (view: Tables, stage: (table: keyof Tables, row: Row) => void) => ({
    transportGeofence: {
      findFirst: async ({ where }: { where: Row }) =>
        view.geofences.find((row) => matches(row, where)) ?? null,
      findMany: async ({ where }: { where: Row }) =>
        view.geofences.filter((row) => matches(row, where)),
      create: async ({ data }: { data: Row }) => {
        const row = { id: nextId('fence'), status: 'ACTIVE', ...data };
        stage('geofences', row);
        return row;
      },
    },
    transportCounterparty: {
      findUnique: async ({ where }: { where: { taxCode: string } }) =>
        view.counterparties.find((row) => row['taxCode'] === where.taxCode) ?? null,
      findFirst: async ({ where }: { where: { name: string } }) =>
        view.counterparties.find((row) => row['name'] === where.name) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = { id: nextId('cp'), ...data };
        stage('counterparties', row);
        return row;
      },
    },
    transportCounterpartySite: {
      findMany: async ({ where }: { where: Row }) =>
        view.sites.filter((row) => matches(row, where)),
      findUnique: async ({
        where,
      }: {
        where: { counterpartyId_name: { counterpartyId: string; name: string } };
      }) =>
        view.sites.find(
          (row) =>
            row['counterpartyId'] === where.counterpartyId_name.counterpartyId &&
            row['name'] === where.counterpartyId_name.name,
        ) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = { id: nextId('site'), ...data };
        stage('sites', row);
        return row;
      },
    },
  });

  const prisma = {
    async $transaction<R>(
      work: (tx: never) => Promise<R>,
      options: DemoPlacesTransactionOptions,
    ): Promise<R> {
      transactions.push(options);
      const startedAt = version;
      const staged = emptyTables();
      const view: Tables = {
        get counterparties() {
          return [...tables.counterparties, ...staged.counterparties];
        },
        get sites() {
          return [...tables.sites, ...staged.sites];
        },
        get geofences() {
          return [...tables.geofences, ...staged.geofences];
        },
      };
      const known = delegates(view, (table, row) => {
        staged[table].push(row);
      });
      const tx = new Proxy(known, {
        get(target, property: string) {
          touched.add(property);
          return target[property as keyof typeof target];
        },
      });

      const result = await work(tx as never);

      const injected = failures.shift();
      if (injected !== undefined) {
        throw Object.assign(new Error(`gia lap loi ${injected}`), { code: injected });
      }
      const wrote = Object.values(staged).some((rows: Row[]) => rows.length > 0);
      if (wrote && version !== startedAt) {
        state.conflicts += 1;
        throw Object.assign(new Error('could not serialize access (gia lap)'), { code: 'P2034' });
      }
      for (const table of Object.keys(staged) as (keyof Tables)[]) {
        for (const row of staged[table]) {
          tables[table].push(row);
          writes.push(table);
        }
      }
      if (wrote) version += 1;
      return result;
    },
  };
  return {
    prisma: prisma as unknown as DemoPlacesPrisma,
    tables,
    writes,
    transactions,
    failures,
    touched,
    state,
  };
}

const useTenant = (slug: string): void => {
  process.env.TENANT = slug;
  delete process.env.TENANT_DIR;
  resetTenantCache();
};

const KH02_TAX = '0200788341';
const KH03_TAX = '4600921537';
const LABELS = [DEMO_DEPOT_MARKER.label, ...DEMO_SITE_MARKERS.map((marker) => marker.siteName)];
const ALL_SEEDED: DemoPlacesResult = {
  created: { counterparty: 0, counterpartySite: 0, geofence: 0 },
  skipped: LABELS.map((label) => ({ label, reason: 'MARKER_ALREADY_SEEDED' })),
};

beforeEach(() => useTenant('transport-preview'));
afterEach(() => {
  delete process.env.TENANT;
  resetTenantCache();
});

describe('diem dia diem mau (#379)', () => {
  it('lan dau tao dung ba hang rao, hai phap nhan, hai dia diem — khong gi bi bo qua', async () => {
    const { prisma, tables } = fakePrisma();

    const result = await backfillDemoPlaceMarkers(prisma);

    expect(result).toEqual({
      created: { counterparty: 2, counterpartySite: 2, geofence: 3 },
      skipped: [],
    });
    expect(
      tables.geofences.map((fence) => [
        fence['subjectKind'],
        fence['label'],
        fence['latitude'],
        fence['longitude'],
        fence['radiusMetres'],
      ]),
    ).toEqual([
      ['DEPOT', 'Bãi xe Hà Nội', 20.9652, 105.8468, 250],
      ['COUNTERPARTY_SITE', 'Nhà máy thép Đình Vũ', 20.8264, 106.7752, 300],
      ['COUNTERPARTY_SITE', 'Kho Nhựa Tân Phú Hưng', 21.617, 105.817, 250],
    ]);
    expect(tables.geofences[0]).toMatchObject({ subjectId: 'DEPOT-HN' });
    expect(tables.counterparties.map((row) => [row['name'], row['taxCode']])).toEqual([
      ['Công ty CP Thép Đông Á', KH02_TAX],
      ['Công ty TNHH Nhựa Tân Phú Hưng', KH03_TAX],
    ]);
    expect(tables.sites.map((row) => [row['name'], row['address']])).toEqual([
      ['Nhà máy thép Đình Vũ', 'Lô C7 KCN Đình Vũ, Hải An, Hải Phòng'],
      ['Kho Nhựa Tân Phú Hưng', 'Km 8 QL3, Phú Lương, Thái Nguyên'],
    ]);
    // Hang rao dia diem tro DUNG dia diem vua tao, khong phai phap nhan.
    expect(tables.geofences[1]?.['subjectId']).toBe(tables.sites[0]?.['id']);
  });

  /** Toa do TONG HOP phai noi ra la tong hop — o ghi chu, bang tieng Viet khong dau. */
  it('moi hang rao va dia diem ghi ro toa do tong hop, nguoi ghi la demo-seed', async () => {
    const { prisma, tables } = fakePrisma();

    await backfillDemoPlaceMarkers(prisma);

    expect(SYNTHETIC_POINT_NOTE).toBe(
      'toa do tong hop cho du lieu mau, khong phai toa do khao sat',
    );
    for (const row of [...tables.geofences, ...tables.sites]) {
      expect(row['note']).toBe(SYNTHETIC_POINT_NOTE);
      expect(row['recordedBy']).toBe('demo-seed');
    }
    expect(SYNTHETIC_POINT_NOTE).toMatch(/^[\x20-\x7E]+$/u);
  });

  /** Railway goi ham nay o MOI lan khoi dong: lan thu hai tro di khong duoc ghi gi. */
  it('lan thu hai khong tao gi: moi diem MARKER_ALREADY_SEEDED, khong mot lan ghi', async () => {
    const { prisma, writes } = fakePrisma();
    await backfillDemoPlaceMarkers(prisma);
    writes.length = 0;

    const second = await backfillDemoPlaceMarkers(prisma);

    expect(second).toEqual(ALL_SEEDED);
    expect(writes).toEqual([]);
  });

  /**
   * DIEM DA GIEO LA DA GIEO. Nguoi van hanh doi ten dia diem va doi ma so thue phap nhan: lan
   * khoi dong sau KHONG duoc tim-hoac-tao lai (khong con khop ten/ma so thue nao) va sinh ban sao.
   */
  it('dia diem bi doi ten, phap nhan bi doi ma so thue -> KHONG tao gi', async () => {
    const { prisma, tables, writes } = fakePrisma();
    await backfillDemoPlaceMarkers(prisma);
    writes.length = 0;
    tables.sites[0] = { ...tables.sites[0], name: 'Nhà máy thép Đình Vũ (cơ sở 1)' };
    tables.counterparties[1] = { ...tables.counterparties[1], taxCode: '4600000000' };

    const result = await backfillDemoPlaceMarkers(prisma);

    expect(result).toEqual(ALL_SEEDED);
    expect(writes).toEqual([]);
    expect(tables.sites).toHaveLength(2);
    expect(tables.counterparties).toHaveLength(2);
  });

  /** Hang rao cua may gieo da bi NGHI van la dau vet "da gieo" — khong hoi sinh, khong them. */
  it('hang rao cua may gieo da nghi -> van coi la da gieo', async () => {
    const { prisma, tables } = fakePrisma();
    await backfillDemoPlaceMarkers(prisma);
    tables.geofences[0] = { ...tables.geofences[0], status: 'INACTIVE' };

    const result = await backfillDemoPlaceMarkers(prisma);

    expect(result).toEqual(ALL_SEEDED);
    expect(tables.geofences).toHaveLength(3);
  });

  /**
   * `#395`: Giam doc doi ten dia diem van hanh o man "Dia diem van hanh" — ten dia diem VA nhan hang
   * rao doi cung luc. Dau vet theo nhan mat, nhung dau vet ON DINH (phap nhan co dia diem mang hang
   * rao cua may gieo) con: lan khoi dong sau KHONG tao lai dia diem mang ten cu.
   */
  it('doi ten CA dia diem lan nhan hang rao -> van coi la da gieo, khong ban sao', async () => {
    const { prisma, tables, writes } = fakePrisma();
    await backfillDemoPlaceMarkers(prisma);
    writes.length = 0;
    tables.sites[0] = { ...tables.sites[0], name: 'Nhà máy Đình Vũ 1' };
    tables.geofences[1] = { ...tables.geofences[1], label: 'Nhà máy Đình Vũ 1' };

    const result = await backfillDemoPlaceMarkers(prisma);

    expect(result).toEqual(ALL_SEEDED);
    expect(writes).toEqual([]);
    expect(tables.sites).toHaveLength(2);
    expect(tables.geofences).toHaveLength(3);
  });

  /**
   * `#395`: bai xe da duoc quan ly o man "Dia diem van hanh" (bat ky hang rao `DEPOT` nao, MOI trang
   * thai) -> may gieo KHONG them bai thu hai, ke ca khi ma va nhan khac bai mau.
   */
  it.each(['ACTIVE', 'INACTIVE'])(
    'da co mot bai xe duoc quan ly (%s) -> DEPOT_ALREADY_MANAGED, khong them bai',
    async (status) => {
      const { prisma, tables } = fakePrisma();
      tables.geofences.push({
        id: 'fence-director',
        subjectKind: 'DEPOT',
        subjectId: 'DEPOT-BAI-XE-GIA-LAM',
        status,
        label: 'Bãi xe Gia Lâm',
        recordedBy: 'giam-doc',
      });

      const result = await backfillDemoPlaceMarkers(prisma);

      expect(result.skipped).toEqual([{ label: 'Bãi xe Hà Nội', reason: 'DEPOT_ALREADY_MANAGED' }]);
      expect(result.created.geofence).toBe(2);
      expect(tables.geofences.filter((row) => row['subjectKind'] === 'DEPOT')).toHaveLength(1);
    },
  );

  /** Hang rao nguoi van hanh da NGHI khong duoc may gieo hoi sinh. */
  it('hang rao bai xe cua nguoi van hanh da ton tai (ke ca da nghi) -> giu nguyen, khong tao lai', async () => {
    const { prisma, tables } = fakePrisma();
    tables.geofences.push({
      id: 'fence-human',
      subjectKind: 'DEPOT',
      subjectId: 'DEPOT-HN',
      status: 'INACTIVE',
      label: 'Bãi xe cũ',
      recordedBy: 'giam-doc',
    });

    const result = await backfillDemoPlaceMarkers(prisma);

    expect(result.created.geofence).toBe(2);
    expect(result.skipped).toEqual([{ label: 'Bãi xe Hà Nội', reason: 'DEPOT_ALREADY_FENCED' }]);
    expect(tables.geofences.filter((row) => row['subjectKind'] === 'DEPOT')).toEqual([
      expect.objectContaining({ id: 'fence-human', status: 'INACTIVE', label: 'Bãi xe cũ' }),
    ]);
  });

  /**
   * NHAN MO HO: nguoi van hanh da co mot hang rao DANG HOAT DONG ten "BAI XE HA NOI" (khac dau,
   * khac hoa/thuong — cung mot nhan sau chuan hoa). Them cai cua may gieo se lam CA HAI khong giai
   * duoc theo nhan. Hang rao da NGHI thi khong tinh.
   */
  it('hang rao DANG HOAT DONG trung nhan sau chuan hoa -> bo qua co ly do; da nghi thi khong', async () => {
    const { prisma, tables } = fakePrisma();
    tables.geofences.push(
      {
        id: 'fence-op',
        subjectKind: 'CUSTOMER',
        subjectId: 'khach-1',
        status: 'ACTIVE',
        label: 'BAI XE  HA NOI',
        recordedBy: 'giam-doc',
      },
      {
        id: 'fence-old',
        subjectKind: 'CUSTOMER',
        subjectId: 'khach-2',
        status: 'INACTIVE',
        label: 'nha may thep dinh vu',
        recordedBy: 'giam-doc',
      },
    );

    const result = await backfillDemoPlaceMarkers(prisma);

    expect(result.skipped).toEqual([
      { label: 'Bãi xe Hà Nội', reason: 'LABEL_TAKEN_BY_ACTIVE_GEOFENCE' },
    ]);
    expect(result.created).toEqual({ counterparty: 2, counterpartySite: 2, geofence: 2 });
    expect(tables.geofences.filter((row) => row['recordedBy'] === 'demo-seed')).toHaveLength(2);
    expect(tables.geofences.some((row) => row['subjectKind'] === 'DEPOT')).toBe(false);
  });

  it('dia diem tim thay da co hang rao cua no -> khong them hang rao thu hai', async () => {
    const { prisma, tables } = fakePrisma();
    tables.counterparties.push({ id: 'cp-op', name: 'Thép Đông Á', taxCode: KH02_TAX });
    tables.sites.push({ id: 'site-op', counterpartyId: 'cp-op', name: 'Nhà máy thép Đình Vũ' });
    tables.geofences.push({
      id: 'fence-op',
      subjectKind: 'COUNTERPARTY_SITE',
      subjectId: 'site-op',
      status: 'ACTIVE',
      label: 'Cổng nhà máy Đình Vũ',
      recordedBy: 'giam-doc',
    });

    const result = await backfillDemoPlaceMarkers(prisma);

    expect(result.skipped).toEqual([
      { label: 'Nhà máy thép Đình Vũ', reason: 'SITE_ALREADY_FENCED' },
    ]);
    expect(tables.geofences.filter((row) => row['subjectId'] === 'site-op')).toHaveLength(1);
    expect(tables.counterparties).toHaveLength(2);
  });

  /** May gieo KHONG cham bang khach hay bang lien ket — lien ket nguoi van hanh go la go han. */
  it('khong tao lien ket khach: chi cham ba bang hang rao / phap nhan / dia diem', async () => {
    const { prisma, touched } = fakePrisma();

    const result = await backfillDemoPlaceMarkers(prisma);

    expect([...touched].sort()).toEqual([
      'transportCounterparty',
      'transportCounterpartySite',
      'transportGeofence',
    ]);
    expect(Object.keys(result.created).sort()).toEqual([
      'counterparty',
      'counterpartySite',
      'geofence',
    ]);
  });

  it('moi diem chay trong MOT giao dich Serializable', async () => {
    const { prisma, transactions } = fakePrisma();

    await backfillDemoPlaceMarkers(prisma);

    expect(transactions).toHaveLength(3);
    for (const options of transactions) {
      expect(options).toMatchObject({ isolationLevel: 'Serializable' });
    }
  });

  /**
   * HAI LAN KHOI DONG CHONG NHAU. Mot ben commit truoc; ben kia nhan P2034, chay lai (co gioi han), doc
   * thay hang rao vua ghi va bo qua. Khong ban sao, khong loi nem ra.
   */
  it('hai lan chay song song: khong ban sao, khong loi, moi diem dung mot ben tao', async () => {
    const { prisma, tables, state } = fakePrisma();

    const [first, second] = await Promise.all([
      backfillDemoPlaceMarkers(prisma),
      backfillDemoPlaceMarkers(prisma),
    ]);

    expect(state.conflicts).toBeGreaterThan(0);
    expect(tables.geofences).toHaveLength(3);
    expect(tables.counterparties).toHaveLength(2);
    expect(tables.sites).toHaveLength(2);
    expect(first.created.geofence + second.created.geofence).toBe(3);
    for (const result of [first, second]) {
      const seeded = result.skipped.filter((entry) => entry.reason === 'MARKER_ALREADY_SEEDED');
      expect(result.created.geofence + seeded.length).toBe(3);
    }
  });

  it.each(['P2002', 'P2034'])(
    'xung dot %s -> chay lai dung mot lan va thanh cong',
    async (code) => {
      const { prisma, tables, transactions, failures } = fakePrisma();
      failures.push(code);

      const result = await backfillDemoPlaceMarkers(prisma);

      expect(result.created).toEqual({ counterparty: 2, counterpartySite: 2, geofence: 3 });
      expect(transactions).toHaveLength(4);
      expect(tables.geofences).toHaveLength(3);
    },
  );

  it('xung dot lap lai NHIEU lan (nhu CI exact-main) -> van thu tiep va thanh cong', async () => {
    const { prisma, tables, transactions, failures } = fakePrisma();
    failures.push('P2034', 'P2034', 'P2034');

    const result = await backfillDemoPlaceMarkers(prisma);

    expect(result.created).toEqual({ counterparty: 2, counterpartySite: 2, geofence: 3 });
    expect(transactions).toHaveLength(6);
    expect(tables.geofences).toHaveLength(3);
  });

  it('xung dot van con sau lan thu CUOI -> nem ra (thu lai co gioi han, khong vo han)', async () => {
    const { prisma, transactions, failures } = fakePrisma();
    failures.push('P2034', 'P2034', 'P2034', 'P2034', 'P2034', 'P2034');

    await expect(backfillDemoPlaceMarkers(prisma)).rejects.toMatchObject({ code: 'P2034' });
    expect(transactions).toHaveLength(6);
  });

  it('loi KHONG phai xung dot -> nem ngay, khong thu lai', async () => {
    const { prisma, transactions, failures } = fakePrisma();
    failures.push('P2003');

    await expect(backfillDemoPlaceMarkers(prisma)).rejects.toMatchObject({ code: 'P2003' });
    expect(transactions).toHaveLength(1);
  });

  it('goi khach THAT -> tu choi truoc mot lan ghi nao', async () => {
    useTenant('ultty');
    const { prisma, writes, transactions } = fakePrisma();

    await expect(backfillDemoPlaceMarkers(prisma)).rejects.toBeInstanceOf(DemoTenantGuardError);
    expect(writes).toEqual([]);
    expect(transactions).toEqual([]);
  });
});

describe('tim phap nhan cua khach mau', () => {
  it('co ma so thue -> tim theo ma so thue', () => {
    expect(counterpartyLookup({ name: 'Công ty A', taxCode: ' 0200788341 ' })).toEqual({
      by: 'taxCode',
      taxCode: '0200788341',
    });
  });

  it('khong ma so thue (null / rong) -> tim theo DUNG ten', () => {
    expect(counterpartyLookup({ name: 'Công ty A', taxCode: null })).toEqual({
      by: 'name',
      name: 'Công ty A',
    });
    expect(counterpartyLookup({ name: 'Công ty A', taxCode: '  ' })).toEqual({
      by: 'name',
      name: 'Công ty A',
    });
  });
});

describe('du lieu diem dia diem mau', () => {
  /**
   * `#395`: goi xem truoc KHONG con khai bai xe trong cau hinh — hang rao `DEPOT` cua may gieo LA bai
   * xe cua khau lap ke hoach (danh ba bai xe doc so hang rao). Ma giu dung ma cua cau hinh cu, nen
   * chang rong da ghi truoc day van mang cung mot danh tinh bai.
   */
  it('goi khach xem truoc khong khai bai xe; bai mau giu ma cu DEPOT-HN', () => {
    expect(loadTenantConfig().policies.transportPlanning?.depots).toBeUndefined();
    expect(DEMO_DEPOT_MARKER).toMatchObject({ subjectId: 'DEPOT-HN', label: 'Bãi xe Hà Nội' });
  });

  it('moi toa do qua parseGeoPoint', () => {
    for (const point of [
      DEMO_DEPOT_MARKER.point,
      ...DEMO_SITE_MARKERS.map((marker) => marker.point),
    ]) {
      expect(parseGeoPoint(point.latitude, point.longitude).ok).toBe(true);
    }
  });

  /**
   * Nhan hien tren be mat khach: khong mang chu cam cua cong quet chinh sach, khong trung nhau sau
   * chuan hoa (nhan trung lam giai theo nhan ra "mo ho"), va khong trung tien to fixture IT.
   */
  it('nhan khong mang tu cam, duy nhat sau chuan hoa, khong trung tien to fixture', () => {
    const normalized = LABELS.map((label) =>
      label.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd').toLowerCase().trim(),
    );

    for (const label of normalized) {
      expect(label).not.toMatch(/synthetic|preview|xem truoc|\buat\b|demo/u);
      expect(label).not.toMatch(/^(itproof|it-dsp|it-)/u);
    }
    expect(new Set(normalized).size).toBe(LABELS.length);
  });
});
