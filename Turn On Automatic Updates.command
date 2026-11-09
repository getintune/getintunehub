#!/bin/bash
# Turns on automatic updates: from now on, each time you open Get In Tune Hub it downloads Claude's latest changes
# from GitHub (your lists, settings and logins are never touched). Right-click > Open > Open the first time.
# It needs Apple's Command Line Tools (free; your Mac offers them) and a one-time GitHub sign-in in your browser.

HUB="${HUB_DIR:-$HOME/Get In Tune Hub}"
REPO="${HUB_REPO:-https://github.com/getintune/getintunehub.git}"
say_step() { printf '\n== %s\n' "$1"; }
stop() { printf '\n%s\n\nCopy the message above to Claude if you need help. Press Enter to close.\n' "$1"; read -r _; exit 1; }

[ -f "$HUB/package.json" ] || stop "The app isn't installed in $HUB yet. Run Setup Get In Tune Hub first."
cd "$HUB" || stop "Couldn't open $HUB."

# ---- 1. Apple's Command Line Tools (they include git, which downloads the updates)
say_step "Apple's Command Line Tools"
if ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install >/dev/null 2>&1
  echo "A window asks to install Apple's Command Line Tools: click Install, then Agree."
  echo "Waiting for it to finish (often 5-15 minutes)..."
  for _ in $(seq 1 180); do xcode-select -p >/dev/null 2>&1 && break; sleep 10; done
fi
git --version || stop "The Command Line Tools aren't ready yet. When their install has finished, open this file again."

# ---- 2. GitHub's sign-in helper (signs in through your browser, then remembers it)
say_step "GitHub sign-in"
if [ ! -x /usr/local/share/gcm-core/git-credential-manager ]; then
  echo "Installing GitHub's sign-in helper. Your Mac will ask for your Mac password (nothing shows while you type):"
  sudo -v || stop "The password wasn't accepted. Open this file again and retry."
  TMPD="$(mktemp -d)"
  arch="$(uname -m)"; [ "$arch" = "arm64" ] || arch="x64"
  url="$(curl -fsSL https://api.github.com/repos/git-ecosystem/git-credential-manager/releases/latest | grep -o "https://[^\"]*gcm-osx-$arch[^\"]*\.pkg" | head -1)"
  if [ -n "$url" ] && curl -fsSL -o "$TMPD/gcm.pkg" "$url" && sudo installer -pkg "$TMPD/gcm.pkg" -target / >/dev/null; then
    /usr/local/share/gcm-core/git-credential-manager configure >/dev/null 2>&1 || true
  else
    rm -rf "$TMPD"; stop "GitHub's sign-in helper didn't install. Check your internet connection and open this file again."
  fi
  rm -rf "$TMPD"
fi

# ---- 3. Connect this copy of the app to GitHub's main version and get the latest
say_step "Connecting to GitHub"
[ -d .git ] || git init -q
git remote get-url origin >/dev/null 2>&1 && git remote set-url origin "$REPO" || git remote add origin "$REPO"
echo "A GitHub sign-in may open: choose \"Sign in with your browser\", sign in, and click Authorize."
git fetch origin main || stop "Couldn't reach the app on GitHub. Check your internet connection and GitHub sign-in, then open this file again."
git checkout -- package-lock.json >/dev/null 2>&1
# Your lists (data/), settings (.env) and logins (auth/) aren't part of the app's files, so this never touches them.
git checkout -q -B main origin/main -f || stop "Couldn't switch to the latest version."
git branch -q --set-upstream-to=origin/main main >/dev/null 2>&1

say_step "Installing the latest version"
npm install --no-audit --no-fund --loglevel=error || stop "Installing didn't finish. Check your internet connection and open this file again."

printf '\nAutomatic updates are on. From now on, opening Get In Tune Hub picks up Claude'"'"'s latest changes.\nClose the app (its Terminal window) and open it again from your Desktop. Press Enter to close.\n'
read -r _
