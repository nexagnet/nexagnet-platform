# syntax=docker/dockerfile:1.7
#
# IMAGE XEM TRUOC CHO NORTHFLANK = image CHUNG + MOT lop mong. Khong build lai gi ca.
#
#   docker build -f deploy/netviet/Dockerfile -t base .                         # image chung (khong goi khach)
#   docker build -f deploy/northflank/Dockerfile --build-arg BASE_IMAGE=base \
#                --build-arg GIT_SHA=<40 hex> .                                 # lop nay
#
# Vi sao la mot LOP chu khong phai mot Dockerfile thu hai: cac buoc install/prisma/build nam o MOT
# cho (`deploy/netviet/Dockerfile`), nen hai image khong the lech nhau o phan nang. Lop nay chi them
# ba thu, va ba thu do deu rieng cua ban xem truoc:
#
#   1. goi `tenants/transport-preview` — goi TONG HOP, khong co du lieu khach (`.dockerignore` mo dung
#      mot ngoai le nay). Image chung cam goi khach (`image-isolation.contract.mjs`); image NAY mang
#      dung mot goi mau, vi Developer Sandbox khong co volume de mount goi tu ngoai nhu Compose tren VM;
#   2. Caddy — edge cua container `web` (Sandbox chi co 2 service, khong co cho cho gateway rieng);
#   3. `/app/BUILD_REVISION` — SHA cua commit da build, de tien trinh TU doi chieu voi release.json do
#      lan deploy mount (xem `assert-image-identity.mjs`).
#
# `GIT_SHA` la bat buoc va phai la full SHA 40 ky tu: thieu hoac sai thi BUILD DUNG, khong ra mot image
# vo danh. Caddy duoc ghim DIGEST, cung digest voi edge VM (`deploy/netviet/edge/compose.yaml`).
ARG BASE_IMAGE

FROM caddy:2-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648 AS caddy

FROM ${BASE_IMAGE}
COPY --from=caddy /usr/bin/caddy /usr/local/bin/caddy
COPY tenants/transport-preview /app/tenants/transport-preview

ARG GIT_SHA
RUN printf '%s' "${GIT_SHA}" | grep -Eq '^[a-f0-9]{40}$' \
  && printf '%s' "${GIT_SHA}" > /app/BUILD_REVISION \
  && chmod 0444 /app/BUILD_REVISION
LABEL org.opencontainers.image.revision="${GIT_SHA}"
LABEL org.opencontainers.image.title="Nexagnet transport preview (Northflank)"

# Mac dinh la api; Northflank ghi de bang `customCommand` cho tung dich vu (xem preview-contract.mjs).
CMD ["sh", "/app/deploy/northflank/start-api.sh"]
