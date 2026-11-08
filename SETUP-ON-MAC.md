# Setting up Get In Tune Hub on your Mac

About 45 minutes, once. Have these handy: your Mac and its login password, your GitHub login, your Microsoft
365 (admin) login, and Motion open in your browser. Nothing here costs money.

If anything shows an error, copy the message to Claude (in Claude Code) and ask what to do.

---

## 1. Install the app: one file (15–30 minutes, mostly waiting)

1. Download **Setup Get In Tune Hub.command**: Claude sent it to you in the chat (click it to save it). It goes
   to your **Downloads** folder.
2. In Finder, open **Downloads**, **right-click** (or Control-click) **Setup Get In Tune Hub** → **Open** →
   **Open**. (Your Mac asks this once because the file is new to it.) A Terminal window opens and talks you
   through the rest:
   - If a window offers to install **Command Line Tools**, click **Install**, then **Agree**. The setup waits
     for it (often 5–15 minutes).
   - When it asks for your **password**, type your Mac login password and press Enter. Nothing shows while you
     type; that's normal.
   - When a **GitHub** sign-in appears, choose **Sign in with your browser**, sign in, and click **Authorize**.
3. When it says **All set**, the app opens in your browser, and there's a **Get In Tune Hub** icon on your
   Desktop. The app itself lives in your home folder, in **Get In Tune Hub**.

From now on: double-click **Get In Tune Hub** on your Desktop. A small Terminal window opens: leave it open
while you use the app (closing it stops the app). Each time it opens, it picks up Claude's latest changes on its
own.

**Plan B** (only if step 2 says the download didn't work): install **GitHub Desktop** from
desktop.github.com, sign in, then **File → Clone Repository… → getintune/getintunehub** into your home folder.
Then open that folder and right-click **Setup Get In Tune Hub** → **Open**.

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

---

## Getting updates

Nothing to do: each time you open the app from the Desktop icon, it picks up Claude's latest changes. (If you
used plan B, open GitHub Desktop and click **Fetch origin**, then **Pull origin**, first.)

## Where your things are

- Your lists: **Get In Tune Hub → data** in your home folder (on your Mac only, never uploaded).
- Your settings and logins: the hidden **.env** file and **auth** folder in the app folder (never uploaded).
