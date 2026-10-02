import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { presetIncludes } from '../transport-actions.js';
import { selectRoutingProvider } from './routing/routing-provider.factory.js';

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

const providerTokens = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).providers.map((provider) =>
    typeof provider === 'function'
      ? provider.name
      : typeof provider.provide === 'function'
        ? provider.provide.name
        : String(provider.provide),
  );

describe('composition cua be mat dieu xe', () => {
  /**
   * Den cung `transport-core` — KHONG mot capability moi.
   *
   * `CAPABILITY_IDS` la mot enum DONG trong `packages/tenant`: them mot ma o do buoc phai sua goi
   * nen tang roi build lai, va moi goi khach dang chay phai khai lai. Cau hoi *"xe nao nen nhan
   * don nay"* khong ton tai duoc neu khong co don va doi xe, nen no thuoc dung capability da co.
   */
  it('co mat o khach chi bat `transport-core`', () => {
    expect(controllerNames(['transport-core'])).toContain('DispatchController');
    expect(providerTokens(['transport-core'])).toContain('DispatchService');
  });

  it('khong co mat o khach khong dung van tai', () => {
    expect(controllerNames(['knowledge'])).not.toContain('DispatchController');
  });

  /**
   * HAI CONG TUY CHON den va di CUNG capability so huu chung.
   *
   * Day la thu lam cho `LOCATION_CAPABILITY_ABSENT` co nghia: neu adapter van duoc dang ky khi
   * `transport-proof` tat thi service se khong bao gio nhan `undefined`, va bang se im lang bao
   * rang khong xe nao co vi tri — trong y het mot doi xe da tat may.
   */
  it('cong vi tri chi ton tai khi bat `transport-proof`', () => {
    expect(providerTokens(['transport-core'])).not.toContain('DispatchLocationFacts');
    expect(providerTokens(['transport-core', 'transport-proof'])).toContain(
      'DispatchLocationFacts',
    );
  });

  it('cong canh bao chi ton tai khi bat `transport-asset-compliance`', () => {
    expect(providerTokens(['transport-core'])).not.toContain('DispatchComplianceFacts');
    expect(providerTokens(['transport-core', 'transport-asset-compliance'])).toContain(
      'DispatchComplianceFacts',
    );
  });

  it('cong LOI va cong dinh tuyen luon di cung `transport-core`', () => {
    const tokens = providerTokens(['transport-core']);
    expect(tokens).toContain('DispatchCoreFacts');
    expect(tokens).toContain('TransportRoutingPort');
    expect(tokens).toContain('DispatchAssignmentPlanner');
  });
});

describe('phan quyen cua be mat dieu xe', () => {
  /**
   * `#277 M13`: *"driver cannot query fleet-wide dispatch suggestions."*
   *
   * `SALE` la vai as-built cua lai xe (`GD-22`). Ma nay khong nam trong `SELF_SCOPE_ACTIONS`, nen
   * phep tru cua `OPERATIONS_ACTIONS` tu dong loai no ra — chinh sach den tu CAU TRUC, khong tu
   * mot dong cau hinh phai nho.
   */
  it('lai xe KHONG doc duoc bang de nghi cua ca doi xe', () => {
    expect(presetIncludes('SALE', 'transport.dispatch.suggest.read')).toBe(false);
  });

  it('Giam doc va Ke toan doc duoc bang de nghi', () => {
    expect(presetIncludes('ADMIN', 'transport.dispatch.suggest.read')).toBe(true);
    expect(presetIncludes('ACCOUNTING', 'transport.dispatch.suggest.read')).toBe(true);
  });

  /**
   * TOA DO chiu them mot cong nua, va do la cong DA CO cho duong di tho.
   *
   * Ke toan doc duoc bang nhung khong doc duoc vi tri xe — xem `DispatchController.callerOf()` va
   * bai kiem che toa do trong `dispatch.service.spec.ts`.
   */
  it('Ke toan KHONG co quyen doc duong di, nen khong thay toa do xe', () => {
    expect(presetIncludes('ACCOUNTING', 'transport.location.history.read')).toBe(false);
    expect(presetIncludes('ADMIN', 'transport.location.history.read')).toBe(true);
  });

  /**
   * DUONG GHI dung LAI ma quyen da chi phoi moi lan ghi vong chay/chang tren `main`.
   *
   * `#277 M13` doi *"preserve it"* — che ra mot ma `dispatch.commit` rieng se tao mot duong ghi
   * vong chay THU HAI voi mot bang phan quyen khac, va hai bang do se lech nhau.
   */
  it('duong ghi khong che them mot ma quyen nao', () => {
    expect(presetIncludes('ADMIN', 'transport.run.manage')).toBe(true);
    expect(presetIncludes('SALE', 'transport.run.manage')).toBe(false);
  });
});

describe('chon nha cung cap dinh tuyen', () => {
  /** Khong moi truong nao co khoa, nen duong mac dinh phai la duong tong hop — va no chay duoc. */
  it('khong cau hinh gi -> bo uoc luong tong hop, khong bao loi', () => {
    expect(selectRoutingProvider({})).toEqual({ provider: 'synthetic', degradedReason: null });
  });

  /** Mot cau hinh nua voi la mot SU CO, khong phai mot mac dinh im lang. */
  it('xin HERE ma khong co khoa -> quay ve tong hop KEM ma ly do', () => {
    expect(selectRoutingProvider({ TRANSPORT_ROUTING_PROVIDER: 'here' })).toEqual({
      provider: 'synthetic',
      degradedReason: 'HERE_API_KEY_MISSING',
    });
  });

  it('ten nha cung cap la -> quay ve tong hop KEM ma ly do', () => {
    expect(selectRoutingProvider({ TRANSPORT_ROUTING_PROVIDER: 'ban-do-nao-do' })).toEqual({
      provider: 'synthetic',
      degradedReason: 'PROVIDER_UNKNOWN',
    });
  });

  it('du ca hai thi moi chon HERE', () => {
    expect(
      selectRoutingProvider({ TRANSPORT_ROUTING_PROVIDER: 'HERE', HERE_API_KEY: ' k ' }),
    ).toEqual({ provider: 'here', degradedReason: null });
  });
});
