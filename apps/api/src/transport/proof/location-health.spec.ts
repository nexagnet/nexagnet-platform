import { describe, expect, it } from 'vitest';
import {
  classifyLocationHealth,
  locationSourceFamily,
  toLocationHealthView,
  type LocationHealthInput,
  type LocationHealthSample,
} from './location-health.js';
import { presetIncludes } from '../transport-actions.js';
import {
  DEFAULT_HEALTHY_SILENCE_SECONDS,
  DEFAULT_LOST_SILENCE_SECONDS,
  DEFAULT_TRANSPORT_PROOF_POLICY,
} from './tracking-policy.js';

/**
 * `#297 T10.1-T10.8` — phep cham suc khoe vi tri.
 *
 * Tang duoc kiem la THUAN TUY: `now` di vao bang tham so, nen moc thoi gian o day la mot hang so
 * co dinh chu khong phai `new Date()`. Mot bai chay 3 gio sang va mot bai chay 3 gio chieu phai
 * cho ra dung cung mot ket qua, neu khong thi chinh bo bai nay la thu khong tin duoc.
 */
const POLICY = DEFAULT_TRANSPORT_PROOF_POLICY.health;
const HEALTHY = DEFAULT_HEALTHY_SILENCE_SECONDS;
const LOST = DEFAULT_LOST_SILENCE_SECONDS;

const HANOI = { latitude: 21.0285, longitude: 105.8542 };
const HAIPHONG = { latitude: 20.8449, longitude: 106.6881 };

const NOW = new Date('2026-09-07T03:00:00Z');
/** Mot moc CACH DAY `seconds` giay — doc len la "ban nay cu bao nhieu". */
const agedBy = (seconds: number): Date => new Date(NOW.getTime() - seconds * 1000);

const phoneSample = (
  ageSeconds: number,
  overrides: Partial<LocationHealthSample> = {},
): LocationHealthSample => ({
  source: 'DEVICE_GNSS',
  point: HANOI,
  accuracyMetres: 8,
  receivedAt: agedBy(ageSeconds),
  sessionId: 'session-1',
  ...overrides,
});

const telematicsSample = (
  ageSeconds: number,
  overrides: Partial<LocationHealthSample> = {},
): LocationHealthSample => ({
  source: 'TELEMATICS',
  point: HAIPHONG,
  accuracyMetres: 30,
  receivedAt: agedBy(ageSeconds),
  sessionId: null,
  ...overrides,
});

const input = (overrides: Partial<LocationHealthInput> = {}): LocationHealthInput => ({
  vehicleId: 'vehicle-1',
  expectation: { tripId: 'trip-1', runId: null, sessionId: 'session-1', since: agedBy(3_600) },
  samples: [],
  telematicsConfigured: false,
  ...overrides,
});

const classify = (overrides: Partial<LocationHealthInput> = {}) =>
  classifyLocationHealth(input(overrides), NOW, POLICY);

const familyOf = (
  result: ReturnType<typeof classifyLocationHealth>,
  family: 'PHONE' | 'TELEMATICS',
) => result.sources.find((source) => source.family === family);

/* ================================================================== *
 * HO NGUON — `#297 T3`
 * ================================================================== */

