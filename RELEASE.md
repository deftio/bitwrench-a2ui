# Release procedure

How bitwrench-a2ui versions are cut and published. Two pieces do the work: `tools/release.js` on the maintainer's machine, and `.github/workflows/release.yml` in CI. If this file and the scripts disagree, the scripts are right and this file is a bug.

Contributors do not need this file; see [CONTRIBUTING.md](CONTRIBUTING.md).

## How a release flows

From the command to the published package:

1. **`npm run release -- <patch|minor|major|X.Y.Z>`** on `main` runs the pre-flight checks, bumps the version, runs every gate, then asks before it commits `release: vX.Y.Z`, tags it, and pushes both.
2. **The tag push starts `release.yml`**, which:
   1. checks the tag against `package.json` and that the tagged commit is on `main`;
   2. rebuilds, confirms the committed `dist/` matches, runs the full tests and the package check, and packs the tarball once;
   3. publishes that tarball to npm with **trusted publishing** (OIDC, no stored token), which attaches **provenance**;
   4. attests build provenance for the tarball and dist files, and creates the **GitHub Release** with the CHANGELOG notes, the tarball, the dist files and `SHA256SUMS`.

Versions with a pre-release suffix (`0.10.0-rc.1`) go to the npm dist-tag `next` and are marked as pre-releases on GitHub; others go to `latest`.

Rehearse a release at any time with `npm run release:dry`. It runs every check and gate and keeps no changes, apart from rebuilt files the script tells you how to restore.

## What the release script checks

Pre-flight, before anything changes:

* **Branch** - on `main`, clean, not behind `origin/main`.
* **Identity** - `git config user.name` is `deftio`, and `origin` is a `github.com/deftio/` repository. Commits under another identity are refused.
* **Version** - newer than the current one; not already a tag locally or on origin; not already on npm.
* **Package** - `package.json` is not `private`.
* **Notes** - CHANGELOG.md has content under `## Unreleased`. It becomes `## X.Y.Z - date`.

It then bumps:

* `package.json`, `package-lock.json`, `VERSION` in `src/index.js`
* the `bitwrench-a2ui@X.Y.Z` CDN URLs in the README, docs, examples and pages
* the CHANGELOG

The gates, in order:

1. `npm run build`
2. `tools/cdn-tags.js --check` - CDN tags are pinned with correct SRI
3. `npm run test:coverage` - every test, with the 100% gate
4. `npm run conformance:report`
5. `tools/check-package.js --install` - the packed tarball installs into an empty project and renders
6. `tools/build-site.js`

## One-time setup

### npm

These steps happen on npmjs.com:

1. **First publish (0.9.0)** - by hand, because npm's trusted-publisher settings live on a package's page, which does not exist until the first publish:
   ```sh
   git switch main && git pull && git status    # clean, at the commit you want to ship
   npm ci && npm run build && npm run test:coverage
   npm login                                    # the deftio npm account, with 2FA
   npm publish                                  # prepublishOnly runs tools/check-package.js
   npm view bitwrench-a2ui                      # confirm
   ```
   This first version has no provenance statement; every later one does.
2. **Trusted publisher** - on npmjs.com, open bitwrench-a2ui, then Settings > Trusted publishing > GitHub Actions:
   * **Organization or user** - `deftio`
   * **Repository** - `bitwrench-a2ui`
   * **Workflow filename** - `release.yml`
   * **Environment** - `npm`

   The values are case-sensitive and npm does not check them on save; a mismatch only shows as `ENEEDAUTH` when CI publishes.
3. **Lock tokens out** - once a CI publish has worked: Settings > Publishing access > "Require two-factor authentication and disallow tokens". Trusted publishing keeps working; leaked tokens no longer can.

If npm ever offers trusted publishing before a package exists, the workflow can do the first publish instead: put a temporary granular token in an `NPM_TOKEN` secret on the `npm` environment, push the tag, then delete the secret and revoke the token.

### GitHub repository settings

These are settings, not files:

