#!/bin/bash
# Connects your work email (Outlook / Microsoft 365) to Get In Tune Hub, read-only. Follow the steps it prints.
cd "$(dirname "$0")" || exit 1
npm run -s hub -- connect outlook
printf '\nPress Enter to close.\n'; read -r _
