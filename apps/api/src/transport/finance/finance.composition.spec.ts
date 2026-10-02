import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';

const here = dirname(fileURLToPath(import.meta.url));

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

const SETTLEMENT = [
  'transport-core',
  'transport-costing',
  'transport-fuel',
  'transport-settlement',
] as const;

describe('composition cua bang tai chinh', () => {
  it('den cung `transport-settlement`', () => {
    expect(controllerNames(SETTLEMENT)).toContain('FinanceController');
    expect(providerTokens(SETTLEMENT)).toContain('FinanceSettlementFacts');
    // `#385` — cua so viec Run-first di cung bang, khong phai mot capability rieng.
    expect(providerTokens(SETTLEMENT)).toContain('FinanceRunFirstFacts');
  });

  /**
   * Mot khach chi theo doi chuyen va gia thanh, khong chay quyet toan, KHONG duoc thay mot bang
   * "cong no" — vi moi o tren do se bang 0. Mot bao cao dung ve mat so hoc ma sai ve mat nghiep vu
   * la kieu sai te nhat: no khong bao loi.
   */
  it('khong co mat khi chua bat `transport-settlement`', () => {
    expect(controllerNames(['transport-core', 'transport-costing'])).not.toContain(
      'FinanceController',
    );
  });

  it('khong co mat o khach khong dung van tai', () => {
    expect(controllerNames(['knowledge'])).not.toContain('FinanceController');
  });

  /**
   * CONG HAI SO LAI XE den va di cung `transport-workforce`.
   *
   * Day la thu lam cho `unavailableSources` co nghia: bat quyet toan ma khong tinh luong thi bang
   * van dung duoc, chi thieu hai o cuoi — va no NOI RA dieu do.
   */
  it('cong so du lai xe chi ton tai khi bat `transport-workforce`', () => {
    expect(providerTokens(SETTLEMENT)).not.toContain('FinanceDriverBalanceFacts');
    expect(providerTokens([...SETTLEMENT, 'transport-workforce'])).toContain(
      'FinanceDriverBalanceFacts',
    );
  });
});

/**
 * ===========================================================================
 * BAO CAO KHONG BAO GIO GHI — kiem o tang ma nguon, vi he kieu khong noi duoc dieu do.
 */
describe('be mat tai chinh khong co duong ghi nao', () => {
  const sourceOf = (file: string): string =>
    readFileSync(resolve(here, file), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('/*'))
      .join('\n');

  it('controller chi co `@Get`', () => {
    const source = sourceOf('finance.controller.ts');
    for (const verb of ['@Post', '@Put', '@Patch', '@Delete']) {
      expect(source, verb).not.toContain(verb);
    }
  });

  it('hai cong ra ngoai chi co ham doc', () => {
    const source = sourceOf('finance-facts.port.ts');
    const methods = source.match(/abstract (\w+)\(/g) ?? [];
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect(method).toMatch(/abstract (receivable|payable|tripMargins|balances)/);
    }
  });

  /**
   * `#385` — cong viec Run-first: MOT ham doc, va adapter khong goi mot ham ghi nao cua bon thu no
   * tiem. Quet ten ham goi tren moi phu thuoc — mot `create`/`record`/`set` o day la bao cao dang ghi.
   */
  it('cong viec Run-first chi co ham doc, va khong goi ham ghi nao', () => {
    const source = sourceOf('finance-run-first.port.ts');
    const methods = source.match(/abstract (\w+)\(/g) ?? [];
    expect(methods).toEqual(['abstract runFirstMargins(']);
    const calls = source.match(/this\.(movement|metrics|fuel|attributions)\.(\w+)\(/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toMatch(/\.(find|list|runMargin)\w*\($/);
    }
  });

  /**
   * BIEN TRUC TIEP KHONG DUOC GOI LA LAI RONG — #244 G5, va la mot cau lenh truc tiep cua chu so
   * huu. Quet CA thu muc: mot nhan sai o bat cu tep nao trong day cung du lam nguoi doc hieu rang
   * con so nay da tru chi phi co dinh.
   *
   * Quet qua `sourceOf` — tuc BO chu thich — va do khong phai mot cho ho. Cai bi cam la mot NHAN
   * di ra ngoai: mot chuoi hien thi, mot ten truong, mot ma ly do. Chinh khoi chu thich cua
   * `finance-summary.ts` PHAI nhac cum tu do de noi ra dieu cam; quet ca chu thich se lam bai nay
   * do vi chinh loi canh bao cua no — va cach sua duy nhat luc do la xoa loi canh bao di.
   */
  it('khong mot tep nao trong mien nay goi bien truc tiep la lai rong', () => {
    for (const file of [
      'finance-summary.ts',
      'finance-read.service.ts',
      'finance.controller.ts',
      'finance-facts.port.ts',
      'finance-decisions.ts',
      'company-margin.ts',
      'finance-run-first.port.ts',
    ]) {
      const source = sourceOf(file).toLowerCase();
      expect(source, `${file} goi bien truc tiep la lai rong`).not.toContain('lãi ròng');
      expect(source, `${file} goi bien truc tiep la net profit`).not.toContain('net profit');
      expect(source, `${file} goi bien truc tiep la loi nhuan rong`).not.toContain(
        'lợi nhuận ròng',
      );
    }
  });
});
