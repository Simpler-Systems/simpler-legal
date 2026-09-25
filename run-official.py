# Thin runner around TAB's pinned evaluation.py (its own CLI passes a list where a str is
# expected — upstream bug; the scorer itself is untouched, we import and call it directly).
#   python run-official.py <gold.json> <masked.json>
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'raw', 'tab'))
import evaluation

gold = evaluation.GoldCorpus(sys.argv[1])
masked = evaluation.get_masked_docs_from_file(sys.argv[2])
# evaluate() only accepts docs present in gold; ours all are
measures = evaluation.evaluate(gold, masked, use_bert=False, verbose=False)
print("\n=== OFFICIAL TAB METRICS (evaluation.py, pinned) ===")
for k, v in measures.items():
    print(f"{k}: {v}")
