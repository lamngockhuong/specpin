#!/usr/bin/env bash
# Export each surface's single dual-theme .pen to light AND dark PNGs, then build
# overview.png (columns = light | dark, rows = surface).
#
# Each <surface>.pen holds one layout with per-theme color variables. We pick the
# primary frame (largest non-reusable top-level frame), pin its theme to light or
# dark, and export. Deterministic: uses `pencil interactive` headless (no AI).
#
# Usage:  ./render.sh
set -euo pipefail
cd "$(dirname "$0")"

surfaces=(popup options sidebar capture-form)
tmp_exp="$(mktemp -d)"
trap 'rm -rf "$tmp_exp"' EXIT

for s in "${surfaces[@]}"; do
  file="$s.pen"
  [[ -f "$file" ]] || { echo "  [skip] $file missing"; continue; }
  # Normalize for the headless loader (schema 2.13, no cloud token).
  tmpjson="$(mktemp)"; jq 'del(.fileToken) | .version="2.13"' "$file" > "$tmpjson" && mv "$tmpjson" "$file"
  node="$(jq -r '[.children[] | select((.reusable // false) | not)]
                 | sort_by((.width // 0) * (.height // 0)) | last | .id' "$file")"

  for theme in light dark; do
    pinned="$tmp_exp/$s.$theme.pen"
    jq --arg id "$node" --arg m "$theme" \
      '(.children[] | select(.id==$id)).theme = {mode:$m}' "$file" > "$pinned"
    echo "Exporting $file [$node] @ $theme -> $s.$theme.png"
    printf 'export_nodes({ nodeIds: ["%s"], outputDir: "%s", scale: 2 })\nexit()\n' "$node" "$tmp_exp" \
      | pencil interactive --in "$pinned" --out "/tmp/specpin-render-noop.pen" >/dev/null 2>&1 || true
    if [[ -f "$tmp_exp/$node.png" ]]; then mv -f "$tmp_exp/$node.png" "$s.$theme.png"
    else echo "  [error] export failed for $file @ $theme" >&2; fi
  done
done

echo "Building overview.png montage (cols = light | dark)..."
montage \
  popup.light.png popup.dark.png \
  options.light.png options.dark.png \
  sidebar.light.png sidebar.dark.png \
  capture-form.light.png capture-form.dark.png \
  -tile 2x4 -geometry '420x820>+24+24' -background '#E5E5E8' \
  -label '%f' -title 'Specpin Extension UI - light | dark' \
  overview.png

echo "Done. Regenerated PNGs + overview.png"
