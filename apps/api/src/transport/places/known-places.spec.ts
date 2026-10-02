import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryCounterpartyRepository,
  type CounterpartyRepository,
} from '../counterparty/counterparty.repository.js';
import { InMemoryCounterpartySiteRepository } from '../counterparty/site.repository.js';
import { CounterpartySiteService } from '../counterparty/site.service.js';
import type { CounterpartySiteView } from '../counterparty/site.types.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import {
  InMemoryGeofenceRepository,
  RepositoryGeofenceOwnerLookup,
  type Geofence,
  type GeofenceRepository,
} from '../proof/geofence.repository.js';
import { PlaceAdminViews } from './admin/place-admin.view.js';
import { KnownPlacesFactsAdapter } from './known-places.port.js';
import { buildKnownPlaces, type KnownPlaceFence, type KnownSiteName } from './known-places.js';

const fence = (
  overrides: Partial<KnownPlaceFence> & Pick<Geofence, 'id' | 'subjectKind'>,
): KnownPlaceFence => ({
  label: `Hang rao ${overrides.id}`,
  subjectId: `subject-${overrides.id}`,
  latitude: 21.0,
  longitude: 105.8,
  radiusMetres: 200,
  note: null,
  recordedBy: 'test',
  ...overrides,
});

const NO_SITES: ReadonlyMap<string, KnownSiteName> = new Map();

/** Dia diem doc duoc cho moi `subject-<id>` — hang rao dia diem khong co ten thi bi bo (#395). */
const sitesFor = (...ids: string[]): ReadonlyMap<string, KnownSiteName> =>
  new Map(
    ids.map((id) => [
      `subject-${id}`,
      { siteName: `Hang rao ${id}`, counterpartyName: `Phap nhan ${id}`, customerLinked: false },
    ]),
  );

/** Kho lien ket rong — cho adapter dung stub dia diem (khong phap nhan nao la khach hang). */
const noLinks = (): CounterpartyRepository =>
  ({ listLinksOf: vi.fn(async () => []) }) as unknown as CounterpartyRepository;

