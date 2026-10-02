'use client';

import { useId, useState, type ReactNode, type Ref } from 'react';
import type { StatusTone } from '../customer-view';

/**
 * Nguyen lieu trinh bay cua rieng mien van tai.
 *
 * Gom bon thu nho vao mot tep thay vi bon tep mot dong: #161 §6 dan *"khong dung mot he thiet ke
 * chung thu hai trong task nay"*, va bon component nay chi co nghia trong ngu canh van tai (phu
 * hieu hai truc, bang co cot dinh danh nghiep vu). Chung khong phai primitive chung.
 */

export function PageHeader({
  title,
  summary,
  context,
  actions,
  headingRef,
}: {
  readonly title: string;
  readonly summary?: string;
  /** Ngu canh dang xem — vd ky quy, lai xe dang chon. */
  readonly context?: ReactNode;
  /** MOT thao tac chinh. Neu thay minh muon nhieu, doc lai §7. */
  readonly actions?: ReactNode;
  /**
   * Co = be mat nay DUA TIEU DIEM vao tieu de khi mo (vd man tao don thay cho danh sach): tieu de
   * nhan tieu diem bang ma (`tabIndex=-1`) nhung khong nam trong vong Tab.
   */
  readonly headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <header className="tx-pagehead">
      <div className="tx-pagehead__text">
        <h1 ref={headingRef} tabIndex={headingRef === undefined ? undefined : -1}>
          {title}
        </h1>
        {summary === undefined ? null : <p className="tx-pagehead__summary">{summary}</p>}
        {context === undefined ? null : <div className="tx-pagehead__context">{context}</div>}
      </div>
      {actions === undefined ? null : <div className="tx-pagehead__actions">{actions}</div>}
    </header>
  );
}

/**
 * NGAN THAO TAC — mot form nhap lieu khong duoc chan dong doc.
 *
 * ==============================================================================================
 * VI SAO CAN MOT THU NGUYEN LIEU RIENG CHO VIEC NAY
 *
 * Man `Bao duong & giay to` cao 1370px o 1440px, va HAI trong sau khoi cua no la form luon mo:
 * `Lenh sua chua` (4 truong) va `Ho so giay to` (6 truong), nam xen giua ba bang du lieu. Man
 * `Nhien lieu` co form `Nhap bang ke cay xang` (5 truong) nam nga giua bo loc va bang. Nguoi mo
 * man hinh de xem *hom nay co gi den han* phai luot qua mot bai form moi toi duoc so lieu — moi
 * lan, ke ca nhung ngay khong nhap gi.
 *
 * Ngan nay DONG SAN. Tieu de + cau mo ta + nut mo van o day, nen khong ai mat duong vao; chi cac
 * o nhap la khong con chiem cho khi khong dung toi.
 *
 * ==============================================================================================
 * MOT QUYET DINH KHONG DUOC DAO NGUOC: `hidden`, KHONG phai thao khoi cay
 *
 * Khi dong, than ngan van nam trong DOM voi thuoc tinh `hidden`. Neu doi thanh `{isOpen && ...}`
 * thi:
 *
 *   · cac bai E2E doc van ban ca `#tx-main` bang `toContainText`/`not.toContainText` se doi nghia
 *     mot cach am tham — chung dang do NOI DUNG CO MAT, khong phai noi dung NHIN THAY;
 *   · moi lan mo ngan se dung lai state cua form tu dau, nen mot nguoi go nua chung roi dong nham
 *     mat sach nhung gi vua go.
 *
 * `hidden` giu ca hai tinh chat do, va van dung o muc tro ho tro: noi dung `hidden` khong duoc
 * trinh doc man hinh doc toi, va khong bat duoc tieu diem ban phim.
 */
