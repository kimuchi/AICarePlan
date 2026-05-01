import React, { useEffect, useRef, useState } from 'react';
import { S } from '../styles';
import { importPreview, importCommit, type SessionUser } from '../api';
import type {
  PreviewItem,
  CommitRequestItem,
  CommitResultItem,
  UserMatchCandidate,
} from '@server/types/imported';

interface Props {
  user: SessionUser;
  onNavigate: (view: string) => void;
  toast: (msg: string) => void;
}

interface RowState extends PreviewItem {
  /** ユーザーが確定した利用者フォルダ (matched なら自動、未確定なら null) */
  selectedFolderId: string | null;
  /** 新規作成ユーザーの名前（空欄なら作成しない） */
  newUserName: string;
  /** 新規利用者として作成するモード */
  createNew: boolean;
  expanded: boolean;
}

export default function ImportPage({ user, onNavigate, toast }: Props) {
  const [step, setStep] = useState<'pick' | 'review' | 'done'>('pick');
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<RowState[]>([]);
  const [busy, setBusy] = useState(false);
  const [commitResults, setCommitResults] = useState<CommitResultItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list) return;
    const arr: File[] = [];
    for (let i = 0; i < list.length; i++) arr.push(list[i]);
    setFiles((prev) => [...prev, ...arr]);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const list = e.dataTransfer.files;
    if (!list) return;
    const arr: File[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (/\.xlsx$/i.test(f.name)) arr.push(f);
    }
    setFiles((prev) => [...prev, ...arr]);
  }

  async function runPreview() {
    if (files.length === 0) {
      toast('Excelファイルを選択してください');
      return;
    }
    setBusy(true);
    try {
      const r = await importPreview(files);
      setRows(
        r.items.map((it) => ({
          ...it,
          selectedFolderId: it.userMatch.status === 'matched' ? it.userMatch.folderId || null : null,
          newUserName: it.extractedUser?.name || '',
          createNew: it.userMatch.status === 'not_found',
          expanded: false,
        }))
      );
      setStep('review');
    } catch (e) {
      toast('プレビュー失敗: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runCommit() {
    const items: CommitRequestItem[] = rows.map((r) => ({
      fileId: r.fileId,
      userFolderId: r.selectedFolderId,
      createNewUser:
        r.createNew && r.newUserName.trim()
          ? { name: r.newUserName.trim(), kana: r.extractedUser?.kana, isPrivate: false }
          : null,
    }));
    // 必須チェック
    for (let i = 0; i < items.length; i++) {
      if (!items[i].userFolderId && !items[i].createNewUser) {
        toast(`${rows[i].fileName}: 利用者を選択するか新規作成名を入力してください`);
        return;
      }
    }
    setBusy(true);
    try {
      const r = await importCommit(items);
      setCommitResults(r.results);
      setStep('done');
      const okCount = r.results.filter((x) => x.ok).length;
      toast(`${okCount}/${r.results.length} 件を取り込みました`);
    } catch (e) {
      toast('取込失敗: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function updateRow(idx: number, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div style={S.root}>
      <header style={S.header}>
        <div>
          <h1 style={S.headerTitle}>Excel取込</h1>
          <p style={S.headerSub}>既存ケアプラン・アセスメントの取り込み</p>
        </div>
        <div style={S.headerRight}>
          <span style={S.userBadge}>{user.name}</span>
          <button style={S.logoutBtn} onClick={() => onNavigate('home')}>
            ホームに戻る
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
        {step === 'pick' && (
          <>
            <h2 style={{ marginTop: 0 }}>1. ファイル選択</h2>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #94a3b8',
                borderRadius: 12,
                padding: 40,
                textAlign: 'center',
                cursor: 'pointer',
                background: '#f8fafc',
              }}
            >
              <p style={{ margin: 0, fontSize: 16 }}>
                Excelファイル(.xlsx) をここにドロップ、またはクリックして選択
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
                ケアプラン・フェイスシート・アセスメント を複数まとめて取り込めます
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx"
                style={{ display: 'none' }}
                onChange={onPickFiles}
              />
            </div>
            {files.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14 }}>選択中 ({files.length}件)</h3>
                <ul style={{ paddingLeft: 16 }}>
                  {files.map((f, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      <span>{f.name}</span>{' '}
                      <button
                        style={{ ...S.smallBtn, marginLeft: 8, background: '#dc2626' }}
                        onClick={() => removeFile(i)}
                      >
                        除外
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  style={{ ...S.smallBtn, marginTop: 12, fontSize: 14, padding: '8px 16px' }}
                  onClick={runPreview}
                  disabled={busy}
                >
                  {busy ? '解析中...' : 'プレビューへ進む'}
                </button>
              </div>
            )}
          </>
        )}

        {step === 'review' && (
          <>
            <h2 style={{ marginTop: 0 }}>2. プレビュー / 利用者確認</h2>
            <p style={{ color: '#64748b', fontSize: 13 }}>
              各ファイルの解析結果を確認し、対応する利用者フォルダを選択してください。
            </p>
            {rows.map((r, idx) => (
              <ImportRow key={r.fileId} row={r} onChange={(p) => updateRow(idx, p)} />
            ))}
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button style={S.smallBtn} onClick={() => setStep('pick')} disabled={busy}>
                戻る
              </button>
              <button
                style={{ ...S.smallBtn, fontSize: 14, padding: '10px 20px' }}
                onClick={runCommit}
                disabled={busy}
              >
                {busy ? '取込中...' : `${rows.length}件を取り込む`}
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <h2 style={{ marginTop: 0 }}>3. 取込完了</h2>
            <p style={{ color: '#64748b' }}>{commitResults.length}件処理しました。</p>
            {commitResults.map((r, i) => (
              <div
                key={i}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                  background: r.ok ? '#f0fdf4' : '#fef2f2',
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {r.ok ? '✓' : '✗'} {r.fileName} ({r.kind})
                </div>
                {r.messages.map((m, j) => (
                  <div key={j} style={{ fontSize: 12, color: '#64748b' }}>
                    {m}
                  </div>
                ))}
                {r.artifacts.originalExcelUrl && (
                  <a
                    href={r.artifacts.originalExcelUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, marginRight: 12 }}
                  >
                    原本Excel
                  </a>
                )}
                {r.artifacts.analysisJsonUrl && (
                  <a href={r.artifacts.analysisJsonUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                    解析JSON
                  </a>
                )}
              </div>
            ))}
            <button style={S.smallBtn} onClick={() => onNavigate('home')}>
              ホームに戻る
            </button>
          </>
        )}
      </main>
    </div>
  );
}

function ImportRow({ row, onChange }: { row: RowState; onChange: (p: Partial<RowState>) => void }) {
  const matchColor =
    row.userMatch.status === 'matched' ? '#16a34a' : row.userMatch.status === 'candidates' ? '#d97706' : '#dc2626';

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 600 }}>{row.fileName}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            種別: {row.kind} / 利用者: {row.extractedUser?.name || '(未抽出)'}{' '}
            {row.extractedUser?.birthDate && <>/ 生年月日: {row.extractedUser.birthDate}</>}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            シート: {row.summary.sheets.join(', ')}
            {row.summary.needsCount != null && <> / ニーズ {row.summary.needsCount}件</>}
            {row.summary.monitoringCount != null && <> / モニタリング {row.summary.monitoringCount}件</>}
            {row.summary.anythingBoxCount != null && <> / なんでも {row.summary.anythingBoxCount}件</>}
            {row.summary.careLevel && <> / {row.summary.careLevel}</>}
          </div>
        </div>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: matchColor, color: 'white' }}>
          {row.userMatch.status === 'matched' ? '一致' : row.userMatch.status === 'candidates' ? '候補あり' : '未一致'}
        </span>
      </div>

      <div style={{ marginTop: 8, padding: 8, background: '#f8fafc', borderRadius: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>取込先利用者</div>
        {row.userMatch.candidates.length > 0 && (
          <select
            value={row.selectedFolderId || ''}
            onChange={(e) => onChange({ selectedFolderId: e.target.value || null, createNew: !e.target.value })}
            style={{ width: '100%', padding: 6, fontSize: 13 }}
          >
            <option value="">— 既存利用者を選択 —</option>
            {row.userMatch.candidates.map((c: UserMatchCandidate) => (
              <option key={c.folderId} value={c.folderId}>
                {c.folderName}（{c.reason}{c.score != null && ` ${(c.score * 100).toFixed(0)}%`}）
              </option>
            ))}
          </select>
        )}
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <label>
            <input
              type="checkbox"
              checked={row.createNew}
              onChange={(e) => onChange({ createNew: e.target.checked, selectedFolderId: e.target.checked ? null : row.selectedFolderId })}
            />{' '}
            新規利用者として作成
          </label>
          {row.createNew && (
            <input
              type="text"
              value={row.newUserName}
              onChange={(e) => onChange({ newUserName: e.target.value })}
              placeholder="氏名（例: 中島 潔）"
              style={{ marginLeft: 8, padding: 4, fontSize: 13 }}
            />
          )}
        </div>
      </div>

      {row.warnings.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#92400e' }}>
          ⚠ {row.warnings.join(' / ')}
        </div>
      )}
    </div>
  );
}
