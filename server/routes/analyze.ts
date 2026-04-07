import { Router, Request, Response } from 'express';
import { getAccessToken } from '../auth.js';
import { getSheetData } from '../lib/sheets.js';
import { generateTable1, generateTable2, generateTable3 } from '../lib/gemini.js';
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
    } = req.body as {
      user: UserInfo;
      sourceContents: Record<string, string>;
      mode: BusinessMode;
    };

    if (!user || !mode) {
      return res.status(400).json({ error: 'user and mode are required' });
    }

    // Get settings
    const settingsId = process.env.SETTINGS_SPREADSHEET_ID;
    let facilityName = '';
    let managerName = '';
    // 生成用モデルは .env から取得
    const geminiModel = process.env.GEMINI_MODEL_GENERATE || 'gemini-2.5-flash-preview-05-20';

    // 事業所情報はリクエストから受け取る（フロントで選択済み）
    const { facilityId } = req.body as any;

    if (settingsId && facilityId) {
      try {
        const facRows = await getSheetData(settingsId, 'facilities!A:D', token);
        if (facRows) {
          for (let i = 1; i < facRows.length; i++) {
            if (facRows[i][0] === facilityId) {
              facilityName = facRows[i][1] || '';
              managerName = facRows[i][3] || '';
              break;
            }
          }
        }
      } catch {
        // Use defaults
      }
    }

    // Get prompts for the selected mode
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
      } catch {
        // Will use empty prompts
      }
    }

    // Build template variables
    // Truncate large content to avoid token limits
    const truncatedContents: Record<string, string> = {};
    for (const [key, value] of Object.entries(sourceContents || {})) {
      truncatedContents[key] = truncateContent(value || '', 15000);
    }

    const variables = buildVariables(user, truncatedContents, facilityName, managerName);

    // Generate all 3 tables
    const table1Prompt = prompts[promptIds.table1] || '';
    const table2Prompt = prompts[promptIds.table2] || '';
    const table3Prompt = prompts[promptIds.table3] || '';

    if (!table1Prompt && !table2Prompt && !table3Prompt) {
      return res.status(400).json({ error: 'プロンプトが設定されていません。設定画面でプロンプトを入力してください。' });
    }

    // Expand variables
    const expandedT1 = expandPrompt(table1Prompt, variables);
    const expandedT2 = expandPrompt(table2Prompt, variables);
    const expandedT3 = expandPrompt(table3Prompt, variables);

    // Call Gemini for all three tables concurrently
    const [table1Results, table2Results, table3Results] = await Promise.all([
      table1Prompt ? generateTable1(geminiModel, expandedT1) : Promise.resolve([]),
      table2Prompt ? generateTable2(geminiModel, expandedT2) : Promise.resolve([]),
      table3Prompt ? generateTable3(geminiModel, expandedT3) : Promise.resolve([]),
    ]);

    // Merge results into GeneratedPlan array
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
          userWishes: '',
          familyWishes: '',
          assessmentResult: '',
          committeeOpinion: '',
          totalPolicy: '',
          livingSupportReason: '',
        },
        table2: t2?.table2 || [],
        table3: t3?.table3 || {
          schedule: [],
          dailyActivities: [],
          weeklyService: '',
        },
      });
    }

    res.json({ plans });
  } catch (err: any) {
    // Don't log personal info
    console.error('Error in analysis:', err.message?.replace(/[\u3000-\u9FFF]/g, '***'));
    res.status(500).json({ error: 'AI分析中にエラーが発生しました。しばらくしてから再度お試しください。' });
  }
});
