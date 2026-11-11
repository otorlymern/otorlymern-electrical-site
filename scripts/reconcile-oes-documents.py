#!/usr/bin/env python3
"""Reconcile all local OES-ARCHIVE files with the public Wasabi prefix.

Inventory mode is read-only. Apply mode copies missing local files and preserves
remote-only unique objects under local Remote-Only/. It never deletes remote data.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.parse import quote

EXTENSIONS = None  # None means every regular file type in the archive.


def files(root: Path):
    for base, dirs, names in os.walk(root):
        dirs.sort()
        for name in sorted(names):
            p = Path(base) / name
            if name == ".DS_Store" or name.startswith(".smbdelete") or name.startswith("._") or not p.is_file():
                continue
            yield p


def hashes(path: Path) -> tuple[str, str]:
    sha, md5 = hashlib.sha256(), hashlib.md5(usedforsecurity=False)
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            sha.update(block)
            md5.update(block)
    return sha.hexdigest(), md5.hexdigest()


def run(args: list[str], *, capture: bool = False):
    return subprocess.run(args, check=True, text=True, capture_output=capture)


def remote_md5(rclone: list[str], remote_path: str) -> str:
    """Hash object bytes when S3 metadata cannot provide a content MD5 (for example multipart ETags)."""
    proc = subprocess.Popen(rclone + ["cat", remote_path], stdout=subprocess.PIPE)
    digest = hashlib.md5(usedforsecurity=False)
    assert proc.stdout is not None
    for block in iter(lambda: proc.stdout.read(1024 * 1024), b""):
        digest.update(block)
    if proc.wait() != 0:
        raise subprocess.CalledProcessError(proc.returncode, proc.args)
    return digest.hexdigest()


def duplicate_groups(rows: dict[str, dict]) -> list[dict]:
    groups: dict[tuple[int, str], list[str]] = defaultdict(list)
    for path, row in rows.items():
        md5 = row.get("md5")
        if md5:
            groups[(row.get("size", 0), md5)].append(path)
    return [{"size": size, "md5": digest, "paths": sorted(paths)}
            for (size, digest), paths in groups.items() if len(paths) > 1]


def write_json_atomic(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def apply_manifest(manifest_path: Path, local: Path, remote: str, chunk_size: str,
                   download_url: str) -> dict:
    """Apply a reviewed plan using the recorded hashes; preserve every old key."""
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if Path(manifest["local_root"]).resolve() != local or manifest["remote_root"].rstrip("/") != remote:
        raise ValueError("plan roots do not match the selected local and remote paths")
    rclone = ["rclone", "--s3-chunk-size", chunk_size,
              "--s3-download-url", download_url.rstrip("/") + "/"]
    current_listing = json.loads(run(rclone + ["lsjson", remote, "--recursive", "--hash"], capture=True).stdout)
    current = {}
    for obj in current_listing:
        if obj.get("IsDir"):
            continue
        path = PurePosixPath(obj["Path"])
        if path.parts[0] != ".reconciliation-backups":
            current[path.as_posix()] = obj

    local_items = [x for x in manifest["items"] if "local" in x]
    remote_only_items = [x for x in manifest["items"] if x.get("classification") == "remote_only_unique" and "remote" in x]
    uploads, backups, verified_before = [], [], 0
    for item in local_items:
        rec = item["local"]
        rel, live = rec["path"], current.get(rec["path"])
        if live and live.get("Size") == rec["size"] and (live.get("Hashes") or {}).get("md5") == rec["md5"]:
            verified_before += 1
            continue
        if live:
            backups.append(rel)
            uploads.append(rel)
            continue
        uploads.append(rel)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for rel in backups:
        backup = f"{remote}/.reconciliation-backups/{stamp}/{rel}"
        run(rclone + ["copyto", f"{remote}/{rel}", backup, "--no-traverse"])

    remote_only_canonical = []
    for item in remote_only_items:
        rec = item["remote"]
        rel = rec["path"]
        source = f"{remote}/{rel}"
        canonical_rel = f"Remote-Only/{rel}"
        local_target = local / canonical_rel
        if local_target.exists():
            local_md5 = hashes(local_target)[1]
            if local_target.stat().st_size != rec["size"] or local_md5 != rec["md5"]:
                local_target = local_target.with_name(
                    f"{local_target.stem}__remote-{rec['md5'][:10]}{local_target.suffix}")
                canonical_rel = local_target.relative_to(local).as_posix()
                canonical_remote = f"{remote}/{canonical_rel}"
        if not local_target.exists():
            local_target.parent.mkdir(parents=True, exist_ok=True)
            run(rclone + ["copyto", source, str(local_target), "--no-traverse"])
        uploads.append(canonical_rel)
        remote_only_canonical.append({"source_remote_path": rel, "canonical_relative_path": canonical_rel,
                                      "size": rec["size"], "md5": rec["md5"]})

    if uploads:
        if any("\n" in rel or "\r" in rel for rel in uploads):
            raise ValueError("newline-containing paths require individual upload handling")
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", delete=False) as handle:
            file_list = Path(handle.name)
            handle.write("\n".join(uploads) + "\n")
        try:
            run(rclone + ["copy", str(local), remote, "--files-from-raw", str(file_list),
                          "--ignore-times", "--progress", "--stats", "30s"])
        finally:
            file_list.unlink(missing_ok=True)

    verify_listing = json.loads(run(rclone + ["lsjson", remote, "--recursive", "--hash"], capture=True).stdout)
    verified = {}
    for obj in verify_listing:
        if obj.get("IsDir"):
            continue
        path = PurePosixPath(obj["Path"])
        if path.parts[0] != ".reconciliation-backups":
            verified[path.as_posix()] = obj
    mismatches = []
    for item in local_items:
        expected = item["local"]
        actual = verified.get(expected["path"])
        actual_md5 = (actual.get("Hashes") or {}).get("md5") if actual else None
        if actual and actual.get("Size") == expected["size"] and not actual_md5:
            actual_md5 = remote_md5(rclone, f"{remote}/{expected['path']}")
        if (not actual or actual.get("Size") != expected["size"]
                or actual_md5 != expected["md5"]):
            mismatches.append(expected["path"])
    remote_only_mismatches = []
    for expected in remote_only_canonical:
        actual = verified.get(expected["canonical_relative_path"])
        local_copy = local / expected["canonical_relative_path"]
        actual_md5 = (actual.get("Hashes") or {}).get("md5") if actual else None
        if actual and actual.get("Size") == expected["size"] and not actual_md5:
            actual_md5 = remote_md5(rclone, f"{remote}/{expected['canonical_relative_path']}")
        if (not actual or actual.get("Size") != expected["size"]
                or actual_md5 != expected["md5"]
                or not local_copy.is_file() or local_copy.stat().st_size != expected["size"]
                or hashes(local_copy)[1] != expected["md5"]):
            remote_only_mismatches.append(expected["canonical_relative_path"])
    manifest["application"] = {
        "applied_at": datetime.now(timezone.utc).isoformat(),
        "same_path_conflicts_backed_up": backups,
        "server_side_canonical_copies": 0,
        "local_uploads": len(uploads),
        "same_path_files_already_verified": verified_before,
        "canonical_paths_verified": len(local_items) - len(mismatches),
        "verification_mismatches": mismatches,
        "remote_only_canonical_copies": len(remote_only_canonical),
        "remote_only_verification_mismatches": remote_only_mismatches,
        "remote_only_objects_preserved": True,
        "remote_deletions": 0,
    }
    write_json_atomic(manifest_path, manifest)
    return manifest["application"]


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--local", type=Path, default=Path("/Volumes/admin2/Documents/OES-ARCHIVE/DOCUMENTS"))
    p.add_argument("--remote", default="wasabi:media.otorlymern-electrical.com/OES-ARCHIVE")
    p.add_argument("--manifest", type=Path, default=Path("/Volumes/admin2/Documents/OES-ARCHIVE/ARCHIVE-META/Reconciliation/oes-documents.json"))
    p.add_argument("--remote-list-json", type=Path, help="reuse a complete current rclone lsjson --recursive --hash result")
    p.add_argument("--apply", action="store_true", help="back up same-path conflicts, copy all local files, and preserve remote-only unique files; never deletes remote objects")
    p.add_argument("--apply-manifest", type=Path, help="apply a completed inventory manifest without rehashing local files")
    p.add_argument("--chunk-size", default="5Mi", help="rclone S3 multipart chunk size (minimum 5Mi)")
    p.add_argument("--workers", type=int, default=4, help="parallel local file hashes (default: 4)")
    p.add_argument("--download-url", default="https://media.otorlymern-electrical.com/",
                   help="HTTP base used for Wasabi object downloads")
    a = p.parse_args()
    local = a.local.expanduser().resolve()
    if not local.is_dir():
        p.error(f"local archive directory is unavailable: {local}")
    remote = a.remote.rstrip("/")
    if a.apply_manifest:
        result = apply_manifest(a.apply_manifest.expanduser().resolve(), local, remote,
                                a.chunk_size, a.download_url)
        print(json.dumps(result, indent=2))
        print(f"Manifest updated: {a.apply_manifest}")
        return 0 if not result["verification_mismatches"] else 1
    rclone = ["rclone", "--s3-chunk-size", a.chunk_size,
              "--s3-download-url", a.download_url.rstrip("/") + "/"]

    if a.remote_list_json:
        listing = json.loads(a.remote_list_json.read_text(encoding="utf-8"))
    else:
        listing = json.loads(run(rclone + ["lsjson", remote, "--recursive", "--hash"], capture=True).stdout)
    remote_rows = {}
    for item in listing:
        if item.get("IsDir"):
            continue
        rel = PurePosixPath(item["Path"])
        if rel.parts[0] == ".reconciliation-backups":
            continue
        md5 = (item.get("Hashes") or {}).get("md5")
        remote_rows[rel.as_posix()] = {"path": rel.as_posix(), "size": item.get("Size"), "md5": md5}

    local_rows = {}
    local_files = list(files(local))
    def hash_local(path: Path):
        rel = path.relative_to(local).as_posix()
        sha, md5 = hashes(path)
        return rel, {"path": rel, "size": path.stat().st_size, "sha256": sha, "md5": md5}
    with ThreadPoolExecutor(max_workers=max(1, a.workers)) as pool:
        futures = [pool.submit(hash_local, path) for path in local_files]
        for index, future in enumerate(as_completed(futures), start=1):
            rel, record = future.result()
            local_rows[rel] = record
            if index % 50 == 0:
                print(f"hashed {index}/{len(local_files)} local files", file=sys.stderr, flush=True)

    remote_by_digest: dict[tuple[int, str], list[str]] = defaultdict(list)
    for rel, row in remote_rows.items():
        if row["md5"]:
            remote_by_digest[(row["size"], row["md5"])].append(rel)

    items, legacy_map = [], {}
    counts = defaultdict(int)
    for rel, lrow in sorted(local_rows.items()):
        old = remote_rows.get(rel)
        matches = sorted(remote_by_digest.get((lrow["size"], lrow["md5"]), []))
        if old and old["md5"] == lrow["md5"] and old["size"] == lrow["size"]:
            status = "identical"
        elif old:
            status = "same_path_different_content"
        elif matches:
            status = "same_content_different_path"
            legacy_map["/OES-ARCHIVE/" + quote(matches[0], safe="/-._~")] = "/OES-ARCHIVE/" + quote(rel, safe="/-._~")
        else:
            status = "local_only"
        counts[status] += 1
        items.append({"classification": status, "local": lrow, "remote_at_canonical_path": old,
                      "remote_same_content_paths": matches})

    local_digests = {(r["size"], r["md5"]) for r in local_rows.values()}
    for rel, rrow in sorted(remote_rows.items()):
        if not rrow["md5"] or (rrow["size"], rrow["md5"]) not in local_digests:
            counts["remote_only_unique"] += 1
            items.append({"classification": "remote_only_unique", "remote": rrow})

    manifest = {"schema": 2, "generated_at": datetime.now(timezone.utc).isoformat(),
                "local_root": str(local), "remote_root": remote,
                "hash_authority": "local SHA-256 and MD5; Wasabi S3 MD5 metadata for remote comparisons",
                "counts": {"local_files": len(local_rows), "remote_files": len(remote_rows), **dict(counts)},
                "items": items, "legacy_path_mapping": legacy_map,
                "exact_duplicate_groups": {"local": duplicate_groups(local_rows),
                                           "remote": duplicate_groups(remote_rows)},
                "safety": "Apply backs up same-path conflicts and copies local paths. It preserves all remote-only objects and performs no deletes or moves."}

    if a.apply:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        for rel, lrow in sorted(local_rows.items()):
            old = remote_rows.get(rel)
            if old and (old["md5"] != lrow["md5"] or old["size"] != lrow["size"]):
                backup = f"{remote}/.reconciliation-backups/{stamp}/{rel}"
                run(rclone + ["copyto", f"{remote}/{rel}", backup, "--no-traverse"])
        run(rclone + ["copy", str(local), remote, "--checksum", "--create-empty-src-dirs"])
        verified_listing = json.loads(run(rclone + ["lsjson", remote, "--recursive", "--hash"], capture=True).stdout)
        verified = {PurePosixPath(x["Path"]).as_posix(): x for x in verified_listing
                    if not x.get("IsDir")
                    and PurePosixPath(x["Path"]).parts[0] != ".reconciliation-backups"}
        mismatches = []
        for rel, local_row in local_rows.items():
            remote_row = verified.get(rel)
            remote_md5 = (remote_row.get("Hashes") or {}).get("md5") if remote_row else None
            if not remote_row or remote_row.get("Size") != local_row["size"] or remote_md5 != local_row["md5"]:
                mismatches.append(rel)
        manifest["post_apply_verification"] = {"local_files_expected": len(local_rows),
                                                "canonical_paths_verified": len(local_rows) - len(mismatches),
                                                "mismatches": mismatches,
                                                "remote_only_objects_preserved": True}

    a.manifest.parent.mkdir(parents=True, exist_ok=True)
    tmp = a.manifest.with_suffix(a.manifest.suffix + ".tmp")
    tmp.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, a.manifest)
    print(json.dumps(manifest["counts"], indent=2))
    print(f"Manifest: {a.manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
