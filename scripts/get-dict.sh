#!/bin/sh
# Download the offline English–Vietnamese dictionary (CC BY-SA 4.0) into data/dict/.
set -e
cd "$(dirname "$0")/.."
mkdir -p data/dict
B=https://raw.githubusercontent.com/skypediacode/english-vietnamese-dictionary/main
[ -f data/dict/dictionary_en_vi.db ] || curl -fL -o data/dict/dictionary_en_vi.db "$B/dictionary_en_vi.db"
[ -f data/dict/ATTRIBUTION.md ] || curl -fL -o data/dict/ATTRIBUTION.md "$B/ATTRIBUTION.md"
echo "Dictionary ready: $(du -h data/dict/dictionary_en_vi.db | cut -f1)"
