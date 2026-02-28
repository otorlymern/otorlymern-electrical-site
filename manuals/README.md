# OES Manuals Archive

This folder powers the QR destination page at `/manuals/`.

## Stack
- Static HTML/CSS/JS
- Data-driven from one JSON file: `manuals/data/archive.json`
- No external paid services

## Files
- `manuals/index.html` - landing page + viewer layout
- `manuals/manuals-archive.css` - visual styling, responsive layout, print styles
- `manuals/manuals-archive.js` - search, recent sold units, PDF.js viewer, deep links
- `manuals/data/archive.json` - manuals + sold units content

## Data Schema

### Manual
```json
{
  "id": "revox-a77",
  "title": "Revox A77 User Manual",
  "brand": "Revox",
  "model": "A77",
  "manualCode": "OES-REVOX-A77",
  "tags": ["tape", "reel-to-reel"],
  "pdfUrl": "/path/to/manual.pdf",
  "thumbnailUrl": "/path/to/image.png",
  "notes": "Optional notes",
  "createdAt": "2025-09-14",
  "updatedAt": "2026-02-21"
}
```

### SoldUnit
```json
{
  "id": "sold-2026-001",
  "manualId": "revox-a77",
  "manualCode": "OES-REVERB-011",
  "itemName": "Revox A77 Mk IV Service + Alignment Unit",
  "soldDate": "2026-02-22",
  "platform": "Reverb",
  "serial": "A77-18429",
  "listingUrl": "https://reverb.com/shop/otorlymern-electrical"
}
```

## How To Add A New Manual
1. Add PDF file anywhere in repo (recommended: a dedicated folder with stable path).
2. Add a new object in `manuals[]` in `manuals/data/archive.json`.
3. Set:
   - unique `id` slug
   - `pdfUrl` absolute path from site root (example: `/manuals/pdfs/new-file.pdf`)
   - `updatedAt` date
4. Save + deploy.

## How To Add A Sold Unit Entry
1. Add object to `soldUnits[]` in `manuals/data/archive.json`.
2. Set `manualId` to an existing manual `id`.
3. Set the exact printed `manualCode` used on that shipped item.
4. Save + deploy.

## Rotate / Trim “Recent Sold Units”
Edit `config` in `manuals/data/archive.json`:
- `recentLimit`: number shown in sidebar
- `hideSoldOlderThanDays`: hide entries older than N days (or `null` to show all)

## Remove / Archive Entries
- To hide a sold unit: remove from `soldUnits[]`.
- To remove a manual from UI: remove from `manuals[]`.
- Keep IDs stable for existing printed manual codes when possible.

## Share URLs
- Query style (implemented): `/manuals/?m=manual-id`
- Example: `/manuals/?m=revox-a77`

## Deployment Notes
- QR target should be `https://otorlymern-electrical.com/manuals/`.
- `/archive/` redirects to `/manuals/`.
- Legacy `/services/manuals.html` also redirects to `/manuals/`.

## Package Insert Copy Block
Use this on shipped items:

```text
Manual + Support
otorlymern-electrical.com/manuals

Scan the QR or visit the link above.
Enter your Manual Code exactly as printed (example: OES-REVERB-011).
You’ll get the correct manual, support notes, and service options.
```
