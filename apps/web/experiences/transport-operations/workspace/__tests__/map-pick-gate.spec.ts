import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPickGate, PICK_SETTLE_MS } from '../map-pick-gate';

/*
 * `#379` — bam DUP de phong to KHONG BAO GIO la hai lan chon diem.
 *
 * MapLibre phat `click` cho CA HAI lan bam cua mot cu bam dup. Neu moi `click` la mot lan chon, cu
 * bam dup de phong to dat diem LAY vao cho vua phong to, tu chuyen o, roi dat luon diem GIAO vao
 * cung cho do — dung loi nham lay/giao ma man hinh sinh ra de chan.
 */

describe('cong chon diem tren ban do', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const gateWithLog = () => {
    const picks: string[] = [];
    const gate = createPickGate<string>((value) => picks.push(value));
    return { gate, picks };
  };

  it('mot lan bam -> chon SAU khoang cho, khong chon ngay', () => {
    const { gate, picks } = gateWithLog();
    gate.click('A', 1);
    expect(picks).toEqual([]);
    vi.advanceTimersByTime(PICK_SETTLE_MS - 1);
    expect(picks).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(picks).toEqual(['A']);
  });

  it('bam dup bang chuot (detail 1 roi 2) -> khong chon diem nao', () => {
    const { gate, picks } = gateWithLog();
    gate.click('A', 1);
    vi.advanceTimersByTime(120);
    gate.click('A', 2);
    vi.advanceTimersByTime(PICK_SETTLE_MS * 3);
    expect(picks).toEqual([]);
  });

  it('cham dup tren dien thoai (hai lan deu bao detail 1) -> khong chon diem nao', () => {
    const { gate, picks } = gateWithLog();
    gate.click('A', 1);
    vi.advanceTimersByTime(150);
    gate.click('B', 1);
    vi.advanceTimersByTime(PICK_SETTLE_MS * 3);
    expect(picks).toEqual([]);
  });

  it('su kien dblclick huy lan bam dang cho', () => {
    const { gate, picks } = gateWithLog();
    gate.click('A', 1);
    gate.cancel();
    vi.advanceTimersByTime(PICK_SETTLE_MS * 3);
    expect(picks).toEqual([]);
  });

  it('lan bam thu ba cua mot chuoi (detail 3) cung bi bo qua', () => {
    const { gate, picks } = gateWithLog();
    gate.click('A', 1);
    gate.click('A', 2);
    gate.click('A', 3);
    vi.advanceTimersByTime(PICK_SETTLE_MS * 3);
    expect(picks).toEqual([]);
  });

  it('bam lai sau khi het khoang cho la mot lan chon moi', () => {
    const { gate, picks } = gateWithLog();
    gate.click('A', 1);
    vi.advanceTimersByTime(PICK_SETTLE_MS);
    gate.click('B', 1);
    vi.advanceTimersByTime(PICK_SETTLE_MS);
    expect(picks).toEqual(['A', 'B']);
  });

  it('sau mot cu bam dup, lan bam don ke tiep van chon duoc', () => {
    const { gate, picks } = gateWithLog();
    gate.click('A', 1);
    gate.click('A', 2);
    vi.advanceTimersByTime(PICK_SETTLE_MS * 2);
    gate.click('C', 1);
    vi.advanceTimersByTime(PICK_SETTLE_MS);
    expect(picks).toEqual(['C']);
  });

  it('dung dong ho duoc tiem vao — khong phu thuoc dong ho toan cuc', () => {
    const scheduled: Array<() => void> = [];
    const cleared: number[] = [];
    const picks: string[] = [];
    const gate = createPickGate<string, number>((value) => picks.push(value), {
      set: (run) => scheduled.push(run),
      clear: (handle) => cleared.push(handle),
    });
    gate.click('A', 1);
    expect(scheduled).toHaveLength(1);
    gate.click('A', 2);
    expect(cleared).toEqual([1]);
    expect(picks).toEqual([]);
  });
});
