#!/bin/bash
# Record Test Port Resolver demo
source "$(dirname "$0")/lib/demo-framework.sh"

TOOL_NAME="port-resolver"
SHORT_NAME="portres"
LANGUAGE="typescript"

# Use custom GIF parameters (different from default)
GIF_COLS=80
GIF_ROWS=24
GIF_SPEED=1.5

demo_setup() {
  rm -rf /tmp/portres-demo
}

demo_cleanup() {
  rm -rf /tmp/portres-demo
}

demo_commands() {
  echo "Test Port Resolver / portres - Demo"
  echo "====================================="
  echo
  sleep 0.5

  echo "1. Get an available port:"
  sleep 0.3
  echo "$ portres get"
  portres get -d /tmp/portres-demo
  sleep 1

  echo
  echo "2. Get multiple ports at once:"
  sleep 0.3
  echo "$ portres get -n 3"
  portres get -n 3 -d /tmp/portres-demo
  sleep 1

  echo
  echo "3. Get port with tag:"
  sleep 0.3
  echo "$ portres get -t mytest --json"
  portres get -t mytest --json -d /tmp/portres-demo
  sleep 1

  echo
  echo "4. List all allocations:"
  sleep 0.3
  echo "$ portres list"
  portres list -d /tmp/portres-demo
  sleep 1

  echo
  echo "5. Show registry status:"
  sleep 0.3
  echo "$ portres status"
  portres status -d /tmp/portres-demo
  sleep 1

  echo
  echo "6. Release all ports:"
  sleep 0.3
  echo "$ portres release-all"
  portres release-all -d /tmp/portres-demo
  sleep 1

  echo
  echo "7. Verify registry is empty:"
  sleep 0.3
  echo "$ portres list"
  portres list -d /tmp/portres-demo
  sleep 1

  echo
  echo "====================================="
  echo "Zero dependencies. Concurrent safe."
  echo "====================================="
  sleep 1
}

run_demo
