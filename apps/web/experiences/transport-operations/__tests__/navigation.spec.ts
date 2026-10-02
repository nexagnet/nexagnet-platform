import { EXPERIENCE_REQUIREMENTS, type CapabilityId } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import {
  buildDriverUrl,
  buildSectionUrl,
  canNavigateTo,
  DRIVER_SCREENS,
  filterNavigationGroups,
  navigationGroups,
  parseNavigationFromSearch,
  resolveNavigation,
  resolveSection,
  shouldProbeStakeholderScope,
  SUPERSEDED_HEADING,
  supersededEntries,
  supersededNote,
  TRANSPORT_SECTION_GROUPS,
  TRANSPORT_SECTIONS,
  visibleDriverScreens,
  visibleSections,
  type NavigationInput,
  type TransportSection,
  type TransportSectionId,
} from '../navigation';
import { actionsForRole, type TransportAction } from '../transport-actions';

/**
 * Kien truc thong tin la mot HOP DONG. Bo test nay giu no dung ba dieu ma #161 doi:
 * loc theo nang luc + vai, che `TX-06`/`TX-07`, va dia chi song sot qua tai lai/back/forward.
 */

/** Nang luc TOI THIEU cua experience nay — ghim thang vao hop dong cua `packages/tenant`. */
const MINIMUM: readonly CapabilityId[] = EXPERIENCE_REQUIREMENTS['transport-operations'];
const FULL: readonly CapabilityId[] = [
  ...MINIMUM,
  'transport-costing',
  'transport-fuel',
  'transport-settlement',
];

const FIRST_UAT: readonly CapabilityId[] = [...FULL, 'transport-toll'];

/**
 * Hai ma cua T6 — CO THAT trong `CapabilityId` tu khi PR #152 vao `main`. Truoc day bo test nay
 * phai `as unknown as` de dien lai mot tinh huong tuong lai; nay khong con phai, va do chinh la
 * y nghia cua §4.2 trong #180: cho tam bang chuoi da duoc thay bang kieu that.
 */
const T6_CAPABILITIES: readonly CapabilityId[] = [
  'transport-asset-compliance',
  'transport-workforce',
];

const director = (capabilities: readonly CapabilityId[] = FULL): NavigationInput => ({
  capabilities,
  role: 'ADMIN',
});
const accountant = (capabilities: readonly CapabilityId[] = FULL): NavigationInput => ({
  capabilities,
  role: 'ACCOUNTING',
});
const driver = (capabilities: readonly CapabilityId[] = FULL): NavigationInput => ({
  capabilities,
  role: 'SALE',
});
const manager = (capabilities: readonly CapabilityId[] = FULL): NavigationInput => ({
  capabilities,
  role: 'MANAGER',
});
const unknownRole = (capabilities: readonly CapabilityId[] = FULL): NavigationInput => ({
  capabilities,
  role: null,
});

const idsOf = (input: NavigationInput): readonly string[] =>
  visibleSections(input).map((section) => section.id);

describe('nang luc toi thieu — chi bat transport-core', () => {
  it('experience nay chi doi transport-core, nen moi muc khac phai tu khai nang luc rieng', () => {
    expect(MINIMUM).toEqual(['transport-core']);
  });

  it('khach chi bat transport-core khong thay muc chi phi, nhien lieu hay quyet toan', () => {
    const visible = idsOf(director(MINIMUM));
    expect(visible).toContain('movement');
    expect(visible).toContain('fleet');
    expect(visible).not.toContain('driver-fund');
    expect(visible).not.toContain('fuel');
    expect(visible).not.toContain('settlement');
  });

  it('bat them costing va fuel thi dung hai muc do hien ra', () => {
    const visible = idsOf(director(['transport-core', 'transport-costing', 'transport-fuel']));
    expect(visible).toContain('driver-fund');
    expect(visible).toContain('fuel');
    expect(visible).not.toContain('settlement');
  });
});

describe('Lane W — first UAT scope', () => {
  it('keeps ETC outside the owner navigation even when the preview capability remains enabled', () => {
    expect(
      idsOf({
        ...director(FIRST_UAT),
        blockedCapabilityKeys: ['transport-toll'],
      }),
    ).not.toContain('toll');
  });
});

describe('TX-06 / TX-07 — theo dung nang luc khach da bat, khong phai mot cho trong chet', () => {
  it('hai muc bao duong va luong an khi khach KHONG bat hai nang luc do', () => {
    // `FULL` co du bon nang luc van tai cu nhung KHONG co hai ma cua T6. Muc bi an — dung yeu cau
    // cua #161 §2: khong hien mot cho trong chet cho khach.
    for (const input of [director(), accountant(), unknownRole()]) {
      expect(idsOf(input)).not.toContain('maintenance');
      expect(idsOf(input)).not.toContain('payroll');
    }
    expect(canNavigateTo('maintenance', director())).toBe(false);
    expect(canNavigateTo('payroll', director())).toBe(false);
  });

  it('hai muc do hien khi khach bat ma nang luc T6 — khong phai sua dieu huong', () => {
    const visible = idsOf(director([...FULL, ...T6_CAPABILITIES]));
    expect(visible).toContain('maintenance');
    expect(visible).toContain('payroll');
  });

  it('moi muc doi DU bo nang luc cua no, khong chi mot ma', () => {
    // Bao duong doi `transport-core` + `transport-asset-compliance`. Bat mot minh ma T6 ma thieu
    // loi thi van phai an — neu khong, mot goi khach khai thieu se ra mot man hinh goi API 403.
    const onlyCompliance = idsOf(director(['transport-asset-compliance']));
    expect(onlyCompliance).not.toContain('maintenance');
    // Luong doi `transport-costing` + `transport-workforce`.
    const workforceWithoutCosting = idsOf(director(['transport-core', 'transport-workforce']));
    expect(workforceWithoutCosting).not.toContain('payroll');
  });

  it('man phieu luong cua lai xe cung theo dung mot cong do', () => {
    expect(visibleDriverScreens(driver()).map((screen) => screen.id)).not.toContain('payslip');
    expect(
      visibleDriverScreens({
        capabilities: [...FULL, ...T6_CAPABILITIES],
        role: 'SALE',
      }).map((screen) => screen.id),
    ).toContain('payslip');
  });
});

