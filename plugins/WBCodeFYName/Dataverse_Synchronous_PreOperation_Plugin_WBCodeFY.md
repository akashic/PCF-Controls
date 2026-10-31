# Dataverse Synchronous PreOperation Plug-in for WBCodeFY

## 1. Purpose

This document provides complete implementation instructions for creating a synchronous **PreOperation Dataverse plug-in** that generates the `WBCodeFY` Primary Name value when a record is saved.

The target table contains these columns:

| Display name | Logical name | Type | Purpose |
|---|---|---|---|
| WBCodeFY | `wbsuper_wbcodefy` | Single Line of Text, Primary Name | Generated display identifier |
| WBCode | `wbsuper_wbcode` | Lookup | References the WBCode record |
| FY | `wbsuper_fy` | Lookup | References the financial year record |

Example:

| WBCode lookup display value | FY lookup display value | Generated WBCodeFY |
|---|---|---|
| `00224570` | `FY26` | `00224570-26` |
| `00145570` | `FY25` | `00145570-25` |

The generated value must conform to:

```regex
^\d{6}70-2\d$
```

The plug-in runs at the Dataverse table/server level. It therefore applies consistently to records created or updated through model-driven apps, Power Automate, imports, integrations, custom connectors, and the Dataverse Web API.

---

## 2. Why use a synchronous PreOperation plug-in

A Business Rule is not sufficient for this requirement because:

- `WBCode` and `FY` are lookup columns.
- The referenced lookup records must be resolved to obtain their text values.
- The `FY` prefix must be removed from a value such as `FY26`.
- The two values must be validated and concatenated.
- The target is the normal text-based Primary Name column, not a formula column.

A synchronous PreOperation plug-in is appropriate because it:

- runs on the Dataverse server;
- executes before the row is written;
- can retrieve the referenced lookup records;
- can validate the source values;
- can set `wbsuper_wbcodefy` on the incoming target row;
- participates in the same database transaction;
- can reject an invalid save with a clear error message; and
- does not require a second Dataverse Update operation.

---

## 3. Design decisions

### 3.1 Generate rather than validate manually entered WBCodeFY

The plug-in should treat `wbsuper_wbcodefy` as a system-generated value. It should derive the value from the two lookup records rather than trusting a value supplied by a form, flow, import, or API.

### 3.2 Validate the source values

Validate the lookup display values separately:

```regex
WBCode: ^\d{6}70$
FY:     ^FY2\d$
```

The result is then constructed as:

```text
WBCode + "-" + FY without the "FY" prefix
```

Example:

```text
WBCode = 00224570
FY     = FY26
Result = 00224570-26
```

### 3.3 Enforce uniqueness separately

If each WBCode and FY combination must be unique, create a Dataverse alternate key using the two lookup columns:

- `wbsuper_wbcode`
- `wbsuper_fy`

A composite alternate key on the source lookup columns is preferable to relying only on the generated text. It directly prevents duplicate WBCode and FY combinations.

An alternate key on `wbsuper_wbcodefy` may also be used if external integrations need to identify records by the generated identifier.

---

## 4. Information to confirm before compiling

The screenshots confirm the logical names of the three columns on the target table, but the following values must be confirmed in the solution before compiling:

1. The logical name of the target Dataverse table.
2. The logical name of the Primary Name or WBCode value column on the table referenced by `wbsuper_wbcode`.
3. The logical name of the Primary Name or FY value column on the table referenced by `wbsuper_fy`.

Replace the placeholders in the sample code:

```csharp
TARGET_TABLE_LOGICAL_NAME
WBCODE_VALUE_COLUMN_LOGICAL_NAME
FY_VALUE_COLUMN_LOGICAL_NAME
```

Do not use display names in the C# constants. Use Dataverse logical names.

---

## 5. Create the plug-in project

### 5.1 Prerequisites

Install or obtain:

- Visual Studio 2022;
- .NET Framework supported by the target Dataverse environment and plug-in tooling;
- the Microsoft Dataverse SDK assemblies or the appropriate NuGet package containing `Microsoft.Xrm.Sdk`;
- Power Platform Tools for Visual Studio, or the Plug-in Registration Tool;
- access to a Dataverse development environment; and
- a solution containing the target table and columns.

