# OES archive URL compatibility Worker

The Worker handles `GET` and `HEAD` requests on `media.otorlymern-electrical.com/*`. It redirects retired `/pdfs/...` URLs and old `/OES-ARCHIVE/...` keys to canonical Wasabi paths with `308`, preserves query strings, and falls through to the existing origin when a path is not mapped.

`../../ARCHIVE-META/Reconciliation/oes-archive-url-compat-2026-11-01.json` is the original reconciliation manifest. `redirects.mjs` is generated from that manifest. `redirect-overrides.mjs` contains 11 URL-only Unicode normalization corrections: each actual NFD destination was verified against the expected SHA-256 and serves `200`; the original manifest targets and delete candidates were left unchanged.

## Deployment and verification

Deploy with Wrangler:

```sh
npx wrangler deploy --config scripts/archive-url-compat/wrangler.toml
```

The current deployment is version `402d5e71-9119-435a-89d3-30a036ca9e80`, with 4,220 redirect entries on `media.otorlymern-electrical.com/*`. The durable deployment record, exact map copy, Unicode override evidence, and Wasabi inventories are in `ARCHIVE-META/Reconciliation/`.

## Duplicate cleanup guard

Run `reconcile_duplicates.py` only with batches of 25 or fewer. Its default is 25; it rejects larger limits. Each candidate is checked against the manifest and deployed redirect map, rejected if its old key is a redirect destination, tested with a query string, checked for a live redirect and a `200` canonical response, then streamed from Wasabi so old and canonical sizes and SHA-256 values must match before the old key is deleted. Every rclone command supplies `--s3-chunk-size 5Mi`.

The final reconciliation report records 2,171 verified deletions and 11 candidates retained for human review. Those 11 have a Unicode-normalization mismatch between the manifest's NFC destination and Wasabi's existing NFD key. URL-only overrides keep the old links working; the old keys remain because the manifest's canonical target does not exist under its exact spelling.