describe('loc theo vai — hau qua that cua cau bridge GD-22', () => {
  it('Giam doc thay moi muc van hanh khach da bat', () => {
    expect(idsOf(director())).toEqual([
      'overview',
      // #339 — nhom DIEU HANH doc theo mot ngay lam viec, va `trips` KHONG con o day: no da xuong
      // loi phu "Cach lam truoc day". Khoi `#339` ben duoi khoa phan do.
      'movement',
      'control-tower',
      'dispatch',
      'fleet',
      // #341 — bon nhom tien theo dong tien: phai thu → phai tra → lai xe → tong hop & hieu qua.
      // Khoi `#341` ben duoi khoa nhan, nhom va cong quyen cua tung muc.
      'settlement',
      'ar-ap',
      'fuel',
      'driver-fund',
      'expense-claims',
      'finance',
      'margin',
      'executive',
      'fleet-dashboard',
      'routes',
      'journey',
      'exports',
      // `TX-08` (#242) — so dang ky so huu chi doi `transport-core`, nen no co mat voi MOI khach
      // bat van tai, khong nhu `maintenance`/`payroll` doi them capability rieng. Quyen so huu la
      // mot su that ve chinh chiec xe, khong phai mot lop nghiep vu ban them. Nhom TAI SAN o cuoi
      // tu #341.
      'asset-ownership',
      // `#395` — QUAN TRI o cuoi cung. `admin-places` doi them `transport-proof` (so hang rao), goi
      // FULL khong bat nang luc do nen chi con `Tài khoản & quyền`.
      'admin-accounts',
    ]);
  });

  it('Ke toan thay dung danh muc Giam doc TRU hai muc quan tri (#395)', () => {
    const adminSections = new Set(['admin-accounts', 'admin-places']);
    expect(idsOf(accountant())).toEqual(idsOf(director()).filter((id) => !adminSections.has(id)));
    expect(idsOf(accountant([...FULL, 'transport-proof']))).toEqual(
      idsOf(director()).filter((id) => !adminSections.has(id)),
    );
  });

  it('Lai xe KHONG thay mot muc van hanh nao', () => {
    // `SALE` khong he co `transport.trip.read`; cat hanh dong la cong thu nhat, va quyen so huu
    // phan cong o may chu la cong thu hai.
    expect(idsOf(driver())).toEqual([]);
  });

  it('MANAGER khong thay gi — fail-closed, va man hinh phai noi that dieu do', () => {
    expect(idsOf(manager())).toEqual([]);
  });

  it('chua biet vai thi hien moi muc khach da bat, khong an bot', () => {
    expect(idsOf(unknownRole())).toEqual(idsOf(director()));
  });
});

describe('nhom tren thanh ben', () => {
  it('nhom rong bi bo han, khong de lai tieu de mo coi', () => {
    const groups = navigationGroups(director(MINIMUM));
    // `assets` khong con rong tu `TX-08`: so dang ky so huu chi doi `transport-core`, nen ke ca goi
    // toi thieu cung co mot muc trong nhom nay. Bon nhom tien (#341) rong het o goi nay — va bien
    // mat het, khong de lai tieu de nao.
    expect(groups.map((entry) => entry.group.id)).toEqual([
      'root',
      'dispatch',
      'reports',
      'assets',
      'admin',
    ]);
    for (const entry of groups) expect(entry.sections.length).toBeGreaterThan(0);
  });

  it('vai khong co pham vi thi khong con nhom nao', () => {
    expect(navigationGroups(manager())).toEqual([]);
  });
});

describe('moi muc phai khai du hai truc', () => {
  /**
   * TRUOC DAY co mot truc thu ba, `dataSource`, phan biet muc DA CO duong du lieu voi muc chua co.
   * T7D (#170) noi het cac duong con thieu, nen truc do khong con phan biet duoc gi — moi muc deu
   * `live`. Mot truc chi con MOT gia tri khong phai mot truc; giu lai se lam nguoi doc tuong con
   * mot muc nao do chua chay.
   */
  /**
   * `#395` — truc quyen la DUNG MOT trong hai: mot hanh dong van tai, HOAC mot quyen nen tang. Thieu
   * ca hai thi muc bi dong mai mai (fail-closed); khai ca hai thi khong ai biet cong nao thang.
   */
  it('moi muc khai DUNG MOT truc quyen, va co nhan', () => {
    const sections: readonly TransportSection[] = TRANSPORT_SECTIONS;
    for (const section of sections) {
      const axes = [section.requiredActions, section.requiredPlatformPermission].filter(
        (axis) => axis !== undefined,
      );
      expect(axes, section.id).toHaveLength(1);
      if (section.requiredActions !== undefined) {
        // `#395`: mot BO ma cua du lieu chinh — rong thi muc dong mai mai (fail-closed).
        expect(section.requiredActions.length, section.id).toBeGreaterThan(0);
        for (const action of section.requiredActions) {
          expect(action.startsWith('transport.'), section.id).toBe(true);
        }
      }
      if (section.requiredPlatformPermission !== undefined) {
        expect(section.requiredPlatformPermission.startsWith('platform.')).toBe(true);
      }
      expect(section.label.length).toBeGreaterThan(0);
    }
  });

  /**
   * HAI MUC KHONG DUOC TRUNG NHAN — va day la mot loi DA XAY RA, khong phai mot lo xa.
   *
   * `control-tower` va `executive` tung cung mang nhan `Bảng điều hành`. Voi vai Giam doc ca hai
   * deu hien, va chung nam o hai nhom khac nhau tren CUNG mot thanh ben: nguoi dung thay hai dong
   * chu giong het nhau va khong co cach nao doan duoc bam cai nao dan toi dau.
   *
   * Bai nay do TOAN BO danh muc chu khong rieng hai muc do, vi cai can chan la HANH VI them mot
   * muc trung ten — mot viec de lam nham khi danh muc da co 23 muc va nguoi them chi nhin mot nhom.
   */
  it('khong hai muc nao mang cung mot nhan', () => {
    const seen = new Map<string, string>();
    for (const section of TRANSPORT_SECTIONS) {
      const existing = seen.get(section.label);
      expect(
        existing,
        `Nhan "${section.label}" bi dung cho ca "${existing}" lan "${section.id}". Hai muc tren` +
          ' cung mot thanh ben ma cung ten thi nguoi dung khong doan duoc bam cai nao.',
      ).toBeUndefined();
      seen.set(section.label, section.id);
    }
  });

  it('moi man cua lai xe deu doi mot hanh dong thuoc pham vi CUA CHINH MINH', () => {
    for (const screen of DRIVER_SCREENS) {
      expect(screen.requiredAction.startsWith('transport.driver.self.')).toBe(true);
    }
  });
});

