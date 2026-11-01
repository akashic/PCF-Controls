---
id: 2026-11-01-1605-flow-lookup-needs-odata-bind
title: "Flow definitions set Dataverse lookups as item/<nav>@odata.bind, despite validate_flow"
applies_when: >
  writing a Power Automate cloud flow definition by hand or with the FlowAgent tools that sets a
  lookup column in a Dataverse "Add a new row" or "Update a row" action
rule: >
  When a flow definition sets a Dataverse lookup, use the parameter "item/<navigation
  property>@odata.bind" with "/<entityset>(<id>)" and ignore FlowAgent validate_flow's
  odata-bind-param error, because the plain column name passes validation but fails on save with
  WorkflowOperationParametersExtraParameter.
lesson_type: pitfall
phase: testing
domain: [testing, agent-workflow]
tech: [dataverse]
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
  evidence: "PR #69 (commits c3d9d73, 0322bd7); docs/testing/flows/wbcodefyname-60-test.definition.json; docs/testing/wbcodefyname-test-environment.md §4"
  author:
related: []
proposed_tags: [power-automate]
---

When a flow definition sets a Dataverse lookup, the FlowAgent validator and Dataverse disagree about the parameter name.

## What happened
For WBCodeFYName's Power Automate case:
- `validate_flow` rejected `item/wbsuper_WBCode@odata.bind`: "uses @odata.bind syntax which PA connectors don't support".
- Changing it to `item/wbsuper_wbcode` passed validation, but `create_flow` failed with `WorkflowOperationParametersExtraParameter`: "The API operation does not contain a definition for parameter 'item/wbsuper_wbcode'".
- `create_flow` with `item/wbsuper_WBCode@odata.bind` = `/wbsuper_superfundclients(<id>)` saved, and the run succeeded.
- `resolve_params` couldn't expand the table's dynamic schema to show the real name.

## Why it happened
The Dataverse connector's dynamic schema names a lookup by its **navigation property** plus `@odata.bind`, as exported flows show. The validator's rule assumes plain names.

## What to do instead
- Use `item/<LookupSchemaName>@odata.bind`. The navigation property is usually the lookup's SchemaName (case matters). The value is `/<entitysetname>(<guid>)`.
- Skip `validate_flow` for that rule only, and let `create_flow` be the real check.

## When this does NOT apply
Non-lookup columns, which use `item/<logicalname>`. Flows built in the designer, which writes the right name itself.