describe('ho nguon', () => {
  it('ba nguon thiet bi gop ve PHONE, phan cung tren xe rieng, nhap tay rieng', () => {
    expect(locationSourceFamily('DEVICE_GNSS')).toBe('PHONE');
    expect(locationSourceFamily('DEVICE_FUSED')).toBe('PHONE');
    expect(locationSourceFamily('DEVICE_NETWORK')).toBe('PHONE');
    expect(locationSourceFamily('TELEMATICS')).toBe('TELEMATICS');
    expect(locationSourceFamily('MANUAL')).toBe('MANUAL');
  });

  it('ho nguon KHONG ghi de nguon tho — mot lan xem lai bang chung van doc duoc do la nguon nao', () => {
    const result = classify({ samples: [phoneSample(60, { source: 'DEVICE_NETWORK' })] });

    expect(result.status).toBe('LIVE');
    // Neu `source` bi ho nguon nuot mat thi mot ban sai so hang tram met (`DEVICE_NETWORK`) se
    // doc len giong het mot ban GNSS sai so 8 met. Hai thu do khong duoc phep lan.
    expect(familyOf(result, 'PHONE')?.source).toBe('DEVICE_NETWORK');
    expect(result.lastKnown?.source).toBe('DEVICE_NETWORK');
    expect(result.lastKnown?.family).toBe('PHONE');
  });

  it('ban NHAP TAY khong dat lai duoc dong ho suc khoe — no khong tat duoc mot canh bao nao', () => {
    // Dien thoai da im qua cua so mat. Mot ban nhap tay vua go xong KHONG duoc bien no thanh LIVE:
    // neu duoc, thao tac nhap lieu se la mot duong tat bao dong ma khong ai co y dinh mo ra.
    const result = classify({
      samples: [phoneSample(LOST + 1), phoneSample(1, { source: 'MANUAL', sessionId: null })],
    });

    expect(result.status).toBe('LOST');
    expect(result.reason).toBe('NO_RECENT_OBSERVATION');
    expect(familyOf(result, 'PHONE')?.source).toBe('DEVICE_GNSS');
  });

  it('toa do khong hop le bi coi nhu KHONG TON TAI, khong phai mot ban LIVE o (0,0)', () => {
    const result = classify({
      samples: [phoneSample(30, { point: { latitude: 91, longitude: 105.8542 } })],
    });

    // Mot chiec xe "LIVE" tai mot toa do bia con te hon mot chiec xe bao LOST.
    expect(result.status).not.toBe('LIVE');
    expect(result.lastKnown).toBeNull();
  });
});

/* ================================================================== *
 * T10.1-T10.4 — BON NGHIA GOC + HAI BIEN
 * ================================================================== */

describe('T10.1 — bam vi tri dang chay + ban moi', () => {
  it('ban tuoi tu dien thoai -> LIVE, va toa do duoc phep dung nhu vi tri hien tai', () => {
    const result = classify({ samples: [phoneSample(60)] });

    expect(result.status).toBe('LIVE');
    expect(result.reason).toBe('RECENT_OBSERVATION');
    expect(result.currentSource).toBe('PHONE');
    expect(result.ageSeconds).toBe(60);
    expect(result.lastKnown?.usableAsCurrent).toBe(true);
  });
});

describe('T10.2 — DUNG tren bien degraded', () => {
  it(`dung ${HEALTHY} giay van la LIVE — nguong la "<=", khong phai "<"`, () => {
    const result = classify({ samples: [phoneSample(HEALTHY)] });

    expect(result.status).toBe('LIVE');
    expect(result.ageSeconds).toBe(HEALTHY);
    expect(result.lastKnown?.usableAsCurrent).toBe(true);
  });

  it(`${HEALTHY + 1} giay -> DEGRADED, va toa do MAT quyen lam vi tri hien tai`, () => {
    const result = classify({ samples: [phoneSample(HEALTHY + 1)] });

    expect(result.status).toBe('DEGRADED');
    expect(result.reason).toBe('OBSERVATION_AGEING');
    expect(result.currentSource).toBeNull();
    // Van co bang chung, va no van di ra — nhung khong duoc ve nhu mot cham xe hien tai.
    expect(result.lastKnown?.point).toEqual(HANOI);
    expect(result.lastKnown?.usableAsCurrent).toBe(false);
  });
});

