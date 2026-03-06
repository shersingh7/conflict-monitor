# Iran / Israel / US War Dashboard (local)

This is a **local-only** dashboard that renders from `data.json`.

## Run

```bash
cd /Users/shersingh/.openclaw/workspace/iran-war-dashboard
python3 -m http.server 5173
```

Open:
- http://127.0.0.1:5173

## Files
- `index.html` — UI
- `app.js` — logic
- `data.json` — dataset (to be updated by a script/cron later)

## Notes
- The map uses OpenStreetMap tiles (internet required). If offline, markers still render on a blank map.
- Data accuracy depends on your upstream sources.
