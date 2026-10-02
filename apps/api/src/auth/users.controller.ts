import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { accountInputInvalid } from './account-errors.js';
import { AuthService } from './auth.service.js';
import type {
  AssignRoleInput,
  CreateUserInput,
  DisableUserInput,
  EnableUserInput,
  HistoryQuery,
  ListUsersQuery,
  ResetPasswordInput,
  SetAccessInput,
  SuggestUsernameInput,
  UpdateProfileInput,
} from './auth.schemas.js';
import { currentUser } from './auth.controller.js';
import { Roles } from './roles.decorator.js';
import type { AuthenticatedRequest } from './session.types.js';

const idSchema = z.string().trim().min(1).max(128);

/**
 * QUAN TRI TAI KHOAN & PHAN QUYEN (`#395`) — chi Giam doc (`ADMIN`, quyen nen tang
 * `platform.accounts.manage`, khong cap duoc bang quyen rieng).
 *
 * MOI route nam duoi `/settings/users` — tien to ma edge Caddy da cong (`/settings/users*`); mot
 * tien to moi se roi xuong Next.js va tra 404 tren ban deploy (`caddy-route-contract.test.mjs`).
 *
 * Route TINH (`permission-catalog`, `suggest-username`) khai TRUOC moi route `:id`.
 */
@Controller('settings/users')
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  list(@Query() query: ListUsersQuery) {
    return this.auth.listUsers(query);
  }

  @Get('permission-catalog')
  permissionCatalog() {
    return this.auth.permissionCatalog();
  }

  @Post('suggest-username')
  @HttpCode(HttpStatus.OK)
  suggestUsername(@Body() body: SuggestUsernameInput) {
    return this.auth.suggestUsername(body);
  }

  /** Tra tai khoan (cac truong o MUC NGOAI nhu cu) + `credential` (mat khau tam, CHI mot lan nay). */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@Body() body: CreateUserInput, @Req() request: AuthenticatedRequest) {
    return this.auth.createUser(currentUser(request), body);
  }

  @Patch(':id')
  updateProfile(
    @Param('id') rawId: string,
    @Body() body: UpdateProfileInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.auth.updateProfile(currentUser(request), parseId(rawId), body);
  }

  @Get(':id/access')
  access(@Param('id') rawId: string) {
    return this.auth.accessBreakdown(parseId(rawId));
  }

  /** `dryRun: true` → bang "lam duoc gi" cua bo quyen de xuat; khong ghi, khong kiem toan. */
  @Put(':id/access')
  setAccess(
    @Param('id') rawId: string,
    @Body() body: SetAccessInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.auth.setAccess(currentUser(request), parseId(rawId), body);
  }

  /** Duong CU: doi vai va XOA moi quyen rieng trong cung mot giao dich. */
  @Patch(':id/role')
  assignRole(
    @Param('id') rawId: string,
    @Body() body: AssignRoleInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.auth.assignRole(currentUser(request), parseId(rawId), body);
  }

  /** Khoa — `200` nhu `enable`: day la mot lan doi trang thai, khong tao ra tai nguyen moi. */
  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  disable(
    @Param('id') rawId: string,
    @Body() body: DisableUserInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.auth.disableUser(currentUser(request), parseId(rawId), body);
  }

  /** Mo khoa — khong doi mat khau. Tai khoan cu (`legacy_*`) can mo khoa ROI cap mat khau tam. */
  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  enable(
    @Param('id') rawId: string,
    @Body() body: EnableUserInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.auth.enableUser(currentUser(request), parseId(rawId), body);
  }

  @Post(':id/credentials/reset')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(
    @Param('id') rawId: string,
    @Body() body: ResetPasswordInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.auth.resetPassword(currentUser(request), parseId(rawId), body ?? {});
  }

  @Get(':id/history')
  history(@Param('id') rawId: string, @Query() query: HistoryQuery) {
    return this.auth.history(parseId(rawId), query);
  }
}

function parseId(value: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw accountInputInvalid('ID người dùng không hợp lệ');
  return parsed.data;
}
