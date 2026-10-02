import { describe, expect, it, vi } from 'vitest';
import { GatedPlaceSearchAdapter } from './gated-place-search.adapter.js';
import {
  DEFAULT_PLACE_SEARCH_BASE_URL,
  DEFAULT_PLACE_SEARCH_USER_AGENT,
  createPlaceSearchPort,
  processWidePlaceSearchGate,
  selectPlaceSearchProvider,
} from './place-search-provider.factory.js';
import { UnconfiguredPlaceSearchAdapter } from './place-search.port.js';
import { ProviderCallGate } from './provider-call-gate.js';

describe('chon nha cung cap tim dia diem', () => {
  /** Khong ai khai gi -> TAT, va do la mac dinh dung, khong phai su co. */
  it('khong cau hinh gi -> none, khong ly do', () => {
    expect(selectPlaceSearchProvider({})).toEqual({ provider: 'none', degradedReason: null });
    expect(selectPlaceSearchProvider({ TRANSPORT_PLACE_SEARCH_PROVIDER: ' NONE ' })).toEqual({
      provider: 'none',
      degradedReason: null,
    });
  });

  it('ten la -> none KEM ly do', () => {
    expect(selectPlaceSearchProvider({ TRANSPORT_PLACE_SEARCH_PROVIDER: 'google' })).toEqual({
      provider: 'none',
      degradedReason: 'PROVIDER_UNKNOWN',
    });
  });

  it('nominatim tren du lieu thu nghiem -> bat, dung goc + UA mac dinh', () => {
    expect(
      selectPlaceSearchProvider({
        TRANSPORT_PLACE_SEARCH_PROVIDER: 'Nominatim',
        DATA_CLASSIFICATION: 'test',
      }),
    ).toEqual({
      provider: 'nominatim',
      config: {
        baseUrl: DEFAULT_PLACE_SEARCH_BASE_URL,
        userAgent: DEFAULT_PLACE_SEARCH_USER_AGENT,
        contactEmail: null,
      },
    });
  });

  /**
   * Nominatim CHUA nam trong danh sach ben thu ba duoc duyet cho du lieu khach that (CLAUDE.md chi
   * duyet KiotViet + Claude API). Bat tren mot stack khach that phai la mot quyet dinh hop dong,
   * khong phai mot dong bien moi truong.
   */
  it('nominatim + DATA_CLASSIFICATION=customer -> none, chua duoc duyet', () => {
    expect(
      selectPlaceSearchProvider({
        TRANSPORT_PLACE_SEARCH_PROVIDER: 'nominatim',
        DATA_CLASSIFICATION: 'customer',
      }),
    ).toEqual({ provider: 'none', degradedReason: 'PROVIDER_NOT_APPROVED_FOR_CUSTOMER_DATA' });
  });

  it('URL goc tu khai: cat dau `/` cuoi; URL hong/co truy van -> none kem ly do', () => {
    const custom = selectPlaceSearchProvider({
      TRANSPORT_PLACE_SEARCH_PROVIDER: 'nominatim',
      TRANSPORT_PLACE_SEARCH_BASE_URL: 'https://geo.internal.test/nominatim/',
    });
    expect(custom).toMatchObject({
      provider: 'nominatim',
      config: { baseUrl: 'https://geo.internal.test/nominatim' },
    });

    for (const bad of [
      'khong phai url',
      'ftp://geo.test',
      'https://geo.test/?key=1',
      'https://u:p@geo.test',
    ]) {
      expect(
        selectPlaceSearchProvider({
          TRANSPORT_PLACE_SEARCH_PROVIDER: 'nominatim',
          TRANSPORT_PLACE_SEARCH_BASE_URL: bad,
        }),
      ).toEqual({ provider: 'none', degradedReason: 'BASE_URL_INVALID' });
    }
  });

  it('UA co ky tu ngoai ASCII -> dung UA mac dinh; email sai dang -> khong gui', () => {
    const selection = selectPlaceSearchProvider({
      TRANSPORT_PLACE_SEARCH_PROVIDER: 'nominatim',
      TRANSPORT_PLACE_SEARCH_USER_AGENT: 'Vận tải/1.0',
      TRANSPORT_PLACE_SEARCH_CONTACT_EMAIL: 'khong-phai-email',
    });

    expect(selection).toMatchObject({
      config: { userAgent: DEFAULT_PLACE_SEARCH_USER_AGENT, contactEmail: null },
    });
  });

  it('UA va email hop le cua nguoi van hanh duoc giu', () => {
    const selection = selectPlaceSearchProvider({
      TRANSPORT_PLACE_SEARCH_PROVIDER: 'nominatim',
      TRANSPORT_PLACE_SEARCH_USER_AGENT: 'OpsTransport/2.0 (+https://ops.test)',
      TRANSPORT_PLACE_SEARCH_CONTACT_EMAIL: 'ops@example.test',
    });

    expect(selection).toMatchObject({
      config: {
        userAgent: 'OpsTransport/2.0 (+https://ops.test)',
        contactEmail: 'ops@example.test',
      },
    });
  });
});

