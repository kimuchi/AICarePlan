# ケアプラン作成支援システム

居宅サービス計画書（第1表〜第3表）をAIで作成支援するWebアプリケーションです。

## 概要

ケアマネジャーがGoogleドライブ上に蓄積された利用者情報をもとに、Gemini APIで複数のケアプラン案を生成し、選択・編集してGoogleスプレッドシートにエクスポートできます。

### 対応する事業形態

- **居宅介護支援（通常）**: 居宅サービス計画書(1)〜(3)
- **小規模多機能型居宅介護**: 居宅サービス計画書(1)〜(3) 兼小規模多機能型居宅介護計画書

## 技術スタック

| レイヤ | 技術 |
|--------|------|
| ランタイム | Node.js 20+ |
| バックエンド | Express.js (TypeScript) |
| フロントエンド | React + Vite (TypeScript) |
| AI | Gemini API (`@google/genai` SDK) |
| 認証 | Google OAuth 2.0 |
| データストア | Google Sheets |
| ファイル取得 | Google Drive API v3 |
| デプロイ | Google Cloud Run (Docker) |

## クイックスタート

### 前提条件

- Node.js 20+
- Google Cloud プロジェクト（OAuth 2.0 クライアント設定済み）
- Gemini API キー

### セットアップ

```bash
# リポジトリをクローン
git clone <repository-url>
cd careplan-app

# 依存関係のインストール
npm install

# 環境変数の設定
cp .env.example .env
# .env を編集して必要な値を入力

# 開発サーバー起動
npm run dev
```

開発サーバーは以下で起動します:
- フロントエンド: http://localhost:5173
- API: http://localhost:3001

### 本番ビルド

```bash
npm run build
npm start
```

### Cloud Run デプロイ

```bash
# .env に必要な値を設定後、コマンド1つでデプロイ
npm run deploy:cloudrun

# オプション指定も可能
npm run deploy:cloudrun -- --project my-project --region asia-northeast1
```

詳細は [デプロイガイド](docs/deploy-guide.md) を参照してください。

## プロジェクト構成

```
careplan-app/
├── Dockerfile              # マルチステージビルド
├── deploy.sh               # Cloud Run デプロイスクリプト
├── server/                 # Express バックエンド (TypeScript)
│   ├── index.ts            # エントリポイント
│   ├── auth.ts             # OAuth 認証
│   ├── routes/             # API ルート
│   │   ├── users.ts        # 利用者一覧
│   │   ├── sources.ts      # 情報源管理
│   │   ├── analyze.ts      # Gemini AI 分析
│   │   ├── export.ts       # Sheets エクスポート
│   │   └── settings.ts     # 設定管理
│   ├── lib/                # ライブラリ
│   │   ├── drive.ts        # Drive API ラッパー
│   │   ├── sheets.ts       # Sheets API ラッパー
│   │   ├── gemini.ts       # Gemini SDK ラッパー
│   │   ├── promptBuilder.ts# プロンプト変数展開
│   │   └── careplanFormat.ts# エクスポート書式定義
│   └── types/
│       └── plan.ts         # TypeScript 型定義
├── client/                 # React フロントエンド
│   ├── index.html
│   ├── src/
│   │   ├── App.tsx         # メインアプリ
│   │   ├── api.ts          # API クライアント
│   │   ├── styles.ts       # スタイル定義
│   │   └── views/          # 画面コンポーネント
│   │       ├── Home.tsx
│   │       ├── Settings.tsx
│   │       └── Create/
│   │           ├── UserSelect.tsx
│   │           ├── SourceSelect.tsx
│   │           ├── PlanEdit.tsx
│   │           ├── Table1View.tsx
│   │           ├── Table2View.tsx
│   │           └── Table3View.tsx
└── docs/
    ├── user-manual.md      # 利用者マニュアル
    ├── deploy-guide.md     # デプロイガイド
    └── technical-manual.md # 詳細技術マニュアル
```

## 環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `OAUTH_CLIENT_ID` | Google OAuth クライアントID | ○ |
| `OAUTH_CLIENT_SECRET` | Google OAuth クライアントシークレット | ○ |
| `SESSION_SECRET` | セッション暗号化キー | ○ |
| `GEMINI_API_KEY` | Gemini API キー | ○ |
| `SETTINGS_SPREADSHEET_ID` | 設定スプレッドシートID | △ |
| `USER_ROOT_FOLDER_ID` | 共有ドライブ利用者フォルダルートID | △ |
| `USER_ROOT_FOLDER_ID_PRIVATE` | マイドライブ利用者フォルダルートID | - |
| `PORT` | サーバーポート（デフォルト: 3001） | - |
| `BASE_URL` | 本番URL（OAuthコールバック用） | △ |

## ライセンス

MIT
