#!/bin/bash
# Get In Tune Hub setup for Mac. Double-click this (the first time: right-click > Open > Open).
# It can sit anywhere (Downloads is fine): it puts the app in your home folder under "Get In Tune Hub",
# sets it up, and puts a "Get In Tune Hub" icon on your Desktop. Safe to run again.

HUB="$HOME/Get In Tune Hub"
REPO="https://github.com/getintune/getintunehub.git"

say_step() { printf '\n== %s\n' "$1"; }
stop() { printf '\n%s\n\nCopy the message above to Claude if you need help. Press Enter to close.\n' "$1"; read -r _; exit 1; }

# ---- 1. Git (comes with Apple's Command Line Tools)
say_step "Git"
if ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install >/dev/null 2>&1
  stop "Your Mac is asking to install Apple's Command Line Tools: click Install in that window. When it's done, double-click this file again."
fi
git --version || stop "Git isn't working. Double-click this file again after the Command Line Tools install finishes."

# ---- 2. Node.js
say_step "Node.js"
if ! command -v node >/dev/null 2>&1; then
  open "https://nodejs.org/en/download"
  stop "Node.js isn't installed yet. On the page that just opened, download the macOS Installer (.pkg), open it and click through. Then double-click this file again."
fi
echo "Node $(node -v)"

# ---- 3. Download (first time) or update the app
say_step "Get In Tune Hub"
if [ -d "$HUB/.git" ]; then
  echo "Updating $HUB..."
  git -C "$HUB" pull --ff-only || echo "(Couldn't update just now; carrying on with the copy you have.)"
else
  echo "Downloading to $HUB. If GitHub asks you to sign in, sign in with your GitHub account."
  git clone "$REPO" "$HUB" || stop "The download didn't work. Check your internet connection and GitHub sign-in, then double-click this again."
fi
cd "$HUB" || stop "Couldn't open $HUB."

# ---- 4. The app's packages
say_step "Installing (the first time takes a few minutes)"
npm install --no-audit --no-fund --loglevel=error || stop "Installing didn't finish. Check your internet connection and double-click this again."

# ---- 5. Settings (.env stays on this Mac; it is never uploaded)
say_step "Settings"
if [ ! -f .env ]; then cp .env.example .env; echo "Made your settings file (.env)."; else echo "Your settings file (.env) is already there."; fi

# ---- 6. Desktop icon
say_step "Desktop icon"
chmod +x "$HUB"/*.command
ln -sf "$HUB/Start Get In Tune Hub.command" "$HOME/Desktop/Get In Tune Hub"
echo "Added 'Get In Tune Hub' to your Desktop."

# ---- 7. Check
say_step "Check"
npm run -s hub -- doctor

printf '\nAll set. From now on, double-click "Get In Tune Hub" on your Desktop to open the app.\nStarting it now...\n'
sleep 2
open "$HUB/Start Get In Tune Hub.command"
