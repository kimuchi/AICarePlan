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
  managerNameOverride: string;
  onManagerNameOverrideChange: (name: string) => void;
  onAnalyze: () => void;
  analyzing: boolean;
}

export default function SourceSelect({
  folderId, folderName, userName, selectedSources, onSelectSources,
  mode, onModeChange, selectedFacilityId, onFacilityChange,
  managerNameOverride, onManagerNameOverrideChange, onAnalyze, analyzing,
}: Props) {
  const [sources, setSources] = useState<SourceFile[]>([]);
  const [allFacilities, setAllFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getUserSources(folderId, folderName).then(r => {
        setSources(r.sources);
        const byCategory = new Map<string, SourceFile>();
        for (const s of r.sources) {
          if (!byCategory.has(s.category)) byCategory.set(s.category, s);
        }
        onSelectSources(Array.from(byCategory.values()));
      }),
      getFacilities().then(r => {
        setAllFacilities(r.facilities);
        // Load user defaults
        if (!selectedFacilityId) {
          getUserDefaults().then(d => {
            const defaultFacId = d.defaults[folderId];
            const modeFacs = r.facilities.filter(f => f.type === mode);
            if (defaultFacId && modeFacs.some(f => f.id === defaultFacId)) {
              onFacilityChange(defaultFacId);
            } else if (modeFacs.length > 0) {
              onFacilityChange(modeFacs[0].id);
            }
            if (d.managerNameOverride) {
              onManagerNameOverrideChange(d.managerNameOverride);
            }
          }).catch(() => {
            const modeFacs = r.facilities.filter(f => f.type === mode);
            if (modeFacs.length > 0) onFacilityChange(modeFacs[0].id);
          });
        }
      }),
    ])
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [folderId]);

  // モード変更時に、そのモードの事業所に自動切り替え
  useEffect(() => {
    const modeFacs = allFacilities.filter(f => f.type === mode);
    if (modeFacs.length > 0 && !modeFacs.some(f => f.id === selectedFacilityId)) {
      onFacilityChange(modeFacs[0].id);
    }
  }, [mode, allFacilities]);

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
    setUserDefault(folderId, facId, managerNameOverride).catch(() => {});
  };

  const handleManagerNameBlur = () => {
    if (selectedFacilityId) {
      setUserDefault(folderId, selectedFacilityId, managerNameOverride).catch(() => {});
    }
  };

  const modeFacilities = allFacilities.filter(f => f.type === mode);
  const selectedFacility = allFacilities.find(f => f.id === selectedFacilityId);

  return (
    <div>
      <h2 style={S.stepTitle}>情報源・事業所を選択</h2>
      <p style={S.stepDesc}>
        <span style={S.avatar2}>{userName[0]}</span>
        {userName}さんのケアプラン作成
      </p>

      {/* Mode selector */}
      <div style={{ marginBottom: 16 }}>
        <div style={S.modeLabel}>ケアプランの種別:</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={mode === 'kyotaku' ? S.modeRadioActive : S.modeRadio} onClick={() => onModeChange('kyotaku')}>
            <span>{mode === 'kyotaku' ? '\u25CF' : '\u25CB'}</span>
            居宅介護支援
          </div>
          <div style={mode === 'shoki' ? S.modeRadioActive : S.modeRadio} onClick={() => onModeChange('shoki')}>
            <span>{mode === 'shoki' ? '\u25CF' : '\u25CB'}</span>
            小規模多機能型居宅介護
          </div>
        </div>
      </div>

      {/* Facility + manager name */}
      <div style={{ marginBottom: 20, padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e8ecf1' }}>
        {modeFacilities.length > 0 ? (
          <>
            <div style={S.modeLabel}>事業所:</div>
            <select style={{ ...S.input, maxWidth: 500 }} value={selectedFacilityId} onChange={e => handleFacilityChange(e.target.value)}>
              {modeFacilities.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            {selectedFacility && (
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{selectedFacility.address}</p>
            )}
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                計画作成者氏名（空欄なら事業所のデフォルト: {selectedFacility?.managerName || '未設定'}）
              </label>
              <input
                style={{ ...S.input, maxWidth: 300, marginTop: 4 }}
                placeholder={selectedFacility?.managerName || ''}
                value={managerNameOverride}
                onChange={e => onManagerNameOverrideChange(e.target.value)}
                onBlur={handleManagerNameBlur}
              />
            </div>
          </>
        ) : (
          <div style={{ padding: '8px 0', color: '#92400e', fontSize: 13 }}>
            {mode === 'kyotaku' ? '居宅' : '小多機'}の事業所が未登録です。設定画面で事業所を登録してください。
          </div>
        )}
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>ファイルを検索中...</p>}
      {error && <p style={{ textAlign: 'center', color: '#dc2626', padding: 20 }}>{error}</p>}

      <div style={S.sourceList}>
        {sources.map(s => {
          const checked = selectedIds.has(s.id);
          return (
            <div key={s.id} style={{ ...S.sourceCard, borderColor: checked ? '#0f2942' : '#e2e8f0', background: checked ? '#f0f7ff' : '#fff' }}
              onClick={() => toggleSource(s)}>
              <span style={S.sourceIcon}>{s.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.sourceName}>
                  {s.name}
                  {s.isConfidential && <span style={{ fontSize: 11, marginLeft: 6, color: '#7c3aed', fontWeight: 600 }}>🔒 機密</span>}
                </div>
                <div style={S.sourceMeta}>{s.date} ・ {s.category}</div>
              </div>
              <div style={{ ...S.checkbox, background: checked ? '#0f2942' : '#fff', borderColor: checked ? '#0f2942' : '#cbd5e1' }}>
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
              {selectedSources.length}件の情報源 + 知識ファイルを読み込み、ケアプランを生成しています
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
