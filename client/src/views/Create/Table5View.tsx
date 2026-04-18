import React from 'react';
import { S } from '../../styles';
import type { GeneratedPlan } from '../../api';

interface Props {
  plan: GeneratedPlan;
  userName: string;
  onUpdate: (t5: NonNullable<GeneratedPlan['table5']>) => void;
}

const inS: React.CSSProperties = {
  width: '100%', border: '1px solid #e2e8f0', background: '#fff', padding: '6px 10px',
  fontSize: 13, fontFamily: 'Noto Sans JP', outline: 'none', borderRadius: 6,
};
const taS: React.CSSProperties = { ...inS, resize: 'vertical', lineHeight: 1.7, minHeight: 48 };

export default function Table5View({ plan, userName, onUpdate }: Props) {
  const entries = plan.table5 || [];
  const setRow = (i: number, patch: Partial<{ date: string; item: string; content: string }>) => {
    const next = entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e));
    onUpdate(next);
  };
  const addRow = () => onUpdate([...entries, { date: '', item: '', content: '' }]);
  const removeRow = (i: number) => onUpdate(entries.filter((_, idx) => idx !== i));

  return (
    <div style={{ ...S.settingsPanel, marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>第5表　居宅介護支援経過</h3>
        <button style={{ ...S.smallBtn, marginTop: 0 }} onClick={addRow}>+ 行を追加</button>
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>利用者名: {userName || '-'} / 記録件数: {entries.length}</div>
      {entries.length === 0 ? (
        <div style={{ padding: 24, color: '#94a3b8', textAlign: 'center' }}>記録がありません。</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0' }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', width: 160 }}>年月日</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', width: 180 }}>項目</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>内容</th>
              <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <td style={{ padding: 6, borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                  <input style={inS} value={e.date} onChange={ev => setRow(i, { date: ev.target.value })} />
                </td>
                <td style={{ padding: 6, borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                  <input style={inS} value={e.item} onChange={ev => setRow(i, { item: ev.target.value })} />
                </td>
                <td style={{ padding: 6, borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                  <textarea style={taS} value={e.content} onChange={ev => setRow(i, { content: ev.target.value })} />
                </td>
                <td style={{ padding: 6, borderBottom: '1px solid #e2e8f0', textAlign: 'center', verticalAlign: 'top' }}>
                  <button style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 13 }} onClick={() => removeRow(i)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