describe('dia diem da biet tu hang rao', () => {
  /** Cay xang va hang rao tam khong phai diem lay/giao cua mot don. */
  it('chi giu DEPOT, COUNTERPARTY_SITE, CUSTOMER', () => {
    const places = buildKnownPlaces(
      [
        fence({ id: 'f1', subjectKind: 'FUEL_SUPPLIER' }),
        fence({ id: 'f2', subjectKind: 'AD_HOC', subjectId: null }),
        fence({ id: 'f3', subjectKind: 'DEPOT' }),
        fence({ id: 'f4', subjectKind: 'CUSTOMER' }),
        fence({ id: 'f5', subjectKind: 'COUNTERPARTY_SITE' }),
      ],
      sitesFor('f5'),
    );

    expect(places.map((place) => place.id)).toEqual(['f3', 'f5', 'f4']);
  });

  it('COUNTERPARTY_SITE: ten = ten dia diem, dong phu = ten phap nhan', () => {
    const [place] = buildKnownPlaces(
      [
        fence({
          id: 'f1',
          subjectKind: 'COUNTERPARTY_SITE',
          subjectId: 'site-1',
          label: 'Nhan hang rao',
          latitude: 20.8264,
          longitude: 106.7752,
          radiusMetres: 300,
        }),
      ],
      new Map([
        [
          'site-1',
          {
            siteName: 'Nhà máy thép Đình Vũ',
            counterpartyName: 'Công ty CP Thép Đông Á',
            customerLinked: false,
          },
        ],
      ]),
    );

    expect(place).toEqual({
      id: 'f1',
      kind: 'COUNTERPARTY_SITE',
      kindLabel: 'Nhà máy / kho đối tác',
      name: 'Nhà máy thép Đình Vũ',
      address: null,
      detail: 'Công ty CP Thép Đông Á',
      point: { latitude: 20.8264, longitude: 106.7752 },
      radiusMetres: 300,
    });
  });

  /**
   * `#395` §2.1: nguoi tao don phai phan biet KHO CUA KHACH voi NHA MAY CUA DOI TAC — ca hai deu la
   * `COUNTERPARTY_SITE`, chi lien ket khach hang cua phap nhan noi duoc. Dia chi la cua hang rao.
   */
  it('nhan loai: bai xe / dia diem khach hang / nha may doi tac / diem khach kieu cu; kem dia chi', () => {
    const places = buildKnownPlaces(
      [
        fence({ id: 'd', subjectKind: 'DEPOT', label: 'Bãi xe Hà Nội', address: 'Thanh Trì' }),
        fence({ id: 'k', subjectKind: 'COUNTERPARTY_SITE', subjectId: 'site-kh' }),
        fence({
          id: 'p',
          subjectKind: 'COUNTERPARTY_SITE',
          subjectId: 'site-dt',
          address: 'KCN Đình Vũ',
        }),
        fence({ id: 'c', subjectKind: 'CUSTOMER', label: 'Kho cũ' }),
      ],
      new Map([
        [
          'site-kh',
          { siteName: 'Kho khách', counterpartyName: 'Công ty khách', customerLinked: true },
        ],
        [
          'site-dt',
          {
            siteName: 'Nhà máy đối tác',
            counterpartyName: 'Công ty đối tác',
            customerLinked: false,
          },
        ],
      ]),
    );

    expect(places.map((place) => [place.id, place.kindLabel, place.address])).toEqual([
      ['d', 'Bãi xe', 'Thanh Trì'],
      ['k', 'Địa điểm khách hàng', null],
      ['p', 'Nhà máy / kho đối tác', 'KCN Đình Vũ'],
      ['c', 'Điểm khách hàng (kiểu cũ)', null],
    ]);
  });

  /**
   * `#395`: dia diem KHONG con doc duoc (da nghi / phap nhan da nghi / vua bi xoa) -> hang rao BI BO.
   * Truoc #395 no lui ve nhan hang rao va van hien cho nguoi tao don chon mot kho da nghi.
   */
  it('dia diem khong con doc duoc -> BO, khong lui ve nhan hang rao', () => {
    const places = buildKnownPlaces(
      [fence({ id: 'f1', subjectKind: 'COUNTERPARTY_SITE', subjectId: 'gone', label: 'Kho cu' })],
      NO_SITES,
    );

    expect(places).toEqual([]);
  });

  it('DEPOT: ten = nhan, khong dong phu; CUSTOMER: dong phu = ten khach (#395)', () => {
    const places = buildKnownPlaces(
      [
        fence({ id: 'd', subjectKind: 'DEPOT', label: 'Bãi xe Hà Nội' }),
        fence({ id: 'c', subjectKind: 'CUSTOMER', subjectId: 'kh-1', label: 'Kho khách' }),
        fence({ id: 'c2', subjectKind: 'CUSTOMER', subjectId: 'kh-la', label: 'Kho lạ' }),
      ],
      NO_SITES,
      new Map([['kh-1', 'Công ty CP Thép Đông Á']]),
    );

    expect(places.map((place) => [place.name, place.detail])).toEqual([
      ['Bãi xe Hà Nội', null],
      ['Kho khách', 'Công ty CP Thép Đông Á'],
      ['Kho lạ', null],
    ]);
  });

  it('sap xep: DEPOT, COUNTERPARTY_SITE, CUSTOMER, roi theo ten tieng Viet', () => {
    const places = buildKnownPlaces(
      [
        fence({ id: 'c2', subjectKind: 'CUSTOMER', label: 'Kho Đông' }),
        fence({ id: 'c1', subjectKind: 'CUSTOMER', label: 'Kho Anh' }),
        fence({ id: 's1', subjectKind: 'COUNTERPARTY_SITE', label: 'Xưởng Bắc' }),
        fence({ id: 'd2', subjectKind: 'DEPOT', label: 'Bãi Đà Nẵng' }),
        fence({ id: 'd1', subjectKind: 'DEPOT', label: 'Bãi Cần Thơ' }),
      ],
      sitesFor('s1'),
    );

    expect(places.map((place) => place.id)).toEqual(['d1', 'd2', 's1', 'c1', 'c2']);
  });

  /** Mot dong hong khong duoc thanh mot cham "hop le" ma nguoi dung bam chon lam diem lay hang. */
  it('bo hang rao co toa do hong', () => {
    const places = buildKnownPlaces(
      [
        fence({ id: 'bad', subjectKind: 'DEPOT', latitude: 0, longitude: 0 }),
        fence({ id: 'nan', subjectKind: 'DEPOT', latitude: Number.NaN }),
        fence({ id: 'ok', subjectKind: 'DEPOT' }),
      ],
      NO_SITES,
    );

    expect(places.map((place) => place.id)).toEqual(['ok']);
  });
});

