# Upstream listing: draft

Draft for adding bitwrench-a2ui to the A2UI community projects page. This file is for us; nothing here has been submitted.

* **Target file** - `docs/site/src/content/docs/ecosystem/renderers.mdx` in `a2ui-project/a2ui`, table "Community renderers".
* **Process** (from that page) - fork, sign the Google CLA, add the row, open a PR with verification details or demo links, then optionally post in GitHub Discussions.

## Before opening the PR

Do these first, in order:

1. **Publish the npm package** - register `bitwrench-a2ui`, set `"private": false`, tag `v0.1.0` (the release workflow publishes with provenance). The CDN links in the docs only resolve after this.
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

* **The official conformance suites** - all 36 cases pass with no skips, and the manifest uses the upstream format (`docs/conformance-report.md`).
* **Use of `@a2ui/web_core`** - the core is used as intended rather than reimplemented. The 0.15 gaps we work around are documented in `docs/compatibility.md`, and should be filed upstream as issues (see below).
* **Security posture** - `docs/security.md` and `SECURITY.md`.
* **No trademark confusion** - "A2UI" is used descriptively, and the README says this is not an official Google product.

## Proposed table row

Append it after the other `v1.0` web renderers:

```md
| **[deftio/bitwrench-a2ui](https://github.com/deftio/bitwrench-a2ui)**<br />(`bitwrench-a2ui`) · [Docs](https://deftio.github.io/bitwrench-a2ui/pages/docs.html) · [Playground](https://deftio.github.io/bitwrench-a2ui/pages/playground.html) | Vanilla JavaScript (Web, Node static HTML) | `v1.0` | Active | No-build, framework-free renderer on `@a2ui/web_core` and bitwrench; one script tag, passes the conformance suites, renders to HTML strings in Node. |
```

## PR title and description

**Title:** `docs(ecosystem): add bitwrench-a2ui community renderer (v1.0, vanilla JS)`

**Description:**

> Adds [bitwrench-a2ui](https://github.com/deftio/bitwrench-a2ui) to the community renderers table.
>
> **What it is:** an A2UI v1.0 renderer for plain JavaScript, with no framework and no build step. It is built on `@a2ui/web_core` (MessageProcessor, data model, expressions, validation) with [bitwrench](https://github.com/deftio/bitwrench) as the view layer. The same component tree also renders to HTML strings in Node, for previews and email-style output.
>
> **Verification:**
> - **Conformance** - `conformance/core/adapter_conformance.yaml`, `core/accessibility.yaml` and `adapter/markdown_subset.yaml` pass 36/36 with no skips, at commit `<sha>`. The harness emits the standard executed-case manifest. Report: <link to docs/conformance-report.md>
> - **Examples** - all basic catalog examples in `specification/v1_0/json/catalogs/basic/examples/` render live and statically with no errors.
> - **Coverage** - 100% line and branch coverage of the renderer source; CI: <link>
>
> **Links:** [Playground](...) · [Component gallery](...) · [Docs](...) · [npm](https://www.npmjs.com/package/bitwrench-a2ui)
>
> I have signed the Google CLA.

## Upstream issues to file (separately, before or alongside the PR)

These are the web_core 0.15 behaviours the adapter works around (details in `docs/compatibility.md`). Filing them as issues is good citizenship, and the maintainers will see that we use the core properly:

1. **Envelope keys** - `@checks`, `@accessibility`, `@metadata` and `@catalogId` on components are rejected by schema validation, though v1.0 defines them.
2. **Themes** - `createSurface.theme` is rejected even in relaxed validation, where the v1.0 spec says it should be dropped (only strict mode should reject it).
3. **Agent functions** - functions declared in a catalog but not implemented locally are not routed to `callAgentFunction`.
4. **Custom catalog bindings** - custom catalog `accessibility` bindings are not resolved or reactive in the same way as basic catalog ones.
5. **Icon names** - a bound Icon `name` (`{"@path": ...}`) is passed through unresolved.
6. **Removed props** - optional props removed by an `updateComponents` persist on the node.

Check each against the latest web_core release first; drop any that have been fixed.
