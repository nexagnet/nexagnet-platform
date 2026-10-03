#!/bin/bash
set -euo pipefail
umask 077

PROJECT_ID="${GCP_PROJECT_ID:-netviet-host-968934832433}"
APP_IMAGE_VALUE="${APP_IMAGE:?APP_IMAGE is required}"
FLOWISE_IMAGE_VALUE="${FLOWISE_IMAGE:?FLOWISE_IMAGE is required}"
# SLUG KHACH chon GOI KHACH (bang gia, dai ly, chat ID nhom) — no tra loi "phuc vu ai".
# STACK SLUG quyet dinh HA TANG: thu muc stack, ten compose project (=> ten volume), tien to ten
# secret, alias mang tren edge va hostname — no tra loi "chay o dau". Hai thu nay TRUNG NHAU voi
# dev/production (`ultty`), va TACH RA voi moi truong ky thuat (`ultty-gd1-test`), nen mot tenant
# co the co hai stack ma khong stack nao dam vao volume cua stack kia.
# Quy tac duy nhat nam trong deploy/netviet/stack-identity.mjs; o day chi nhan gia tri da suy ra.
# Mot bien sai cho ra mot stack khac hoan toan, nen chan ky tu la.
TENANT_SLUG="${TENANT_SLUG:?TENANT_SLUG is required}"
DEPLOYMENT_ENVIRONMENT="${DEPLOYMENT_ENVIRONMENT:-legacy}"
# Mac dinh = TENANT_SLUG: moi duong goi cu (deploy.ps1, systemd cu) giu nguyen hanh vi.
STACK_SLUG="${STACK_SLUG:-${TENANT_SLUG}}"
[[ "${TENANT_SLUG}" =~ ^[a-z0-9-]+$ ]] || {
  echo "TENANT_SLUG khong hop le: '${TENANT_SLUG}'." >&2
  exit 64
}
[[ "${STACK_SLUG}" =~ ^[a-z0-9-]+$ ]] || {
  echo "STACK_SLUG khong hop le: '${STACK_SLUG}'." >&2
  exit 64
}
# --- HO SO TRIEN KHAI (DEPLOYMENT PROFILE) ------------------------------------------------------
#
# Truoc ban nay, tep nay TU quyet dinh moi thu bang mot phep so sanh tenant:
#   `[[ "${TENANT_SLUG}" == 'ultty' ]] || exit 64` cho moi truong gd1-test.
# Do la mot cong DUNG (fail-closed) nhung dat SAI CHO: no khien `gd1-test` khong phai mot moi
# truong ma la mot duong cam cung vao pilot cua mot khach — nen mot stack xem truoc thu hai chi co
# hai loi vao, va ca hai deu sai (noi long ho so cua Ultty, hoac roi xuong `preflight: standard`
# von bo han bang chung CI tren dung SHA cua main — xem #180/#186).
#
# Ho so lam dung viec do, chi khac la no CO TEN. Suy ra o RUNNER (`deploy-ci.sh` goi
# `describeRuntimeContract` trong `deployment-profiles.mjs`) roi truyen xuong day, vi VM KHONG cai
# node — node chi co ben trong container (da xac minh 20/08/2026).
#
# MAC DINH = HANH VI CU, VA MAC DINH LA HUONG SIET:
#   · `PROFILE_FLOWISE=on`  -> van doi du 8 secret Flowise nhu truoc;
#   · `PROFILE_TENANTS=ultty` -> mot lan chay gd1-test thieu bien van chi cho phep Ultty di qua.
# Nghia la mot bien BI MAT tren duong truyen khong bao gio noi long duoc cong nao.
DEPLOYMENT_PROFILE="${DEPLOYMENT_PROFILE:-}"
PROFILE_TENANTS="${PROFILE_TENANTS:-ultty}"
PROFILE_FLOWISE="${PROFILE_FLOWISE:-on}"
PROFILE_PARSER="${PROFILE_PARSER:-deepseek}"
PROFILE_CHANNEL="${PROFILE_CHANNEL:-zca}"
# `off` la mac dinh DUY NHAT trong khoi nay khong theo huong "doi nhieu hon", va co ly do:
# bi mat nay chi ton tai cho mot GOI MAU. Doi no o mac dinh se lam do lan deploy cua MOI khach
# that de bao ve be mat lai xe cua ban xem truoc. Chieu siet duoc mua o cho khac — mot bai test
# cau truc bat moi khoa cua `describeRuntimeContract` phai co mat du ba chang cua duong truyen.
PROFILE_TRANSPORT_DEMO="${PROFILE_TRANSPORT_DEMO:-off}"
[[ "${PROFILE_TRANSPORT_DEMO}" =~ ^(on|off)$ ]] || {
  echo "PROFILE_TRANSPORT_DEMO phai la on hoac off (dang la '${PROFILE_TRANSPORT_DEMO}')." >&2
  exit 64
}
[[ "${PROFILE_FLOWISE}" =~ ^(on|off)$ ]] || {
  echo "PROFILE_FLOWISE phai la on hoac off (dang la '${PROFILE_FLOWISE}')." >&2
  exit 64
}
[[ "${PROFILE_PARSER}" =~ ^(deepseek|flowise|claude|none)$ ]] || {
  echo "PROFILE_PARSER khong hop le: '${PROFILE_PARSER}'." >&2
  exit 64
}
[[ "${PROFILE_CHANNEL}" =~ ^(zca|bot|mock|none)$ ]] || {
  echo "PROFILE_CHANNEL khong hop le: '${PROFILE_CHANNEL}'." >&2
  exit 64
}

APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-${STACK_SLUG}}"
RUNTIME_DIR="${RUNTIME_DIR:-${APP_DIR}/.runtime}"
EDGE_DIR="${EDGE_DIR:-/srv/netviet/edge}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# GOI KHACH khong di qua file nay. Image khong mang goi nao va cung khong tra slug -> `tenants/`;
# thay vao do deploy.ps1 upload goi cua dung stack nay va compose mount vao api/web bang TENANT_DIR.
PUBLIC_IP_VALUE="${PUBLIC_IP:?PUBLIC_IP is required}"
PUBLIC_IP_LABEL="${PUBLIC_IP_VALUE//./-}"
HOST_SUFFIX="${PUBLIC_IP_LABEL}.sslip.io"

