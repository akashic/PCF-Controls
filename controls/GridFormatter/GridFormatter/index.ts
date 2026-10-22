import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { createCellRendererOverrides } from "./customizers/CellRendererOverrides";
import { PAOneGridCustomizer } from "./types";
import { createCellFormatter } from "./engine/cellFormatter";
import { WARNING_PREFIX, createWarnOnce } from "./engine/warnings";
import { createConfigStore } from "./stores/configStore";
import { createMetadataStore, type FetchJson } from "./stores/metadataStore";
import { loadFormatting, startWhenLoaded, type Formatting } from "./stores/startup";
import * as React from "react";

/** Set to "1" in sessionStorage to log which rules matched each row. */
const DEBUG_KEY = "wb_GridFormatDebug";

/** GETs the Web API metadata fallback (same origin, the user's session). */
const fetchJson: FetchJson = async (url) => {
	const response = await fetch(url, {
		credentials: "same-origin",
		headers: { Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as unknown;
};

// Module scope: one per page, shared by every grid that uses this control.
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

/** The grid's table (spike V4): `context.page.entityTypeName`, which isn't in the typings. */
function tableOf(context: ComponentFramework.Context<IInputs>): string | null {
	const page = (context as unknown as { page?: { entityTypeName?: unknown } }).page;
	return typeof page?.entityTypeName === "string" ? page.entityTypeName : null;
}

export class GridFormatter implements ComponentFramework.ReactControl<IInputs, IOutputs> {
	/**
	 * Loads the table's config and option colours, then hands the customizer to the
	 * grid with `fireEvent` (V5). The grid waits for it, up to the 3 s timeout.
	 */
	public init(context: ComponentFramework.Context<IInputs>): void {
		const eventName = context.parameters.EventName.raw;
		if (!eventName) return;

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
			loading = loadFormatting(tableOf(context), { configStore, metadataStore, webAPI: context.webAPI, utils: context.utils });
		} catch (error) {
			warn(`config couldn't be loaded (${String(error)}); the grid is shown without formatting.`);
			loading = Promise.resolve({ config: null, optionColours: new Map() });
		}
		startWhenLoaded(loading, {
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

	public destroy(): void {
		// Nothing to clean up: caches are per page and shared with other grids.
	}
}
