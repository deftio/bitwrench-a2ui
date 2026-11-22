#!/usr/bin/env bash
# Apply the repository's GitHub settings: security features, Actions permissions, the npm
# release environment, and the branch and tag rulesets in .github/rulesets/.
#
#   tools/github-settings.sh            apply (idempotent: safe to re-run)
#   tools/github-settings.sh --show     print the current settings, change nothing
#
# Needs gh signed in as an admin of the repository. The settings, and why:
#   - private vulnerability reporting, Dependabot alerts and security updates, secret
#     scanning with push protection
#   - Actions: GITHUB_TOKEN read-only by default (each workflow asks for what it needs), and
#     workflows may not approve pull requests
#   - environment "npm": only v* tags may deploy to it (the npm trusted publisher names it)
#   - ruleset "main": pull requests with a code-owner review and green CI for everyone
#     except repository admins, who may push releases directly; no force pushes or deletion
#   - ruleset "release tags": only repository admins may create, move or delete v* tags
set -euo pipefail

REPO="deftio/bitwrench-a2ui"
OWNER="deftio"
here="$(cd "$(dirname "$0")/.." && pwd)"

login="$(gh api user --jq .login)"
if [ "$login" != "$OWNER" ]; then
  echo "gh is signed in as $login; switch first: gh auth switch -u $OWNER" >&2
  exit 1
fi

if [ "${1:-}" = "--show" ]; then
  gh api "repos/$REPO" --jq '{visibility, security_and_analysis}'
  gh api "repos/$REPO/actions/permissions/workflow"
  gh api "repos/$REPO/rulesets" --jq '.[] | {id, name, target, enforcement}'
  gh api "repos/$REPO/environments" --jq '.environments[] | {name, deployment_branch_policy}'
  exit 0
fi

echo "security features"
gh api -X PUT "repos/$REPO/private-vulnerability-reporting" >/dev/null
gh api -X PUT "repos/$REPO/vulnerability-alerts" >/dev/null
gh api -X PUT "repos/$REPO/automated-security-fixes" >/dev/null
gh api -X PATCH "repos/$REPO" \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled' >/dev/null

echo "CodeQL: advanced setup (.github/workflows/codeql.yml), so default setup must be off"
gh api -X PATCH "repos/$REPO/code-scanning/default-setup" -f state=not-configured >/dev/null || true

echo "Actions permissions"
gh api -X PUT "repos/$REPO/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false >/dev/null

echo "environment npm (v* tags only)"
gh api -X PUT "repos/$REPO/environments/npm" --input - >/dev/null <<'JSON'
{ "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
JSON
if ! gh api "repos/$REPO/environments/npm/deployment-branch-policies" --jq '.branch_policies[].name' | grep -qx 'v*'; then
  gh api -X POST "repos/$REPO/environments/npm/deployment-branch-policies" -f name='v*' -f type=tag >/dev/null
fi

apply_ruleset() {
  local file="$1" name id
  name="$(node -p "require('$file').name")"
  id="$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$name\") | .id")"
  if [ -n "$id" ]; then
    gh api -X PUT "repos/$REPO/rulesets/$id" --input "$file" >/dev/null
    echo "ruleset \"$name\" updated"
  else
    gh api -X POST "repos/$REPO/rulesets" --input "$file" >/dev/null
    echo "ruleset \"$name\" created"
  fi
}
apply_ruleset "$here/.github/rulesets/main.json"
apply_ruleset "$here/.github/rulesets/release-tags.json"

echo "done. Review with: tools/github-settings.sh --show"
