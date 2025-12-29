#!/bin/bash
# Dogfood: Prove test outputs are deterministic using Output Diffing Utility
#
# Usage: ./scripts/dogfood-diff.sh
#
# This validates that running tests twice produces identical output,
# proving the test suite is deterministic. Uses Rust odiff for semantic
# diffing when available, falls back to standard diff.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOL_DIR="$(dirname "$SCRIPT_DIR")"
ODIFF_DIR="$TOOL_DIR/../output-diffing-utility"
ODIFF_BIN="$ODIFF_DIR/target/release/odiff"
TEMP_DIR="/tmp/dogfood-diff-$$"

echo "=========================================="
echo "Dogfooding: Output Determinism Validation"
echo "Tool: test-port-resolver (portres)"
echo "Validator: output-diffing-utility (odiff)"
echo "=========================================="
echo

# Check for odiff
USE_ODIFF=0
if [ -d "$ODIFF_DIR" ]; then
    if [ ! -f "$ODIFF_BIN" ]; then
        echo "Building odiff..."
        cd "$ODIFF_DIR"
        cargo build --release --quiet
        cd "$TOOL_DIR"
    fi
    if [ -f "$ODIFF_BIN" ]; then
        USE_ODIFF=1
        echo "Using: Rust odiff (semantic diffing)"
    fi
else
    echo "⚠️  output-diffing-utility not found"
    echo "   Using standard diff (still validates determinism)"
fi

echo

# Create temp directory
mkdir -p "$TEMP_DIR"
cd "$TOOL_DIR"

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "Run 1: Executing tests..."
npm test > "$TEMP_DIR/run1.txt" 2>&1
RUN1_EXIT=$?
echo "   Exit code: $RUN1_EXIT"

echo "Run 2: Executing tests..."
npm test > "$TEMP_DIR/run2.txt" 2>&1
RUN2_EXIT=$?
echo "   Exit code: $RUN2_EXIT"

echo

# Check exit codes match
if [ "$RUN1_EXIT" != "$RUN2_EXIT" ]; then
    echo "❌ FLAKY: Exit codes differ ($RUN1_EXIT vs $RUN2_EXIT)"
    exit 1
fi

echo "Comparing outputs..."
echo

# Normalize outputs (remove timing, sort for order-independence)
# Async tests may run in different order, but results should be identical
normalize_output() {
    # Extract test results, sort for order-independent comparison
    grep -E "^(ok|not ok)" "$1" | sort > "$2"
    # Append summary counts (these must match exactly)
    grep -E "^# (tests|pass|fail)" "$1" >> "$2"
}

normalize_output "$TEMP_DIR/run1.txt" "$TEMP_DIR/run1_normalized.txt"
normalize_output "$TEMP_DIR/run2.txt" "$TEMP_DIR/run2_normalized.txt"

if [ "$USE_ODIFF" = "1" ]; then
    # Use odiff for semantic comparison
    if "$ODIFF_BIN" "$TEMP_DIR/run1_normalized.txt" "$TEMP_DIR/run2_normalized.txt" --type text --quiet 2>/dev/null; then
        echo "✅ IDENTICAL (verified by odiff)"
        echo
        echo "Both test runs produced the same results:"
        grep -E "^# (tests|pass|fail)" "$TEMP_DIR/run1.txt"
    else
        echo "❌ DIFFERENCES DETECTED"
        echo
        "$ODIFF_BIN" "$TEMP_DIR/run1_normalized.txt" "$TEMP_DIR/run2_normalized.txt" --type text 2>/dev/null || true
        exit 1
    fi
else
    # Fall back to standard diff
    if diff -q "$TEMP_DIR/run1_normalized.txt" "$TEMP_DIR/run2_normalized.txt" > /dev/null 2>&1; then
        echo "✅ IDENTICAL (verified by diff)"
        echo
        echo "Both test runs produced the same results:"
        grep -E "^# (tests|pass|fail)" "$TEMP_DIR/run1.txt"
    else
        echo "❌ DIFFERENCES DETECTED"
        echo
        diff "$TEMP_DIR/run1_normalized.txt" "$TEMP_DIR/run2_normalized.txt" || true
        exit 1
    fi
fi

echo
echo "=========================================="
echo "Output determinism validated!"
echo "Test suite produces consistent results."
echo "=========================================="
