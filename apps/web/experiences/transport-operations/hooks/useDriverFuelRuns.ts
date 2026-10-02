'use client';

import { useQuery } from '@tanstack/react-query';
import { canPerform, type TransportViewerInput } from '../transport-actions';
import { transportApi } from '../transport-api';

/**
 * VIEC DUOC DIEU cho o khai phieu dau cua lai xe — `#364` (`GET /transport/me/fuel/runs`).
 *
 * Tep RIENG chu khong them vao `useTransportWorkspace.ts`: tuyen nay thuoc `transport-fuel`, gac bang
 * chinh quyen nop phieu (`transport.driver.self.fuel.submit`), va man Nhien lieu la noi DUY NHAT dung
 * no. Cong nam NGAY trong hook (`#395`) — `section-access.spec.ts` doc no va so voi ma cua route.
 */
export const driverFuelRunsQueryKey = ['transport', 'me', 'fuel', 'runs'] as const;

export function useDriverFuelRuns(viewer: TransportViewerInput) {
  return useQuery({
    queryKey: driverFuelRunsQueryKey,
    queryFn: () => transportApi.me.fuelRuns(),
    enabled: canPerform(viewer, 'transport.driver.self.fuel.submit'),
  });
}
