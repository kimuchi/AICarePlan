#!/bin/bash
# ケアプラン作成支援システム Cloud Run デプロイスクリプト
#
# 使用方法:
#   chmod +x deploy.sh
#   ./deploy.sh [PROJECT_ID] [REGION]
#
# 環境変数を事前に設定するか、.env ファイルから読み込んでください。

set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project)}"
REGION="${2:-asia-northeast1}"
SERVICE_NAME="careplan-app"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "=== ケアプラン作成支援システム デプロイ ==="
echo "  Project: ${PROJECT_ID}"
echo "  Region:  ${REGION}"
echo "  Service: ${SERVICE_NAME}"
echo ""

# 必要なAPIを有効化
echo ">> APIの有効化..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  drive.googleapis.com \
  sheets.googleapis.com \
  --project="${PROJECT_ID}" \
  --quiet

# コンテナイメージのビルドとプッシュ
echo ">> コンテナイメージのビルド..."
gcloud builds submit \
  --tag "${IMAGE_NAME}" \
  --project="${PROJECT_ID}" \
  --timeout=600s

# Cloud Run にデプロイ
echo ">> Cloud Run へデプロイ..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_NAME}" \
  --region "${REGION}" \
  --project="${PROJECT_ID}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --timeout 300 \
  --set-env-vars "\
OAUTH_CLIENT_ID=${OAUTH_CLIENT_ID:-},\
OAUTH_CLIENT_SECRET=${OAUTH_CLIENT_SECRET:-},\
SESSION_SECRET=${SESSION_SECRET:-$(openssl rand -hex 32)},\
GEMINI_API_KEY=${GEMINI_API_KEY:-},\
SETTINGS_SPREADSHEET_ID=${SETTINGS_SPREADSHEET_ID:-},\
USER_ROOT_FOLDER_ID=${USER_ROOT_FOLDER_ID:-},\
USER_ROOT_FOLDER_ID_PRIVATE=${USER_ROOT_FOLDER_ID_PRIVATE:-},\
NODE_ENV=production"

# デプロイ後のURL取得
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format='value(status.url)')

echo ""
echo "=== デプロイ完了 ==="
echo "  URL: ${SERVICE_URL}"
echo ""
echo "  OAuth コールバックURLに以下を追加してください:"
echo "  ${SERVICE_URL}/auth/google/callback"
echo ""
echo "  環境変数 BASE_URL を更新してください:"
echo "  gcloud run services update ${SERVICE_NAME} --region=${REGION} --update-env-vars BASE_URL=${SERVICE_URL}"
