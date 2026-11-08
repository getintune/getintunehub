#!/bin/bash
# Starts Get In Tune Hub and opens it in your browser. Keep the Terminal window open while you use the app;
# closing it stops the app.
cd "$(dirname "$(readlink "$0" 2>/dev/null || echo "$0")")" || exit 1
printf '\033]0;Get In Tune Hub - keep this window open while you use it\007'

if [ ! -d node_modules ]; then
  echo 'The app is not set up yet. Double-click "Setup Get In Tune Hub" first.'
  read -r _; exit 1
fi

# Already running? Just open it.
if nc -z 127.0.0.1 4317 >/dev/null 2>&1; then
  open "http://127.0.0.1:4317"
  exit 0
fi

# Get the latest version (skipped quietly when offline).
export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never
git checkout -- package-lock.json >/dev/null 2>&1; git pull --ff-only --quiet >/dev/null 2>&1 && npm install --no-audit --no-fund --loglevel=error >/dev/null 2>&1

(sleep 5; open "http://127.0.0.1:4317") &
echo "Get In Tune Hub is running at http://127.0.0.1:4317"
echo "Close this window to stop it."
npm run -s app
