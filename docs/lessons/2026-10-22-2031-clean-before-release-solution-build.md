---
id: 2026-10-22-2031-clean-before-release-solution-build
title: A solution built straight after npm run build can package the dev bundle
applies_when: >
  building a control's solution zip with `dotnet build` to import into an environment
rule: >
  Before building a solution to import, run `dotnet clean` and remove `out/`, `obj/` and `solution/bin|obj`, build with `-c Release`, and check `bundle.js`'s size in the zip, because a build after `npm run build` can reuse the development bundle.
lesson_type: pitfall
phase: deployment
domain: [solutions-alm, pcf-controls]
tech: [pcf, pac-cli]
scope: this-stack
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires: 
provenance:
  projects: [pcf-controls]
  date: 2026-10-22
  source: handover-doc
  evidence: "docs/testing/gridformatter-test-environment.md §4.4 (PR #28, commit 368109c)"
  author:
related: []
proposed_tags: []
---

When a control's solution is built with `dotnet build` straight after `npm run build`, the zip can contain the development bundle instead of the production one.

## What happened
The test-environment guide (§4.4) records that GridFormatter's production `bundle.js` is about 48 KB and that about 148 KB means a dev bundle slipped in, and prescribes a clean build before every import. The guide doesn't record the incident that led to the rule.

## Why it happened
`npm run build` produces a development bundle in `out/`. The solution build reuses existing output rather than always rebuilding in production mode. Unconfirmed beyond the guide.

## What to do instead
```sh
rm -rf out obj solution/bin solution/obj      # in controls/<ControlName>
dotnet build controls/<ControlName>/solution -c Release
unzip -l controls/<ControlName>/solution/bin/Release/WB<ControlName>.zip | grep bundle.js
```
Bump the manifest version on every redeploy, or Dataverse may keep serving the cached bundle.

## How to recognise it early
`bundle.js` roughly three times its usual size in the zip.

## When this does NOT apply
`pac pcf push` in dev, which builds its own bundle.
