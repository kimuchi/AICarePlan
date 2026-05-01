/**
 * Excel取り込み機能で使用する型定義。
 *
 * サーバー側の Excel パーサ・/api/import エンドポイント・/api/users/:folderId/*-latest の
 * レスポンス・フロントの参考情報パネル各 View が **ここで一元的に型を共有**する。
 * サーバー/フロントで二重定義しないこと。
 */

// ── 共通小物 ──

export interface DateValue {
  /** 原文（和暦・西暦混在、日付範囲含む）。必ず保持 */
  raw: string;
  /** ISO 8601 (YYYY-MM-DD) に変換できたもの。失敗時は undefined */
  iso?: string;
  /** 和暦表記（例「令和07年01月01日」） */
  wareki?: string;
  /** 年齢（生年月日に付随する「（73歳）」等） */
  age?: number;
}

export interface DateRangeValue {
  raw: string;
  fromIso?: string;
  toIso?: string;
  rawFrom?: string;
  rawTo?: string;
}

export interface SelectionGroup {
  /** 元の文字列（"■可 □つかまれば可 □不可" など）を必ず保持 */
  raw: string;
  /** 選択された値（"可"）。未選択なら undefined */
  selected?: string;
  /** 全選択肢（["可","つかまれば可","不可"]）。未選択含む */
  options: string[];
  /** 選択された値の集合（複数選択対応） */
  selectedAll: string[];
}

export interface EvidenceValue {
  /** メタ種別: "要介護度フォールバック" | "記録キーワード" | "直接入力" 等 */
  kind?: string;
  /** 根拠の本文（「要介護度要介護１からの推定」等） */
  basis?: string;
  /** 元文字列を必ず保持 */
  raw: string;
}

export interface CategoryTag {
  /** ★ の個数（0〜3） */
  importance: number;
  /** [食事/服薬/受診] → ["食事","服薬","受診"] */
  categories: string[];
  /** 残りの文字列 */
  rest: string;
  /** 元の文字列 */
  raw: string;
}

// ── 第1表 ──

export interface ExcelTable1 {
  createDate: DateValue;
  /** 初回/紹介/継続 */
  planKind?: string;
  /** 認定済/申請中 */
  certStatus?: string;
  userName: string;
  userNameRaw: string;
  birthDate: DateValue;
  address: string;
  insuredNumber: string;
  insurerNumber: string;
  plannerName: string;
  supportOfficeAndAddress: string;
  planCreateDate: DateValue;
  firstPlanCreateDate: DateValue;
  certDate: DateValue;
  certPeriod: DateRangeValue;
  careLevel?: string;
  userAndFamilyWishes: string;
  committeeOpinion: string;
  totalPolicy: string;
  livingSupportReason: string;
}

// ── 第2表 ──

export interface ExcelT2Service {
  content: string;
  /** ※1 ○の有無 */
  insurance: boolean;
  kind: string;
  provider: string;
  frequency: string;
  period: DateRangeValue;
}

export interface ExcelT2Need {
  no: number;
  need: string;
  longGoal: string;
  longGoalPeriod: DateRangeValue;
  shortGoal: string;
  shortGoalPeriod: DateRangeValue;
  services: ExcelT2Service[];
}

export type ExcelTable2 = ExcelT2Need[];

// ── 第3表 ──

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type TimeSection = '深夜' | '早朝' | '午前' | '午後' | '夜間' | string;

export interface ExcelT3TimeSlot {
  section: TimeSection;
  time: string;
  byWeekday: Record<Weekday, string>;
}

export interface ExcelTable3 {
  weekdayOrder: Weekday[];
  timeSlots: ExcelT3TimeSlot[];
  dailyActivities: string;
  weeklyExtraServices: string;
}

// ── 第4表 ──

export interface ExcelT4Attendee {
  role: string;
  name: string;
}

