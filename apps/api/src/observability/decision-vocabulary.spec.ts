import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNT_DECISIONS } from '../auth/account-decisions.js';
import { CHANNEL_DECISIONS } from '../channels/channel-decisions.js';
import { SALES_ORDER_DECISIONS } from '../orders/sales-order-decisions.js';
import { TRANSPORT_COSTING_DECISIONS } from '../transport/costing/costing-decisions.js';
import { TRANSPORT_ACCOUNT_LINK_DECISIONS } from '../transport/fleet/account-link-decisions.js';
import { TRANSPORT_PLACE_ADMIN_DECISIONS } from '../transport/places/place-admin-decisions.js';
import { TRANSPORT_DECISIONS } from '../transport/transport-decisions.js';
import { TURN_DECISIONS } from '../turns/turn-decisions.js';
import { decisionReasonLabel, defineDecisionVocabulary } from './decision-vocabulary.js';

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * NEN TANG KHONG DUOC BIET NGHIEP VU CUA AI.
 *
 * Truoc 24/08/2026, `observability/decision-reasons.ts` chua ca `SALES_HANDOFF_REASONS` lan
 * `PRICING_REASONS`: tang quan sat — thu MOI khach deu dung — biet the nao la mot don va mot
 * lan ban giao ERP. Hau qua khong phai ly thuyet: mot capability ke toan tuong lai se phai them
 * ma cua no vao dung cai enum do, va moi khach deu nhin thay.
 */
describe('tu vung quyet dinh: nen tang giu KHUON, capability giu TU NGU', () => {
  it('tep co che cua nen tang khong chua mot thuat ngu nghiep vu nao', () => {
    const mechanism = readFileSync(resolve(srcDir, 'observability/decision-vocabulary.ts'), 'utf8');

    // Danh sach nay CO Y ngan: no khong phai bo loc chinh ta, no la mot to khai — nen tang
    // khong duoc nhac den don, gia, dai ly hay ERP.
    for (const businessTerm of ['order.', 'HANDOFF', 'PRICING', 'DEALER', 'ERP', 'sales-order']) {
      expect(mechanism, `nen tang khong duoc nhac "${businessTerm}"`).not.toContain(businessTerm);
    }
  });

  it('moi bo tu vung tu khai ai so huu no', () => {
    expect(TURN_DECISIONS.owner).toBe('turn-processing');
    expect(SALES_ORDER_DECISIONS.owner).toBe('sales-order');
    expect(CHANNEL_DECISIONS.owner).toBe('messaging');
    expect(TRANSPORT_DECISIONS.owner).toBe('transport-core');
    expect(TRANSPORT_COSTING_DECISIONS.owner).toBe('transport-costing');
    expect(ACCOUNT_DECISIONS.owner).toBe('platform-accounts');
    expect(TRANSPORT_PLACE_ADMIN_DECISIONS.owner).toBe('transport-places-admin');
    expect(TRANSPORT_ACCOUNT_LINK_DECISIONS.owner).toBe('transport-core');
  });

  /**
   * `#395`: quan tri tai khoan la viec cua NEN TANG, quan tri dia diem la viec cua MIEN van tai —
   * hai bo rieng, hai chu so huu, va khong ma ly do nao cua bo nay bi bo kia ghi de nhan
   * (`defineDecisionVocabulary` ghi de im lang).
   */
  it('#395: hai bo tu vung moi giu diem va nhan cua chinh no', () => {
    expect(ACCOUNT_DECISIONS.points).toEqual(['account.access']);
    expect(TRANSPORT_PLACE_ADMIN_DECISIONS.points).toEqual(['place.write']);
    for (const vocabulary of [ACCOUNT_DECISIONS, TRANSPORT_PLACE_ADMIN_DECISIONS]) {
      for (const [reason, label] of Object.entries(vocabulary.labels)) {
        expect(decisionReasonLabel(reason), reason).toBe(label);
      }
    }
  });

  /**
   * Hai capability van tai KHONG duoc dung chung mot bo tu vung.
   *
   * Mot khach co the bat `transport-core` ma khong bat `transport-costing`. Neu tron chung, bang loc
   * trace cua khach do se hua co mot diem "so quy lai xe" khong bao gio phat — va nguoi truc se ket
   * luan "nhanh nay khong chay" trong khi that ra no khong ton tai o khach do.
   */
  it('diem cua so quy nam trong bo cua costing, khong o bo cua transport-core', () => {
    expect(TRANSPORT_COSTING_DECISIONS.points).toContain('driver_fund.post_entry');
    expect(TRANSPORT_DECISIONS.points).not.toContain('driver_fund.post_entry');
    expect(TRANSPORT_DECISIONS.points).toContain('trip.lifecycle_transition');
    expect(TRANSPORT_COSTING_DECISIONS.points).not.toContain('trip.lifecycle_transition');
  });

  it('diem quyet dinh cua ban hang nam trong bo cua ban hang, khong o bo cua luot', () => {
    expect(SALES_ORDER_DECISIONS.points).toContain('order.auto_confirm');
    expect(SALES_ORDER_DECISIONS.points).toContain('rules.price');
    expect(TURN_DECISIONS.points).not.toContain('order.auto_confirm');
    expect(TURN_DECISIONS.points).not.toContain('rules.price');

    // …va nguoc lai: duong xu ly luot khong duoc de mot diem cua no roi sang ban hang.
    expect(TURN_DECISIONS.points).toContain('message.intake');
    expect(SALES_ORDER_DECISIONS.points).not.toContain('message.intake');
  });

  it('mot capability MOI dat duoc tu vung rieng ma khong dung toi bo nao dang co', () => {
    // Day chinh la kich ban "ke toan trong tuong lai" viet ra duoi dang code chay duoc.
    const ACCOUNTING = defineDecisionVocabulary({
      owner: 'accounting',
      points: ['invoice.issue'],
      labels: {
        VAT_POLICY_UNAPPROVED: 'Chính sách VAT chưa được duyệt',
        ISSUED: 'Đã xuất hoá đơn',
      },
    });

    expect(ACCOUNTING.points).toEqual(['invoice.issue']);
    // Nhan cua no tra cuu duoc ngay, khong phai sua mot tep nao cua nen tang hay cua ban hang.
    expect(decisionReasonLabel('VAT_POLICY_UNAPPROVED')).toBe('Chính sách VAT chưa được duyệt');
    // Va khong mot ma nao cua no lot vao bo tu vung cua ban hang.
    expect(Object.keys(SALES_ORDER_DECISIONS.labels)).not.toContain('VAT_POLICY_UNAPPROVED');
  });

  it('ma la khong biet -> tra chinh no, khong nem (fail-open cua tang quan sat)', () => {
    expect(decisionReasonLabel('MOT_MA_CHUA_AI_KHAI')).toBe('MOT_MA_CHUA_AI_KHAI');
  });
});

