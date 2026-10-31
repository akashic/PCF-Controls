# William Buck Dataverse components

Controls and plug-ins that William Buck projects use in Dataverse model-driven apps. These terms come from the projects' own data. The components are reused across projects, so most of their vocabulary is Dataverse's own.

## Language

**WBCode**:
A William Buck code held as reference data, written as eight digits ending in `70` (for example `00224570`).
_Avoid_: WB code, code

**FY**:
A financial year held as reference data, written `FY` followed by two digits (for example `FY26`).
_Avoid_: financial year record, year

**WBCodeFY**:
The identifier of one WBCode in one FY, written `<WBCode>-<last two digits of the FY>` (for example `00224570-26`). Each pair of WBCode and FY has at most one.
_Avoid_: WBCode-FY, code year
