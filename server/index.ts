import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupAuth, requireAuth } from './auth.js';

const APP_VERSION = '2026.04.10.1';
import { usersRouter } from './routes/users.js';
import { sourcesRouter } from './routes/sources.js';
import { analyzeRouter } from './routes/analyze.js';
import { exportRouter } from './routes/export.js';
import { settingsRouter } from './routes/settings.js';
import { plansRouter } from './routes/plans.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Cloud Run ではロードバランサーが SSL を終端するため、
// Express にプロキシ経由であることを伝える（secure cookie が正しく動作するために必須）
app.set('trust proxy', 1);

// ── Middleware ──
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// ── Auth setup ──
setupAuth(app);

// ── Health check + version ──
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', version: APP_VERSION, timestamp: new Date().toISOString() });
});

// ── Manual (認証不要、インライン埋め込み) ──
app.get('/api/manual', async (_req, res) => {
  try {
    const { USER_MANUAL } = await import('./lib/manual.js');
    res.json({ content: USER_MANUAL });
  } catch (err: any) {
    // manual.tsのインポートに失敗した場合のフォールバック
    console.error('Manual import error:', err.message);
    res.json({ content: '# ヘルプ\n\nマニュアルを準備中です。' });
  }
});

// ── API routes (all require auth) ──
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/sources', requireAuth, sourcesRouter);
app.use('/api/analyze', requireAuth, analyzeRouter);
app.use('/api/export', requireAuth, exportRouter);
app.use('/api/settings', requireAuth, settingsRouter);
app.use('/api/plans', requireAuth, plansRouter);

// ── Serve static client in production ──
const clientDir = path.resolve(__dirname, '../client');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`  API: http://localhost:${PORT}/api`);
    console.log(`  Auth: http://localhost:${PORT}/auth/google`);
  }
});

export default app;
