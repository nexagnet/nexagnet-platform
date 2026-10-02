import { describe, expect, it, vi } from 'vitest';
import type { AuthRole } from '../../../lib/auth';
import {
  canNavigateTo,
  navigationGroups,
  parseNavigationFromSearch,
  supersededEntries,
  type NavigationInput,
} from '../navigation';
import type * as TransportActions from '../transport-actions';
import type { TransportAction } from '../transport-actions';

/**
 * #339 — MUC CU KHONG DUOC BIEN MAT KHI MUC THAY THE KHONG MO DUOC.
 *
 * `trips.supersededBy = 'movement'` chi rut `Chuyến xe` khoi danh muc chinh khi CHINH nguoi do mo
 * duoc `Đơn hàng & vòng chạy`. Hom nay khong vai that nao doc duoc chuyen ma khong doc duoc vong
 * chay, nen tinh huong nay khong dung duoc bang bang quyen that — nhung mot lan sua bang quyen sau
 * nay (mot vai moi, mot ma bi cat) se tao ra no, va luc do nguoi dung KHONG duoc mat duong duy nhat
 * vao nghiep vu chi vi danh muc da doi nhom.
 *
 * Tep rieng vi `vi.mock` ap cho CA tep: bang quyen o day co y bi cat mot ma, va khong bai nao khac
 * duoc chay tren bang do.
 */
/**
 * Ma bi cat la ma CHINH cua `Đơn hàng & vòng chạy` — `transport.order.read` tu `#395` (truoc do la
 * `transport.run.read`). Cat ca `canPerformAll`: ham do goi `canPerform` BEN TRONG module, nen mot
 * `vi.mock` chi thay `canPerform` xuat ra se khong cham toi no.
 */
const CUT: TransportAction = 'transport.order.read';

vi.mock('../transport-actions', async (importOriginal) => {
  const original = await importOriginal<typeof TransportActions>();
  const cutCanPerform = (role: AuthRole | null, action: TransportAction): boolean =>
    action === CUT ? false : original.canPerform(role, action);
  return {
    ...original,
    canPerform: cutCanPerform,
    canPerformAll: (role: AuthRole | null, actions: readonly TransportAction[]): boolean =>
      actions.every((action) => cutCanPerform(role, action)),
  };
});

const input: NavigationInput = { capabilities: ['transport-core'], role: 'ADMIN' };

describe('#339 — muc thay the khong mo duoc thi muc cu o lai danh muc chinh', () => {
  it('dieu kien cua bai: `Đơn hàng & vòng chạy` dong, `Chuyến xe` mo', () => {
    expect(canNavigateTo('movement', input)).toBe(false);
    expect(canNavigateTo('trips', input)).toBe(true);
  });

  it('`Chuyến xe` van nam tren danh muc chinh, va loi phu rong', () => {
    const primary = navigationGroups(input).flatMap((entry) =>
      entry.sections.map((section) => section.id),
    );
    expect(primary).toContain('trips');
    expect(primary).not.toContain('movement');
    expect(supersededEntries(input)).toEqual([]);
  });

  it('dia chi cu van mo dung man do', () => {
    expect(parseNavigationFromSearch('?section=trips', input).section).toBe('trips');
  });
});
