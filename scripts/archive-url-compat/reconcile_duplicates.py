#!/usr/bin/env python3
"""Verify live OES archive redirects and stream-hash candidates before exact deletion."""
from __future__ import annotations
import argparse, hashlib, json, subprocess, sys, urllib.parse
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = ROOT / "ARCHIVE-META/Reconciliation/oes-archive-url-compat-2026-11-01.json"
REMOTE = "wasabi:media.otorlymern-electrical.com/OES-ARCHIVE"
ORIGIN = "https://media.otorlymern-electrical.com"
CHUNK = "5Mi"

def remote_sha256(path: str) -> tuple[str, int]:
    proc = subprocess.Popen(["rclone", "--s3-chunk-size", CHUNK, "cat", f"{REMOTE}/{path}"], stdout=subprocess.PIPE)
    digest = hashlib.sha256()
    size = 0
    assert proc.stdout is not None
    for block in iter(lambda: proc.stdout.read(1024 * 1024), b""):
        digest.update(block)
        size += len(block)
    rc = proc.wait()
    if rc:
        raise RuntimeError(f"rclone cat failed for {path} (exit {rc})")
    return digest.hexdigest(), size

def head(url: str) -> tuple[int, str, int | None]:
    raw = subprocess.check_output([
        "curl", "-sS", "-I", "-D", "-", "-o", "/dev/null", "-w", "\n%{http_code}\n%{redirect_url}", url
    ], text=True)
    lines = raw.splitlines()
    numeric = [i for i, line in enumerate(lines) if line.isdigit()]
    if not numeric:
        raise RuntimeError(f"could not parse HTTP status from curl for {url}")
    code_index = numeric[-1]
    code = int(lines[code_index])
    location = lines[code_index + 1] if code_index + 1 < len(lines) else ""
    content_length = None
    for line in lines[:code_index]:
        if line.lower().startswith("content-length:"):
            value = line.split(":", 1)[1].strip()
            if value.isdigit(): content_length = int(value)
    return code, location, content_length

def encoded(path: str) -> str:
    return urllib.parse.quote(path, safe="/-._~")

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--apply", action="store_true", help="delete keys only after every redirect and byte check passes")
    parser.add_argument("--limit", type=int, default=25, help="process at most 25 candidates (default: 25)")
    parser.add_argument("--offset", type=int, default=0, help="skip this many candidates before processing")
    args = parser.parse_args()
    if args.limit < 1 or args.limit > 25:
        parser.error("--limit must be between 1 and 25")
    data = json.loads(args.manifest.read_text(encoding="utf-8"))
    redirects = data["redirects"]
    candidates = data["remote_delete_candidates"]
    redirect_targets = {
        urllib.parse.unquote(value.removeprefix("/OES-ARCHIVE/"))
        for value in redirects.values()
        if value.startswith("/OES-ARCHIVE/")
    }
    candidates = candidates[args.offset:]
    if args.limit:
        candidates = candidates[:args.limit]
    failed = []
    passed = []
    target_hashes: dict[str, str] = {}
    for row in candidates:
        old, canonical = row["old_path"], row["canonical_path"]
        expected_sha, expected_size = row.get("sha256"), row.get("size")
        key = "/OES-ARCHIVE/" + encoded(old)
        expected_target = "/OES-ARCHIVE/" + encoded(canonical)
        if key not in redirects or redirects[key] != expected_target:
            failed.append({"old_path": old, "stage": "manifest_redirect_missing_or_wrong"}); continue
        if old in redirect_targets:
            failed.append({"old_path": old, "stage": "old_path_required_as_canonical_target"}); continue
        query_probe = "oes-compat-check=1"
        old_url = ORIGIN + "/OES-ARCHIVE/" + encoded(old) + "?" + query_probe
        target_url = ORIGIN + expected_target + "?" + query_probe
        code, location, _ = head(old_url)
        location_parts = urllib.parse.urlsplit(location)
        if (code not in (301, 302, 307, 308)
                or location_parts.path != expected_target
                or location_parts.query != query_probe):
            failed.append({"old_path": old, "stage": "live_redirect_failed", "status": code, "location": location}); continue
        target_code, _, target_length = head(target_url)
        if target_code != 200 or (target_length is not None and target_length not in (0, expected_size)):
            failed.append({"old_path": old, "stage": "canonical_http_check_failed", "status": target_code, "length": target_length}); continue
        try:
            old_sha, old_size = remote_sha256(old)
            if old_sha != expected_sha or old_size != expected_size:
                failed.append({"old_path": old, "stage": "old_sha256_or_size_mismatch", "actual": old_sha, "size": old_size}); continue
            if canonical not in target_hashes:
                target_hashes[canonical] = remote_sha256(canonical)
            target_sha, target_size = target_hashes[canonical]
            if target_sha != expected_sha or target_size != expected_size:
                failed.append({"old_path": old, "stage": "canonical_sha256_or_size_mismatch", "actual": target_sha, "size": target_size}); continue
        except Exception as exc:
            failed.append({"old_path": old, "stage": "stream_hash_error", "error": str(exc)}); continue
        passed.append(row)
        if len(passed) % 25 == 0:
            print(f"verified {len(passed)}/{len(candidates)} delete candidates", file=sys.stderr, flush=True)
    report = {"checked_at": datetime.now(timezone.utc).isoformat(), "apply_requested": args.apply,
              "candidate_count": len(candidates), "verified_count": len(passed), "failed_count": len(failed),
              "failures": failed, "deleted": []}
    if failed:
        print(json.dumps(report, indent=2)); return 1
    if args.apply:
        for i, row in enumerate(passed, 1):
            subprocess.run(["rclone", "--s3-chunk-size", CHUNK, "deletefile", f"{REMOTE}/{row['old_path']}"], check=True)
            report["deleted"].append(row["old_path"])
            if i % 25 == 0:
                print(f"deleted {i}/{len(passed)} verified duplicate keys", file=sys.stderr, flush=True)
    print(json.dumps(report, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