### 5.2 Project creation

1. Open Visual Studio.
2. Create a **Class Library** project using the .NET Framework required by the Dataverse plug-in deployment approach.
3. Name the project, for example:

   ```text
   WBSuper.Dataverse.Plugins
   ```

4. Add the Dataverse SDK dependency containing:

   ```csharp
   Microsoft.Xrm.Sdk
   Microsoft.Xrm.Sdk.Query
   ```

5. Create a class named:

   ```text
   SetWBCodeFY.cs
   ```

6. Implement `Microsoft.Xrm.Sdk.IPlugin`.

7. Sign the assembly if required by the selected registration and deployment process.

---

## 6. Plug-in code

Replace the table and referenced value-column placeholders before compiling.

```csharp
using System;
using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace WBSuper.Dataverse.Plugins
{
    public sealed class SetWBCodeFY : IPlugin
    {
        private const string TargetTable = "TARGET_TABLE_LOGICAL_NAME";

        private const string WBCodeLookup = "wbsuper_wbcode";
        private const string FYLookup = "wbsuper_fy";
        private const string WBCodeFYColumn = "wbsuper_wbcodefy";

        // Replace these with the logical names of the value columns
        // on the tables referenced by the lookup columns.
        private const string WBCodeValueColumn =
            "WBCODE_VALUE_COLUMN_LOGICAL_NAME";

        private const string FYValueColumn =
            "FY_VALUE_COLUMN_LOGICAL_NAME";

        private const string PreImageName = "PreImage";

        private static readonly Regex WBCodePattern =
            new Regex(@"^\d{6}70$", RegexOptions.CultureInvariant);

        private static readonly Regex FYPattern =
            new Regex(
                @"^FY2\d$",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        public void Execute(IServiceProvider serviceProvider)
        {
            var tracingService =
                (ITracingService)serviceProvider.GetService(
                    typeof(ITracingService));

            var context =
                (IPluginExecutionContext)serviceProvider.GetService(
                    typeof(IPluginExecutionContext));

            var serviceFactory =
                (IOrganizationServiceFactory)serviceProvider.GetService(
                    typeof(IOrganizationServiceFactory));

            var service = serviceFactory.CreateOrganizationService(
                context.UserId);

            try
            {
                if (!string.Equals(
                        context.PrimaryEntityName,
                        TargetTable,
                        StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }

                if (!context.InputParameters.Contains("Target") ||
                    !(context.InputParameters["Target"] is Entity target))
                {
                    return;
                }

                if (!string.Equals(
                        context.MessageName,
                        "Create",
                        StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(
                        context.MessageName,
                        "Update",
                        StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }

                EntityReference wbCodeReference = GetLookup(
                    target,
                    context,
                    WBCodeLookup);

                EntityReference fyReference = GetLookup(
                    target,
                    context,
                    FYLookup);

                if (wbCodeReference == null)
                {
                    throw new InvalidPluginExecutionException(
                        "WBCode must be populated before the record can be saved.");
                }

                if (fyReference == null)
                {
                    throw new InvalidPluginExecutionException(
                        "FY must be populated before the record can be saved.");
                }

                Entity wbCodeRecord = service.Retrieve(
                    wbCodeReference.LogicalName,
                    wbCodeReference.Id,
                    new ColumnSet(WBCodeValueColumn));

                Entity fyRecord = service.Retrieve(
                    fyReference.LogicalName,
                    fyReference.Id,
                    new ColumnSet(FYValueColumn));

                string wbCode = wbCodeRecord
                    .GetAttributeValue<string>(WBCodeValueColumn)
                    ?.Trim();

                string fy = fyRecord
                    .GetAttributeValue<string>(FYValueColumn)
                    ?.Trim();

                ValidateWBCode(wbCode);
                ValidateFY(fy);

                string fySuffix = fy.Substring(2);
                string generatedValue = $"{wbCode}-{fySuffix}";

                if (!Regex.IsMatch(
                        generatedValue,
                        @"^\d{6}70-2\d$",
                        RegexOptions.CultureInvariant))
                {
                    throw new InvalidPluginExecutionException(
                        "The generated WBCodeFY value is invalid. " +
                        "Expected a value such as 00224570-26.");
                }

                tracingService.Trace(
                    "Setting {0} to {1}.",
                    WBCodeFYColumn,
                    generatedValue);

                // PreOperation permits changing Target directly. Do not call
                // service.Update for this row from this plug-in.
                target[WBCodeFYColumn] = generatedValue;
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                tracingService.Trace(
                    "SetWBCodeFY failed: {0}",
                    ex.ToString());

                throw new InvalidPluginExecutionException(
                    "WBCodeFY could not be generated. " +
                    "Review the WBCode and FY selections, then try again.",
                    ex);
            }
        }

        private static EntityReference GetLookup(
            Entity target,
            IPluginExecutionContext context,
            string columnName)
        {
            // When the column is included in Target, use its incoming value.
            // A deliberately cleared lookup will return null here.
            if (target.Attributes.Contains(columnName))
            {
                return target.GetAttributeValue<EntityReference>(columnName);
            }

            // On Update, use the existing lookup from the registered Pre Image.
            if (context.PreEntityImages.Contains(PreImageName))
            {
                return context.PreEntityImages[PreImageName]
                    .GetAttributeValue<EntityReference>(columnName);
            }

            return null;
        }

        private static void ValidateWBCode(string wbCode)
        {
            if (string.IsNullOrWhiteSpace(wbCode))
            {
                throw new InvalidPluginExecutionException(
                    "The selected WBCode record does not contain a WBCode value.");
            }

            if (!WBCodePattern.IsMatch(wbCode))
            {
                throw new InvalidPluginExecutionException(
                    "WBCode must contain eight digits and end in 70, " +
                    "for example 00224570.");
            }
        }

        private static void ValidateFY(string fy)
        {
            if (string.IsNullOrWhiteSpace(fy))
            {
                throw new InvalidPluginExecutionException(
                    "The selected FY record does not contain an FY value.");
            }

            if (!FYPattern.IsMatch(fy))
            {
                throw new InvalidPluginExecutionException(
                    "FY must use the format FY2n, for example FY26.");
            }
        }
    }
}
```

