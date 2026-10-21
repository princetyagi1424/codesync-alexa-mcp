# Developer Experience Feedback — Amazon Developer / Alexa+ MCP Team

**Submission:** CodeSync AI  
**Track:** Alexa+  
**Hackathon:** Amazon Developer Hackathon 2026  
**Date:** October 2026

---

## What worked well

1. **MCP tool schema clarity**  
   Defining tools with explicit `inputSchema` and descriptions made the Gemini function-calling loop straightforward. The separation between tool *declaration* and tool *dispatch* kept the backend readable and testable.

2. **Local-first resilience**  
   Building offline mocks from day one meant we could iterate on the full UX (including the approval flow) without burning API quota or waiting on network conditions. This pattern should be encouraged in official Alexa+ MCP samples.

3. **Human-in-the-loop as a first-class concept**  
   Treating write tools as "draft → confirm → execute" rather than fire-and-forget felt natural for voice. The UI and the LLM system prompt reinforced the same contract, which reduced accidental mutations during testing.

---

## Friction points & suggestions

1. **Documentation gap: voice-to-MCP mapping**  
   Official guides focus on skill manifests and SSML. A short reference on mapping spoken intents → MCP tool selection (including multi-turn confirmation) would accelerate teams building conversational developer tools.

2. **Inspector / observability**  
   We built a live JSON payload drawer because there was no standard "MCP traffic viewer" for web simulators. A lightweight, embeddable inspector component or browser extension from the Alexa+ team would help every hackathon project prove authenticity.

3. **Secret handling guidance**  
   Clearer sample patterns for "keys never leave the backend" (especially when a web simulator is involved) would prevent common mistakes. Our architecture enforces this strictly; making it the default template would raise the quality bar.

4. **Rate-limit & fallback ergonomics**  
   Gemini and GitHub both rate-limit under demo load. First-class support for declarative fallback responses inside MCP tool results (e.g., an `isFallback` flag in the protocol) would make resilient demos easier to standardize.

5. **TypeScript MCP SDK maturity**  
   The SDK is usable, but richer TypeScript generics for tool input/output would reduce boilerplate and catch schema drift at compile time.

---

## One thing we hope Alexa+ ships next

A **hosted MCP bridge** that lets a developer register a self-hosted TypeScript MCP server once and immediately invoke its tools from both the Alexa mobile app and the Echo device, with the same human-approval semantics we implemented here.

---

Thank you for creating a track that rewards real architecture and security discipline. We enjoyed building CodeSync AI.
