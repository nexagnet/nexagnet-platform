'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { TRANSPORT_QUERY_KEYS } from '../hooks/useTransportWorkspace';
import { canPerform, type TransportViewerInput } from '../transport-actions';
import { accountLinksApi, accountsApi, ADMIN_QUERY_KEYS, placesAdminApi } from './admin-api';

/**
 * Doc du lieu khu QUAN TRI (`#395`). Moi query CHI chay khi man hinh can — danh sach ho so lai xe,
 * ben gop von chi doc khi dang noi tai khoan; lich su chi doc khi mo.
 *
 * `staleTime: 0` co y: day la man hinh Giam doc doi QUYEN cua nguoi khac. Mot o nho 5 phut o day la
 * mot cau "Người này làm được gì?" cu — dung loai cau khong duoc phep sai.
 *
 * Moi query doc mot route VAN TAI gac bang CHINH ma cua route do, ngay trong hook (`#395`): mot
 * nguoi chi duoc sua dia diem tung nhan `403` o lan doc danh sach vi hook doi `enabled` tu ben goi va
 * ben goi dua ma SUA. `section-access.spec.ts` doc cong o day va so voi controller cua API. Ba route
 * `/settings/users*` la cua NEN TANG (khong ma van tai) — cong cua chung la quyen nen tang ben goi.
 */

export function useAccounts(enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.accounts,
    queryFn: accountsApi.list,
    enabled,
    staleTime: 0,
  });
}

export function usePermissionCatalog(enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.catalog,
    queryFn: accountsApi.catalog,
    enabled,
    // Danh muc la ma nguon cua may chu — doi theo ban phat hanh, khong theo phut.
    staleTime: 10 * 60_000,
  });
}

export function useAccountAccess(userId: string | null) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.access(userId ?? 'none'),
    queryFn: () => accountsApi.access(userId as string),
    enabled: userId !== null,
    staleTime: 0,
  });
}

export function useAccountLinks(viewer: TransportViewerInput, userId: string | null) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.links(userId ?? 'none'),
    queryFn: () => accountLinksApi.of(userId as string),
    enabled: userId !== null && canPerform(viewer, 'transport.account_link.manage'),
    staleTime: 0,
    retry: false,
  });
}

export function useAccountHistory(userId: string | null, isOpen: boolean) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.history(userId ?? 'none'),
    queryFn: () => accountsApi.history(userId as string),
    enabled: isOpen && userId !== null,
    staleTime: 0,
  });
}

export function useDriverCandidates(viewer: TransportViewerInput, enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.drivers,
    queryFn: accountLinksApi.drivers,
    enabled: enabled && canPerform(viewer, 'transport.driver.read'),
    staleTime: 0,
  });
}

export function useStakeholderCandidates(viewer: TransportViewerInput, enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.stakeholders,
    queryFn: accountLinksApi.stakeholders,
    enabled: enabled && canPerform(viewer, 'transport.asset_ownership.read'),
    staleTime: 0,
  });
}

/** Sau MOI lenh ghi tai khoan: danh sach, quyen, lien ket, lich su cua nguoi do deu co the da doi. */
export function useInvalidateAccount() {
  const client = useQueryClient();
  return useCallback(
    (userId: string | null) => {
      void client.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.accounts });
      void client.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.drivers });
      void client.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.stakeholders });
      if (userId !== null) {
        void client.invalidateQueries({ queryKey: ['admin', 'accounts', userId] });
      }
      // Ho so lai xe o Doi xe hien "Đã nối"/"Chưa nối" — cung phai lam tuoi.
      void client.invalidateQueries({ queryKey: TRANSPORT_QUERY_KEYS.drivers });
      void client.invalidateQueries({ queryKey: TRANSPORT_QUERY_KEYS.assetStakeholders });
    },
    [client],
  );
}

/* ------------------------------------------------------------------ *
 * Dia diem van hanh
 * ------------------------------------------------------------------ */

/** Danh sach dia diem — `transport.geofence.read` (ma cua route), KHONG phai ma sua. */
export function useAdminPlaces(viewer: TransportViewerInput) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.places,
    queryFn: placesAdminApi.list,
    enabled: canPerform(viewer, 'transport.geofence.read'),
    staleTime: 0,
  });
}

export function usePlaceHistory(
  viewer: TransportViewerInput,
  placeId: string | null,
  isOpen: boolean,
) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.placeHistory(placeId ?? 'none'),
    queryFn: () => placesAdminApi.history(placeId as string),
    enabled: isOpen && placeId !== null && canPerform(viewer, 'transport.geofence.read'),
    staleTime: 0,
  });
}

export function useOwnerCustomers(viewer: TransportViewerInput, enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.customers,
    queryFn: placesAdminApi.customers,
    enabled: enabled && canPerform(viewer, 'transport.customer.read'),
    staleTime: 60_000,
  });
}

export function useOwnerCounterparties(viewer: TransportViewerInput, enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_QUERY_KEYS.counterparties,
    queryFn: placesAdminApi.counterparties,
    enabled: enabled && canPerform(viewer, 'transport.counterparty.read'),
    staleTime: 60_000,
  });
}

/**
 * Sau MOI lenh ghi dia diem: danh sach quan tri, danh sach don vi (co the vua them), va DIA DIEM DA
 * BIET cua man Tao don — khoa `['transport','places','known']` (§2.2).
 */
export function useInvalidatePlaces() {
  const client = useQueryClient();
  return useCallback(() => {
    void client.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.places });
    void client.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.counterparties });
    void client.invalidateQueries({ queryKey: TRANSPORT_QUERY_KEYS.knownPlaces });
    void client.invalidateQueries({ queryKey: TRANSPORT_QUERY_KEYS.planningPolicy });
  }, [client]);
}
