# CodeSync AI — Demo Script (target: 2:30–2:50)

**Record only after a fresh local build and an end-to-end test.** Use a repository you control and an open PR with safe, reviewable changes. Do not rely on mock/demo content. If the selected repository has zero open PRs, choose a different repo or create a small test PR before recording.

## 0:00–0:20 — Hook

**Show:** CodeSync AI, signed in with GitHub, repository dropdown, tool inspector.

**Say:** “PR review is fragmented across GitHub, terminal and chat. CodeSync AI is a voice-first Alexa+ simulation for the first-pass review workflow: it reads real PR changes, flags suspicious patterns, and asks before writing anything.”

## 0:20–0:45 — Authenticate and choose a repository

**Show:** GitHub account and repository selector.

**Say:** “The repository list comes from the signed-in GitHub account. The app uses the current user's server-side OAuth session; it does not ask the user to paste a personal access token into the browser.”

Do not reveal cookies, tokens, or private repository data in the recording.

## 0:45–1:05 — List actual pull requests

**Say/type:** “Alexa, check open PRs.”

**Show:** The actual PR list and corresponding tool entry in the inspector.

**Say:** “These PRs are fetched from GitHub. If a repository has no open PRs, CodeSync reports an empty list rather than inventing examples.”

## 1:05–1:45 — Analyze one actual PR

**Action:** Click the dynamic Analyze PR button for a PR that was returned, or type its actual PR number.

**Show:** Real changed-file patches, static findings, and inspector timing.

**Say:** “The analyzer runs deterministic rules against changed lines. These findings are review signals, not an automatic verdict. A provider outage does not turn a failed GitHub request into fake code.”

## 1:45–2:15 — Human approval before a write

**Show:** The drafted review comment and the approval control.

**Say:** “CodeSync drafts the review comment first. It does not post until the user explicitly approves.”

Only click **Approve & post** if you are willing to publish that comment on the selected PR. Use your own test PR for the recording.

## 2:15–2:40 — Impact and close

**Show:** The inspector containing the sequence of real operations.

**Say:** “CodeSync focuses on a repeatable maintainer workflow: real repository context, explainable first-pass checks, visibility into tool activity, and a human decision before a public write. It's a simulated Alexa+ experience with clear current limits, not a claim that it edits arbitrary repositories.”

## Recording checklist

- Keep the video under three minutes; publish it publicly on YouTube or Vimeo in English.
- Show the app actually functioning; include a real GitHub request and response.
- Pick a PR with changes and permissions you control.
- Never expose OAuth codes, cookies, API keys, private source, or secrets.
- Do not say an MCP protocol server is live unless you have independently tested a Streamable HTTP MCP endpoint.
