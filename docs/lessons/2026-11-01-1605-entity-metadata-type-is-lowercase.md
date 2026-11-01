---
id: 2026-11-01-1605-entity-metadata-type-is-lowercase
title: "getEntityMetadata gives a column's kind as attributeDescriptor.Type, in lower case"
applies_when: >
  a PCF control reads a grouped or bound choice column's kind (Choice, Status Reason, Status, Yes/No)
  and options from context.utils.getEntityMetadata
rule: >
  When a control needs a column's kind from getEntityMetadata, read attributeDescriptor.Type and
  compare type names case-insensitively ("picklist", "status", "state", "boolean"), because the
  descriptor has no AttributeType, and code expecting the Web API's "PicklistType" silently falls
  back to extra Web API calls.
lesson_type: pitfall
phase: implementation
domain: [pcf-controls, dataverse-metadata]
tech: [pcf, dataverse]
scope: this-stack
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-01
  source: direct-experience
  evidence: "PR #73 (commit 57bcd2e); controls/ChoiceCounts/docs/decisions.md C-4; tests/metadata.test.ts 'real shape'"
  author:
related: [2026-10-22-2031-option-colours-in-attribute-descriptor]
proposed_tags: []
---

When a PCF control reads a column's kind from `context.utils.getEntityMetadata`, the attribute descriptor has a lower-case `Type` (`picklist`, `status`, `state`, `boolean`) and no `AttributeType` or `AttributeTypeName`.

## What happened
ChoiceCounts read `attributeDescriptor.AttributeType ?? AttributeTypeName` and matched names like `PicklistType`. On the form, `Xrm.Utility.getEntityMetadata` (the same service as `context.utils`) returned `Type: "picklist"` and `_attributeTypeName: "picklist"`, with no `AttributeType`. So the control decided the kind was unknown and fetched it from the Web API on every load. 0.1.3 reads `Type` and matches names in any case.

## Why it happened
`attributeDescriptor` is undocumented. Its names follow the client's internal model, not the Web API's metadata classes.

## What to do instead
- Read `descriptor.Type ?? descriptor.AttributeType ?? descriptor.AttributeTypeName`, and lower-case the result before matching.
- The same descriptor's `OptionSet` is a list for **every** kind, Yes/No included (No then Yes): `{ Value, Label, Color, IsHidden }`. It's not `TrueOption`/`FalseOption`.
- `PrimaryIdAttribute` is on the result.
- Columns created after the page loaded aren't in its metadata (`Attributes.get` returns `null`) until a reload.

## How to recognise it early
Web API `EntityDefinitions(...)/Attributes(...)` requests on a form load, even though `getEntityMetadata` succeeded.

## When this does NOT apply
The Web API metadata endpoint itself, which uses `AttributeType: "Picklist"` and `AttributeTypeName: { Value: "PicklistType" }`.
