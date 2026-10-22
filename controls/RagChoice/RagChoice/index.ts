import * as React from "react";
import type { Theme } from "@fluentui/react-components";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import {
  ariaLabelFor,
  buildChoiceItems,
  displayValue,
  isRequired,
  normalizeRawValue,
  parseFallbackColor,
  parseIndicatorStyle,
  resolveFieldState,
  syncSelection,
  toOutputs,
  valueForKey,
  type ChoiceItem,
  type Selection,
} from "./logic";
import { RagChoiceErrorBoundary, RagChoiceView } from "./RagChoiceView";

/**
 * A single-select choice dropdown that shows each option's configured
 * colour as a dot (or a left bar). All the decisions live in `logic.ts`;
 * this class only wires the PCF context to them.
 */
export class RagChoice implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  private notifyOutputChanged: () => void = () => undefined;
  private selection: Selection = { selected: null, lastRaw: null };
  private items: ChoiceItem[] = [];
  private warnedFallback: string | null = null;

  public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void): void {
    this.notifyOutputChanged = notifyOutputChanged;
    const raw = normalizeRawValue(context.parameters.value?.raw);
    this.selection = { selected: raw, lastRaw: raw };
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    let fallbackText = "";
    try {
      const value = context.parameters.value;
      const attributes = value?.attributes;

      // Re-sync from the bound value on every call; never notify for external changes.
      this.selection = syncSelection(this.selection, value?.raw);

      const fallback = parseFallbackColor(context.parameters.fallbackColor?.raw);
      if (fallback.invalid) this.warnInvalidFallback(context.parameters.fallbackColor?.raw);

      this.items = buildChoiceItems(
        attributes?.Options,
        fallback.color,
        isRequired(attributes?.RequiredLevel),
        this.selection.selected,
      );
      const state = resolveFieldState({ isControlDisabled: context.mode.isControlDisabled, security: value?.security });
      const display = displayValue(this.items, this.selection.selected, state.readable);
      fallbackText = display.text;

      return React.createElement(
        RagChoiceErrorBoundary,
        { fallbackText },
        React.createElement(RagChoiceView, {
          items: state.readable ? this.items : [],
          display,
          indicator: parseIndicatorStyle(context.parameters.indicator?.raw),
          readOnly: !state.editable,
          ariaLabel: ariaLabelFor(context.mode.label, attributes?.DisplayName),
          theme: context.fluentDesignLanguage?.tokenTheme as Theme | undefined,
          onChange: this.onChange,
        }),
      );
    } catch (error) {
      console.warn("RagChoice: couldn't read the field, showing the value as text", error);
      return React.createElement("span", null, fallbackText);
    }
  }

  public getOutputs(): IOutputs {
    return toOutputs(this.selection.selected);
  }

  public destroy(): void {
    // Nothing to clean up: no listeners, timers or requests.
  }

  /** User-driven change: the only path that calls `notifyOutputChanged`. */
  private onChange = (key: string | undefined): void => {
    const value = valueForKey(this.items, key);
    if (value === this.selection.selected) return;
    this.selection = { ...this.selection, selected: value };
    this.notifyOutputChanged();
  };

  private warnInvalidFallback(raw: unknown): void {
    const text = String(raw);
    if (this.warnedFallback === text) return;
    this.warnedFallback = text;
    console.warn(`RagChoice: fallbackColor "${text}" isn't a hex colour (#RGB or #RRGGBB), so it's ignored`);
  }
}
