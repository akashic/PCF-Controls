import * as React from "react";
import {
  Button,
  FluentProvider,
  Spinner,
  Text,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
  webLightTheme,
  type Theme,
} from "@fluentui/react-components";
import { bestTextColor } from "@wb-pcf/shared";
import type { Badge } from "./logic/results";
import type { DisplayState } from "./logic/display";
import { UNSAVED_TEXT } from "./logic/display";

export interface ChoiceCountsViewProps {
  state: DisplayState;
  /** Called with a badge when badges are selectable; `undefined` makes them plain text. */
  onSelect: ((badge: Badge) => void) | undefined;
  onRefresh: () => void;
  /** The platform's token theme, if modern theming is on. */
  theme: Theme | undefined;
}

/**
 * Windows high contrast (forced colours) replaces backgrounds with system colours,
 * which would blank the badges' fills. They keep their own colours; the text in them
 * is still the main signal.
 */
const KEEP_COLOURS = { forcedColorAdjust: "none" } as const;

const useStyles = makeStyles({
  provider: { backgroundColor: "transparent", width: "100%" },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS, minHeight: "32px" },
  badge: {
    ...KEEP_COLOURS,
    display: "inline-flex",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalXS,
    paddingTop: "2px",
    paddingBottom: "2px",
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    // Options with no colour use theme colours.
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
  },
  button: {
    cursor: "pointer",
    ":hover": { boxShadow: tokens.shadow4 },
    ":focus-visible": { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`, outlineOffset: "2px" },
  },
  count: { fontWeight: tokens.fontWeightSemibold },
  muted: { color: tokens.colorNeutralForeground3 },
  dash: { color: tokens.colorNeutralForeground3, cursor: "default" },
});

const RefreshIcon = (): React.ReactElement => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M8 3a5 5 0 1 0 4.9 6h1.02A6 6 0 1 1 12 4.1V2.5a.5.5 0 0 1 1 0v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1h1.8A5 5 0 0 0 8 3Z" />
  </svg>
);

function BadgeView({ badge, onSelect }: { badge: Badge; onSelect: ChoiceCountsViewProps["onSelect"] }): React.ReactElement {
  const styles = useStyles();
  const colours = badge.color ? { backgroundColor: badge.color, color: bestTextColor(badge.color) } : undefined;
  const content = (
    <>
      <span>{badge.label}</span>
      <span className={styles.count}>{badge.count}</span>
    </>
  );
  if (!onSelect) {
    return (
      <span className={styles.badge} style={colours}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={mergeClasses(styles.badge, styles.button)}
      style={colours}
      aria-label={`${badge.label} ${badge.count}, show these rows`}
      onClick={() => onSelect(badge)}
    >
      {content}
    </button>
  );
}

export function ChoiceCountsView({ state, onSelect, onRefresh, theme }: ChoiceCountsViewProps): React.ReactElement {
  const styles = useStyles();
  let body: React.ReactElement;
  switch (state.kind) {
    case "loading":
      body = <Spinner size="tiny" aria-label="Loading counts" />;
      break;
    case "unsaved":
      body = <Text className={styles.muted}>{UNSAVED_TEXT}</Text>;
      break;
    case "unavailable":
      body = (
        <Tooltip content={state.tooltip} relationship="label">
          <Text className={styles.dash} tabIndex={0}>
            —
          </Text>
        </Tooltip>
      );
      break;
    case "ready":
      body = (
        <>
          <div role="group" aria-label={state.accessibleName || "No counts"} className={styles.row}>
            {state.badges.map((badge) => (
              <BadgeView key={badge.value} badge={badge} onSelect={onSelect} />
            ))}
          </div>
          <Button
            appearance="subtle"
            size="small"
            icon={state.refreshing ? <Spinner size="extra-tiny" /> : <RefreshIcon />}
            aria-label={state.refreshing ? "Refreshing counts" : "Refresh counts"}
            aria-busy={state.refreshing}
            disabled={state.refreshing}
            onClick={onRefresh}
          />
        </>
      );
      break;
  }
  return (
    <FluentProvider theme={theme ?? webLightTheme} className={styles.provider}>
      <div className={styles.row}>{body}</div>
    </FluentProvider>
  );
}
