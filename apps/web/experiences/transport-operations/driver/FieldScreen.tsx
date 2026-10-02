'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import { useNavigationInput } from '../hooks/useTransportWorkspace';
import { canPerform } from '../transport-actions';
import { newCorrelationKey, transportApi } from '../transport-api';
import type { DriverFieldAction } from '../transport-types';
import { toFieldScreen, type FieldLegCard } from '../workspace/driver-field';
import { toOperationalDocumentInput } from '../workspace/file-evidence';
import { ensureLocationProof, type LocationProofSlot } from './driver-location';

/**
 * MAN HINH HIEN TRUONG cua lai xe — `#279` O9.
 *
 * ============================================================================================
 * MAN HINH NAY KHONG BIET QUY TRINH
 * ============================================================================================
 *
 * No khong biet `PICKUP_DEPARTURE` phai di truoc `DELIVERY_ARRIVAL`, khong biet moc nao doi vi tri,
 * khong biet chung tu nao bat buoc. May chu tra ve mot danh sach NUT (`nextActions`), va man hinh
 * ve chung ra theo thu tu.
 *
 * Do la mot lua chon co y. Ba luat do song o `checkpoint-lifecycle.ts` va
 * `document-lifecycle.ts`; chep chung sang day se cho ra HAI ban, va ban tren dien thoai se cu roi
 * lai sau moi lan luat doi. Trieu chung la mot cai nut bam vao thi bao loi — dung kieu hong lam
 * nguoi dung mat long tin vao ca ung dung.
 *
 * ============================================================================================
 * KHOA CHONG LAP SINH MOT LAN, GIU QUA MOI LAN THU LAI
 * ============================================================================================
 *
 * `#279` O10: *"clientEventId generated once ... retry keeps same identity"*. Sinh moi o moi lan
 * goi lai se bien mot lan mat song thanh hai moc — va mot moc thua tren dong thoi gian la mot con
 * so sai trong ho so duyet phu cap.
 *
 * `eventKeys` giu khoa theo TUNG NUT, nen hai nut khac nhau khong dung chung mot khoa, va mot nut
 * bam lai ba lan van chi la mot su kien.
 *
 * KHOA CUA MOT NUT la `legId` + `kind` + MA NGHIEP VU (`checkpointType`/`documentType`), khong
 * phai `legId` + NHAN. Nhan la chuoi hien thi: hai viec khac han nhau tren cung mot chang co the
 * mang cung mot nhan sau mot lan doi chu o may chu, va luc do hai nut se dung CHUNG mot khoa —
 * viec thu hai se bi phat lai thanh ket qua cua viec thu nhat, va khong ai thay gi bat thuong.
 *
 * ============================================================================================
 * NUT "CAN VI TRI" LA MOT CHUOI BON BUOC, KHONG PHAI MOT LAN GOI
 * ============================================================================================
 *
 * Xem `driver-location.ts`. Ba buoc dau (doc GPS -> mo/dung lai phien theo `runId` -> gui ban dinh
 * vi) chay TRUOC buoc ghi moc, va khong buoc nao trong ba buoc do duoc lam lai o lan bam thu hai.
 * Neu trinh duyet khong cho vi tri, chuoi dung ngay tu buoc 1 va KHONG mot yeu cau ghi moc nao
 * duoc gui — mot moc "toi da den noi" khong co gi chung minh la dung thu ma chinh sach nay sinh
 * ra de chan.
 *
 * ============================================================================================
 * MOT TEP DA TAI LEN KHONG TAI LEN LAN THU HAI
 * ============================================================================================
 *
 * Nut chung tu di qua Nen tang Tep (`#287`): tai tep len truoc, roi ghi chung tu voi
 * `basis: DIGITAL_FILE`. Khoa cua mot lan tai la DANH TINH NUT (`slotOf`) cong DANH TINH TEP (ten
 * + kich thuoc + lan sua cuoi), khong phai nhan hien thi — cung mot ly do voi `eventKeys` o tren.
 * Bam lai sau mot loi ghi chung tu dung lai `fileId` da co; chon sang tep khac thi la mot lan tai
 * moi va mot khoa moi.
 *
 * ============================================================================================
 * MOT MO HINH CU LA MOT NUT SAI — `#333` (UAT BUG-03)
 * ============================================================================================
 *
 * `nextActions` chi dung TAI LUC may chu tinh no. Vong chay duoc dong BAT DONG BO — luot quet
 * `RunClosureSweepScheduler` chay sau lan bam cuoi cua lai xe — nen mot man hinh khong bao gio doc
 * lai se giu mai o chon tep `Chup bien nhan giao hang` cua mot vong chay da ket thuc. Bam vao thi
 * may chu moi tu choi: dung trieu chung chu xe gap tren `transport-preview`.
 *
 * Ung dung tat `refetchOnWindowFocus` o cap goc (`app/providers.tsx`), nen man hinh nay bat lai no
 * cho RIENG minh, cong mot nhip `FIELD_WORK_REFRESH_MS`, va doc lai sau MOI lan ghi — ke ca lan bi
 * tu choi. Con mot khe giua lan doc va lan bam; khe do la viec cua cong o may chu
 * (`DOCUMENT_RUN_TERMINAL`, `CHECKPOINT_RUN_TERMINAL` duoi khoa), va cong do KHONG duoc noi long.
 */

