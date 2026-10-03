import { beforeEach, describe, expect, it } from 'vitest';
import { TransportDomainError } from '../transport.errors.js';
import { WaitingAllowanceDriverIdentityFacts } from './allowance-facts.port.js';
import { InMemoryWaitingAllowanceRepository } from './allowance.repository.js';
import { WaitingAllowanceService } from './allowance.service.js';
import { InMemoryWaitingSessionRepository } from './waiting.repository.js';

/**
 * NGHIEM THU DOI KHANG cua phu cap cho — `#279` O13 bai 10, 11, 12, 13.
 *
 * Bo nay chay tren kho TRONG-BO-NHO, tuc duong mac dinh cua demo/CI. Bo Postgres that
 * (`transport-waiting-allowance.int.spec.ts`) do lai cung nhung dieu do o tang rang buoc.
 */

const TZ = 'Asia/Ho_Chi_Minh';

class FakeIdentity extends WaitingAllowanceDriverIdentityFacts {
  readonly bindings = new Map<string, string>();
  async findDriverIdByAuthUserId(authUserId: string): Promise<string | null> {
    return this.bindings.get(authUserId) ?? null;
  }
}

const reasonOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
    return 'NO_ERROR_THROWN';
  } catch (error) {
    return error instanceof TransportDomainError ? error.reason : `UNEXPECTED:${String(error)}`;
  }
};

