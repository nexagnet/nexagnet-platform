import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { loadFoundationEnv } from '../config/foundation-env.js';
import type { AuthenticatedRequest } from './session.types.js';
import type { UserRole } from './auth.types.js';
import { DOMAIN_ACTION_GATE_KEY, ROLES_KEY } from './roles.decorator.js';
import { isInternalServiceRequest } from './internal-service.guard.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (loadFoundationEnv().AUTH_MODE !== 'session') return true;
    const required = this.reflector.getAllAndOverride<readonly UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // DA qua xac thuc dich vu-dich vu (`InternalServiceGuard` chay TRUOC guard nay). Mot tien
    // trinh khong co phien, khong co vai tro va khong co trinh duyet — doi no ba thu do nghia la
    // duong noi bo khong bao gio dung duoc o che do `session`.
    if (isInternalServiceRequest(request)) return true;
    if (this.defersToDomainGate(context)) return true;
    const user = request.authUser;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }
    return true;
  }

  /**
   * NHUONG cho cong cua mien (`#395`, dong khoang cach `PG-02`).
   *
   * Truoc #395 mot route van tai qua HAI cong noi tiep: `@Roles` (vai phang) roi
   * `TransportActionGuard` (hanh dong). Voi quyen rieng tung tai khoan, `@Roles` thanh cai tran sai:
   * mot tai khoan `MANAGER` duoc cap `transport.vehicle.manage` van bi chan o day vi khong route nao
   * ghi `MANAGER`. Nen khi route mang dau `DOMAIN_ACTION_GATE_KEY`, cong CUA MIEN la cong duy nhat
   * quyet dinh — bang vai khoi diem cua no da mang dung chinh sach ma `@Roles` ghi (bai
   * `transport-behaviour-preservation.spec.ts` chung minh tren tung route, tung vai).
   *
   * CHI nhuong khi guard mien THAT SU nam trong chuoi guard cua route. Dau co ma guard khong co
   * (quen `@UseGuards`, controller o module khac) thi KHONG nhuong: `@Roles` kiem nhu cu. Nhuong chi
   * dua tren dau se lam mot route nhu vay mat CA HAI cong.
   */
  private defersToDomainGate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const gate = this.reflector.getAllAndOverride<unknown>(DOMAIN_ACTION_GATE_KEY, targets);
    if (typeof gate !== 'function') return false;
    const guards = this.reflector.getAllAndMerge<unknown[]>(GUARDS_METADATA, targets);
    return Array.isArray(guards) && guards.includes(gate);
  }
}
