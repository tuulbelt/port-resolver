#!/bin/bash
# Record Port Resolver demo (v0.2.0 features)
source "$(dirname "$0")/lib/demo-framework.sh"

TOOL_NAME="port-resolver"
SHORT_NAME="portres"
LANGUAGE="typescript"

# GIF parameters
GIF_COLS=110
GIF_ROWS=35
GIF_SPEED=1.0
GIF_FONT_SIZE=14

demo_cleanup() {
  # Clean up any allocated ports
  portres cleanup 2>/dev/null || true
}

demo_commands() {
  # ═══════════════════════════════════════════
  # Port Resolver v0.2.0 / portres - Tuulbelt
  # Concurrent port allocation with range APIs
  # ═══════════════════════════════════════════

  # Step 1: Basic port allocation
  echo "# Step 1: Get random available port"
  sleep 0.5
  echo "$ portres get --tag \"api-server\""
  sleep 0.5
  PORT1=$(portres get --tag "api-server")
  echo "$PORT1"
  sleep 2

  # Step 2: Port within specific range (v0.2.0)
  echo ""
  echo "# Step 2: Get port within range (NEW in v0.2.0)"
  sleep 0.5
  echo "$ portres get-in-range --min-port 8000 --max-port 9000 --tag \"web\""
  sleep 0.5
  PORT2=$(portres get-in-range --min-port 8000 --max-port 9000 --tag "web")
  echo "$PORT2"
  sleep 2

  # Step 3: Reserve contiguous range (v0.2.0)
  echo ""
  echo "# Step 3: Reserve contiguous port range (NEW in v0.2.0)"
  sleep 0.5
  echo "$ portres reserve-range --port 50000 --count 5 --tag \"cluster\""
  sleep 0.5
  portres reserve-range --port 50000 --count 5 --tag "cluster"
  sleep 2

  # Step 4: List all allocations with JSON output (v0.2.0)
  echo ""
  echo "# Step 4: List all ports (JSON output)"
  sleep 0.5
  echo "$ portres list --json"
  sleep 0.5
  portres list --json
  sleep 3

  # Step 5: Release specific port by tag (v0.2.0)
  echo ""
  echo "# Step 5: Release port by tag"
  sleep 0.5
  echo "$ portres release --tag \"web\""
  sleep 0.5
  portres release --tag "web"
  echo "✓ Port released"
  sleep 2

  # Step 6: List remaining allocations
  echo ""
  echo "# Step 6: List remaining allocations"
  sleep 0.5
  echo "$ portres list"
  sleep 0.5
  portres list
  sleep 3

  # Step 7: Cleanup all
  echo ""
  echo "# Step 7: Cleanup all ports"
  sleep 0.5
  echo "$ portres cleanup"
  portres cleanup
  echo "✓ All ports released"
  sleep 1

  echo ""
  echo "# v0.2.0 Features:"
  echo "#  - reserveRange(): contiguous port ranges"
  echo "#  - getPortInRange(): bounded allocation"
  echo "#  - releasePort(): release by tag or port"
  echo "#  - JSON output: machine-readable format"
  echo "#  - PortManager: lifecycle management API"
  sleep 2
}

run_demo

# Demo updated for v0.2.0 - 2026-01-10
