# List the exact false negatives under the official scorer — direct entities first.
#   python show-fn.py <gold.json> <masked.json>
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'raw', 'tab'))
import evaluation

gold = evaluation.GoldCorpus(sys.argv[1])
masked = evaluation.get_masked_docs_from_file(sys.argv[2])
masked_by_id = {d.doc_id: d for d in masked}

print("=== DIRECT entities not fully masked (official accounting) ===")
for doc_id, gdoc in gold.documents.items():
    if doc_id not in masked_by_id:
        continue
    mdoc = masked_by_id[doc_id]
    for entity in gdoc.get_entities_to_mask(include_direct=True, include_quasi=False):
        if not gdoc.is_masked(mdoc, entity):
            print(f"{doc_id}  entity={entity.entity_id}")
            for incr, (s, e) in enumerate(sorted(entity.mentions)):
                ok = gdoc.is_mention_masked(mdoc, s, e)
                needs = entity.mention_level_masking[list(entity.mentions).index((s, e))]
                print(f"    [{s},{e}] {'ok' if ok else 'LEAKED'}{'' if needs else ' (no-mask-needed)'}  {gdoc.text[s:e][:60]!r}")
