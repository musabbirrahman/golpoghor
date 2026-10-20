#!/usr/bin/env python3
"""GolpoNeer content backup — Tier 1 (public API export).

Pulls every row the site's public (publishable-key) API can read and writes a
single JSON snapshot + manifest. Private/owner-only tables (reading progress,
notification prefs, reports, auth users) are NOT reachable this way by design;
the manifest records them as Tier 2 (Supabase dashboard pg_dump) items.

Usage: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... python3 export-backup.py [outdir]
Defaults read from the app .env when present.
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

TABLES = ["profiles", "stories", "chapters", "comments", "likes", "follows"]
TIER2_ONLY = [
    "auth.users (dashboard export)",
    "reading_progress / reading_list / notification_prefs (owner-only RLS)",
    "reports + moderation_events (moderator-only RLS)",
    "storage: covers bucket files (private bucket; dashboard/CLI download)",
]


def load_env():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    if not (url and key):
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env_path):
            for line in open(env_path):
                line = line.strip()
                if line.startswith("VITE_SUPABASE_URL="):
                    url = line.split("=", 1)[1].strip()
                elif line.startswith("VITE_SUPABASE_ANON_KEY=") or line.startswith(
                    "VITE_SUPABASE_PUBLISHABLE_KEY="
                ):
                    key = line.split("=", 1)[1].strip()
    return url, key


def fetch_table(base, key, table):
    """Fetch all rows via curl (the reliable transport in this environment),
    with retries. Raises RuntimeError on persistent failure."""
    rows = []
    page = 500
    offset = 0
    last_err = None
    while True:
        url = f"{base}/rest/v1/{table}?select=*&limit={page}&offset={offset}"
        batch = None
        for attempt in range(4):
            proc = subprocess.run(
                [
                    "curl", "-s", "-m", "60", "-w", "\n%{http_code}", url,
                    "-H", f"apikey: {key}", "-H", f"Authorization: Bearer {key}",
                ],
                capture_output=True, text=True,
            )
            out = proc.stdout
            body, _, code = out.rpartition("\n")
            if code == "200":
                try:
                    batch = json.loads(body)
                    break
                except json.JSONDecodeError as e:
                    last_err = f"bad JSON: {e}"
            else:
                last_err = f"HTTP {code or proc.returncode}"
            time.sleep(2 * (attempt + 1))
        if batch is None:
            raise RuntimeError(f"{table} offset {offset}: {last_err}")
        rows.extend(batch)
        if len(batch) < page:
            return rows
        offset += page


def main():
    base, key = load_env()
    if not (base and key):
        print("ERROR: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY not set and no .env found")
        return 1
    outdir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(outdir, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    snapshot = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "source": base,
        "tier": "1-public-api",
        "tables": {},
        "failures": {},
        "tier2_only": TIER2_ONLY,
    }
    for table in TABLES:
        try:
            rows = fetch_table(base, key, table)
            snapshot["tables"][table] = {"count": len(rows), "rows": rows}
            print(f"{table}: {len(rows)} rows")
        except Exception as e:  # noqa: BLE001
            snapshot["failures"][table] = str(e)
            print(f"{table}: FAILED {e} (recorded in manifest)")
    path = os.path.join(outdir, f"golponeer-backup-{stamp}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False)
    size_mb = os.path.getsize(path) / 1e6
    print(f"snapshot: {path} ({size_mb:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
