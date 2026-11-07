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
  http://127.0.0.1:4317. `npm run app` starts it; the Windows `Start ... .bat` file does that for her.
- Every outside system lives in `src/connectors/<name>` behind a small interface **with a mock**, so the whole
  app runs with no accounts connected (`HUB_MODE=mock`). Nothing outside a connector talks to a live service
  directly; everything goes through the `Hub` object from `makeHub()` (`src/hub.ts`).
- Claude inside the app uses the Claude Agent SDK (`src/agent/`). Every call takes its environment from
  `claudeEnv()` in `src/agent/env.ts`.

## Rules

- **Email is drafts-only for Claude.** Claude makes Gmail drafts; only Marlys sends, by pressing Send and
  confirming. Never give Claude a send tool.
- **Writes to outside systems ask first** through `hub.approver.confirm` (a Yes/No card in the app).
- **Secrets never go in GitHub:** keys and logins live in `.env` and `auth/` on her computer (both git-ignored).
- **No real client data in the repo.** Test data in `fixtures/` is made up.
- **Claude inside the app runs on an Anthropic API key** (console.anthropic.com, billed to her, with a monthly
  spending cap). Anthropic's rules don't allow apps built on the Agent SDK to run on a Claude Pro/Max
  subscription, so don't wire it to her subscription. Her subscription is for Claude Code: you, changing the app.
  Keep the app's Claude costs low: the fast model for routine work, background features switchable off, and a
  cost meter (see PLAN.md).
- Keep it simple. Prefer small, working steps she can try over big rewrites.
