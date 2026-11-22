// Theming. A2UI v1.0 leaves styling to the host, so themes never come from the wire.
//
// The host passes a bitwrench StyleConfig (or a preset name). We generate the BCCL
// palette with bw.makeStyles, apply it per surface scope, and add the adapter's own
// layout rules, written as bw.css rule objects. The adapter rules read --a2ui-*
// custom properties (the same names the official web renderers use), which are
// computed from the palette, so a host can override any single value with plain CSS.
import { isSafeColor } from '../render/safety.js';

const COLOR_KEYS = ['primary', 'secondary', 'tertiary', 'success', 'danger', 'warning', 'info', 'light', 'dark', 'background', 'surface', 'surfaceAlt'];

/**
 * Normalize a host theme option into a bitwrench StyleConfig.
 * @param {object} bw
 * @param {string|object|undefined} theme  preset name, or {preset, ...StyleConfig}
 */
export function resolveThemeConfig(bw, theme) {
  const opt = typeof theme === 'string' ? { preset: theme } : { ...(theme ?? {}) };
  const preset = opt.preset && bw.THEME_PRESETS ? bw.THEME_PRESETS[opt.preset] : undefined;
  delete opt.preset;
  // Drop unsafe host colors before merging, so a bad value falls back to the preset.
  for (const k of COLOR_KEYS) {
    if (k in opt && !isSafeColor(opt[k])) delete opt[k];
  }
  return { ...(preset ?? {}), ...opt };
}

function varsFor(pal) {
  return {
    '--a2ui-color-primary': pal.primary.base,
    '--a2ui-color-primary-hover': pal.primary.hover,
    '--a2ui-color-primary-light': pal.primary.light,
    '--a2ui-color-on-primary': pal.primary.textOn,
    '--a2ui-color-secondary': pal.secondary.base,
    '--a2ui-color-surface': pal.surface,
    '--a2ui-color-surface-alt': pal.surfaceAlt,
    '--a2ui-color-background': pal.background,
    '--a2ui-color-border': pal.secondary.border,
    '--a2ui-color-text': pal.dark.base,
    '--a2ui-color-text-muted': pal.textMuted,
    '--a2ui-color-danger': pal.danger.base,
    '--a2ui-color-warning': pal.warning.text,
    '--a2ui-color-info': pal.info.text,
    '--a2ui-color-focus': pal.primary.focus,
  };
}

/** Theme variables for one scope selector, light and alternate (dark). */
export function themeVarsCss(bw, styles, scope) {
  const alt = styles.alternatePalette;
  const rules = { [scope]: varsFor(styles.palette) };
  if (alt) {
    rules[`.bw_theme_alt ${scope}, ${scope}.bw_theme_alt`] = { ...varsFor(alt), '--a2ui-color-text': alt.light.base };
  }
  return bw.css(rules);
}

