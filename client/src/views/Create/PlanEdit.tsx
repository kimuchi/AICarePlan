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
  currentPlanId?: string | null;
  onShare?: (planId: string, emails: string) => void;
}

const PLAN_COLORS: Record<string, string> = {
  P1: '#2563eb',
  P2: '#059669',
  P3: '#d97706',
};

export default function PlanEdit({
  plans, existingPlan, userMeta, planMeta, mode,
  onSaveDraft, onExport, currentPlanId, onShare,
}: Props) {
  const [activePlanId, setActivePlanId] = useState(
    plans.length > 0 ? plans[0].id : (existingPlan ? 'EXISTING' : '')
  );
  const [activeTable, setActiveTable] = useState<'table1' | 'table2' | 'table3'>('table1');
  const [editedPlans, setEditedPlans] = useState<Record<string, GeneratedPlan>>({});
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareEmails, setShareEmails] = useState('');

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

      {/* Share dialog */}
      {showShareDialog && currentPlanId && onShare && (
        <div style={{
          marginTop: 16, padding: '16px 20px', background: '#f0f7ff',
          borderRadius: 12, border: '1px solid #bfdbfe',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2942', marginBottom: 8 }}>プランを共有</div>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
            共有先のメールアドレスを入力してください（カンマ区切りで複数可、全員共有は * ）
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...S.input, flex: 1 }}
              placeholder="user@example.com, user2@example.com"
              value={shareEmails}
              onChange={e => setShareEmails(e.target.value)}
            />
            <button
              style={{ ...S.primaryBtn, padding: '8px 16px', fontSize: 13 }}
              onClick={() => { onShare(currentPlanId, shareEmails); setShowShareDialog(false); setShareEmails(''); }}
            >
              共有
            </button>
            <button
              style={{ ...S.secondaryBtn, padding: '8px 12px', fontSize: 13 }}
              onClick={() => setShowShareDialog(false)}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      <div style={S.stepActions}>
        <button style={S.secondaryBtn} onClick={() => onSaveDraft(activePlan)}>
          保存
        </button>
        <button style={S.secondaryBtn} onClick={() => setShowShareDialog(!showShareDialog)}>
          共有
        </button>
        <button
          style={{ ...S.primaryBtn, background: '#0f7c3f' }}
          onClick={() => onExport(activePlan)}
        >
          Googleスプレッドシートにエクスポート
        </button>
      </div>
    </div>
  );
}
