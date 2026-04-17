# ケアプラン作成支援システム 詳細技術マニュアル

## 1. アーキテクチャ概要

```
┌──────────────────────────────────────────────────┐
│                  Cloud Run                        │
│  ┌─────────────┐     ┌─────────────────────────┐ │
│  │  Express.js  │────▶│  dist/client/ (静的配信) │ │
│  │  API Server  │     └─────────────────────────┘ │
│  └──────┬───────┘                                 │
│         │                                         │
└─────────┼─────────────────────────────────────────┘
          │
    ┌─────┴──────┐
    │ API Routes  │
    ├─────────────┤
    │ /api/users  │──▶ Google Drive API (フォルダ一覧)
    │ /api/sources│──▶ Google Drive API (ファイル取得)
    │ /api/analyze│──▶ Gemini API (プラン生成)
    │ /api/export │──▶ Google Sheets API (スプレッドシート作成)
    │ /api/settings│─▶ Google Sheets API (設定読み書き)
    └─────────────┘
```

### 単一コンテナ構成

- フロントエンド（React）は`vite build`で`dist/client/`に静的ファイルとして出力
- Express.jsが`dist/client/`を静的配信し、APIは`/api/*`にマウント
- 認証エンドポイントは`/auth/*`

---

## 2. 認証フロー

```
ブラウザ → /auth/google → Google OAuth → /auth/google/callback → セッション作成 → リダイレクト /
```

- `express-session`でセッション管理
- アクセストークンはセッションに保存（`req.session.accessToken`）
- 全APIルートで`requireAuth`ミドルウェアによる認証チェック
- Allow-listは設定スプレッドシートの`allowlist`シートで管理

### 開発モード

OAuth未設定時は`/auth/mock-login`でモック認証が使用されます。

---

## 3. API仕様

### GET /api/users

利用者フォルダ一覧を返却。

**レスポンス**:
```json
{
  "users": [
    {
      "id": "folder-id",
      "name": "玉澤 廣子",
      "folderName": "玉澤 廣子様",
      "folderId": "folder-id",
      "hasConfidential": true,
      "modifiedTime": "2025-10-27T..."
    }
  ]
}
```

### GET /api/sources/users/:folderId/sources

利用者フォルダ配下のファイル一覧を再帰的に取得。

**レスポンス**:
```json
{
  "sources": [
    {
      "id": "file-id",
      "name": "解析結果_玉澤廣子.json",
      "category": "careplan",
      "date": "2025-10-27",
      "mimeType": "application/json",
      "icon": "📋",
      "isConfidential": false,
      "folderId": "parent-folder-id"
    }
  ]
}
```

### POST /api/sources/fetch

選択したファイルのコンテンツを取得。

**リクエスト**:
```json
{
  "fileIds": ["file-id-1", "file-id-2"],
  "mimeTypes": { "file-id-1": "application/json", "file-id-2": "application/pdf" }
}
```

**処理ロジック**:
- JSON → そのまま返却（最優先）
- PDF → Gemini APIで解析してテキスト化
- Google Docs → テキストとしてエクスポート（長文の場合はGeminiで要約）
- スプレッドシート → 最新★タブのデータを取得

### POST /api/analyze

Gemini APIでケアプラン3案を生成。

**リクエスト**:
```json
{
  "user": { "id": "...", "name": "...", "folderId": "...", "birthDate": "", "careLevel": "", "address": "" },
  "sourceContents": { "careplan": "...", "assessment": "...", "medical": "..." },
  "mode": "shoki"
}
```

**処理**:
1. 設定スプレッドシートからプロンプト・基本情報を取得
2. `mode`に応じて`kyotaku`または`shoki`プロンプトセットを選択
3. テンプレート変数を展開
4. Gemini APIに第1表・第2表・第3表を並列リクエスト（構造化JSON出力）
5. 結果を`GeneratedPlan[]`にマージして返却

### POST /api/export

Google Sheetsにケアプランをエクスポート。

**リクエスト**:
```json
{
  "user": { ... },
  "plan": { ... },
  "meta": { "creator": "...", "facility": "...", "facilityAddress": "...", "createDate": "...", "firstCreateDate": "..." },
  "mode": "shoki"
}
```

**処理**:
1. 利用者フォルダの`01_居宅サービス計画書/`配下に新規スプレッドシート作成
2. 第1表・第2表・第3表を各シートに`batchUpdate`で書式設定付きで書き込み
3. 罫線・セル結合・背景色・フォント設定を適用
4. 履歴シートに記録
5. スプレッドシートURLを返却

