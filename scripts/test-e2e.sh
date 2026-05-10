#!/usr/bin/env bash
set -euo pipefail

container_name="haxfootball-api-e2e-minio-$RANDOM"
minio_port="${MINIO_PORT:-9000}"
database_id="$(date +%s)-$RANDOM"

export APP_API_KEY="${APP_API_KEY:-test-api-key}"
export JWT_SECRET="${JWT_SECRET:-test-jwt-secret}"
export DATABASE_FILE="${DATABASE_FILE:-/tmp/haxfootball-api-e2e-${database_id}.sqlite}"
export R2_BUCKET="${R2_BUCKET:-recs}"
export R2_ENDPOINT="${R2_ENDPOINT:-http://127.0.0.1:${minio_port}}"
export R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-minioadmin}"
export R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-minioadmin}"
export R2_PUBLIC_BASE_URL="${R2_PUBLIC_BASE_URL:-http://127.0.0.1:${minio_port}/${R2_BUCKET}}"

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
}

trap cleanup EXIT

docker run \
  --detach \
  --name "$container_name" \
  --publish "127.0.0.1:${minio_port}:9000" \
  --env "MINIO_ROOT_USER=${R2_ACCESS_KEY_ID}" \
  --env "MINIO_ROOT_PASSWORD=${R2_SECRET_ACCESS_KEY}" \
  minio/minio:latest \
  server /data >/dev/null

for _ in {1..60}; do
  if curl --fail --silent "http://127.0.0.1:${minio_port}/minio/health/ready" >/dev/null; then
    break
  fi

  sleep 1
done

curl --fail --silent "http://127.0.0.1:${minio_port}/minio/health/ready" >/dev/null

bun -e 'import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
const client = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  region: "auto",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});
await client.send(new CreateBucketCommand({ Bucket: process.env.R2_BUCKET }));'

bun test test/e2e
