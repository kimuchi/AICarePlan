import { Router, Request, Response } from 'express';
import { getAccessToken } from '../auth.js';
import { getSheetData } from '../lib/sheets.js';
import { getJsonFileContent, getFileContentBase64, getDocContent } from '../lib/drive.js';
import { generateTable1, generateTable2, generateTable3, analyzePdf, summarizeDocument } from '../lib/gemini.js';
import { buildVariables, expandPrompt, getPromptIds, truncateContent } from '../lib/promptBuilder.js';
import type { BusinessMode, GeneratedPlan, UserInfo } from '../types/plan.js';

export const analyzeRouter = Router();

/** POST /api/analyze — Generate care plan proposals using Gemini */
analyzeRouter.post('/', async (req: Request, res: Response) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'No access token' });

    const {
      user,
      sourceContents,
      mode,
      facilityId,
      managerNameOverride,
    } = req.body as {
      user: UserInfo;
      sourceContents: Record<string, string>;
      mode: BusinessMode;
      facilityId?: string;
      managerNameOverride?: string;
    };

    if (!user || !mode) {
      return res.status(400).json({ error: 'user and mode are required' });
    }

    const settingsId = process.env.SETTINGS_SPREADSHEET_ID;
    const geminiModel = process.env.GEMINI_MODEL_GENERATE || 'gemini-2.5-flash-preview-05-20';
    const analyzeModel = process.env.GEMINI_MODEL_ANALYZE || 'gemini-2.0-flash';

    // ── 事業所情報を取得 ──
    let facilityName = '';
    let facilityAddress = '';
    let managerName = '';

    if (settingsId && facilityId) {
      try {
        const facRows = await getSheetData(settingsId, 'facilities!A:E', token);
        if (facRows) {
          for (let i = 1; i < facRows.length; i++) {
            if (facRows[i][0] === facilityId) {
              facilityName = facRows[i][2] || '';
              facilityAddress = facRows[i][3] || '';
              managerName = facRows[i][4] || '';
              break;
            }
          }
        }
      } catch { /* use defaults */ }
    }

    // ユーザーが作成者名を上書きしている場合はそちらを使用
    if (managerNameOverride) {
      managerName = managerNameOverride;
    }

    // ── 知識ファイルを取得 ──
    let knowledgeBase = '';
    if (settingsId) {
      try {
        const kfRows = await getSheetData(settingsId, 'knowledgeFiles!A:E', token);
        if (kfRows && kfRows.length > 1) {
          const knowledgeParts: string[] = [];
          for (let i = 1; i < kfRows.length; i++) {
            const driveFileId = kfRows[i][1];
            const fileName = kfRows[i][2] || '';
            const mimeType = kfRows[i][3] || '';
            const description = kfRows[i][4] || '';
            if (!driveFileId) continue;

            try {
              let content = '';
              if (mimeType === 'application/pdf') {
                const base64 = await getFileContentBase64(token, driveFileId);
                content = await analyzePdf(analyzeModel, base64, mimeType, fileName);
              } else if (mimeType === 'application/vnd.google-apps.document') {
                content = await getDocContent(token, driveFileId);
                if (content.length > 10000) {
                  content = await summarizeDocument(analyzeModel, content, fileName);
                }
              } else if (mimeType === 'application/json') {
                const json = await getJsonFileContent(token, driveFileId);
                content = JSON.stringify(json, null, 2);
              } else {
                // Try as text
                content = await getDocContent(token, driveFileId).catch(() => '');
              }
              if (content) {
                const label = description || fileName;
                knowledgeParts.push(`【${label}】\n${truncateContent(content, 8000)}`);
              }
            } catch {
              knowledgeParts.push(`【${fileName}】※読み取りエラー`);
            }
          }
          knowledgeBase = knowledgeParts.join('\n\n');
        }
      } catch { /* knowledge files are optional */ }
    }

    // ── プロンプト取得 ──
    const promptIds = getPromptIds(mode);
    const prompts: Record<string, string> = {};

    if (settingsId) {
      try {
        const promptRows = await getSheetData(settingsId, 'prompts!A:C', token);
        if (promptRows) {
          for (let i = 1; i < promptRows.length; i++) {
            const row = promptRows[i];
            if (row[0]) prompts[row[0]] = row[2] || '';
          }
        }
      } catch { /* use empty prompts */ }
    }

    // ── 変数展開 ──
    const truncatedContents: Record<string, string> = {};
    for (const [key, value] of Object.entries(sourceContents || {})) {
      truncatedContents[key] = truncateContent(value || '', 15000);
    }

    const variables = buildVariables(user, truncatedContents, facilityName, managerName, knowledgeBase);

    const table1Prompt = prompts[promptIds.table1] || '';
    const table2Prompt = prompts[promptIds.table2] || '';
    const table3Prompt = prompts[promptIds.table3] || '';

    if (!table1Prompt && !table2Prompt && !table3Prompt) {
      return res.status(400).json({ error: 'プロンプトが設定されていません。設定画面でプロンプトを入力してください。' });
    }

    const expandedT1 = expandPrompt(table1Prompt, variables);
    const expandedT2 = expandPrompt(table2Prompt, variables);
    const expandedT3 = expandPrompt(table3Prompt, variables);

    // ── Gemini呼び出し（3テーブル並列） ──
    const [table1Results, table2Results, table3Results] = await Promise.all([
      table1Prompt ? generateTable1(geminiModel, expandedT1) : Promise.resolve([]),
      table2Prompt ? generateTable2(geminiModel, expandedT2) : Promise.resolve([]),
      table3Prompt ? generateTable3(geminiModel, expandedT3) : Promise.resolve([]),
    ]);

    // ── 結果マージ ──
    const planCount = Math.max(table1Results.length, table2Results.length, table3Results.length);
    const plans: GeneratedPlan[] = [];

    for (let i = 0; i < planCount; i++) {
      const t1 = table1Results[i];
      const t2 = table2Results[i];
      const t3 = table3Results[i];
      plans.push({
        id: t1?.id || `P${i + 1}`,
        label: t1?.label || `プラン${i + 1}`,
        summary: t1?.summary || '',
        table1: t1?.table1 || {
          userWishes: '', familyWishes: '', assessmentResult: '',
          committeeOpinion: '', totalPolicy: '', livingSupportReason: '',
        },
        table2: t2?.table2 || [],
        table3: t3?.table3 || { schedule: [], dailyActivities: [], weeklyService: '' },
      });
    }

    res.json({ plans });
  } catch (err: any) {
    console.error('Error in analysis:', err.message?.replace(/[\u3000-\u9FFF]/g, '***'));
    res.status(500).json({ error: 'AI分析中にエラーが発生しました。しばらくしてから再度お試しください。' });
  }
});
