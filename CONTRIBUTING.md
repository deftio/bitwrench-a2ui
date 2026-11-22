# Contributing to bitwrench-a2ui

Thanks for your interest. This project is a small, focused renderer: an A2UI v1.0 adapter that draws Google's A2UI core with bitwrench. Contributions that keep it small, correct and well documented are very welcome.

## Ground rules

A few rules keep the project predictable:

* **bitwrench is never modified** - this repo uses the published, pinned bitwrench release and only its documented APIs. If you find a bitwrench bug, report it at https://github.com/deftio/bitwrench and work around it here.
* **web_core imports stay in one file** - `src/core/webcore.js` is the only module that imports `@a2ui/web_core`, and it uses only the public `@a2ui/web_core/v1_0` entry point. Never import `GenericBinder`, `ComponentContext` or `DataContext` in adapter code (test code may reach further, as the official Lit harness does).
* **No framework in the rendering path** - no React, Lit, JSX or virtual DOM.
* **Agent data is untrusted** - read [SECURITY.md](SECURITY.md) before touching components.
* **v1.0 only** - earlier protocol versions are out of scope.
* **100% coverage** - `npm run test:coverage` enforces 100% lines, branches, functions and statements on `src/`. If a line truly cannot be tested, use a `c8 ignore` comment that states why; reviewers will ask.

## Setup

You need Node 22 or later and npm.

```sh
git clone https://github.com/deftio/bitwrench-a2ui.git
cd bitwrench-a2ui
npm install
npm test               # unit, conformance, golden examples, dist
npm run test:coverage  # the same, with the 100% gate
npm run build          # dist/ browser builds and builds.json
npm run pages          # serve the site locally at http://localhost:8080/pages/
```

## Project layout

The code is split so each part can be read on its own:

* **`src/core/`** - the core interface and the web_core wiring (catalogs, normalizer, processor).
* **`src/render/`** - views (mount once, update in place), slots, accessibility, Markdown, URL policy.
* **`src/catalog/basic/`** - the 18 basic catalog components, icons and the generated catalog document.
* **`src/theme/`** - theme resolution and the adapter CSS.
* **`src/static/`** - HTML export.
* **`src/transport/`** - JSONL, SSE, WebSocket, A2A and AG-UI helpers.
* **`test/`** - `unit/`, `conformance/` (upstream YAML suites), `golden/` (upstream examples), `dist/`, and `upstream/` (pinned upstream material, do not edit by hand).
* **`docs/`** - Markdown documentation. **`pages/`** - the GitHub Pages site, built with bitwrench. **`examples/`** - standalone examples.

[docs/how-it-works.md](docs/how-it-works.md) explains the architecture in detail.

## Making a change

The usual flow:

1. **Open an issue first** for anything larger than a small fix, so we can agree on the approach.
2. **Branch** from `main`.
3. **Write tests with the change** - a bug fix starts with a failing test.
4. **Run `npm run test:coverage` and `npm run build`** - both must pass.
5. **Update the docs** - if behavior or API changes, update `docs/`, and the CHANGELOG under "Unreleased".
6. **Open a pull request** with a short description of what and why. Link the issue.

## Adding a component to the basic catalog

The basic catalog is fixed by the A2UI spec, so new components belong in a custom catalog (see [docs/custom-catalogs.md](docs/custom-catalogs.md)). To change how an existing basic component renders, edit `src/catalog/basic/components.js` and add tests in `test/unit/components.test.js` covering each property and the update path.

## Updating the upstream pin

The A2UI spec material in `test/upstream/` and `src/catalog/basic/catalog-json.js` is pinned to one upstream commit. To move the pin, copy the new files into `test/upstream/`, update `test/upstream/PINNED_COMMIT`, run `npm run sync:upstream`, and make sure every conformance case and golden example still passes. Record the move in the CHANGELOG.

## Style

Plain modern JavaScript (ES2020 modules), two-space indent, single quotes, semicolons. Keep functions small and comment the "why", not the "what". Documentation uses short sections, each introduced by a sentence, and bullet lists of the form "**topic** - explanation".

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to uphold it.

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0, the same license as the project.