describe('T10.3 — DUNG tren bien lost', () => {
  it(`dung ${LOST} giay van la DEGRADED — chua qua thi chua mat`, () => {
    const result = classify({ samples: [phoneSample(LOST)] });

    expect(result.status).toBe('DEGRADED');
    expect(result.ageSeconds).toBe(LOST);
  });

  it(`${LOST + 1} giay -> LOST, kem ly do "da tung nhan roi ngung"`, () => {
    const result = classify({ samples: [phoneSample(LOST + 1)] });

    expect(result.status).toBe('LOST');
    expect(result.reason).toBe('NO_RECENT_OBSERVATION');
    expect(result.currentSource).toBeNull();
    expect(result.lastKnown?.usableAsCurrent).toBe(false);
  });

  it('hai bien la HAI con so khac nhau — mot cua so DEGRADED ton tai that', () => {
    // Neu ai do dat `healthySilenceSeconds === lostSilenceSeconds`, cua so DEGRADED bien mat va
    // bai nay do. Do la tinh chat can bao ve: khong co DEGRADED thi mot vi tri con dung duoc se
    // bi vut di, hoac mot vi tri da chet se duoc dieu xe.
    expect(LOST).toBeGreaterThan(HEALTHY);
    expect(classify({ samples: [phoneSample(HEALTHY + 1)] }).status).toBe('DEGRADED');
    expect(classify({ samples: [phoneSample(LOST + 1)] }).status).toBe('LOST');
  });

  it('KHONG dung lai hai nguong cua dieu xe (1800/14400) — do la cau hoi khac', () => {
    // `TransportDispatchPolicy` tra loi "toi co duoc phep xep hang tu vi tri nay khong".
    // Tep nay tra loi "he thong con dang nghe thay chiec xe nay khong". Neu hai bo so trung nhau
    // thi gan nhu chac chan ai do da chep sang, va mot man hinh van hanh se noi ra su im lang
    // muon hon han luc no thuc su xay ra.
    expect(HEALTHY).not.toBe(1_800);
    expect(LOST).not.toBe(14_400);
  });
});

describe('T10.4 — khong co ky vong bam vi tri', () => {
  it('KHONG co ky vong -> NOT_TRACKED, va KHONG BAO GIO LOST', () => {
    const result = classify({ expectation: null });

    expect(result.status).toBe('NOT_TRACKED');
    expect(result.reason).toBe('TRACKING_NOT_EXPECTED');
  });

  it('NOT_TRACKED khac LOST ngay ca khi chiec xe co mot ban dinh vi cu tu doi nao', () => {
    // Day la bai giu cho mot man hinh van hanh dung duoc: gop NOT_TRACKED vao LOST thi moi chiec
    // xe khong bat theo doi deu do, nguoi truc tat het canh bao, va tu do khong con canh bao nao
    // co nghia.
    const withOldPoint = classify({ expectation: null, samples: [phoneSample(86_400)] });

    expect(withOldPoint.status).toBe('NOT_TRACKED');
    expect(withOldPoint.status).not.toBe('LOST');
    // Khong ai yeu cau bam vi tri thi cung khong ai can biet lan cuoi no o dau.
    expect(withOldPoint.lastKnown).toBeNull();
    expect(withOldPoint.sources).toEqual([]);
  });

  it('ky vong vua mo, chua co ban nao -> DEGRADED/AWAITING, KHONG phai LOST', () => {
    // May thu GNSS khoi dong nguoi mat hang chuc giay. Bao "mat GPS" o day la sai theo nghia den.
    const result = classify({
      expectation: { tripId: 't', runId: null, sessionId: 's', since: agedBy(30) },
    });

    expect(result.status).toBe('DEGRADED');
    expect(result.reason).toBe('AWAITING_FIRST_OBSERVATION');
    expect(familyOf(result, 'PHONE')?.status).toBe('AWAITING_FIRST');
    expect(result.lastKnown).toBeNull();
  });

  it('ky vong mo qua lau ma chua he nhan ban nao -> LOST kem ly do RIENG', () => {
    const result = classify({
      expectation: { tripId: 't', runId: null, sessionId: 's', since: agedBy(LOST + 1) },
    });

    expect(result.status).toBe('LOST');
    // Hai duong toi LOST dan toi hai viec khac nhau cho nguoi truc: goi lai xe hoi duong, hay
    // kiem xem ung dung da cai dat chua. Mot co nhi phan se xoa mat khac biet do.
    expect(result.reason).toBe('NO_OBSERVATION_RECEIVED');
    expect(result.reason).not.toBe('NO_RECENT_OBSERVATION');
  });
});

