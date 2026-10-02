import { CAPABILITY_IDS, type CapabilityId } from '@netviet/tenant';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  TRANSPORT_SECTIONS,
  visibleSections,
  type NavigationInput,
  type TransportSection,
} from '../navigation';
import { READ_SUBJECT } from '../permission-notes';
import { TRANSPORT_ACTIONS } from '../transport-actions';
import {
  countActionDecorators,
  matchRoute,
  reachableFrom,
  readClientCalls,
  readServerRoutes,
  readSourceGraph,
  type ClientCall,
  type FunctionNode,
  type ServerRoute,
  type SourceGraph,
} from './support/source-access-graph';

/**
 * `#395` — MOI MUC HIEN RA PHAI DOC DUOC DU LIEU CHINH CUA NO, VA MOI NHOM QUYEN PHAI MO DUOC MOT MUC.
 *
 * Bang chung chay that (Postgres + API dist + `next start`) cho thay: may chu cuong che DUNG, nhung
 * thanh ben gac moi muc bang MOT ma trong khi du lieu cua muc can ma KHAC. Truoc `#395` bon vai khoi
 * diem che mat dieu do; quyen rieng cua Giam doc lam no lo ra — muc trang (`Hiệu quả từng chuyến`),
 * cau "chưa có …" sai (`Lương`, `Quỹ lái xe`), nhom quyen khong mo muc nao (`Bảo dưỡng`).
 *
 * Bai nay KHONG doc mot bang go tay nao. No dung lai chuoi that tu MA NGUON:
 *
 *   controller API (`@RequiresTransportAction`) → ham client (`transportApi.*`) → `useQuery`
 *   (`queryFn` + cong `enabled`) → hook/component → `SectionBody` → `TRANSPORT_SECTIONS`
 *
 * roi doi ba dieu: cong cua moi query BANG dung ma may chu doi; moi ma ma mot muc doc duoc khai
 * (chinh hoac phu); moi ma phu duoc phan VE xu ly. Them mot query, doi mot route, doi mot cong —
 * thieu mot mat xich la do, truoc khi khach thay.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPERIENCE = resolve(HERE, '..');
const API_SRC = resolve(HERE, '../../../../api/src');

/**
 * Doc TOAN BO ma nguon mot lan: vai tram tep, parse mat ~1-2 giay khi chay mot minh. Chung bo voi
 * ca bo web (nhieu worker cung parse) thi cham hon nhieu — het han mac dinh 10 giay cua hook la do
 * GIA, nen hook nay co han rieng.
 */
const SOURCE_READ_TIMEOUT_MS = 120_000;

let routes: readonly ServerRoute[];
let client: ReadonlyMap<string, ClientCall>;
let graph: SourceGraph;

beforeAll(() => {
  routes = readServerRoutes(API_SRC);
  client = readClientCalls([
    resolve(EXPERIENCE, 'transport-api.ts'),
    resolve(EXPERIENCE, 'admin/admin-api.ts'),
  ]);
  graph = readSourceGraph({
    experienceDir: EXPERIENCE,
    sectionBodyFile: resolve(EXPERIENCE, 'TransportOperations.tsx'),
    clientNames: new Set(client.keys()),
  });
}, SOURCE_READ_TIMEOUT_MS);

const short = (key: string): string => key.slice(EXPERIENCE.replace(/\\/g, '/').length + 1);

/** Route may chu cua mot ham client — `null` khi khong ghep duoc (bai rieng bat dieu do). */
const routeOf = (name: string): ServerRoute | null => {
  const call = client.get(name);
  return call === undefined ? null : matchRoute(routes, call.method, call.segments);
};

const isRead = (name: string): boolean => client.get(name)?.method === 'GET';

/**
 * Query ma cong CO Y khong phai ma cua route — moi dong mot ly do, khong co ngoai le lang le.
 *
 * Pham vi ben gop von (`transport.stakeholder.self.vehicle.read`) KHONG vai/quyen rieng nao mang: cau
 * tra loi duy nhat la may chu tra du lieu hay `403` cho `GET /transport/me/vehicles` (xem
 * `useStakeholderScopeProbe`). Mot cong theo ma o client se luon dong.
 */
const GATE_BY_SERVER_ANSWER = new Set([
  'hooks/useTransportWorkspace.ts#useStakeholderScopeProbe',
  'hooks/useTransportWorkspace.ts#useMyStakeholderVehicles',
  'hooks/useTransportWorkspace.ts#useMyVehicleActivity',
]);