/** The adapter's own component CSS. Scoped to .a2ui-surface; reads --a2ui-* variables. */
export function adapterCss(bw) {
  const S = '.a2ui-surface';
  const gap = 'var(--a2ui-spacing-m, 8px)';
  return bw.css({
    [S]: { display: 'block', color: 'var(--a2ui-color-text)', 'font-family': 'var(--a2ui-font-family, inherit)', 'line-height': '1.45' },
    [`${S} *, ${S} *::before, ${S} *::after`]: { 'box-sizing': 'border-box' },
    // layout: containers carry no spacing of their own (leaf-margin rule)
    [`${S} .a2ui-row, ${S} .a2ui-column, ${S} .a2ui-list`]: { display: 'flex', gap, 'min-width': '0' },
    [`${S} .a2ui-row`]: { 'flex-direction': 'row', 'flex-wrap': 'wrap' },
    [`${S} .a2ui-column, ${S} .a2ui-list--vertical`]: { 'flex-direction': 'column' },
    [`${S} .a2ui-list--horizontal`]: { 'flex-direction': 'row', 'overflow-x': 'auto' },
    [`${S} .a2ui-item`]: { 'min-width': '0' },
    [`${S} .a2ui-justify-start`]: { 'justify-content': 'flex-start' },
    [`${S} .a2ui-justify-center`]: { 'justify-content': 'center' },
    [`${S} .a2ui-justify-end`]: { 'justify-content': 'flex-end' },
    [`${S} .a2ui-justify-spaceBetween`]: { 'justify-content': 'space-between' },
    [`${S} .a2ui-justify-spaceAround`]: { 'justify-content': 'space-around' },
    [`${S} .a2ui-justify-spaceEvenly`]: { 'justify-content': 'space-evenly' },
    [`${S} .a2ui-justify-stretch > .a2ui-item`]: { flex: '1 1 0%' },
    [`${S} .a2ui-align-start`]: { 'align-items': 'flex-start' },
    [`${S} .a2ui-align-center`]: { 'align-items': 'center' },
    [`${S} .a2ui-align-end`]: { 'align-items': 'flex-end' },
    [`${S} .a2ui-align-stretch`]: { 'align-items': 'stretch' },
    // text
    [`${S} .a2ui-text--caption`]: { 'font-size': '0.85em', color: 'var(--a2ui-color-text-muted)' },
    [`${S} .a2ui-text--block > :first-child`]: { 'margin-top': '0' },
    [`${S} .a2ui-text--block > :last-child`]: { 'margin-bottom': '0' },
    [`${S} .a2ui-md-p`]: { margin: '0 0 0.5em' },
    [`${S} .a2ui-md-h`]: { margin: '0.2em 0 0.4em', 'line-height': '1.2' },
    [`${S} .a2ui-md-code`]: { 'font-family': 'var(--a2ui-font-family-monospace, ui-monospace, SFMono-Regular, Menlo, monospace)', 'font-size': '0.9em', padding: '0.1em 0.3em', 'border-radius': '4px', background: 'var(--a2ui-color-surface-alt)' },
    [`${S} .a2ui-md-pre`]: { padding: '0.75em', 'border-radius': '6px', background: 'var(--a2ui-color-surface-alt)', overflow: 'auto' },
    [`${S} .a2ui-md-list`]: { margin: '0 0 0.5em', 'padding-left': '1.4em' },
    // media
    [`${S} .a2ui-image`]: { display: 'block', 'max-width': '100%' },
    [`${S} .a2ui-image--icon`]: { width: '24px', height: '24px' },
    [`${S} .a2ui-image--avatar`]: { width: '48px', height: '48px', 'border-radius': '50%' },
    [`${S} .a2ui-image--smallFeature`]: { width: '96px', 'max-height': '96px' },
    [`${S} .a2ui-image--mediumFeature`]: { width: '100%', 'max-height': '240px' },
    [`${S} .a2ui-image--largeFeature`]: { width: '100%', 'max-height': '400px' },
    [`${S} .a2ui-image--header`]: { width: '100%', 'max-height': '200px' },
    [`${S} .a2ui-image--blocked`]: { display: 'none' },
    [`${S} .a2ui-icon`]: { width: '1.5em', height: '1.5em', 'vertical-align': 'middle', 'flex-shrink': '0' },
    [`${S} .a2ui-video`]: { display: 'block', width: '100%', 'max-height': '360px', 'border-radius': '6px', background: '#000' },
    [`${S} .a2ui-audio`]: { margin: '0' },
    [`${S} .a2ui-audio-el`]: { width: '100%' },
    [`${S} .a2ui-audio-caption`]: { 'font-size': '0.85em', color: 'var(--a2ui-color-text-muted)', 'margin-top': '4px' },
    // divider
    [`${S} .a2ui-divider--horizontal`]: { border: '0', 'border-top': '1px solid var(--a2ui-color-border)', margin: '4px 0', width: '100%' },
    [`${S} .a2ui-divider--vertical`]: { 'border-left': '1px solid var(--a2ui-color-border)', 'align-self': 'stretch', 'min-height': '1.5em', width: '0' },
    // card
    [`${S} .a2ui-card`]: { 'margin-bottom': '0' },
    // buttons
    [`${S} .a2ui-button-label`]: { display: 'inline-flex', 'align-items': 'center', gap: '6px' },
    [`${S} .a2ui-button[disabled]`]: { opacity: '0.55', cursor: 'not-allowed' },
    [`${S} .a2ui-button--borderless`]: { background: 'transparent', border: '0', color: 'var(--a2ui-color-primary)', 'box-shadow': 'none' },
    // form controls
    [`${S} .a2ui-textfield, ${S} .a2ui-datetime`]: { 'margin-bottom': '0' },
    [`${S} .a2ui-hints`]: { 'font-size': '0.85em', 'margin-top': '4px' },
    [`${S} .a2ui-hint--warning`]: { color: 'var(--a2ui-color-warning)' },
    [`${S} .a2ui-hint--info`]: { color: 'var(--a2ui-color-info)' },
    [`${S} .a2ui-errors`]: { 'font-size': '0.85em' },
    [`${S} .a2ui-options`]: { display: 'flex', 'flex-direction': 'column', gap: '4px' },
    [`${S} .a2ui-choicepicker--chips .a2ui-options`]: { 'flex-direction': 'row', 'flex-wrap': 'wrap', gap: '6px' },
    [`${S} .a2ui-chip`]: { position: 'relative', padding: '0', margin: '0' },
    [`${S} .a2ui-chip .a2ui-option-input`]: { position: 'absolute', opacity: '0', 'pointer-events': 'none' },
    [`${S} .a2ui-chip label`]: { display: 'inline-block', padding: '4px 12px', 'border-radius': '999px', border: '1px solid var(--a2ui-color-border)', cursor: 'pointer', 'user-select': 'none' },
    [`${S} .a2ui-chip .a2ui-option-input:checked + label`]: { background: 'var(--a2ui-color-primary)', color: 'var(--a2ui-color-on-primary)', 'border-color': 'var(--a2ui-color-primary)' },
    [`${S} .a2ui-chip .a2ui-option-input:focus-visible + label`]: { outline: '2px solid var(--a2ui-color-focus)', 'outline-offset': '2px' },
    [`${S} .a2ui-choice-filter`]: { 'margin-bottom': '6px' },
    // tabs
    [`${S} .a2ui-tabpanel`]: { 'padding-top': gap },
    // modal
    [`${S} .a2ui-modal-trigger`]: { display: 'contents' },
    [`${S} .a2ui-modal-overlay`]: { position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.45)', display: 'flex', 'align-items': 'center', 'justify-content': 'center', padding: '16px', 'z-index': '1000' },
    [`${S} .a2ui-modal-dialog`]: { position: 'relative', background: 'var(--a2ui-color-surface)', color: 'var(--a2ui-color-text)', 'border-radius': '10px', padding: '20px', 'max-width': 'min(640px, 100%)', 'max-height': '90vh', overflow: 'auto', 'box-shadow': '0 12px 40px rgba(0,0,0,0.3)' },
    [`${S} .a2ui-modal-close`]: { position: 'absolute', top: '6px', right: '10px' },
    // placeholder shown in strict development mode for unknown components
    [`${S} .a2ui-unsupported`]: { border: '1px dashed var(--a2ui-color-danger)', color: 'var(--a2ui-color-danger)', padding: '4px 8px', 'font-size': '0.85em', 'border-radius': '4px' },
  });
}