describe('trang thai tren dia chi', () => {
  it('muc mac dinh giu dia chi sach', () => {
    expect(buildSectionUrl('overview')).toBe('/');
    expect(buildSectionUrl('trips')).toBe('/?section=trips');
    expect(buildSectionUrl('trips', 'VT-2026-0912')).toBe('/?section=trips&selected=VT-2026-0912');
  });

  it('be mat lai xe la mot dia chi rieng, khong phai mot nhanh theo vai', () => {
    expect(buildDriverUrl('home')).toBe('/?surface=driver');
    expect(buildDriverUrl('fuel')).toBe('/?surface=driver&screen=fuel');
  });

  it('dau trang cu hoac muc bi cam luon roi ve mac dinh, khong ra trang trang', () => {
    expect(resolveSection('khong-ton-tai', director())).toBe('overview');
    expect(resolveSection('settlement', director(MINIMUM))).toBe('overview');
    expect(resolveSection(null, director())).toBe('overview');
  });

  it('doc lai dung dia chi da dung — deep link song sot qua tai lai', () => {
    const parsed = parseNavigationFromSearch('?section=fuel&selected=VT-2026-0912', director());
    expect(parsed.surface).toBe('operations');
    expect(parsed.section).toBe('fuel');
    expect(parsed.selection).toBe('VT-2026-0912');
  });

  it('be mat lai xe khong mo duoc bang tay khi vai khong co pham vi do', () => {
    // Go tay `?surface=driver` voi mot vai van hanh phai roi ve be mat van hanh — #161 §8.
    expect(parseNavigationFromSearch('?surface=driver', director()).surface).toBe('operations');
    expect(parseNavigationFromSearch('?surface=driver', driver()).surface).toBe('driver');
  });

  it('tham so rong duoc coi la khong co', () => {
    const parsed = parseNavigationFromSearch('?section=trips&selected=', director());
    expect(parsed.selection).toBeNull();
  });

  it('doi muc thi BO lua chon — mot ma chuyen khong con nghia o man Nhien lieu', () => {
    const moved = resolveNavigation(
      { surface: null, section: 'fuel', screen: null, selection: 'VT-2026-0912' },
      { section: 'trips', screen: 'home' },
      director(),
    );
    expect(moved.section).toBe('fuel');
    expect(moved.selection).toBeNull();
  });

  it('o lai trong cung mot muc thi GIU lua chon', () => {
    const stayed = resolveNavigation(
      { surface: null, section: 'trips', screen: null, selection: 'VT-2026-0912' },
      { section: 'trips', screen: 'home' },
      director(),
    );
    expect(stayed.selection).toBe('VT-2026-0912');
  });

  it('giai quyet dia chi la TAT DINH — back/forward khong bao gio ra hai ket qua', () => {
    const once = parseNavigationFromSearch('?section=trips&selected=VT-2026-0912', director());
    const twice = parseNavigationFromSearch('?section=trips&selected=VT-2026-0912', director());
    expect(twice).toEqual(once);
    // Va dung ket qua do dung lai duoc chinh dia chi ban dau.
    const rebuilt = buildSectionUrl(once.section, once.selection).slice(1);
    expect(parseNavigationFromSearch(rebuilt, director())).toEqual(once);
  });
});

/**
 * `#275` K3/K4 — MUC `Ket thuc don` chi mo ra cho dung hai vai, va chi khi khach BAT nang luc do.
 *
 * Hai truc long nhau, va bai nay do CA HAI. Truc quyen la thu quan trong hon: `#275` K8 bai 1 doi
 * *"Driver direct POST => denied"*, va cong that nam o may chu — nhung mot muc hien ra cho lai xe
 * roi bao loi khi bam la mot man hinh noi doi ve dieu ho duoc lam.
 */
describe('#275 K4 — muc Ket thuc don', () => {
  const WITH_ACCEPTANCE: readonly CapabilityId[] = [...FULL, 'transport-acceptance'];

  it('khong hien khi khach CHUA bat transport-acceptance', () => {
    expect(idsOf(director())).not.toContain('order-completion');
  });

  it('Giam doc va Ke toan deu thay khi khach da bat', () => {
    expect(idsOf(director(WITH_ACCEPTANCE))).toContain('order-completion');
    expect(idsOf(accountant(WITH_ACCEPTANCE))).toContain('order-completion');
  });

  it('LAI XE khong thay, ke ca khi khach da bat', () => {
    expect(idsOf(driver(WITH_ACCEPTANCE))).not.toContain('order-completion');
  });

  it('MANAGER khong thay — fail-closed', () => {
    expect(idsOf(manager(WITH_ACCEPTANCE))).not.toContain('order-completion');
  });

  /**
   * #341 — o DAU nhom PHAI THU, truoc `Phải thu khách hàng`: doi soat voi khach chi nhan don da ket
   * thuc, nen day la buoc dau cua viec thu tien khach. Hai truc quyen KHONG doi.
   */
  it('dung dau nhom PHAI THU, va giu nguyen hai truc quyen', () => {
    const section = TRANSPORT_SECTIONS.find((entry) => entry.id === 'order-completion');
    expect(section?.group).toBe('receivable');
    expect(section?.requiredActions).toEqual(['transport.commercial_acceptance.read']);
    expect(section?.requiredCapabilities).toEqual(['transport-acceptance']);
  });
});

/**
 * ====================================================================================================
 * O LOC DANH MUC
 * ====================================================================================================
 *
 * Voi vai Giam doc, thanh ben co 23 muc trong bon nhom — mot cot chu cao gan het man hinh 1440px,
 * khong icon, khong so dem. O loc doi viec "doc het 23 dong" thanh "go hai chu".
 *
 * Hai luat duoi la luat AN TOAN chu khong phai luat tien nghi, nen chung nam o day chu khong o mot
 * bai E2E: mot o loc an nham mot muc trong y het mot lan mat quyen, va do la ket luan dat nhat
 * nguoi dung co the rut ra.
 */
describe('loc danh muc theo chu go vao', () => {
  const groups = navigationGroups(director(FULL));

  it('chuoi rong tra ve NGUYEN danh sach — o loc la loi tat, khong phai mot cong', () => {
    expect(filterNavigationGroups(groups, '')).toBe(groups);
    expect(filterNavigationGroups(groups, '   ')).toBe(groups);
  });

  it('go khong dau van tim ra nhan co dau', () => {
    const found = filterNavigationGroups(groups, 'doi xe').flatMap((entry) =>
      entry.sections.map((section) => section.id),
    );
    expect(found).toContain('fleet');
  });

  /**
   * `Đ`/`đ` (U+0110/U+0111) la chu RIENG, khong phai `D` co dau, nen `normalize('NFD')` KHONG tach
   * no ra. Bo qua dieu nay thi go "don hang" khong bao gio tim ra "Đơn hàng & vòng chạy" — va danh
   * muc van tai day chu do: Đơn hàng, Đội xe, Điều xe, Đối soát.
   */
  it('`Đ` la chu rieng, nen "don hang" phai tim ra "Đơn hàng & vòng chạy"', () => {
    const found = filterNavigationGroups(groups, 'don hang').flatMap((entry) =>
      entry.sections.map((section) => section.id),
    );
    expect(found).toContain('movement');
  });

  /**
   * Loc theo NHAN, khong theo `id`. `id` la ma ky thuat (`driver-fund`, `ar-ap`) va nguoi dung
   * khong nhin thay no o dau ca; go dung chu minh DOC DUOC tren man hinh phai ra ket qua.
   */
  it('loc theo nhan chu khong theo ma ky thuat', () => {
    const byLabel = filterNavigationGroups(groups, 'quỹ').flatMap((entry) =>
      entry.sections.map((section) => section.id),
    );
    expect(byLabel).toContain('driver-fund');

    expect(filterNavigationGroups(groups, 'driver-fund')).toEqual([]);
  });

  it('nhom khong con muc nao bi bo han — khong de lai tieu de mo coi', () => {
    for (const entry of filterNavigationGroups(groups, 'nhien lieu')) {
      expect(entry.sections.length).toBeGreaterThan(0);
    }
  });

  it('khong khop gi thi tra ve rong, de vo noi ro thay vi ve mot cot trang', () => {
    expect(filterNavigationGroups(groups, 'khong-co-muc-nao-ten-the-nay')).toEqual([]);
  });
});

