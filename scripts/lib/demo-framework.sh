#!/bin/bash
# Demo Recording Framework for Tuulbelt Tools
# Sources this file and defines: TOOL_NAME, SHORT_NAME, LANGUAGE, demo_commands()
#
# Usage in record-*-demo.sh:
#   #!/bin/bash
#   source "$(dirname "$0")/lib/demo-framework.sh"
#   TOOL_NAME="cli-progress-reporting"
#   SHORT_NAME="prog"
#   LANGUAGE="typescript"  # or "rust"
#   # Optional: GIF_COLS=80 GIF_ROWS=24 GIF_SPEED=1.5 GIF_FONT_SIZE=14
#   demo_commands() {
#     echo "# Demo commands here"
#     $SHORT_NAME --help
#   }
#   run_demo

set -e

# === Directory Setup ===

# Capture the calling script's directory at source time
# BASH_SOURCE[0] = this file (demo-framework.sh)
# BASH_SOURCE[1] = the script that sourced us (record-*-demo.sh)
if [ -n "${BASH_SOURCE[1]:-}" ]; then
  _DEMO_CALLER_SCRIPT="${BASH_SOURCE[1]}"
  _DEMO_CALLER_DIR="$(cd "$(dirname "$_DEMO_CALLER_SCRIPT")" && pwd)"
else
  # Fallback: assume we're sourced from scripts/ directory
  _DEMO_CALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

# scripts/ -> repo root
REPO_ROOT="$(cd "$_DEMO_CALLER_DIR/.." && pwd)"

setup_tool_dir() {
  # Check if we're in meta repo (has tools/ subdirectory) or standalone repo
  if [ -d "$REPO_ROOT/tools/$TOOL_NAME" ]; then
    # Meta repo: tool is in tools/ subdirectory
    TOOL_DIR="$REPO_ROOT/tools/$TOOL_NAME"
  elif [ -d "$REPO_ROOT/$TOOL_NAME" ]; then
    # Legacy: tool at repo root
    TOOL_DIR="$REPO_ROOT/$TOOL_NAME"
  else
    # Standalone repo: we ARE the tool directory
    TOOL_DIR="$REPO_ROOT"
  fi

  DEMO_FILE="$TOOL_DIR/demo.cast"
  DEMO_URL_FILE="$TOOL_DIR/demo-url.txt"
  DEMO_GIF="$TOOL_DIR/docs/demo.gif"
}

# === Environment Setup ===

setup_demo_env() {
  export PS1="\$ "
  export TERM=xterm-256color
}

# === Utility Functions ===

# Convert kebab-case to Title Case: "port-resolver" → "Port Resolver"
kebab_to_title() {
  echo "$1" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1'
}

# === Dependency Installation ===

install_dependencies() {
  cd "$TOOL_DIR"

  case "$LANGUAGE" in
    typescript|ts)
      echo "Installing npm dependencies..."
      if [ -f "package-lock.json" ]; then
        npm ci --silent 2>/dev/null || npm ci
      else
        npm install --silent 2>/dev/null || npm install
      fi
      echo "Linking CLI..."
      npm link --force 2>/dev/null || npm link
      ;;
    rust)
      echo "Building Rust release..."
      cargo build --release --quiet 2>/dev/null || cargo build --release
      # Set BIN for Rust tools to use
      BIN="$TOOL_DIR/target/release/$SHORT_NAME"
      export BIN
      ;;
    *)
      echo "ERROR: Unknown language: $LANGUAGE"
      exit 1
      ;;
  esac
}

# === Setup/Cleanup Hooks ===

run_setup() {
  if declare -f demo_setup > /dev/null; then
    echo "Running demo setup..."
    demo_setup
  fi
}

run_cleanup() {
  if declare -f demo_cleanup > /dev/null; then
    echo "Running demo cleanup..."
    demo_cleanup
  fi
}

# === Recording ===

