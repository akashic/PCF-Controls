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
4. **How the control finds the file:**
   1. Once per page (cached at module scope), read every publisher's `customizationprefix`.
   2. Query `webresource` for the exact names `<prefix>_GridFormatter.<table>.json`, one per prefix, combined with `or`.
   3. If the user can't read publishers, fall back to `endswith(name,'_GridFormatter.<table>.json')`.
   4. Ignore any result whose name doesn't match `^[A-Za-z][A-Za-z0-9]*_GridFormatter\.<table>\.json$` (case-insensitive).
5. **If more than one file matches a table**, the control warns, listing every match, and uses the first name in alphabetical order. The configuration guide states the rule: one rules file per table per environment.

## Considered options

- **Keep `wb_`.** Rejected: every project not on the William Buck publisher needs the workaround, and makers get it wrong.
- **An environment variable holding the project's prefix**, in the control's solution. Rejected: an extra deployment setting, and it allows only one prefix per environment when several projects share one.
- **Infer the prefix from the table name.** Rejected: system tables (`account`) have no prefix, and a project's prefix can differ from its tables' prefix.
- **`endswith` only.** Rejected as the main lookup: Microsoft documents leading-wildcard filters as an anti-pattern that scans the whole table and is throttled. It's kept as the fallback.
- **The `.js` extension.** Rejected: JSON isn't a valid JavaScript program, so VS Code, ESLint and Prettier would treat the file as broken code, schema autocomplete would stop working, and someone could add it to a form as a script library.
- **An underscore separator (`abc_gridformatter_abc_project.json`).** Rejected: harder to read, and the table name's boundary isn't obvious.
- **Merging rules from every matching file.** Rejected: priorities and `stop` would work across files, which is hard to predict.

## Consequences

- **Breaking change for existing rules files.** `wb_/GridFormatter/<table>.json` no longer matches. A web resource can't be renamed after it's saved, so each one has to be recreated under the new name. Only the `LowCode` test environment has one (`wb_/GridFormatter/wb_gridspike.json`).
- **One extra request per page** for the publishers, and it's cached.
- **Platform unknowns to prove in dev before building on them** (record them in `controls/GridFormatter/docs/decisions.md`):
  - Does the maker portal's file picker accept a `.json` file for a Script (JScript) web resource? If not, makers paste the content into the text editor or use the upload script.
  - Does the maker portal's name field accept `_` after the prefix (needed for `abc_project`)? Microsoft Learn lists only letters, numbers, periods and `/`.
  - Can a user with only the Basic User role read `publisher`?
  - Does Solution Checker flag JSON content in a Script (JScript) web resource?
- `scripts/check-controls.mjs` should fail on `wb_` text in a control's runtime source, so this assumption can't come back unnoticed.