/**
 * Generate all CSS for a theme, for static export (unscoped bitwrench rules plus the
 * adapter rules and variables on .a2ui-surface).
 */
export function themeCss(bw, theme) {
  const cfg = resolveThemeConfig(bw, theme);
  const styles = bw.makeStyles(cfg);
  return {
    styles,
    css: [styles.css, styles.alternateCss ? `.bw_theme_alt{}\n${styles.alternateCss}` : '', themeVarsCss(bw, styles, '.a2ui-surface'), adapterCss(bw)].filter(Boolean).join('\n'),
  };
}

let adapterCssInjected = false;

/**
 * Apply a theme to a surface host element in the live DOM.
 * @param {object} bw
 * @param {HTMLElement} host  must have an id
 * @param {string|object} theme
 */
export function applyTheme(bw, host, theme) {
  const cfg = resolveThemeConfig(bw, theme);
  const styles = bw.makeStyles(cfg);
  const scope = `#${host.id}`;
  bw.loadStructural?.();
  bw.applyStyles(styles, scope);
  bw.injectCSS(themeVarsCss(bw, styles, scope), { id: `a2ui-vars-${host.id}`, append: false });
  if (!adapterCssInjected || !host.ownerDocument.getElementById('a2ui-adapter-css')) {
    bw.injectCSS(adapterCss(bw), { id: 'a2ui-adapter-css', append: false });
    adapterCssInjected = true;
  }
  return styles;
}

/** Remove the per-surface theme styles injected by applyTheme. */
export function removeTheme(bw, host) {
  const doc = host.ownerDocument;
  doc.getElementById(`a2ui-vars-${host.id}`)?.remove();
  bw.clearStyles?.(`#${host.id}`);
}