describe('dung cong tim dia diem', () => {
  it('mac dinh: adapter TAT, khong goi mang, khong canh bao', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const warn = vi.fn();
    const port = createPlaceSearchPort({}, { fetchImpl, warn });

    expect(port).toBeInstanceOf(UnconfiguredPlaceSearchAdapter);
    expect(port.providerId).toBe('none');
    expect(await port.search('dinh vu')).toEqual({
      status: 'DISABLED',
      reason: 'PROVIDER_UNCONFIGURED',
    });
    expect(await port.reverse({ latitude: 21, longitude: 105 })).toEqual({
      status: 'DISABLED',
      reason: 'PROVIDER_UNCONFIGURED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('du lieu khach -> TAT voi ma chua duoc duyet, kem MOT dong canh bao chi co ma', async () => {
    const warn = vi.fn();
    const port = createPlaceSearchPort(
      {
        TRANSPORT_PLACE_SEARCH_PROVIDER: 'nominatim',
        TRANSPORT_PLACE_SEARCH_CONTACT_EMAIL: 'ops@example.test',
        DATA_CLASSIFICATION: 'customer',
      },
      { warn },
    );

    expect(port.describe()).toEqual({
      available: false,
      providerId: 'none',
      reason: 'PROVIDER_NOT_APPROVED_FOR_CUSTOMER_DATA',
    });
    expect(await port.search('dinh vu')).toEqual({
      status: 'DISABLED',
      reason: 'PROVIDER_NOT_APPROVED_FOR_CUSTOMER_DATA',
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('PROVIDER_NOT_APPROVED_FOR_CUSTOMER_DATA');
    expect(warn.mock.calls[0]?.[0]).not.toContain('ops@example.test');
  });

  it('ten la -> TAT duoi ma PROVIDER_UNCONFIGURED (man hinh), ly do rieng vao log', async () => {
    const warn = vi.fn();
    const port = createPlaceSearchPort({ TRANSPORT_PLACE_SEARCH_PROVIDER: 'mapbox' }, { warn });

    expect(await port.search('dinh vu')).toEqual({
      status: 'DISABLED',
      reason: 'PROVIDER_UNCONFIGURED',
    });
    expect(warn.mock.calls[0]?.[0]).toContain('PROVIDER_UNKNOWN');
  });

  it('nominatim -> luon boc trong cong gioi han + bo nho dem', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('[]', { status: 200 }));
    const gate = new ProviderCallGate({ minSpacingMs: 0, maxWaiting: 3 });
    const port = createPlaceSearchPort(
      { TRANSPORT_PLACE_SEARCH_PROVIDER: 'nominatim' },
      { fetchImpl, gate },
    );

    expect(port).toBeInstanceOf(GatedPlaceSearchAdapter);
    expect(port.providerId).toBe('nominatim');
    expect(await port.search('dinh vu')).toEqual({ status: 'OK', value: [], fromCache: false });
    expect(await port.search('Dinh Vu')).toEqual({ status: 'OK', value: [], fromCache: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  /** Chinh sach "mot lan/giay" la cua CA ung dung: moi lan hoi deu nhan CUNG mot cong. */
  it('cong toan tien trinh la MOT doi tuong duy nhat', () => {
    expect(processWidePlaceSearchGate()).toBe(processWidePlaceSearchGate());
  });
});
