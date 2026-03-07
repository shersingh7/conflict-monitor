#!/usr/bin/env python3
"""
Update conflict-monitor data from sources.
Enhanced version with proper web fetching and parsing.
Run daily via cron to keep data fresh.
"""

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

DATA_FILE = Path(__file__).parent / "data.json"
SOURCES_FILE = Path(__file__).parent / "sources.json"
SCRAPLING_SCRIPT = Path("/Users/shersingh/.openclaw/workspace/tools/scrapling/scrapling_quickstart.py")

def load_data():
    with open(DATA_FILE) as f:
        return json.load(f)

def save_data(data):
    data["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

def load_sources():
    with open(SOURCES_FILE) as f:
        return json.load(f)

def save_sources(sources):
    sources["lastUpdated"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with open(SOURCES_FILE, "w") as f:
        json.dump(sources, f, indent=2)
        f.write("\n")

def fetch_with_scrapling(url, selector=None):
    """Fetch URL using scrapling (static mode first, dynamic fallback)."""
    try:
        cmd = ["python3", str(SCRAPLING_SCRIPT), "--url", url, "--mode", "auto"]
        if selector:
            cmd.extend(["--selector", selector, "--json"])
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0:
            return json.loads(result.stdout)
        else:
            print(f"Scrapling error: {result.stderr}", file=sys.stderr)
            return None
    except subprocess.TimeoutExpired:
        print(f"Timeout fetching {url}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Error fetching {url}: {e}", file=sys.stderr)
        return None

def extract_numbers(text):
    """Extract numbers from text (casualties, counts, etc.)."""
    numbers = re.findall(r'\b(\d{1,3}(?:,\d{3})*|\d+)\b', text)
    return [int(n.replace(',', '')) for n in numbers]

def parse_wikipedia_table(content):
    """Parse Wikipedia casualty/loss tables."""
    # Extract casualty numbers from the content
    # This is a simplified parser - Wikipedia structure varies
    data = {}
    
    # Look for patterns like "killed: 123" or "168 killed"
    killed_match = re.search(r'(\d[\d,]*)\s*(?:killed|dead|deaths?)', content, re.IGNORECASE)
    injured_match = re.search(r'(\d[\d,]*)\s*(?:injured|wounded)', content, re.IGNORECASE)
    
    if killed_match:
        data['killed'] = int(killed_match.group(1).replace(',', ''))
    if injured_match:
        data['injured'] = int(injured_match.group(1).replace(',', ''))
    
    return data

def fetch_source(source):
    """Fetch a single source and return parsed content."""
    url = source.get("url")
    name = source.get("name", url)
    
    print(f"Fetching: {name}")
    
    result = fetch_with_scrapling(url)
    if result:
        return {
            "status": result.get("status"),
            "title": result.get("title"),
            "url": result.get("url"),
            "length": result.get("length"),
            "fetched": True
        }
    return {"fetched": False, "error": "Failed to fetch"}

def update_from_wikipedia(data, sources):
    """Fetch Wikipedia pages and extract updates."""
    wiki_sources = [s for s in sources.get("feeds", []) if "wikipedia" in s.get("url", "").lower()]
    
    for source in wiki_sources:
        if source.get("ingested") and source.get("lastFetched") == datetime.now(timezone.utc).strftime("%Y-%m-%d"):
            print(f"  Already fetched today: {source.get('name')}")
            continue
        
        print(f"  Fetching: {source.get('name')}")
        result = fetch_with_scrapling(source.get("url"))
        
        if result:
            # Extract timeline events from Wikipedia content
            # The actual parsing would need the full HTML/text
            # For now, we mark as fetched and update the source
            source["ingested"] = True
            source["lastFetched"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            source["status"] = result.get("status")
            print(f"    Status: {result.get('status')}, Length: {result.get('length')} chars")
    
    return data

def update_from_news(data, sources):
    """Fetch news sources and extract updates."""
    news_sources = [s for s in sources.get("feeds", []) 
                    if s.get("type") in ("news_article", "news_index") 
                    and s.get("access") != "blocked_401_js"]
    
    for source in news_sources:
        if source.get("ingested") and source.get("lastFetched") == datetime.now(timezone.utc).strftime("%Y-%m-%d"):
            print(f"  Already fetched today: {source.get('name')}")
            continue
        
        print(f"  Fetching: {source.get('name')}")
        result = fetch_with_scrapling(source.get("url"))
        
        if result:
            source["ingested"] = True
            source["lastFetched"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            source["status"] = result.get("status")
            print(f"    Status: {result.get('status')}, Length: {result.get('length')} chars")
    
    return data

def update_from_official(data, sources):
    """Fetch official sources (DoD, IDF, etc.) and extract updates."""
    official_sources = [s for s in sources.get("feeds", []) 
                       if s.get("type") == "official"
                       and s.get("access") not in ("blocked_401_js",)]
    
    for source in official_sources:
        if source.get("ingested") and source.get("lastFetched") == datetime.now(timezone.utc).strftime("%Y-%m-%d"):
            print(f"  Already fetched today: {source.get('name')}")
            continue
        
        print(f"  Fetching: {source.get('name')}")
        result = fetch_with_scrapling(source.get("url"))
        
        if result:
            source["ingested"] = True
            source["lastFetched"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            source["status"] = result.get("status")
            print(f"    Status: {result.get('status')}, Length: {result.get('length')} chars")
    
    return data

def update_day_count(data):
    """Update the conflict day count based on start date."""
    start_date = datetime(2026, 2, 28, tzinfo=timezone.utc)
    today = datetime.now(timezone.utc)
    data["conflict"]["dayCount"] = (today - start_date).days + 1
    return data

def main():
    print("=" * 60)
    print("Conflict Monitor Updater (Enhanced)")
    print("=" * 60)
    print(f"Running at: {datetime.now(timezone.utc).isoformat()}")
    print()
    
    # Load current data
    data = load_data()
    sources = load_sources()
    
    # Update day count
    data = update_day_count(data)
    print(f"Conflict Day: {data['conflict']['dayCount']}")
    print()
    
    # Fetch from different source types
    print("Fetching Wikipedia sources...")
    data = update_from_wikipedia(data, sources)
    print()
    
    print("Fetching news sources...")
    data = update_from_news(data, sources)
    print()
    
    print("Fetching official sources...")
    data = update_from_official(data, sources)
    print()
    
    # Save updated data
    save_data(data)
    save_sources(sources)
    
    print("Data files updated.")
    print()
    print("=" * 60)
    print("Note: This script fetches content but does NOT auto-parse")
    print("casualty/loss numbers yet. Manual review recommended.")
    print("Use the web_fetch tool or browser for detailed extraction.")
    print("=" * 60)

if __name__ == "__main__":
    main()