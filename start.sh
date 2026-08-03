#!/usr/bin/env bash
# Local 999scraper stack: Docker Desktop -> PostgreSQL/Redis -> Go + Angular app.
# Ctrl+C removes the project containers, network, volumes, and locally built image.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$ROOT/docker-compose.yml"
export COMPOSE_PROJECT_NAME="999scraper"

BOLD='\033[1m'
RESET='\033[0m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CLEANED=0

log() { printf "${BOLD}[%s]${RESET} %s\n" "$1" "$2"; }
ok() { printf "${GREEN}${BOLD}OK${RESET} %s\n" "$1"; }
warn() { printf "${YELLOW}${BOLD}!${RESET} %s\n" "$1"; }
die() { printf "${RED}${BOLD}error:${RESET} %s\n" "$1" >&2; exit 1; }

docker_ready() {
  docker info >/dev/null 2>&1
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

# Docker Desktop can leave broken CLI-plugin symlinks after an app update.
repair_docker_plugins() {
  local source_dir="/Applications/Docker.app/Contents/Resources/cli-plugins"
  local target_dir="${DOCKER_CONFIG:-$HOME/.docker}/cli-plugins"
  local plugin name

  [ -d "$source_dir" ] || return 0
  mkdir -p "$target_dir"
  for plugin in "$source_dir"/docker-*; do
    [ -f "$plugin" ] || continue
    name="$(basename "$plugin")"
    if [ ! -e "$target_dir/$name" ]; then
      ln -sfn "$plugin" "$target_dir/$name"
    fi
  done
}

ensure_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed. Install Docker Desktop and retry."
  repair_docker_plugins

  if ! docker_ready; then
    if [ "$(uname -s)" = "Darwin" ] && [ -d "/Applications/Docker.app" ]; then
      log "docker" "starting Docker Desktop"
      open -gja Docker || die "Docker Desktop could not be started."

      local elapsed=0
      while ! docker_ready; do
        if [ "$elapsed" -ge 120 ]; then
          die "Docker Desktop did not become ready within 120 seconds."
        fi
        sleep 1
        elapsed=$((elapsed + 1))
      done
    else
      die "The Docker engine is not running. Start it and retry."
    fi
  fi

  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required."
  ok "Docker engine ready"
}

cleanup() {
  [ "$CLEANED" -eq 1 ] && return 0
  CLEANED=1
  trap - INT TERM EXIT

  printf "\n${YELLOW}${BOLD}Stopping and removing the local stack...${RESET}\n"
  if docker_ready; then
    compose down --volumes --remove-orphans --rmi local || true
  else
    warn "Docker stopped before project resources could be removed"
  fi
  printf "${GREEN}${BOLD}All project containers, data volumes, and local images removed.${RESET}\n"
}

main() {
  [ "$#" -eq 0 ] || die "This launcher takes no arguments; run ./start.sh and use Ctrl+C to stop it."
  cd "$ROOT"
  ensure_docker

  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  log "docker" "building and starting PostgreSQL, Redis, backend, and frontend"
  printf "${BOLD}App:${RESET}   http://localhost:8080\n"
  printf "${BOLD}Admin:${RESET} admin / change-me-now (local default)\n"
  printf "${BOLD}Stop:${RESET}  Ctrl+C removes the complete project stack and local data\n\n"

  compose up --build --remove-orphans
}

main "$@"
