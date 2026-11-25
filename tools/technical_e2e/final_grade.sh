#!/bin/sh
# Re-investigate every case of the day with the final AI and dump the views for grading.
OUT=/e/wt-tech-e2e/artifacts/technical_e2e/20261125/ai_final.txt
: > $OUT
for n in 03 05 06 07 08 09 10 11 12; do
  J=$(python -c "import json;print(json.load(open('E:/wt-tech-e2e/artifacts/technical_e2e/20261125/case-$n.json'))['journal']['id'])")
  C=$(PYTHONIOENCODING=utf-8 python reinvestigate.py $J "final grading run 2026-11-25" | awk '{print $1}')
  echo "=== case $n journal $J -> $C" >> $OUT
  PYTHONIOENCODING=utf-8 python show_case.py $C >> $OUT 2>&1
done
echo FINISHED >> $OUT
