import { vi } from 'vitest';
import type { AuditLog } from '@netviet/shared';
import type { AuditLogService } from '../../audit/audit-log.service.js';
import type { TelemetryService } from '../../observability/telemetry.service.js';
import type {
  AccessScopeNote,
  AccessSubject,
  PermissionCatalogView,
  PermissionDomain,
  PermissionGrant,
} from '../access/permission-domain.js';
import { PermissionDomainRegistry } from '../access/permission-domain.registry.js';
import { AuthService } from '../auth.service.js';
import type { UserRole } from '../auth.types.js';
import type { PasswordService } from '../password.service.js';
import { InMemoryUserRepository, type AuthUserRecord } from '../user.repository.js';

/**
 * DO GIA cho cac bai kiem quan tri tai khoan (`#395`).
 *
 * Mien gia `kho` KHONG phai mien van tai: nen tang phai lam dung voi BAT KY mien nao theo hop dong
 * `PermissionDomain`, nen bai kiem cua nen tang khong dua vao quy tac cua mot mien that. Mien that
 * duoc kiem qua HTTP (`account-access.http.spec.ts`) va o bai cua chinh no.
 */

// Chuoi mau. Dat ten KHONG phai `password` — bo quet bi mat o pre-commit bat khoa kieu mat khau gan
// thang mot chuoi tu 12 ky tu (xem `auth.service.spec.ts`).
export const VALID_PW = 'correct-password';
export const OTHER_PW = 'another-password-1';

export function userRecord(
  id: string,
  username: string,
  role: UserRole,
  patch: Partial<AuthUserRecord> = {},
): AuthUserRecord {
  return {
    id,
    username,
    name: `Nguoi ${username}`,
    email: null,
    phone: null,
    passwordHash: `hash:${VALID_PW}`,
    role,
    disabledAt: null,
    credentialVersion: 1,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    lastLoginAt: null,
    passwordChangedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...patch,
  };
}

/* ------------------------------------------------------------------ *
 * Mien gia `kho`
 * ------------------------------------------------------------------ */

export const KHO_GROUPS = {
  xem: 'kho.phieu.read',
  sua: 'kho.phieu.manage',
  duyet: 'kho.tien.decide',
  nhay: 'kho.lich_su.read',
  giamDoc: 'kho.ky.reopen',
  rieng: 'kho.self.phieu.read',
  /** Chi den tu LIEN KET (khong vai nao co san) — nhu "xem xe minh gop von" cua van tai. */
  gopVon: 'kho.gop_von.read',
} as const;

const OPERATIONS = [KHO_GROUPS.xem, KHO_GROUPS.sua, KHO_GROUPS.duyet, KHO_GROUPS.nhay];
const PRESETS: Readonly<Record<UserRole, readonly string[]>> = {
  ADMIN: [...OPERATIONS, KHO_GROUPS.giamDoc],
  ACCOUNTING: [KHO_GROUPS.xem, KHO_GROUPS.duyet],
  MANAGER: [],
  SALE: [KHO_GROUPS.rieng],
};
const GRANTABLE = new Set<string>(OPERATIONS);

