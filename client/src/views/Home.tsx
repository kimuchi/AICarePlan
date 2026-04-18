import React, { useEffect, useState } from 'react';
import { S } from '../styles';
import { getMyPlans, getHistory, type SessionUser, type SavedPlanSummary } from '../api';

interface Props {
  user: SessionUser;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  toast: (msg: string) => void;
  onLoadPlan?: (planId: string) => void;
}

export default function Home({ user, onNavigate, onLogout, toast, onLoadPlan }: Props) {
  const [myPlans, setMyPlans] = useState<SavedPlanSummary[]>([]);
  const [exportLinks, setExportLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getMyPlans().then(r => setMyPlans(r.plans)),
      getHistory().then(r => {
        const links: Record<string, string> = {};
        for (const h of r.history) {
          if (h.exportedUrl) {
            const key = `${h.userName}_${h.mode}`;
            if (!links[key]) links[key] = h.exportedUrl;
          }
        }
        setExportLinks(links);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const sharedPlans = myPlans.filter(p => p.isSharedToMe);
  const ownPlans = myPlans.filter(p => !p.isSharedToMe);

  return (
    <div style={S.root}>
      <header style={S.header}>
        <div>
          <h1 style={S.headerTitle}>ケアプラン作成支援システム</h1>
          <p style={S.headerSub}>居宅サービス計画書 作成支援</p>
        </div>
        <div style={S.headerRight}>
          <span style={S.userBadge}>{user.name}</span>
          <button style={S.settingsBtn} onClick={() => onNavigate('settings')}>設定</button>
          <button style={S.logoutBtn} onClick={() => onNavigate('help')}>ヘルプ</button>
          <button style={S.logoutBtn} onClick={onLogout}>ログアウト</button>
        </div>
      </header>
      <main style={S.homeMain}>
        <div style={S.heroCard} onClick={() => onNavigate('create')}>
          <div style={S.heroIcon}>+</div>
          <div style={{ flex: 1 }}>
            <h2 style={S.heroTitle}>新規ケアプラン作成</h2>
            <p style={S.heroDesc}>Googleドライブから情報を取得し、AIが複数の計画案を提案します</p>
          </div>
          <span style={S.heroArrow}>&rarr;</span>
        </div>


        <div style={{ ...S.heroCard, marginTop: 12, background: 'linear-gradient(135deg, #0b6b8a, #0ea5b7)' }} onClick={() => onNavigate('import')}>
          <div style={S.heroIcon}>⇪</div>
          <div style={{ flex: 1 }}>
            <h2 style={S.heroTitle}>Excel取り込み</h2>
            <p style={S.heroDesc}>ケアプラン・フェイスシートをまとめて解析して配置します</p>
          </div>
          <span style={S.heroArrow}>&rarr;</span>
        </div>

        {loading && <p style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>読み込み中...</p>}

        {/* 共有されたプラン */}
        {sharedPlans.length > 0 && (
          <>
            <h3 style={{ ...S.sectionTitle, color: '#7c3aed' }}>共有されたプラン（{sharedPlans.length}件）</h3>
            <div style={S.recentGrid}>
              {sharedPlans.map(p => renderPlanCard(p, true))}
            </div>
          </>
        )}

        {/* 自分のプラン */}
        {ownPlans.length > 0 && (
          <>
            <h3 style={S.sectionTitle}>マイプラン（{ownPlans.length}件）</h3>
            <div style={S.recentGrid}>
              {ownPlans.map(p => renderPlanCard(p, false))}
            </div>
          </>
        )}
      </main>
    </div>
  );

  function renderPlanCard(p: SavedPlanSummary, isShared: boolean) {
    const exportUrl = exportLinks[`${p.clientName}_${p.mode}`];
    return (
      <div key={p.planId} style={{ ...S.recentCard, borderLeft: isShared ? '4px solid #7c3aed' : undefined }}>
        <div style={S.recentCardHeader}>
          <span style={S.avatar}>{p.clientName?.[0] || '?'}</span>
          <div>
            <div style={S.recentName}>{p.clientName}</div>
            <div style={S.recentMeta}>{p.mode === 'shoki' ? '小規模多機能' : '居宅介護支援'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
            background: p.status === 'draft' ? '#fef3c7' : '#dcfce7',
            color: p.status === 'draft' ? '#92400e' : '#166534',
          }}>
            {p.status === 'draft' ? '下書き' : '作成済み'}
          </span>
          {isShared && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#ede9fe', color: '#7c3aed' }}>
              {p.authorName || p.authorEmail} から共有
            </span>
          )}
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.updatedAt?.split('T')[0]}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button style={S.smallBtn} onClick={() => onLoadPlan ? onLoadPlan(p.planId) : onNavigate('create')}>
            開く
          </button>
          {exportUrl && (
            <a
              href={exportUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...S.smallBtn, display: 'inline-block', textDecoration: 'none', background: '#059669' }}
              onClick={e => e.stopPropagation()}
            >
              スプレッドシート
            </a>
          )}
        </div>
      </div>
    );
  }
}
