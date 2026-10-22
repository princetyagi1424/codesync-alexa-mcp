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


function formatGitHubError(operation: string, error: unknown): Error {
  const axErr = error as AxiosError<{ message?: string }>;
  const status = axErr.response?.status;
  const detail = axErr.response?.data?.message || axErr.message || String(error);

  if (status === 401) {
    return new Error(`${operation} failed (GitHub 401): sign-in expired or token was rejected. Sign in again.`);
  }
  if (status === 403) {
    return new Error(`${operation} failed (GitHub 403): insufficient permissions or API rate limit. ${detail}`);
  }
  if (status === 404) {
    return new Error(`${operation} failed (GitHub 404): repository or pull request was not found, or this account cannot access it.`);
  }
  if (status === 429) {
    return new Error(`${operation} failed (GitHub 429): rate limit reached. Retry later.`);
  }
  return new Error(`${operation} failed${status ? ` (GitHub ${status})` : ''}: ${detail}`);
}

function createClient(accessToken?: string): AxiosInstance {
  const token = accessToken || process.env.GITHUB_TOKEN || '';
  return axios.create({
    adapter: 'fetch',
    fetchOptions: { cache: 'no-store' },
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
      throw new Error('GitHub authentication is required to list pull requests. Sign in with GitHub and retry.');
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
      const reported = formatGitHubError('Listing open pull requests', error);
      console.warn(`[GitHubService] ${reported.message}`);
      throw reported;
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
      throw new Error('GitHub authentication is required to fetch a pull request diff. Sign in with GitHub and retry.');
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
      const reported = formatGitHubError(`Fetching diff for PR #${pullNumber}`, error);
      console.warn(`[GitHubService] ${reported.message}`);
      throw reported;
    }
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
      throw new Error('GitHub authentication is required. The comment was not posted.');
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
      const reported = formatGitHubError(`Posting a comment to PR #${pullNumber}`, error);
      console.warn(`[GitHubService] ${reported.message}`);
      throw reported;
    }
  }
}

export const githubService = new GitHubService();