const CATALOG: PermissionCatalogView = {
  groups: [
    {
      id: 'kho-phieu',
      label: 'Phiếu kho',
      summary: 'Phiếu nhập, xuất.',
      grantable: true,
      actions: [
        {
          code: KHO_GROUPS.xem,
          label: 'Xem phiếu kho',
          kind: 'XEM',
          directorOnly: false,
          escalation: false,
          sod: null,
        },
        {
          code: KHO_GROUPS.sua,
          label: 'Sửa phiếu kho',
          kind: 'THAO_TAC',
          directorOnly: false,
          escalation: false,
          sod: null,
        },
      ],
    },
    {
      id: 'kho-tien',
      label: 'Tiền kho',
      summary: 'Duyệt tiền và lịch sử.',
      grantable: true,
      actions: [
        {
          code: KHO_GROUPS.duyet,
          label: 'Duyệt tiền kho',
          kind: 'DUYET',
          directorOnly: false,
          escalation: false,
          sod: 'DECISION',
        },
        {
          code: KHO_GROUPS.nhay,
          label: 'Xem lịch sử nhạy cảm',
          kind: 'NHAY_CAM',
          directorOnly: false,
          escalation: true,
          sod: null,
        },
        {
          code: KHO_GROUPS.giamDoc,
          label: 'Mở lại kỳ kho',
          kind: 'NHAY_CAM',
          directorOnly: true,
          escalation: false,
          sod: null,
        },
      ],
    },
    {
      id: 'kho-rieng',
      label: 'Việc của chính thủ kho',
      summary: 'Có khi tài khoản được nối với một hồ sơ.',
      grantable: false,
      actions: [
        {
          code: KHO_GROUPS.rieng,
          label: 'Xem phiếu của mình',
          kind: 'XEM',
          directorOnly: false,
          escalation: false,
          sod: null,
        },
      ],
    },
    {
      id: 'kho-gop-von',
      label: 'Kho mình góp vốn',
      summary: 'Có khi tài khoản được nối với một hồ sơ góp vốn.',
      grantable: false,
      actions: [
        {
          code: KHO_GROUPS.gopVon,
          label: 'Xem kho mình góp vốn',
          kind: 'XEM',
          directorOnly: false,
          escalation: false,
          sod: null,
        },
      ],
    },
  ],
  presets: [
    { role: 'ADMIN', label: 'Giám đốc', summary: 'Toàn quyền.' },
    { role: 'ACCOUNTING', label: 'Kế toán', summary: 'Sổ sách.' },
    { role: 'MANAGER', label: 'Điều hành', summary: 'Bắt đầu trống.' },
    { role: 'SALE', label: 'Thủ kho', summary: 'Việc của chính mình.' },
  ],
};

function effective(subject: AccessSubject): readonly string[] {
  const preset = new Set(PRESETS[subject.role]);
  if (subject.role === 'ADMIN' || subject.role === 'SALE') return [...preset];
  for (const grant of subject.permissionGrants ?? []) {
    if (grant.effect === 'DENY') preset.delete(grant.permission);
    if (grant.effect === 'ALLOW' && GRANTABLE.has(grant.permission)) preset.add(grant.permission);
  }
  return [...preset];
}

export interface FakeDomainOptions {
  /** Tai khoan dang noi "ho so" — doi vai khoi `SALE` bi tu choi. */
  readonly linkedUserIds?: ReadonlySet<string>;
  /** Co mo ta pham vi hay khong (mien chua hien thuc `describeScopes`). */
  readonly describesScopes?: boolean;
}

export function fakeKhoDomain(options: FakeDomainOptions = {}): PermissionDomain {
  const linked = options.linkedUserIds ?? new Set<string>();
  const domain: PermissionDomain = {
    id: 'kho',
    catalog: () => CATALOG,
    effective,
    validate: ({ role, grants, confirmEscalation }) => {
      if (grants.length === 0) return [];
      if (role === 'ADMIN' || role === 'SALE') return [{ code: 'ROLE_NOT_CUSTOMISABLE' }];
      const violations = grants
        .filter((grant) => !(grant.permission in PRESET_LOOKUP) && !GRANTABLE.has(grant.permission))
        .map((grant) => ({ code: 'UNKNOWN_PERMISSION', permission: grant.permission }));
      const escalated = grants.filter(
        (grant) => grant.effect === 'ALLOW' && grant.permission === KHO_GROUPS.nhay,
      );
      if (escalated.length > 0 && !confirmEscalation) {
        violations.push({ code: 'ESCALATION_CONFIRMATION_REQUIRED', permission: KHO_GROUPS.nhay });
      }
      return violations;
    },
    escalated: (role, grants) =>
      role === 'ADMIN' || role === 'SALE'
        ? []
        : grants
            .filter((grant) => grant.effect === 'ALLOW' && grant.permission === KHO_GROUPS.nhay)
            .map((grant) => grant.permission),
    checkAccessChange: async ({ userId, toRole }) =>
      linked.has(userId) && toRole !== 'SALE' ? [{ code: 'ACCOUNT_LINKED_TO_DRIVER' }] : [],
    reservedUsernames: () => ['demo-seed'],
  };
  if (options.describesScopes === false) return domain;
  // Cung quy uoc voi mien van tai: `id` cua pham vi = `id` cua nhom lien ket no mo; chi mo ta lien
  // ket DANG TON TAI — "chua noi ho so" la cau cua nen tang.
  return {
    ...domain,
    describeScopes: async (userId): Promise<readonly AccessScopeNote[]> =>
      linked.has(userId)
        ? [
            {
              id: 'kho-rieng',
              label: 'Hồ sơ thủ kho',
              active: true,
              sentence: 'Nối với hồ sơ thủ kho — làm được việc của chính mình',
              subject: { id: 'ho-so-1', name: 'Thủ kho A' },
            },
          ]
        : [],
  };
}

