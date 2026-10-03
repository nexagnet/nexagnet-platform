// AUTOPILOT V4 / Phase 2 — cac thao tac GHI co idempotency, dung chung cho Reviewer/Repair/Autonomy.
//
// Chi nhan client GHI (token App V4). Moi comment co marker de lan chay lai khong dang trung va de
// workflow sau doc duoc bang chung do CHINH bot da dang.

import {
  NEEDS_HUMAN_LABEL,
  MARKER_KINDS,
  encodeMarker,
  trustedMarkers,
} from './autopilot-core.mjs';

/** Dang comment co marker, tru khi bot tin cay da dang cung `kind` voi cung gia tri o `dedupe`. */
export async function postMarkedComment({
  write,
  repository,
  prNumber,
  comments,
  kind,
  fields,
  dedupe,
  text,
}) {
  const existing = trustedMarkers(comments, kind).some(({ fields: seen }) =>
    dedupe.every((key) => seen[key] === String(fields[key])),
  );
  if (existing) return { posted: false };
  const body = [encodeMarker(kind, fields), text].join('\n');
  const created = await write.post(`/repos/${repository}/issues/${prNumber}/comments`, { body });
  return { posted: true, comment: created };
}

export const addNeedsHumanLabel = (write, repository, prNumber) =>
  write.post(`/repos/${repository}/issues/${prNumber}/labels`, { labels: [NEEDS_HUMAN_LABEL] });

/** NEEDS_HUMAN: dung vong tu dong, gan nhan `needs-human`, noi ro ly do bang ma. */
export async function escalateToHuman({
  write,
  repository,
  prNumber,
  comments,
  headSha,
  reason,
  runUrl,
}) {
  const result = await postMarkedComment({
    write,
    repository,
    prNumber,
    comments,
    kind: MARKER_KINDS.needsHuman,
    fields: { head: headSha, reason },
    dedupe: ['head', 'reason'],
    text: `**Autopilot V4: NEEDS_HUMAN** — \`${reason}\` tai \`${headSha}\`. Vong tu dong da dung; can nguoi xem.\n\nRun: ${runUrl}`,
  });
  await addNeedsHumanLabel(write, repository, prNumber);
  return result;
}
