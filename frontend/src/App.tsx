import React, { useState, useEffect, useCallback } from 'react';
import { Github, Zap, Shield, Activity, LogOut, ChevronDown, Lock, Loader2 } from 'lucide-react';
import AlexaSimulator from './components/AlexaSimulator';
import McpInspector, { InspectorEntry } from './components/McpInspector';

import { API_BASE, apiUrl } from './config';

interface RepoConfig {
  owner: string;
  repo: string;
}

interface RepoSummary {
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

interface AvailablePullRequest {
  number: number;
  title: string;
}

interface AuthUser {
  id: string;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  requiresApproval?: boolean;
  isFallback?: boolean;
}

interface PendingApproval {
  tool: string;
  arguments: Record<string, unknown>;
  draftComment: string;
}

function loadRepoConfig(): RepoConfig {
  try {
    const raw = localStorage.getItem('codesync_repo');
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { owner: 'octocat', repo: 'Hello-World' };
}

function saveRepoConfig(cfg: RepoConfig) {
  localStorage.setItem('codesync_repo', JSON.stringify(cfg));
}

export default function App() {
  const [repo, setRepo] = useState<RepoConfig>(loadRepoConfig);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content:
        'Welcome to CodeSync AI. Sign in with GitHub to review your real repositories, or try the demo with offline mocks. I list open PRs, analyze diffs, and post review comments only after your explicit approval.',
      timestamp: new Date(),
    },
  ]);
  const [inspectorEntries, setInspectorEntries] = useState<InspectorEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);

  // Auth state
  const [user, setUser] = useState<AuthUser | null>(null);
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [availablePullRequests, setAvailablePullRequests] = useState<AvailablePullRequest[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');

  useEffect(() => {
    saveRepoConfig(repo);
  }, [repo]);

  // Fetch current session on mount + after OAuth redirect
  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      setAuthLoading(true);
      try {
        const res = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' });
        const data = await res.json();
        if (cancelled) return;
        setOauthConfigured(!!data.oauthConfigured);
        if (data.authenticated && data.user) {
          setUser(data.user);
          setRepos(data.repos || []);
          // Auto-select first repo if still on defaults
          if (data.repos?.length && repo.owner === 'octocat' && repo.repo === 'Hello-World') {
            const first = data.repos[0];
            setRepo({ owner: first.owner, repo: first.name });
          }
        } else {
          setUser(null);
          setRepos([]);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setRepos([]);
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }
    loadMe();

    // Clean OAuth query params from URL
    const params = new URLSearchParams(window.location.search);
    if (params.has('auth') || params.has('auth_error')) {
      const err = params.get('auth_error');
      if (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `sys-auth-${Date.now()}`,
            role: 'system',
            content: `GitHub sign-in failed (${err}). You can still use offline demo mode.`,
            timestamp: new Date(),
          },
        ]);
      }
      window.history.replaceState({}, '', window.location.pathname);
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = () => {
    // Full-page redirect to backend OAuth start
    window.location.href = apiUrl('/api/auth/github');
  };

  const handleLogout = async () => {
    try {
      await fetch(apiUrl('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      /* ignore */
    }
    setUser(null);
    setRepos([]);
    setMessages((prev) => [
      ...prev,
      {
        id: `sys-logout-${Date.now()}`,
        role: 'system',
        content: 'Signed out. Offline demo mode is still available.',
        timestamp: new Date(),
      },
    ]);
  };

  const selectRepo = (r: RepoSummary) => {
    setRepo({ owner: r.owner, repo: r.name });
    setAvailablePullRequests([]);
    setRepoDropdownOpen(false);
    setRepoSearch('');
  };

  const filteredRepos = repos.filter((r) => {
    if (!repoSearch.trim()) return true;
    const q = repoSearch.toLowerCase();
    return (
      r.full_name.toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      (r.language || '').toLowerCase().includes(q)
    );
  });

  const addInspectorEntry = useCallback((entry: Omit<InspectorEntry, 'id' | 'timestamp'>) => {
    setInspectorEntries((prev) =>
      [
        {
          ...entry,
          id: `insp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date(),
        },
        ...prev,
      ].slice(0, 50)
    );
  }, []);

  const processUtterance = useCallback(
    async (utterance: string, approve = false) => {
      if (!utterance.trim() && !approve) return;
      setIsProcessing(true);

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: approve ? 'Yes, approve and post the comment.' : utterance,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const requestBody = {
        utterance: approve ? 'approve' : utterance,
        owner: repo.owner,
        repo: repo.repo,
        approve,
        pendingApproval: approve ? pendingApproval : null,
        conversationHistory: messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-8)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      };

      addInspectorEntry({
        type: 'request',
        method: 'POST /api/alexa/process',
        status: 'pending',
        payload: requestBody,
        durationMs: 0,
      });

      const start = Date.now();
      try {
        const res = await fetch(apiUrl('/api/alexa/process'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(requestBody),
        });
        const data = await res.json();

        const prsToolCall = data.debugPayload?.toolCalls?.find(
          (tc: any) => tc.name === 'github_get_open_prs'
        );
        if (prsToolCall) {
          const resultText = prsToolCall.result?.content?.[0]?.text;
          try {
            const parsed = typeof resultText === 'string' ? JSON.parse(resultText) : resultText;
            const items = Array.isArray(parsed?.pullRequests) ? parsed.pullRequests : [];
            setAvailablePullRequests(
              items
                .map((pr: any) => ({
                  number: Number(pr.number),
                  title: String(pr.title || `PR #${pr.number}`),
                }))
                .filter((pr: AvailablePullRequest) => Number.isInteger(pr.number) && pr.number > 0)
            );
          } catch {
            setAvailablePullRequests([]);
          }
        }
        const durationMs = Date.now() - start;

        addInspectorEntry({
          type: 'response',
          method: 'POST /api/alexa/process',
          status: res.ok ? 'success' : 'error',
          payload: data,
          durationMs,
          toolUsed: data.toolUsed,
        });

        if (data.debugPayload?.toolCalls?.length) {
          for (const tc of data.debugPayload.toolCalls) {
            addInspectorEntry({
              type: 'tool',
              method: tc.name,
              status: tc.result?.isError ? 'error' : 'success',
              payload: {
                arguments: tc.arguments,
                result: tc.result,
              },
              durationMs: tc.durationMs || 0,
              toolUsed: tc.name,
            });
          }
        }

        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.alexaResponse || 'No response received.',
          timestamp: new Date(),
          requiresApproval: data.requiresApproval,
          isFallback: data.isFallback,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        if (data.requiresApproval && data.approvalPayload) {
          setPendingApproval(data.approvalPayload);
        } else if (approve) {
          setPendingApproval(null);
        }
      } catch (err) {
        const durationMs = Date.now() - start;
        const message = err instanceof Error ? err.message : 'Network error';
        addInspectorEntry({
          type: 'response',
          method: 'POST /api/alexa/process',
          status: 'error',
          payload: { error: message },
          durationMs,
        });
        setMessages((prev) => [
          ...prev,
          {
            id: `a-err-${Date.now()}`,
            role: 'assistant',
            content: `I couldn't reach the backend (${message}). Make sure the server is running on port 5000.`,
            timestamp: new Date(),
            isFallback: true,
          },
        ]);
      } finally {
        setIsProcessing(false);
      }
    },
    [repo, messages, pendingApproval, addInspectorEntry]
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">
      {/* Top Navigation */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/40">
            <Zap className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">CodeSync AI</h1>
            <p className="text-xs text-slate-400">Alexa+ MCP · Zero-config GitHub OAuth</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            No user PATs
          </span>
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
            <Activity className="w-3.5 h-3.5 text-alexa-blue" />
            HITL writes
          </span>

          {authLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 px-3 py-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Checking session…
            </div>
          ) : user ? (
            <div className="flex items-center gap-2">
              <img
                src={user.avatarUrl}
                alt={user.login}
                className="w-7 h-7 rounded-full border border-slate-600"
              />
              <span className="text-sm text-slate-200 hidden sm:inline">{user.login}</span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-red-300 hover:border-red-500/40 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              disabled={!oauthConfigured && API_BASE === undefined}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-900 text-sm font-medium hover:bg-white transition-colors disabled:opacity-50"
              title={
                oauthConfigured
                  ? 'Sign in with GitHub'
                  : 'Configure GITHUB_CLIENT_ID / SECRET on the server, or use offline demo'
              }
            >
              <Github className="w-4 h-4" />
              Sign in with GitHub
            </button>
          )}
        </div>
      </header>

      {/* Repository selector bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 bg-slate-900/40 relative z-20">
        <Github className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="text-xs text-slate-500 shrink-0">Repository</span>

        {user && repos.length > 0 ? (
          <div className="relative flex-1 max-w-md">
            <button
              type="button"
              onClick={() => setRepoDropdownOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm hover:border-indigo-500/50 transition-colors"
            >
              <span className="font-mono text-indigo-300 truncate">
                {repo.owner}/{repo.repo}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                  repoDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {repoDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setRepoDropdownOpen(false)} />
                <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-slate-800">
                    <input
                      type="text"
                      value={repoSearch}
                      onChange={(e) => setRepoSearch(e.target.value)}
                      placeholder="Search repositories…"
                      autoFocus
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto inspector-scroll">
                    {filteredRepos.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-slate-500 text-center">No matching repos</p>
                    ) : (
                      filteredRepos.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => selectRepo(r)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-800 flex items-center gap-2 ${
                            r.owner === repo.owner && r.name === repo.repo ? 'bg-indigo-600/20' : ''
                          }`}
                        >
                          {r.private ? (
                            <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                          ) : (
                            <Github className="w-3 h-3 text-slate-500 shrink-0" />
                          )}
                          <span className="font-mono text-slate-200 truncate flex-1">{r.full_name}</span>
                          {r.language && (
                            <span className="text-[10px] text-slate-500 shrink-0">{r.language}</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <span className="font-mono text-sm text-indigo-300/80">
              {repo.owner}/{repo.repo}
            </span>
            {!user && (
              <span className="text-[11px] text-slate-500">
                (demo defaults — sign in for your repos)
              </span>
            )}
          </div>
        )}

        <span className="ml-auto text-xs text-slate-500 hidden md:inline">
          {user ? (
            <>
              <span className="text-emerald-400">●</span> Authenticated · token in HTTP-only session
            </>
          ) : (
            <>
              <span className="text-amber-400">●</span> Guest · offline mocks available
            </>
          )}
        </span>
      </div>

      {/* Split View */}
      <div className="flex-1 flex min-h-0">
        <div className="w-[60%] border-r border-slate-800 flex flex-col min-h-0">
          <AlexaSimulator
            availablePullRequests={availablePullRequests}
            messages={messages}
            isProcessing={isProcessing}
            onSend={processUtterance}
            pendingApproval={pendingApproval}
          />
        </div>
        <div className="w-[40%] flex flex-col min-h-0 bg-slate-950">
          <McpInspector entries={inspectorEntries} onClear={() => setInspectorEntries([])} />
        </div>
      </div>
    </div>
  );
}
