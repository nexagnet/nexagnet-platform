'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * TRAO TAY giua danh sach don va be mat tao don (`#379`) — tieu diem va loi bao sau khi tao.
 *
 * ===========================================================================
 * BE MAT THAY CHO DANH SACH, NEN TIEU DIEM PHAI DUOC DAT LAI.
 *
 * Mo be mat: nut "Tạo đơn mới" dang giu tieu diem bien mat cung danh sach — be mat tu dua tieu diem
 * vao tieu de cua no. Quay lai: tieu diem ve lai CHINH nut "Tạo đơn mới". Tao xong: tieu diem vao
 * cau "Đã tạo đơn …". Khong co buoc nay, tieu diem roi ve `<body>` va nguoi dung ban phim bat dau
 * lai tu dau trang, con trinh doc man hinh khong noi gi.
 *
 * ===========================================================================
 * VUNG THONG BAO CO MAT TRUOC, CHU DEN SAU.
 *
 * Mot `role="status"` sinh ra da co san chu thuong KHONG duoc doc (NVDA/VoiceOver). Nen danh sach
 * gan vung thong bao RONG truoc, roi moi dat chu vao o lan ve sau — luc do no la mot THAY DOI.
 */

const NOTICE_DELAY_MS = 150;

type Landing =
  { readonly kind: 'CANCELLED' } | { readonly kind: 'CREATED'; readonly notice: string };

export interface ComposerHandoff {
  readonly isComposing: boolean;
  /** Chu cua vung thong bao; `null` = vung rong (van co mat). */
  readonly notice: string | null;
  readonly openButtonRef: RefObject<HTMLButtonElement | null>;
  readonly noticeRef: RefObject<HTMLParagraphElement | null>;
  readonly open: () => void;
  readonly cancel: () => void;
  readonly created: (notice: string) => void;
}

export function useComposerHandoff(): ComposerHandoff {
  const [isComposing, setIsComposing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [landing, setLanding] = useState<Landing | null>(null);
  const openButtonRef = useRef<HTMLButtonElement | null>(null);
  const noticeRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (isComposing || landing === null) return undefined;
    if (landing.kind === 'CANCELLED') {
      openButtonRef.current?.focus();
      setLanding(null);
      return undefined;
    }
    /*
     * Danh sach vua gan voi vung thong bao RONG. Cay truy cap cua trinh duyet dung bat dong bo, nen
     * cho mot nhip de no nhan vung rong truoc — chu dat vao cung khung hinh thi van bi bo qua.
     */
    if (notice !== landing.notice) {
      const timer = window.setTimeout(() => setNotice(landing.notice), NOTICE_DELAY_MS);
      return () => window.clearTimeout(timer);
    }
    noticeRef.current?.focus();
    setLanding(null);
    return undefined;
  }, [isComposing, landing, notice]);

  return {
    isComposing,
    notice,
    openButtonRef,
    noticeRef,
    open: () => {
      setNotice(null);
      setLanding(null);
      setIsComposing(true);
    },
    cancel: () => {
      setIsComposing(false);
      setLanding({ kind: 'CANCELLED' });
    },
    created: (text) => {
      setIsComposing(false);
      setNotice(null);
      setLanding({ kind: 'CREATED', notice: text });
    },
  };
}