---

## 7. Why no depth check is required

A common plug-in example uses:

```csharp
if (context.Depth > 1) return;
```

That guard is not required here because the plug-in changes the incoming `Target` during PreOperation and does not call `service.Update` on the same row. No second Update message is deliberately generated.

A blanket depth check can suppress valid operations when another legitimate automation initiates the save. Add a recursion guard only if later changes introduce an explicit update that can cause the plug-in to invoke itself.

---

## 8. Build the assembly

1. Replace all placeholders with actual logical names.
2. Build the solution in **Release** configuration.
3. Confirm the DLL is generated in the project's Release output folder.
4. Retain the matching symbol file if required by the team's debugging process.
5. Record the assembly version in the deployment notes.

---

## 9. Register the plug-in assembly

Using the Plug-in Registration Tool or the organisation's approved Power Platform deployment tooling:

1. Connect to the Dataverse development environment.
2. Register a new assembly.
3. Select the compiled DLL.
4. Use sandbox isolation for Dataverse Online.
5. Register the class:

   ```text
   WBSuper.Dataverse.Plugins.SetWBCodeFY
   ```

6. Register the Create and Update steps described below.

---

## 10. Register the Create step

| Setting | Value |
|---|---|
| Message | `Create` |
| Primary entity | Target table logical name |
| Stage | `PreOperation` |
| Execution mode | `Synchronous` |
| Deployment | Server |
| Execution order | `20`, unless solution sequencing requires another value |
| Filtering attributes | Not applicable on Create |
| Pre Image | Not required |

The Create operation should fail if either lookup is missing, because both source values are required to construct the Primary Name.

If the business process permits temporarily incomplete rows, adjust the plug-in to return without setting the name when one lookup is missing. That design is not recommended when `WBCodeFY` is intended to be the stable business identifier.

---

## 11. Register the Update step

