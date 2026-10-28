#!/usr/bin/env bash
# 服务器初始化脚本（在 Ubuntu 上以 ubuntu 用户执行）
# 作用：解包、派生已有中间件凭据、生成 .env、初始化数据库
set -euo pipefail

ROOT=/opt/jobfit
PKG=/tmp/jobfit-src.tar.gz

echo "==> 解包到 $ROOT"
mkdir -p "$ROOT"
tar -xzf "$PKG" -C "$ROOT"
mkdir -p "$ROOT/deploy/data/nginx/logs"

echo "==> 从现有容器派生凭据（不写死明文）"
REDIS_PW=$(docker inspect redis608 --format '{{join .Args " "}}' | sed -n 's/.*--requirepass \([^ ]*\).*/\1/p' | head -1)
MINIO_AK=$(docker inspect minio --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^MINIO_ROOT_USER=//p' | head -1)
MINIO_SK=$(docker inspect minio --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^MINIO_ROOT_PASSWORD=//p' | head -1)

if [ -z "$REDIS_PW" ]; then echo "!! 未能从 redis608 取到密码"; exit 1; fi
if [ -z "$MINIO_AK" ] || [ -z "$MINIO_SK" ]; then echo "!! 未能从 minio 取到凭据"; exit 1; fi

APP_PW=$(openssl rand -hex 12)

echo "==> 写入 $ROOT/deploy/.env"
cat > "$ROOT/deploy/.env" <<EOF
MYSQL_PASSWORD=$APP_PW
REDIS_PASSWORD=$REDIS_PW
MINIO_ACCESS_KEY=$MINIO_AK
MINIO_SECRET_KEY=$MINIO_SK
EOF
chmod 600 "$ROOT/deploy/.env"

echo "==> 初始化数据库与账号"
sed "s/CHANGE_ME_DB_PASSWORD/$APP_PW/" "$ROOT/deploy/mysql/init/01-schema.sql" > /tmp/jobfit-init.sql
docker exec -i mysql80 sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --default-character-set=utf8mb4' < /tmp/jobfit-init.sql
rm -f /tmp/jobfit-init.sql

echo "==> 建表结果"
docker exec -i mysql80 sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N -e "select count(*) from information_schema.tables where table_schema='"'"'jobfit'"'"'"'

echo "==> 完成"
