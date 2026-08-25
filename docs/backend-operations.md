# OES Backend Operations

This is the small operational record for the static OES website and its supporting services. It records boundaries and decisions that would otherwise be easy to forget; it is not a dashboard or application.

## Service boundaries

- Neocities hosts the intentionally public `_deploy` artifact only.
- Cloudflare provides authoritative DNS, CDN/cache behavior, security controls, redirects, Web Analytics, and Zaraz.
- Wasabi stores public media and PDFs. The media bucket is public-read-only by exact object URL; listing and anonymous writes are denied. Confidential material belongs in a separate private bucket.
- PeerTube hosts video.
- Formspree handles forms.
- Namecheap remains the registrar and Private Email provider.
- GitHub stores source and deploys `_deploy` through Actions.

## Wasabi incident status

- The unexpected `/graphql`, `/api/graphql`, and `/v1/graphql` objects were treated as suspicious unauthorized objects, not proof of a confirmed account compromise.
- Root and superseded application keys were removed, a dedicated media-management identity is in use, and root MFA is enabled.
- `oes-media-access-logs` is the separate private access-log bucket.
- Exact-object public GET is expected. Anonymous LIST, PUT, DELETE, overwrite, and ACL changes are expected to return 403.
- P0 remains open only until the first passive access-log object is confirmed in the logging bucket.

## Publishing and cache policy

- Production is built from source into untracked `_deploy`; repository contents are not deployed directly.
- HTML bypasses Cloudflare cache so visitors and crawlers receive current Neocities content.
- Static CSS, JavaScript, fonts, and images use one-hour browser caching and seven-day edge caching.
- Public Wasabi media uses one-hour browser caching and 30-day edge caching.
- Error responses are not stored long-term.
- Each successful GitHub deployment performs a full purge using a token limited to `otorlymern-electrical.com` Cache Purge access.

## Search Console baseline — 2026-08-25

Three-month Web Search report, last updated approximately 2026-08-25:

- Property: 1,194 impressions, 10 clicks, 0.8% CTR, average position 10.
- `/services/experience`: 974 impressions, 2 clicks, 0.2% CTR, average position 5.7.
- Query `augie calabro` on that page: 948 impressions, 0 clicks, average position 5.7.
- Query `swan356` on that page: 5 impressions, 0 clicks, average position 12.8.
- Devices for the Experience page: mobile 849 impressions, desktop 79, tablet 25; the table attributed no clicks to those visible device rows.
- Highest visible country totals included United States 349, France 115, and Germany 114 impressions.

Diagnosis: this is primarily a personal-name search-result/snippet mismatch, not broad generic service traffic. The first response is to align the title, description, visible H1, and Person/Organization structured data with the demonstrated `Augie Calabro` intent. Compare the same page/query report after four to six weeks; do not infer success from property-wide traffic alone.

## Content-object pilots

- Five manual records establish the `/manuals/library/<archive-id>/` pattern, including the ARP 2600, Buchla 100, Roland TR-606, EMS VCS 3, and Digisound Modular records.
- `/systems/home-recording` is the editorial/technical-guide pilot. Its canonical page connects computerless recording history, practical tape workflows, curated recording resources, the deeper archive, and OES tape services.
- `/oes-patch-builder/` is the interactive-tool pilot. Its dedicated canonical page explains the tool and links into related OES material; `/solutions/resources/` may still embed the builder with `?embedded=1` without replacing the dedicated page.
- Review usefulness, indexing, query relevance, and visitor paths before adding more pilots or scaling any page pattern.

## Routine checks

- After deployment: confirm current HTML, sitemap, robots, redirects, Googlebot responses, external-referrer media access, and protected Wasabi listing/write behavior.
- Monthly: inspect Search Console indexing and queries, Cloudflare Web Analytics/Core Web Vitals, Wasabi access logs, account alerts, renewals, and email authentication reports.
- Record incidents and rollback notes here until a real need justifies another file.