# HOSTNAME PHAI MANG SLUG, neu khong hai khach cung doi mot ten va khach len sau cuop duong cua
# khach len truoc.
#
# Ngoai le CO CHU DICH cho khach "chinh" (PRIMARY_TENANT): ho giu ten TRAN lam ten chinh thuc.
# Ly do khong phai tham my — `OPERATOR_DOMAIN` di thang vao `PUBLIC_BASE_URL`, va Zalo TU tai anh
# catalog ve tu URL do. Doi ten mien cua khach dang chay se lam chet anh trong moi tin da gui.
# Khach chinh vi the duoc phuc vu o CA HAI ten; khach moi chi co ten mang slug.
DEMO_DOMAIN="demo-${STACK_SLUG}.${HOST_SUFFIX}"
OPERATOR_DOMAIN="operator-${STACK_SLUG}.${HOST_SUFFIX}"
FLOWISE_DOMAIN="flowise-${STACK_SLUG}.${HOST_SUFFIX}"
# DASHBOARD CUA WORKFLOW ENGINE. KHONG co alias "tran" nhu demo/operator/flowise, va do la co y:
# engine la thu MOI, khong co ten mien cu nao dang chay de phai giu tuong thich. Mot ten it hon la
# mot be mat cong khai it hon.
#
# Ten nay chi duoc PHAT THANH ROUTE khi `WORKFLOW_ENGINE=on` (xem cuoi file). Neu phat vo dieu
# kien thi moi khach deu moc them mot hostname cong khai tra 502, va Caddy se di xin chung chi
# ACME cho mot ten khong phuc vu gi — vua ton han muc Let's Encrypt vua lo ra mot be mat that.
WORKFLOW_DOMAIN="workflow-${STACK_SLUG}.${HOST_SUFFIX}"
DEMO_ALIASES=''
OPERATOR_ALIASES=''
FLOWISE_ALIASES=''
# So sanh voi STACK_SLUG chu khong phai TENANT_SLUG: stack thu hai cua CUNG mot khach
# (`ultty-gd1-test`) khong duoc phep cuop ten mien tran cua stack dang chay (`ultty`).
if [[ "${PRIMARY_TENANT:-}" == "${STACK_SLUG}" ]]; then
  DEMO_ALIASES="${DEMO_DOMAIN}"
  OPERATOR_ALIASES="${OPERATOR_DOMAIN}"
  FLOWISE_ALIASES="${FLOWISE_DOMAIN}"
  DEMO_DOMAIN="demo.${HOST_SUFFIX}"
  OPERATOR_DOMAIN="operator.${HOST_SUFFIX}"
  FLOWISE_DOMAIN="flowise.${HOST_SUFFIX}"
fi

mkdir -p "${RUNTIME_DIR}"

# Serialize runtime env writes with explicit mode changes and compose rollout. This lock is released
# before deploy-stack.sh obtains it again; no nested lock/deadlock.
exec 9>"${RUNTIME_DIR}/compose.lock"
if ! flock -w 300 9; then
  echo "Khong lay duoc khoa runtime sau 300s." >&2
  exit 1
fi

# `tr -d '\r'` KHONG phai lam dep. Secret duoc tao tu may Windows co the mang mot ky tu CR o cuoi;
# `$(...)` cat duoc dau xuong dong nhung KHONG cat CR. Truoc day khong ai thay vi API key di qua
# `caddy.env` va docker compose tu bo CR khi doc env file. Tu khi key duoc dat thang vao cau hinh
# Caddy thi CR do vao gia tri header va Caddy tra 502 "invalid header field value for X-Api-Key"
# (su co 15/08/2026). Loc tai NGUON de moi secret deu sach, khong rieng API key.
# NGUON BI MAT LA MOT DIEM CAM, KHONG PHAI MOT DONG LENH CO DINH.
#
# Hai dong `gcloud secrets versions access` truoc day o day la TOAN BO cho GCP con lai trong
# duong render — `deploy-stack.sh` (735 dong, ca lan rollout) khong nhac toi GCP mot lan nao. Nen
# de mot Ubuntu cua khach dung duoc stack nay, thu duy nhat phai doi la CHO NAY.
#
# MAC DINH GIU NGUYEN HANH VI HOM NAY. Thu vien portable mac dinh `file` (mot tang trung tinh
# khong duoc coi mot nha cung cap la mac dinh), nhung tep NAY nam trong `deploy/netviet/` — thu
# muc cua ban trien khai GCP dang chay — nen no tu ghim `gcp-secret-manager`. Khong stack nao
# dang chay doi hanh vi mot ky tu. Host khach dat `SECRET_BACKEND=file`.
export SECRET_BACKEND="${SECRET_BACKEND:-gcp-secret-manager}"
NETVIET_SECRET_SOURCE=''
for candidate in "${SCRIPT_DIR}/secret-source.sh" "${SCRIPT_DIR}/../portable/secret-source.sh"; do
  [[ -r "${candidate}" ]] && NETVIET_SECRET_SOURCE="${candidate}" && break
done
if [[ -n "${NETVIET_SECRET_SOURCE}" ]]; then
  # `NETVIET_PROVIDER_DIR` phai suy tu NOI TIM THAY thu vien, khong tu thu muc lam viec: tren VM
  # cac tep nay nam phang trong `/srv/netviet/apps/zalo-<slug>/`, khong giu cay thu muc cua repo.
  NETVIET_SECRET_LIB_DIR="$(cd "$(dirname "${NETVIET_SECRET_SOURCE}")" && pwd)"
  for provider_dir in "${NETVIET_SECRET_LIB_DIR}/providers" "${NETVIET_SECRET_LIB_DIR}/../providers"; do
    [[ -d "${provider_dir}" ]] && export NETVIET_PROVIDER_DIR="$(cd "${provider_dir}" && pwd)" && break
  done
  # shellcheck source=../portable/secret-source.sh
  . "${NETVIET_SECRET_SOURCE}"
else
  # DUONG LUI CO CHU Y: mot ban rsync cu chua mang `secret-source.sh` len VM van phai deploy
  # duoc. Xoa nhanh nay khi moi stack da nhan ban moi.
  secret() {
    gcloud secrets versions access latest --project "${PROJECT_ID}" --secret "$1" | tr -d '\r'
  }
  optional_secret() {
    gcloud secrets versions access latest --project "${PROJECT_ID}" --secret "$1" 2>/dev/null | tr -d '\r' || true
  }
fi

POSTGRES_ADMIN_PASSWORD="$(secret zalo-${STACK_SLUG}-postgres-admin-password)"
ZALO_DB_PASSWORD="$(secret zalo-${STACK_SLUG}-zalo-db-password)"
# HOP DONG BI MAT SUY RA TU HE THONG CON DUOC BAT, khong phai tu mot danh sach co dinh.
#
# Truoc ban nay ca 13 loi goi `secret` deu VO DIEU KIEN, nen mot ho so khong chay Flowise va khong
# chay LLM van bi doi du 13 ten — tuc muon co mot ban xem truoc thi phai tao ra 9 bi mat cho cac he
# thong con KHONG chay. Do la "bia ra mot credential de thoa man ha tang cu" ma #192 §4 cam.
#
# `secret` (khong phai `optional_secret`) van duoc dung o nhanh BAT: mot he thong con da duoc bat
# ma thieu khoa phai chet ngay tai day, khong duoc lui ve che do hong.
FLOWISE_DB_PASSWORD=''
if [[ "${PROFILE_FLOWISE}" == 'on' ]]; then
  FLOWISE_DB_PASSWORD="$(secret zalo-${STACK_SLUG}-flowise-db-password)"
fi
DEEPSEEK_API_KEY=''
if [[ "${PROFILE_PARSER}" == 'deepseek' ]]; then
  DEEPSEEK_API_KEY="$(secret zalo-${STACK_SLUG}-deepseek-api-key)"
fi
# AGENT TU VAN. `optional_secret` chu khong `secret`: khong co khoa thi agent lui ve
# `NoopAdvisorAgent` va he thong giu nguyen duong tat dinh — thieu mot cau tra loi muot hon khong
# duoc phep lam chet ca stack.
ANTHROPIC_API_KEY="$(optional_secret zalo-${STACK_SLUG}-anthropic-api-key)"
# Cong tac RIENG, khong bam theo PARSER_MODE: parser va nguoi soan cau chu la HAI quyet dinh xu ly
# du lieu. Co khoa -> bat; khong co -> 'off' (Noop). Claude nam trong danh sach ben thu ba da duoc
# duyet, nen bat cong tac nay KHONG mo them mot ben nhan du lieu chua duyet nao.
if [[ -n "${ADVICE_COMPOSER:-}" ]]; then
  : # Operator da chon tuong minh — ton trong, khong doan lai.
