#!/usr/bin/env python3
"""Jegyzo fejlesztői backlog importálása az It's a Plan JGY projektbe.

A szkript a `tools/itsaplan/backlog/*.json` fájlokból dolgozik (az Epic- és
User Story-törzsek), és az It's a Plan REST API-ján keresztül létrehozza a
work item-eket, majd összekapcsolja őket a függőségek szerint.

Használat:
    python tools/itsaplan/import_backlog.py --dry-run     # csak validál
    python tools/itsaplan/import_backlog.py               # importál

Az API kulcsot a repó gyökerében lévő .env fájlból olvassa
(ITSAPLAN_API_KEY=...). A szkript idempotens: ami már létezik (azonos cím),
azt kihagyja, így többször is futtatható.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKLOG_DIR = ROOT / "tools" / "itsaplan" / "backlog"
OUTLINE = ROOT / "docs" / "05-backlog" / "00-epic-es-story-vazlat.md"
MAPPING_FILE = ROOT / "tools" / "itsaplan" / "mapping.json"

PROJECT = "JGY"
COLUMN_BACKLOG = 8          # Backlog oszlop id a JGY projektben
TYPE_EPIC = 15              # Epic issue-típus id
TYPE_STORY = 16             # User Story issue-típus id

VALID_POINTS = {2, 3, 5, 8}
VALID_PRIORITY = {"urgent", "high", "medium", "low"}
FORBIDDEN_AC = re.compile(r"\b(Adott|Mikor|Akkor|Given|When|Then)\b")


# --------------------------------------------------------------------------- API

def load_env() -> tuple[str, str]:
    key = os.environ.get("ITSAPLAN_API_KEY", "").strip()
    base = os.environ.get("ITSAPLAN_API_URL", "http://127.0.0.1:3000").rstrip("/")
    if not key:
        env_file = ROOT / ".env"
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                if line.startswith("ITSAPLAN_API_KEY="):
                    key = line.split("=", 1)[1].strip()
    if not key:
        sys.exit("HIBA: ITSAPLAN_API_KEY nem található (környezeti változó vagy .env).")
    return key, base


def api(method: str, path: str, key: str, base: str, payload: dict | None = None):
    """REST hívás. A GET/DELETE/PATCH hívások 5xx hiba esetén újrapróbálkoznak.

    Az issue-létrehozás (POST) szándékosan nem próbálkozik újra: ha a tracker
    500-at ad vissza sikeres létrehozás mellett, az újrapróbálkozás duplikálná
    az issue-t. Az importáló szkript ezért a meglévő címeket kihagyja.
    """
    retries = 4 if method in ("GET", "DELETE", "PATCH") else 1
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    for attempt in range(retries):
        req = urllib.request.Request(
            f"{base}{path}", data=data, method=method,
            headers={"x-api-key": key, "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body) if body else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            if exc.code >= 500 and attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise SystemExit(f"HIBA: {method} {path} -> {exc.code}\n{detail}") from exc
        except urllib.error.URLError as exc:
            if attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise SystemExit(f"HIBA: {method} {path} -> {exc.reason}") from exc


# ---------------------------------------------------------------------- bemenet

def read_backlog() -> list[dict]:
    files = sorted(BACKLOG_DIR.glob("*.json"))
    if not files:
        sys.exit(f"HIBA: nincs JSON a {BACKLOG_DIR} könyvtárban.")
    epics: dict[str, dict] = {}
    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        for epic in data.get("epics", []):
            if epic["code"] in epics:
                sys.exit(f"HIBA: duplikált epic kód: {epic['code']} ({path.name})")
            epics[epic["code"]] = epic
    ordered = sorted(epics.values(), key=lambda e: int(re.sub(r"\D", "", e["code"])))
    return ordered


def read_outline() -> tuple[dict[str, str], dict[str, dict]]:
    """A jóváhagyott vázlatból kiolvassa az epic-címeket és a story-sorokat."""
    text = OUTLINE.read_text(encoding="utf-8")
    epic_titles = {
        m.group(1): m.group(2).strip()
        for m in re.finditer(r"^### (E\d+) — (.+)$", text, re.M)
    }
    stories: dict[str, dict] = {}
    row = re.compile(
        r"^\|\s*(E\d+-S\d+)\b[^|]*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*(urgent|high|medium|low)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|$",
        re.M,
    )
    for m in row.finditer(text):
        code, title, points, priority, reqs, deps = m.groups()
        stories[code] = {
            "title": title.strip(),
            "points": int(points),
            "priority": priority,
            "requirements": [r.strip() for r in reqs.split(",") if r.strip() and r.strip() != "–"],
            "depends_on": [d.strip() for d in re.split(r"[, ]+", deps) if re.fullmatch(r"E\d+-S\d+", d.strip())],
        }
    return epic_titles, stories


# ------------------------------------------------------------------- validálás

def validate(epics: list[dict]) -> dict[str, dict]:
    epic_titles, outline = read_outline()
    problems: list[str] = []
    index: dict[str, dict] = {}

    for epic in epics:
        expected_title = epic_titles.get(epic["code"])
        if expected_title is None:
            problems.append(f"{epic['code']}: ismeretlen epic kód")
        elif expected_title != epic["title"]:
            problems.append(f"{epic['code']}: epic cím eltér a vázlattól: {epic['title']!r} != {expected_title!r}")
        for story in epic["stories"]:
            code = story["code"]
            if code in index:
                problems.append(f"{code}: duplikált story kód")
            index[code] = story
            exp = outline.get(code)
            if exp is None:
                problems.append(f"{code}: nem szerepel a vázlatban")
                continue
            if story["title"] != exp["title"]:
                problems.append(f"{code}: cím eltér a vázlattól: {story['title']!r} != {exp['title']!r}")
            if story["points"] != exp["points"]:
                problems.append(f"{code}: pontszám eltér: {story['points']} != {exp['points']}")
            if story["priority"] != exp["priority"]:
                problems.append(f"{code}: prioritás eltér: {story['priority']} != {exp['priority']}")
            if story["points"] not in VALID_POINTS:
                problems.append(f"{code}: érvénytelen pontszám: {story['points']}")
            if story["priority"] not in VALID_PRIORITY:
                problems.append(f"{code}: érvénytelen prioritás: {story['priority']}")
            if sorted(story.get("requirements", [])) != sorted(exp["requirements"]):
                problems.append(
                    f"{code}: követelmény-hivatkozások eltérnek: "
                    f"{story.get('requirements')} != {exp['requirements']}"
                )
            if sorted(story.get("depends_on", [])) != sorted(exp["depends_on"]):
                problems.append(
                    f"{code}: függőségek eltérnek: {story.get('depends_on')} != {exp['depends_on']}"
                )
            ac = story.get("acceptance", [])
            if not 4 <= len(ac) <= 6:
                problems.append(f"{code}: {len(ac)} acceptance pont (4-6 elvárt)")
            for item in ac:
                if len(item.strip()) < 20:
                    problems.append(f"{code}: túl rövid acceptance pont: {item!r}")
                if hit := FORBIDDEN_AC.search(item):
                    problems.append(f"{code}: acceptance pont given-when-then címkét használ ({hit.group(0)}): {item[:60]!r}")
            dod = story.get("dod", [])
            if not 4 <= len(dod) <= 6:
                problems.append(f"{code}: {len(dod)} dod pont (4-6 elvárt)")
            if len(story.get("description", "")) < 80:
                problems.append(f"{code}: túl rövid leírás")

    missing = sorted(set(outline) - set(index))
    extra = sorted(set(index) - set(outline))
    if missing:
        problems.append(f"hiányzó story-k: {', '.join(missing)}")
    if extra:
        problems.append(f"felesleges story-k: {', '.join(extra)}")

    if problems:
        print(f"VALIDÁLÁS SIKERTELEN — {len(problems)} probléma:")
        for p in problems:
            print("  -", p)
        sys.exit(1)

    total_points = sum(s["points"] for s in index.values())
    print(f"VALIDÁLÁS OK: {len(epics)} epic, {len(index)} story, {total_points} pont.")
    return index


# ------------------------------------------------------------------ megjelenítés

def render_epic(epic: dict) -> str:
    lines = [epic["goal"].strip(), "", f"Az epic {len(epic['stories'])} User Story-t tartalmaz."]
    return "\n".join(lines)


def render_story(story: dict, links: list[str] | None = None) -> str:
    lines = [story["description"].strip()]
    if story.get("requirements"):
        lines += ["", "## Követelmények", *[f"- `{r}`" for r in story["requirements"]]]
    lines += ["", "## Acceptance Criteria", *[f"- {a.strip()}" for a in story["acceptance"]]]
    lines += ["", "## Definition of Done", *[f"- {d.strip()}" for d in story["dod"]]]
    if links:
        lines += ["", "## Függőségek", *[f"- {l}" for l in links]]
    return "\n".join(lines)


# ----------------------------------------------------------------------- import

class LinkConflict(Exception):
    """A kapcsolat már létezik, vagy a tracker hibát jelzett a létrehozásnál."""


def add_link(src: dict, dst: dict, key: str, base: str) -> None:
    """`src` blocked_by `dst` kapcsolat létrehozása; a meglévő kapcsolat nem hiba."""
    try:
        api("POST", f"/issues/{src['id']}/links", key, base,
            {"targetIssueId": dst["id"], "kind": "blocked_by"})
    except SystemExit as exc:
        if "-> 409" in str(exc) or "-> 500" in str(exc):
            raise LinkConflict() from exc
        raise


def link_state(issue_id: int, key: str, base: str) -> dict[int, dict]:
    """Az issue kapcsolatai: {másik issue id: {linkId, kind, direction}}."""
    detail = api("GET", f"/issues/{issue_id}", key, base)
    return {
        link["issue"]["id"]: {
            "linkId": link["id"], "kind": link["kind"], "direction": link["direction"],
        }
        for link in detail.get("links", [])
    }


def remove_link(issue_id: int, target_id: int, key: str, base: str) -> None:
    state = link_state(issue_id, key, base)
    if target_id in state:
        api("DELETE", f"/issues/{issue_id}/links/{state[target_id]['linkId']}", key, base)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="csak validál, nem ír a trackerbe")
    args = parser.parse_args()

    key, base = load_env()
    epics = read_backlog()
    index = validate(epics)
    if args.dry_run:
        return

    project = api("GET", f"/projects/{PROJECT}", key, base)
    existing = api("GET", f"/projects/{PROJECT}/issues?limit=500", key, base) or []
    by_title = {issue["title"]: issue for issue in existing}

    mapping: dict[str, dict] = {}
    links: list[tuple[str, str]] = []

    for epic in epics:
        title = epic["title"]
        if title in by_title:
            issue = by_title[title]
            print(f"  = epic már létezik: {issue['identifier']} {title}")
        else:
            issue = api("POST", f"/projects/{PROJECT}/issues", key, base, {
                "title": title,
                "description": render_epic(epic),
                "columnId": COLUMN_BACKLOG,
                "typeId": TYPE_EPIC,
            })
            print(f"  + epic {issue['identifier']}: {title}")
        mapping[epic["code"]] = issue
        epic_id = issue["id"]

        for story in epic["stories"]:
            title = story["title"]
            if title in by_title:
                created = by_title[title]
                print(f"    = story már létezik: {created['identifier']} {title}")
            else:
                created = api("POST", f"/projects/{PROJECT}/issues", key, base, {
                    "title": title,
                    "description": render_story(story),
                    "columnId": COLUMN_BACKLOG,
                    "typeId": TYPE_STORY,
                    "parentId": epic_id,
                    "priority": story["priority"],
                    "estimatePoints": story["points"],
                })
                print(f"    + story {created['identifier']} ({story['points']}p, {story['priority']}): {title}")
            mapping[story["code"]] = created
            for dep in story.get("depends_on", []):
                links.append((story["code"], dep))

    # függőségi kapcsolatok + hivatkozás a leírásban
    print(f"\nFüggőségek rögzítése: {len(links)} kapcsolat")
    for code, dep in links:
        try:
            add_link(mapping[code], mapping[dep], key, base)
        except LinkConflict:
            pass

    # A HTTP státuszkód nem megbízható (a tracker 500-at is adhat sikeres
    # létrehozás mellett, illetve 409-et ha a pár már létezik), ezért a
    # tényleges kapcsolatokat visszaolvassuk és összevetjük az elvárttal.
    expected = {frozenset((mapping[c]["id"], mapping[d]["id"])) for c, d in links}
    wanted: dict[int, set[int]] = {}
    for code, dep in links:
        wanted.setdefault(mapping[code]["id"], set()).add(mapping[dep]["id"])

    added = removed = fixed = 0
    for issue_id, targets in wanted.items():
        state = link_state(issue_id, key, base)
        for target in targets:
            if state.get(target, {}).get("direction") != "inward":
                if target in state:
                    remove_link(issue_id, target, key, base)
                    fixed += 1
                try:
                    add_link({"id": issue_id}, {"id": target}, key, base)
                except LinkConflict:
                    pass
                added += 1
    for issue_id in (issue["id"] for issue in mapping.values()):
        for target in link_state(issue_id, key, base):
            if frozenset((issue_id, target)) not in expected:
                remove_link(issue_id, target, key, base)
                removed += 1
    print(f"Kapcsolatok ellenőrizve: {added} létrehozva, {fixed} irány javítva, {removed} felesleges törölve.")

    for epic in epics:
        for story in epic["stories"]:
            deps = story.get("depends_on", [])
            if not deps:
                continue
            refs = [f"{mapping[d]['identifier']} ({d}) – ezt a story-t előbb kell megvalósítani" for d in deps]
            api("PATCH", f"/projects/{PROJECT}/issues/bulk", key, base,
                {"ids": [mapping[story["code"]]["id"]],
                 "patch": {"description": render_story(story, refs)}})

    MAPPING_FILE.write_text(
        json.dumps(
            {code: {"id": issue["id"], "identifier": issue["identifier"], "title": issue["title"]}
             for code, issue in mapping.items()},
            ensure_ascii=False, indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    print(f"\nKész. Azonosító-térkép: {MAPPING_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