/* ================================================================== *
 * T10.5-T10.8 — NHIEU NGUON
 * ================================================================== */

describe('T10.5 — toa do cu khong bao gio di ra nhu vi tri hien tai', () => {
  it('moi trang thai khac LIVE deu cho usableAsCurrent=false', () => {
    for (const ageSeconds of [HEALTHY + 1, LOST, LOST + 1, 86_400]) {
      const result = classify({ samples: [phoneSample(ageSeconds)] });

      expect(result.lastKnown?.usableAsCurrent, `tuoi ${ageSeconds}s`).toBe(false);
      expect(result.currentSource, `tuoi ${ageSeconds}s`).toBeNull();
    }
  });

  it('tuoi di kem toa do cu, de man hinh ve duoc "lan cuoi thay" chu khong phai mot cham xe', () => {
    const result = classify({ samples: [phoneSample(5_000)] });

    expect(result.lastKnown?.ageSeconds).toBe(5_000);
    expect(result.lastKnown?.observedAt).toBe(agedBy(5_000).toISOString());
  });
});

describe('T10.6 — dien thoai mat, phan cung tren xe con bao', () => {
  it('-> SOURCE_FALLBACK, va CA HAI trang thai nguon deu nhin thay duoc', () => {
    const result = classify({
      telematicsConfigured: true,
      samples: [phoneSample(LOST + 1), telematicsSample(120)],
    });

    expect(result.status).toBe('SOURCE_FALLBACK');
    expect(result.reason).toBe('PHONE_SILENT_TELEMATICS_RECENT');
    expect(result.currentSource).toBe('TELEMATICS');
    // "Both source states visible" — neu chi phat ra trang thai tong hop thi nguoi truc khong
    // biet dien thoai cua lai xe da chet, va khong ai di sua no.
    expect(familyOf(result, 'PHONE')?.status).toBe('LOST');
    expect(familyOf(result, 'TELEMATICS')?.status).toBe('LIVE');
    // Vi tri hien tai phai la cua PHAN CUNG, khong phai toa do cu cua dien thoai.
    expect(result.lastKnown?.point).toEqual(HAIPHONG);
    expect(result.lastKnown?.usableAsCurrent).toBe(true);
  });
});

describe('T10.7 — dien thoai moi, phan cung cu', () => {
  it('dien thoai VAN la nguon hien tai', () => {
    const result = classify({
      telematicsConfigured: true,
      samples: [phoneSample(60), telematicsSample(LOST + 1)],
    });

    expect(result.status).toBe('LIVE');
    expect(result.currentSource).toBe('PHONE');
    expect(result.lastKnown?.point).toEqual(HANOI);
    expect(familyOf(result, 'TELEMATICS')?.status).toBe('LOST');
  });

  it('dien thoai duoc xet TRUOC phan cung, nen mot xe co hop GSHT khong mai mai SOURCE_FALLBACK', () => {
    // Neu phan cung duoc xet truoc, mot chiec xe co hop GSHT se luon hien SOURCE_FALLBACK va tu
    // do tro di khong ai con nhin thay luc dien thoai that su chet.
    const bothFresh = classify({
      telematicsConfigured: true,
      samples: [phoneSample(60), telematicsSample(30)],
    });

    expect(bothFresh.status).toBe('LIVE');
    expect(bothFresh.currentSource).toBe('PHONE');
  });
});

