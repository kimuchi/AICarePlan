import React, { useState } from 'react';
import { S } from '../../styles';
import type { GeneratedPlan } from '../../api';

interface Props {
  plan: GeneratedPlan;
  userName: string;
  meta: { createDate: string };
  onUpdate?: (table3: GeneratedPlan['table3']) => void;
}

const DAYS = [
  { key: 'mon', label: '月' }, { key: 'tue', label: '火' }, { key: 'wed', label: '水' },
  { key: 'thu', label: '木' }, { key: 'fri', label: '金' }, { key: 'sat', label: '土' }, { key: 'sun', label: '日' },
];

const SERVICE_PRESETS = [
  { label: '通い', color: '#2563eb', bg: '#dbeafe' },
  { label: '訪問', color: '#059669', bg: '#dcfce7' },
  { label: '泊まり', color: '#7c3aed', bg: '#ede9fe' },
  { label: '訪問看護', color: '#0891b2', bg: '#cffafe' },
  { label: '訪問診療', color: '#dc2626', bg: '#fef2f2' },
  { label: 'デイサービス', color: '#ca8a04', bg: '#fef9c3' },
];

function getPeriodForHour(h: number): string {
  if (h < 6) return '深夜';
  if (h < 8) return '早朝';
  if (h < 12) return '午前';
  if (h < 18) return '午後';
  if (h < 22) return '夜間';
  return '深夜';
}

function getServiceStyle(label: string) {
  const preset = SERVICE_PRESETS.find(p => label.includes(p.label));
  return preset || { label, color: '#475569', bg: '#f1f5f9' };
}

