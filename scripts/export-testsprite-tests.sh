#!/bin/bash
set -e

# Create directories
mkdir -p testsprite_tests/test-cases

echo "Exporting TestSprite test cases..."

tests=(
  "54fb472b-cd69-4f7b-8711-aa45625abb1e:landing-page"
  "41b3c90c-43f6-4b46-bae4-51b78b0ee2cf:login-page"
  "73fc830e-9054-44a8-a4a3-7dd1bf52e3a2:pr-scan-auth-guard"
  "37917aa6-d82c-4d53-a7f9-73df2c83f31e:clean-code-scan"
  "85f99ee9-7119-4df3-a026-ed6339a47e4c:diff-scan-cheating"
  "ccc2bbc4-88f3-4347-a93e-a4b6e425472d:benchmark-dashboard"
  "ace8ff04-a620-46ef-9efe-701046fa92f8:history-page"
)

for item in "${tests[@]}"; do
  id="${item%%:*}"
  name="${item##*:}"
  echo "Fetching test code for $name ($id)..."
  testsprite test code get "$id" > "testsprite_tests/test-cases/$name.py"
done

echo "Test cases successfully exported to testsprite_tests/test-cases/"
