'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  useCustomers,
  useNavigationInput,
  useTransportOrders,
} from '../hooks/useTransportWorkspace';
import { canPerform } from '../transport-actions';
import { transportApi } from '../transport-api';
import { toCustomerArWorkspace } from '../workspace/customer-ar';

/**
 * SO CONG NO KHACH HANG — mot lan doc, HAI cho ve.
 *
 * ==============================================================================================
 * VI SAO PHAI TACH RA KHOI COMPONENT
 * ==============================================================================================
 *
 * Man `Cong no & quyet toan` tra loi hai cau hoi, va chung KHONG duoc tron vao nhau:
 *
 *   · *khach dang no bao nhieu* — doc, va la ly do 9/10 lan nguoi ta mo man nay;
 *   · *toi phai lam gi tiep*    — go vao, va chi can khi co viec.
 *
 * Bon con so dau trang thuoc cau thu nhat, con bang don cho doi soat + bon ngan thao tac thuoc cau
 * thu hai. Ca hai cung doc MOT so. Neu moi ben tu goi lay thi hai ben se lech nhau mot nhip khi
 * moc `asOf` doi, va mot man hinh tien lech nhau mot nhip la mot man hinh khong dung duoc.
 *
 * `react-query` gom hai lan goi cung khoa thanh mot, nen hai component goi cung mot hook o day la
 * mot lan doc that su, khong phai hai.
 *
 * ==============================================================================================
 * `customerId` DI VAO CA BA DUONG DOC
 * ==============================================================================================
 *
 * Ba duong nay VON nhan `customerId`, chi la man hinh chua bao gio gui. Nen o chon khach tren dau
 * trang truoc day chi loc moi bang tuoi no, con so cong no ben tren no van la cua TAT CA khach —
 * hai con so canh nhau noi ve hai tap khach khac nhau ma khong cho nao noi ra dieu do.
 *
 * `null` van la `null`: `toQuery` bo qua tham so rong, nen khi chua chon khach nao thi yeu cau gui
 * len giong het hom nay.
 */

export interface CustomerArScope {
  /** Ngay nghiep vu dang `YYYY-MM-DD`. Bat buoc — may chu khong co mac dinh. */
  readonly asOf: string;
  readonly customerId: string | null;
}

/** Goc khoa cua ca ba duong doc. `invalidateQueries` theo goc nay lam moi ca so. */
export const CUSTOMER_AR_QUERY_ROOT = ['transport', 'customer-ar'] as const;

export function useCustomerArBook(scope: CustomerArScope) {
  const navigation = useNavigationInput();
  const customers = useCustomers(navigation);
  const orders = useTransportOrders(navigation);

  /*
   * Ba duong doc cua so deu doi `transport.customer_reconciliation.read` (`#395`). Truoc day ba
   * query KHONG co cong: nguoi mo man bang mot ma khac nhan `403` o ca ba, va so rong doc ra nhu
   * "khong ai no". Muc `Phải thu khách hàng` gio doi chinh ma nay; cong o day chan phan con lai.
   */
  const pending = useQuery({
    queryKey: [...CUSTOMER_AR_QUERY_ROOT, 'pending', scope.customerId],
    queryFn: () => transportApi.customerAr.pending(scope.customerId),
    enabled: canPerform(navigation, 'transport.customer_reconciliation.read'),
  });
  const batches = useQuery({
    queryKey: [...CUSTOMER_AR_QUERY_ROOT, 'batches', scope.customerId],
    queryFn: () => transportApi.customerAr.batches(scope.customerId),
    enabled: canPerform(navigation, 'transport.customer_reconciliation.read'),
  });
  const summary = useQuery({
    queryKey: [...CUSTOMER_AR_QUERY_ROOT, 'summary', scope.asOf, scope.customerId],
    queryFn: () => transportApi.customerAr.summary(scope.asOf, scope.customerId),
    enabled: canPerform(navigation, 'transport.customer_reconciliation.read'),
  });

  const model = useMemo(
    () =>
      summary.data === undefined
        ? null
        : toCustomerArWorkspace({
            asOf: scope.asOf,
            pending: pending.data?.orders ?? [],
            batches: batches.data?.batches ?? [],
            summary: summary.data,
            // CHUA doc duoc danh ba (chua cap quyen, dang doc) → `undefined`: nhan noi "chưa đọc
            // được tên", KHONG noi "không còn trong danh mục" (`#395`).
            customers: customers.data?.map((customer) => ({
              id: customer.id,
              name: customer.name,
            })),
            orders: orders.data?.map((order) => ({ id: order.id, code: order.code })),
          }),
    [scope.asOf, batches.data, customers.data, orders.data, pending.data, summary.data],
  );

  const error = pending.error ?? batches.error ?? summary.error;

  return {
    model,
    /** Danh muc khach de CHON — khach da ngung hop tac khong con la mot lua chon hop le. */
    customerOptions: (customers.data ?? []).filter((customer) => customer.status === 'ACTIVE'),
    pendingOrders: pending.data?.orders ?? [],
    isLoading: pending.isLoading || batches.isLoading || summary.isLoading,
    errorMessage: error === null ? null : error.message,
  };
}