export interface ExcelTable4 {
  userName: string;
  plannerName: string;
  heldDate: DateValue;
  location: string;
  heldTime: string;
  session: string;
  userAttended?: string;
  familyAttended?: string;
  attendees: ExcelT4Attendee[];
  discussedItems: string;
  discussion: string;
  conclusion: string;
  remainingTasks: string;
}

// ── 第5表 ──

export interface ExcelT5Record {
  date: DateValue;
  category: string;
  content: string;
}

export type ExcelTable5 = ExcelT5Record[];

// ── モニタリング ──

export interface MonitoringHistoryRow {
  date: DateValue;
  result: string;
}

export interface MonitoringSession {
  round: number;
  fields: Record<string, string>;
}

export interface ExcelMonitoring {
  declaredTotal?: number;
  history: MonitoringHistoryRow[];
  sessions: MonitoringSession[];
}

// ── ケアプラン Excel 全体 ──

export interface ImportedCareplan {
  fileName: string;
  schemaVersion: 1;
  table1: ExcelTable1;
  table2: ExcelTable2;
  table3: ExcelTable3;
  table4: ExcelTable4;
  table5: ExcelTable5;
  monitoring: ExcelMonitoring;
  /** 生のシート名一覧 */
  sheetNames: string[];
  /** パーサが気づいた軽微な警告 */
  warnings: string[];
}

// ── フェイスシート ──

export interface EmergencyContact {
  no: number;
  name: string;
  relation: string;
  tel: string;
  note: string;
}

export interface FamilyMember {
  no: number;
  name: string;
  relation: string;
  age: string;
  liveWith: string;
  note: string;
}

export interface FaceSheetBasic {
  name: string;
  furigana: string;
  gender: string;
  birthDate: DateValue;
  address: string;
  tel: string;
}

export interface FaceSheetInsurance {
  insuredNumber: string;
  insurerNumber: string;
  copaymentRatio: string;
  medicalInsurance: string;
  disabilityCert: string;
  welfare: string;
}

export interface FaceSheetCertification {
  careLevel: string;
  certPeriod: DateRangeValue;
  certDate: DateValue;
  kindGroup: SelectionGroup;
  limitAmount: string;
  reason: string;
}

export interface FaceSheetIndependence {
  physical: SelectionGroup;
  cognitive: SelectionGroup;
}

export interface FaceSheetMedical {
  doctor: string;
  diagnosis1: string;
  diagnosis2: string;
  onsetDate: string;
  stability: string;
  specialMedical: string;
  managementNeed: string;
  remarks: string;
}

export interface FaceSheetComplaint {
  userWishes: string;
  familyWishes: string;
}

export interface FaceSheetSection {
  title: string;
  rows: string[][];
}

export interface ImportedFaceSheet {
  basic: FaceSheetBasic;
  insurance: FaceSheetInsurance;
  certification: FaceSheetCertification;
  independence: FaceSheetIndependence;
  medical: FaceSheetMedical;
  emergencyContacts: EmergencyContact[];
  family: FamilyMember[];
  familyNote: string;
  complaint: FaceSheetComplaint;
  currentServices: string[];
  /** 各セクション (■ で始まる見出しごと) を原文ベースで保持 */
  rawSections: FaceSheetSection[];
  /** 事業所名等のヘッダ情報（2行目の「燦々ほーむあらかわ（小規模多機能型居宅介護）」等） */
  facilityHeader?: string;
}

// ── アセスメント ──

export interface AssessmentItem {
  label: string;
  selection: SelectionGroup;
  evidence: EvidenceValue;
}

export interface AssessmentSection {
  title: string;
  items: AssessmentItem[];
  freeText?: string;
}

export interface ImportedAssessment {
  health: AssessmentSection;
  adl: AssessmentSection;
  iadl: AssessmentSection;
  cognition: AssessmentSection;
  remarks: AssessmentSection;
  rawSections: FaceSheetSection[];
}

// ── なんでもボックス ──

export interface AnythingBoxEntry {
  dateRaw: string;
  dateIso?: string;
  category: CategoryTag;
  content: string;
  source: string;
}