| Setting | Value |
|---|---|
| Message | `Update` |
| Primary entity | Target table logical name |
| Stage | `PreOperation` |
| Execution mode | `Synchronous` |
| Deployment | Server |
| Execution order | `20`, unless solution sequencing requires another value |
| Filtering attributes | `wbsuper_wbcode,wbsuper_fy` |
| Pre Image name | `PreImage` |
| Pre Image alias | `PreImage` |
| Pre Image columns | `wbsuper_wbcode,wbsuper_fy` |

Filtering attributes ensure the Update step runs when either source lookup is included in the update request.

The Pre Image is necessary because an Update target normally contains only the columns included in that specific operation. For example, when FY changes, the incoming target may not contain WBCode. The Pre Image supplies the unchanged lookup.

The image name is case-sensitive in the sample code and must be registered as:

```text
PreImage
```

---

## 12. Security context

The plug-in retrieves the two referenced lookup records using:

```csharp
serviceFactory.CreateOrganizationService(context.UserId)
```

This means retrieval occurs in the calling user's context. The user must have sufficient Read privilege for the referenced WBCode and FY records.

If every permitted user should be able to save a target row but may not have direct Read access to the referenced tables, consider registering the step to run in a designated owner context. Review that choice carefully because elevated execution can expose data or bypass intended security boundaries.

For this application, the preferred approach is normally to give relevant application roles Read access to the WBCode and FY reference tables and retain user-context execution.

---

## 13. Form behaviour

Table-level enforcement is provided by the plug-in. Form configuration is not the enforcement mechanism.

For usability, configure `wbsuper_wbcodefy` as read-only on application forms so users understand that the value is generated. This does not protect the field from API or integration writes, but the plug-in overwrites the incoming value whenever either source lookup is processed.

Ensure the Primary Name column has a sufficient maximum length. The example format requires 11 characters:

```text
00224570-26
```

---

## 14. Alternate key configuration

### Recommended key

Create a composite alternate key containing:

```text
wbsuper_wbcode
wbsuper_fy
```

This directly enforces one record per WBCode and FY combination.

### Optional generated identifier key

If integrations need to address a record through `WBCodeFY`, create an additional alternate key on:

```text
wbsuper_wbcodefy
```

Before activating either key:

1. identify existing duplicates;
2. correct duplicate source combinations;
3. verify that no generated value is blank;
4. activate the key; and
5. confirm the key status changes to Active.

Key activation can fail when existing data violates uniqueness.

---

## 15. Testing plan

Test in a non-production Dataverse environment.

### 15.1 Create tests

| Test | WBCode | FY | Expected result |
|---|---|---|---|
| Valid Create | `00224570` | `FY26` | Save succeeds and `WBCodeFY` becomes `00224570-26` |
| Missing WBCode | blank | `FY26` | Save is rejected |
| Missing FY | `00224570` | blank | Save is rejected |
| Invalid WBCode suffix | `00224571` | `FY26` | Save is rejected |
| Invalid WBCode length | `224570` | `FY26` | Save is rejected |
| Invalid FY prefix | `2026` | `FY26` is not the selected value | Save is rejected if the referenced FY value is invalid |
| Invalid FY year | `00224570` | `FY30` | Save is rejected under the current `FY2n` rule |

### 15.2 Update tests

1. Change only `wbsuper_fy` and verify the existing WBCode comes from the Pre Image.
2. Change only `wbsuper_wbcode` and verify the existing FY comes from the Pre Image.
3. Change both lookups in one operation.
4. Clear either lookup and confirm the save is rejected.
5. Attempt to directly edit `wbsuper_wbcodefy` without changing either lookup. Decide whether this must be prevented separately, as described below.

### 15.3 Channel tests

Test at least:

- model-driven app Create and Update;
- Power Automate Dataverse Add a new row;
- Power Automate Dataverse Update a row;
- data import;
- Dataverse Web API, if used by integrations; and
- any planned custom connector or BGL/SF360 integration path.

### 15.4 Duplicate tests

1. Create a row using a valid WBCode and FY combination.
2. Attempt to create another row with the same combination.
3. Confirm the composite alternate key prevents the duplicate.

---

## 16. Optional hardening against direct WBCodeFY edits

The Update step is filtered to `wbsuper_wbcode,wbsuper_fy`. Therefore, an API operation that changes only `wbsuper_wbcodefy` will not trigger that step.

