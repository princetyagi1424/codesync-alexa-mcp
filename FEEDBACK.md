# Developer Experience Feedback — Amazon Developer Hackathon 2026

**Project:** CodeSync AI — Voice-first PR Guardian  
**Primary track:** Alexa+ simulated web experience  
**Date:** October 2026

## Tools and what they were used for

- **Alexa+ track resources and documentation:** used to select the browser-based simulated-experience path and shape a conversational developer workflow.
- **React/Vite simulator:** provides the voice/text UI and visible tool-execution inspector.
- **GitHub OAuth and GitHub REST API:** authenticate the user, enumerate repositories, list open PRs, fetch changed-file patches, and post an approved PR conversation comment.
- **Gemini API:** provides free-form conversational tool orchestration when available. Supported GitHub commands have a direct deterministic path so basic operations can continue during a temporary model outage.
- **Node.js/Express/TypeScript:** server-side routing, OAuth callback, session handling, tool dispatch, and rule-based diff checks.

## What worked well

1. **A clear simulated-experience path:** a web UI was enough to prototype and show a conversational Alexa+-style developer workflow without claiming access to partner-only device tooling.
2. **Human-in-the-loop writes:** draft → review → explicit approval is a better default for a voice interface that can create public GitHub comments.
3. **Tool visibility:** an inspector with the actual operation, status, payload summary, and duration makes debugging and demos easier to understand.
4. **Per-user GitHub OAuth:** each signed-in user can act with their own GitHub access rather than sharing a browser-side personal token.

## What needs work / actionable friction

1. **Access to Alexa+ add-on tooling:** the public hackathon FAQ says the Category SDK, MCP Toolkit, CLI, and Web Simulator are in preview and available only to selected partners. The docs should surface the available public simulation route prominently so participants do not spend time looking for an unavailable sign-up flow.
2. **Tool traffic observability:** an official embeddable inspector for simulated Alexa+ tools—showing invocation, result/error, latency, and whether data was live or simulated—would make it easier to prove integration quality.
3. **Failure semantics:** model provider 503 responses should be documented with recommended retry/backoff and examples of how to keep non-AI deterministic actions working. The app should distinguish “AI unavailable” from “GitHub returned no PRs” and “a GitHub request failed.”
4. **OAuth callback onboarding:** a concise local/production callback matrix with exact examples would prevent redirect_uri mismatch errors.
5. **Server-side session guidance:** web-simulator examples should explicitly show a durable production session store, secure cookie configuration, and secret handling—not only local-development setup.

## Would I build with Amazon developer tools again?

**Yes, with a caveat.** The simulated Alexa+ path let us test an interaction design quickly. I would like to see broader public access to preview tools, a tested starter that works for hackathon participants, and an official observability component for tool calls.

## Feature requests

- **Critical:** publish a stable public Alexa+ simulation/MCP starter that runs from a fresh clone with minimal configuration.
- **Important:** provide a reference for multi-turn state and approval flows for write actions.
- **Important:** provide a standard inspector for real versus fallback tool results and provider errors.
- **Nice-to-have:** publish voice-first UX patterns for reviewing, confirming, and cancelling actions.
