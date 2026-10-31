import * as React from "react";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { ChoiceCountsView } from "./ChoiceCountsView";

/**
 * Shows a count of related rows for each option of a choice column.
 * Scaffold only (#51): the query, the merge and the badges arrive in #53 and #54.
 * The control is display-only, so it never calls notifyOutputChanged.
 */
export class ChoiceCounts implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  public init(): void {
    // Nothing to load yet.
  }

  public updateView(): React.ReactElement {
    return React.createElement(ChoiceCountsView);
  }

  public getOutputs(): IOutputs {
    // Never writes to the host column.
    return {};
  }

  public destroy(): void {
    // Nothing to clean up yet.
  }
}
