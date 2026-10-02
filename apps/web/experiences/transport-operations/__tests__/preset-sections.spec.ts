import { CAPABILITY_IDS, type CapabilityId } from '@netviet/tenant';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AuthRole } from '../../../lib/auth';
import {
  TRANSPORT_SECTIONS,
  visibleSections,
  type NavigationInput,
  type TransportSection,
  type TransportSectionId,
} from '../navigation';
import {
  canPerform,
  hasOperationsScope,
  hasPlatformPermission,
  PLATFORM_ACCOUNTS_MANAGE,
  STAKEHOLDER_SCOPE_ACTIONS,
  type TransportAction,
} from '../transport-actions';

/**
 * `#395` — DOI CONG QUYEN CUA MUC TU MOT MA THANH MOT BO MA KHONG DUOC DOI DIEU BON VAI KHOI DIEM
 * NHIN THAY.
 *
 * Cong moi ("doc duoc DU du lieu chinh") sua man trang / cau "chua co" sai cho QUYEN RIENG cua Giam
 * doc. Nhung Giam doc, Ke toan, Lai xe va Dieu hanh CHUA duoc cap gi phai thay DUNG danh muc nhu
 * truoc — mot muc bien mat khoi Ke toan la mot lan tuoc quyen lot vao duoi danh nghia sua loi.
 *
 * Bai nay KHONG so sanh voi mot danh sach muc go tay: no dung lai LUAT CU (`sectionPermitted` truoc
 * ban sua — mot ma cho moi muc, bang `PRE_FIX_GATE`) va LUAT MOI (`visibleSections`) tren CUNG tap
 * quyen cua tung vai — ca ban guong theo vai cua web lan tap quyen may chu tra trong `/auth/me` (nap
 * tu chinh ma nguon API) — va tren nhieu goi nang luc. Lech mot muc la do.
 */

/**
 * CONG QUYEN TRUOC BAN SUA — chep tay tu `navigation.ts` o `8cdaaca4` (HEAD cua nhanh `#395` truoc
 * ban sua nay). 25 muc dau trung tung ma voi `origin/main` `ee875183`; ba muc cuoi (`my-vehicles`,
 * `admin-accounts`, `admin-places`) la muc cua chinh `#395`. KHONG sinh tu tep dang kiem.
 */
type PreFixGate =
  { readonly action: TransportAction } | { readonly platform: typeof PLATFORM_ACCOUNTS_MANAGE };

const PRE_FIX_GATE: Readonly<Record<TransportSectionId, PreFixGate>> = {
  overview: { action: 'transport.trip.read' },
  movement: { action: 'transport.run.read' },
  trips: { action: 'transport.trip.read' },
  'control-tower': { action: 'transport.control_tower.read' },
  dispatch: { action: 'transport.dispatch.suggest.read' },
  fleet: { action: 'transport.vehicle.read' },
  'order-completion': { action: 'transport.commercial_acceptance.read' },
  settlement: { action: 'transport.costing.period.read' },
  'ar-ap': { action: 'transport.costing.period.read' },
  fuel: { action: 'transport.fuel.entry.read' },
  toll: { action: 'transport.toll.account.read' },
  'driver-fund': { action: 'transport.costing.driver_fund.read' },
  'expense-claims': { action: 'transport.expense.claim.read' },
  payroll: { action: 'transport.costing.period.read' },
  'driver-settlement': { action: 'transport.driver_settlement.read' },
  finance: { action: 'transport.settlement.report.read' },
  margin: { action: 'transport.trip.read' },
  executive: { action: 'transport.control_tower.read' },
  'fleet-dashboard': { action: 'transport.analytics.read' },
  routes: { action: 'transport.analytics.read' },
  journey: { action: 'transport.run.read' },
  exports: { action: 'transport.trip.read' },
  maintenance: { action: 'transport.vehicle.read' },
  'asset-ownership': { action: 'transport.asset_ownership.read' },
  'my-vehicles': { action: 'transport.stakeholder.self.vehicle.read' },
  'admin-accounts': { platform: PLATFORM_ACCOUNTS_MANAGE },
  'admin-places': { action: 'transport.geofence.manage' },
};

/** `sectionPermitted` TRUOC ban sua — dung thu tu nhanh cua ban cu. */
function preFixPermitted(section: TransportSection, input: NavigationInput): boolean {
  const gate = PRE_FIX_GATE[section.id as TransportSectionId];
  if ('platform' in gate) return hasPlatformPermission(input, gate.platform);
  if (STAKEHOLDER_SCOPE_ACTIONS.includes(gate.action)) {
    return canPerform(input, gate.action) && hasOperationsScope(input);
  }
  return canPerform(input, gate.action);
}

/**
 * `visibleSections` TRUOC ban sua. Nang luc va duong thay the KHONG doi trong ban sua nay (bai
 * `#341` cua `navigation.spec.ts` ghim ca hai), nen doc thang tu danh muc hien tai.
 */
function preFixVisible(input: NavigationInput): readonly string[] {
  const enabled = (section: TransportSection): boolean =>
    section.requiredCapabilities.every((capability) => input.capabilities.includes(capability)) &&
    !section.requiredCapabilities.some((capability) =>
      input.blockedCapabilityKeys?.includes(capability),
    ) &&
    preFixPermitted(section, input);
  const sections: readonly TransportSection[] = TRANSPORT_SECTIONS;
  return sections
    .filter((section) => enabled(section))
    .filter((section) => {
      const successor = sections.find((entry) => entry.id === section.supersededBy);
      return successor === undefined || !enabled(successor);
    })
    .map((section) => section.id);
}