/**
 * ====================================================================================================
 * #339 — DON HANG & VONG CHAY LA DUONG CHINH, CHUYEN XE KHONG CON CANH TRANH
 * ====================================================================================================
 *
 * First-UAT cho thay hai muc `Chuyến xe` (TransportTrip, the he truoc) va `Đơn hàng & vòng chạy`
 * (Order → VehicleRun) dung canh nhau lam nguoi dung bat dau sai luong. Bon dieu duoc khoa o day:
 *
 *   1. danh muc chinh khong con HAI duong canh tranh, voi moi vai co pham vi van hanh;
 *   2. dia chi cu toi `Chuyến xe` van mo DUNG man do khi du quyen, va roi co chu dich khi khong;
 *   3. doi nhom danh muc khong cap them, cung khong tuoc mat, mot muc nao;
 *   4. quy tac la mot hop dong tren HAI muc (`supersededBy`), khong phai mot cau so vai.
 */
describe('#339 — danh muc chinh bat dau tu Don hang, Chuyen xe chi con o loi phu', () => {
  const WITH_ACCEPTANCE: readonly CapabilityId[] = [...FULL, 'transport-acceptance'];
  const primaryIds = (input: NavigationInput): readonly string[] => idsOf(input);
  const olderIds = (input: NavigationInput): readonly string[] =>
    supersededEntries(input).map((entry) => entry.section.id);
  const reachableIds = (input: NavigationInput): readonly string[] =>
    TRANSPORT_SECTIONS.filter((section) => canNavigateTo(section.id, input)).map(
      (section) => section.id,
    );

  describe('acceptance 1 — khong con hai duong canh tranh tren danh muc chinh', () => {
    it.each([
      ['ADMIN', director()],
      ['ADMIN + ket thuc don', director(WITH_ACCEPTANCE)],
      ['ACCOUNTING', accountant()],
      ['vai chua biet', unknownRole()],
      ['goi toi thieu', director(MINIMUM)],
    ])('%s: co `Đơn hàng & vòng chạy`, khong co `Chuyến xe`', (_name, input) => {
      expect(primaryIds(input)).toContain('movement');
      expect(primaryIds(input)).not.toContain('trips');
    });

    it('MANAGER van fail-closed: khong muc chinh, khong loi phu — #339 KHONG bia quyen cho MANAGER', () => {
      expect(primaryIds(manager())).toEqual([]);
      expect(olderIds(manager())).toEqual([]);
    });

    it('nhom DIEU HANH doc theo mot ngay lam viec: don → toan canh → chon xe → doi xe', () => {
      const dispatch = navigationGroups(director()).find((entry) => entry.group.id === 'dispatch');
      expect(dispatch?.sections.map((section) => section.id)).toEqual([
        'movement',
        'control-tower',
        'dispatch',
        'fleet',
      ]);
    });

    it('`Chuyến xe` xuong loi phu, kem cau chi duong bang NHAN cua muc moi', () => {
      const entries = supersededEntries(director());
      expect(entries.map((entry) => [entry.section.id, entry.successor.id])).toEqual([
        ['trips', 'movement'],
      ]);
      expect(supersededNote(entries[0]!)).toBe('Việc mới bắt đầu ở “Đơn hàng & vòng chạy”.');
    });

    /**
     * Chu tren man hinh la chu cua nguoi van hanh. `legacy`, `TransportTrip`, `v1` la chu cua kien
     * truc may chu — dung dieu #339 cam dua ra giao dien.
     */
    it('tieu de va cau chi duong khong dung mot chu ky thuat nao', () => {
      const shown = [SUPERSEDED_HEADING, ...supersededEntries(director()).map(supersededNote)]
        .join(' ')
        .toLowerCase();
      for (const jargon of ['legacy', 'transporttrip', 'trip', 'run', 'v1', 'v2', 'deprecated']) {
        expect(shown, jargon).not.toMatch(new RegExp(`\\b${jargon}\\b`));
      }
    });
  });

  describe('acceptance 2 — `Đơn hàng & vòng chạy` van theo dung hai truc quyen', () => {
    it('can `transport-core`: goi khach khong bat thi khong co muc do', () => {
      expect(canNavigateTo('movement', director([]))).toBe(false);
      expect(primaryIds(director([]))).not.toContain('movement');
    });

    it('lai xe va MANAGER khong thay, ke ca khi khach bat du', () => {
      expect(primaryIds(driver(WITH_ACCEPTANCE))).not.toContain('movement');
      expect(primaryIds(manager(WITH_ACCEPTANCE))).not.toContain('movement');
    });

    /**
     * #339 khong doi truc quyen cua muc nay; `#395` doi — co chu dich: DON la du lieu chinh (man
     * hinh chan ca trang khi khong doc duoc don), con bang vong chay la phan phu tu gac bang
     * `transport.run.read`. Vai khoi diem van thay dung muc nay (`preset-sections.spec.ts`).
     */
    it('doi `transport.order.read`; vong chay (`transport.run.read`) la phan phu (#395)', () => {
      const movement = TRANSPORT_SECTIONS.find((section) => section.id === 'movement');
      expect(movement?.requiredActions).toEqual(['transport.order.read']);
      expect(movement?.optionalActions).toContain('transport.run.read');
      expect(movement?.requiredCapabilities).toEqual(['transport-core']);
    });
  });

  describe('acceptance 3 — dia chi cu toi Chuyen xe mo co chu dich, khong ra trang trang', () => {
    const LEGACY_LINK = '?section=trips&selected=VT-2026-0912&q=VT-2026-0912&status=IN_TRANSIT';

    it.each([
      ['ADMIN', director()],
      ['ACCOUNTING', accountant()],
      ['vai chua biet', unknownRole()],
    ])('%s: mo DUNG man Chuyen xe, giu ca lua chon lan bo loc', (_name, input) => {
      const parsed = parseNavigationFromSearch(LEGACY_LINK, input);
      expect(parsed.surface).toBe('operations');
      expect(parsed.section).toBe('trips');
      expect(parsed.selection).toBe('VT-2026-0912');
      expect(parsed.tripFilter).toEqual({
        search: 'VT-2026-0912',
        status: 'IN_TRANSIT',
        kind: null,
      });
    });

    it.each([
      ['MANAGER', manager()],
      ['lai xe', driver()],
      ['khach khong bat transport-core', director([])],
    ])('%s: roi ve Tong quan, va bo loc chuyen khong theo sang', (_name, input) => {
      const parsed = parseNavigationFromSearch(LEGACY_LINK, input);
      expect(parsed.surface).toBe('operations');
      expect(parsed.section).toBe('overview');
      expect(parsed.tripFilter).toEqual({ search: null, status: null, kind: null });
    });

    it('dia chi dung lai tu ket qua van la dia chi cu — tai lai/back/forward khong doi nghia', () => {
      const once = parseNavigationFromSearch(LEGACY_LINK, director());
      expect(buildSectionUrl(once.section, once.selection, once.tripFilter)).toBe(
        '/?section=trips&selected=VT-2026-0912&q=VT-2026-0912&status=IN_TRANSIT',
      );
      const rebuilt = buildSectionUrl(once.section, once.selection, once.tripFilter).slice(1);
      expect(parseNavigationFromSearch(rebuilt, director())).toEqual(once);
    });
  });

  describe('acceptance 4 — doi nhom khong cap them, khong tuoc mat', () => {
    it.each([
      ['ADMIN', director()],
      ['ADMIN + T6 + ket thuc don', director([...WITH_ACCEPTANCE, ...T6_CAPABILITIES])],
      ['ACCOUNTING', accountant()],
      ['ACCOUNTING + ket thuc don', accountant(WITH_ACCEPTANCE)],
      ['MANAGER', manager()],
      ['lai xe', driver()],
      ['vai chua biet', unknownRole()],
      ['goi toi thieu', director(MINIMUM)],
      ['First-UAT chan ETC', { ...director(FIRST_UAT), blockedCapabilityKeys: ['transport-toll'] }],
    ])('%s: danh muc chinh + loi phu = DUNG tap muc mo duoc, va khong trung', (_name, input) => {
      const primary = primaryIds(input);
      const older = olderIds(input);
      expect([...primary, ...older].sort()).toEqual([...reachableIds(input)].sort());
      expect(primary.filter((id) => older.includes(id))).toEqual([]);
    });

    it('ACCOUNTING khong regress: van thay dung tap muc cua Giam doc (tru QUAN TRI), tren ca hai loi', () => {
      // `#395` — hai muc quan tri chi Giam doc co; phan con lai cua danh muc KHONG doi.
      expect(primaryIds(accountant(WITH_ACCEPTANCE))).toEqual(
        primaryIds(director(WITH_ACCEPTANCE)).filter((id) => !id.startsWith('admin-')),
      );
      expect(olderIds(accountant())).toEqual(['trips']);
    });
  });

  describe('hop dong `supersededBy` — mot quy tac tren hai muc, khong phai mot cau so vai', () => {
    it('moi `supersededBy` tro vao mot muc CO THAT, khac chinh no, va khong tu no bi thay', () => {
      const sections: readonly TransportSection[] = TRANSPORT_SECTIONS;
      for (const section of sections) {
        if (section.supersededBy === undefined) continue;
        const successor = sections.find((entry) => entry.id === section.supersededBy);
        expect(successor, section.id).toBeDefined();
        expect(successor?.id).not.toBe(section.id);
        // Khong co chuoi thay the: loi phu chi dan mot buoc toi muc chinh, khong dan toi mot muc
        // cu khac.
        expect(successor?.supersededBy, section.id).toBeUndefined();
      }
    });

    it('`Chuyến xe` giu nguyen hai truc quyen — rut khoi danh muc khong doi ai duoc mo no', () => {
      const trips = TRANSPORT_SECTIONS.find((section) => section.id === 'trips');
      expect(trips?.requiredActions).toEqual(['transport.trip.read']);
      expect(trips?.requiredCapabilities).toEqual(['transport-core']);
      expect(canNavigateTo('trips', director())).toBe(true);
      expect(canNavigateTo('trips', accountant())).toBe(true);
    });
  });

  describe('acceptance 5 — o Loc danh muc van chay, va khong keo muc cu len lai', () => {
    const groups = navigationGroups(director());

    it('go "chuyen xe" KHONG dua `Chuyến xe` len canh don hang', () => {
      expect(filterNavigationGroups(groups, 'chuyen xe')).toEqual([]);
    });

    it('go "don hang" van tim ra muc chinh', () => {
      const found = filterNavigationGroups(groups, 'don hang').flatMap((entry) =>
        entry.sections.map((section) => section.id),
      );
      expect(found).toEqual(['movement']);
    });

    it('danh muc Giam doc van du dai de o loc hien ra (nguong 12 cua vo)', () => {
      const total = groups.reduce((sum, entry) => sum + entry.sections.length, 0);
      expect(total).toBeGreaterThanOrEqual(12);
    });
  });
});

