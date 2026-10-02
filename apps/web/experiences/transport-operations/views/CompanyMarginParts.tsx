import type { MarginNote, MarginSourceModel } from '../workspace/company-margin';

/**
 * HAI MANH DUNG CHUNG cua `Tổng hợp tài chính` va `Hiệu quả từng chuyến` (`#385`).
 *
 * Hai man noi CUNG mot tong cua may chu, nen chung ve nguon va loi canh bao bang CUNG mot manh — hai
 * ban sao cua cung mot bang nho se troi, va khi do giam doc thay hai cach noi ve mot con so.
 */

/**
 * DOANH THU THEO NGUON: thanh ti le + bang hai dong. Thanh chi la HINH cua phan doanh thu, con so
 * that nam trong bang — nguoi doc bang tro ho tro doc bang, khong doc thanh.
 */
export function MarginSourceSplit({ sources }: { readonly sources: readonly MarginSourceModel[] }) {
  return (
    <div className="tx-split">
      <div className="tx-split__bar" aria-hidden="true">
        {sources.map((source) =>
          source.revenueShare === null || source.revenueShare === 0 ? null : (
            <span
              key={source.source}
              className={`tx-split__seg tx-split__seg--${source.source === 'RUN_FIRST_ORDER' ? 'run' : 'legacy'}`}
              style={{ flexBasis: `${source.revenueShare}%` }}
            />
          ),
        )}
      </div>
      <div className="tx-tablewrap">
        <table className="tx-split__table">
          <caption className="tx-table__caption">Doanh thu và biên theo nguồn</caption>
          <thead>
            <tr>
              <th scope="col">Nguồn</th>
              <th scope="col">Số việc</th>
              <th scope="col">Doanh thu</th>
              <th scope="col">Chi phí trực tiếp</th>
              <th scope="col">Biên trực tiếp</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.source}>
                <th scope="row">
                  <span
                    className={`tx-split__swatch tx-split__seg--${source.source === 'RUN_FIRST_ORDER' ? 'run' : 'legacy'}`}
                    aria-hidden="true"
                  />
                  {source.label}
                  {source.revenueShareLabel === null ? null : (
                    <span className="tx-split__share"> · {source.revenueShareLabel} doanh thu</span>
                  )}
                </th>
                <td>{source.countLabel}</td>
                <td>{source.revenueLabel}</td>
                <td>{source.deductionLabel}</td>
                <td>{source.marginLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Nhung dieu phai biet truoc khi tin tong. Rong thi khong ve gi — khong mot hop "khong co gi". */
export function MarginNotes({ notes }: { readonly notes: readonly MarginNote[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="tx-marginnotes" aria-label="Lưu ý về con số">
      {notes.map((note) => (
        <li key={note.text} className={`tx-marginnotes__${note.tone}`}>
          {note.text}
        </li>
      ))}
    </ul>
  );
}
