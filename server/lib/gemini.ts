import { GoogleGenAI } from '@google/genai';
import type { GeneratedPlan, Table1Data, NeedItem, Table3Data } from '../types/plan.js';

const RESPONSE_SCHEMA_TABLE1 = {
  type: 'object' as const,
  properties: {
    plans: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const },
          label: { type: 'string' as const },
          summary: { type: 'string' as const },
          table1: {
            type: 'object' as const,
            properties: {
              userWishes: { type: 'string' as const },
              familyWishes: { type: 'string' as const },
              assessmentResult: { type: 'string' as const },
              committeeOpinion: { type: 'string' as const },
              totalPolicy: { type: 'string' as const },
              livingSupportReason: { type: 'string' as const },
            },
            required: ['userWishes', 'familyWishes', 'assessmentResult', 'committeeOpinion', 'totalPolicy', 'livingSupportReason'],
          },
        },
        required: ['id', 'label', 'summary', 'table1'],
      },
    },
  },
  required: ['plans'],
};

const RESPONSE_SCHEMA_TABLE2 = {
  type: 'object' as const,
  properties: {
    plans: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const },
          table2: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                need: { type: 'string' as const },
                goals: {
                  type: 'array' as const,
                  items: {
                    type: 'object' as const,
                    properties: {
                      longGoal: { type: 'string' as const },
                      longPeriod: { type: 'string' as const },
                      shortGoal: { type: 'string' as const },
                      shortPeriod: { type: 'string' as const },
                      services: {
                        type: 'array' as const,
                        items: {
                          type: 'object' as const,
                          properties: {
                            content: { type: 'string' as const },
                            insurance: { type: 'string' as const },
                            type: { type: 'string' as const },
                            provider: { type: 'string' as const },
                            frequency: { type: 'string' as const },
                            period: { type: 'string' as const },
                          },
                          required: ['content', 'insurance', 'type', 'provider', 'frequency', 'period'],
                        },
                      },
                    },
                    required: ['longGoal', 'longPeriod', 'shortGoal', 'shortPeriod', 'services'],
                  },
                },
              },
              required: ['need', 'goals'],
            },
          },
        },
        required: ['id', 'table2'],
      },
    },
  },
  required: ['plans'],
};

const RESPONSE_SCHEMA_TABLE3 = {
  type: 'object' as const,
  properties: {
    plans: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const, description: 'P1, P2, P3' },
          table3: {
            type: 'object' as const,
            properties: {
              schedule: {
                type: 'array' as const,
                description: '週間サービス予定。各曜日・時間帯のサービスを配列で。必ず1件以上',
                items: {
                  type: 'object' as const,
                  properties: {
                    day: { type: 'string' as const, description: '曜日: mon, tue, wed, thu, fri, sat, sun のいずれか' },
                    startHour: { type: 'number' as const, description: '開始時（0-23の整数）例: 9' },
                    startMin: { type: 'number' as const, description: '開始分（0-59の整数）例: 30' },
                    endHour: { type: 'number' as const, description: '終了時（0-23の整数）例: 15' },
                    endMin: { type: 'number' as const, description: '終了分（0-59の整数）例: 30' },
                    label: { type: 'string' as const, description: 'サービス名。例: 通い, 訪問, 泊まり, 訪問看護, 訪問診療, デイサービス' },
                  },
                  required: ['day', 'startHour', 'startMin', 'endHour', 'endMin', 'label'],
                },
              },
              dailyActivities: {
                type: 'array' as const,
                description: '主な日常生活上の活動（起床、食事、就寝等）',
                items: {
                  type: 'object' as const,
                  properties: {
                    time: { type: 'string' as const, description: '時刻（HH:MM形式）例: 7:00' },
                    activity: { type: 'string' as const, description: '活動内容。例: 起床・洗面' },
                  },
                  required: ['time', 'activity'],
                },
              },
              weeklyService: { type: 'string' as const },
            },
            required: ['schedule', 'dailyActivities', 'weeklyService'],
          },
        },
        required: ['id', 'table3'],
      },
    },
  },
  required: ['plans'],
};

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  return new GoogleGenAI({ apiKey });
}

