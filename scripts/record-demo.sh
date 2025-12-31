#!/bin/bash
# Record Test Port Resolver demo
source "$(dirname "$0")/lib/demo-framework.sh"

TOOL_NAME="port-resolver"
SHORT_NAME="portres"
LANGUAGE="typescript"

# GIF parameters
GIF_COLS=100
GIF_ROWS=30
GIF_SPEED=1.0
GIF_FONT_SIZE=14

demo_cleanup() {
  # Clean up any allocated ports
  portres cleanup 2>/dev/null || true
}

demo_commands() {
  # ═══════════════════════════════════════════
  # Test Port Resolver / portres - Tuulbelt
  # ═══════════════════════════════════════════

  # Step 1: Installation
  echo "# Step 1: Install globally"
  sleep 0.5
  echo "$ npm link"
  sleep 1

  # Step 2: View help
  echo ""
  echo "# Step 2: View available commands"
  sleep 0.5
  echo "$ portres --help"
  sleep 0.5
  portres --help
  sleep 3

  # Step 3: Get a random available port
  echo ""
  echo "# Step 3: Get random available port"
  sleep 0.5
  echo "$ portres get"
  sleep 0.5
  PORT1=$(portres get)
  echo "$PORT1"
  sleep 2

  # Step 4: Get port with specific tag
  echo ""
  echo "# Step 4: Get port with tag"
  sleep 0.5
  echo "$ portres get --tag \"api-server\""
  sleep 0.5
  PORT2=$(portres get --tag "api-server")
  echo "$PORT2"
  sleep 2

  # Step 5: Get port within range
  echo ""
  echo "# Step 5: Get port within range (8000-9000)"
  sleep 0.5
  echo "$ portres get --min 8000 --max 9000 --tag \"web-server\""
  sleep 0.5
  PORT3=$(portres get --min 8000 --max 9000 --tag "web-server")
  echo "$PORT3"
  sleep 2

  # Step 6: Reserve specific port
  echo ""
  echo "# Step 6: Reserve specific port"
  sleep 0.5
  echo "$ portres reserve --port 3000 --tag \"main-app\""
  sleep 0.5
  portres reserve --port 3000 --tag "main-app" || echo "Port 3000 reserved"
  sleep 2

  # Step 7: List all allocated ports
  echo ""
  echo "# Step 7: List all allocated ports"
  sleep 0.5
  echo "$ portres list"
  sleep 0.5
  portres list
  sleep 3

  # Step 8: Cleanup
  echo ""
  echo "# Step 8: Cleanup all ports"
  sleep 0.5
  echo "$ portres cleanup"
  portres cleanup
  echo "✓ All ports released"
  sleep 1

  echo ""
  echo "# Done! Allocate test ports with: portres get"
  sleep 1
}

run_demo
