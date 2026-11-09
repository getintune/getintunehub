# Setting up Get In Tune Hub on your Mac

About 45 minutes, once. Have these handy: your Mac and its login password, your GitHub login, your Microsoft
365 (admin) login, and Motion open in your browser. Nothing here costs money.

If anything shows an error, copy the message to Claude (in Claude Code) and ask what to do.

---

## 1. Install the app (10–20 minutes, mostly waiting)

1. In the chat, Claude sent you **Get In Tune Hub.zip**. Click it to download it (it goes to **Downloads**).
2. In Finder, open **Downloads** and double-click **Get In Tune Hub.zip**. A folder appears:
   **Get In Tune Hub (download)**. Open it.
3. **Right-click** (or Control-click) **Setup Get In Tune Hub** → **Open** → **Open**. (Your Mac asks this once
   because the file is new to it.) A Terminal window opens and talks you through the rest:
   - If it asks for your **password**, type your Mac login password and press Enter. Nothing shows while you
     type; that's normal. (It's installing Node.js, the free program the app runs on.)
4. When it says **All set**, the app opens in your browser, and there's a **Get In Tune Hub** icon on your
   Desktop. The app now lives in your home folder, in **Get In Tune Hub**. You can delete the download and
   the zip from Downloads.

From now on: double-click **Get In Tune Hub** on your Desktop. A small Terminal window opens: leave it open
while you use the app (closing it stops the app).

The helper files below (Connect Outlook, Connect Motion, ...) are in the **Get In Tune Hub** folder in your
home folder. (In Finder: **Go → Home**.)

## 2. Connect your work email (10 minutes)

The app only **reads** marlys@ and info@. It can't send, move or delete anything.

1. In the **Get In Tune Hub** folder, right-click **Connect Outlook** → **Open** → **Open**.
2. Follow the steps it prints. Your browser opens Microsoft's admin page: sign in with your Microsoft 365
   admin login. You'll register the app once, copy two IDs, turn on one setting and approve two permissions.
3. It then shows a short code. Type it on the Microsoft page that opens, sign in as marlys@, click **Accept**.
4. It should say **connected** for both mailboxes. Close the window and restart the app.

## 3. Connect Motion (3 minutes)

1. Right-click **Connect Motion** → **Open** → **Open**.
2. Motion's settings open in your browser. Find **API** and click **Create API key**, then copy the key.
3. Paste it into the window and press Enter. It should say **Motion is connected**. Restart the app.

## 4. Your Claude app (5 minutes)

The **Do this in Claude** buttons open your Claude app. For Claude to read your email and calendar there:

1. In the Claude app: **Settings → Connectors**.
2. Make sure **Microsoft 365**, **Gmail** and **Google Calendar** are connected.

Your morning brief: we'll set it up together as a scheduled task in the Claude app (on your subscription).

## 5. Optional

- **Gmail and Google Calendar in the app** (for the Gmail and Calendar tabs): right-click **Connect Gmail** →
  **Open**, and follow the steps.
- **Drive times** to in-person appointments: tell Claude your start address and it will add it.
- **Music**: open the **Music** tab and follow the steps there.
- **The app's own assistant (Gemini, free):** lets "Ask" and Plan my day run inside the app instead of opening
  Claude. In the **Get In Tune Hub** folder, right-click **Connect Gemini** → **Open** → **Open**: it opens Google AI
  Studio, where you click **Create API key** and copy it, then paste it into the window.
  Note: on the free tier Google may use what's sent to improve its products.

---

## Getting updates

**Automatic (once switched on):** in the **Get In Tune Hub** folder, right-click **Turn On Automatic Updates** →
**Open** → **Open**, once. It installs Apple's Command Line Tools if needed, asks for your Mac password once, and has
you sign in to GitHub in your browser. After that, each time you open the app from the Desktop icon it says
"Checking for updates..." and picks up Claude's latest changes. Your lists, settings and logins are never touched.

**Before that (or if GitHub isn't available):** Claude sends a new **Get In Tune Hub.zip**; do steps 1–3 above again.

## Where your things are

- Your lists: **Get In Tune Hub → data** in your home folder (on your Mac only, never uploaded).
- Your settings and logins: the hidden **.env** file and **auth** folder in the app folder (never uploaded).
