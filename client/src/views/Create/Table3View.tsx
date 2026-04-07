import React from 'react';
import { S } from '../../styles';
import type { GeneratedPlan } from '../../api';

interface Props {
  plan: GeneratedPlan;
  userName: string;
  meta: { createDate: string };
}

const DAYS = [
  { key: 'mon', label: '月' }, { key: 'tue', label: '火' }, { key: 'wed', label: '水' },
  { key: 'thu', label: '木' }, { key: 'fri', label: '金' }, { key: 'sat', label: '土' }, { key: 'sun', label: '日' },
];

function getPeriodForHour(h: number): string {
  if (h < 6) return '深夜';
  if (h < 8) return '早朝';
  if (h < 12) return '午前';
  if (h < 18) return '午後';
  if (h < 22) return '夜間';
  return '深夜';
}

export default function Table3View({ plan, userName, meta }: Props) {
  const allHours = Array.from({ length: 12 }, (_, i) => i * 2);

  // Period grouping
  const periodGroups: Array<{ period: string; hours: number[] }> = [];
  let currentPeriod: string | null = null;
  allHours.forEach((h) => {
    const p = getPeriodForHour(h);
    if (p !== currentPeriod || h === 22) {
      periodGroups.push({ period: p, hours: [h] });
      currentPeriod = p;
    } else {
      periodGroups[periodGroups.length - 1].hours.push(h);
    }
  });

  // セルの時間帯(hour〜hour+2)にサービスが重なっているか判定
  const getServiceForCell = (day: string, hour: number) => {
    const cellStart = hour;
    const cellEnd = hour + 2;
    return plan.table3.schedule.find(s => {
      if (s.day !== day) return false;
      const sStart = s.startHour + s.startMin / 60;
      const sEnd = s.endHour + s.endMin / 60;
      // サービスの時間帯がセルの時間帯と重なっているか
      return sStart < cellEnd && sEnd > cellStart;
    });
  };

  return (
    <div style={S.formSheet}>
      <div style={S.sheetHeader}>
        <span style={S.sheetTag}>第3表</span>
        <h3 style={S.sheetTitle}>週間サービス計画表</h3>
        <div style={S.sheetDate}>作成年月日 {meta.createDate}</div>
      </div>
      <div style={{ marginBottom: 6, fontSize: 13 }}>利用者名:<strong>{userName}</strong> 様</div>

      <table style={{ ...S.formTable, fontSize: 11, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 36 }} />
          <col style={{ width: 50 }} />
          {DAYS.map(d => <col key={d.key} />)}
          <col style={{ width: '20%' }} />
        </colgroup>
        <thead>
          <tr>
            <th colSpan={2} style={{ ...S.thMain, background: '#f1f5f9' }}></th>
            {DAYS.map(d => (
              <th key={d.key} style={{ ...S.thMain, background: '#f1f5f9' }}>{d.label}</th>
            ))}
            <th style={{ ...S.thMain, background: '#f1f5f9' }}>主な日常生活上の活動</th>
          </tr>
        </thead>
        <tbody>
          {periodGroups.map((pg, pgi) => pg.hours.map((h, hi) => {
            const dailyAct = plan.table3.dailyActivities.find(a => {
              const [hh] = a.time.split(':').map(Number);
              return hh >= h && hh < h + 2;
            });
            return (
              <tr key={`${pgi}-${hi}`}>
                {hi === 0 && (
                  <td rowSpan={pg.hours.length} style={S.periodCell}>
                    <div style={{ writingMode: 'vertical-rl', margin: '0 auto' }}>{pg.period}</div>
                  </td>
                )}
                <td style={S.timeCell}>{String(h).padStart(2, '0')}:00</td>
                {DAYS.map(d => {
                  const sv = getServiceForCell(d.key, h);
                  if (!sv) return <td key={d.key} style={S.scheduleCell} />;

                  const isKayoi = sv.label.includes('通い');
                  const isHoumon = sv.label.includes('訪問');
                  const borderColor = isKayoi ? '#2563eb' : isHoumon ? '#059669' : '#7c3aed';
                  const bgColor = isKayoi ? '#dbeafe' : isHoumon ? '#dcfce7' : '#ede9fe';

                  return (
                    <td key={d.key} style={S.scheduleCell}>
                      <div style={{
                        ...S.serviceBlock,
                        background: bgColor,
                        borderColor,
                        color: borderColor,
                      }}>
                        <div style={{ fontWeight: 700 }}>{sv.label}</div>
                        <div style={{ fontSize: 9 }}>
                          {String(sv.startHour).padStart(2, '0')}:{String(sv.startMin).padStart(2, '0')}〜
                          {String(sv.endHour).padStart(2, '0')}:{String(sv.endMin).padStart(2, '0')}
                        </div>
                      </div>
                    </td>
                  );
                })}
                <td style={S.dailyActCell}>
                  {dailyAct && <span>{dailyAct.time}…{dailyAct.activity}</span>}
                </td>
              </tr>
            );
          }))}
          <tr>
            <td colSpan={2} style={{ ...S.tdLabel, fontSize: 11, textAlign: 'center' }}>週単位以外<br />のサービス</td>
            <td colSpan={8} style={{ ...S.tdValue, minHeight: 36 }}>{plan.table3.weeklyService}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
