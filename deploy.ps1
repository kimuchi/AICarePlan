# ケアプラン作成支援システム Cloud Run デプロイスクリプト (Windows PowerShell版)
#
# 使用方法:
#   .\deploy.ps1 -ProjectId YOUR_PROJECT_ID [-Region asia-northeast1]
#
# 環境変数を事前に設定するか、.env ファイルから読み込んでください。

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId,

    [string]$Region = "asia-northeast1",

    [string]$ServiceName = "careplan-app",

    [string]$RepoName = "careplan-repo"
)

$ErrorActionPreference = "Stop"

$ImageName = "$Region-docker.pkg.dev/$ProjectId/$RepoName/$ServiceName"

Write-Host ""
Write-Host "=== ケアプラン作成支援システム デプロイ ===" -ForegroundColor Cyan
Write-Host "  Project: $ProjectId"
Write-Host "  Region:  $Region"
Write-Host "  Service: $ServiceName"
Write-Host ""

# .env ファイルから環境変数を読み込み
if (Test-Path ".env") {
    Write-Host ">> .env ファイルを読み込み中..." -ForegroundColor Yellow
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            Set-Item -Path "env:$key" -Value $value
        }
    }
}

# 必要な環境変数の確認
$requiredVars = @("OAUTH_CLIENT_ID", "OAUTH_CLIENT_SECRET", "GEMINI_API_KEY")
foreach ($var in $requiredVars) {
    $val = [Environment]::GetEnvironmentVariable($var)
    if ([string]::IsNullOrEmpty($val)) {
        Write-Host "  エラー: 環境変数 $var が設定されていません" -ForegroundColor Red
        Write-Host "  .env ファイルに設定するか、事前に設定してください" -ForegroundColor Red
        exit 1
    }
}

# 必要なAPIを有効化
Write-Host ">> APIの有効化..." -ForegroundColor Yellow
gcloud services enable `
    run.googleapis.com `
    cloudbuild.googleapis.com `
    artifactregistry.googleapis.com `
    drive.googleapis.com `
    sheets.googleapis.com `
    --project=$ProjectId `
    --quiet

# Artifact Registry リポジトリの作成（存在しない場合）
Write-Host ">> Artifact Registry リポジトリの確認..." -ForegroundColor Yellow
$repoExists = gcloud artifacts repositories list `
    --location=$Region `
    --project=$ProjectId `
    --format="value(name)" 2>$null | Where-Object { $_ -like "*$RepoName*" }

if (-not $repoExists) {
    Write-Host ">> Artifact Registry リポジトリを作成中..." -ForegroundColor Yellow
    gcloud artifacts repositories create $RepoName `
        --repository-format=docker `
        --location=$Region `
        --project=$ProjectId `
        --description="Care Plan App Docker images"
}

# コンテナイメージのビルドとプッシュ
Write-Host ">> コンテナイメージのビルド中..." -ForegroundColor Yellow
gcloud builds submit `
    --tag $ImageName `
    --project=$ProjectId `
    --timeout=600s

if ($LASTEXITCODE -ne 0) {
    Write-Host "  エラー: ビルドに失敗しました" -ForegroundColor Red
    exit 1
}

# SESSION_SECRET の自動生成（未設定の場合）
$sessionSecret = $env:SESSION_SECRET
if ([string]::IsNullOrEmpty($sessionSecret)) {
    $sessionSecret = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
    Write-Host "  SESSION_SECRET を自動生成しました" -ForegroundColor Gray
}

# 環境変数の組み立て
$envVars = @(
    "OAUTH_CLIENT_ID=$env:OAUTH_CLIENT_ID",
    "OAUTH_CLIENT_SECRET=$env:OAUTH_CLIENT_SECRET",
    "SESSION_SECRET=$sessionSecret",
    "GEMINI_API_KEY=$env:GEMINI_API_KEY",
    "SETTINGS_SPREADSHEET_ID=$env:SETTINGS_SPREADSHEET_ID",
    "USER_ROOT_FOLDER_ID=$env:USER_ROOT_FOLDER_ID",
    "USER_ROOT_FOLDER_ID_PRIVATE=$env:USER_ROOT_FOLDER_ID_PRIVATE",
    "NODE_ENV=production"
) -join ","

# Cloud Run にデプロイ
Write-Host ">> Cloud Run へデプロイ中..." -ForegroundColor Yellow
gcloud run deploy $ServiceName `
    --image $ImageName `
    --region $Region `
    --project=$ProjectId `
    --platform managed `
    --allow-unauthenticated `
    --port 8080 `
    --memory 512Mi `
    --cpu 1 `
    --min-instances 0 `
    --max-instances 5 `
    --timeout 300 `
    --set-env-vars $envVars

if ($LASTEXITCODE -ne 0) {
    Write-Host "  エラー: デプロイに失敗しました" -ForegroundColor Red
    exit 1
}

# デプロイ後のURL取得
$serviceUrl = gcloud run services describe $ServiceName `
    --region=$Region `
    --project=$ProjectId `
    --format="value(status.url)"

# BASE_URL を更新
Write-Host ">> BASE_URL を更新中..." -ForegroundColor Yellow
gcloud run services update $ServiceName `
    --region=$Region `
    --project=$ProjectId `
    --update-env-vars "BASE_URL=$serviceUrl"

Write-Host ""
Write-Host "=== デプロイ完了 ===" -ForegroundColor Green
Write-Host "  URL: $serviceUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "  次のステップ:" -ForegroundColor Yellow
Write-Host "  1. OAuth コールバックURLに以下を追加してください:"
Write-Host "     $serviceUrl/auth/google/callback" -ForegroundColor White
Write-Host ""
Write-Host "  2. ブラウザで以下にアクセスしてログイン:"
Write-Host "     $serviceUrl" -ForegroundColor White
Write-Host ""
