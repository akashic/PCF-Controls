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
    const p = context.parameters;
    const onOptionSelect = p.badgeAction.raw === "1" ? context.events?.OnOptionSelect : undefined;
    return React.createElement(ChoiceCountsControl, {
      inputs: {
        tableName: p.tableName.raw,
        groupColumn: p.groupColumn.raw,
        relationshipColumn: p.relationshipColumn.raw,
        filterXml: p.filterXml.raw,
        optionValues: p.optionValues.raw,
      },
      recordId: p.recordId.raw,
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
