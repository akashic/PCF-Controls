---
id: 2026-11-02-2300-maker-portal-name-column-is-schema-name
title: "The maker portal's column Name is the schema name; configs need the lower-case logical name"
applies_when: >
  copying a table or column name from the maker portal's Columns list into a step configuration,
  FetchXML or a Web API call
rule: >
  When taking a name from the maker portal's Columns list, lower-case it before using it in a
  step configuration or query, because that list shows the schema name (wbsuper_Name) and
  Dataverse matches logical names (wbsuper_name).
lesson_type: pitfall
phase: implementation
domain: [dataverse-metadata, plugins]
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
  evidence: "commit 740b1a7: plugins/WBCodeFYName/fields.md lists wbsuper_Name as shown and uses wbsuper_name in the step configuration"
  author:
related: []
proposed_tags: []
---

When a name is copied from the maker portal's Tables → Columns list into WBCodeFYName's step configuration, FetchXML or a Web API call, mixed-case names like `wbsuper_Name` or `wbsuper_FinancialYearId` don't match, because the portal shows schema names and Dataverse expects logical names.

## What happened
The Financial Year table's columns, read from the dev maker portal, include `wbsuper_Name`, `wbsuper_FinancialYearId` and `wbsuper_FundNoted`, next to all-lower-case ones like `wbsuper_enddate`. The step configuration's `fyValueColumn` had to be `wbsuper_name`. `fields.md` records both forms.

## Why it happened
The Columns list's **Name** column is the SchemaName, which keeps the maker's casing. The LogicalName is always the lower-case form, and that's what configuration, FetchXML and the Web API's column names use. Most columns are created lower-case, so the difference only shows on a few.

## What to do instead
- Lower-case every name taken from the Columns list before putting it in `step-config` JSON or a query.
- `check:controls` and `StepConfig` accept mixed case, so neither catches this. A wrong case only fails at run time.

## When this does NOT apply
Web API **navigation properties** in `@odata.bind`, which use the schema name's casing (see the flow lookup lesson).
