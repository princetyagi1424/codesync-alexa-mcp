# CodeSync AI — Voice-first PR Guardian for Alexa+

CodeSync AI is a **browser-based Alexa+ simulation** for maintainers who want to triage GitHub pull requests through voice or text. It combines real per-user GitHub OAuth, a bounded pull-request workflow, deterministic static checks on real PR diffs, a visible tool-execution panel, and an explicit approval gate before writing a review comment.

> **Track honesty:** this submission uses the Alexa+ track's documented simulated-experience path. It is not claiming to be connected to an invite-only Alexa+ runtime, nor is the current code a production Streamable HTTP MCP host. The tool schemas and dispatch layer are used inside the web simulation.

## User workflow

1. Sign in with GitHub through OAuth.
2. Choose a repository the signed-in user can access.
3. Say or type **Check open PRs**. The app loads that repository's real open PRs.
4. Choose an actual PR number from the dynamically generated actions or type **Analyze PR number N for security issues**.
5. CodeSync fetches that PR's real changed-file patches and runs deterministic checks for likely secrets, risky SQL construction, debug logging, TODO markers, hard-coded URLs, and async error-handling patterns.
6. The app drafts a review comment. It **does not post automatically**. The user must explicitly approve the write.
7. The inspector shows request/tool results and timing so the user can see what actually happened.

## Why this is useful

Maintainers often switch between GitHub, a terminal, and chat just to triage a small pull request. CodeSync condenses the first review pass into a voice-friendly sequence while keeping write actions under human control. The goal is not to replace a human reviewer: deterministic findings are cues for review, not proof of a vulnerability.

## Implemented capabilities

- GitHub OAuth sign-in and repository list from the authenticated account.
- Real open-PR list and real changed-file patches using GitHub API requests.
- Deterministic static analysis over changed lines.
- Draft-first review comments with an explicit approval step.
- Live request/tool inspector for debugging and demo transparency.
- Direct handling of supported PR commands so a temporary Gemini 503 does not block basic GitHub workflows.
- Real API failures are shown as errors; the app no longer fabricates PRs, diffs, or successful comment URLs after failed requests.

## Current limits — important for judges

- The supported GitHub tool set is intentionally narrow: list open PRs, fetch/analyze a PR diff, and post a PR conversation comment after approval.
- It does **not** currently edit repository files, commit changes, create branches, merge PRs, or act as a general coding agent.
- Free-form intent understanding depends on the configured Gemini API and can be affected by provider rate limits or temporary service errors.
- Static analysis is rule-based and can produce false positives/negatives; it is not a substitute for a full security audit.
- The default Express session store is intended for local demos, not a multi-instance production service. A durable session store and deployment-specific security review are required before production use.
- No GitHub access token or Gemini key should be put in frontend code or committed to the repository.

## Tech stack

- React, Vite, TypeScript, Tailwind CSS
- Node.js, Express, TypeScript
- GitHub OAuth and REST API
- Gemini API for natural-language orchestration when available
- App-level tool schemas/dispatch and an inspector in the simulated Alexa+ experience

## Local development

### Prerequisites

- Node.js 22 or newer
- npm
- A GitHub OAuth App for local development
- A Gemini API key if you want free-form Gemini responses; common PR commands can still use the direct workflow path

### Configure the backend

From the repository root:

    cd backend
    npm install
    Copy-Item .env.example .env
    notepad .env

Set these values in backend/.env:

    PORT=5000
    NODE_ENV=development
    SESSION_SECRET=replace-with-a-long-random-value
    FRONTEND_URL=http://localhost:5173
    GITHUB_CLIENT_ID=your-oauth-client-id
    GITHUB_CLIENT_SECRET=your-oauth-client-secret
    GITHUB_CALLBACK_URL=http://localhost:5000/api/auth/github/callback
    GEMINI_API_KEY=your-gemini-api-key

Do not commit .env. Never paste secrets into issue reports, screenshots, or chat.

### GitHub OAuth local settings

In GitHub Developer Settings:

- Homepage URL: http://localhost:5173
- Authorization callback URL: http://localhost:5000/api/auth/github/callback

The callback configured in the backend must match the GitHub OAuth App exactly.

### Run locally

Terminal 1:

    cd backend
    npm run dev

Terminal 2:

    cd frontend
    npm install
    npm run dev

Open http://localhost:5173.

### Build checks

    npm run build --workspace=codesync-ai-backend
    npm run build --workspace=codesync-ai-frontend

## Demo & submission materials

- [Demo script](./DEMO_SCRIPT.md)
- [Developer feedback](./FEEDBACK.md)
- [Friction log](./FRICTION_LOG.md)
- [Hackathon submission draft](./HACKATHON_SUBMISSION.md)

## Safety behavior

- GitHub writes are gated behind explicit user approval in the conversational workflow.
- A failed GitHub request must not be presented as a successful operation.
- An empty open-PR list is a valid result; use actual PR numbers returned by GitHub.
- The inspector can contain repository metadata and code snippets. Do not include secrets or sensitive private-repository content in public recordings.
