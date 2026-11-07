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

### From Marlys

- What she does:
- Her word for the people/work she tracks (clients? students? bookings?):
- The stages a client goes through:
- Email and calendar (Gmail/Google?):
- Booking/scheduling app:
- Invoicing/payments:
- Where she keeps files/photos:
- Computer: Windows or Mac:
- What eats her time (what the dashboard and daily brief should focus on):
- App name and colors she wants (default: "Get In Tune Hub", same dark style as Keystone):

## Steps

- [ ] **1. Get to know her business.** Ask Marlys the questions above, a few at a time, in plain words. Write the
      answers above. Don't change code until you know her main list (clients/students/...) and her tools.
- [ ] **2. Make it run as-is.** `npm install`, `npm test`, `npm run typecheck`, then `HUB_MODE=mock npm run app`.
      Some tests need Hunter's estimator repo (`../estimator`) for the estimating skill; they go away in step 4.
- [ ] **3. Her name, her business, her app.** Add profile settings to `.env` / `src/core/config.ts`: owner name,
      business name, her email address, time zone, app name. Replace every hard-coded "Hunter", "Forefront",
      "hunter@forefrontteam.com", "America/Denver" and "Colorado" (prompts in `src/agent/`, `src/server/main.ts`,
      `src/workflows/`, and the page) with those settings. Rename the app on the page (sidebar logo, tab title,
      icon), the setup and start files (`Setup Forefront Hub.bat`, `Start Keystone.bat`, `Start Hub.bat`,
      `setup.ps1`: install folder, desktop shortcut, and the repo URL they download from), README and package.json.
- [ ] **4. Take out what's Forefront-only.**
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
- [ ] **5. Claude costs.** Claude features stay off until she adds an Anthropic API key. Use the fast model
      (`HUB_FAST_MODEL`) for everything routine (summaries, tasks from email) and the big one only for the brief
      and Ask Claude. Add on/off switches in the app for each background Claude feature. Add a cost meter: record
      each Claude run's cost (the SDK's result message has `total_cost_usd`) and show today / this month. Tell her
      to set a monthly cap at console.anthropic.com → Limits.
- [ ] **6. Her tools.** One at a time, each as a connector with a mock and tests: booking/scheduling, invoicing/
      payments, files/photos. Turn what they know into dashboard reminders and lines in the daily brief.
- [ ] **7. On her computer.** Walk her through setup: install, `Connect Gmail` (her own Google Cloud project and
      OAuth client: the guide is in `src/cli/connect.ts`), her API key in `.env`, Spotify if she wants Music.
- [ ] **8. Tidy up.** Remove anything left from Keystone that she doesn't use. README in plain words for her.
