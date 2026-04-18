import React, { useState } from 'react';
import { S } from '../styles';
import { previewImport, commitImport } from '../api';

interface Props { onBack: () => void; toast: (msg: string) => void; onOpenDraft?: (planId: string) => void; }

export default function ImportPage({ onBack, toast, onOpenDraft }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const doPreview = async () => {
    if (!files.length) return;
    setLoading(true);
    try { const r = await previewImport(files); setPreview(r.items || []); }
    catch (e: any) { toast(`プレビュー失敗: ${e.message}`); }
    finally { setLoading(false); }
  };

  const doCommit = async () => {
    setCommitting(true);
    setCommitError(null);
    try {
      const req = preview.map(p => ({
        fileId: p.fileId,
        fileName: p.fileName,
        userFolderId: p.userMatch?.folderId || null,
        userName: p.extractedUser?.name || '',
        options: { autoCreateMissing: true },
      }));
      const r = await commitImport(req);
      setResults(r.results || []);
      const failed = (r.results || []).filter((x: any) => !x.ok).length;
      if (failed > 0) {
        setCommitError(`${failed}件のファイルで取り込みに失敗しました。下の結果詳細を確認してください。`);
      }
      toast('取り込み完了');
    } catch (e: any) {
      const msg = `取り込みAPIでエラー: ${e.message || '不明なエラー'}`;
      setCommitError(msg);
      toast(msg);
    } finally { setCommitting(false); }
  };

  return (
    <div>
      <h2 style={S.stepTitle}>Excel取り込み</h2>
      <p style={S.stepDesc}>ケアプラン / フェイスシート・アセスメントのExcelを複数アップロードできます。</p>
      <div style={{ ...S.settingsPanel, marginBottom: 16 }}>
        <input type="file" accept=".xlsx" multiple onChange={e => setFiles(Array.from(e.target.files || []))} />
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button style={S.primaryBtn} onClick={doPreview} disabled={!files.length || loading}>{loading ? '解析中...' : 'プレビュー作成'}</button>
          <button style={S.secondaryBtn} onClick={onBack}>戻る</button>
        </div>
      </div>

      {preview.length > 0 && (
        <div style={S.settingsPanel}>
          <h3 style={S.sectionTitle}>プレビュー</h3>
          <div style={{ marginBottom: 10, fontSize: 12, color: '#334155' }}>
            合計 {preview.length} ファイル（未一致利用者は取り込み時に自動で新規作成）
          </div>
          {preview.map((p, i) => (
            <div key={p.fileId || i} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div><b>{p.fileName}</b></div>
              <div>判定: {p.kind}</div>
              <div>利用者: {p.extractedUser?.name || '不明'} / {p.extractedUser?.birthDate || '-'} / {p.extractedUser?.insuredNumber || '-'}</div>
              <div>候補: {p.userMatch?.status} {p.userMatch?.folderName ? `(${p.userMatch.folderName})` : ''}</div>
              {p.warnings?.length > 0 && <div style={{ color: '#b45309' }}>警告: {p.warnings.join(' / ')}</div>}
            </div>
          ))}
          <button style={S.primaryBtn} onClick={doCommit} disabled={committing}>{committing ? '取り込み中...' : 'この内容で取り込む'}</button>
        </div>
      )}

      {commitError && (
        <div style={{ ...S.settingsPanel, marginTop: 16, border: '1px solid #fecaca', background: '#fff7f7' }}>
          <h3 style={{ ...S.sectionTitle, marginTop: 0, color: '#b91c1c' }}>取り込みエラー</h3>
          <div style={{ fontSize: 13, color: '#7f1d1d', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{commitError}</div>
          <div style={{ marginTop: 10, fontSize: 12, color: '#7f1d1d' }}>
            ファイル・利用者対応・Google Drive権限を確認して再実行してください。結果詳細は下に残ります。
          </div>
        </div>
      )}

      {results && (
        <div style={{ ...S.settingsPanel, marginTop: 16 }}>
          <h3 style={S.sectionTitle}>取り込み結果</h3>
          {results.map((r, i) => (
            <div key={i} style={{ borderBottom: '1px solid #e2e8f0', padding: '8px 0' }}>
              <div>{r.ok ? '✅ 成功' : '❌ 失敗'}</div>
              <div style={{ fontSize: 12, color: '#334155' }}>{r.fileName || '（ファイル名不明）'}</div>
              {r.artifacts?.sheetUrl && <a href={r.artifacts.sheetUrl} target="_blank" rel="noreferrer">Google Sheets</a>}
              {r.artifacts?.draftId && onOpenDraft && <button style={{ ...S.smallBtn, marginLeft: 8 }} onClick={() => onOpenDraft!(r.artifacts.draftId)}>編集画面を開く</button>}
              {Array.isArray(r.messages) && r.messages.length > 0 && (
                <div style={{ marginTop: 6, color: '#92400e', fontSize: 12 }}>
                  {r.messages.join(' / ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