elif [[ -n "${ANTHROPIC_API_KEY}" ]]; then
  ADVICE_COMPOSER='claude'
else
  ADVICE_COMPOSER='off'
fi
# Token Bot van duoc render san de co the kiem tra danh tinh.
# Pilot GĐ1 chay ZCA mac dinh; `.runtime/channel-mode.env` khong bi rsync ghi de nen deploy lai
# giu override co y cua operator va khong am tham roi ve mock.
ZALO_BOT_TOKEN="$(optional_secret zalo-${STACK_SLUG}-zalo-bot-token)"
CHANNEL_MODE="$("${SCRIPT_DIR}/channel-mode.sh" read "${RUNTIME_DIR}/channel-mode.env")"
echo "render-secrets: CHANNEL_MODE=${CHANNEL_MODE} (zca mac dinh cho pilot GĐ1)." >&2
# --- WORKFLOW ENGINE (Hatchet) -----------------------------------------------------------------
# CONG TAC VAN HANH, MAC DINH TAT — quyet dinh Q1-A.
#
# `deploy-remote.sh:108` rsync CUNG MOT `tenant-pack` cho `zalo-ultty` (production) lan
# `zalo-ultty-gd1-test`. Nen goi khach mot minh no KHONG tach duoc hai moi truong: khai
# `integrations.workflowEngine` de bat cho gd1-test se dong thoi vu trang dispatcher tren
# production o lan deploy ke tiep. Bien nay lam viec do — cung khuon `AUTO_SEND` (CLAUDE.md QD#4:
# kill switch van hanh KHONG phai noi chua policy tenant).
#
# Mac dinh `off` la ca diem: mot cong tac mac dinh `on` khong bao ve duoc gi.
WORKFLOW_ENGINE="${WORKFLOW_ENGINE:-off}"
WORKFLOW_ENGINE_NAMESPACE="${WORKFLOW_ENGINE_NAMESPACE:-}"
# TEN SECRET MANG STACK SLUG — do la cach ly o TANG BI MAT, dung mot lop voi ten volume va alias
# mang. `zalo-ultty-hatchet-db-password` va `zalo-ultty-gd1-test-hatchet-db-password` la hai thu
# khac nhau, nen hai stack khong the vo tinh dung chung mot Postgres cua engine.
HATCHET_DB_PASSWORD="$(optional_secret zalo-${STACK_SLUG}-hatchet-db-password)"
# VONG GA-TRUNG CUA TOKEN: token chi ton tai SAU khi engine da migrate + quickstart, nen o lan
# deploy DAU TIEN no khong the co san trong Secret Manager. `optional_secret` de lan dau khong
# chet; `bootstrap-workflow-engine.sh` duc token roi day len, va lan render sau moi co gia tri.
WORKFLOW_ENGINE_TOKEN="$(optional_secret zalo-${STACK_SLUG}-workflow-engine-token)"
# Bam bcrypt cho CONG THU HAI truoc dashboard (`caddy hash-password`). Hatchet co dang nhap rieng,
# nhung dashboard co nut Replay — no CHAY LAI TAC DUNG PHU, va Hatchet khong biet gi ve ba muc an
# toan o `operation-key.ts`. Mot lop nua truoc mot nut nhu the la dang gia.
WORKFLOW_DASHBOARD_HTPASSWD="$(optional_secret zalo-${STACK_SLUG}-workflow-dashboard-htpasswd)"

if [[ "${WORKFLOW_ENGINE}" == 'on' ]]; then
  # CHI `gd1-test` DUOC PHEP BAT. Day la cai chan cuoi cung, va no o day vi cong tac mot minh no
  # chua du: cong tac bao ve khoi "bat nham vi goi khach khai binding", nhung khong bao ve khoi
  # "go nham ten moi truong khi deploy". `tenants/ultty/tenant.json` dung CHUNG cho ca hai stack,
  # nen mot lan `WORKFLOW_ENGINE=on ./render-secrets.sh` chay nham vao `production` se vu trang
  # dispatcher tren stack that cua khach — noi khong co engine nao de goi.
  #
  # Chan o TANG RENDER chu khong phai tang code: den luc code chay thi bien da nam trong
  # secrets.env roi, va container khong biet no dang phuc vu moi truong nao ngoai mot cai nhan.
  if [[ "${DEPLOYMENT_ENVIRONMENT}" != 'gd1-test' ]]; then
    echo "WORKFLOW_ENGINE=on chi duoc phep cho DEPLOYMENT_ENVIRONMENT=gd1-test" >&2
    echo "(dang la '${DEPLOYMENT_ENVIRONMENT}', stack ${STACK_SLUG})." >&2
    exit 64
  fi
  # FAIL-CLOSED. "Bat engine nhung khong co mat khau DB" va "bat dashboard nhung khong co cong
  # xac thuc" deu la cau hinh sai co hau qua bao mat — dung han o day, khong deploy roi vam.
  [[ -n "${HATCHET_DB_PASSWORD}" ]] || {
    echo "WORKFLOW_ENGINE=on nhung thieu secret zalo-${STACK_SLUG}-hatchet-db-password." >&2
    exit 78
  }
  [[ -n "${WORKFLOW_DASHBOARD_HTPASSWD}" ]] || {
    echo "WORKFLOW_ENGINE=on nhung thieu secret zalo-${STACK_SLUG}-workflow-dashboard-htpasswd." >&2
    echo "Sinh bang: docker run --rm caddy:2-alpine caddy hash-password --plaintext '<mat khau>'" >&2
    exit 78
  }
  echo "render-secrets: WORKFLOW_ENGINE=on cho stack ${STACK_SLUG}." >&2
fi

# --- CUM QUAN SAT (OTel -> ClickHouse) ---------------------------------------------------------
#
# Cung khuon cong tac voi `WORKFLOW_ENGINE`, va vi cung mot ly do: `deploy-remote.sh` rsync CUNG
# MOT `tenant-pack` cho `zalo-ultty` (production) lan `zalo-ultty-gd1-test`, nen goi khach mot
# minh no khong tach duoc hai moi truong.
#
# Mac dinh `off` la ca diem — mot cong tac mac dinh `on` khong bao ve duoc gi. Va o day cai gia
# cua "bat nham" khong phai vai container thua: telemetry mang noi dung nghiep vu, nen bat kho
# quan sat tren mot stack chay du lieu khach that ma chua co thoa thuan la mot van de tuan thu.
OBSERVABILITY_STACK="${OBSERVABILITY_STACK:-off}"
# TEN SECRET MANG STACK SLUG — cach ly o TANG BI MAT, cung mot lop voi ten volume va alias mang.
OTLP_INGEST_TOKEN="$(optional_secret zalo-${STACK_SLUG}-otlp-ingest-token)"
CLICKHOUSE_WRITER_PASSWORD="$(optional_secret zalo-${STACK_SLUG}-clickhouse-writer-password)"
CLICKHOUSE_READER_PASSWORD="$(optional_secret zalo-${STACK_SLUG}-clickhouse-reader-password)"
# ClickHouse khong nhan dau `-` trong ten database/user.
CLICKHOUSE_DB_SLUG="${STACK_SLUG//-/_}"
CLICKHOUSE_WRITER_USER="${CLICKHOUSE_DB_SLUG}_writer"
CLICKHOUSE_READER_USER="${CLICKHOUSE_DB_SLUG}_reader"
CLICKHOUSE_DATABASE="obs_${CLICKHOUSE_DB_SLUG}"
OTEL_TRACING='off'
OTEL_EXPORTER_OTLP_HEADERS=''

