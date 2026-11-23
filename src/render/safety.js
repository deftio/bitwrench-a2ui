// URL and value policies applied before any agent-provided value reaches the DOM.
//
// Media URLs follow the basic catalog implementation guide: trim, strip control
// characters, allow http(s), data and relative URLs only, reject protocol-relative
// URLs, and render nothing on failure. openUrl is stricter: http(s) only.

// Tab, CR and LF are removed anywhere (browsers ignore them inside URLs, so attackers
// use them to hide schemes); other C0 controls and spaces are trimmed from the ends.
const STRIP = /[\t\n\r]/g;
const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

// Trim C0 controls and spaces (U+0000-U+0020) from both ends. A loop, not a regex: an
// end-anchored character-class regex backtracks quadratically on a long run of spaces.
function trimControls(s) {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) start++;
  while (end > start && s.charCodeAt(end - 1) <= 0x20) end--;
  return s.slice(start, end);
}
/**
 * Return a safe media URL or '' when it must not be rendered.
 * @param {unknown} raw
 * @param {{allowData?: boolean}} [opts]
 */
export function safeMediaUrl(raw, { allowData = true } = {}) {
  if (typeof raw !== 'string') return '';
  const url = trimControls(raw.replace(STRIP, ''));
  if (!url) return '';
  const normalized = url.replace(/\\/g, '/');
  if (normalized.startsWith('//')) return '';
  const m = SCHEME.exec(url);
  if (!m) return url;                                  // relative URL
  const scheme = m[1].toLowerCase();
  if (scheme === 'http' || scheme === 'https') {
    return /^https?:\/\/[^/]/i.test(normalized) ? url : '';
  }
  if (scheme === 'data' && allowData) return url;
  return '';
}

/** True for absolute http(s) URLs, the only targets openUrl may navigate to. */
export function isHttpUrl(raw) {
  if (typeof raw !== 'string') return false;
  return /^https?:\/\/[^/\s]/i.test(raw.replace(STRIP, '').trim());
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;

/** Accept only plain hex or rgb()/rgba() colors (host theme input; bw.css does not escape). */
export function isSafeColor(c) {
  return typeof c === 'string' && (HEX.test(c.trim()) || RGB.test(c.trim()));
}

// SVG path data: commands and numbers only.
const SVG_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]*$/;

/** Accept an svgPath string only if it is plain path data. */
export function safeSvgPath(d) {
  return typeof d === 'string' && d.length <= 20000 && SVG_PATH.test(d) ? d : '';
}
