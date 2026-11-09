#!/bin/bash
# Connects your work email (Outlook / Microsoft 365) to Get In Tune Hub, read-only. Follow the steps it prints.
cd "$(dirname "$0")" || exit 1
# Opened from the download folder? Use the installed app in your home folder.
if [ ! -d node_modules ] && [ -d "$HOME/Get In Tune Hub/node_modules" ]; then cd "$HOME/Get In Tune Hub" || exit 1; fi
if [ ! -d node_modules ]; then
  echo 'The app is not set up yet. First, in this same folder, right-click "Setup Get In Tune Hub" > Open > Open.'
  echo 'When it says "All set", open this file again.'
  printf '\nPress Enter to close.\n'; read -r _; exit 1
fi
npm run -s hub -- connect outlook
printf '\nPress Enter to close.\n'; read -r _
