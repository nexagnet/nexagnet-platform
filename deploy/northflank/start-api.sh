#!/bin/sh
# KHOI DONG API TREN NORTHFLANK. Chay trong container `api`, cwd = /app.
#
# Cung THU TU voi `deploy-stack.sh` tren VM (migrate -> operator -> seed nguon su that -> seed thang
# van hanh mau), vi Sandbox khong co mot buoc `bootstrap` rieng. MOI BUOC LA CONG CUNG (`set -e`):
# mot buoc hong thi container thoat, Northflank bao rollout that bai, va lan deploy do KHONG duoc
# tinh la bang chung. Khong co duong "bo qua loi roi chay tiep".
#
# Danh tinh duoc doi chieu TRUOC moi thu: khong bao gio migrate DB bang mot image ma manifest khong
# nhan la cua no.
set -eu

node deploy/northflank/assert-image-identity.mjs
apps/api/node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma
node deploy/netviet/bootstrap-auth-user.mjs
node deploy/netviet/seed-tenant-knowledge.mjs
node deploy/netviet/seed-transport-demo.mjs

# `exec`: Nest nhan SIGTERM truc tiep tu Northflank, khong qua mot shell trung gian.
exec node apps/api/dist/main.js