/** Hai truc quyen + truc vi tri cua mot muc — thu #341 KHONG duoc cham vao. */
/**
 * Cong NANG LUC va DUONG THAY THE cua mot muc. Cong QUYEN (mot ma truoc `#395`, mot bo ma sau) khong
 * con o day: `preset-sections.spec.ts` giu ban do cong quyen truoc `#395` va chung minh bon vai khoi
 * diem van thay DUNG cac muc nhu truoc.
 */
interface SectionGate {
  readonly capabilities: readonly CapabilityId[];
  readonly supersededBy: TransportSectionId | null;
}

/**
 * ====================================================================================================
 * #341 — DANH MUC KE TOAN TRA LOI CAU HOI NGHIEP VU, KHONG BAT NGUOI DUNG HOC TEN PHAN HE
 * ====================================================================================================
 *
 * Do lai tren `main` sau #346, truoc khi sua: ADMIN va ACCOUNTING thay CUNG 22 muc; tien nam rai
 * trong ba nhom tron lan (`CHI PHÍ & ĐỐI SOÁT`, `TÀI SẢN & NHÂN SỰ`, `BÁO CÁO`), va bon nhan —
 * `Công nợ & quyết toán`, `AR/AP`, `Bảng tài chính`, `Quyết toán lái xe` — cung doc len nhu "cong
 * no". Bon dieu duoc khoa o day:
 *
 *   1. ke toan nhin MOT luot la biet thu tien khach, xem phai tra, xem tong hop, xem hieu qua o dau;
 *   2. moi cau hoi tien chi co MOT muc tra loi, va nhan + tom tat noi ra su khac nhau;
 *   3. doi nhan/nhom/thu tu KHONG doi mot cong quyen nao — ban do cong cua ca 24 muc ghim nguyen;
 *   4. moi dia chi cu van mo dung man cu, va TEN cu van tim ra muc trong o loc danh muc.
 */