/** Goc `SectionBody` → do thi; dung o `useNavigationInput` (hoi pham vi NGUOI XEM, khong phai du lieu cua muc). */
const STOP = new Set(['useNavigationInput']);

/** Be mat LAI XE — goc thu hai cua trai nghiem (khong nam trong `SectionBody`). */
const DRIVER_ROOT = 'driver/DriverSurface.tsx#DriverSurface';

/**
 * Lan doc cua CHINH khung man hinh, khong cua mot muc: hoi "nguoi nay co phai ben gop von" de dat
 * muc `my-vehicles` len thanh ben (`useNavigationInput`). Cong la cau tra loi cua may chu — xem
 * `GATE_BY_SERVER_ANSWER`.
 */
const SHELL_PROBES = new Set(['hooks/useTransportWorkspace.ts#useStakeholderScopeProbe']);

interface SectionUse {
  /** Ma cua moi lan DOC ma muc co the ban ra: query (cong + route) va lan doc trong mot lan bam. */
  readonly reads: ReadonlySet<string>;
  /** Ma ma phan ve hoi (`canPerform`, `PermissionGate`, `PermissionNote`). */
  readonly checks: ReadonlySet<string>;
  /** Ma cua lenh ghi ma muc goi. */
  readonly writes: ReadonlySet<string>;
}

function useOf(section: TransportSection): SectionUse {
  const root = graph.sectionRoots.get(section.id);
  if (root === undefined) throw new Error(`SectionBody khong ve muc ${section.id}`);
  const nodes: readonly FunctionNode[] = reachableFrom(graph, root, STOP);
  const reads = new Set<string>();
  const checks = new Set<string>();
  const writes = new Set<string>();
  for (const node of nodes) {
    for (const query of node.queries) {
      for (const gate of query.gates) reads.add(gate);
      for (const call of query.calls) {
        const action = routeOf(call)?.action;
        if (action) reads.add(action);
      }
    }
    for (const ref of node.clientRefs) {
      const action = routeOf(ref)?.action;
      if (action) (isRead(ref) ? reads : writes).add(action);
    }
    for (const check of node.actionChecks) checks.add(check);
  }
  return { reads, checks, writes };
}

const declaredOf = (section: TransportSection): ReadonlySet<string> =>
  new Set<string>([...(section.requiredActions ?? []), ...(section.optionalActions ?? [])]);

describe('#395 — bo phan tich doc duoc ma nguon (bai do khong duoc xanh vi khong doc duoc gi)', () => {
  it('doc duoc route may chu, ham client, va mot goc cho MOI muc', () => {
    // Moi `@RequiresTransportAction` cua API la DUNG mot route co ma — khong lot, khong dem trung.
    const decorated = new Set(
      routes.filter((route) => route.action !== null).map((route) => route.where),
    );
    expect(decorated.size).toBeGreaterThan(250);
    expect(decorated.size).toBe(countActionDecorators(API_SRC));
    expect(client.size).toBeGreaterThan(150);
    expect([...graph.sectionRoots.keys()].sort()).toEqual(
      TRANSPORT_SECTIONS.map((section) => section.id).sort(),
    );
  });

  it('moi ham client ma man hinh DOC ghep duoc voi mot route that cua may chu', () => {
    const used = new Set<string>();
    for (const node of graph.nodes.values()) {
      for (const query of node.queries) query.calls.forEach((call) => used.add(call));
      node.clientRefs.forEach((ref) => used.add(ref));
    }
    const unmatched = [...used].filter((name) => routeOf(name) === null);
    expect(unmatched).toEqual([]);
  });
});

