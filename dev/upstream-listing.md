# Upstream listing: draft

Draft for adding bitwrench-a2ui to the A2UI community projects page. This file is for us; nothing here has been submitted.

* **Target file** - `docs/site/src/content/docs/ecosystem/renderers.mdx` in `a2ui-project/a2ui`, table "Community renderers".
* **Process** (from that page) - fork, sign the Google CLA, add the row, open a PR with verification details or demo links, then optionally post in GitHub Discussions.

## Before opening the PR

Do these first, in order:

1. **Publish the npm package** - published as 0.9.0 (a preview); cut releases with `npm run release`. The CDN links in the docs only resolve after this.
2. **Make the repository public and enable Pages** - set the Pages source to GitHub Actions, and confirm the site, playground, gallery and LLM sandbox load at https://deftio.github.io/bitwrench-a2ui/.
3. **Check that CI is green on `main`**, so the badges are real.
4. **Sign the Google CLA** - under the `deftio` identity, the same account that opens the PR.
5. **Re-run the conformance report** against the latest upstream commit (`npm run sync:upstream`, then `npm run conformance:report`), so the PR cites current results.

## Listing criteria check

How the repository meets each criterion on the renderers page:

| Criterion | Where it is met |
|---|---|
| Open-source repository, Apache 2.0 or MIT | `LICENSE` (Apache-2.0), `NOTICE` |
| Docs explicitly state supported protocol versions | README "Supported versions" table (v1.0 only); `docs/compatibility.md`; `capabilities()` reports `["1.0"]` |
| Core layout, text, input and action components | All 18 basic catalog components; `docs/components.md`; gallery page |
| Installation instructions and a minimal runnable example | README quick start; `docs/quick-start.md`; `examples/hello.html` |
| Active maintenance | CI on every push; CHANGELOG; pinned upstream fixtures with a sync script |

Reviewers will probably also look for:

* **The pinned upstream renderer suites** - all 36 applicable cases of the adapter, accessibility and Markdown suites pass with no skips (these are renderer suites, not the whole A2UI core conformance), and the manifest uses the upstream format (`docs/conformance-report.md`).
* **Use of `@a2ui/web_core`** - the core (0.16.1, the latest release) is used as intended rather than reimplemented. The one gap we still work around is documented in `docs/compatibility.md`, and should be filed upstream as issues (see below).
* **Security posture** - `docs/security.md` and `SECURITY.md`.
* **No trademark confusion** - "A2UI" is used descriptively, and the README says this is not an official Google product.

## Proposed table row

Append it after the other `v1.0` web renderers:

```md
| **[deftio/bitwrench-a2ui](https://github.com/deftio/bitwrench-a2ui)**<br />(`bitwrench-a2ui`) · [Docs](https://deftio.github.io/bitwrench-a2ui/pages/docs.html) · [Playground](https://deftio.github.io/bitwrench-a2ui/pages/playground.html) | Vanilla JavaScript (Web, Node static HTML) | `v1.0` | Active | Browser renderer on the official `@a2ui/web_core` and bitwrench's object-based UI engine: script tag or npm, no framework or consumer build step; basic and custom catalogs, streaming, actions, and static HTML in Node. |
```

## PR title and description

**Title:** `docs(ecosystem): add bitwrench-a2ui community renderer (v1.0, vanilla JS)`

**Description:**

> Adds [bitwrench-a2ui](https://github.com/deftio/bitwrench-a2ui) to the community renderers table.
>
> **What it is:** an independent browser renderer for A2UI v1.0, using the official `@a2ui/web_core` (MessageProcessor, data model, expressions, validation) and [bitwrench](https://github.com/deftio/bitwrench)'s JavaScript object-based UI engine. It supports the basic catalog, custom catalogs, reactive data binding, streaming updates and user actions, in the browser with no framework or consumer build step, and renders static HTML (not hydrated) in Node.
>
> **Compatibility:** built on `@a2ui/web_core` 0.16.1; the one remaining adaptation and the known differences are listed in <link to docs/compatibility.md>.
>
> **Verification:**
> - **Upstream renderer suites** - `conformance/core/adapter_conformance.yaml`, `core/accessibility.yaml` (structural checks in jsdom) and `adapter/markdown_subset.yaml` pass 36/36 applicable cases with no skips, at commit `<sha>`. The harness emits the standard executed-case manifest. Report: <link to docs/conformance-report.md>
> - **Examples** - all basic catalog examples in `specification/v1_0/json/catalogs/basic/examples/` render live and statically with no errors.
> - **Coverage** - 100% line, branch and function coverage of `src/` (`npm run test:coverage`); CI: <link>
>
> **Links:** [Playground](...) · [Component gallery](...) · [Docs](...) · [npm](https://www.npmjs.com/package/bitwrench-a2ui)
>
> I have signed the Google CLA.

## Upstream issues to file (separately, before or alongside the PR)

Checked against web_core 0.16.1 (2026-11-23). Five of the six 0.15 behaviours the adapter worked around are fixed upstream, and the adapter now relies on the core for them: `@` envelope keys, agent-function routing, custom-catalog accessibility bindings, bound Icon names, and removed props on `updateComponents`.

One remains, worth a short issue if none is open (search first):

1. **Themes** - `createSurface.theme` is rejected even in relaxed validation, where the v1.0 spec says relaxed renderers drop it (only strict mode should reject it). 0.16 stopped copying it onto the operation (#3834), but envelope validation still rejects the message.

Also worth raising, separately and only if not already tracked: web_core still depends on zod 3 (GHSA-mrhx-c7xc-m3w5, fixed only in zod 4).

Do not bundle these with the listing PR.
