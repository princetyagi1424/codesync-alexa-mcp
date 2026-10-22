import 'dotenv/config';

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
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

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
    port: PORT,
    tools: MCP_TOOLS.map((tool) => tool.name),
    oauthConfigured: isOAuthConfigured(),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
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

// IMPORTANT:
// Bind to 0.0.0.0 so the hosting platform can reach this process.
// Use the port provided by the hosting platform whenever available.
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('CodeSync AI Backend v2.0 started');
  console.log(`Host: 0.0.0.0`);
  console.log(`Port: ${PORT}`);
  console.log(`Health: /api/health`);
  console.log(`MCP tools: /api/mcp/tools`);
  console.log(
    `GitHub OAuth: ${
      isOAuthConfigured() ? 'configured' : 'not configured'
    }`
  );
  console.log(
    `Gemini API: ${
      process.env.GEMINI_API_KEY ? 'configured' : 'missing'
    }`
  );
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log('========================================');
});

// Report startup failures clearly in the runtime logs.
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error('[Startup Error]', error.message);
  process.exit(1);
});

// Graceful shutdown during redeployments.
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down server...');

  server.close((err) => {
    if (err) {
      console.error('[Shutdown Error]', err);
      process.exit(1);
    }

    console.log('Server shut down successfully.');
    process.exit(0);
  });
});