describe('#395 — bo phan tich KHONG bo sot mot nhanh cua man hinh', () => {
  /**
   * Mot component noi vao man hinh theo cach do thi khong doc duoc (truyen lam prop, nap dong kieu
   * moi…) se mang theo moi query cua no ra ngoai bai do — va bai van xanh. Nen: moi ham CO lan doc
   * may chu phai nam duoi mot muc hoac be mat lai xe; ngoai le chi la ham CHET (khong ai goi — cong
   * cua no van duoc bai ben duoi kiem) va lan doc cua khung man hinh.
   */
  it('moi ham co lan doc may chu nam duoi mot muc, duoi be mat lai xe, hoac la ham khong ai goi', () => {
    const base = EXPERIENCE.replace(/\\/g, '/');
    const reached = new Set<string>();
    for (const root of [...graph.sectionRoots.values(), `${base}/${DRIVER_ROOT}`]) {
      for (const node of reachableFrom(graph, root, STOP)) reached.add(node.key);
    }
    const referenced = new Set([...graph.nodes.values()].flatMap((node) => node.edges));
    const orphans = [...graph.nodes.values()]
      .filter((node) => node.queries.length > 0 || node.clientRefs.length > 0)
      .filter((node) => !reached.has(node.key) && referenced.has(node.key))
      .map((node) => short(node.key))
      .filter((key) => !SHELL_PROBES.has(key));
    expect(orphans).toEqual([]);
    expect(reached.size).toBeGreaterThan(100);
  });

  it('component nap dong (`next/dynamic`) duoc noi vao do thi', () => {
    const dispatch = graph.nodes.get(graph.sectionRoots.get('dispatch') ?? '');
    expect(
      dispatch?.edges.some((edge) => edge.endsWith('/visual/TransportMap.tsx#TransportMap')),
    ).toBe(true);
  });
});