describe('T10.8 — ca hai nguon deu mat', () => {
  it('-> ALL_SOURCES_LOST kem bang chung cuoi (ban MOI NHAT giua hai nguon)', () => {
    const result = classify({
      telematicsConfigured: true,
      samples: [phoneSample(LOST + 600), telematicsSample(LOST + 1)],
    });

    expect(result.status).toBe('ALL_SOURCES_LOST');
    expect(result.reason).toBe('NO_RECENT_OBSERVATION_ANY_SOURCE');
    expect(result.currentSource).toBeNull();
    // Bang chung cuoi la ban moi nhat — o day la phan cung, du no cung da mat.
    expect(result.lastKnown?.point).toEqual(HAIPHONG);
    expect(result.lastKnown?.usableAsCurrent).toBe(false);
    expect(result.lastKnown?.ageSeconds).toBe(LOST + 1);
  });

  it('khach CHUA khai telematics thi khong bao gio bi bao "mat ca hai nguon"', () => {
    const result = classify({ telematicsConfigured: false, samples: [phoneSample(LOST + 1)] });

    // Mot khach chua mua hop GSHT nao khong duoc hien "mat ca hai nguon" mai mai.
    expect(result.status).toBe('LOST');
    expect(result.status).not.toBe('ALL_SOURCES_LOST');
    expect(familyOf(result, 'TELEMATICS')?.status).toBe('NOT_CONFIGURED');
  });

  it('NOT_CONFIGURED khong phai LOST, va khong lam hong phep dem', () => {
    const result = classify({ telematicsConfigured: false, samples: [phoneSample(60)] });

    expect(result.status).toBe('LIVE');
    expect(familyOf(result, 'TELEMATICS')?.status).toBe('NOT_CONFIGURED');
    expect(familyOf(result, 'TELEMATICS')?.lastReceivedAt).toBeNull();
  });
});

/* ================================================================== *
 * T10.17 — IM LANG KHONG SUY RA NGUYEN NHAN
 * ================================================================== */

describe('T10.17 — khong mot ma ly do nao ta hanh vi con nguoi', () => {
  it('moi ma phat ra tu moi duong deu ta TINH SAN CO cua tin hieu', () => {
    const reasons = [
      classify({ expectation: null }).reason,
      classify({ samples: [phoneSample(60)] }).reason,
      classify({ samples: [phoneSample(HEALTHY + 1)] }).reason,
      classify({ samples: [phoneSample(LOST + 1)] }).reason,
      classify({ expectation: { tripId: 't', runId: null, sessionId: 's', since: agedBy(30) } })
        .reason,
      classify({
        expectation: { tripId: 't', runId: null, sessionId: 's', since: agedBy(LOST + 1) },
      }).reason,
      classify({
        telematicsConfigured: true,
        samples: [phoneSample(LOST + 1), telematicsSample(60)],
      }).reason,
      classify({
        telematicsConfigured: true,
        samples: [phoneSample(LOST + 1), telematicsSample(LOST + 1)],
      }).reason,
    ];

    // Tu mot khoang im lang, may chu khong the phan biet: tat ung dung, tat GPS, mat song, bi he
    // dieu hanh treo tien trinh nen, het pin, hong cam bien. NAM nguyen nhan, MOT quan sat.
    const forbidden = ['DRIVER', 'APP_CLOSED', 'GPS_OFF', 'BATTERY', 'REFUSED', 'IGNORED'];
    for (const reason of reasons) {
      for (const word of forbidden) {
        expect(reason, `ma "${reason}" khong duoc ta nguyen nhan`).not.toContain(word);
      }
    }
  });
});

/* ================================================================== *
 * TINH TAT DINH
 * ================================================================== */

describe('tinh tat dinh', () => {
  it('khong doc dong ho: cung dau vao + cung `now` -> cung ket qua', () => {
    const shared = input({ telematicsConfigured: true, samples: [phoneSample(HEALTHY + 1)] });

    expect(classifyLocationHealth(shared, NOW, POLICY)).toEqual(
      classifyLocationHealth(shared, NOW, POLICY),
    );
  });

  it('thu tu ban dinh vi trong mang KHONG doi ket qua — chon theo `receivedAt`, khong theo vi tri', () => {
    const older = phoneSample(900);
    const newer = phoneSample(60, { point: HAIPHONG });

    const ascending = classifyLocationHealth(input({ samples: [older, newer] }), NOW, POLICY);
    const descending = classifyLocationHealth(input({ samples: [newer, older] }), NOW, POLICY);

    expect(ascending).toEqual(descending);
    expect(ascending.lastKnown?.point).toEqual(HAIPHONG);
  });

  it('mot `receivedAt` o TUONG LAI cho tuoi 0, khong phai mot so am chay xuoi qua moi nguong', () => {
    // Chi xay ra khi dong ho may chu bi chinh lui. Ket qua dung la "vua nhan xong".
    const result = classifyLocationHealth(input({ samples: [phoneSample(-600)] }), NOW, POLICY);

    expect(result.ageSeconds).toBe(0);
    expect(result.status).toBe('LIVE');
  });
});