describe('#341 — danh muc ke toan theo cau hoi nghiep vu', () => {
  /** Goi khach cua dot UAT dau tien (`tenants/transport-preview`): du nang luc, ETC bi chan. */
  const PREVIEW: readonly CapabilityId[] = [
    ...FULL,
    ...T6_CAPABILITIES,
    'transport-proof',
    'transport-checkpoint',
    'transport-site-intake',
    'transport-toll',
    'transport-acceptance',
  ];
  const onPreview = (role: NavigationInput['role']): NavigationInput => ({
    capabilities: PREVIEW,
    role,
    blockedCapabilityKeys: ['transport-toll'],
  });
  /** Cung goi do nhung KHONG chan gi — de moi muc, ke ca ETC, deu co mat. */
  const everything = (role: NavigationInput['role']): NavigationInput => ({
    capabilities: PREVIEW,
    role,
  });
  const menuOf = (input: NavigationInput): readonly (readonly [string, readonly string[]])[] =>
    navigationGroups(input).map((entry) => [
      entry.group.label,
      entry.sections.map((section) => section.label),
    ]);
  const fold = (value: string): string =>
    value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[Đđ]/g, 'd').toLowerCase();
  const idsWithLabel = (fragment: string): readonly string[] =>
    TRANSPORT_SECTIONS.filter((section) => fold(section.label).includes(fold(fragment))).map(
      (section) => section.id,
    );
  const sections: readonly TransportSection[] = TRANSPORT_SECTIONS;
  const summaryOf = (id: TransportSectionId): string =>
    sections.find((section) => section.id === id)?.summary ?? '';

  /**
   * BAN DO CONG do tren `main` (bbdd59a3) TRUOC #341 — chep tay, KHONG sinh tu tep dang kiem.
   * #341 chi doi nhan, tom tat, nhom va thu tu; mot o nao o day lech la mot lan doi cong lot vao
   * duoi danh nghia sap xep danh muc. (Cong QUYEN: xem `SectionGate` va `preset-sections.spec.ts`.)
   */
  const GATES_BEFORE_341: Readonly<Record<string, SectionGate>> = {
    overview: { capabilities: [], supersededBy: null },
    movement: {
      capabilities: ['transport-core'],
      supersededBy: null,
    },
    trips: {
      capabilities: ['transport-core'],
      supersededBy: 'movement',
    },
    'control-tower': {
      capabilities: ['transport-core'],
      supersededBy: null,
    },
    dispatch: {
      capabilities: ['transport-core'],
      supersededBy: null,
    },
    fleet: {
      capabilities: ['transport-core'],
      supersededBy: null,
    },
    'driver-fund': {
      capabilities: ['transport-costing'],
      supersededBy: null,
    },
    'expense-claims': {
      capabilities: ['transport-costing'],
      supersededBy: null,
    },
    'order-completion': {
      capabilities: ['transport-acceptance'],
      supersededBy: null,
    },
    fuel: {
      capabilities: ['transport-fuel'],
      supersededBy: null,
    },
    toll: {
      capabilities: ['transport-toll'],
      supersededBy: null,
    },
    settlement: {
      capabilities: ['transport-settlement'],
      supersededBy: null,
    },
    maintenance: {
      capabilities: ['transport-core', 'transport-asset-compliance'],
      supersededBy: null,
    },
    'asset-ownership': {
      capabilities: ['transport-core'],
      supersededBy: null,
    },
    payroll: {
      capabilities: ['transport-costing', 'transport-workforce'],
      supersededBy: null,
    },
    'driver-settlement': {
      capabilities: ['transport-costing', 'transport-workforce'],
      supersededBy: null,
    },
    finance: {
      capabilities: ['transport-settlement'],
      supersededBy: null,
    },
    executive: {
      capabilities: ['transport-core'],
      supersededBy: null,
    },
    'fleet-dashboard': {
      capabilities: ['transport-core'],
      supersededBy: null,
    },
    routes: {
      capabilities: ['transport-core'],
      supersededBy: null,
    },
    journey: { capabilities: ['transport-core'], supersededBy: null },
    margin: {
      capabilities: ['transport-settlement'],
      supersededBy: null,
    },
    'ar-ap': {
      capabilities: ['transport-settlement'],
      supersededBy: null,
    },
    exports: {
      capabilities: ['transport-core'],
      supersededBy: null,
    },
  };
  const OLD_IDS: readonly string[] = Object.keys(GATES_BEFORE_341);

  describe('acceptance 1 — ke toan nhin mot luot la biet di dau', () => {
    const PREVIEW_MENU = [
      ['', ['Tổng quan']],
      ['ĐIỀU HÀNH', ['Đơn hàng & vòng chạy', 'Bảng điều hành', 'Điều xe', 'Đội xe & lái xe']],
      ['PHẢI THU', ['Kết thúc đơn', 'Phải thu khách hàng']],
      ['PHẢI TRẢ', ['Phải trả đối tác & cây xăng', 'Nhiên liệu']],
      ['QUỸ & LƯƠNG LÁI XE', ['Quỹ lái xe', 'Duyệt chi lái xe', 'Lương', 'Quyết toán lái xe']],
      [
        'TỔNG HỢP & HIỆU QUẢ',
        [
          'Tổng hợp tài chính',
          'Hiệu quả từng chuyến',
          'Tổng hợp giám đốc',
          'Bảng đội xe',
          'Báo cáo tuyến',
          'Bản đồ vòng chạy',
          'Xuất dữ liệu',
        ],
      ],
      ['TÀI SẢN', ['Bảo dưỡng & giấy tờ', 'Sở hữu tài sản']],
    ];
    /** `#395` — nhom QUAN TRI chi Giam doc co, va nam CUOI: khong chen vao danh muc ke toan doc. */
    const ADMIN_GROUP = ['QUẢN TRỊ', ['Tài khoản & quyền', 'Địa điểm vận hành']] as const;

    it('ACCOUNTING tren goi khach that: dung bay nhom, dung thu tu, dung nhan', () => {
      expect(menuOf(onPreview('ACCOUNTING'))).toEqual(PREVIEW_MENU);
    });

    it('ADMIN tren goi khach that: cung bay nhom do, cong them QUAN TRI o cuoi (#395)', () => {
      expect(menuOf(onPreview('ADMIN'))).toEqual([...PREVIEW_MENU, ADMIN_GROUP]);
    });

    it('ACCOUNTING va ADMIN van thay CUNG mot danh muc tien — #341 khong mo mot nhanh theo vai', () => {
      expect(menuOf(onPreview('ACCOUNTING'))).toEqual(menuOf(onPreview('ADMIN')).slice(0, -1));
      expect(supersededEntries(onPreview('ACCOUNTING')).map((entry) => entry.section.id)).toEqual([
        'trips',
      ]);
    });

    it.each([
      ['thu tien khach', 'PHẢI THU', 'Phải thu khách hàng', 'settlement'],
      ['xem phai tra', 'PHẢI TRẢ', 'Phải trả đối tác & cây xăng', 'ar-ap'],
      ['xem tong hop tai chinh', 'TỔNG HỢP & HIỆU QUẢ', 'Tổng hợp tài chính', 'finance'],
      ['xem hieu qua', 'TỔNG HỢP & HIỆU QUẢ', 'Hiệu quả từng chuyến', 'margin'],
    ])('%s: nhom `%s` → muc `%s`', (_question, groupLabel, label, id) => {
      const group = navigationGroups(onPreview('ACCOUNTING')).find(
        (entry) => entry.group.label === groupLabel,
      );
      expect(group?.sections.find((section) => section.label === label)?.id).toBe(id);
    });

    it('khach bat ETC: `Phí đường bộ (ETC)` dung trong PHAI TRA, sau `Nhiên liệu`', () => {
      const payable = navigationGroups(everything('ACCOUNTING')).find(
        (entry) => entry.group.id === 'payable',
      );
      expect(payable?.sections.map((section) => section.id)).toEqual(['ar-ap', 'fuel', 'toll']);
    });

    it('moi muc nam dung nhom cau hoi cua no', () => {
      expect(Object.fromEntries(sections.map((section) => [section.id, section.group]))).toEqual({
        overview: 'root',
        movement: 'dispatch',
        trips: 'dispatch',
        'control-tower': 'dispatch',
        dispatch: 'dispatch',
        fleet: 'dispatch',
        maintenance: 'assets',
        'asset-ownership': 'assets',
        'my-vehicles': 'assets',
        'order-completion': 'receivable',
        settlement: 'receivable',
        'ar-ap': 'payable',
        fuel: 'payable',
        toll: 'payable',
        'driver-fund': 'driver-money',
        'expense-claims': 'driver-money',
        payroll: 'driver-money',
        'driver-settlement': 'driver-money',
        finance: 'reports',
        margin: 'reports',
        executive: 'reports',
        'fleet-dashboard': 'reports',
        routes: 'reports',
        journey: 'reports',
        exports: 'reports',
        'admin-accounts': 'admin',
        'admin-places': 'admin',
      });
    });

    it('thu tu khai bao = thu tu thanh ben: moi nhom lien mot khoi, theo thu tu nhom', () => {
      const order: readonly string[] = TRANSPORT_SECTION_GROUPS.map((group) => group.id);
      const positions = sections.map((section) => order.indexOf(section.group));
      expect(positions).not.toContain(-1);
      expect(positions).toEqual([...positions].sort((left, right) => left - right));
    });
  });

  describe('acceptance 2 — moi cau hoi tien chi co MOT muc tra loi', () => {
    it.each([
      ['phai thu', ['settlement']],
      ['phai tra', ['ar-ap']],
      ['tai chinh', ['finance']],
      ['hieu qua', ['margin']],
      ['quyet toan', ['driver-settlement']],
      // Hai chieu cong no mang hai ten theo CHIEU — khong con nhan nao chi noi "cong no".
      ['cong no', []],
    ])('nhan chua "%s" → %j', (fragment, ids) => {
      expect(idsWithLabel(fragment)).toEqual(ids);
    });

    it('khong con nhan theo ten phan he: khong `AR/AP`, khong kieu `A / B`', () => {
      for (const section of sections) {
        expect(section.label, section.id).not.toMatch(/\bA[RP]\b|\//);
      }
    });

    it('`Phải thu khách hàng` chi hua MOT dong tien — man cua #337 la cong no KHACH', () => {
      expect(sections.find((section) => section.id === 'settlement')?.label).toBe(
        'Phải thu khách hàng',
      );
      for (const promise of ['năm dòng', 'nhà xe', 'cây xăng', 'lái xe', 'nguồn đơn']) {
        expect(summaryOf('settlement'), promise).not.toContain(promise);
      }
    });

    it('`Phải trả đối tác & cây xăng` khong hua tuoi no phai thu cua khach', () => {
      for (const promise of ['phải thu', 'tuổi nợ', 'khách hàng']) {
        expect(summaryOf('ar-ap').toLowerCase(), promise).not.toContain(promise);
      }
    });

    it('chi `Tổng hợp tài chính` dat cac dong tien canh nhau', () => {
      const flowsTogether = sections
        .filter((section) => /sáu dòng|năm dòng|dòng tiền/i.test(section.summary))
        .map((section) => section.id);
      expect(flowsTogether).toEqual(['finance']);
    });

    it('khong hai muc nao mang cung mot tom tat', () => {
      const summaries = sections.map((section) => section.summary);
      expect(new Set(summaries).size).toBe(summaries.length);
    });
  });

  describe('acceptance 3 — doi nhan, nhom, thu tu KHONG doi mot cong quyen nao', () => {
    it('ban do cong nang luc va duong thay the cua ca 24 muc giu nguyen tu truoc #341', () => {
      const now = Object.fromEntries(
        sections
          .filter((section) => OLD_IDS.includes(section.id))
          .map((section) => [
            section.id,
            {
              capabilities: section.requiredCapabilities,
              supersededBy: section.supersededBy ?? null,
            },
          ]),
      );
      expect(now).toEqual(GATES_BEFORE_341);
    });

    /** Do tren goi khach that truoc #341: 23 muc mo duoc (22 muc chinh + `trips` o loi phu). */
    it.each([
      ['ADMIN', onPreview('ADMIN'), OLD_IDS.filter((id) => id !== 'toll')],
      ['ACCOUNTING', onPreview('ACCOUNTING'), OLD_IDS.filter((id) => id !== 'toll')],
      ['vai chua biet', onPreview(null), OLD_IDS.filter((id) => id !== 'toll')],
      ['lai xe', onPreview('SALE'), []],
      ['MANAGER', onPreview('MANAGER'), []],
    ])('%s: tap muc mo duoc KHONG doi', (_name, input, expected) => {
      const reachable = sections
        .filter((section) => OLD_IDS.includes(section.id))
        .filter((section) => canNavigateTo(section.id, input))
        .map((section) => section.id);
      expect([...reachable].sort()).toEqual([...expected].sort());
    });

    it('lai xe va MANAGER van khong co muc chinh nao, cung khong co loi phu', () => {
      for (const input of [onPreview('SALE'), onPreview('MANAGER')]) {
        expect(menuOf(input)).toEqual([]);
        expect(supersededEntries(input)).toEqual([]);
      }
    });
  });

  describe('acceptance 4 — dia chi cu van mo dung man, ten cu van tim ra muc', () => {
    it.each([['ADMIN'], ['ACCOUNTING']] as const)(
      '%s: moi `?section=<id>` cu mo DUNG man do',
      (role) => {
        for (const id of OLD_IDS) {
          expect(parseNavigationFromSearch(`?section=${id}`, everything(role)).section, id).toBe(
            id,
          );
        }
      },
    );

    it('dia chi sinh lai y nguyen — `id` khong doi, nen khong can mot bang anh xa nao', () => {
      for (const id of OLD_IDS) {
        expect(buildSectionUrl(id as TransportSectionId)).toBe(
          id === 'overview' ? '/' : `/?section=${id}`,
        );
      }
    });

    it.each([
      ['MANAGER', manager(PREVIEW)],
      ['lai xe', driver(PREVIEW)],
    ])('%s mo dia chi tien cu thi roi ve Tong quan — fail-closed nhu truoc', (_name, input) => {
      for (const id of ['settlement', 'ar-ap', 'finance', 'margin', 'driver-fund']) {
        expect(parseNavigationFromSearch(`?section=${id}`, input).section, id).toBe('overview');
      }
    });

    it.each([
      ['Công nợ & quyết toán', 'settlement'],
      ['cong no', 'settlement'],
      ['AR/AP', 'ar-ap'],
      ['Bảng tài chính', 'finance'],
      ['bien truc tiep', 'margin'],
      ['Quỹ lái xe / Chi phí', 'driver-fund'],
    ])('go ten cu "%s" vao o loc van ra `%s`, duoi ten moi', (query, id) => {
      const found = filterNavigationGroups(
        navigationGroups(onPreview('ACCOUNTING')),
        query,
      ).flatMap((entry) => entry.sections.map((section) => section.id));
      expect(found).toEqual([id]);
    });

    it('ten cu chi de loc: khong trung nhan hien tai cua muc nao', () => {
      const labels = new Set(sections.map((section) => section.label));
      for (const section of sections) {
        for (const former of section.formerLabels ?? []) {
          expect(labels.has(former), former).toBe(false);
        }
      }
    });
  });
});

