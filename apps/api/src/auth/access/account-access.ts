import type { UserRole } from '../auth.types.js';
import type {
  AccessSubject,
  AccessViolation,
  PermissionDomain,
  PermissionGrant,
} from './permission-domain.js';
import type { DomainScopes } from './access-breakdown.js';
import type { PermissionDomainRegistry } from './permission-domain.registry.js';
import {
  PLATFORM_PERMISSION_PREFIX,
  platformPermissionCatalog,
  platformPermissionsFor,
} from './platform-permissions.js';

/**
 * QUYEN CUA MOT TAI KHOAN tren MOI mien (`#395`) — noi nen tang hoi cac mien da dang ky.
 *
 * Nen tang KHONG biet ma quyen nghiep vu nao nghia la gi: no chia quyen rieng theo tien to mien
 * (`registry.owning`), hoi tung mien, roi gom cau tra loi. Cung cac ham nay phuc vu `/auth/me`,
 * man hinh quyen va lan ghi quyen — mot cau tra loi, mot cho.
 */

/** Ma vi pham CUA NEN TANG (khong thuoc mien nao). */
export const PLATFORM_ACCESS_VIOLATIONS = [
  /** Ma quyen khong mien nao nhan. */
  'UNKNOWN_PERMISSION',
  /** `platform.*` khong cap duoc bang quyen rieng — muon quan tri tai khoan thi doi vai Giam doc. */
  'PLATFORM_PERMISSION_NOT_GRANTABLE',
  /** Cung mot ma quyen xuat hien hai lan trong mot bo. */
  'GRANT_DUPLICATED',
  /** Cap vai Giam doc (toan quyen) ma chua xac nhan leo thang. */
  'ESCALATION_CONFIRMATION_REQUIRED',
] as const;

export const ESCALATION_VIOLATION = 'ESCALATION_CONFIRMATION_REQUIRED';

/** Quyen HIEU LUC: quyen nen tang cua vai + tap hieu luc cua tung mien. */
export function effectivePermissions(
  registry: PermissionDomainRegistry,
  subject: AccessSubject,
): readonly string[] {
  return [
    ...platformPermissionsFor(subject.role),
    ...registry.all().flatMap((domain) => domain.effective(subject)),
  ];
}

interface ValidateAccessInput {
  readonly role: UserRole;
  readonly grants: readonly PermissionGrant[];
  readonly confirmEscalation: boolean;
  /** Lan ghi nay DUA tai khoan len vai Giam doc (tao moi ADMIN, hoac doi tu vai khac sang). */
  readonly promotesToAdmin: boolean;
}

/**
 * Ly do tu choi mot bo (vai, quyen rieng); mang rong = ghi duoc.
 *
 * Tang nen tang tu tra loi ba cau hoi khong mien nao tra loi duoc: ma nay co mien nao nhan khong,
 * co phai quyen nen tang khong, co bi lap khong. Phan con lai (cap duoc khong, tach nhiem, leo
 * thang) la cua MIEN — moi mien chi nhan cac dong mang tien to cua no.
 */
export function validateAccess(
  registry: PermissionDomainRegistry,
  input: ValidateAccessInput,
): readonly AccessViolation[] {
  const violations: AccessViolation[] = [];
  const seen = new Set<string>();
  const byDomain = new Map<PermissionDomain, PermissionGrant[]>();
  for (const grant of input.grants) {
    if (seen.has(grant.permission)) {
      violations.push({ code: 'GRANT_DUPLICATED', permission: grant.permission });
      continue;
    }
    seen.add(grant.permission);
    if (grant.permission.startsWith(PLATFORM_PERMISSION_PREFIX)) {
      violations.push({ code: 'PLATFORM_PERMISSION_NOT_GRANTABLE', permission: grant.permission });
      continue;
    }
    const domain = registry.owning(grant.permission);
    if (!domain) {
      violations.push({ code: 'UNKNOWN_PERMISSION', permission: grant.permission });
      continue;
    }
    byDomain.set(domain, [...(byDomain.get(domain) ?? []), grant]);
  }
  for (const domain of registry.all()) {
    violations.push(
      ...domain.validate({
        role: input.role,
        grants: byDomain.get(domain) ?? [],
        confirmEscalation: input.confirmEscalation,
      }),
    );
  }
  if (input.promotesToAdmin && !input.confirmEscalation) {
    violations.push({ code: ESCALATION_VIOLATION, detail: { role: 'ADMIN' } });
  }
  return violations;
}

/** Cac ALLOW la LEO THANG tren moi mien — ten tung ma cho dong `auth.user.access.escalate`. */
export function escalatedPermissions(
  registry: PermissionDomainRegistry,
  role: UserRole,
  grants: readonly PermissionGrant[],
): readonly string[] {
  return registry.all().flatMap((domain) =>
    domain.escalated(
      role,
      grants.filter((grant) => registry.owning(grant.permission) === domain),
    ),
  );
}

/**
 * Doi vai / quyen co pha mot LIEN KET cua mien nao khong (vd tai khoan dang noi ho so lai xe).
 *
 * Hoi mien CA KHI vai khong doi: mien quyet dinh mot trang thai lien ket co hop le voi vai dich hay
 * khong (vd mot tai khoan van phong con noi ho so lai xe do du lieu cu — sua quyen rieng cua no
 * khong duoc hop thuc hoa trang thai sai do). Nen tang khong doan thay mien.
 */
export async function accessChangeViolations(
  registry: PermissionDomainRegistry,
  input: { readonly userId: string; readonly fromRole: UserRole; readonly toRole: UserRole },
): Promise<readonly AccessViolation[]> {
  const results = await Promise.all(
    registry.all().map((domain) => domain.checkAccessChange?.(input) ?? Promise.resolve([])),
  );
  return results.flat();
}

/**
 * Cac pham vi den tu du lieu (lien ket) cua mot tai khoan, THEO MIEN — de mot pham vi chi mo nhom
 * cua chinh mien mo ta no (`access-breakdown.ts`).
 */
export async function describeAccountScopes(
  registry: PermissionDomainRegistry,
  userId: string,
): Promise<readonly DomainScopes[]> {
  return Promise.all(
    registry.all().map(async (domain) => ({
      domain: domain.id,
      notes: (await domain.describeScopes?.(userId)) ?? [],
    })),
  );
}

/** Ten dang nhap cac mien danh cho danh tinh he thong cua chung. */
export function domainReservedUsernames(registry: PermissionDomainRegistry): readonly string[] {
  return registry.all().flatMap((domain) => domain.reservedUsernames?.() ?? []);
}

/** Danh muc cho man hinh: moi mien + quyen nen tang. */
export function permissionCatalog(registry: PermissionDomainRegistry): {
  readonly domains: readonly ({ readonly id: string } & ReturnType<PermissionDomain['catalog']>)[];
  readonly platform: ReturnType<typeof platformPermissionCatalog>;
} {
  return {
    domains: registry.all().map((domain) => ({ id: domain.id, ...domain.catalog() })),
    platform: platformPermissionCatalog(),
  };
}
