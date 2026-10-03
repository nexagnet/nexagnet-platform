#!/usr/bin/env bash
# SAO LUU MOT STACK RA MOT NOI KHONG CUNG SO PHAN VOI NO.
#
# ===============================================================================================
# VI SAO KHONG DUNG `deploy/netviet/backup.sh`.
#
# Ban do lam dung mot viec quan trong — `pg_dump --format=custom`, tuc mot ban sao NHAT QUAN chu
# khong phai mot ban chep PGDATA dang chay. Nhung no `gcloud storage cp` len mot bucket GCS NAM
# TRONG CHINH DU AN GCP dang chay VM. Do la mot ban sao luu o CUNG MOT MIEN SU CO: mat tai khoan,
# mat du an, mot lenh xoa nham cap du an — mat ca hai. Va no khong ma hoa phia client: ai doc duoc
# bucket thi doc duoc don hang cua khach.
#
# Tep nay giu nguyen phan dung (pg_dump logic) va doi phan sai (dich den + ma hoa).
#
# ===============================================================================================
# VI SAO RESTIC, khong phai borg, khong phai kopia.
#
# Rang buoc that: mot VPS mot node, khong co may thu hai de chay agent, dich den la mot bucket
# S3-compatible o mot NHA CUNG CAP KHAC, chay bang systemd timer, khong ai ngoi nhin.
#
#   borg  — nen tot nhat, nhung KHONG noi duoc S3. No doi dau ben kia cung chay borg qua SSH.
#           Nghia la de co "offsite khac nha cung cap" phai mua them mot host biet borg. Loai vi
#           rang buoc ha tang, khong phai vi chat luong.
#   kopia — lam duoc moi thu restic lam va nen tot hon, nhung dinh dang kho con doi nhieu va mo
#           hinh cau hinh nang hon. Voi mot he thong ma NGUOI VAN HANH KHONG PHAI DAN KY THUAT
#           (CLAUDE.md), "it thu de sai" thang "nhanh hon".
#   restic — mot tep nhi phan tinh, ma hoa phia client MAC DINH (khong co che do tat), noi thang
#           S3/B2/SFTP/REST, `forget --keep-*` la chinh sach luu tru, `check` tu kiem toan ven kho.
#
# Danh doi da chap nhan: restic khong nen tot bang borg va `prune` ton bo nho hon. Voi kho vai
# tram MB cua mot stack (do that: CSDL zalo cua Ultty = 11 MB), ca hai deu khong phai van de.
#
# ===============================================================================================
# BI MAT KHONG BAO GIO DI QUA DONG LENH.
#
# Mat khau kho doc bang `RESTIC_PASSWORD_FILE` (mot DUONG DAN), khoa S3 doc tu tep roi export.
# Khong `--password <gia tri>`, khong `echo <khoa> |` — ca hai deu hien trong `ps`.
set -uo pipefail

STACK_SLUG="${STACK_SLUG:-${TENANT_SLUG:-ultty}}"
APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-${STACK_SLUG}}"
SECRET_DIR="${SECRET_DIR:-/srv/netviet/secrets}"
STATUS_DIR="${STATUS_DIR:-${APP_DIR}/.runtime}"
STATUS_FILE="${STATUS_DIR}/backup-status"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

PORTABLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./secret-source.sh
. "${PORTABLE_DIR}/secret-source.sh"

fail() {
  # QUAN SAT DUOC LA MOT BAT BIEN, khong phai mot tien nghi. Mot backup that bai am tham la mot
  # backup khong ton tai, va no chi lo ra vao dung luc can phuc hoi.
  mkdir -p "${STATUS_DIR}" 2>/dev/null || true
  printf 'stack=%s at=%s result=FAILURE reason=%s\n' "${STACK_SLUG}" "${STAMP}" "$1" >"${STATUS_FILE}" 2>/dev/null || true
  logger --priority user.err --tag netviet-backup "NETVIET_BACKUP_FAILURE ${STACK_SLUG} $1" 2>/dev/null || true
  echo "NETVIET_BACKUP_FAILURE ${STACK_SLUG} $1" >&2
  exit 1
}

