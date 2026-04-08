import React, { useState } from 'react';
import { S } from '../../styles';
import type { GeneratedPlan, BusinessMode } from '../../api';
import Table1View from './Table1View';
import Table2View from './Table2View';
import Table3View from './Table3View';

interface UserMeta {
  name: string;
  birthDate: string;
  address: string;
  careLevel: string;
  certDate: string;
  certPeriod: { start: string; end: string };
}

interface PlanMeta {
  creator: string;
  facility: string;
  facilityAddress: string;
  createDate: string;
  firstCreateDate: string;
}

interface Props {
  plans: GeneratedPlan[];
  existingPlan: GeneratedPlan | null;
  userMeta: UserMeta;
  planMeta: PlanMeta;
  mode: BusinessMode;
  onSaveDraft: (plan: GeneratedPlan) => void;
  onExport: (plan: GeneratedPlan) => void;
  onProceedExport: () => void;
  currentPlanId?: string | null;
  onShare?: (planId: string) => void;
}

const PLAN_COLORS: Record<string, string> = {
  P1: '#2563eb',
  P2: '#059669',
  P3: '#d97706',
};

export default function PlanEdit({
  plans, existingPlan, userMeta, planMeta, mode,
  onSaveDraft, onExport, onProceedExport, currentPlanId, onShare,
}: Props) {
  const [activePlanId, setActivePlanId] = useState(plans.length > 0 ? plans[plans.length - 1].id : 'EXISTING');
  const [activeTable, setActiveTable] = useState<'table1' | 'table2' | 'table3'>('table1');
  const [editedPlans, setEditedPlans] = useState<Record<string, GeneratedPlan>>({});

  const getActivePlan = (): GeneratedPlan | null => {
    if (activePlanId === 'EXISTING') return existingPlan;
    const edited = editedPlans[activePlanId];
    if (edited) return edited;
    return plans.find(p => p.id === activePlanId) || null;
  };

  const activePlan = getActivePlan();

  const handleTable1Update = (table1: GeneratedPlan['table1']) => {
    if (!activePlan || activePlanId === 'EXISTING') return;
    setEditedPlans(prev => ({
      ...prev,
      [activePlanId]: { ...activePlan, table1 },
    }));
  };

  if (!activePlan) return <p>プランが選択されていません</p>;

  return (
    <div>
      {/* Plan switcher */}
      <div style={S.planSwitcher}>
        <div style={S.planSwitcherLabel}>表示するプラン:</div>
        <div style={S.planSwitcherButtons}>
          {plans.map(p => (
            <button
              key={p.id}
              style={{
                ...S.planSwitchBtn,
                borderColor: activePlanId === p.id ? (PLAN_COLORS[p.id] || '#0f2942') : '#d1d9e0',
                background: activePlanId === p.id ? (PLAN_COLORS[p.id] || '#0f2942') : '#fff',
                color: activePlanId === p.id ? '#fff' : '#475569',
              }}
              onClick={() => setActivePlanId(p.id)}
            >
              {p.label}
            </button>
          ))}
          {existingPlan && (
            <button
              style={{
                ...S.planSwitchBtn,
                borderColor: activePlanId === 'EXISTING' ? '#7c3aed' : '#d1d9e0',
                background: activePlanId === 'EXISTING' ? '#7c3aed' : '#fff',
                color: activePlanId === 'EXISTING' ? '#fff' : '#475569',
              }}
              onClick={() => setActivePlanId('EXISTING')}
            >
              既存プラン
            </button>
          )}
        </div>
        <div style={{
          ...S.planSummary,
          borderLeftColor: activePlanId === 'EXISTING' ? '#7c3aed' : (PLAN_COLORS[activePlanId] || '#0f2942'),
          background: activePlanId === 'EXISTING' ? '#faf5ff' : '#f8fafc',
        }}>
          {activePlanId === 'EXISTING'
            ? '既存のケアプランを表示しています。'
            : activePlan.summary
          }
        </div>
      </div>

      {/* Table tabs */}
      <div style={S.tableTabs}>
        {([
          ['table1', '第1表'],
          ['table2', '第2表'],
          ['table3', '第3表 週間サービス計画表'],
        ] as const).map(([k, l]) => (
          <button
            key={k}
            style={activeTable === k ? S.tableTabActive : S.tableTab}
            onClick={() => setActiveTable(k)}
          >
            {l}
          </button>
        ))}
      </div>

      {activeTable === 'table1' && (
        <Table1View
          plan={activePlan}
          userName={userMeta.name}
          birthDate={userMeta.birthDate}
          address={userMeta.address}
          careLevel={userMeta.careLevel}
          certDate={userMeta.certDate}
          certPeriod={userMeta.certPeriod}
          meta={planMeta}
          mode={mode}
          onUpdate={handleTable1Update}
        />
      )}
      {activeTable === 'table2' && (
        <Table2View
          plan={activePlan}
          userName={userMeta.name}
          meta={planMeta}
          mode={mode}
        />
      )}
      {activeTable === 'table3' && (
        <Table3View
          plan={activePlan}
          userName={userMeta.name}
          meta={planMeta}
        />
      )}

      <div style={S.stepActions}>
        <button style={S.secondaryBtn} onClick={() => onSaveDraft(activePlan)}>下書き保存</button>
        {currentPlanId && onShare && (
          <button style={S.secondaryBtn} onClick={() => onShare(currentPlanId)}>
            共有
          </button>
        )}
        <button
          style={{ ...S.primaryBtn, background: '#0f7c3f' }}
          onClick={() => onExport(activePlan)}
        >
          Googleスプレッドシートにエクスポート
        </button>
        <button style={S.primaryBtn} onClick={onProceedExport}>
          エクスポート画面へ &rarr;
        </button>
      </div>
    </div>
  );
}