if [[ "${OBSERVABILITY_STACK}" == 'on' ]]; then
  # CHI `gd1-test` DUOC PHEP BAT — cung cai chan cuoi cung ma `WORKFLOW_ENGINE` co, va o day no
  # con quan trong hon: mot lan chay nham vao `production` se bat mot duong GHI NOI DUNG NGHIEP VU
  # cua khach that vao mot kho moi, truoc khi ai kip hoi ve retention hay ve thoa thuan xu ly.
  if [[ "${DEPLOYMENT_ENVIRONMENT}" != 'gd1-test' ]]; then
    echo "OBSERVABILITY_STACK=on chi duoc phep cho DEPLOYMENT_ENVIRONMENT=gd1-test" >&2
    echo "(dang la '${DEPLOYMENT_ENVIRONMENT}', stack ${STACK_SLUG})." >&2
    exit 64
  fi
  # FAIL-CLOSED, ba lan. "Bat quan sat nhung thieu khoa" khong duoc bien thanh "collector nhan
  # moi thu" hay "ClickHouse mo cua" — do la dung che do hong ma §8.1 dieu 2 cam.
  for pair in \
    "OTLP_INGEST_TOKEN:otlp-ingest-token" \
    "CLICKHOUSE_WRITER_PASSWORD:clickhouse-writer-password" \
    "CLICKHOUSE_READER_PASSWORD:clickhouse-reader-password"; do
    var="${pair%%:*}"
    name="${pair#*:}"
    if [[ -z "${!var}" ]]; then
      echo "OBSERVABILITY_STACK=on nhung thieu secret zalo-${STACK_SLUG}-${name}." >&2
      echo "Sinh bang: openssl rand -hex 32" >&2
      exit 78
    fi
  done
  OTEL_TRACING='on'
  # KHOA INGESTION di trong header. `bearertokenauthextension` so sanh nguyen van chuoi sau
  # `Bearer `, nen dinh dang nay la mot phan cua hop dong voi collector.
  OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer ${OTLP_INGEST_TOKEN}"
  echo "render-secrets: OBSERVABILITY_STACK=on cho stack ${STACK_SLUG}." >&2
fi

AUTO_SEND="${AUTO_SEND:-on}"
PARSER_MODE="${PARSER_MODE:-deepseek}"
DATA_CLASSIFICATION="${DATA_CLASSIFICATION:-test}"
if [[ "${DEPLOYMENT_ENVIRONMENT}" == 'gd1-test' ]]; then
  # CONG NAY GIU NGUYEN SUC, CHI DOI CHO NEO.
  #
  # Truoc: `[[ "${TENANT_SLUG}" == 'ultty' ]] || exit 64` — dung ve an toan, sai ve pham vi. No
  # bien `gd1-test` thanh duong cam cung vao pilot cua MOT khach, nen khach thu hai chi con hai
  # loi vao va ca hai deu pha mot cong (xem khoi chu thich HO SO TRIEN KHAI o dau tep).
  #
  # Sau: tenant phai nam trong DANH SACH CUA HO SO, va cac gia tri runtime duoc ghim TU HO SO.
  # Ultty di qua dung nhu truoc (`PROFILE_TENANTS='ultty'`, ghim zca/deepseek/off/test), va mot
  # ho so khong duoc dang ky cho tenant nay van bi chan tai day — them mot lop nua sau
  # `validateProfileForEntry` o tang resolver va sau phep kiem cua `deploy-ci.sh`.
  [[ -n "${DEPLOYMENT_PROFILE}" ]] || {
    echo 'Moi truong gd1-test bat buoc co DEPLOYMENT_PROFILE; khong co ho so thi khong render.' >&2
    exit 64
  }
  profile_allows_tenant=0
  for allowed_tenant in ${PROFILE_TENANTS}; do
    [[ "${allowed_tenant}" == "${TENANT_SLUG}" ]] && profile_allows_tenant=1
  done
  [[ "${profile_allows_tenant}" -eq 1 ]] || {
    echo "Ho so '${DEPLOYMENT_PROFILE}' khong duoc dang ky cho tenant '${TENANT_SLUG}'." >&2
    echo "(ho so nay phuc vu: ${PROFILE_TENANTS})" >&2
    exit 64
  }
  # HO SO PHAI GHIM DU BON GIA TRI. Thieu mot cai = mot gia tri runtime cua moi truong bi khoa
  # cong roi ve mac dinh cua tep nay (`AUTO_SEND=on`!), tuc dung cai bay ma #180 mo ra.
  for pinned in PROFILE_CHANNEL_MODE PROFILE_PARSER_MODE PROFILE_AUTO_SEND PROFILE_DATA_CLASSIFICATION; do
    [[ -n "${!pinned:-}" ]] || {
      echo "Ho so '${DEPLOYMENT_PROFILE}' thieu ${pinned} cho moi truong bi khoa cong." >&2
      exit 64
    }
  done
  # KENH THAT KHONG DUOC AM THAM DOI. Voi ho so chay ZCA, override cua operator trong
  # `.runtime/channel-mode.env` phai KHOP ho so — day dung la phep kiem cu cua Ultty
  # (`CHANNEL_MODE == 'zca'` hoac exit 1), chi khac la gia tri doi chieu den tu ho so.
  #
  # Voi ho so KHONG chay kenh nao (`channel=none` -> ghim `mock`), khong co gi de bao ve: `mock`
  # la kenh ngoai tuyen tat dinh, khong tai khoan, khong phien, khong rui ro ToS. Nen ghim thang.
  if [[ "${PROFILE_CHANNEL}" != 'none' ]]; then
    [[ "${CHANNEL_MODE}" == "${PROFILE_CHANNEL_MODE}" ]] || {
      echo "Ho so '${DEPLOYMENT_PROFILE}' bat buoc CHANNEL_MODE=${PROFILE_CHANNEL_MODE}; khong fallback sang channel khac." >&2
      exit 1
    }
  fi
  CHANNEL_MODE="${PROFILE_CHANNEL_MODE}"
  PARSER_MODE="${PROFILE_PARSER_MODE}"
  AUTO_SEND="${PROFILE_AUTO_SEND}"
  DATA_CLASSIFICATION="${PROFILE_DATA_CLASSIFICATION}"
  # AGENT TU VAN — quyet dinh XU LY DU LIEU RIENG, khong bam theo parser.
  #
  # Ultty gd1-test ghim `deepseek` (cung nha cung cap voi parser). Ly do khong phai Claude: ngay
  # 21/08/2026 khoa Anthropic tra `credit balance is too low` — agent lui ve duong tat dinh, tuc
  # tinh nang khong chung minh duoc gi. Nhanh do chi mo cho gd1-test, noi
  # `DATA_CLASSIFICATION=test` va chi co nhom/du lieu TEST; dung pham vi CLAUDE.md cho phep dung
  # DeepSeek. Stack chay du lieu khach that PHAI dung `ADVICE_COMPOSER=claude`.
  #
  # Ho so xem truoc ghim `off`: khong nha cung cap LLM nao duoc goi, nen khong ben thu ba nao nhan
  # mot byte du lieu nao.
  ADVICE_COMPOSER="${PROFILE_ADVICE_COMPOSER:-off}"
  # GHI LAI OVERRIDE TREN DIA cho khop `secrets.env`.
  #
  # `.runtime/channel-mode.env` khong bi rsync ghi de, va `deploy-stack.sh` doc CHINH no (khong
  # doc `secrets.env`) de biet dang chay kenh nao. Voi ho so ghim `mock`, mot tep vang mat se
  # duoc `channel-mode.sh read` doc thanh `zca` — hai nguon noi hai chuyen khac nhau ve cung mot
  # stack. Ho so la cai ghim, nen ghi no ra la lam cho dia noi dung su that, khong phai them mot
  # quyet dinh moi: voi Ultty gia tri nay da bat buoc bang `zca` o ngay tren.
  "${SCRIPT_DIR}/channel-mode.sh" write "${RUNTIME_DIR}/channel-mode.env" "${CHANNEL_MODE}"
