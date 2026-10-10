'use client';

import { useBranding } from '../../lib/branding';

/**
 * View-only placeholder for the tenant-neutral legal-office surface (Issue #465).
 * It renders no legal action and claims no domain as implemented; the real UI is #450.
 */
export function LegalOffice() {
  const branding = useBranding();

  return (
    <main className="legal-office" data-experience="legal-office">
      <header>
        <p>{branding.shortName}</p>
        <h1>Văn phòng pháp lý</h1>
        <p>Các nghiệp vụ của văn phòng chưa được triển khai trên nền tảng này.</p>
      </header>
    </main>
  );
}
