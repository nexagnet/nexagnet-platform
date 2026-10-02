import { describe, expect, it } from 'vitest';
import type { PlaceAdminView } from '../admin-types';
import {
  buildCreatePlaceInput,
  buildUpdatePlaceInput,
  depotSummary,
  editPlaceDraft,
  filterPlaces,
  geometryChanged,
  isEmptyPatch,
  isStandbyDepot,
  kindCounts,
  newPlaceDraft,
  NEW_COUNTERPARTY,
  nudgePoint,
  isOwnerChoiceAllowed,
  needsCounterpartyManage,
  placeDraftProblems,
  placeFieldLocks,
  placeHistoryLabel,
  placeKindFilterOf,
  placeKindLabel,
  placeMarkers,
  placeOwnerLine,
  placeRings,
  placeStatusLabel,
  savedNotice,
  withLookupFill,
  withOwnerChoice,
  withPoint,
} from '../places-model';

const place = (
  overrides: Partial<PlaceAdminView> & { id: string; name: string },
): PlaceAdminView => ({
  kind: 'COUNTERPARTY_SITE',
  kindLabel: '',
  address: null,
  point: { latitude: 21, longitude: 105.8 },
  radiusMetres: 300,
  status: 'ACTIVE',
  effectiveStatus: 'ACTIVE',
  note: null,
  owner: {
    counterpartyId: 'cp-1',
    counterpartyName: 'Công ty Thép Đông Á',
    siteId: `site-${overrides.id}`,
    siteName: overrides.name,
  },
  depot: null,
  conflicts: [],
  updatedAt: '2026-09-25T00:00:00.000Z',
  ...overrides,
});

const DEPOT_HN = place({
  id: 'd1',
  name: 'Bãi xe Hà Nội',
  kind: 'DEPOT',
  owner: null,
  depot: { code: 'DEPOT-HN', plannerStatus: 'IN_USE', source: 'MANAGED' },
});
const DEPOT_HP = place({
  id: 'd2',
  name: 'Bãi xe Hải Phòng',
  kind: 'DEPOT',
  owner: null,
  status: 'INACTIVE',
  effectiveStatus: 'INACTIVE',
  depot: { code: 'DEPOT-HP', plannerStatus: 'STANDBY', source: 'MANAGED' },
});
const CUSTOMER_SITE = place({
  id: 's1',
  name: 'Kho Nhựa Tân Phú Hưng',
  owner: {
    counterpartyId: 'cp-2',
    counterpartyName: 'Công ty TNHH Nhựa Tân Phú Hưng',
    customerId: 'cus-2',
    customerName: 'Công ty TNHH Nhựa Tân Phú Hưng',
    siteId: 'site-s1',
    siteName: 'Kho Nhựa Tân Phú Hưng',
  },
});
const PARTNER_SITE = place({ id: 's2', name: 'Nhà máy thép Đình Vũ' });
const LEGACY = place({ id: 'c1', name: 'Kho cũ', kind: 'CUSTOMER', owner: null });
const ALL = [PARTNER_SITE, LEGACY, DEPOT_HP, CUSTOMER_SITE, DEPOT_HN];

describe('loai va chu cua dia diem (#395 §2.1)', () => {
  it('nhan loai: bai xe · dia diem khach hang · nha may/kho doi tac · kieu cu', () => {
    expect(ALL.map((entry) => placeKindLabel(entry))).toEqual([
      'Nhà máy / kho đối tác',
      'Điểm khách hàng (kiểu cũ)',
      'Bãi xe',
      'Địa điểm khách hàng',
      'Bãi xe',
    ]);
    // Nhan may chu tra thang moi suy luan cua man hinh.
    expect(placeKindLabel({ ...PARTNER_SITE, kindLabel: 'Địa điểm khách hàng' })).toBe(
      'Địa điểm khách hàng',
    );
  });

  it('dong chu: bai xe cua cong ty; khach hang kem phap nhan khi khac ten', () => {
    expect(placeOwnerLine(DEPOT_HN)).toBe('Bãi xe của công ty');
    expect(placeOwnerLine(CUSTOMER_SITE)).toBe('Khách hàng Công ty TNHH Nhựa Tân Phú Hưng');
    expect(placeOwnerLine(PARTNER_SITE)).toBe('Công ty Thép Đông Á');
    expect(placeOwnerLine(LEGACY)).toBe('Chưa rõ chủ địa điểm');
  });
});

