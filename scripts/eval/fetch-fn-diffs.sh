#!/bin/bash
# Fetch D6 FN PR diffs — look for assertion patterns D6 is missing

PRS=(
  "https://github.com/fitspace676-ctrl/fit/pull/133.diff"
  "https://github.com/PandaKitten96/supabase/pull/1.diff"
  "https://github.com/velocity-exchange/protocol-v2/pull/2134.diff"
  "https://github.com/RealDevSquad/website-status/pull/1336.diff"
  "https://github.com/wechaty/puppet-walnut/pull/4.diff"
  "https://github.com/eslam21006-coding/qarar/pull/15.diff"
)

for url in "${PRS[@]}"; do
  echo "=== $url ==="
  curl -sL "$url" 2>/dev/null | grep -E '^\+(.*\.(to|assert|should|must|has|have|will)[A-Za-z]+\()' | head -10
  echo ""
done
