import { describe, expect, it } from 'vitest';
import {
  PLACE_SEARCH_MAX_WAITING,
  PLACE_SEARCH_MIN_SPACING_MS,
} from './place-search-provider.factory.js';
import { ProviderCallGate } from './provider-call-gate.js';

/**
 * Dong ho GIA: `sleep(ms)` chi day dong ho di `ms` va ghi lai — bai kiem khong cho that mot giay
 * nao, nhung van do dung khoang cach giua hai lan BAT DAU goi.
 */
function fakeClock(startMs = 0) {
  const state = { nowMs: startMs, sleeps: [] as number[] };
  return {
    state,
    now: () => state.nowMs,
    sleep: async (ms: number) => {
      state.sleeps.push(ms);
      state.nowMs += ms;
    },
  };
}

function gateWith(clock: ReturnType<typeof fakeClock>) {
  return new ProviderCallGate({
    minSpacingMs: PLACE_SEARCH_MIN_SPACING_MS,
    maxWaiting: PLACE_SEARCH_MAX_WAITING,
    now: clock.now,
    sleep: clock.sleep,
  });
}

/** Mot lan goi CHUA XONG cho toi khi bai kiem tha no ra — de giu cong o trang thai "dang chay". */
function heldTask() {
  let release: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { release, task: async () => done };
}

describe('cong gioi han lan goi nha cung cap', () => {
  it('chinh sach mac dinh: 1 lan / 1100 ms, 1 lan dang chay + toi da 3 nguoi cho', () => {
    expect(PLACE_SEARCH_MIN_SPACING_MS).toBe(1100);
    expect(PLACE_SEARCH_MAX_WAITING).toBe(3);
  });

  it('bon lan goi dong thoi (1 chay + 3 cho) bat dau cach nhau dung 1100 ms, noi tiep', async () => {
    const clock = fakeClock();
    const gate = gateWith(clock);
    const startedAt: number[] = [];
    const task = (id: string) => async () => {
      startedAt.push(clock.now());
      return id;
    };

    const outcomes = await Promise.all([
      gate.run(task('a')),
      gate.run(task('b')),
      gate.run(task('c')),
      gate.run(task('d')),
    ]);

    expect(outcomes).toEqual([
      { admitted: true, value: 'a' },
      { admitted: true, value: 'b' },
      { admitted: true, value: 'c' },
      { admitted: true, value: 'd' },
    ]);
    expect(startedAt).toEqual([0, 1100, 2200, 3300]);
    expect(clock.state.sleeps).toEqual([1100, 1100, 1100]);
  });

  /**
   * Tran CO DINH: khi MOT lan goi dang chay va BA nguoi dang cho, nguoi cho thu tu nhan "ban" NGAY
   * — khong xep hang, khong ngu. Day la thu giu mot ket noi HTTP khong bi treo sau mot hang doi
   * khong day.
   */
  it('mot lan dang chay + ba nguoi cho -> nguoi cho thu tu bi tu choi ngay, khong goi task', async () => {
    const clock = fakeClock();
    const gate = gateWith(clock);
    const held = heldTask();
    let calls = 0;
    const task = async () => {
      calls += 1;
      return calls;
    };

    const inFlight = gate.run(held.task);
    const waiters = [gate.run(task), gate.run(task), gate.run(task)];
    expect(gate.waitingCount).toBe(3);

    const fourthWaiter = await gate.run(task);

    expect(fourthWaiter).toEqual({ admitted: false });
    expect(gate.pendingCount).toBe(4);
    expect(calls).toBe(0);

    held.release();
    await inFlight;
    await Promise.all(waiters);
    expect(calls).toBe(3);
    expect(gate.pendingCount).toBe(0);
    expect(gate.waitingCount).toBe(0);
  });

  it('cong mo lai khi hang doi vo, va van giu khoang cach voi lan truoc', async () => {
    const clock = fakeClock();
    const gate = gateWith(clock);
    const startedAt: number[] = [];
    const task = async () => {
      startedAt.push(clock.now());
    };

    await Promise.all([gate.run(task), gate.run(task), gate.run(task), gate.run(task)]);
    const again = await gate.run(task);

    expect(again.admitted).toBe(true);
    expect(startedAt).toEqual([0, 1100, 2200, 3300, 4400]);
  });

  it('da qua du khoang cach thi khong ngu', async () => {
    const clock = fakeClock();
    const gate = gateWith(clock);

    await gate.run(async () => undefined);
    clock.state.nowMs += 5000;
    await gate.run(async () => undefined);

    expect(clock.state.sleeps).toEqual([]);
  });

  /**
   * DONG HO LUI (NTP chinh gio, doi gio may): `moc truoc + khoang cach - bay gio` thanh mot gio.
   * Lan cho phai bi KEP o `minSpacingMs` — neu khong, moi yeu cau sau do treo toi het gio HTTP.
   */
  it('dong ho lui mot gio -> lan goi sau cho TOI DA minSpacingMs, khong phai mot gio', async () => {
    const clock = fakeClock(10_000_000);
    const gate = gateWith(clock);

    await gate.run(async () => undefined);
    clock.state.nowMs -= 3_600_000;
    const outcome = await gate.run(async () => 'tiep');

    expect(outcome).toEqual({ admitted: true, value: 'tiep' });
    expect(clock.state.sleeps).toHaveLength(1);
    expect(clock.state.sleeps[0]).toBeLessThanOrEqual(PLACE_SEARCH_MIN_SPACING_MS);
    expect(clock.state.sleeps[0]).toBeGreaterThan(0);

    // Va khoang cach tinh tiep tu moc MOI, khong bi dong ho cu keo lech.
    await gate.run(async () => undefined);
    expect(clock.state.sleeps).toEqual([PLACE_SEARCH_MIN_SPACING_MS, PLACE_SEARCH_MIN_SPACING_MS]);
  });

  /**
   * Dong ho tuong nhay TOI mot gio giua hai lan goi. Neu cong do bang `Date.now()`, no se tuong
   * khoang cach da qua tu lau va goi ngay — vi pham chinh sach mot lan/giay. Dong ho don dieu thi
   * khong thay cu nhay do, va van cho gan tron khoang cach (ham ngu gia khong cho that).
   */
  it('dong ho mac dinh la dong ho DON DIEU (performance.now), khong phai dong ho tuong', async () => {
    const SPACING_MS = 60_000;
    const sleeps: number[] = [];
    const gate = new ProviderCallGate({
      minSpacingMs: SPACING_MS,
      maxWaiting: 1,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    const realNow = Date.now;
    try {
      await gate.run(async () => undefined);
      Date.now = () => realNow() + 3_600_000;
      await gate.run(async () => undefined);
    } finally {
      Date.now = realNow;
    }

    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThan(SPACING_MS / 2);
    expect(sleeps[0]).toBeLessThanOrEqual(SPACING_MS);
  });

  /** Mot lan goi hong khong duoc khoa cong cua moi nguoi xep sau no. */
  it('task nem loi: loi ve dung nguoi goi, nguoi sau van chay', async () => {
    const clock = fakeClock();
    const gate = gateWith(clock);

    const failing = gate.run(async () => {
      throw new Error('hong');
    });
    const next = gate.run(async () => 'tiep');

    await expect(failing).rejects.toThrow('hong');
    expect(await next).toEqual({ admitted: true, value: 'tiep' });
    expect(gate.pendingCount).toBe(0);
  });
});
