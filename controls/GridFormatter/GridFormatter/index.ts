import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { cellRendererOverrides, onVisibleChoiceColumns } from "./customizers/CellRendererOverrides";
import { cellEditorOverrides } from "./customizers/CellEditorOverrides";
import { PAOneGridCustomizer } from "./types";
import { elapsed, errorText, record, setting } from "./spike/probe";
import { probeHost, probeOptionColours, probeServices } from "./spike/contextProbes";
import * as React from "react";

export class GridFormatter implements ComponentFramework.ReactControl<IInputs, IOutputs> {
	/**
	 * Used to initialize the control instance. Controls can kick off remote server calls and other initialization actions here.
	 * Data-set values are not initialized here, use updateView.
	 * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to property names defined in the manifest, as well as utility functions.
	 */
	public init(context: ComponentFramework.Context<IInputs>): void {
		const loose = context as unknown as ComponentFramework.Context<unknown>;
		let table: string | null = null;
		try {
			record("V5 init", { atMs: elapsed() });
			table = probeHost(loose);
			probeServices(loose);
			onVisibleChoiceColumns((choiceColumns) => probeOptionColours(loose, table, choiceColumns));
		} catch (e) {
			record("Spike probe error in init", errorText(e));
		}

		const eventName = context.parameters.EventName.raw;
		if (!eventName) return;
		const paOneGridCustomizer: PAOneGridCustomizer = { cellRendererOverrides, cellEditorOverrides };
		const fire = () => {
			record("V5 fireEvent", { atMs: elapsed() });
			// eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
			(context as any).factory.fireEvent(eventName, paOneGridCustomizer);
		};
		const delay = Number(setting("delayFire") ?? 0);
		if (delay > 0) setTimeout(fire, delay);
		else fire();
	}

	/**
	 * Called when any value in the property bag has changed. This includes field values, data-sets, global values such as container height and width, offline status, control metadata values such as label, visible, etc.
	 * @returns ReactElement root react element for the control
	 */
	public updateView(): React.ReactElement {
		return React.createElement(React.Fragment);
	}

	/**
	 * It is called by the framework prior to a control receiving new data.
	 * @returns an object based on nomenclature defined in manifest, expecting object[s] for property marked as “bound” or “output”
	 */
	public getOutputs(): IOutputs {
		return {};
	}

	/**
	 * Called when the control is to be removed from the DOM tree. Controls should use this call for cleanup.
	 */
	public destroy(): void {
		// Nothing to clean up yet.
	}
}
