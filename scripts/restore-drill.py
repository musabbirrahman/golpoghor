#!/usr/bin/env python3
"""Restore drill for a GolpoNeer Tier-1 backup snapshot.

Loads the snapshot into a throwaway local Postgres (pgserver), verifies row
counts against the manifest, then proves one published story's chapter body
is byte-identical across: live API -> snapshot file -> restored database.
"""
import hashlib
import json
import subprocess
import sys

import pgserver

SNAP = sys.argv[1]
LIVE_BASE = "https://gwqngoywcupkytyxukfu.supabase.co"
LIVE_KEY = "sb_publishable_zynfKNRZXjfZSFX6dVrdhg_mimIkF1h"


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def coltype(v):
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, (int, float)):
        return "numeric"
    if isinstance(v, (dict, list)):
        return "jsonb"
    return "text"


def canon(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True)


def main():
    snap = json.load(open(SNAP, encoding="utf-8"))
    server = pgserver.get_server("/tmp/drillpg")
    psql = server.psql

    def q(sql):
        out = psql(sql)
        return out

    results = []
    for table, payload in snap["tables"].items():
        rows = payload["rows"]
        if not rows:
            results.append((table, 0, 0, "empty"))
            continue
        cols = list(rows[0].keys())
        defs = []
        for c in cols:
            sample = next((r[c] for r in rows if r.get(c) is not None), None)
            defs.append(f'"{c}" {coltype(sample) if sample is not None else "text"}')
        q(f'DROP TABLE IF EXISTS "{table}"; CREATE TABLE "{table}" ({", ".join(defs)});')
        for r in rows:
            vals = ", ".join(lit(r.get(c)) for c in cols)
            collist = ", ".join(f'"{c}"' for c in cols)
            q(f'INSERT INTO "{table}" ({collist}) VALUES ({vals});')
        got = q(f'SELECT count(*) FROM "{table}";')
        # psql output parsing: find the count row robustly
        lines = [ln.strip() for ln in got.splitlines() if ln.strip().lstrip("-").isdigit()]
        cnt = int(lines[0]) if lines else -1
        results.append((table, payload["count"], cnt, "OK" if cnt == payload["count"] else "MISMATCH"))

    print("== row counts (manifest vs restored) ==")
    all_ok = True
    for table, want, gotn, status in results:
        print(f"{table}: {want} vs {gotn} -> {status}")
        all_ok = all_ok and status in ("OK", "empty")

    # Pick the Kabuliwala story (a published classic) from the snapshot.
    story = next(s for s in snap["tables"]["stories"]["rows"] if s["title"] == "কাবুলিওয়ালা")
    chapter = next(c for c in snap["tables"]["chapters"]["rows"] if c["story_id"] == story["id"])
    body_key = "body_json" if "body_json" in chapter else next(k for k in chapter if "body" in k)
    snap_hash = hashlib.sha256(canon(chapter[body_key]).encode()).hexdigest()

    out = q(f"SELECT \"{body_key}\"::text FROM chapters WHERE id = '{chapter['id']}';")
    # psql returns the jsonb text among headers/footers; find the JSON line(s)
    restored_obj = None
    for ln in out.splitlines():
        ln = ln.strip()
        if ln.startswith("{"):
            restored_obj = json.loads(ln)
            break
    restored_hash = hashlib.sha256(canon(restored_obj).encode()).hexdigest() if restored_obj else "NOTFOUND"

    proc = subprocess.run(
        ["curl", "-s", "-m", "60", f"{LIVE_BASE}/rest/v1/chapters?select={body_key}&id=eq.{chapter['id']}",
         "-H", f"apikey: {LIVE_KEY}", "-H", f"Authorization: Bearer {LIVE_KEY}"],
        capture_output=True, text=True,
    )
    live_rows = json.loads(proc.stdout)
    live_hash = hashlib.sha256(canon(live_rows[0][body_key]).encode()).hexdigest() if live_rows else "NOTFOUND"

    print("== three-way chapter body check (কাবুলিওয়ালা, ch. id", chapter["id"][:8], ") ==")
    print("snapshot:", snap_hash[:16])
    print("restored:", restored_hash[:16])
    print("live    :", live_hash[:16])
    match = snap_hash == restored_hash == live_hash
    print("DRILL:", "PASS" if (all_ok and match) else "FAIL")
    return 0 if (all_ok and match) else 1


if __name__ == "__main__":
    sys.exit(main())
