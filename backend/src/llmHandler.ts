import { GoogleGenerativeAI, GenerativeModel, Content, Part } from '@google/generative-ai';
import { dispatchMCPTool, getToolDefinitionsForLLM, MCPToolCall, MCPToolResult } from './mcpServer';
import { approvalStore } from './approvalStore';

export interface ProcessRequest {
  utterance: string;
  owner: string;
  repo: string;
  /** Per-user GitHub OAuth token from session — never sent to the browser */
  accessToken?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** A server-issued, one-shot approval identifier; never accept write args from the client. */
  approvalId?: string;
  /** Bound by the server to the authenticated user and current session. */
  approvalUserId: string;
  approve?: boolean;
}

export interface ProcessResponse {
  alexaResponse: string;
  toolUsed: string | null;
  debugPayload: {
    request: unknown;
    response: unknown;
    toolCalls: Array<{
      name: string;
      arguments: Record<string, unknown>;
      result: MCPToolResult;
      durationMs: number;
    }>;
    llmRaw?: unknown;
  };
  requiresApproval: boolean;
  approvalPayload?: {
    approvalId: string;
    tool: string;
    draftComment: string;
  };
  isFallback: boolean;
  error?: boolean;
}

const SYSTEM_INSTRUCTION = `You are CodeSync AI, an expert senior software engineer and code review assistant integrated with Alexa+.
You help developers inspect GitHub pull requests via natural language voice or text commands.

CRITICAL SECURITY & WORKFLOW RULES (NEVER VIOLATE):
1. You have three tools: github_get_open_prs, github_get_pr_diff, github_post_comment.
2. github_post_comment is a WRITE operation. You must NEVER call it unless the user has explicitly approved a drafted comment in the current turn (they said "yes", "approve", "post it", "go ahead", etc.).
3. When you finish analyzing a PR (after github_get_pr_diff), you MUST draft a professional review comment and ask the user for confirmation: "Should I post this review comment to GitHub?" Do not post automatically.
4. Always prefer the deterministic static analysis findings provided by the tools. Augment them with clear, actionable advice.
5. Keep spoken Alexa responses concise (under 80 words when possible) and natural. Use a friendly, professional tone.
6. If tools return isFallback: true, mention that you are using offline demo data so the user knows.
7. When listing PRs, mention numbers and titles clearly so the user can say "Analyze PR #2".
8. Never invent PR numbers or file contents. Rely only on tool results.
9. If the user says anything that sounds like approval of a previously drafted comment, call github_post_comment with the exact draft.
10. Format review comments in Markdown with clear sections: Summary, Findings (with severity), Recommendations.

Available tools will be provided in the function calling interface.
Repository context: owner and repo are supplied by the client; always pass them to tools.
`;

