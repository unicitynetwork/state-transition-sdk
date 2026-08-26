#!/usr/bin/env bash
#
# Bring the local aggregator stack in tests/integration/docker up or down.
#
#   scripts/integration-aggregator.sh up     start the stack and wait until it certifies
#   scripts/integration-aggregator.sh down   stop it and delete the generated genesis
#   scripts/integration-aggregator.sh logs   follow the aggregator log
#   scripts/integration-aggregator.sh env    print overrides for pointing a suite here
#
# `up` blocks until consensus has produced at least one block, because until
# then the aggregator answers every certification request with
# SERVICE_NOT_READY rather than certifying it.
#
# The integration suite finds this stack on its own — it defaults to localhost
# and to the genesis written below — so `env` is only needed to point the e2e
# suite, or another tool, at it.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly COMPOSE_DIR="${REPO_ROOT}/tests/integration/docker"
readonly DATA_DIR="${COMPOSE_DIR}/data"
readonly TRUST_BASE_PATH="${DATA_DIR}/genesis/trust-base.json"
readonly AGGREGATOR_PORT="${AGGREGATOR_PORT:-3000}"
readonly AGGREGATOR_URL="http://localhost:${AGGREGATOR_PORT}"

# The stack runs as the invoking user so the genesis files it writes into the
# bind mounts stay readable and removable from the host.
export USER_UID="${USER_UID:-$(id -u)}"
export USER_GID="${USER_GID:-$(id -g)}"

compose() {
  docker compose --project-directory "${COMPOSE_DIR}" -f "${COMPOSE_DIR}/docker-compose.yml" "$@"
}

# Block height climbs only once consensus is certifying rounds, which is also
# when the aggregator starts handing out a non-zero reference time.
block_height() {
  curl -sf -m 5 -X POST "${AGGREGATOR_URL}" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"get_block_height","params":{}}' 2>/dev/null |
    grep -o '"blockNumber":"[0-9]*"' | head -1 | cut -d'"' -f4
}

wait_for_certification() {
  local deadline=$((SECONDS + 180))
  while ((SECONDS < deadline)); do
    local height
    height="$(block_height || true)"
    if [[ -n "${height}" && "${height}" != "0" ]]; then
      echo "Aggregator certifying at block ${height}."
      return 0
    fi
    sleep 2
  done

  echo "Aggregator did not reach a certifying round within 180s." >&2
  compose logs --tail 50 aggregator >&2
  return 1
}

case "${1:-up}" in
up)
  mkdir -p "${DATA_DIR}/genesis" "${DATA_DIR}/genesis-root"
  # `--wait` is a convenience, not the gate: the aggregator has a restart policy,
  # and a container that exits once and comes back healthy fails `--wait` while
  # ending up perfectly usable. wait_for_certification below is the real check,
  # and it tolerates a restart because it polls for the outcome we need.
  compose up -d --wait || echo "Some services reported unhealthy on start; waiting for certification anyway."
  wait_for_certification
  echo
  echo "Run the integration suite with: npm run test:integration"
  ;;
down)
  compose down -v --remove-orphans
  # Genesis is regenerated on the next `up`; leaving it behind pins the stack
  # to keys the fresh mongodb/redis volumes no longer have any state for.
  rm -rf "${DATA_DIR}"
  ;;
logs)
  compose logs -f aggregator
  ;;
env)
  echo "export AGGREGATOR_URL=${AGGREGATOR_URL}"
  echo "export TRUST_BASE_PATH=${TRUST_BASE_PATH}"
  ;;
*)
  echo "usage: $0 {up|down|logs|env}" >&2
  exit 1
  ;;
esac
