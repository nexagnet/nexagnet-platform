import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { transportErrorBody, transportErrorToHttp } from './transport-action.guard.js';
import { presetIncludes } from './transport-actions.js';
import { TransportDomainError } from './transport.errors.js';
import { transitionTripSchema } from './transport.schemas.js';
import { isPublishableToDriver } from './workforce/payslip-lifecycle.js';
import { PAYSLIP_STATUSES } from './workforce/workforce.types.js';

/**
 * BIEN GIOI HTTP cua `#168` — B6 (duong huy di vong) va B7 (ly do co kieu tren day).
 *
 * Do o day chu khong o mot bai e2e: ca hai deu la hanh vi cua HAM THUAN o bien gioi, va mot bai
 * e2e se doi mot may chu chay chi de khang dinh mot phep bien doi.
 */

describe('#168 B6 — huy chuyen khong di vong qua duong chuyen trang thai chung', () => {
  /**
   * KHOANG CACH DAC QUYEN chinh la ly do lo hong nay nguy hiem, khong phai chuyen "thieu mot truong".
   *
   * Ke toan CO `transport.trip.transition` (ho doi trang thai chuyen hang ngay) nhung CO Y KHONG co
   * `transport.trip.cancel` — VT-082/`GD-02`. Chung nao route chung con nhan `CANCELLED`, phep cat
   * quyen kia chi la mot loi khuyen.
   */
  it('Ke toan co quyen chuyen trang thai NHUNG khong co quyen huy', () => {
    expect(presetIncludes('ACCOUNTING', 'transport.trip.transition')).toBe(true);
    expect(presetIncludes('ACCOUNTING', 'transport.trip.cancel')).toBe(false);
    // Giam doc co ca hai — nen phep thu tren dung la mot phep CAT quyen, khong phai mot bang rong.
    expect(presetIncludes('ADMIN', 'transport.trip.cancel')).toBe(true);
  });

  it('than yeu cau `{to:"CANCELLED"}` bi tu choi ngay o schema', () => {
    expect(transitionTripSchema.safeParse({ to: 'CANCELLED' }).success).toBe(false);
  });

  it('cac trang thai vong doi khac van qua duoc schema', () => {
    for (const to of ['PLANNED', 'IN_TRANSIT', 'DELIVERED', 'RECONCILED'] as const) {
      expect(transitionTripSchema.safeParse({ to }).success, to).toBe(true);
    }
  });
});

describe('#168 B5 — nop lai mot phieu dau bi tu choi', () => {
  /**
   * `FuelService.resubmitFuelEntry` (canh `REJECTED -> DECLARED`) da hien thuc tu T4 va co bai cua
   * chinh no o `fuel.service.spec.ts`. Cai T7B them vao la hai DUONG HTTP toi no — nen bai o day do
   * dung phan moi: THU TU cua phep kiem quyen so huu tren duong cua lai xe.
   */
  function driverHarness(ownedSlipIds: readonly string[]) {
    const order: string[] = [];
    const read = {
      getMyFuelSlip: (authUserId: string, id: string) => {
        order.push(`read:${id}`);
        if (!ownedSlipIds.includes(id)) {
          return Promise.reject(
            TransportDomainError.denied('SELF_FUEL_SCOPE_NOT_OWNED', 'phieu cua nguoi khac'),
          );
        }
        return Promise.resolve({ id, verificationStatus: 'DECLARED' });
      },
    };
    const fuel = {
      resubmitFuelEntry: (id: string) => {
        order.push(`write:${id}`);
        return Promise.resolve({ id });
      },
    };
    return { order, read, fuel };
  }

  const controllerOf = async (harness: ReturnType<typeof driverHarness>) => {
    const { DriverFuelController } = await import('./fuel/driver-fuel.controller.js');
    return new DriverFuelController(harness.fuel as never, harness.read as never) as unknown as {
      resubmit(request: unknown, id: string): Promise<unknown>;
    };
  };

  const sessionOf = (id: string) => ({ authUser: { id, role: 'SALE' } });

  it('lai xe nop lai duoc phieu CUA CHINH MINH', async () => {
    const harness = driverHarness(['phieu-cua-toi']);
    const controller = await controllerOf(harness);

    await controller.resubmit(sessionOf('user-lai-xe-a'), 'phieu-cua-toi');

    // DOC QUYEN SO HUU TRUOC KHI GHI, roi doc lai de tra khung nhin moi.
    expect(harness.order).toEqual([
      'read:phieu-cua-toi',
      'write:phieu-cua-toi',
      'read:phieu-cua-toi',
    ]);
  });

  /**
   * PHEP THU THAT: khong phai "co nem loi khong", ma la "co GHI khong".
   *
   * Neu phep kiem quyen so huu chay SAU lenh ghi, bai nay van thay mot loi nem ra — nhung phieu cua
   * dong nghiep da bi mo lai roi.
   */
  it('phieu cua nguoi khac bi tu choi TRUOC khi co bat ky lan ghi nao', async () => {
    const harness = driverHarness(['phieu-cua-toi']);
    const controller = await controllerOf(harness);

    await expect(
      controller.resubmit(sessionOf('user-lai-xe-a'), 'phieu-cua-dong-nghiep'),
    ).rejects.toThrow();

    expect(harness.order).toEqual(['read:phieu-cua-dong-nghiep']);
    expect(harness.order.some((step) => step.startsWith('write:'))).toBe(false);
  });

  it('duong VAN HANH doi quyen duyet, khong phai quyen nop cua lai xe', () => {
    // Dua mot phieu tro lai hang doi duyet la mot thao tac DUYET: no dao nguoc dung ket qua ma
    // `.verify`/`.reject` vua tao ra.
    expect(presetIncludes('ACCOUNTING', 'transport.fuel.entry.verify')).toBe(true);
    expect(presetIncludes('SALE', 'transport.fuel.entry.verify')).toBe(false);
    expect(presetIncludes('SALE', 'transport.driver.self.fuel.submit')).toBe(true);
  });
});