describe('danh sach — loc, dem, thu tu', () => {
  it('mac dinh chi dia diem dang dung, bai xe dau tien', () => {
    expect(
      filterPlaces(ALL, { kind: 'ALL', status: 'active', query: '' }).map((entry) => entry.id),
    ).toEqual(['d1', 's1', 's2', 'c1']);
    expect(
      filterPlaces(ALL, { kind: 'ALL', status: 'inactive', query: '' }).map((entry) => entry.id),
    ).toEqual(['d2']);
  });

  it('tim khong dau theo ten, dia chi, chu', () => {
    expect(
      filterPlaces(ALL, { kind: 'ALL', status: 'all', query: 'dinh vu' }).map((entry) => entry.id),
    ).toEqual(['s2']);
    expect(
      filterPlaces(ALL, { kind: 'ALL', status: 'all', query: 'tan phu' }).map((entry) => entry.id),
    ).toEqual(['s1']);
  });

  it('dem theo loai khop dung bang dang loc', () => {
    expect(kindCounts(ALL, 'all')).toEqual({
      ALL: 5,
      DEPOT: 2,
      CUSTOMER_SITE: 1,
      PARTNER_SITE: 1,
      LEGACY_CUSTOMER: 1,
    });
    expect(kindCounts(ALL, 'active').DEPOT).toBe(1);
  });
});

describe('the bai xe noi HAU QUA voi khau lap ke hoach', () => {
  it('bai du phong goi dung ten nghiep vu, khong goi "Đã tắt"', () => {
    expect(isStandbyDepot(DEPOT_HP)).toBe(true);
    expect(placeStatusLabel(DEPOT_HP)).toBe('Bãi dự phòng');
    expect(isStandbyDepot(DEPOT_HN)).toBe(false);
    expect(placeStatusLabel(DEPOT_HN)).toBe('Đang dùng');
    expect(placeStatusLabel({ ...DEPOT_HP, depot: null })).toBe('Đã tắt');
  });

  it('mot bai dang dung + bai du phong', () => {
    const summary = depotSummary(ALL);
    expect(summary.tone).toBe('go');
    expect(summary.primary?.id).toBe('d1');
    expect(summary.title).toBe(
      'Bãi xe Hà Nội — đang dùng để lập kế hoạch chặng rỗng và đóng vòng chạy',
    );
    expect(summary.detail).toBe('Bãi dự phòng: Bãi xe Hải Phòng.');
  });

  it('nhieu bai dang bat → he thong khong dung bai nao', () => {
    const ambiguous = [
      { ...DEPOT_HN, depot: { code: 'A', plannerStatus: 'AMBIGUOUS' as const } },
      { ...DEPOT_HP, depot: { code: 'B', plannerStatus: 'AMBIGUOUS' as const } },
    ];
    expect(depotSummary(ambiguous)).toMatchObject({
      tone: 'stop',
      title: 'Nhiều bãi đang bật — hệ thống không dùng bãi nào',
    });
  });

  it('chua co bai nao', () => {
    expect(depotSummary([PARTNER_SITE]).title).toBe('Chưa có bãi xe đang dùng');
  });

  it('bai moi khi da co bai dang dung → noi ro la bai du phong', () => {
    expect(savedNotice(DEPOT_HP, true)).toContain('làm bãi dự phòng');
    expect(savedNotice(DEPOT_HN, true)).toBe('Đã thêm Bãi xe Hà Nội.');
    expect(savedNotice(DEPOT_HN, false)).toBe('Đã lưu Bãi xe Hà Nội.');
  });
});

