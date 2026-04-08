import React, { useEffect, useState } from 'react';
import { S } from '../styles';
import { getHistory, type SessionUser, type SavedPlanSummary } from '../api';

interface Props {
  user: SessionUser;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  toast: (msg: string) => void;
}

interface HistoryItem {
  userId: string;
  userName: string;
  mode: string;
  exportedUrl: string;
  exportedAt: string;
}

export default function Home({ user, onNavigate, onLogout, toast }: Props) {
  const [recentPlans, setRecentPlans] = useState<SavedPlanSummary[]>([]);
  const [exportLinks, setExportLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    // 全利用者の保存済みプランを取得するには drafts シート全体を見る必要がある
    // → settings/history からエクスポートリンクを取得
    import('../api').then(api => {
      // 保存済みプラン一覧は /api/plans/list に clientFolderId が必要なので
      // ここではエクスポート履歴を取得してリンクマップを作る
      api.getHistory().then(r => {
        const links: Record<string, string> = {};
        for (const h of r.history) {
          // userName をキーにして最新のリンクを保持
          if (h.exportedUrl) {
            const key = `${h.userName}_${h.mode}`;
            if (!links[key]) links[key] = h.exportedUrl;
          }
        }
        setExportLinks(links);

        // 履歴を SavedPlanSummary 風に変換して表示
        const seen = new Set<string>();
        const plans: SavedPlanSummary[] = [];
        for (const h of r.history) {
          const key = `${h.userName}_${h.mode}`;
          if (seen.has(key)) continue;
          seen.add(key);
          plans.push({
            planId: '',
            clientFolderId: '',
            clientName: h.userName,
            authorEmail: '',
            authorName: h.userId ? '' : '',
            mode: h.mode,
            status: 'completed',
            updatedAt: h.exportedAt,
          });
        }
        setRecentPlans(plans.slice(0, 12));
      }).catch(() => {});
    });
  }, []);

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

        {recentPlans.length > 0 && (
          <>
            <h3 style={S.sectionTitle}>最近のケアプラン</h3>
            <div style={S.recentGrid}>
              {recentPlans.map((p, i) => {
                const exportUrl = exportLinks[`${p.clientName}_${p.mode}`];
                return (
                  <div key={i} style={S.recentCard}>
                    <div style={S.recentCardHeader}>
                      <span style={S.avatar}>{p.clientName?.[0] || '?'}</span>
                      <div>
                        <div style={S.recentName}>{p.clientName}</div>
                        <div style={S.recentMeta}>{p.mode === 'shoki' ? '小規模多機能' : '居宅介護支援'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        background: p.status === 'draft' ? '#fef3c7' : '#dcfce7',
                        color: p.status === 'draft' ? '#92400e' : '#166534',
                      }}>
                        {p.status === 'draft' ? '下書き' : '作成済み'}
                      </span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.updatedAt?.split('T')[0]}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button style={S.smallBtn} onClick={() => onNavigate('create')}>編集</button>
                      {exportUrl && (
                        <a
                          href={exportUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            ...S.smallBtn,
                            display: 'inline-block',
                            textDecoration: 'none',
                            background: '#059669',
                          }}
                          onClick={e => e.stopPropagation()}
                        >
                          スプレッドシート
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