describe('#168 B7 — ly do nghiep vu CO KIEU song sot qua bien gioi HTTP', () => {
  /**
   * Bon ma HTTP, bon loai loi mien. Phep anh xa nay von da dung truoc task; cai thay doi la THAN
   * phan hoi, nen phai chung minh no KHONG doi.
   */
  it('bon loai loi van anh xa dung bon ma HTTP nhu truoc', () => {
    const cases = [
      ['NOT_FOUND', 404, 'Not Found'],
      ['CONFLICT', 409, 'Conflict'],
      ['INVALID', 400, 'Bad Request'],
      ['DENIED', 403, 'Forbidden'],
    ] as const;

    for (const [kind, status, errorText] of cases) {
      const body = transportErrorBody(
        new TransportDomainError(kind, 'TRIP_NOT_FOUND', 'khong tim thay'),
      );
      expect(body.statusCode, kind).toBe(status);
      expect(body.error, kind).toBe(errorText);
      expect(body.message, kind).toBe('khong tim thay');
    }
  });

  /**
   * PHEP THU THAT cua B7: hai tinh huong CUNG tra 403 nhung doi hai cach xu ly khac han nhau, va
   * truoc task nay giao dien khong phan biet duoc.
   *
   *   `FUND_PERIOD_STATUS_RACE` -> nguoi dung phai TAI LAI (co nguoi vua doi trang thai ky);
   *   `FUND_PERIOD_OVERLAP`     -> nguoi dung phai SUA NGAY (ky bi chong lan).
   */
  it('hai duong tu choi cung ma 403 van phan biet duoc bang `reason`', () => {
    const race = transportErrorBody(
      TransportDomainError.denied('FUND_PERIOD_STATUS_RACE', 'co nguoi vua doi trang thai ky'),
    );
    const overlap = transportErrorBody(
      TransportDomainError.denied('FUND_PERIOD_OVERLAP', 'ky nay chong lan mot ky khac'),
    );

    expect(race.statusCode).toBe(403);
    expect(overlap.statusCode).toBe(403);
    expect(race.reason).not.toBe(overlap.reason);
    expect(race.reason).toBe('FUND_PERIOD_STATUS_RACE');
    expect(overlap.reason).toBe('FUND_PERIOD_OVERLAP');
  });

  it('`reason` di duoc toi THAN cua ngoai le Nest, khong dung lai o may chu', () => {
    let caught: unknown;
    try {
      transportErrorToHttp(
        TransportDomainError.denied('TRIP_CANCEL_REQUIRES_DEDICATED_PATH', 'phai dung duong rieng'),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ForbiddenException);
    expect((caught as ForbiddenException).getResponse()).toMatchObject({
      statusCode: 403,
      error: 'Forbidden',
      reason: 'TRIP_CANCEL_REQUIRES_DEDICATED_PATH',
      message: 'phai dung duong rieng',
    });
  });

  it('cac loai loi khac cung ra dung lop ngoai le Nest', () => {
    expect(() =>
      transportErrorToHttp(TransportDomainError.notFound('TRIP_NOT_FOUND', 'x')),
    ).toThrow(NotFoundException);
    expect(() => transportErrorToHttp(TransportDomainError.invalid('MONEY_INVALID', 'x'))).toThrow(
      BadRequestException,
    );
  });

  /**
   * KHONG RO RI — day la nua con lai cua B7.
   *
   * Than loi chi duoc mang dung bon khoa. Mot `stack`, mot ma loi cua Prisma, hay chinh doi tuong
   * ngoai le lot vao day se bien mot cai tien cho giao dien thanh mot duong ro thong tin.
   */
  it('than loi KHONG mang stack, ma loi ha tang, hay doi tuong ngoai le', () => {
    const body = transportErrorBody(
      TransportDomainError.conflict('TRIP_ACTIVE_ASSIGNMENT_CONFLICT', 'co nguoi vua ghi truoc'),
    );

    expect(Object.keys(body).sort()).toEqual(['error', 'message', 'reason', 'statusCode']);
    const serialised = JSON.stringify(body);
    for (const leak of [
      'stack',
      'TransportDomainError',
      'prisma',
      'Prisma',
      'SELECT',
      'at Object',
    ]) {
      expect(serialised, leak).not.toContain(leak);
    }
  });

  it('loi KHONG phai cua mien duoc nem nguyen ven, khong bi boc thanh 4xx', () => {
    const boom = new TypeError('mot loi lap trinh that');
    expect(() => transportErrorToHttp(boom)).toThrow(boom);
  });
});

describe('#168 B8 — quy tac cong bo phieu luong ra be mat lai xe', () => {
  /**
   * QUY TAC CONG BO la mot HAM THUAN, va do la ly do no duoc do o day.
   *
   * Nguon cua khach khong cho phep cong bo luong TAM TINH cho lai xe. Duyet CA BON trang thai chu
   * khong chi `DRAFT`: mot bai chi kiem `DRAFT` se van xanh sau ngay ai do vo tinh doi ham thanh
   * "chi hien phieu DA TRA" — va luc do mot phieu da duyet chua tra se bien mat khoi dien thoai lai
   * xe ma khong ai bao cao duoc.
   */
  it('DUNG mot trang thai bi giu lai, va do la `DRAFT`', () => {
    expect(isPublishableToDriver('DRAFT')).toBe(false);
    expect(isPublishableToDriver('APPROVED')).toBe(true);
    expect(isPublishableToDriver('PAID')).toBe(true);
    // `REVERSED` VAN hien: giau no di se lam phieu dao thanh mot dong am khong co doi ung.
    expect(isPublishableToDriver('REVERSED')).toBe(true);
    expect(PAYSLIP_STATUSES.filter((status) => !isPublishableToDriver(status))).toEqual(['DRAFT']);
  });

  /**
   * MOT ma phieu khong nhin thay duoc ra 404, khong ra 403.
   *
   * `403` noi "cai nay ton tai, ban khong duoc xem"; `404` noi "khong co gi o day cho ban". Ba
   * duong (ma bia ra, phieu cua nguoi khac, phieu nhap cua chinh minh) cung ra cau thu hai, nen
   * khong lan go ma nao do duoc ma nao CO THAT. Phep thu rang ba duong THAT SU giong nhau nam o
   * `workforce/driver-payslips.controller.spec.ts`; o day do HINH DANG cua cau tra loi do.
   */
  it('`SELF_PAYSLIP_NOT_VISIBLE` ra 404 va khong mang mot manh du lieu nghiep vu nao', () => {
    const body = transportErrorBody(
      TransportDomainError.notFound(
        'SELF_PAYSLIP_NOT_VISIBLE',
        'Khong tim thay phieu luong nao mang ma nay trong pham vi cua ban',
      ),
    );

    expect(body.statusCode).toBe(404);
    expect(body.error).toBe('Not Found');
    expect(body.reason).toBe('SELF_PAYSLIP_NOT_VISIBLE');
    expect(Object.keys(body).sort()).toEqual(['error', 'message', 'reason', 'statusCode']);
    // Cau chu KHONG duoc nhac lai ma duoc hoi: nhac lai la mot duong phan chieu de do ma.
    expect(body.message).not.toContain('phieu-');
  });

  /**
   * Tai khoan chua noi ho so lai xe ra 403 — mot LOAI KHAC han, co chu dich.
   *
   * Cau nay noi ve chinh nguoi dang goi, khong noi gi ve phieu luong, nen no khong the bi dung lam
   * mot phep do su ton tai cua ban ghi nao.
   */
  it('chua noi ho so lai xe ra 403, khong tron voi 404 cua ma khong nhin thay duoc', () => {
    const khongNoi = transportErrorBody(
      TransportDomainError.denied(
        'SELF_PAYSLIP_SCOPE_NO_DRIVER_BINDING',
        'Tai khoan nay chua duoc noi voi ho so lai xe nao',
      ),
    );
    expect(khongNoi.statusCode).toBe(403);
    expect(khongNoi.reason).not.toBe('SELF_PAYSLIP_NOT_VISIBLE');
  });

  /**
   * `#168 B8` cam cap quyen VAN HANH cho lai xe — do o tang bang phan quyen, khong o route.
   *
   * `transport.payroll.period.read` doc duoc ky luong, lan chay VA phieu cua bat ky lai xe nao.
   * Bon ma con lai la duong ghi tai chinh.
   */
  it('lai xe khong nhan duoc mot ma luong van hanh nao', () => {
    expect(presetIncludes('SALE', 'transport.driver.self.payslip.read')).toBe(true);
    for (const action of [
      'transport.payroll.period.read',
      'transport.payroll.period.manage',
      'transport.payroll.run',
      'transport.payslip.approve',
      'transport.payslip.pay',
      'transport.payslip.correct',
    ] as const) {
      expect(presetIncludes('SALE', action), action).toBe(false);
      expect(presetIncludes('MANAGER', action), action).toBe(false);
    }
    expect(presetIncludes('MANAGER', 'transport.driver.self.payslip.read')).toBe(false);
  });
});
