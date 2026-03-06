# Plan: make the dashboard *evidence-first* (accurate + extensive)

## Non-negotiables
- **No invented numbers.** If a count isn’t in a cited source, it stays blank/0 and is labeled `unknown`.
- Every claim gets: **confidence + citations**.
- We separate:
  - **Confirmed (2+ tier-1)** vs
  - **Reported (1 tier-1)** vs
  - **OSINT** (visual evidence / analyst reports) vs
  - **Party-claims** (IDF/IRGC/CENTCOM statements)

## What “Cost/Expense” can realistically mean
Exact costs like “bullets used” are almost never public. We can still build useful estimates:
- Create a **unit-cost catalog** (Tomahawk, PAC-3, JDAM kits, etc) with citations.
- Track **reported usage counts** (missiles fired/interceptors used/air sorties) with citations.
- Compute a **spend range** (low/medium/high) and label confidence.

## Data model changes
- Add `events[]`: timestamped claims with (actor, action, munition, count, target, casualties, assets_lost) + sources.
- Derive:
  - `casualties` summary
  - `losses` summary + tables
  - `costs` from events × unit-cost
  - `defenseIndustry.usage` from events (munition -> supplier mapping)

## Sources
See `sources.json` for the curated list (AP, BBC, ISW, Wikipedia, etc.).

## Cron later
Once you approve cron:
- Run an OpenClaw agent job daily to:
  1) fetch sources
  2) update `events[]`
  3) recompute summaries
  4) bump `lastUpdated`
  5) send you a diff/brief