const nowVisible = (input: NavigationInput): readonly string[] =>
  visibleSections(input).map((section) => section.id);

/* ------------------------------------------------------------------ *
 * Tap quyen cua bon vai — hai nguon
 * ------------------------------------------------------------------ */

const HERE = dirname(fileURLToPath(import.meta.url));
const API_SRC = resolve(HERE, '../../../../api/src');

type ServerPresetOf = (role: AuthRole) => ReadonlySet<string>;

/**
 * Tap quyen `/auth/me` tra cho mot vai CHUA co quyen rieng nao — `effectivePermissions` phia API:
 * quyen nen tang cua vai + tap hieu luc van tai (`effectiveTransportActionList`, khong quyen rieng).
 */
async function loadServerPreset(): Promise<ServerPresetOf> {
  const load = (file: string) =>
    import(/* @vite-ignore */ pathToFileURL(resolve(API_SRC, file)).href) as Promise<
      Record<string, unknown>
    >;
  const rules = await load('transport/permissions/transport-permission-rules.ts');
  const platform = await load('auth/access/platform-permissions.ts');
  const transportOf = rules.effectiveTransportActionList;
  const platformOf = platform.platformPermissionsFor;
  if (typeof transportOf !== 'function' || typeof platformOf !== 'function') {
    throw new Error('Khong tim thay tap quyen vai khoi diem trong ma nguon API');
  }
  return (role) =>
    new Set<string>([
      ...(platformOf(role) as readonly string[]),
      ...(transportOf({ role, permissionGrants: [] }) as readonly string[]),
    ]);
}

const ROLES: readonly AuthRole[] = ['ADMIN', 'ACCOUNTING', 'SALE', 'MANAGER'];
const ALL: readonly CapabilityId[] = [...CAPABILITY_IDS];

/** Goi nang luc: du, rong, va bot TUNG nang luc mot — moi cong nang luc deu duoc cham toi. */
const CAPABILITY_SETS: readonly (readonly [string, readonly CapabilityId[]])[] = [
  ['du nang luc', ALL],
  ['khong nang luc nao', []],
  ...ALL.map(
    (dropped) => [`bot ${dropped}`, ALL.filter((capability) => capability !== dropped)] as const,
  ),
];

describe('#395 — bon vai khoi diem thay DUNG cac muc nhu truoc ban sua cong quyen', () => {
  let serverPreset: ServerPresetOf;
  // Nap ma nguon API luc chay ca bo web (nhieu worker) co the vuot han mac dinh 10 giay cua hook.
  beforeAll(async () => {
    serverPreset = await loadServerPreset();
  }, 60_000);

  /** Moi cach mot vai khoi diem xuat hien truoc man hinh. */
  const inputsOf = (role: AuthRole | null): readonly (readonly [string, NavigationInput])[] =>
    CAPABILITY_SETS.flatMap(([label, capabilities]) => {
      const base = { capabilities, role };
      const variants: [string, NavigationInput][] = [
        [`${label} · ban guong theo vai`, base],
        [`${label} · ETC bi chan`, { ...base, blockedCapabilityKeys: ['transport-toll'] }],
      ];
      if (role !== null) {
        const permissions = serverPreset(role);
        variants.push([`${label} · /auth/me`, { ...base, permissions }]);
        // Ben gop von (pham vi tu lien ket, khong tu vai) — cung phai giu nguyen.
        variants.push([
          `${label} · /auth/me + gop von`,
          { ...base, permissions, stakeholderLinked: true },
        ]);
      }
      return variants;
    });

  it.each([...ROLES, null])('%s: tap muc tren thanh ben KHONG doi', (role) => {
    const drift: string[] = [];
    for (const [label, input] of inputsOf(role)) {
      const before = preFixVisible(input);
      const after = nowVisible(input);
      if (before.join(',') !== after.join(',')) {
        drift.push(`${label}: truoc [${before.join(', ')}] → nay [${after.join(', ')}]`);
      }
    }
    expect(drift).toEqual([]);
  });

  it('bai do khong xanh vi khong ai thay gi: Giam doc va Ke toan co muc, Lai xe va Dieu hanh trong', () => {
    const full = (role: AuthRole): NavigationInput => ({
      capabilities: ALL,
      role,
      permissions: serverPreset(role),
    });
    expect(nowVisible(full('ADMIN')).length).toBeGreaterThanOrEqual(25);
    expect(nowVisible(full('ACCOUNTING')).length).toBeGreaterThanOrEqual(20);
    expect(nowVisible(full('ADMIN'))).toContain('admin-places');
    expect(nowVisible(full('ACCOUNTING'))).not.toContain('admin-places');
    expect(nowVisible(full('SALE'))).toEqual([]);
    expect(nowVisible(full('MANAGER'))).toEqual([]);
  });

  it('ban cong truoc ban sua phu DU moi muc hien co', () => {
    expect(Object.keys(PRE_FIX_GATE).sort()).toEqual(
      TRANSPORT_SECTIONS.map((section) => section.id).sort(),
    );
  });
});
