# Build brief: `TextHash`, a Dataverse plug-in that blocks duplicate long text

> **Audience:** an AI coding agent (or developer) building the plug-in in this repo.
> **Date written:** 13 November 2026, from the product owner's answers on the original requirements, [`plugins/TextHash/requirements.md`](../../plugins/TextHash/requirements.md). That file's pattern and sample code are useful background, but **this brief overrides it** wherever they differ: names come from configuration, the hash column is `wbsuper_hash`, uniqueness is per fund, and the plug-in checks for a duplicate itself so users see a clear message. Platform facts were checked against Microsoft Learn on 13 November 2026. Anything not confirmed is marked **VERIFY**. Prove those with a spike in `LowCode` and record the result in `plugins/TextHash/docs/decisions.md`.
> **Status (13 Nov 2026):** built and tested in `LowCode`, and released as GitHub Release `TextHash-v0.1.0` (zips in [`releases/TextHash/0.1.0/`](../../releases/TextHash/0.1.0/); UAT pending). See [`plugins/TextHash/README.md`](../../plugins/TextHash/README.md), the [test results](../../plugins/TextHash/docs/decisions.md) and the [runbook](../../plugins/TextHash/docs/runbook.md).
> Conventions come from [ADR-0006](../adr/0006-plugins-folder.md) and the README's "Adding a plug-in". WBCodeFYName is the worked example: copy its `StepConfig`, fakes, schema test, registration script and solution fixes rather than re-deriving them.

---

## 1. What we are building and why

An SMSF query (`wbsuper_smsfquery`) has a multiple lines of text column, **query description** (`wbsuper_querydescription`), and a lookup to its fund (`wbsuper_smsf`). The same description must not appear twice for the same fund, whichever channel saves the row: forms, Power Automate, imports, integrations or the Web API.

Dataverse can't put a multiple lines of text column in an alternate key, and duplicate detection rules only warn in the UI. So a **synchronous PreOperation plug-in** on Create and Update normalises the description, hashes it with SHA-256, and writes the hex digest to a single line of text column, **`wbsuper_hash`**. An alternate key that includes `wbsuper_hash` makes the database enforce uniqueness. Before that, the plug-in looks for an existing row itself, so users see **"This query already exists for this fund."** instead of the platform's duplicate-key error.

Nothing in the code is specific to SMSF queries. The product owner may want the same thing on another table later, so every name and the message come from the step configuration.

| Item | Value |
|---|---|
| Folder | `plugins/TextHash/` |
| Project | `plugins/TextHash/TextHash/TextHash.csproj` |
| C# namespace and class | namespace `TextHash`, class `SetTextHash` |
| Assembly | classic, strong-name signed, `net48`, **`AssemblyVersion` fixed at `1.0.0.0`** |
| Solution | `WBTextHash`, WilliamBuck publisher (ADR-0003): the assembly, its two steps, the pre-image and the step configuration |
| Release tag | `TextHash-v<x.y.z>`; start version `0.1.0` |

---

## 2. Decisions (product owner, 12–13 Nov 2026)

| Topic | Decision |
|---|---|
| First table | `wbsuper_smsfquery`, text column `wbsuper_querydescription` (multiple lines, max 10,000 characters), fund lookup `wbsuper_smsf` → `wbsuper_smsfmatter`. |
| Hash column | **`wbsuper_hash`**, owned by the project's solution, with the alternate key applied. |
| Scope | A description must be unique **per fund**, not across all queries. The fund can't be blank. |
| What's a duplicate | Descriptions that differ only by **spacing or case** are duplicates (13 Nov). See §4.2. |
| Existing rows | **None.** There are no queries yet in any environment, so no backfill is needed and the key can be created with the column. |
| Reuse | **Generic.** Another table may need the same later, so the table, columns, scope lookup and message are all step configuration (ADR-0006 §4). A second table means another pair of steps in `WBTextHash` and a new release. |
| Blank text | The description is never blank. If it is anyway, the plug-in clears the hash and skips the check, so blank rows never collide. |
| Duplicate message | **"This query already exists for this fund."** It comes from the step configuration, because another table will need its own wording. |
| Bad configuration | Block the save with "Duplicate checking isn't configured correctly. Contact your administrator.", with the reason in the trace log, as WBCodeFYName does. |

