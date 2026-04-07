import { google, sheets_v4 } from 'googleapis';

/** Create Sheets client with user's access token */
function getSheetsClient(accessToken: string): sheets_v4.Sheets {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.sheets({ version: 'v4', auth });
}

/** Create Sheets client with API key or service account (for settings) */
function getSettingsSheetsClient(): sheets_v4.Sheets {
  // For settings operations that don't need user context,
  // we use the same user token from the request
  // This is a placeholder — actual calls pass accessToken
  const auth = new google.auth.OAuth2();
  return google.sheets({ version: 'v4', auth });
}

/** Read data from a sheet range (using API key or user token) */
export async function getSheetData(
  spreadsheetId: string,
  range: string,
  accessToken?: string
): Promise<any[][] | null> {
  const sheets = accessToken
    ? getSheetsClient(accessToken)
    : getSettingsSheetsClient();

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    return res.data.values || null;
  } catch {
    return null;
  }
}

/** Write data to a sheet range */
export async function setSheetData(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<void> {
  const sheets = getSheetsClient(accessToken);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

/** Append rows to a sheet */
export async function appendSheetData(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<void> {
  const sheets = getSheetsClient(accessToken);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

/** Execute a batchUpdate on a spreadsheet */
export async function batchUpdate(
  accessToken: string,
  spreadsheetId: string,
  requests: sheets_v4.Schema$Request[]
): Promise<void> {
  const sheets = getSheetsClient(accessToken);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}

/** Get spreadsheet metadata (sheet names, etc.) */
export async function getSpreadsheetMeta(
  accessToken: string,
  spreadsheetId: string
): Promise<sheets_v4.Schema$Spreadsheet> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data;
}

/** Create a new sheet tab in a spreadsheet */
export async function addSheet(
  accessToken: string,
  spreadsheetId: string,
  title: string
): Promise<number> {
  const sheets = getSheetsClient(accessToken);
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        addSheet: {
          properties: { title },
        },
      }],
    },
  });
  return res.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
}

// ── Settings Spreadsheet Initialization ──

const DEFAULT_PROMPTS = [
  {
    id: 'prompt_kyotaku_table1',
    title: '居宅介護支援 第1表プロンプト',
    body: `あなたは経験豊富な介護支援専門員です。以下の情報源から、居宅サービス計画書（第1表）を作成してください。

【利用者情報】
氏名: {利用者名}
要介護度: {要介護度}
生年月日: {生年月日}
住所: {住所}

【既存ケアプラン】
{既存ケアプラン}

【アセスメント情報】
{アセスメント情報}

【主治医意見書】
{主治医意見書}

【担当者会議録】
{担当者会議録}

【フェイスシート】
{フェイスシート}

【作成上の注意】
- 利用者の意向と家族の意向を明確に分けて記載すること
- 課題分析の結果は、アセスメント情報を根拠として簡潔にまとめること
- 総合的な援助の方針は、具体的かつ実現可能な内容にすること
- 緊急連絡先は既存プランがあればそこから引き継ぐこと
- 記載は「ですます調」の自然な日本語で記載すること

提案数: 3案
- 案1「自立支援重視プラン」: 本人の意欲を最大限活かす積極的なプラン
- 案2「安全・安心重視プラン」: 転倒予防や家族の負担軽減を重視したプラン
- 案3「バランス型プラン」: 既存プランをベースに微調整したプラン`,
  },
  {
    id: 'prompt_kyotaku_table2',
    title: '居宅介護支援 第2表プロンプト',
    body: `あなたは経験豊富な介護支援専門員です。以下の情報源と第1表の内容から、居宅サービス計画書（第2表）を作成してください。

【利用者情報】
氏名: {利用者名}
要介護度: {要介護度}

【既存ケアプラン】
{既存ケアプラン}

【アセスメント情報】
{アセスメント情報}

【主治医意見書】
{主治医意見書}

【作成上の注意】
- ニーズは本人・家族の言葉を活かした表現にすること
- 長期目標・短期目標は具体的かつ評価可能な表現で記載すること
- サービス内容は具体的な支援行為を箇条書きで記載すること
- サービス種別、事業者名、頻度、期間を明記すること
- 保険給付対象サービスには「○」印を付すこと
- インフォーマルサービス（本人、家族）も含めること

提案数: 3案（第1表と対応）`,
  },
  {
    id: 'prompt_kyotaku_table3',
    title: '居宅介護支援 第3表プロンプト',
    body: `あなたは経験豊富な介護支援専門員です。以下の情報源と第1・2表の内容から、週間サービス計画表（第3表）を作成してください。

【利用者情報】
氏名: {利用者名}
要介護度: {要介護度}

【既存ケアプラン】
{既存ケアプラン}

【第2表のサービス内容】
{第2表サービス}

【作成上の注意】
- 曜日ごとのサービス利用予定を時間帯で記載すること
- 主な日常生活上の活動（起床、食事、就寝など）を時間で記載すること
- 週単位以外のサービスがあれば記載すること
- 利用者の生活リズムに合わせた無理のないスケジュールにすること

提案数: 3案（第1・2表と対応）`,
  },
  {
    id: 'prompt_shoki_table1',
    title: '小規模多機能 第1表プロンプト',
    body: `あなたは経験豊富な介護支援専門員です。以下の情報源から、小規模多機能型居宅介護の居宅サービス計画書（第1表）兼小規模多機能型居宅介護計画書を作成してください。

【利用者情報】
氏名: {利用者名}
要介護度: {要介護度}
生年月日: {生年月日}
住所: {住所}

【既存ケアプラン】
{既存ケアプラン}

【アセスメント情報】
{アセスメント情報}

【主治医意見書】
{主治医意見書}

【担当者会議録】
{担当者会議録}

【通い記録・訪問記録・泊まり記録の要約】
通い: {通い記録}
訪問: {訪問記録}
泊まり: {泊まり記録}

【フェイスシート】
{フェイスシート}

【作成上の注意】
- 利用者の意向と家族の意向を明確に分けて記載すること
- 課題分析の結果は、本人のこだわりや役割を尊重した内容にすること
- 援助の方針は、小規模多機能の強み（通い・訪問・泊まりの柔軟な組み合わせ）を活かした方針にすること
- 緊急連絡先は既存プランがあればそこから引き継ぐこと
- 記載は「ですます調」の自然な日本語で、現場の実感が伝わる表現を心がけること

提案数: 3案
- 案1「自立支援重視プラン」: 本人の意欲を最大限活かす積極的なプラン
- 案2「安全・安心重視プラン」: 転倒予防や家族のレスパイトを重視したプラン
- 案3「バランス型プラン」: 既存プランをベースに微調整したプラン`,
  },
  {
    id: 'prompt_shoki_table2',
    title: '小規模多機能 第2表プロンプト',
    body: `あなたは経験豊富な介護支援専門員です。以下の情報源と第1表の内容から、小規模多機能型居宅介護の居宅サービス計画書（第2表）兼小規模多機能型居宅介護計画書を作成してください。

【利用者情報】
氏名: {利用者名}
要介護度: {要介護度}

【既存ケアプラン】
{既存ケアプラン}

【アセスメント情報】
{アセスメント情報}

【主治医意見書】
{主治医意見書}

【通い記録・訪問記録・泊まり記録の要約】
通い: {通い記録}
訪問: {訪問記録}
泊まり: {泊まり記録}

【作成上の注意】
- ニーズは本人・家族の言葉を活かした表現にすること
- 長期目標・短期目標は具体的かつ評価可能な表現で記載すること
- サービス内容は「通い」「訪問」「泊まり」を明確に区別すること
- 小規模多機能型居宅介護のサービスと外部サービス（訪問看護、居宅療養管理指導等）を適切に組み合わせること
- 保険給付対象サービスには「○」印を付すこと
- インフォーマルサービス（本人、家族）も含めること
- 事業者名・頻度・期間を明記すること

提案数: 3案（第1表と対応）`,
  },
  {
    id: 'prompt_shoki_table3',
    title: '小規模多機能 第3表プロンプト',
    body: `あなたは経験豊富な介護支援専門員です。以下の情報源と第1・2表の内容から、週間サービス計画表（第3表）を作成してください。

【利用者情報】
氏名: {利用者名}
要介護度: {要介護度}

【既存ケアプラン】
{既存ケアプラン}

【第2表のサービス内容】
{第2表サービス}

【作成上の注意】
- 「通い」「訪問」「泊まり」を曜日・時間帯ごとに明確に記載すること
- 通いは日中（概ね9:30〜15:30）、訪問は短時間（概ね30分〜1時間）、泊まりは夕方〜翌朝で記載すること
- 主な日常生活上の活動（起床、食事、就寝など）を時間で記載すること
- 週単位以外のサービス（月1回の訪問診療など）があれば記載すること
- 利用者の生活リズムに合わせた無理のないスケジュールにすること

提案数: 3案（第1・2表と対応）`,
  },
];