/** Call Gemini with structured output for Table 1 */
export async function generateTable1(
  model: string,
  prompt: string
): Promise<Array<{ id: string; label: string; summary: string; table1: Table1Data }>> {
  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA_TABLE1 as any,
      temperature: 0.8,
    },
  });
  const text = response.text || '{"plans":[]}';
  const parsed = JSON.parse(text);
  return parsed.plans;
}

/** Call Gemini with structured output for Table 2 */
export async function generateTable2(
  model: string,
  prompt: string
): Promise<Array<{ id: string; table2: NeedItem[] }>> {
  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA_TABLE2 as any,
      temperature: 0.8,
    },
  });
  const text = response.text || '{"plans":[]}';
  const parsed = JSON.parse(text);
  return parsed.plans;
}

/** Call Gemini with structured output for Table 3 */
export async function generateTable3(
  model: string,
  prompt: string
): Promise<Array<{ id: string; table3: Table3Data }>> {
  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA_TABLE3 as any,
      temperature: 0.8,
    },
  });
  const text = response.text || '{"plans":[]}';
  const parsed = JSON.parse(text);
  return parsed.plans;
}

/** Summarize a long document using Gemini */
export async function summarizeDocument(
  model: string,
  content: string,
  docType: string
): Promise<string> {
  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model,
    contents: `以下の${docType}の内容を、ケアプラン作成に必要な情報を中心に簡潔に要約してください。要約は日本語で、箇条書きで記載してください。\n\n${content}`,
    config: {
      temperature: 0.3,
      maxOutputTokens: 2048,
    },
  });
  return response.text || '';
}

/** Analyze a PDF via Gemini (base64 input) */
export async function analyzePdf(
  model: string,
  base64Data: string,
  mimeType: string,
  docType: string
): Promise<string> {
  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: `この${docType}の内容を、ケアプラン作成に必要な情報を中心にJSON形式で構造化して出力してください。`,
          },
        ],
      },
    ],
    config: {
      temperature: 0.3,
      maxOutputTokens: 4096,
    },
  });
  return response.text || '';
}

/** 利用者プロフィール抽出用スキーマ */
const USER_PROFILE_SCHEMA = {
  type: 'object' as const,
  properties: {
    name: { type: 'string' as const, description: '氏名（フルネーム）' },
    furigana: { type: 'string' as const, description: 'ふりがな（カタカナ）' },
    birthDate: { type: 'string' as const, description: '生年月日（例: 昭和19年5月28日）' },
    age: { type: 'string' as const, description: '年齢' },
    address: { type: 'string' as const, description: '住所' },
    careLevel: { type: 'string' as const, description: '要介護状態区分（例: 要介護1）' },
    insuranceNo: { type: 'string' as const, description: '被保険者番号' },
    certDate: { type: 'string' as const, description: '認定日（例: 令和7年5月28日）' },
    certPeriodStart: { type: 'string' as const, description: '認定有効期間の開始日（例: 令和7年5月9日）' },
    certPeriodEnd: { type: 'string' as const, description: '認定有効期間の終了日（例: 令和8年5月31日）' },
    firstCreateDate: { type: 'string' as const, description: '初回居宅サービス計画作成日' },
  },
  required: ['name'],
};

export interface ExtractedUserProfile {
  name: string;
  furigana: string;
  birthDate: string;
  age: string;
  address: string;
  careLevel: string;
  insuranceNo: string;
  certDate: string;
  certPeriodStart: string;
  certPeriodEnd: string;
  firstCreateDate: string;
}

/**
 * 情報源テキストから利用者の基本情報を構造化抽出する。
 */
