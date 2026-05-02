import type { CareplanImportData } from '../types/imported.js';
import type { GeneratedPlan, Table4Data, Table5Entry, Table6Row } from '../types/plan.js';

const empty = (v: any) => (v == null ? '' : String(v));

export function toGeneratedPlan(data: CareplanImportData): GeneratedPlan {
  const t1 = data.table1 || {};
  const table4: Table4Data | undefined = data.table4 && Object.keys(data.table4).length > 0 ? {
    date: empty(data.table4.date),
    place: empty(data.table4.place),
    duration: empty(data.table4.duration),
    count: empty(data.table4.count),
    userAttendance: empty(data.table4.userAttendance),
    familyAttendance: empty(data.table4.familyAttendance),
    attendees: Array.isArray(data.table4.attendees) ? data.table4.attendees : [],
    discussedItems: empty(data.table4.discussedItems),
    discussionContent: empty(data.table4.discussionContent),
    conclusion: empty(data.table4.conclusion),
    remainingTasks: empty(data.table4.remainingTasks),
  } : undefined;
  const table5: Table5Entry[] | undefined = Array.isArray(data.table5) && data.table5.length > 0
    ? data.table5.map(e => ({ date: empty(e.date), item: empty(e.item), content: empty(e.content) }))
    : undefined;
  const table6: Table6Row[] | undefined = Array.isArray(data.table6) && data.table6.length > 0
    ? data.table6
    : undefined;

  return {
    id: 'imported',
    label: 'I案（取込）',
    summary: 'Excelから取り込んだケアプラン（取込）',
    table1: {
      userWishes: empty(t1.userWishes || t1.assessmentResult),
      familyWishes: empty(t1.familyWishes || t1.assessmentResult),
      assessmentResult: empty(t1.assessmentResult),
      committeeOpinion: empty(t1.committeeOpinion),
      totalPolicy: empty(t1.totalPolicy),
      livingSupportReason: empty(t1.livingSupportReason),
    },
    table2: data.table2.map((n: any) => ({
      need: empty(n.need),
      goals: [{
        longGoal: empty(n.longGoal),
        longPeriod: empty(n.longGoalPeriod?.raw),
        shortGoal: empty(n.shortGoal),
        shortPeriod: empty(n.shortGoalPeriod?.raw),
        services: (n.services || []).map((s: any) => ({
          content: empty(s.content),
          insurance: s.insurance ? '○' : '',
          type: empty(s.kind),
          provider: empty(s.provider),
          frequency: empty(s.frequency),
          period: empty(s.period?.raw),
        })),
      }],
    })),
    table3: {
      schedule: data.table3.timeSlots.flatMap((slot: any) => {
        const tm = /^([0-9]{1,2}):(\d{2})/.exec(slot.time || '');
        const sh = tm ? parseInt(tm[1], 10) : 0;
        const sm = tm ? parseInt(tm[2], 10) : 0;
        return Object.entries(slot.byWeekday)
          .filter(([,v]) => !!v)
          .map(([k,v]) => ({ day: k as any, startHour: sh, startMin: sm, endHour: sh + 1, endMin: sm, label: String(v || '') }));
      }),
      dailyActivities: (data.table3.dailyActivities || '').split('\n').filter(Boolean).map(v => {
        const s = v.trim();
        const m = /^(\d{1,2})\s*[:：]\s*(\d{1,2})\s*(.*)$/.exec(s);
        if (m) {
          const hh = m[1].padStart(2, '0');
          const mm = m[2].padStart(2, '0');
          return { time: `${hh}:${mm}`, activity: m[3].trim() };
        }
        return { time: '', activity: s };
      }),
      weeklyService: empty(data.table3.weeklyExtraServices),
    },
    ...(table4 ? { table4 } : {}),
    ...(table5 ? { table5 } : {}),
    ...(table6 ? { table6 } : {}),
  };
}