/* ================================================================== *
 * T10.14-T10.16 — KHUNG NHIN DOC VA QUYEN
 * ================================================================== */

describe('T10.16 — che toa do theo quyen', () => {
  const health = () => classify({ samples: [phoneSample(60)] });

  it('nguoi CO quyen doc duong di tho thay toa do', () => {
    const view = toLocationHealthView(health(), { canReadCoordinates: true });

    expect(view.lastKnown?.point).toEqual(HANOI);
    expect(view.lastKnown?.coordinatesRedacted).toBe(false);
  });

  it('nguoi KHONG co quyen do van doi soat duoc, nhung khong thay MOT CAP SO nao', () => {
    const source = health();
    const view = toLocationHealthView(source, { canReadCoordinates: false });

    expect(view.lastKnown?.point).toBeNull();
    // Noi RO la bi che, de man hinh khong ve mot o trong roi de nguoi doc tu doan.
    expect(view.lastKnown?.coordinatesRedacted).toBe(true);

    // Va moi thu KHONG phai toa do van con — cat het di thi ke toan mat kha nang doi soat.
    expect(view.status).toBe(source.status);
    expect(view.reason).toBe(source.reason);
    expect(view.ageSeconds).toBe(source.ageSeconds);
    expect(view.currentSource).toBe(source.currentSource);
    expect(view.sources).toEqual(source.sources);
    // Mot loi khai ve DO TIN cua ban ghi, khong phai mot toa do.
    expect(view.lastKnown?.usableAsCurrent).toBe(source.lastKnown?.usableAsCurrent);
  });

  it('khong co bang chung thi khung nhin cung khong bia ra mot khoi rong', () => {
    const view = toLocationHealthView(classify({ expectation: null }), {
      canReadCoordinates: false,
    });

    expect(view.lastKnown).toBeNull();
  });

  it('KHONG mot truong nao cua khung nhin bi che chua toa do', () => {
    const view = toLocationHealthView(classify({ samples: [phoneSample(60)] }), {
      canReadCoordinates: false,
    });

    // Bai vit chac: neu mot ngay ai do them mot truong mang toa do (vd `centroid`) vao ket qua ma
    // quen che no, chuoi JSON se lai chua so — va bai nay do.
    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain(String(HANOI.latitude));
    expect(serialised).not.toContain(String(HANOI.longitude));
  });
});

describe('T10.14-T10.15 — hai ma quyen, hai cau hoi khac nhau', () => {
  it('ke toan doc duoc TOM TAT nhung KHONG doc duoc duong di tho', () => {
    expect(presetIncludes('ACCOUNTING', 'transport.tracking.read')).toBe(true);
    expect(presetIncludes('ACCOUNTING', 'transport.location.history.read')).toBe(false);
  });

  it('quan tri doc duoc ca hai', () => {
    expect(presetIncludes('ADMIN', 'transport.tracking.read')).toBe(true);
    expect(presetIncludes('ADMIN', 'transport.location.history.read')).toBe(true);
  });

  it('vai cua lai xe khong doc duoc be mat van hanh nao', () => {
    // `SALE` la vai cua lai xe — ho chi co cac ma pham vi CHINH MINH.
    expect(presetIncludes('SALE', 'transport.tracking.read')).toBe(false);
    expect(presetIncludes('SALE', 'transport.location.history.read')).toBe(false);
  });
});
