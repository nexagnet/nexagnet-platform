import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import { isInternalServiceRequest } from '../auth/internal-service.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/session.types.js';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { viBangErrorToHttp } from './vi-bang.errors.js';
import {
  createCaseSchema,
  createContractSchema,
  createCustomerSchema,
  listCasesQuerySchema,
  listContractsQuerySchema,
  listCustomersQuerySchema,
  transitionCaseSchema,
} from './vi-bang.schemas.js';
import { ViBangService } from './vi-bang.service.js';

/**
 * Danh tinh nguoi ky dau vet: tien trinh noi bo, username da xac thuc, hoac ten co dinh khi khong
 * bat xac thuc. KHONG bao gio doc header — cung nguyen tac voi `transportActorOf`.
 */
function viBangActorOf(request: AuthenticatedRequest): string {
  if (isInternalServiceRequest(request)) return 'internal-service';
  const verified = request.authUser?.username;
  if (verified) return verified;
  if (loadFoundationEnv().AUTH_MODE === 'session') {
    throw new UnauthorizedException('Thao tac vi bang doi mot phien dang nhap da xac thuc');
  }
  return 'operator';
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'du lieu khong hop le';
}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
  return parsed.data as z.infer<S>;
}

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    return viBangErrorToHttp(error);
  }
}

/**
 * Be mat HTTP cua mien vi bang. KHONG co endpoint cap nhat tong quat: ghi duy nhat ngoai tao moi la
 * `POST cases/:id/transition`. KHONG route nao nhan `tenantId` — body `.strict()` tu choi no.
 */
@Controller('vi-bang')
export class ViBangController {
  constructor(private readonly service: ViBangService) {}

  @Post('customers')
  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createCustomer(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = parse(createCustomerSchema, body);
    return guard(() => this.service.createCustomer(input, viBangActorOf(request)));
  }

  @Get('customers')
  listCustomers(@Query() query: unknown) {
    const parsed = parse(listCustomersQuerySchema, query);
    return guard(() => this.service.listCustomers(parsed));
  }

  @Get('customers/:id')
  getCustomer(@Param('id') id: string) {
    return guard(() => this.service.getCustomer(id));
  }

  @Post('contracts')
  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createContract(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = parse(createContractSchema, body);
    return guard(() => this.service.createContract(input, viBangActorOf(request)));
  }

  @Get('contracts')
  listContracts(@Query() query: unknown) {
    const parsed = parse(listContractsQuerySchema, query);
    return guard(() => this.service.listContracts(parsed));
  }

  @Get('contracts/:id')
  getContract(@Param('id') id: string) {
    return guard(() => this.service.getContract(id));
  }

  @Post('cases')
  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createCase(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = parse(createCaseSchema, body);
    return guard(() => this.service.createCase(input, viBangActorOf(request)));
  }

  @Get('cases')
  listCases(@Query() query: unknown) {
    const parsed = parse(listCasesQuerySchema, query);
    return guard(() => this.service.listCases(parsed));
  }

  @Get('cases/:id')
  getCase(@Param('id') id: string) {
    return guard(() => this.service.getCase(id));
  }

  @Post('cases/:id/transition')
  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  transitionCase(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const { to } = parse(transitionCaseSchema, body);
    return guard(() => this.service.transitionCase(id, to, viBangActorOf(request)));
  }
}