export default function Table3View({ plan, userName, meta, onUpdate }: Props) {
  const allHours = Array.from({ length: 12 }, (_, i) => i * 2);
  const [addingTo, setAddingTo] = useState<{ day: string; hour: number } | null>(null);
  const [newLabel, setNewLabel] = useState('通い');
  const [newStart, setNewStart] = useState('9:30');
  const [newEnd, setNewEnd] = useState('15:30');

  const E = onUpdate != null;
  const t3 = plan.table3;

  const update = (newT3: GeneratedPlan['table3']) => { if (onUpdate) onUpdate(newT3); };

  const addSchedule = () => {
    if (!addingTo) return;
    const [sh, sm] = newStart.split(':').map(Number);
    const [eh, em] = newEnd.split(':').map(Number);
    const entry = { day: addingTo.day, startHour: sh || 0, startMin: sm || 0, endHour: eh || 0, endMin: em || 0, label: newLabel };
    update({ ...t3, schedule: [...t3.schedule, entry] });
    setAddingTo(null);
  };

  const removeSchedule = (idx: number) => {
    update({ ...t3, schedule: t3.schedule.filter((_, i) => i !== idx) });
  };

  const updateActivity = (idx: number, field: 'time' | 'activity', val: string) => {
    const acts = [...t3.dailyActivities];
    acts[idx] = { ...acts[idx], [field]: val };
    update({ ...t3, dailyActivities: acts });
  };
  const addActivity = () => {
    update({ ...t3, dailyActivities: [...t3.dailyActivities, { time: '', activity: '' }] });
  };
  const removeActivity = (idx: number) => {
    update({ ...t3, dailyActivities: t3.dailyActivities.filter((_, i) => i !== idx) });
  };

  // Period grouping
  const periodGroups: Array<{ period: string; hours: number[] }> = [];
  let currentPeriod: string | null = null;
  allHours.forEach(h => {
    const p = getPeriodForHour(h);
    if (p !== currentPeriod || h === 22) {
      periodGroups.push({ period: p, hours: [h] });
      currentPeriod = p;
    } else {
      periodGroups[periodGroups.length - 1].hours.push(h);
    }
  });

  const getServicesForCell = (day: string, hour: number) => {
    return t3.schedule
      .map((s, idx) => ({ ...s, idx }))
      .filter(s => {
        if (s.day !== day) return false;
        const sStart = s.startHour + s.startMin / 60;
        const sEnd = s.endHour + s.endMin / 60;
        return sStart < hour + 2 && sEnd > hour;
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
          <col style={{ width: '18%' }} />
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
            const dailyAct = t3.dailyActivities.find(a => {
              const hh = parseInt(a.time?.split(':')[0] || '-1', 10);
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
                  const svs = getServicesForCell(d.key, h);
                  const cellKey = `${d.key}-${h}`;
                  return (
                    <td
                      key={d.key}
                      style={{ ...S.scheduleCell, cursor: E ? 'pointer' : 'default', minHeight: 42 }}
                      onClick={E ? () => {
                        setAddingTo({ day: d.key, hour: h });
                        setNewStart(`${h}:00`);
                        setNewEnd(`${h + 2}:00`);
                      } : undefined}
                    >
                      {svs.map(sv => {
                        const style = getServiceStyle(sv.label);
                        return (
                          <div key={sv.idx} style={{
                            ...S.serviceBlock,
                            background: style.bg,
                            borderColor: style.color,
                            color: style.color,
                            position: 'relative',
                            marginBottom: 2,
                          }}>
                            <div style={{ fontWeight: 700 }}>{sv.label}</div>
                            <div style={{ fontSize: 9 }}>
                              {String(sv.startHour).padStart(2, '0')}:{String(sv.startMin).padStart(2, '0')}〜
                              {String(sv.endHour).padStart(2, '0')}:{String(sv.endMin).padStart(2, '0')}
                            </div>
                            {E && (
                              <button
                                style={{ position: 'absolute', top: -4, right: -4, background: '#dc2626', color: '#fff', border: 'none', borderRadius: '50%', width: 14, height: 14, fontSize: 9, cursor: 'pointer', lineHeight: '14px', padding: 0 }}
                                onClick={e => { e.stopPropagation(); removeSchedule(sv.idx); }}
                              >×</button>
                            )}
                          </div>
                        );
                      })}
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
            <td colSpan={8} style={{ ...S.tdValue, minHeight: 36 }}>
              {E
                ? <textarea style={{ width: '100%', border: 'none', fontSize: 12, padding: 4, fontFamily: 'Noto Sans JP', resize: 'vertical', minHeight: 30 }}
                    value={t3.weeklyService} onChange={e => update({ ...t3, weeklyService: e.target.value })} />
                : t3.weeklyService
              }
            </td>
          </tr>
        </tbody>
      </table>

      {/* サービス追加ダイアログ */}
      {E && addingTo && (
        <div style={{
          marginTop: 12, padding: '16px 20px', background: '#f0f7ff',
          borderRadius: 12, border: '1px solid #bfdbfe',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f2942', marginBottom: 10 }}>
            サービスを追加（{DAYS.find(d => d.key === addingTo.day)?.label}曜 {addingTo.hour}:00〜）
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d9e0', fontSize: 12 }}
              value={newLabel} onChange={e => setNewLabel(e.target.value)}>
              {SERVICE_PRESETS.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
              <option value="">カスタム</option>
            </select>
            {newLabel === '' && (
              <input style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d9e0', fontSize: 12, width: 100 }}
                placeholder="サービス名" onChange={e => setNewLabel(e.target.value)} />
            )}
            <input type="time" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d9e0', fontSize: 12 }}
              value={newStart} onChange={e => setNewStart(e.target.value)} />
            <span style={{ fontSize: 12, color: '#64748b' }}>〜</span>
            <input type="time" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d9e0', fontSize: 12 }}
              value={newEnd} onChange={e => setNewEnd(e.target.value)} />
            <button style={{ padding: '6px 14px', borderRadius: 6, background: '#0f2942', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              onClick={addSchedule}>追加</button>
            <button style={{ padding: '6px 14px', borderRadius: 6, background: '#fff', color: '#64748b', border: '1px solid #d1d9e0', fontSize: 12, cursor: 'pointer' }}
              onClick={() => setAddingTo(null)}>キャンセル</button>
          </div>
        </div>
      )}

      {/* 日常活動の編集 */}
      {E && (
        <div style={{ marginTop: 12, padding: '12px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>主な日常生活上の活動</div>
          {t3.dailyActivities.map((a, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
              <input type="time" style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d9e0', fontSize: 12, width: 90 }}
                value={a.time} onChange={e => updateActivity(idx, 'time', e.target.value)} />
              <input style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d9e0', fontSize: 12 }}
                value={a.activity} placeholder="活動内容" onChange={e => updateActivity(idx, 'activity', e.target.value)} />
              <button style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 14, cursor: 'pointer', padding: '0 4px' }}
                onClick={() => removeActivity(idx)}>×</button>
            </div>
          ))}
          <button style={{ background: 'none', border: '1px dashed #94a3b8', color: '#64748b', fontSize: 11, padding: '3px 10px', borderRadius: 4, cursor: 'pointer', marginTop: 4 }}
            onClick={addActivity}>+ 活動を追加</button>
        </div>
      )}
    </div>
  );
}
