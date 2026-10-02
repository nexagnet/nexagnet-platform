import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { accountError } from './account-errors.js';
import { AuthService } from './auth.service.js';
import { ALLOW_DURING_PASSWORD_CHANGE_KEY } from './password-change.decorator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import type { AuthenticatedRequest } from './session.types.js';
import { isInternalServiceRequest } from './internal-service.guard.js';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (loadFoundationEnv().AUTH_MODE !== 'session') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // DA qua xac thuc dich vu-dich vu (`InternalServiceGuard` chay TRUOC guard nay). Mot tien
    // trinh khong co phien, khong co vai tro va khong co trinh duyet — doi no ba thu do nghia la
    // duong noi bo khong bao gio dung duoc o che do `session`.
    if (isInternalServiceRequest(request)) return true;
    const identity = request.session?.user;
    if (!identity) throw new UnauthorizedException('Bạn cần đăng nhập');
    const user = await this.auth.validateSession(identity);
    if (!user) {
      await destroySession(request);
      throw new UnauthorizedException('Phiên đăng nhập đã hết hiệu lực');
    }
    /*
     * CONG MAT KHAU TAM (`#395`). Day la cho DUY NHAT dat `request.authUser`, nen moi duong doc phien
     * — REST, SSE `/events`, tai tep `/files` — deu qua cong nay: mot tai khoan chua doi mat khau tam
     * khong lam duoc gi ngoai ba route mang `@AllowDuringPasswordChange()`.
     */
    if (user.mustChangePassword === true && !this.allowsDuringPasswordChange(context)) {
      throw accountError('PASSWORD_CHANGE_REQUIRED');
    }
    request.authUser = user;
    return true;
  }

  private allowsDuringPasswordChange(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(ALLOW_DURING_PASSWORD_CHANGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}

async function destroySession(request: AuthenticatedRequest): Promise<void> {
  if (typeof request.session?.destroy !== 'function') return;
  await new Promise<void>((resolve) => request.session.destroy(() => resolve()));
}
