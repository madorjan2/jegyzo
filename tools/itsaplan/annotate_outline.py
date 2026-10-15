#!/usr/bin/env python3
"""A backlog vázlat összekötése az It's a Plan azonosítókkal.

A `tools/itsaplan/mapping.json` (az import szkript kimenete) alapján beírja a
JGY-azonosítókat a `docs/05-backlog/00-epic-es-story-vazlat.md` fájlba:

- az Epic-összesítő táblába új oszlopként,
- a User Story táblák azonosító cellájába `E1-S1 (JGY-12)` formában.

Használat:
    python tools/itsaplan/annotate_outline.py

Idempotens: kétszeri futtatás után ugyanazt az eredményt adja.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUTLINE = ROOT / "docs" / "05-backlog" / "00-epic-es-story-vazlat.md"
MAPPING_FILE = ROOT / "tools" / "itsaplan" / "mapping.json"
KEY_PATTERN = r"(?: \(JGY-\d+\))?"


def main() -> None:
    if not MAPPING_FILE.exists():
        sys.exit("HIBA: hiányzik a mapping.json — előbb futtasd az import_backlog.py-t.")
    mapping = json.loads(MAPPING_FILE.read_text(encoding="utf-8"))
    text = OUTLINE.read_text(encoding="utf-8")
    lines = text.splitlines()
    out: list[str] = []
    added_column = False
    epic_keys = epic_keys_of(mapping)

    for line in lines:
        # összesítő tábla fejléce
        if line.strip() == "| Epic | Cím | Story | Pont |":
            line = "| Epic | Cím | Story | Pont | It's a Plan |"
            added_column = True
        elif re.fullmatch(r"\| --- \| --- \| --: \| --: \|", line.strip()):
            line = line.rstrip() + " --- |"
        # összesítő tábla sora
        elif added_column and (m := re.fullmatch(r"\| (E\d+) \| (.+?) \| (\d+) \| (\d+) \|", line.strip())):
            code = m.group(1)
            key = epic_keys.get(code)
            line = line.rstrip() + (f" `{key}` |" if key else " – |")
        # user story sor
        elif m := re.match(rf"^\| (E\d+-S\d+){KEY_PATTERN} \|", line):
            code = m.group(1)
            key = mapping.get(code, {}).get("identifier")
            if key:
                line = re.sub(rf"^\| {code}{KEY_PATTERN} \|", f"| {code} ({key}) |", line)
        out.append(line)

    updated = "\n".join(out) + ("\n" if text.endswith("\n") else "")
    if updated == text:
        print("A vázlat már tartalmazza az azonosítókat, nincs változás.")
        return
    OUTLINE.write_text(updated, encoding="utf-8")
    stories = sum(1 for c in mapping if "-S" in c)
    print(f"Vázlat frissítve: {len(epic_keys)} epic és {stories} story azonosítóval.")


def epic_keys_of(mapping: dict[str, dict]) -> dict[str, str]:
    return {code: info["identifier"] for code, info in mapping.items() if "-S" not in code}


if __name__ == "__main__":
    main()
