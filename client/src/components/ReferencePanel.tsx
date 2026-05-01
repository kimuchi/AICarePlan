import React, { useEffect, useState } from 'react';
import { getLatestCareplan, getLatestAssessment } from '../api';
import type {
  ImportedCareplan,
  ImportedAssessmentBundle,
  SelectionGroup,
  DateValue,
  DateRangeValue,
  CategoryTag,
  EvidenceValue,
} from '@server/types/imported';

interface Props {
  folderId: string;
}

type Tab =
  | 'face'
  | 'assessment'
  | 'meeting'
  | 'history'
  | 'monitoring'
  | 'anything'
  | 'doctor'
  | 'cert';

export default function ReferencePanel({ folderId }: Props) {
  const [careplan, setCareplan] = useState<ImportedCareplan | null>(null);
  const [assessment, setAssessment] = useState<ImportedAssessmentBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('face');
  const [careplanSrc, setCareplanSrc] = useState<{ fileName: string; modifiedTime: string } | null>(null);
  const [assessmentSrc, setAssessmentSrc] = useState<{ fileName: string; modifiedTime: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getLatestCareplan(folderId).then((r) => {
        if (r.found && r.data) {
          setCareplan(r.data);
          if (r.source) setCareplanSrc({ fileName: r.source.fileName, modifiedTime: r.source.modifiedTime });
        }
      }),
      getLatestAssessment(folderId).then((r) => {
        if (r.found && r.data) {
          setAssessment(r.data);
          if (r.source) setAssessmentSrc({ fileName: r.source.fileName, modifiedTime: r.source.modifiedTime });
        }
      }),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [folderId]);

  if (loading) return <div style={{ padding: 16, color: '#64748b' }}>参考情報を読み込み中...</div>;
  if (!careplan && !assessment) {
    return (
      <div style={{ padding: 16, color: '#64748b' }}>
        参考情報はまだ取込されていません。「Excel取込」から取り込んでください。
      </div>
    );
  }

  const tabs: Array<{ k: Tab; label: string; available: boolean }> = [
    { k: 'face', label: 'フェイスシート', available: !!assessment },
    { k: 'assessment', label: 'アセスメント', available: !!assessment },
    { k: 'meeting', label: '担当者会議', available: !!careplan },
    { k: 'history', label: '支援経過', available: !!careplan },
    { k: 'monitoring', label: 'モニタリング', available: !!careplan },
    { k: 'anything', label: 'なんでもボックス', available: !!assessment },
    { k: 'doctor', label: '主治医意見書', available: !!assessment },
    { k: 'cert', label: '認定調査票', available: !!assessment },
  ];

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        background: '#fff',
        marginTop: 16,
      }}
    >
      <div style={{ padding: 8, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {tabs
          .filter((t) => t.available)
          .map((t) => (
            <button
              key={t.k}
              onClick={() => setActiveTab(t.k)}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: activeTab === t.k ? '#0f2942' : '#fff',
                color: activeTab === t.k ? '#fff' : '#475569',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
      </div>
      <div style={{ padding: 16 }}>
        {activeTab === 'face' && assessment && <FaceSheetView data={assessment} src={assessmentSrc} />}
        {activeTab === 'assessment' && assessment && <AssessmentView data={assessment} src={assessmentSrc} />}
        {activeTab === 'meeting' && careplan && <MeetingNoteView data={careplan} src={careplanSrc} />}
        {activeTab === 'history' && careplan && <SupportHistoryView data={careplan} src={careplanSrc} />}
        {activeTab === 'monitoring' && careplan && <MonitoringView data={careplan} src={careplanSrc} />}
        {activeTab === 'anything' && assessment && <AnythingBoxView data={assessment} src={assessmentSrc} />}
        {activeTab === 'doctor' && assessment && <DoctorOpinionView data={assessment} src={assessmentSrc} />}
        {activeTab === 'cert' && assessment && <CertificationSurveyView data={assessment} src={assessmentSrc} />}
      </div>
    </div>
  );
}

// ── Primitives ──

function SourceBanner({ src, kind }: { src: { fileName: string; modifiedTime: string } | null; kind: string }) {
  if (!src) return null;
  return (
    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
      情報源: {kind} / {src.fileName} ({src.modifiedTime?.split('T')[0]})
    </div>
  );
}

function EmptyValue({ children }: { children?: React.ReactNode }) {
  return <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{children || '(未入力)'}</span>;
}

function VRaw({ raw }: { raw: string }) {
  if (!raw) return <EmptyValue />;
  return <span style={{ whiteSpace: 'pre-wrap' }}>{raw}</span>;
}

function VDate({ d }: { d?: DateValue }) {
  if (!d || !d.raw) return <EmptyValue />;
  return (
    <span>
      {d.raw}
      {d.iso && <span style={{ color: '#94a3b8', marginLeft: 4 }}>({d.iso})</span>}
    </span>
  );
}

function VRange({ d }: { d?: DateRangeValue }) {
  if (!d || !d.raw) return <EmptyValue />;
  return (
    <span>
      {d.raw}
      {(d.fromIso || d.toIso) && (
        <span style={{ color: '#94a3b8', marginLeft: 4 }}>
          ({d.fromIso || '?'} 〜 {d.toIso || '?'})
        </span>
      )}
    </span>
  );
}

function CheckChip({ group }: { group: SelectionGroup }) {
  if (!group.options.length && !group.raw) return <EmptyValue />;
  if (!group.options.length) return <span>{group.raw}</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {group.options.map((o) => {
        const sel = group.selectedAll.includes(o);
        return (
          <span
            key={o}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 6,
              background: sel ? '#0f2942' : '#f1f5f9',
              color: sel ? '#fff' : '#94a3b8',
              fontWeight: sel ? 700 : 400,
              border: sel ? 'none' : '1px solid #e2e8f0',
            }}
          >
            {sel ? '■' : '□'} {o}
          </span>
        );
      })}
    </div>
  );
}

