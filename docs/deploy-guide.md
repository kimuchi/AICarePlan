# ケアプラン作成支援システム デプロイガイド（Windows版）

本ガイドでは、Windows環境でのプロジェクトセットアップからGoogle Cloud Runへのデプロイまでの全手順を説明します。

---

## 目次

1. [前提条件・ツールのインストール](#1-前提条件ツールのインストール)
2. [プロジェクトのセットアップ](#2-プロジェクトのセットアップ)
3. [Google Cloud プロジェクトの準備](#3-google-cloud-プロジェクトの準備)
4. [OAuth 2.0 クライアントの作成](#4-oauth-20-クライアントの作成)
5. [Gemini API キーの取得](#5-gemini-api-キーの取得)
6. [設定スプレッドシートの準備](#6-設定スプレッドシートの準備)
7. [環境変数の設定](#7-環境変数の設定)
8. [ローカルでの動作確認](#8-ローカルでの動作確認)
9. [Cloud Run へのデプロイ](#9-cloud-run-へのデプロイ)
10. [デプロイ後の設定](#10-デプロイ後の設定)
11. [アプリケーションの初期設定](#11-アプリケーションの初期設定)
12. [更新・運用](#12-更新運用)
13. [トラブルシューティング](#13-トラブルシューティング)

---

## 1. 前提条件・ツールのインストール

### 1.1 Node.js のインストール

1. [Node.js公式サイト](https://nodejs.org/ja) から **v20 LTS** をダウンロード
2. インストーラー（`.msi`）を実行し、デフォルト設定でインストール
3. インストール確認:

```powershell
node --version
# v20.x.x と表示されればOK

npm --version
# 10.x.x と表示されればOK
```

### 1.2 Git のインストール

1. [Git for Windows](https://gitforwindows.org/) をダウンロード・インストール
2. インストール時の設定:
   - **デフォルトエディタ**: お好みのエディタ（VS Codeなど）
   - **PATH設定**: 「Git from the command line and also from 3rd-party software」を選択
   - **改行コード**: 「Checkout as-is, commit Unix-style line endings」を推奨
3. インストール確認:

```powershell
git --version
# git version 2.x.x と表示されればOK
```

### 1.3 Google Cloud CLI のインストール

1. [Google Cloud CLI インストーラー](https://cloud.google.com/sdk/docs/install?hl=ja) からWindows用インストーラーをダウンロード
2. インストーラー（`GoogleCloudSDKInstaller.exe`）を実行
3. インストール完了後、Google Cloud SDK Shell が起動します
4. 初期設定:

```powershell
gcloud init
# ブラウザが開くのでGoogleアカウントでログイン
# プロジェクトを選択（または新規作成）
```

5. インストール確認:

```powershell
gcloud --version
# Google Cloud SDK xxx.x.x と表示されればOK
```

### 1.4 Docker Desktop のインストール（オプション：ローカルビルドする場合）

1. [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) をダウンロード
2. インストール・再起動
3. WSL 2 バックエンドの使用を推奨

> **注意**: Cloud Build を使う場合（推奨）はローカルにDockerは不要です。

---

## 2. プロジェクトのセットアップ

### 2.1 リポジトリのクローン

PowerShell またはコマンドプロンプトを開きます:

```powershell
# 作業フォルダに移動（例: ドキュメント）
cd $env:USERPROFILE\Documents

# リポジトリをクローン
git clone https://github.com/kimuchi/AICarePlan.git

# プロジェクトフォルダに移動
cd AICarePlan
```

### 2.2 依存関係のインストール

```powershell
npm install
```

> 完了まで1〜2分かかります。「npm warn」は無視して構いません。

### 2.3 環境変数ファイルの作成

```powershell
# テンプレートをコピー
copy .env.example .env
```

`.env` ファイルをメモ帳やVS Codeで開き、後述の手順で取得した値を入力していきます。

### 2.4 ビルドの確認

```powershell
# TypeScript型チェック
npx tsc --noEmit

# フロントエンドビルド
npx vite build --config vite.config.ts
```

エラーが出なければプロジェクトのセットアップは完了です。

---

## 3. Google Cloud プロジェクトの準備

### 3.1 プロジェクトの作成（初めての場合）

1. [Google Cloud Console](https://console.cloud.google.com) にアクセス
2. 左上のプロジェクトセレクターをクリック → 「新しいプロジェクト」
3. プロジェクト名を入力（例: `careplan-system`）
4. 「作成」をクリック

> 既存のAutofiler-CarePlanningプロジェクトがある場合は、同じプロジェクトを使用できます。

### 3.2 課金の有効化

1. Cloud Console左メニュー → 「お支払い」
2. 請求先アカウントをプロジェクトにリンク

### 3.3 必要なAPIの有効化

PowerShellで以下を実行:

```powershell
gcloud services enable `
  run.googleapis.com `
  cloudbuild.googleapis.com `
  artifactregistry.googleapis.com `
  drive.googleapis.com `
  sheets.googleapis.com `
  --project=YOUR_PROJECT_ID
```

> **PowerShellの改行**: PowerShellでは行末に `` ` ``（バッククォート）を使って改行します。

または、Cloud Console上でそれぞれのAPIを検索して手動で有効化することもできます:
- Cloud Run API
- Cloud Build API
- Artifact Registry API
- Google Drive API
- Google Sheets API

### 3.4 Cloud Build サービスアカウントの権限設定

Cloud Build がコンテナイメージのビルド・保存・デプロイを行うために、サービスアカウントに必要な権限を付与します。**この手順を省略するとデプロイ時に権限エラーになります。**

まず、プロジェクト番号を確認:

```powershell
gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)"
```

表示されたプロジェクト番号（例: `850762165912`）を使って、以下の3つの権限を付与:

```powershell
# Cloud Storage への読み書き（ビルド用ソースのアップロードに必要）
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID `
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" `
  --role="roles/storage.admin"

# Artifact Registry への書き込み（ビルドしたイメージの保存に必要）
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID `
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" `
  --role="roles/artifactregistry.writer"

# Cloud Logging への書き込み（ビルドログの出力に必要）
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID `
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" `
  --role="roles/logging.logWriter"
```

> `YOUR_PROJECT_ID` と `PROJECT_NUMBER` はご自身の値に置き換えてください。
> 例: `--member="serviceAccount:850762165912-compute@developer.gserviceaccount.com"`

---

## 4. OAuth 2.0 クライアントの作成

### 4.1 OAuth 同意画面の設定

1. Cloud Console → **APIs & Services** → **OAuth consent screen**
2. User Type: **外部**を選択（組織内のみの場合は「内部」）
3. アプリ情報を入力:
   - アプリ名: `ケアプラン作成支援システム`
   - ユーザーサポートメール: あなたのメールアドレス
   - デベロッパー連絡先: あなたのメールアドレス
4. スコープの追加（「スコープを追加または削除」ボタン）:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/spreadsheets`
5. テストユーザーの追加（外部の場合）:
   - 使用するGoogleアカウントのメールアドレスを追加

### 4.2 OAuth クライアントID の作成

1. Cloud Console → **APIs & Services** → **Credentials**
2. 「+ 認証情報を作成」→「OAuth クライアントID」
3. 設定:
   - アプリケーションの種類: **ウェブ アプリケーション**
   - 名前: `careplan-app`
   - 承認済みの JavaScript 生成元:
     - `http://localhost:3001`（ローカル開発用）
   - 承認済みのリダイレクト URI:
     - `http://localhost:3001/auth/google/callback`（ローカル開発用）
     - ※Cloud Run のURLは後で追加します
4. 「作成」をクリック
5. 表示される **クライアントID** と **クライアントシークレット** を記録

> この2つの値を `.env` ファイルの `OAUTH_CLIENT_ID` と `OAUTH_CLIENT_SECRET` に記入します。

---

## 5. Gemini API キーの取得

### 方法A: Google AI Studio（推奨）

1. [Google AI Studio](https://aistudio.google.com/) にアクセス
2. 「Get API Key」→「Create API Key」
3. 対象のGCPプロジェクトを選択
4. 生成されたAPIキーを記録

### 方法B: Cloud Console

1. Cloud Console → **APIs & Services** → **Credentials**
2. 「+ 認証情報を作成」→「APIキー」
3. APIキーの制限設定（推奨）:
   - APIの制限: 「Generative Language API」のみに制限

> APIキーを `.env` ファイルの `GEMINI_API_KEY` に記入します。

---

## 6. 設定スプレッドシートの準備

### 6.1 スプレッドシートの作成

1. [Google Sheets](https://sheets.google.com) で新しいスプレッドシートを作成
2. 名前を「ケアプラン作成支援_設定」などに変更
3. URLからスプレッドシートIDを取得:
   ```
   https://docs.google.com/spreadsheets/d/【このIDをコピー】/edit
   ```
4. `.env` ファイルの `SETTINGS_SPREADSHEET_ID` にIDを記入

> 初回起動時にシステムが自動的に `general`, `prompts`, `allowlist`, `drafts`, `history` の5つのシートを作成し、デフォルトのプロンプト6種を投入します。

### 6.2 利用者フォルダルートIDの取得

Autofiler-CarePlanningで使用しているGoogleドライブのフォルダを開き、URLからIDを取得します:

```
https://drive.google.com/drive/folders/【このIDをコピー】
```

- 共有ドライブのフォルダID → `.env` の `USER_ROOT_FOLDER_ID` に記入
- マイドライブの機密フォルダID → `.env` の `USER_ROOT_FOLDER_ID_PRIVATE` に記入（オプション）

---

## 7. 環境変数の設定

`.env` ファイルを開き、すべての値を記入します:

```ini
# Google OAuth 2.0
OAUTH_CLIENT_ID=123456789-xxxxxx.apps.googleusercontent.com
OAUTH_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxx

# セッション暗号化キー（ランダムな文字列を設定）
SESSION_SECRET=ここにランダムな文字列を入力してください

# Gemini API
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxx

# Gemini モデル設定
#   生成用: ケアプラン3案の生成に使用（高品質推奨）
#   解析用: PDF読み取り・長文要約に使用（高速・低コスト推奨）
GEMINI_MODEL_GENERATE=gemini-2.5-flash-preview-05-20
GEMINI_MODEL_ANALYZE=gemini-2.0-flash

# 設定スプレッドシートID
SETTINGS_SPREADSHEET_ID=1BxiMVs0XRA5nxxxxxxxxxxxxxxxxxxxxxxxxx

# 利用者フォルダルートID（共有ドライブ）
USER_ROOT_FOLDER_ID=1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# マイドライブ機密フォルダ名
# Autofiler-CarePlanningがマイドライブ直下に作成するフォルダ名を指定。
# ログインユーザー本人のマイドライブから自動検索します。
PRIVATE_FOLDER_NAME=利用者フォルダ

# サーバーポート
PORT=3001

# 本番環境URL（OAuth コールバック用）
BASE_URL=http://localhost:3001
```

### SESSION_SECRET の生成方法

PowerShellでランダムな文字列を生成:

```powershell
# 方法1: .NETのRandomNumberGenerator
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])

# 方法2: GUIDを連結
"$([guid]::NewGuid().ToString('N'))$([guid]::NewGuid().ToString('N'))"
```

---

## 8. ビルドの確認

デプロイ前にビルドが通ることを確認します:

```powershell
# TypeScript型チェック
npx tsc --noEmit

# フロントエンドビルド
npx vite build --config vite.config.ts
```

エラーが出なければ準備完了です。次のステップでCloud Runに直接デプロイします。

> **ローカルで動作確認したい場合**: `npm run dev` で開発サーバーを起動し、`http://localhost:5173` にアクセスします。OAuth のリダイレクトURIに `http://localhost:3001/auth/google/callback` を追加する必要があります。

---

## 9. Cloud Run へのデプロイ

### 9.1 事前準備：gcloud の認証

```powershell
# ログイン状態を確認
gcloud auth list

# ログインしていない場合
gcloud auth login

# プロジェクトを設定
gcloud config set project YOUR_PROJECT_ID
```

### 9.2 デプロイの実行（npm コマンド1つで完了）

`.env` ファイルに必要な値がすべて記入されていることを確認したら、以下を実行するだけです:

```powershell
npm run deploy:cloudrun
```

これだけで以下が自動的に実行されます:

1. `.env` ファイルの読み込み
2. 必須設定値（`OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `GEMINI_API_KEY`）のチェック
3. `SESSION_SECRET` が未設定なら自動生成
4. 必要なGCP APIの有効化
5. Artifact Registry リポジトリの作成（初回のみ）
6. Cloud Build でコンテナイメージをビルド
7. Cloud Run へデプロイ
8. `BASE_URL` の自動設定

> ビルド＋デプロイには5〜10分程度かかります。

### 9.3 オプション指定

```powershell
# プロジェクトIDやリージョンを明示的に指定
npm run deploy:cloudrun -- --project my-project-id --region asia-northeast1

# ビルドだけ（デプロイはしない）
npm run deploy:cloudrun -- --build-only

# デプロイだけ（前回ビルド済みのイメージを使用）
npm run deploy:cloudrun -- --deploy-only

# メモリやインスタンス数を変更
npm run deploy:cloudrun -- --memory 1Gi --max-instances 10

# ヘルプの表示
npm run deploy:cloudrun -- --help
```

### 9.4 デプロイ結果の確認

デプロイ完了後、コンソールにサービスURLが表示されます:

```
═══════════════════════════════════════════════════
  デプロイ完了!
═══════════════════════════════════════════════════

  アプリURL: https://careplan-app-xxxxxxxxxx-an.a.run.app
```

手動で確認する場合:

```powershell
gcloud run services describe careplan-app `
  --region=asia-northeast1 `
  --format="value(status.url)"
```

---

## 10. デプロイ後の設定

### 10.1 BASE_URL の設定

デプロイで取得したURLを `BASE_URL` 環境変数に設定します:

```powershell
gcloud run services update careplan-app `
  --region=asia-northeast1 `
  --update-env-vars "BASE_URL=https://careplan-app-xxxxxxxxxx-an.a.run.app"
```

### 10.2 OAuth リダイレクトURIの追加

1. Cloud Console → **APIs & Services** → **Credentials**
2. 作成したOAuth クライアントIDをクリック
3. 「承認済みのリダイレクト URI」に以下を追加:
   ```
   https://careplan-app-xxxxxxxxxx-an.a.run.app/auth/google/callback
   ```
4. 「承認済みの JavaScript 生成元」に以下を追加:
   ```
   https://careplan-app-xxxxxxxxxx-an.a.run.app
   ```
5. 「保存」をクリック

### 10.3 ヘルスチェック

ブラウザまたはPowerShellで動作確認:

```powershell
# ヘルスチェック
Invoke-RestMethod -Uri "https://careplan-app-xxxxxxxxxx-an.a.run.app/healthz"
# {"status":"ok","timestamp":"2026-04-07T..."} と返ればOK
```

---

## 11. アプリケーションの初期設定

### 11.1 初回ログイン

1. ブラウザでCloud RunのURLにアクセス
2. 「Googleでログイン」をクリック
3. Googleアカウントで認証

> 初回は設定スプレッドシートの自動初期化が行われるため、数秒かかる場合があります。

### 11.2 基本情報の設定

1. ホーム画面右上の「設定」ボタンをクリック
2. 「基本情報」タブで以下を入力:
   - 事業所名（例: `小規模多機能型居宅介護 燦々ほーむ あらかわ`）
   - 事業所所在地（例: `東京都荒川区荒川4-9-11`）
   - 居宅サービス計画作成者氏名（例: `金沢 雄司`）
   - 利用者フォルダルートID（共有ドライブ側）
   - AIモデル（デフォルト: Gemini 2.5 Flash）
3. 「保存」をクリック

### 11.3 許可リストの設定

1. 設定画面の「許可リスト」タブ
2. 「+ 追加」でログインを許可するユーザーを追加:
   - メールアドレス: Googleアカウントのメール
   - ロール: `admin`（管理者）または `user`（一般ユーザー）
   - 名前: 表示名
3. 「保存」をクリック

### 11.4 プロンプトの確認

1. 設定画面の各プロンプトタブを確認
2. デフォルトのプロンプト6種（居宅×3 + 小多機×3）が投入されています
3. 必要に応じて事業所の特性に合わせて調整してください

---

## 12. 更新・運用

### 12.1 コード更新後の再デプロイ

```powershell
# 最新コードを取得
git pull

# 再デプロイ（初回と同じコマンド）
npm run deploy:cloudrun
```

Cloud Run はブルー/グリーンデプロイメントを行うため、ダウンタイムなしで更新されます。

### 12.2 環境変数の更新

```powershell
# 個別の環境変数を更新
gcloud run services update careplan-app `
  --region=asia-northeast1 `
  --update-env-vars "GEMINI_API_KEY=新しいキー"
```

### 12.3 ログの確認

```powershell
# 最新ログを確認
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=careplan-app" `
  --limit=50 `
  --format="table(timestamp,textPayload)"
```

Cloud Console上でも確認できます:
Cloud Console → Cloud Run → `careplan-app` → 「ログ」タブ

### 12.4 Autofiler-CarePlanning との同居

本システムは同じGCPプロジェクトに配置できます:

- Cloud Run は別サービスとしてデプロイされるため競合しません
- Google Drive のフォルダは読み取り専用で共有（既存ファイルを変更しません）
- エクスポート時のみ `01_居宅サービス計画書/` 配下に新規スプレッドシートを作成します

---

## 13. トラブルシューティング

### デプロイ関連

| 問題 | 対処法 |
|------|--------|
| `gcloud` コマンドが見つからない | Google Cloud SDK Shellを使うか、PATHに `C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin` を追加 |
| Cloud Build がタイムアウト | `--timeout=900s` に延長して再試行 |
| `permission denied` | `gcloud auth login` で再認証。プロジェクトのオーナーまたは編集者権限があるか確認 |
| `storage.objects.get` 権限エラー | Cloud Build サービスアカウントに `roles/storage.admin` を付与（[3.4節](#34-cloud-build-サービスアカウントの権限設定)参照） |
| `artifactregistry.repositories.uploadArtifacts` 権限エラー | Cloud Build サービスアカウントに `roles/artifactregistry.writer` を付与（[3.4節](#34-cloud-build-サービスアカウントの権限設定)参照） |
| `does not have permission to write logs` | Cloud Build サービスアカウントに `roles/logging.logWriter` を付与（[3.4節](#34-cloud-build-サービスアカウントの権限設定)参照） |
| Artifact Registry リポジトリが見つからない | リポジトリが作成されているか確認。APIが有効化されているか確認 |
| `npm install` で `TAR_ENTRY_ERROR` 大量発生 | 共有ドライブ（H:等）上で作業していないか確認。ローカルディスク（C:）にクローンし直す |
| デプロイ後に502エラー | Cloud Runのログを確認。環境変数が正しく設定されているか確認 |

### アプリケーション関連

| 問題 | 対処法 |
|------|--------|
| ログインできない | OAuth同意画面のテストユーザーにメールアドレスが追加されているか確認 |
| リダイレクトエラー | OAuthクライアントのリダイレクトURIが正しいか確認。`BASE_URL`が設定されているか確認 |
| 利用者が表示されない | 設定画面でフォルダルートIDが正しく設定されているか確認。ドライブの共有権限を確認 |
| AI分析がエラー | Gemini APIキーの有効性を確認。API利用制限に達していないか確認 |
| エクスポートが失敗 | ドライブへの書き込み権限があるか確認。スプレッドシートAPIが有効か確認 |

### PowerShell固有の注意

- 複数行コマンドの改行には `` ` ``（バッククォート）を使用
- 環境変数の設定: `$env:変数名 = "値"` の形式
- ファイルパスの区切り文字は `\`（バックスラッシュ）を使用
- 文字コードの問題が発生する場合: `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`
