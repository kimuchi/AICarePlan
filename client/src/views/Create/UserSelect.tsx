import React, { useEffect, useState } from 'react';
import { S } from '../../styles';
import { getUsers, getExistingPlans, loadArchiveFile, savePlan, type UserFolder, type ExistingPlansResponse } from '../../api';

interface Props {
  selectedUser: UserFolder | null;
  onSelect: (user: UserFolder) => void;
  onNext: () => void;
  onLoadPlan: (planId: string) => void;
  onOpenImported: (plan: any, clientFolderId: string, clientName: string, mode: string) => void;
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

  const filtered = users.filter(u =>
    u.name.includes(search) || u.folderName.includes(search)
  );

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
        planJson: JSON.stringify({ plans: [copy] }),
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
      const { data } = await loadArchiveFile(fileId);
      // JSON shape: { ...parsed, generatedPlan }
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
        mode: 'kyotaku',
        status: 'draft',
        planJson: JSON.stringify({ plans: [copy] }),
      });
      toast(`「${fileName}」をコピーして新規作成しました`);
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
      const { data } = await loadArchiveFile(fileId);
      const gp = data?.generatedPlan || data?.plans?.[0] || null;
      if (!gp) throw new Error('アーカイブ内にプランが見つかりません');
      // 開く (= 読み取り用にPlanEditへ). 保存されるまで drafts には残らない
      onOpenImported(gp, selectedUser.folderId, selectedUser.name, 'kyotaku');
    } catch (e: any) {
      toast(`開けません: ${e.message}`);
    } finally {
      setCopying('');
    }
  };

  const drafts = existing?.drafts || [];
  const archivedGroups = existing?.archived || {};
  const subfolderKeys = Object.keys(archivedGroups);

  return (
    <div>
      <h2 style={S.stepTitle}>利用者を選択してください</h2>
      <input
        style={S.searchInput}
        placeholder="名前で検索..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {loading && <p style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>利用者フォルダを読み込み中...</p>}
      {error && <p style={{ textAlign: 'center', color: '#dc2626', padding: 20 }}>{error}</p>}

      <div style={S.userList}>
        {filtered.map(u => (
          <div
            key={u.id}
            style={{
              ...S.userCard,
              borderColor: selectedUser?.id === u.id ? '#0f2942' : '#e2e8f0',
              background: selectedUser?.id === u.id ? '#f0f7ff' : '#fff',
            }}
            onClick={() => onSelect(u)}
          >
            <div style={S.userCardTop}>
              <span style={S.avatar}>{u.name[0]}</span>
              <div style={{ flex: 1 }}>
                <div style={S.userName}>
                  {u.name}
                  {u.hasConfidential && <span style={{ fontSize: 12, marginLeft: 8, color: '#7c3aed' }}>🔒 機密文書あり</span>}
                </div>
                <div style={S.userSub}>{u.folderName}</div>
              </div>
              {selectedUser?.id === u.id && <span style={S.checkMark}>&#10003;</span>}
            </div>
          </div>
        ))}
      </div>

      {!loading && filtered.length === 0 && !error && (
        <p style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>
          {search ? '該当する利用者が見つかりません' : '利用者フォルダが見つかりません'}
        </p>
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
