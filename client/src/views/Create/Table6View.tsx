import React from 'react';
import { S } from '../../styles';
import type { GeneratedPlan } from '../../api';

interface Props {
  plan: GeneratedPlan;
  userName: string;
}

export default function Table6View({ plan, userName }: Props) {
  const rows = plan.table6 || [];
  if (rows.length === 0) {
    return <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>第6表のデータがありません（取込ファイルに第6表が含まれていない場合は表示できません）。</div>;
  }
  const columns = Array.from(rows.reduce<Set<string>>((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set()));
  return (
    <div style={{ ...S.settingsPanel, marginTop: 10 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>第6表　サービス利用票</h3>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>利用者名: {userName || '-'} / 行数: {rows.length}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              {columns.map(c => (
                <th key={c} style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', whiteSpace: 'nowrap' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map(c => (
                  <td key={c} style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>{row[c] || ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
