---
id: 2026-10-22-2034-compare-field-control-with-platform-control
title: Verify a field control next to the platform's own control on a test form
applies_when: >
  verifying a PCF field control in the dev or test environment
rule: >
  When verifying a field control, put the platform's own control for the same column on the same test form and compare their accessibility tree, computed styles and behaviour, because every RagChoice defect found in #7 showed up as a difference from the platform control.
lesson_type: heuristic
phase: testing
domain: [model-driven-forms, accessibility, testing]
tech: [pcf, fluent-ui, claude-in-chrome]
scope: this-project
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires: 
provenance:
  projects: [pcf-controls]
  date: 2026-10-22
  source: direct-experience
  evidence: "issue #7; PR #32 (commit 045dcff); controls/RagChoice/docs/decisions.md Summary; docs/testing/gridformatter-test-environment.md §4.8"
  author:
related: [2026-10-22-2021-form-label-not-linked-to-custom-control, 2026-10-22-2031-field-control-hidden-options]
proposed_tags: []
---

When checking a custom field control in a real environment, comparing it with the platform's own control for the same column, side by side on one form, finds defects that a checklist misses.

## What happened
The "RagChoice test" form shows `wb_ragstatus` with RagChoice (dot), RagChoice (left bar) and the platform's dropdown, and the hidden-option column with both. Comparing them found all four 0.1.0 defects (#32):
- read-only was a disabled, unfocusable dropdown, where the platform uses a focusable read-only text box showing `---` when empty;
- the outline look didn't match the platform's `filled-darker` fields (fill, border, 32.5px height);
- the accessible name was the column name, not the form label;
- hidden options were listed.

## Why it works
The platform control defines what users and screen readers expect on that form. Differences in the accessibility tree, computed styles or behaviour are bugs, or decisions worth recording.

## What to do instead
- Add the platform control to the test form next to the custom one, on a separate test form.
- Compare the accessibility tree (role, name, read-only), computed styles in light and dark mode, read-only and locked states, and the option list.
- Record each difference and decision in the control's `decisions.md`.

## When this does NOT apply
Controls with no platform equivalent. It doesn't replace a real screen reader or the phone app (still open on #7).
