---
id: 2026-10-22-2022-visible-probe-rule-as-test-signal
title: Use a visible probe rule to see which config GridFormatter loaded in LowCode
applies_when: >
  checking in the browser which rules file or code path GridFormatter used, in the
  LowCode test environment through Claude in Chrome
rule: >
  When you need to know which config the control loaded, deploy a probe rule with a
  distinctive style and check the rendered cells, because the console tool and
  network panel didn't show GridFormatter's log output or config request there.
lesson_type: workaround
phase: testing
domain: [testing, grid-customizer]
tech: [claude-in-chrome, power-apps-grid]
scope: this-project
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires: 2027-04-22
provenance:
  projects: [pcf-controls]
  date: 2026-10-22
  source: direct-experience
  evidence: issue #30, PR #31 (commit cce8edf), docs/testing/gridformatter-test-environment.md §4.7
  author:
related: [2026-10-22-2021-subgrid-page-table-is-form-table]
proposed_tags: []
---

When testing in `LowCode` through Claude in Chrome which rules file GridFormatter loaded, the console and network tools don't show it, so make the answer visible on the grid instead.

## What happened
Proving #30 meant telling whether a Users subgrid used `systemuser.json` or `wb_gridspike.json`. `read_console_messages` captured none of GridFormatter's `console.info` lines, and neither the network panel nor performance resource entries showed the web resource request.

## Why it happened
Not confirmed. The control runs inside the platform's grid host, and its console output and requests didn't reach the tools we used.

## What to do instead
- Upload a probe rule file (for example `wb_/GridFormatter/systemuser.json` with one `isNotNull` row rule and a distinctive background) and publish.
- Hard-reload and read the cells' `style.backgroundImage` with the JavaScript tool, or look at the screenshot.
- To test a fallback, put the same probe in the other table's file.
- Delete the probe web resources and restore the real rules afterwards.

## How to recognise it early
The console tool returns nothing for `[GridFormatter]` although the grid is clearly formatted.

## When this does NOT apply
In the browser's own DevTools console a person may see the log lines. Re-review by the expiry date in case the tooling now captures them.
