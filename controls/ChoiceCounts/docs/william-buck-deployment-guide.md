# ChoiceCounts: deploying and configuring it in William Buck environments

How to deploy the ChoiceCounts control to William Buck's dev, UAT and prod environments, and set it up on the **SMSF Matter** form. The result:
- the form shows how many of the matter's tasks are **Red** and **Amber**, ignoring Green;
- selecting a count opens the **Tasks** tab, filtered to that colour.

This was built and tested in `LowCode`, the development environment. The setup there is described in [docs/testing/choicecounts-test-environment.md](../../../docs/testing/choicecounts-test-environment.md), and the platform findings are in [decisions.md](decisions.md).

Do each environment in order: dev, then UAT, then prod. Finish the checks in §7 before moving on.

> **Where things live.** The control's solution, `WBChoiceCounts`, holds **only the control**. Everything that changes William Buck's tables belongs to the **project's solution**. That includes the host column, the views, the Tasks tab, the form script and the control's settings on the form. This keeps the control reusable ([ADR-0001](../../../docs/adr/0001-one-solution-per-control.md)).

## 1. What you need

| Item | Detail |
|---|---|
| Release | A GitHub Release `ChoiceCounts-v<x.y.z>` from this repo. Download **`WBChoiceCounts_managed.zip`**. William Buck environments only ever get the managed solution. If there's no release yet, ask for one (see the README's [Versioning and releases](../../../README.md#versioning-and-releases)) |
| Access | System Customizer or System Administrator in the target environment, to import solutions and edit forms |
| Tools | The maker portal (make.powerapps.com). To import from the command line, also `pac` 2.14.1, signed in with `pac auth create --environment <url>` |
| Names | The logical names in William Buck's environment, collected in §2 |

## 2. Collect William Buck's names and values

The control has no names built in, so collect these from the maker portal first. The `LowCode` names are shown as examples only.

| What | Where to find it | LowCode example | William Buck value |
|---|---|---|---|
| Task table | Tables → the tasks table → Properties → **Logical name** | `wbsuper_smsftask` | |
| RAG column on the task table | That table → Columns → the RAG column → Advanced → **Logical name** | `wbsuper_ragstatus` | |
| Lookup from task to SMSF Matter | That table → Columns → the SMSF Matter lookup → **Logical name** | `wbsuper_smsfmatter` | |
| **Red** option value | Choices → the global RAG choice → Red → **Value** | `512340000` | |
| **Amber** option value | Same → Amber → **Value** | `512340001` | |
| SMSF Matter primary key | Tables → SMSF Matter → Columns → the column of type "Unique identifier" that's the primary key | `wbsuper_smsfmatterid` | |

Logical names are lower case, with the publisher prefix and an underscore.

## 3. Prepare the project's solution

Make these changes in the **project's** solution, in dev, then promote them with that solution as usual.

1. **Host column on SMSF Matter.** Add a column to place the control on, for example **"Task RAG"** (Single line of text, length 100).
   - The control never writes to it, and it stays empty.
   - A dedicated column keeps the control from hiding a real field.
2. **Colour views on the task table.** Create two public views, "Red tasks" and "Amber tasks", for the drill-through.
   - Filter on **Status equals Active** and **RAG equals Red** (or Amber).
   - Use the same columns as the main tasks view.
   - The exact names matter: the form script finds the views by name.
3. **Tasks tab on the SMSF Matter main form.**
   1. Add a tab named, for example, `tab_tasks`, labelled "Tasks".
   2. Add a subgrid named, for example, `tasks_subgrid`, with these settings:
      - Show related records: **on**, using the task to SMSF Matter relationship.
      - Default view: your active tasks view.
      - **View selector: "Show selected views"**, with the default view, "Red tasks" and "Amber tasks" ticked. Drill-through needs the view selector: it can't switch the view without it.
4. **Read privilege.** Every security role that opens SMSF Matter needs **Read** on the task table. Without it, the counts show "—" for that user.

## 4. Import the control

Import into each environment once the project's solution changes from §3 are there:

```sh
pac solution import --path WBChoiceCounts_managed.zip --publish-changes
```

Or use the maker portal: Solutions → Import solution → `WBChoiceCounts_managed.zip`.

- The control solution has no dependencies, so it can go before or after the project's solution. It must be imported **before** a project solution that already contains a form using it.
- No settings file is needed, because the control has no environment variables.
- Check that it imported: Solutions → `WBChoiceCounts` shows the version from the release.

## 5. Put the control on the SMSF Matter form

In dev, in the form designer for the SMSF Matter main form, inside the project's solution:

1. Add **Task RAG** to the form where the counts should appear, for example under FY. Rename its label if you like, say to "Open tasks", since the label shown is the field's.
2. Select the field, then **Components → + Component → Choice counts**. If it isn't listed, choose **Get more components** and add it from the list.
3. Set the properties:

   | Property | Value | Bind or static |
   |---|---|---|
   | Host column | Task RAG | (the field itself) |
   | **Record ID** | the SMSF Matter **primary key** (§2) | **bind** to the column |
   | Table to count | the task table's logical name | static |
   | Group by column | the RAG column's logical name | static |
   | Relationship column | the task to SMSF Matter lookup's logical name | static |
   | Filter (FetchXML) | `<condition attribute="statecode" operator="eq" value="0" />` (active tasks only) | static |
   | Options to show | `<Red value>,<Amber value>`, for example `512340000,512340001`. This shows Red then Amber and leaves Green out | static |
   | Zero counts | **Neutral**, the default. A matter with no Red tasks shows a grey "Red 0", so only real issues are coloured | static |
   | Colours | leave **blank** to use the RAG choice's own colours. To use other colours, list them as `<value>:#hex`, for example `512340000:#C50F1F, 512340001:#F7630C` | static |
   | When a count is selected | **Raise OnOptionSelect** | static |

4. Show the component on **Web**, **Phone** and **Tablet**.
5. Save and publish.

**If the designer won't bind Record ID to the primary key** (decisions.md C-1, not yet tested in the designer): the control needs the record ID to filter by the current matter. Without it, the counts include **every** matter's tasks. As a fallback, the binding can be set in the form XML (see `scripts/test-env/add-choicecounts-to-smsf-form.mjs`):

```xml
<recordId type="SingleLine.Text">wbsuper_smsfmatterid</recordId>
```

That's a solution-file edit, so agree it with whoever owns the project's solution before using it.

## 6. Add the drill-through script

1. Take [`examples/drill-through.js`](../examples/drill-through.js) and edit its `CONFIG` to match William Buck's names:
   ```js
   var CONFIG = {
     control: "<host column logical name>", // e.g. the Task RAG column
     tab: "tab_tasks",                       // the tab's Name from §3
     subgrid: "tasks_subgrid",               // the subgrid's Name from §3
     table: "<task table logical name>",
     views: {
       <Red value>: "Red tasks",
       <Amber value>: "Amber tasks",
     },
   };
   ```
2. Add it to the **project's** solution as a web resource of type JavaScript, named with the project's prefix, for example `<prefix>_/choicecounts/smsfmatter.js`.
3. Register it on the form:
   1. Form designer → **Form libraries → + Add library**, then choose the web resource.
   2. Then **Events → On Load → + Event handler**:
      - Library: the web resource.
      - Function: `WBChoiceCounts.DrillThrough.onLoad`.
      - **Pass execution context as first parameter:** ticked.
      - Enabled: ticked.
4. Save and publish.

Notes:
- Selecting a count raises the control's **OnOptionSelect** event, and the script opens the tab and switches the subgrid. The control itself never navigates.
- Custom control events are documented by Microsoft as **preview**. They work in `LowCode` (decisions.md C-5). Recheck them after major platform updates.

## 7. Check it

Run these in dev and **UAT**. In prod, check only that the counts and the drill-through appear on an existing matter.

1. Open a matter that has tasks. Task RAG shows **Red n · Amber n**, matching that matter's active tasks: compare with the Tasks tab's default view. Green tasks, inactive tasks and other matters' tasks aren't counted.
2. Open a matter with no Red tasks. It shows **Red 0** in grey, while non-zero counts keep their colour (Zero counts = Neutral).
3. Select **Red**. The Tasks tab opens and the subgrid switches to **Red tasks**, showing only that matter's red tasks. Then do the same with **Amber**.
4. Add or change a task in the subgrid, then press the **refresh** button next to the counts. The counts update. They don't update by themselves (§9).
5. Create a new matter. Before the first save, Task RAG should show **"Available after save"**, and after saving the counts should appear without a reload. **This hasn't been tested yet** (decisions.md C-1). Record what happens. If the counts need a reload after the first save, note it: it's a known gap, not a failure of the deployment.
6. Sign in as a user with the least privileged role that uses SMSF Matter. The counts show (they need Read on tasks, §3) and match what that user can see.
7. Check the form in **dark mode**, if William Buck uses it, and in the **mobile app**. The counts are readable, and the mobile app doesn't crash. Offline, the counts show "—", which is expected.

Record the results, with screenshots, in the sign-off table (§10).

## 8. Troubleshooting

Open the browser's developer tools (F12), go to Console, and reload the form. The control logs one line per problem, starting `ChoiceCounts:`. The drill-through script's lines start `ChoiceCounts drill-through:`.

| Symptom | Likely cause | Fix |
|---|---|---|
| "—" with tooltip "Counts unavailable" | A logical name is wrong, the filter is invalid, or the user has no Read on the task table | The console line names it. Check §2 and §3.4 |
| "—" with tooltip "Too many rows to count" | More than 50,000 tasks match. Dataverse refuses to count above that | Narrow the filter. The limit is Dataverse's |
| Counts include other matters' tasks | Relationship column or Record ID isn't set | §5 step 3. Record ID must be bound, not static |
| Green appears, or the order is wrong | Options to show is blank or has wrong values | Use the Red and Amber values from §2, in display order |
| A count has the wrong colour, or none | Colours has a typo (the console says which entry was skipped), or the RAG choice has no colour for that option | Fix the `value:#hex` entry, or set the option colour on the global choice |
| Selecting a count does nothing | When a count is selected isn't "Raise OnOptionSelect"; the script isn't registered, or `CONFIG.control` doesn't match the host column; or the form is cached | Check §5 and §6, then **hard-reload** the form (Ctrl+Shift+R) |
| The tab opens but the view doesn't change | The view selector is off, or doesn't offer that view, or the view name in `CONFIG.views` differs | §3 step 3 and §6 step 1. The console says which |

## 9. Limits

- **Counts don't update by themselves.** They're calculated when the form loads, after the first save, and from the refresh button. Adding a task in the subgrid doesn't refresh them, so press refresh.
- **50,000 rows** per count, which is Dataverse's aggregate limit.
- **Offline (mobile):** counts show "—", because Dataverse offline doesn't support aggregate queries.
- **Security:** counts respect Dataverse security. A user sees counts of the tasks they can read.

## 10. Upgrades and rollback

- **Upgrade:** import the newer `WBChoiceCounts_managed.zip` the same way. The settings on the form stay.
  - Every release bumps the control's version, so Dataverse serves the new bundle.
  - Users may need a hard reload.
- **Rollback:**
  - To remove the drill-through, clear "When a count is selected" (set it to "Nothing") or remove the On Load handler.
  - To remove the control, take the component off the field in the form designer, then `pac solution delete --solution-name WBChoiceCounts`. The field reverts to a plain text box, which stays empty.

## Sign-off

| Environment | Release | Done by / date | §7 checks | Notes (C-1 designer binding, mobile, dark mode) |
|---|---|---|---|---|
| William Buck dev | | | | |
| UAT | | | 1 to 7 | |
| Prod | | | 1 and 3 | |