/**
 * ====================================================================================================
 * `#395` — MAN HINH DOC TAP QUYEN CUA MAY CHU, khong doc chuc danh.
 *
 * Truoc #395 danh muc hoi `canPerform(role, ...)` tren mot bang tinh theo vai, nen mot `MANAGER` duoc
 * Giam doc cap nhom "Đội xe & lái xe" van thay danh muc TRONG — du API dang cho phep. Gio `/auth/me`
 * tra tap quyen HIEU LUC va danh muc doc DUNG tap do; bang theo vai chi con la duong lui khi may chu
 * khong tra truong nay.
 * ====================================================================================================
 */
const TRANSPORT_ACTIONS_OF_ACCOUNTING: readonly TransportAction[] = actionsForRole('ACCOUNTING');

describe('#395 — danh muc theo tap quyen hieu luc cua may chu', () => {
  const PROOF: readonly CapabilityId[] = [...FULL, 'transport-proof'];
  const withPermissions = (
    role: NavigationInput['role'],
    permissions: readonly string[],
    capabilities: readonly CapabilityId[] = PROOF,
  ): NavigationInput => ({ capabilities, role, permissions: new Set(permissions) });

  const FLEET_GROUP = [
    'transport.vehicle.read',
    'transport.vehicle.manage',
    'transport.driver.read',
    'transport.driver.manage',
  ];

  it('MANAGER duoc cap nhom Doi xe THAY muc do — va chi muc do', () => {
    const input = withPermissions('MANAGER', FLEET_GROUP);
    expect(idsOf(input)).toEqual(['fleet']);
    // Dia chi `/` cua ho khong phai `Tổng quan` (ho khong co quyen do) ma la muc dau tien ho mo duoc.
    expect(parseNavigationFromSearch('', input).section).toBe('fleet');
    expect(parseNavigationFromSearch('?section=settlement', input).section).toBe('fleet');
  });

  it('Ke toan bi Giam doc BOT quyen xem xe thi mat muc Doi xe (va Bao duong)', () => {
    const accountingPreset = idsOf(accountant(PROOF));
    expect(accountingPreset).toContain('fleet');
    const denied = withPermissions(
      'ACCOUNTING',
      [...TRANSPORT_ACTIONS_OF_ACCOUNTING].filter((action) => action !== 'transport.vehicle.read'),
    );
    expect(idsOf(denied)).not.toContain('fleet');
    expect(idsOf(denied)).toEqual(accountingPreset.filter((id) => id !== 'fleet'));
  });

  it('tap quyen RONG la khong co gi — khac han "chua biet" (null) la hien het', () => {
    expect(idsOf(withPermissions('ADMIN', []))).toEqual([]);
    expect(idsOf({ capabilities: PROOF, role: null, permissions: null })).toEqual(
      idsOf({ capabilities: PROOF, role: null }),
    );
  });

  it('`Tài khoản & quyền` doi quyen NEN TANG; `Địa điểm vận hành` doi XEM va SUA dia diem', () => {
    const directorOnlyAdmin = withPermissions('ADMIN', [
      'platform.accounts.manage',
      'transport.geofence.read',
      'transport.geofence.manage',
    ]);
    expect(idsOf(directorOnlyAdmin)).toEqual(['admin-accounts', 'admin-places']);
    // MANAGER duoc cap xem + sua dia diem (khong phai quyen nen tang) thay dia diem, khong thay tai
    // khoan.
    expect(
      idsOf(withPermissions('MANAGER', ['transport.geofence.read', 'transport.geofence.manage'])),
    ).toEqual(['admin-places']);
    // `#395` (d): CHI co ma sua thi danh sach dia diem (`GET /transport/places/admin`,
    // `transport.geofence.read`) la `403` — muc KHONG hien, thay vi hien ra roi bao loi.
    expect(idsOf(withPermissions('MANAGER', ['transport.geofence.manage']))).toEqual([]);
    // Duong lui khi may chu khong tra tap quyen: chi Giam doc thay quan tri tai khoan.
    expect(canNavigateTo('admin-accounts', director())).toBe(true);
    expect(canNavigateTo('admin-accounts', accountant())).toBe(false);
    expect(canNavigateTo('admin-accounts', manager())).toBe(false);
    // `admin-places` doi `transport-proof`: khach khong bat so hang rao thi khong co muc do.
    expect(canNavigateTo('admin-places', director(FULL))).toBe(false);
    expect(canNavigateTo('admin-places', director(PROOF))).toBe(true);
  });

  it('man lai xe cung doc tap quyen: lai xe CO pham vi cua chinh minh qua `/auth/me`', () => {
    const selfScope = visibleDriverScreens(
      withPermissions('SALE', ['transport.driver.self.trip.read']),
    ).map((screen) => screen.id);
    expect(selfScope).toEqual(['home', 'trip', 'history']);
  });
});

