import React, { useState, useEffect, useCallback } from 'react';
import { S } from './styles';
import { formatWareki } from './utils';
import Home from './views/Home';
import Settings from './views/Settings';
import UserSelect from './views/Create/UserSelect';
import SourceSelect from './views/Create/SourceSelect';
import PlanEdit from './views/Create/PlanEdit';
import {
  getMe, logout as apiLogout,
  fetchSourceContents, analyzeSources, exportToSheets, saveDraft,
  getFacilities,
  type SessionUser, type UserFolder, type SourceFile,
  type GeneratedPlan, type BusinessMode, type Facility, type ExtractedUserProfile,
} from './api';

const STEPS = ['利用者選択', '情報源選択', 'プラン編集・確認', 'エクスポート'];

/** Autofilerの解析結果JSONから既存プラン表示用のGeneratedPlanを構築 */
function buildExistingPlanFromJson(data: any): GeneratedPlan | null {
  try {
    // Autofiler JSON構造: documents.table_1, table_2, table_3 等
    const docs = data.documents || data;
    const t1 = docs.table_1 || docs.table1 || {};
    const t2Items = docs.table_2 || docs.table2 || [];
    const t3 = docs.table_3 || docs.table3 || {};

    return {
      id: 'EXISTING',
      label: '既存プラン',
      summary: '情報源から読み込んだ既存のケアプランです。',
      table1: {
        userWishes: t1.user_wishes || t1.userWishes || t1.利用者意向 || '',
        familyWishes: t1.family_wishes || t1.familyWishes || t1.家族意向 || '',
        assessmentResult: t1.assessment_result || t1.assessmentResult || t1.課題分析 || '',
        committeeOpinion: t1.committee_opinion || t1.committeeOpinion || t1.審査会意見 || '特になし',
        totalPolicy: t1.total_policy || t1.totalPolicy || t1.援助方針 || '',
        livingSupportReason: t1.living_support_reason || t1.livingSupportReason || t1.生活援助理由 || '',
      },
      table2: Array.isArray(t2Items) ? t2Items.map((item: any) => ({
        need: item.need || item.ニーズ || item.課題 || '',
        goals: (item.goals || item.目標 || []).map((g: any) => ({
          longGoal: g.long_goal || g.longGoal || g.長期目標 || '',
          longPeriod: g.long_period || g.longPeriod || g.長期期間 || '',
          shortGoal: g.short_goal || g.shortGoal || g.短期目標 || '',
          shortPeriod: g.short_period || g.shortPeriod || g.短期期間 || '',
          services: (g.services || g.サービス || []).map((sv: any) => ({
            content: sv.content || sv.内容 || '',
            insurance: sv.insurance || sv.保険 || '',
            type: sv.type || sv.種別 || '',
            provider: sv.provider || sv.事業者 || '',
            frequency: sv.frequency || sv.頻度 || '',
            period: sv.period || sv.期間 || '',
          })),
        })),
      })) : [],
      table3: {
        schedule: (t3.schedule || t3.スケジュール || []).map((s: any) => ({
          day: s.day || s.曜日 || '',
          startHour: s.start_hour ?? s.startHour ?? 0,
          startMin: s.start_min ?? s.startMin ?? 0,
          endHour: s.end_hour ?? s.endHour ?? 0,
          endMin: s.end_min ?? s.endMin ?? 0,
          label: s.label || s.ラベル || '',
        })),
        dailyActivities: (t3.daily_activities || t3.dailyActivities || t3.日常活動 || []).map((a: any) => ({
          time: a.time || a.時間 || '',
          activity: a.activity || a.活動 || '',
        })),
        weeklyService: t3.weekly_service || t3.weeklyService || t3.週単位以外 || '',
      },
    };
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'home' | 'settings' | 'create'>('home');
  const [step, setStep] = useState(0);
  const [showToast, setShowToast] = useState<string | null>(null);

  // Create flow state
  const [selectedUser, setSelectedUser] = useState<UserFolder | null>(null);
  const [selectedSources, setSelectedSources] = useState<SourceFile[]>([]);
  const [mode, setMode] = useState<BusinessMode>('shoki');
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [managerNameOverride, setManagerNameOverride] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [plans, setPlans] = useState<GeneratedPlan[]>([]);
  const [existingPlan, setExistingPlan] = useState<GeneratedPlan | null>(null);
  const [userProfile, setUserProfile] = useState<ExtractedUserProfile | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  // 事業所IDが変わったら事業所データを更新
  useEffect(() => {
    if (!selectedFacilityId) { setSelectedFacility(null); return; }
    getFacilities().then(r => {
      const fac = r.facilities.find(f => f.id === selectedFacilityId);
      setSelectedFacility(fac || null);
    }).catch(() => {});
  }, [selectedFacilityId]);

  const toast = useCallback((msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 3000);
  }, []);

  // Check auth on load, initialize settings if admin
  useEffect(() => {
    getMe()
      .then(r => {
        if (r) {
          setUser(r.user);
          // 設定スプレッドシートを自動初期化（新シート追加・ヘッダー更新）
          import('./api').then(api => api.initSettings()).catch(() => {});
        }
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLogout = async () => {
    await apiLogout();
    setUser(null);
  };

  const startCreate = () => {
    setCurrentView('create');
    setStep(0);
    setSelectedUser(null);
    setSelectedSources([]);
    setSelectedFacilityId('');
    setManagerNameOverride('');
    setPlans([]);
    setExistingPlan(null);
    setUserProfile(null);
    setExportUrl(null);
  };

  const handleAnalyze = async () => {
    if (!selectedUser) return;
    setAnalyzing(true);
    try {
      // Fetch contents of selected sources
      const mimeTypes: Record<string, string> = {};
      selectedSources.forEach(s => { mimeTypes[s.id] = s.mimeType; });

      const { contents } = await fetchSourceContents(
        selectedSources.map(s => s.id),
        mimeTypes
      );

      // Organize contents by category + try to parse existing plan JSON
      const sourceContents: Record<string, string> = {};
      let parsedExistingPlan: GeneratedPlan | null = null;

      for (const src of selectedSources) {
        const c = contents[src.id];
        if (!c) continue;
        const cat = src.category;
        sourceContents[cat] = (sourceContents[cat] || '') + '\n' + c.content;

        // 既存ケアプランJSONの解析を試みる
        if (cat === 'careplan' && c.type === 'json') {
          try {
            const parsed = JSON.parse(c.content);
            // Autofilerの解析結果JSONからプラン構造を構築
            parsedExistingPlan = buildExistingPlanFromJson(parsed);
          } catch { /* not a structured plan JSON */ }
        }
      }
      setExistingPlan(parsedExistingPlan);

      // Build user info
      const userInfo = {
        id: selectedUser.id,
        name: selectedUser.name,
        folderId: selectedUser.folderId,
        birthDate: '',
        careLevel: '',
        address: '',
      };

      const result = await analyzeSources(userInfo, sourceContents, mode, selectedFacilityId, managerNameOverride || undefined);
      setPlans(result.plans);
      if (result.userProfile) setUserProfile(result.userProfile);
      setStep(2);
    } catch (err: any) {
      toast(`分析エラー: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // 事業所情報からメタデータを構築
  const buildMeta = async () => {
    const { formatWareki } = await import('./utils');
    const dateStr = formatWareki(new Date());
    let creator = managerNameOverride || '';
    let facility = '';
    let facilityAddress = '';

    if (selectedFacilityId) {
      try {
        const { facilities } = await getFacilities();
        const fac = facilities.find(f => f.id === selectedFacilityId);
        if (fac) {
          facility = fac.name;
          facilityAddress = fac.address;
          if (!creator) creator = fac.managerName;
        }
      } catch { /* use defaults */ }
    }

    return {
      creator,
      facility,
      facilityAddress,
      createDate: dateStr,
      firstCreateDate: dateStr,
    };
  };

  const handleExport = async (plan: GeneratedPlan) => {
    if (!selectedUser) return;
    try {
      const meta = await buildMeta();

      const userInfo = {
        id: selectedUser.id,
        name: selectedUser.name,
        folderId: selectedUser.folderId,
        birthDate: '',
        careLevel: '',
        address: '',
      };

      const result = await exportToSheets(userInfo, plan, meta, mode);
      setExportUrl(result.url);
      toast('Googleスプレッドシートにエクスポートしました');
    } catch (err: any) {
      toast(`エクスポートエラー: ${err.message}`);
    }
  };

  const handleSaveDraft = async (plan: GeneratedPlan) => {
    if (!selectedUser) return;
    try {
      await saveDraft(selectedUser.name, JSON.stringify(plan), mode);
      toast('下書きを保存しました');
    } catch (err: any) {
      toast(`保存エラー: ${err.message}`);
    }
  };

  const ToastEl = showToast && <div style={S.toast}>{showToast}</div>;

  // Auth loading
  if (authLoading) {
    return (
      <div style={{ ...S.root, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={S.spinner} />
          <p style={{ marginTop: 16, color: '#64748b' }}>読み込み中...</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div style={S.root}>
        {ToastEl}
        <header style={S.header}>
          <div>
            <h1 style={S.headerTitle}>ケアプラン作成支援システム</h1>
            <p style={S.headerSub}>居宅サービス計画書 作成支援</p>
          </div>
        </header>
        <main style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>ログイン</h2>
          <p style={{ color: '#64748b', marginBottom: 32, lineHeight: 1.6 }}>
            Googleアカウントでログインしてください。<br />
            ドライブのアクセス権限が必要です。
          </p>
          <a
            href="/auth/google"
            style={{
              ...S.primaryBtn,
              display: 'inline-block',
              textDecoration: 'none',
              padding: '14px 40px',
              fontSize: 16,
            }}
          >
            Googleでログイン
          </a>
        </main>
      </div>
    );
  }

  // Home
  if (currentView === 'home') {
    return (
      <>
        {ToastEl}
        <Home
          user={user}
          onNavigate={(view) => {
            if (view === 'create') startCreate();
            else setCurrentView(view as any);
          }}
          onLogout={handleLogout}
          toast={toast}
        />
      </>
    );
  }

  // Settings
  if (currentView === 'settings') {
    return (
      <>
        {ToastEl}
        <Settings
          user={user}
          onBack={() => setCurrentView('home')}
          toast={toast}
        />
      </>
    );
  }

  // Create flow
  return (
    <div style={S.root}>
      {ToastEl}
      <header style={S.header}>
        <button
          style={S.backBtn}
          onClick={() => {
            if (step === 0) setCurrentView('home');
            else setStep(Math.max(0, step - 1));
          }}
        >
          &larr; {step === 0 ? 'ホーム' : '戻る'}
        </button>
        <h1 style={S.headerTitle}>ケアプラン作成</h1>
        <div style={{ width: 60 }} />
      </header>

      {/* Stepper */}
      <div style={S.stepper}>
        {STEPS.map((s, i) => (
          <div key={i} style={S.stepItem}>
            <div style={{
              ...S.stepCircle,
              background: i <= step ? '#0f2942' : '#cbd5e1',
              color: i <= step ? '#fff' : '#64748b',
            }}>
              {i < step ? '\u2713' : i + 1}
            </div>
            <span style={{
              ...S.stepLabel,
              color: i <= step ? '#1e293b' : '#94a3b8',
              fontWeight: i === step ? 700 : 400,
            }}>
              {s}
            </span>
            {i < STEPS.length - 1 && (
              <div style={{ ...S.stepLine, background: i < step ? '#0f2942' : '#e2e8f0' }} />
            )}
          </div>
        ))}
      </div>

      <main style={S.createMain}>
        {/* Step 0: User select */}
        {step === 0 && (
          <UserSelect
            selectedUser={selectedUser}
            onSelect={setSelectedUser}
            onNext={() => setStep(1)}
          />
        )}

        {/* Step 1: Source select */}
        {step === 1 && selectedUser && (
          <SourceSelect
            folderId={selectedUser.folderId}
            folderName={selectedUser.folderName}
            userName={selectedUser.name}
            selectedSources={selectedSources}
            onSelectSources={setSelectedSources}
            mode={mode}
            onModeChange={setMode}
            selectedFacilityId={selectedFacilityId}
            onFacilityChange={setSelectedFacilityId}
            managerNameOverride={managerNameOverride}
            onManagerNameOverrideChange={setManagerNameOverride}
            onAnalyze={handleAnalyze}
            analyzing={analyzing}
          />
        )}

        {/* Step 2: Plan edit */}
        {step === 2 && (
          <PlanEdit
            plans={plans}
            existingPlan={existingPlan}
            userMeta={{
              name: userProfile?.name || selectedUser?.name || '',
              birthDate: userProfile?.birthDate || '',
              address: userProfile?.address || '',
              careLevel: userProfile?.careLevel || '',
              certDate: userProfile?.certDate || '',
              certPeriod: {
                start: userProfile?.certPeriodStart || '',
                end: userProfile?.certPeriodEnd || '',
              },
            }}
            planMeta={{
              creator: managerNameOverride || selectedFacility?.managerName || '',
              facility: selectedFacility?.name || '',
              facilityAddress: selectedFacility?.address || '',
              createDate: formatWareki(),
              firstCreateDate: userProfile?.firstCreateDate || '',
            }}
            mode={mode}
            onSaveDraft={handleSaveDraft}
            onExport={handleExport}
            onProceedExport={() => setStep(3)}
          />
        )}

        {/* Step 3: Export */}
        {step === 3 && (
          <div>
            <h2 style={S.stepTitle}>エクスポート</h2>
            <p style={S.stepDesc}>
              選択中のプラン: <strong>{plans[plans.length - 1]?.label || ''}</strong>
            </p>

            {exportUrl && (
              <div style={{
                padding: '16px 20px',
                background: '#dcfce7',
                borderRadius: 12,
                border: '1px solid #86efac',
                marginBottom: 20,
                fontSize: 14,
              }}>
                エクスポート完了:{' '}
                <a href={exportUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#059669', fontWeight: 600 }}>
                  スプレッドシートを開く
                </a>
              </div>
            )}

            <div style={S.exportGrid}>
              <div style={S.exportCard}>
                <div style={S.exportIcon}>📊</div>
                <h3 style={S.exportTitle}>Googleスプレッドシート</h3>
                <p style={S.exportDesc}>Googleドライブに第1表〜第3表をシート別に出力します。</p>
                <button
                  style={{ ...S.primaryBtn, width: '100%' }}
                  onClick={() => {
                    const plan = plans[plans.length - 1];
                    if (plan) handleExport(plan);
                  }}
                >
                  エクスポート
                </button>
              </div>
            </div>
            <div style={S.stepActions}>
              <button style={S.secondaryBtn} onClick={() => setCurrentView('home')}>ホームに戻る</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