export function CommandPanel({
  title,
  hint,
  openLabel,
  step,
  isOpen: controlledOpen,
  onOpenChange,
  children,
}: {
  readonly title: string;
  /** Mot cau noi ngan nay LAM GI. Khong co thi tieu de phai tu noi du. */
  readonly hint?: string;
  /** Chu tren nut mo. Mac dinh dung chinh tieu de, vi do thuong da la mot dong lenh. */
  readonly openLabel?: string;
  /**
   * So thu tu trong mot CHUOI viec. Chi dat khi cac ngan canh nhau that su phai lam theo thu tu —
   * mot con so o day noi "cai nay truoc cai kia" re hon mot doan van noi dieu do.
   */
  readonly step?: number;
  /**
   * KHONG truyen ⇒ ngan tu giu trang thai, dong san (hanh vi cu, va moi cho dang dung deu the).
   * Co truyen ⇒ NGUOI GOI giu trang thai.
   *
   * Cho duy nhat can toi hom nay: ghi nhan xong mot khoan tien thi viec ngay sau do la phan bo
   * chinh khoan vua ghi, va man hinh chon san khoan do (`#296`). Neu ngan phan bo van dong thi lua
   * chon da chon san nam sau mot cai nut va khong ai nhin thay no.
   */
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly children: ReactNode;
}) {
  const [selfOpen, setSelfOpen] = useState(false);
  const bodyId = useId();
  const isOpen = controlledOpen ?? selfOpen;

  const toggle = () => {
    const next = !isOpen;
    setSelfOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section className="tx-command" data-open={isOpen ? 'open' : 'closed'} aria-label={title}>
      <div className="tx-command__head">
        <div className="tx-command__text">
          <h3>
            {step === undefined ? null : <span className="tx-command__step">{step}</span>}
            {title}
          </h3>
          {hint === undefined ? null : <p className="tx-command__hint">{hint}</p>}
        </div>
        <button
          type="button"
          className="tx-command__toggle"
          aria-expanded={isOpen}
          aria-controls={bodyId}
          onClick={toggle}
        >
          {isOpen ? 'Đóng' : (openLabel ?? title)}
        </button>
      </div>
      <div className="tx-command__body" id={bodyId} hidden={!isOpen}>
        {children}
      </div>
    </section>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  href,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string | null;
  /** Co dia chi ⇒ con so la mot loi vao viec, khong phai mot trang tri. */
  readonly href?: string;
  /**
   * Chi dat khi con so TU NO mang mot trang thai — vd tien qua han. Mau chi to dam mot dieu ma
   * NHAN da noi ra bang chu, no khong bao gio duoc la thu DUY NHAT noi dieu do. Va phai dat that
   * tiet kiem: mot dai ma the nao cung co mau thi khong the nao noi len duoc nua.
   */
  readonly tone?: StatusTone;
}) {
  const body = (
    <>
      <span className="tx-metric__label">{label}</span>
      <strong className="tx-metric__value">{value}</strong>
      {hint == null ? null : <span className="tx-metric__hint">{hint}</span>}
    </>
  );
  const className = ['tx-metric', tone === undefined ? null : `tx-metric--${tone}`]
    .filter((part) => part !== null)
    .join(' ');
  return href === undefined ? (
    <div className={className}>{body}</div>
  ) : (
    <a className={`${className} tx-metric--link`} href={href}>
      {body}
    </a>
  );
}

/**
 * Phu hieu trang thai. Man Nhien lieu bay HAI cai canh nhau co chu dich — hai truc tra loi hai cau
 * hoi khac nhau va dong o hai thoi diem khac nhau, nen gop lai la mat thong tin.
 */
export function StatusBadge({
  label,
  tone,
  title,
}: {
  readonly label: string;
  readonly tone: StatusTone;
  readonly title?: string;
}) {
  return (
    <span className={`tx-badge tx-badge--${tone}`} title={title}>
      {label}
    </span>
  );
}

export interface DataColumn<Row> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: Row) => ReactNode;
  /**
   * Cot mang DINH DANH NGHIEP VU (ma chuyen, bien so). Duoc dung lam `rowheader` de nguoi doc bang
   * tro ho tro va Playwright deu neo vao mot o co nghia, chu khong neo vao chi so dong.
   */
  readonly isRowHeader?: boolean;
  /** Cot so — can phai. */
  readonly isNumeric?: boolean;
}

