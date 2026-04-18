export type ImportKind = 'careplan' | 'assessment_facesheet' | 'unknown';

export interface ImportedUser {
  name: string;
  kana?: string | null;
  birthDate?: string;
  insuredNumber?: string;
  insurerNumber?: string;
}

export interface DateRangeValue {
  raw: string;
  fromIso?: string;
  toIso?: string;
}

export interface T2Service {
  content: string;
  insurance: boolean;
  kind: string;
  provider: string;
  frequency: string;
  period: DateRangeValue;
}

export interface T2Need {
  no: number;
  need: string;
  longGoal: string;
  longGoalPeriod: DateRangeValue;
  shortGoal: string;
  shortGoalPeriod: DateRangeValue;
  services: T2Service[];
}

export interface T3Slot {
  section: '深夜'|'早朝'|'午前'|'午後'|'夜間'|'';
  time: string;
  byWeekday: Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun', string>;
}

export interface MonitoringSession {
  no: number;
  values: Record<string, string>;
}

export interface CareplanImportData {
  sheets: string[];
  table1: Record<string, any>;
  table2: T2Need[];
  table3: {
    timeSlots: T3Slot[];
    dailyActivities: string;
    weeklyExtraServices: string;
  };
  table4: Record<string, any>;
  table5: Array<{ date: string; item: string; content: string }>;
  monitoring: {
    history: Array<{ date: string; result: string }>;
    sessions: MonitoringSession[];
  };
  rawSheets?: Array<Record<string, any>>;
}

export interface AssessmentImportData {
  sheets: string[];
  faceSheet: Record<string, any>;
  assessment: Record<string, any>;
  anythingBox: Array<Record<string, any>>;
  doctorOpinion: Record<string, any>;
  certificationSurvey: Record<string, any>;
  rawSheets?: Array<Record<string, any>>;
}
