import type { BusinessMode, UserInfo } from '../types/plan.js';

export interface PromptVariables {
  利用者名: string;
  要介護度: string;
  生年月日: string;
  住所: string;
  アセスメント情報: string;
  既存ケアプラン: string;
  通い記録: string;
  訪問記録: string;
  泊まり記録: string;
  主治医意見書: string;
  担当者会議録: string;
  フェイスシート: string;
  事業所名: string;
  管理者名: string;
  知識ベース: string;
  第2表サービス?: string;
}

/** Build template variables from user info and source contents */
export function buildVariables(
  user: UserInfo,
  sourceContents: Record<string, string>,
  facilityName: string,
  managerName: string,
  knowledgeBase: string
): PromptVariables {
  return {
    利用者名: user.name,
    要介護度: user.careLevel,
    生年月日: user.birthDate,
    住所: user.address,
    アセスメント情報: sourceContents.assessment || 'なし',
    既存ケアプラン: sourceContents.careplan || 'なし',
    通い記録: sourceContents.kayoi || 'なし',
    訪問記録: sourceContents.houmon || 'なし',
    泊まり記録: sourceContents.tomari || 'なし',
    主治医意見書: sourceContents.medical || 'なし',
    担当者会議録: sourceContents.meeting || 'なし',
    フェイスシート: sourceContents.facesheet || 'なし',
    事業所名: facilityName,
    管理者名: managerName,
    知識ベース: knowledgeBase || '（知識ファイル未設定）',
  };
}

/** Replace template variables in a prompt string */
export function expandPrompt(template: string, variables: PromptVariables): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || 'なし');
  }
  return result;
}

/** Get prompt IDs for a given mode */
export function getPromptIds(mode: BusinessMode): {
  table1: string;
  table2: string;
  table3: string;
} {
  if (mode === 'shoki') {
    return {
      table1: 'prompt_shoki_table1',
      table2: 'prompt_shoki_table2',
      table3: 'prompt_shoki_table3',
    };
  }
  return {
    table1: 'prompt_kyotaku_table1',
    table2: 'prompt_kyotaku_table2',
    table3: 'prompt_kyotaku_table3',
  };
}

/** Truncate content if it exceeds a character limit */
export function truncateContent(content: string, maxChars: number = 15000): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + '\n\n...（以下省略。情報量が多いため最新部分のみ表示）';
}
