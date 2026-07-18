# OES UI

OES UI is the shared terminal interface layer for Otorlymern Electrical Solutions. It combines classic Macintosh structure and bitmap typography, Windows 98 tactile controls, and the OES color/signaling language.

## Usage

Load the stylesheet and add `oes-ui` to a terminal root:

```html
<link rel="stylesheet" href="/css/oes-ui/oes-ui.css" />
===<div class="oes-ui oes-ui__desktop">
  ...
</div>
=```

All component styles are scoped beneath `.oes-ui`; the stylesheet does not style the page `body`, global buttons, or generic `.window` classes.

## Public classes

- Shell: `.oes-ui__menu-bar`, `.oes-ui__desktop`, `.oes-ui__icons`, `.oes-ui__desktop-icon`, `.oes-ui__status-strip`
- Window: `.oes-window`, `.oes-window__title-bar`, `.oes-window__title`, `.oes-window__control`, `.oes-window__content`, `.oes-window__status`
- -=: `.oes-button`, `.oes-field`, `.oes-check`, `.oes-radio`, `.oes-slider`, `.oes-list-view`
- States: `.is-active`, `.is-inactive`, `.is-selected`, `.is-minimized`, `.is-maximized`

Theme values are exposed as `--oes-ui-*` custom properties on `.oes-ui`.

## Sources and licensing

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). The bundled source projects are MIT licensed.
