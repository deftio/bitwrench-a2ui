// Shared chrome for the bitwrench-a2ui site. Every page is plain HTML that loads the
// pinned bitwrench build, the bitwrench-a2ui build and this file, then builds its
// content as TACO and mounts it, the same approach bitwrench's own site uses.
/* global bw */
(function () {
  'use strict';

  const SITE = {
    name: 'bitwrench-a2ui',
    version: (window.bwA2UI && window.bwA2UI.VERSION) || '',
    repo: 'https://github.com/deftio/bitwrench-a2ui',
    a2ui: 'https://a2ui.org',
    bitwrench: 'https://github.com/deftio/bitwrench',
    nav: [
      { href: 'index.html', label: 'Home' },
      { href: 'playground.html', label: 'Playground' },
      { href: 'gallery.html', label: 'Components' },
      { href: 'examples.html', label: 'Examples' },
      { href: 'llm.html', label: 'LLM sandbox' },
      { href: 'docs.html', label: 'Docs' },
    ],
    theme: { primary: '#0f766e', secondary: '#475569', tertiary: '#7c3aed' },
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  let styles;

  function siteCss(p, alt) {
    const dark = alt ? {
      '.bw_theme_alt body, .bw_theme_alt .site-main': { background: alt.background, color: alt.light.base },
      '.bw_theme_alt .site-card, .bw_theme_alt .site-panel': { background: alt.surface, 'border-color': alt.secondary.border },
      '.bw_theme_alt .site-muted': { color: alt.textMuted },
      '.bw_theme_alt .site-hero': { background: `linear-gradient(135deg, ${alt.primary.active}, ${alt.tertiary.active})` },
    } : {};
    return bw.css({
      'html, body': { margin: '0', padding: '0' },
      body: { 'font-family': 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', background: p.background, color: p.dark.base, 'line-height': '1.55' },
      '.site-nav': { position: 'sticky', top: '0', 'z-index': '50', background: '#111827', color: '#e5e7eb' },
      // Same width and side padding as .site-main, so the menu lines up with the body.
      '.site-nav-inner': { 'max-width': '1200px', margin: '0 auto', padding: '0 16px', display: 'flex', 'align-items': 'center', gap: '4px', 'min-height': '52px', 'flex-wrap': 'wrap' },
      '.site-nav-inner.wide': { 'max-width': '1440px' },
      '.site-nav a': { color: '#d1d5db', 'text-decoration': 'none', padding: '8px 10px', 'border-radius': '6px', 'font-size': '0.95rem' },
      '.site-nav a:hover': { background: '#1f2937', color: '#fff' },
      '.site-nav a.active': { background: p.primary.base, color: p.primary.textOn },
      '.site-brand': { 'font-weight': '700', color: '#fff !important', 'margin-right': '12px', display: 'flex', 'align-items': 'center', gap: '8px', 'padding-left': '0 !important' },
      '.site-nav a.site-brand:hover': { background: 'transparent' },
      '.site-brand-mark': { display: 'inline-grid', 'place-items': 'center', width: '26px', height: '26px', 'border-radius': '6px', background: p.primary.base, color: '#fff', 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '0.8rem' },
      '.site-spacer': { flex: '1' },
      '.site-nav button': { background: 'transparent', color: '#d1d5db', border: '1px solid #374151', 'border-radius': '6px', padding: '6px 10px', cursor: 'pointer' },
      '.site-main': { 'max-width': '1200px', margin: '0 auto', padding: '24px 16px 48px' },
      '.site-main.wide': { 'max-width': '1440px' },
      '.site-hero': { background: `linear-gradient(135deg, ${p.primary.base}, ${p.tertiary.base})`, color: '#fff', padding: '56px 16px 64px' },
      '.site-hero-inner': { 'max-width': '1200px', margin: '0 auto' },
      '.site-hero h1': { 'font-size': 'clamp(2rem, 4.5vw, 3.2rem)', margin: '0 0 12px', 'line-height': '1.1' },
      '.site-hero p': { 'font-size': '1.15rem', 'max-width': '720px', opacity: '0.95', margin: '0 0 20px' },
      '.site-pill': { display: 'inline-block', padding: '3px 10px', 'border-radius': '999px', background: 'rgba(255,255,255,0.18)', 'font-size': '0.85rem', 'margin-right': '6px', 'margin-bottom': '6px' },
      '.site-cta': { display: 'inline-block', padding: '10px 18px', 'border-radius': '8px', 'font-weight': '600', 'text-decoration': 'none', 'margin-right': '10px', 'margin-top': '8px' },
      '.site-cta.primary': { background: '#fff', color: p.primary.active },
      '.site-cta.ghost': { border: '1px solid rgba(255,255,255,0.7)', color: '#fff' },
      '.site-header h1': { margin: '0 0 6px', 'font-size': '2rem' },
      '.site-header p': { margin: '0 0 20px', 'max-width': '820px' },
      '.site-muted': { color: p.textMuted },
      '.site-grid': { display: 'grid', gap: '16px', 'grid-template-columns': 'repeat(auto-fill, minmax(260px, 1fr))' },
      '.site-card': { background: p.surface, border: `1px solid ${p.secondary.border}`, 'border-radius': '10px', padding: '16px' },
      '.site-card h3': { margin: '0 0 6px', 'font-size': '1.05rem' },
      '.site-card a': { color: p.primary.text },
      '.site-panel': { background: p.surface, border: `1px solid ${p.secondary.border}`, 'border-radius': '10px', padding: '12px', 'min-width': '0' },
      '.site-panel-title': { 'font-size': '0.75rem', 'text-transform': 'uppercase', 'letter-spacing': '0.06em', color: p.textMuted, margin: '0 0 8px', 'font-weight': '600' },
      '.site-code': { background: '#0f172a', color: '#e2e8f0', 'border-radius': '8px', padding: '12px 14px', overflow: 'auto', 'font-family': '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace', 'font-size': '0.84rem', margin: '0', 'white-space': 'pre', 'max-height': '420px' },
      '.site-section': { margin: '40px 0' },
      '.site-section > h2': { 'font-size': '1.5rem', margin: '0 0 8px' },
      '.site-section > p': { margin: '0 0 16px', 'max-width': '820px' },
      '.site-footer': { 'border-top': `1px solid ${p.secondary.border}`, padding: '20px 16px', 'font-size': '0.9rem' },
      '.site-footer-inner': { 'max-width': '1200px', margin: '0 auto', display: 'flex', gap: '16px', 'flex-wrap': 'wrap', 'justify-content': 'space-between' },
      '.site-footer a': { color: p.primary.text },
      '.site-toolbar': { display: 'flex', gap: '8px', 'flex-wrap': 'wrap', 'align-items': 'center', margin: '0 0 12px' },
      '.site-toolbar select, .site-toolbar input, .site-toolbar button': { 'font-size': '0.9rem' },
      '.site-btn': { padding: '6px 12px', 'border-radius': '6px', border: `1px solid ${p.secondary.border}`, background: p.surface, color: 'inherit', cursor: 'pointer' },
      '.site-btn.primary': { background: p.primary.base, color: p.primary.textOn, 'border-color': p.primary.base },
      '.site-btn:disabled': { opacity: '0.5', cursor: 'default' },
      '.site-tabs': { display: 'flex', gap: '4px', 'border-bottom': `1px solid ${p.secondary.border}`, margin: '0 0 8px', 'flex-wrap': 'wrap' },
      '.site-tabs button': { background: 'transparent', border: '0', padding: '6px 10px', cursor: 'pointer', color: 'inherit', 'border-bottom': '2px solid transparent' },
      '.site-tabs button.active': { 'border-bottom-color': p.primary.base, 'font-weight': '600' },
      '.site-log': { 'font-family': 'ui-monospace, Menlo, monospace', 'font-size': '0.8rem', 'max-height': '320px', overflow: 'auto', margin: '0', padding: '0', 'list-style': 'none' },
      '.site-log li': { padding: '4px 0', 'border-bottom': `1px dashed ${p.secondary.border}`, 'white-space': 'pre-wrap', 'word-break': 'break-word' },
      '.site-badge': { display: 'inline-block', padding: '1px 8px', 'border-radius': '999px', 'font-size': '0.75rem', background: p.primary.light, color: p.primary.text, 'margin-right': '4px' },
      '.site-badge.warn': { background: p.warning.light, color: p.warning.text },
      '.site-badge.err': { background: p.danger.light, color: p.danger.text },
      'a.site-link': { color: p.primary.text },
      '@media (max-width: 720px)': { '.site-nav-inner': { padding: '6px 16px' }, '.site-hero': { padding: '36px 16px 40px' } },
      ...dark,
    });
  }

  /** Load the site theme and chrome CSS; returns bitwrench styles (with palette). */
  function initPage(active, { wide = false } = {}) {
    styles = bw.makeStyles(SITE.theme);
    bw.loadStructural && bw.loadStructural();
    bw.applyStyles(styles);
    bw.injectCSS(siteCss(styles.palette, styles.alternatePalette), { id: 'site-css', append: false });
    const mode = store.get('a2ui-site-mode') || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setMode(mode);
    bw.mount('#site-nav', nav(active, wide));
    const main = document.getElementById('app');
    if (main && wide) main.classList.add('wide');
    bw.mount('#site-footer', footer());
    return styles;
  }

  function setMode(mode) {
    bw.setThemeMode(mode === 'dark' ? 'alternate' : 'primary');
    document.documentElement.classList.toggle('bw_theme_alt', mode === 'dark');
    store.set('a2ui-site-mode', mode);
    SITE.mode = mode;
    for (const fn of modeListeners) fn(mode);
  }
  const modeListeners = [];

  function nav(active, wide = false) {
    return {
      t: 'nav', a: { class: 'site-nav', 'aria-label': 'Site' },
      c: { t: 'div', a: { class: `site-nav-inner${wide ? ' wide' : ''}` }, c: [
        { t: 'a', a: { href: 'index.html', class: 'site-brand' }, c: [{ t: 'span', a: { class: 'site-brand-mark', 'aria-hidden': 'true' }, c: '{}' }, 'bitwrench-a2ui'] },
        ...SITE.nav.map(n => ({ t: 'a', a: { href: n.href, class: n.href === active ? 'active' : '', 'aria-current': n.href === active ? 'page' : null }, c: n.label })),
        { t: 'span', a: { class: 'site-spacer' } },
        { t: 'a', a: { href: SITE.repo }, c: 'GitHub' },
        { t: 'button', a: { type: 'button', 'aria-label': 'Toggle dark mode', onclick: () => setMode(SITE.mode === 'dark' ? 'light' : 'dark') }, c: '◐' },
      ] },
    };
  }

  function footer() {
    return {
      t: 'div', a: { class: 'site-footer-inner' },
      c: [
        { t: 'div', c: [`bitwrench-a2ui ${SITE.version} · Apache-2.0 · `, { t: 'a', a: { href: SITE.repo }, c: 'source' }] },
        { t: 'div', a: { class: 'site-muted' }, c: [
          'Built with ', { t: 'a', a: { href: SITE.bitwrench }, c: 'bitwrench' }, ', ',
          { t: 'a', a: { href: 'https://github.com/a2ui-project/a2ui/tree/main/typescript/core/web_core' }, c: '@a2ui/web_core' }, ' and ',
          { t: 'a', a: { href: 'https://github.com/deftio/quikdown' }, c: 'quikdown' }, '. Renders the ',
          { t: 'a', a: { href: SITE.a2ui }, c: 'A2UI' }, ' v1.0 protocol. Not affiliated with Google.',
        ] },
      ],
    };
  }

  function header(title, lead) {
    return { t: 'header', a: { class: 'site-header' }, c: [{ t: 'h1', c: title }, lead ? { t: 'p', a: { class: 'site-muted' }, c: lead } : null] };
  }

  function section(title, lead, content) {
    return { t: 'section', a: { class: 'site-section' }, c: [{ t: 'h2', c: title }, lead ? { t: 'p', c: lead } : null, content] };
  }

  function code(text) {
    return { t: 'pre', a: { class: 'site-code' }, c: { t: 'code', c: text } };
  }

  function panel(title, content, attrs = {}) {
    return { t: 'div', a: { class: 'site-panel', ...attrs }, c: [{ t: 'div', a: { class: 'site-panel-title' }, c: title }, content] };
  }

  let tabSeq = 0;

  /** Simple tab strip: tabs = [{label, render(): TACO}] mounted into a container element. */
  function tabs(items, onSelect) {
    let active = 0;
    const id = `site-tabs-${++tabSeq}`;
    const draw = () => {
      const host = document.getElementById(id);
      if (!host) return;
      bw.mount(host, [
        { t: 'div', a: { class: 'site-tabs', role: 'tablist' }, c: items.map((t, i) => ({
          t: 'button', a: { type: 'button', role: 'tab', 'aria-selected': String(i === active), class: i === active ? 'active' : '',
            onclick: () => { active = i; draw(); onSelect && onSelect(i); } }, c: t.label })) },
        { t: 'div', a: { role: 'tabpanel' }, c: items[active].render() },
      ]);
    };
    return { taco: { t: 'div', a: { id } }, draw, get active() { return active; }, set(i) { active = i; draw(); } };
  }

  function pretty(x) {
    return JSON.stringify(x, null, 2);
  }

  /** Base64url-encode a string (for shareable playground links). */
  function encodeShare(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeShare(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }

  function download(name, text, type = 'text/plain') {
    const a = bw.create({ t: 'a', a: { href: URL.createObjectURL(new Blob([text], { type })), download: name, style: 'display:none' } });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  window.site = { SITE, initPage, setMode, onMode: fn => modeListeners.push(fn), header, section, code, panel, tabs, pretty, encodeShare, decodeShare, download, store };
})();
