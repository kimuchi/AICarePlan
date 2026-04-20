import React, { useEffect, useState } from 'react';
import { S } from '../../styles';
import { getUsers, getExistingPlans, loadArchiveFile, savePlan, type UserFolder, type ExistingPlansResponse } from '../../api';

interface Props {
  selectedUser: UserFolder | null;
  onSelect: (user: UserFolder) => void;
  onNext: () => void;
  onLoadPlan: (planId: string) => void;
  onOpenImported: (plan: any, clientFolderId: string, clientName: string, mode: string, extra?: { userProfile?: any; editedUserMeta?: any; editedPlanMeta?: any }) => void;
  toast: (msg: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  draft: '下書き',
  completed: '完成',
  approved: '承認済み',
};
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  draft: { bg: '#fef3c7', fg: '#92400e' },
  completed: { bg: '#dcfce7', fg: '#166534' },
  approved: { bg: '#dbeafe', fg: '#1e40af' },
};

export default function UserSelect({ selectedUser, onSelect, onNext, onLoadPlan, onOpenImported, toast }: Props) {
  const [users, setUsers] = useState<UserFolder[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState<ExistingPlansResponse | null>(null);
  const [existingLoading, setExistingLoading] = useState(false);
  const [selectedSubfolder, setSelectedSubfolder] = useState<string>('');
  const [copying, setCopying] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    setLoading(true);
    getUsers()
      .then(r => setUsers(r.users))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setExisting(null);
    setSelectedSubfolder('');
    if (!selectedUser) return;
    setExistingLoading(true);
    getExistingPlans(selectedUser.folderId)
      .then(r => {
        setExisting(r);
        const keys = Object.keys(r.archived || {});
        if (keys.length > 0) setSelectedSubfolder(keys[0]);
      })
      .catch(() => setExisting({ drafts: [], archived: {} }))
      .finally(() => setExistingLoading(false));
  }, [selectedUser?.folderId]);

  // 漢字・ふりがな両方で絞り込み（folderName は "き_木村光範" 形式でふりがなを含む）
  const norm = (s: string) => (s || '').replace(/[\s\u3000]+/g, '').toLowerCase();
  const q = norm(search);
  const filtered = q
    ? users.filter(u => norm(u.name).includes(q) || norm(u.folderName).includes(q))
    : users;
  const suggestions = filtered.slice(0, 20);

  const statusBadge = (status: string, approved: boolean) => {
    const key = approved ? 'approved' : status;
    const s = STATUS_STYLE[key] || STATUS_STYLE.draft;
    return (
      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: s.bg, color: s.fg }}>
        {approved ? '✓ 承認済み' : (STATUS_LABEL[status] || status)}
      </span>
    );
  };

  const doCopyFromDraft = async (planId: string, clientFolderId: string, clientName: string, mode: string) => {
    setCopying(planId);
    try {
      const { loadPlan } = await import('../../api');
      const data = await loadPlan(planId);
      const planData = data.plan || {};
      const src = planData?.selectedPlan || (Array.isArray(planData?.plans) && planData.plans[0]) || null;
      if (!src) throw new Error('コピー元プランが見つかりません');
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = 'copy-' + Date.now().toString(36);
      copy.label = `${copy.label || 'プラン'}のコピー`;
      copy.approved = false;
      delete copy.approvedAt;
      const saved = await savePlan({
        clientFolderId,
        clientName,
        mode,
        status: 'draft',
        planJson: JSON.stringify({
          plans: [copy],
          userProfile: planData?.userProfile || null,
          editedUserMeta: planData?.editedUserMeta || null,
          editedPlanMeta: planData?.editedPlanMeta || null,
        }),
      });
      toast('コピーして新規作成しました');
      onLoadPlan(saved.planId);
    } catch (e: any) {
      toast(`コピー失敗: ${e.message}`);
    } finally {
      setCopying('');
    }
  };

  const doCopyFromArchive = async (fileId: string, fileName: string) => {
    if (!selectedUser) return;
    setCopying(fileId);
    try {
      const { data, mode } = await loadArchiveFile(fileId);
      const gp = data?.generatedPlan || data?.plans?.[0] || null;
      if (!gp) throw new Error('アーカイブ内にプランが見つかりません');
      const copy = JSON.parse(JSON.stringify(gp));
      copy.id = 'copy-' + Date.now().toString(36);
      copy.label = `${copy.label || 'プラン'}のコピー`;
      copy.approved = false;
      delete copy.approvedAt;
      const saved = await savePlan({
        clientFolderId: selectedUser.folderId,
        clientName: selectedUser.name,
        mode,
        status: 'draft',
        planJson: JSON.stringify({
          plans: [copy],
          userProfile: data?.userProfile || null,
          editedUserMeta: data?.editedUserMeta || null,
          editedPlanMeta: data?.editedPlanMeta || null,
        }),
      });
      toast(`「${fileName}」をコピーして新規作成しました（${mode === 'shoki' ? '小多機' : '居宅'}として認識）`);
      onLoadPlan(saved.planId);
    } catch (e: any) {
      toast(`コピー失敗: ${e.message}`);
    } finally {
      setCopying('');
    }
  };

  const doOpenArchive = async (fileId: string, fileName: string) => {
    if (!selectedUser) return;
    setCopying(fileId);
    try {
      const { data, mode } = await loadArchiveFile(fileId);
      const gp = data?.generatedPlan || data?.plans?.[0] || null;
      if (!gp) throw new Error('アーカイブ内にプランが見つかりません');
      onOpenImported(gp, selectedUser.folderId, selectedUser.name, mode, {
        userProfile: data?.userProfile || null,
        editedUserMeta: data?.editedUserMeta || null,
        editedPlanMeta: data?.editedPlanMeta || null,
      });
    } catch (e: any) {
      toast(`開けません: ${e.message}`);
    } finally {
      setCopying('');
    }
  };

  const drafts = existing?.drafts || [];
  const archivedGroups = existing?.archived || {};
  const subfolderKeys = Object.keys(archivedGroups);

  const pickUser = (u: UserFolder) => {
    onSelect(u);
    setSearch('');
    setDropdownOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(suggestions.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (suggestions[activeIdx]) pickUser(suggestions[activeIdx]); }
    else if (e.key === 'Escape') { setDropdownOpen(false); }
  };

  return (
    <div>
      <h2 style={S.stepTitle}>利用者を選択してください</h2>

      {loading && <p style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>利用者フォルダを読み込み中...</p>}
      {error && <p style={{ textAlign: 'center', color: '#dc2626', padding: 20 }}>{error}</p>}

      {/* 選択中の利用者 */}
      {selectedUser && (
        <div style={{ ...S.userCard, borderColor: '#0f2942', background: '#f0f7ff', marginBottom: 12 }}>
          <div style={S.userCardTop}>
            <span style={S.avatar}>{selectedUser.name[0]}</span>
            <div style={{ flex: 1 }}>
              <div style={S.userName}>
                {selectedUser.name}
                {selectedUser.hasConfidential && <span style={{ fontSize: 12, marginLeft: 8, color: '#7c3aed' }}>🔒 機密文書あり</span>}
              </div>
              <div style={S.userSub}>{selectedUser.folderName}</div>
            </div>
            <span style={S.checkMark}>&#10003;</span>
            <button
              style={{ background: 'none', border: '1px solid #d1d9e0', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#475569', cursor: 'pointer', marginLeft: 8 }}
              onClick={() => { onSelect(null as any); setSearch(''); setDropdownOpen(true); }}
            >変更</button>
          </div>
        </div>
      )}

      {/* 検索ボックス */}
      {!selectedUser && (
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            style={S.searchInput}
            placeholder="漢字またはふりがなで検索（例: 木村 / きむら / き）"
            value={search}
            onChange={e => { setSearch(e.target.value); setDropdownOpen(true); setActiveIdx(0); }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
            onKeyDown={onKeyDown}
            autoFocus
          />
          {dropdownOpen && suggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10,
              maxHeight: 360, overflowY: 'auto', boxShadow: '0 8px 20px rgba(15,41,66,.08)',
            }}>
              {suggestions.map((u, i) => (
                <div
                  key={u.id}
                  onMouseDown={() => pickUser(u)}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', cursor: 'pointer',
                    background: i === activeIdx ? '#eef2ff' : '#fff',
                    borderBottom: i === suggestions.length - 1 ? 'none' : '1px solid #f1f5f9',
                  }}
                >
                  <span style={{ ...S.avatar, width: 32, height: 32, fontSize: 14 }}>{u.name[0]}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{u.folderName}</div>
                  </div>
                  {u.hasConfidential && <span style={{ fontSize: 11, color: '#7c3aed' }}>🔒</span>}
                </div>
              ))}
              {filtered.length > suggestions.length && (
                <div style={{ padding: '6px 14px', fontSize: 11, color: '#94a3b8', background: '#fafafa' }}>
                  他に {filtered.length - suggestions.length} 件…さらに絞り込んでください
                </div>
              )}
            </div>
          )}
          {dropdownOpen && search && suggestions.length === 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10,
              padding: '12px 14px', fontSize: 13, color: '#94a3b8',
            }}>該当する利用者が見つかりません</div>
          )}
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            登録 {users.length} 名 / ↑↓で移動、Enterで選択
          </div>
        </div>
      )}

      {/* 既存プラン一覧 */}
      {selectedUser && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f2942', marginBottom: 12 }}>
            {selectedUser.name}様の既存プラン
          </h3>
          {existingLoading && <p style={{ color: '#64748b', fontSize: 13 }}>読み込み中...</p>}

          {/* drafts sheet 由来 */}
          {drafts.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>下書き・保存済み（drafts）</div>
              {drafts.map(p => (
                <div key={p.planId} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  marginBottom: 6, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
                }}>
                  {statusBadge(p.status, p.approved)}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                      {p.mode === 'shoki' ? '小多機' : '居宅'} ・ {p.authorName || p.authorEmail}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.updatedAt.split('T')[0]}</div>
                  </div>
                  <button style={{ ...S.smallBtn, marginTop: 0, background: '#1e3a5f' }} onClick={() => onLoadPlan(p.planId)}>開く</button>
                  <button
                    style={{ ...S.smallBtn, marginTop: 0, background: '#0f7c3f', opacity: copying === p.planId ? 0.6 : 1 }}
                    disabled={copying === p.planId}
                    onClick={() => doCopyFromDraft(p.planId, p.clientFolderId, p.clientName, p.mode)}
                  >{copying === p.planId ? 'コピー中...' : 'コピーして新規作成'}</button>
                </div>
              ))}
            </div>
          )}

          {/* アーカイブ（01_居宅サービス計画書 + 認定期間サブフォルダ） */}
          {subfolderKeys.length > 0 && (
            <div>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>
                アーカイブ（認定期間フォルダ別）
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {subfolderKeys.map(k => (
                  <button
                    key={k}
                    onClick={() => setSelectedSubfolder(k)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                      border: selectedSubfolder === k ? '2px solid #0f2942' : '1px solid #cbd5e1',
                      background: selectedSubfolder === k ? '#0f2942' : '#fff',
                      color: selectedSubfolder === k ? '#fff' : '#475569',
                      fontWeight: selectedSubfolder === k ? 700 : 500,
                    }}
                  >
                    {k}（{archivedGroups[k].length}件）
                  </button>
                ))}
              </div>
              {selectedSubfolder && (archivedGroups[selectedSubfolder] || []).map(f => (
                <div key={f.fileId} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  marginBottom: 6, background: '#fafafa', borderRadius: 10, border: '1px solid #e2e8f0',
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#e0e7ff', color: '#3730a3' }}>アーカイブ</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{f.fileName}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{(f.modifiedTime || '').split('T')[0]}</div>
                  </div>
                  <button
                    style={{ ...S.smallBtn, marginTop: 0, background: '#1e3a5f', opacity: copying === f.fileId ? 0.6 : 1 }}
                    disabled={copying === f.fileId}
                    onClick={() => doOpenArchive(f.fileId, f.fileName)}
                  >開く</button>
                  <button
                    style={{ ...S.smallBtn, marginTop: 0, background: '#0f7c3f', opacity: copying === f.fileId ? 0.6 : 1 }}
                    disabled={copying === f.fileId}
                    onClick={() => doCopyFromArchive(f.fileId, f.fileName)}
                  >{copying === f.fileId ? 'コピー中...' : 'コピーして新規作成'}</button>
                </div>
              ))}
            </div>
          )}

          {!existingLoading && drafts.length === 0 && subfolderKeys.length === 0 && (
            <p style={{ color: '#94a3b8', fontSize: 12 }}>既存プランはありません。</p>
          )}
        </div>
      )}

      <div style={S.stepActions}>
        <button
          style={selectedUser ? S.primaryBtn : S.disabledBtn}
          disabled={!selectedUser}
          onClick={onNext}
        >
          新規作成: 情報源を選択 &rarr;
        </button>
      </div>
    </div>
  );
}
