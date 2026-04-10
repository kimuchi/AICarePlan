#!/usr/bin/env node

/**
 * ケアプラン作成支援システム — Cloud Run デプロイスクリプト
 *
 * 使用方法:
 *   npm run deploy:cloudrun
 *   npm run deploy:cloudrun -- --project my-project --region asia-northeast1
 *   npm run deploy:cloudrun -- --build-only
 *   npm run deploy:cloudrun -- --deploy-only
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── 色付きログ ─────────────────────────────────────────────
const c = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function log(msg) { console.log(msg); }
function info(msg) { console.log(c.cyan(`>> ${msg}`)); }
function success(msg) { console.log(c.green(`✓ ${msg}`)); }
function warn(msg) { console.log(c.yellow(`⚠ ${msg}`)); }
function error(msg) { console.error(c.red(`✗ ${msg}`)); }

// ── .env 読み込み ──────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) {
    warn('.env ファイルが見つかりません。プロジェクトルートに .env を作成してください。');
    warn('  cp .env.example .env  でテンプレートをコピーし、値を入力してください。');
    return;
  }

  info('.env ファイルを読み込み中...');
  let count = 0;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (value) {
      process.env[key] = value;
      count++;
    }
  }
  success(`.env から ${count} 件の設定を読み込みました`);
}

// ── コマンド実行 ───────────────────────────────────────────
function run(cmd, opts = {}) {
  log(c.dim(`  $ ${cmd}`));
  try {
    const result = execSync(cmd, {
      cwd: ROOT,
      stdio: opts.capture ? 'pipe' : 'inherit',
      encoding: 'utf-8',
      timeout: opts.timeout || 600_000,
      ...opts,
    });
    return opts.capture ? (result || '').trim() : '';
  } catch (e) {
    if (opts.ignoreError) return '';
    throw e;
  }
}

// ── 引数パース ─────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    project: '',
    region: 'asia-northeast1',
    serviceName: 'careplan-app',
    repoName: 'careplan-repo',
    buildOnly: false,
    deployOnly: false,
    memory: '512Mi',
    cpu: '1',
    minInstances: '0',
    maxInstances: '5',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--project': case '-p':
        opts.project = args[++i]; break;
      case '--region': case '-r':
        opts.region = args[++i]; break;
      case '--service':
        opts.serviceName = args[++i]; break;
      case '--build-only':
        opts.buildOnly = true; break;
      case '--deploy-only':
        opts.deployOnly = true; break;
      case '--memory':
        opts.memory = args[++i]; break;
      case '--max-instances':
        opts.maxInstances = args[++i]; break;
      case '--help': case '-h':
        printHelp(); process.exit(0);
    }
  }
  return opts;
}

function printHelp() {
  log(`
${c.bold('ケアプラン作成支援システム — Cloud Run デプロイ')}

${c.bold('使用方法:')}
  npm run deploy:cloudrun
  npm run deploy:cloudrun -- --project my-project --region asia-northeast1

${c.bold('オプション:')}
  --project, -p <id>      GCPプロジェクトID（省略時は gcloud のデフォルト）
  --region, -r <region>   リージョン（デフォルト: asia-northeast1）
  --service <name>        Cloud Runサービス名（デフォルト: careplan-app）
  --build-only            ビルドのみ（デプロイしない）
  --deploy-only           デプロイのみ（ビルドしない。事前ビルド済みイメージを使用）
  --memory <size>         メモリ（デフォルト: 512Mi）
  --max-instances <n>     最大インスタンス数（デフォルト: 5）
  --help, -h              ヘルプを表示

${c.bold('設定:')}
  プロジェクトルートの .env ファイルから設定を読み込みます。
  .env.example をコピーして .env を作成し、値を入力してください。

  必須: OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, GEMINI_API_KEY
  任意: SESSION_SECRET（未設定時は自動生成）, SETTINGS_SPREADSHEET_ID,
        USER_ROOT_FOLDER_ID, PRIVATE_FOLDER_NAME,
        GEMINI_MODEL_GENERATE, GEMINI_MODEL_ANALYZE
`);
}

// ── メイン処理 ─────────────────────────────────────────────
async function main() {
  const opts = parseArgs();
  loadEnv();

  log('');
  log(c.bold('═══════════════════════════════════════════════════'));
  log(c.bold('  ケアプラン作成支援システム — Cloud Run デプロイ'));
  log(c.bold('═══════════════════════════════════════════════════'));
  log('');

  // ── 1. gcloud確認 ──
  info('gcloud CLI を確認中...');
  try {
    run('gcloud --version', { capture: true });
  } catch {
    error('gcloud CLI が見つかりません。');
    error('https://cloud.google.com/sdk/docs/install からインストールしてください。');
    process.exit(1);
  }
  success('gcloud CLI OK');

  // ── 2. プロジェクトID取得（優先順位: --project > .env GCP_PROJECT_ID > gcloud default） ──
  if (!opts.project) {
    if (process.env.GCP_PROJECT_ID) {
      opts.project = process.env.GCP_PROJECT_ID;
      info(`.env の GCP_PROJECT_ID を使用: ${opts.project}`);
    } else {
      info('GCPプロジェクトIDを取得中...');
      opts.project = run('gcloud config get-value project 2>nul', { capture: true })
        || run('gcloud config get-value project 2>/dev/null', { capture: true, ignoreError: true });
      if (!opts.project) {
        error('プロジェクトIDが見つかりません。');
        error('.env に GCP_PROJECT_ID を設定するか、--project で指定してください。');
        process.exit(1);
      }
      warn(`gcloud のデフォルトプロジェクトを使用: ${opts.project}`);
      warn('意図したプロジェクトか確認してください。.env に GCP_PROJECT_ID を設定すると確実です。');
    }
  }

  const imageName = `${opts.region}-docker.pkg.dev/${opts.project}/${opts.repoName}/${opts.serviceName}`;

  log('');
  log(`  ${c.bold('Project')}: ${opts.project}`);
  log(`  ${c.bold('Region')}:  ${opts.region}`);
  log(`  ${c.bold('Service')}: ${opts.serviceName}`);
  log(`  ${c.bold('Image')}:   ${imageName}`);
  log('');

  // ── 3. 必須環境変数チェック ──
  info('環境変数を確認中...');
  const required = ['OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET', 'GEMINI_API_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    error(`以下の値が .env に設定されていません: ${missing.join(', ')}`);
    error('.env ファイルを開いて値を入力してください。');
    process.exit(1);
  }
  success(`必須環境変数 OK (${required.join(', ')})`);

  // SESSION_SECRET 自動生成
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = randomBytes(32).toString('hex');
    warn('SESSION_SECRET を自動生成しました（.env に保存することを推奨）');
  }

  // ── 4. API有効化 ──
  info('必要なAPIを有効化中...');
  const apis = [
    'run.googleapis.com',
    'cloudbuild.googleapis.com',
    'artifactregistry.googleapis.com',
    'drive.googleapis.com',
    'sheets.googleapis.com',
  ];
  run(`gcloud services enable ${apis.join(' ')} --project=${opts.project} --quiet`);
  success('API有効化 OK');

  // ── 5. Artifact Registry リポジトリ作成 ──
  info('Artifact Registry リポジトリを確認中...');
  const repoList = run(
    `gcloud artifacts repositories list --location=${opts.region} --project=${opts.project} --format="value(name)"`,
    { capture: true, ignoreError: true }
  );
  if (!repoList.includes(opts.repoName)) {
    info('リポジトリを作成中...');
    run(`gcloud artifacts repositories create ${opts.repoName} --repository-format=docker --location=${opts.region} --project=${opts.project} --description="Care Plan App"`);
    success('リポジトリ作成 OK');
  } else {
    success('リポジトリ 既存OK');
  }

  // ── 6. ビルド ──
  if (!opts.deployOnly) {
    info('コンテナイメージをビルド中（数分かかります）...');
    run(`gcloud builds submit --tag ${imageName} --project=${opts.project} --timeout=600s`);
    success('ビルド完了');
  }

  if (opts.buildOnly) {
    log('');
    success('ビルドのみ完了。--deploy-only で後からデプロイできます。');
    process.exit(0);
  }

  // ── 7. デプロイ ──
  info('Cloud Run にデプロイ中...');

  const envVars = [
    `OAUTH_CLIENT_ID=${process.env.OAUTH_CLIENT_ID}`,
    `OAUTH_CLIENT_SECRET=${process.env.OAUTH_CLIENT_SECRET}`,
    `SESSION_SECRET=${process.env.SESSION_SECRET}`,
    `GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`,
    `SETTINGS_SPREADSHEET_ID=${process.env.SETTINGS_SPREADSHEET_ID || ''}`,
    `USER_ROOT_FOLDER_ID=${process.env.USER_ROOT_FOLDER_ID || ''}`,
    `PRIVATE_FOLDER_NAME=${process.env.PRIVATE_FOLDER_NAME || ''}`,
    `GEMINI_MODEL_GENERATE=${process.env.GEMINI_MODEL_GENERATE || ''}`,
    `GEMINI_MODEL_ANALYZE=${process.env.GEMINI_MODEL_ANALYZE || ''}`,
    `NODE_ENV=production`,
  ].join(',');

  run([
    `gcloud run deploy ${opts.serviceName}`,
    `--image ${imageName}`,
    `--region ${opts.region}`,
    `--project=${opts.project}`,
    `--platform managed`,
    `--allow-unauthenticated`,
    `--port 8080`,
    `--memory ${opts.memory}`,
    `--cpu ${opts.cpu}`,
    `--min-instances ${opts.minInstances}`,
    `--max-instances ${opts.maxInstances}`,
    `--timeout 300`,
    `--set-env-vars "${envVars}"`,
  ].join(' '));
  success('デプロイ完了');

  // ── 8. URL取得 & BASE_URL設定 ──
  info('サービスURLを取得中...');
  const serviceUrl = run(
    `gcloud run services describe ${opts.serviceName} --region=${opts.region} --project=${opts.project} --format="value(status.url)"`,
    { capture: true }
  );

  // CUSTOM_DOMAIN が設定されていればそちらを BASE_URL にする
  const customDomain = process.env.CUSTOM_DOMAIN;
  const baseUrl = customDomain ? `https://${customDomain}` : serviceUrl;

  if (baseUrl) {
    info(`BASE_URL を設定中... (${baseUrl})`);
    run(`gcloud run services update ${opts.serviceName} --region=${opts.region} --project=${opts.project} --update-env-vars "BASE_URL=${baseUrl}"`);
    success(`BASE_URL = ${baseUrl}`);
  }

  // ── 完了 ──
  log('');
  log(c.bold('═══════════════════════════════════════════════════'));
  log(c.green(c.bold('  デプロイ完了!')));
  log(c.bold('═══════════════════════════════════════════════════'));
  log('');
  log(`  ${c.bold('Cloud Run URL')}: ${c.cyan(serviceUrl)}`);
  if (customDomain) {
    log(`  ${c.bold('カスタムドメイン')}: ${c.cyan(`https://${customDomain}`)}`);
  }
  log(`  ${c.bold('BASE_URL')}: ${c.cyan(baseUrl)}`);
  log('');
  log(c.yellow('  次のステップ:'));
  log('');
  log('  1. Google Cloud Console で OAuth クライアントに以下のリダイレクトURIを追加:');
  log(`     ${c.bold(`${baseUrl}/auth/google/callback`)}`);
  log('');
  log('  2. ブラウザでアクセスしてログイン:');
  log(`     ${c.bold(baseUrl)}`);
  log('');
}

main().catch(e => {
  error(e.message || String(e));
  process.exit(1);
});