/**
 * `#395` — BEN GOP VON CO THEM VIEC VAN HANH. Pham vi "Xe tôi có cổ phần" den tu mot hang lien ket
 * ma chi may chu doc duoc; `/auth/me` khong mang no. Man hinh HOI may chu (`GET /transport/me/vehicles`)
 * va chi dat muc len thanh ben khi may chu tra du lieu.
 */
describe('#395 — "Xe tôi có cổ phần" cho nguoi vua van hanh vua gop von', () => {
  const FLEET = ['transport.vehicle.read', 'transport.vehicle.manage'];
  const managerWith = (
    permissions: readonly string[],
    stakeholderLinked?: boolean,
  ): NavigationInput => ({
    capabilities: FULL,
    role: 'MANAGER',
    permissions: new Set(permissions),
    ...(stakeholderLinked === undefined ? {} : { stakeholderLinked }),
  });

  it('MANAGER co quyen VA da noi ben gop von: muc nam trong TAI SAN, mo duoc bang dia chi', () => {
    const input = managerWith(FLEET, true);
    expect(idsOf(input)).toEqual(['fleet', 'my-vehicles']);
    const assets = navigationGroups(input).find((entry) => entry.group.id === 'assets');
    expect(assets?.sections.map((section) => section.label)).toEqual(['Xe tôi có cổ phần']);
    expect(parseNavigationFromSearch('?section=my-vehicles', input).section).toBe('my-vehicles');
  });

  it('may chu chua xac nhan (dang hoi, hoac 403) thi KHONG co muc do', () => {
    expect(idsOf(managerWith(FLEET))).toEqual(['fleet']);
    expect(idsOf(managerWith(FLEET, false))).toEqual(['fleet']);
    expect(parseNavigationFromSearch('?section=my-vehicles', managerWith(FLEET)).section).toBe(
      'fleet',
    );
  });

  it('ben gop von THUAN TUY (khong quyen nao): danh muc van rong — giu man hien thang', () => {
    expect(navigationGroups(managerWith([], true))).toEqual([]);
    expect(
      navigationGroups({ capabilities: FULL, role: 'MANAGER', stakeholderLinked: true }),
    ).toEqual([]);
  });

  it('chua biet ai (vai null) khong hua muc cua ben gop von — pham vi do khong vai nao mang', () => {
    expect(idsOf(unknownRole())).not.toContain('my-vehicles');
    expect(idsOf(director())).not.toContain('my-vehicles');
    expect(idsOf({ ...director(), stakeholderLinked: true })).toContain('my-vehicles');
  });

  it('chi HOI may chu khi co tap quyen cua may chu VA co viec van hanh', () => {
    expect(shouldProbeStakeholderScope(managerWith(FLEET))).toBe(true);
    expect(
      shouldProbeStakeholderScope({
        capabilities: FULL,
        role: 'ADMIN',
        permissions: new Set(actionsForRole('ADMIN')),
      }),
    ).toBe(true);
    // Ben gop von thuan tuy da co man hien thang — khong hoi hai lan.
    expect(shouldProbeStakeholderScope(managerWith([]))).toBe(false);
    // May chu cu / che do khong phien: khong co tap quyen, khong hoi.
    expect(shouldProbeStakeholderScope(director())).toBe(false);
    expect(shouldProbeStakeholderScope(unknownRole())).toBe(false);
    // Khach khong bat van tai loi: khong hoi.
    expect(
      shouldProbeStakeholderScope({ ...managerWith(FLEET), capabilities: ['transport-costing'] }),
    ).toBe(false);
  });
});
