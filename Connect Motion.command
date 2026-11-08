#!/bin/bash
# Connects Motion to Get In Tune Hub with an API key from Motion's settings. Follow the steps it prints.
cd "$(dirname "$0")" || exit 1
npm run -s hub -- connect motion
printf '\nPress Enter to close.\n'; read -r _