export async function extractUserProfile(
  model: string,
  sourceTexts: string
): Promise<ExtractedUserProfile> {
  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model,
    contents: `以下の情報源から、利用者（介護サービスの利用者本人）の基本情報を抽出してください。
見つからない項目は空文字にしてください。日付は和暦（令和○年○月○日、昭和○年○月○日など）で記載してください。

【情報源】
${sourceTexts}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: USER_PROFILE_SCHEMA as any,
      temperature: 0.1,
      maxOutputTokens: 1024,
    },
  });
  const text = response.text || '{}';
  try {
    return JSON.parse(text);
  } catch {
    return { name: '', furigana: '', birthDate: '', age: '', address: '', careLevel: '', insuranceNo: '', certDate: '', certPeriodStart: '', certPeriodEnd: '', firstCreateDate: '' };
  }
}

/** 既存ケアプランの全項目を構造化抽出するスキーマ */
const EXISTING_PLAN_SCHEMA = {
  type: 'object' as const,
  properties: {
    table1: {
      type: 'object' as const,
      properties: {
        userWishes: { type: 'string' as const, description: '利用者の意向（本人様:で始まる）' },
        familyWishes: { type: 'string' as const, description: '家族の意向（家族様:で始まる）' },
        assessmentResult: { type: 'string' as const, description: '課題分析の結果' },
        committeeOpinion: { type: 'string' as const, description: '介護認定審査会の意見' },
        totalPolicy: { type: 'string' as const, description: '総合的な援助の方針（緊急連絡先含む）' },
        livingSupportReason: { type: 'string' as const, description: '生活援助中心型の算定理由' },
      },
    },
    table2: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          need: { type: 'string' as const },
          goals: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                longGoal: { type: 'string' as const },
                longPeriod: { type: 'string' as const },
                shortGoal: { type: 'string' as const },
                shortPeriod: { type: 'string' as const },
                services: {
                  type: 'array' as const,
                  items: {
                    type: 'object' as const,
                    properties: {
                      content: { type: 'string' as const },
                      insurance: { type: 'string' as const },
                      type: { type: 'string' as const },
                      provider: { type: 'string' as const },
                      frequency: { type: 'string' as const },
                      period: { type: 'string' as const },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    table3: {
      type: 'object' as const,
      properties: {
        schedule: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              day: { type: 'string' as const, description: 'mon/tue/wed/thu/fri/sat/sun' },
              startHour: { type: 'number' as const },
              startMin: { type: 'number' as const },
              endHour: { type: 'number' as const },
              endMin: { type: 'number' as const },
              label: { type: 'string' as const },
            },
          },
        },
        dailyActivities: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              time: { type: 'string' as const },
              activity: { type: 'string' as const },
            },
          },
        },
        weeklyService: { type: 'string' as const },
      },
    },
  },
};

/**
 * 既存ケアプランPDF/テキストから全項目を構造化抽出する専用関数。
 * 通常のPDF解析より詳細に、第1〜3表の全フィールドを確実に抽出する。
 */
export async function extractExistingPlan(
  model: string,
  content: string,
  isPdf: boolean = false,
  base64Data?: string,
  mimeType?: string
): Promise<any> {
  const ai = getGenAI();

  const prompt = `あなたは居宅サービス計画書（ケアプラン）の読取専門AIです。
以下の文書から、居宅サービス計画書の第1表・第2表・第3表の全項目を正確に構造化してください。

【重要ルール】
- 文書に書かれている内容をそのまま忠実に転記してください。要約や省略は不可です。
- 見つからない項目は空文字にしてください。勝手に内容を作らないでください。
- 第2表のサービス内容は箇条書きの「・」を含めてそのまま転記してください。
- 第3表のscheduleは曜日(mon〜sun)、開始/終了時刻(整数)、ラベル(通い/訪問/泊まり等)で記載してください。
- 保険給付対象は insurance: "○"、対象外は insurance: "" としてください。

${isPdf ? '' : '【文書内容】\n' + content}`;

  const contents = isPdf && base64Data
    ? [{
        role: 'user' as const,
        parts: [
          { inlineData: { mimeType: mimeType || 'application/pdf', data: base64Data } },
          { text: prompt },
        ],
      }]
    : prompt + '\n\n' + content;

  const response = await ai.models.generateContent({
    model,
    contents: contents as any,
    config: {
      responseMimeType: 'application/json',
      responseSchema: EXISTING_PLAN_SCHEMA as any,
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  });

  const text = response.text || '{}';
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
