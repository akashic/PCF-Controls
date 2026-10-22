---
id: 2026-10-22-2031-option-colours-in-attribute-descriptor
title: getEntityMetadata hides option colours in the undocumented attributeDescriptor.OptionSet
applies_when: >
  a dataset or grid customizer control reads choice or status option colours with `context.utils.getEntityMetadata`
rule: >
  When reading option colours with `getEntityMetadata`, read `Attributes.get(col).attributeDescriptor.OptionSet[].Color` defensively and fall back to the Web API attribute metadata endpoint, because the documented `Attributes.get(col).OptionSet` has no colours.
lesson_type: pitfall
phase: implementation
domain: [dataverse-metadata, grid-customizer]
tech: [pcf, dataverse-web-api]
scope: this-stack
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires: 
provenance:
  projects: [pcf-controls]
  date: 2026-10-22
  source: direct-experience
  evidence: "controls/GridFormatter/docs/decisions.md V3; PR #26 (stores/metadataStore.ts); issue #15 (Web API fallback check)"
  author:
related: []
proposed_tags: []
---

When a control asks `context.utils.getEntityMetadata` for a choice column's options, the documented shape has labels and values but no colours.

## What happened
In the GridFormatter spike (V3), `Attributes.get(col).OptionSet` was `{ "<value>": { text, value } }`. The colours were only in the undocumented `Attributes.get(col).attributeDescriptor.OptionSet`: `[{ Value, Label, Color, IsHidden, TransitionData }]`, with `Color` missing when the option has none. Status, status reason and multi-select columns have the same shape.

## Why it happened
Not documented by Microsoft. The descriptor appears to be the host's internal metadata object.

## What to do instead
- Read `attributeDescriptor.OptionSet[].Color` without assuming the shape (`engine/optionMetadata.ts`).
- For columns it doesn't describe, call `/api/data/v9.2/EntityDefinitions(LogicalName='<table>')/Attributes/Microsoft.Dynamics.CRM.<Picklist|MultiSelectPicklist|State|Status>AttributeMetadata?$filter=LogicalName eq '<col>'&$expand=OptionSet($select=Options)`. Issue #15 confirmed it returns the same colours.
- Warn once per column neither source describes.

## When this does NOT apply
Field controls bound to the column: RagChoice gets `Color` directly on `context.parameters.<prop>.attributes.Options`.
