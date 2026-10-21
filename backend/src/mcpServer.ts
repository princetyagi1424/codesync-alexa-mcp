import { githubService, PullRequest } from './githubService';

export interface MCPToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
  /** Per-user OAuth token — never logged to the client */
  accessToken?: string;
}

export interface MCPToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  metadata?: {
    tool: string;
    durationMs: number;
    isFallback: boolean;
    raw?: unknown;
  };
}

export const MCP_TOOLS: MCPToolSchema[] = [
  {
    name: 'github_get_open_prs',
    description:
      'Retrieve a list of currently open pull requests for a GitHub repository. Returns PR numbers, titles, authors, and states. Use this first when the user asks about open PRs or wants a code review overview.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'GitHub repository owner (username or organization)' },
        repo: { type: 'string', description: 'GitHub repository name' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'github_get_pr_diff',
    description:
      'Fetch the file diffs (patches) for a specific pull request and run a deterministic static analysis for secrets, console.logs, raw SQL, and missing try-catch. Always call this after identifying a PR number the user wants analyzed.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'GitHub repository owner' },
        repo: { type: 'string', description: 'GitHub repository name' },
        pullNumber: { type: 'number', description: 'The pull request number to inspect' },
      },
      required: ['owner', 'repo', 'pullNumber'],
    },
  },
  {
    name: 'github_post_comment',
    description:
      'Post a review comment on a pull request. CRITICAL: This is a write operation. You MUST obtain explicit user confirmation before calling this tool. Never call it automatically. The comment body should be a professional, actionable code review summary.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'GitHub repository owner' },
        repo: { type: 'string', description: 'GitHub repository name' },
        pullNumber: { type: 'number', description: 'The pull request number to comment on' },
        commentBody: { type: 'string', description: 'The full markdown-formatted review comment to post' },
      },
      required: ['owner', 'repo', 'pullNumber', 'commentBody'],
    },
  },
];

export async function dispatchMCPTool(call: MCPToolCall): Promise<MCPToolResult> {
  const start = Date.now();
  const { name, arguments: args, accessToken } = call;

  try {
    switch (name) {
      case 'github_get_open_prs': {
        const owner = String(args.owner || '');
        const repo = String(args.repo || '');
        if (!owner || !repo) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'owner and repo are required' }) }],
            isError: true,
            metadata: { tool: name, durationMs: Date.now() - start, isFallback: false },
          };
        }
        const { prs, isFallback } = await githubService.getOpenPullRequests(owner, repo, accessToken);
        const summary = {
          count: prs.length,
          pullRequests: prs.map((pr: PullRequest) => ({
            number: pr.number,
            title: pr.title,
            author: pr.user.login,
            draft: pr.draft,
            labels: pr.labels.map((l) => l.name),
            updated_at: pr.updated_at,
            url: pr.html_url,
          })),
          isFallback,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
          metadata: { tool: name, durationMs: Date.now() - start, isFallback, raw: summary },
        };
      }

      case 'github_get_pr_diff': {
        const owner = String(args.owner || '');
        const repo = String(args.repo || '');
        const pullNumber = Number(args.pullNumber);
        if (!owner || !repo || !pullNumber) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'owner, repo, and pullNumber are required' }) },
            ],
            isError: true,
            metadata: { tool: name, durationMs: Date.now() - start, isFallback: false },
          };
        }
        const { diff, analysis, isFallback } = await githubService.getPullRequestDiff(
          owner,
          repo,
          pullNumber,
          accessToken
        );
        const payload = {
          pullNumber: diff.pullNumber,
          fileCount: diff.files.length,
          files: diff.files.map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
          })),
          staticAnalysis: analysis,
          diffPreview: diff.rawDiff.slice(0, 4000) + (diff.rawDiff.length > 4000 ? '\n...[truncated]' : ''),
          isFallback,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          metadata: { tool: name, durationMs: Date.now() - start, isFallback, raw: payload },
        };
      }

      case 'github_post_comment': {
        const owner = String(args.owner || '');
        const repo = String(args.repo || '');
        const pullNumber = Number(args.pullNumber);
        const commentBody = String(args.commentBody || '');
        if (!owner || !repo || !pullNumber || !commentBody) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'owner, repo, pullNumber, and commentBody are required' }),
              },
            ],
            isError: true,
            metadata: { tool: name, durationMs: Date.now() - start, isFallback: false },
          };
        }
        const result = await githubService.postPRComment(
          owner,
          repo,
          pullNumber,
          commentBody,
          accessToken
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          metadata: {
            tool: name,
            durationMs: Date.now() - start,
            isFallback: result.isFallback,
            raw: result,
          },
        };
      }

      default:
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
          isError: true,
          metadata: { tool: name, durationMs: Date.now() - start, isFallback: false },
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
      isError: true,
      metadata: { tool: name, durationMs: Date.now() - start, isFallback: false },
    };
  }
}

export function getToolDefinitionsForLLM(): Array<{
  name: string;
  description: string;
  parameters: MCPToolSchema['inputSchema'];
}> {
  return MCP_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }));
}
