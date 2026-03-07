#!/usr/bin/env python3
"""
Update conflict-monitor data from sources.
Run daily via cron to keep data fresh.
"""

import json
import urllib.request
import urllib.error
import re
from datetime import datetime
from pathlib import Path

DATA_FILE = Path(__file__).parent / "data.json"
SOURCES_FILE = Path(__file__).parent / "sources.json"

def load_data():
    with open(DATA_FILE) as f:
        return json.load(f)

def save_data(data):
    data["lastUpdated"] = datetime.utcnow().isoformat() + "Z"
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

def load_sources():
    with open(SOURCES_FILE) as f:
        return json.load(f)

def fetch_url(url):
    """Fetch URL and return text content."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def extract_casualty_updates(text, data):
    """Extract casualty numbers from text and update data."""
    # This is a placeholder - actual extraction would need more sophisticated parsing
    # For now, we just mark that we attempted an update
    pass

def update_from_sources():
    """Fetch all sources and update data."""
    data = load_data()
    sources = load_sources()
    
    updated = False
    for source in sources.get("feeds", []):
        if source.get("ingested"):
            continue
        url = source.get("url")
        if not url:
            continue
        
        print(f"Fetching: {source.get('name', url)}")
        text = fetch_url(url)
        if text:
            source["ingested"] = True
            source["lastFetched"] = datetime.utcnow().strftime("%Y-%m-%d")
            updated = True
            # TODO: Parse and extract data from text
            # For now, we just mark as fetched
    
    # Update sources file
    with open(SOURCES_FILE, "w") as f:
        json.dump(sources, f, indent=2)
        f.write("\n")
    
    if updated:
        save_data(data)
        print("Data updated.")
    else:
        print("No new updates.")
    
    return updated

def main():
    print(f"Conflict Monitor Updater")
    print(f"========================")
    print(f"Running at: {datetime.utcnow().isoformat()}")
    print()
    
    update_from_sources()

if __name__ == "__main__":
    main()