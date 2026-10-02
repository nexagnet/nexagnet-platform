import { SetMetadata } from '@nestjs/common';
import type { UserRole } from './auth.types.js';

export const ROLES_KEY = 'netviet.auth.roles';

export const Roles = (...roles: readonly UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/**
 * DAU "route nay do CONG CUA MIEN quyet dinh" (`#395`) — khoa cua NEN TANG, khong phai cua mien.
 *
 * GIA TRI cua khoa la chinh LOP GUARD cua mien (vd `TransportActionGuard`), khong phai `true`.
 * `RolesGuard` chi nhuong quyen quyet dinh cho mien khi guard do THAT SU nam trong chuoi guard cua
 * route (`@UseGuards` tren handler hoac controller). Mot route mang dau ma quen gan guard thi
 * `RolesGuard` van kiem `@Roles` nhu cu — FAIL-CLOSED, khong bao gio mat ca hai cong.
 *
 * Khoa nay nam o `auth/` de chieu phu thuoc di dung: mien import nen tang (`transport` → `auth`),
 * khong bao gio nguoc lai. Nen tang khong biet ten mien nao, chi biet "co mot guard mien nhan viec".
 */
export const DOMAIN_ACTION_GATE_KEY = 'netviet.domain.action.gate';
