import React, { useEffect, useState } from 'react';
import { S } from '../styles';
import DrivePicker, { type PickedFile } from '../components/DrivePicker';
import {
  getFacilities, updateFacilities,
  getPrompts, updatePrompts,
  getAllowlist, updateAllowlist,
  getModels,
  getKnowledgeFiles, updateKnowledgeFiles,
  type Facility, type KnowledgeFile,
} from '../api';
import type { SessionUser } from '../api';

interface Props {
  user: SessionUser;
  onBack: () => void;
  toast: (msg: string) => void;
}

type TabKey = 'facilities' | 'knowledge' | 'models' | 'prompt_kyotaku_table1' | 'prompt_kyotaku_table2' | 'prompt_kyotaku_table3' | 'prompt_shoki_table1' | 'prompt_shoki_table2' | 'prompt_shoki_table3' | 'allowlist';

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
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]);
  const [prompts, setPrompts] = useState<Array<{ id: string; title: string; body: string }>>([]);
  const [allowlist, setAllowlist] = useState<Array<{ email: string; role: string; name: string }>>([]);
  const [models, setModels] = useState<{ generate: string; analyze: string }>({ generate: '', analyze: '' });
  const [loading, setLoading] = useState(true);

  const isAdmin = user.role === 'admin';

  useEffect(() => {
    Promise.all([
      getFacilities().then(r => setFacilities(r.facilities)),
      getKnowledgeFiles().then(r => setKnowledgeFiles(r.files)),
      getPrompts().then(r => setPrompts(r.prompts)),
      getModels().then(r => setModels(r)),
      isAdmin ? getAllowlist().then(r => setAllowlist(r.allowlist)) : Promise.resolve(),
    ]).finally(() => setLoading(false));
  }, []);

  const saveFacilities = async () => {
    try { await updateFacilities(facilities); toast('事業所を保存しました'); }
    catch (e: any) { toast(`保存エラー: ${e.message}`); }
  };
  const saveKnowledgeFiles = async () => {
    try { await updateKnowledgeFiles(knowledgeFiles); toast('知識ファイルを保存しました'); }
    catch (e: any) { toast(`保存エラー: ${e.message}`); }
  };
  const savePrompts = async () => {
    try { await updatePrompts(prompts); toast('プロンプトを保存しました'); }
    catch (e: any) { toast(`保存エラー: ${e.message}`); }
  };
  const saveAllowlist = async () => {
    try { await updateAllowlist(allowlist); toast('許可リストを保存しました'); }
    catch (e: any) { toast(`保存エラー: ${e.message}`); }
  };

  const updatePromptBody = (id: string, body: string) => {
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, body } : p));
  };
  const getPromptBody = (id: string) => prompts.find(p => p.id === id)?.body || '';

  const kyotakuFacilities = facilities.filter(f => f.type === 'kyotaku');
  const shokiFacilities = facilities.filter(f => f.type === 'shoki');

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
          <button style={tab === 'knowledge' ? S.settingsTabActive : S.settingsTab} onClick={() => setTab('knowledge')}>知識ファイル</button>
          <button style={tab === 'models' ? S.settingsTabActive : S.settingsTab} onClick={() => setTab('models')}>AIモデル</button>
          {PROMPT_TABS.map(pt => (
            <button key={pt.key} style={tab === pt.key ? S.settingsTabActive : S.settingsTab} onClick={() => setTab(pt.key)}>{pt.label}</button>
          ))}
          {isAdmin && (
            <button style={tab === 'allowlist' ? S.settingsTabActive : S.settingsTab} onClick={() => setTab('allowlist')}>許可リスト</button>
          )}
        </div>

        {/* ── 事業所管理（居宅/小多機別） ── */}
        {tab === 'facilities' && (
          <div style={S.settingsPanel}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              {isAdmin
                ? '居宅介護支援と小規模多機能それぞれの事業所情報を登録します。計画作成者氏名はユーザーが個別に上書きできます。'
                : '管理者が登録した事業所の一覧です。計画作成時に選択します。'}
            </p>

            {/* 居宅介護支援 */}
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f2942', margin: '20px 0 10px', paddingBottom: 6, borderBottom: '2px solid #0f2942' }}>
              居宅介護支援
            </h3>
            {renderFacilityList(kyotakuFacilities, 'kyotaku')}

            {/* 小規模多機能 */}
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f2942', margin: '24px 0 10px', paddingBottom: 6, borderBottom: '2px solid #0f2942' }}>
              小規模多機能型居宅介護
            </h3>
            {renderFacilityList(shokiFacilities, 'shoki')}

            {isAdmin && (
              <div style={{ marginTop: 16 }}><button style={S.saveBtn} onClick={saveFacilities}>保存</button></div>
            )}
          </div>
        )}

        {/* ── 知識ファイル ── */}
        {tab === 'knowledge' && (
          <div style={S.settingsPanel}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
              ケアプラン作成時にAIが必ず参照する知識ファイルです。
              プロンプト内の <code>{'{知識ベース}'}</code> に展開されます。
            </p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
              「共通」はすべてのプラン作成時に参照されます。居宅/小多機専用のファイルは該当モードの時のみ参照されます。
            </p>

            {(['common', 'kyotaku', 'shoki'] as const).map(kfType => {
              const label = kfType === 'common' ? '共通' : kfType === 'kyotaku' ? '居宅介護支援' : '小規模多機能';
              const color = kfType === 'common' ? '#475569' : kfType === 'kyotaku' ? '#2563eb' : '#059669';
              const typeFiles = knowledgeFiles.filter(kf => (kf.type || 'common') === kfType);

              return (
                <div key={kfType} style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color, margin: '0 0 8px', paddingBottom: 4, borderBottom: `2px solid ${color}` }}>
                    {label}
                  </h4>
                  {typeFiles.map(kf => {
                    const idx = knowledgeFiles.indexOf(kf);
                    return (
                      <div key={kf.id || idx} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px', marginBottom: 6,
                        background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0',
                      }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>
                          {kf.mimeType === 'application/pdf' ? '📕' :
                           kf.mimeType?.includes('document') ? '📄' :
                           kf.mimeType?.includes('spreadsheet') ? '📊' : '📎'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {kf.name || '（名称未設定）'}
                          </div>
                          <input
                            style={{ ...S.input, marginTop: 4, fontSize: 11, padding: '4px 8px' }}
                            placeholder="説明（例: 運営基準）"
                            value={kf.description}
                            readOnly={!isAdmin}
                            onChange={e => {
                              const u = [...knowledgeFiles];
                              u[idx] = { ...u[idx], description: e.target.value };
                              setKnowledgeFiles(u);
                            }}
                          />
                        </div>
                        {isAdmin && (
                          <button
                            style={{ ...S.secondaryBtn, padding: '4px 8px', fontSize: 11, color: '#dc2626', flexShrink: 0 }}
                            onClick={() => setKnowledgeFiles(knowledgeFiles.filter((_, i) => i !== idx))}
                          >
                            削除
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {typeFiles.length === 0 && (
                    <p style={{ color: '#cbd5e1', fontSize: 12, padding: '8px 0' }}>ファイルなし</p>
                  )}
                  {isAdmin && (
                    <DrivePicker
                      multiSelect
                      buttonLabel={`+ ${label}の知識ファイルを追加`}
                      style={{ marginTop: 4, fontSize: 12, padding: '6px 14px' }}
                      onPick={(files: PickedFile[]) => {
                        const newFiles = files
                          .filter(f => !knowledgeFiles.some(kf => kf.driveFileId === f.id))
                          .map(f => ({
                            id: '',
                            type: kfType,
                            driveFileId: f.id,
                            name: f.name,
                            mimeType: f.mimeType,
                            description: '',
                          }));
                        if (newFiles.length > 0) {
                          setKnowledgeFiles([...knowledgeFiles, ...newFiles]);
                        }
                      }}
                    />
                  )}
                </div>
              );
            })}

            {isAdmin && (
              <div style={{ marginTop: 8 }}>
                <button style={S.saveBtn} onClick={saveKnowledgeFiles}>保存</button>
              </div>
            )}
          </div>
        )}

        {/* ── AIモデル ── */}
        {tab === 'models' && (
          <div style={S.settingsPanel}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              AIモデルはサーバーの環境変数（.env）で設定されています。
            </p>
            <label style={S.fieldLabel}>プラン生成用モデル</label>
            <input style={{ ...S.input, background: '#f1f5f9', color: '#475569' }} value={models.generate} readOnly />
            <label style={S.fieldLabel}>PDF解析・要約用モデル</label>
            <input style={{ ...S.input, background: '#f1f5f9', color: '#475569' }} value={models.analyze} readOnly />
          </div>
        )}

        {/* ── プロンプト ── */}
        {PROMPT_TABS.some(pt => pt.key === tab) && (
          <div style={S.settingsPanel}>
            <label style={S.fieldLabel}>{PROMPT_TABS.find(pt => pt.key === tab)?.label} 生成プロンプト</label>
            {isAdmin ? (
              <textarea style={S.textarea} rows={18} value={getPromptBody(tab)} onChange={e => updatePromptBody(tab, e.target.value)} />
            ) : (
              <pre style={{ ...S.textarea, background: '#f1f5f9', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7 }}>
                {getPromptBody(tab) || '（未設定）'}
              </pre>
            )}
            <div style={S.promptHint}>
              <span style={{ fontWeight: 600 }}>使用可能な変数:</span>
              {' {利用者名} {要介護度} {生年月日} {住所} {アセスメント情報} {既存ケアプラン} {通い記録} {訪問記録} {泊まり記録} {主治医意見書} {担当者会議録} {フェイスシート} {事業所名} {管理者名} {知識ベース}'}
            </div>
            {isAdmin && <button style={S.saveBtn} onClick={savePrompts}>保存</button>}
          </div>
        )}

        {/* ── 許可リスト ── */}
        {tab === 'allowlist' && isAdmin && (
          <AllowlistPanel allowlist={allowlist} setAllowlist={setAllowlist} saveAllowlist={saveAllowlist} />
        )}
      </main>
    </div>
  );

  function renderFacilityList(facList: Facility[], type: 'kyotaku' | 'shoki') {
    return (
      <>
        {facList.map((fac) => {
          const idx = facilities.findIndex(f => f === fac);
          return (
            <div key={fac.id || idx} style={{ padding: '14px', marginBottom: 10, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>{fac.name || '（未入力）'}</span>
                {isAdmin && (
                  <button style={{ ...S.secondaryBtn, padding: '4px 10px', fontSize: 11, color: '#dc2626' }}
                    onClick={() => setFacilities(facilities.filter((_, i) => i !== idx))}>削除</button>
                )}
              </div>
              <label style={{ ...S.fieldLabel, marginTop: 0 }}>事業所名</label>
              <input style={S.input} readOnly={!isAdmin} value={fac.name}
                onChange={e => { const u = [...facilities]; u[idx] = { ...u[idx], name: e.target.value }; setFacilities(u); }} />
              <label style={S.fieldLabel}>所在地</label>
              <input style={S.input} readOnly={!isAdmin} value={fac.address}
                onChange={e => { const u = [...facilities]; u[idx] = { ...u[idx], address: e.target.value }; setFacilities(u); }} />
              <label style={S.fieldLabel}>計画作成者氏名（デフォルト）</label>
              <input style={S.input} readOnly={!isAdmin} value={fac.managerName}
                onChange={e => { const u = [...facilities]; u[idx] = { ...u[idx], managerName: e.target.value }; setFacilities(u); }} />
            </div>
          );
        })}
        {isAdmin && (
          <button style={{ ...S.secondaryBtn, marginTop: 4, marginBottom: 8 }}
            onClick={() => setFacilities([...facilities, { id: '', type, name: '', address: '', managerName: '' }])}>
            + {type === 'kyotaku' ? '居宅' : '小多機'}事業所を追加
          </button>
        )}
        {facList.length === 0 && !isAdmin && (
          <p style={{ color: '#94a3b8', fontSize: 13 }}>登録されていません。管理者に依頼してください。</p>
        )}
      </>
    );
  }
}

// ── 許可リストパネル（一括追加機能付き） ──

function AllowlistPanel({
  allowlist, setAllowlist, saveAllowlist,
}: {
  allowlist: Array<{ email: string; role: string; name: string }>;
  setAllowlist: (list: Array<{ email: string; role: string; name: string }>) => void;
  saveAllowlist: () => void;
}) {
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkRole, setBulkRole] = useState<string>('user');

  const handleBulkAdd = () => {
    const lines = bulkText.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    const existing = new Set(allowlist.map(a => a.email.toLowerCase()));
    const newEntries = lines
      .filter(line => line.includes('@') && !existing.has(line.toLowerCase()))
      .map(email => ({ email, role: bulkRole, name: '' }));

    if (newEntries.length === 0) {
      alert('追加できるメールアドレスがありません（重複または形式不正）');
      return;
    }
    setAllowlist([...allowlist, ...newEntries]);
    setBulkText('');
    setBulkMode(false);
  };

  return (
    <div style={S.settingsPanel}>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
        ログインを許可するメールアドレスを管理します。<code>admin</code> は設定の編集が可能です。
      </p>

      {/* 個別リスト */}
      {allowlist.map((entry, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input style={{ ...S.input, flex: 2 }} placeholder="メールアドレス" value={entry.email}
            onChange={e => { const u = [...allowlist]; u[idx] = { ...u[idx], email: e.target.value }; setAllowlist(u); }} />
          <select style={{ ...S.input, flex: 0, width: 100 }} value={entry.role}
            onChange={e => { const u = [...allowlist]; u[idx] = { ...u[idx], role: e.target.value }; setAllowlist(u); }}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <input style={{ ...S.input, flex: 1 }} placeholder="名前" value={entry.name}
            onChange={e => { const u = [...allowlist]; u[idx] = { ...u[idx], name: e.target.value }; setAllowlist(u); }} />
          <button style={{ ...S.secondaryBtn, padding: '8px 12px', fontSize: 12, color: '#dc2626' }}
            onClick={() => setAllowlist(allowlist.filter((_, i) => i !== idx))}>削除</button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button style={S.secondaryBtn}
          onClick={() => setAllowlist([...allowlist, { email: '', role: 'user', name: '' }])}>
          + 1件追加
        </button>
        <button style={S.secondaryBtn} onClick={() => setBulkMode(!bulkMode)}>
          {bulkMode ? '閉じる' : '一括追加'}
        </button>
      </div>

      {/* 一括追加 */}
      {bulkMode && (
        <div style={{
          marginTop: 12, padding: '16px', background: '#f0f7ff',
          borderRadius: 10, border: '1px solid #bfdbfe',
        }}>
          <label style={{ ...S.fieldLabel, marginTop: 0 }}>
            メールアドレスを入力（改行・カンマ・セミコロンで区切り）
          </label>
          <textarea
            style={{ ...S.textarea, minHeight: 100 }}
            placeholder={'taro@example.com\nhanako@example.com\njiro@example.com'}
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>ロール:</label>
            <select style={{ ...S.input, width: 120 }} value={bulkRole} onChange={e => setBulkRole(e.target.value)}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            <button
              style={{ ...S.primaryBtn, padding: '8px 20px', fontSize: 13 }}
              onClick={handleBulkAdd}
            >
              追加（{bulkText.split(/[\n,;]+/).map(s => s.trim()).filter(s => s.includes('@')).length}件）
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            既に登録済みのメールアドレスは自動的にスキップされます。
          </p>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <button style={S.saveBtn} onClick={saveAllowlist}>保存</button>
      </div>
    </div>
  );
}
