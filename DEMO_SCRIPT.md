# CodeSync AI — Demo Script (≈ 2 min 30 sec)

**Target length:** 2:20–2:40  
**Recording tips:** Full-screen browser at 1920×1080, backend + frontend already running, MCP Inspector visible, speak clearly and slightly slower than normal conversation.

---

## [0:00 – 0:18] Hook & Problem

**Visual:** Landing on the CodeSync AI UI. Camera/screen shows the split view (Alexa Simulator left, MCP Inspector right). Light ring is idle.

**Spoken:**
> "Developers waste hours switching between GitHub, terminal, and chat tools just to review a pull request. What if you could simply *say* what you need — and an AI that speaks MCP does the rest, safely?"

---

## [0:18 – 0:35] Introducing CodeSync AI

**Visual:** Point at the header badge "Zero frontend secrets" and "Human-in-the-loop writes". Briefly highlight the repository config bar.

**Spoken:**
> "Meet CodeSync AI — a self-hosted TypeScript MCP server paired with an Alexa+ web simulator. Secrets never leave the backend. Every write to GitHub requires your explicit approval."

---

## [0:35 – 0:55] Step 1 — List open PRs

**Visual:** Click the quick-action button **"Check open PRs"**.  
Watch the Alexa light ring pulse.  
Chat shows the list of PRs.  
MCP Inspector populates with a `github_get_open_prs` tool call and JSON payload.

**Spoken:**
> "Alexa, check open PRs.  
> Instantly the MCP tool `github_get_open_prs` fires. You can see the live JSON-RPC style payload in the inspector — proof the protocol is real. Three open pull requests appear."

---

## [0:55 – 1:35] Step 2 — Analyze a PR (static rules + AI)

**Visual:** Click **"Analyze PR #1"**.  
Ring pulses again.  
Chat returns findings (hardcoded secret, console.log, raw SQL).  
Inspector shows `github_get_pr_diff` with staticAnalysis score and findings.  
A draft review comment is prepared; UI marks "needs approval".

**Spoken:**
> "Now: Analyze PR number 1 for bugs.  
> CodeSync fetches the diff, then runs a *deterministic* static engine — catching hardcoded secrets, leftover console.logs, and raw SQL concatenation — before Gemini adds conversational insight.  
> Notice it does *not* post anything. Instead it asks: 'Should I post this review comment to GitHub?' That is the human-in-the-loop guarantee."

---

## [1:35 – 2:05] Step 3 — Human approval & write

**Visual:** Click **"Approve & post"**.  
Inspector shows `github_post_comment` executing.  
Chat confirms the comment was posted (or simulated in fallback mode).  
Highlight the success entry in the inspector.

**Spoken:**
> "I say yes — approve and post comment.  
> Only now does the write tool execute. The inspector records the exact payload and timing. If GitHub or Gemini had been unavailable, the resilient fallback mocks would have kept the demo alive — zero broken recordings."

---

## [2:05 – 2:30] Closing & Why it wins

**Visual:** Zoom out to full UI. Quickly scroll the inspector to show the complete chain of tool calls. End on the architecture badges.

**Spoken:**
> "CodeSync AI proves that MCP, Alexa+, and strict security can ship together: zero keys in the frontend, deterministic static analysis, live protocol visibility, and human approval before every mutation.  
> That's production-ready developer experience for the Alexa+ era.  
> Thank you."

---

## Optional one-liners if time remains

- "All of this runs with or without real API keys — offline mocks make judging frictionless."
- "The same MCP tools can later be registered with any MCP-compatible host, including future Alexa+ skills."
