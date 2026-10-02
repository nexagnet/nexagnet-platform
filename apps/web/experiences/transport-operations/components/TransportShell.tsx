'use client';

import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useBranding } from '../../../lib/branding';
import { AccountMenu } from './AccountMenu';
import {
  buildDriverUrl,
  buildSectionUrl,
  filterNavigationGroups,
  NAVIGATION_ENFORCEMENT_NOTE,
  SUPERSEDED_HEADING,
  supersededNote,
  type DriverScreen,
  type DriverScreenId,
  type SupersededEntry,
  type TransportNavigationGroup,
  type TransportSectionId,
} from '../navigation';

/**
 * VO cua be mat van hanh van tai.
 *
 * VO KHONG BIET DU LIEU — #161 §2 doi dung dieu do: moi khung nhin tu giu trang thai tai/loi/rong
 * cua chinh no. Nen tep nay khong goi mot query nao; no chi nhan danh muc da duoc loc va mot khoi
 * noi dung.
 *
 * `data-experience="transport-operations"` tren the goc phai GIU NGUYEN: hop dong
 * `apps/web/tenant-runtime.contract.mjs` doc chinh thuoc tinh do de chung minh mot image chay duoc
 * nhieu khach.
 */

const ROLE_LABEL: Readonly<Record<string, string>> = {
  SALE: 'Lái xe',
  ACCOUNTING: 'Kế toán',
  MANAGER: 'Quản lý',
  ADMIN: 'Giám đốc',
};

export const roleLabelOf = (role: string | null): string | null =>
  role === null ? null : (ROLE_LABEL[role] ?? role);

