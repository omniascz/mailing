#!/bin/bash
# Apply all drizzle SQL migrations in order via psql, stop on first failure.
set -u
DIR="$(cd "$(dirname "$0")/.."; pwd)/apps/api/drizzle"
TOTAL=0
OK=0
FAIL=0
FAILED=""
for f in "$DIR"/*.sql; do
  name=$(basename "$f" .sql)
  TOTAL=$((TOTAL + 1))
  output=$(docker exec -i forgemsg-postgres psql -U forgemsg -d forgemsg -v ON_ERROR_STOP=1 < "$f" 2>&1)
  status=$?
  if [ $status -eq 0 ]; then
    OK=$((OK + 1))
    echo "✓ $name"
  else
    FAIL=$((FAIL + 1))
    FAILED="$FAILED\n  $name"
    echo "✗ $name"
    echo "$output" | head -5 | sed 's/^/    /'
  fi
done
echo ""
echo "Total: $TOTAL  OK: $OK  FAIL: $FAIL"
if [ $FAIL -gt 0 ]; then
  echo -e "Failed migrations:$FAILED"
fi
