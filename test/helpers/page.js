// Split an HTML page into its markup and its scripts with a real HTML parser (no regexes
// over markup), so tests can run the scripts themselves in a controlled order.
import { JSDOM } from 'jsdom';

/** @returns {{ html: string, scripts: Array<{src: string|null, integrity: string|null, crossorigin: string|null, code: string}> }} */
export function splitScripts(source) {
  const dom = new JSDOM(source);                      // scripts are not run by default
  const scripts = [...dom.window.document.querySelectorAll('script')].map(s => ({
    src: s.getAttribute('src'),
    integrity: s.getAttribute('integrity'),
    crossorigin: s.getAttribute('crossorigin'),
    code: s.textContent,
  }));
  for (const s of dom.window.document.querySelectorAll('script')) s.remove();
  const html = dom.serialize();
  dom.window.close();
  return { html, scripts };
}
