# Hackathon Submission Draft — CodeSync AI

## Project title
**CodeSync AI: Voice-first PR Guardian for Alexa+**

## One-line pitch
A simulated Alexa+ developer assistant that reviews real GitHub pull-request changes, explains first-pass risks, and drafts a review comment that never gets posted without explicit human approval.

## Problem
Open-source maintainers and small engineering teams repeatedly switch between GitHub, terminals, and chat tools to triage pull requests. Voice interfaces can help with hands-free access, but a voice-triggered write to a code repository must remain observable and controlled.

## Solution
CodeSync AI combines a conversational web simulator with per-user GitHub OAuth, a constrained set of real GitHub operations, deterministic rule-based checks on changed lines, and an inspector that makes each tool operation visible. It lists actual open PRs, fetches actual changed-file patches, flags suspicious patterns, and drafts a human-readable review comment. The comment is posted only after a user explicitly approves.

## Why it's different
- Voice/text input is connected to a bounded multi-step workflow rather than a single-turn answer.
- The analysis starts from real PR diffs; failed GitHub requests are not converted into fake successful results.
- Deterministic findings are visible and repeatable; AI can add a conversational layer when the provider is available.
- GitHub writes are gated by an explicit user action, which fits the higher-risk nature of public code-review comments.
- The inspector shows the work, not just the answer.

## Track and scope
**Primary track:** Alexa+ — browser-based simulated experience.

This submission uses the documented web-simulation path. It does not claim access to partner-only Alexa+ add-on tooling or claim that a production Streamable HTTP MCP host is included. The supported workflow is intentionally narrow: list open PRs, analyze an actual PR diff, draft a review comment, and post it after approval.

## Tech implementation
- React, Vite, TypeScript, Tailwind CSS
- Node.js, Express, TypeScript
- GitHub OAuth and REST API
- Gemini API for free-form tool orchestration when available
- Deterministic rule-based analysis on actual changed lines
- Visible tool-execution inspector

## Responsible behavior
- OAuth tokens and API keys remain server-side.
- A user sees a draft before any public comment is posted.
- Invalid/nonexistent PRs and API failures show errors rather than simulated success.
- Static warnings are review signals, not guaranteed vulnerability diagnoses.

## Known limitations
- Not a general-purpose coding agent; it does not arbitrarily edit repository files, create commits, or merge PRs.
- Model availability can be affected by upstream errors.
- Rule-based static checks can produce false positives or miss issues.
- Production deployment requires durable session storage and a security review.

## Demo flow
1. Sign in and select a repository.
2. List actual open PRs.
3. Analyze an actual PR's changed files.
4. Review the findings and drafted comment.
5. Explicitly approve a comment on a test PR.
6. Show the inspector and explain the human-approval boundary.

## Submission checklist
- [ ] Public GitHub repository with an open-source LICENSE
- [ ] Public English demo video under 3 minutes
- [ ] Short written description and architecture
- [ ] Product feedback for each developer tool/API used
- [ ] Friction log with task, expected/actual behavior, severity, workaround, and suggestion
- [ ] Clear note about work completed during the hackathon window
- [ ] Test instructions that do not expose secrets