describe('adapter doc so hang rao', () => {
  it('doc theo LO ten dia diem, chi cho hang rao COUNTERPARTY_SITE, khong trung', async () => {
    const geofences = {
      listEffectivelyActive: vi.fn(async () => [
        fence({ id: 'f1', subjectKind: 'COUNTERPARTY_SITE', subjectId: 'site-1' }),
        fence({ id: 'f2', subjectKind: 'COUNTERPARTY_SITE', subjectId: 'site-1' }),
        fence({ id: 'f3', subjectKind: 'DEPOT', subjectId: 'DEPOT-HN', label: 'Bãi xe Hà Nội' }),
      ]),
    } as unknown as GeofenceRepository;
    const view = {
      site: { id: 'site-1', name: 'Kho Nhựa Tân Phú Hưng' },
      counterpartyId: 'cp-1',
      counterpartyName: 'Công ty TNHH Nhựa Tân Phú Hưng',
    } as unknown as CounterpartySiteView;
    const activeViews = vi.fn(async () => [view]);
    const sites = { activeViews } as unknown as CounterpartySiteService;

    const places = await new KnownPlacesFactsAdapter(geofences, sites, noLinks()).listKnownPlaces();

    expect(activeViews).toHaveBeenCalledTimes(1);
    expect(activeViews).toHaveBeenCalledWith(['site-1']);
    expect(places.map((place) => [place.kind, place.name, place.detail])).toEqual([
      ['DEPOT', 'Bãi xe Hà Nội', null],
      ['COUNTERPARTY_SITE', 'Kho Nhựa Tân Phú Hưng', 'Công ty TNHH Nhựa Tân Phú Hưng'],
      ['COUNTERPARTY_SITE', 'Kho Nhựa Tân Phú Hưng', 'Công ty TNHH Nhựa Tân Phú Hưng'],
    ]);
  });

  /**
   * KHONG N+1 phap nhan: ba dia diem cua HAI phap nhan -> MOT lan doc phap nhan theo lo, khong mot
   * lan `find` le nao. Dung service + kho THAT (trong bo nho) chu khong gia `activeViews`: chinh
   * vong doc tung phap nhan ben trong no la cai tung noi tiep.
   */
  it('ten phap nhan doc theo LO: mot lan findMany, khong mot lan find le', async () => {
    const counterparties = new InMemoryCounterpartyRepository();
    const siteRepo = new InMemoryCounterpartySiteRepository();
    const steel = await counterparties.create({ name: 'Công ty CP Thép Đông Á' });
    const plastic = await counterparties.create({ name: 'Công ty TNHH Nhựa Tân Phú Hưng' });
    const siteOf = (counterpartyId: string, name: string) =>
      siteRepo.create({
        counterpartyId,
        name,
        address: null,
        note: null,
        status: 'ACTIVE',
        recordedBy: 'test',
      });
    const sites = [
      await siteOf(steel.id, 'Nhà máy thép Đình Vũ'),
      await siteOf(steel.id, 'Kho thép Hải Dương'),
      await siteOf(plastic.id, 'Kho Nhựa Tân Phú Hưng'),
    ];
    const geofences = {
      listEffectivelyActive: async () =>
        sites.map((site, index) =>
          fence({ id: `f${index}`, subjectKind: 'COUNTERPARTY_SITE', subjectId: site.id }),
        ),
    } as unknown as GeofenceRepository;
    const find = vi.spyOn(counterparties, 'find');
    const findMany = vi.spyOn(counterparties, 'findMany');
    const listLinks = vi.spyOn(counterparties, 'listLinks');
    const listLinksOf = vi.spyOn(counterparties, 'listLinksOf');

    const places = await new KnownPlacesFactsAdapter(
      geofences,
      new CounterpartySiteService(siteRepo, counterparties),
      counterparties,
    ).listKnownPlaces();

    expect(find).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledTimes(1);
    // Lien ket khach hang (cho nhan loai) cung doc theo LO: mot lan cho moi phap nhan.
    expect(listLinks).not.toHaveBeenCalled();
    expect(listLinksOf).toHaveBeenCalledTimes(1);
    expect([...(listLinksOf.mock.calls[0]?.[0] ?? [])].sort()).toEqual(
      [steel.id, plastic.id].sort(),
    );
    expect([...(findMany.mock.calls[0]?.[0] ?? [])].sort()).toEqual([steel.id, plastic.id].sort());
    expect(places.map((place) => [place.name, place.detail])).toEqual([
      ['Kho Nhựa Tân Phú Hưng', 'Công ty TNHH Nhựa Tân Phú Hưng'],
      ['Kho thép Hải Dương', 'Công ty CP Thép Đông Á'],
      ['Nhà máy thép Đình Vũ', 'Công ty CP Thép Đông Á'],
    ]);
  });

  it('khong hang rao dia diem nao -> khong doc bang dia diem', async () => {
    const geofences = {
      listEffectivelyActive: async () => [fence({ id: 'f3', subjectKind: 'DEPOT' })],
    } as unknown as GeofenceRepository;
    const activeViews = vi.fn();
    const links = noLinks();

    await new KnownPlacesFactsAdapter(
      geofences,
      { activeViews } as unknown as CounterpartySiteService,
      links,
    ).listKnownPlaces();

    expect(activeViews).not.toHaveBeenCalled();
    expect(links.listLinksOf).not.toHaveBeenCalled();
  });
});

