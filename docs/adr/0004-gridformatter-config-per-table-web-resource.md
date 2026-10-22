# ADR-0004: GridFormatter rules live in one JSON web resource per table

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

The brief (`docs/briefs/2026-10-21-grid-formatting-and-rag-choice.md` §5.2) stores all GridFormatter rules in one JSON environment variable, `wb_GridFormatConfig`, with per-environment values set through deployment settings, and asks for room for about 50 rules.

Spike V8 (issue #9, `LowCode` test environment) showed that a JSON environment variable can't hold that:

- `environmentvariabledefinition.defaultvalue` accepts at most 2,000 characters; 5,000 is rejected with `0x80044331` ("length … exceeded").
- `environmentvariablevalue.value` accepts 1,999 characters and rejects 2,001 with a database constraint error.

At about 150–250 characters per rule, 2,000 characters is roughly 8–12 rules for a whole environment.

Spike V4 showed the customizer always knows its table (`context.page.entityTypeName`), so config can be looked up per table.

## Decision

Each table's rules are a separate JSON web resource named `wb_/GridFormatter/<table logical name>.json`. It holds `{ "version": 1, "defaults"?, "rules": [...] }`, validated against `controls/GridFormatter/config/grid-format.schema.json`. The web resource ships in the **project solution that owns the table**, next to the grid's `Customizer control` setting, in line with ADR-0001.

At runtime the control reads the table name, loads that one web resource once per page (cached at module scope), and behaves like the plain grid if it doesn't exist.

The environment variable `wb_GridFormatConfig` is dropped.

## Consequences

- No practical size limit. Rules are edited in VS Code with schema autocomplete and versioned with the project that uses them.
- Changing rules means deploying the project solution (not rebuilding the control). That's the same path as any other customisation of that table.
- Rules are the same in every environment by default. If an environment ever needs different rules, it needs its own copy of the web resource; that hasn't been asked for.
- Matching rule sets by table (§5.2.1) is replaced by the file name. Filtering by view stays unsupported, because the view id isn't available to the customizer (V4).
- Issues #10, #13 and #14 follow this shape rather than the brief's `ruleSets` and environment variable.