/**
 * TU VUNG PHAI MO TA SU THAT DANG XAY RA.
 *
 * `order.amend_window` ton tai trong bo tu vung tu 24/08/2026 ma KHONG co diem phat nao trong
 * source. Mot diem quyet dinh khong ai phat la te hon la khong khai bao no: no hua voi nguoi doc
 * trace rang co mot cho de nhin, va cho do trong rong. Nguoi debug se ket luan "nhanh nay khong
 * chay" trong khi that ra no chay va da tu choi khach.
 *
 * Bai nay quet MA NGUON that chu khong doc mot danh sach nao: mot diem chi duoc coi la co nguoi
 * phat khi ten cua no xuat hien trong mot tep khong phai spec va khong phai chinh tep tu vung.
 */
describe('moi diem quyet dinh deu co nguoi phat that', () => {
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : sourceFiles(full);
      if (!entry.endsWith('.ts')) return [];
      // Bo spec (chung gia lap loi goi) va bo chinh cac tep khai bao tu vung.
      if (entry.endsWith('.spec.ts') || entry.endsWith('-decisions.ts')) return [];
      return [full];
    });

  const corpus = sourceFiles(srcDir)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');

  const ALL_POINTS = [
    ...TURN_DECISIONS.points.map((point) => [TURN_DECISIONS.owner, point] as const),
    ...SALES_ORDER_DECISIONS.points.map((point) => [SALES_ORDER_DECISIONS.owner, point] as const),
    ...CHANNEL_DECISIONS.points.map((point) => [CHANNEL_DECISIONS.owner, point] as const),
    /*
     * Hai bo cua van tai duoc them o T3. `TRANSPORT_DECISIONS` (T2) BI BO SOT khoi danh sach nay
     * suot tu luc no ra doi — tuc bon diem quyet dinh cua `transport-core` chua bao gio duoc bai
     * nay soi. Them ca hai cung luc thay vi chi them bo moi: mot bai kiem chi soi mot nua so bo tu
     * vung la mot bai kiem noi doi ve pham vi cua chinh no.
     */
    ...TRANSPORT_DECISIONS.points.map((point) => [TRANSPORT_DECISIONS.owner, point] as const),
    ...TRANSPORT_COSTING_DECISIONS.points.map(
      (point) => [TRANSPORT_COSTING_DECISIONS.owner, point] as const,
    ),
    /* `#395` S2 — noi tai khoan voi ho so lai xe / ben gop von: co diem phat ngay tu lan dau. */
    ...TRANSPORT_ACCOUNT_LINK_DECISIONS.points.map(
      (point) => [TRANSPORT_ACCOUNT_LINK_DECISIONS.owner, point] as const,
    ),
    /*
     * `#395`: `account.access` co diem phat that tu lat quan tri tai khoan (`AuthService`);
     * `place.write` co diem phat tu man Dia diem van hanh (`PlaceAdminService`). Moi bo vao danh
     * sach nay CUNG LAN voi dong `telemetry.decision()` dau tien — khong truoc.
     */
    ...ACCOUNT_DECISIONS.points.map((point) => [ACCOUNT_DECISIONS.owner, point] as const),
    ...TRANSPORT_PLACE_ADMIN_DECISIONS.points.map(
      (point) => [TRANSPORT_PLACE_ADMIN_DECISIONS.owner, point] as const,
    ),
  ];

  it.each(ALL_POINTS)('%s / %s co it nhat mot diem phat trong source', (_owner, point) => {
    expect(
      corpus,
      `'${point}' co trong bo tu vung nhung khong tep nao phat no — hoac noi vao diem nghiep vu that, hoac bo khoi tu vung`,
    ).toContain(`'${point}'`);
  });
});
