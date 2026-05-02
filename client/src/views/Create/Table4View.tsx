import React from 'react';
import { S } from '../../styles';
import type { GeneratedPlan } from '../../api';

interface Props {
  plan: GeneratedPlan;
  userName: string;
  onUpdate: (t4: NonNullable<GeneratedPlan['table4']>) => void;
}

const inS: React.CSSProperties = {
  width: '100%', border: '1px solid #e2e8f0', background: '#fff', padding: '6px 10px',
  fontSize: 13, fontFamily: 'Noto Sans JP', outline: 'none', borderRadius: 6,
};
const taS: React.CSSProperties = { ...inS, resize: 'vertical', lineHeight: 1.7, minHeight: 72 };
const cellS: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #e2e8f0', fontSize: 13 };
const labelS: React.CSSProperties = { ...cellS, background: '#f8fafc', fontWeight: 600, width: 160 };

export default function Table4View({ plan, userName, onUpdate }: Props) {
  const t4 = plan.table4;
  if (!t4) {
    return <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>第4表のデータがありません（取込時のみ利用できます）。</div>;
  }
  const set = <K extends keyof NonNullable<GeneratedPlan['table4']>>(k: K, v: NonNullable<GeneratedPlan['table4']>[K]) => onUpdate({ ...t4, [k]: v });

  return (
    <div style={{ ...S.settingsPanel, marginTop: 10 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>第4表　サービス担当者会議の要点</h3>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>利用者名: {userName || '-'}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', marginBottom: 16 }}>
        <tbody>
          <tr>
            <td style={labelS}>開催日</td><td style={cellS}><input style={inS} value={t4.date} onChange={e => set('date', e.target.value)} /></td>
            <td style={labelS}>開催場所</td><td style={cellS}><input style={inS} value={t4.place} onChange={e => set('place', e.target.value)} /></td>
          </tr>
          <tr>
            <td style={labelS}>開催時間</td><td style={cellS}><input style={inS} value={t4.duration} onChange={e => set('duration', e.target.value)} /></td>
            <td style={labelS}>開催回数</td><td style={cellS}><input style={inS} value={t4.count} onChange={e => set('count', e.target.value)} /></td>
          </tr>
          <tr>
            <td style={labelS}>本人の出席</td><td style={cellS}><input style={inS} value={t4.userAttendance} onChange={e => set('userAttendance', e.target.value)} /></td>
            <td style={labelS}>家族の出席</td><td style={cellS}><input style={inS} value={t4.familyAttendance} onChange={e => set('familyAttendance', e.target.value)} /></td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 14, fontWeight: 700, margin: '16px 0 8px' }}>会議出席者</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', marginBottom: 16 }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ ...cellS, textAlign: 'left', width: '50%' }}>所属（職種）</th>
            <th style={{ ...cellS, textAlign: 'left' }}>氏名</th>
          </tr>
        </thead>
        <tbody>
          {t4.attendees.length === 0 ? (
            <tr><td colSpan={2} style={{ ...cellS, color: '#94a3b8' }}>-</td></tr>
          ) : t4.attendees.map((a, i) => (
            <tr key={i}>
              <td style={cellS}><input style={inS} value={a.affiliation} onChange={e => { const arr = [...t4.attendees]; arr[i] = { ...arr[i], affiliation: e.target.value }; set('attendees', arr); }} /></td>
              <td style={cellS}><input style={inS} value={a.name} onChange={e => { const arr = [...t4.attendees]; arr[i] = { ...arr[i], name: e.target.value }; set('attendees', arr); }} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {[
        ['discussedItems', '検討した項目'],
        ['discussionContent', '検討内容'],
        ['conclusion', '結論'],
        ['remainingTasks', '残された課題（次回開催時期）'],
      ].map(([k, label]) => (
        <div key={k} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{label}</div>
          <textarea style={taS} value={(t4 as any)[k] || ''}
            onChange={e => set(k as any, e.target.value)} />
        </div>
      ))}
    </div>
  );
}
