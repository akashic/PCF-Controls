import * as React from "react";
import type { Theme } from "@fluentui/react-components";
import { ChoiceCountsView } from "./ChoiceCountsView";
import { loadMetadata, runCountQuery } from "./data";
import { normalizeRecordId, parseConfig, type RawInputs } from "./logic/config";
import { resolveDisplayState, type LoadState } from "./logic/display";
import { buildFetchXml } from "./logic/fetchXml";
import type { MetadataRead } from "./logic/metadata";
import { mergeCounts, readGroupCounts, type Badge } from "./logic/results";

/** What a form script's OnOptionSelect handler receives. */
export interface OptionSelectPayload {
  readonly value: number;
  readonly label: string;
  readonly count: number;
  readonly tableName: string;
  readonly groupColumn: string;
}

export interface ChoiceCountsControlProps {
  readonly inputs: RawInputs;
  readonly recordId: string | null;
  readonly utils: ComponentFramework.Utility;
  readonly webAPI: ComponentFramework.WebApi;
  readonly theme: Theme | undefined;
  /** Raises OnOptionSelect, or `undefined` when badges aren't selectable. */
  readonly raiseSelect: ((payload: OptionSelectPayload) => void) | undefined;
}

/** Logs each distinct problem once per control instance (brief §2: one console.warn per cause). */
function useWarnOnce(): (message: string) => void {
  const warned = React.useRef(new Set<string>());
  return React.useCallback((message: string) => {
    if (warned.current.has(message)) return;
    warned.current.add(message);
    console.warn(`ChoiceCounts: ${message}`);
  }, []);
}

/**
 * Loads metadata, runs the count and renders the result. It queries when the
 * configuration or metadata is ready, when the record ID changes (which covers the
 * first save), and from the refresh button, never on other updateView calls
 * (brief §5.3). A request version drops responses that arrive after a newer query.
 */
export function ChoiceCountsControl({ inputs, recordId, utils, webAPI, theme, raiseSelect }: ChoiceCountsControlProps): React.ReactElement {
  const warn = useWarnOnce();
  const { tableName, groupColumn, relationshipColumn, filterXml, optionValues } = inputs;
  const configResult = React.useMemo(
    () => parseConfig({ tableName, groupColumn, relationshipColumn, filterXml, optionValues }),
    [tableName, groupColumn, relationshipColumn, filterXml, optionValues],
  );
  const record = React.useMemo(() => normalizeRecordId(recordId), [recordId]);
  const config = configResult.ok ? configResult.config : null;

  const [metadata, setMetadata] = React.useState<MetadataRead | null>(null);
  const [load, setLoad] = React.useState<LoadState>({ status: "loading", previous: null });
  const [refreshTick, setRefreshTick] = React.useState(0);
  const version = React.useRef(0);
  const shown = React.useRef<readonly Badge[] | null>(null);

  React.useEffect(() => {
    if (!configResult.ok) configResult.errors.forEach(warn);
    else configResult.warnings.forEach(warn);
  }, [configResult, warn]);
  React.useEffect(() => {
    if (record.kind === "invalid") warn(`Record ID "${record.raw}" isn't a GUID; bind it to the form's primary key column`);
  }, [record, warn]);

  React.useEffect(() => {
    if (!config) return;
    let current = true;
    setMetadata(null);
    const loadIt = async (): Promise<void> => {
      const read = await loadMetadata(utils, config.tableName, config.groupColumn);
      if (!current) return;
      if (!read.ok) warn(read.reason);
      setMetadata(read);
    };
    void loadIt();
    return () => {
      current = false;
    };
  }, [config?.tableName, config?.groupColumn, utils, warn]);

  const waitingForSave = config?.relationshipColumn != null && record.kind === "empty";
  const usable = config !== null && record.kind !== "invalid" && metadata?.ok !== false;
  const recordKey = record.kind === "guid" ? record.id : null;

  React.useEffect(() => {
    if (!config || !metadata?.ok || waitingForSave || record.kind === "invalid") return;
    const thisVersion = ++version.current;
    setLoad({ status: "loading", previous: shown.current });
    const fetchXml = buildFetchXml({
      tableName: config.tableName,
      primaryIdColumn: metadata.metadata.primaryIdColumn,
      groupColumn: config.groupColumn,
      filter: config.filter,
      relationship: config.relationshipColumn && recordKey ? { column: config.relationshipColumn, recordId: recordKey } : null,
    });
    const count = async (): Promise<void> => {
      let entities: unknown;
      try {
        entities = await runCountQuery(webAPI, config.tableName, fetchXml);
      } catch (error: unknown) {
        if (thisVersion !== version.current) return;
        warn(`the count query failed: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
        shown.current = null;
        setLoad({ status: "failed", error });
        return;
      }
      if (thisVersion !== version.current) return;
      const counts = readGroupCounts(entities);
      if (!counts) {
        warn("the count query returned an unexpected shape");
        setLoad({ status: "failed", error: new Error("unexpected response") });
        return;
      }
      const merged = mergeCounts(metadata.metadata.options, counts, config.optionValues);
      if (merged.unknownOptionValues.length > 0) warn(`Options to show: ${merged.unknownOptionValues.join(", ")} aren't options of ${config.groupColumn}`);
      if (merged.unlistedValues.length > 0) warn(`rows have values that aren't options of ${config.groupColumn}: ${merged.unlistedValues.join(", ")}`);
      shown.current = merged.badges;
      setLoad({ status: "loaded", badges: merged.badges });
    };
    void count();
  }, [config, metadata, recordKey, waitingForSave, refreshTick, webAPI, warn]);

  const state = resolveDisplayState({
    usable,
    waitingForSave,
    load: metadata === null && usable ? { status: "loading", previous: null } : load,
  });

  const onSelect = React.useMemo(
    () =>
      raiseSelect && config
        ? (badge: Badge) => raiseSelect({ value: badge.value, label: badge.label, count: badge.count, tableName: config.tableName, groupColumn: config.groupColumn })
        : undefined,
    [raiseSelect, config],
  );
  const onRefresh = React.useCallback(() => setRefreshTick((tick) => tick + 1), []);

  return <ChoiceCountsView state={state} onSelect={onSelect} onRefresh={onRefresh} theme={theme} />;
}
