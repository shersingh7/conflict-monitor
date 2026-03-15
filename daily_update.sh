#!/bin/bash
# Daily update script for conflict-monitor
# Run via cron at 7:00 AM Toronto time

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_PYTHON="/Users/shersingh/clawd/.venv/bin/python3"
PYTHON_BIN="python3"

if [ -x "$VENV_PYTHON" ]; then
  PYTHON_BIN="$VENV_PYTHON"
fi

cd "$REPO_DIR"

echo "=== Conflict Monitor Daily Update ==="
echo "Repo: $REPO_DIR"
echo "Python: $PYTHON_BIN"
echo "Started: $(date)"

# Pull latest changes (in case manual edits were made)
git pull --rebase origin main 2>/dev/null || true

# Run the update script (uses local scrapling + source metadata sync)
"$PYTHON_BIN" update_data.py

# Optional: Fetch fresh data from Wikipedia for quick inspection
if command -v curl >/dev/null 2>&1; then
  echo "Fetching fresh data from sources..."
  curl -s "https://en.wikipedia.org/wiki/2026_Iran_war" > /tmp/iran_war_wiki.txt 2>/dev/null || echo "Note: Wikipedia fetch failed"
fi

# Check if there are tracked changes to commit
if git diff --quiet data.json sources.json; then
    echo "No data/source changes to commit."
else
    echo "Changes detected. Committing..."
    git add data.json sources.json
    git commit -m "Auto-update: $(date '+%Y-%m-%d %H:%M')"
    git push origin main
    echo "Pushed to GitHub."
fi

echo "Completed: $(date)"
