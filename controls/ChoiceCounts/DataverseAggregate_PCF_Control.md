# Reusable `DataverseAggregate` PCF Control

## Purpose

This guide describes how to build a reusable Power Apps Component Framework (PCF) control named `DataverseAggregate` for a Dataverse model-driven app.

The control is intended to display a server-side aggregate value from Dataverse directly on a table form, for example:

- Active tasks: `7`
- Open email events: `3`
- Current FY matters: `48`
- Total invoice amount: `$125,430`

For a count such as `count(rows where status = active)`, the control sends an aggregate FetchXML query to Dataverse instead of retrieving every matching row and counting records in the browser.

---

## 1. Recommended architecture

```text
Model-driven form
        |
        v
DataverseAggregate PCF
        |
        v
Dataverse Web API / context.webAPI.retrieveMultipleRecords
        |
        v
Aggregate FetchXML
        |
        v
Dataverse performs COUNT / SUM / AVG / MIN / MAX
        |
        v
PCF displays the result
```

The PCF is responsible for presentation and query execution. Dataverse performs the aggregation.

Do not persist a count in another Dataverse column unless the value genuinely needs to be stored. Persisted counters introduce synchronisation work whenever source records are created, deleted or change status.

---

## 2. Example requirement

Assume a form needs to display the number of active ATO SmartDocs tasks.

A representative aggregate FetchXML query is:

```xml
<fetch aggregate="true">
  <entity name="wbsuper_atosmartdocstask">
    <attribute
      name="wbsuper_atosmartdocstaskid"
      alias="aggregatevalue"
      aggregate="count" />
    <filter type="and">
      <condition
        attribute="statecode"
        operator="eq"
        value="0" />
    </filter>
  </entity>
</fetch>
```

If the aggregate must apply only to records associated with the current form row, include a lookup condition containing the current record GUID.

---

## 3. Make the control reusable

Avoid hard-coding a particular Dataverse table or business process into the control.

Recommended configurable inputs are:

| Property | Purpose | Example |
|---|---|---|
| `entityName` | Logical name of table to query | `wbsuper_atosmartdocstask` |
| `aggregateColumn` | Column used in aggregation | `wbsuper_atosmartdocstaskid` |
| `aggregateType` | Aggregate operation | `count` |
| `filterXml` | Optional FetchXML filter content | Active rows filter |
| `relationshipColumn` | Optional lookup back to current form record | `wbsuper_smsf` |
| `label` | Text shown beside/above result | `Active Tasks` |
| `useCurrentRecord` | Whether to filter by current form record | `true` |
| `prefix` | Optional result prefix | `$` |
| `suffix` | Optional result suffix | `%` |
| `decimalPlaces` | Numeric formatting | `0` or `2` |

For the first implementation, support these aggregate operations:

```text
count
sum
avg
min
max
```

---

## 4. Development prerequisites

Install the supported Power Platform PCF development toolchain used by the organisation. At minimum the development workstation normally requires:

- Node.js;
- npm;
- Microsoft Power Platform CLI (`pac`);
- Visual Studio Code or Visual Studio;
- access to a Dataverse development environment; and
- a Dataverse solution for deployment.

Verify the Power Platform CLI:

```bash
pac --version
```

Authenticate to the development environment using the organisation's normal Power Platform CLI authentication process before deployment.

---

## 5. Create the PCF project

Create a working directory and initialise a field control:

```bash
mkdir DataverseAggregate
cd DataverseAggregate
pac pcf init --namespace WBSuper.Controls --name DataverseAggregate --template field
npm install
```

A field-template control is convenient when the aggregate is hosted against a form column. The bound column can function as the placement anchor while the displayed value is obtained dynamically from Dataverse.

Do not write the aggregate result back to the bound Dataverse column unless persistence is an explicit requirement.

---

## 6. Control manifest

Configure `ControlManifest.Input.xml` with the properties required by the control.

A representative manifest structure is:

