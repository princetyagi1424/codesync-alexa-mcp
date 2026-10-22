import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as GitHubStrategy, Profile } from 'passport-github2';
import axios from 'axios';

export interface GitHubUser {
  id: string;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string;
  accessToken: string;
}

export interface RepoSummary {
  id: number;
  full_name: string;
  owner: string;
  name: string;
  private: boolean;
  description: string | null;
  html_url: string;
  updated_at: string;
  language: string | null;
  open_issues_count: number;
}

declare module 'express-session' {
  interface SessionData {
    passport?: { user?: string };
    githubUser?: GitHubUser;
  }
}

declare global {
  namespace Express {
    interface User extends GitHubUser {}
  }
}

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const CALLBACK_URL =
  process.env.GITHUB_CALLBACK_URL || 'http://localhost:5000/api/auth/github/callback';

export function isOAuthConfigured(): boolean {
  return Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);
}

export function configurePassport(): void {
  if (!isOAuthConfigured()) {
    console.warn(
      '[Auth] GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET not set — OAuth routes will return 503. Offline demo still works.'
    );
    return;
  }

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user: GitHubUser, done) => {
    done(null, user);
  });

  passport.use(
    new GitHubStrategy(
      {
        clientID: GITHUB_CLIENT_ID,
        clientSecret: GITHUB_CLIENT_SECRET,
        callbackURL: CALLBACK_URL,
        scope: ['read:user', 'user:email', 'repo'],
      },
      (
        accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: (err: Error | null, user?: GitHubUser) => void
      ) => {
        const user: GitHubUser = {
          id: profile.id,
          login: profile.username || profile.displayName || 'unknown',
          name: profile.displayName || null,
          email: profile.emails?.[0]?.value || null,
          avatarUrl: profile.photos?.[0]?.value || `https://github.com/identicons/${profile.id}.png`,
          accessToken,
        };
        // Also stash on session for easy access without passport user typing issues
        done(null, user);
      }
    )
  );
}

export function getAccessToken(req: Request): string | undefined {
  const fromUser = (req.user as GitHubUser | undefined)?.accessToken;
  const fromSession = req.session?.githubUser?.accessToken;
  return fromUser || fromSession || undefined;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Sign in with GitHub.' });
    return;
  }
  next();
}

export function createAuthRouter(): Router {
  const router = Router();

  // Start OAuth — redirect to GitHub
  router.get('/github', (req: Request, res: Response, next: NextFunction) => {
    if (!isOAuthConfigured()) {
      res.status(503).json({
        error: 'GitHub OAuth is not configured on this server. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.',
      });
      return;
    }
    passport.authenticate('github', { scope: ['read:user', 'user:email', 'repo'] })(req, res, next);
  });

  // OAuth callback
  router.get(
    '/github/callback',
    (req: Request, res: Response, next: NextFunction) => {
      if (!isOAuthConfigured()) {
        res.redirect(`${FRONTEND_URL}?auth_error=oauth_not_configured`);
        return;
      }
      passport.authenticate('github', {
        failureRedirect: `${FRONTEND_URL}?auth_error=github_denied`,
        session: true,
      })(req, res, next);
    },
    (req: Request, res: Response) => {
      if (req.user) {
        req.session.githubUser = req.user as GitHubUser;
      }
      req.session.save((err) => {
        if (err) {
          console.error('[Auth] Session save error', err);
          res.redirect(`${FRONTEND_URL}?auth_error=session_failed`);
          return;
        }
        res.redirect(`${FRONTEND_URL}?auth=success`);
      });
    }
  );

  // Current user + optional repo list
  router.get('/me', async (req: Request, res: Response) => {
    const user = (req.user as GitHubUser | undefined) || req.session?.githubUser;
    if (!user) {
      res.status(401).json({ authenticated: false, user: null, oauthConfigured: isOAuthConfigured() });
      return;
    }

    // Never send accessToken to the browser
    const safeUser = {
      id: user.id,
      login: user.login,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    };

    let repos: RepoSummary[] = [];
    try {
      repos = await fetchUserRepos(user.accessToken);
    } catch (e) {
      console.warn('[Auth] Failed to fetch repos for /me', e);
    }

    res.json({
      authenticated: true,
      user: safeUser,
      repos,
      oauthConfigured: isOAuthConfigured(),
    });
  });

  // Dedicated repos endpoint (refresh)
  router.get('/repos', requireAuth, async (req: Request, res: Response) => {
    const token = getAccessToken(req)!;
    try {
      const repos = await fetchUserRepos(token);
      res.json({ repos });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch repositories';
      res.status(502).json({ error: message, repos: [] });
    }
  });

  // Logout — clear the real session cookie name used by express-session config
  router.post('/logout', (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) {
        console.error('[Auth] logout error', err);
      }
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          console.error('[Auth] session destroy error', destroyErr);
        }
        // Session cookie is configured as name: 'codesync.sid' in index.ts
        res.clearCookie('codesync.sid');
        res.clearCookie('connect.sid');
        res.json({ ok: true });
      });
    });
  });

  return router;
}

async function fetchUserRepos(accessToken: string): Promise<RepoSummary[]> {
  const results: RepoSummary[] = [];
  let page = 1;
  const perPage = 100;

  // Paginate up to 3 pages (300 repos) — enough for most users
  while (page <= 3) {
    const response = await axios.get('https://api.github.com/user/repos', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'CodeSync-AI-MCP/2.0',
      },
      params: {
        per_page: perPage,
        page,
        sort: 'updated',
        direction: 'desc',
        affiliation: 'owner,collaborator,organization_member',
      },
      timeout: 15000,
    });

    const batch = response.data as Array<Record<string, unknown>>;
    if (!batch.length) break;

    for (const r of batch) {
      const owner = r.owner as { login?: string } | undefined;
      results.push({
        id: r.id as number,
        full_name: r.full_name as string,
        owner: owner?.login || String(r.full_name).split('/')[0],
        name: r.name as string,
        private: Boolean(r.private),
        description: (r.description as string) || null,
        html_url: r.html_url as string,
        updated_at: r.updated_at as string,
        language: (r.language as string) || null,
        open_issues_count: (r.open_issues_count as number) || 0,
      });
    }

    if (batch.length < perPage) break;
    page++;
  }

  return results;
}
