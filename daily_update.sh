#!/bin/bash
# Daily update script for conflict-monitor
# Run via cron at 7:00 AM Toronto time

set -e

cd /Users/shersingh/github/conflict-monitor

echo "=== Conflict Monitor Daily Update ==="
echo "Started: $(date)"

# Pull latest changes (in case manual edits were made)
git pull --rebase origin main 2>/dev/null || true

# Run the update script (uses web_fetch via OpenClaw or scrapling)
python3 update_data.py

# Optional: Fetch fresh data from Wikipedia
echo "Fetching fresh data from sources..."
curl -s "https://en.wikipedia.org/wiki/2026_Iran_war" > /tmp/iran_war_wiki.txt 2>/dev/null || echo "Note: Wikipedia fetch requires web_fetch tool"

# Check if there are changes to commit
if git diff --quiet data.json sources.json; then
    echo "No changes to commit."
else
    echo "Changes detected. Committing..."
    git add data.json sources.json
    git commit -m "Auto-update: $(date '+%Y-%m-%d %H:%M')"
    git push origin main
    echo "Pushed to GitHub."
fi

echo "Completed: $(date)"