/**
 * NHIP LAM MOI man hinh hien truong khi lai xe dung yen tren no.
 *
 * Nua chu ky mac dinh cua luot quet dong vong chay (`DEFAULT_RUN_CLOSURE_SWEEP_INTERVAL_SECONDS` =
 * 60): mot vong chay vua dong khong nam tren man hinh qua mot nhip quet. react-query KHONG lam moi
 * khi tab bi an (`refetchIntervalInBackground` mac dinh tat), nen nhip nay khong ton pin/mang cua
 * mot chiec dien thoai dang nam trong tui.
 */
const FIELD_WORK_REFRESH_MS = 30_000;

/**
 * DANH TINH CUA MOT NUT — ma nghiep vu, khong phai nhan hien thi.
 *
 * Xem khoi chu thich dau tep: hai nut mang cung mot nhan phai van la hai khoa. Ham nay o TAM TEP
 * chu khong trong than component, vi o chon tep ben duoi phai giu tep theo DUNG danh tinh nay —
 * giu theo nhan se cho hai nut cung nhan dung chung mot tep.
 */
const slotOf = (card: FieldLegCard, action: DriverFieldAction): string =>
  `${card.legId}:${action.kind}:${action.checkpointType ?? action.documentType ?? action.label}`;

export function DriverFieldWork() {
  const queryClient = useQueryClient();
  const navigation = useNavigationInput();
  const [failure, setFailure] = useState<string | null>(null);
  const eventKeys = useRef(new Map<string, string>());
  /** Chung cu vi tri DA LAM cho tung nut — giu qua moi lan render va moi lan bam lai. */
  const locationProofs = useRef(new Map<string, LocationProofSlot>());
  /** Tep DA TAI LEN cho tung nut + tung tep — bam lai khong tai len mot ban thu hai. */
  const uploadedFileIds = useRef(new Map<string, string>());

  const work = useQuery({
    queryKey: ['transport', 'me', 'field-work'],
    queryFn: () => transportApi.me.fieldWork(),
    // Cung cong voi man `field` (`DRIVER_SCREENS`) — `#395`: moi query gac bang dung ma cua route.
    enabled: canPerform(navigation, 'transport.driver.self.checkpoint.record'),
    // Xem khoi `MOT MO HINH CU LA MOT NUT SAI` dau tep — `#333`.
    refetchOnWindowFocus: true,
    refetchInterval: FIELD_WORK_REFRESH_MS,
  });

  const keyFor = (slot: string): string => {
    const existing = eventKeys.current.get(slot);
    if (existing !== undefined) return existing;
    const created = newCorrelationKey();
    eventKeys.current.set(slot, created);
    return created;
  };

  const proofSlotFor = (slot: string): LocationProofSlot => {
    const existing = locationProofs.current.get(slot);
    if (existing !== undefined) return existing;
    const created: LocationProofSlot = { observationEventId: newCorrelationKey() };
    locationProofs.current.set(slot, created);
    return created;
  };

  const act = useMutation({
    mutationFn: async (input: {
      readonly card: FieldLegCard;
      readonly action: DriverFieldAction;
      readonly file?: File;
    }) => {
      const { card, action } = input;
      const slot = slotOf(card, action);
      const clientEventId = keyFor(slot);

      if (action.kind === 'CHECKPOINT' && action.checkpointType !== undefined) {
        /*
         * Ba buoc dau chay TRUOC, va mot loi o day dung chuoi lai — khong mot yeu cau ghi moc nao
         * duoc gui di. Thong bao cua `LocationUnavailableError` noi ro la MOC CHUA DUOC GHI, de
         * lai xe biet minh con phai bam lai chu khong bo di.
         */
        const observationId = action.requiresLocation
          ? await ensureLocationProof(card.runId, proofSlotFor(slot))
          : undefined;
        return transportApi.me.recordCheckpoint({
          type: action.checkpointType,
          runId: card.runId,
          legId: card.legId,
          ...(observationId === undefined ? {} : { observationId }),
          clientEventId,
        });
      }
      if (action.kind === 'WAITING_START' && card.arrivalCheckpointId !== null) {
        return transportApi.me.startWaiting({
          runId: card.runId,
          legId: card.legId,
          arrivalCheckpointId: card.arrivalCheckpointId,
          reason: 'RECEIVER_NOT_READY',
          clientEventId,
        });
      }
      if (action.kind === 'DOCUMENT' && action.documentType !== undefined) {
        if (input.file === undefined) throw new Error('Chọn ảnh hoặc PDF trước khi ghi chứng từ.');
        const fileSlot = `${slot}:${input.file.name}:${input.file.size}:${input.file.lastModified}`;
        const heldFileId = uploadedFileIds.current.get(fileSlot);
        const fileId =
          heldFileId ?? (await transportApi.files.uploadOperationalDocument(input.file)).id;
        uploadedFileIds.current.set(fileSlot, fileId);
        return transportApi.me.recordDocument(
          toOperationalDocumentInput({
            fileId,
            type: action.documentType,
            runId: card.runId,
            legId: card.legId,
            clientEventId: keyFor(fileSlot),
          }),
        );
      }
      if (action.kind === 'RECEIPT_HANDOVER' && card.orderId !== null) {
        return transportApi.me.recordReceiptHandover({
          orderId: card.orderId,
          legId: card.legId,
          externalNote: 'Biên nhận giấy có chữ ký người nhận',
          clientEventId,
        });
      }
      throw new Error('Việc này chưa bấm được — thiếu dữ liệu neo.');
    },
    onSuccess: () => setFailure(null),
    // KHONG xoa khoa: lan thu lai phai mang DUNG khoa cu.
    onError: (error: Error) => setFailure(error.message),
    /*
     * DOC LAI SAU MOI LAN GHI — thanh cong HAY bi tu choi (`#333`).
     *
     * Mot lan tu choi la MAY CHU dang noi mo hinh tren man hinh da cu: `DOCUMENT_RUN_TERMINAL` nghia
     * la vong chay da dong tu luc lan doc truoc. Chi doc lai khi thanh cong se giu nguyen cai nut
     * vua bi tu choi, va lai xe se bam no lan nua. Doc lai KHONG dung vao khoa chong lap: ba cai
     * `useRef` o tren song qua moi lan doc, nen lan thu lai (neu nut van con) mang DUNG khoa cu.
     */
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['transport', 'me'] }),
  });

  if (work.isLoading) return <LoadingState label="Đang đọc việc hiện trường…" />;
  /*
   * TRANG LOI chi khi CHUA TUNG doc duoc. Man hinh nay tu lam moi (`#333`), nen mot lan lam moi
   * hong o vung mat song la chuyen thuong ngay — bien no thanh mot trang loi se xoa the dang lam va
   * tep vua chon cua lai xe. Da co mot lan doc thi giu no, kem dong bao `field-refresh-failed`.
   */
  if (work.data === undefined) {
    return work.error !== null ? (
      <ErrorState message={(work.error as Error).message} onRetry={() => void work.refetch()} />
    ) : (
      <EmptyState title="Chưa đọc được việc hiện trường." />
    );
  }

  const model = toFieldScreen(work.data);

  return (
    <>
      <h1 className="tx-driver__title">Hiện trường</h1>
      <p className="tx-driver__lead" data-testid="field-headline">
        {model.headline}
      </p>
      {work.error === null ? null : (
        <p className="tx-note tx-note--warn" role="status" data-testid="field-refresh-failed">
          Chưa làm mới được việc hiện trường — đang hiện lần đọc trước.
        </p>
      )}
      {failure === null ? null : <ErrorState message={failure} />}

      {model.current === null ? (
        <EmptyState title="Không còn việc nào cần bấm ngay." />
      ) : (
        <FieldLeg
          card={model.current}
          pending={act.isPending}
          onAct={(action, file) =>
            act.mutate({ card: model.current as FieldLegCard, action, file })
          }
        />
      )}

      {model.others.length === 0 ? null : (
        <section className="tx-driver__card" aria-label="Chặng khác">
          <h2>Chặng khác</h2>
          <ul className="tx-driver__list">
            {model.others.map((card) => (
              <li key={card.legId} data-testid="field-other-leg">
                <strong>{card.title}</strong> — {card.route} · {card.phaseLabel}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * MOT CHANG, va nhung viec bam duoc tren no.
 *
 * `tx-btn--wide` cho MOI nut: `#279` O9 doi *"390px usable"* va *"one/two taps for common steps"*.
 * Mot hang hai nut o 390px cho ra hai vung cham hep hon dau ngon tay cua mot nguoi dang deo gang.
 */
function FieldLeg({
  card,
  pending,
  onAct,
}: {
  readonly card: FieldLegCard;
  readonly pending: boolean;
  readonly onAct: (action: DriverFieldAction, file?: File) => void;
}) {
  const [documentFiles, setDocumentFiles] = useState<ReadonlyMap<string, File>>(new Map());
  return (
    <section
      className="tx-driver__card"
      aria-label="Chặng đang làm"
      data-testid="field-current-leg"
    >
      <h2>{card.title}</h2>
      <dl className="tx-driver__facts">
        <dt>Tuyến</dt>
        <dd data-testid="field-route">{card.route}</dd>
        <dt>Trạng thái</dt>
        <dd data-testid="field-phase">{card.phaseLabel}</dd>
        <dt>Đơn</dt>
        <dd>{card.orderCode ?? '—'}</dd>
      </dl>

      {card.waitingElapsed === null ? null : (
        <p className="tx-driver__lead" data-testid="field-waiting">
          Đang chờ người nhận: <strong>{card.waitingElapsed}</strong>
        </p>
      )}

      {card.handoverLabel === null ? null : (
        <p className="tx-driver__lead" data-testid="field-handover">
          {card.handoverLabel}
        </p>
      )}

      {card.capturedDocuments.length === 0 ? null : (
        <p className="tx-driver__lead" data-testid="field-captured">
          Đã chụp: {card.capturedDocuments.join(', ')}
        </p>
      )}

      {card.missingDocuments.length === 0 ? null : (
        <p className="tx-driver__lead" data-testid="field-missing">
          Còn thiếu: {card.missingDocuments.join(', ')}
        </p>
      )}

      <div className="tx-driver__actions">
        {card.actions.map((action) => {
          const slot = slotOf(card, action);
          const file = documentFiles.get(slot);
          return (
            <div key={slot}>
              {action.kind === 'DOCUMENT' ? (
                <label className="tx-field">
                  <span>Tệp cho {action.label}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={(event) => {
                      const selected = event.target.files?.[0];
                      if (selected === undefined) return;
                      setDocumentFiles((held) => new Map(held).set(slot, selected));
                    }}
                  />
                </label>
              ) : null}
              <button
                type="button"
                className="tx-btn tx-btn--go tx-btn--wide"
                disabled={pending || (action.kind === 'DOCUMENT' && file === undefined)}
                data-testid="field-action"
                onClick={() => onAct(action, file)}
              >
                {action.label}
                {action.requiresLocation ? ' (cần vị trí)' : ''}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
