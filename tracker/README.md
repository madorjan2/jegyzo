# It's a Plan — the JGY tracker

The Jegyzo backlog lives in an **It's a Plan** instance (upstream: `croffasia/itsaplan`).
This folder ships that stack — the same one the JGY work items were created in — plus a
seed so a fresh checkout reproduces **the same project and the same items**.

The app code lives in `../backend` and `../frontend`; nothing here is part of the Jegyzo
application itself.

## Start it

```bash
cp tracker/.env.example tracker/.env     # fill in the REQUIRED values
docker compose -f tracker/docker-compose.yml up -d
```

| URL | What |
| --- | --- |
| http://localhost:3001 | tracker web UI |
| http://localhost:3000/docs | API reference |
| http://localhost:3000/mcp | MCP endpoint (POST, `x-api-key`) |

Ports come from `tracker/.env` (`API_PORT`, `WEB_PORT`). If the tracker is already
running elsewhere, change them (e.g. `13000`/`13001`).

## Seeded sandbox credentials

On a fresh volume the `seed` service loads `seed/jgy-seed.sql` (the **JGY** project only —
other projects of the source instance are never included). Log in with:

| | |
| --- | --- |
| E-mail | `admin@jegyzo.local` |
| Password | `Jegyzo1234` |
| API key | `itp_jegyzoSandboxKey000000000000000000000000000000000000000000000000` |

The API key goes in this repo's root `.env` as `ITSAPLAN_API_KEY=…` so the tooling in
`tools/itsaplan/` works against it.

```bash
curl -s "http://localhost:3000/projects/JGY/issues?limit=200" \
  -H "x-api-key: $ITSAPLAN_API_KEY" | python -c "import json,sys;print(len(json.load(sys.stdin)))"
# 99
```

## What the seed contains

- the `JGY` project, its columns, issue types and labels;
- all **99 work items** (11 epics + 88 user stories) with title, description, priority,
  story points, parent epic, type/label and issue links (dependencies);
- the **Acceptance Criteria / Definition of Done checklists** attached to each story;
- one sandbox account (above) and its API key.

Not included: issue history/revisions/activity, watchers, and any other project.

## Refreshing the seed

After editing the backlog in the tracker UI, regenerate the snapshot:

```bash
python tools/itsaplan/export_tracker_seed.py     # reads the running instance's Postgres
```

Then remove the tracker volume so the new seed is applied on next start:

```bash
docker compose -f tracker/docker-compose.yml down -v
docker compose -f tracker/docker-compose.yml up -d
```

## Notes

- The seed is applied **only when the `JGY` project is absent** — it never overwrites
  changes you make in the UI.
- The stack pins `VERSION=latest` by default; set `VERSION` in `.env` to match a release
  if the schema drifts.
- Upstream docs: <https://github.com/croffasia/itsaplan> (self-hosting, API).