/**
 * Bang du lieu. `overflow-x` nam TRONG khung bang, khong o than trang — #161 §7 cam trang tran
 * ngang o be rong laptop thuong.
 *
 * ==============================================================================================
 * CHON MOT DONG THI BANG CO LAI VE DONG DO — `onShowAll`
 *
 * Khoi chi tiet cua moi man duoc ve SAU bang, nen bang cang dai thi thu vua bam cang xa: nguoi
 * dung bao cao dung cau *"o chi tiet lai hien ra o cuoi va toi phai cuon mai xuong cuoi de xem"*.
 * Man Chuyen xe da giai bai nay bang o tim kiem — ma chuyen vao o, bang con mot dong. Cac man con
 * lai KHONG co o tim kiem theo dinh danh cua dong (va them mot o tim kiem vao mot bang ba dong thi
 * lam giao dien te di, khong tot len), nen chung dung chinh co che nay.
 *
 * `onShowAll` VUA la cong tac VUA la duong ra, co chu dich: bang chi co lai khi goi y da co mot
 * duong quay lai ca danh sach. Khong the lo tay bay ra mot bang bi khoa vao mot dong ma nguoi dung
 * khong mo lai duoc — dieu do khong bieu dien duoc bang kieu neu hai thu la hai prop roi nhau.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  selectedKey,
  onSelect,
  onShowAll,
}: {
  readonly caption: string;
  readonly columns: readonly DataColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly selectedKey?: string | null;
  readonly onSelect?: (row: Row) => void;
  /**
   * Co ⇒ dang chon mot dong thi bang chi ve dong do, kem mot duong `Xem tất cả` goi ham nay.
   * Khong co ⇒ bang giu nguyen moi dong, y nhu truoc.
   */
  readonly onShowAll?: () => void;
}) {
  const selectedRow =
    selectedKey == null ? null : (rows.find((row) => rowKey(row) === selectedKey) ?? null);
  // Chi co lai khi dong dang chon THAT SU nam trong danh sach nay. Mot `selectedKey` tro ra ngoai
  // (bo loc vua doi, trang vua sang) ma van co bang lai se cho ra mot bang RONG — te hon han mot
  // bang dai.
  const isFocused = onShowAll !== undefined && selectedRow !== null && rows.length > 1;
  const visibleRows = isFocused && selectedRow !== null ? [selectedRow] : rows;

  return (
    <div className="tx-tablewrap">
      <table className="tx-table">
        <caption className="tx-table__caption">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.isNumeric === true ? 'tx-table__num' : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const key = rowKey(row);
            const isSelected = selectedKey != null && selectedKey === key;
            return (
              <tr
                key={key}
                data-selected={isSelected ? '' : undefined}
                onClick={onSelect === undefined ? undefined : () => onSelect(row)}
                className={onSelect === undefined ? undefined : 'tx-table__row--pick'}
              >
                {columns.map((column) =>
                  column.isRowHeader === true ? (
                    <th key={column.key} scope="row">
                      {column.render(row)}
                    </th>
                  ) : (
                    <td
                      key={column.key}
                      className={column.isNumeric === true ? 'tx-table__num' : undefined}
                    >
                      {column.render(row)}
                    </td>
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/*
        Noi RO bang dang bi thu hep, va noi bang mot con so. Mot bang lang le bo bot dong la cach
        nhanh nhat de nguoi dung ket luan "he thong mat du lieu cua toi".
      */}
      {isFocused ? (
        <p className="tx-table__focus" role="status">
          <span>Đang xem 1 / {rows.length} dòng</span>
          <button type="button" className="tx-btn tx-btn--small" onClick={onShowAll}>
            Xem tất cả
          </button>
        </p>
      ) : null}
    </div>
  );
}

/** Cap nhan/gia tri cho khoi chi tiet. */
export function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="tx-detailrow">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
