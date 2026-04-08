import React, { useEffect, useState } from 'react';
import { S } from '../../styles';
import { getUsers, listPlans, type UserFolder, type SavedPlanSummary } from '../../api';

interface Props {
  selectedUser: UserFolder | null;
  onSelect: (user: UserFolder) => void;
  onNext: () => void;
  onLoadPlan: (planId: string) => void;
  savedPlans: SavedPlanSummary[];
  onSavedPlansChange: (plans: SavedPlanSummary[]) => void;
}

export default function UserSelect({ selectedUser, onSelect, onNext, onLoadPlan, savedPlans, onSavedPlansChange }: Props) {
  const [users, setUsers] = useState<UserFolder[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    getUsers()
      .then(r => setUsers(r.users))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // 利用者選択時に保存済みプランを読み込み
  useEffect(() => {
    if (!selectedUser) { onSavedPlansChange([]); return; }
    listPlans(selectedUser.folderId)
      .then(r => onSavedPlansChange(r.plans))
      .catch(() => onSavedPlansChange([]));
  }, [selectedUser?.folderId]);

  const filtered = users.filter(u =>
    u.name.includes(search) || u.folderName.includes(search)
  );

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

      {/* 保存済みプラン一覧 */}
      {selectedUser && savedPlans.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 10 }}>
            保存済みプラン（{savedPlans.length}件）
          </h3>
          {savedPlans.map(p => (
            <div key={p.planId} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              marginBottom: 6, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
              cursor: 'pointer',
            }} onClick={() => onLoadPlan(p.planId)}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                background: p.status === 'draft' ? '#fef3c7' : '#dcfce7',
                color: p.status === 'draft' ? '#92400e' : '#166534',
              }}>
                {p.status === 'draft' ? '下書き' : '完成'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                  {p.mode === 'shoki' ? '小多機' : '居宅'} ・ {p.authorName}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {p.updatedAt.split('T')[0]} {p.authorEmail !== '' ? `(${p.authorEmail})` : ''}
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#0f2942', fontWeight: 600 }}>開く &rarr;</span>
            </div>
          ))}
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
