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
              運営基準、様式・記載例、運営推進会議資料など、計画作成の根拠となる文書を登録してください。
            </p>

            {knowledgeFiles.map((kf, idx) => (
              <div key={kf.id || idx} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', marginBottom: 8,
                background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0',
              }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>
                  {kf.mimeType === 'application/pdf' ? '📕' :
                   kf.mimeType?.includes('document') ? '📄' :
                   kf.mimeType === 'application/json' ? '📋' : '📎'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {kf.name || '（名称未設定）'}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    {kf.mimeType} ・ ID: {kf.driveFileId?.slice(0, 20)}...
                  </div>
                  <input
                    style={{ ...S.input, marginTop: 6, fontSize: 12, padding: '6px 10px' }}
                    placeholder="説明（例: 小規模多機能型居宅介護の運営基準）"
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
                    style={{ ...S.secondaryBtn, padding: '6px 10px', fontSize: 11, color: '#dc2626', flexShrink: 0 }}
                    onClick={() => setKnowledgeFiles(knowledgeFiles.filter((_, i) => i !== idx))}
                  >
                    削除
                  </button>
                )}
              </div>
            ))}

            {knowledgeFiles.length === 0 && (
              <p style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
                知識ファイルが登録されていません
              </p>
            )}

            {isAdmin && (
              <>
                <div style={{ marginTop: 12 }}>
                  <DrivePicker
                    multiSelect
                    buttonLabel="Googleドライブからファイルを選択"
                    onPick={(files: PickedFile[]) => {
                      const newFiles = files
                        .filter(f => !knowledgeFiles.some(kf => kf.driveFileId === f.id))
                        .map(f => ({
                          id: '',
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
                </div>
                <div style={{ marginTop: 16 }}>
                  <button style={S.saveBtn} onClick={saveKnowledgeFiles}>保存</button>
                </div>
              </>
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
          <div style={S.settingsPanel}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              ログインを許可するメールアドレスを管理します。<code>admin</code> は設定の編集が可能です。
            </p>
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
            <button style={{ ...S.secondaryBtn, marginTop: 8 }}
              onClick={() => setAllowlist([...allowlist, { email: '', role: 'user', name: '' }])}>+ 追加</button>
            <div style={{ marginTop: 16 }}><button style={S.saveBtn} onClick={saveAllowlist}>保存</button></div>
          </div>
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