fi
API_KEY=$(secret zalo-${STACK_SLUG}-api-key)
# VM da duoc cap quyen doc API key. Dan xuat domain-separated session signing key thay vi doi IAM
# de them mot secret moi; gia tri goc khong nam trong command args va khong duoc ghi log.
SESSION_SECRET="$(printf 'netviet-api-session-v1:%s' "${API_KEY}" | sha256sum | cut -d' ' -f1)"
PILOT_OPERATOR_PASSWORD="$(secret zalo-${STACK_SLUG}-operator-password)"
# MAT KHAU NHAN VAT MAU — chi cho goi mau, va `secret()` chu khong `optional_secret()`.
#
# Ban xem truoc HUA co mot be mat lai xe. T8 da giao dung mot thang du lieu that ma khong mot tai
# khoan lai xe nao — deploy xanh, 44 chuyen co that trong Postgres, va khong ai dang nhap duoc vao
# cai man hinh duy nhat mot lai xe se cham toi. `optional_secret` o day se dung lai chinh cai bay
# do: mot binding IAM hong hoac mot lan xoa nham se lam ban demo "thanh cong" voi mot be mat rong.
TRANSPORT_DEMO_DRIVER_PASSWORD=''
if [[ "${PROFILE_TRANSPORT_DEMO}" == 'on' ]]; then
  TRANSPORT_DEMO_DRIVER_PASSWORD="$(secret zalo-${STACK_SLUG}-transport-demo-driver-password)"
fi
FLOWISE_SECRETKEY=''
FLOWISE_ADMIN_EMAIL=''
FLOWISE_ADMIN_PASSWORD=''
FLOWISE_JWT_SECRET=''
FLOWISE_REFRESH_SECRET=''
FLOWISE_SESSION_SECRET=''
FLOWISE_TOKEN_HASH_SECRET=''
if [[ "${PROFILE_FLOWISE}" == 'on' ]]; then
  FLOWISE_SECRETKEY="$(secret zalo-${STACK_SLUG}-flowise-secretkey)"
  FLOWISE_ADMIN_EMAIL="$(secret zalo-${STACK_SLUG}-flowise-admin-email)"
  FLOWISE_ADMIN_PASSWORD="$(secret zalo-${STACK_SLUG}-flowise-admin-password)"
  FLOWISE_JWT_SECRET="$(secret zalo-${STACK_SLUG}-flowise-jwt-secret)"
  FLOWISE_REFRESH_SECRET="$(secret zalo-${STACK_SLUG}-flowise-refresh-secret)"
  FLOWISE_SESSION_SECRET="$(secret zalo-${STACK_SLUG}-flowise-session-secret)"
  FLOWISE_TOKEN_HASH_SECRET="$(secret zalo-${STACK_SLUG}-flowise-token-hash-secret)"
fi
# PRE-PILOT PUBLIC — SESSION AUTH:
# Caddy khong can Basic Auth; NestJS dung login session/role/CSRF va PostgreSQL session store.
# URL pilot public phai dung session server-side. API key van render san cho automation tuong lai,
# nhung khong dua vao browser. User bootstrap chi tao lan dau, deploy sau khong reset password.
AUTH_MODE='session'

# --- Kho anh (MEDIA_STORE) ---------------------------------------------------------------------
# Link anh Zalo chet trong <=35 ngay => khong tai ve la mat vinh vien. Nhung bat kho anh cung la
# bat mot duong ghi PII ra object storage, nen phai la lua chon CO Y — khong biet bucket thi
# `none`, khong doan.
#
# XAC THUC BANG ADC, KHONG DUNG KHOA (chot 13/08/2026): container ke thua tai khoan dich vu gan san
# cua VM, nen khong co khoa tinh nao phai phat, xoay vong hay lo. Duong S3 (`MEDIA_STORE=s3` + khoa
# HMAC) van con nguyen cho OVHcloud, chi khong dung tren GCP nua — to chuc bat
# `constraints/iam.disableServiceAccountKeyCreation` nen GCS khong the ky request S3 duoc.
#
# `MEDIA_BUCKET` MAC DINH tro vao dung bucket sao luu dang mang rule lifecycle prefix `media/`
# (60 ngay -> Nearline, 365 ngay -> Coldline, KHONG co rule Delete) — xem gcs-lifecycle.json va
# deploy.ps1 (`$BackupBucket`). Tro nham bucket thi rule giu anh khong co tac dung MA CUNG KHONG
# bao loi, nen mac dinh o day duoc chot theo bucket that thay vi de nguoi deploy tu go.
# KHO ANH KHONG CON MAC DINH LA GCS — #224 Phase F.
#
# Truoc ban nay hai dong o day quyet dinh ca kien truc luu tru: `BACKUP_BUCKET` la BAT BUOC (mot
# URL `gs://`), va he qua la `MEDIA_STORE` chi co the la `gcs` hoac `none`. Tren mot may chu cua
# KHACH khong co bucket GCS nao, nen buoc render CHET NGAY o dong nay voi
# `BACKUP_BUCKET: unbound variable` — do la cho duong portable dut, va no dut TRUOC khi ai kip
# hoi "co nen dung GCS khong".
#
# `packages/shared/src/env.ts` da nhan du bon kho tu lau (`none|local|gcs|s3`) va `MediaStore` da
# co ca bon hien thuc. Cai thieu chua bao gio la code ung dung — la mot duong tu day len den do.
#
# THU TU QUYET DINH, va no giu nguyen hanh vi cua moi stack dang chay:
#   1. Operator noi ro `MEDIA_STORE`  -> ton trong, khong doan lai.
#   2. Biet mot bucket GCS            -> `gcs`. Day la duong cua moi stack hom nay.
#   3. Co thu muc anh cuc bo          -> `local`. Duong ho so gia thap tren may khach.
#   4. Khong biet gi                  -> `none`, va NOI RA rang anh se khong duoc luu.
BACKUP_BUCKET="${BACKUP_BUCKET:-}"
MEDIA_BUCKET="${MEDIA_BUCKET:-${BACKUP_BUCKET#gs://}}"
MEDIA_ENDPOINT="${MEDIA_ENDPOINT:-}"
MEDIA_REGION="${MEDIA_REGION:-auto}"
MEDIA_LOCAL_DIR="${MEDIA_LOCAL_DIR:-}"
MEDIA_ACCESS_KEY_ID=""
MEDIA_SECRET_ACCESS_KEY=""
if [[ -n "${MEDIA_STORE:-}" ]]; then
  : # Operator da chon tuong minh.