describe('ban do: ghim theo loai, vong ban kinh, ghim dang sua', () => {
  it('ghim dang sua thay ghim cu cua chinh dia diem do, keo duoc', () => {
    const markers = placeMarkers(ALL, 's2', { latitude: 20.9, longitude: 106.7 }, 's2');
    expect(markers.find((marker) => marker.key === 'place:s2')).toBeUndefined();
    expect(markers.at(-1)).toMatchObject({ kind: 'PLACE', isDraggable: true, badge: 'Đây' });
    expect(markers.find((marker) => marker.key === 'place:d1')?.label).toBe(
      'Bãi xe: Bãi xe Hà Nội',
    );
  });

  it('vong ban kinh: moi dia diem dang dung + vong dang sua', () => {
    const rings = placeRings(ALL, {
      point: { latitude: 20.9, longitude: 106.7 },
      radiusMetres: 450,
      placeId: null,
    });
    expect(rings).toHaveLength(5);
    expect(rings.at(-1)).toEqual({
      center: { latitude: 20.9, longitude: 106.7 },
      radiusMetres: 450,
    });
  });

  it('nudge ~10 m bang ban phim', () => {
    const start = { latitude: 21, longitude: 105.8 };
    expect(nudgePoint(start, 'N', 10).latitude).toBeCloseTo(21.0000898, 6);
    expect(nudgePoint(start, 'W', 10).longitude).toBeLessThan(105.8);
  });
});

describe('trinh sua: "Địa điểm này của ai?" → than yeu cau', () => {
  const point = { latitude: 21.03, longitude: 105.85 };

  it('them moi: phai tra loi cau hoi dau tien, dat vi tri va dat ten', () => {
    expect(placeDraftProblems(newPlaceDraft())).toEqual([
      'Chọn “Địa điểm này của ai?”.',
      'Đặt vị trí trên bản đồ.',
      'Nhập tên địa điểm.',
    ]);
  });

  it('bai xe cua cong ty', () => {
    const draft = {
      ...withPoint(withOwnerChoice(newPlaceDraft(), 'DEPOT'), point, 'MAP'),
      name: ' Bãi xe Bắc Ninh ',
    };
    expect(buildCreatePlaceInput(draft)).toEqual({
      kind: 'DEPOT',
      name: 'Bãi xe Bắc Ninh',
      address: null,
      point,
      radiusMetres: 250,
      note: null,
    });
  });

  it('kho cua khach hang → chu la khach hang', () => {
    const base = withPoint(withOwnerChoice(newPlaceDraft(), 'CUSTOMER'), point, 'PASTE');
    expect(placeDraftProblems({ ...base, name: 'Kho A' })).toEqual(['Chọn khách hàng.']);
    expect(buildCreatePlaceInput({ ...base, name: 'Kho A', customerId: 'cus-2' })).toMatchObject({
      kind: 'COUNTERPARTY_SITE',
      owner: { customerId: 'cus-2' },
    });
  });

  it('don vi moi ngay trong trinh sua', () => {
    const base = {
      ...withPoint(withOwnerChoice(newPlaceDraft(), 'PARTNER'), point, 'MAP'),
      name: 'Cảng Chùa Vẽ',
      counterpartyId: NEW_COUNTERPARTY,
    };
    expect(placeDraftProblems(base)).toEqual(['Nhập tên đơn vị mới.']);
    expect(
      buildCreatePlaceInput({
        ...base,
        newCounterpartyName: 'Cảng Hải Phòng',
        newCounterpartyTaxCode: ' ',
      }),
    ).toMatchObject({
      owner: { newCounterparty: { name: 'Cảng Hải Phòng', taxCode: null } },
    });
  });

  it('sua: chi gui truong da doi; doi vi tri/ban kinh thi canh bao cham lai chung cu', () => {
    const draft = editPlaceDraft(PARTNER_SITE);
    expect(geometryChanged(draft)).toBe(false);
    const noteOnly = buildUpdatePlaceInput({ ...draft, note: 'Cổng 2' });
    expect(noteOnly).toEqual({ note: 'Cổng 2' });
    const same = buildUpdatePlaceInput(draft);
    expect(same !== null && isEmptyPatch(same)).toBe(true);
    const moved = withPoint(draft, { latitude: 21.001, longitude: 105.8 }, 'DRAG');
    expect(geometryChanged(moved)).toBe(true);
    expect(buildUpdatePlaceInput({ ...moved, radiusMetres: 500 }, true)).toEqual({
      point: { latitude: 21.001, longitude: 105.8 },
      radiusMetres: 500,
      acknowledgeOpenWork: true,
    });
  });

  it('ban kinh ngoai khoang cua may chu la loi', () => {
    const draft = { ...editPlaceDraft(PARTNER_SITE), radiusMetres: 5 };
    expect(placeDraftProblems(draft)).toEqual(['Bán kính phải là số nguyên từ 10 đến 100.000 m.']);
  });
});

