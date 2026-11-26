#!/usr/bin/env bash
# Paints the Night Drive concept batch with tools/imagegen/gen.py (run from the repo root). The takes land in
# imagegen-out/<name>/ (not in git); copy the picks into night-drive/concept/.
# usage: bash night-drive/paint.sh [names...]   (default: grid, background and every symbol prompt)
set -u
PY=math-sdk/env/Scripts/python.exe; P=night-drive/prompts
names=("$@"); [ ${#names[@]} -eq 0 ] && names=(nd-grid3 nd-bg $(ls $P | grep '^nd-sym-' | sed 's/\.txt$//'))
for n in "${names[@]}"; do
  case $n in
    nd-grid3) args="--aspect 1:1 --bg green --n 2" ;;
    nd-bg) args="--aspect 16:9 --bg none --n 2" ;;
    *) args="--aspect 1:1 --bg green --n 1" ;;
  esac
  echo "== $n"; $PY tools/imagegen/gen.py $n @$P/$n.txt $args --yes 2>&1 | grep -E "take-|failed|depleted" | cut -c1-160
done
