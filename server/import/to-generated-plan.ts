import type { CareplanImportData } from '../../shared/types/imported.js';
import type { GeneratedPlan } from '../types/plan.js';

const empty = (v: any) => (v == null ? '' : String(v));

export function toGeneratedPlan(data: CareplanImportData): GeneratedPlan {
  return {
    id: 'imported',
    label: 'I案（取込）',
    summary: 'Excelから取り込んだ現行ケアプラン',
    table1: {
      userWishes: empty(data.table1.assessmentResult),
      familyWishes: empty(data.table1.assessmentResult),
      assessmentResult: empty(data.table1.assessmentResult),
      committeeOpinion: empty(data.table1.committeeOpinion),
      totalPolicy: empty(data.table1.totalPolicy),
      livingSupportReason: empty(data.table1.livingSupportReason),
    },
    table2: data.table2.map(n => ({
      need: empty(n.need),
      goals: [{
        longGoal: empty(n.longGoal),
        longPeriod: empty(n.longGoalPeriod.raw),
        shortGoal: empty(n.shortGoal),
        shortPeriod: empty(n.shortGoalPeriod.raw),
        services: n.services.map(s => ({
          content: empty(s.content),
          insurance: s.insurance ? '○' : '',
          type: empty(s.kind),
          provider: empty(s.provider),
          frequency: empty(s.frequency),
          period: empty(s.period.raw),
        })),
      }],
    })),
    table3: {
      schedule: data.table3.timeSlots.flatMap(slot => {
        const tm = /^([0-9]{1,2}):(\d{2})/.exec(slot.time || '');
        const sh = tm ? parseInt(tm[1], 10) : 0;
        const sm = tm ? parseInt(tm[2], 10) : 0;
        return Object.entries(slot.byWeekday)
          .filter(([,v]) => !!v)
          .map(([k,v]) => ({ day: k as any, startHour: sh, startMin: sm, endHour: sh + 1, endMin: sm, label: v }));
      }),
      dailyActivities: (data.table3.dailyActivities || '').split('\n').filter(Boolean).map(v => ({ time: '', activity: v })),
      weeklyService: empty(data.table3.weeklyExtraServices),
    },
  };
}
