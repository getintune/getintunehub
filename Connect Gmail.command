#!/bin/bash
# Connects your Google account (Gmail, Google Calendar) to Get In Tune Hub. Follow the steps it prints.
cd "$(dirname "$0")" || exit 1
npm run -s hub -- connect gmail
printf '\nPress Enter to close.\n'; read -r _
