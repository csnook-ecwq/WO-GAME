// Inlines engine.cjs and levels.json into game.src.html -> index.html (one self-contained file).
import { readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url);
const read = f => readFileSync(new URL(f, here), 'utf8');
const engine = read('engine.cjs').replace(/^if\(typeof module.*$/m, '').trim();
const levels = JSON.parse(read('levels.json')).map(l => l.code);
if (levels.length !== 15) throw new Error('expected 15 levels, got ' + levels.length);
const html = read('game.src.html')
  .replace('/*@ENGINE@*/', () => engine)
  .replace('/*@LEVELS@*/', () => JSON.stringify(levels, null, 0).replace(/","/g, '",\n  "'));
writeFileSync(new URL('index.html', here), html);
console.log('wrote arrows/index.html', html.length, 'bytes');
