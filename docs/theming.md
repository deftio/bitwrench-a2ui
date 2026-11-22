# Theming

A2UI v1.0 deliberately leaves styling to the app: messages carry no colors or fonts, and a `theme` sent by an agent is ignored. You choose the look on the renderer, and every surface follows it. This page shows the options, from a preset name to composing your own CSS as data.

## Presets and seed colors

The simplest theme is a bitwrench preset name:

```js
createRenderer({ mount: '#app', theme: 'ocean' });
```

Presets: `teal`, `ocean`, `sunset`, `forest`, `slate`, `rose`, `indigo`, `amber`, `emerald`, `nord`, `coral`, `midnight`.

Or give seed colors and layout choices, optionally on top of a preset:

```js
createRenderer({
  mount: '#app',
  theme: { preset: 'slate', primary: '#0b6e4f', radius: 'lg', spacing: 'compact' },
});
```

bitwrench derives a full palette from the seeds: hover, active, light and border shades, readable text-on-color, focus rings, and a matching dark palette. Colors must be plain hex or `rgb()` values; anything else is ignored, so an unsafe value cannot reach the CSS generator.

## Light and dark

Both palettes are generated up front. Switch with:

```js
renderer.setThemeMode('dark');   // or 'light', or 'auto' to follow the OS setting
```

## CSS variables

Each surface also exposes CSS custom properties with the same names the official A2UI web renderers use, computed from the palette:

* **Colors** - `--a2ui-color-primary`, `--a2ui-color-primary-hover`, `--a2ui-color-primary-light`, `--a2ui-color-on-primary`, `--a2ui-color-secondary`, `--a2ui-color-surface`, `--a2ui-color-surface-alt`, `--a2ui-color-background`, `--a2ui-color-border`, `--a2ui-color-text`, `--a2ui-color-text-muted`, `--a2ui-color-danger`, `--a2ui-color-warning`, `--a2ui-color-info`, `--a2ui-color-focus`.
* **Optional hooks** - `--a2ui-spacing-m`, `--a2ui-font-family`, `--a2ui-font-family-monospace` (unset by default; set them to override).

Override any one of them with ordinary CSS:

```css
.a2ui-surface { --a2ui-color-primary: #c2410c; --a2ui-font-family: "Inter", sans-serif; }
```

## Composing styles as data

The renderer's own CSS is written as bitwrench rule objects, and you can add yours the same way. Rules are plain objects you can build from the palette, merge and scope:

```js
const styles = bw.makeStyles({ primary: '#0b6e4f' });
const p = styles.palette;

bw.injectCSS(bw.css({
  '.a2ui-surface .a2ui-card': { 'border-left': `4px solid ${p.primary.base}` },
  '.a2ui-surface .a2ui-text--caption': { 'letter-spacing': '0.02em' },
  '@media (max-width: 600px)': { '.a2ui-surface .a2ui-row': { 'flex-direction': 'column' } },
}), { id: 'my-a2ui-overrides' });
```

Because rules are data, you can generate them per brand, per surface or per user at runtime, without a stylesheet build.

## Class names you can target

Every component's root carries `data-a2ui-type` and `data-a2ui-id`, plus classes:

* **Layout** - `a2ui-row`, `a2ui-column`, `a2ui-list`, `a2ui-item`, `a2ui-justify-*`, `a2ui-align-*`.
* **Content** - `a2ui-text`, `a2ui-text--caption`, `a2ui-image--<variant>`, `a2ui-icon`, `a2ui-video`, `a2ui-audio`, `a2ui-divider--horizontal|vertical`, `a2ui-card`.
* **Inputs** - `a2ui-button--default|primary|borderless`, `a2ui-textfield`, `a2ui-checkbox`, `a2ui-choicepicker`, `a2ui-chip`, `a2ui-slider`, `a2ui-datetime`, `a2ui-invalid`, `a2ui-errors`, `a2ui-hints`, `a2ui-hint--warning|info`.
* **Overlays** - `a2ui-tabs`, `a2ui-tab-button`, `a2ui-tabpanel`, `a2ui-modal`, `a2ui-modal-overlay`, `a2ui-modal-dialog`.

Underneath, BCCL classes (`bw_bccl_card`, `bw_bccl_btn`, `bw_bccl_form_control`, ...) carry bitwrench's base styling.

## Styling inside MCP hosts

When a surface runs inside an MCP App, the host may provide its own CSS variables (ChatGPT, for example, passes them in its host context). Map them onto the `--a2ui-*` variables in your app's CSS so surfaces match the host. See [MCP Apps](mcp-apps.md).
