#!/bin/sh
# Loads the bundled JGY project into the tracker database on first boot.
# Runs after the `migrate` service; a no-op once the project exists.
set -eu

: "${PGHOST:=postgres}"; export PGHOST
: "${PGUSER:=itsaplan}"; export PGUSER
: "${PGDATABASE:=itsaplan}"; export PGDATABASE

echo "[seed] checking for project JGY in ${PGHOST}/${PGDATABASE}"
if psql -tAc "select 1 from project where key = 'JGY'" | grep -q 1; then
  echo "[seed] JGY already present — nothing to do"
  exit 0
fi

echo "[seed] loading tracker/seed/jgy-seed.sql"
psql -v ON_ERROR_STOP=1 -q -f /seed/jgy-seed.sql
echo "[seed] done: JGY project and its work items are in place"