### 2.1 Key on the fund and the hash, not a hash of both (approved 13 Nov)

The product owner first asked for the hash to cover both the description and the fund, "if possible". They then approved a **composite alternate key on `wbsuper_smsf` + `wbsuper_hash`**, with the hash taken from the description alone. Both enforce "unique per fund". The composite key is better because:

- **The hash stays a plain digest of the text.** It's the same in every environment and for every fund, so an integration or a backfill can compute or compare it without knowing a fund's GUID, which differs between dev, UAT and prod.
- **The rule is visible in Dataverse.** The key's definition says "unique per fund", instead of hiding the fund inside a hash.
- **The plug-in stays simpler and more reusable.** The scope lookup is only used to look for a duplicate. A table with no scope leaves it out, and its key is on the hash alone.

Lookup columns are allowed in alternate keys, and the key is about 144 bytes, well under the 900-byte limit (§3).

---

## 3. Platform facts

Each fact is marked as documented on Microsoft Learn **[D]**, seen in this repo's earlier work **[O]**, inferred **[I]**, or **VERIFY**.

- **Alternate keys** **[D]** ([work with alternate keys](https://learn.microsoft.com/power-apps/developer/data-platform/define-alternate-keys-entity)):
  - Only decimal, whole number, single line of text, date and time, lookup and choice columns can be key columns, so a multiple lines of text column can't.
  - Key columns can't have field-level security.
  - A key may be at most 900 bytes and 16 columns. Here it's a lookup (16 bytes) plus 64 characters of `nvarchar` (128 bytes).
  - The unique index is built by an async job (`EntityKeyIndexStatus` Pending → Active or Failed). It fails if duplicates exist, and can be retried with `ReactivateEntityKey`.
- **A two-lookup alternate key works in practice** **[O]**: WBCodeFYName's prerequisites put one on (WBCode, FY).
- **SHA-256 is in .NET Framework** **[D]**: `System.Security.Cryptography.SHA256` and `String.Normalize(NormalizationForm.FormC)` are in `mscorlib`, so no new package is needed.
- **Writing a column in PreOperation** **[O]**: setting `Target[column]` in PreOperation is saved in the same transaction. An Update that writes only the generated column is recomputed and overwritten, as WBCodeFYName W-1 showed for the name column.
- **Duplicate-key error** **[I]**: without the plug-in's own check, a duplicate fails on the save with a "duplicate record" error that names the key's values. The plug-in's check covers the common case. Only two saves of the same text and fund at the same moment reach the platform error.
- **Bypassing custom logic** **[D/I]**: a caller with `prvBypassCustomBusinessLogic` can save with plug-ins bypassed. Such a row gets no hash, so the key doesn't see it. Document this as a known limitation.
- **Required columns aren't enforced on the API** **[I]**: a column's "Business required" level is checked by forms, not by Web API saves. The fund can't be blank by business rule, so the plug-in doesn't check it. If a fund-less query does get through, the duplicate check treats fund-less queries as one group.
- **No VERIFY items.** Two were dropped on 13 Nov: how the key treats a blank fund (the fund can't be blank) and backfilling by touching the hash (there are no existing rows).

---

## 4. Design

### 4.1 Step configuration (unsecure, JSON)

```json
{
  "targetTable": "wbsuper_smsfquery",
  "textColumn": "wbsuper_querydescription",
  "hashColumn": "wbsuper_hash",
  "scopeLookup": "wbsuper_smsf",
  "duplicateMessage": "This query already exists for this fund."
}
```

- `scopeLookup` is **optional**; every other property is required. Unknown properties are rejected.
- The four names must match `^[A-Za-z_][A-Za-z0-9_]*$`. `duplicateMessage` must not be blank. (A 500-character limit was dropped while building; see decisions.md.)
- Schema and example in `plugins/TextHash/config/`, kept in step with `StepConfig` by a test, as in WBCodeFYName. WBCodeFYName's flat JSON reader already handles string values only, which is all this needs.

### 4.2 Normalisation (compiled, not configured)

What counts as "the same text" is fixed in code, because changing it later makes every stored hash stale:

1. Unicode normalisation form C.
2. Replace every run of whitespace (`char.IsWhiteSpace`: spaces, tabs, line breaks of any kind, non-breaking spaces) with one space.
3. Trim leading and trailing spaces.
4. `ToLowerInvariant()`.
5. SHA-256 of the UTF-8 bytes, written as 64 lowercase hex characters.

So `"Annual  return\r\nFY26"` and `" annual return fy26 "` are the same description. Step 2 also makes line-ending differences irrelevant.

Any change to these rules is a breaking change. Once a table has rows, it needs a minor version bump and a way to recompute every stored hash.

### 4.3 Code shape

- **`TextHasher`** (static, pure): `Normalise(string)` and `Hash(string) → string or null` (null for blank text). Every rule is here.
- **`StepConfig`** (pure): copied from WBCodeFYName and adapted to this plug-in's properties.
- **`SetTextHash : IPlugin`**, in this order:
  1. Check the message (Create/Update), the table, PreOperation, and that `Target` is an `Entity`. A wrong stage gets the configuration error, as in WBCodeFYName.
  2. Resolve the text from `Target`, or else from the `PreImage`. Do the same for the scope lookup.
  3. Compute the hash and set `Target[hashColumn]`, null if the text is blank. A hash supplied by the caller is always overwritten.
  4. If the hash isn't null, look for another row of the target table with the same hash and the same scope value (or a null scope), excluding the row being saved. Use `TopCount = 2` and compare IDs in code. If there is one, throw `InvalidPluginExecutionException(duplicateMessage)`.
  5. Wrap unexpected exceptions in a generic message ("The record couldn't be checked for duplicates. Try again, or contact your administrator."), and trace the details. Never trace the text itself.
- **The duplicate check runs as SYSTEM** (`CreateOrganizationService(null)`), unlike WBCodeFYName. The key blocks the save whether or not the user can read the other row. A check as the user would miss rows they can't see, and then show the cryptic platform error. The plug-in reveals only what the key already reveals.
- **Depth:** no depth guard. The plug-in never updates its own row.

### 4.4 Registration

| Step | Message | Stage / mode | Filtering attributes | Pre-image `PreImage` | Rank |
|---|---|---|---|---|---|
| Create | `Create` | PreOperation (20) / synchronous | n/a | none | 20 |
| Update | `Update` | PreOperation (20) / synchronous | text column, hash column, scope lookup | text column, scope lookup | 20 |

- **The hash column is in the filter**, so a direct write to it is recomputed. If a later table does have existing rows, blanking its hash column then fills it in, so a backfill needs no second hash implementation.
- **The scope lookup is in the filter**, so moving a query to a fund that already has the same description is blocked.
- Both steps carry the same configuration.

---

## 5. Testing

### 5.1 MSTest (no Dataverse)

- **`TextHasher`:**
  - The SHA-256 test vectors (`""` isn't hashed, and `"abc"` gives `ba7816bf…`).
  - CRLF, CR and LF variants hash the same.
  - Leading and trailing whitespace is ignored.
  - Runs of spaces, tabs, line breaks and non-breaking spaces inside the text hash the same as one space.
  - Text with no space where another has one (`"annualreturn"` vs `"annual return"`) hashes differently.
  - Case is ignored.
  - Composed and decomposed `é` hash the same.
  - Blank and whitespace-only text gives null.
  - A 10,000-character description, and a 1 MB string (the platform maximum for another table), work.
- **`StepConfig`:** valid configuration with and without `scopeLookup`; missing, empty, malformed and unknown properties; a bad logical name; an empty or overlong message. The schema and parser agree, and every example parses.
- **`Execute` through fakes:**
  - Create sets the hash.
  - Create with a duplicate for the same fund is blocked with the configured message.
  - A duplicate under a different fund is allowed.
  - Update of the text alone uses the scope from the pre-image.
  - Update of the scope alone uses the text from the pre-image and is checked.
  - Update writing only the hash recomputes it.
  - Update that keeps the same text doesn't match its own row.
  - Blank text clears the hash and skips the query.
  - A different table or message is ignored.
  - Bad configuration and the wrong stage are blocked.
  - A failing query is wrapped in the generic message.

### 5.2 `LowCode` test matrix (record in `docs/decisions.md`)

`wbsuper_smsfquery` doesn't exist in `LowCode` yet, but its fund table, `wbsuper_smsfmatter`, does ([test environment](../testing/wbcodefyname-test-environment.md)). Extend `scripts/test-env/create-smsf-tables.mjs` (it's idempotent) to add the query table with:
- `wbsuper_querydescription`: multiple lines of text, 10,000 characters;
- `wbsuper_smsf`: a business-required lookup to `wbsuper_smsfmatter`;
- `wbsuper_hash`: single line of text, 64 characters;
- the alternate key.

Documented in [`docs/testing/texthash-test-environment.md`](../testing/texthash-test-environment.md).

| Channel / case | Expected |
|---|---|
| Form: create a query, then the same description on the same fund | Second save blocked: "This query already exists for this fund." |
| Same description, different fund | Saves |
| Same description with different case, line endings, or extra spaces inside or around it | Blocked |
| Power Automate add a row with a duplicate | Blocked, with the message in the flow's error |
| Web API PATCH of `wbsuper_hash` only | Hash recomputed |
| Move a query to a fund that already has its description | Blocked |
| Description edited to match another query in the same fund | Blocked |
| Plug-in step disabled, duplicate saved through the Web API | The alternate key rejects it (proves the key, not the plug-in) |
| Step configuration removed or broken | Save blocked with the admin message; details in the trace log |

---

## 6. Project prerequisites and rollout

There are no queries yet, so there's no backfill. These go in the plug-in's README as prerequisites and in the runbook for William Buck:

1. **Project solution:**
   - `wbsuper_hash`: single line of text, 64 characters, not on forms, no field-level security.
   - The alternate key on `wbsuper_smsf` + `wbsuper_hash` (§2.1). Check that `EntityKeyIndexStatus` reaches Active.
   - `wbsuper_smsf` set to business required.
2. **Plug-in:** import `WBTextHash` with `--activate-plugins`, **before anyone creates a query**. A query saved before the plug-in is active has no hash, so the key doesn't protect it.
3. **Post-import check:** create a query, check that `wbsuper_hash` is filled, then try the same description on the same fund and confirm the message.

---

## 7. Things NOT to do

- Don't put the hash column, the alternate key or form changes in `WBTextHash`; they belong to the project's solution (ADR-0006 §3).
- Don't trust a hash supplied by a form, flow or integration.
- Don't make the normalisation configurable, and don't change it without a version bump and a re-backfill.
- Don't trace or log the description text.
- Don't compute the hash in a flow, a formula column or form script.
- Don't change `AssemblyVersion`, add NuGet packages without sign-off, or need Visual Studio or Windows to build.
- Don't run `register.mjs` in an environment that also imports the solution.

## 8. Questions answered by the product owner (13 Nov)

- **Spacing and case:** differences in either still make a duplicate.
- **The fund:** it can't be blank, and it points to `wbsuper_smsfmatter`.
- **Description length:** up to 10,000 characters.
- **Existing queries:** there are none.
- **The key:** on the fund and the hash (§2.1).

None are open.

## 9. Future ideas (out of scope for v1, don't build)

A second table; showing a link to the existing row in the message; configurable normalisation; a retrieve-and-compare of the full text on a hash match.