export class LLMHandler {
  private genAI: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;
  private fallbackMode: boolean = false;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          systemInstruction: SYSTEM_INSTRUCTION,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
          },
        });
      } catch (e) {
        console.warn('[LLMHandler] Failed to init Gemini, using fallback mode', e);
        this.fallbackMode = true;
      }
    } else {
      console.warn('[LLMHandler] No GEMINI_API_KEY – running in offline fallback mode');
      this.fallbackMode = true;
    }
  }

  async process(req: ProcessRequest): Promise<ProcessResponse> {
    const debugToolCalls: ProcessResponse['debugPayload']['toolCalls'] = [];
    let isFallback = this.fallbackMode;
    let requiresApproval = false;
    let approvalPayload: ProcessResponse['approvalPayload'];
    let toolUsed: string | null = null;
    const accessToken = req.accessToken;

    const approvalFailure = (message: string): ProcessResponse => ({
      alexaResponse: message,
      toolUsed: null,
      debugPayload: {
        request: { type: 'approval' },
        response: { error: message },
        toolCalls: debugToolCalls,
      },
      requiresApproval: false,
      isFallback: false,
      error: true,
    });

    // A write can only be authorized by an opaque ID created server-side.
    // The browser never supplies the comment body, target repository, or PR number.
    if (req.approve) {
      if (!req.approvalId) {
        return approvalFailure('No server-issued approval ID was provided. Analyze the pull request again before posting.');
      }
      if (!accessToken) {
        return approvalFailure('GitHub sign-in is required to post a real comment. Sign in and analyze the pull request again.');
      }

      const storedApproval = approvalStore.consume(req.approvalId, req.approvalUserId);
      if (!storedApproval || storedApproval.tool !== 'github_post_comment') {
        return approvalFailure('This approval is invalid, expired, already used, or belongs to another session. Analyze the pull request again.');
      }

      const call: MCPToolCall = {
        name: storedApproval.tool,
        arguments: storedApproval.arguments,
        accessToken,
      };
      const result = await dispatchMCPTool(call);
      debugToolCalls.push({
        name: call.name,
        arguments: call.arguments,
        result,
        durationMs: result.metadata?.durationMs || 0,
      });
      toolUsed = call.name;

      const parsed = this.safeParse(result.content[0]?.text || '{}');
      const posted = !result.isError && parsed.success === true;
      const pullNumber = Number(storedApproval.arguments.pullNumber);
      const alexaResponse = posted
        ? `Done. GitHub accepted the review comment for pull request #${pullNumber}.${parsed.commentUrl ? ` View it here: ${parsed.commentUrl}` : ''}`
        : `I couldn't post the comment. ${String(parsed.error || parsed.message || 'GitHub did not confirm a successful post. The approval cannot be reused; analyze the PR again before retrying.')}`;

      return {
        alexaResponse,
        toolUsed,
        debugPayload: {
          request: { type: 'approval', approvalIdAccepted: true, tool: storedApproval.tool },
          response: result,
          toolCalls: debugToolCalls,
        },
        requiresApproval: false,
        isFallback: !!result.metadata?.isFallback,
        error: !posted,
      };
    }

    const normalizedUtterance = req.utterance.toLowerCase();
    const directGitHubCommand =
      normalizedUtterance.includes('check open pr') ||
      normalizedUtterance.includes('check open pull') ||
      normalizedUtterance.includes('list pr') ||
      normalizedUtterance.includes('open pull request') ||
      normalizedUtterance.includes('what pull requests') ||
      normalizedUtterance.includes('analyze pr') ||
      normalizedUtterance.includes('analyze pull request') ||
      normalizedUtterance.includes('review pr') ||
      normalizedUtterance.includes('review pull request') ||
      normalizedUtterance.includes('security issues') ||
      /\bpr\s*#?\d+\b/i.test(normalizedUtterance) ||
      /\bpull request\s+(?:number\s+)?#?\d+\b/i.test(normalizedUtterance);

    // Common GitHub workflows must not be blocked by a transient LLM outage.
    // They use the same authenticated GitHub API and static analysis functions.
    if (this.fallbackMode || !this.model || directGitHubCommand) {
      return this.offlineProcess(req, debugToolCalls);
    }

    try {
      const tools = getToolDefinitionsForLLM();
      const geminiTools = [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];

      const history: Content[] = (req.conversationHistory || []).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

      const contextualUtterance = `[Repository: ${req.owner}/${req.repo}]\nUser said: ${req.utterance}`;

      const chat = this.model.startChat({
        history,
        tools: geminiTools as any,
      });

      let result = await this.withGeminiRetry(() => chat.sendMessage(contextualUtterance));
      let response = result.response;
      let functionCalls = response.functionCalls?.() || [];

      let iterations = 0;
      while (functionCalls.length > 0 && iterations < 4) {
        iterations++;
        const callParts: Part[] = [];

        for (const fc of functionCalls) {
          const name = fc.name;
          const args = (fc.args || {}) as Record<string, unknown>;

          if (name === 'github_post_comment') {
            const draft = String(args.commentBody || '').trim();
            const pullNumber = Number(args.pullNumber);
            if (!draft || !Number.isSafeInteger(pullNumber) || pullNumber < 1) {
              return approvalFailure('I could not create a safe review draft because the comment body or explicit PR number was invalid.');
            }

            const safeArguments: Record<string, unknown> = {
              owner: String(args.owner || req.owner),
              repo: String(args.repo || req.repo),
              pullNumber,
              commentBody: draft,
            };
            const storedApproval = approvalStore.create(
              req.approvalUserId,
              name,
              safeArguments,
              draft
            );
            requiresApproval = true;
            approvalPayload = {
              approvalId: storedApproval.id,
              tool: name,
              draftComment: draft,
            };
            toolUsed = name;
            const alexaResponse = `I've prepared a review comment for pull request #${pullNumber}. Here is the draft:\n\n${draft.slice(0, 700)}${draft.length > 700 ? '...' : ''}\n\nNothing has been posted yet. Should I post this review comment to GitHub?`;
            return {
              alexaResponse,
              toolUsed,
              debugPayload: {
                request: { utterance: req.utterance, functionCall: { name: fc.name } },
                response: { blocked: true, reason: 'human-in-the-loop', approvalIdCreated: true },
                toolCalls: debugToolCalls,
                llmRaw: response.text?.(),
              },
              requiresApproval: true,
              approvalPayload,
              isFallback,
            };
          }

          if (!args.owner) args.owner = req.owner;
          if (!args.repo) args.repo = req.repo;

          const mcpResult = await dispatchMCPTool({ name, arguments: args, accessToken });
          debugToolCalls.push({
            name,
            arguments: args,
            result: mcpResult,
            durationMs: mcpResult.metadata?.durationMs || 0,
          });
          toolUsed = name;
          isFallback = isFallback || !!mcpResult.metadata?.isFallback;

          callParts.push({
            functionResponse: {
              name,
              response: this.safeParse(mcpResult.content[0]?.text || '{}'),
            },
          } as Part);
        }

        result = await this.withGeminiRetry(() => chat.sendMessage(callParts));
        response = result.response;
        functionCalls = response.functionCalls?.() || [];
      }

      const text = response.text() || "I'm sorry, I couldn't generate a response.";
      const lower = text.toLowerCase();
      if (
        (lower.includes('should i post') ||
          lower.includes('shall i post') ||
          lower.includes('would you like me to post')) &&
        !requiresApproval
      ) {
        requiresApproval = true;
      }

      return {
        alexaResponse: text,
        toolUsed,
        debugPayload: {
          request: { utterance: req.utterance },
          response: { text },
          toolCalls: debugToolCalls,
          llmRaw: text,
        },
        requiresApproval,
        approvalPayload,
        isFallback,
      };
    } catch (err) {
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as { status?: unknown }).status)
          : undefined;
      const message = err instanceof Error ? err.message : String(err);

      console.error('[LLMHandler] Gemini request failed; using supported GitHub workflow fallback:', {
        status,
        message,
      });

      // Do not permanently disable Gemini after one transient error.
      return this.offlineProcess(req, debugToolCalls);
    }
  }

  private async withGeminiRetry<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? Number((error as { status?: unknown }).status)
            : undefined;

        const retryable =
          status === 408 ||
          status === 429 ||
          (status !== undefined && status >= 500 && status <= 599);

        if (!retryable || attempt === 2) {
          throw error;
        }

        const delayMs = 1000 * (2 ** attempt);
        console.warn(
          `[LLMHandler] Gemini returned ${status}; retrying in ${delayMs}ms (attempt ${attempt + 2}/3).`
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new Error('Gemini retry attempts exhausted.');
  }

  private offlineProcess(
    req: ProcessRequest,
    debugToolCalls: ProcessResponse['debugPayload']['toolCalls']
  ): Promise<ProcessResponse> {
    return (async () => {
      const utterance = req.utterance.toLowerCase();
      let alexaResponse = '';
      let toolUsed: string | null = null;
      let requiresApproval = false;
      let approvalPayload: ProcessResponse['approvalPayload'];
      let isFallback = false;
      const accessToken = req.accessToken;

      if (
        utterance.includes('open pr') ||
        utterance.includes('open pull') ||
        utterance.includes('list pr') ||
        utterance.includes('check open') ||
        utterance.includes('what pull requests')
      ) {
        const result = await dispatchMCPTool({
          name: 'github_get_open_prs',
          arguments: { owner: req.owner, repo: req.repo },
          accessToken,
        });
        debugToolCalls.push({
          name: 'github_get_open_prs',
          arguments: { owner: req.owner, repo: req.repo },
          result,
          durationMs: result.metadata?.durationMs || 0,
        });
        toolUsed = 'github_get_open_prs';
        isFallback = isFallback || !!result.metadata?.isFallback;
        const data = this.safeParse(result.content[0]?.text || '{}');
        if (result.isError || data.error) {
          return {
            alexaResponse: `GitHub request failed: ${String(data.error || 'Unable to list pull requests')}. No mock data was used.`,
            toolUsed,
            debugPayload: {
              request: { utterance: req.utterance, mode: 'direct-github' },
              response: data,
              toolCalls: debugToolCalls,
            },
            requiresApproval: false,
            isFallback: false,
          };
        }
        const prs = data.pullRequests || [];
        if (prs.length === 0) {
          alexaResponse = 'There are currently no open pull requests in this repository.';
        } else {
          const list = prs
            .slice(0, 5)
            .map((p: any) => `Pull request number ${p.number}: ${p.title}, by ${p.author}`)
            .join('. ');
          alexaResponse = `I found ${prs.length} open pull request${prs.length > 1 ? 's' : ''}. ${list}. You can say "Analyze PR number X for bugs" to dive deeper.${isFallback ? ' (Using demo data — sign in with GitHub for your real repos.)' : ''}`;
        }
      } else if (
        utterance.includes('analyze') ||
        utterance.includes('review') ||
        utterance.includes('check pr') ||
        utterance.includes('bugs') ||
        /pr\s*#?\s*\d+/.test(utterance)
      ) {
        const numMatch = utterance.match(/\b(?:pr|pull request)\s*(?:number\s*)?#?\s*(\d+)\b/i);
        if (!numMatch) {
          const message = 'Please specify the exact PR number, for example: "Analyze PR #12 for bugs". I did not assume PR #1.';
          return {
            alexaResponse: message,
            toolUsed: null,
            debugPayload: {
              request: { utterance: req.utterance, mode: 'direct-github' },
              response: { error: 'missing_pr_number' },
              toolCalls: debugToolCalls,
            },
            requiresApproval: false,
            isFallback: false,
            error: true,
          };
        }
        const pullNumber = Number(numMatch[1]);
        if (!Number.isSafeInteger(pullNumber) || pullNumber < 1) {
          const message = 'The PR number must be a positive integer. Please specify a valid PR number.';
          return {
            alexaResponse: message,
            toolUsed: null,
            debugPayload: {
              request: { utterance: req.utterance, mode: 'direct-github' },
              response: { error: 'invalid_pr_number' },
              toolCalls: debugToolCalls,
            },
            requiresApproval: false,
            isFallback: false,
            error: true,
          };
        }

        const result = await dispatchMCPTool({
          name: 'github_get_pr_diff',
          arguments: { owner: req.owner, repo: req.repo, pullNumber },
          accessToken,
        });
        debugToolCalls.push({
          name: 'github_get_pr_diff',
          arguments: { owner: req.owner, repo: req.repo, pullNumber },
          result,
          durationMs: result.metadata?.durationMs || 0,
        });
        toolUsed = 'github_get_pr_diff';
        isFallback = isFallback || !!result.metadata?.isFallback;
        const data = this.safeParse(result.content[0]?.text || '{}');
        if (result.isError || data.error) {
          return {
            alexaResponse: `GitHub request failed: ${String(data.error || 'Unable to fetch pull request diff')}. No review draft was generated.`,
            toolUsed,
            debugPayload: {
              request: { utterance: req.utterance, mode: 'direct-github' },
              response: data,
              toolCalls: debugToolCalls,
            },
            requiresApproval: false,
            isFallback: false,
          };
        }
        const analysis = data.staticAnalysis || { findings: [], summary: 'No findings', score: 100 };
        const findings = analysis.findings || [];

        let draft = `## CodeSync AI Review – PR #${pullNumber}\n\n`;
        draft += `**Static Analysis Score:** ${analysis.score}/100\n\n`;
        draft += `### Summary\n${analysis.summary}\n\n`;
        if (findings.length > 0) {
          draft += `### Findings\n`;
          for (const f of findings) {
            draft += `- **[${f.severity.toUpperCase()}]** ${f.message} in \`${f.file}\`\n  \`${f.snippet}\`\n`;
          }
          draft += `\n### Recommendations\n`;
          draft += `- Remove any hardcoded secrets and move them to environment variables or a secrets manager.\n`;
          draft += `- Replace console.log with a proper structured logger.\n`;
          draft += `- Use parameterized queries instead of string-concatenated SQL.\n`;
          draft += `- Ensure all async paths have appropriate try/catch or error boundaries.\n`;
        } else {
          draft += `No critical static issues detected. Consider a human review for logic and design.\n`;
        }
        draft += `\n---\n*Generated by CodeSync AI (MCP + deterministic static rules)*`;

        const storedApproval = approvalStore.create(
          req.approvalUserId,
          'github_post_comment',
          {
            owner: req.owner,
            repo: req.repo,
            pullNumber,
            commentBody: draft,
          },
          draft
        );
        requiresApproval = true;
        approvalPayload = {
          approvalId: storedApproval.id,
          tool: 'github_post_comment',
          draftComment: draft,
        };

        const spokenFindings =
          findings.length === 0
            ? 'No critical issues were found by the static rules.'
            : `I found ${findings.length} potential issue${findings.length > 1 ? 's' : ''}. The most severe are: ${findings
                .slice(0, 3)
                .map((f: any) => f.message)
                .join('; ')}.`;

        alexaResponse = `I've analyzed pull request number ${pullNumber}. ${spokenFindings} Overall score ${analysis.score} out of 100. Nothing has been posted. Draft comment:\n\n${draft.slice(0, 800)}${draft.length > 800 ? '...' : ''}\n\nShould I post this review comment to GitHub?`;
      } else if (
        utterance.includes('yes') ||
        utterance.includes('approve') ||
        utterance.includes('post it') ||
        utterance.includes('post the comment') ||
        utterance.includes('go ahead')
      ) {
        alexaResponse =
          'I do not have a pending review comment ready to post. Please first ask me to analyze a pull request, for example: "Analyze PR number 1 for bugs".';
      } else {
        alexaResponse = `I can help you with GitHub pull requests. Try saying: "Check open PRs", "Analyze PR number 1 for bugs", or after a review "Approve and post comment". Repository is set to ${req.owner}/${req.repo}.${accessToken ? '' : ' Sign in with GitHub to use your real repositories.'}`;
      }

      return {
        alexaResponse,
        toolUsed,
        debugPayload: {
          request: { utterance: req.utterance, mode: 'offline' },
          response: { text: alexaResponse },
          toolCalls: debugToolCalls,
        },
        requiresApproval,
        approvalPayload,
        isFallback,
      };
    })();
  }

  private safeParse(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
}

export const llmHandler = new LLMHandler();
