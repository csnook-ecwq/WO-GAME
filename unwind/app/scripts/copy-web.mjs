// Copies the single-file game into the app's web folder.
import { mkdirSync, copyFileSync } from 'node:fs';
const here = new URL('..', import.meta.url);
mkdirSync(new URL('www/', here), { recursive: true });
copyFileSync(new URL('../index.html', here), new URL('www/index.html', here));
console.log('copied index.html into app/www');