describe('#395 — hop dong may chu moi, va duong lui cho may chu cu', () => {
  it('loai hien thi: uu tien `displayKind` cua may chu, thieu thi suy tu chu', () => {
    const customerSite = place({
      id: 's1',
      name: 'Kho A',
      owner: {
        counterpartyId: 'cp-1',
        counterpartyName: 'Công ty A',
        customerId: 'cus-1',
        customerName: 'Công ty A',
        siteId: 'site-1',
        siteName: 'Kho A',
      },
    });
    expect(placeKindFilterOf(customerSite)).toBe('CUSTOMER_SITE');
    // May chu biet phap nhan KHONG con mat khach hang du ban ghi con `customerId` cu.
    expect(placeKindFilterOf({ ...customerSite, displayKind: 'PARTNER_SITE' })).toBe(
      'PARTNER_SITE',
    );
  });

  it('diem khach hang kieu cu khong co phap nhan: dong chu khong vo, khong in `null`', () => {
    const legacy = place({
      id: 'l1',
      name: 'Kho cũ',
      kind: 'CUSTOMER',
      owner: {
        counterpartyId: null,
        counterpartyName: null,
        customerId: 'cus-9',
        customerName: 'Khách Cũ',
        siteId: null,
        siteName: null,
      },
    });
    expect(placeOwnerLine(legacy)).toBe('Khách hàng Khách Cũ');
    expect(placeOwnerLine({ ...legacy, owner: { ...legacy.owner!, customerName: null } })).toBe(
      'Chưa rõ chủ địa điểm',
    );
  });

  it('ma so thue cua don vi moi: 10 so hoac 10-3 so, bo trong duoc', () => {
    const draft = {
      ...withPoint(
        withOwnerChoice(newPlaceDraft(), 'PARTNER'),
        { latitude: 21, longitude: 105.8 },
        'MAP',
      ),
      name: 'Kho B',
      counterpartyId: NEW_COUNTERPARTY,
      newCounterpartyName: 'Công ty B',
    };
    const taxProblem = (taxCode: string) =>
      placeDraftProblems({ ...draft, newCounterpartyTaxCode: taxCode }).some((entry) =>
        entry.startsWith('Mã số thuế'),
      );
    expect(taxProblem('')).toBe(false);
    expect(taxProblem('0101234567')).toBe(false);
    expect(taxProblem('0101234567-001')).toBe(false);
    expect(taxProblem('12345')).toBe(true);
    expect(taxProblem('0101234567-1')).toBe(true);
  });

  it('dia diem cua don vi khac doi them quyen quan ly doi tac; bai xe thi khong', () => {
    expect(isOwnerChoiceAllowed('DEPOT', false)).toBe(true);
    expect(isOwnerChoiceAllowed('CUSTOMER', false)).toBe(false);
    expect(isOwnerChoiceAllowed('PARTNER', true)).toBe(true);
    expect(needsCounterpartyManage(DEPOT_HN)).toBe(false);
    expect(needsCounterpartyManage(place({ id: 'x', name: 'Kho X' }))).toBe(true);
  });

  it('CHI dia diem phap nhan doi quyen doi tac — diem khach hang kieu cu thi khong (nhu may chu)', () => {
    expect(needsCounterpartyManage(CUSTOMER_SITE)).toBe(true);
    expect(needsCounterpartyManage(PARTNER_SITE)).toBe(true);
    expect(needsCounterpartyManage(LEGACY)).toBe(false);
    expect(needsCounterpartyManage(DEPOT_HP)).toBe(false);
  });

  it('khoa ten VA dia chi cua dia diem phap nhan khi thieu quyen doi tac; vi tri van sua duoc', () => {
    expect(placeFieldLocks(PARTNER_SITE, false)).toEqual({ name: true, address: true });
    expect(placeFieldLocks(CUSTOMER_SITE, false)).toEqual({ name: true, address: true });
    expect(placeFieldLocks(PARTNER_SITE, true)).toEqual({ name: false, address: false });
    expect(placeFieldLocks(LEGACY, false)).toEqual({ name: false, address: false });
    expect(placeFieldLocks(DEPOT_HN, false)).toEqual({ name: false, address: false });
    // Them moi: loai chu da bi chan tu cau hoi "Dia diem nay cua ai?" — khong khoa o nao.
    expect(placeFieldLocks(null, false)).toEqual({ name: false, address: false });
  });

  it('tim nguoc KHONG dien vao o bi khoa — luu se khong gui thay doi ma may chu tu choi', () => {
    const original = { ...PARTNER_SITE, address: null };
    const moved = withPoint(
      editPlaceDraft(original),
      { latitude: 21.01, longitude: 105.81 },
      'MAP',
    );
    const found = { label: 'Đường Láng', address: '12 Đường Láng, Đống Đa, Hà Nội' };

    const locked = withLookupFill(moved, found, placeFieldLocks(original, false));
    expect(locked.name).toBe('Nhà máy thép Đình Vũ');
    expect(locked.address).toBe('');
    const patch = buildUpdatePlaceInput(locked);
    expect(patch).not.toHaveProperty('address');
    expect(patch).not.toHaveProperty('name');
    expect(patch).toHaveProperty('point');

    const open = withLookupFill(moved, found, placeFieldLocks(original, true));
    expect(open.address).toBe('12 Đường Láng, Đống Đa, Hà Nội');
    expect(open.name).toBe('Nhà máy thép Đình Vũ');
    expect(withLookupFill(newPlaceDraft(), found, placeFieldLocks(null, false))).toMatchObject({
      name: 'Đường Láng',
      address: '12 Đường Láng, Đống Đa, Hà Nội',
    });
  });

  it('lich su: cau may chu neu co, khong thi ten viec — khong bao gio lo ma', () => {
    expect(placeHistoryLabel({ action: 'transport.place.make_primary_depot' })).toBe(
      'Đặt làm bãi chính',
    );
    expect(
      placeHistoryLabel({ action: 'transport.place.update', summary: 'Đổi bán kính 250 → 300 m' }),
    ).toBe('Đổi bán kính 250 → 300 m');
    expect(placeHistoryLabel({ action: 'transport.something.new' })).toBe('Thay đổi khác');
  });

  it('lich su: dia diem tao qua duong dang ky CU (`POST /transport/geofences`) la "Thêm địa điểm"', () => {
    expect(placeHistoryLabel({ action: 'transport.geofence.register' })).toBe('Thêm địa điểm');
  });

  it('lich su: ly do tat (`after.reason`) doc lai duoc — hop thoai hua "ghi vào lịch sử"', () => {
    expect(
      placeHistoryLabel({
        action: 'transport.place.deactivate',
        after: { status: 'INACTIVE', reason: 'Đối tác chuyển kho' },
      }),
    ).toBe('Tắt địa điểm — Đối tác chuyển kho');
    // May chu da tu noi ly do trong cau thi khong lap lai.
    expect(
      placeHistoryLabel({
        action: 'transport.place.deactivate',
        summary: 'Tắt địa điểm — Đối tác chuyển kho',
        after: { reason: 'Đối tác chuyển kho' },
      }),
    ).toBe('Tắt địa điểm — Đối tác chuyển kho');
    expect(placeHistoryLabel({ action: 'transport.place.activate', after: { reason: '  ' } })).toBe(
      'Bật lại địa điểm',
    );
  });
});