---

## 4. データモデル

### 設定スプレッドシート構造

| シート名 | 列 | 説明 |
|---------|-----|------|
| `general` | key, value | 基本設定（key-value形式） |
| `prompts` | id, title, body | 6種類のプロンプト |
| `allowlist` | email, role, name | 許可ユーザー一覧 |
| `drafts` | user_id, user_name, mode, plan_json, updated_at | 下書き保存 |
| `history` | user_id, user_name, mode, exported_url, exported_at | エクスポート履歴 |

### プロンプトID体系

| ID | 対応 |
|----|------|
| `prompt_kyotaku_table1` | 居宅介護支援 第1表 |
| `prompt_kyotaku_table2` | 居宅介護支援 第2表 |
| `prompt_kyotaku_table3` | 居宅介護支援 第3表 |
| `prompt_shoki_table1` | 小規模多機能 第1表 |
| `prompt_shoki_table2` | 小規模多機能 第2表 |
| `prompt_shoki_table3` | 小規模多機能 第3表 |

---

## 5. Gemini API 統合

### 構造化出力

各テーブルの生成に`responseMimeType: "application/json"`とJSON Schemaを使用:

- **第1表**: `{ plans: [{ id, label, summary, table1: { userWishes, familyWishes, ... } }] }`
- **第2表**: `{ plans: [{ id, table2: [{ need, goals: [{ longGoal, ..., services: [...] }] }] }] }`
- **第3表**: `{ plans: [{ id, table3: { schedule: [...], dailyActivities: [...], weeklyService } }] }`

### トークン管理

- 各情報源コンテンツは15,000文字で切り詰め
- PDFは事前にGeminiで解析/要約
- 長文Google Docsは20,000文字超で要約

---

## 6. エクスポート書式

### 第1表

6列構成（A-F）。セル結合を多用して様式を再現。主要フィールド:
- 利用者基本情報（名前、生年月日、住所）
- 事業所・作成者情報
- 認定情報
- 意向・課題分析・総合方針

### 第2表

11列構成（A-K）。ニーズ→目標→サービスの階層構造をrowSpanで表現。

### 第3表

10列構成。0:00〜22:00を2時間刻み12行、月〜日の7列。サービスブロックに色分け:
- 通い: 水色（`#dbeafe`）
- 訪問: 緑（`#dcfce7`）
- 泊まり: 紫（`#ede9fe`）

---

## 7. Autofiler-CarePlanning 連携

### 読み取り対象

| フォルダ | 読み取り内容 |
|---------|-------------|
| `01_居宅サービス計画書/` | `*_解析結果_*.json`（優先）、`*.pdf` |
| `02_主治医意見書/` | JSON > PDF |
| `03_認定調査票/` | JSON > PDF |
| `04_サービス担当者会議/` | JSON > PDF |
| `05_アセスメントシート/` | JSON > PDF |
| `99_実施記録・アーカイブ/` | Google Docs テキスト |
| `フェイスシート_アセスメント_*様` | スプレッドシートの最新★タブ |

### 書き込み対象

- `01_居宅サービス計画書/`配下に新規スプレッドシートのみ作成
- 既存のAutofilerファイルは一切変更しない

---

## 8. セキュリティ

- 全API認証必須（`requireAuth`ミドルウェア）
- 管理者操作は`requireAdmin`で追加制御
- Drive/Sheets APIはユーザーのOAuthトークンで実行
- マイドライブの機密文書は本人のトークンでのみアクセス可能
- Geminiログに個人情報をマスク（エラー時の日本語文字を`***`に置換）
- セッションCookie: `httpOnly`, `sameSite: lax`, `secure`（本番）

---

## 9. ローカル開発

```bash
# 依存関係インストール
npm install

# 開発サーバー起動（フロント + バックエンド同時）
npm run dev

# TypeScript型チェック
npm run typecheck

# 本番ビルドテスト
npm run build
npm start
```

Viteの開発サーバー（:5173）からAPIリクエストは`localhost:3001`にプロキシされます。

## Excel取り込みAPI（2026-04 追加）
- `POST /api/import/preview`: multipart `files` を受け取り、ExcelJS で解析。セッションに一時保存。
- `POST /api/import/commit`: previewで確定した `fileId` をDrive配置、解析JSON生成、必要に応じてdraftsへ追加。
- `GET /api/users/:folderId/careplan-latest`: 最新 `解析結果_ケアプラン_*.json` を返却。
- `GET /api/users/:folderId/assessment-latest`: 最新 `解析結果_アセスメント_*.json` を返却。
