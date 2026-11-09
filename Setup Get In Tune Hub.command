#!/bin/bash
# Get In Tune Hub setup for Mac (right-click > Open > Open the first time).
# Usually it's inside the app download Claude sent you: it installs Node.js if needed (asks for your Mac password),
# copies the app to your home folder under "Get In Tune Hub" (an update keeps your lists, settings and logins),
# sets it up, and puts a "Get In Tune Hub" icon on your Desktop. On its own, it downloads the app from GitHub
# instead. Safe to run again.

HERE="$(cd "$(dirname "$0")" && pwd)"
HUB="$HOME/Get In Tune Hub"
# How the app gets here: "copy" from a download Claude sent (the usual way), "inplace" when this file is already
# in the installed app, or "clone" from GitHub when this file is on its own.
if [ -f "$HERE/package.json" ] && [ -d "$HERE/src" ]; then
  if [ "$HERE" = "$HUB" ] || [ -f "$HERE/.installed" ]; then mode=inplace; HUB="$HERE"; else mode=copy; fi
else
  mode=clone
fi
REPO="https://github.com/getintune/getintunehub.git"

say_step() { printf '\n== %s\n' "$1"; }
stop() { printf '\n%s\n\nCopy the message above to Claude if you need help. Press Enter to close.\n' "$1"; read -r _; exit 1; }

# ---- 1. Git (comes with Apple's Command Line Tools): waits while the Mac installs them
say_step "Apple's Command Line Tools (for downloading updates)"
if [ $mode = clone ] && ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install >/dev/null 2>&1
  echo "A window asks to install Apple's Command Line Tools: click Install, then Agree."
  echo "Waiting for it to finish (often 5-15 minutes)..."
  for _ in $(seq 1 180); do xcode-select -p >/dev/null 2>&1 && break; sleep 10; done
fi
if [ $mode = clone ]; then git --version || stop "Git isn't ready yet. When the Command Line Tools install has finished, open this file again."; else echo "Not needed for this install."; fi

# ---- 2. Node.js (runs the app) and GitHub sign-in (downloads it): installed for you, with your Mac password
need_node=0; command -v node >/dev/null 2>&1 || need_node=1
cloning=0; [ $mode = clone ] && [ ! -d "$HUB/.git" ] && cloning=1
need_gcm=0
if [ $cloning = 1 ] && [ ! -x /usr/local/share/gcm-core/git-credential-manager ]; then need_gcm=1; fi
if [ $need_node = 1 ] || [ $need_gcm = 1 ]; then
  say_step "Installing helpers"
  echo "Your Mac will ask for your Mac password (the one you log in with). Type it and press Enter:"
  echo "nothing shows while you type; that's normal."
  sudo -v || stop "The password wasn't accepted. Open this file again and retry."
fi
TMPD="$(mktemp -d)"
if [ $need_node = 1 ]; then
  say_step "Node.js"
  ver="$(curl -fsSL https://nodejs.org/dist/index.json | grep -o '"version":"v[0-9.]*"[^}]*"lts":"[A-Za-z]' | head -1 | grep -o 'v[0-9][0-9.]*' | head -1)"
  [ -n "$ver" ] || stop "Couldn't reach nodejs.org. Check your internet connection and open this file again."
  echo "Downloading Node.js $ver..."
  curl -fsSL -o "$TMPD/node.pkg" "https://nodejs.org/dist/$ver/node-$ver.pkg" || stop "The Node.js download didn't finish. Open this file again."
  sudo installer -pkg "$TMPD/node.pkg" -target / >/dev/null || stop "Node.js didn't install. Open this file again."
  export PATH="/usr/local/bin:$PATH"
fi
echo "Node $(node -v)"
if [ $need_gcm = 1 ]; then
  say_step "GitHub sign-in helper"
  arch="$(uname -m)"; [ "$arch" = "arm64" ] || arch="x64"
  url="$(curl -fsSL https://api.github.com/repos/git-ecosystem/git-credential-manager/releases/latest | grep -o "https://[^\"]*gcm-osx-$arch[^\"]*\.pkg" | head -1)"
  if [ -n "$url" ] && curl -fsSL -o "$TMPD/gcm.pkg" "$url" && sudo installer -pkg "$TMPD/gcm.pkg" -target / >/dev/null; then
    /usr/local/share/gcm-core/git-credential-manager configure >/dev/null 2>&1 || true
  else
    echo "(The GitHub sign-in helper didn't install. If the download below asks for a password, use plan B in SETUP-ON-MAC.md.)"
  fi
fi
rm -rf "$TMPD"

# ---- 3. Put the app in place (your lists, settings and logins are never touched)
say_step "Get In Tune Hub"
if [ $mode = copy ]; then
  echo "Installing the app to $HUB (keeping your lists, settings and logins)..."
  case "$HUB" in "$HOME/Get In Tune Hub") ;; *) stop "Unexpected install folder: $HUB" ;; esac
  mkdir -p "$HUB"
  # Replace the app's own files; keep .env (settings), auth/ (logins), data/ (lists), .hub/ and node_modules/.
  find "$HUB" -mindepth 1 -maxdepth 1 ! -name ".env" ! -name "auth" ! -name "data" ! -name ".hub" ! -name "node_modules" -exec rm -rf {} + || stop "Couldn't clear the old copy in $HUB."
  cp -R "$HERE/." "$HUB/" || stop "Couldn't copy the app into $HUB."
  touch "$HUB/.installed"
elif [ $mode = inplace ]; then
  echo "Setting up the app in $HUB"
elif [ -d "$HUB/.git" ]; then
  echo "Updating $HUB..."
  git -C "$HUB" checkout -- package-lock.json >/dev/null 2>&1; git -C "$HUB" pull --ff-only || echo "(Couldn't update just now; carrying on with the copy you have.)"
else
  echo "Downloading the app to $HUB."
  echo "A GitHub sign-in opens: choose \"Sign in with your browser\", sign in, and click Authorize."
  git clone "$REPO" "$HUB" || stop "The download didn't work. Ask Claude to send you the app as a download instead."
  touch "$HUB/.installed"
fi
# Files from a download are marked "from the internet": clear that so the Desktop icon opens with a double-click.
xattr -dr com.apple.quarantine "$HUB" 2>/dev/null || true
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
