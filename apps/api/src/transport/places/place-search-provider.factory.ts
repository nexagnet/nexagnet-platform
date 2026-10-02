import { Logger } from '@nestjs/common';
import { GatedPlaceSearchAdapter } from './gated-place-search.adapter.js';
import type { NominatimConfig } from './nominatim.js';
import { NominatimPlaceSearchAdapter } from './nominatim-place-search.adapter.js';
import { TransportPlaceSearchPort, UnconfiguredPlaceSearchAdapter } from './place-search.port.js';
import { ProviderCallGate } from './provider-call-gate.js';

/**
 * CHON NHA CUNG CAP TIM DIA DIEM — mot ham thuan tren mot ban do bien moi truong.
 *
 * ===========================================================================
 * MAC DINH LA "TAT", VA DO LA MOT PHAT BIEU DUNG
 *
 * Nominatim cong khai la mot BEN THU BA: chuoi nguoi dung go (co khi la dia chi kho cua khach) di ra
 * ngoai. `CLAUDE.md` chi duyet KiotViet + Claude API cho du lieu khach, nen:
 *
 *   · khong khai gi                        -> TAT (`PROVIDER_UNCONFIGURED`), khong goi mang;
 *   · `nominatim` + `DATA_CLASSIFICATION=customer` -> TAT (`PROVIDER_NOT_APPROVED_FOR_CUSTOMER_DATA`);
 *   · `nominatim` tren du lieu thu nghiem  -> BAT;
 *   · ten la / URL goc hong                -> TAT kem MA LY DO — mot cau hinh nua voi la mot su co,
 *                                             khong phai mot mac dinh im lang.
 *
 * Tim kiem tat KHONG chan viec tao don: ban do, dia diem da biet va "Vi tri cua toi" van chay.
 *
 * ===========================================================================
 * VI SAO DOC `process.env` THAY VI `loadFoundationEnv()`
 *
 * Cung ly le voi `routing-provider.factory.ts`: day la bien cua MOT capability, tuy chon. Nhoi no
 * vao lop nen tang se bat moi khach — ke ca khach chi ban hang qua Zalo — mang them mot truong ve
 * tim dia diem, va moi bai boot cua nen tang phai biet mot khai niem cua mien van tai.
 */

export const DEFAULT_PLACE_SEARCH_BASE_URL = 'https://nominatim.openstreetmap.org';
export const DEFAULT_PLACE_SEARCH_USER_AGENT =
  'NexagnetTransport/1.0 (+https://github.com/phungtienviet14-sketch/nexagnet-platform)';

/** Chinh sach Nominatim cong khai: toi da MOT lan/giay cho CA ung dung. 1100 ms chua 10% le. */
export const PLACE_SEARCH_MIN_SPACING_MS = 1100;
/**
 * So yeu cau toi da XEP SAU lan goi dang chay (cong noi tiep: luon chi MOT lan goi dang chay).
 * Nguoi cho thu tu nhan "ban" ngay — xem `provider-call-gate.ts`.
 */
export const PLACE_SEARCH_MAX_WAITING = 3;

export interface PlaceSearchEnv {
  readonly TRANSPORT_PLACE_SEARCH_PROVIDER?: string;
  readonly TRANSPORT_PLACE_SEARCH_BASE_URL?: string;
  readonly TRANSPORT_PLACE_SEARCH_USER_AGENT?: string;
  readonly TRANSPORT_PLACE_SEARCH_CONTACT_EMAIL?: string;
  readonly DATA_CLASSIFICATION?: string;
}

export type PlaceSearchDegradedReason =
  'PROVIDER_UNKNOWN' | 'PROVIDER_NOT_APPROVED_FOR_CUSTOMER_DATA' | 'BASE_URL_INVALID';

export type PlaceSearchSelection =
  | {
      readonly provider: 'none';
      /** `null` khi TAT la vi khong ai khai gi — tuc mac dinh, khong phai su co. */
      readonly degradedReason: PlaceSearchDegradedReason | null;
    }
  | { readonly provider: 'nominatim'; readonly config: NominatimConfig };

