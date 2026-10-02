import { describe, expect, it } from 'vitest';
import {
  FRAME_PADDING_PX,
  framePaddingFor,
  insetsForOverlays,
  MIN_VISIBLE_FRAME_PX,
  NO_INSETS,
  OVERLAY_GAP_PX,
  STAKE_HEADROOM_PX,
  type BoxRect,
} from '../picker-insets';

/*
 * `#379` — camera cua ban do chon diem KHONG dong khung mot ghim vao duoi mot lop noi: the tim, bang
 * "Đang đặt…", nut vi tri, chu giai, nut phong to.
 */

const box = (left: number, top: number, width: number, height: number): BoxRect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

/* Ban do man rong 1366x768: 666 x 520, goc tren-trai o (600, 150). */
const WIDE_CANVAS = box(600, 150, 666, 520);

describe('phan ban do bi lop noi che', () => {
  it('khong co lop noi -> khong le', () => {
    expect(insetsForOverlays(WIDE_CANVAS, [])).toEqual(NO_INSETS);
  });

  it('lop noi nam NGOAI ban do (the tim tren ban do o man hep) -> khong tinh', () => {
    const finderAboveMap = box(600, 20, 666, 120);
    const legendBelowMap = box(600, 680, 666, 40);
    expect(insetsForOverlays(WIDE_CANVAS, [finderAboveMap, legendBelowMap])).toEqual(NO_INSETS);
  });

  it('lop noi rong 0 (the dang an) -> khong tinh', () => {
    expect(insetsForOverlays(WIDE_CANVAS, [box(610, 160, 0, 0)])).toEqual(NO_INSETS);
  });

  it('the tim cao ben trai -> le TRAI, khong phai le tren (mat it ban do hon)', () => {
    const finder = box(610, 160, 308, 300);
    const insets = insetsForOverlays(WIDE_CANVAS, [finder]);
    expect(insets.left).toBe(610 + 308 - 600 + OVERLAY_GAP_PX);
    expect(insets.top).toBe(0);
  });

  it('bang trang thai rong, thap o giua-duoi -> le DUOI', () => {
    const banner = box(800, 150 + 520 - 28 - 52, 420, 52);
    const insets = insetsForOverlays(WIDE_CANVAS, [banner]);
    expect(insets.bottom).toBe(28 + 52 + OVERLAY_GAP_PX);
    expect(insets.left).toBe(0);
  });

  it('chu giai noi o goc tren-phai -> le PHAI (ghim khong nam duoi chu giai)', () => {
    const legend = box(600 + 666 - 8 - 130, 150 + 74, 130, 150);
    const insets = insetsForOverlays(WIDE_CANVAS, [legend]);
    expect(insets.right).toBe(8 + 130 + OVERLAY_GAP_PX);
    expect(insets.top).toBe(0);
  });

  it('nut phong to cua MapLibre (goc tren-phai) -> le PHAI', () => {
    const zoom = box(600 + 666 - 10 - 29, 160, 29, 58);
    expect(insetsForOverlays(WIDE_CANVAS, [zoom]).right).toBe(10 + 29 + OVERLAY_GAP_PX);
  });

  it('man hep: bang trang thai ngang dau ban do -> le TREN; nut vi tri goc duoi -> le DUOI', () => {
    const canvas = box(16, 900, 358, 464);
    const banner = box(24, 908, 300, 96);
    const locate = box(24, 900 + 464 - 8 - 44, 150, 44);
    const insets = insetsForOverlays(canvas, [banner, locate]);
    expect(insets.top).toBe(8 + 96 + OVERLAY_GAP_PX);
    expect(insets.bottom).toBe(8 + 44 + OVERLAY_GAP_PX);
    expect(insets.left).toBe(0);
  });

  it('the vi tri nam duoi the tim (cung cot trai) khong ton them chieu cao ban do', () => {
    const finder = box(610, 160, 308, 300);
    const card = box(610, 480, 308, 120);
    const expected = { top: 0, right: 0, bottom: 0, left: 610 + 308 - 600 + OVERLAY_GAP_PX };
    expect(insetsForOverlays(WIDE_CANVAS, [finder, card])).toEqual(expected);
    // Thu tu dua vao khong doi ket qua.
    expect(insetsForOverlays(WIDE_CANVAS, [card, finder])).toEqual(expected);
  });
});

describe('le cua fitBounds', () => {
  it('le = le co dinh + phan bi che; mep tren con cho cho coc', () => {
    expect(
      framePaddingFor({ width: 666, height: 520 }, { top: 0, right: 51, bottom: 92, left: 330 }),
    ).toEqual({
      top: FRAME_PADDING_PX + STAKE_HEADROOM_PX,
      right: FRAME_PADDING_PX + 51,
      bottom: FRAME_PADDING_PX + 92,
      left: FRAME_PADDING_PX + 330,
    });
  });

  it('lop noi to hon ban do -> thu nho theo ti le, van con mot khung de dong', () => {
    const size = { width: 400, height: 300 };
    const padding = framePaddingFor(size, { top: 150, right: 200, bottom: 150, left: 300 });
    expect(size.width - padding.left - padding.right).toBeGreaterThanOrEqual(MIN_VISIBLE_FRAME_PX);
    expect(size.height - padding.top - padding.bottom).toBeGreaterThanOrEqual(MIN_VISIBLE_FRAME_PX);
    // Van giu ti le: canh bi che nhieu hon van co le lon hon.
    expect(padding.left).toBeGreaterThan(padding.right);
  });
});