elif [[ -n "${MEDIA_BUCKET}" ]]; then
  MEDIA_STORE='gcs'
elif [[ -n "${MEDIA_LOCAL_DIR}" ]]; then
  MEDIA_STORE='local'
else
  MEDIA_STORE='none'
  echo "render-secrets: MEDIA_STORE=none (khong biet kho anh) — anh Zalo se KHONG duoc luu." >&2
fi
# Kho S3 doi bon thu, va `loadEnv()` fail-fast neu thieu bat ky thu nao. Doc khoa qua nguon bi
# mat (khong phai bien moi truong cua nguoi goi) de chung khong nam trong bang tien trinh.
if [[ "${MEDIA_STORE}" == 's3' ]]; then
  MEDIA_ACCESS_KEY_ID="$(secret zalo-${STACK_SLUG}-media-access-key-id)"
  MEDIA_SECRET_ACCESS_KEY="$(secret zalo-${STACK_SLUG}-media-secret-access-key)"
  [[ -n "${MEDIA_ENDPOINT}" ]] || { echo "MEDIA_STORE=s3 nhung thieu MEDIA_ENDPOINT." >&2; exit 64; }
  [[ -n "${MEDIA_BUCKET}" ]] || { echo "MEDIA_STORE=s3 nhung thieu MEDIA_BUCKET." >&2; exit 64; }
fi
if [[ "${MEDIA_STORE}" == 'local' && -z "${MEDIA_LOCAL_DIR}" ]]; then
  MEDIA_LOCAL_DIR=/srv/media
fi

cat >"${RUNTIME_DIR}/secrets.env" <<EOF
APP_IMAGE=${APP_IMAGE_VALUE}
FLOWISE_IMAGE=${FLOWISE_IMAGE_VALUE}
TENANT_SLUG=${TENANT_SLUG}
# compose.yaml dung bien nay cho \`name:\` (=> ten volume) va cho alias mang tren edge.
STACK_SLUG=${STACK_SLUG}
DEPLOYMENT_ENVIRONMENT=${DEPLOYMENT_ENVIRONMENT}
# QUAN SAT (21/08/2026). \`json\` bat NDJSON co dinh kem traceId/tenant/release cho MOI dong log,
# de \`docker logs ... | node tools/trace-view.mjs\` dung lai duoc cay nghiep vu.
LOG_FORMAT=${LOG_FORMAT:-json}
LOG_LEVEL=${LOG_LEVEL:-log}
# Muc chi tiet noi dung trong telemetry. De TRONG = suy tu DATA_CLASSIFICATION
# (test -> full, customer -> redacted). Bi mat bi xoa o MOI muc, khong ngoai le.
TELEMETRY_PRIVACY=${TELEMETRY_PRIVACY:-}
# NEO RELEASE cho trace — tra loi "bug nay xay ra tren commit nao" ma khong phai SSH doc file.
#
# Dung BIEN chu khong mount \`.runtime/release.json\`: file do duoc \`deploy-remote.sh\` ghi SAU
# \`deploy-stack.sh\`, tuc SAU \`docker compose up\`. Mount mot file chua ton tai thi Docker tao ra
# mot THU MUC trung ten — hong ca mount lan lan ghi release.json ke tiep.
RELEASE_GIT_SHA=${RELEASE_GIT_SHA:-}
RELEASE_APP_DIGEST=${APP_IMAGE_VALUE}
RELEASE_DEPLOYED_AT=${RELEASE_DEPLOYED_AT:-}
# 18/08/2026 — doi flowise -> deepseek. Ly do: Flowise la MOT TANG TRUNG GIAN nua dat tren cung
# DeepSeek o dau kia, nen no khong them chat luong ma chi them mot cho co the hong va mot cho
# kho lan vet. Goi thang deepseek-v4-flash bo tang do: cung mo hinh, it thanh phan hon, va
# parser lay lai duoc prompt chung do REPO quan ly (7 intent + few-shot + glossary + cua so hoi
# thoai Pha 1) thay vi mot ban sao nam trong Agentflow khong ai review.
# Dat qua bien de doi nguoc chi bang mot dong: PARSER_MODE=flowise ./render-secrets.sh ...
PARSER_MODE=${PARSER_MODE}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
ADVICE_COMPOSER=${ADVICE_COMPOSER}
DEEPSEEK_MODEL=${DEEPSEEK_MODEL:-deepseek-v4-flash}
CHANNEL_MODE=${CHANNEL_MODE}
AUTO_SEND=${AUTO_SEND}
DATA_CLASSIFICATION=${DATA_CLASSIFICATION}
GCP_PROJECT_ID=${PROJECT_ID}
DEMO_DOMAIN=${DEMO_DOMAIN}
OPERATOR_DOMAIN=${OPERATOR_DOMAIN}
FLOWISE_DOMAIN=${FLOWISE_DOMAIN}
# WORKFLOW ENGINE. Ca nam bien deu di DU BA TANG (render -> block \`environment:\` cua dung service
# -> secrets-passthrough.contract.test.mjs). Bo mot tang = tinh nang im lang khong chay; da xay ra
# that voi \`ADVICE_COMPOSER\` va voi \`DEPLOYMENT_ENVIRONMENT\`.
#
# \`WORKFLOW_DASHBOARD_HTPASSWD\` CO Y khong nam o day: no la cau hinh cua EDGE, di thang vao manh
# Caddy ben duoi. Dua mot bam mat khau vao secrets.env la phat no cho MOI container cua stack.
WORKFLOW_ENGINE=${WORKFLOW_ENGINE}
WORKFLOW_ENGINE_NAMESPACE=${WORKFLOW_ENGINE_NAMESPACE}
WORKFLOW_ENGINE_TOKEN=${WORKFLOW_ENGINE_TOKEN}
HATCHET_DB_PASSWORD=${HATCHET_DB_PASSWORD}
WORKFLOW_DOMAIN=${WORKFLOW_DOMAIN}
POSTGRES_ADMIN_PASSWORD=${POSTGRES_ADMIN_PASSWORD}
ZALO_DB_PASSWORD=${ZALO_DB_PASSWORD}
FLOWISE_DB_PASSWORD=${FLOWISE_DB_PASSWORD}
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
ZALO_BOT_TOKEN=${ZALO_BOT_TOKEN}
API_KEY=${API_KEY}
AUTH_MODE=${AUTH_MODE}
SESSION_SECRET=${SESSION_SECRET}
PILOT_OPERATOR_USERNAME=operator
PILOT_OPERATOR_NAME=Pilot Operator
PILOT_OPERATOR_PASSWORD=${PILOT_OPERATOR_PASSWORD}
TRANSPORT_DEMO_DRIVER_PASSWORD=${TRANSPORT_DEMO_DRIVER_PASSWORD}
MEDIA_STORE=${MEDIA_STORE}
MEDIA_BUCKET=${MEDIA_BUCKET}
# Bon bien cua duong S3 va mot bien cua duong local. Chung PHAI co mat o day VA trong khoi
# environment cua compose.yaml: mot bien chi co o mot trong hai cho thi khong bao gio toi
# container (cai bay da lam ADVICE_COMPOSER rong suot 19/08-21/08/2026).
# KHONG DUNG DAU HUYEN NGUOC O DAY: khoi nay nam trong mot heredoc KHONG duoc quote, nen
# dau huyen nguoc trong mot dong CHU THICH van bi chay nhu lenh (da xay ra that o ban nay).
MEDIA_ENDPOINT=${MEDIA_ENDPOINT}
MEDIA_REGION=${MEDIA_REGION}
MEDIA_ACCESS_KEY_ID=${MEDIA_ACCESS_KEY_ID}
MEDIA_SECRET_ACCESS_KEY=${MEDIA_SECRET_ACCESS_KEY}
MEDIA_LOCAL_DIR=${MEDIA_LOCAL_DIR}
# CONG TAC HE THONG CON, doc boi deploy-stack.sh tren VM. No KHONG di vao container nao: mot
# container khong can biet Flowise co ton tai hay khong, con lop rollout thi phai biet — no quyet
# dinh co keo compose.flowise.yaml vao, co doi Flowise healthy, va co doi chieu digest cua no.
#
# KHONG DAT TEN TEP TRONG DAU HUYEN O DAY. Khoi nay la mot heredoc KHONG duoc trich dan, nen dau
# huyen la THAY THE LENH: ban dau tien cua dong tren dat hai ten tep trong dau huyen va bash da co
# CHAY chung ("deploy-stack.sh: command not found"), roi set -e giet ca lan render. Cac dong khac
# trong khoi nay thoat dau huyen; o day bo han cho gon.
FLOWISE_ENABLED=${PROFILE_FLOWISE}
FLOWISE_SECRETKEY=${FLOWISE_SECRETKEY}
FLOWISE_ADMIN_EMAIL=${FLOWISE_ADMIN_EMAIL}
FLOWISE_ADMIN_PASSWORD=${FLOWISE_ADMIN_PASSWORD}
FLOWISE_JWT_SECRET=${FLOWISE_JWT_SECRET}
FLOWISE_REFRESH_SECRET=${FLOWISE_REFRESH_SECRET}
FLOWISE_SESSION_SECRET=${FLOWISE_SESSION_SECRET}
FLOWISE_TOKEN_HASH_SECRET=${FLOWISE_TOKEN_HASH_SECRET}
# QUAN SAT BEN. Ca nam bien deu di DU BA TANG (render -> block \`environment:\` cua dung service ->
# secrets-passthrough.contract.test.mjs), giong nam bien cua workflow engine va vi cung mot ly do.
#
# \`OTEL_EXPORTER_OTLP_HEADERS\` MANG KHOA INGESTION, nen no o day chu khong o compose. Khoa ma
# collector doc thi di duong khac han — mot TEP duoc mount (\`.runtime/otlp-keys/\`), khong phai
# bien moi truong, de no khong lo ra trong \`docker inspect\` cua container collector.
OTEL_TRACING=${OTEL_TRACING}
OTEL_EXPORTER_OTLP_HEADERS=${OTEL_EXPORTER_OTLP_HEADERS}
CLICKHOUSE_WRITER_USER=${CLICKHOUSE_WRITER_USER}
CLICKHOUSE_WRITER_PASSWORD=${CLICKHOUSE_WRITER_PASSWORD}
CLICKHOUSE_DATABASE=${CLICKHOUSE_DATABASE}
# CREDENTIAL DOC — cua \`api\`, cho duong lui ve lich su cua Debug View. KHAC credential ghi o
# tren, va khac CO CHU Y (§8.1 dieu 3): user nay chi co \`GRANT SELECT\` (xem
# \`init-observability.sql\` ngay duoi), nen mot loi o tang doc khong the tro thanh mot phep ghi.
#
# Hai gia tri nay DA duoc tinh o dau tep tu 28/08, nhung chua bao gio di ra khoi script — tuc user
# doc ton tai trong ClickHouse ma khong tien trinh nao biet mat khau cua no. Do dung la hinh dang
# loi ma \`secrets-passthrough.contract.test.mjs\` ton tai de bat, chi khac chieu.
CLICKHOUSE_READER_USER=${CLICKHOUSE_READER_USER}
CLICKHOUSE_READER_PASSWORD=${CLICKHOUSE_READER_PASSWORD}
EOF

