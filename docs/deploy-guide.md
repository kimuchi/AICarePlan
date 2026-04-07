# デプロイガイド

## 前提条件

- Google Cloud プロジェクト（請求アカウント有効）
- `gcloud` CLI インストール済み
- Docker（ローカルビルドの場合）

---

## 1. GCPプロジェクト設定

### 1.1 OAuth 2.0 クライアント作成

1. [Google Cloud Console](https://console.cloud.google.com) > APIs & Services > Credentials
2. 「OAuth 2.0 Client IDs」を作成
   - アプリケーションの種類: ウェブアプリケーション
   - 承認済みリダイレクトURI: `https://<your-cloud-run-url>/auth/google/callback`
3. クライアントIDとシークレットを記録

### 1.2 Gemini API キー取得

1. [Google AI Studio](https://aistudio.google.com/) でAPIキーを作成
2. または Google Cloud Console > APIs & Services > Credentials でAPIキーを作成

### 1.3 必要なAPIの有効化

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  drive.googleapis.com \
  sheets.googleapis.com
```

---

## 2. 設定スプレッドシートの準備

1. Google Sheetsで新しいスプレッドシートを作成
2. スプレッドシートIDを記録（URLの `/d/` と `/edit` の間の文字列）
3. 初回起動時にシステムが自動的に必要なシートを作成します

---

## 3. 環境変数の準備

```bash
export OAUTH_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export OAUTH_CLIENT_SECRET="your-client-secret"
export SESSION_SECRET="$(openssl rand -hex 32)"
export GEMINI_API_KEY="your-gemini-api-key"
export SETTINGS_SPREADSHEET_ID="your-spreadsheet-id"
export USER_ROOT_FOLDER_ID="your-shared-drive-folder-id"
export USER_ROOT_FOLDER_ID_PRIVATE=""  # マイドライブ機密フォルダ（オプション）
```

---

## 4. Cloud Run デプロイ

### 自動デプロイ（推奨）

```bash
chmod +x deploy.sh
./deploy.sh YOUR_PROJECT_ID asia-northeast1
```

### 手動デプロイ

```bash
# ビルド
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/careplan-app

# デプロイ
gcloud run deploy careplan-app \
  --image gcr.io/YOUR_PROJECT_ID/careplan-app \
  --region asia-northeast1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --set-env-vars "OAUTH_CLIENT_ID=...,OAUTH_CLIENT_SECRET=...,SESSION_SECRET=...,GEMINI_API_KEY=...,SETTINGS_SPREADSHEET_ID=...,USER_ROOT_FOLDER_ID=...,NODE_ENV=production"
```

---

## 5. デプロイ後の設定

### 5.1 BASE_URL の更新

Cloud Run のURLを取得し、環境変数を更新:

```bash
SERVICE_URL=$(gcloud run services describe careplan-app --region=asia-northeast1 --format='value(status.url)')
gcloud run services update careplan-app --region=asia-northeast1 --update-env-vars "BASE_URL=${SERVICE_URL}"
```

### 5.2 OAuth コールバックURLの追加

Google Cloud Console で OAuth クライアントの「承認済みリダイレクトURI」に追加:
```
https://<your-cloud-run-url>/auth/google/callback
```

### 5.3 初期設定

1. ブラウザでシステムURLにアクセスしログイン
2. 設定画面で事業所情報を入力
3. 許可リストにユーザーを追加
4. プロンプトを必要に応じて調整

---

## 6. Autofiler-CarePlanning との同居

本システムは同じGCPプロジェクトに配置できます:

- Cloud Run は別サービスとしてデプロイ
- Google Drive は読み取り専用で共有（既存ファイルは変更しない）
- エクスポート時のみ`01_居宅サービス計画書/`配下にファイルを作成

---

## 7. 監視とログ

```bash
# ログ確認
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=careplan-app" --limit=50

# メトリクス
# Cloud Console > Cloud Run > careplan-app > メトリクスタブ
```

---

## 8. 更新

```bash
# コード更新後、再デプロイ
./deploy.sh YOUR_PROJECT_ID asia-northeast1
```

Cloud Run はブルー/グリーンデプロイメントを行うため、ダウンタイムなしで更新されます。
