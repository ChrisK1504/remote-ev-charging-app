#!/bin/bash

# Separate process groups let cleanup stop npm and its child processes together.
set -m
cd "$(dirname "$0")" || exit 1

pids=()
cleanup() {
  trap '' INT TERM
  echo "Stopping backend, frontend and simulator..."
  for pid in "${pids[@]}"; do
    kill -TERM -- "-$pid" 2>/dev/null || true
  done
  wait 2>/dev/null
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

npm --prefix backend run start:dev &
pids+=("$!")

npm --prefix frontend run dev -- --port 5174 --strictPort --open &
pids+=("$!")

npm --prefix OCPPSimulator run dev -- --port 5173 --strictPort --open &
pids+=("$!")

echo "Frontend: http://localhost:5174"
echo "Simulator: http://localhost:5173"
echo "Backend API: http://localhost:3000/chargers"
echo "Press Ctrl+C here to stop all three services."
wait