function VEvidence({ e }: { e: EvidenceValue }) {
  if (!e?.raw) return null;
  return (
    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
      {e.kind && (
        <span style={{ background: '#fef3c7', padding: '1px 6px', borderRadius: 4, marginRight: 4 }}>
          {e.kind}
        </span>
      )}
      {e.basis && <span>{e.basis}</span>}
      {!e.kind && !e.basis && <span>{e.raw}</span>}
    </div>
  );
}

function CategoryChip({ tag }: { tag: CategoryTag }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {tag.importance > 0 && <span style={{ color: '#dc2626' }}>{'★'.repeat(tag.importance)}</span>}
      {tag.categories.map((c, i) => (
        <span key={i} style={{ fontSize: 10, padding: '1px 6px', background: '#dbeafe', color: '#1e40af', borderRadius: 4 }}>
          {c}
        </span>
      ))}
      {tag.rest && <span style={{ fontSize: 11, color: '#64748b' }}>{tag.rest}</span>}
    </span>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <div style={{ padding: '6px 10px', background: '#f1f5f9', fontWeight: 600, fontSize: 13, borderBottom: '1px solid #e2e8f0' }}>
        {title}
      </div>
      <div style={{ padding: 10, fontSize: 13 }}>{children}</div>
    </div>
  );
}

