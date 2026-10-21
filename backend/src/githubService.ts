import axios, { AxiosInstance, AxiosError } from 'axios';

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  user: { login: string };
  created_at: string;
  updated_at: string;
  html_url: string;
  body: string | null;
  draft: boolean;
  labels: Array<{ name: string }>;
}

export interface PRDiff {
  pullNumber: number;
  files: DiffFile[];
  rawDiff: string;
}

export interface DiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface StaticAnalysisFinding {
  type: 'secret' | 'console_log' | 'missing_try_catch' | 'raw_sql' | 'todo' | 'hardcoded_url';
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  lineHint: string;
  message: string;
  snippet: string;
}

export interface AnalysisResult {
  findings: StaticAnalysisFinding[];
  summary: string;
  score: number;
}

const MOCK_PRS: PullRequest[] = [
  {
    number: 1,
    title: 'feat: add user authentication module',
    state: 'open',
    user: { login: 'dev-alice' },
    created_at: '2026-10-15T10:00:00Z',
    updated_at: '2026-10-20T14:30:00Z',
    html_url: 'https://github.com/example/repo/pull/1',
    body: 'Implements JWT-based auth with refresh tokens.',
    draft: false,
    labels: [{ name: 'enhancement' }],
  },
  {
    number: 2,
    title: 'fix: resolve race condition in payment service',
    state: 'open',
    user: { login: 'dev-bob' },
    created_at: '2026-10-18T08:15:00Z',
    updated_at: '2026-10-21T09:00:00Z',
    html_url: 'https://github.com/example/repo/pull/2',
    body: 'Adds mutex locking around concurrent payment updates.',
    draft: false,
    labels: [{ name: 'bug' }, { name: 'priority-high' }],
  },
  {
    number: 3,
    title: 'chore: upgrade dependencies and clean up logs',
    state: 'open',
    user: { login: 'dev-carol' },
    created_at: '2026-10-19T16:45:00Z',
    updated_at: '2026-10-21T11:20:00Z',
    html_url: 'https://github.com/example/repo/pull/3',
    body: 'Removes debug console.logs and updates axios.',
    draft: true,
    labels: [{ name: 'chore' }],
  },
];

const MOCK_DIFF_PR1 = `diff --git a/src/auth/login.ts b/src/auth/login.ts
index 1111111..2222222 100644
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -10,6 +10,15 @@ export async function login(email: string, password: string) {
   const user = await db.users.findOne({ email });
   if (!user) {
     throw new Error('User not found');
   }
+  // TODO: rate limit login attempts
+  const apiKey = "sk-live-abc123xyz789secret";
+  console.log("User login attempt:", email, password);
+  const query = "SELECT * FROM sessions WHERE user_id = " + user.id;
+  const result = await db.raw(query);
   const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
   return { token, user };
 }
diff --git a/src/auth/token.ts b/src/auth/token.ts
index 3333333..4444444 100644
--- a/src/auth/token.ts
+++ b/src/auth/token.ts
@@ -5,8 +5,12 @@ export function verifyToken(token: string) {
   try {
     return jwt.verify(token, process.env.JWT_SECRET);
   } catch (err) {
     return null;
   }
+  // Missing try-catch around external call
+  const response = await fetch("https://api.example.com/validate");
+  return response.json();
 }
`;

const MOCK_DIFF_PR2 = `diff --git a/src/payments/processor.ts b/src/payments/processor.ts
index 5555555..6666666 100644
--- a/src/payments/processor.ts
+++ b/src/payments/processor.ts
@@ -20,10 +20,18 @@ export async function processPayment(orderId: string, amount: number) {
   const order = await Order.findById(orderId);
   if (!order) throw new Error('Order not found');
+  console.log("Processing payment for order", orderId, "amount", amount);
+  const secret = "whsec_test_secret_key_do_not_commit";
   order.status = 'processing';
   await order.save();
+  // Potential race condition still present without proper locking
   const charge = await stripe.charges.create({
     amount: amount * 100,
     currency: 'usd',
     source: order.paymentSource,
   });
   return charge;
 }
`;

const MOCK_DIFF_PR3 = `diff --git a/src/utils/logger.ts b/src/utils/logger.ts
index 7777777..8888888 100644
--- a/src/utils/logger.ts
+++ b/src/utils/logger.ts
@@ -1,8 +1,6 @@
 export function log(message: string) {
-  console.log("[DEBUG]", message);
-  console.log("[INFO]", new Date().toISOString(), message);
+  // cleaned up debug logs
   if (process.env.NODE_ENV !== 'production') {
     console.info(message);
   }
 }
`;

function createClient(accessToken?: string): AxiosInstance {
  const token = accessToken || process.env.GITHUB_TOKEN || '';
  return axios.create({
    baseURL: 'https://api.github.com',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'CodeSync-AI-MCP/2.0',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    timeout: 15000,
  });
}

export class GitHubService {
  /**
   * Resolve token priority: per-request OAuth token > env GITHUB_TOKEN fallback.
   * Never persists user tokens to disk.
   */
  private resolveToken(accessToken?: string): string {
    return (accessToken || process.env.GITHUB_TOKEN || '').trim();
  }

