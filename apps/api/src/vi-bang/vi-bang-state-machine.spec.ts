import { describe, expect, it } from 'vitest';
import { canTransition, nextStatuses } from './vi-bang-state-machine.js';
import { CASE_STATUSES, type CaseStatus } from './vi-bang.types.js';

describe('vi-bang state machine', () => {
  it('chi cho phep hai canh den WAITING_PAYMENT', () => {
    const allowed = CASE_STATUSES.flatMap((from) =>
      CASE_STATUSES.filter((to) => canTransition(from, to)).map((to) => `${from}->${to}`),
    );
    expect(allowed).toEqual(['DRAFT->IN_PROGRESS', 'IN_PROGRESS->WAITING_PAYMENT']);
  });

  it.each(['WAITING_NUMBER', 'NUMBERED', 'STAMPED', 'ISSUED', 'RETURNED'] as const)(
    'khong cho nhay thang toi %s tu bat ky trang thai nao',
    (to) => {
      for (const from of CASE_STATUSES) expect(canTransition(from, to)).toBe(false);
    },
  );

  it('khong co canh di ra tu WAITING_PAYMENT hay trang thai cuoi trong issue nay', () => {
    expect(nextStatuses('WAITING_PAYMENT')).toEqual([]);
    expect(nextStatuses('RETURNED')).toEqual([]);
  });

  it('fail-closed voi gia tri la', () => {
    expect(canTransition('NOPE' as CaseStatus, 'IN_PROGRESS')).toBe(false);
    expect(canTransition('DRAFT', 'NOPE' as CaseStatus)).toBe(false);
    expect(canTransition('DRAFT', 'DRAFT')).toBe(false);
  });
});
