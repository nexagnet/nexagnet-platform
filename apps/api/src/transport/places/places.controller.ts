import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import { Roles } from '../../auth/roles.decorator.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { firstIssue } from '../transport.schemas.js';
import { TransportPlaceService } from './place.service.js';
import type {
  KnownPlacesResponse,
  PlaceReverseResponse,
  PlaceSearchResponse,
} from './place-search.types.js';
import { placeReverseSchema, placeSearchSchema } from './places.schemas.js';

/**
 * BE MAT TIM DIA DIEM cho man tao don (#379).
 *
 * ===========================================================================
 * `POST` CHO HAI VIEC CHI DOC, VA DO LA RANG BUOC RIENG TU
 *
 * Chuoi tim (co khi la dia chi kho cua khach) va toa do tim nguoc la du lieu vi tri. Nhoi vao chuoi
 * truy van se de chung nam trong nhat ky may chu, lich su trinh duyet va `Referer` — cung ly do
 * `DispatchController` chon `POST`. Than `.strict()`: khong mot khoa la nao lot qua.
 *
 * ===========================================================================
 * LUON 200 KHI DAU VAO DUNG — trang thai nam trong than
 *
 * Tat / ban / nha cung cap sap la TRANG THAI cua tim kiem, khong phai loi cua nguoi goi. Man hinh
 * doc `status` va noi cau dung; 400 chi danh cho dau vao sai (chuoi qua ngan/dai, khoa la, diem
 * hong).
 *
 * ===========================================================================
 * DUNG LAI `transport.order.manage` — KHONG MOT MA QUYEN MOI
 *
 * Chi nguoi tao/sua don can tim diem lay/giao, va ma do da anh xa dung ADMIN + ACCOUNTING. Mot ma
 * rieng se phai sua ba cho (API, ban guong web, danh sach ke toan bi tu choi) ma khong doi duoc ai
 * co quyen. Vai lai xe (`SALE`) khong co ma nay.
 *
 * Controller dang ky o GOC chi tiem `TransportPlaceService` — mot provider cung o goc.
 */
@Controller('transport/places')
@UseGuards(TransportActionGuard)
export class TransportPlacesController {
  constructor(private readonly places: TransportPlaceService) {}

  @Get('known')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.order.manage')
  known(): Promise<KnownPlacesResponse> {
    return this.places.known();
  }

  /**
   * `@Throttle` 20/phut/nguoi: moi lan goi co the thanh mot lan hoi ben thu ba. Tran TOAN UNG DUNG
   * nam o cong gioi han cua adapter; day chan mot nguoi bam lien tuc chiem het cho cua nguoi khac.
   */
  @Post('search')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.order.manage')
  search(@Body() body: unknown): Promise<PlaceSearchResponse> {
    const parsed = parse(placeSearchSchema, body);
    return this.guard(() => this.places.search(parsed.query));
  }

  @Post('reverse')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.order.manage')
  reverse(@Body() body: unknown): Promise<PlaceReverseResponse> {
    const parsed = parse(placeReverseSchema, body);
    return this.guard(() => this.places.reverse(parsed.latitude, parsed.longitude));
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}

function parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
  return parsed.data as z.infer<S>;
}
