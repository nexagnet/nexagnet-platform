import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  canPerform,
  hasDriverScope,
  hasOperationsScope,
  hasPlatformPermission,
  hasStakeholderScope,
  operationsEmptyMessage,
  MANAGER_HAS_NO_TRANSPORT_SCOPE,
} from '../transport-actions';

/**
 * `#395` — NGUOI DANG XEM (vai + TAP QUYEN cua may chu) phai di toi MOI cong quyen cua man hinh.
 *
 * Loi ma bai nay chan: mot man hinh goi `canPerform(navigation.role, ...)` thay vi
 * `canPerform(navigation, ...)`. Chuoi vai tran van hop kieu (bai test cu can no), nen `tsc` KHONG
 * bat duoc — nhung man hinh do se doc bang theo VAI, va mot `MANAGER` duoc Giam doc cap quyen van
 * thay "chưa được cấp quyền" trong khi API dang cho phep. Bai nay doc MA NGUON va do lai.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPERIENCE = resolve(HERE, '..');
const HELPERS = [
  'canPerform',
  // `#395`: cong BO ma cua muc, va cau "Bạn chưa được cấp quyền xem …" cua phan phu.
  'canPerformAll',
  'missingActions',
  'hasOperationsScope',
  'hasDriverScope',
  'operationsEmptyMessage',
  'allowed',
];

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

/** Moi lan goi mot helper quyen ma doi so DAU la mot bieu thuc ket thuc bang `.role`. */
const HELPER_ON_ROLE = new RegExp(
  `\\b(${HELPERS.join('|')})\\(\\s*[A-Za-z_$][\\w$.]*\\.role\\s*[,)]`,
  'g',
);
/** Truyen `navigation.role` / `input.role` xuong mot component qua prop — cung loi, mot tang sau. */
const ROLE_PROP = /=\{\s*(navigation|input)\.role\s*\}/g;

describe('#395 — moi cong quyen cua man hinh nhan NGUOI DANG XEM, khong nhan chuoi vai', () => {
  const files = sourceFiles(EXPERIENCE);

  it('tim duoc ma nguon de do (bai do khong duoc xanh vi khong doc duoc gi)', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((file) => file.endsWith('TransportOperations.tsx'))).toBe(true);
  });

  it('khong helper quyen nao nhan `<x>.role`', () => {
    const offenders = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(HELPER_ON_ROLE)].map(
        (match) => `${relative(EXPERIENCE, file)}: ${match[0]}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('khong component nao nhan `navigation.role` qua prop', () => {
    const offenders = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(ROLE_PROP)].map(
        (match) => `${relative(EXPERIENCE, file)}: ${match[0]}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('bai do BAT duoc chinh loi no canh gac (doi chung am)', () => {
    const bad = "if (!canPerform(navigation.role, 'transport.trip.read')) return null;";
    expect([...bad.matchAll(HELPER_ON_ROLE)]).toHaveLength(1);
    expect([...'hasOperationsScope(input.role)'.matchAll(HELPER_ON_ROLE)]).toHaveLength(1);
    expect([...'<X role={navigation.role} />'.matchAll(ROLE_PROP)]).toHaveLength(1);
    expect([...'canPerform(navigation, action)'.matchAll(HELPER_ON_ROLE)]).toHaveLength(0);
    expect([...'canPerformAll(input.role, actions)'.matchAll(HELPER_ON_ROLE)]).toHaveLength(1);
    expect([...'<PermissionGate viewer={navigation.role} />'.matchAll(ROLE_PROP)]).toHaveLength(1);
  });
});

describe('#395 — helper doc tap quyen khi co, roi ve bang theo vai khi khong', () => {
  const managerWithFleet = {
    role: 'MANAGER' as const,
    permissions: new Set(['transport.vehicle.read']),
  };

  it('MANAGER co tap quyen → co pham vi van hanh, lam dung viec duoc cap', () => {
    expect(hasOperationsScope('MANAGER')).toBe(false);
    expect(hasOperationsScope(managerWithFleet)).toBe(true);
    expect(canPerform(managerWithFleet, 'transport.vehicle.read')).toBe(true);
    expect(canPerform(managerWithFleet, 'transport.vehicle.manage')).toBe(false);
    expect(operationsEmptyMessage({ role: 'MANAGER', permissions: new Set() })).toBe(
      MANAGER_HAS_NO_TRANSPORT_SCOPE,
    );
  });

  it('tap quyen THANG vai: Ke toan bi bot quyen thi mat quyen do du vai van la Ke toan', () => {
    expect(canPerform('ACCOUNTING', 'transport.vehicle.read')).toBe(true);
    expect(
      canPerform({ role: 'ACCOUNTING', permissions: new Set() }, 'transport.vehicle.read'),
    ).toBe(false);
  });

  it('khong co tap quyen (may chu cu) → dung ban guong theo vai; chua biet ai → hien', () => {
    expect(canPerform({ role: 'SALE', permissions: null }, 'transport.trip.read')).toBe(false);
    expect(canPerform({ role: null }, 'transport.trip.read')).toBe(true);
    expect(canPerform(null, 'transport.trip.read')).toBe(true);
    expect(hasDriverScope({ role: 'SALE' })).toBe(true);
    expect(hasDriverScope({ role: 'SALE', permissions: new Set(['transport.vehicle.read']) })).toBe(
      false,
    );
  });

  it('pham vi ben gop von CHI den tu cau tra loi cua may chu — khong tu vai, khong tu tap quyen', () => {
    const action = 'transport.stakeholder.self.vehicle.read';
    // Chua biet ai: van KHONG — khong vai nao mang pham vi nay, "hien het" o day la hua sai.
    expect(canPerform(null, action)).toBe(false);
    expect(canPerform({ role: 'ADMIN' }, action)).toBe(false);
    // Tap quyen co ghi ma do cung khong du: `/auth/me` khong phai noi tra loi cau nay.
    expect(canPerform({ role: 'MANAGER', permissions: new Set([action]) }, action)).toBe(false);
    const linked = {
      role: 'MANAGER' as const,
      permissions: new Set<string>(),
      stakeholderLinked: true,
    };
    expect(canPerform(linked, action)).toBe(true);
    expect(hasStakeholderScope(linked)).toBe(true);
    expect(hasStakeholderScope('MANAGER')).toBe(false);
    // Cau tra loi ben gop von khong mo them viec van hanh nao.
    expect(hasOperationsScope(linked)).toBe(false);
    expect(canPerform(linked, 'transport.vehicle.read')).toBe(false);
  });

  it('quyen nen tang: tap quyen quyet dinh; khong co tap quyen thi chi Giam doc', () => {
    expect(hasPlatformPermission({ role: 'ADMIN' }, 'platform.accounts.manage')).toBe(true);
    expect(hasPlatformPermission({ role: 'ACCOUNTING' }, 'platform.accounts.manage')).toBe(false);
    expect(hasPlatformPermission(null, 'platform.accounts.manage')).toBe(true);
    expect(
      hasPlatformPermission({ role: 'ADMIN', permissions: new Set() }, 'platform.accounts.manage'),
    ).toBe(false);
  });
});
