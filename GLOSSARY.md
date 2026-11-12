# William Buck Dataverse components

Controls and plug-ins that William Buck projects use in Dataverse model-driven apps. These terms come from the projects' own data. The components are reused across projects, so most of their vocabulary is Dataverse's own.

## Language

**WBCode**:
The unique identifier of a client, written as the six-digit **Client ID** followed by a two-digit suffix. The suffix `70` marks a super fund, so `00224570` is client `002245`'s super fund.
_Avoid_: WB code, code

**Client ID**:
The first six digits of a WBCode, identifying the client.
_Avoid_: client number

**FY**:
A financial year held as reference data, written `FY` followed by two digits (for example `FY26`).
_Avoid_: financial year record, year

**WBCodeFY**:
The identifier of one WBCode in one FY, written `<WBCode>-<last two digits of the FY>` (for example `00224570-26`). Each pair of WBCode and FY has at most one.
_Avoid_: WBCode-FY, code year

**SMSF Matter**:
One super fund's work for one FY, named by its WBCodeFY. Users call it the "fund" in messages such as "This query already exists for this fund."
_Avoid_: matter record

**SMSF Query**:
A query raised on one SMSF Matter, with a free-text **query description**. An SMSF Matter can't have two queries with the same description, ignoring differences of case and spacing.
_Avoid_: question, issue

**Duplicate query**:
An SMSF Query whose description matches another query's on the same SMSF Matter once case and spacing are ignored. The TextHash plug-in blocks it with "This query already exists for this fund."
