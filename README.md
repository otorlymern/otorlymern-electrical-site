Otorlymern Electrical Systems, Solutions & Services is a provider of everything related to the audio and video arts.
We are split into 3 branches
Systems
we take old gear and try and make it nice again
take old non music electronics and force them to be musical
or just make somestuff up that we wish already existed
Services
Sliding-scale repair work, consulting, recording sessions, installations, and tape services.
Solutions
schematics, manuals, DIY projects, and resources collected over the last decade and dumped in one place for the greater good.
# OES document archive reconciliation

`/Volumes/admin2/Documents/OES-ARCHIVE/DOCUMENTS` is the canonical local tree for all archive file types. `scripts/reconcile-oes-documents.py` inventories every regular file (skipping Finder sidecars and stale SMB deletion tombstones) and the matching Wasabi prefix. It uses local SHA-256 plus size and remote MD5 metadata; multipart objects without MD5 metadata require streamed verification. The script copies local files to matching Wasabi paths and preserves remote-only unique objects under local `Remote-Only/`. It never deletes objects. Remote content conflicts at the same path are backed up before a local replacement.

Run a read-only inventory:

```sh
python3 scripts/reconcile-oes-documents.py
```

Review the manifest, then apply it:

```sh
python3 scripts/reconcile-oes-documents.py --apply-manifest /Volumes/admin2/Documents/OES-ARCHIVE/ARCHIVE-META/Reconciliation/oes-documents.json
```

Duplicate removal is a separate, logged action. A duplicate requires verified identical bytes, and every removed public key must have a working compatibility redirect or updated reference first. Keep repeated project, firmware, and configuration files when their folder path carries version or bundle context. Never run a blanket `rclone sync --delete` against the archive.


The 2026-11-01 full-archive reconciliation record is in `ARCHIVE-META/Reconciliation/oes-archive-full-plan-2026-10-31.json`. Filename standardization uses the prior local catalog's proposals matched by SHA-256; only collision-free `legacy_candidate` names with no metadata conflicts were applied. Old Wasabi keys remain until the compatibility Worker in `scripts/archive-url-compat/` is live and verified. Remote duplicate deletion must use `scripts/archive-url-compat/reconcile_duplicates.py --apply`, which preflights every redirect, canonical object, size, and streamed SHA-256 before deleting individual keys.
