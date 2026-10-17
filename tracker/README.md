# It's a Plan — the JGY tracker

The Jegyzo backlog lives in an **It's a Plan** instance (upstream: `croffasia/itsaplan`).
Since the whole sandbox is one stack, the tracker is part of the root
[`docker-compose.yml`](../docker-compose.yml) (`tracker-*` services) — there is no separate
compose file any more. Those services ship the same instance the JGY work items were created
in, plus a seed so a fresh volume reproduces **the same project and the same items**.

The app code lives in `../backend` and `../frontend`; nothing here is part of the Jegyzo
application itself.

## Start it

```bash
cp .env.example .env        # in the repo root; fill in the values (see below)
docker compose up -d        # everything, tracker included
docker compose ps           # the tracker-* services must end up healthy
```

| URL | What |
| --- | --- |
| http://localhost:3001 | tracker web UI |
| http://localhost:3000/docs | API reference |
| http://localhost:3000/mcp | MCP endpoint (POST, `x-api-key`) |

Ports come from the repo-root `.env` (`TRACKER_API_PORT`, `TRACKER_WEB_PORT`). If something
already holds them, change them there (e.g. `13000`/`13001`).

Only the tracker services:

```bash
docker compose up -d tracker-postgres tracker-minio tracker-minio-init \
  tracker-migrate tracker-seed tracker-api tracker-worker tracker-bot tracker-web
```

## Seeded sandbox credentials

On a fresh volume the `tracker-seed` service loads `seed/jgy-seed.sql` (the **JGY** project
only — other projects of the source instance are never included). Log in with:

| | |
| --- | --- |
| E-mail | `admin@jegyzo.local` |
| Password | `Jegyzo1234` |
| Role | instance owner (`god`), owner of the `JGY` team and project |
| API key | `itp_jegyzoSandboxKey000000000000000000000000000000000000000000000000` |

The API key is pre-filled in the repo-root `.env` as `ITSAPLAN_API_KEY`, so the tooling in
`tools/itsaplan/` and the `itsaplan` MCP server (`.omp/mcp.json`) work against it.

```bash
curl -s "http://localhost:3000/projects/JGY/issues?limit=200" \
  -H "x-api-key: $ITSAPLAN_API_KEY" | python -c "import json,sys;print(len(json.load(sys.stdin)))"
# 99
```

## First launch: sign in, do not register

Upstream ships with registration open (`registration: open`), so the login page offers
account creation next to sign-in. An account created there is **not** the sandbox owner:
upstream hands `god` to the very first account of an instance only, and every new account
gets a team of its own. The `JGY` project belongs to the seeded team, so a self-registered
account opens to an empty project list and cannot reach the backlog at all.

Sign in with the seeded account instead — it is the instance owner (`role = god`) and owns
the `JGY` team and project, so `/god/*` works too (instance users, teams, auth settings).

If a colleague already registered, or you want a second account, bring it in as the owner.
The invite is a copyable link — this stack has no mail provider, and the API returns the
token, so nothing has to be sent:

1. signed in as `admin@jegyzo.local`, open project `JGY` → **Members** → **Add member**,
   type the address, pick *Invite &lt;address&gt;* and press **Send invite**;
2. the invite appears as a pending row — use **Copy link** and hand that link over (the UI
   says it explicitly: *"Invite created, but email was not queued. Copy the link to share
   it."*);
3. the person opens the link signed in as their account and accepts.

API equivalent (verified against the shipped seed):

```bash
# owner session — better-auth uses a cookie, not a bearer token
curl -s -c owner.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@jegyzo.local","password":"Jegyzo1234"}'

# invite the other address into JGY; the response contains the token for the link
curl -s -b owner.txt -X POST http://localhost:3000/projects/JGY/invites \
  -H 'Content-Type: application/json' \
  -d '{"email":"kollega@jegyzo.local","role":"member"}'

# the invited account accepts from its own session
curl -s -c kollega.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"kollega@jegyzo.local","password":"..."}'
curl -s -b kollega.txt -X POST http://localhost:3000/invites/<token>/accept
```

After that the account is a member of the `JGY` team and project, and `GET /projects`
lists `JGY`. To stop the confusion at the source, the owner can close registration or make
it invite-only: `PUT /god/auth-settings` (or the corresponding screen in the UI).

## What the seed contains

- the `JGY` project, its columns, issue types and labels;
- all **99 work items** (11 epics + 88 user stories) with title, description, priority,
  story points, parent epic, type/label and issue links (dependencies);
- the **Acceptance Criteria / Definition of Done checklists** attached to each story;
- one sandbox account (above) and its API key.

Not included: issue history/revisions/activity, watchers, and any other project.

## Version pinning — the seed and TRACKER_VERSION move together

`TRACKER_VERSION` in the repo-root `.env` pins one tracker release (`1.1.0`), because the
image that `latest` points to adds columns the bundled seed does not carry: the `COPY`
blocks are written in **column order of the release that exported them**, so on a newer
release the load dies with

```
psql:/seed/jgy-seed.sql:19: ERROR:  missing data for column "default_agent_ids"
```

Measured against the fixes of upstream 1.0.0 … 1.5.0: `1.1.0` loads the seed, `1.2.0`,
`1.2.1`, `1.3.0`, `1.4.0` and `1.5.0` fail with a missing column, `1.0.0` with
`extra data after last expected column`.

So either keep `TRACKER_VERSION=1.1.0`, or regenerate the seed on the new release:

```bash
# 1) start the release you want and let it migrate (the seed will fail — that is fine)
# 2) load the current seed with explicit column lists, or re-create the backlog in the UI
# 3) regenerate the snapshot from the running instance
python tools/itsaplan/export_tracker_seed.py     # reads the running tracker's Postgres
# 4) drop the tracker volume so the new seed is applied on next start
docker compose down -v
docker compose up -d
```

## Notes

- The seed is applied **only when the `JGY` project is absent** — it never overwrites
  changes you make in the UI. Re-running it is a no-op.
- `tracker-migrate` takes a pre-migration backup into the `tracker-db-backups` volume; set
  `TRACKER_SKIP_PRE_MIGRATION_BACKUP=1` to upgrade without one.
- The export tool talks to the container `jegyzo-tracker-postgres` (override with
  `TRACKER_PG_CONTAINER`, `TRACKER_PG_USER`, `TRACKER_PG_DB`).
- Upstream docs: <https://github.com/croffasia/itsaplan> (self-hosting, API).
