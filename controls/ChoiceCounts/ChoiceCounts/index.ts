import * as React from "react";
import type { Theme } from "@fluentui/react-components";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { ChoiceCountsControl, type OptionSelectPayload } from "./ChoiceCountsControl";

/**
 * Shows a count of related rows for each option of a choice column
 * (docs/briefs/2026-10-31-choice-counts.md). The query, the metadata and the states
 * live in ChoiceCountsControl, so an updateView that changes nothing the count depends
 * on only re-renders. Display-only towards the form: it never writes to the host
 * column or calls notifyOutputChanged. A selected count can raise OnOptionSelect.
 */
export class ChoiceCounts implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  public init(): void {
    // Everything is loaded by the React component.
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    // Optional chaining on every input: a host may leave out inputs that aren't configured (the form
    // designer's preview showed "Error loading control"), and the control must never throw while rendering.
    const p = context.parameters;
    const onOptionSelect = p.badgeAction?.raw === "1" ? context.events?.OnOptionSelect : undefined;
    return React.createElement(ChoiceCountsControl, {
      inputs: {
        tableName: p.tableName?.raw ?? null,
        groupColumn: p.groupColumn?.raw ?? null,
        relationshipColumn: p.relationshipColumn?.raw ?? null,
        filterXml: p.filterXml?.raw ?? null,
        optionValues: p.optionValues?.raw ?? null,
        optionColors: p.optionColors?.raw ?? null,
        zeroCounts: p.zeroCounts?.raw ?? null,
      },
      recordId: p.recordId?.raw ?? null,
      utils: context.utils,
      webAPI: context.webAPI,
      theme: context.fluentDesignLanguage?.tokenTheme as Theme | undefined,
      raiseSelect: onOptionSelect ? (payload: OptionSelectPayload) => onOptionSelect(payload) : undefined,
    });
  }

  public getOutputs(): IOutputs {
    // Never writes to the host column.
    return {};
  }

  public destroy(): void {
    // Nothing to clean up: the component's effects drop late responses themselves.
  }
}
