/*
 * ChoiceCounts drill-through: an example form script for a PROJECT's solution (not the control's).
 *
 * When someone selects a count, ChoiceCounts raises OnOptionSelect with { value, label, count, tableName,
 * groupColumn } (set the control's "When a count is selected" to "Raise OnOptionSelect"). This script handles
 * it by opening a tab and switching a subgrid on that tab to the view for the selected option. The subgrid keeps
 * its relationship, so it shows only this record's rows with that value.
 *
 * Drill-through is per instance. One script handles every clickable ChoiceCounts instance on the form: list each
 * in CONFIG.controls. An instance left at "Nothing" stays display-only and needs no entry.
 *
 * Set up, on the form:
 *   1. Upload this file as a JavaScript web resource in the project's solution, named
 *      <prefix>_ChoiceCounts.<table logical name>.js (no "/", like GridFormatter's rules files), and edit CONFIG below.
 *   2. Form properties > Events > On Load: add the library, function "WBChoiceCounts.DrillThrough.onLoad",
 *      with "Pass execution context as first parameter" ticked. Register it once, however many instances it handles.
 *   3. Each subgrid must show related rows only, and its view selector must be on and must offer every view
 *      named in that entry's views (setCurrentView needs the view selector).
 *
 * Views are named, not referenced by ID, so the same script works in every environment. The IDs are looked up
 * once per form load through Xrm.WebApi. Uses only the documented client API: addEventHandler on a code
 * component's custom event (preview, ChoiceCounts decisions.md C-5), tabs, and getViewSelector().setCurrentView.
 */
/* global Xrm */
var WBChoiceCounts = window.WBChoiceCounts || {};

WBChoiceCounts.DrillThrough = (function () {
  "use strict";

  // Edit for each form: one entry per clickable ChoiceCounts instance. The keys of views are the option values
  // of that instance's group-by column. Several entries can share a tab and subgrid.
  var CONFIG = {
    controls: [
      {
        control: "wbsuper_taskrag", // the column this ChoiceCounts instance is placed on
        tab: "tab_tasks", // the tab that holds the subgrid
        subgrid: "tasks_subgrid", // the subgrid's name
        table: "wbsuper_smsftask", // the subgrid's table
        views: {
          512340000: "Red tasks",
          512340001: "Amber tasks",
        },
      },
    ],
  };

  var SAVED_QUERY = 1039; // entity type code of a system view, for setCurrentView

  var viewIds = {}; // "table|view name" -> id, filled on first use

  function findViewId(table, name) {
    var key = table + "|" + name;
    if (viewIds[key]) return Promise.resolve(viewIds[key]);
    var filter = "name eq '" + name.replace(/'/g, "''") + "' and returnedtypecode eq '" + table + "'";
    return Xrm.WebApi.retrieveMultipleRecords("savedquery", "?$select=savedqueryid&$filter=" + encodeURIComponent(filter)).then(function (result) {
      if (!result.entities.length) throw new Error('no view called "' + name + '" on ' + table);
      viewIds[key] = result.entities[0].savedqueryid;
      return viewIds[key];
    });
  }

  /** The subgrid's control, waiting briefly for a tab that hasn't rendered it yet. */
  function whenGridReady(formContext, subgrid, attempts) {
    var grid = formContext.getControl(subgrid);
    if (grid && grid.getViewSelector) return Promise.resolve(grid);
    if (attempts <= 0) return Promise.reject(new Error("subgrid " + subgrid + " isn't on the form"));
    return new Promise(function (resolve) {
      setTimeout(resolve, 200);
    }).then(function () {
      return whenGridReady(formContext, subgrid, attempts - 1);
    });
  }

  function showRows(formContext, entry, params) {
    var viewName = params && entry.views[params.value];
    if (!viewName) return; // an option with no view configured: nothing to do

    var tab = formContext.ui.tabs.get(entry.tab);
    if (tab) {
      tab.setVisible(true);
      tab.setDisplayState("expanded");
      tab.setFocus();
    }

    Promise.all([findViewId(entry.table, viewName), whenGridReady(formContext, entry.subgrid, 25)])
      .then(function (results) {
        results[1].getViewSelector().setCurrentView({ entityType: SAVED_QUERY, id: results[0], name: viewName });
      })
      .catch(function (error) {
        console.warn("ChoiceCounts drill-through (" + entry.control + "): " + (error && error.message ? error.message : error));
      });
  }

  function attach(formContext, entry) {
    var control = formContext.getControl(entry.control);
    if (!control || typeof control.addEventHandler !== "function") {
      console.warn("ChoiceCounts drill-through: control " + entry.control + " isn't on the form, or doesn't support custom events");
      return;
    }
    control.addEventHandler("OnOptionSelect", function (params) {
      showRows(formContext, entry, params);
    });
  }

  function onLoad(executionContext) {
    var formContext = executionContext.getFormContext();
    CONFIG.controls.forEach(function (entry) {
      attach(formContext, entry);
    });
  }

  return { onLoad: onLoad, config: CONFIG };
})();
