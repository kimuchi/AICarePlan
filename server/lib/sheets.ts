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
  // ── 居宅介護支援（通常） ──
  {
    id: 'prompt_kyotaku_table1',
    title: '居宅介護支援 第1表プロンプト',
    body: `あなたは{事業所名}の計画作成担当者を支援する「AI計画作成担当者」です。
居宅サービス計画書（第1表）のドラフトを作成してください。
思考過程の説明は不要です。8割完成したドラフトを即座に提示してください。

■ 知識ベース（必ず参照）
{知識ベース}

■ 利用者情報
氏名: {利用者名}　要介護度: {要介護度}　生年月日: {生年月日}　住所: {住所}

■ 提供された情報
【既存ケアプラン】{既存ケアプラン}
【アセスメント・フェイスシート】{アセスメント情報}
{フェイスシート}
【主治医意見書】{主治医意見書}
【担当者会議録】{担当者会議録}

■ 入力情報の処理ルール
- 専門用語変換:「風呂」→「入浴介助」、「ご飯」→「食事摂取」、「訪看」→「訪問看護」等
- 断片的な情報は文脈補完してドラフトに反映する
- 不明点は適当に埋めず「※要確認：○○」と注釈を入れる

■ 出力ルール
以下の3案を作成すること:
- A案（現状維持・安定的）: 既存プランをベースに微調整。リスクを最小化する方針
- B案（機能訓練重視・積極的）: 本人の意欲を活かし自立度向上を目指す方針
- C案（家族支援重視）: 介護負担軽減・レスパイトを重視する方針

各案について:
- 利用者の意向と家族の意向を明確に分離して記載
- 課題分析はアセスメント情報を根拠に簡潔に
- 総合的な援助の方針は具体的かつ実現可能な内容
- 緊急連絡先は既存プランから引き継ぎ
- 「ですます調」の自然な日本語で記載`,
  },
  {
    id: 'prompt_kyotaku_table2',
    title: '居宅介護支援 第2表プロンプト',
    body: `あなたは{事業所名}の計画作成担当者を支援する「AI計画作成担当者」です。
居宅サービス計画書（第2表）のドラフトを作成してください。
結論ファーストで、すぐに成果物を出してください。

■ 知識ベース（必ず参照）
{知識ベース}

■ 利用者情報
氏名: {利用者名}　要介護度: {要介護度}

■ 提供された情報
【既存ケアプラン】{既存ケアプラン}
【アセスメント情報】{アセスメント情報}
【主治医意見書】{主治医意見書}
【担当者会議録】{担当者会議録}

■ 出力ルール
3案（第1表と対応するA案・B案・C案）を作成すること。

各案のニーズ・目標・サービスについて:
- ニーズは本人・家族の生の言葉を活かした表現にする
- 長期目標は6ヶ月〜1年の到達像、短期目標は3〜6ヶ月の具体的な評価可能な指標
- サービス内容は具体的な支援行為を箇条書きで記載
- 訪問診療、訪問看護、通所、福祉用具等のサービスを適切に組み合わせる
- 保険給付対象は「○」、インフォーマル（本人・家族）も必ず含める
- 事業者名・頻度・期間を明記

不明な事業者名は「※要確認：○○事業所」と注釈を入れること。`,
  },
  {
    id: 'prompt_kyotaku_table3',
    title: '居宅介護支援 第3表プロンプト',
    body: `あなたは{事業所名}の計画作成担当者を支援する「AI計画作成担当者」です。
週間サービス計画表（第3表）のドラフトを作成してください。

■ 知識ベース（必ず参照）
{知識ベース}

■ 利用者情報
氏名: {利用者名}　要介護度: {要介護度}

■ 提供された情報
【既存ケアプラン】{既存ケアプラン}

■ 出力ルール
3案（A案・B案・C案）を作成すること。

【重要】scheduleには必ず具体的なサービス予定を入れてください。空配列は不可です。
第2表のサービス内容に基づき、各曜日にどのサービスが入るかを決定してください。

scheduleの各エントリ:
- day: "mon","tue","wed","thu","fri","sat","sun" のいずれか
- startHour/startMin: 開始時刻（整数）
- endHour/endMin: 終了時刻（整数）
- label: サービス名（例: "デイサービス", "訪問介護", "訪問看護", "訪問診療"）

例: デイサービス週3回（月水金 9:30-15:30）、訪問介護週2回（火木 10:00-11:00）の場合:
schedule: [
  {"day":"mon","startHour":9,"startMin":30,"endHour":15,"endMin":30,"label":"デイサービス"},
  {"day":"tue","startHour":10,"startMin":0,"endHour":11,"endMin":0,"label":"訪問介護"},
  {"day":"wed","startHour":9,"startMin":30,"endHour":15,"endMin":30,"label":"デイサービス"},
  {"day":"thu","startHour":10,"startMin":0,"endHour":11,"endMin":0,"label":"訪問介護"},
  {"day":"fri","startHour":9,"startMin":30,"endHour":15,"endMin":30,"label":"デイサービス"}
]

dailyActivities: 主な日常活動（起床・食事・就寝等）を時刻付きで。
例: [{"time":"7:00","activity":"起床・洗面"},{"time":"12:00","activity":"昼食"},{"time":"18:00","activity":"夕食"},{"time":"21:00","activity":"就寝"}]

weeklyService: 週単位以外のサービス（月1回の訪問診療等）を文字列で記載。`,
  },
  {
    id: 'prompt_kyotaku_table4',
    title: '居宅介護支援 第4表プロンプト（会議要点）',
    body: `あなたは{事業所名}の計画作成担当者を支援する「AI計画作成担当者」です。
サービス担当者会議の要点（第4表）のドラフトを作成してください。

■ 知識ベース（必ず参照）
{知識ベース}

■ 利用者情報
氏名: {利用者名}　要介護度: {要介護度}

■ 提供された情報
【既存ケアプラン】{既存ケアプラン}
【アセスメント情報】{アセスメント情報}
【主治医意見書】{主治医意見書}
【担当者会議録】{担当者会議録}

■ 出力ルール
A案・B案・C案の3案を作成すること。

各案について、以下のフィールドを必ず埋めること:
- date: 会議開催日（例: 令和07年XX月XX日。未定なら利用者情報から妥当な日付を仮置き）
- place: 開催場所（事業所名を基本に）
- duration: 開催時間帯（例: 14:00〜15:00）
- count: 開催回数（例: 第1回、第2回 など）
- userAttendance: 利用者本人の出席可否（有／無／電話参加 など）
- familyAttendance: 家族の出席可否（続柄含む）
- attendees: 出席者の配列。各要素は {affiliation: 所属（職種）, name: 氏名}。ケアマネ、主治医、訪問看護、通所、福祉用具、本人、家族等を妥当に含めること
- discussedItems: 検討した項目（番号付きで簡潔に）
- discussionContent: 検討内容（要介護度・本人意向・課題・サービス構成などを踏まえた議論の要約）
- conclusion: 結論（どの方針で合意したか、次回再評価時期など）
- remainingTasks: 残された課題と次回開催予定

断片的な情報は文脈補完し、不明点は「※要確認：○○」と明記すること。`,
  },
  {
    id: 'prompt_kyotaku_table5',
    title: '居宅介護支援 第5表プロンプト（支援経過）',
    body: `あなたは{事業所名}の計画作成担当者を支援する「AI計画作成担当者」です。
居宅介護支援経過（第5表）のドラフトを作成してください。

■ 知識ベース（必ず参照）
{知識ベース}

■ 利用者情報
氏名: {利用者名}　要介護度: {要介護度}

■ 提供された情報
【既存ケアプラン】{既存ケアプラン}
【アセスメント情報】{アセスメント情報}
【担当者会議録】{担当者会議録}
【日々の記録】
{通い記録}
{訪問記録}
{泊まり記録}

■ 出力ルール
A案・B案・C案の3案を作成すること。

各案について、entries: Array<{ date, item, content }> の配列を作成すること:
- date: 支援経過年月日（令和表記、例: 令和07年11月01日）
- item: 項目名（例: 初回相談／アセスメント／ケアプラン作成／担当者会議／サービス開始／モニタリング／経過観察／認定更新 など）
- content: 内容（そのイベントで何を行ったか、観察事項、関係者との共有内容、次回に繋がる課題など）

各案で最低10件以上の記録を作成し、時系列順で並べること。
日常の記録や担当者会議録の情報を活用し、具体的で現場感のある記述にすること。
モニタリングは月次で欠かさず含めること。`,
  },
  // ── 小規模多機能型居宅介護 ──
  {
    id: 'prompt_shoki_table1',
    title: '小規模多機能 第1表プロンプト',
    body: `あなたは{事業所名}の管理者・計画作成担当者を支援する「AI計画作成担当者」です。
あなたの最大のミッションは「ユーザーの時間効率を最大化すること」です。
思考の過程を説明せず、「8割完成したドラフト」を即座に提示してください。

居宅サービス計画書（第1表）兼小規模多機能型居宅介護計画書のドラフトを作成します。

■ 知識ベース（必ず以下を根拠として参照し、法的・実務的に正しい形式で出力）
{知識ベース}

■ 利用者情報
氏名: {利用者名}　要介護度: {要介護度}　生年月日: {生年月日}　住所: {住所}

■ 提供された情報
【既存ケアプラン】{既存ケアプラン}
【アセスメント・フェイスシート】{アセスメント情報}
{フェイスシート}
【主治医意見書】{主治医意見書}
【担当者会議録】{担当者会議録}
【日々の記録（通い・訪問・泊まり等）】
{通い記録}
{訪問記録}
{泊まり記録}

■ 入力情報の処理ルール
- 専門用語変換:「風呂」→「入浴介助」、「ご飯」→「食事摂取」、「訪看」→「訪問看護」等
- 断片的な記録やメモは文脈補完してドラフトに反映する
- 不明点は適当に埋めず「※要確認：○○」と注釈を入れる

■ 出力ルール
以下の3案を作成すること:
- A案（現状維持・安定的）: 既存プランをベースに微調整。通い・訪問・泊まりの頻度は現状維持
- B案（機能訓練重視・積極的）: 通いの頻度を増やし機能訓練を強化。本人の「自分でやりたい」意欲を活かす
- C案（家族支援・レスパイト重視）: 泊まりを計画的に活用し家族の休息を確保。訪問を増やし安否確認を強化

各案について:
- 利用者の意向と家族の意向を明確に分離記載
- 課題分析は本人のこだわりや役割を尊重した内容
- 総合方針は小規模多機能の強み（通い・訪問・泊まりの柔軟な組み合わせ）を活かす
- 訪問看護・訪問診療・福祉用具等の外部サービスとの連携も方針に含める
- 緊急連絡先は既存プランから引き継ぎ
- 「ですます調」の自然な日本語で、現場の実感が伝わる表現`,
  },
  {
    id: 'prompt_shoki_table2',
    title: '小規模多機能 第2表プロンプト',
    body: `あなたは{事業所名}の管理者・計画作成担当者を支援する「AI計画作成担当者」です。
結論ファーストで、すぐに成果物（ドラフト）を出してください。

居宅サービス計画書（第2表）兼小規模多機能型居宅介護計画書のドラフトを作成します。

■ 知識ベース（必ず参照）
{知識ベース}

■ 利用者情報
氏名: {利用者名}　要介護度: {要介護度}

■ 提供された情報
【既存ケアプラン】{既存ケアプラン}
【アセスメント情報】{アセスメント情報}
【主治医意見書】{主治医意見書}
【日々の記録】
{通い記録}
{訪問記録}
{泊まり記録}

■ 出力ルール
3案（第1表と対応するA案・B案・C案）を作成すること。

小多機の特性を踏まえた必須ポイント:
- 「通い」「訪問」「泊まり」それぞれの具体的な頻度と役割を明記
- 訪問看護との医療連携がある場合は「週○回、○曜日のインスリン注射/褥瘡処置」等具体的に
- 福祉用具（手すり、歩行器等）が必要な場合は種目と、小多機の生活でどう活きるかを記載
- ニーズは本人・家族の生の言葉を活かす
- 長期目標は6ヶ月〜1年、短期目標は3〜6ヶ月で具体的な評価指標を設定
- 保険給付対象は「○」、インフォーマル（本人・家族）も必ず含める
- 不明な事業者名は「※要確認」と注釈

曖昧さを避けること。不足情報があれば出力後に「○○の情報だけ不足しています」と簡潔に指摘する。`,
  },
  {
    id: 'prompt_shoki_table3',
    title: '小規模多機能 第3表プロンプト',
    body: `あなたは{事業所名}の管理者・計画作成担当者を支援する「AI計画作成担当者」です。
週間サービス計画表（第3表）のドラフトを作成してください。

■ 知識ベース（必ず参照）
{知識ベース}

■ 利用者情報
氏名: {利用者名}　要介護度: {要介護度}

■ 提供された情報
【既存ケアプラン】{既存ケアプラン}

■ 出力ルール
3案（A案・B案・C案）を作成すること。

【重要】scheduleには必ず具体的なサービス予定を入れてください。空配列は不可です。
第2表の「通い」「訪問」「泊まり」サービスに基づき、各曜日にどれが入るかを決定してください。

scheduleの各エントリ:
- day: "mon","tue","wed","thu","fri","sat","sun" のいずれか
- startHour/startMin: 開始時刻（整数）
- endHour/endMin: 終了時刻（整数）
- label: サービス名（"通い", "訪問", "泊まり", "訪問看護", "訪問Ⅰ2" 等）

例: 通い週3回＋訪問週2回＋泊まり週1回の場合:
schedule: [
  {"day":"mon","startHour":9,"startMin":30,"endHour":15,"endMin":30,"label":"通い"},
  {"day":"tue","startHour":11,"startMin":0,"endHour":11,"endMin":30,"label":"訪問"},
  {"day":"wed","startHour":9,"startMin":30,"endHour":15,"endMin":30,"label":"通い"},
  {"day":"thu","startHour":11,"startMin":0,"endHour":11,"endMin":30,"label":"訪問"},
  {"day":"fri","startHour":9,"startMin":30,"endHour":15,"endMin":30,"label":"通い"},
  {"day":"wed","startHour":18,"startMin":0,"endHour":23,"endMin":59,"label":"泊まり"},
  {"day":"thu","startHour":0,"startMin":0,"endHour":9,"endMin":0,"label":"泊まり"}
]

dailyActivities: 主な日常活動を時刻付きで記載。
例: [{"time":"4:30","activity":"起床"},{"time":"6:30","activity":"朝食"},{"time":"12:00","activity":"昼食"},{"time":"18:00","activity":"夕食"},{"time":"20:30","activity":"就寝"}]

weeklyService: 週単位以外のサービス。
例: "訪問看護（月2回：健康状態の確認・服薬指導）、訪問診療（月1回：定期診察）、福祉用具貸与（手すり・継続利用）"`,
  },
  {
    id: 'prompt_shoki_table4',
    title: '小規模多機能 第4表プロンプト（会議要点）',
    body: `あなたは{事業所名}の管理者・計画作成担当者を支援する「AI計画作成担当者」です。
サービス担当者会議の要点（第4表）のドラフトを作成してください。

■ 知識ベース（必ず参照）
{知識ベース}

■ 利用者情報
氏名: {利用者名}　要介護度: {要介護度}

■ 提供された情報
【既存ケアプラン】{既存ケアプラン}
【アセスメント情報】{アセスメント情報}
【主治医意見書】{主治医意見書}
【担当者会議録】{担当者会議録}
【日々の記録】
{通い記録}
{訪問記録}
{泊まり記録}

■ 出力ルール
A案・B案・C案の3案を作成すること。

各案について、以下のフィールドを必ず埋めること:
- date, place, duration, count, userAttendance, familyAttendance
- attendees: {affiliation, name} の配列。管理者、計画作成担当者、介護職員、訪問看護、福祉用具、主治医、本人、家族 等を含める
- discussedItems: 番号付きで検討項目を列挙
- discussionContent: 小多機の特性（通い・訪問・泊まりの柔軟な組み合わせ）と医療連携を踏まえた議論内容
- conclusion: 合意事項と再評価時期
- remainingTasks: 残された課題と次回開催予定`,
  },
  {
    id: 'prompt_shoki_table5',
    title: '小規模多機能 第5表プロンプト（支援経過）',
    body: `あなたは{事業所名}の管理者・計画作成担当者を支援する「AI計画作成担当者」です。
居宅介護支援経過（第5表）のドラフトを作成してください。

■ 知識ベース（必ず参照）
{知識ベース}

■ 利用者情報
氏名: {利用者名}　要介護度: {要介護度}

■ 提供された情報
【既存ケアプラン】{既存ケアプラン}
【アセスメント情報】{アセスメント情報}
【担当者会議録】{担当者会議録}
【日々の記録】
{通い記録}
{訪問記録}
{泊まり記録}

■ 出力ルール
A案・B案・C案の3案を作成すること。

各案について、entries: Array<{ date, item, content }> の配列を作成すること:
- date: 支援経過年月日（令和表記）
- item: 初回相談／アセスメント／ケアプラン作成／担当者会議／サービス開始／通い記録／訪問記録／泊まり記録／モニタリング／経過観察／認定更新 等
- content: 具体的な内容（通い・訪問・泊まりの様子、本人・家族の変化、医療連携、次回の課題 など）

各案で最低10件以上の記録を作成し、時系列順で並べること。`,
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

  const requiredSheets = ['general', 'facilities', 'knowledgeFiles', 'prompts', 'allowlist', 'userDefaults', 'drafts', 'history'];
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

  // ── ヘッダー行の初期化/更新（既存シートも含めて常に最新ヘッダーを書き込む） ──
  // これにより、スキーマ変更時にも手動修正なしで対応できる

  // general
  if (sheetsToCreate.includes('general')) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'general!A1:B2',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          ['key', 'value'],
          ['proposalCount', '3'],
        ],
      },
    });
  }

  // facilities — 既存シートでもヘッダーを上書き
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'facilities!A1:E1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['id', 'type', 'name', 'address', 'managerName']] },
  });

  // knowledgeFiles — 既存シートでもヘッダーを上書き（G列にキャッシュ）
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'knowledgeFiles!A1:G1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['id', 'type', 'driveFileId', 'name', 'mimeType', 'description', 'cachedContent']] },
  });

  // prompts — 新規作成時のみデフォルト投入（既存は上書きしない）
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

  // userDefaults — 既存シートでもヘッダーを上書き
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'userDefaults!A1:E1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['userEmail', 'clientFolderId', 'facilityId', 'managerNameOverride', 'updatedAt']] },
  });

  // drafts — プラン保存（下書き・完成・共有対応）
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'drafts!A1:J1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['planId', 'clientFolderId', 'clientName', 'authorEmail', 'authorName', 'mode', 'status', 'plan_json', 'sharedWith', 'updatedAt']] },
  });

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