export type ImportedAnythingBox = AnythingBoxEntry[];

// ── 主治医意見書 ──

export interface DoctorOpinionSection {
  title: string;
  /** 自由入力項目 */
  fields: Array<{ label: string; value: string }>;
  /** チェックボックス群 */
  selections: Array<{ label: string; group: SelectionGroup }>;
  freeText?: string;
}

export interface ImportedDoctorOpinion {
  header: {
    writtenDate: string;
    lastExamDate: string;
    opinionKind: SelectionGroup;
    doctorName: string;
    clinic: string;
    tel: string;
  };
  sections: DoctorOpinionSection[];
}

// ── 認定調査票 ──

export interface CertificationSurveyItem {
  /** 例 "1-3 寝返り" → no="1-3", label="寝返り" */
  no: string;
  label: string;
  selection: SelectionGroup;
}

export interface CertificationSurveyGroup {
  title: string;
  items: CertificationSurveyItem[];
}

export interface ImportedCertificationSurvey {
  overview: {
    surveyDate: string;
    surveyor: string;
    pastCert: SelectionGroup;
    previousResult: string;
    currentLife: string;
    familyStatus: SelectionGroup;
  };
  groups: CertificationSurveyGroup[];
  remarks: string;
}

// ── アセスメント Excel 全体 ──

export interface ImportedAssessmentBundle {
  fileName: string;
  schemaVersion: 1;
  faceSheet: ImportedFaceSheet;
  assessment: ImportedAssessment;
  anythingBox: ImportedAnythingBox;
  doctorOpinion: ImportedDoctorOpinion;
  certificationSurvey: ImportedCertificationSurvey;
  sheetNames: string[];
  warnings: string[];
}

// ── API types ──

export type ImportKind = 'careplan' | 'assessment_facesheet' | 'unknown';

export interface ExtractedUser {
  name: string;
  kana?: string;
  birthDate?: string;
  insuredNumber?: string;
  insurerNumber?: string;
}

export interface UserMatchCandidate {
  folderId: string;
  folderName: string;
  name: string;
  score?: number;
  reason?: string;
}

export interface UserMatch {
  status: 'matched' | 'candidates' | 'not_found';
  folderId?: string;
  folderName?: string;
  candidates: UserMatchCandidate[];
}

export interface PreviewItem {
  fileId: string;
  fileName: string;
  kind: ImportKind;
  extractedUser: ExtractedUser | null;
  userMatch: UserMatch;
  summary: {
    sheets: string[];
    careLevel?: string;
    createdDate?: string;
    needsCount?: number;
    monitoringCount?: number;
    anythingBoxCount?: number;
  };
  warnings: string[];
}

export interface PreviewResponse {
  items: PreviewItem[];
}

export interface CommitRequestItem {
  fileId: string;
  userFolderId: string | null;
  createNewUser: { name: string; kana?: string; isPrivate: boolean } | null;
  options?: { overwriteDraft?: boolean };
}

export interface CommitResultArtifact {
  originalExcelUrl?: string;
  sheetUrl?: string;
  analysisJsonUrl?: string;
  draftId?: string;
}

export interface CommitResultItem {
  fileId: string;
  fileName?: string;
  kind: ImportKind;
  ok: boolean;
  artifacts: CommitResultArtifact;
  messages: string[];
}

export interface CommitResponse {
  results: CommitResultItem[];
}

// ── 参考情報 API レスポンス ──

export interface LatestCareplanResponse {
  found: boolean;
  source?: {
    fileId: string;
    fileName: string;
    modifiedTime: string;
  };
  data?: ImportedCareplan;
}

export interface LatestAssessmentResponse {
  found: boolean;
  source?: {
    kind: 'json' | 'sheet';
    fileId: string;
    fileName: string;
    modifiedTime: string;
    tabName?: string;
  };
  data?: ImportedAssessmentBundle;
}
