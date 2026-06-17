#!/usr/bin/env python3
"""
ImmiFlight — USCIS Fee Scraper
Runs via GitHub Actions on a weekly cron schedule.
Fetches current filing fees from USCIS.gov and updates data/fees.json.
"""

import json
import re
import sys
import os
from datetime import date
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Missing dependencies. Run: pip install requests beautifulsoup4")
    sys.exit(1)

FEES_JSON = Path(__file__).parent.parent / "data" / "fees.json"
USCIS_FEES_URL = "https://www.uscis.gov/forms/filing-fees"

# Map form numbers to their gate/index in our JSON structure
# This tells the scraper which forms to look for and where to update them
FORM_TARGETS = {
    "I-130":  ("A", 0),
    "I-485":  ("A", 2),
    "I-751":  ("A", 3),
    "I-140":  ("B", 0),
    "I-765":  ("B", 1),
    "I-539":  ("B", 2),
    "I-129":  ("B", 3),
    "I-131":  ("B", 4),
    "N-400":  ("C", 0),
    "N-600":  ("C", 1),
    "I-90":   ("C", 2),
}

def fetch_uscis_fees():
    """Scrape the USCIS fee schedule page and return a dict of {form: fee}."""
    print(f"Fetching: {USCIS_FEES_URL}")
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; ImmiFlight-bot/1.0; "
            "+https://github.com/charmander1991/immiflight)"
        )
    }

    try:
        resp = requests.get(USCIS_FEES_URL, headers=headers, timeout=20)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"ERROR: Could not fetch USCIS page — {e}")
        return None

    soup = BeautifulSoup(resp.text, "html.parser")
    fees_found = {}

    # USCIS fee page structure: look for tables or fee-schedule divs
    # The page lists forms with their fees in table rows
    # Pattern: form number near a dollar amount
    fee_pattern = re.compile(r'\$\s*([\d,]+)')

    # Try table rows first
    for row in soup.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue

        row_text = " ".join(c.get_text(" ", strip=True) for c in cells)

        # Look for form numbers like I-130, N-400, etc.
        form_match = re.search(r'\b([A-Z]-\d{3,4}[A-Z]?|N-\d{3,4})\b', row_text)
        fee_match = fee_pattern.search(row_text)

        if form_match and fee_match:
            form_num = form_match.group(1)
            fee_str = fee_match.group(1).replace(",", "")
            try:
                fees_found[form_num] = int(fee_str)
                print(f"  Found: {form_num} = ${fee_str}")
            except ValueError:
                pass

    # Also try definition lists and paragraph-based layouts
    if not fees_found:
        print("  Table parsing found nothing, trying text scan...")
        full_text = soup.get_text(" ")
        for form in FORM_TARGETS:
            pattern = re.compile(
                rf'{re.escape(form)}[^\$]{{0,80}}\$([\d,]+)',
                re.IGNORECASE
            )
            m = pattern.search(full_text)
            if m:
                fee_val = int(m.group(1).replace(",", ""))
                fees_found[form] = fee_val
                print(f"  Text scan found: {form} = ${fee_val}")

    return fees_found if fees_found else None


def update_fees_json(scraped_fees):
    """Compare scraped fees to fees.json and update if different."""
    if not FEES_JSON.exists():
        print(f"ERROR: {FEES_JSON} not found.")
        return False

    with open(FEES_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    changes = []

    for form_num, (gate, idx) in FORM_TARGETS.items():
        if form_num not in scraped_fees:
            continue

        new_fee = scraped_fees[form_num]
        try:
            entry = data["gates"][gate]["forms"][idx]
        except (KeyError, IndexError):
            print(f"  WARN: {form_num} not found at gates[{gate}][{idx}]")
            continue

        old_fee = entry.get("fee", 0)

        if old_fee != new_fee:
            changes.append({
                "form": form_num,
                "old": old_fee,
                "new": new_fee,
                "gate": gate,
                "idx": idx,
            })
            entry["fee"] = new_fee
            entry["status"] = "UPDATED"
            print(f"  CHANGED: {form_num} ${old_fee} → ${new_fee}")
        else:
            # Confirm status still ON TIME if no change
            if entry.get("status") == "UPDATED":
                entry["status"] = "ON TIME"

    if changes:
        data["meta"]["last_updated"] = date.today().isoformat()
        with open(FEES_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"\n✓ Updated {len(changes)} fee(s) in fees.json")
        print(f"  Date stamped: {data['meta']['last_updated']}")
        return True
    else:
        # Still update the date stamp so users know the check ran
        data["meta"]["last_updated"] = date.today().isoformat()
        with open(FEES_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print("\n✓ No fee changes detected. Date stamp updated.")
        return False


def main():
    print("=" * 50)
    print("ImmiFlight Fee Scraper")
    print("=" * 50)

    scraped = fetch_uscis_fees()

    if not scraped:
        print("\nERROR: No fees scraped. Aborting update.")
        # Exit 0 so the Action doesn't fail — just log it
        sys.exit(0)

    print(f"\nScraped {len(scraped)} form fees.")
    changed = update_fees_json(scraped)

    # Set GitHub Actions output so the commit step can be conditional
    # This writes to GITHUB_OUTPUT if running in Actions
    gh_output = os.environ.get("GITHUB_OUTPUT")
    if gh_output:
        with open(gh_output, "a") as f:
            f.write(f"changed={'true' if changed else 'false'}\n")

    print("\nDone.")


if __name__ == "__main__":
    main()