```xml
<?xml version="1.0" encoding="utf-8" ?>
<manifest>
  <control
    namespace="WBSuper.Controls"
    constructor="DataverseAggregate"
    version="1.0.0"
    display-name-key="DataverseAggregate"
    description-key="Reusable Dataverse aggregate display control"
    control-type="standard">

    <property
      name="boundValue"
      display-name-key="Bound Value"
      description-key="Form column used to host the control"
      of-type="SingleLine.Text"
      usage="bound"
      required="true" />

    <property
      name="entityName"
      display-name-key="Entity Name"
      description-key="Logical name of the table to aggregate"
      of-type="SingleLine.Text"
      usage="input"
      required="true" />

    <property
      name="aggregateColumn"
      display-name-key="Aggregate Column"
      description-key="Logical name of the aggregate column"
      of-type="SingleLine.Text"
      usage="input"
      required="true" />

    <property
      name="aggregateType"
      display-name-key="Aggregate Type"
      description-key="count, sum, avg, min or max"
      of-type="SingleLine.Text"
      usage="input"
      required="true" />

    <property
      name="filterXml"
      display-name-key="Filter XML"
      description-key="Optional FetchXML filter"
      of-type="Multiple"
      usage="input"
      required="false" />

    <property
      name="relationshipColumn"
      display-name-key="Relationship Column"
      description-key="Optional lookup to the current form record"
      of-type="SingleLine.Text"
      usage="input"
      required="false" />

    <property
      name="useCurrentRecord"
      display-name-key="Use Current Record"
      description-key="Filter aggregate using the current record ID"
      of-type="TwoOptions"
      usage="input"
      required="false" />

    <property
      name="label"
      display-name-key="Label"
      description-key="Label displayed with the aggregate"
      of-type="SingleLine.Text"
      usage="input"
      required="false" />

    <property
      name="prefix"
      display-name-key="Prefix"
      description-key="Optional value prefix"
      of-type="SingleLine.Text"
      usage="input"
      required="false" />

    <property
      name="suffix"
      display-name-key="Suffix"
      description-key="Optional value suffix"
      of-type="SingleLine.Text"
      usage="input"
      required="false" />

    <property
      name="decimalPlaces"
      display-name-key="Decimal Places"
      description-key="Number of decimal places"
      of-type="Whole.None"
      usage="input"
      required="false" />

    <resources>
      <code path="index.ts" order="1" />
      <css path="css/DataverseAggregate.css" order="1" />
    </resources>

    <feature-usage>
      <uses-feature name="WebAPI" required="true" />
    </feature-usage>
  </control>
</manifest>
```

If the PCF tooling version generated a different manifest schema, retain the generated schema structure and add the properties using the schema supported by that version.

---

## 7. FetchXML generation

Build FetchXML dynamically from the configured properties.

Conceptually:

```typescript
private buildFetchXml(
    entityName: string,
    aggregateColumn: string,
    aggregateType: string,
    filterXml?: string,
    relationshipColumn?: string,
    currentRecordId?: string
): string {

    const relationshipFilter =
        relationshipColumn && currentRecordId
            ? `<condition attribute="${relationshipColumn}"
                 operator="eq"
                 value="${currentRecordId}" />`
            : "";

    return `
      <fetch aggregate="true">
        <entity name="${entityName}">
          <attribute
            name="${aggregateColumn}"
            alias="aggregatevalue"
            aggregate="${aggregateType}" />
          <filter type="and">
            ${filterXml ?? ""}
            ${relationshipFilter}
          </filter>
        </entity>
      </fetch>`;
}
```

### Important security requirement

Do not blindly accept arbitrary strings and inject those values into XML in a production implementation.

The control should:

- allow only known aggregate operations;
- validate logical-name syntax;
- escape values inserted into XML;
- normalise the current record GUID;
- reject malformed configuration; and
- avoid allowing configuration to construct arbitrary unsupported XML structures.

A suitable logical-name validation pattern is approximately:

```regex
^[A-Za-z_][A-Za-z0-9_]*$
```

Allow-list the aggregate operation:

```typescript
const allowedAggregates = ["count", "sum", "avg", "min", "max"];
```

---

## 8. Obtain the current record ID

When `useCurrentRecord` is enabled, retrieve the current row GUID from the PCF context where supported by the selected hosting pattern.

Remove braces before inserting the GUID into FetchXML:

```typescript
const cleanId = recordId.replace(/[{}]/g, "");
```

If the form is in Create mode and the row does not yet have a usable ID, display a neutral value or message such as:

```text
Available after first save
```

Do not execute a relationship-filtered aggregate against an empty GUID.

---

## 9. Execute FetchXML using the PCF Web API

Use `context.webAPI.retrieveMultipleRecords`.

Representative code:

```typescript
const encodedFetchXml = encodeURIComponent(fetchXml);

const result = await context.webAPI.retrieveMultipleRecords(
    entityName,
    `?fetchXml=${encodedFetchXml}`
);
```

The aggregate query should normally return one aggregate row.

Retrieve the alias:

```typescript
const entity = result.entities[0];
const rawValue = entity?.aggregatevalue;
```

Do not retrieve all source rows and calculate the count in JavaScript. The FetchXML query should instruct Dataverse to perform the aggregation server-side.

---

## 10. Core control implementation pattern

A simplified implementation is shown below. Adapt generated type names to the definitions produced by the PCF build process.

```typescript
import { IInputs, IOutputs } from "./generated/ManifestTypes";

export class DataverseAggregate
    implements ComponentFramework.StandardControl<IInputs, IOutputs> {

    private container!: HTMLDivElement;
    private labelElement!: HTMLDivElement;
    private valueElement!: HTMLDivElement;
    private errorElement!: HTMLDivElement;

    private context!: ComponentFramework.Context<IInputs>;
    private requestVersion = 0;

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {
        this.context = context;
        this.container = container;

        this.container.classList.add("dataverse-aggregate");

        this.labelElement = document.createElement("div");
        this.labelElement.classList.add("dataverse-aggregate-label");

        this.valueElement = document.createElement("div");
        this.valueElement.classList.add("dataverse-aggregate-value");
        this.valueElement.setAttribute("aria-live", "polite");

        this.errorElement = document.createElement("div");
        this.errorElement.classList.add("dataverse-aggregate-error");
        this.errorElement.setAttribute("role", "alert");

        this.container.appendChild(this.labelElement);
        this.container.appendChild(this.valueElement);
        this.container.appendChild(this.errorElement);

        void this.refresh();
    }

    public updateView(
        context: ComponentFramework.Context<IInputs>
    ): void {
        this.context = context;
        void this.refresh();
    }

    public getOutputs(): IOutputs {
        // Display-only PCF: do not persist aggregate result.
        return {};
    }

    public destroy(): void {
        // Remove any manually registered event listeners here.
    }

    private async refresh(): Promise<void> {
        const version = ++this.requestVersion;

        try {
            this.errorElement.textContent = "";
            this.valueElement.textContent = "Loading...";

            const entityName =
                this.context.parameters.entityName.raw?.trim() ?? "";

            const aggregateColumn =
                this.context.parameters.aggregateColumn.raw?.trim() ?? "";

            const aggregateType =
                (this.context.parameters.aggregateType.raw?.trim() ?? "")
                    .toLowerCase();

            const label =
                this.context.parameters.label.raw?.trim() ?? "";

            this.labelElement.textContent = label;

            this.validateConfiguration(
                entityName,
                aggregateColumn,
                aggregateType
            );

            const fetchXml = this.buildFetchXml(
                entityName,
                aggregateColumn,
                aggregateType
            );

            const result =
                await this.context.webAPI.retrieveMultipleRecords(
                    entityName,
                    `?fetchXml=${encodeURIComponent(fetchXml)}`
                );

            // Ignore an older request when a newer refresh completed first.
            if (version !== this.requestVersion) {
                return;
            }

            const rawValue = result.entities[0]?.aggregatevalue ?? 0;
            const numericValue = Number(rawValue);

            if (!Number.isFinite(numericValue)) {
                throw new Error("Dataverse returned a non-numeric aggregate value.");
            }

            this.valueElement.textContent =
                this.formatValue(numericValue);
        }
        catch (error) {
            if (version !== this.requestVersion) {
                return;
            }

            this.valueElement.textContent = "-";
            this.errorElement.textContent =
                error instanceof Error
                    ? error.message
                    : "Unable to load aggregate value.";
        }
    }

    private validateConfiguration(
        entityName: string,
        aggregateColumn: string,
        aggregateType: string
    ): void {
        const logicalNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
        const allowedAggregates = ["count", "sum", "avg", "min", "max"];

        if (!logicalNamePattern.test(entityName)) {
            throw new Error("Invalid Dataverse table logical name.");
        }

        if (!logicalNamePattern.test(aggregateColumn)) {
            throw new Error("Invalid aggregate column logical name.");
        }

        if (!allowedAggregates.includes(aggregateType)) {
            throw new Error("Aggregate must be count, sum, avg, min or max.");
        }
    }

    private buildFetchXml(
        entityName: string,
        aggregateColumn: string,
        aggregateType: string
    ): string {
        const configuredFilter =
            this.context.parameters.filterXml.raw ?? "";

        return `
          <fetch aggregate="true">
            <entity name="${entityName}">
              <attribute
                name="${aggregateColumn}"
                alias="aggregatevalue"
                aggregate="${aggregateType}" />
              <filter type="and">
                ${configuredFilter}
              </filter>
            </entity>
          </fetch>`;
    }

    private formatValue(value: number): string {
        const prefix = this.context.parameters.prefix.raw ?? "";
        const suffix = this.context.parameters.suffix.raw ?? "";
        const requestedPlaces =
            Number(this.context.parameters.decimalPlaces.raw ?? 0);

        const decimalPlaces = Math.min(
            10,
            Math.max(0, Number.isFinite(requestedPlaces) ? requestedPlaces : 0)
        );

        const formatted = new Intl.NumberFormat(undefined, {
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces
        }).format(value);

        return `${prefix}${formatted}${suffix}`;
    }
}
```

