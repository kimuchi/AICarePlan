/**
 * ImportedCareplan を編集画面の GeneratedPlan に変換する。
 * 変換は loss-y（フェイスシート/モニタリング/第4表/第5表は GeneratedPlan の対象外）。
 * 失われる情報は ReferencePanel 側で参照可能なので問題ない。
 */

import { v4 as uuid } from 'uuid';
import type { ImportedCareplan } from '../types/imported.js';
import type {
  GeneratedPlan,
  Table1Data,
  NeedItem,
  GoalItem,
  ServiceItem,
  Table3Data,
  ScheduleEntry,
  DailyActivity,
} from '../types/plan.js';

type WeekdayKey = ScheduleEntry['day'];
const WEEKDAY_KEYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function parseTimeHHMM(s: string): { h: number; m: number } | null {
  const m = /^(\d{1,2})\s*[:：]\s*(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
}

/** 第3表の時間スロットを ScheduleEntry に変換する。空セルはスキップ。 */
function toScheduleEntries(t3: ImportedCareplan['table3']): ScheduleEntry[] {
  const out: ScheduleEntry[] = [];
  const slots = t3.timeSlots;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const next = slots[i + 1];
    const start = parseTimeHHMM(slot.time);
    if (!start) continue;
    const end = next ? parseTimeHHMM(next.time) : null;
    const endH = end ? end.h : Math.min(24, start.h + 2);
    const endM = end ? end.m : 0;
    for (const w of WEEKDAY_KEYS) {
      const v = (slot.byWeekday[w] || '').trim();
      if (!v) continue;
      out.push({
        day: w,
        startHour: start.h,
        startMin: start.m,
        endHour: endH,
        endMin: endM,
        label: v,
      });
    }
  }
  return out;
}

function toDailyActivities(t3: ImportedCareplan['table3']): DailyActivity[] {
  const text = t3.dailyActivities || '';
  if (!text) return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: DailyActivity[] = [];
  for (const line of lines) {
    const m = /^(\d{1,2}\s*[:：]\s*\d{1,2})\s+(.+)$/.exec(line);
    if (m) out.push({ time: m[1], activity: m[2] });
    else out.push({ time: '', activity: line });
  }
  return out;
}

function toTable1(c: ImportedCareplan): Table1Data {
  // userAndFamilyWishes には【本人の意向】【家族の意向】が混在する
  const wishesText = c.table1.userAndFamilyWishes || '';
  let user = '';
  let family = '';
  let assess = '';
  // 「【本人の意向】」「【家族の意向】」「【課題分析の結果】」等で分割
  const re = /【\s*([^】]+?)\s*】/g;
  const splits: Array<{ label: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(wishesText)) !== null) {
    splits.push({ label: m[1].trim(), index: m.index });
  }
  for (let i = 0; i < splits.length; i++) {
    const s = splits[i];
    const next = splits[i + 1];
    const start = s.index + (`【${s.label}】`.length);
    const body = wishesText.slice(start, next ? next.index : undefined).trim();
    if (/本人/.test(s.label)) user = body;
    else if (/家族/.test(s.label)) family = body;
    else if (/課題|分析|結果/.test(s.label)) assess = body;
  }
  if (!user && !family && !assess) {
    // ラベル無しの場合は丸ごと user に入れる
    user = wishesText;
  }
  return {
    userWishes: user,
    familyWishes: family,
    assessmentResult: assess,
    committeeOpinion: c.table1.committeeOpinion || '',
    totalPolicy: c.table1.totalPolicy || '',
    livingSupportReason: c.table1.livingSupportReason || '',
  };
}

function toTable2(c: ImportedCareplan): NeedItem[] {
  return c.table2.map((n) => {
    const services: ServiceItem[] = n.services.map((s) => ({
      content: s.content,
      insurance: s.insurance ? '○' : '',
      type: s.kind,
      provider: s.provider,
      frequency: s.frequency,
      period: s.period.raw || '',
    }));
    const goal: GoalItem = {
      longGoal: n.longGoal,
      longPeriod: n.longGoalPeriod.raw || '',
      shortGoal: n.shortGoal,
      shortPeriod: n.shortGoalPeriod.raw || '',
      services,
    };
    return {
      need: n.need,
      goals: [goal],
    };
  });
}

function toTable3(c: ImportedCareplan): Table3Data {
  return {
    schedule: toScheduleEntries(c.table3),
    dailyActivities: toDailyActivities(c.table3),
    weeklyService: c.table3.weeklyExtraServices || '',
  };
}

export function toGeneratedPlan(c: ImportedCareplan, label = 'I案 (取込)'): GeneratedPlan {
  return {
    id: uuid(),
    label,
    summary: 'Excel 取込から生成した既存ケアプラン。',
    table1: toTable1(c),
    table2: toTable2(c),
    table3: toTable3(c),
  };
}
