import React, { useEffect, useState } from 'react';
import { S } from '../styles';
import { getHistory } from '../api';
import type { SessionUser } from '../api';

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
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    getHistory().then(r => setHistory(r.history.slice(0, 6))).catch(() => {});
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

        {history.length > 0 && (
          <>
            <h3 style={S.sectionTitle}>最近のエクスポート</h3>
            <div style={S.recentGrid}>
              {history.map((h, i) => (
                <div key={i} style={S.recentCard}>
                  <div style={S.recentCardHeader}>
                    <span style={S.avatar}>{h.userName[0]}</span>
                    <div>
                      <div style={S.recentName}>{h.userName}</div>
                      <div style={S.recentMeta}>{h.mode === 'shoki' ? '小規模多機能' : '居宅介護支援'}</div>
                    </div>
                  </div>
                  <div style={S.recentDate}>{h.exportedAt.split('T')[0]}</div>
                  {h.exportedUrl && (
                    <a href={h.exportedUrl} target="_blank" rel="noopener noreferrer" style={{ ...S.smallBtn, display: 'inline-block', textDecoration: 'none', marginTop: 10 }}>
                      開く
                    </a>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