This is an implementation pattern rather than a complete copy-and-build control because current-record retrieval, manifest generated types and optional filter parsing depend on the PCF version and chosen form-hosting pattern.

---

## 11. Styling

Create `css/DataverseAggregate.css`.

Example:

```css
.dataverse-aggregate {
    box-sizing: border-box;
    width: 100%;
    padding: 8px 0;
    font-family: "Segoe UI", sans-serif;
}

.dataverse-aggregate-label {
    font-size: 12px;
    color: #605e5c;
    margin-bottom: 2px;
}

.dataverse-aggregate-value {
    font-size: 24px;
    font-weight: 600;
    color: #242424;
    line-height: 1.2;
}

.dataverse-aggregate-error {
    margin-top: 4px;
    color: #a4262c;
    font-size: 12px;
}
```

Keep styling consistent with the model-driven app rather than turning a single metric into an unrelated dashboard design.

---

## 12. Status filtering

For a normal Dataverse active/inactive table, an Active record commonly uses `statecode = 0`, but configuration should use the actual table metadata and business requirement rather than assuming every custom status model is identical.

Example filter:

```xml
<condition attribute="statecode" operator="eq" value="0" />
```

For `statuscode`, use the appropriate Status Reason numeric value for that table.

If the requirement is based on a business status column rather than Dataverse record state, query that specific column instead.

---

## 13. Filtering against the current form record

A common requirement is:

> Count active child rows belonging to the current SMSF.

Generate a condition similar to:

```xml
<condition
  attribute="wbsuper_smsf"
  operator="eq"
  value="CURRENT_RECORD_GUID" />
```

Combined example:

```xml
<fetch aggregate="true">
  <entity name="wbsuper_atosmartdocstask">
    <attribute
      name="wbsuper_atosmartdocstaskid"
      alias="aggregatevalue"
      aggregate="count" />
    <filter type="and">
      <condition attribute="statecode" operator="eq" value="0" />
      <condition
        attribute="wbsuper_smsf"
        operator="eq"
        value="CURRENT_RECORD_GUID" />
    </filter>
  </entity>
</fetch>
```

Expected display:

```text
Active ATO SmartDocs Tasks
7
```

---

## 14. COUNT variants

FetchXML supports different count semantics. Choose deliberately when extending the component.

Typical requirements include:

- count rows;
- count non-null values; and
- count distinct values.

For a normal row count, counting the table's primary ID is straightforward because the ID is populated for every row.

When distinct counts are required, expose a separate property rather than hiding the behaviour behind the normal `count` setting.

---

## 15. SUM, AVG, MIN and MAX

The same PCF can support other aggregate operations.

Example sum:

```xml
<fetch aggregate="true">
  <entity name="wbsuper_example">
    <attribute
      name="wbsuper_amount"
      alias="aggregatevalue"
      aggregate="sum" />
  </entity>
</fetch>
```

Example configuration:

```text
Label:             Total Amount
Entity:            wbsuper_example
Aggregate column:  wbsuper_amount
Aggregate type:    sum
Prefix:            $
Decimal places:    2
```

Consider Dataverse currency behaviour carefully if aggregating Money fields, particularly when records can use different transaction currencies. Decide whether the business metric should represent transaction currency or base currency.

---

## 16. Refresh behaviour

A PCF aggregate represents data at the time the query executes.

Refresh the value when:

- the form/control initially loads;
- the control is refreshed by the framework because relevant context changed; or
- an explicit refresh capability is provided.

Do not continuously poll Dataverse.

If users create or modify child rows in another control or dialog while the parent form remains open, the aggregate does not magically know about those changes. Provide a controlled refresh mechanism if same-session freshness matters.

Be careful with `updateView()`: it can execute frequently. Avoid issuing duplicate queries for every framework update. In a production implementation, cache a request signature made from values that affect the query and requery only when the signature changes or a refresh is requested.