const PRESET_LOOKUP: Readonly<Record<string, true>> = Object.fromEntries(
  Object.values(PRESETS)
    .flat()
    .map((code) => [code, true] as const),
);

/* ------------------------------------------------------------------ *
 * Dich vu that tren kho bo nho + do gia
 * ------------------------------------------------------------------ */

export interface AccountHarness {
  readonly repository: InMemoryUserRepository;
  readonly service: AuthService;
  readonly audit: AuditLogService & {
    readonly append: ReturnType<typeof vi.fn>;
    readonly list: ReturnType<typeof vi.fn>;
  };
  readonly passwords: PasswordService;
  readonly telemetry: TelemetryService & {
    readonly step: ReturnType<typeof vi.fn>;
    readonly decision: ReturnType<typeof vi.fn>;
    readonly stateChange: ReturnType<typeof vi.fn>;
  };
  readonly registry: PermissionDomainRegistry;
}

export function accountHarness(
  seed: readonly AuthUserRecord[],
  options: FakeDomainOptions & { readonly auditRows?: readonly AuditLog[] } = {},
): AccountHarness {
  const repository = new InMemoryUserRepository(seed);
  const audit = {
    append: vi.fn(async () => undefined),
    list: vi.fn(async () => options.auditRows ?? []),
  } as unknown as AccountHarness['audit'];
  const passwords = {
    hash: vi.fn(async (value: string) => `hash:${value}`),
    verify: vi.fn(async (hash: string, value: string) => hash === `hash:${value}`),
  } as unknown as PasswordService;
  const telemetry = {
    step: vi.fn(async (_name: string, run: () => Promise<unknown>) => run()),
    decision: vi.fn(),
    stateChange: vi.fn(),
  } as unknown as AccountHarness['telemetry'];
  const registry = new PermissionDomainRegistry();
  registry.register(fakeKhoDomain(options));
  const service = new AuthService(repository, passwords, audit, registry, telemetry);
  return { repository, service, audit, passwords, telemetry, registry };
}

export function grant(
  permission: string,
  effect: PermissionGrant['effect'] = 'ALLOW',
): PermissionGrant {
  return { permission, effect };
}

/** Ma ly do trong than loi cua mot ngoai le Nest (hoac `undefined`). */
export async function reasonOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    const response = (error as { getResponse?: () => unknown }).getResponse?.();
    return (response as { reason?: string } | undefined)?.reason;
  }
  throw new Error('Mong doi mot loi, nhung loi goi thanh cong');
}

/** Than loi day du cua mot ngoai le Nest. */
export async function errorBodyOf(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise;
  } catch (error) {
    return ((error as { getResponse: () => unknown }).getResponse() ?? {}) as Record<
      string,
      unknown
    >;
  }
  throw new Error('Mong doi mot loi, nhung loi goi thanh cong');
}
