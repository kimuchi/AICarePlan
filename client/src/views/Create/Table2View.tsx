import React from 'react';
import { S } from '../../styles';
import type { GeneratedPlan, BusinessMode } from '../../api';

interface Props {
  plan: GeneratedPlan;
  userName: string;
  meta: { createDate: string };
  mode: BusinessMode;
  onUpdate?: (table2: GeneratedPlan['table2']) => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%', border: 'none', background: 'transparent', padding: '2px 4px',
  fontSize: 12, fontFamily: 'Noto Sans JP', lineHeight: 1.5, resize: 'vertical',
};

export default function Table2View({ plan, userName, meta, mode, onUpdate }: Props) {
  const subtitle = mode === 'shoki' ? ' 兼小規模多機能型居宅介護計画書' : '';
  const t2 = plan.table2;

  const update = (newT2: GeneratedPlan['table2']) => { if (onUpdate) onUpdate(newT2); };

  const updateNeed = (ni: number, val: string) => {
    const u = [...t2]; u[ni] = { ...u[ni], need: val }; update(u);
  };
  const updateGoal = (ni: number, gi: number, field: string, val: string) => {
    const u = [...t2];
    const goals = [...u[ni].goals];
    goals[gi] = { ...goals[gi], [field]: val };
    u[ni] = { ...u[ni], goals }; update(u);
  };
  const updateService = (ni: number, gi: number, si: number, field: string, val: string) => {
    const u = [...t2];
    const goals = [...u[ni].goals];
    const services = [...goals[gi].services];
    services[si] = { ...services[si], [field]: val };
    goals[gi] = { ...goals[gi], services };
    u[ni] = { ...u[ni], goals }; update(u);
  };
  const addNeed = () => {
    update([...t2, { need: '', goals: [{ longGoal: '', longPeriod: '', shortGoal: '', shortPeriod: '', services: [{ content: '', insurance: '', type: '', provider: '', frequency: '', period: '' }] }] }]);
  };
  const addGoal = (ni: number) => {
    const u = [...t2];
    const goals = [...u[ni].goals, { longGoal: '', longPeriod: '', shortGoal: '', shortPeriod: '', services: [{ content: '', insurance: '', type: '', provider: '', frequency: '', period: '' }] }];
    u[ni] = { ...u[ni], goals }; update(u);
  };
  const addService = (ni: number, gi: number) => {
    const u = [...t2];
    const goals = [...u[ni].goals];
    const services = [...goals[gi].services, { content: '', insurance: '', type: '', provider: '', frequency: '', period: '' }];
    goals[gi] = { ...goals[gi], services };
    u[ni] = { ...u[ni], goals }; update(u);
  };
  const removeNeed = (ni: number) => { update(t2.filter((_, i) => i !== ni)); };
  const removeService = (ni: number, gi: number, si: number) => {
    const u = [...t2];
    const goals = [...u[ni].goals];
    goals[gi] = { ...goals[gi], services: goals[gi].services.filter((_, i) => i !== si) };
    if (goals[gi].services.length === 0) {
      u[ni] = { ...u[ni], goals: goals.filter((_, i) => i !== gi) };
    } else {
      u[ni] = { ...u[ni], goals };
    }
    update(u);
  };

  const moveNeed = (ni: number, dir: -1 | 1) => {
    const ti = ni + dir;
    if (ti < 0 || ti >= t2.length) return;
    const u = [...t2]; [u[ni], u[ti]] = [u[ti], u[ni]]; update(u);
  };
  const moveGoal = (ni: number, gi: number, dir: -1 | 1) => {
    const goals = [...t2[ni].goals];
    const ti = gi + dir;
    if (ti < 0 || ti >= goals.length) return;
    [goals[gi], goals[ti]] = [goals[ti], goals[gi]];
    const u = [...t2]; u[ni] = { ...u[ni], goals }; update(u);
  };
  const moveService = (ni: number, gi: number, si: number, dir: -1 | 1) => {
    const services = [...t2[ni].goals[gi].services];
    const ti = si + dir;
    if (ti < 0 || ti >= services.length) return;
    [services[si], services[ti]] = [services[ti], services[si]];
    const u = [...t2];
    const goals = [...u[ni].goals];
    goals[gi] = { ...goals[gi], services };
    u[ni] = { ...u[ni], goals }; update(u);
  };

  const E = onUpdate != null; // editable

  return (
    <div style={S.formSheet}>
      <div style={S.sheetHeader}>
        <span style={S.sheetTag}>第2表</span>
        <h3 style={S.sheetTitle}>
          居宅サービス計画書(2)
          {subtitle && <span style={{ fontSize: 12, fontWeight: 400 }}>{subtitle}</span>}
        </h3>
        <div style={S.sheetDate}>作成年月日 {meta.createDate}</div>
      </div>
      <div style={{ marginBottom: 6, fontSize: 13 }}>利用者名 <strong>{userName}</strong> 様</div>

      <table style={{ ...S.formTable, fontSize: 12 }}>
        <thead>
          <tr>
            <th rowSpan={2} style={S.thMain}>生活全般の解決すべき<br />課題(ニーズ)</th>
            <th colSpan={4} style={S.thMain}>目標</th>
            <th colSpan={6} style={S.thMain}>援助内容</th>
          </tr>
          <tr>
            <th style={S.thSub}>長期目標</th>
            <th style={S.thSub}>期間</th>
            <th style={S.thSub}>短期目標</th>
            <th style={S.thSub}>期間</th>
            <th style={S.thSub}>サービス内容</th>
            <th style={{ ...S.thSub, width: 30 }}>※1</th>
            <th style={S.thSub}>サービス種別</th>
            <th style={{ ...S.thSub, width: 30 }}>※2</th>
            <th style={S.thSub}>頻度</th>
            <th style={S.thSub}>期間</th>
          </tr>
        </thead>
        <tbody>
          {t2.map((item, ni) => {
            const totalServiceRows = item.goals.reduce((sum, g) => sum + Math.max(g.services.length, 1), 0);
            const rows: React.ReactNode[] = [];
            item.goals.forEach((goal, gi) => {
              const svList = goal.services.length > 0 ? goal.services : [{ content: '', insurance: '', type: '', provider: '', frequency: '', period: '' }];
              svList.forEach((sv, si) => {
                rows.push(
                  <tr key={`${ni}-${gi}-${si}`}>
                    {gi === 0 && si === 0 && (
                      <td rowSpan={totalServiceRows + (E ? 1 : 0)} style={{ ...S.tdNeed, verticalAlign: 'top' }}>
                        {E ? <textarea style={{ ...inputStyle, minHeight: 60 }} value={item.need} onChange={e => updateNeed(ni, e.target.value)} />
                             : item.need}
                        {E && (
                          <div style={reorderRow}>
                            <button style={btnMove} disabled={ni === 0} onClick={() => moveNeed(ni, -1)} title="このニーズを上へ移動">↑</button>
                            <button style={btnMove} disabled={ni === t2.length - 1} onClick={() => moveNeed(ni, 1)} title="このニーズを下へ移動">↓</button>
                            <button style={btnDelInline} onClick={() => removeNeed(ni)}>削除</button>
                          </div>
                        )}
                      </td>
                    )}
                    {si === 0 && (
                      <>
                        <td rowSpan={svList.length} style={{ ...S.tdGoal, verticalAlign: 'top' }}>
                          {E ? <textarea style={{ ...inputStyle, minHeight: 40 }} value={goal.longGoal} onChange={e => updateGoal(ni, gi, 'longGoal', e.target.value)} /> : goal.longGoal}
                        </td>
                        <td rowSpan={svList.length} style={{ ...S.tdGoal, verticalAlign: 'top', fontSize: 11 }}>
                          {E ? <input style={inputStyle} value={goal.longPeriod} onChange={e => updateGoal(ni, gi, 'longPeriod', e.target.value)} /> : <span style={{ whiteSpace: 'pre-line' }}>{goal.longPeriod}</span>}
                        </td>
                        <td rowSpan={svList.length} style={{ ...S.tdGoal, verticalAlign: 'top' }}>
                          {E ? <textarea style={{ ...inputStyle, minHeight: 40 }} value={goal.shortGoal} onChange={e => updateGoal(ni, gi, 'shortGoal', e.target.value)} /> : goal.shortGoal}
                        </td>
                        <td rowSpan={svList.length} style={{ ...S.tdGoal, verticalAlign: 'top', fontSize: 11 }}>
                          {E ? <input style={inputStyle} value={goal.shortPeriod} onChange={e => updateGoal(ni, gi, 'shortPeriod', e.target.value)} /> : <span style={{ whiteSpace: 'pre-line' }}>{goal.shortPeriod}</span>}
                        </td>
                      </>
                    )}
                    <td style={{ ...S.tdService, position: 'relative' }}>
                      {E ? <textarea style={{ ...inputStyle, minHeight: 40 }} value={sv.content} onChange={e => updateService(ni, gi, si, 'content', e.target.value)} />
                           : <span style={{ whiteSpace: 'pre-line' }}>{sv.content}</span>}
                    </td>
                    <td style={{ ...S.tdService, textAlign: 'center' }}>
                      {E ? <select style={{ ...inputStyle, width: 30, textAlign: 'center' }} value={sv.insurance} onChange={e => updateService(ni, gi, si, 'insurance', e.target.value)}>
                             <option value="">-</option><option value="○">○</option>
                           </select>
                         : sv.insurance}
                    </td>
                    <td style={S.tdService}>
                      {E ? <input style={inputStyle} value={sv.type} onChange={e => updateService(ni, gi, si, 'type', e.target.value)} />
                           : <span style={{ whiteSpace: 'pre-line' }}>{sv.type}</span>}
                    </td>
                    <td style={S.tdService}>
                      {E ? <input style={inputStyle} value={sv.provider} onChange={e => updateService(ni, gi, si, 'provider', e.target.value)} />
                           : <span style={{ whiteSpace: 'pre-line' }}>{sv.provider}</span>}
                    </td>
                    <td style={{ ...S.tdService, fontSize: 11 }}>
                      {E ? <input style={inputStyle} value={sv.frequency} onChange={e => updateService(ni, gi, si, 'frequency', e.target.value)} />
                           : <span style={{ whiteSpace: 'pre-line' }}>{sv.frequency}</span>}
                    </td>
                    <td style={{ ...S.tdService, fontSize: 11, position: 'relative' }}>
                      {E ? <input style={inputStyle} value={sv.period} onChange={e => updateService(ni, gi, si, 'period', e.target.value)} />
                           : <span style={{ whiteSpace: 'pre-line' }}>{sv.period}</span>}
                      {E && (
                        <div style={svActions}>
                          <button style={btnMoveSm} disabled={si === 0} onClick={() => moveService(ni, gi, si, -1)} title="このサービスを上へ">↑</button>
                          <button style={btnMoveSm} disabled={si === svList.length - 1} onClick={() => moveService(ni, gi, si, 1)} title="このサービスを下へ">↓</button>
                          <button style={btnDelSm} onClick={() => removeService(ni, gi, si)} title="このサービスを削除">×</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              });
              // サービス追加・目標並び替え行
              if (E) {
                rows.push(
                  <tr key={`add-sv-${ni}-${gi}`}>
                    <td colSpan={6} style={{ border: '1px solid #e2e8f0', padding: '2px 4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <button style={btnAdd} onClick={() => addService(ni, gi)}>+ サービス追加</button>
                        <button style={btnAdd} onClick={() => addGoal(ni)}>+ 目標追加</button>
                        <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>目標{gi + 1}:</span>
                        <button style={btnMove} disabled={gi === 0} onClick={() => moveGoal(ni, gi, -1)} title="この目標を上へ">↑</button>
                        <button style={btnMove} disabled={gi === item.goals.length - 1} onClick={() => moveGoal(ni, gi, 1)} title="この目標を下へ">↓</button>
                      </div>
                    </td>
                  </tr>
                );
              }
            });
            return rows;
          })}
        </tbody>
      </table>

      {E && (
        <button style={{ ...btnAdd, marginTop: 8, padding: '6px 16px' }} onClick={addNeed}>
          + ニーズを追加
        </button>
      )}

      <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, lineHeight: 1.6 }}>
        ※1 「保険給付対象か否かの区分」について、保険給付対象内サービスについては○印を付す。<br />
        ※2 「当該サービス提供を行う事業者」について記入する。
      </div>
    </div>
  );
}

const btnAdd: React.CSSProperties = {
  background: 'none', border: '1px dashed #94a3b8', color: '#64748b',
  fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', marginRight: 4,
};
const reorderRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 3, marginTop: 4, flexWrap: 'wrap',
};
const btnMove: React.CSSProperties = {
  background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155',
  fontSize: 11, lineHeight: 1, padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
  minWidth: 22,
};
const btnDelInline: React.CSSProperties = {
  background: 'none', border: '1px solid #fecaca', color: '#dc2626',
  fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
};
const svActions: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end',
  marginTop: 2,
};
const btnMoveSm: React.CSSProperties = {
  background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155',
  fontSize: 9, lineHeight: 1, padding: '1px 4px', borderRadius: 3, cursor: 'pointer',
  minWidth: 18,
};
const btnDelSm: React.CSSProperties = {
  background: 'none', border: '1px solid #fecaca', color: '#dc2626',
  fontSize: 9, lineHeight: 1, padding: '1px 4px', borderRadius: 3, cursor: 'pointer',
};
