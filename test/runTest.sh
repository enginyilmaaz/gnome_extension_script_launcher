#!/usr/bin/env bash
# Run Shexli static analyzer for GNOME Extension review warnings
# Usage:
#   ./test/runTest.sh          — install shexli, run analysis
#   ./test/runTest.sh --remove — remove virtualenv and all installed packages

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"

if [[ "${1:-}" == "--remove" ]]; then
  if [[ -d "$VENV_DIR" ]]; then
    rm -rf "$VENV_DIR"
    echo "Removed virtualenv: $VENV_DIR"
  else
    echo "Nothing to remove — virtualenv not found."
  fi
  echo "Removing apt packages (python3-pip, python3.12-venv)..."
  sudo apt remove -y python3-pip python3.12-venv 2>/dev/null && sudo apt autoremove -y 2>/dev/null \
    || echo "Could not remove apt packages (sudo needed)."
  exit 0
fi

# Create virtualenv (remove broken one if activate is missing)
if [[ -d "$VENV_DIR" && ! -f "$VENV_DIR/bin/activate" ]]; then
  echo "Broken virtualenv detected, recreating..."
  rm -rf "$VENV_DIR"
fi

if [[ ! -d "$VENV_DIR" ]]; then
  if ! python3 -c "import ensurepip" 2>/dev/null; then
    echo "Installing python3-pip and python3-venv..."
    sudo apt install -y python3-pip python3.12-venv
  fi
  echo "Creating virtualenv..."
  python3 -m venv "$VENV_DIR"
fi

# Activate and install/update shexli
# shellcheck source=/dev/null
. "$VENV_DIR/bin/activate"
pip install -U shexli --quiet

# Build zip like EGO upload (exclude .git, test, etc.)
ZIP_FILE="$SCRIPT_DIR/extension.zip"
rm -f "$ZIP_FILE"
(cd "$PROJECT_DIR" && zip -r "$ZIP_FILE" . -x ".git/*" "test/*")

echo ""
echo "=== Running Shexli on: $ZIP_FILE ==="
echo ""
shexli "$ZIP_FILE"
rm -f "$ZIP_FILE"
