import React, { useEffect, useState } from 'react';
import { S } from '../../styles';
import {
  getUserSources, getFacilities, getUserDefaults, setUserDefault,
  type SourceFile, type BusinessMode, type Facility,
} from '../../api';

interface Props {
  folderId: string;
  folderName: string;
  userName: string;
  selectedSources: SourceFile[];
  onSelectSources: (sources: SourceFile[]) => void;
  mode: BusinessMode;
  onModeChange: (mode: BusinessMode) => void;
  selectedFacilityId: string;
  onFacilityChange: (facilityId: string) => void;
  onAnalyze: () => void;
  analyzing: boolean;
}

export default function SourceSelect({
  folderId, folderName, userName, selectedSources, onSelectSources,
  mode, onModeChange, selectedFacilityId, onFacilityChange, onAnalyze, analyzing,
}: Props) {
  const [sources, setSources] = useState<SourceFile[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getUserSources(folderId, folderName).then(r => {
        setSources(r.sources);
        // Auto-select latest of each category
        const byCategory = new Map<string, SourceFile>();
        for (const s of r.sources) {
          if (!byCategory.has(s.category)) {
            byCategory.set(s.category, s);
          }
        }
        onSelectSources(Array.from(byCategory.values()));
      }),
      getFacilities().then(r => {
        setFacilities(r.facilities);
        // If no facility selected yet, try to load user default
        if (!selectedFacilityId && r.facilities.length > 0) {
          getUserDefaults().then(d => {
            const defaultFacId = d.defaults[folderId];
            if (defaultFacId && r.facilities.some(f => f.id === defaultFacId)) {
              onFacilityChange(defaultFacId);
            } else {
              onFacilityChange(r.facilities[0].id);
            }
          }).catch(() => {
            onFacilityChange(r.facilities[0].id);
          });
        }
      }),
    ])
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

  const handleFacilityChange = (facId: string) => {
    onFacilityChange(facId);
    // Save as default for this client
    setUserDefault(folderId, facId).catch(() => {});
  };

  const selectedFacility = facilities.find(f => f.id === selectedFacilityId);

  return (
    <div>
      <h2 style={S.stepTitle}>情報源と事業所を選択</h2>
      <p style={S.stepDesc}>
        <span style={S.avatar2}>{userName[0]}</span>
        {userName}さんの関連ファイル
      </p>

      {/* Facility selector */}
      {facilities.length > 0 && (
        <div style={{ marginBottom: 20, padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e8ecf1' }}>
          <div style={S.modeLabel}>事業所:</div>
          <select
            style={{ ...S.input, maxWidth: 500 }}
            value={selectedFacilityId}
            onChange={e => handleFacilityChange(e.target.value)}
          >
            {facilities.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}（{f.managerName}）
              </option>
            ))}
          </select>
          {selectedFacility && (
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              {selectedFacility.address}
            </p>
          )}
        </div>
      )}
      {facilities.length === 0 && !loading && (
        <div style={{ marginBottom: 20, padding: '12px 16px', background: '#fef3c7', borderRadius: 10, border: '1px solid #fde68a', fontSize: 13, color: '#92400e' }}>
          事業所が登録されていません。設定画面で事業所を登録してください。
        </div>
      )}

      {/* Mode selector */}
      <div style={{ marginBottom: 20 }}>
        <div style={S.modeLabel}>このケアプランの種別:</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div
            style={mode === 'kyotaku' ? S.modeRadioActive : S.modeRadio}
            onClick={() => onModeChange('kyotaku')}
          >
            <span>{mode === 'kyotaku' ? '\u25CF' : '\u25CB'}</span>
            居宅介護支援（通常の居宅サービス計画書）
          </div>
          <div
            style={mode === 'shoki' ? S.modeRadioActive : S.modeRadio}
            onClick={() => onModeChange('shoki')}
          >
            <span>{mode === 'shoki' ? '\u25CF' : '\u25CB'}</span>
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
          style={selectedSources.length > 0 && selectedFacilityId ? S.primaryBtn : S.disabledBtn}
          disabled={selectedSources.length === 0 || !selectedFacilityId || analyzing}
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