record_demo() {
  # Use DISPLAY_NAME if set, otherwise convert TOOL_NAME from kebab-case to Title Case
  local display_name="${DISPLAY_NAME:-$(kebab_to_title "$TOOL_NAME")}"
  local title="${display_name} / ${SHORT_NAME} - Tuulbelt"

  echo "Recording demo: $title"
  echo "Output: $DEMO_FILE"

  cd "$TOOL_DIR"

  # Create temporary script with demo commands
  local cmd_script=$(mktemp)
  {
    echo '#!/bin/bash'
    echo 'set -e'
    echo "export PS1='\$ '"
    # Export all variables that demo_commands might need
    echo "TOOL_DIR='$TOOL_DIR'"
    echo "TOOL_NAME='$TOOL_NAME'"
    echo "SHORT_NAME='$SHORT_NAME'"
    echo "BIN='${BIN:-}'"
    echo "DEMO_DIR='${DEMO_DIR:-}'"
    echo "LOCK_FILE='${LOCK_FILE:-}'"
    echo "SNAP_DIR='${SNAP_DIR:-}'"
    echo "cd '$TOOL_DIR'"
    # Export the demo_commands function and call it
    declare -f demo_commands
    echo 'demo_commands'
  } > "$cmd_script"
  chmod +x "$cmd_script"

  asciinema rec "$DEMO_FILE" \
    --overwrite \
    --title "$title" \
    --command "bash $cmd_script"

  rm -f "$cmd_script"
  echo "Recording saved to $DEMO_FILE"
}

# === Upload to asciinema.org ===

upload_demo() {
  if [ -z "$ASCIINEMA_INSTALL_ID" ]; then
    echo "Skipping upload (ASCIINEMA_INSTALL_ID not set)"
    return 0
  fi

  echo "Uploading to asciinema.org..."

  mkdir -p ~/.config/asciinema
  echo "$ASCIINEMA_INSTALL_ID" > ~/.config/asciinema/install-id

  local upload_output
  upload_output=$(asciinema upload "$DEMO_FILE" 2>&1) || {
    echo "Upload failed: $upload_output"
    return 1
  }

  local upload_url
  upload_url=$(echo "$upload_output" | grep -oE 'https://asciinema.org/a/[a-zA-Z0-9]+' | head -1)

  if [ -n "$upload_url" ]; then
    echo "$upload_url" > "$DEMO_URL_FILE"
    echo "Uploaded: $upload_url"
  else
    echo "Warning: Could not extract upload URL"
    echo "$upload_output"
  fi
}

# === GIF Conversion ===

convert_to_gif() {
  if ! command -v agg &> /dev/null; then
    echo "Skipping GIF conversion (agg not installed)"
    return 0
  fi

  mkdir -p "$(dirname "$DEMO_GIF")"

  # Default GIF parameters (can be overridden by script)
  local cols="${GIF_COLS:-80}"
  local rows="${GIF_ROWS:-24}"
  local speed="${GIF_SPEED:-1.0}"
  local font_size="${GIF_FONT_SIZE:-16}"
  local theme="${GIF_THEME:-monokai}"

  echo "Converting to GIF..."
  agg "$DEMO_FILE" "$DEMO_GIF" \
    --cols "$cols" \
    --rows "$rows" \
    --speed "$speed" \
    --font-size "$font_size" \
    --theme "$theme"

  echo "GIF saved to $DEMO_GIF"
}

# === Main Entry Point ===

run_demo() {
  # Validate required variables
  if [ -z "$TOOL_NAME" ]; then
    echo "ERROR: TOOL_NAME not set"
    exit 1
  fi
  if [ -z "$SHORT_NAME" ]; then
    echo "ERROR: SHORT_NAME not set"
    exit 1
  fi
  if [ -z "$LANGUAGE" ]; then
    echo "ERROR: LANGUAGE not set"
    exit 1
  fi
  if ! declare -f demo_commands > /dev/null; then
    echo "ERROR: demo_commands() function not defined"
    exit 1
  fi

  echo "=== Tuulbelt Demo Recording ==="
  echo "Tool: $TOOL_NAME ($SHORT_NAME)"
  echo "Language: $LANGUAGE"
  echo ""

  setup_tool_dir
  setup_demo_env
  install_dependencies
  run_setup
  record_demo
  run_cleanup
  upload_demo
  convert_to_gif

  echo ""
  echo "=== Demo recording complete ==="
}