* **Actions** - Settings > Actions > General: workflow permissions "Read repository contents" (the workflows request more per job), and allow GitHub Actions to create pull requests off.
* **Environment `npm`** - Settings > Environments > New: name `npm`. Under deployment tags, allow only tags matching `v*`. Add yourself as a required reviewer if every publish should wait for a click.
* **Pages** - Settings > Pages: source "GitHub Actions".
* **Security** - Settings > Advanced Security:
  * private vulnerability reporting
  * Dependabot alerts and Dependabot security updates
  * secret scanning with push protection
  * CodeQL: the workflow `codeql.yml` is the configuration; leave "default setup" off so the two do not conflict.
* **Rulesets** - Settings > Rules:
  * **`main`** - require a pull request or allow only you to bypass, require status checks (`Test (Node 22)`, `Test (Node 24)`, `Package and supply chain`, `Analyze (javascript-typescript)`), block force pushes and deletion.
  * **Tags `v*`** - restrict creation, update and deletion to you, so release tags cannot be moved.

The same settings from a terminal with `gh` (as `deftio`):

```sh
gh api -X PUT repos/deftio/bitwrench-a2ui/private-vulnerability-reporting
gh api -X PUT repos/deftio/bitwrench-a2ui/vulnerability-alerts
gh api -X PUT repos/deftio/bitwrench-a2ui/automated-security-fixes
gh api -X PATCH repos/deftio/bitwrench-a2ui -f 'security_and_analysis[secret_scanning][status]=enabled' -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
gh api -X PUT repos/deftio/bitwrench-a2ui/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
gh api -X PUT repos/deftio/bitwrench-a2ui/environments/npm
```

## The first two releases

They exercise the pipeline in two halves:

1. **0.9.0** - publish by hand (above), then push the tag that matches it:
   ```sh
   git tag -a v0.9.0 -m "bitwrench-a2ui v0.9.0"
   git push origin v0.9.0
   ```
   `release.yml` runs every gate, sees 0.9.0 already on npm and skips that step, then creates the GitHub Release. This tests the build, attestation and GitHub Release path.
2. **0.9.1** - after setting up the trusted publisher, add notes under `## Unreleased` and run `npm run release -- patch`. This tests the whole path, including the OIDC publish with provenance.

## After a release

Check that it landed:

- [ ] The workflow is green: https://github.com/deftio/bitwrench-a2ui/actions/workflows/release.yml
- [ ] npm has it, with provenance: `npm view bitwrench-a2ui@X.Y.Z` and the "Provenance" panel on npmjs.com
- [ ] The GitHub Release has the notes and assets: https://github.com/deftio/bitwrench-a2ui/releases
- [ ] The CDN serves it: https://cdn.jsdelivr.net/npm/bitwrench-a2ui@X.Y.Z/dist/bitwrench-a2ui.min.js
- [ ] The files verify: `gh attestation verify bitwrench-a2ui-X.Y.Z.tgz -R deftio/bitwrench-a2ui`

## Recovery

When something goes wrong:

* **The workflow failed** - fix the cause and re-run the failed jobs from the Actions tab. Each step skips work already done: an existing npm version is not republished, and an existing GitHub Release gets its assets refreshed.
* **The tag is wrong and nothing was published** - delete it locally and on origin (`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`), fix, and release again.
* **A bad version reached npm** - versions cannot be replaced. Deprecate it (`npm deprecate bitwrench-a2ui@X.Y.Z "reason"`) and release a patch. `npm unpublish` is only allowed within 72 hours and should be a last resort.

## Rules

* No `npm publish` from a laptop after 0.9.0. CI owns publishing.
* No hand-made or moved release tags. The release script makes them, and the tag ruleset protects them.
* `dist/` is committed and must be byte-for-byte what the build produces. CI checks it on every push and again on the tag.
* Dependencies are exact pins. Upgrades come through Dependabot pull requests, or deliberately, with a full CI run.
* Actions are pinned to commit SHAs, with the version in a comment. Dependabot keeps both current.