export function TransportShell({
  groups,
  superseded,
  activeSection,
  activeTitle,
  roleLabel,
  onNavigate,
  driverScreens,
  children,
}: {
  readonly groups: readonly TransportNavigationGroup[];
  /** Muc da co duong thay the (#339). Rong ⇒ khong bay loi phu nao. */
  readonly superseded: readonly SupersededEntry[];
  readonly activeSection: TransportSectionId;
  readonly activeTitle: string;
  readonly roleLabel: string | null;
  readonly onNavigate: (section: TransportSectionId) => void;
  /** Rong ⇒ khong bay loi vao be mat lai xe. */
  readonly driverScreens: readonly DriverScreen[];
  readonly children: ReactNode;
}) {
  const branding = useBranding();
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  /*
   * Giu duong dan that tren `href` de bam giua/mo tab moi van chay; chi chan lan bam thuong de dieu
   * huong trong ung dung. Danh muc chinh va loi phu di CUNG mot duong — mot muc cu mo tu loi phu
   * phai ghi lich su y het khi no con nam tren danh muc.
   */
  const navigateWithin = (event: MouseEvent<HTMLAnchorElement>, section: TransportSectionId) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    setDrawerOpen(false);
    onNavigate(section);
  };
  /*
   * Chu go vao o loc danh muc. Trang thai nay KHONG len dia chi, va do la co y: no khong tra loi
   * cau hoi "dia chi nay nghia la gi" (`resolveNavigation` giu doc quyen cau do), no chi la mot
   * loi tat cua mat trong mot lan nhin. Day mot o tim kiem danh muc len URL se lam Back thanh nut
   * xoa tung chu — dung loi ma `filterWithin` da phai tranh o `TransportOperations`.
   */
  const [navQuery, setNavQuery] = useState('');
  const shownGroups = filterNavigationGroups(groups, navQuery);

  return (
    <div
      className="tx-shell"
      data-experience="transport-operations"
      data-drawer={isDrawerOpen ? 'open' : 'closed'}
      style={
        {
          '--tx-accent': branding.themeColor,
          '--tx-canvas': branding.backgroundColor,
        } as CSSProperties
      }
    >
      {/* Duong nhay ban phim — phai la phan tu bat tieu diem DAU TIEN cua trang. */}
      <a className="tx-skip" href="#tx-main">
        Bỏ qua danh mục, vào nội dung
      </a>

      <aside className="tx-rail" id="tx-rail">
        <div className="tx-brand">
          <span className="tx-brand__monogram" aria-hidden="true">
            {branding.monogram}
          </span>
          <span className="tx-brand__text">
            <span className="tx-brand__name">{branding.shortName}</span>
            <span className="tx-brand__unit">Vận hành vận tải</span>
          </span>
        </div>

        {/*
          O LOC DANH MUC.

          Chi bay khi danh muc DAI. Voi vai Ke toan (7 muc) thi mot o tim kiem tren mot danh sach
          nhin het mot luot la them viec, khong phai bot; voi vai Giam doc (23 muc) thi no la thu
          duy nhat lam cot danh muc dung duoc ma khong phai doc tu dau.

          `type="search"` chu khong `type="text"`: trinh duyet cho san nut xoa, va tren dien thoai
          ban phim hien dung phim `Tìm`.
        */}
        {groups.reduce((total, entry) => total + entry.sections.length, 0) < 12 ? null : (
          <div className="tx-nav__filter">
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <input
              type="search"
              value={navQuery}
              onChange={(event) => setNavQuery(event.target.value)}
              placeholder="Lọc danh mục"
              aria-label="Lọc danh mục vận hành vận tải"
            />
          </div>
        )}

        <nav className="tx-nav" aria-label="Điều hướng vận hành vận tải">
          {shownGroups.length === 0 ? (
            /*
              KHONG de mot cot trong. Mot danh muc bien mat khong loi giai doc ra y het mot lan mat
              quyen — va do la ket luan dat nhat nguoi dung co the rut ra tu mot thanh ben rong.
            */
            <p className="tx-nav__none">
              {/* `#395`: chua go gi ma khong co muc nao la chuyen QUYEN, khong phai chuyen tim kiem. */}
              {navQuery.trim().length === 0
                ? 'Chưa có mục nào bạn được cấp quyền mở.'
                : `Không có mục nào khớp “${navQuery}”.`}
            </p>
          ) : null}
          {shownGroups.map((entry) => (
            <div className="tx-nav__group" key={entry.group.id}>
              {entry.group.label === '' ? null : (
                <p className="tx-nav__grouplabel">{entry.group.label}</p>
              )}
              <ul>
                {entry.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      className="tx-nav__item"
                      href={buildSectionUrl(section.id)}
                      aria-current={section.id === activeSection ? 'page' : undefined}
                      onClick={(event) => navigateWithin(event, section.id)}
                    >
                      <span>{section.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/*
          LOI PHU CHO MUC DA CO DUONG THAY THE (#339).

          Nam NGOAI `<nav>` chinh va ngoai o loc: no khong phai mot lua chon ngang hang voi viec hang
          ngay, nen go "chuyen" vao o loc khong duoc day no len canh don hang. Nhung no van la mot
          vung dieu huong co ten rieng, de nguoi con chuyen cu tim thay — va khi dang mo mot muc cu
          tu dau trang, dau `aria-current` hien o day chu khong bien mat.
        */}
        {superseded.length === 0 ? null : (
          <nav className="tx-rail__older" aria-label={SUPERSEDED_HEADING}>
            <p className="tx-rail__olderlabel">{SUPERSEDED_HEADING}</p>
            <ul>
              {superseded.map((entry) => (
                <li key={entry.section.id}>
                  <a
                    className="tx-rail__olderlink"
                    href={buildSectionUrl(entry.section.id)}
                    aria-current={entry.section.id === activeSection ? 'page' : undefined}
                    onClick={(event) => navigateWithin(event, entry.section.id)}
                  >
                    {entry.section.label}
                  </a>
                  <span className="tx-rail__oldernote">{supersededNote(entry)}</span>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="tx-rail__foot">
          {/*
            DANH TINH TAI KHOAN — #222 P1-D.

            Nhan vai o duoi VAN O LAI: no la mot dong ngan noi be mat nay dang loc theo quyen gi, va
            mot so bai e2e neo vao no. O tai khoan tra loi mot cau KHAC — "toi la ai" — nen hai thu
            khong thay the nhau.
          */}
          <AccountMenu variant="rail" />
          {roleLabel === null ? null : <p className="tx-rail__role">{roleLabel}</p>}
          {driverScreens.length === 0 ? null : (
            <a className="tx-rail__driverlink" href={buildDriverUrl('home')}>
              Mở màn hình lái xe →
            </a>
          )}
          {/*
            Ghi chu hieu luc dieu huong van o day, NGUYEN VAN — chi khong con la ba dong chu xam
            nam duoi moi man hinh. No tra loi dung mot cau hoi, va cau hoi do bay gio duoc hoi ra
            thanh loi. Chu van nam trong DOM khi ngan dong, nen tro ho tro va bo E2E doc duoc.
          */}
          <details className="tx-rail__why">
            <summary>Sao tôi không thấy mục nào đó?</summary>
            <p className="tx-rail__note">{NAVIGATION_ENFORCEMENT_NOTE}</p>
          </details>
        </div>
      </aside>

      <div className="tx-body">
        <div className="tx-topbar">
          <button
            type="button"
            className="tx-drawerbtn"
            aria-expanded={isDrawerOpen}
            aria-controls="tx-rail"
            onClick={() => setDrawerOpen((open) => !open)}
          >
            {isDrawerOpen ? 'Đóng danh mục' : 'Danh mục'}
          </button>
          <span className="tx-topbar__title">{activeTitle}</span>
        </div>

        <main className="tx-main" id="tx-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * VO cua be mat LAI XE — mot dia chi rieng trong cung experience (`GD-23`), toi uu cho dien thoai.
 *
 * Thanh dieu huong nam DUOI de ngon tay voi duoc, va thao tac chinh cua tung man luon nam tren cung
 * — #161 §3 doi "1–2 cham cho viec thuong lam".
 */
export function DriverShell({
  screens,
  activeScreen,
  onNavigate,
  onLeave,
  children,
}: {
  readonly screens: readonly DriverScreen[];
  readonly activeScreen: DriverScreenId;
  readonly onNavigate: (screen: DriverScreenId) => void;
  /** `null` ⇒ nguoi nay khong co pham vi van hanh, nen khong bay duong quay ra. */
  readonly onLeave: (() => void) | null;
  readonly children: ReactNode;
}) {
  const branding = useBranding();
  return (
    <div
      className="tx-driver"
      data-experience="transport-operations"
      style={{ '--tx-accent': branding.themeColor } as CSSProperties}
    >
      <a className="tx-skip" href="#tx-driver-main">
        Bỏ qua danh mục, vào nội dung
      </a>
      <header className="tx-driver__head">
        <span className="tx-driver__brand">{branding.shortName}</span>
        {onLeave === null ? null : (
          <button type="button" className="tx-btn tx-btn--ghost" onClick={onLeave}>
            Về vận hành
          </button>
        )}
        {/*
          390px la thiet bi that cua lai xe, nen danh tinh o day la mot O GOI LAI: mot dong
          `Tên · Vai trò`, mo ra moi thay du ba manh va nut `Đăng xuất`. Bay ca ba dong tren thanh
          dau se an mat chinh noi dung ma man hinh sinh ra de hien.
        */}
        <AccountMenu variant="compact" />
      </header>
      <main className="tx-driver__main" id="tx-driver-main" tabIndex={-1}>
        {children}
      </main>
      <nav className="tx-driver__tabs" aria-label="Điều hướng lái xe">
        {screens.map((screen) => (
          <a
            key={screen.id}
            href={buildDriverUrl(screen.id)}
            aria-current={screen.id === activeScreen ? 'page' : undefined}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              onNavigate(screen.id);
            }}
          >
            {screen.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