# --- Tang edge dung chung ----------------------------------------------------------------------
# Edge phuc vu MOI khach, nen file env cua no chi duoc chua thu KHONG thuoc rieng ai. API key va
# hostname cua tung khach nam trong manh cau hinh rieng ben duoi, khong nam o day.
install -d -m 0750 "${EDGE_DIR}"
install -d -m 0750 "${EDGE_DIR}/.runtime"
install -d -m 0750 "${EDGE_DIR}/tenants"
# `ACME_EMAIL` LA CAU HINH CUA EDGE DUNG CHUNG, KHONG PHAI CUA STACK NAY.
#
# Gia tri von duoc lay tu `flowise-admin-email` — mot bi mat chi ton tai voi ho so co Flowise. Ghi
# de no bang chuoi rong khi trien khai mot ho so KHONG Flowise se lam `email {$ACME_EMAIL}` trong
# Caddyfile con ZERO tham so => Caddyfile khong parse duoc => `caddy reload` that bai => duong lui
# la `--force-recreate gateway`, tuc RUNG het network attachment va lam MOI khach tra 502 cung
# luc (da xay ra that 21/08/2026 voi ca bon stack).
#
# Nen: chi ghi khi co gia tri; da co tep thi GIU NGUYEN cua khach da dung truoc; chua co tep va
# cung khong co gia tri thi DUNG HAN va noi ro viec nguoi can lam — khong doan mot dia chi email.
if [[ -n "${FLOWISE_ADMIN_EMAIL}" ]]; then
  cat >"${EDGE_DIR}/.runtime/caddy.env" <<EOF
ACME_EMAIL=${FLOWISE_ADMIN_EMAIL}
EOF
  chmod 600 "${EDGE_DIR}/.runtime/caddy.env"
elif [[ -f "${EDGE_DIR}/.runtime/caddy.env" ]]; then
  echo "render-secrets: giu nguyen ACME_EMAIL cua edge dung chung (ho so nay khong co Flowise)." >&2
else
  echo "Edge dung chung chua co ACME_EMAIL va ho so '${DEPLOYMENT_PROFILE:-mac-dinh}' khong cung cap duoc." >&2
  echo "Ghi mot dong 'ACME_EMAIL=<dia chi>' vao ${EDGE_DIR}/.runtime/caddy.env roi chay lai." >&2
  exit 78
fi

# MANH CAU HINH CUA RIENG KHACH NAY. Moi khach mot tep: them khach khong phai sua tep cua khach
# khac, va go mot khach chi la xoa mot tep roi nap lai.
#
# Upstream tro vao ALIAS mang mang slug (`api-<slug>`, ...) chu khong phai ten service: tren mang
# edge dung chung, moi khach deu co service ten `api`, nen ten service khong con phan biet duoc.
#
# `\$1` duoc thoat de di NGUYEN VAN vao Caddy (nhom bat cua header_down), khong bi bash nuot.
tenant_site="${EDGE_DIR}/tenants/${STACK_SLUG}.caddy"
cat >"${tenant_site}" <<EOF
# SINH TU DONG boi render-secrets.sh cho stack '${STACK_SLUG}'. Dung sua tay: lan deploy sau ghi de.
${DEMO_DOMAIN}${DEMO_ALIASES:+, ${DEMO_ALIASES}} {
	import secure_headers
	import app_headers
	import app_routes api-${STACK_SLUG} web-${STACK_SLUG} "${API_KEY}"
}

