/* Transcribing a recording, on this server.

   The audio is never sent to an outside transcription service: Whisper runs here, through
   transformers.js. That matters because these recordings hold real stories about real
   families, and it means there is one less key to set up. The model is downloaded once and
   kept on the volume.

   What comes back is every word with its start and end time, which is what lets a clip be
   cut on a word and a caption appear when it is said. */
'use strict';

const fs = require('fs');
const path = require('path');

/* Tried in order. Each is a Whisper export that carries word timing. CLIPS_WHISPER_MODEL
   puts a different one first. */
const MODELS = [
  { id: 'onnx-community/whisper-small_timestamped', opts: {} },
  { id: 'Xenova/whisper-small.en', opts: { revision: 'output_attentions' }, english: true },
  { id: 'onnx-community/whisper-base_timestamped', opts: {} }
];

let loaded = null;

async function load(cacheDir, preferred, log) {
  if (loaded) return loaded;
  const tf = await import('@huggingface/transformers');
  tf.env.cacheDir = cacheDir;
  tf.env.allowLocalModels = false;
  const list = (preferred ? [{ id: preferred, opts: {}, english: /\.en($|_)/.test(preferred) }] : []).concat(MODELS);
  let lastError = null;
  for (const m of list) {
    try {
      const pipe = await tf.pipeline('automatic-speech-recognition', m.id, Object.assign({ dtype: 'fp32' }, m.opts));
      loaded = { pipe, model: m };
      if (log) log('transcription model ready: ' + m.id);
      return loaded;
    } catch (e) {
      lastError = e;
      if (log) log('transcription model ' + m.id + ' could not be loaded: ' + (e && e.message));
    }
  }
  throw new Error('No transcription model could be loaded. ' + (lastError && lastError.message ? lastError.message : ''));
}

/* pcmPath: raw 16 kHz mono 32-bit float audio, as ffmpeg writes it. */
async function transcribe(pcmPath, opts) {
  opts = opts || {};
  const { pipe, model } = await load(opts.cacheDir, opts.model, opts.log);
  const buf = fs.readFileSync(pcmPath);
  const audio = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const args = { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 };
  if (!model.english) { args.language = 'english'; args.task = 'transcribe'; }
  const out = await pipe(audio, args);
  const words = [];
  (out.chunks || []).forEach((c) => {
    const w = String(c.text || '').trim();
    const t = c.timestamp || [];
    if (!w || typeof t[0] !== 'number') return;
    const s = t[0], e = typeof t[1] === 'number' && t[1] >= s ? t[1] : s + 0.3;
    words.push({ s: Math.round(s * 100) / 100, e: Math.round(e * 100) / 100, w });
  });
  /* Whisper can stamp a word before the one in front of it across a chunk seam. Keep order. */
  for (let i = 1; i < words.length; i++) if (words[i].s < words[i - 1].s) words[i].s = words[i - 1].s;
  return { words, model: model.id };
}

module.exports = { transcribe, MODELS };