Choose one of these approaches:

### Option A: field security and application design

- Make `wbsuper_wbcodefy` read-only on all forms.
- Do not give integrations a reason to write it.
- Use application security and integration contracts to prevent direct changes.

### Option B: register a second validation step

Register another synchronous PreOperation Update step filtered to:

```text
wbsuper_wbcodefy
```

The additional step can reject direct changes or recompute the value from the lookups. If recomputing, provide both lookups in a Pre Image.

### Option C: remove filtering attributes

Run the main Update step on every update. This provides the strongest regeneration behaviour but causes additional lookup retrievals for changes unrelated to WBCode or FY. It may be acceptable for a low-volume table but is unnecessary overhead for a high-volume table.

The recommended balance is Option B when write protection must apply to all channels.

---

## 17. Tracing and diagnostics

Enable Plug-in Trace Log in the development and test environments while testing.

The sample code uses `ITracingService` to record:

- the generated value; and
- the full exception detail for unexpected failures.

Do not include confidential client data, TFNs, dates of birth, secrets, tokens, or unnecessary financial information in tracing messages.

After testing:

- retain an appropriate trace setting for production support;
- monitor failures after deployment; and
- document the correlation ID and operation details when investigating faults.

---

## 18. Deployment through solutions

1. Add required table and column components to a Dataverse solution.
2. Include the plug-in assembly and registered steps in the solution.
3. Include the Pre Image configuration.
4. Include the alternate key definitions.
5. Include form changes making `WBCodeFY` read-only.
6. Export as managed for controlled downstream environments where that is the organisation's ALM standard.
7. Deploy through the approved development, test, and production pipeline.
8. Confirm environment-specific connection or configuration values are not hard-coded.
9. Run post-deployment smoke tests.

---

## 19. Operational considerations

### Lookup record changes

This plug-in regenerates `WBCodeFY` when the lookup selections change. It does not automatically update existing target rows if the text value stored on a referenced WBCode or FY record is later renamed.

If referenced values can change, decide whether to:

- prohibit renaming after use;
- run a controlled recalculation job after a rename; or
- register additional automation on the referenced tables to update dependent records.

For stable reference data such as financial years and integration codes, preventing changes after use is usually the safest approach.

### Bulk operations

Every processed row requires retrieval of two referenced records. For bulk imports, assess throughput and Dataverse service-protection limits. Keep the plug-in synchronous because the Primary Name must be valid before the transaction completes, but test realistic import volumes before production deployment.

### Error messages

Keep user-facing errors direct and actionable. The plug-in should identify whether the problem is:

- a missing WBCode;
- a missing FY;
- an invalid WBCode value;
- an invalid FY value; or
- an unexpected system failure.

---

## 20. Implementation checklist

- [ ] Confirm the target table logical name.
- [ ] Confirm the WBCode referenced value-column logical name.
- [ ] Confirm the FY referenced value-column logical name.
- [ ] Replace all code placeholders.
- [ ] Confirm `wbsuper_wbcodefy` is at least 11 characters long.
- [ ] Create and build the plug-in assembly.
- [ ] Register the assembly in the development environment.
- [ ] Register synchronous PreOperation Create step.
- [ ] Register synchronous PreOperation Update step.
- [ ] Add the `PreImage` Pre Image to the Update step.
- [ ] Set Update filtering attributes to `wbsuper_wbcode,wbsuper_fy`.
- [ ] Make `wbsuper_wbcodefy` read-only on forms.
- [ ] Create the composite alternate key on WBCode and FY.
- [ ] Decide whether direct edits to `wbsuper_wbcodefy` must be blocked by a second step.
- [ ] Enable tracing in development/test.
- [ ] Complete Create, Update, API, flow, import, and duplicate tests.
- [ ] Add components to the deployment solution.
- [ ] Deploy through the approved ALM pipeline.
- [ ] Complete production smoke testing.

---

## 21. Expected final behaviour

When a record is saved with:

```text
WBCode lookup display value = 00224570
FY lookup display value     = FY26
```

Dataverse writes:

```text
WBCodeFY = 00224570-26
```

If either referenced value does not conform to the required format, the synchronous transaction is rejected and no invalid target record is saved.