command -v restic >/dev/null 2>&1 || fail 'restic_khong_co'
[[ -d "${APP_DIR}" ]] || fail "app_dir_khong_ton_tai"
mkdir -p "${STATUS_DIR}"

# --- CAU HINH KHO ------------------------------------------------------------------------------
# `RESTIC_REPOSITORY` phai tro toi mot NHA CUNG CAP KHAC voi noi dang chay VM. Script khong tu
# kiem duoc dieu do (no khong biet minh dang chay o dau), nen no kiem thu ma no KIEM DUOC: kho
# khong duoc la mot duong dan cuc bo tren chinh may nay.
RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-$(optional_secret restic-repository)}"
[[ -n "${RESTIC_REPOSITORY}" ]] || fail 'thieu_RESTIC_REPOSITORY'
case "${RESTIC_REPOSITORY}" in
  s3:* | b2:* | sftp:* | rest:* | azure:* | gs:* | swift:* | rclone:*) ;;
  *)
    [[ "${ALLOW_LOCAL_REPO:-0}" == '1' ]] \
      || fail 'kho_cuc_bo_khong_phai_offsite'
    ;;
esac
export RESTIC_REPOSITORY

RESTIC_PASSWORD_FILE="${SECRET_DIR}/restic-repo-password"
[[ -r "${RESTIC_PASSWORD_FILE}" ]] || fail 'thieu_mat_khau_kho'
export RESTIC_PASSWORD_FILE

# Khoa S3 doc tu tep bi mat roi export. `secret-source.sh` da tu choi tep co quyen long.
if [[ -r "${SECRET_DIR}/restic-s3-access-key-id" ]]; then
  AWS_ACCESS_KEY_ID="$(secret restic-s3-access-key-id)" || fail 'khoa_s3_khong_doc_duoc'
  AWS_SECRET_ACCESS_KEY="$(secret restic-s3-secret-access-key)" || fail 'khoa_s3_khong_doc_duoc'
  export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
fi

restic cat config >/dev/null 2>&1 || restic init >/dev/null 2>&1 || fail 'khong_mo_duoc_kho'

# --- CAC CSDL PHAI SAO LUU ---------------------------------------------------------------------
# Suy tu HO SO cua stack, khong tu mot danh sach co dinh: `flowise` chi ton tai khi ho so bat no,
# va `pg_dump` mot CSDL khong ton tai se danh do CA lan sao luu.
cd "${APP_DIR}" || fail 'khong_vao_duoc_app_dir'
# shellcheck source=/dev/null
. "${APP_DIR}/stack-compose.sh" 2>/dev/null || fail 'thieu_stack-compose.sh'
netviet_load_stack_composition || fail 'ho_so_stack_khong_doc_duoc'
COMPOSE=(docker compose --env-file .runtime/secrets.env "${NETVIET_COMPOSE_FILES[@]}")
DATABASES=(zalo)
[[ "${NETVIET_FLOWISE_ENABLED}" == 'on' ]] && DATABASES+=(flowise)

# --- SAO LUU CSDL: dump ROT THANG VAO restic ---------------------------------------------------
# `--stdin` chu khong phai ghi ra tep roi tai len: ban dump KHONG BAO GIO cham dia o dang chua ma
# hoa. Neu may bi chiem giua chung thi khong co tep nao de nhat.
#
# `pipefail` da bat o dau tep, nen `pg_dump` chet se lam ca ong chet — mot ban dump cut duoi khong
# the di qua day roi bao thanh cong.
for database in "${DATABASES[@]}"; do
  "${COMPOSE[@]}" exec -T postgres \
    pg_dump --username netviet_admin --format=custom --no-owner --dbname "${database}" \
    | restic backup --stdin --stdin-filename "${database}.dump" \
        --tag "stack:${STACK_SLUG}" --tag "kind:db-${database}" --host "${STACK_SLUG}" \
    || fail "dump_that_bai:${database}"