---

## 17. Prevent unnecessary API calls

Construct a signature such as:

```text
entityName
+ aggregateColumn
+ aggregateType
+ filterXml
+ relationshipColumn
+ currentRecordId
```

Store the last executed signature.

Only requery when:

```text
newSignature != previousSignature
```

Also protect against race conditions where an older Web API call finishes after a newer one. The sample `requestVersion` pattern demonstrates one solution.

---

## 18. Loading, empty and error states

The component should have explicit states.

### Loading

```text
Active Tasks
Loading...
```

### Successful zero

```text
Active Tasks
0
```

Zero is a valid result and must not be treated as missing data.

### Configuration error

```text
Active Tasks
-
Invalid Dataverse table logical name.
```

### Query error

Provide a concise message to the user and record useful technical diagnostics where appropriate. Do not expose access tokens, internal secrets or unnecessary sensitive data.

---

## 19. Security model

The PCF uses the current user's Dataverse access.

Therefore, the aggregate result should only include records that Dataverse allows the current user to read under the applicable security model.

Do not attempt to bypass Dataverse security in the PCF.

If different users see different counts, examine:

- Dataverse security roles;
- business unit access depth;
- owning teams;
- access teams;
- record sharing;
- hierarchy security if enabled; and
- field security for aggregated columns where relevant.

This is normally desirable because the number displayed on the form respects the same Dataverse security model as the underlying records.

---

## 20. Performance guidance

Use aggregate FetchXML instead of retrieving all matching records.

Good:

```text
Dataverse -> COUNT -> return one aggregate result
```

Avoid:

```text
Dataverse -> retrieve 2,000 rows -> JavaScript loops through rows -> count
```

Keep filters selective where practical, particularly on large operational tables.

For relationship-based counts, the child lookup used to constrain the query should be part of a normal, well-designed Dataverse relationship. Test the query against realistic production-scale volumes.

Avoid placing a large number of independently querying PCFs on the same form. If a form needs many metrics, consider one summary PCF that executes a deliberately designed set of queries, or a Custom Page for a richer KPI surface.

---

## 21. Accessibility

The result should not depend on colour alone.

Use:

```html
aria-live="polite"
```

for a dynamically refreshed value where appropriate.

Use real text for labels and errors. Maintain sufficient contrast and avoid tiny fonts.

If the value becomes clickable in a later version, implement it as a keyboard-accessible button or link rather than a clickable `<div>`.

---

## 22. Optional drill-through enhancement

A useful future feature is allowing the user to select the aggregate and open the matching Dataverse rows.

Example:

```text
Active Tasks   7
               ^
               click
               |
               v
Filtered list of the seven active tasks
```

Implement navigation using supported model-driven app/PCF navigation APIs rather than constructing unsupported application URLs.

Ensure the drill-through filter uses the same conditions as the aggregate query, otherwise the displayed count and opened rows can disagree.

---

## 23. Solution packaging

Create a solution project and reference the PCF project using the supported Power Platform CLI project workflow used by the current toolchain.

A typical project structure is:

```text
DataverseAggregate/
    DataverseAggregate.pcfproj
    ControlManifest.Input.xml
    index.ts
    css/
        DataverseAggregate.css

DataverseAggregateSolution/
    DataverseAggregateSolution.cdsproj
```

Build the control:

```bash
npm run build
```

Use the current Power Platform CLI/solution project commands adopted by the organisation to add the PCF to a solution, build the solution package and import it into the development environment.

Do not hard-code environment URLs or environment-specific GUIDs inside the component.

---

## 24. Add the control to a model-driven form

After importing the solution containing the PCF:

1. Open the target table in the Power Apps maker portal.
2. Open the main form.
3. Add/select a suitable text column to host the field PCF.
4. Configure the component/control for that field using the modern form designer capabilities available in the environment.
5. Set the control's input properties.
6. Save and publish the form.
7. Open an actual record and verify the aggregate.

Example configuration:

```text
entityName:          wbsuper_atosmartdocstask
aggregateColumn:     wbsuper_atosmartdocstaskid
aggregateType:       count
label:               Active ATO SmartDocs Tasks
filterXml:           <condition attribute="statecode" operator="eq" value="0" />
relationshipColumn:  wbsuper_smsf
useCurrentRecord:    true
prefix:              [blank]
suffix:              [blank]
decimalPlaces:       0
```

---

## 25. Testing plan

### Functional tests

