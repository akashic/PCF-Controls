import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { createCellRendererOverrides } from "./customizers/CellRendererOverrides";
import { PAOneGridCustomizer } from "./types";
import { createCellFormatter } from "./engine/cellFormatter";
import { gridTableOf } from "./engine/gridTable";
import { WARNING_PREFIX, createWarnOnce } from "./engine/warnings";
import { createConfigStore } from "./stores/configStore";
import { createMetadataStore, type FetchJson } from "./stores/metadataStore";
import { loadFormatting, startWhenLoaded, type CancelStart, type Formatting } from "./stores/startup";
import * as React from "react";

/** Set to "1" in sessionStorage to log which rules matched each row. */
const DEBUG_KEY = "GridFormatter.debug";

/** GETs the Web API metadata fallback (same origin, the user's session). */
const fetchJson: FetchJson = async (url) => {
	const response = await fetch(url, {
		credentials: "same-origin",
		headers: { Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as unknown;
};

// Module scope: shared by every grid that uses this control, until the browser tab reloads.
const warn = createWarnOnce();
const configStore = createConfigStore({ warn });
const metadataStore = createMetadataStore({ warn, fetchJson });

function readDebugFlag(): boolean {
	try {
		return sessionStorage.getItem(DEBUG_KEY) === "1";
	} catch {
		return false;
	}
}

export class GridFormatter implements ComponentFramework.ReactControl<IInputs, IOutputs> {
	/** Cancels a start-up still waiting for its config, so `destroy()` stops a late `fireEvent`. */
	private cancelStart: CancelStart | undefined;

	/**
	 * Loads the table's config and option colours, then hands the customizer to the
	 * grid with `fireEvent` (V5). The grid waits for it, up to the 3 s timeout.
	 */
	public init(context: ComponentFramework.Context<IInputs>): void {
		const eventName = context.parameters.EventName?.raw;
		if (!eventName) {
			warn("the control didn't get an EventName from the grid, so it can't format it. Use it only as a Power Apps grid control's Customizer control.");
			return;
		}

		const offset = (instant: Date): number => context.userSettings.getTimeZoneOffsetMinutes(instant);
		const debug = readDebugFlag() ? (message: string) => console.info(`${WARNING_PREFIX} [debug] ${message}`) : undefined;
		const fire = (formatting: Formatting | null): void => {
			const formatter = createCellFormatter({
				config: formatting?.config ?? null,
				optionColours: formatting?.optionColours,
				offset,
				warn,
				debug,
			});
			const customizer: PAOneGridCustomizer = { cellRendererOverrides: createCellRendererOverrides(formatter, warn) };
			(context.factory as unknown as { fireEvent(name: string, payload: unknown): void }).fireEvent(eventName, customizer);
		};

		let loading: Promise<Formatting>;
		try {
			loading = loadFormatting(gridTableOf(context, warn), { configStore, metadataStore, webAPI: context.webAPI, utils: context.utils });
		} catch (error) {
			warn(`config couldn't be loaded (${String(error)}); the grid is shown without formatting.`);
			loading = Promise.resolve({ config: null, optionColours: new Map() });
		}
		this.cancelStart = startWhenLoaded(loading, {
			warn,
			onReady: (formatting) => {
				try {
					fire(formatting);
				} catch (error) {
					warn(`the customizer couldn't start (${String(error)}).`);
				}
			},
		});
	}

	/** The customizer draws nothing of its own outside the grid's cells. */
	public updateView(): React.ReactElement {
		return React.createElement(React.Fragment);
	}

	public getOutputs(): IOutputs {
		return {};
	}

	/** Stops a pending start-up. The caches stay: they're shared with other grids until the tab reloads. */
	public destroy(): void {
		this.cancelStart?.();
		this.cancelStart = undefined;
	}
}
