#!/usr/bin/env bash
#
# Fetch timetable data from every provider, then publish it to the tables the
# app reads.
#
#   ./scripts/fetch-timetables.sh              # all providers
#   ./scripts/fetch-timetables.sh WBBUSTIME    # just one
#   PACE=30 ./scripts/fetch-timetables.sh      # slower between providers
#
# Providers are run one at a time with a pause between them: these are live
# government and community sites, not an API we own. Hammering them gets the
# RatrooBot user-agent blocked.
#
# A provider that fails is reported and skipped — one dead site must not stop
# the rest of the run.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="${API_BASE_URL:-http://localhost:3000}"
PACE="${PACE:-15}"          # seconds between providers
TIMEOUT="${TIMEOUT:-900}"   # per-provider cap; a full WBBUS pull is slow

# WBBUSTIME first: it returns a time for every stop it touches, the best
# timetable yield of any source. The rest had ~1 page ever fetched.
PROVIDERS_DEFAULT=(
  WBBUSTIME
  WBTC
  NBSTC
  SBSTC
  KOLKATA_TRAM
  WB_FERRY
  EASTERN_RAILWAY_SUBURBAN
  KOLKATA_METRO
  WBBUS
)

KEY="$(grep -m1 '^INTERNAL_INGESTION_API_KEY=' "$ROOT/.env" 2>/dev/null | cut -d= -f2-)"
if [[ -z "$KEY" ]]; then
  echo "INTERNAL_INGESTION_API_KEY not found in $ROOT/.env" >&2
  exit 1
fi

if ! curl -sf -m 5 "$API/v1/health" >/dev/null; then
  echo "API not reachable at $API — start it with: npm run start:api" >&2
  exit 1
fi

coverage() {
  # Times present vs total, straight from the database.
  (cd "$ROOT/apps/api" && npx --no-install ts-node -e "
    require('dotenv').config({path:'../../.env'});
    const {Sequelize, QueryTypes} = require('sequelize');
    const {postgresConnection, processEnvLookup} = require('./src/database/connection-options');
    const s = new Sequelize({dialect:'postgres', logging:false, ...postgresConnection(processEnvLookup)});
    (async () => {
      const rows = await s.query(
        'select bt.\"providerCode\" p, count(*) filter (where bst.\"arrivalTime\" is not null)::int t, count(*)::int n' +
        ' from bus_stop_times bst join bus_trips bt on bt.id = bst.\"tripId\" group by 1 order by t desc',
        {type: QueryTypes.SELECT});
      rows.forEach(r => console.log('   ' + String(r.p).padEnd(26) + r.t + '/' + r.n));
      const tot = rows.reduce((a, r) => ({t: a.t + r.t, n: a.n + r.n}), {t: 0, n: 0});
      console.log('   ' + 'TOTAL'.padEnd(26) + tot.t + '/' + tot.n);
      await s.close();
    })();
  " 2>/dev/null | grep -v 'injected env')
}

PROVIDERS=("${@:-}")
[[ -z "${PROVIDERS[0]:-}" ]] && PROVIDERS=("${PROVIDERS_DEFAULT[@]}")

echo "=== timetable coverage BEFORE"
coverage

failed=()
for provider in "${PROVIDERS[@]}"; do
  # WBBUS is the only source with enough pages to need explicit caps.
  query=""
  [[ "$provider" == "WBBUS" ]] && query="?maxItems=1280&maxPages=200"

  printf '\n--- %s\n' "$provider"
  start=$SECONDS

  if curl -sf -m "$TIMEOUT" -X POST \
       -H "x-internal-api-key: $KEY" \
       "$API/internal/providers/$provider/sync$query" \
       -o /tmp/ratroo-sync.json; then
    echo "    ok in $((SECONDS - start))s  $(head -c 160 /tmp/ratroo-sync.json)"
  else
    echo "    FAILED after $((SECONDS - start))s"
    failed+=("$provider")
  fi

  sleep "$PACE"
done

# Nothing reaches the app until the canonical projection runs.
printf '\n--- publishing to canonical transit tables\n'
curl -sf -m 600 -X POST -H "x-internal-api-key: $KEY" \
  "$API/internal/cron/project-transit" | head -c 300
echo

printf '\n=== timetable coverage AFTER\n'
coverage

if ((${#failed[@]})); then
  printf '\nproviders that failed: %s\n' "${failed[*]}"
  exit 1
fi
