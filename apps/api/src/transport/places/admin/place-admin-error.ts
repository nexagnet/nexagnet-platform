import { HttpException } from '@nestjs/common';
import { transportErrorBody, transportErrorToHttp } from '../../transport-action.guard.js';
import {
  TransportDomainError,
  type TransportErrorKind,
  type TransportErrorReason,
} from '../../transport.errors.js';

/**
 * Loi cua man "Dia diem van hanh" KEM CHI TIET co cau truc (`#395`).
 *
 * `TransportDomainError` chi mang `reason` + mot cau; hai tu choi cua man nay can noi them CAI GI:
 * `PLACE_NAME_TAKEN` noi ten nao, loai nao, cua ai; `DEPOT_CHANGE_AFFECTS_OPEN_WORK` liet ke vong xe
 * va don bi anh huong de nguoi dung xac nhan. `detail` chi mang ma, ten va con so — KHONG toa do,
 * KHONG dia chi.
 *
 * La mot `TransportDomainError`, nen moi duong cu (vd `POST /transport/geofences`) van dich no bang
 * `transportErrorToHttp` — mat `detail` nhung giu dung ma HTTP va `reason`.
 */
export class PlaceAdminError extends TransportDomainError {
  constructor(
    kind: TransportErrorKind,
    reason: TransportErrorReason,
    message: string,
    readonly detail: Readonly<Record<string, unknown>>,
  ) {
    super(kind, reason, message);
    this.name = 'PlaceAdminError';
  }
}

/** Nhu `transportErrorToHttp`, nhung giu `detail` cua `PlaceAdminError` tren than phan hoi. */
export function placeAdminErrorToHttp(error: unknown): never {
  if (error instanceof PlaceAdminError) {
    const body = transportErrorBody(error);
    throw new HttpException({ ...body, detail: error.detail }, body.statusCode);
  }
  return transportErrorToHttp(error);
}