/**
 * `#395` — "CON HIEU LUC THAT" la MOT vi tu cua kho hang rao; dia diem da biet chi doc no. Kho, phap
 * nhan hay khach da nghi -> hang rao cua ho bien mat khoi Tao don ma KHONG ai phai tat hang rao.
 */
describe('dia diem da biet chi hien hang rao con hieu luc that (#395)', () => {
  const REGISTER = {
    latitude: 21.0,
    longitude: 105.8,
    radiusMetres: 200,
    note: null,
    recordedBy: 'test',
  } as const;

  const world = async () => {
    const counterparties = new InMemoryCounterpartyRepository();
    const siteRepo = new InMemoryCounterpartySiteRepository();
    const fleet = new InMemoryFleetRepository();
    const geofences = new InMemoryGeofenceRepository(
      new RepositoryGeofenceOwnerLookup(siteRepo, counterparties, fleet),
    );
    const party = await counterparties.create({ name: 'Công ty CP Thép Đông Á' });
    const site = await siteRepo.create({
      counterpartyId: party.id,
      name: 'Nhà máy thép Đình Vũ',
      address: null,
      note: null,
      status: 'ACTIVE',
      recordedBy: 'test',
    });
    const customer = await fleet.createCustomer({ name: 'Công ty TNHH Nhựa Tân Phú Hưng' });
    await geofences.register({
      ...REGISTER,
      label: 'Bãi xe Hà Nội',
      subjectKind: 'DEPOT',
      subjectId: 'DEPOT-HN',
    });
    await geofences.register({
      ...REGISTER,
      label: 'Nhà máy thép Đình Vũ',
      subjectKind: 'COUNTERPARTY_SITE',
      subjectId: site.id,
    });
    await geofences.register({
      ...REGISTER,
      label: 'Kho Tân Phú Hưng',
      subjectKind: 'CUSTOMER',
      subjectId: customer.id,
    });
    const adapter = new KnownPlacesFactsAdapter(
      geofences,
      new CounterpartySiteService(siteRepo, counterparties),
      counterparties,
      fleet,
    );
    return { adapter, geofences, counterparties, siteRepo, fleet, party, site, customer };
  };

  it('moi chu the con hoat dong -> ca ba hien, dong phu = ten chu', async () => {
    const { adapter } = await world();

    const places = await adapter.listKnownPlaces();

    expect(places.map((place) => [place.kind, place.name, place.detail])).toEqual([
      ['DEPOT', 'Bãi xe Hà Nội', null],
      ['COUNTERPARTY_SITE', 'Nhà máy thép Đình Vũ', 'Công ty CP Thép Đông Á'],
      ['CUSTOMER', 'Kho Tân Phú Hưng', 'Công ty TNHH Nhựa Tân Phú Hưng'],
    ]);
  });

  /**
   * `#395` §2.1: kho cua mot phap nhan DA NOI voi khach hang la "Địa điểm khách hàng" — va Tao don
   * noi DUNG nhan ma man "Dia diem van hanh" noi cho cung hang rao (mot luat, khong hai).
   */
  it('phap nhan noi voi khach hang -> "Địa điểm khách hàng"; trung nhan voi man quan tri', async () => {
    const { adapter, geofences, counterparties, siteRepo, fleet, party } = await world();
    const before = await adapter.listKnownPlaces();
    expect(before.map((place) => place.kindLabel)).toEqual([
      'Bãi xe',
      'Nhà máy / kho đối tác',
      'Điểm khách hàng (kiểu cũ)',
    ]);

    const buyer = await fleet.createCustomer({ name: 'Công ty CP Thép Đông Á (khách)' });
    await counterparties.link({
      counterpartyId: party.id,
      kind: 'CUSTOMER',
      subjectId: buyer.id,
      linkedBy: 'test',
    });
    const after = await adapter.listKnownPlaces();

    expect(after.map((place) => [place.kind, place.kindLabel, place.name])).toEqual([
      ['DEPOT', 'Bãi xe', 'Bãi xe Hà Nội'],
      ['COUNTERPARTY_SITE', 'Địa điểm khách hàng', 'Nhà máy thép Đình Vũ'],
      ['CUSTOMER', 'Điểm khách hàng (kiểu cũ)', 'Kho Tân Phú Hưng'],
    ]);
    const admin = await new PlaceAdminViews({
      geofences,
      sites: siteRepo,
      counterparties,
      customers: fleet,
      depots: { list: async () => [] },
    }).list();
    for (const place of after) {
      expect(admin.find((view) => view.id === place.id)?.kindLabel, place.name).toBe(
        place.kindLabel,
      );
    }
  });

  it('phap nhan da nghi -> dia diem cua no bien mat (hang rao van ACTIVE)', async () => {
    const { adapter, counterparties, party } = await world();
    await counterparties.update(party.id, { status: 'INACTIVE' });

    const places = await adapter.listKnownPlaces();

    expect(places.map((place) => place.kind)).toEqual(['DEPOT', 'CUSTOMER']);
  });

  it('dia diem da nghi qua duong cu -> bien mat', async () => {
    const { adapter, siteRepo, site } = await world();
    await siteRepo.update(site.id, { status: 'INACTIVE' });

    expect((await adapter.listKnownPlaces()).map((place) => place.kind)).toEqual([
      'DEPOT',
      'CUSTOMER',
    ]);
  });

  it('khach hang da nghi -> hang rao CUSTOMER kieu cu bien mat', async () => {
    const { adapter, fleet, customer } = await world();
    await fleet.updateCustomer(customer.id, { status: 'INACTIVE' });

    expect((await adapter.listKnownPlaces()).map((place) => place.kind)).toEqual([
      'DEPOT',
      'COUNTERPARTY_SITE',
    ]);
  });
});
