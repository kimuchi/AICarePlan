import React from 'react';
import { S } from '../../styles';
import type { GeneratedPlan, BusinessMode } from '../../api';

interface Props {
  plan: GeneratedPlan;
  userName: string;
  meta: { createDate: string };
  mode: BusinessMode;
}

export default function Table2View({ plan, userName, meta, mode }: Props) {
  const subtitle = mode === 'shoki'
    ? ' 兼小規模多機能型居宅介護計画書'
    : '';

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
          {plan.table2.map((item, ni) => {
            const totalServiceRows = item.goals.reduce((sum, g) => sum + g.services.length, 0);
            const rows: React.ReactNode[] = [];
            item.goals.forEach((goal, gi) => {
              goal.services.forEach((sv, si) => {
                rows.push(
                  <tr key={`${ni}-${gi}-${si}`}>
                    {gi === 0 && si === 0 && (
                      <td rowSpan={totalServiceRows} style={{ ...S.tdNeed, verticalAlign: 'top' }}>{item.need}</td>
                    )}
                    {si === 0 && (
                      <>
                        <td rowSpan={goal.services.length} style={{ ...S.tdGoal, verticalAlign: 'top' }}>{goal.longGoal}</td>
                        <td rowSpan={goal.services.length} style={{ ...S.tdGoal, verticalAlign: 'top', whiteSpace: 'pre-line', fontSize: 11 }}>{goal.longPeriod}</td>
                        <td rowSpan={goal.services.length} style={{ ...S.tdGoal, verticalAlign: 'top' }}>{goal.shortGoal}</td>
                        <td rowSpan={goal.services.length} style={{ ...S.tdGoal, verticalAlign: 'top', whiteSpace: 'pre-line', fontSize: 11 }}>{goal.shortPeriod}</td>
                      </>
                    )}
                    <td style={{ ...S.tdService, whiteSpace: 'pre-line' }}>{sv.content}</td>
                    <td style={{ ...S.tdService, textAlign: 'center' }}>{sv.insurance}</td>
                    <td style={{ ...S.tdService, whiteSpace: 'pre-line' }}>{sv.type}</td>
                    <td style={{ ...S.tdService, whiteSpace: 'pre-line' }}>{sv.provider}</td>
                    <td style={{ ...S.tdService, whiteSpace: 'pre-line', fontSize: 11 }}>{sv.frequency}</td>
                    <td style={{ ...S.tdService, whiteSpace: 'pre-line', fontSize: 11 }}>{sv.period}</td>
                  </tr>
                );
              });
            });
            return rows;
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, lineHeight: 1.6 }}>
        ※1 「保険給付対象か否かの区分」について、保険給付対象内サービスについては○印を付す。<br />
        ※2 「当該サービス提供を行う事業者」について記入する。
      </div>
    </div>
  );
}
