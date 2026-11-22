# Components

The A2UI v1.0 basic catalog has 18 components. This page lists each one, the properties the spec defines, and how bitwrench-a2ui renders it. The [component gallery](https://deftio.github.io/bitwrench-a2ui/pages/gallery.html) shows them all live, in light and dark.

Every component also accepts `weight` (flex grow inside a Row or Column) and `@accessibility` (`label`, `description`, `live`, `hidden`), which the renderer maps to `aria-label`, `aria-description`, `aria-live` and `aria-hidden`. Labels are inferred from visible text when not given.

## Display

Components that show content:

* **Text** - `text` (string, Markdown), `variant` `body` or `caption`. Rendered as a `<span>` for a single paragraph (so it works inside buttons) or a `<div>` for block Markdown. Markdown supports headings, emphasis, strong, lists, inline code and code blocks. Raw HTML shows as text; links and images render as their text. Captions are smaller and muted.
* **Image** - `url`, `description` (alt text), `fit` (`contain`, `cover`, `fill`, `none`, `scaleDown`), `variant` (`icon`, `avatar`, `smallFeature`, `mediumFeature`, `largeFeature`, `header`). An `<img>` with `object-fit` and a size class per variant. URLs outside the media policy render nothing.
* **Icon** - `name` (one of 59 names such as `home`, `search`, `check`, or `{svgPath}`, or a binding). Inline SVG from Material Symbols. Decorative (`aria-hidden`) unless it has an accessibility label.
* **Video** - `url`, `posterUrl`. A `<video controls>`; no autoplay.
* **AudioPlayer** - `url`, `description`. An `<audio controls>` with an optional caption.
* **Divider** - `axis` `horizontal` or `vertical`. An `<hr>` or a vertical rule with `role="separator"`.

## Layout

Containers. Following the basic catalog guide, containers add no padding; leaves carry the spacing.

* **Row** - `children`, `justify` (`start`, `center`, `end`, `spaceBetween`, `spaceAround`, `spaceEvenly`, `stretch`), `align` (`start`, `center`, `end`, `stretch`). A wrapping flex row.
* **Column** - same properties, vertical.
* **List** - `children` (often a template over a data array), `direction` `vertical` or `horizontal`, `align`. A flex container with `role="list"`; each item has `role="listitem"`.
* **Card** - `child`. bitwrench's `makeCard`.

## Navigation and overlays

Components with local state:

* **Tabs** - `tabs: [{title, child}]`. A tablist with arrow, Home and End key support. Only the selected tab's child is mounted. The selected tab is local UI state, not part of the data model.
* **Modal** - `trigger`, `content`. The trigger renders inline; activating it opens an overlay dialog with the content. Focus moves into the dialog and is trapped there; Escape, the close button or a backdrop click closes it and focus returns to the trigger. The content is mounted only while open.

## Inputs

Inputs bind their `value` two ways: user edits write to the data model immediately; agent updates to the same path update the control without disturbing focus or caret. Each accepts `@checks`; failing checks show their messages under the control (`role="alert"`), mark it `aria-invalid`, and warnings or info show as hints.

* **Button** - `child` (usually a Text or Icon), `action`, `variant` `default`, `primary` or `borderless`. bitwrench's `makeButton`. Disabled while any of its checks fail. The action runs inside the native click handler so user-activation rules hold.
* **TextField** - `label`, `value`, `placeholder`, `variant` `shortText`, `longText` (textarea), `number`, `obscured` (password).
* **CheckBox** - `label`, `value` (boolean). bitwrench's `makeCheckbox`.
* **ChoicePicker** - `options: [{label, value}]`, `value` (array of strings), `label`, `variant` `mutuallyExclusive` (radios) or `multipleSelection` (checkboxes), `displayStyle` `checkbox` or `chips`, `filterable`. A labelled group (`radiogroup` or `group`); chips are styled toggles; `filterable` adds a case-insensitive filter box.
* **Slider** - `value`, `min` (default 0), `max`, `steps` (snap to this many steps), `label`. bitwrench's `makeRange` with the value shown.
* **DateTimeInput** - `value` (ISO 8601), `enableDate`, `enableTime`, `min`, `max`, `label`. A native `date`, `time` or `datetime-local` input; values are converted to and from ISO strings, keeping seconds when the original value had them.

## Not a component: the surface

Each surface renders inside `<div class="a2ui-surface">`, which carries the theme scope and CSS variables. The spec's implicit `Surface` container has no element of its own.
