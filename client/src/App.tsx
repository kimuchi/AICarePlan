import React, { useState, useEffect, useCallback } from 'react';
import { S } from './styles';
import Home from './views/Home';
import Settings from './views/Settings';
import UserSelect from './views/Create/UserSelect';
import SourceSelect from './views/Create/SourceSelect';
import PlanEdit from './views/Create/PlanEdit';
import {
  getMe, logout as apiLogout,
  fetchSourceContents, analyzeSources, exportToSheets, saveDraft,
  type SessionUser, type UserFolder, type SourceFile,
  type GeneratedPlan, type BusinessMode,
} from './api';

const STEPS = ['利用者選択', '情報源選択', 'プラン編集・確認', 'エクスポート'];

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
  const [analyzing, setAnalyzing] = useState(false);
  const [plans, setPlans] = useState<GeneratedPlan[]>([]);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const toast = useCallback((msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 3000);
  }, []);

  // Check auth on load
  useEffect(() => {
    getMe()
      .then(r => { if (r) setUser(r.user); })
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
    setPlans([]);
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

      // Organize contents by category
      const sourceContents: Record<string, string> = {};
      for (const src of selectedSources) {
        const c = contents[src.id];
        if (!c) continue;
        const cat = src.category;
        sourceContents[cat] = (sourceContents[cat] || '') + '\n' + c.content;
      }

      // Build user info
      const userInfo = {
        id: selectedUser.id,
        name: selectedUser.name,
        folderId: selectedUser.folderId,
        birthDate: '',
        careLevel: '',
        address: '',
      };

      const result = await analyzeSources(userInfo, sourceContents, mode);
      setPlans(result.plans);
      setStep(2);
    } catch (err: any) {
      toast(`分析エラー: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExport = async (plan: GeneratedPlan) => {
    if (!selectedUser) return;
    try {
      const today = new Date();
      const dateStr = `令和${String(today.getFullYear() - 2018).padStart(2, '0')}年${String(today.getMonth() + 1).padStart(2, '0')}月${String(today.getDate()).padStart(2, '0')}日`;

      const meta = {
        creator: '',
        facility: '',
        facilityAddress: '',
        createDate: dateStr,
        firstCreateDate: dateStr,
      };

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
            onAnalyze={handleAnalyze}
            analyzing={analyzing}
          />
        )}

        {/* Step 2: Plan edit */}
        {step === 2 && (
          <PlanEdit
            plans={plans}
            existingPlan={null}
            userMeta={{
              name: selectedUser?.name || '',
              birthDate: '',
              address: '',
              careLevel: '',
              certDate: '',
              certPeriod: { start: '', end: '' },
            }}
            planMeta={{
              creator: '',
              facility: '',
              facilityAddress: '',
              createDate: new Date().toLocaleDateString('ja-JP-u-ca-japanese', { era: 'long', year: 'numeric', month: '2-digit', day: '2-digit' }),
              firstCreateDate: '',
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