done

# --- SAO LUU TEP: cau hinh + tai san tinh -------------------------------------------------------
# `.runtime` MANG BI MAT (secrets.env). No van vao kho vi kho da duoc ma hoa phia client — do la
# ly do ma hoa phia client la bat bien so 2, khong phai mot tuy chon.
BACKUP_PATHS=("${APP_DIR}/.runtime")
[[ -d "${APP_DIR}/tenant-pack" ]] && BACKUP_PATHS+=("${APP_DIR}/tenant-pack")
[[ -d "${APP_DIR}/catalog-assets" ]] && BACKUP_PATHS+=("${APP_DIR}/catalog-assets")

restic backup "${BACKUP_PATHS[@]}" \
  --tag "stack:${STACK_SLUG}" --tag 'kind:files' --host "${STACK_SLUG}" \
  || fail 'sao_luu_tep_that_bai'

# --- KHO ANH TREN DIA ---------------------------------------------------------------------
# ANH KHACH NAM TRONG MOT DOCKER VOLUME, KHONG PHAI MOT DUONG DAN TREN HOST.
#
# `MEDIA_LOCAL_DIR` (vd `/srv/media`) la duong dan BEN TRONG container api; tren host no khong
# ton tai. Mot phep kiem `[[ -d "${MEDIA_LOCAL_DIR}" ]]` chay tren host vi vay LUON SAI, va hau
# qua la anh khach am tham nam NGOAI moi ban sao luu — mot ho so `MEDIA_STORE=local` se tin rang
# no da duoc sao luu trong khi khong he. Da xay ra that trong lan dien tap dau tien cua #224.
#
# Doc qua chinh container dang mount volume do (cung ky thuat ban GCS dung cho `hatchet-config`)
# nen khong phai doan ten volume theo ten compose project.
backup_local_media() {
  local media_dir
  media_dir="$(sed -n 's/^MEDIA_LOCAL_DIR=//p' .runtime/secrets.env | tail -n 1)"
  [[ -n "${media_dir}" ]] || return 0
  [[ "$(sed -n 's/^MEDIA_STORE=//p' .runtime/secrets.env | tail -n 1)" == 'local' ]] || return 0
  "${COMPOSE[@]}" exec -T api sh -c "test -d '${media_dir}'" >/dev/null 2>&1 || return 0
  "${COMPOSE[@]}" exec -T api tar czf - -C "${media_dir}" . \
    | restic backup --stdin --stdin-filename 'media.tar.gz' \
        --tag "stack:${STACK_SLUG}" --tag 'kind:media' --host "${STACK_SLUG}"
}
backup_local_media || fail 'sao_luu_kho_anh_that_bai'

# --- CHINH SACH LUU TRU -------------------------------------------------------------------------
# `--group-by host,tags` la phan quan trong nhat o day: khong co no, `--keep-daily 7` dem 7 ban
# CHUNG cho moi loai gop lai, nen ba loai (db-zalo, db-flowise, files) chia nhau 7 slot va moi loai
# chi con ~2.3 dem. Do dung la su co da xay ra that voi ban GCS cu, noi hai stack chia doi cua so
# luu tru cua nhau.
restic forget --group-by host,tags \
  --keep-daily "${KEEP_DAILY:-7}" --keep-weekly "${KEEP_WEEKLY:-4}" --keep-monthly "${KEEP_MONTHLY:-3}" \
  --prune >/dev/null || fail 'don_dep_that_bai'

printf 'stack=%s at=%s result=SUCCESS backend=%s\n' "${STACK_SLUG}" "${STAMP}" "${RESTIC_REPOSITORY%%:*}" >"${STATUS_FILE}"
chmod 0600 "${STATUS_FILE}"
logger --priority user.info --tag netviet-backup "NETVIET_BACKUP_OK ${STACK_SLUG} ${STAMP}" 2>/dev/null || true
echo "NETVIET_BACKUP_OK ${STACK_SLUG} ${STAMP}"