- Count returns `0` when there are no matching rows.
- Count returns the correct value with one matching row.
- Count returns the correct value with multiple matching rows.
- Inactive rows are excluded when filtering for Active.
- Unrelated rows are excluded when current-record filtering is enabled.
- Changing the current form record changes the result appropriately.
- SUM/AVG/MIN/MAX produce expected numeric results when enabled.

### Security tests

Test with at least:

- an administrator;
- a Manager role;
- a Preparer role;
- a Reviewer role; and
- any role that intentionally has restricted access to the underlying records.

Confirm the aggregate respects Dataverse record visibility.

### Error tests

- Invalid entity logical name.
- Invalid column logical name.
- Unsupported aggregate type.
- Malformed filter configuration.
- Missing relationship column.
- Unsaved current record.
- User lacks Read access.
- Network/API error.

### Performance tests

Test with realistic row volumes and with all aggregate controls that will appear simultaneously on the final form.

---

## 26. Production hardening

Before production deployment:

- validate all configuration properties;
- XML-escape dynamic values;
- allow-list aggregate functions;
- avoid arbitrary unsafe FetchXML injection;
- prevent redundant API requests;
- handle async race conditions;
- display loading and failure states;
- keep the control display-only unless persistence is explicitly required;
- test under actual application security roles;
- test against representative data volumes;
- include the PCF in managed downstream solutions where required by ALM policy; and
- version the PCF assembly/component deliberately for upgrades.

---

## 27. Recommended first release

Keep version 1 deliberately small.

### Version 1

Support:

- count;
- static FetchXML conditions;
- optional current-record relationship filter;
- label;
- prefix/suffix;
- numeric formatting;
- loading/error state; and
- server-side Dataverse Web API execution.

### Version 2

Consider adding:

- `sum`, `avg`, `min`, `max` if these are not included initially;
- distinct count;
- configurable refresh button;
- drill-through to matching rows;
- configurable icon/colour thresholds;
- multiple metrics in one PCF; and
- richer formatting for currency and percentages.

Do not add these features until there is a concrete application requirement. A small reusable control is simpler to support than a generic reporting engine embedded in every form.

---

## 28. When not to use `DataverseAggregate`

Use another approach when the requirement changes substantially.

| Requirement | Better option |
|---|---|
| Single live count/sum on a form | `DataverseAggregate` PCF |
| Several closely related small counters | Multi-metric PCF |
| Rich KPI/summary experience | Custom Page |
| Analytical trends and visualisations | Power BI |
| Aggregate must be stored in Dataverse | Plug-in-maintained column or suitable Dataverse capability |
| Simple relationship rollup where asynchronous calculation is acceptable | Dataverse rollup column |

---

## 29. Implementation checklist

- [ ] Define the first metric to implement.
- [ ] Confirm target table logical name.
- [ ] Confirm aggregate column logical name.
- [ ] Confirm aggregate operation.
- [ ] Confirm filter conditions.
- [ ] Confirm whether the query is scoped to the current form row.
- [ ] Confirm the relationship lookup logical name.
- [ ] Install/verify Node.js, npm and Power Platform CLI.
- [ ] Initialise `DataverseAggregate` PCF project.
- [ ] Add manifest properties.
- [ ] Declare Web API feature usage.
- [ ] Implement configuration validation.
- [ ] Implement FetchXML generation.
- [ ] Implement current-record filtering.
- [ ] Execute aggregate using `context.webAPI.retrieveMultipleRecords`.
- [ ] Handle zero, loading and error states.
- [ ] Prevent duplicate queries from frequent `updateView` calls.
- [ ] Add accessible styling.
- [ ] Build the PCF.
- [ ] Package into a Dataverse solution.
- [ ] Import into development.
- [ ] Configure the PCF on the target model-driven form.
- [ ] Test security roles.
- [ ] Test realistic row volumes.
- [ ] Promote through the normal ALM pipeline.

---

## 30. Example finished configuration

For a form displaying the number of active ATO SmartDocs tasks belonging to the current SMSF:

```text
Control:             DataverseAggregate
Label:               Active ATO SmartDocs Tasks
Entity:              wbsuper_atosmartdocstask
Aggregate column:    wbsuper_atosmartdocstaskid
Aggregate:           count
Relationship:        wbsuper_smsf
Current record:      true
Filter:              statecode = Active
Decimal places:      0
```

The user sees a simple value such as:

```text
Active ATO SmartDocs Tasks
7
```

The value is not copied into another Dataverse column. The PCF queries Dataverse when required and Dataverse performs the aggregate calculation on the server.