  async getOpenPullRequests(
    owner: string,
    repo: string,
    accessToken?: string
  ): Promise<{ prs: PullRequest[]; isFallback: boolean }> {
    const token = this.resolveToken(accessToken);
    if (!token) {
      console.warn('[GitHubService] No OAuth/PAT token — using offline PR mocks');
      return { prs: MOCK_PRS, isFallback: true };
    }

    try {
      const client = createClient(token);
      const response = await client.get(`/repos/${owner}/${repo}/pulls`, {
        params: { state: 'open', per_page: 20, sort: 'updated', direction: 'desc' },
      });
      const prs: PullRequest[] = response.data.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        user: { login: pr.user?.login || 'unknown' },
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        html_url: pr.html_url,
        body: pr.body,
        draft: pr.draft || false,
        labels: (pr.labels || []).map((l: any) => ({ name: l.name })),
      }));
      return { prs, isFallback: false };
    } catch (error) {
      const axErr = error as AxiosError;
      console.warn(`[GitHubService] getOpenPullRequests failed: ${axErr.response?.status || axErr.message}`);
      return { prs: MOCK_PRS, isFallback: true };
    }
  }

  async getPullRequestDiff(
    owner: string,
    repo: string,
    pullNumber: number,
    accessToken?: string
  ): Promise<{ diff: PRDiff; analysis: AnalysisResult; isFallback: boolean }> {
    const token = this.resolveToken(accessToken);
    if (!token) {
      return this.getMockDiff(pullNumber);
    }

    try {
      const client = createClient(token);
      const response = await client.get(`/repos/${owner}/${repo}/pulls/${pullNumber}/files`, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });

      const files: DiffFile[] = response.data.map((f: any) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch,
      }));

      const rawDiff = files
        .map((f) => `File: ${f.filename}\nStatus: ${f.status}\n${f.patch || '(binary or no patch)'}`)
        .join('\n\n---\n\n');

      const analysis = this.runStaticAnalysis(files);
      return {
        diff: { pullNumber, files, rawDiff },
        analysis,
        isFallback: false,
      };
    } catch (error) {
      const axErr = error as AxiosError;
      console.warn(`[GitHubService] getPullRequestDiff failed: ${axErr.response?.status || axErr.message}`);
      return this.getMockDiff(pullNumber);
    }
  }

  private getMockDiff(pullNumber: number): { diff: PRDiff; analysis: AnalysisResult; isFallback: boolean } {
    let rawDiff = MOCK_DIFF_PR1;
    if (pullNumber === 2) rawDiff = MOCK_DIFF_PR2;
    if (pullNumber === 3) rawDiff = MOCK_DIFF_PR3;

    const files: DiffFile[] = [
      {
        filename:
          pullNumber === 1
            ? 'src/auth/login.ts'
            : pullNumber === 2
            ? 'src/payments/processor.ts'
            : 'src/utils/logger.ts',
        status: 'modified',
        additions: 8,
        deletions: 2,
        changes: 10,
        patch: rawDiff,
      },
    ];

    const analysis = this.runStaticAnalysis(files);
    return {
      diff: { pullNumber, files, rawDiff },
      analysis,
      isFallback: true,
    };
  }

  runStaticAnalysis(files: DiffFile[]): AnalysisResult {
    const findings: StaticAnalysisFinding[] = [];

    const secretPatterns = [
      {
        regex: /(?:api[_-]?key|apikey|secret|token|password|passwd|pwd|auth)\s*[:=]\s*['"][^'"]{8,}['"]/i,
        type: 'secret' as const,
        severity: 'critical' as const,
        message: 'Potential hardcoded secret or API key detected',
      },
      {
        regex: /sk-[a-zA-Z0-9]{20,}/,
        type: 'secret' as const,
        severity: 'critical' as const,
        message: 'OpenAI-style secret key pattern found',
      },
      {
        regex: /ghp_[a-zA-Z0-9]{36}/,
        type: 'secret' as const,
        severity: 'critical' as const,
        message: 'GitHub Personal Access Token pattern found',
      },
      {
        regex: /whsec_[a-zA-Z0-9_]+/,
        type: 'secret' as const,
        severity: 'critical' as const,
        message: 'Stripe webhook secret pattern found',
      },
      {
        regex: /AKIA[0-9A-Z]{16}/,
        type: 'secret' as const,
        severity: 'critical' as const,
        message: 'AWS Access Key ID pattern found',
      },
    ];

    const consoleLogPattern = {
      regex: /console\.(log|debug|info|warn|error)\s*\(/,
      type: 'console_log' as const,
      severity: 'medium' as const,
      message: 'console.log / debug statement left in code',
    };
    const rawSqlPattern = {
      regex:
        /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE)\s+.*(?:FROM|INTO|SET|TABLE).*['"`+]|\+\s*['"`].*(?:SELECT|WHERE|FROM)/i,
      type: 'raw_sql' as const,
      severity: 'high' as const,
      message: 'Possible raw SQL string concatenation (SQL injection risk)',
    };
    const hardcodedUrlPattern = {
      regex: /https?:\/\/[^\s'"]+/,
      type: 'hardcoded_url' as const,
      severity: 'low' as const,
      message: 'Hardcoded URL found; consider configuration',
    };
    const todoPattern = {
      regex: /\/\/\s*(TODO|FIXME|HACK|XXX)/i,
      type: 'todo' as const,
      severity: 'low' as const,
      message: 'TODO / FIXME comment present',
    };

    for (const file of files) {
      if (!file.patch) continue;
      const lines = file.patch.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('+++') || line.startsWith('---')) continue;
        if (line.startsWith('+')) {
          const content = line.slice(1);
          const lineHint = 'approx line near hunk';

          for (const pat of secretPatterns) {
            if (pat.regex.test(content)) {
              findings.push({
                type: pat.type,
                severity: pat.severity,
                file: file.filename,
                lineHint,
                message: pat.message,
                snippet: content.trim().slice(0, 120),
              });
            }
          }

          if (consoleLogPattern.regex.test(content)) {
            findings.push({
              type: consoleLogPattern.type,
              severity: consoleLogPattern.severity,
              file: file.filename,
              lineHint,
              message: consoleLogPattern.message,
              snippet: content.trim().slice(0, 120),
            });
          }

          if (rawSqlPattern.regex.test(content)) {
            findings.push({
              type: rawSqlPattern.type,
              severity: rawSqlPattern.severity,
              file: file.filename,
              lineHint,
              message: rawSqlPattern.message,
              snippet: content.trim().slice(0, 120),
            });
          }

          if (
            hardcodedUrlPattern.regex.test(content) &&
            !content.includes('example.com') &&
            !content.includes('localhost')
          ) {
            findings.push({
              type: hardcodedUrlPattern.type,
              severity: hardcodedUrlPattern.severity,
              file: file.filename,
              lineHint,
              message: hardcodedUrlPattern.message,
              snippet: content.trim().slice(0, 120),
            });
          }

          if (todoPattern.regex.test(content)) {
            findings.push({
              type: todoPattern.type,
              severity: todoPattern.severity,
              file: file.filename,
              lineHint,
              message: todoPattern.message,
              snippet: content.trim().slice(0, 120),
            });
          }
        }
      }

      const patchLower = file.patch.toLowerCase();
      if (
        patchLower.includes('async ') &&
        patchLower.includes('await ') &&
        !patchLower.includes('try ') &&
        !patchLower.includes('try{')
      ) {
        findings.push({
          type: 'missing_try_catch',
          severity: 'medium',
          file: file.filename,
          lineHint: 'function scope',
          message: 'Async code with await appears to lack try-catch error handling in the changed region',
          snippet: 'async ... await ... (no try detected in patch)',
        });
      }
    }

    const unique = findings.filter(
      (f, idx, arr) =>
        arr.findIndex((x) => x.type === f.type && x.file === f.file && x.snippet === f.snippet) === idx
    );

    const criticalCount = unique.filter((f) => f.severity === 'critical').length;
    const highCount = unique.filter((f) => f.severity === 'high').length;
    const score = Math.max(
      0,
      100 - criticalCount * 30 - highCount * 15 - (unique.length - criticalCount - highCount) * 5
    );

    const summary =
      unique.length === 0
        ? 'No obvious security or quality issues detected by static rules.'
        : `Found ${unique.length} potential issue(s): ${criticalCount} critical, ${highCount} high. Score: ${score}/100.`;

    return { findings: unique, summary, score };
  }

  async postPRComment(
    owner: string,
    repo: string,
    pullNumber: number,
    commentBody: string,
    accessToken?: string
  ): Promise<{ success: boolean; commentUrl?: string; isFallback: boolean; message: string }> {
    const token = this.resolveToken(accessToken);
    if (!token) {
      return {
        success: true,
        commentUrl: `https://github.com/${owner}/${repo}/pull/${pullNumber}#issuecomment-mock-${Date.now()}`,
        isFallback: true,
        message: `[FALLBACK] Comment would have been posted to PR #${pullNumber}. Body length: ${commentBody.length} chars.`,
      };
    }

    try {
      const client = createClient(token);
      const response = await client.post(`/repos/${owner}/${repo}/issues/${pullNumber}/comments`, {
        body: commentBody,
      });
      return {
        success: true,
        commentUrl: response.data.html_url,
        isFallback: false,
        message: `Comment posted successfully to PR #${pullNumber}`,
      };
    } catch (error) {
      const axErr = error as AxiosError;
      console.warn(`[GitHubService] postPRComment failed: ${axErr.response?.status || axErr.message}`);
      return {
        success: true,
        commentUrl: `https://github.com/${owner}/${repo}/pull/${pullNumber}#issuecomment-mock-${Date.now()}`,
        isFallback: true,
        message: `[FALLBACK after error] Simulated comment post for PR #${pullNumber}`,
      };
    }
  }
}

export const githubService = new GitHubService();
