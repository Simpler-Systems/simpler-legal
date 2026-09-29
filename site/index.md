# Redact Mr. Chris P. Bacon → [Person1] before the document leaves your machine.

> Page: https://simpler.legal/ (Simpler Legal, home page). The same words as the page, as markdown.

Swap the names in a legal document for tags, check them, then hand it to any AI. The redaction runs **on hardware you own**: [46 unseen SEC-filed business agreements, zero identity leaks](https://simpler.legal/#evidence) across four consecutive fresh draws. 45 of those documents ran the engine as it stood before it was frozen, and one ran the frozen engine. Court judgments and a firm's own filings are harder, and the evidence says by how much. Nothing exports until you finish the review.

[Download](https://simpler.legal/#download) · [Read the source](https://github.com/Simpler-Systems/simpler-legal)

Free · Apache-2.0 · no account, no server of ours, no telemetry · v0.1.0 for Windows, not code-signed

![The Drop screen of Simpler Legal just after launch, while it looks for the local engine: a drop sheet for PDF, Word and plain-text files, a line saying nothing has left this machine this session beside a link to the network record, the Drop, Review and Export steps, a counter reading 0 requests off this machine, and an offer to try it on a sample NDA.](https://simpler.legal/assets/react-app-drop-v2.png)

NO API KEY · NO ACCOUNT · NO SERVER OF OURS

## Ink hides. Deletion removes.

*The core claim, live*

Ink drawn over text leaves the text in the file, one copy-paste away. Both documents below are real text on this page. The right-hand one is an illustration written in the export's tag format, not a recorded engine run.

Try it — select either document, copy, paste below

**How redaction usually works** — ink drawn over text

> Dear Mrs. Margaret Ellison, further to your instruction of 12 March, we confirm settlement from account 7449-2210-0031 and registration of the property at 14 Belmont Road in your name.

The names are still in this page — your selection just proved it.

**What a Simpler Legal export looks like** — text replaced, then rebuilt

> Dear [Person1], further to your instruction of 12 March, we confirm settlement from account [Id1] and registration of the property at [Address1] in your name.

Nothing to find — the name isn't hidden here, it isn't *in* here. View-source this page: same result.

Paste what you copied: It works on the left document. It has nothing to work on in the right one.

Simpler Legal never draws boxes over your document. Everything it redacts is **deleted from the text and replaced with a tag**, and a text export is a new file rebuilt from the cleaned text. A .docx export rewrites your original Word package instead, and is held back if a check of the finished file finds a listed name still in it. That check has blind spots, and [the IT brief lists every one](https://simpler.legal/it#files). Tags follow spellings, not people: one person can carry two tags, and a bare `[Person]` does not tell people apart, so read the copy before you send it. The map from tags back to names is a separate file that never exports with the document unless you explicitly say so.

## Your laptop becomes the AI server.

*Why local isn't a feature toggle*

"AI" has meant "send it to a data center" for so long that *local* sounds like a setting. It isn't — it's the direction of travel reversed. Your documents don't go to the AI. **The AI comes to you.**

**A cloud AI tool** — the document travels. *(A laptop sending documents over a wire to a large building labeled as someone else's computer.)* Your document travels to their machine. Their hardware reads it and their terms decide what is kept, and for how long — and your client's name is in it.

**Simpler Legal** — the AI moved in. *(A large laptop containing a small AI server at address 127.0.0.1 and a document that stays inside; the outgoing wire is severed with a red cut.)* The model lives on your disk — one 3.35 GB file, hash-checked when the app starts it. It serves at **127.0.0.1**: an address that cannot leave your machine, by definition. The document never touches the wire.

It's the same architecture the AI labs run — a model behind a server — except the server is your laptop and it listens only on 127.0.0.1. That's why there is **no per-page pricing, no monthly allowance, no metering**: nobody's hardware is doing you a favor. The model is **Google's Gemma 4 E2B, not fine-tuned or altered by us**. When the app starts it, the file is hashed against the SHA-256 pinned in the repository, the one Hugging Face lists for it at the revision this page links, and a file that does not match is refused. Length has a practical limit: in testing, documents of about 60,000 words ran for about 14 minutes and returned nothing, twice, and nothing yet records why.

## Four steps, all local

*The corridor*

One corridor, no suite, no workflow product. It does one job.

*(A document on a conveyor: dropped in, scanned and redacted, stamped as reviewed, then exported with its key produced separately.)*

1. **Drop.** A contract, a letter, an intake form. It never uploads — there is nowhere to upload to.
2. **Redact.** A wide sweep finds identities; code removes every copy document-wide; a second pass re-reads the result hunting anything left behind.
3. **Review.** Everything found, in one table, with keyboard shortcuts. The frozen engine flags no row as uncertain, so the reading is yours. Nothing exports until you finish.
4. **Export.** The redacted copy — plus, separately and only if you ask, the key that maps tags back to names.

## The review is the gate

*The app*

If a run is incomplete, or a masked name is still found in the export, the export is held. The last check is yours: nothing exports until you finish the review, and finishing is your sign-off, not the machine's.

![The review screen of Simpler Legal on its built-in sample NDA, which the app labels a fixed demo list, not an engine run: the original and the redacted copy side by side, names, companies, an address, an ID and phone numbers highlighted in the original and replaced by tags such as COMPANY 1 and PERSON 1 in the copy, an entity table grouped by kind, and a count reading 7 decided by you, 7 as marked automatically, 0 waiting on you, above the button that finishes the review.](https://simpler.legal/assets/react-app-review.png)

**Review.** Original and redacted side by side, every finding highlighted in place. The count under the table keeps apart what you decided and what stands as the machine marked it, and the receipt carries the same split.

![The export screen of Simpler Legal after the sample NDA's review: 14 found, 11 redacted in 13 tags, 3 left readable; a check that every name chosen for redaction is gone from the copy; a note that the entities come from the demo set; a receipt whose engine line reads none, fixed demo set; and buttons to copy the redacted text or save it as a file.](https://simpler.legal/assets/react-app-export.png)

**Export.** The honest funnel, verify-by-extraction plus a partial-name check, a receipt for your records — then copy the redacted text straight into the AI you use, or save it as a file. The original is never touched.

## The evidence

*Measured, published, reproducible*

Every accuracy number in this industry is a sentence you're asked to believe. Ours come with the files behind them: the draw manifests, the gold labels, the scorer and every round's board are committed in the repository, and the exhibits below link to them. The [full methodology, per-class results and leak ledger have their own page](https://simpler.legal/research).

**Exhibit A — The corpus.** Over 260 real public documents — Singapore, US and UK court judgments and SEC agreements — labelled by AI agents we ran ourselves *before* the engine saw them, and sealed by commit. How far the labels agree with a blind re-judging is measured and published too. [pii-bench/ in the repo](https://github.com/Simpler-Systems/simpler-legal/blob/main/pii-bench)

**Exhibit B — The rounds.** Every round draws fresh documents by a fixed rule committed with the draw, and the board publishes as drawn, misses included, each named by class with its diagnosis. The rule was not registered in advance; the research page says when each was committed. [the full measurement record](https://github.com/Simpler-Systems/simpler-legal/blob/main/BENCHMARK.md)

**Exhibit C — The freeze.** The engine is frozen with a claims table, each claim beside the record it cites. It unfreezes only if an identity leaks in the frozen configuration on real paper, or the maintainer orders it. Where that table and this site differ, the site's wording is the checked one. [FREEZE.md — the freeze and its claims table](https://github.com/Simpler-Systems/simpler-legal/blob/main/FREEZE.md)

| Measurement | Corpus | Result |
|---|---|---|
| [SEC-filed business agreements — four consecutive fresh draws, first contact each time](https://github.com/Simpler-Systems/simpler-legal/blob/main/BENCHMARK.md) | 46 unseen EDGAR agreements, 2001–2026 filings: rounds 5, 6 and 7 and the post-freeze probe. 43 of the 46 contain an identity to leak | **Zero identity leaks** — gate 100%. Round 4, the draw before, leaked 3 in 1 of its 15, published as drawn |
| [Court judgments — the hard genre, latest fresh round, published as drawn](https://github.com/Simpler-Systems/simpler-legal/blob/main/ROUND7.md) | 25 unseen SG + US judgments | 97.7% identity recall · 21/25 leak-free |
| [Jurisdiction transfer — the courts configuration from before the round-6 and round-7 fixes](https://github.com/Simpler-Systems/simpler-legal/blob/main/BENCHMARK.md) | 10 UK judgments it was never tuned for; the frozen configuration has not been run on them | **100.0% identity recall** — gate 100% |
| [The other direction — what a frontier AI still extracts from the redacted copy](https://github.com/Simpler-Systems/simpler-legal/blob/main/pii-bench/utility-bench) | 25 round-4 documents masked before the freeze · 125 questions, scored by a model judge told which answer came from which copy | **0.968** substance-equivalence |
| [The post-freeze probe — a document drawn and run after the engine was frozen](https://github.com/Simpler-Systems/simpler-legal/blob/main/FREEZE.md) | 1 agreement, filed 2026-01-21 and in no earlier draw | **Zero identity leaks** — 3 identity spans in its gold, 0 readable |
| [The gold's own agreement — 240 development-set calls re-judged blind](https://github.com/Simpler-Systems/simpler-legal/blob/main/pii-bench/gold-ceiling) | quasi-identifier mask-or-keep calls only; identity labels not sampled | 88.8% agreement (213/240), against 84.6% for answering “keep” every time |
| [Court filings in a firm's own shapes — briefs, complaints, letters, a settlement, declarations](https://github.com/Simpler-Systems/simpler-legal/blob/main/FREEZE.md) | 20 public filings, 296 identifiers listed by one AI agent; no second labeller and no sealed gold | Default setting: an identifier still readable in **14 of 20**. With the “Our own matter files” setting: 8 of 20 |

Measured 2026-07-19 → 2026-07-24, each row from a committed board, except the firm-filings row (2026-09-15), whose record is a ledger entry. Every number is for the full pipeline with its local model; when the app falls back to its lighter in-app engine it says so, and no number here was measured on that path. Both kinds of row are published — the genre that converged and the one where every fresh draw still finds something new. A vendor that shows you only one number is showing you the wrong one. [The measurement record](https://simpler.legal/research) has the methodology and every named miss.

### Reproduce it yourself

The manifests, the sealed gold (as character offsets, not text), the scorer and every board ship in the tree. The documents re-fetch from their public sources, and the Singapore Family Court gold is withheld, so the courts numbers do not fully rebuild. The [research page](https://simpler.legal/research#repro) has the whole procedure.

```
git clone https://github.com/Simpler-Systems/simpler-legal
cd simpler-legal
node score-pii.mjs selftest   # the scorer proves itself first: 8/8
```

**The honest claim:** what gets removed is identities — people's names, identifiers, the things that point at a person. Dates, amounts, business facts and most places stay on purpose, because that is what the AI has to reason about, and by default so do company names that are not the document's own. Across the 46 agreements, 245 of 503 quasi-identifier spans stayed readable, so a distinctive enough profile can still be inferred. The claim is that identities are withheld, not that inference is impossible. That's why nothing exports until you finish the review: the last line of defense is you.

## Download

*Get it*

Desktop app for Windows. It reads PDF, Word and plain text. The model (3.35 GB) is not in the installer, and the app does not download it: you download `gemma-4-E2B_q4_0-it.gguf` yourself, from [Google's Hugging Face repository, at the revision the app is pinned to](https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/resolve/69536a21d70340464240401ba38223d805f6a709/gemma-4-E2B_q4_0-it.gguf), and the app **hash-checks it** before it runs. The file of the same name on that repository's main branch is a later upload, and the app refuses it.

- **Windows** — .exe installer · x64 · per-user install, no admin needed. **v0.1.0, Windows, unsigned: Windows SmartScreen will warn** before it runs (see “Heads up” below). [Download from GitHub Releases](https://github.com/Simpler-Systems/simpler-legal/releases/latest)
- **macOS** — Not built. The build produces a Windows installer only.
- **Linux** — Not built. The build produces a Windows installer only.

Every release is on [GitHub Releases](https://github.com/Simpler-Systems/simpler-legal/releases). To build the installer yourself, follow [BUILDING.md](https://github.com/Simpler-Systems/simpler-legal/blob/main/BUILDING.md).

### Where to put the model

In `%APPDATA%\Simpler AI\models`, or name its folder in the `SIMPLER_MODEL_PATH` environment variable. The app also looks in your Downloads folder and in the model folders of LM Studio, Hugging Face, GPT4All, Jan and Ollama, and never searches the whole disk. The hash decides, not the filename. Settings shows which file it found.

### On a work machine?

By the app's code, every call it makes goes to 127.0.0.1. Its installer may fetch Microsoft's WebView2 runtime, and no packet capture of the packaged app is on record yet. The [IT brief](https://simpler.legal/it) covers the local ports, the model server and the installer, and [PRIVACY.md](https://github.com/Simpler-Systems/simpler-legal/blob/main/PRIVACY.md) says what the app keeps on disk. Report a security problem privately, through the repository's [Security tab](https://github.com/Simpler-Systems/simpler-legal/security/advisories/new), as [SECURITY.md](https://github.com/Simpler-Systems/simpler-legal/blob/main/SECURITY.md) says, and never with a client's document attached.

### Heads up, Windows users

Version 0.1.0 is **not code-signed**, so Windows SmartScreen will warn: a blue "Windows protected your PC" screen. Click **More info → Run anyway**. The warning is accurate: there is no publisher for Windows to recognise. The way to know what you are running is to read the source and build it yourself ([BUILDING.md](https://github.com/Simpler-Systems/simpler-legal/blob/main/BUILDING.md)).

### Command line today

The engine runs from source on Node 20 or later, with no dependencies. You bring the model file and a llama.cpp build; `tools\launch-server.cmd` serves the pinned model and `node serve-legal.mjs` puts the frozen engine on `127.0.0.1:1436`. The launcher leaves the model server's `/slots` endpoint on, which lets a web page read the last text it was given, so set `LLAMA_ARG_ENDPOINT_SLOTS=0` first ([the IT brief](https://simpler.legal/it#ports) says why).

## Don't trust us — check

*Audit us*

The privacy claim is testable. The first check takes five minutes and no expertise at all.

- **The airplane test — anyone can do this.** Turn off Wi-Fi, redact a document. By the code, everything should keep working, because every call the app makes is to this machine. No recorded run of this test is on file yet.
- **Watch the wire.** Run a network monitor (Wireshark, or Windows' own Resource Monitor or pktmon) during a redaction. By the code, you should see only loopback traffic to 127.0.0.1. No capture of this is on record yet.
- **Read the code.** It's Apache-2.0 source, on GitHub. Grep the app and engine for a network call: every one goes to 127.0.0.1. There is no updater and no telemetry. The [IT brief](https://simpler.legal/it#verify) lists the other addresses in the source, and why none is requested.
- **In the app itself.** The egress pill in the corner reads "0 requests off this machine" and opens that window's live network record — what the app itself requested, and what the browser loaded for the page. It says what it cannot see, too.

## Common questions

### Can I use this with privileged or confidential matter files?

The redaction stays in your custody: this is local software, and there is no server of ours to receive your originals. But the copy you then send to an AI provider still carries the matter's facts, dates, amounts and most places, by default the names of companies that are not the document's own, and anything the engine missed: on a firm's own filings, an identifier stayed readable in 14 of 20 under the default setting. Review it before you send it, and weigh the provider's terms as you would for any disclosure. Not legal advice.

### What files does it read?

PDF, Word (.docx) and plain text. Scanned or image-only pages need OCR, which isn't included yet: a PDF with no readable page is held, and a scanned page inside a readable one is left out, with a line in its place. A text export is a new file rebuilt from the redacted text. A .docx export rewrites your original Word package and is held back if a check of the finished file finds a listed name still in it; [the IT brief lists what that check cannot see](https://simpler.legal/it#files).

### What does it cost?

Nothing. Apache-2.0-licensed, no account, no tiers. If you want document work handled end-to-end on the AI subscription you already pay for, that's our sibling product — [simpler.asia](https://simpler.asia).

## Made by the same people

- [Simpler.Host](https://simpler.host): the app: WhatsApp, email and calendar, on your own computer
- [Simpler.Asia](https://simpler.asia): the paperwork that runs the shop, done by your AI
- [Simpler.Run](https://simpler.run): check the rent and footfall before you sign the lease
- [Simpler.House](https://simpler.house): drop a floor plan, get the schedule before anyone quotes you
- [Simpler.Tax](https://simpler.tax): your company’s bookkeeping and tax, in one place
- [Simpler.Red](https://simpler.red): take the names out before you paste into an AI
- [Simpler.Capital](https://simpler.capital): the planned money side of Simpler, not open today

---

Simpler Legal · [Research](https://simpler.legal/research) · [IT brief](https://simpler.legal/it) · [GitHub](https://github.com/Simpler-Systems/simpler-legal) · [Releases](https://github.com/Simpler-Systems/simpler-legal/releases) · [Security](https://github.com/Simpler-Systems/simpler-legal/blob/main/SECURITY.md) · [Privacy](https://github.com/Simpler-Systems/simpler-legal/blob/main/PRIVACY.md)

Want it handled end-to-end, on the AI subscription you already pay for? [simpler.asia](https://simpler.asia)

© 2026 Simpler Terminal Value Systems Pte Ltd · Apache-2.0 licensed · the Gemma 4 model is Google's, also under Apache-2.0
