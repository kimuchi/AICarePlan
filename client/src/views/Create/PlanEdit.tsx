import React, { useState, useRef, useCallback, useEffect } from 'react';
import { S } from '../../styles';
import type { GeneratedPlan, BusinessMode } from '../../api';
import { getSystemUsers } from '../../api';
import Table1View from './Table1View';
import Table2View from './Table2View';
import Table3View from './Table3View';
import Table4View from './Table4View';
import Table5View from './Table5View';
import Table6View from './Table6View';
import ReferencePanel from '../../components/reference/ReferencePanel';

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
  onSave: (plan: GeneratedPlan, userMeta: UserMeta, planMeta: PlanMeta) => Promise<void> | void;
  currentPlanId?: string | null;
  currentSharedWith?: string;
  onShare?: (planId: string, emails: string) => Promise<void> | void;
  clientFolderId?: string;
}

const PLAN_COLORS: Record<string, string> = { P1: '#2563eb', P2: '#059669', P3: '#d97706' };

interface Snapshot {
  editedPlans: Record<string, GeneratedPlan>;
  userMeta: UserMeta;
  planMeta: PlanMeta;
}

export default function PlanEdit({
  plans, existingPlan, userMeta: initialUserMeta, planMeta: initialPlanMeta, mode,
  onSave, currentPlanId, currentSharedWith, onShare, clientFolderId,
}: Props) {
  const [activePlanId, setActivePlanId] = useState(plans.length > 0 ? plans[0].id : (existingPlan ? 'EXISTING' : ''));
  const [activeTable, setActiveTable] = useState<'table1' | 'table2' | 'table3' | 'table4' | 'table5' | 'table6'>('table1');
  const [editedPlans, setEditedPlans] = useState<Record<string, GeneratedPlan>>({});
  const [editedUserMeta, setEditedUserMeta] = useState<UserMeta>(initialUserMeta);
  const [editedPlanMeta, setEditedPlanMeta] = useState<PlanMeta>(initialPlanMeta);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareEmails, setShareEmails] = useState(currentSharedWith || '');
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [systemUsers, setSystemUsers] = useState<Array<{ email: string; name: string }>>([]);

  // ユーザー一覧を取得（共有先候補）
  useEffect(() => {
    getSystemUsers().then(r => setSystemUsers(r.users)).catch(() => {});
  }, []);

  // UNDO
  const undoStack = useRef<Snapshot[]>([]);
  const pushUndo = useCallback(() => {
    undoStack.current.push({
      editedPlans: JSON.parse(JSON.stringify(editedPlans)),
      userMeta: { ...editedUserMeta, certPeriod: { ...editedUserMeta.certPeriod } },
      planMeta: { ...editedPlanMeta },
    });
    if (undoStack.current.length > 50) undoStack.current.shift();
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

  const handleTable1Update = (t1: GeneratedPlan['table1']) => updatePlan(activePlanId, { table1: t1 });
  const handleTable2Update = (t2: GeneratedPlan['table2']) => updatePlan(activePlanId, { table2: t2 });
  const handleTable3Update = (t3: GeneratedPlan['table3']) => updatePlan(activePlanId, { table3: t3 });
  const handleTable4Update = (t4: NonNullable<GeneratedPlan['table4']>) => updatePlan(activePlanId, { table4: t4 });
  const handleTable5Update = (t5: NonNullable<GeneratedPlan['table5']>) => updatePlan(activePlanId, { table5: t5 });
  const handleUserMetaUpdate = (um: UserMeta) => { pushUndo(); setEditedUserMeta(um); };
  const handlePlanMetaUpdate = (pm: PlanMeta) => { pushUndo(); setEditedPlanMeta(pm); };

  const handleSave = async () => {
    if (!activePlan || saving) return;
    setSaving(true);
    try { await onSave(activePlan, editedUserMeta, editedPlanMeta); } finally { setSaving(false); }
  };

  const handleShare = async () => {
    if (!currentPlanId || !onShare || sharing) return;
    setSharing(true);
    try { await onShare(currentPlanId, shareEmails); setShowShareDialog(false); }
    finally { setSharing(false); }
  };

  const toggleShareUser = (email: string) => {
    const list = shareEmails.split(',').map(s => s.trim()).filter(Boolean);
    if (list.includes(email)) {
      setShareEmails(list.filter(e => e !== email).join(', '));
    } else {
      setShareEmails([...list, email].join(', '));
    }
  };

  const sharedList = shareEmails.split(',').map(s => s.trim()).filter(Boolean);
  const busy = saving || sharing;

  if (!activePlan) return <p style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>プランが選択されていません</p>;

  return (
    <div>
      {/* Plan switcher + Undo */}
      <div style={S.planSwitcher}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={S.planSwitcherLabel}>表示するプラン:</div>
          <button
            style={{ background: 'none', border: '1px solid #d1d9e0', borderRadius: 6, padding: '4px 12px', fontSize: 12, color: undoStack.current.length > 0 ? '#0f2942' : '#cbd5e1', cursor: undoStack.current.length > 0 ? 'pointer' : 'default', fontWeight: 600 }}
            disabled={undoStack.current.length === 0}
            onClick={undo}>
            元に戻す
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
        {(() => {
          const tabs: Array<[typeof activeTable, string]> = [
            ['table1', '第1表'], ['table2', '第2表'], ['table3', '第3表 週間サービス計画表'],
          ];
          if (activePlan.table4) tabs.push(['table4', '第4表 会議要点']);
          if (activePlan.table5 && activePlan.table5.length > 0) tabs.push(['table5', '第5表 支援経過']);
          if (activePlan.table6 && activePlan.table6.length > 0) tabs.push(['table6', '第6表 利用票']);
          return tabs.map(([k, l]) => (
            <button key={k} style={activeTable === k ? S.tableTabActive : S.tableTab} onClick={() => setActiveTable(k)}>{l}</button>
          ));
        })()}
      </div>

      {activeTable === 'table1' && (
        <Table1View plan={activePlan} userMeta={editedUserMeta} planMeta={editedPlanMeta} mode={mode}
          onUpdateTable1={handleTable1Update} onUpdateUserMeta={handleUserMetaUpdate} onUpdatePlanMeta={handlePlanMetaUpdate} />
      )}
      {activeTable === 'table2' && (
        <Table2View plan={activePlan} userName={editedUserMeta.name} meta={editedPlanMeta} mode={mode} onUpdate={handleTable2Update} />
      )}
      {activeTable === 'table3' && (
        <Table3View plan={activePlan} userName={editedUserMeta.name} meta={editedPlanMeta} onUpdate={handleTable3Update} />
      )}
      {activeTable === 'table4' && (
        <Table4View plan={activePlan} userName={editedUserMeta.name} onUpdate={handleTable4Update} />
      )}
      {activeTable === 'table5' && (
        <Table5View plan={activePlan} userName={editedUserMeta.name} onUpdate={handleTable5Update} />
      )}
      {activeTable === 'table6' && (
        <Table6View plan={activePlan} userName={editedUserMeta.name} />
      )}

      <ReferencePanel folderId={clientFolderId} />

      {/* 共有情報表示 + 共有ダイアログ */}
      {currentSharedWith && !showShareDialog && (
        <div style={{ marginTop: 12, padding: '10px 16px', background: '#faf5ff', borderRadius: 8, border: '1px solid #e9d5ff', fontSize: 12, color: '#7c3aed' }}>
          共有中: {currentSharedWith === '*' ? '全員' : currentSharedWith}
        </div>
      )}

      {showShareDialog && (
        <div style={{ marginTop: 12, padding: '16px 20px', background: '#f0f7ff', borderRadius: 12, border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2942', marginBottom: 10 }}>プランを共有</div>

          {/* ユーザー一覧チェックボックス */}
          {systemUsers.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>ユーザーを選択:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {systemUsers.map(u => {
                  const selected = sharedList.includes(u.email);
                  return (
                    <button key={u.email}
                      style={{
                        padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                        border: selected ? '2px solid #7c3aed' : '1px solid #d1d9e0',
                        background: selected ? '#ede9fe' : '#fff',
                        color: selected ? '#7c3aed' : '#475569', fontWeight: selected ? 700 : 400,
                      }}
                      onClick={() => toggleShareUser(u.email)}>
                      {u.name || u.email} {selected && '✓'}
                    </button>
                  );
                })}
                <button
                  style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                    border: shareEmails === '*' ? '2px solid #7c3aed' : '1px solid #d1d9e0',
                    background: shareEmails === '*' ? '#ede9fe' : '#fff',
                    color: shareEmails === '*' ? '#7c3aed' : '#475569',
                  }}
                  onClick={() => setShareEmails(shareEmails === '*' ? '' : '*')}>
                  全員に共有 {shareEmails === '*' && '✓'}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...S.input, flex: 1 }} placeholder="メールアドレス（カンマ区切り）"
              value={shareEmails} onChange={e => setShareEmails(e.target.value)} />
            <button style={{ ...S.primaryBtn, padding: '8px 16px', fontSize: 13, opacity: sharing ? 0.6 : 1 }}
              disabled={sharing} onClick={handleShare}>
              {sharing ? '保存中...' : '共有を保存'}
            </button>
            <button style={{ ...S.secondaryBtn, padding: '8px 12px', fontSize: 13 }}
              onClick={() => setShowShareDialog(false)}>閉じる</button>
          </div>
        </div>
      )}

      {/* Action buttons — 保存（=スプレッドシートにエクスポート）+ 共有 */}
      <div style={S.stepActions}>
        <button
          style={{ ...S.primaryBtn, background: '#0f7c3f', opacity: saving ? 0.6 : 1 }}
          disabled={busy}
          onClick={handleSave}>
          {saving ? '保存中...' : '保存（Googleスプレッドシートにエクスポート）'}
        </button>
        <button
          style={{ ...S.secondaryBtn, opacity: busy ? 0.6 : 1 }}
          disabled={busy}
          onClick={() => setShowShareDialog(!showShareDialog)}>
          共有{sharedList.length > 0 ? ` (${shareEmails === '*' ? '全員' : sharedList.length + '人'})` : ''}
        </button>
      </div>
    </div>
  );
}