function DefList({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {items.map((it, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '4px 8px', fontSize: 12, color: '#64748b', width: '30%', verticalAlign: 'top' }}>
              {it.label}
            </td>
            <td style={{ padding: '4px 8px', fontSize: 13, verticalAlign: 'top' }}>{it.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Views ──

function FaceSheetView({ data, src }: { data: ImportedAssessmentBundle; src: any }) {
  const f = data.faceSheet;
  return (
    <div>
      <SourceBanner src={src} kind="フェイスシート" />
      <SectionCard title="基本情報">
        <DefList
          items={[
            { label: '氏名', value: f.basic.name || <EmptyValue /> },
            { label: 'フリガナ', value: f.basic.furigana || <EmptyValue /> },
            { label: '性別', value: f.basic.gender || <EmptyValue /> },
            { label: '生年月日', value: <VDate d={f.basic.birthDate} /> },
            { label: '住所', value: f.basic.address || <EmptyValue /> },
            { label: 'TEL', value: f.basic.tel || <EmptyValue /> },
          ]}
        />
      </SectionCard>
      <SectionCard title="被保険者情報">
        <DefList
          items={[
            { label: '被保険者番号', value: f.insurance.insuredNumber || <EmptyValue /> },
            { label: '保険者番号', value: f.insurance.insurerNumber || <EmptyValue /> },
            { label: '負担割合', value: f.insurance.copaymentRatio || <EmptyValue /> },
            { label: '医療保険', value: f.insurance.medicalInsurance || <EmptyValue /> },
            { label: '障害者手帳', value: f.insurance.disabilityCert || <EmptyValue /> },
            { label: '生活保護', value: f.insurance.welfare || <EmptyValue /> },
          ]}
        />
      </SectionCard>
      <SectionCard title="認定情報">
        <DefList
          items={[
            { label: '要介護度', value: f.certification.careLevel || <EmptyValue /> },
            { label: '認定期間', value: <VRange d={f.certification.certPeriod} /> },
            { label: '認定日', value: <VDate d={f.certification.certDate} /> },
            { label: '区分', value: <CheckChip group={f.certification.kindGroup} /> },
            { label: '支給限度基準額', value: f.certification.limitAmount || <EmptyValue /> },
            { label: 'アセスメント理由', value: f.certification.reason || <EmptyValue /> },
          ]}
        />
      </SectionCard>
      <SectionCard title="自立度">
        <DefList
          items={[
            { label: '障害高齢者', value: <CheckChip group={f.independence.physical} /> },
            { label: '認知症高齢者', value: <CheckChip group={f.independence.cognitive} /> },
          ]}
        />
      </SectionCard>
      <SectionCard title="主治医・医療情報">
        <DefList
          items={[
            { label: '主治医', value: f.medical.doctor || <EmptyValue /> },
            { label: '診断名①', value: f.medical.diagnosis1 || <EmptyValue /> },
            { label: '診断名②', value: f.medical.diagnosis2 || <EmptyValue /> },
            { label: '発症日', value: f.medical.onsetDate || <EmptyValue /> },
            { label: '症状の安定性', value: f.medical.stability || <EmptyValue /> },
            { label: '特別な医療', value: f.medical.specialMedical || <EmptyValue /> },
            { label: '医学的管理の必要性', value: f.medical.managementNeed || <EmptyValue /> },
            { label: '備考', value: <VRaw raw={f.medical.remarks} /> },
          ]}
        />
      </SectionCard>
      {f.emergencyContacts.length > 0 && (
        <SectionCard title={`緊急連絡先 (${f.emergencyContacts.length}件)`}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: 4, border: '1px solid #e2e8f0' }}>No</th>
                <th style={{ padding: 4, border: '1px solid #e2e8f0' }}>氏名</th>
                <th style={{ padding: 4, border: '1px solid #e2e8f0' }}>続柄</th>
                <th style={{ padding: 4, border: '1px solid #e2e8f0' }}>TEL</th>
                <th style={{ padding: 4, border: '1px solid #e2e8f0' }}>備考</th>
              </tr>
            </thead>
            <tbody>
              {f.emergencyContacts.map((c, i) => (
                <tr key={i}>
                  <td style={{ padding: 4, border: '1px solid #e2e8f0' }}>{c.no}</td>
                  <td style={{ padding: 4, border: '1px solid #e2e8f0' }}>{c.name || '-'}</td>
                  <td style={{ padding: 4, border: '1px solid #e2e8f0' }}>{c.relation || '-'}</td>
                  <td style={{ padding: 4, border: '1px solid #e2e8f0' }}>{c.tel || '-'}</td>
                  <td style={{ padding: 4, border: '1px solid #e2e8f0' }}>{c.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}
      {f.family.length > 0 && (
        <SectionCard title={`家族構成 (${f.family.length}件)`}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: 4, border: '1px solid #e2e8f0' }}>No</th>
                <th style={{ padding: 4, border: '1px solid #e2e8f0' }}>氏名</th>
                <th style={{ padding: 4, border: '1px solid #e2e8f0' }}>続柄</th>
                <th style={{ padding: 4, border: '1px solid #e2e8f0' }}>年齢</th>
                <th style={{ padding: 4, border: '1px solid #e2e8f0' }}>同居/別居</th>
                <th style={{ padding: 4, border: '1px solid #e2e8f0' }}>特記</th>
              </tr>
            </thead>
            <tbody>
              {f.family.map((m, i) => (
                <tr key={i}>
                  <td style={{ padding: 4, border: '1px solid #e2e8f0' }}>{m.no}</td>
                  <td style={{ padding: 4, border: '1px solid #e2e8f0' }}>{m.name || '-'}</td>
                  <td style={{ padding: 4, border: '1px solid #e2e8f0' }}>{m.relation || '-'}</td>
                  <td style={{ padding: 4, border: '1px solid #e2e8f0' }}>{m.age || '-'}</td>
                  <td style={{ padding: 4, border: '1px solid #e2e8f0' }}>{m.liveWith || '-'}</td>
                  <td style={{ padding: 4, border: '1px solid #e2e8f0' }}>{m.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {f.familyNote && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>メモ: {f.familyNote}</div>
          )}
        </SectionCard>
      )}
      <SectionCard title="主訴・希望">
        <DefList
          items={[
            { label: '本人の希望', value: <VRaw raw={f.complaint.userWishes} /> },
            { label: '家族の希望', value: <VRaw raw={f.complaint.familyWishes} /> },
          ]}
        />
      </SectionCard>
      {f.currentServices.length > 0 && (
        <SectionCard title="現在利用中のサービス">
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {f.currentServices.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

function AssessmentView({ data, src }: { data: ImportedAssessmentBundle; src: any }) {
  const a = data.assessment;
  const sections: Array<{ key: string; title: string; data: typeof a.adl }> = [
    { key: 'health', title: '健康状態', data: a.health },
    { key: 'adl', title: 'ADL', data: a.adl },
    { key: 'iadl', title: 'IADL', data: a.iadl },
    { key: 'cognition', title: '認知・コミュニケーション', data: a.cognition },
    { key: 'remarks', title: '特記事項', data: a.remarks },
  ];
  return (
    <div>
      <SourceBanner src={src} kind="アセスメント" />
      {sections.map((s) => (
        <SectionCard key={s.key} title={`${s.title}${s.data.items.length ? ` (${s.data.items.length})` : ''}`}>
          {s.data.items.length === 0 && !s.data.freeText && <EmptyValue />}
          {s.data.items.length > 0 && (
            <DefList
              items={s.data.items.map((it) => ({
                label: it.label,
                value: (
                  <div>
                    <CheckChip group={it.selection} />
                    <VEvidence e={it.evidence} />
                  </div>
                ),
              }))}
            />
          )}
          {s.data.freeText && (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#475569', marginTop: 6 }}>
              {s.data.freeText}
            </div>
          )}
        </SectionCard>
      ))}
    </div>
  );
}

function MeetingNoteView({ data, src }: { data: ImportedCareplan; src: any }) {
  const t4 = data.table4;
  return (
    <div>
      <SourceBanner src={src} kind="第4表 サービス担当者会議の要点" />
      <SectionCard title="開催情報">
        <DefList
          items={[
            { label: '利用者名', value: t4.userName || <EmptyValue /> },
            { label: '計画作成者', value: t4.plannerName || <EmptyValue /> },
            { label: '開催日', value: <VDate d={t4.heldDate} /> },
            { label: '開催場所', value: t4.location || <EmptyValue /> },
            { label: '開催時間', value: t4.heldTime || <EmptyValue /> },
            { label: '開催回数', value: t4.session || <EmptyValue /> },
            { label: '本人出席', value: t4.userAttended || <EmptyValue /> },
            { label: '家族出席', value: t4.familyAttended || <EmptyValue /> },
          ]}
        />
      </SectionCard>
      <SectionCard title={`会議出席者 (${t4.attendees.length}名)`}>
        {t4.attendees.length === 0 ? (
          <EmptyValue />
        ) : (
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {t4.attendees.map((a, i) => (
              <li key={i}>
                <span style={{ color: '#64748b' }}>{a.role}</span> — {a.name}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title="検討した項目">
        <VRaw raw={t4.discussedItems} />
      </SectionCard>
      <SectionCard title="検討内容">
        <VRaw raw={t4.discussion} />
      </SectionCard>
      <SectionCard title="結論">
        <VRaw raw={t4.conclusion} />
      </SectionCard>
      <SectionCard title="残された課題">
        <VRaw raw={t4.remainingTasks} />
      </SectionCard>
    </div>
  );
}

function SupportHistoryView({ data, src }: { data: ImportedCareplan; src: any }) {
  const records = data.table5;
  return (
    <div>
      <SourceBanner src={src} kind="第5表 居宅介護支援経過" />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ padding: 6, border: '1px solid #e2e8f0', width: 120 }}>年月日</th>
            <th style={{ padding: 6, border: '1px solid #e2e8f0', width: 120 }}>項目</th>
            <th style={{ padding: 6, border: '1px solid #e2e8f0' }}>内容</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i}>
              <td style={{ padding: 6, border: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                <VDate d={r.date} />
              </td>
              <td style={{ padding: 6, border: '1px solid #e2e8f0', verticalAlign: 'top' }}>{r.category}</td>
              <td style={{ padding: 6, border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap' }}>{r.content}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonitoringView({ data, src }: { data: ImportedCareplan; src: any }) {
  const m = data.monitoring;
  return (
    <div>
      <SourceBanner src={src} kind="モニタリング" />
      <SectionCard
        title={`モニタリング履歴 ${m.declaredTotal != null ? `(全${m.declaredTotal}回中 ${m.history.length}件)` : `(${m.history.length}件)`}`}
      >
        {m.history.length === 0 ? (
          <EmptyValue />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: 4, border: '1px solid #e2e8f0' }}>実施年月日</th>
                <th style={{ padding: 4, border: '1px solid #e2e8f0' }}>評価結果</th>
              </tr>
            </thead>
            <tbody>
              {m.history.map((h, i) => (
                <tr key={i}>
                  <td style={{ padding: 4, border: '1px solid #e2e8f0' }}>
                    <VDate d={h.date} />
                  </td>
                  <td style={{ padding: 4, border: '1px solid #e2e8f0' }}>{h.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
      {m.sessions.map((s) => (
        <SectionCard key={s.round} title={`第${s.round}回モニタリング`}>
          <DefList
            items={Object.entries(s.fields).map(([k, v]) => ({
              label: k,
              value: <VRaw raw={v} />,
            }))}
          />
        </SectionCard>
      ))}
    </div>
  );
}

function AnythingBoxView({ data, src }: { data: ImportedAssessmentBundle; src: any }) {
  const [filter, setFilter] = useState('');
  const [minStar, setMinStar] = useState(0);
  const entries = data.anythingBox.filter((e) => {
    if (minStar > 0 && e.category.importance < minStar) return false;
    if (filter && !`${e.category.raw} ${e.content}`.includes(filter)) return false;
    return true;
  });
  return (
    <div>
      <SourceBanner src={src} kind="なんでもボックス" />
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="カテゴリ・本文で絞り込み"
          style={{ padding: 4, fontSize: 12, flex: 1, minWidth: 200 }}
        />
        {[0, 1, 2, 3].map((s) => (
          <button
            key={s}
            onClick={() => setMinStar(s)}
            style={{
              padding: '4px 8px',
              fontSize: 11,
              borderRadius: 4,
              border: '1px solid #cbd5e1',
              background: minStar === s ? '#0f2942' : '#fff',
              color: minStar === s ? '#fff' : '#475569',
              cursor: 'pointer',
            }}
          >
            {s === 0 ? '全件' : '★'.repeat(s) + '以上'}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
        {entries.length} / {data.anythingBox.length} 件
      </div>
      {entries.map((e, i) => (
        <div
          key={i}
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            padding: 8,
            marginBottom: 6,
            background: '#fff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
              {e.dateRaw} {e.dateIso && <span>({e.dateIso})</span>}
            </div>
            <div>
              <CategoryChip tag={e.category} />
            </div>
          </div>
          <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', fontSize: 12 }}>{e.content}</div>
          {e.source && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>出典: {e.source}</div>}
        </div>
      ))}
    </div>
  );
}

function DoctorOpinionView({ data, src }: { data: ImportedAssessmentBundle; src: any }) {
  const d = data.doctorOpinion;
  return (
    <div>
      <SourceBanner src={src} kind="主治医意見書" />
      <SectionCard title="ヘッダ">
        <DefList
          items={[
            { label: '記入日', value: d.header.writtenDate || <EmptyValue /> },
            { label: '最終診察日', value: d.header.lastExamDate || <EmptyValue /> },
            { label: '意見書作成', value: <CheckChip group={d.header.opinionKind} /> },
            { label: '医師氏名', value: d.header.doctorName || <EmptyValue /> },
            { label: '医療機関名', value: d.header.clinic || <EmptyValue /> },
            { label: 'TEL', value: d.header.tel || <EmptyValue /> },
          ]}
        />
      </SectionCard>
      {d.sections.map((s, i) => (
        <SectionCard key={i} title={s.title}>
          {s.fields.length > 0 && (
            <DefList items={s.fields.map((f) => ({ label: f.label, value: f.value || <EmptyValue /> }))} />
          )}
          {s.selections.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {s.selections.map((sel, j) => (
                <div key={j} style={{ marginBottom: 4 }}>
                  {sel.label && <div style={{ fontSize: 12, color: '#64748b' }}>{sel.label}</div>}
                  <CheckChip group={sel.group} />
                </div>
              ))}
            </div>
          )}
          {s.freeText && (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#475569', marginTop: 4 }}>{s.freeText}</div>
          )}
          {s.fields.length === 0 && s.selections.length === 0 && !s.freeText && <EmptyValue />}
        </SectionCard>
      ))}
    </div>
  );
}

function CertificationSurveyView({ data, src }: { data: ImportedAssessmentBundle; src: any }) {
  const c = data.certificationSurvey;
  return (
    <div>
      <SourceBanner src={src} kind="認定調査票" />
      <SectionCard title="概況">
        <DefList
          items={[
            { label: '調査日', value: c.overview.surveyDate || <EmptyValue /> },
            { label: '調査者', value: c.overview.surveyor || <EmptyValue /> },
            { label: '過去の認定', value: <CheckChip group={c.overview.pastCert} /> },
            { label: '前回結果', value: c.overview.previousResult || <EmptyValue /> },
            { label: '現在の生活状況', value: <VRaw raw={c.overview.currentLife} /> },
            { label: '家族状況', value: <CheckChip group={c.overview.familyStatus} /> },
          ]}
        />
      </SectionCard>
      {c.groups.map((g, i) => (
        <SectionCard key={i} title={`${g.title} (${g.items.length})`}>
          <DefList
            items={g.items.map((it) => ({
              label: `${it.no} ${it.label}`,
              value: <CheckChip group={it.selection} />,
            }))}
          />
        </SectionCard>
      ))}
      {c.remarks && (
        <SectionCard title="特記事項">
          <VRaw raw={c.remarks} />
        </SectionCard>
      )}
    </div>
  );
}
