import { Express, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { getSheetData } from './lib/sheets.js';

// Extend express-session types
declare module 'express-session' {
  interface SessionData {
    user: SessionUser;
    accessToken: string;
    refreshToken?: string;
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: 'admin' | 'user';
}

/** Check if email is in allowlist */
async function checkAllowlist(email: string): Promise<{ allowed: boolean; role: 'admin' | 'user' }> {
  try {
    const settingsId = process.env.SETTINGS_SPREADSHEET_ID;
    if (!settingsId) {
      // If no settings spreadsheet configured, allow all (dev mode)
      console.warn('SETTINGS_SPREADSHEET_ID not set — allowing all users (dev mode)');
      return { allowed: true, role: 'admin' };
    }
    const rows = await getSheetData(settingsId, 'allowlist!A:C');
    if (!rows || rows.length <= 1) {
      // Only header or empty — allow all
      return { allowed: true, role: 'admin' };
    }
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] && row[0].toLowerCase() === email.toLowerCase()) {
        return { allowed: true, role: (row[1] as 'admin' | 'user') || 'user' };
      }
    }
    return { allowed: false, role: 'user' };
  } catch {
    // On error (e.g. sheet doesn't exist yet), allow all
    console.warn('Failed to check allowlist, allowing all users');
    return { allowed: true, role: 'admin' };
  }
}

export function setupAuth(app: Express): void {
  const clientID = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  const baseURL = process.env.BASE_URL || 'http://localhost:3001';

  if (!clientID || !clientSecret) {
    console.warn('OAuth credentials not configured — auth endpoints disabled');
    // Set up mock auth for development
    app.get('/auth/google', (_req, res) => {
      res.redirect('/auth/mock-login');
    });
    app.get('/auth/mock-login', (req, res) => {
      req.session.user = {
        id: 'dev-user',
        email: 'dev@example.com',
        name: '開発ユーザー',
        role: 'admin',
      };
      req.session.accessToken = 'mock-token';
      res.redirect('/');
    });
    app.get('/auth/me', (req, res) => {
      if (req.session.user) {
        res.json({ user: req.session.user });
      } else {
        res.status(401).json({ error: 'Not authenticated' });
      }
    });
    app.post('/auth/logout', (req, res) => {
      req.session.destroy(() => {
        res.json({ ok: true });
      });
    });
    return;
  }

  passport.use(new GoogleStrategy({
    clientID,
    clientSecret,
    callbackURL: `${baseURL}/auth/google/callback`,
  } as any, async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(new Error('No email in profile'));
      }
      const { allowed, role } = await checkAllowlist(email);
      if (!allowed) {
        return done(new Error('このメールアドレスは許可されていません'));
      }
      const user: SessionUser = {
        id: profile.id,
        email,
        name: profile.displayName || email,
        picture: profile.photos?.[0]?.value,
        role,
      };
      return done(null, { user, accessToken: _accessToken, refreshToken: _refreshToken });
    } catch (err) {
      return done(err as Error);
    }
  }));

  app.use(passport.initialize());

  // Auth routes
  app.get('/auth/google', passport.authenticate('google', {
    session: false,
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
    accessType: 'offline',
    prompt: 'consent',
  } as any));

  app.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', { session: false }, (err: Error | null, data: any) => {
      if (err || !data) {
        console.error('Auth error:', err?.message);
        return res.redirect('/?auth_error=' + encodeURIComponent(err?.message || 'Unknown error'));
      }
      req.session.user = data.user;
      req.session.accessToken = data.accessToken;
      req.session.refreshToken = data.refreshToken;
      res.redirect('/');
    })(req, res, next);
  });

  app.get('/auth/me', (req, res) => {
    if (req.session.user) {
      res.json({ user: req.session.user });
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  });

  app.post('/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  // Drive Picker用: アクセストークンとクライアントIDを返す
  app.get('/auth/picker-config', (req, res) => {
    if (!req.session.user || !req.session.accessToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json({
      accessToken: req.session.accessToken,
      clientId: clientID || '',
    });
  });
}

/** Middleware: require authentication */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

/** Middleware: require admin role */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.session.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

/** Get the user's OAuth access token from session */
export function getAccessToken(req: Request): string | undefined {
  return req.session.accessToken;
}