${OPERATOR_DOMAIN}${OPERATOR_ALIASES:+, ${OPERATOR_ALIASES}} {
	import secure_headers
	import app_headers
	import app_routes api-${STACK_SLUG} web-${STACK_SLUG} "${API_KEY}"
}
EOF

# ROUTE FLOWISE — CHI phat khi ho so that su chay Flowise.
#
# Cung ly le voi route cua workflow dashboard ngay duoi: phat mot hostname cong khai tro toi mot
# service khong ton tai thi Caddy van di xin chung chi ACME cho no — ton han muc Let's Encrypt cho
# mot ten tra 502, va lo ra mot be mat khong phuc vu gi.
if [[ "${PROFILE_FLOWISE}" == 'on' ]]; then
  cat >>"${tenant_site}" <<EOF

${FLOWISE_DOMAIN}${FLOWISE_ALIASES:+, ${FLOWISE_ALIASES}} {
	import secure_headers
	reverse_proxy flowise-${STACK_SLUG}:3000 {
		header_down Set-Cookie (.*) "\$1; Secure"
	}
}
EOF
fi

# DASHBOARD CUA WORKFLOW ENGINE — CHI phat route khi cong tac BAT.
#
# Day la duong RA NGOAI DUY NHAT cua ca cum Hatchet: engine va Postgres cua no nam tren mang
# `internal: true` va khong service nao co khoi `ports:`. Do cung la ly do quyet dinh Q2-A dung
# duoc — gRPC noi bo chay khong TLS vi no KHONG DI QUA RANH GIOI HOST NAO, chu khong phai vi
# "day khong phai production". `workflow-isolation.contract.test.mjs` ep dung ranh gioi do.
#
# HAI CONG chu khong mot: `basic_auth` o edge, roi dang nhap cua chinh Hatchet. Ly do khong phai
# "bao mat theo lop" chung chung — dashboard co nut REPLAY chay lai tac dung phu, va Hatchet
# khong biet gi ve ba muc an toan trong `operation-key.ts`. Sale nhan vai VIEWER (runbook §4.4).
#
# `Set-Cookie ... Secure` KHONG duoc them o day (khac route Flowise): Hatchet tu gan co Secure vi
# compose dat `SERVER_AUTH_COOKIE_INSECURE=f`. Them lan hai se sinh ra cookie co hai chu `Secure`.
if [[ "${WORKFLOW_ENGINE}" == 'on' ]]; then
  cat >>"${tenant_site}" <<EOF

${WORKFLOW_DOMAIN} {
	import secure_headers
	basic_auth {
		operator ${WORKFLOW_DASHBOARD_HTPASSWD}
	}
	# :80 la nginx cua image dashboard — no phuc vu giao dien VA proxy \`/api\` sang tien trinh
	# \`hatchet-api\` chay cung container tren :8080 (da kiem bang \`ps\` trong container).
	reverse_proxy hatchet-${STACK_SLUG}:80
}
EOF
fi

# Manh nay mang API key cua khach, nen doi xu nhu secret chu khong nhu cau hinh.
chmod 600 "${tenant_site}"

touch "${RUNTIME_DIR}/flowise.env"
install -d -m 0700 "${RUNTIME_DIR}/zalo"
# `caddy.env` khong con nam o day: no thuoc tang edge dung chung va da duoc chmod ngay sau khi ghi.
# --- Ba tep cua cum quan sat -------------------------------------------------------------------
#
# Dung CA KHI TAT. Ly do: `compose.yaml` mount ba duong dan nay, va Docker gap mot duong dan nguon
# chua ton tai thi tao ra mot THU MUC trung ten — hong ca mount lan lan ghi ke tiep. Dung cai bay
# da lam `RELEASE_MANIFEST_PATH` rong suot tren gd1-test. Tat thi ba tep nay rong/vo hai; cum
# `profiles: ["observability"]` khong duoc dung toi thi khong ai doc chung.
# QUYEN TEP O DAY LA MOT HOP DONG VOI ANH DOCKER, khong phai mot thoi quen.
#
# `otel/opentelemetry-collector-contrib` khai `USER 10001:10001`, va `clickhouse-server` dung
# `DEFAULT_UID=101` (ca hai doc tu config cua chinh anh truoc khi ghim digest). Bind mount GIU
# NGUYEN chu so huu cua HOST, nen mot tep `600` thuoc root la mot tep tien trinh trong container
# KHONG DOC DUOC. Trieu chung o phia nguoi dung khong phai mot loi ro rang — chi la "khong co
# span nao", hoac "user doc khong ton tai".
#
# `.runtime/` da la `0700` cua root tren VM, nen noi long quyen o day khong mo them gi ra ngoai.
OTEL_COLLECTOR_UID=10001
CLICKHOUSE_UID=101

install -d -m 0700 "${RUNTIME_DIR}/otlp-keys"
printf '%s\n' "${OTLP_INGEST_TOKEN}" >"${RUNTIME_DIR}/otlp-keys/${STACK_SLUG}"
chmod 0400 "${RUNTIME_DIR}/otlp-keys/${STACK_SLUG}"
chown "${OTEL_COLLECTOR_UID}:${OTEL_COLLECTOR_UID}" \
  "${RUNTIME_DIR}/otlp-keys/${STACK_SLUG}" "${RUNTIME_DIR}/otlp-keys"

"${SCRIPT_DIR}/observability/render-otel-collector.sh" \
  "${STACK_SLUG}" "${RUNTIME_DIR}/otel-collector.yaml"
# Cau hinh KHONG chua bi mat (mat khau di qua `${env:...}` luc chay), nen `0444` la du va khong
# phai phu thuoc vao chu so huu — collector chi can DOC duoc no.
chmod 0444 "${RUNTIME_DIR}/otel-collector.yaml"

# USER DOC — quyen SELECT, khong hon. Tach khoi user GHI la dieu kien 3 cua §8.1: mot credential
# doc bi lo khong duoc tro thanh mot duong ghi vao telemetry cua khach.
#
# GIOI HAN DA BIET: `docker-entrypoint-initdb.d` chi chay khi thu muc du lieu con RONG. Doi mat
# khau sau do KHONG tu ap dung — phai `ALTER USER` bang tay. Ghi ra day chu khong de nguoi sau
# phat hien bang cach go dang nhap sai ba lan.
cat >"${RUNTIME_DIR}/init-observability.sql" <<EOF
CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_DATABASE};
CREATE USER IF NOT EXISTS ${CLICKHOUSE_READER_USER} IDENTIFIED BY '${CLICKHOUSE_READER_PASSWORD}';
GRANT SELECT ON ${CLICKHOUSE_DATABASE}.* TO ${CLICKHOUSE_READER_USER};
EOF
# Tep NAY co chua mat khau cua user doc, nen `0400` — va phai chuyen so huu, cung ly do voi tep
# khoa OTLP o tren: entrypoint cua ClickHouse chay cac tep initdb duoi uid trong container.
chmod 0400 "${RUNTIME_DIR}/init-observability.sql"
chown "${CLICKHOUSE_UID}:${CLICKHOUSE_UID}" "${RUNTIME_DIR}/init-observability.sql"

chmod 600 "${RUNTIME_DIR}/secrets.env" "${RUNTIME_DIR}/flowise.env"
