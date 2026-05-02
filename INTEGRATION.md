# AICarePlan → CPOS 移植 改修指示書 (Excel 取込対応版)

このドキュメントは、`refs_import_Excel/` 配下にある AICarePlan の Excel 取込
対応版を、CPOS (Care Planning OS) 上のアプリとして組み込むための **完全な
改修手順書** です。

ClaudeCode (または等価の AI コーディング支援) がこのドキュメントだけで作業を
始めれば、CPOS 上で AICarePlan が一通り動作する状態に到達できることを目的に
記述しています。**CPOS 全般の開発ガイド (規約・パターン) もこのドキュメント
単体で完結する** よう含めています。

---

## 目次

1. [前提と用語](#1-前提と用語)
2. [AICarePlan の概要](#2-aicareplan-の概要)
3. [CPOS 開発ガイド (必読)](#3-cpos-開発ガイド-必読)
4. [CPOS 既存共通基盤の棚卸し (本コミットで Excel 取込分を追加)](#4-cpos-既存共通基盤の棚卸し)
5. [Excel 取込の実装内容 (本コミット完了)](#5-excel-取込の実装内容-本コミット完了)
6. [移植戦略](#6-移植戦略)
7. [マッピング早見表](#7-マッピング早見表)
8. [改修フェーズ](#8-改修フェーズ)
9. [危険ポイント](#9-危険ポイント)
10. [動作確認の到達基準](#10-動作確認の到達基準)
11. [変更履歴](#11-変更履歴)

---

## 1. 前提と用語

| 用語 | 意味 |
|---|---|
| **CPOS** | Care Planning OS。`/home/user/cpos/`。npm workspaces。Express + React。Firestore + Cloud Run + Cloud SQL (timecare-db)。 |
| **AICarePlan** | `refs_import_Excel/` 配下の既存システム。Express + React。AI でケアプラン案を生成し、ケアマネが選択・編集する。本フォークでは Excel 取込機能が追加されている。 |
| **AICarePlan アプリ (CPOS 上)** | 本作業の成果物。`apps/admin` の中の AI ケアプラン機能として実装。 |
| **organizationId** | 全レコードに付与するテナント分離キー。 |
| **MasterUser** | `packages/records/src/master-user.ts`。被保険者番号 10 桁または `tmp-*` を一次キーとする利用者マスタ。 |
| **StoredCarePlan** | `packages/records/src/care-plan-store.ts`。draft / approved / archived のライフサイクルを持つ構造化ケアプラン。 |
| **CarePlanBundle** | `@cpos/v4-csv` の中間表現 (Plan1/2/3/6/7 + utilizer + careManager)。V4 CSV 出力にも構造化ケアプラン保存にも使う。 |
| **ImportedCareplan / ImportedAssessmentBundle** | `@cpos/excel-import` の Excel パーサ出力型。第1〜5表 + モニタリング、フェイスシート + アセスメント等を構造化保持。 |
| **GeneratedPlan** | AICarePlan 編集 UI が直接扱うプラン形式 (Table1Data / NeedItem / Table3Data 等)。`@cpos/excel-import` の `plan-types.ts` に定義。 |

---

## 2. AICarePlan の概要

- **目的**: 居宅介護支援 / 小規模多機能型居宅介護のケアプラン案を AI で 3 案生成し、ケアマネが比較・編集・承認・出力する。
- **特徴**:
  - 利用者ごとの Drive フォルダから PDF/JSON/Docs/Sheets を吸い上げ、AI で 3 案を一括生成、ケアマネが比較選択
  - 第1表 (利用者意向・課題分析・援助方針) / 第2表 (ニーズ→長期/短期目標→援助内容) / 第3表 (週カレンダー)
  - 承認ワークフロー (draft → approved) / 共有 (メールで他のケアマネに付与) / Google Sheets 出力
  - 居宅 (kyotaku) / 小規模多機能 (shoki) のモード切替
  - 知識ベース (組織固有の方針・例文) を AI に渡す
  - **Excel 取込**: 既存ケアプラン (.xlsx) / アセスメント (.xlsx) を一括アップロード → label-anchor 駆動でパース → 利用者紐付け → Drive 配置 + JSON サイドカー生成 + ドラフト保存

詳細は `refs_import_Excel/README.md` 参照。

---

## 3. CPOS 開発ガイド (必読)

このセクションは AICarePlan 固有ではなく **CPOS 上で何かを実装するときに
必ず守るべき規約** をまとめたもの。新しいパッケージ / ルート / UI を作る
ときは必ず先に読む。

### 3.1 モノレポ構成

- パッケージマネージャ: **npm workspaces** (pnpm ではない)
- ワークスペースルート: `/home/user/cpos/package.json` の `workspaces` 配列
- パッケージは全て `packages/*` または `apps/*`
- TypeScript は **strict mode + ESM** (`"type": "module"`、`*.js` 拡張子で import)
- 全パッケージは `package.json` に `"type": "module"`、`"main": "dist/index.js"`、`"types": "dist/index.d.ts"`、`"scripts": { "build": "tsc" }` を持つ
- ビルド順は `npm run build` 一発で正しい順序が走る (ルート package.json で制御)

新規パッケージを追加する場合:

```bash
mkdir -p packages/<name>/src
# package.json, tsconfig.json を既存パッケージから流用
# ルート package.json の "build" スクリプトに build:<name> を追加
npm install
```

### 3.2 コーディング規約

- **TypeScript strict** (any 禁止、null/undefined 区別)
- 関数の **戻り値型は明示**
- インポートは **拡張子 `.js` を必ず付ける** (ESM 要件):
  ```typescript
  import { foo } from './bar.js';  // OK
  ```
- ロケール: 日本語コメント OK、識別子は英語
- フォーマット: 既存ファイルに準拠 (Prettier 設定なし)
- **コメント**: WHY を書く。WHAT (コードを見れば分かること) は書かない
- **テスト**: Vitest。`*.test.ts` 形式。ルート `vitest.config.ts` で集約
- リント・型チェック: `npm run -w @cpos/<pkg> build` でエラーなしを確認
- **絵文字を使わない** (ユーザーが明示的に要望した場合のみ)

### 3.3 認証・権限・組織コンテキスト

#### 認証フロー

1. CPOS は **Google OAuth 2.0** (offline + prompt=consent で refresh_token を取得)
2. セッションは `cpos_user_sessions` (Firestore) または Memory に保存
3. リクエストごとに `apps/admin/src/server/middleware/sessionLoader` がセッション読み込み + アクセストークン自動更新
4. ルートハンドラは `req.authSession` (型: `AuthSession from '@cpos/types'`) を見る

```typescript
import type { AuthSession } from '@cpos/types';
function requireRole(req: Request, res: Response, allowed: string[]): AuthSession | null {
  const s = (req as unknown as { authSession?: AuthSession | null }).authSession ?? null;
  if (!s?.userId) { res.status(401).json({ error: '認証が必要です' }); return null; }
  if (!allowed.includes(s.role)) {
    res.status(403).json({ error: `${allowed.join(' / ')} 権限が必要です` });
    return null;
  }
  return s;
}
```

#### ロール

- `admin` / `manager` / `staff` / `viewer` (CPOS 標準)
- `nurse` / `physical_therapist` / `occupational_therapist` / `speech_therapist` (臨床ロール — 操作権限は staff 同等)

ケアマネ業務 (AICarePlan の主用途) は当面 `manager` または `staff` を許可する。
ケアマネ専用ロール (`care_manager`) が必要になれば `packages/types/src/user.ts` の
`UserRole` Union を拡張し、`packages/app-runtime/src/auth.ts` の `ROLE_LEVELS`
テーブルにレベルを追加する。

#### 組織コンテキスト

- 全リクエストに `req.context: RequestContext` がセットされる (`middleware/testContext.ts` 経由)
- `req.context.organizationId` は env `ORGANIZATION_ID` (prod) / `TEST_ORGANIZATION_ID` (test) から
- **全エンティティ** が `organizationId: string` を持ち、Repository は **必ず** `where('organizationId', '==', orgId)` で絞り込む

### 3.4 Repository パターン (Memory / Firestore)

新エンティティを追加する手順:

1. **型定義**: `packages/<domain>/src/<entity>.ts` に `<Entity>` インタフェースと `<Entity>Repository` インタフェースを export (`list`, `findById`, `upsert`, `delete` の 4 メソッドが基本)
2. **Memory 実装**: `apps/admin/src/server/<domain>/repository.ts` に `Memory<Entity>Repository` クラス
3. **Firestore 実装**: 同ファイルに `createFirestore<Entity>Repository(opts): Promise<<Entity>Repository>` 関数。コレクション名は `cpos_<entity>` (snake_case)
4. **セットアップ**: `apps/admin/src/server/<domain>/setup.ts` に `selectXxxStoreMode()` と `setupXxxRepository(mode)` を実装
5. **ブートストラップ**: `apps/admin/src/server/index.ts` で `await setupXxxRepository(...)` を呼んで `setXxxRepository(repo)` で注入

Firestore 実装のテンプレート (本コミットで追加した `apps/admin/src/server/care-plans/repository.ts` を参考にする)。

**重要**: `ignoreUndefinedProperties: true` を必ず付ける。

### 3.5 Express ルートの規約

新規ルートを追加する手順 (`apps/admin/src/server/routes/<entity>.ts`):

```typescript
import { Router, type Request, type Response } from 'express';
import type { AuthSession } from '@cpos/types';
import { audit } from '../audit/setup.js';

let repo: <Entity>Repository | null = null;
export function set<Entity>Repository(r: <Entity>Repository | null) { repo = r; }

export const xxxRouter = Router();

function requireRole(req, res, allowed: string[]): AuthSession | null { /* 上述 */ }
function ensureRepo(res: Response): boolean {
  if (!repo) { res.status(503).json({ error: 'xxx repository not configured' }); return false; }
  return true;
}

xxxRouter.get('/', async (req, res) => {
  const session = requireRole(req, res, ['admin', 'manager', 'staff']);
  if (!session) return;
  if (!ensureRepo(res)) return;
  const orgId = req.context?.organizationId ?? 'default';
  const list = await repo!.list({ organizationId: orgId });
  res.json(list);
});
```

`apps/admin/src/server/index.ts` でマウント:

```typescript
import { xxxRouter, setXxxRepository } from './routes/xxx.js';
setXxxRepository(xxxRepo);
app.use('/api/xxx', ...prodGuards, ...sessionLimiter, xxxRouter);
```

### 3.6 React (apps/admin/src/client) の規約

- **React 19** + Vite 7
- ルーティング: `react-router-dom` v7
- スタイル: **インラインスタイル** (`React.CSSProperties`) のみ使用 (Tailwind/CSS Modules 不可)
- API クライアント: `apps/admin/src/client/api/client.ts` の `apiRaw`
- ナビゲーション: `App.tsx` の `<L to="/xxx">表示名</L>`

ページ追加例: 本コミットで追加した `CarePlanImportPage.tsx` を参考にする。

### 3.7 監査ログ

`audit({ ... })` を **書き込み系操作のたびに必ず呼ぶ**。

```typescript
import { audit } from '../audit/setup.js';
audit({
  organizationId: orgId,
  eventType: 'master.import.users',
  actor: { kind: 'user', id: session.userId, name: session.email, ip: req.ip ?? null },
  target: { type: 'care-plan', id: saved.id, name: saved.label },
  status: 'ok',
  data: { action: 'create' }
});
```

### 3.8 AI プロバイダの呼び出し

CPOS は `@cpos/ai` の `GeminiProvider` を提供。Express ルート内では遅延 import + ファクトリ関数パターン:

```typescript
async function buildAi() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const mod = (await import('@cpos/ai')) as {
      GeminiProvider?: new (cfg: { apiKey: string; model?: string }) => {
        generateText(p: string): Promise<{ text: string }>;
        analyzeDocument(b: Buffer, m: string, p: string): Promise<{ text: string }>;
      };
    };
    if (!mod.GeminiProvider) return null;
    const inst = new mod.GeminiProvider({
      apiKey,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    });
    return {
      generateText: (p: string) => inst.generateText(p),
      analyzeDocument: (b: Buffer, m: string, p: string) => inst.analyzeDocument(b, m, p)
    };
  } catch { return null; }
}
```

#### `@cpos/records` 既存ヘルパ (再利用必須)

- `extractCarePlanFromText(text, ai)` — 任意テキストから `ExtractedCarePlan` を抽出
- `extractCarePlanFromPdf(buf, ai)` — PDF から同上
- `buildBundleFromExtraction(ex, defaults)` — `ExtractedCarePlan` → `CarePlanBundle` 昇格
- `generateCarePlanProposals({ ai, utilizer, sources, numProposals, businessMode, knowledgeBase })` — 複数案を一括生成

### 3.9 Google Drive / Sheets / Docs アダプタ

- `@cpos/io` の `GoogleDriveStorage`, `GoogleSheetsStorage`, `GoogleDocsStorage`
- 全て **OAuth アクセストークンを引数に取る**
- **共有ドライブ対応済み**
- 主要メソッド: `listFiles` / `listFolders` / `readFile` / `readFileAsBuffer` / `writeFile` / `findSubFolder` / `createFolder` / `renameFile`

### 3.10 ビルド・テスト・デプロイ

```bash
# 単一パッケージのビルド
npm run -w @cpos/<name> build

# 全テスト実行
npx vitest run

# ローカル起動 (admin)
npm run -w @cpos/admin dev

# Cloud Run デプロイ
npm run deploy:service
```

`Dockerfile` はマルチステージ。ルートの `Dockerfile` を使う (npm workspaces のため)。
Cloud Run は単一サービス (`cpos-admin`) に同居。

---

## 4. CPOS 既存共通基盤の棚卸し

本コミットで Excel 取込基盤が完成した。以下チェック表:

| やりたいこと | CPOS 既存 | 場所 |
|---|---|---|
| Google OAuth ログイン | ✅ あり | `apps/admin/src/server/auth/config.ts` |
| セッション管理 (refresh) | ✅ あり | `packages/app-runtime/src/auth/session-middleware.ts` |
| 監査ログ | ✅ あり | `apps/admin/src/server/audit/setup.ts` |
| ロール/権限チェック | ✅ あり | `packages/app-runtime/src/auth.ts` |
| 利用者マスタ | ✅ あり | `@cpos/records` (`MasterUser`) |
| 事業所紐付け | ✅ あり | `UserFacilityAssignment` |
| Google Drive / Sheets / Docs | ✅ あり | `@cpos/io` |
| AI (Gemini) | ✅ あり | `@cpos/ai` (`GeminiProvider`) |
| ケアプランデータ連携 V4 CSV | ✅ あり | `@cpos/v4-csv` (CarePlanBundle, generateAllCsvs, parseCsv 等) |
| AutoFiler (PDF 自動整理) | ✅ あり | `@cpos/filing` |
| マスタ同期 (フォルダ / CSV) | ✅ あり | `apps/admin/src/server/routes/master-users.ts` |
| アラート | ✅ あり | `@cpos/records` (`Alert`, `AlertRepository`) |
| Webhook | ✅ あり | `@cpos/app-runtime` (`Webhook`, `dispatchWebhookEvent`) |
| ケアプラン抽出 (PDF/JSON → ExtractedCarePlan) | ✅ あり | `@cpos/records` (`extractCarePlanFromText`, `extractCarePlanFromPdf`) |
| ケアプラン生成 (複数案を AI で) | ✅ あり | `@cpos/records` (`generateCarePlanProposals`) |
| 構造化ケアプラン保存 (draft/approved/共有) | ✅ あり | `@cpos/records` (`StoredCarePlan`) + `apps/admin/src/server/care-plans/*` |
| ケアプラン CRUD + 承認 + 共有 API | ✅ あり | `apps/admin/src/server/routes/care-plans.ts` |
| ケアプラン V4 CSV 出力 | ✅ あり | `POST /api/master-users/:id/careplan/convert` |
| ケアプラン V4 CSV 帳票表示 | ✅ あり | `UserDetailPage` の `CarePlanForm` |
| **Excel パーサ (ケアプラン / アセスメント)** | ✅ **本コミットで追加** | `@cpos/excel-import` (`parseCareplanWorkbook`, `parseAssessmentWorkbook`) |
| **Excel 取込 API** | ✅ **本コミットで追加** | `apps/admin/src/server/routes/care-plan-import.ts` (`/api/care-plan-import/preview` + `/commit`) |
| **Excel 取込 UI** | ✅ **本コミットで追加** | `apps/admin/src/client/pages/CarePlanImportPage.tsx` |
| Cloud Storage (GCS) | ❌ 未実装 | AICarePlan は不要 (Drive/Sheets で完結) |
| Google Sheets テンプレート出力 | ⚠️ 部分実装 | 既存 `GoogleSheetsStorage` のみ。Phase 8 で出力テンプレ実装要 |


## 6. 移植戦略

### 6.1 採用する戦略: 「AICarePlan は CPOS の `apps/admin` に同居する 1 機能群」

- AICarePlan の `server/` と `client/` は廃止し、機能を CPOS の `apps/admin` に統合
- 認証・セッション・監査・OAuth・利用者マスタは **CPOS の仕組みを使い回す**
- データストアは **Firestore に揃える**
- AI は CPOS の `@cpos/ai` (GeminiProvider) を使用
- Sheets 出力は互換性のため残す

### 6.2 採用しない戦略

| 戦略 | 不採用理由 |
|---|---|
| 設定を Sheets に保存 | CPOS は Firestore 一元管理 |
| 独自 OAuth + express-session | CPOS の OAuth セッションを使い回す |
| `passport` / `csurf` の持ち込み | CPOS は使っていない |
| 別 nginx で dist/client を serve | CPOS は単一 Express プロセス |

---

## 7. マッピング早見表

### 7.1 AICarePlan エンティティ → CPOS

| AICarePlan | CPOS の対応物 | 戦略 |
|---|---|---|
| Settings sheet の `allowlist` タブ | `cpos_users` (CPOS の OAuth ユーザー) | `RepositoryUserResolver` の provisioning rules |
| `prompts` タブ | 新規 `cpos_care_plan_prompts` または `system-settings` の一部 | Phase 5 |
| `facilities` タブ | 既存 `FacilityConfig` | 完全に既存で代替 |
| `knowledge-files` タブ | 新規 `cpos_care_plan_knowledge` または `system-settings` | Phase 5 |
| `drafts` シート | `cpos_care_plans` (StoredCarePlan, status='draft') | **本コミットで Excel 取込時に保存済み** |
| `history` シート | 監査ログ + `StoredCarePlan.exportedAt` | 既存基盤で吸収 |
| 出力 Sheets | Drive 上の Sheets として残す | 互換性のため |
| `UserInfo` (Drive フォルダ単位) | `MasterUser` (insuredNumber 一次キー) | フォルダ ID は `MasterUser.extras['利用者フォルダID']` で紐付け |
| `GeneratedPlan.table1/2/3` | `CarePlanBundle.plan1/2/3` (`@cpos/v4-csv`) | フィールド構造は近いがプロパティ名要対応 (Section 9.2 参照) |
| `GeneratedPlan.table4/5/6` | `StoredCarePlan.extras['table4/5/6']` | V4 CSV 仕様外なので extras |
| `GeneratedPlan.approved` / `approvedAt` | `StoredCarePlan.status = 'approved'` / `approvedAt` | 既存基盤 |
| Plan 共有 (sharedWith) | `StoredCarePlan.sharedWith: string[]` | 既存基盤 |
| Plan 一覧 / 一括承認 / 削除 | `GET/POST/PUT/DELETE /api/care-plans/*` | 既存基盤 |
| **Excel 取込** | **`@cpos/excel-import` + `POST /api/care-plan-import/*`** | **本コミットで実装** |
| ビューワー (`PlanEdit.tsx` + Table1/2/3 View) | `apps/admin/src/client/pages/UserDetailPage.tsx` の `CarePlanForm` を拡張 | Phase 7 で機能追加 (タブ化・編集モード・複数案比較) |

### 7.2 AICarePlan API → CPOS API

| AICarePlan | CPOS | 備考 |
|---|---|---|
| `GET /api/users` | `GET /api/master-users` | 完全置換 |
| `GET /api/users/:folderId/careplan-latest` | `GET /api/master-users/:insuredNumber/careplan/view` | フォルダ ID ではなく insuredNumber 経由 |
| `GET /api/sources/users/:folderId/sources` | `GET /api/master-users/:insuredNumber/care-plans?all=true` | 完全置換 |
| `POST /api/sources/fetch` | `GET /api/master-users/:insuredNumber/care-plans/preview` | プレビュー API がある |
| `POST /api/analyze` | 新規 `POST /api/care-plans/generate` | **Phase 4** で実装 |
| `POST /api/export` | 新規 `POST /api/care-plans/:id/export-sheet` | **Phase 8** |
| `POST /api/plans/save` | `POST /api/care-plans` | 既存 |
| `GET /api/plans/my` | `GET /api/care-plans?createdBy=me` | 要拡張 |
| `GET /api/plans/list/:clientFolderId` | `GET /api/care-plans?insuredNumber=...` | 既存 |
| `GET /api/plans/load/:planId` | `GET /api/care-plans/:id` | 既存 |
| `PUT /api/plans/share/:planId` | `PUT /api/care-plans/:id/share` | 既存 |
| `DELETE /api/plans/:planId` | `DELETE /api/care-plans/:id` | 既存 |
| `POST /api/plans/extract-existing` | `POST /api/master-users/:insuredNumber/careplan/convert` | 既存 |
| `GET /api/settings/general` | 既存 `GET /api/system-settings` | 完全置換 |
| `GET /api/settings/prompts` | 新規 `GET /api/care-plan-settings/prompts` | Phase 5 |
| `GET /api/settings/allowlist` | 既存 `cpos_users` 管理 | 完全置換 |
| `GET /api/settings/facilities` | 既存 `GET /api/facilities` | 完全置換 |
| `GET /api/settings/knowledge-files` | 新規 `GET /api/care-plan-settings/knowledge` | Phase 5 |
| **`POST /api/import/preview`** | **`POST /api/care-plan-import/preview`** | **本コミットで実装** |
| **`POST /api/import/commit`** | **`POST /api/care-plan-import/commit`** | **本コミットで実装** |
| `GET /api/manual` | `apps/admin/src/client/pages/HelpPage.tsx` (新規) | UI に直接埋め込み |

### 7.3 AICarePlan UI → CPOS UI

| AICarePlan | CPOS | 戦略 |
|---|---|---|
| `Home.tsx` | 新規 `apps/admin/src/client/pages/CarePlanHomePage.tsx` | Phase 6 |
| `UserSelect.tsx` | 既存 `MasterUsersPage` から「ケアプラン作成」遷移 | 利用者選択は MasterUsersPage に集約 |
| `SourceSelect.tsx` | 新規 `CarePlanCreatePage` の Step 1 | 既存 `UserDetailPage` のファイル一覧を活用 |
| `PlanEdit.tsx` + `Table1View.tsx` 等 | 既存 `UserDetailPage` の `CarePlanForm` を拡張 | Phase 7 |
| `Settings.tsx` | 既存 `SystemSettingsPage` に「ケアプラン」タブ追加 | Phase 5 |
| `Help.tsx` | 新規 `HelpPage` | Phase 9 |
| **`ImportPage.tsx`** | **`apps/admin/src/client/pages/CarePlanImportPage.tsx`** | **本コミットで実装** |

---

## 8. 改修フェーズ

### Phase 0 — 準備

```bash
git fetch origin && git checkout claude/platform-independent-deployment-zl7O5
git pull origin claude/platform-independent-deployment-zl7O5
# 本コミットで Excel 取込 (@cpos/excel-import + /api/care-plan-import/* +
# CarePlanImportPage) は実装済み。残作業は生成 / 編集 UI / Sheets 出力 / マニュアル。
```

### Phase 1 — 既存 CPOS 機能の動作確認 (必須)

以下が動くことを確認:

- `https://os.care-planning.co.jp/master-users` で利用者一覧が表示される
- `/user-detail?insuredNumber=...` で第1〜3表が表示される
- ファイルツリーから PDF を選び「V4 CSV へ変換」 → CSV 生成 + マスタ反映が成功
- `GET /api/care-plans` が空配列を返す
- **`/care-plan-import` で Excel 取込フローが通る** (本コミットで追加)

これらが動かないなら先にそれを直す。

### Phase 2 — AICarePlan 固有の型を追加

`packages/records/src/care-plan-types.ts` (新規) に `CarePlanBusinessMode` ('kyotaku' | 'shoki') 等を追加し、`packages/records/src/index.ts` から export。

### Phase 3 — ケアプラン用設定 (プロンプト・知識ベース) を SystemSettings に追加

`apps/admin/src/server/system-settings/types.ts` の `SystemSettings` に `carePlan?: { defaultMode?, aiModel?, numProposals?, generationPrompt?, modePrompts?, knowledgeBase? }` を追加し、UI 側 (`SystemSettingsPage`) に「ケアプラン」タブを追加。

### Phase 4 — `POST /api/care-plans/generate` エンドポイント実装

`apps/admin/src/server/routes/care-plans.ts` に追記:

1. `body.insuredNumber` から MasterUser を取得
2. `body.sourceFileIds` の Drive ファイルを `GoogleDriveStorage.readFile/readFileAsBuffer` で取得
3. PDF / JSON / Sheets / **取り込み済みの ImportedCareplan / ImportedAssessmentBundle JSON** をテキスト化
4. `generateCarePlanProposals()` を呼んで N 案生成
5. `proposalGroupId = randomId(16)` を共通で振り、各案を `StoredCarePlan` (status='draft') として upsert
6. 配列を返す

**注意**: Excel 取込で生成された取込解析結果 JSON (`{利用者フォルダ}/取込解析結果/*_careplan.json`) は AI 生成のソース情報として最適。これらを優先的に拾う実装にする。

### Phase 5 — フロントエンド (Step 1: ホーム + プラン一覧)

`apps/admin/src/client/pages/CarePlanHomePage.tsx`:
- 「最近のプラン (自分のドラフト + 承認済み)」 = `GET /api/care-plans?createdBy=me`
- 「共有されたプラン」 = `GET /api/care-plans?sharedWith=<my-email>`
- 「新規ケアプラン作成」ボタン → `/master-users` へ遷移
- **「Excel 取込」ボタン → `/care-plan-import` (既に実装済)**

### Phase 6 — (本コミットで完了)

Excel 取込 (`@cpos/excel-import` + `/api/care-plan-import/*` + `CarePlanImportPage`)
は実装済み。

### Phase 7 — ケアプラン編集 UI (PlanEdit 相当)

`apps/admin/src/client/pages/CarePlanEditPage.tsx` (新規):

- ルート: `/care-plans/:id/edit` または `/care-plans/new?insuredNumber=...&proposalGroupId=...`
- レイアウト: 上部にタブ (第1表 / 第2表 / 第3表 / 第4表 / 第5表 / 第6表)
- 左サイドバー: プラン切替 (proposalGroupId が同じプランを並べる) + 「複製」「承認」ボタン
- 各タブ:
  - **第1表** (`Table1Editor`): 利用者基本情報 + 計画作成日 + 課題分析 + 援助方針 (textarea)
  - **第2表** (`Table2Editor`): ニーズ → 長期目標 → 短期目標 → 援助内容のツリー編集 (rowSpan 結合表示、+/-/↑↓ ボタン)
  - **第3表** (`Table3Editor`): 週カレンダー (時間帯×曜日) + クリック → モーダルでサービス追加 + プリセット色 (通い=青 / 訪問=緑 / 泊まり=紫)
  - **第4-6表**: 取込元 ImportedCareplan の table4/table5 + monitoring を read-only 表示 (`StoredCarePlan.extras` に保存済み)
- 保存・承認・共有・Sheets 出力ボタン

参考: `refs_import_Excel/client/src/views/PlanEdit.tsx` (348 行) と `Table1/2/3View.tsx`。

スタイル: AICarePlan のダークブルー基調 (`#0f2942`, ニーズセル黄色 `#fef3c7`) を **インラインスタイルで再現**。CPOS 既存ヘッダーと調和を保つため、一部のみ既存 CPOS スタイル (`#1a73e8` 系)。

### Phase 8 — Google Sheets への出力 (`POST /api/care-plans/:id/export-sheet`)

`@cpos/io` の `GoogleSheetsStorage` を使う:

1. テンプレート Spreadsheet を 1 つ用意 (`SystemSettings.carePlan.exportTemplateSpreadsheetId`)
2. export 時はテンプレを Drive `files.copy` で複製 → 値を流し込む → 新 Spreadsheet ID を返す
3. `StoredCarePlan.exportedSpreadsheetId` / `exportedAt` を更新
4. 監査ログ + Webhook 配信

### Phase 9 — マニュアル / ヘルプページ

`apps/admin/src/client/pages/HelpPage.tsx`:
- AICarePlan の `client/views/Help.tsx` を移植
- Markdown を JSX 直書き or fetch

### Phase 10 — 監査ログ + Webhook 統合

各操作 (generate / save / approve / share / export / **import**) で:

```typescript
audit({ organizationId, eventType: 'care-plan.generate', actor, target, status, data });
await dispatchWebhookEvent(
  webhookRepo,
  organizationId,
  'care-plan.generated',  // care-plan.approved, care-plan.shared, care-plan.imported 等
  plan.id,
  plan
);
```

Excel 取込 (本コミット) では `audit({ ..., data: { action: 'excel-import', kind, fileName, draftId } })` を呼んでいる。Webhook 配信は未実装なので Phase 10 で追加。

### Phase 11 — 既存 refs_import_Excel/ の取り扱い

移植が一通り完了し、本番運用が安定したら:

1. `git rm -r refs_import_Excel` で削除
2. ただし、本ドキュメント (`refs_import_Excel/INTEGRATION.md`) は `docs/aicareplan-archive/` に移動

---

## 9. 危険ポイント

### 9.1 利用者の二重管理を絶対に避ける

AICarePlan は Drive フォルダ ID で利用者を識別していたが、CPOS では **`MasterUser`
(insuredNumber 一次キー)** に統一。新規 `cpos_aicareplan_users` 等を作らない。
Drive フォルダ ID は `MasterUser.extras['利用者フォルダID']` に格納済み。

### 9.2 CarePlanBundle のフィールド名揺れ

AICarePlan の `Table1Data.userWishes` ↔ CPOS `Plan1.intentionAnalysis` のように
**プロパティ名が揺れる**。Phase 7 の編集 UI 実装時に **必ず CPOS 型に合わせる**。

| AICarePlan (`@cpos/excel-import` の plan-types.ts) | CPOS V4 (`@cpos/v4-csv` の Plan1/2/3) |
|---|---|
| Table1.userWishes / familyWishes / assessmentResult | Plan1.intentionAnalysis (3 つを統合する) |
| Table1.committeeOpinion | Plan1.committeeOpinion |
| Table1.totalPolicy | Plan1.overallPolicy |
| Table1.livingSupportReason | Plan1.housekeepingReason / housekeepingReasonOther |
| Table2.NeedItem.need | Plan2.Problem.problemDescription |
| Table2.GoalItem.longGoal | Plan2.Goal.longTermGoal |
| Table2.GoalItem.longPeriod | Plan2.Goal.longTermPeriod |
| Table2.ServiceItem.content | Plan2.SupportContent.serviceContent |
| Table2.ServiceItem.insurance ('○'/'') | Plan2.SupportContent.insuranceTarget ('対象'/'対象外') |
| Table3.schedule | Plan3.weeklyServices |
| Table3.dailyActivities | Plan3.dailyActivities |

### 9.3 Excel パーサのテンプレート依存性

`@cpos/excel-import` の parser は **特定の日本語ケアプラン Excel テンプレート前提**
(label-anchor 駆動で揺れに強いが、ラベル文言が変わると壊れる可能性あり)。

新しいテンプレートを追加する場合:
- まず `parse-careplan.ts` / `parse-assessment.ts` のラベル文字列を grep で確認
- 必要なら正規表現を OR で広げる (例: `/ニーズ|生活全般の解決すべき課題/`)
- **絶対にハードコードしたセル番地を入れない** (例: `A5`, `B10`)

### 9.4 ImportedCareplan の table4 / table5 / monitoring は CarePlanBundle に乗らない

V4 CSV 仕様外なので、Phase 7 の UI 実装時は `StoredCarePlan.extras['importedCareplan']`
からアクセスする。本コミットの commit ハンドラで既に extras に保存している。

### 9.5 同じ `proposalGroupId` を共有して複数案を扱う

3 案生成時は **個別に 3 件の StoredCarePlan を保存**。`generationMeta.proposalGroupId`
を共通にする。UI 側はこれをキーに「同じバッチで生成された複数案」として並べる。

### 9.6 organizationId を絞る

全クエリで `organizationId` を必ず絞り込む。新しいクエリパターンを足すときは
絶対に忘れない。

### 9.7 Sheets を「DB」として使わない

AICarePlan は設定・プロンプト・許可ユーザー・ドラフトを全て Sheets に保存して
いた。CPOS では **全て Firestore に統一**。Sheets は出力フォーマットとしてのみ使う。

### 9.8 Excel 取込の文字コード

`exceljs` は内部で UTF-8 を使う。multer の `originalname` は latin1 で来るので
**`Buffer.from(name, 'latin1').toString('utf8')` で再解釈** する (本コミットで対応済み)。

### 9.9 メモリキャッシュは Cloud Run 単一インスタンス前提

`fileCache: Map<fileId, CachedFile>` は 30 分 TTL のインメモリキャッシュ。
Cloud Run の minInstances=1 / maxInstances=1 を維持する場合のみ動作。
スケール時には Drive 一時保管 or Firestore + Cloud Storage に切り替え必要。

### 9.10 Puppeteer / PDF 生成は不要

AICarePlan は PDF 生成しない (Sheets にのみ書き出す)。Puppeteer 関連のコードを
持ち込まない。

---

## 10. 動作確認の到達基準

以下が全て確認できれば移植完了:

1. ✅ `npm run -w @cpos/admin build` が成功する
2. ✅ `npx vitest run` の全テストがパスする
3. ✅ `https://os.care-planning.co.jp/care-plans` でホームが表示できる (Phase 5)
4. ✅ **`https://os.care-planning.co.jp/care-plan-import` で Excel 取込フローが通る (本コミット)**
   - 既存ケアプラン Excel をアップロード → プレビュー (氏名/ニーズ数/シート名表示)
   - 既存マスタ利用者と紐付ける or 新規作成
   - コミット後、利用者の Drive フォルダ配下の `原本/` と `取込解析結果/` にファイルが配置される
   - StoredCarePlan が `cpos_care_plans` に保存される (status='draft')
   - MasterUser の空欄 (要介護度・認定有効期間 等) が補完される
5. ✅ `/master-users` で利用者を選び「ケアプラン作成」ボタン → ファイル選択 Step → 「生成」 → 3 案が作られる (Phase 4)
6. ✅ 1 案を編集ページで開く → 第1表 / 第2表 / 第3表 のタブで内容を編集できる (Phase 7)
7. ✅ 編集を保存 → 再読込で反映確認
8. ✅ 承認 (`POST /api/care-plans/:id/approve`) → status: approved
9. ✅ 共有 (`PUT /api/care-plans/:id/share`) → 別アカウントで `GET /api/care-plans?sharedWith=...` で見える
10. ✅ Sheets 出力 (`POST /api/care-plans/:id/export-sheet`) → Spreadsheet が Drive に作成される (Phase 8)

---

## 11. 変更履歴

- **2026-05-02 v1** — Phase 0〜11 の初版を策定。CPOS 共通基盤として `StoredCarePlan` (`packages/records/src/care-plan-store.ts`) + `CarePlanRepository` (Memory + Firestore) + `/api/care-plans/*` CRUD + 共有 + 承認 API + `generateCarePlanProposals` ヘルパを追加。AICarePlan の中核機能 (V4 CSV 出力 / 抽出 / 帳票表示) は既に CPOS 側に実装済みであることを確認。

- **2026-05-02 v2 (本リビジョン)** — Excel 取込機能を CPOS 共通基盤として取込:
  - 新規パッケージ `@cpos/excel-import` (パーサ本体 502+679+724+147 = 2,052 行 + 型定義)
  - 新規ルート `apps/admin/src/server/routes/care-plan-import.ts` (preview / commit / cleanup)
  - 新規 UI `apps/admin/src/client/pages/CarePlanImportPage.tsx`
  - 依存追加: `exceljs ^4.4.0` / `multer ^2.1.1` / `@types/multer ^2.1.0`
  - **AICarePlan のフォルダ ID ベース利用者識別 → CPOS の MasterUser (insuredNumber 一次キー) 識別** に変更
  - Excel 取込フローの完了 → MasterUser 補完 + StoredCarePlan ドラフト化 + Drive 配置 (`原本/` + `取込解析結果/`)
  - 監査ログ統合 (`event: 'master.import.users', action: 'excel-import'`)
  - 残作業: Phase 4 (生成 API) / Phase 5 (ホーム UI) / Phase 7 (編集 UI) / Phase 8 (Sheets 出力) / Phase 9 (マニュアル) / Phase 10 (Webhook 統合)
