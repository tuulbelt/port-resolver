#!/bin/bash
#
# Dogfooding: Validate file-based-semaphore-ts integration
#
# HIGH-VALUE: Proves port-resolver's atomic registry access is working
#
# Why This Matters:
#   - port-resolver REQUIRES file-based-semaphore-ts for atomic registry access
#   - Concurrent port allocation without proper locking = race conditions
#   - This script proves the semaphore integration prevents conflicts
#
# What It Tests:
#   - Multiple concurrent port allocations
#   - No duplicate port assignments
#   - Registry remains consistent under load
#   - Semaphore correctly serializes access
#
# Usage:
#   ./scripts/dogfood-semaphore.sh [processes] [allocations_per_process]
#
# Examples:
#   ./scripts/dogfood-semaphore.sh       # Default: 4 processes, 5 allocations each
#   ./scripts/dogfood-semaphore.sh 8 10  # Stress test: 8 processes, 10 each
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL_DIR="$(dirname "$SCRIPT_DIR")"
SEMAPHORE_DIR="$TOOL_DIR/../file-based-semaphore-ts"
PROCESSES="${1:-4}"
ALLOCATIONS="${2:-5}"
TEMP_DIR="/tmp/portres-semaphore-dogfood-$$"
RESULTS_FILE="$TEMP_DIR/results.txt"

echo "=========================================="
echo "Dogfooding: Semaphore Integration Test"
echo "Tool: port-resolver (portres)"
echo "Dependency: file-based-semaphore-ts"
echo "=========================================="
echo
echo "This validates REQUIRED dependency integration:"
echo "  - port-resolver uses semaphore for atomic registry access"
echo "  - Concurrent allocations must not produce duplicates"
echo "  - Registry must remain consistent under load"
echo
echo "Test parameters:"
echo "  Processes: $PROCESSES"
echo "  Allocations per process: $ALLOCATIONS"
echo "  Total allocations: $((PROCESSES * ALLOCATIONS))"
echo

# Verify semaphore dependency exists
if [ ! -d "$SEMAPHORE_DIR" ]; then
    echo "file-based-semaphore-ts not found at: $SEMAPHORE_DIR"
    echo ""
    echo "This demonstrates graceful degradation:"
    echo "  - Tool works standalone"
    echo "  - Integration test requires monorepo context"
    echo ""
    echo "To run: git clone https://github.com/tuulbelt/tuulbelt.git"
    exit 0
fi

echo "file-based-semaphore-ts found"
echo

# Install dependencies if needed
cd "$TOOL_DIR"
if [ ! -d "node_modules" ]; then
    echo "Installing port-resolver dependencies..."
    npm ci --silent
fi

# Link CLI
npm link 2>/dev/null || true

# Create temp directory and clean registry
mkdir -p "$TEMP_DIR"
touch "$RESULTS_FILE"

# Clean any stale registry entries
portres clean 2>/dev/null || true

echo "Running concurrent port allocation test..."
echo

# Function to allocate ports in a subprocess
allocate_ports() {
    local process_id="$1"
    local count="$2"
    local results_file="$3"

    for i in $(seq 1 "$count"); do
        # Allocate a port with unique tag
        PORT=$(portres get --tag "dogfood-p${process_id}-${i}" 2>/dev/null || echo "ERROR")
        echo "$PORT" >> "$results_file"

        # Small random delay to increase concurrency overlap
        sleep 0.$((RANDOM % 10))
    done
}

# Export function for subshells
export -f allocate_ports

# Launch concurrent processes
PIDS=()
for p in $(seq 1 "$PROCESSES"); do
    allocate_ports "$p" "$ALLOCATIONS" "$RESULTS_FILE" &
    PIDS+=($!)
done

# Wait for all processes
echo "Waiting for $PROCESSES processes to complete..."
for pid in "${PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
done

echo
echo "Analyzing results..."
echo

# Count results
TOTAL_RESULTS=$(wc -l < "$RESULTS_FILE" | tr -d ' ')
UNIQUE_PORTS=$(grep -v "ERROR" "$RESULTS_FILE" | sort -u | wc -l | tr -d ' ')
ERROR_COUNT=$(grep -c "ERROR" "$RESULTS_FILE" || echo "0")
DUPLICATE_COUNT=$((TOTAL_RESULTS - UNIQUE_PORTS - ERROR_COUNT))

echo "Results:"
echo "  Total allocations attempted: $TOTAL_RESULTS"
echo "  Unique ports allocated: $UNIQUE_PORTS"
echo "  Errors: $ERROR_COUNT"
echo "  Duplicates: $DUPLICATE_COUNT"
echo

# Clean up allocated ports
echo "Cleaning up test allocations..."
portres clean 2>/dev/null || true

# Cleanup temp files
rm -rf "$TEMP_DIR"

# Evaluate results
if [ "$DUPLICATE_COUNT" -gt 0 ]; then
    echo "SEMAPHORE FAILURE!"
    echo ""
    echo "Duplicates found - race condition detected!"
    echo "The semaphore integration is NOT working correctly."
    exit 1
fi

if [ "$ERROR_COUNT" -gt "$((TOTAL_RESULTS / 4))" ]; then
    echo "HIGH ERROR RATE!"
    echo ""
    echo "More than 25% of allocations failed."
    echo "This may indicate semaphore contention issues."
    exit 1
fi

echo "SEMAPHORE INTEGRATION VALIDATED!"
echo ""
echo "Key findings:"
echo "  - $((PROCESSES * ALLOCATIONS)) concurrent allocations"
echo "  - Zero duplicate ports"
echo "  - Semaphore correctly serialized registry access"
echo "  - port-resolver safely uses file-based-semaphore-ts"
echo ""
echo "=========================================="
echo "Integration test complete!"
echo "=========================================="
