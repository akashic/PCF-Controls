# ADR-0005: Controls don't assume the deploying project's publisher prefix

- **Status:** Accepted (amends ADR-0004's web resource name)
- **Date:** 2026-10-25

## Context

The controls are reused across projects, and each project's solution has its own publisher and prefix, which we can't know in advance. ADR-0004 named GridFormatter's rules web resource `wb_/GridFormatter/<table>.json`, so the control only found rules under the William Buck prefix. The maker portal adds the current solution's publisher prefix to every new web resource name, so a project using another publisher had to create the file from a solution with the William Buck publisher and then add it to its own solution. That was the workaround in the configuration guide.

The name also used `/` to fake folders. `/` isn't allowed in Windows file names, and the product owner wants names that read as plain file names outside Dataverse.

The components a control's **own** solution ships (the control, as `wb_Controls.<ControlName>`, and its `wb_<ControlName><Purpose>` environment variables) belong to the William Buck publisher (ADR-0003). They aren't part of this problem: a project solution can reference another publisher's components.

## Decision

1. **A control never assumes the publisher prefix of the project that uses it.** Anything the project supplies (web resources now, and anything similar later) is found under any prefix. Hard-coding `wb_` is allowed only for the control's own solution components.
2. **GridFormatter's rules web resource is named `<prefix>_GridFormatter.<table logical name>.json`**, with no `/`. `<prefix>` is any publisher's customization prefix. For example: `abc_GridFormatter.account.json`, `abc_GridFormatter.abc_project.json`. The dot separates the parts because a table logical name can't contain one. The type stays Script (JScript), because Dataverse has no JSON type.
3. **The extension stays `.json`.** The content is JSON, not JavaScript, so editors, schema autocomplete and linters treat it as data.
4. **How the control finds the file:** one query per table, cached per page: `endswith(name,'[_]GridFormatter.<table>.json')`, with every `_` written as `[_]`. Dataverse treats `_` as a single-character wildcard here, and `[_]` matches only `_` (checked in `LowCode`). The control then ignores any result whose name doesn't match `^[A-Za-z][A-Za-z0-9]*_GridFormatter\.<table>\.json$` (case-insensitive).
5. **If more than one file matches a table**, the control warns, listing every match, and uses the first name in alphabetical order. The configuration guide states the rule: one rules file per table per environment.

## Considered options

- **Keep `wb_`.** Rejected: every project not on the William Buck publisher needs the workaround, and makers get it wrong.
- **An environment variable holding the project's prefix**, in the control's solution. Rejected: an extra deployment setting, and it allows only one prefix per environment when several projects share one.
- **Infer the prefix from the table name.** Rejected: system tables (`account`) have no prefix, and a project's prefix can differ from its tables' prefix.
- **Read the publishers' prefixes, then query exact names, falling back to `endswith`.** This was the first decision, because Microsoft documents leading-wildcard filters such as `endswith` as an anti-pattern: they scan the whole table, and Dataverse throttles them. The spike showed the Basic User role can't read `publisher` (or `solution`), so ordinary users would always make a failed request and then fall back anyway. In `LowCode` (20,782 web resources), `endswith` took about 0.1–0.2 s longer than an exact name, once per table per page. So `endswith` alone is simpler and costs little.
- **Make every project grant Publisher read to its users.** Rejected: easy to forget, and the grid quietly shows no formatting until someone does.
- **The `.js` extension.** Rejected: JSON isn't a valid JavaScript program, so VS Code, ESLint and Prettier would treat the file as broken code, schema autocomplete would stop working, and someone could add it to a form as a script library.
- **An underscore separator (`abc_gridformatter_abc_project.json`).** Rejected: harder to read, and the table name's boundary isn't obvious.
- **Merging rules from every matching file.** Rejected: priorities and `stop` would work across files, which is hard to predict.

## Consequences

- **Breaking change for existing rules files.** `wb_/GridFormatter/<table>.json` no longer matches. A web resource can't be renamed after it's saved, so each one has to be recreated under the new name. Only the `LowCode` test environment has one (`wb_/GridFormatter/wb_gridspike.json`).
- **The lookup scans the `webresource` table** once per table per page. That cost about 0.1–0.2 s on 20,782 web resources. If a very large environment starts throttling it, revisit this ADR.
- **Platform unknowns proved in dev** (details in `controls/GridFormatter/docs/decisions.md`, V10):
  - Basic User can't read `publisher`, which is why the lookup is `endswith` only.
  - The maker portal's file picker doesn't offer `.json`, so makers paste the JSON into the web resource's **Code** box (file type JavaScript (JS)). The name stays `.json`.
  - The maker portal's name field accepts `_` after the prefix, despite Microsoft Learn listing only letters, numbers, periods and `/`.
  - Solution Checker doesn't flag JSON content in a Script (JScript) web resource.
- `scripts/check-controls.mjs` should fail on `wb_` text in a control's runtime source, so this assumption can't come back unnoticed.
