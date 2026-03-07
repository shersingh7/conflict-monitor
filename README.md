# Conflict Monitor

Interactive dashboard for tracking military conflicts with costs, losses, and defense supplier data.

## Current Conflict
**2026 Iran War** (Iran/Hezbollah vs US/Israel coalition)

## Features
- **Casualties tracker** — by country/actor with sources
- **Costs/Expenses** — estimated military spending per actor
- **Losses** — aircraft, ships, infrastructure damage
- **Defense Suppliers** — mapping weapons to manufacturers
- **Timeline** — events with confidence levels and citations
- **Map** — strike locations (approximate)

## Live Demo
Dashboard runs locally:

```bash
cd conflict-monitor
python3 -m http.server 5173
```

Then open: http://127.0.0.1:5173

## Getting Latest Data

### Option 1: Pull from GitHub (Recommended)
```bash
git pull origin main
```

We push updates daily at ~7:00 AM Toronto time.

### Option 2: Run the update script
```bash
python3 update_data.py
```

This fetches from configured sources and updates `data.json`.

## Data Sources

| Source | Trust Level | Type |
|--------|-------------|------|
| Wikipedia | Low | Events, casualties |
| ISW (Institute for the Study of War) | Medium | Military analysis |
| Reuters | High | Verified news |
| AP News | High | Verified news |
| BBC News | High | Verified news |
| ThePricer | Medium | Cost estimates |
| Defense publications | Medium | Unit costs, supplier data |

**Note:** Casualty and munition counts are estimates based on publicly available information. Confidence levels are provided. Always verify with primary sources for critical decisions.

## Directory Structure

```
conflict-monitor/
├── index.html          # Dashboard UI
├── app.js              # Dashboard logic
├── data.json           # All conflict data
├── sources.json        # Configured sources
├── update_data.py      # Update script
├── daily_update.sh     # Cron script (for auto-updates)
├── PLAN.md             # Development roadmap
└── README.md           # This file
```

## Contributing

1. Fork the repo
2. Update `data.json` with verified data (include sources)
3. Submit a pull request

Please include citations for any new data points.

## License

MIT License — use freely, cite sources when sharing data.

## Auto-Updates (For Maintainers)

To set up daily auto-updates on your machine:

```bash
# Add to crontab
crontab -e

# Add this line (runs at 7 AM Toronto time)
0 7 * * * /Users/shersingh/.openclaw/workspace/conflict-monitor/daily_update.sh >> /tmp/conflict-monitor.log 2>&1
```

The script will:
1. Pull latest changes from GitHub
2. Run the update script
3. Commit and push if there are changes

## Data Quality

- **Verified:** Confirmed by 2+ tier-1 sources (Reuters, AP, BBC)
- **Reported:** Single source reporting
- **OSINT:** Open-source intelligence (social media, satellite imagery)
- **Party-claim:** Government/military statements (may be biased)
- **Disputed:** Contradictory reports
- **Unknown:** Unverified

Each event includes a confidence level and source links.

## Roadmap

See [PLAN.md](PLAN.md) for planned features and improvements.