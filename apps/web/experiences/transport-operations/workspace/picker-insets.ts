/**
 * PHAN BAN DO BI LOP NOI CHE (`#379`) — hinh hoc THUAN cho camera cua ban do chon diem.
 *
 * ===========================================================================
 * MOI LOP NOI LA MOT PHAN BAN DO NGUOI DUNG KHONG THAY.
 *
 * The tim, bang "Đang đặt…", nut "Vị trí của tôi", the vi tri, chu giai, nut phong to cua MapLibre —
 * cai nao nam TREN ban do thi mot ghim dong khung vao do la mot ghim bi che: khong bam duoc, va vong
 * tieu diem cua no bi giau. Camera phai dua moi diem ra khoi cac phan do.
 *
 * Ham nay khong biet bo cuc nao dang dung: no nhan khung ban do va khung cua tung lop noi, va moi lop
 * noi nao DE LEN ban do day canh ma no bam vao. Doi CSS (man hep/rong, lop moi) khong can sua gi o day.
 *
 * ===========================================================================
 * CANH NAO: CANH LAM MAT IT BAN DO NHAT.
 *
 * The tim cao 300px, rong 330px, nam goc tren-trai: tinh no la le TREN thi mat 70% chieu cao, tinh
 * la le TRAI thi mat 45% chieu rong — chon trai. Bang trang thai rong nhung thap o day: chon duoi.
 */

export interface PickerInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_INSETS: PickerInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Khung cua mot phan tu, cung he toa do voi khung ban do (vd `getBoundingClientRect()`). */
export interface BoxRect {
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

/** Khoang tho giua mot ghim va mep lop noi. */
export const OVERLAY_GAP_PX = 12;

/*
 * Le quanh khung — nho hon `FIT_PADDING_PX` (48) cua ban do bao cao: ban do "Tuyến" chi doc chi cao
 * ~240px, va 48px moi phia cong phan cho coc nuot gan het chieu cao, hai dau tuyen dinh vao nhau.
 */
export const FRAME_PADDING_PX = 28;

/** Coc Lay/Giao dung TREN diem (the chu + than coc ~40px): khung phai chua cho cho no o mep tren. */
export const STAKE_HEADROOM_PX = 40;

/**
 * Phan ban do toi thieu con lai de dong khung. Lop noi to hon ban do (cua so rat nho) thi thu nho
 * cac le theo ti le: mot ghim sat mep lop noi van tot hon mot camera khong chiu chay (`fitBounds`
 * bo qua lenh khi le lon hon ban do).
 */
export const MIN_VISIBLE_FRAME_PX = 64;

type Side = keyof PickerInsets;

const SIDES: readonly Side[] = ['left', 'right', 'top', 'bottom'];

/** Phan cua lop noi DE LEN ban do; `null` = khong che gi (nam ngoai, hoac dang an). */
function clipTo(canvas: BoxRect, overlay: BoxRect): BoxRect | null {
  const clipped = {
    top: Math.max(overlay.top, canvas.top),
    bottom: Math.min(overlay.bottom, canvas.bottom),
    left: Math.max(overlay.left, canvas.left),
    right: Math.min(overlay.right, canvas.right),
  };
  return clipped.bottom <= clipped.top || clipped.right <= clipped.left ? null : clipped;
}

const areaOf = (rect: BoxRect): number => (rect.right - rect.left) * (rect.bottom - rect.top);

export function insetsForOverlays(
  canvas: BoxRect,
  overlays: readonly BoxRect[],
  gap: number = OVERLAY_GAP_PX,
): PickerInsets {
  const width = canvas.right - canvas.left;
  const height = canvas.bottom - canvas.top;
  if (width <= 0 || height <= 0) return NO_INSETS;

  /*
   * Lop LON truoc: the tim da giu le trai thi the vi tri nam ngay duoi no (cung cot) khong ton them
   * gi o le trai — xet the nho truoc thi no se chon le duoi va nuot mat chieu cao ban do.
   */
  const covered = overlays
    .map((overlay) => clipTo(canvas, overlay))
    .filter((rect): rect is BoxRect => rect !== null)
    .sort((first, second) => areaOf(second) - areaOf(first));

  return covered.reduce<PickerInsets>((insets, rect) => {
    const need: Readonly<Record<Side, number>> = {
      left: rect.right - canvas.left + gap,
      right: canvas.right - rect.left + gap,
      top: rect.bottom - canvas.top + gap,
      bottom: canvas.bottom - rect.top + gap,
    };
    /* Chi phan PHAI THEM moi la mat mat — mot le da du rong thi che them o canh do la mien phi. */
    const extraShare = (side: Side): number =>
      Math.max(0, need[side] - insets[side]) /
      (side === 'left' || side === 'right' ? width : height);
    const side = SIDES.reduce<Side>(
      (best, candidate) => (extraShare(candidate) < extraShare(best) ? candidate : best),
      'left',
    );
    return { ...insets, [side]: Math.max(insets[side], need[side]) };
  }, NO_INSETS);
}

export interface FramePadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Chia `room` cho hai le doi dien theo ti le khi chung doi nhieu hon. */
const fitPair = (room: number, first: number, second: number): readonly [number, number] => {
  const wanted = first + second;
  if (wanted <= room) return [first, second];
  if (room <= 0 || wanted <= 0) return [0, 0];
  const ratio = room / wanted;
  return [Math.floor(first * ratio), Math.floor(second * ratio)];
};

/**
 * Le cua `fitBounds`: le co dinh (+ cho cho coc o mep tren) cong phan lop noi che — va KHONG BAO GIO
 * lon toi muc khong con cho nao de dong khung.
 */
export function framePaddingFor(
  size: { readonly width: number; readonly height: number },
  insets: PickerInsets,
): FramePadding {
  const baseTop = FRAME_PADDING_PX + STAKE_HEADROOM_PX;
  const [left, right] = fitPair(
    size.width - 2 * FRAME_PADDING_PX - MIN_VISIBLE_FRAME_PX,
    insets.left,
    insets.right,
  );
  const [top, bottom] = fitPair(
    size.height - baseTop - FRAME_PADDING_PX - MIN_VISIBLE_FRAME_PX,
    insets.top,
    insets.bottom,
  );
  return {
    top: baseTop + top,
    right: FRAME_PADDING_PX + right,
    bottom: FRAME_PADDING_PX + bottom,
    left: FRAME_PADDING_PX + left,
  };
}
