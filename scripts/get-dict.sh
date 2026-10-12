#!/bin/sh
# Fetch sources and build data/dict/dict.db (~270 MB: 1.3M EN->VI entries + 159k VI->EN entries).
# Needs ~4 GB free disk (temp) and ~6 GB RAM for ~2 minutes. Run once; re-run to rebuild.
set -e
cd "$(dirname "$0")/.."
mkdir -p data/dict
B=https://raw.githubusercontent.com/skypediacode/english-vietnamese-dictionary/main
[ -f data/dict/dictionary_en_vi.db ] || curl -fL -o data/dict/dictionary_en_vi.db "$B/dictionary_en_vi.db"
[ -f data/dict/ATTRIBUTION.md ] || curl -fL -o data/dict/ATTRIBUTION.md "$B/ATTRIBUTION.md"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
curl -fL -o "$T/vi.jsonl" https://kaikki.org/dictionary/Vietnamese/kaikki.org-dictionary-Vietnamese.jsonl
curl -fL -o "$T/en.jsonl" https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl
node --no-warnings --max-old-space-size=6144 scripts/build-dict.js "$T/en.jsonl" "$T/vi.jsonl"
