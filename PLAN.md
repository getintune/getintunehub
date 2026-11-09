# Plan: from a copy of Keystone to Get In Tune Hub

This repo starts as a copy of Keystone (Hunter's estimating app for Forefront Building + Restoration). Work through
these steps in order with Marlys. Tick them off here as you go (`- [x]`), and write down what you learn about her
business under "About Get In Tune" so the next session knows it.

## About Get In Tune

Owner: Marlys. Fill in as you learn it:

### From her website (getintunemusictherapy.com, read 2026-11-07)

- **Who:** Marlys Woods, MS, LMFT, MT-BC: board-certified Music Therapist and licensed Marriage and Family
  Therapist. Founded Get In Tune in 2013. Business name: Get In Tune Inc. Phone 657-221-9461; public email
  info@getintunemusictherapy.com (she signs in as getintunemusictherapy@gmail.com). Website is on **Wix**.
- **Tagline:** "Therapy and Coaching for Life's Big Changes." Motto "Feel It... Face It... Freedom!"
- **Three kinds of customers** (the site's "What brings you here?"):
  1. **Individuals:** 1:1 *Embodied Transition Coaching* (3-month program, worldwide, for digital nomads, expats,
     slow travelers, professionals) and *Therapy* (only for people in California or Colorado; somatic,
     IFS-informed, creative arts). Every relationship starts with a **free consult** to decide coaching vs therapy.
     Also: group therapy for mental health and addiction recovery (has a **wait-list** and an interest form),
     the *Suddenly Untethered* workshop for nomads (next: Fri Nov 13, 2026, 10am MT), *In Tune DIY Music
     Therapy* self-study ($97), the *Finding Freedom Within* virtual summit (VIP package $47).
  2. **Therapists:** *Using Music in Mental Health Recovery* Training & Certification ($997, 5 live Zoom sessions,
     20+ CMTE credits, next cohort starts Aug 24, 2026); **Group Supervision** membership ($30/month, 1st Tuesday
     and 3rd Monday on Zoom, recorded); *Therapist-Led DIY Music Therapy* session plans ($297).
  3. **Treatment facilities:** contracted music therapy groups for addiction, eating-disorder and mental-health
     treatment centers (past/present sites in Orange County, Long Beach, LA, Denver, Colorado). Uses
     **subcontractor music therapists** who accept contracts by availability.
- **Payments seen on the site:** Wix checkout (PayPal / Stripe / Square appear in the page code; to confirm).
- **Time zone hint:** workshop listed in MT (Mountain Time).
- Socials: instagram.com/getintunemusictherapy, facebook.com/GetInTuneMusicTherapy.

### From Marlys (2026-11-07)

- What she does: sees individual therapy clients through **Grow Therapy** (most of her week); moving toward
  coaching but has no coaching clients yet. Right now also marketing the Nov 13 *Suddenly Untethered* workshop.
- Her word for the people/work she tracks: **a separate list for each program** (therapy clients, coaching
  clients, workshop sign-ups, certification trainees, supervision members, facilities, ...), not one big list.
  Lists confirmed 2026-11-08: therapy clients (Grow, initials only), coaching clients, workshop sign-ups,
  certification trainees, supervision members, treatment facilities.
- **Grow Therapy client emails matter most:** whenever Claude reads the info@ mailbox, any email about a Grow
  Therapy client must be pointed out to her (top of the daily brief).
- The stages a client goes through: nothing set yet. The coaching program's stages and intake will be built
  from a **Google Doc she already has** (ask her for it when we get there).
- Email: **work email is Microsoft (Outlook / Microsoft 365)**, info@getintunemusictherapy.com. Gmail
  (getintunemusictherapy@gmail.com) is only her Google account for Google Docs/Drive. So the Gmail tab must
  become an **Outlook** tab (Microsoft Graph connector, drafts-only for Claude, same rules).
- Calendar: all her calendars are synced; Grow Therapy puts client sessions on her **marlys@** calendar (the
  Microsoft/Outlook one). The app reads the Outlook calendar.
- **Two mailboxes in the app:** Outlook (work: marlys@ and info@) is the main one. **Gmail stays too**, but only
  to catch messages from her team about Google Docs (comments, shares, requests).
- **Her team:** Kristin (admin coordinator, also reads info@), Frankie (content creation and marketing). Both
  are on Motion. Business coach: Kris (Kristina, email possibly @gildedwithin; confirm before using).
- **What Claude may do with Grow Therapy email (HIPAA rule, decided by Marlys):** only spot and tell her about
  (1) a new client, shown by **initials only**, (2) a client changing a session time, (3) a new message waiting
  in Grow, (4) Grow the company asking her to do something (re-credentialing, paperwork, etc.). Nothing else:
  no client names, no clinical content, no summaries of client messages. Keep this as narrow as possible
  (sender + subject + only what's needed for those four), and store only initials.
- Tasks and team scheduling: **Motion** (usemotion.com), shared with her team. Replaces Google Tasks.
- Team talk: **Google Chat**, and comments on **Google Docs**.
- Booking/scheduling: Grow Therapy for therapy clients (they handle booking, billing, insurance, notes).
- Invoicing/payments: Grow Therapy (therapy clients); **Wix** (supervision membership and other website sales);
  coaching will likely be **Stripe or Square** (not set up yet); some contractors' private-pay clients pay by
  **PayPal**, which she wants to replace because it isn't HIPAA-compliant.
- Where she keeps files: Google Drive / Google Docs.
- Computer: **Mac** (Mac setup/start files done in step 3). Time zone: **Mountain Time**
  (America/Denver).
- What eats her time (what the dashboard and daily brief should focus on): client sessions and marketing the
  workshop.
- **Workshop sign-ups (Suddenly Untethered, Nov 13, 2026, 10am MT):** her first workshop, no sign-up goal; she
  wants to **see how many have signed up**. People come from Instagram to the website's Register Now button
  (**Wix**), from an **Eventbrite** listing, and from sites like **Freaking Nomads**. **Kristin already set up the
  pre- and post-workshop emails in Wix automations**, so the app should not draft those; it should show the count
  (by source: Wix / Eventbrite / other) and check that Eventbrite people get the Zoom link and reminders too.
- **Privacy (HIPAA):** client health information must be handled carefully. Keep clinical notes in Grow Therapy;
  the app should only need names, dates and "there's an email about this client". Anything the app sends to
  Claude goes to Anthropic, so before Claude reads client emails, check with her about a BAA (business
  associate agreement) with Anthropic or keeping client details out of what Claude sees.
- App name and colors she wants: **her brand colors** (from her website and logo, "2026 GIT Logo"):
  indigo **#4241A0** (logo lettering; site headings #4A439E), lavender **#ADA9D3** (the music-staff lines),
  black **#000000**, white and a very light lavender background (~#F6F6FA). Website fonts: Assistant (body),
  Poppins, Oswald. Logo: https://static.wixstatic.com/media/8dfc58_d638206911e944a8958555422d3db51c~mv2.png
  (2000x700 PNG, face profile + "Get In Tune" on a music staff). Name: "Get In Tune Hub" unless she says otherwise.

## Reminders for Marlys

- **When the app is set up on her Mac (end of step 7), remind her** to add a "coaching, not therapy" line to her
  workshop/coaching emails and registration page (she asked for this on 2026-11-08). Suggested wording: *"This
  workshop is coaching and education, not therapy, and attending does not create a therapist–client relationship.
  If you're in crisis, please contact local emergency services, or find a free helpline in your country at
  findahelpline.com (in the US, call or text 988)."* Also suggest she asks her liability insurer what wording they
  recommend for an LMFT offering coaching.

## Steps

Changes to the steps from what we learned (2026-11-07): her work email and calendar are **Microsoft 365 /
Outlook** (the Gmail tab becomes Outlook; Gmail stays only to catch team requests about Google Docs); tasks are
**Motion**, not Google Tasks; her computer is a **Mac** (setup/start files need Mac versions); the main list is
**one list per program**; Grow Therapy email follows the narrow HIPAA rule above.

- [x] **1. Get to know her business.** Ask Marlys the questions above, a few at a time, in plain words. Write the
      answers above. Don't change code until you know her main list (clients/students/...) and her tools.
- [x] **2. Make it run as-is.** `npm install`, `npm test`, `npm run typecheck`, then `HUB_MODE=mock npm run app`.
      Some tests need Hunter's estimator repo (`../estimator`) for the estimating skill; they go away in step 4.
      *Done 2026-11-07:* installs, typecheck passes, app runs in mock mode with no page errors. 70 tests pass;
      the 6 that fail (`test/files.test.ts`, `test/sendoff.test.ts`) all need `../estimator` and go in step 4.
- [x] **3. Her name, her business, her app.** Add profile settings to `.env` / `src/core/config.ts`: owner name,
      business name, her email address, time zone, app name. Replace every hard-coded "Hunter", "Forefront",
      "hunter@forefrontteam.com", "America/Denver" and "Colorado" (prompts in `src/agent/`, `src/server/main.ts`,
      `src/workflows/`, and the page) with those settings. Rename the app on the page (sidebar logo, tab title,
      icon), the setup and start files (`Setup Forefront Hub.bat`, `Start Keystone.bat`, `Start Hub.bat`,
      `setup.ps1`: install folder, desktop shortcut, and the repo URL they download from), README and package.json.
      *Done 2026-11-08:* `profile` in `src/core/config.ts` (HUB_OWNER_NAME, HUB_BUSINESS_NAME, HUB_OWNER_EMAIL,
      HUB_TIME_ZONE, HUB_APP_NAME, HUB_BUSINESS_ABOUT; defaults are hers). Times use `TIME_ZONE` from config. The
      page gets `{{APP_NAME}}`, `{{FIRST}}`, `{{GMAIL}}`... filled in by `src/server/page.ts`. Her logo is
      `assets/logo.png`, the icon (the face from the logo) `assets/icon.png`; themes are "Get In Tune" (light,
      default) and "Night". Windows files replaced by Mac ones: `Setup Get In Tune Hub.command` (installs to
      ~/Get In Tune Hub from github.com/getintune/getintunehub, Desktop link), `Start Get In Tune Hub.command`,
      `Connect Gmail.command`. Left for step 4: "Hunter"/"Forefront" in the files step 4 deletes (estimating,
      Homebase, CompanyCam, DocuSketch, reminders), the practice data in `fixtures/` and the mock calendar/mail
      (still estimating examples), the "Plan my day" prompt (all about jobs), `Connect CompanyCam.bat`.
      Her work address marlys@getintunemusictherapy.com is confirmed (2026-11-08). To check in step 7: setup clones the
      default branch, so this branch must be merged first.
- [x] **4. Take out what's Forefront-only.**
      - Estimating: the Estimator tab (`src/agent/studio.ts`), Selections (`src/agent/selections.ts`,
        `src/workflows/selections.ts`), the send-off and Homebase sync (`src/workflows/sendoff.ts`, `sync.ts`,
        `files.ts`, `pull.ts`, `background.ts`), the estimating skill (`src/connectors/skill`, ESTIMATOR_DIR,
        the Python setup in `setup.ps1`), adjuster reminders (`src/workflows/reminders.ts`).
      - CompanyCam and DocuSketch connectors and their setup files.
      - Homebase: replace `src/connectors/homebase` with her own main list: start with a simple local store (a
        JSON file in her data folder) for her clients with stages, notes and contact details, behind an interface
        with a mock, so it works before any of her apps are connected. Rename "jobs" to her word on the page.
      - Their tests, and any page sections that only made sense for estimating.
      Keep: dashboard, daily brief with checkboxes and go-buttons, Gmail tab (drafts-only Claude, Claude drafts
      folder, summaries, drag to labels), Calendar + Google Tasks, drive times, Contacts, notes, Ask Claude (it
      routes to the right tab), Music, foldable panels, text size, the Claude env guard.
      *Done 2026-11-08:* all of the above removed. Her six lists live in `src/connectors/lists` (stages, extra
      fields and hints per list in `PROGRAMS`), saved to `data/lists.json` (HUB_DATA_DIR) with a backup on each
      save; practice people in `fixtures/lists.json`. Therapy clients are initials-only (no email/phone stored)
      and Claude never sees their notes. `src/workflows/needs.ts` works out "Needs you" (next steps due, people
      waiting too long at a stage, rules in `WAITING`) and the workshop sign-up counts by source. Page: a
      **Clients** tab (one list per program, add/move/notes), a new dashboard (sign-up count, needs, lists,
      today), contacts and email threads show which list a person is on, the brief's go-buttons open a person
      (`{go:ID}`). Drive times use each event's own address from HUB_DAY_START_ADDRESS. Practice mail, calendar
      and tasks are made-up Get In Tune examples. Still to come: Outlook in place of Gmail as her main mailbox,
      Motion in place of Google Tasks, and the Grow Therapy email rule (step 6).
- [x] **5. Claude costs.** Claude features stay off until she adds an Anthropic API key. Use the fast model
      (`HUB_FAST_MODEL`) for everything routine (summaries, tasks from email) and the big one only for the brief
      and Ask Claude. Add on/off switches in the app for each background Claude feature. Add a cost meter: record
      each Claude run's cost (the SDK's result message has `total_cost_usd`) and show today / this month. Tell her
      to set a monthly cap at console.anthropic.com → Limits.
      *Done 2026-11-08:* `src/agent/costs.ts`: switches for email summaries (on), tasks from email (off to start;
      it writes Google Tasks, which she doesn't use, until Motion is connected) and the morning brief (on), saved in
      `.hub/settings.json`; every Claude run's `total_cost_usd` goes to `.hub/claude-costs.json`. The dashboard's
      Claude card shows this month / today by use, the switches, and the console Limits reminder. Email tasks now
      use the fast model. `.env.example` rewritten for her (no estimating settings).
      **Then (2026-11-08) Marlys chose no per-use cost:** she wanted it free to run like Hunter's (his can pass
      requests to a ChatGPT router on his PC). We explained that subscriptions can't power the app itself, and she
      picked "Do this in Claude": with no API key (the default), each Claude button opens her Claude app with the
      request written out (`src/workflows/handoff.ts`, POST /api/handoff: plan my day, one person, reply to an
      email, the Ask box), also copied to the clipboard. Background Claude features are off without a key. The
      API key + cost meter stay as an option she can turn on later. In step 7: set up her **morning brief as a
      scheduled task in the Claude app** (on her subscription), and check her Claude account's Gmail, Google
      Calendar and Microsoft 365 connectors are connected.
      **Then (2026-11-09) Marlys switched the app's own agent to Google Gemini** (free tier), so Ask and
      background work cost nothing per use. `@google/genai` replaces `@anthropic-ai/claude-agent-sdk`;
      `src/connectors/gemini` (LiveGemini / NoGemini / MockGemini) is `hub.gemini`; `src/agent/run.ts` is a
      function-calling loop (max 12 turns) over `hubTools(hub)` (zod → `parametersJsonSchema`); email summaries and
      tasks-from-email use JSON output on `gemini-2.5-flash-lite`. `GEMINI_API_KEY` in .env (`Connect Gemini.command`);
      models `HUB_MODEL=gemini-2.5-flash`, `HUB_FAST_MODEL=gemini-2.5-flash-lite`. The meter records runs and tokens
      at $0.00 (`/api/settings/agent`; `/api/settings/claude` still answers). The Agent SDK's built-in file and
      shell tools (and `guard.ts`) are gone: the agent only has the app's tools. **Privacy:** Google's free tier
      may use what's sent to improve its products (people may read it); she was told. Grow email and therapy notes
      never go to Gemini (tested), client sessions go as "Client session", and all three background features now
      start OFF. Without a key everything still hands off to her Claude app.
- [ ] **6. Her tools.** One at a time, each as a connector with a mock and tests: booking/scheduling, invoicing/
      payments, files/photos. Turn what they know into dashboard reminders and lines in the daily brief.
      - [x] **Outlook (2026-11-08):** info@ gets Grow Therapy, Wix and Eventbrite email; Marlys set up her Microsoft
        365 herself (she's the admin). `src/connectors/outlook`: Microsoft Graph, **read-only** (Mail.Read,
        Mail.Read.Shared), device-code sign-in (`Connect Outlook.command`, guide in `connectOutlook()`), reads
        OUTLOOK_MAILBOXES (marlys@ and info@). Practice mail in `fixtures/outlook.json` (Grow/Wix/Eventbrite wording
        invented: **check the patterns in `src/workflows/grow.ts` and `signups.ts` against her real emails once
        connected**). Work email tab (read, search, Open in Outlook, Draft reply in Claude). Grow alerts card (her four
        kinds, initials only, no subject or preview kept; Grow emails aren't shown in the app or sent to Claude, only
        "Open in Outlook"). Sign-up suggestions from Wix/Eventbrite emails, added to the workshop list when she clicks
        Add. Plan my day in Claude includes the Grow alerts. Calendar stays on Google for now (she says all her
        calendars are synced).
      - [x] **Outlook calendar (2026-11-09):** her Outlook calendar wasn't showing (Grow puts sessions there). Added
        read-only via Graph (Calendars.Read; `src/connectors/outlook/calendar.ts`), shown together with Google Calendar
        (`CombinedCalendar`; new events go to Google, Outlook events are changed in Outlook). Events that look like
        client sessions are `private`: shown to her, but sent to Claude only as "Client session (details private)".
        She re-runs Connect Outlook to add the Calendars.Read permission and sign in again.
      - [x] **Bevel workouts (2026-11-09):** she wants the workouts Bevel plans for her in her daily plan. Bevel
        has no public API (Bevel team, feedback board) and its calendar support reads her calendar rather than
        writing workouts to it, as far as we could tell. So: a "Today's workout" box on the dashboard (she types or
        pastes Bevel's plan; `src/workflows/workout.ts`, one per day), included in Plan my day (Claude and Gemini),
        with Add to Motion (length read from the text). Asked her to check Bevel → Settings for a calendar option
        that writes workouts; if it exists, they'd show up on their own.
      - [ ] **Google Chat** (she said yes, later): a "Team messages" card from Kristin and Frankie. Check first whether
        her Chat is on Google Workspace; the Chat API doesn't serve personal @gmail.com accounts.
      - [x] **Motion (2026-11-08):** Marlys loves that Motion fits tasks into her schedule and moves them, so Motion
        keeps doing that; the app never moves, edits or deletes Motion tasks. `src/connectors/motion` (Motion API,
        MOTION_API_KEY; practice tasks in `fixtures/motion.json`), `src/workflows/motion.ts`. Dashboard "Today" shows
        what Motion scheduled today plus overdue, with an "Add a task to Motion" box; **Add to Motion** buttons on
        Needs you, a person's next step and work emails; every add shows a Yes/No card with the name to edit first.
        "Team in Motion" (folded) shows Kristin's and Frankie's tasks this week, read-only. Plan my day in Claude
        includes her Motion day. Google Tasks is no longer on the dashboard. In step 7: check her Motion plan
        includes API access, and the real task fields match. Later maybe: "tasks from email" into Motion.
      - [ ] Payments (Stripe or Square) once she picks one; the PayPal-for-contractors change (HIPAA).
      - [ ] The coaching intake/stages from her Google Doc.
- [ ] **7. On her computer.** Walk her through setup: install, `Connect Gmail` (her own Google Cloud project and
      OAuth client: the guide is in `src/cli/connect.ts`), her API key in `.env`, Spotify if she wants Music.
      *Prepared 2026-11-08 (without her):* **SETUP-ON-MAC.md** is her step-by-step guide: merge the PR, GitHub
      Desktop clone to Documents/getintunehub (a private repo can't be cloned from Terminal without a token),
      Node.js LTS, right-click > Open on `Setup Get In Tune Hub.command` (it now sets up the folder it sits in),
      `Connect Outlook.command`, `Connect Motion.command` (new: asks for the key, tests it, saves it), Claude app
      connectors. Updates: GitHub Desktop > Fetch > Pull. Setup was dry-run here with stand-ins for the Mac-only
      commands (`xcode-select`, `open`): installs, makes .env, Desktop link, doctor. On her Mac (live mode) Outlook,
      Motion and the calendar now say "not connected" instead of showing practice data. Once Outlook is connected,
      sign-up suggestions look back 2 months, so her existing Wix/Eventbrite registrants can be added in one click
      each (workshop name read from the email). Still to do with her: run it, check Grow/Wix/Eventbrite wording
      against real emails, Motion API access on her plan, morning brief as a Claude scheduled task, the
      coaching-not-therapy reminder (see top).
      *Then (2026-11-08):* Marlys asked Claude to handle all GitHub actions and make install simple. Setup is now
      **one file** she downloads from the chat and right-click > Opens: it waits for Apple's Command Line Tools,
      installs Node.js LTS and GitHub's sign-in helper (Git Credential Manager, browser sign-in) with her Mac
      password, clones to ~/Get In Tune Hub, sets up, adds the Desktop icon. The Start file pulls updates each time
      (resetting package-lock.json first). GitHub Desktop is plan B in SETUP-ON-MAC.md. Not testable here: the GCM
      asset lookup (api.github.com is blocked in this workspace) and the clone; the rest was dry-run. Claude merged
      the PR into main itself (fast-forward push), at her request. **Automatic updates (2026-11-09):** `Turn On Automatic Updates.command` (Command Line Tools, GitHub's sign-in helper, connects ~/Get In Tune Hub to origin `main`); the start file pulls `origin main` each time. So each change must be merged into main to reach her. Simulated end to end here (switch-on keeps data/.env/auth; a new commit on main arrived on the next start). **(Resolved 2026-11-09: her GitHub access came back; Claude pushed everything and merged PR #1 into main.)** Earlier that day the push failed: on 2026-11-09
      her GitHub account was suspended ("violation of our Terms of Service"; she can't sign in), so pushes fail
      with 403. Commits since then are only in this session's container and in the zip download. So for now the app
      is delivered as **Get In Tune Hub.zip** (a git clone, with full history in .git, sent in chat): Setup copies
      it to ~/Get In Tune Hub keeping .env, auth/, data/, .hub/, node_modules/. Updates = a new zip. When GitHub is
      back: push the branch from her Mac's copy (or this session), merge, and the GitHub sign-in path works again.
- [ ] **8. Tidy up.** Remove anything left from Keystone that she doesn't use. README in plain words for her.
