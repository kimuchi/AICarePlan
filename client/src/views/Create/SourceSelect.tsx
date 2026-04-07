import React, { useEffect, useState } from 'react';
import { S } from '../../styles';
import { getUserSources, type SourceFile, type BusinessMode } from '../../api';

interface Props {
  folderId: string;
  folderName: string;
  userName: string;
  selectedSources: SourceFile[];
  onSelectSources: (sources: SourceFile[]) => void;
  mode: BusinessMode;
  onModeChange: (mode: BusinessMode) => void;
  onAnalyze: () => void;
  analyzing: boolean;
}

export default function SourceSelect({
  folderId, folderName, userName, selectedSources, onSelectSources,
  mode, onModeChange, onAnalyze, analyzing,
}: Props) {
  const [sources, setSources] = useState<SourceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    getUserSources(folderId, folderName)
      .then(r => {
        setSources(r.sources);
        // Auto-select latest of each category
        const byCategory = new Map<string, SourceFile>();
        for (const s of r.sources) {
          if (!byCategory.has(s.category)) {
            byCategory.set(s.category, s);
          }
        }
        onSelectSources(Array.from(byCategory.values()));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [folderId]);

  const selectedIds = new Set(selectedSources.map(s => s.id));

  const toggleSource = (source: SourceFile) => {
    if (selectedIds.has(source.id)) {
      onSelectSources(selectedSources.filter(s => s.id !== source.id));
    } else {
      onSelectSources([...selectedSources, source]);
    }
  };

  return (
    <div>
      <h2 style={S.stepTitle}>Googleドライブから情報源を選択</h2>
      <p style={S.stepDesc}>
        <span style={S.avatar2}>{userName[0]}</span>
        {userName}さんの関連ファイル
      </p>

      {/* Mode selector */}
      <div style={{ marginBottom: 20 }}>
        <div style={S.modeLabel}>このケアプランの種別:</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div
            style={mode === 'kyotaku' ? S.modeRadioActive : S.modeRadio}
            onClick={() => onModeChange('kyotaku')}
          >
            <span>{mode === 'kyotaku' ? '●' : '○'}</span>
            居宅介護支援（通常の居宅サービス計画書）
          </div>
          <div
            style={mode === 'shoki' ? S.modeRadioActive : S.modeRadio}
            onClick={() => onModeChange('shoki')}
          >
            <span>{mode === 'shoki' ? '●' : '○'}</span>
            小規模多機能型居宅介護（兼小規模多機能型居宅介護計画書）
          </div>
        </div>
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>ファイルを検索中...</p>}
      {error && <p style={{ textAlign: 'center', color: '#dc2626', padding: 20 }}>{error}</p>}

      <div style={S.sourceList}>
        {sources.map(s => {
          const checked = selectedIds.has(s.id);
          return (
            <div
              key={s.id}
              style={{
                ...S.sourceCard,
                borderColor: checked ? '#0f2942' : '#e2e8f0',
                background: checked ? '#f0f7ff' : '#fff',
              }}
              onClick={() => toggleSource(s)}
            >
              <span style={S.sourceIcon}>{s.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.sourceName}>
                  {s.name}
                  {s.isConfidential && <span style={{ fontSize: 11, marginLeft: 6, color: '#7c3aed', fontWeight: 600 }}>🔒 機密</span>}
                </div>
                <div style={S.sourceMeta}>{s.date} ・ {s.category}</div>
              </div>
              <div style={{
                ...S.checkbox,
                background: checked ? '#0f2942' : '#fff',
                borderColor: checked ? '#0f2942' : '#cbd5e1',
              }}>
                {checked && <span style={{ color: '#fff', fontSize: 12 }}>&#10003;</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={S.stepActions}>
        <button
          style={selectedSources.length > 0 ? S.primaryBtn : S.disabledBtn}
          disabled={selectedSources.length === 0 || analyzing}
          onClick={onAnalyze}
        >
          AI分析を実行 &rarr;
        </button>
      </div>

      {analyzing && (
        <div style={S.analyzingOverlay}>
          <div style={S.analyzingCard}>
            <div style={S.spinner} />
            <h3 style={{ margin: '16px 0 8px', color: '#1e293b' }}>AI分析中...</h3>
            <p style={{ color: '#64748b', fontSize: 14 }}>
              {selectedSources.length}件の情報源を読み込み、ケアプランを生成しています
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
