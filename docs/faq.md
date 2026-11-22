# FAQ

Short answers to questions people ask about this project.

## What is the relationship to Google's A2UI?

A2UI is an open protocol published by Google at https://a2ui.org. bitwrench-a2ui is an independent, community renderer for it. It uses Google's own `@a2ui/web_core` for protocol handling, so its behavior matches the official renderers, and draws the UI with bitwrench. It is not affiliated with or endorsed by Google.

## Why bitwrench instead of React or Lit?

The official web renderers are template-based and good at what they do. bitwrench takes a different approach: UI and CSS are plain JavaScript data. A2UI is also UI as data, so the mapping is direct and inspectable, the same tree renders to DOM or to an HTML string, themes are generated from a few colors at runtime, and nothing needs a build step. If your app already uses a framework, an official renderer may suit you better; if you want a script tag, static HTML output or a non-framework page, this one is meant for you.

## Do I need to know bitwrench?

No. You send A2UI messages and get a rendered surface. bitwrench matters only if you write custom components or deep theme overrides; [bitwrench in five minutes](bitwrench-primer.md) covers what you need.

## Does it need a build step?

Not for users. Two script tags (or one, with the bundle) are enough. The repository has a small esbuild script that produces the browser files.

## Which A2UI versions are supported?

v1.0 only. See [Compatibility](compatibility.md).

## How big is it?

The browser build bundles web_core and its dependencies, so it is not tiny; exact sizes for every file are in `dist/builds.json`. Size is not the goal of this project. A standalone build without web_core is planned.

## Can an agent run code or inject HTML through it?

No. See [Security](security.md).

## Can I use it with Claude, Gemini or OpenAI?

Yes, with any model or agent framework that produces A2UI v1.0 JSON. The site's LLM sandbox page lets you try all three with your own key; see [Using with LLMs](using-with-llms.md).

## Can I use it on the server?

Yes, for HTML output: `renderToHTML()` runs in Node with no DOM. See [Static HTML](static-html.md).

## Where do I report a bug?

On GitHub issues. Security problems go through the private reporting described in [SECURITY.md](../SECURITY.md).
