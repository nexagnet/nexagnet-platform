import { Controller, Get, Post, Body, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { loadFoundationEnv } from '../config/foundation-env.js';
import type { Response } from 'express';
import type { CurrentAccessResponse } from './account.types.js';
import { AuthService } from './auth.service.js';
import type { ChangePasswordInput, LoginInput } from './auth.schemas.js';
import type { AuthenticatedUser } from './auth.types.js';
import { generateCsrfToken, revokeCsrfToken } from './csrf.guard.js';
import { AllowDuringPasswordChange } from './password-change.decorator.js';
import { Public } from './public.decorator.js';
import type { AuthenticatedRequest } from './session.types.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('csrf')
  @Public()
  csrf(@Req() request: AuthenticatedRequest): { csrfToken: string | null } {
    return {
      csrfToken: loadFoundationEnv().AUTH_MODE === 'session' ? generateCsrfToken(request) : null,
    };
  }

  @Get('config')
  @Public()
  config() {
    return { mode: loadFoundationEnv().AUTH_MODE };
  }

  /** `user.mustChangePassword = true` → man hinh dua thang sang doi mat khau tam (`#395`). */
  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() body: LoginInput,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ user: AuthenticatedUser; csrfToken: string }> {
    const user = await this.auth.authenticate(body);
    await regenerateSession(request);
    request.session.user = { userId: user.id, credentialVersion: user.credentialVersion };
    const csrfToken = generateCsrfToken(request, true);
    await saveSession(request);
    return { user, csrfToken };
  }

  /**
   * Nguoi dung hien tai + tap quyen HIEU LUC (`#395`): quyen nen tang (`platform.*`) va moi quyen
   * cua moi mien da tinh ca vai khoi diem lan quyen rieng. May chu la noi DUY NHAT tinh quyen — man
   * hinh chi hien lai.
   */
  @Get('me')
  @AllowDuringPasswordChange()
  me(@Req() request: AuthenticatedRequest): CurrentAccessResponse {
    return this.auth.currentAccess(currentUser(request));
  }

  /** Tra `csrfToken` MOI (phien duoc tao lai) — man hinh phai thay token cu bang token nay. */
  @Post('credentials/change')
  @AllowDuringPasswordChange()
  async changePassword(
    @Body() body: ChangePasswordInput,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ user: AuthenticatedUser; csrfToken: string }> {
    const user = await this.auth.changePassword(currentUser(request), body);
    await regenerateSession(request);
    request.session.user = { userId: user.id, credentialVersion: user.credentialVersion };
    const csrfToken = generateCsrfToken(request, true);
    await saveSession(request);
    return { user, csrfToken };
  }

  @Post('logout')
  @AllowDuringPasswordChange()
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    const user = currentUser(request);
    await this.auth.recordLogout(user);
    revokeCsrfToken(request);
    await destroySession(request);
    response.clearCookie(loadFoundationEnv().SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  }
}

export function currentUser(request: AuthenticatedRequest): AuthenticatedUser {
  if (!request.authUser) throw new UnauthorizedException('Bạn cần đăng nhập');
  return request.authUser;
}

function regenerateSession(request: AuthenticatedRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(request: AuthenticatedRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function destroySession(request: AuthenticatedRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}
