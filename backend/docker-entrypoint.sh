#!/bin/sh
set -e

echo "Waiting for migrations to be applicable (database ready)..."
until npx prisma migrate deploy; do sleep 1; done

echo "Migrations applied; running idempotent seed..."
node node_modules/tsx/dist/cli.mjs prisma/seed.ts

echo "Starting API..."
exec node dist/main.js