describe('#395 — cong cua moi query BANG dung ma may chu doi', () => {
  it('moi `useQuery` goi mot ham client, va `enabled` gac bang CHINH ma cua route do', () => {
    const problems: string[] = [];
    for (const node of graph.nodes.values()) {
      for (const query of node.queries) {
        const owner = short(query.owner);
        if (query.calls.length === 0) {
          problems.push(`${owner}: khong tim thay ham client trong queryFn`);
          continue;
        }
        const server = new Set(
          query.calls.flatMap((call) => {
            const action = routeOf(call)?.action;
            return action ? [action] : [];
          }),
        );
        if (GATE_BY_SERVER_ANSWER.has(owner)) continue;
        const gates = new Set(query.gates);
        const same = server.size === gates.size && [...server].every((action) => gates.has(action));
        if (!same) {
          problems.push(
            `${owner}: cong [${[...gates].join(', ')}] ≠ may chu [${[...server].join(', ')}]`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('#395 — muc hien ra thi doc duoc du lieu chinh; phan phu noi mot cau', () => {
  const sections: readonly TransportSection[] = TRANSPORT_SECTIONS;

  it.each(sections.map((section) => [section.id, section] as const))(
    '%s: moi lan doc cua muc deu duoc khai, va moi ma khai deu duoc dung',
    (_id, section) => {
      const use = useOf(section);
      const declared = declaredOf(section);
      const required = section.requiredActions ?? [];
      const optional = section.optionalActions ?? [];

      // (1) Moi lan doc cua muc — chinh hay phu — co ma nam trong bo khai.
      expect(
        [...use.reads].filter((action) => !declared.has(action)).sort(),
        'doc ma chua khai',
      ).toEqual([]);
      // (2) Ma CHINH phai la ma muc that su dung (doc, hoi, hoac ghi) — khong gac bang mot ma vo can.
      const used = new Set([...use.reads, ...use.checks, ...use.writes]);
      expect(
        required.filter((action) => !used.has(action)),
        'ma chinh khong ai dung',
      ).toEqual([]);
      // (3) Ma PHU phai duoc phan ve hoi — do la cho noi cau "chua duoc cap quyen" thay vi o trong.
      expect(
        optional.filter((action) => !use.checks.has(action)),
        'ma phu khong duoc xu ly',
      ).toEqual([]);
      // (4) Hai bo khong chong nhau.
      expect(required.filter((action) => optional.includes(action))).toEqual([]);
    },
  );

  it('moi ma PHU la ma DOC deu co ten viec cho cau "Bạn chưa được cấp quyền xem …"', () => {
    const missing = sections
      .flatMap((section) => section.optionalActions ?? [])
      .filter((action) => action.endsWith('.read') && READ_SUBJECT[action] === undefined);
    expect([...new Set(missing)]).toEqual([]);
  });

  it('moi ma khai la mot ma van tai that', () => {
    const known = new Set<string>(TRANSPORT_ACTIONS);
    for (const section of sections) {
      for (const action of declaredOf(section)) expect(known.has(action), action).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Moi nhom quyen cap duoc → it nhat mot muc dung duoc
 * ------------------------------------------------------------------ */

interface CatalogActionView {
  readonly code: string;
  readonly kind: string;
  readonly directorOnly: boolean;
  readonly escalation: boolean;
}
interface CatalogGroupView {
  readonly id: string;
  readonly grantable: boolean;
  readonly needs?: readonly string[];
  readonly actions: readonly CatalogActionView[];
}

/** Danh muc THAT cua may chu — cung cach `permission-catalog-fixture.spec.ts` nap. */
async function serverGroups(): Promise<readonly CatalogGroupView[]> {
  const module = (await import(
    /* @vite-ignore */ pathToFileURL(
      resolve(API_SRC, 'transport/permissions/transport-permission-catalog.ts'),
    ).href
  )) as { transportPermissionCatalog?: () => { groups: readonly CatalogGroupView[] } };
  if (typeof module.transportPermissionCatalog !== 'function') {
    throw new Error('Khong tim thay danh muc quyen van tai trong ma nguon API');
  }
  return module.transportPermissionCatalog().groups;
}

const ALL_CAPABILITIES: readonly CapabilityId[] = [...CAPABILITY_IDS];

/** Nguoi Dieu hanh / Quan ly duoc cap DUNG bo nay (may chu tra dung bo do trong `/auth/me`). */
const managerHolding = (actions: Iterable<string>): NavigationInput => ({
  capabilities: ALL_CAPABILITIES,
  role: 'MANAGER',
  permissions: new Set(actions),
});

/**
 * Ba cach Giam doc cap mot nhom tren man "Tài khoản & quyền": ca nhom (ke ca viec nhay cam da xac
 * nhan), mot lan bam o nhom (bo qua viec nhay cam — `isGroupToggleable`), va chi phan XEM.
 */
function grantVariants(group: CatalogGroupView): readonly (readonly [string, readonly string[]])[] {
  const grantable = group.actions.filter((action) => !action.directorOnly);
  const variants: [string, readonly string[]][] = [
    ['ca nhom', grantable.map((action) => action.code)],
    ['bam o nhom', grantable.filter((action) => !action.escalation).map((action) => action.code)],
    ['chi xem', grantable.filter((action) => action.kind === 'XEM').map((action) => action.code)],
  ];
  return variants.filter(([, codes]) => codes.length > 0);
}

describe('#395 — MOI nhom quyen cap duoc mo it nhat mot muc dung duoc', () => {
  let groups: readonly CatalogGroupView[];
  beforeAll(async () => {
    groups = await serverGroups();
  }, SOURCE_READ_TIMEOUT_MS);

  it('danh muc co nhom de do (bai do khong duoc xanh vi danh muc rong)', () => {
    expect(groups.filter((group) => group.grantable).length).toBeGreaterThanOrEqual(11);
  });

  it('moi nhom (kem cac quyen "kèm theo để dùng được") mo it nhat mot muc, theo ca ba cach cap', () => {
    const failures: string[] = [];
    for (const group of groups.filter((entry) => entry.grantable)) {
      for (const [variant, codes] of grantVariants(group)) {
        const held = new Set([...codes, ...(group.needs ?? [])]);
        const sections = visibleSections(managerHolding(held));
        if (sections.length === 0) failures.push(`${group.id} (${variant})`);
        // Muc hien ra la muc ma nguoi do giu DU bo ma chinh — dung dinh nghia, khoa lai o day.
        for (const section of sections) {
          for (const action of section.requiredActions ?? []) {
            expect(held.has(action), `${group.id}/${section.id}/${action}`).toBe(true);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('quyen "kèm theo" la phep XEM thuong cua NHOM KHAC — khong leo thang, khong chi Giam doc', () => {
    const byCode = new Map(
      groups.flatMap((group) => group.actions.map((action) => [action.code, { group, action }])),
    );
    for (const group of groups) {
      for (const need of group.needs ?? []) {
        const found = byCode.get(need);
        expect(found, `${group.id} → ${need}`).toBeDefined();
        expect(found?.group.id, `${group.id} → ${need}`).not.toBe(group.id);
        expect(found?.group.grantable, need).toBe(true);
        expect(found?.action.kind, need).toBe('XEM');
        expect(found?.action.escalation, need).toBe(false);
        expect(found?.action.directorOnly, need).toBe(false);
      }
    }
  });

  it('khong co quyen kem theo thi nhom khong mo muc — mot nhom KHONG can kem theo van tu dung', () => {
    // Doi chung: bo kem theo di, it nhat mot nhom mat het muc — tuc bai tren THAT SU dua vao no.
    const withoutNeeds = groups
      .filter((group) => group.grantable && (group.needs ?? []).length > 0)
      .filter((group) =>
        grantVariants(group).some(
          ([, codes]) => visibleSections(managerHolding(codes)).length === 0,
        ),
      )
      .map((group) => group.id);
    expect(withoutNeeds.length).toBeGreaterThan(0);
  });
});
