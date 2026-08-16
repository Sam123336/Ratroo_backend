#!/bin/bash
# Waits for the BMTC harvest to exit, then promotes and interpolates.
# Each step gates the next: a bad harvest must not reach the database, and
# interpolation must not run over a promotion that failed.
cd "$(dirname "$0")"
LOG=.bmtc-cache/pipeline.log
exec >>"$LOG" 2>&1
echo "=== waiting for harvest, $(date) ==="

while pgrep -f "ingest-bmtc" >/dev/null; do sleep 60; done
echo "=== harvest exited $(date) ==="

python3 - <<'PY' || { echo "ABORT: canonical.json unusable"; exit 1; }
import json,sys
d=json.load(open('.bmtc-cache/canonical.json'))
c=d.get('counts',{})
print("harvest counts:", json.dumps(c))
timed=sum(1 for t in d.get('trips',[]) if t.get('stopTimes'))
print("trips with times:", timed)
sys.exit(0 if timed else 1)
PY

echo "=== promote $(date) ==="
# The exit status of a pipeline is its LAST command, so `npm ... | tail || abort`
# reports tail's success and the abort never fires — which is how the previous
# run reached interpolation after promote had died on an orphan trip. Capture
# npm's own status instead.
npm run bmtc:promote >.bmtc-cache/promote.out 2>&1
status=$?
grep -vE "InstanceLoader|dependencies initialized" .bmtc-cache/promote.out | tail -25
[ $status -eq 0 ] || { echo "ABORT: promote failed (exit $status)"; exit 1; }

echo "=== interpolate $(date) ==="
npm run timetables:interpolate 2>&1 | tail -25

echo "=== done $(date) ==="
