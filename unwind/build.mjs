// Combines src/engine.cjs, src/app.js and src/index.src.html into one self-contained index.html.
import { readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url);
const read = f => readFileSync(new URL(f, here), 'utf8');
const html = read('src/index.src.html')
  .replace('/*@ENGINE@*/', () => read('src/engine.cjs'))
  .replace('/*@APP@*/', () => read('src/app.js'));
writeFileSync(new URL('index.html', here), html);
console.log('wrote unwind/index.html', (html.length / 1024).toFixed(0) + ' KB');
