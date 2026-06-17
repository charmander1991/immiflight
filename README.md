# ✈ ImmiFlight

**U.S. Immigration Fee Departures Board**

A retro airport-style departure board that displays current USCIS filing fees, biometrics costs, state fees, and attorney estimates. Auto-updates weekly via GitHub Actions.

> *"Know before you go."*

---

## Live Demo

Deployed at: `https://[your-username].github.io/immiflight`

---

## Features

- 🖥 Full airport flip-board UI — amber-on-black, VT323 font, flip animations
- 4 Gates: Family · Employment · Citizenship · State & Attorney
- Live clock + last-updated timestamp
- Auto-scrolling notice ticker
- Per-gate fee totals
- Status tags: `ON TIME` · `UPDATED` · `CHECK IN` · `ESTIMATE`
- Weekly auto-update via GitHub Actions (scrapes USCIS.gov)
- Zero hosting cost — GitHub Pages + Actions free tier

---

## Project Structure

```
immiflight/
├── index.html                      # The app
├── style.css                       # Flip-board styling
├── app.js                          # Data loader + animation engine
├── data/
│   └── fees.json                   # Fee data (auto-updated)
└── .github/
    └── workflows/
        ├── update_fees.yml         # Weekly cron workflow
        └── scraper.py              # USCIS scraper
```

---

## Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set Source: `Deploy from a branch` → `main` → `/ (root)`
4. Save — your site is live in ~60 seconds

The `update_fees.yml` workflow runs automatically every Sunday. You can also trigger it manually from the **Actions** tab.

---

## Manual Fee Updates

If the scraper breaks (USCIS redesigns their page), edit `data/fees.json` directly:

```json
{
  "meta": {
    "last_updated": "2025-04-01"
  },
  "gates": {
    "A": {
      "forms": [
        { "form": "I-130", "fee": 675, "status": "ON TIME", ... }
      ]
    }
  }
}
```

Set `"status": "UPDATED"` on any changed row and it will highlight on the board.

---

## Data Sources

| Gate | Source |
|------|--------|
| A–C  | [USCIS Filing Fees](https://www.uscis.gov/forms/filing-fees) |
| D    | Attorney cost estimates (manually curated) |

> **Disclaimer:** Fees are subject to change. Always verify on [uscis.gov](https://www.uscis.gov) before filing. This tool is for informational purposes only and does not constitute legal advice.

---

## Stack

- Vanilla HTML/CSS/JS — no framework, no build step
- GitHub Pages (free static hosting)
- GitHub Actions (free tier: 2,000 min/month)
- Python 3 + `requests` + `beautifulsoup4` (scraper only)

---

Built by RJ Medina · [github.com/charmander1991](https://github.com/charmander1991)
