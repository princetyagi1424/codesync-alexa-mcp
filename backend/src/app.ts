import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
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

const app = express();
const startedAt = Date.now();

// Request log: method, path, status and duration only.
// Never logs query strings (OAuth callbacks carry codes), headers or bodies.
// Registered first so it also sees CORS preflights and health checks.
// If a public 502/503/504 appears WITHOUT a matching line here, the request
// never reached this process (platform / routing problem).
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  // originalUrl keeps the full mount path; the query string is stripped.
  const loggedPath = req.originalUrl.split('?')[0];
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(
      `[req] ${req.method} ${loggedPath} -> ${res.statusCode} ${ms.toFixed(
        1
      )}ms origin=${req.headers.origin || '-'}`
    );
  });
  next();
});

const PORT = process.env.PORT
  ? Number(process.env.PORT)
  : process.env.NODE_ENV === 'production'
    ? 3000
    : 5000;

const FRONTEND_URL =
  process.env.FRONTEND_URL || 'http://localhost:5173';

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  'codesync-dev-secret-change-in-production';

const isProd = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// CORS allowlist
// ---------------------------------------------------------------------------
// Always allowed: the known production frontend.
const PRODUCTION_FRONTEND_ORIGINS = [
  'https://codesync-alexa-mcp-three.vercel.app',
];

// Only allowed outside production (local development).
const DEV_FRONTEND_ORIGINS = ['http://localhost:5173'];

/**
 * Turn a raw value (e.g. "https://app.example.com/") into a canonical origin
 * ("https://app.example.com"). Returns null for anything that is not a valid
 * http(s) URL, and for the wildcard "*" (never valid with credentials).
 */
function toOrigin(raw: string): string | null {
  const value = raw.trim();
  if (!value || value === '*') return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin; // drops path, query and trailing slash
  } catch {
    return null;
  }
}

function parseOriginList(raw: string | undefined): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const part of (raw || '').split(',')) {
    if (!part.trim()) continue;
    const origin = toOrigin(part);
    if (origin) valid.push(origin);
    else invalid.push(part.trim());
  }

  return { valid, invalid };
}

// FRONTEND_URL and the optional CORS_ORIGINS may each hold a comma-separated list.
const fromFrontendUrl = parseOriginList(process.env.FRONTEND_URL);
const fromCorsOrigins = parseOriginList(process.env.CORS_ORIGINS);

const allowedOrigins = new Set<string>([
  ...PRODUCTION_FRONTEND_ORIGINS,
  ...fromFrontendUrl.valid,
  ...fromCorsOrigins.valid,
  ...(isProd ? [] : DEV_FRONTEND_ORIGINS),
]);

const invalidOriginEntries = [
  ...fromFrontendUrl.invalid,
  ...fromCorsOrigins.invalid,
];

const rejectedOriginsLogged = new Set<string>();

// Validate the port before attempting to listen.
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Invalid PORT configuration: ${process.env.PORT}`);
}

// Trust the reverse proxy in production.
if (isProd) {
  app.set('trust proxy', 1);

  if (SESSION_SECRET === 'codesync-dev-secret-change-in-production') {
    console.warn(
      '[Security] Set a strong SESSION_SECRET in your production environment.'
    );
  }
}

// CORS
// Must be registered before every route/session middleware so that preflight
// (OPTIONS) requests are answered here and never reach authentication.
// The Access-Control-Allow-Origin header always echoes the exact requesting
// origin (never "*"), which is required when credentials are enabled.
const corsMiddleware = cors({
  origin: (origin, callback) => {
    // No Origin header: curl, server-to-server calls, health checks.
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    // Do not throw: just omit the CORS headers so the browser blocks the call.
    if (!rejectedOriginsLogged.has(origin)) {
      rejectedOriginsLogged.add(origin);
      console.warn(
        `[CORS] Blocked origin "${origin}". Allowed origins: ${[
          ...allowedOrigins,
        ].join(', ')}`
      );
    }
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 600,
  optionsSuccessStatus: 204,
});

app.use(corsMiddleware);
// Explicit preflight handler for every path (answers with 204 + CORS headers).
app.options('*', corsMiddleware);

// Root route: useful for quickly checking whether the server responds.
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'CodeSync AI MCP Backend',
    version: '2.0.0',
    health: '/api/health',
  });
});

// Public health endpoint.
// Keep this before session and authentication middleware so that
// deployment health checks do not depend on a user session.
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'CodeSync AI MCP Backend',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    runtime: process.version,
    pid: process.pid,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    port: PORT,
    tools: MCP_TOOLS.map((tool) => tool.name),
    oauthConfigured: isOAuthConfigured(),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    nodeEnv: process.env.NODE_ENV || 'unset',
    cors: {
      frontendUrlEnvSet: Boolean(process.env.FRONTEND_URL),
      allowedOrigins: [...allowedOrigins],
    },
  });
});

// Request parsing
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Session configuration
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
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// GitHub Passport authentication
configurePassport();

app.use(passport.initialize());
app.use(passport.session());

// Restore the GitHub user from the session, if needed.
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (!req.user && req.session?.githubUser) {
    req.user = req.session.githubUser as GitHubUser;
  }

  next();
});

// Rate limit the conversational endpoint.
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
    alexaResponse:
      'You are sending requests too quickly. Please wait a moment and try again.',
    toolUsed: null,
    debugPayload: {
      error: 'rate_limited',
    },
    requiresApproval: false,
    isFallback: false,
  },
});

// GitHub OAuth routes
app.use('/api/auth', createAuthRouter());

// MCP tool definitions
app.get('/api/mcp/tools', (_req: Request, res: Response) => {
  res.status(200).json({
    tools: MCP_TOOLS,
  });
});

// Main conversational endpoint
app.post(
  '/api/alexa/process',
  processLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Partial<ProcessRequest>;

      const owner = (
        body.owner ||
        process.env.GITHUB_OWNER ||
        'octocat'
      ).trim();

      const repo = (
        body.repo ||
        process.env.GITHUB_REPO ||
        'Hello-World'
      ).trim();

      const utterance = (body.utterance || '').trim();

      if (!utterance && !body.approve) {
        res.status(400).json({
          error:
            'utterance is required (or approve=true with pendingApproval)',
        });
        return;
      }

      // Never accept GitHub access tokens from the request body.
      const accessToken = getAccessToken(req);

      const processReq: ProcessRequest = {
        utterance: utterance || (body.approve ? 'approve' : ''),
        owner,
        repo,
        accessToken,
        conversationHistory: body.conversationHistory || [],
        pendingApproval: body.pendingApproval || null,
        approve: Boolean(body.approve),
      };

      const result: ProcessResponse =
        await llmHandler.process(processReq);

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// Central error handler
app.use(
  (
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error('[Server Error]', err);

    res.status(500).json({
      alexaResponse:
        'Sorry, something went wrong on my side. Please try again.',
      toolUsed: null,
      debugPayload: {
        error: isProd
          ? 'Internal server error'
          : err.message,
      },
      requiresApproval: false,
      isFallback: true,
    });
  }
);

// Export the Express app for both Node.js and Cloudflare Workers.
export { app };
