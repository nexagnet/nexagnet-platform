import { BadRequestException, Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requestCanPerform,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { firstIssue } from '../transport.schemas.js';
import { dispatchCommitSchema, dispatchSuggestionSchema } from './dispatch.schemas.js';
import {
  DispatchService,
  type DispatchCaller,
  type DispatchSuggestionRequest,
} from './dispatch.service.js';

/**
 * DE NGHI DIEU XE qua HTTP — `#277 M8`.
 *
 * ===========================================================================
 * VI SAO `POST` CHO MOT VIEC CHI DOC
 *
 * `M8` cho phep: *"POST is acceptable if route input/filter body is needed, but it must remain
 * read-only business effect."* Than yeu cau mang mot toa do, mot moc gio va mot bo loc — nhoi
 * chung vao chuoi truy van se lam mot toa do (du lieu vi tri) nam trong URL, tuc trong nhat ky
 * may chu, trong lich su trinh duyet va trong `Referer`. Do la mot ro ri that, khong phai mot cau
 * hoi phong cach.
 *
 * "Chi doc" duoc cuong che o cho khac va bang cau truc: `DispatchService.suggest()` chi cham cac
 * cong o `dispatch-facts.port.ts`, va khong cong nao co mot ham ghi.
 *
 * ===========================================================================
 * HAI DUONG, HAI MA QUYEN, VA KHONG MOT VAI MOI NAO
 *
 *   `POST :id/dispatch-suggestions`  -> `transport.dispatch.suggest.read`  (ma MOI)
 *   `POST :id/dispatch-assignment`   -> `transport.run.manage`             (ma DA CO)
 *
 * Duong ghi dung LAI ma quyen da chi phoi moi lan ghi vong chay/chang tren `main` hom nay. `#277
 * M13` doi *"preserve it"* va cam mo rong quyen cho tien: che ra mot ma `dispatch.commit` rieng se
 * tao mot duong ghi vong chay THU HAI voi mot bang phan quyen khac — va hai bang do se lech nhau.
 *
 * Ca hai ma deu nam ngoai `SELF_SCOPE_ACTIONS`, nen vai lai xe (`SALE`) khong co ma nao. Do la
 * cau tra loi cua cau *"driver cannot query fleet-wide dispatch suggestions"* (`M13`), va no den
 * tu CAU TRUC cua `OPERATIONS_ACTIONS` chu khong tu mot dong cau hinh phai nho.
 */
@Controller('transport/orders')
@UseGuards(TransportActionGuard)
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  /**
   * `@Throttle` chat hon cac be mat doc khac cua mien: moi lan goi co the sinh mot lan hoi nha
   * cung cap dinh tuyen, tuc mot chi phi that theo tung yeu cau. `#277 M12` doi mot chan tren cho
   * so lan goi ra ngoai; bo nho dem lo phan lap lai, con day lo phan bam lien tuc.
   */
  @Post(':orderId/dispatch-suggestions')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.dispatch.suggest.read')
  suggest(
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsed = this.parse(dispatchSuggestionSchema, body ?? {});
    return this.guard(() =>
      this.dispatch.suggest(orderId, toRequest(parsed), this.callerOf(request)),
    );
  }

  /**
   * BOSS DA CHON. Day la cho DUY NHAT cua Lane M co mot lan ghi.
   *
   * Ten route co y KHONG phai `.../dispatch-suggestions/confirm`: mot cai ten long trong duong dan
   * cua be mat doc se lam nguoi doc nhat ky may chu tuong hai duong la mot. Day la mot lenh khac,
   * mot ma quyen khac, va mot hau qua khac.
   */
  @Post(':orderId/dispatch-assignment')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Roles('ADMIN', 'ACCOUNTING')
  @RequiresTransportAction('transport.run.manage')
  commit(
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsed = this.parse(dispatchCommitSchema, body);
    return this.guard(() =>
      this.dispatch.commit(orderId, parsed.vehicleId, toRequest(parsed), this.callerOf(request)),
    );
  }

  /**
   * AI DUOC THAY TOA DO CUA MOT CHIEC XE.
   *
   * Cung dieu kien mo dau voi `TransportActionGuard`: o che do khong-phien (`AUTH_MODE` khac
   * `session`) thi khong co danh tinh nao de hoi va toan bo ung dung von khong xac thuc — lech
   * dieu kien voi cong kia se tao ra mot che do chay ma mot nua so cong mo mot nua dong.
   *
   * Con o che do phien, cau hoi duoc chuyen thang cho ma quyen DA CO cho duong di tho:
   * `transport.location.history.read`. Ke toan khong co ma do (`ACCOUNTING_DENIED`), nen ho thay
   * moi con so cua bang de nghi — km rong, gio den, ly do — nhung khong thay chiec xe dang dung o
   * dau. Do dung la thu ho can de doi soat, va dung nhung gi ho khong can.
   *
   * `#395`: tra loi bang TAP QUYEN HIEU LUC cua tai khoan (vai khoi diem + quyen rieng), cung mot
   * cau tra loi voi guard — xem `requestCanPerform`.
   */
  private callerOf(request: AuthenticatedRequest): DispatchCaller {
    return {
      actor: transportActorOf(request),
      canReadLocationHistory: requestCanPerform(request, 'transport.location.history.read'),
    };
  }

  private parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    return parsed.data as z.infer<S>;
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}

/** Than yeu cau da kiem -> lenh cua mien. `undefined` cua zod thanh `null` tuong minh. */
function toRequest(body: z.infer<typeof dispatchSuggestionSchema>): DispatchSuggestionRequest {
  return {
    pickup: body.pickup ?? null,
    requiredPickupAt: body.requiredPickupAt ?? null,
    requirement: {
      payloadKg: body.requirement?.payloadKg ?? null,
      vehicleClass: body.requirement?.vehicleClass ?? null,
    },
    limit: body.limit ?? null,
  };
}