/** Initialize settings spreadsheet with default sheets and data */
export async function initializeSettingsSpreadsheet(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  const sheets = getSheetsClient(accessToken);

  // Check existing sheets
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheets = meta.data.sheets?.map(s => s.properties?.title) || [];

  const requiredSheets = ['general', 'prompts', 'allowlist', 'drafts', 'history'];
  const sheetsToCreate = requiredSheets.filter(s => !existingSheets.includes(s));

  // Create missing sheets
  if (sheetsToCreate.length > 0) {
    const requests: sheets_v4.Schema$Request[] = sheetsToCreate.map(title => ({
      addSheet: { properties: { title } },
    }));

    // Remove default "Sheet1" if it exists
    const sheet1 = meta.data.sheets?.find(s => s.properties?.title === 'Sheet1');
    if (sheet1 && sheetsToCreate.length > 0) {
      requests.push({
        deleteSheet: { sheetId: sheet1.properties?.sheetId },
      });
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }

  // Initialize general settings header
  if (sheetsToCreate.includes('general')) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'general!A1:B7',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          ['key', 'value'],
          ['facilityName', ''],
          ['facilityAddress', ''],
          ['managerName', ''],
          ['userRootFolderId', process.env.USER_ROOT_FOLDER_ID || ''],
          ['userRootFolderIdPrivate', process.env.USER_ROOT_FOLDER_ID_PRIVATE || ''],
          ['geminiModel', 'gemini-2.5-flash-preview-05-20'],
          ['proposalCount', '3'],
        ],
      },
    });
  }

  // Initialize prompts
  if (sheetsToCreate.includes('prompts')) {
    const promptRows = [
      ['id', 'title', 'body'],
      ...DEFAULT_PROMPTS.map(p => [p.id, p.title, p.body]),
    ];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'prompts!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: promptRows },
    });
  }

  // Initialize allowlist header
  if (sheetsToCreate.includes('allowlist')) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'allowlist!A1:C1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['email', 'role', 'name']] },
    });
  }

  // Initialize drafts header
  if (sheetsToCreate.includes('drafts')) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'drafts!A1:E1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['user_id', 'user_name', 'mode', 'plan_json', 'updated_at']] },
    });
  }

  // Initialize history header
  if (sheetsToCreate.includes('history')) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'history!A1:E1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['user_id', 'user_name', 'mode', 'exported_url', 'exported_at']] },
    });
  }
}