describe('WaitingAllowanceService — WA-030', () => {
  let sessions: InMemoryWaitingSessionRepository;
  let allowances: InMemoryWaitingAllowanceRepository;
  let identity: FakeIdentity;
  let service: WaitingAllowanceService;
  let now: Date;
  let sessionId: string;

  /** Mot phien cho DA DONG, ghi thang qua kho — luat mo/dong da do o `waiting.service.spec.ts`. */
  const closedSession = async (suffix = '1'): Promise<string> => {
    const session = await sessions.create({
      runId: 'run_1',
      legId: `leg_${suffix}`,
      driverId: 'drv_a',
      arrivalCheckpointId: `cp_${suffix}`,
      reason: 'RECEIVER_NOT_READY',
      startedAt: new Date('2026-09-09T02:00:00.000Z'),
      startedBy: 'u.binh',
      startClientEventId: `w_${suffix}`,
      note: null,
      businessDate: '2026-09-09',
    });
    await sessions.close({
      sessionId: session.id,
      endedAt: new Date('2026-09-09T06:00:00.000Z'),
      endedBy: 'u.binh',
      closeReason: 'RECEIVER_ACCEPTED',
      closingCheckpointId: null,
      closeNote: null,
    });
    return session.id;
  };

  beforeEach(async () => {
    sessions = new InMemoryWaitingSessionRepository();
    allowances = new InMemoryWaitingAllowanceRepository();
    identity = new FakeIdentity();
    identity.bindings.set('u.binh', 'drv_a');
    now = new Date('2026-09-09T07:00:00.000Z');
    service = new WaitingAllowanceService(
      allowances,
      sessions,
      identity,
      { timeZone: TZ },
      undefined,
      () => now,
    );
    sessionId = await closedSession();
  });

  const propose = (over: Record<string, unknown> = {}) =>
    service.propose({
      waitingSessionId: sessionId,
      candidateAmount: 500_000,
      reason: 'Cho nguoi nhan 4 tieng',
      authUserId: 'u.vanphong',
      ...over,
    } as Parameters<typeof service.propose>[0]);

  it('van phong de nghi mot khoan, va no dung o trang thai CHO', async () => {
    const allowance = await propose();
    expect(allowance.status).toBe('PENDING');
    expect(allowance.candidateAmount).toBe(500_000);
    expect(allowance.approvedAmount).toBeNull();
    expect(allowance.driverId).toBe('drv_a');
    expect(allowance.proposedBy).toBe('u.vanphong');
    expect(allowance.currencyCode).toBe('VND');
  });

  /**
   * `#279` O13 bai 10 — mot de nghi CHUA duoc duyet khong dong den tien.
   *
   * Do bang chinh cai duong ma bang luong doc: neu mot hang `PENDING` lot vao tong nay thi mot con
   * so chua ai duyet se di thang vao thu nhap cua lai xe.
   */
  it('mot de nghi chua duyet KHONG vao tong da duyet', async () => {
    await propose();
    expect(await service.approvedTotalsBetween('2026-09-01', '2026-09-30')).toEqual([]);
  });

  it('chi so DA DUYET vao tong, va la so NGUOI DUYET chot', async () => {
    const allowance = await propose();
    await service.decide({
      allowanceId: allowance.id,
      outcome: 'APPROVED',
      approvedAmount: 300_000,
      note: 'Cat theo muc thoa thuan',
      idempotencyKey: 'k-1',
      authUserId: 'u.sep',
    });

    expect(await service.approvedTotalsBetween('2026-09-01', '2026-09-30')).toEqual([
      { driverId: 'drv_a', totalAmount: 300_000, count: 1 },
    ]);
  });

  /** `#279` O13 bai 11 — bam `Duyet` hai lan khong tra tien hai lan. */
  it('duyet lai bang CUNG khoa chong ghi trung khong tra tien lan hai', async () => {
    const allowance = await propose();
    const command = {
      allowanceId: allowance.id,
      outcome: 'APPROVED' as const,
      approvedAmount: 300_000,
      note: null,
      idempotencyKey: 'k-1',
      authUserId: 'u.sep',
    };
    const first = await service.decide(command);
    const again = await service.decide(command);

    expect(again.id).toBe(first.id);
    expect(again.decidedAt).toEqual(first.decidedAt);
    expect(await service.approvedTotalsBetween('2026-09-01', '2026-09-30')).toEqual([
      { driverId: 'drv_a', totalAmount: 300_000, count: 1 },
    ]);
  });

  /**
   * BON LAN GUI, MOT KHOA — va chi MOT trong so do la mot lan gui lai.
   *
   * Doc theo khoa roi tra ve ngay la mot cong CHUA DONG. Ba bai duoi day di qua dung ba mat mang
   * nghia kinh te cua mot lan quyet — de nghi nao, ket qua gi, bao nhieu tien — va moi mat lech
   * phai ra mot ma RIENG. Neu bat ky mat nao lot qua, nguoi bam nhan 200 mang du lieu CU trong khi
   * quyet dinh MOI cua ho chua he duoc ghi.
   */
  it('cung khoa nhung tro vao mot DE NGHI KHAC thi bi tu choi, khong tra ve hang cu', async () => {
    const first = await propose();
    await service.decide({
      allowanceId: first.id,
      outcome: 'APPROVED',
      approvedAmount: 300_000,
      note: null,
      idempotencyKey: 'k-1',
      authUserId: 'u.sep',
    });

    // Mot phien KHAC, mot de nghi KHAC — nhung nguoi goi deo lai dung khoa cu.
    const otherSession = await closedSession('2');
    const second = await propose({ waitingSessionId: otherSession, candidateAmount: 400_000 });

    expect(
      await reasonOf(
        service.decide({
          allowanceId: second.id,
          outcome: 'APPROVED',
          approvedAmount: 400_000,
          note: null,
          idempotencyKey: 'k-1',
          authUserId: 'u.sep',
        }),
      ),
    ).toBe('WAITING_ALLOWANCE_DECISION_KEY_REUSED');

    // Va de nghi thu hai VAN dang cho — khong bi mot lan gui lai gia lam cho thanh da quyet.
    expect((await service.listPending()).map((row) => row.id)).toEqual([second.id]);
    expect(await service.approvedTotalsBetween('2026-09-01', '2026-09-30')).toEqual([
      { driverId: 'drv_a', totalAmount: 300_000, count: 1 },
    ]);
  });

  it('cung khoa, cung de nghi, nhung DOI KET QUA thi bi tu choi', async () => {
    const allowance = await propose();
    await service.decide({
      allowanceId: allowance.id,
      outcome: 'APPROVED',
      approvedAmount: 300_000,
      note: null,
      idempotencyKey: 'k-1',
      authUserId: 'u.sep',
    });

    expect(
      await reasonOf(
        service.decide({
          allowanceId: allowance.id,
          outcome: 'REJECTED',
          approvedAmount: null,
          note: null,
          idempotencyKey: 'k-1',
          authUserId: 'u.sep',
        }),
      ),
    ).toBe('WAITING_ALLOWANCE_DECISION_OUTCOME_MISMATCH');

    // Hang cu KHONG bi doi, va khong bi tra ve nhu mot thanh cong.
    const row = (await service.listForSession(sessionId))[0];
    expect(row?.status).toBe('APPROVED');
    expect(row?.approvedAmount).toBe(300_000);
  });

  it('cung khoa, cung de nghi, cung ket qua, nhung DOI SO TIEN thi bi tu choi', async () => {
    const allowance = await propose();
    await service.decide({
      allowanceId: allowance.id,
      outcome: 'APPROVED',
      approvedAmount: 300_000,
      note: null,
      idempotencyKey: 'k-1',
      authUserId: 'u.sep',
    });

    expect(
      await reasonOf(
        service.decide({
          allowanceId: allowance.id,
          outcome: 'APPROVED',
          approvedAmount: 500_000,
          note: null,
          idempotencyKey: 'k-1',
          authUserId: 'u.sep',
        }),
      ),
    ).toBe('WAITING_ALLOWANCE_DECISION_AMOUNT_MISMATCH');

    expect(await service.approvedTotalsBetween('2026-09-01', '2026-09-30')).toEqual([
      { driverId: 'drv_a', totalAmount: 300_000, count: 1 },
    ]);
  });

  /** Mot lenh TU CHOI gui lai van la mot lan gui lai — lop bao ve khong duoc thanh nguon su co. */
  it('gui lai DUNG mot lenh tu choi thi tra ve chinh hang do', async () => {
    const allowance = await propose();
    const command = {
      allowanceId: allowance.id,
      outcome: 'REJECTED' as const,
      approvedAmount: null,
      note: 'Khong co bien ban',
      idempotencyKey: 'k-r',
      authUserId: 'u.sep',
    };
    const first = await service.decide(command);
    const again = await service.decide(command);

    expect(again.id).toBe(first.id);
    expect(again.status).toBe('REJECTED');
    expect(again.decidedAt).toEqual(first.decidedAt);
  });

  /**
   * Mot khoa KHAC tren mot de nghi DA quyet phai bi tu choi.
   *
   * Khac bai tren: day khong phai mot lan gui lai, day la mot nguoi thu hai quyet lai. Chap nhan no
   * se ghi de len mot quyet dinh ho chua he nhin thay.
   */
  it('mot nguoi thu hai khong quyet lai duoc de nghi da quyet', async () => {
    const allowance = await propose();
    await service.decide({
      allowanceId: allowance.id,
      outcome: 'APPROVED',
      approvedAmount: 300_000,
      note: null,
      idempotencyKey: 'k-1',
      authUserId: 'u.sep',
    });

    expect(
      await reasonOf(
        service.decide({
          allowanceId: allowance.id,
          outcome: 'REJECTED',
          approvedAmount: null,
          note: null,
          idempotencyKey: 'k-2',
          authUserId: 'u.ketoan',
        }),
      ),
    ).toBe('WAITING_ALLOWANCE_ALREADY_DECIDED');
  });

  /** `#279` O13 bai 12 — mot de nghi bi tu choi O LAI trong lich su, khong bien mat. */
  it('de nghi bi tu choi o lai lich su, va khong vao tong', async () => {
    const first = await propose();
    await service.decide({
      allowanceId: first.id,
      outcome: 'REJECTED',
      approvedAmount: null,
      note: 'Khong co bien ban',
      idempotencyKey: 'k-r',
      authUserId: 'u.sep',
    });

    const history = await service.listForSession(sessionId);
    expect(history).toHaveLength(1);
    expect(history[0]?.status).toBe('REJECTED');
    expect(history[0]?.decisionNote).toBe('Khong co bien ban');
    expect(history[0]?.approvedAmount).toBeNull();
    expect(await service.approvedTotalsBetween('2026-09-01', '2026-09-30')).toEqual([]);

    // Va mot de nghi MOI van ghi duoc tren cung phien — lich su khong khoa cua.
    const second = await propose({ candidateAmount: 200_000 });
    expect(second.status).toBe('PENDING');
    expect(await service.listForSession(sessionId)).toHaveLength(2);
  });

  /**
   * `#279` O6: *"driver cannot approve their own allowance"*.
   *
   * Phep kiem tren DANH TINH, khong tren vai: `u.binh` o day mang mot tai khoan VAN HANH (bo test
   * khong dung guard), nhung ho van bi chan — vi ho duoc noi voi `drv_a` qua `Driver.authUserId`.
   * Bang vai khong noi duoc gi ve mot nguoi co CA HAI ho so.
   */
  it('lai xe khong tu de nghi va khong tu duyet khoan cua chinh minh', async () => {
    expect(await reasonOf(propose({ authUserId: 'u.binh' }))).toBe(
      'WAITING_ALLOWANCE_SELF_DEALING',
    );

    const allowance = await propose();
    expect(
      await reasonOf(
        service.decide({
          allowanceId: allowance.id,
          outcome: 'APPROVED',
          approvedAmount: 500_000,
          note: null,
          idempotencyKey: 'k-self',
          authUserId: 'u.binh',
        }),
      ),
    ).toBe('WAITING_ALLOWANCE_SELF_DEALING');
    expect(await service.approvedTotalsBetween('2026-09-01', '2026-09-30')).toEqual([]);
  });

  it('mot phien da co khoan duoc duyet thi khong de nghi them', async () => {
    const allowance = await propose();
    await service.decide({
      allowanceId: allowance.id,
      outcome: 'APPROVED',
      approvedAmount: 300_000,
      note: null,
      idempotencyKey: 'k-1',
      authUserId: 'u.sep',
    });
    expect(await reasonOf(propose())).toBe('WAITING_ALLOWANCE_ALREADY_APPROVED');
  });

  it('khong de nghi duoc tren mot phien con dang mo', async () => {
    const open = await sessions.create({
      runId: 'run_1',
      legId: 'leg_open',
      driverId: 'drv_a',
      arrivalCheckpointId: 'cp_open',
      reason: 'QUEUE_AHEAD',
      startedAt: now,
      startedBy: 'u.binh',
      startClientEventId: 'w_open',
      note: null,
      businessDate: '2026-09-09',
    });
    expect(await reasonOf(propose({ waitingSessionId: open.id }))).toBe(
      'WAITING_ALLOWANCE_SESSION_STILL_OPEN',
    );
  });

  it('tong theo lai xe chi lay dung khoang ngay nghiep vu duoc hoi', async () => {
    const allowance = await propose();
    await service.decide({
      allowanceId: allowance.id,
      outcome: 'APPROVED',
      approvedAmount: 300_000,
      note: null,
      idempotencyKey: 'k-1',
      authUserId: 'u.sep',
    });
    expect(await service.approvedTotalsBetween('2026-08-01', '2026-08-31')).toEqual([]);
    expect(await service.approvedTotalsBetween('2026-09-09', '2026-09-09')).toHaveLength(1);
  });

  // `#401`: ngay nghiep vu cua khoan phu cap la ngay DE NGHI theo MUI GIO NGHIEP VU, va ky luong
  // cat theo ngay do. Clock ghim o day nen bai khong phu thuoc thang ma CI dang chay — dung cai
  // bay da lam bai boot do tu 01/10/2026. Hai phia cua moi ranh gioi deu duoc do.
  it.each([
    {
      label: '23:59:59 ngay 30/09 gio VN',
      proposedAt: '2026-09-30T16:59:59.999Z',
      businessDate: '2026-09-30',
      inside: { start: '2026-09-01', end: '2026-09-30' },
      outside: { start: '2026-10-01', end: '2026-10-31' },
    },
    {
      label: '00:00 ngay 01/10 gio VN',
      proposedAt: '2026-09-30T17:00:00.000Z',
      businessDate: '2026-10-01',
      inside: { start: '2026-10-01', end: '2026-10-31' },
      outside: { start: '2026-09-01', end: '2026-09-30' },
    },
    {
      label: '00:00 ngay 01/01 gio VN',
      proposedAt: '2026-12-31T17:00:00.000Z',
      businessDate: '2027-01-01',
      inside: { start: '2027-01-01', end: '2027-01-31' },
      outside: { start: '2026-12-01', end: '2026-12-31' },
    },
  ])(
    'de nghi luc $label thuoc dung ky cua ngay nghiep vu, ky ben kia ranh gioi khong tinh',
    async ({ proposedAt, businessDate, inside, outside }) => {
      now = new Date(proposedAt);
      const allowance = await propose();
      expect(allowance.businessDate).toBe(businessDate);
      await service.decide({
        allowanceId: allowance.id,
        outcome: 'APPROVED',
        approvedAmount: 300_000,
        note: null,
        idempotencyKey: 'k-boundary',
        authUserId: 'u.sep',
      });

      expect(await service.approvedTotalsBetween(inside.start, inside.end)).toEqual([
        { driverId: 'drv_a', totalAmount: 300_000, count: 1 },
      ]);
      expect(await service.approvedTotalsBetween(outside.start, outside.end)).toEqual([]);
    },
  );

  it('hang cho duyet chi chua nhung de nghi CHUA quyet', async () => {
    const first = await propose();
    expect(await service.listPending()).toHaveLength(1);
    await service.decide({
      allowanceId: first.id,
      outcome: 'REJECTED',
      approvedAmount: null,
      note: null,
      idempotencyKey: 'k-r',
      authUserId: 'u.sep',
    });
    expect(await service.listPending()).toEqual([]);
  });
});
