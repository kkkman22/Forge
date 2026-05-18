#!/usr/bin/env bash
set -euo pipefail

# Build Forge Loop Desktop .dmg (universal binary for arm64 + x86_64)
# Usage: scripts/build-dmg.sh [--skip-bundle] [--arch-only]

SKIP_BUNDLE=false
ARCH_ONLY=false
for arg in "$@"; do
    case "$arg" in
        --skip-bundle) SKIP_BUNDLE=true ;;
        --arch-only)   ARCH_ONLY=true ;;
    esac
done

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESOURCES_DIR="$ROOT_DIR/src-tauri/resources"
TAURI_DIR="$ROOT_DIR/src-tauri"

echo "==> Building Forge Loop Desktop DMG..."

# Step 1: Bundle resources
if [[ "$SKIP_BUNDLE" == "false" ]]; then
    echo "  Bundling Node.js (universal)..."
    bash "$ROOT_DIR/../../scripts/bundle-node.sh" "$RESOURCES_DIR" "$([ "$ARCH_ONLY" == "true" ] && echo "false" || echo "true")"

    echo "  Bundling forge-loop SDK..."
    bash "$ROOT_DIR/../../scripts/bundle-forge-loop.sh" "$ROOT_DIR/../.." "$RESOURCES_DIR"
fi

# Step 2: Build frontend
echo "  Building frontend..."
cd "$ROOT_DIR"
npm run build

# Step 3: Build Tauri app (release)
cd "$TAURI_DIR"

if [[ "$ARCH_ONLY" == "true" ]]; then
    echo "  Building Tauri app (single-arch release)..."
    cargo tauri build 2>&1 | tail -20
else
    echo "  Building Tauri app (universal: arm64 + x86_64)..."

    # Build arm64
    echo "  [1/2] cargo tauri build --target aarch64-apple-darwin..."
    cargo tauri build --target aarch64-apple-darwin 2>&1 | tail -20

    # Build x86_64
    echo "  [2/2] cargo tauri build --target x86_64-apple-darwin..."
    cargo tauri build --target x86_64-apple-darwin 2>&1 | tail -20

    # Create universal .app by merging binaries with lipo
    ARM64_APP="$TAURI_DIR/target/aarch64-apple-darwin/release/bundle/macos/Forge Loop.app"
    X86_APP="$TAURI_DIR/target/x86_64-apple-darwin/release/bundle/macos/Forge Loop.app"
    UNIVERSAL_DIR="$TAURI_DIR/target/universal-apple-darwin/release/bundle/macos"

    if [ -d "$ARM64_APP" ] && [ -d "$X86_APP" ]; then
        echo "  Merging universal .app..."
        mkdir -p "$UNIVERSAL_DIR"
        cp -r "$ARM64_APP" "$UNIVERSAL_DIR/"

        UNIVERSAL_APP="$UNIVERSAL_DIR/Forge Loop.app"
        MAIN_BIN="$UNIVERSAL_APP/Contents/MacOS/Forge Loop"

        if [ -f "$MAIN_BIN" ]; then
            lipo -create \
                "$ARM64_APP/Contents/MacOS/Forge Loop" \
                "$X86_APP/Contents/MacOS/Forge Loop" \
                -output "$MAIN_BIN"
            echo "  ✓ Universal binary created"
        else
            # Tauri may use a different binary name; try app binary discovery
            ARM64_BINS=$(find "$ARM64_APP/Contents/MacOS" -type f ! -name ".*" 2>/dev/null || true)
            for bin in $ARM64_BINS; do
                bin_name=$(basename "$bin")
                x86_bin="$X86_APP/Contents/MacOS/$bin_name"
                if [ -f "$x86_bin" ] && file "$bin" | grep -q "Mach-O"; then
                    lipo -create "$bin" "$x86_bin" -output "$UNIVERSAL_APP/Contents/MacOS/$bin_name"
                    echo "  ✓ Universal binary: $bin_name"
                fi
            done
        fi

        # Also merge any auxiliary binaries in Frameworks/
        if [ -d "$ARM64_APP/Contents/Frameworks" ]; then
            for arm_fw in "$ARM64_APP/Contents/Frameworks"/*; do
                fw_name=$(basename "$arm_fw")
                x86_fw="$X86_APP/Contents/Frameworks/$fw_name"
                dest_fw="$UNIVERSAL_APP/Contents/Frameworks/$fw_name"
                if [ -f "$x86_fw" ] && file "$arm_fw" | grep -q "Mach-O"; then
                    lipo -create "$arm_fw" "$x86_fw" -output "$dest_fw" 2>/dev/null || true
                fi
            done
        fi

        # Copy DMG if exists
        ARM64_DMG="$TAURI_DIR/target/aarch64-apple-darwin/release/bundle/dmg/Forge Loop.dmg"
        UNIVERSAL_DMG_DIR="$TAURI_DIR/target/universal-apple-darwin/release/bundle/dmg"
        if [ -f "$ARM64_DMG" ]; then
            mkdir -p "$UNIVERSAL_DMG_DIR"
            cp "$ARM64_DMG" "$UNIVERSAL_DMG_DIR/"
        fi
    else
        echo "  ⚠ Could not find both arch .app bundles; skipping universal merge"
    fi
fi

# Step 4: Verify output
if [[ "$ARCH_ONLY" == "true" ]]; then
    BUNDLE_DIR="$TAURI_DIR/target/release/bundle"
else
    BUNDLE_DIR="$TAURI_DIR/target/universal-apple-darwin/release/bundle"
fi

APP_PATH="$BUNDLE_DIR/macos/Forge Loop.app"
DMG_PATH="$BUNDLE_DIR/dmg/Forge Loop.dmg"

if [ -d "$APP_PATH" ]; then
    APP_SIZE=$(du -sh "$APP_PATH" | cut -f1)
    MAIN_BIN="$APP_PATH/Contents/MacOS/Forge Loop"
    if [ -f "$MAIN_BIN" ]; then
        ARCH_INFO=$(file "$MAIN_BIN" | grep -o 'Mach-O .*' || echo "unknown")
        echo "  ✓ .app built: $APP_SIZE ($ARCH_INFO)"
    else
        echo "  ✓ .app built: $APP_SIZE"
    fi
else
    echo "  ✗ .app not found at $APP_PATH"
    exit 1
fi

if [ -f "$DMG_PATH" ]; then
    DMG_SIZE=$(du -sh "$DMG_PATH" | cut -f1)
    echo "  ✓ .dmg built: $DMG_SIZE"
else
    echo "  ⚠ .dmg not found (may need tauri-bundler config)"
    echo "  .app is at: $APP_PATH"
fi

echo "==> Done"
