import React, { useEffect, useState } from 'react';
import { S } from '../styles';
import {
  getFacilities, updateFacilities,
  getPrompts, updatePrompts,
  getAllowlist, updateAllowlist,
  getModels,
  type Facility,
} from '../api';
import type { SessionUser } from '../api';

interface Props {
  user: SessionUser;
  onBack: () => void;
  toast: (msg: string) => void;
}

type TabKey = 'facilities' | 'models' | 'prompt_kyotaku_table1' | 'prompt_kyotaku_table2' | 'prompt_kyotaku_table3' | 'prompt_shoki_table1' | 'prompt_shoki_table2' | 'prompt_shoki_table3' | 'allowlist';

const PROMPT_TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'prompt_kyotaku_table1', label: '居宅 第1表' },
  { key: 'prompt_kyotaku_table2', label: '居宅 第2表' },
  { key: 'prompt_kyotaku_table3', label: '居宅 第3表' },
  { key: 'prompt_shoki_table1', label: '小多機 第1表' },
  { key: 'prompt_shoki_table2', label: '小多機 第2表' },
  { key: 'prompt_shoki_table3', label: '小多機 第3表' },
];

export default function Settings({ user, onBack, toast }: Props) {
  const [tab, setTab] = useState<TabKey>('facilities');
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [prompts, setPrompts] = useState<Array<{ id: string; title: string; body: string }>>([]);
  const [allowlist, setAllowlist] = useState<Array<{ email: string; role: string; name: string }>>([]);
  const [models, setModels] = useState<{ generate: string; analyze: string }>({ generate: '', analyze: '' });
  const [loading, setLoading] = useState(true);

  const isAdmin = user.role === 'admin';

  useEffect(() => {
    Promise.all([
      getFacilities().then(r => setFacilities(r.facilities)),
      getPrompts().then(r => setPrompts(r.prompts)),
      getModels().then(r => setModels(r)),
      isAdmin ? getAllowlist().then(r => setAllowlist(r.allowlist)) : Promise.resolve(),
    ]).finally(() => setLoading(false));
  }, []);

  const saveFacilities = async () => {
    try {
      await updateFacilities(facilities);
      toast('事業所を保存しました');
    } catch (e: any) { toast(`保存エラー: ${e.message}`); }
  };

  const savePrompts = async () => {
    try {
      await updatePrompts(prompts);
      toast('プロンプトを保存しました');
    } catch (e: any) { toast(`保存エラー: ${e.message}`); }
  };

  const saveAllowlist = async () => {
    try {
      await updateAllowlist(allowlist);
      toast('許可リストを保存しました');
    } catch (e: any) { toast(`保存エラー: ${e.message}`); }
  };

  const updatePromptBody = (id: string, body: string) => {
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, body } : p));
  };
  const getPromptBody = (id: string) => prompts.find(p => p.id === id)?.body || '';

  if (loading) return <div style={S.root}><div style={{ textAlign: 'center', padding: 60 }}>読み込み中...</div></div>;

  return (
    <div style={S.root}>
      <header style={S.header}>
        <button style={S.backBtn} onClick={onBack}>&larr; 戻る</button>
        <h1 style={S.headerTitle}>設定</h1>
        <div style={{ width: 60 }} />
      </header>
      <main style={S.settingsMain}>
        <div style={S.settingsTabBar}>
          <button style={tab === 'facilities' ? S.settingsTabActive : S.settingsTab} onClick={() => setTab('facilities')}>事業所</button>
          <button style={tab === 'models' ? S.settingsTabActive : S.settingsTab} onClick={() => setTab('models')}>AIモデル</button>
          {PROMPT_TABS.map(pt => (
            <button key={pt.key} style={tab === pt.key ? S.settingsTabActive : S.settingsTab} onClick={() => setTab(pt.key)}>
              {pt.label}
            </button>
          ))}
          {isAdmin && (
            <button style={tab === 'allowlist' ? S.settingsTabActive : S.settingsTab} onClick={() => setTab('allowlist')}>許可リスト</button>
          )}
        </div>

        {/* ── 事業所管理 ── */}
        {tab === 'facilities' && (
          <div style={S.settingsPanel}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              {isAdmin
                ? 'ケアプラン作成時に使用する事業所を登録します。複数登録でき、作成時に選択します。'
                : '管理者が登録した事業所の一覧です。'}
            </p>
            {facilities.map((fac, idx) => (
              <div key={fac.id || idx} style={{ padding: '16px', marginBottom: 12, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>事業所 {idx + 1}</span>
                  {isAdmin && (
                    <button
                      style={{ ...S.secondaryBtn, padding: '4px 10px', fontSize: 11, color: '#dc2626' }}
                      onClick={() => setFacilities(facilities.filter((_, i) => i !== idx))}
                    >
                      削除
                    </button>
                  )}
                </div>
                <label style={{ ...S.fieldLabel, marginTop: 0 }}>事業所名</label>
                <input
                  style={S.input}
                  value={fac.name}
                  readOnly={!isAdmin}
                  onChange={e => {
                    const updated = [...facilities];
                    updated[idx] = { ...updated[idx], name: e.target.value };
                    setFacilities(updated);
                  }}
                />
                <label style={S.fieldLabel}>所在地</label>
                <input
                  style={S.input}
                  value={fac.address}
                  readOnly={!isAdmin}
                  onChange={e => {
                    const updated = [...facilities];
                    updated[idx] = { ...updated[idx], address: e.target.value };
                    setFacilities(updated);
                  }}
                />
                <label style={S.fieldLabel}>計画作成者氏名</label>
                <input
                  style={S.input}
                  value={fac.managerName}
                  readOnly={!isAdmin}
                  onChange={e => {
                    const updated = [...facilities];
                    updated[idx] = { ...updated[idx], managerName: e.target.value };
                    setFacilities(updated);
                  }}
                />
              </div>
            ))}
            {isAdmin && (
              <>
                <button
                  style={{ ...S.secondaryBtn, marginBottom: 8 }}
                  onClick={() => setFacilities([...facilities, { id: '', name: '', address: '', managerName: '' }])}
                >
                  + 事業所を追加
                </button>
                <div><button style={S.saveBtn} onClick={saveFacilities}>保存</button></div>
              </>
            )}
            {!isAdmin && facilities.length === 0 && (
              <p style={{ color: '#94a3b8', fontSize: 13 }}>事業所が登録されていません。管理者に登録を依頼してください。</p>
            )}
          </div>
        )}

        {/* ── AIモデル（読み取り専用） ── */}
        {tab === 'models' && (
          <div style={S.settingsPanel}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              AIモデルはサーバーの環境変数（.env）で設定されています。変更が必要な場合はサーバー管理者に連絡してください。
            </p>
            <label style={S.fieldLabel}>プラン生成用モデル</label>
            <input style={{ ...S.input, background: '#f1f5f9', color: '#475569' }} value={models.generate} readOnly />
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>
              ケアプラン3案の生成に使用。高品質モデル推奨。
            </p>
            <label style={S.fieldLabel}>PDF解析・要約用モデル</label>
            <input style={{ ...S.input, background: '#f1f5f9', color: '#475569' }} value={models.analyze} readOnly />
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>
              PDF読み取り・長文要約に使用。高速・低コストモデル推奨。
            </p>
          </div>
        )}

        {/* ── プロンプト ── */}
        {PROMPT_TABS.some(pt => pt.key === tab) && (
          <div style={S.settingsPanel}>
            <label style={S.fieldLabel}>
              {PROMPT_TABS.find(pt => pt.key === tab)?.label} 生成プロンプト
            </label>
            {isAdmin ? (
              <textarea
                style={S.textarea}
                rows={18}
                value={getPromptBody(tab)}
                onChange={e => updatePromptBody(tab, e.target.value)}
              />
            ) : (
              <pre style={{ ...S.textarea, background: '#f1f5f9', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7 }}>
                {getPromptBody(tab) || '（未設定）'}
              </pre>
            )}
            <div style={S.promptHint}>
              <span style={{ fontWeight: 600 }}>使用可能な変数:</span>
              {' {利用者名} {要介護度} {生年月日} {住所} {アセスメント情報} {既存ケアプラン} {通い記録} {訪問記録} {泊まり記録} {主治医意見書} {担当者会議録} {フェイスシート} {事業所名} {管理者名}'}
            </div>
            {isAdmin && <button style={S.saveBtn} onClick={savePrompts}>保存</button>}
          </div>
        )}

        {/* ── 許可リスト ── */}
        {tab === 'allowlist' && isAdmin && (
          <div style={S.settingsPanel}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              ログインを許可するメールアドレスを管理します。<code>admin</code> ロールのユーザーは設定の編集ができます。
            </p>
            {allowlist.map((entry, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input
                  style={{ ...S.input, flex: 2 }}
                  placeholder="メールアドレス"
                  value={entry.email}
                  onChange={e => {
                    const updated = [...allowlist];
                    updated[idx] = { ...updated[idx], email: e.target.value };
                    setAllowlist(updated);
                  }}
                />
                <select
                  style={{ ...S.input, flex: 0, width: 100 }}
                  value={entry.role}
                  onChange={e => {
                    const updated = [...allowlist];
                    updated[idx] = { ...updated[idx], role: e.target.value };
                    setAllowlist(updated);
                  }}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
                <input
                  style={{ ...S.input, flex: 1 }}
                  placeholder="名前"
                  value={entry.name}
                  onChange={e => {
                    const updated = [...allowlist];
                    updated[idx] = { ...updated[idx], name: e.target.value };
                    setAllowlist(updated);
                  }}
                />
                <button
                  style={{ ...S.secondaryBtn, padding: '8px 12px', fontSize: 12, color: '#dc2626' }}
                  onClick={() => setAllowlist(allowlist.filter((_, i) => i !== idx))}
                >
                  削除
                </button>
              </div>
            ))}
            <button
              style={{ ...S.secondaryBtn, marginTop: 8 }}
              onClick={() => setAllowlist([...allowlist, { email: '', role: 'user', name: '' }])}
            >
              + 追加
            </button>
            <div style={{ marginTop: 16 }}>
              <button style={S.saveBtn} onClick={saveAllowlist}>保存</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