export function selectPlaceSearchProvider(env: PlaceSearchEnv): PlaceSearchSelection {
  const requested = (env.TRANSPORT_PLACE_SEARCH_PROVIDER ?? '').trim().toLowerCase();
  if (requested === '' || requested === 'none') return { provider: 'none', degradedReason: null };
  if (requested !== 'nominatim') return { provider: 'none', degradedReason: 'PROVIDER_UNKNOWN' };

  if ((env.DATA_CLASSIFICATION ?? '').trim().toLowerCase() === 'customer') {
    return { provider: 'none', degradedReason: 'PROVIDER_NOT_APPROVED_FOR_CUSTOMER_DATA' };
  }

  const baseUrl = parseBaseUrl(env.TRANSPORT_PLACE_SEARCH_BASE_URL);
  if (baseUrl === null) return { provider: 'none', degradedReason: 'BASE_URL_INVALID' };

  return {
    provider: 'nominatim',
    config: {
      baseUrl,
      userAgent:
        headerSafe(env.TRANSPORT_PLACE_SEARCH_USER_AGENT) ?? DEFAULT_PLACE_SEARCH_USER_AGENT,
      contactEmail: contactEmailOf(env.TRANSPORT_PLACE_SEARCH_CONTACT_EMAIL),
    },
  };
}

/** Goc URL http(s), khong truy van, khong manh — dau `/` cuoi bi cat de ghep duong dan on dinh. */
function parseBaseUrl(raw: string | undefined): string | null {
  const text = (raw ?? '').trim() || DEFAULT_PLACE_SEARCH_BASE_URL;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '') {
    return null;
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/u, '');
}

/**
 * Gia tri tieu de HTTP chi nhan ky tu ASCII in duoc. Mot UA co dau tieng Viet se lam `fetch` nem
 * o MOI lan goi — tuc tim kiem "sap" vinh vien ma trong nhu nha cung cap sap. Hong thi dung UA mac
 * dinh, van dinh danh duoc ung dung.
 */
function headerSafe(raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  return /^[\x20-\x7E]{1,200}$/u.test(text) ? text : null;
}

/** Email LIEN HE cua nguoi van hanh (khong phai cua nguoi dung). Sai dang thi khong gui. */
function contactEmailOf(raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/u.test(text) ? text : null;
}

/**
 * MOT cong cho CA tien trinh, tao lan dau can dung.
 *
 * Cong nam o cap module chu khong o cap adapter: chinh sach "mot lan/giay" la cua CA UNG DUNG. Hai
 * adapter (vd hai lan dung ung dung trong mot tien trinh kiem thu) ma hai cong se goi gap doi.
 */
let processWideGate: ProviderCallGate | null = null;
export function processWidePlaceSearchGate(): ProviderCallGate {
  processWideGate ??= new ProviderCallGate({
    minSpacingMs: PLACE_SEARCH_MIN_SPACING_MS,
    maxWaiting: PLACE_SEARCH_MAX_WAITING,
  });
  return processWideGate;
}

export interface PlaceSearchPortDeps {
  readonly fetchImpl?: typeof fetch;
  readonly gate?: ProviderCallGate;
  readonly now?: () => number;
  /** Noi ghi canh bao cau hinh luc khoi dong — tiem duoc de bai kiem thu khong in ra console. */
  readonly warn?: (message: string) => void;
}

const bootLogger = new Logger('TransportPlaceSearch');

/**
 * Dung cong tim dia diem dang chay. Nha cung cap THAT luon duoc boc trong cong gioi han + bo nho
 * dem; duong tat thi khong — no khong goi ai, khong co gi de gioi han hay dem.
 *
 * Mot cau hinh HONG (ten la, URL goc sai, nominatim tren du lieu khach) de lai MOT dong canh bao
 * luc khoi dong mang MA ly do — man hinh chi thay "tim kiem chua bat", con nguoi van hanh can biet
 * vi sao. Dong canh bao KHONG chep gia tri bien moi truong: URL hay email la cau hinh, khong can
 * lap lai trong log.
 */
export function createPlaceSearchPort(
  env: PlaceSearchEnv,
  deps: PlaceSearchPortDeps = {},
): TransportPlaceSearchPort {
  const selection = selectPlaceSearchProvider(env);
  if (selection.provider === 'none') {
    if (selection.degradedReason !== null) {
      const warn = deps.warn ?? ((message: string) => bootLogger.warn(message));
      warn(`Tim dia diem TAT do cau hinh: ${selection.degradedReason}`);
    }
    return new UnconfiguredPlaceSearchAdapter(
      selection.degradedReason === 'PROVIDER_NOT_APPROVED_FOR_CUSTOMER_DATA'
        ? 'PROVIDER_NOT_APPROVED_FOR_CUSTOMER_DATA'
        : 'PROVIDER_UNCONFIGURED',
    );
  }
  const inner = new NominatimPlaceSearchAdapter(selection.config, deps.fetchImpl ?? fetch);
  return new GatedPlaceSearchAdapter(inner, deps.gate ?? processWidePlaceSearchGate(), {
    ...(deps.now ? { now: deps.now } : {}),
  });
}
