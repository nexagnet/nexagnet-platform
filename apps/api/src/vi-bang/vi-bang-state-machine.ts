import type { CaseStatus } from './vi-bang.types.js';

/**
 * MAY TRANG THAI HO SO — FAIL-CLOSED.
 *
 * Issue #427 chi so huu cac buoc DEN `WAITING_PAYMENT`. Cac buoc sau (`WAITING_NUMBER`, `NUMBERED`,
 * `STAMPED`, `ISSUED`, `RETURNED`) thuoc ve thanh toan / cap so / phat hanh o cac issue sau: o day
 * chung la trang thai HOP LE nhung KHONG co canh di vao nao — nen khong the nhay thang toi
 * `WAITING_NUMBER`/`NUMBERED` bang bat ky yeu cau nao. Cap issue sau them canh o DAY, cung cho nay.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<CaseStatus, readonly CaseStatus[]>> = {
  DRAFT: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_PAYMENT'],
  WAITING_PAYMENT: [],
  WAITING_NUMBER: [],
  NUMBERED: [],
  STAMPED: [],
  ISSUED: [],
  RETURNED: [],
};

/** `true` CHI khi canh `from -> to` nam trong bang. Gia tri la/khong biet -> `false`. */
export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  const next = ALLOWED_TRANSITIONS[from] as readonly CaseStatus[] | undefined;
  return next !== undefined && next.includes(to);
}

export function nextStatuses(from: CaseStatus): readonly CaseStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}
