# Get In Tune Hub: notes for Claude

You're working with **Marlys**, owner of **Get In Tune**. She is not a developer: explain what you did and what
she needs to do in plain words, short, with exact clicks and steps. Ask her before anything that changes an outside
system (her email, calendar, booking or payment apps) or that she'd have trouble undoing.

## What this is

Her own desktop app for running her business, with Claude built in. It started as a copy of **Keystone**, an app
her husband Hunter uses for reconstruction estimating at Forefront Building + Restoration. **PLAN.md** is the plan
for turning that copy into her app: read it first, and keep it up to date (tick off steps, add what you learn
about her business). Until a step is done, Forefront-specific code (Homebase, estimating, CompanyCam,
DocuSketch, adjusters, Hunter's name) is still in the code: replace or remove it as PLAN.md says, don't build on it.

## How it's built

- TypeScript (ESM, Node 22), run with `tsx`. `npm test` (vitest) and `npm run typecheck` must pass before every
  push. Add or update tests with every change.
- A local web server (`src/server/main.ts`) and one page (`src/server/ui.html`) opened in her browser at
  http://127.0.0.1:4317. `npm run app` starts it; on her Mac, `Start Get In Tune Hub.command` (the Desktop icon) does that for her.
- Every outside system lives in `src/connectors/<name>` behind a small interface **with a mock**, so the whole
  app runs with no accounts connected (`HUB_MODE=mock`). Nothing outside a connector talks to a live service
  directly; everything goes through the `Hub` object from `makeHub()` (`src/hub.ts`).
- The app's own agent runs on **Google Gemini** (`@google/genai`), through the `src/connectors/gemini` connector
  (`hub.gemini`, with a scripted `MockGemini` for tests). `src/agent/run.ts` is the function-calling loop over the
  tools in `src/agent/tools.ts` (zod schemas → Gemini function declarations). Key: `GEMINI_API_KEY` in `.env`;
  `src/agent/env.ts` says where requests go.

## Rules

- **Email is drafts-only for the agent** (Gemini, or Claude through the handoff). It makes Gmail drafts; only
  Marlys sends, by pressing Send and confirming. Never give the agent a send tool.
- **Writes to outside systems ask first** through `hub.approver.confirm` (a Yes/No card in the app).
- **Secrets never go in GitHub:** keys and logins live in `.env` and `auth/` on her computer (both git-ignored).
- **No real client data in the repo.** Test data in `fixtures/` is made up.
- **The app's agent runs on Google Gemini's free tier (her choice, 2026-11-09):** `GEMINI_API_KEY` in `.env`,
  default model `gemini-3.5-flash` (`gemini-3.5-flash-lite` for routine work; if Google retires a model the app switches to the replacement on its own). Runs are $0.00 and the meter counts
  runs and tokens. On the free tier Google may use what's sent to improve its products, so: Grow Therapy email
  and therapy clients' notes never go to Gemini, client sessions on her calendar go only as "Client session",
  and background features (summaries, tasks from email, morning brief) start off. Don't route the app through
  her Claude subscription, a ChatGPT router or any other workaround.
- **Without a Gemini key** every agent button is "Do this in Claude": the app writes the request
  (`src/workflows/handoff.ts`) and opens it in her own Claude app (claude.ai/new?q=..., also copied), covered by
  her subscription. New agent features need a handoff version too.
- Keep it simple. Prefer small, working steps she can try over big rewrites.
