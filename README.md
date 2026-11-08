# Get In Tune Hub

Marlys's app for running Get In Tune: email, calendar, tasks, clients and a daily brief in one place, with Claude
built in. It runs on her Mac and opens in her browser at http://127.0.0.1:4317. Nothing is put online.

It started as a copy of Keystone (Hunter's app for Forefront Building + Restoration) and is being turned into
Marlys's own app step by step with Claude Code. **PLAN.md** has the plan and what's done; **CLAUDE.md** has how it's
built and the house rules.

## On your Mac

Follow **SETUP-ON-MAC.md** once (about 45 minutes). After that, double-click **Get In Tune Hub** on your Desktop;
a Terminal window opens (keep it open while you use the app) and the app opens in your browser. Your lists,
settings and logins stay on your Mac and are never uploaded.

## For Claude Code

- `npm install`, then `npm test` and `npm run typecheck` (both must pass before every push).
- `HUB_MODE=mock npm run app` runs the whole app on practice data, with no accounts connected.
