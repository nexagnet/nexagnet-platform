import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

export const VI_BANG_ERROR_REASONS = [
  'CUSTOMER_NOT_FOUND',
  'CONTRACT_NOT_FOUND',
  'CASE_NOT_FOUND',
  'CONTRACT_CUSTOMER_MISMATCH',
  'REFERENCE_NOT_FOUND',
  'TRANSITION_NOT_ALLOWED',
  'STATE_CHANGED',
] as const;
export type ViBangErrorReason = (typeof VI_BANG_ERROR_REASONS)[number];

/**
 * Loi nghiep vu cua mien. Thong diep CHI chua ma/id — KHONG bao gio chua ten, SDT, CCCD hay noi
 * dung ho so (khong PII trong loi).
 */
export class ViBangError extends Error {
  constructor(
    readonly reason: ViBangErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'ViBangError';
  }
}

/** Anh xa loi mien -> HTTP; loi la di nguyen (Nest xu ly). */
export function viBangErrorToHttp(error: unknown): never {
  if (!(error instanceof ViBangError)) throw error;
  switch (error.reason) {
    case 'CUSTOMER_NOT_FOUND':
    case 'CONTRACT_NOT_FOUND':
    case 'CASE_NOT_FOUND':
      throw new NotFoundException(error.message);
    case 'STATE_CHANGED':
      throw new ConflictException(error.message);
    case 'TRANSITION_NOT_ALLOWED':
      throw new UnprocessableEntityException(error.message);
    default:
      throw new BadRequestException(error.message);
  }
}
