// simpler.legal — OCR prototype (the road out of scan-refusal). tesseract.js, local WASM.
// DOCTRINE NOTE: tesseract.js fetches its core + language data from a CDN BY DEFAULT.
// The shipped app must bundle worker/core/traineddata and point langPath/corePath/workerPath
// at local files (design doc §3.5) — this prototype allows the one-time dev download.
// OCR output NEVER gets native-text trust: every word carries confidence; pages are flagged
// "text recovered from pixels — verify against the image."

import { createWorker } from 'tesseract.js';

export async function ocrImage(imageBuf) {
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(imageBuf, {}, { blocks: true, text: true });
    const words = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const line of para.lines ?? []) {
          for (const w of line.words ?? []) {
            words.push({ text: w.text, confidence: Math.round(w.confidence) });
          }
        }
      }
    }
    const lowConf = words.filter(w => w.confidence < 70);
    return {
      text: data.text,
      confidence: Math.round(data.confidence),
      words: words.length,
      lowConfidence: lowConf.map(w => `${w.text} (${w.confidence})`),
      flag: 'OCR — text recovered from pixels; verify against the page image before trusting completeness',
    };
  } finally {
    await worker.terminate();
  }
}
