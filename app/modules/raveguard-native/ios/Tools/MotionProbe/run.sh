#!/bin/sh
# Builds motion-probe into a tiny .app and runs it, passing arguments through.
# macOS checks Motion permission against the "responsible" app; a bare CLI inherits
# the terminal's (which has no motion usage string) and gets killed by TCC. As its
# own .app it asks for permission itself.
#
#   Tools/MotionProbe/run.sh                     live pitch/roll/yaw (J1)
#   Tools/MotionProbe/run.sh record nod justin 8 record a take into the current folder
#   swift run motion-probe replay Motion/Fixtures   (replay needs no permission)
set -e
here="$(cd "$(dirname "$0")" && pwd)"
pkg="$here/../.."
swift build --package-path "$pkg" --product motion-probe >/dev/null
bin="$(swift build --package-path "$pkg" --show-bin-path)/motion-probe"
app="$pkg/.build/MotionProbe.app"
mkdir -p "$app/Contents/MacOS"
cp "$here/Info.plist" "$app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleExecutable string motion-probe" "$app/Contents/Info.plist" 2>/dev/null || true
cp "$bin" "$app/Contents/MacOS/motion-probe"
codesign --force --sign - --identifier app.raveguard.motion-probe "$app" >/dev/null 2>&1
out="$(mktemp -t motion-probe)"
: > "$out"
tail -f "$out" & tailpid=$!
trap 'pkill -f "$app/Contents/MacOS/motion-probe" 2>/dev/null; kill $tailpid 2>/dev/null; rm -f "$out"' EXIT INT TERM
open -W -n --stdout "$out" --stderr "$out" --env "MOTION_PROBE_DIR=$(pwd)" "$app" --args "$@"
