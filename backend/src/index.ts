import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import passport from 'passport';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { llmHandler, ProcessRequest, ProcessResponse } from './llmHandler';
import { MCP_TOOLS } from './mcpServer';
import {
  configurePassport,
  createAuthRouter,
  getAccessToken,
  isOAuthConfigured,
  GitHubUser,
} from './auth';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const SESSION_SECRET = process.env.SESSION_SECRET || 'codesync-dev-secret-change-in-production';
const isProd = process.env.NODE_ENV === 'production';

// Trust first proxy (needed for secure cookies behind reverse proxies)
if (isProd) {
  app.set('trust proxy', 1);
}

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use(
  session({
    name: 'codesync.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// Restore user from session.githubUser if passport user is missing
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (!req.user && req.session?.githubUser) {
    req.user = req.session.githubUser as GitHubUser;
  }
  next();
});

// Per-user rate limit on the LLM / process endpoint (abuse protection)
const processLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const user = req.user as GitHubUser | undefined;
    return user?.id || req.ip || 'anonymous';
  },
  message: {
    alexaResponse: 'You are sending requests too quickly. Please wait a moment and try again.',
    toolUsed: null,
    debugPayload: { error: 'rate_limited' },
    requiresApproval: false,
    isFallback: false,
  },
});

// ── Auth routes ──────────────────────────────────────────────
app.use('/api/auth', createAuthRouter());

// ── Health ───────────────────────────────────────────────────
app.get('/api/health', (req: Request, res: Response) => {
  const user = (req.user as GitHubUser | undefined) || req.session?.githubUser;
  res.json({
    status: 'ok',
    service: 'CodeSync AI MCP Backend',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    tools: MCP_TOOLS.map((t) => t.name),
    oauthConfigured: isOAuthConfigured(),
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    authenticated: !!user,
    userLogin: user?.login || null,
  });
});

app.get('/api/mcp/tools', (_req: Request, res: Response) => {
  res.json({ tools: MCP_TOOLS });
});

// ── Main conversational endpoint ─────────────────────────────
app.post(
  '/api/alexa/process',
  processLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Partial<ProcessRequest>;

      const owner = (body.owner || process.env.GITHUB_OWNER || 'octocat').trim();
      const repo = (body.repo || process.env.GITHUB_REPO || 'Hello-World').trim();
      const utterance = (body.utterance || '').trim();

      if (!utterance && !body.approve) {
        res.status(400).json({
          error: 'utterance is required (or approve=true with pendingApproval)',
        });
        return;
      }

      // OAuth token from session — never from the request body
      const accessToken = getAccessToken(req);

      const processReq: ProcessRequest = {
        utterance: utterance || (body.approve ? 'approve' : ''),
        owner,
        repo,
        accessToken,
        conversationHistory: body.conversationHistory || [],
        pendingApproval: body.pendingApproval || null,
        approve: !!body.approve,
      };

      const result: ProcessResponse = await llmHandler.process(processReq);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    alexaResponse: 'Sorry, something went wrong on my side. Please try again.',
    toolUsed: null,
    debugPayload: { error: err.message },
    requiresApproval: false,
    isFallback: true,
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 CodeSync AI Backend v2.0 on http://localhost:${PORT}`);
  console.log(`   Health:     GET  /api/health`);
  console.log(`   Auth:       GET  /api/auth/github`);
  console.log(`   Me:         GET  /api/auth/me`);
  console.log(`   Process:    POST /api/alexa/process`);
  console.log(`   OAuth:      ${isOAuthConfigured() ? 'configured' : 'NOT configured (demo/offline mode)'}`);
  console.log(`   Gemini:     ${process.env.GEMINI_API_KEY ? 'configured' : 'MISSING (fallback mode)'}`);
  console.log(`   Frontend:   ${FRONTEND_URL}\n`);
});
