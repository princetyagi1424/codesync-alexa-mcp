# CodeSync AI

**MCP-powered conversational developer assistant for the Alexa+ Track — Amazon Developer Hackathon 2026**

CodeSync AI bridges natural-language voice/text commands to secure GitHub repository actions via a self-hosted TypeScript MCP server, a React Alexa+ Web Simulator, a deterministic static code analyzer, and a live MCP Inspector panel.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite + Tailwind)                   │
│  ┌──────────────────────────────┐  ┌──────────────────────────────────┐ │
│  │   Alexa Simulator (60%)      │  │   MCP Live Inspector (40%)       │ │
│  │   • Echo Show frame          │  │   • JSON-RPC style payloads      │ │
│  │   • Chat + quick actions     │  │   • Tool timing & status         │ │
│  │   • Human-approval UI        │  │   • Zero secrets in bundle       │ │
│  └──────────────┬───────────────┘  └──────────────────────────────────┘ │
│                 │ POST /api/alexa/process                                │
└─────────────────┼───────────────────────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              Backend (Express + TypeScript + MCP SDK)                    │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────────────┐  │
│  │  llmHandler.ts │  │  mcpServer.ts   │  │  githubService.ts        │  │
│  │  Gemini +      │◄─┤  Tool schemas   │◄─┤  Axios + static rules    │  │
│  │  tool loop +   │  │  dispatchMCPTool│  │  secrets / console.log /  │  │
│  │  HITL guard    │  │                 │  │  raw SQL / try-catch     │  │
│  └────────────────┘  └─────────────────┘  └────────────┬─────────────┘  │
│                                                         │                │
│  Resilient fallback → local JSON mocks when APIs fail   │                │
└─────────────────────────────────────────────────────────┼────────────────┘
                                                          ▼
                                              GitHub REST API
                                              (PAT in .env only)
```

### End-to-End Workflow (enforced)

```
User Input
  → MCP Tool: github_get_open_prs
  → MCP Tool: github_get_pr_diff
  → Deterministic Static Bug Pattern Checker + Gemini analysis
  → Human Approval Prompt  ("Should I post this review comment to GitHub?")
  → MCP Tool: github_post_comment   ← NEVER auto-executed
```

---

## Non-Negotiable Security Rules

| Rule | Implementation |
|------|----------------|
| **Zero Frontend Key Exposure** | `GITHUB_TOKEN` and `GEMINI_API_KEY` live only in `backend/.env`. Frontend never receives them. |
| **Human-in-the-Loop Writes** | `github_post_comment` is blocked in the LLM tool loop. Approval requires explicit user confirmation. |
| **Resilient Fallback** | Any GitHub or Gemini failure switches to pre-cached mocks so demos never break. |
| **Deterministic Static Engine** | Pattern matcher in `githubService.ts` detects secrets, `console.log`, raw SQL, missing try-catch. |

---

## Tech Stack

- **Backend:** Node.js, Express, TypeScript, Axios, `@google/generative-ai`, `@modelcontextprotocol/sdk`
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide React

---

## API Specs

### `GET /api/health`
Returns service status, configured tools, and whether secrets are present (booleans only).

### `GET /api/mcp/tools`
Lists the three MCP tool schemas.

### `POST /api/alexa/process`

**Request body:**
```json
{
  "utterance": "Analyze PR #1 for bugs",
  "owner": "octocat",
  "repo": "Hello-World",
  "approve": false,
  "pendingApproval": null,
  "conversationHistory": []
}
```

**Response:**
```json
{
  "alexaResponse": "I've analyzed pull request number 1. ... Should I post this review comment to GitHub?",
  "toolUsed": "github_get_pr_diff",
  "debugPayload": {
    "request": {},
    "response": {},
    "toolCalls": [
      {
        "name": "github_get_pr_diff",
        "arguments": {},
        "result": {},
        "durationMs": 42
      }
    ]
  },
  "requiresApproval": true,
  "approvalPayload": {
    "tool": "github_post_comment",
    "arguments": { "owner": "...", "repo": "...", "pullNumber": 1, "commentBody": "..." },
    "draftComment": "..."
  },
  "isFallback": false
}
```

---

## Quick Start

### Prerequisites
- Node.js ≥ 18
- (Optional) GitHub Personal Access Token with `repo` scope
- (Optional) Google AI Studio Gemini API key

### 1. Clone & configure
```bash
cd CodeSync-AI
cp backend/.env.example backend/.env
# Edit backend/.env and add GITHUB_TOKEN / GEMINI_API_KEY if you have them
# Without keys the app runs fully in offline demo mode
```

### 2. One-command setup & launch
```bash
chmod +x setup.sh
./setup.sh
```

Or manually:
```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (new terminal)
cd frontend && npm install && npm run dev
```

- Backend: http://localhost:5000  
- Frontend: http://localhost:5173  

### 3. Demo flow
1. Open the simulator.
2. Click **Check open PRs** (or say the equivalent).
3. Click **Analyze PR #1**.
4. Review the drafted comment and the MCP Inspector payloads.
5. Click **Approve & post** — only then is `github_post_comment` executed.

---

## Project Structure

```
CodeSync-AI/
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── index.ts          # Express server
│       ├── llmHandler.ts     # Gemini + HITL tool loop
│       ├── mcpServer.ts      # MCP tool schemas & router
│       └── githubService.ts  # GitHub API + static analyzer + mocks
├── frontend/
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── index.css
│       └── components/
│           ├── AlexaSimulator.tsx
│           └── McpInspector.tsx
├── README.md
├── DEMO_SCRIPT.md
├── FEEDBACK.md
└── setup.sh
```

---

## MCP Tools

| Tool | Description | Write? |
|------|-------------|--------|
| `github_get_open_prs` | List open pull requests | No |
| `github_get_pr_diff` | Fetch diff + run static analysis | No |
| `github_post_comment` | Post review comment | **Yes — requires human approval** |

---

## License

MIT — built for the Amazon Developer Hackathon 2026 (Alexa+ Track).

---

## GitHub OAuth Setup (Production / Real Repos)

End users **never** create personal access tokens. They click **Sign in with GitHub**.

### 1. Create a GitHub OAuth App

1. Open https://github.com/settings/developers → **New OAuth App**
2. **Application name:** CodeSync AI
3. **Homepage URL:** `http://localhost:5173` (or your production frontend URL)
4. **Authorization callback URL:** `http://localhost:5000/api/auth/github/callback`
5. Copy **Client ID** and generate a **Client Secret**

### 2. Configure backend `.env`

```env
GITHUB_CLIENT_ID=Iv1.xxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxx
SESSION_SECRET=a-long-random-string
FRONTEND_URL=http://localhost:5173
GEMINI_API_KEY=your_server_side_gemini_key
```

### 3. Restart backend

```bash
cd backend
npm install
npm run dev
```

### Security notes

| Item | Behavior |
|------|----------|
| User GitHub token | Stored only in **HTTP-only server session** — never in localStorage or frontend JS |
| Gemini API key | Single **server-side master key**; users never see it |
| Rate limit | 20 requests / minute / authenticated user on `/api/alexa/process` |
| Write actions | Still require **human approval** before `github_post_comment` |
| No OAuth configured | App still runs in **offline demo mode** with mocks |

