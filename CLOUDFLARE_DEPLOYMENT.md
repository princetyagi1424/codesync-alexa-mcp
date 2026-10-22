# Cloudflare Pages Preview Deployment

This repository is a monorepo. The current frontend is a Vite static site. The Express backend is still a separate Node.js service; this guide deploys a **preview of the frontend only** and does not claim that the backend has been migrated to Workers.

## Recommended safe rollout

- Keep the Cloudflare Pages production branch set to `main`.
- Use `hackathon/pr-review-reliability` as a preview branch.
- Do not merge PR #1 or change the Pages production branch as part of preview setup.
- The Express backend still uses in-memory sessions and the new approval store is process-local. Do not rely on this deployment for production write operations until durable sessions/approvals and live OAuth/comment smoke tests are complete.

## Create the Pages project

In the Cloudflare dashboard, open **Workers & Pages → Create → Pages → Connect to Git** and select `princetyagi1424/codesync-alexa-mcp`.

Build configuration:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Production branch | `main` |
| Root directory | `frontend` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version | 22 |

Enable preview deployments for non-production branches. Cloudflare Pages will provide a `.pages.dev` URL for the feature branch. The first deployment requires an account owner to authorize the GitHub integration.

## Frontend environment variable

Add this variable to **Preview** (not Production, until the preview is tested):

- `VITE_API_URL`: the HTTPS origin of the backend that is actually running the matching approval-ID API. Do not include `/api` at the end. This variable is embedded into client-side JavaScript, so it must be a public URL, never a secret.

The source currently contains a legacy fallback API origin. Explicitly configure `VITE_API_URL` in Cloudflare instead of assuming that legacy endpoint is reachable or current.

## Backend and OAuth must be aligned

Once Cloudflare assigns the preview URL, configure the existing backend host with:

- `FRONTEND_URL`: exact frontend preview origin, for example `https://<project>.pages.dev`
- `CORS_ORIGINS`: include that exact preview origin
- `GITHUB_CALLBACK_URL`: the backend HTTPS origin plus `/api/auth/github/callback`
- `NODE_ENV=production`
- `SESSION_SECRET`: a long random value
- Existing server-side `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GEMINI_API_KEY` values

Update the GitHub OAuth App's **Authorization callback URL** to the backend callback URL—not the Pages frontend URL. Never put OAuth client secrets or Gemini keys in `VITE_*` variables.

## Smoke-test checklist

1. Open the Cloudflare preview URL and verify the UI loads.
2. Check browser DevTools network requests; confirm `/api/auth/me` calls the configured backend, not localhost or a stale host.
3. Sign in with GitHub and verify session persistence after refresh.
4. List real repositories and open PRs; an empty list is valid.
5. Analyze a real PR using its explicit number.
6. Verify the pending review payload contains an opaque approval ID only, not client-editable write arguments.
7. Verify a missing, expired, reused, or wrong-session approval cannot post a comment.
8. Verify GitHub accepts a comment only after deliberate user approval.

## What this does not do

- This does not deploy the Express backend to Cloudflare Workers.
- This does not provide a durable session or approval store.
- This does not establish that the existing backend URL is live.
- This does not merge the feature PR or deploy to the Pages production branch.
