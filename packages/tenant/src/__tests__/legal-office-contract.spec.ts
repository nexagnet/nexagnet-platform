import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_IDS,
  EXPERIENCE_IDS,
  EXPERIENCE_REQUIREMENTS,
  tenantConfigSchema,
} from '../tenant.schema.js';

/** Synthetic, customer-neutral legal-office tenant: no real customer data. */
const LEGAL_OFFICE_CONFIG = {
  schemaVersion: 2,
  slug: 'fixture-legal-office',
  identity: { displayName: 'Fixture Legal Office', shortName: 'Legal' },
  branding: {
    productName: 'Legal Fixture',
    installName: 'Legal Fixture',
    pageTitle: 'Legal Fixture',
    pageDescription: 'Legal office fixture',
    themeColor: '#315b7d',
    backgroundColor: '#f5f7fb',
    monogram: 'L',
    composerPlaceholder: 'Nhap noi dung',
  },
  experience: 'legal-office',
  capabilities: ['legal-office-core'],
  policies: { readiness: { blockedCapabilities: [] } },
  integrations: {},
  bootstrap: {},
};

describe('legal-office experience contract (Issue #465)', () => {
  it('registers a stable experience and capability id', () => {
    expect(EXPERIENCE_IDS).toContain('legal-office');
    expect(CAPABILITY_IDS).toContain('legal-office-core');
    expect(EXPERIENCE_REQUIREMENTS['legal-office']).toEqual(['legal-office-core']);
  });

  it('accepts a synthetic tenant that enables only the legal-office core', () => {
    const parsed = tenantConfigSchema.safeParse(LEGAL_OFFICE_CONFIG);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('fails closed when the experience is chosen without its capability', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...LEGAL_OFFICE_CONFIG,
      capabilities: ['operations'],
    });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toMatch(/legal-office yeu cau capability/);
  });

  it('does not let the legal-office capability satisfy another experience', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...LEGAL_OFFICE_CONFIG,
      experience: 'operations-console',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown domain capability instead of silently accepting it', () => {
    const parsed = tenantConfigSchema.safeParse({
      ...LEGAL_OFFICE_CONFIG,
      capabilities: ['legal-office-core', 'legal-office-judgment-enforcement'],
    });
    expect(parsed.success).toBe(false);
  });

  it('keeps the existing experience requirements unchanged', () => {
    expect(EXPERIENCE_REQUIREMENTS['knowledge-workspace']).toEqual(['knowledge']);
    expect(EXPERIENCE_REQUIREMENTS['agent-workforce']).toEqual(['knowledge', 'operations']);
    expect(EXPERIENCE_REQUIREMENTS['transport-operations']).toEqual(['transport-core']);
    expect(EXPERIENCE_REQUIREMENTS['operations-console']).toEqual([
      'knowledge',
      'messaging',
      'turn-processing',
      'sales-order',
      'operations',
    ]);
  });
});
