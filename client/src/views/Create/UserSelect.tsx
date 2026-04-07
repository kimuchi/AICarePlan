import React, { useEffect, useState } from 'react';
import { S } from '../../styles';
import { getUsers, type UserFolder } from '../../api';

interface Props {
  selectedUser: UserFolder | null;
  onSelect: (user: UserFolder) => void;
  onNext: () => void;
}

export default function UserSelect({ selectedUser, onSelect, onNext }: Props) {
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

      <div style={S.stepActions}>
        <button
          style={selectedUser ? S.primaryBtn : S.disabledBtn}
          disabled={!selectedUser}
          onClick={onNext}
        >
          次へ: 情報源を選択 &rarr;
        </button>
      </div>
    </div>
  );
}
