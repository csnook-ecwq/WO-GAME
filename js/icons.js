/**
 * icons.js — line icons, drawn as SVG paths.
 *
 * Deliberately not an icon font and not emoji: emoji render differently on
 * every device and at the wrong weight next to light typography, and a font is
 * a download. These are a handful of strokes that inherit the text colour.
 */

const PATHS = {
  journal:
    'M5 4.5A1.5 1.5 0 0 1 6.5 3H16l3 3v13.5A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5Z' +
    'M15.5 3.2V6.5h3.3M8.5 11h7M8.5 15h4.5',
  progress:
    'M4 19h16M7 19v-6M12 19V7M17 19v-9',
  buddy:
    'M12 4.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8Z' +
    'M8.4 13.2a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4Z' +
    'M16.6 14.4a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4Z',
  settings:
    'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z' +
    'M19.4 12a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7.4 7.4 0 0 0-2-1.2L14.6 3H9.4l-.4 2.6' +
    'a7.4 7.4 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7.4 7.4 0 0 0 4.6 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4' +
    '2.3-.9c.6.5 1.3.9 2 1.2l.4 2.6h5.2l.4-2.6c.7-.3 1.4-.7 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z',
  help:
    'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Z' +
    'M9.7 9.4a2.4 2.4 0 0 1 4.6.8c0 1.6-2.3 2-2.3 3.5M12 17.1h.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
  chevron: 'M9 5l7 7-7 7',
};

/**
 * @param {keyof PATHS} name
 * @param {number} [size]
 * @returns {SVGSVGElement}
 */
export function icon(name, size = 22) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', PATHS[name] || PATHS.help);
  svg.appendChild(path);
  return svg;
}
