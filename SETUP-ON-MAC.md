# Setting up Get In Tune Hub on your Mac

About 45 minutes, once. Have these handy: your Mac, your GitHub login, your Microsoft 365 (admin) login, and
Motion open in your browser. Nothing here costs money.

If anything shows an error, copy the message to Claude (in Claude Code) and ask what to do.

---

## 1. Approve the latest version on GitHub (1 minute)

1. Open the pull request link Claude gave you.
2. Scroll down and click the green **Merge pull request**, then **Confirm merge**.

## 2. Download the app with GitHub Desktop (5 minutes)

1. Go to **desktop.github.com**, click **Download for macOS**, open the download and drag
   **GitHub Desktop** into Applications. Open it.
2. Click **Sign in to GitHub.com**. Your browser opens: sign in and click **Authorize**.
3. In GitHub Desktop: **File → Clone Repository…** → pick **getintune/getintunehub** →
   **Local Path**: click **Choose…** and pick your **Documents** folder → **Clone**.

You now have a folder **Documents → getintunehub**. That's the app.

## 3. Install Node.js (3 minutes)

The app needs this free program to run.

1. Go to **nodejs.org** and click the big **LTS** download (macOS Installer).
2. Open the downloaded file and click **Continue** / **Agree** / **Install** until it's done.

## 4. Set up the app (5 minutes)

1. In Finder, open **Documents → getintunehub**.
2. **Right-click** (or Control-click) **Setup Get In Tune Hub** → **Open** → **Open**.
   (Your Mac asks this once because the file is new to it.)
3. If your Mac offers to install **Command Line Tools**, click **Install**, wait for it to finish, then
   double-click **Setup Get In Tune Hub** again.
4. When it says **All set**, the app opens in your browser, and there's a **Get In Tune Hub** icon on your
   Desktop.

From now on: double-click **Get In Tune Hub** on your Desktop. A small Terminal window opens: leave it open
while you use the app (closing it stops the app).

## 5. Connect your work email (10 minutes)

The app only **reads** marlys@ and info@. It can't send, move or delete anything.

1. In the app folder, right-click **Connect Outlook** → **Open** → **Open**.
2. Follow the steps it prints. Your browser opens Microsoft's admin page: sign in with your Microsoft 365
   admin login. You'll register the app once, copy two IDs, turn on one setting and approve two permissions.
3. It then shows a short code. Type it on the Microsoft page that opens, sign in as marlys@, click **Accept**.
4. It should say **connected** for both mailboxes. Close the window and restart the app.

## 6. Connect Motion (3 minutes)

1. Right-click **Connect Motion** → **Open** → **Open**.
2. Motion's settings open in your browser. Find **API** and click **Create API key**, then copy the key.
3. Paste it into the window and press Enter. It should say **Motion is connected**. Restart the app.

## 7. Your Claude app (5 minutes)

The **Do this in Claude** buttons open your Claude app. For Claude to read your email and calendar there:

1. In the Claude app: **Settings → Connectors**.
2. Make sure **Microsoft 365**, **Gmail** and **Google Calendar** are connected.

Your morning brief: we'll set it up together as a scheduled task in the Claude app (on your subscription).

## 8. Optional

- **Gmail and Google Calendar in the app** (for the Gmail and Calendar tabs): right-click **Connect Gmail** →
  **Open**, and follow the steps.
- **Drive times** to in-person appointments: tell Claude your start address and it will add it.
- **Music**: open the **Music** tab and follow the steps there.

---

## Getting updates

When Claude has changed the app: open **GitHub Desktop** → click **Fetch origin** → **Pull origin**. Then close
the app's Terminal window and open the Desktop icon again.

## Where your things are

- Your lists: **Documents → getintunehub → data** (on your Mac only, never uploaded).
- Your settings and logins: the hidden **.env** file and **auth** folder in the app folder (never uploaded).
