import React, { useEffect, useState } from 'react';
import { S } from '../styles';
import {
  getGeneralSettings, updateGeneralSettings,
  getPrompts, updatePrompts,
  getAllowlist, updateAllowlist,
} from '../api';
import type { SessionUser } from '../api';

interface Props {
  user: SessionUser;
  onBack: () => void;
  toast: (msg: string) => void;
}

type SettingsTabKey = 'general' | 'prompt_kyotaku_table1' | 'prompt_kyotaku_table2' | 'prompt_kyotaku_table3' | 'prompt_shoki_table1' | 'prompt_shoki_table2' | 'prompt_shoki_table3' | 'allowlist';

const PROMPT_TABS: Array<{ key: SettingsTabKey; label: string }> = [
  { key: 'prompt_kyotaku_table1', label: '居宅 第1表' },
  { key: 'prompt_kyotaku_table2', label: '居宅 第2表' },
  { key: 'prompt_kyotaku_table3', label: '居宅 第3表' },
  { key: 'prompt_shoki_table1', label: '小多機 第1表' },
  { key: 'prompt_shoki_table2', label: '小多機 第2表' },
  { key: 'prompt_shoki_table3', label: '小多機 第3表' },
];

export default function Settings({ user, onBack, toast }: Props) {
  const [tab, setTab] = useState<SettingsTabKey>('general');
  const [general, setGeneral] = useState<Record<string, string>>({});
  const [prompts, setPrompts] = useState<Array<{ id: string; title: string; body: string }>>([]);
  const [allowlist, setAllowlist] = useState<Array<{ email: string; role: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getGeneralSettings().then(r => setGeneral(r.settings)),
      getPrompts().then(r => setPrompts(r.prompts)),
      user.role === 'admin' ? getAllowlist().then(r => setAllowlist(r.allowlist)) : Promise.resolve(),
    ]).finally(() => setLoading(false));
  }, []);

  const saveGeneral = async () => {
    try {
      await updateGeneralSettings(general);
      toast('設定を保存しました');
    } catch (e: any) {
      toast(`保存エラー: ${e.message}`);
    }
  };

  const savePrompts = async () => {
    try {
      await updatePrompts(prompts);
      toast('プロンプトを保存しました');
    } catch (e: any) {
      toast(`保存エラー: ${e.message}`);
    }
  };

  const saveAllowlist = async () => {
    try {
      await updateAllowlist(allowlist);
      toast('許可リストを保存しました');
    } catch (e: any) {
      toast(`保存エラー: ${e.message}`);
    }
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
          <button style={tab === 'general' ? S.settingsTabActive : S.settingsTab} onClick={() => setTab('general')}>基本情報</button>
          {PROMPT_TABS.map(pt => (
            <button key={pt.key} style={tab === pt.key ? S.settingsTabActive : S.settingsTab} onClick={() => setTab(pt.key)}>
              {pt.label}
            </button>
          ))}
          {user.role === 'admin' && (
            <button style={tab === 'allowlist' ? S.settingsTabActive : S.settingsTab} onClick={() => setTab('allowlist')}>許可リスト</button>
          )}
        </div>

        {tab === 'general' && (
          <div style={S.settingsPanel}>
            <label style={S.fieldLabel}>事業所名</label>
            <input style={S.input} value={general.facilityName || ''} onChange={e => setGeneral({ ...general, facilityName: e.target.value })} />
            <label style={S.fieldLabel}>事業所所在地</label>
            <input style={S.input} value={general.facilityAddress || ''} onChange={e => setGeneral({ ...general, facilityAddress: e.target.value })} />
            <label style={S.fieldLabel}>居宅サービス計画作成者氏名</label>
            <input style={S.input} value={general.managerName || ''} onChange={e => setGeneral({ ...general, managerName: e.target.value })} />
            <label style={S.fieldLabel}>利用者フォルダルートID（共有ドライブ）</label>
            <input style={S.input} value={general.userRootFolderId || ''} onChange={e => setGeneral({ ...general, userRootFolderId: e.target.value })} />
            <label style={S.fieldLabel}>マイドライブ機密フォルダ名</label>
            <input style={S.input} value={general.privateFolderName || ''} onChange={e => setGeneral({ ...general, privateFolderName: e.target.value })} placeholder="例: 利用者フォルダ" />
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>
              Autofiler-CarePlanningがマイドライブ直下に作成するフォルダ名。ログインユーザーのマイドライブから自動検索します。
            </p>
            <label style={S.fieldLabel}>AIモデル（プラン生成用）</label>
            <select style={S.input} value={general.geminiModelGenerate || ''} onChange={e => setGeneral({ ...general, geminiModelGenerate: e.target.value })}>
              <option value="gemini-2.5-flash-preview-05-20">Gemini 2.5 Flash（推奨）</option>
              <option value="gemini-2.5-pro-preview-05-06">Gemini 2.5 Pro（高品質）</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
            </select>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>
              ケアプラン3案の生成に使用。品質重視ならPro、コスト重視ならFlash。
            </p>
            <label style={S.fieldLabel}>AIモデル（PDF解析・要約用）</label>
            <select style={S.input} value={general.geminiModelAnalyze || ''} onChange={e => setGeneral({ ...general, geminiModelAnalyze: e.target.value })}>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash（推奨・低コスト）</option>
              <option value="gemini-2.5-flash-preview-05-20">Gemini 2.5 Flash</option>
              <option value="gemini-2.5-pro-preview-05-06">Gemini 2.5 Pro</option>
            </select>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>
              PDF読み取り・長文要約に使用。高速・低コストモデル推奨。
            </p>
            <label style={S.fieldLabel}>提案数</label>
            <select style={S.input} value={general.proposalCount || '3'} onChange={e => setGeneral({ ...general, proposalCount: e.target.value })}>
              <option value="2">2案</option>
              <option value="3">3案</option>
              <option value="5">5案</option>
            </select>
            <button style={S.saveBtn} onClick={saveGeneral}>保存</button>
          </div>
        )}

        {PROMPT_TABS.some(pt => pt.key === tab) && (
          <div style={S.settingsPanel}>
            <label style={S.fieldLabel}>
              {PROMPT_TABS.find(pt => pt.key === tab)?.label} 生成プロンプト
            </label>
            <textarea
              style={S.textarea}
              rows={18}
              value={getPromptBody(tab)}
              onChange={e => updatePromptBody(tab, e.target.value)}
            />
            <div style={S.promptHint}>
              <span style={{ fontWeight: 600 }}>使用可能な変数:</span>
              {' {利用者名} {要介護度} {生年月日} {住所} {アセスメント情報} {既存ケアプラン} {通い記録} {訪問記録} {泊まり記録} {主治医意見書} {担当者会議録} {フェイスシート} {事業所名} {管理者名}'}
            </div>
            <button style={S.saveBtn} onClick={savePrompts}>保存</button>
          </div>
        )}

        {tab === 'allowlist' && user.role === 'admin' && (
          <div style={S.settingsPanel}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              システムにログインできるメールアドレスを管理します。
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
