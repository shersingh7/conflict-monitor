#!/usr/bin/env python3
"""
Conflict Monitor — Smart Updater v2
Fetches sources via Firecrawl (self-hosted) or urllib, extracts structured data,
and merges updates into data.json with diff review.
"""

import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

REPO_DIR = Path(__file__).resolve().parent
DATA_FILE = REPO_DIR / "data.json"
SOURCES_FILE = REPO_DIR / "sources.json"
FIRECRAWL_URL = "http://localhost:3002/v1/scrape"


def load_json(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def save_json(path: Path, data: dict):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def fetch_urllib(url: str) -> Optional[str]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  urllib fetch failed: {e}", file=sys.stderr)
        return None


def fetch_firecrawl(url: str) -> Optional[str]:
    payload = json.dumps({"url": url, "formats": ["markdown"]}).encode()
    req = urllib.request.Request(
        FIRECRAWL_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode())
        if result.get("success") and result.get("data", {}).get("markdown"):
            return result["data"]["markdown"]
    except Exception as e:
        print(f"  Firecrawl fetch failed: {e}", file=sys.stderr)
    return None


def fetch(url: str, prefer_firecrawl: bool = True) -> tuple[Optional[str], str]:
    """Returns (content, source_name)."""
    if prefer_firecrawl:
        content = fetch_firecrawl(url)
        if content:
            return content, "firecrawl"
    content = fetch_urllib(url)
    if content:
        return content, "urllib"
    return None, "failed"


def extract_casualties(markdown: str) -> dict[str, Any]:
    """Extract casualty numbers from Wikipedia-style markdown."""
    out: dict[str, Any] = {}

    def find_number_near(label: str, text: str) -> Optional[int]:
        # Look for patterns like "123 killed" or "killed: 1,234" near a label
        patterns = [
            rf"{re.escape(label)}[^\n]{{0,120}}?(\d[\d,]*)\s*(?:killed|dead)",
            rf"(?:killed|dead)[^\n]{{0,120}}?{re.escape(label)}[^\n]{{0,120}}?(\d[\d,]*)",
        ]
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                return int(m.group(1).replace(",", ""))
        return None

    def find_injured_near(label: str, text: str) -> Optional[int]:
        patterns = [
            rf"{re.escape(label)}[^\n]{{0,120}}?(\d[\d,]*)\s*(?:injured|wounded)",
            rf"(?:injured|wounded)[^\n]{{0,120}}?{re.escape(label)}[^\n]{{0,120}}?(\d[\d,]*)",
        ]
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                return int(m.group(1).replace(",", ""))
        return None

    text = markdown.lower()
    out["iran"] = {
        "killed": find_number_near("iran", text) or find_number_near("iranian", text),
        "injured": find_injured_near("iran", text) or find_injured_near("iranian", text),
    }
    out["israel"] = {
        "killed": find_number_near("israel", text) or find_number_near("israeli", text),
        "injured": find_injured_near("israel", text) or find_injured_near("israeli", text),
    }
    out["us"] = {
        "killed": find_number_near("united states", text) or find_number_near("u.s.", text),
        "injured": find_injured_near("united states", text) or find_injured_near("u.s.", text),
    }
    out["lebanon"] = {
        "killed": find_number_near("lebanon", text) or find_number_near("lebanese", text),
        "injured": find_injured_near("lebanon", text) or find_injured_near("lebanese", text),
    }
    return {k: v for k, v in out.items() if v.get("killed") is not None or v.get("injured") is not None}


def extract_timeline(markdown: str) -> list[dict]:
    """Extract date + event lines from markdown. Conservative."""
    events: list[dict] = []
    # Look for sections like "## February 2026" or date lines
    date_pattern = re.compile(r"^(#{1,3}\s+)?(\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})", re.IGNORECASE | re.MULTILINE)

    lines = markdown.splitlines()
    current_date = None
    for line in lines:
        dm = date_pattern.match(line.strip())
        if dm:
            raw = dm.group(2)
            try:
                if "-" in raw:
                    current_date = raw
                else:
                    dt = datetime.strptime(raw, "%d %B %Y")
                    current_date = dt.strftime("%Y-%m-%d")
            except ValueError:
                continue
            continue
        if current_date and line.strip().startswith("-"):
            text = line.strip().lstrip("- ").strip()
            if len(text) > 15 and not text.startswith("http"):
                events.append({"date": current_date, "text": text})
    return events


def extract_missile_counts(markdown: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    text = markdown.lower()
    # Look for missile/rocket counts
    m = re.search(r"(\d[\d,]*)\s*(?:ballistic\s+)?missiles?", text)
    if m:
        out["iran_estimated"] = int(m.group(1).replace(",", ""))
    m2 = re.search(r"interceptors?[^\n]{0,80}(\d[\d,]*)", text)
    if m2:
        out["coalition_estimated"] = int(m2.group(1).replace(",", ""))
    return out


def update_day_count(data: dict) -> dict:
    start = data.get("conflict", {}).get("startDate")
    if start:
        try:
            sd = datetime.fromisoformat(start.replace("Z", "+00:00"))
            data["conflict"]["dayCount"] = (datetime.now(timezone.utc) - sd).days + 1
        except Exception:
            pass
    return data


def merge_timeline(existing: list[dict], discovered: list[dict]) -> tuple[list[dict], int]:
    """Merge discovered events into existing timeline. Returns (merged, added_count)."""
    by_date: dict[str, list[str]] = {}
    for row in existing:
        by_date.setdefault(row.get("date", ""), []).extend(
            e if isinstance(e, str) else e.get("text", "") for e in row.get("events", [])
        )
    added = 0
    for ev in discovered:
        d = ev["date"]
        txt = ev["text"]
        if d not in by_date:
            by_date[d] = []
        if txt not in by_date[d]:
            by_date[d].append(txt)
            added += 1
    merged = [{"date": d, "events": evs} for d, evs in sorted(by_date.items())]
    return merged, added


def update_source_meta(source: dict, content: Optional[str], status: Optional[int] = None) -> dict:
    source["lastFetched"] = today_str()
    source["ingested"] = True
    if status:
        source["status"] = status
    if content:
        source["length"] = len(content)
    return source


def diff_simple(old: Any, new: Any, path: str = "") -> list[str]:
    """Return human-readable diff lines."""
    diffs: list[str] = []
    if isinstance(old, dict) and isinstance(new, dict):
        all_keys = set(old) | set(new)
        for k in sorted(all_keys):
            diffs.extend(diff_simple(old.get(k), new.get(k), f"{path}.{k}"))
    elif isinstance(old, list) and isinstance(new, list):
        if len(old) != len(new):
            diffs.append(f"{path}: list length {len(old)} → {len(new)}")
    elif old != new:
        diffs.append(f"{path}: {old!r} → {new!r}")
    return diffs


def main():
    parser = argparse.ArgumentParser(description="Smart conflict-monitor updater.")
    parser.add_argument("--dry-run", action="store_true", help="Show diffs without writing.")
    parser.add_argument("--force", action="store_true", help="Refetch even if already fetched today.")
    parser.add_argument("--no-firecrawl", action="store_true", help="Disable Firecrawl; use urllib only.")
    args = parser.parse_args()

    print("=" * 60)
    print("Conflict Monitor Updater v2")
    print("=" * 60)
    print(f"Time: {now_iso()}")
    print(f"Firecrawl: {'OFF' if args.no_firecrawl else FIRECRAWL_URL}")
    print()

    data = load_json(DATA_FILE)
    sources = load_json(SOURCES_FILE)

    # Auto-update day count
    data = update_day_count(data)
    print(f"Conflict Day: {data.get('conflict', {}).get('dayCount', '?')}")
    print()

    feeds = sources.get("feeds", [])
    use_fc = not args.no_firecrawl

    # Fetch sources
    for feed in feeds:
        name = feed.get("name", feed.get("url", "?"))
        if not args.force and feed.get("lastFetched") == today_str() and feed.get("length"):
            print(f"[skip] {name}")
            continue

        url = feed.get("url")
        if not url:
            continue

        print(f"[fetch] {name}")
        content, src = fetch(url, prefer_firecrawl=use_fc)
        if content:
            feed = update_source_meta(feed, content, status=200)
            print(f"  source={src} length={len(content)}")

            # Extraction for Wikipedia pages
            if "wikipedia" in url.lower() and "iran" in url.lower():
                print("  → extracting structured data...")
                casualties = extract_casualties(content)
                if casualties:
                    print(f"    casualties found: {list(casualties.keys())}")
                missiles = extract_missile_counts(content)
                if missiles:
                    print(f"    missiles found: {missiles}")
                timeline = extract_timeline(content)
                if timeline:
                    print(f"    timeline events discovered: {len(timeline)}")
                    merged, added = merge_timeline(data.get("timeline", []), timeline)
                    if added > 0 and not args.dry_run:
                        data["timeline"] = merged
                        print(f"    → added {added} new timeline events")
                    elif added > 0:
                        print(f"    [dry-run] would add {added} timeline events")
        else:
            print(f"  FAILED to fetch")

    # Sync data sources list
    feeds_by_url = {f.get("url"): f for f in feeds}
    for entry in data.get("sources", []):
        f = feeds_by_url.get(entry.get("url"))
        if not f:
            continue
        entry["ingested"] = f.get("ingested", entry.get("ingested"))
        entry["lastFetched"] = f.get("lastFetched", entry.get("lastFetched"))
        if f.get("status") is not None:
            entry["status"] = f.get("status")
        if f.get("length") is not None:
            entry["length"] = f.get("length")

    data["lastUpdated"] = now_iso()

    # Diff review
    if not args.dry_run:
        old_data = load_json(DATA_FILE)
        diffs = diff_simple(old_data, data)
        if diffs:
            print()
            print("Changes detected:")
            for d in diffs[:20]:
                print(f"  • {d}")
            if len(diffs) > 20:
                print(f"  ... and {len(diffs) - 20} more")
        else:
            print("No structural changes.")

    print()
    if args.dry_run:
        print("[DRY RUN] No files modified.")
    else:
        save_json(DATA_FILE, data)
        save_json(SOURCES_FILE, sources)
        print("Saved data.json and sources.json")

    print("=" * 60)


if __name__ == "__main__":
    main()
