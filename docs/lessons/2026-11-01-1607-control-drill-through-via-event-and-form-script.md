---
id: 2026-11-01-1607-control-drill-through-via-event-and-form-script
title: "A control that needs form navigation raises an event; a project form script navigates"
applies_when: >
  a reusable PCF field control needs to make something happen elsewhere on the form when the user
  selects something in it, such as opening a tab or switching a subgrid's view
rule: >
  When a reusable control needs form navigation, declare a custom <event> and raise it with a payload,
  and let a form script in the project's solution handle it through addEventHandler, because PCF has
  no supported formContext, and Xrm in the control ties it to one form and breaks prefix-agnostic reuse.
lesson_type: convention
phase: design
domain: [pcf-controls, model-driven-forms]
tech: [pcf, dataverse]
scope: this-project
cost_if_ignored: rework
confidence: established
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-01
  source: direct-experience
  evidence: "PR #71 (commit efd65b5): ChoiceCounts OnOptionSelect, controls/ChoiceCounts/examples/drill-through.js, decisions.md C-5; brief §2 amendment"
  author:
related: [2026-10-22-2022-hard-reload-after-publishing-forms]
proposed_tags: []
---

When a reusable PCF control needs to drive the form, for example by opening a tab or switching a subgrid to a filtered view, the control raises an event and a project-side form script does the navigation.

## What happened
The product owner wanted ChoiceCounts' Red and Amber counts to open the SMSF Matter form's Tasks tab, filtered to that colour. Three designs were weighed:
- **A saved view:** it can't filter by the current record.
- **Xrm inside the control:** unsupported, and against the brief.
- **A control event:** chosen.

The manifest declares `<event name="OnOptionSelect">`. The control calls `context.events.OnOptionSelect({ value, label, count, tableName, groupColumn })` when a maker sets *When a count is selected* to *Raise OnOptionSelect*.

`examples/drill-through.js`, a project web resource, registers `formContext.getControl(<host>).addEventHandler("OnOptionSelect", …)` on load. It then opens the tab, looks the colour's view up **by name** through `Xrm.WebApi`, and calls `getViewSelector().setCurrentView`. Tested in `LowCode`: Red shows exactly the matter's 2 red tasks.

## What to do instead
- Put the trigger in the control (an Enum input, off by default) and the behaviour in the form script, with a `CONFIG` block for tab, subgrid, table and view **names**, so the script needs no GUIDs per environment.
- Ship the script as an example in the control's folder, while projects deploy their own copy in their solution.
- The subgrid needs its view selector on, with the target views listed.

## When this does NOT apply
Behaviour fully inside the control, such as display or refresh. Canvas apps, which handle events in Power Fx. If Microsoft withdraws custom events (documented as **preview**), revisit.
