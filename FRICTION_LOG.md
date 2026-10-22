# Friction Log — Amazon Developer Hackathon 2026

These entries record development friction encountered while building and testing CodeSync AI. They are product feedback, not claims that every tool fails in every environment.

## 1. Finding the correct Alexa+ development path

- **Task attempted:** Build an Alexa+-style developer workflow for the hackathon.
- **Steps:** Read the Alexa+ track requirements, looked for public access to the add-on SDK, MCP Toolkit, CLI, and Web Simulator, then built a browser-based simulated experience.
- **Expected:** The tools mentioned in the track overview would have a clear public onboarding path for registered participants.
- **Actual:** The official FAQ says these preview tools are available only to selected partners and there is no general application path. The documented web-simulation route was the actionable path.
- **Severity:** High.
- **Workaround:** Use a browser-based Alexa+ simulator and make the voice/text workflow, real tool results, and explicit write approval visible.
- **Actionable suggestion:** Put the public simulation route at the top of Alexa+ hackathon setup docs and provide a tested starter that does not require partner access.

## 2. Gemini provider returned HTTP 503 during a live workflow

- **Task attempted:** Ask CodeSync to list or analyze a pull request using natural language.
- **Steps:** Start the local app with a configured Gemini API key and submit a supported PR command.
- **Expected:** A transient model-capacity problem would be retried and would not prevent deterministic GitHub operations.
- **Actual:** Gemini returned 503 Service Unavailable with a high-demand message; the earlier implementation switched to demo behavior, which made live-vs-demo status confusing.
- **Severity:** High for a live demo.
- **Workaround:** Add bounded retries, route common GitHub commands through deterministic handlers, and never use failed GitHub requests to fabricate PRs, diffs, or successful comments.
- **Actionable suggestion:** Include a reference policy for retries, provider outage messaging, and separation between model failure and tool/API failure.

## 3. GitHub PR errors were obscured by mock data

- **Task attempted:** Analyze PR #2 in a selected repository.
- **Steps:** Select a repository, fetch its open-PR list, then try analyzing a PR number.
- **Expected:** If that repository had no such PR or permissions were insufficient, the app would show a clear GitHub error.
- **Actual:** The earlier code substituted hard-coded mock PR diffs and could simulate comment success, making results look real even when GitHub returned 404.
- **Severity:** Critical for trust and judge verification.
- **Workaround:** Remove mock fallbacks from production service paths; propagate GitHub 401/403/404/rate-limit errors; generate analyze buttons only for actual PRs returned by GitHub.
- **Actionable suggestion:** Samples should make simulated data visually unmistakable and should never return simulated write success from a live integration path.

## 4. GitHub OAuth callback mismatch

- **Task attempted:** Sign in to the local simulator using GitHub OAuth.
- **Steps:** Configure the OAuth App homepage and callback URL, then complete login.
- **Expected:** The configured callback would accept the redirect.
- **Actual:** GitHub showed “redirect_uri is not associated with this application” until the callback URL matched the actual local backend callback exactly.
- **Severity:** Medium.
- **Workaround:** Use a dedicated local OAuth App and document the exact local homepage/callback pair; configure production callbacks separately.
- **Actionable suggestion:** Provide a short callback matrix for local development, preview deployments, and production.

## 5. Cloudflare Workers Node compatibility required extra diagnosis

- **Task attempted:** Evaluate a no-cold-start deployment path for the Express app.
- **Steps:** Start Wrangler, enable Node compatibility, and test the Express/session dependencies.
- **Expected:** A Node-oriented backend would either run or return a precise compatibility error.
- **Actual:** The Cloudflare entrypoint type, compatibility-date mismatch, Node built-in module resolution, an iconv-lite browser-mapping issue, and a global-scope timer from express-rate-limit each required separate workarounds.
- **Severity:** High during deployment exploration.
- **Workaround:** Upgrade the local Node/Wrangler toolchain, enable nodejs_compat, keep timers out of Worker global initialization, and verify dependency compatibility before deploying.
- **Actionable suggestion:** Publish a maintained compatibility table and an end-to-end Express + OAuth + session sample for the supported Workers runtime.

## Submission context

The app deliberately uses the Alexa+ web-simulation path. It does not claim that a production Alexa+ add-on or Streamable HTTP MCP host is already live.
