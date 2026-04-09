import React, { useState, useRef, useCallback } from 'react';
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
  onSaveDraft: (plan: GeneratedPlan, userMeta: UserMeta, planMeta: PlanMeta) => Promise<void> | void;
  onExport: (plan: GeneratedPlan, userMeta: UserMeta, planMeta: PlanMeta) => Promise<void> | void;
  currentPlanId?: string | null;
  onShare?: (planId: string, emails: string) => Promise<void> | void;
}

const PLAN_COLORS: Record<string, string> = {
  P1: '#2563eb',
  P2: '#059669',
  P3: '#d97706',
};

// UNDO用のスナップショット
interface Snapshot {
  editedPlans: Record<string, GeneratedPlan>;
  userMeta: UserMeta;
  planMeta: PlanMeta;
}

export default function PlanEdit({
  plans, existingPlan, userMeta: initialUserMeta, planMeta: initialPlanMeta, mode,
  onSaveDraft, onExport, currentPlanId, onShare,
}: Props) {
  const [activePlanId, setActivePlanId] = useState(
    plans.length > 0 ? plans[0].id : (existingPlan ? 'EXISTING' : '')
  );
  const [activeTable, setActiveTable] = useState<'table1' | 'table2' | 'table3'>('table1');
  const [editedPlans, setEditedPlans] = useState<Record<string, GeneratedPlan>>({});
  const [editedUserMeta, setEditedUserMeta] = useState<UserMeta>(initialUserMeta);
  const [editedPlanMeta, setEditedPlanMeta] = useState<PlanMeta>(initialPlanMeta);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareEmails, setShareEmails] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);

  // UNDO
  const undoStack = useRef<Snapshot[]>([]);
  const MAX_UNDO = 50;

  const pushUndo = useCallback(() => {
    undoStack.current.push({
      editedPlans: JSON.parse(JSON.stringify(editedPlans)),
      userMeta: { ...editedUserMeta, certPeriod: { ...editedUserMeta.certPeriod } },
      planMeta: { ...editedPlanMeta },
    });
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
  }, [editedPlans, editedUserMeta, editedPlanMeta]);

  const undo = () => {
    const snap = undoStack.current.pop();
    if (!snap) return;
    setEditedPlans(snap.editedPlans);
    setEditedUserMeta(snap.userMeta);
    setEditedPlanMeta(snap.planMeta);
  };

  const getActivePlan = (): GeneratedPlan | null => {
    if (activePlanId === 'EXISTING') return editedPlans['EXISTING'] || existingPlan;
    return editedPlans[activePlanId] || plans.find(p => p.id === activePlanId) || null;
  };

  const activePlan = getActivePlan();

  const updatePlan = (id: string, partial: Partial<GeneratedPlan>) => {
    pushUndo();
    const base = editedPlans[id] || (id === 'EXISTING' ? existingPlan : plans.find(p => p.id === id));
    if (!base) return;
    setEditedPlans(prev => ({ ...prev, [id]: { ...base, ...prev[id], ...partial } }));
  };

  const handleTable1Update = (table1: GeneratedPlan['table1']) => {
    updatePlan(activePlanId, { table1 });
  };
  const handleTable2Update = (table2: GeneratedPlan['table2']) => {
    updatePlan(activePlanId, { table2 });
  };
  const handleTable3Update = (table3: GeneratedPlan['table3']) => {
    updatePlan(activePlanId, { table3 });
  };
  const handleUserMetaUpdate = (um: UserMeta) => {
    pushUndo();
    setEditedUserMeta(um);
  };
  const handlePlanMetaUpdate = (pm: PlanMeta) => {
    pushUndo();
    setEditedPlanMeta(pm);
  };

  const handleSave = async () => {
    if (!activePlan || saving) return;
    setSaving(true);
    try { await onSaveDraft(activePlan, editedUserMeta, editedPlanMeta); } finally { setSaving(false); }
  };

  const handleExport = async () => {
    if (!activePlan || exporting) return;
    setExporting(true);
    try { await onExport(activePlan, editedUserMeta, editedPlanMeta); } finally { setExporting(false); }
  };

  const handleShare = async () => {
    if (!currentPlanId || !onShare || sharing) return;
    setSharing(true);
    try { await onShare(currentPlanId, shareEmails); setShowShareDialog(false); setShareEmails(''); }
    finally { setSharing(false); }
  };

  const busy = saving || exporting || sharing;

  if (!activePlan) return <p style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>プランが選択されていません</p>;

  return (
    <div>
      {/* Plan switcher + Undo button */}
      <div style={S.planSwitcher}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={S.planSwitcherLabel}>表示するプラン:</div>
          <button
            style={{ background: 'none', border: '1px solid #d1d9e0', borderRadius: 6, padding: '4px 12px', fontSize: 12, color: undoStack.current.length > 0 ? '#0f2942' : '#cbd5e1', cursor: undoStack.current.length > 0 ? 'pointer' : 'default', fontWeight: 600 }}
            disabled={undoStack.current.length === 0}
            onClick={undo}
          >
            元に戻す (Ctrl+Z)
          </button>
        </div>
        <div style={S.planSwitcherButtons}>
          {plans.map(p => (
            <button key={p.id}
              style={{ ...S.planSwitchBtn, borderColor: activePlanId === p.id ? (PLAN_COLORS[p.id] || '#0f2942') : '#d1d9e0', background: activePlanId === p.id ? (PLAN_COLORS[p.id] || '#0f2942') : '#fff', color: activePlanId === p.id ? '#fff' : '#475569' }}
              onClick={() => setActivePlanId(p.id)}>
              {p.label}
            </button>
          ))}
          {existingPlan && (
            <button
              style={{ ...S.planSwitchBtn, borderColor: activePlanId === 'EXISTING' ? '#7c3aed' : '#d1d9e0', background: activePlanId === 'EXISTING' ? '#7c3aed' : '#fff', color: activePlanId === 'EXISTING' ? '#fff' : '#475569' }}
              onClick={() => setActivePlanId('EXISTING')}>
              既存プラン
            </button>
          )}
        </div>
        <div style={{ ...S.planSummary, borderLeftColor: activePlanId === 'EXISTING' ? '#7c3aed' : (PLAN_COLORS[activePlanId] || '#0f2942'), background: activePlanId === 'EXISTING' ? '#faf5ff' : '#f8fafc' }}>
          {activePlanId === 'EXISTING' ? '情報源から読み込んだ既存のケアプランです。' : activePlan.summary}
        </div>
      </div>

      {/* Table tabs */}
      <div style={S.tableTabs}>
        {([['table1', '第1表'], ['table2', '第2表'], ['table3', '第3表 週間サービス計画表']] as const).map(([k, l]) => (
          <button key={k} style={activeTable === k ? S.tableTabActive : S.tableTab} onClick={() => setActiveTable(k)}>{l}</button>
        ))}
      </div>

      {activeTable === 'table1' && (
        <Table1View
          plan={activePlan}
          userMeta={editedUserMeta}
          planMeta={editedPlanMeta}
          mode={mode}
          onUpdateTable1={handleTable1Update}
          onUpdateUserMeta={handleUserMetaUpdate}
          onUpdatePlanMeta={handlePlanMetaUpdate}
        />
      )}
      {activeTable === 'table2' && (
        <Table2View plan={activePlan} userName={editedUserMeta.name} meta={editedPlanMeta} mode={mode} onUpdate={handleTable2Update} />
      )}
      {activeTable === 'table3' && (
        <Table3View plan={activePlan} userName={editedUserMeta.name} meta={editedPlanMeta} onUpdate={handleTable3Update} />
      )}

      {/* Share dialog */}
      {showShareDialog && (
        <div style={{ marginTop: 16, padding: '16px 20px', background: '#f0f7ff', borderRadius: 12, border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2942', marginBottom: 8 }}>プランを共有</div>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
            共有先のメールアドレス（カンマ区切り）。全員に共有する場合は * を入力。
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...S.input, flex: 1 }} placeholder="user@example.com" value={shareEmails} onChange={e => setShareEmails(e.target.value)} />
            <button style={{ ...S.primaryBtn, padding: '8px 16px', fontSize: 13, opacity: sharing ? 0.6 : 1 }} disabled={sharing || !shareEmails.trim()} onClick={handleShare}>
              {sharing ? '共有中...' : '共有'}
            </button>
            <button style={{ ...S.secondaryBtn, padding: '8px 12px', fontSize: 13 }} onClick={() => setShowShareDialog(false)}>閉じる</button>
          </div>
        </div>
      )}

      <div style={S.stepActions}>
        <button style={{ ...S.secondaryBtn, opacity: saving ? 0.6 : 1 }} disabled={busy} onClick={handleSave}>
          {saving ? '保存中...' : '保存'}
        </button>
        <button style={{ ...S.secondaryBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => setShowShareDialog(!showShareDialog)}>
          共有
        </button>
        <button style={{ ...S.primaryBtn, background: '#0f7c3f', opacity: exporting ? 0.6 : 1 }} disabled={busy} onClick={handleExport}>
          {exporting ? 'エクスポート中...' : 'Googleスプレッドシートにエクスポート'}
        </button>
      </div>
    </div>
  );
}
