/** 事業形態 */
export type BusinessMode = 'kyotaku' | 'shoki';

/** サービス1件 */
export interface ServiceItem {
  content: string;
  insurance: '○' | '';
  type: string;
  provider: string;
  frequency: string;
  period: string;
}

/** 目標1件（長期+短期+サービス群） */
export interface GoalItem {
  longGoal: string;
  longPeriod: string;
  shortGoal: string;
  shortPeriod: string;
  services: ServiceItem[];
}

/** ニーズ1件（第2表の1行ブロック） */
export interface NeedItem {
  need: string;
  goals: GoalItem[];
}

/** 第1表 */
export interface Table1Data {
  userWishes: string;
  familyWishes: string;
  assessmentResult: string;
  committeeOpinion: string;
  totalPolicy: string;
  livingSupportReason: string;
}

/** 週間スケジュール1件 */
export interface ScheduleEntry {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  label: string;
}

/** 日常活動1件 */
export interface DailyActivity {
  time: string;
  activity: string;
}

/** 第3表 */
export interface Table3Data {
  schedule: ScheduleEntry[];
  dailyActivities: DailyActivity[];
  weeklyService: string;
}

/** Gemini が生成する1プラン */
export interface GeneratedPlan {
  id: string;
  label: string;
  summary: string;
  table1: Table1Data;
  table2: NeedItem[];
  table3: Table3Data;
}

/** プランメタ情報 */
export interface PlanMeta {
  creator: string;
  facility: string;
  facilityAddress: string;
  createDate: string;
  firstCreateDate: string;
}

/** 利用者情報 */
export interface UserInfo {
  id: string;
  name: string;
  kana?: string;
  birthDate: string;
  careLevel: string;
  address: string;
  insuranceNo?: string;
  certPeriod?: { start: string; end: string };
  certDate?: string;
  folderId: string;
  privateFolderId?: string;
  hasConfidential?: boolean;
}

/** 情報源カテゴリ */
export type SourceCategory =
  | 'careplan'
  | 'medical'
  | 'assessment_survey'
  | 'meeting'
  | 'assessment'
  | 'record'
  | 'facesheet';

/** 情報源ファイル */
export interface SourceFile {
  id: string;
  name: string;
  category: SourceCategory;
  date: string;
  mimeType: string;
  icon: string;
  isConfidential: boolean;
  folderId: string;
}

/** 設定スプレッドシートの基本設定 */
export interface GeneralSettings {
  facilityName: string;
  facilityAddress: string;
  managerName: string;
  userRootFolderId: string;
  userRootFolderIdPrivate: string;
  geminiModel: string;
  proposalCount: number;
}

/** プロンプト設定 */
export interface PromptEntry {
  id: string;
  title: string;
  body: string;
}

/** 許可リストエントリ */
export interface AllowlistEntry {
  email: string;
  role: 'admin' | 'user';
  name: string;
}

/** 下書きエントリ */
export interface DraftEntry {
  userId: string;
  userName: string;
  planJson: string;
  mode: BusinessMode;
  updatedAt: string;
}

/** エクスポート履歴エントリ */
export interface HistoryEntry {
  userId: string;
  userName: string;
  mode: BusinessMode;
  exportedUrl: string;
  exportedAt: string;
}
