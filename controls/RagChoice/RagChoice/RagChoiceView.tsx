import * as React from "react";
import {
  Dropdown,
  FluentProvider,
  Input,
  Option,
  makeStyles,
  mergeClasses,
  tokens,
  webLightTheme,
  type OptionOnSelectData,
  type SelectionEvents,
  type Theme,
} from "@fluentui/react-components";
import type { HexColor } from "@wb-pcf/shared";
import {
  PLACEHOLDER,
  READ_ONLY_EMPTY,
  resetBoundary,
  type BoundaryState,
  type ChoiceItem,
  type DisplayValue,
  type IndicatorStyle,
} from "./logic";

/**
 * Fields on a modern model-driven form are "filled-darker" (a grey fill, no
 * border until hover or focus). Matching it keeps the control in line with
 * the fields around it (verified in dev, issue #7).
 */
const APPEARANCE = "filled-darker";

export interface RagChoiceViewProps {
  items: readonly ChoiceItem[];
  display: DisplayValue;
  indicator: IndicatorStyle;
  /**
   * Shown as a read-only text box rather than a disabled dropdown, like the
   * platform's own read-only choice: still focusable and readable by screen
   * readers, and in normal text colour.
   */
  readOnly: boolean;
  /** Business or system required: announced as `aria-required` on the dropdown. */
  required: boolean;
  ariaLabel: string | undefined;
  /** The platform's token theme, if modern theming is on. */
  theme: Theme | undefined;
  onChange: (key: string | undefined) => void;
}

/**
 * Windows high contrast (forced colours) replaces backgrounds with system
 * colours, which would blank the dot and bar. They keep their own colours;
 * the label next to them is still the main signal.
 */
const KEEP_COLOURS = { forcedColorAdjust: "none" } as const;

const useStyles = makeStyles({
  // The provider only carries the theme into the dropdown's portal; it mustn't paint a background.
  provider: { backgroundColor: "transparent", width: "100%" },
  root: { position: "relative", width: "100%" },
  dropdown: { width: "100%", minWidth: "auto" },
  // Sits over the dropdown's left border, inside its rounded corners.
  bar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "4px",
    borderTopLeftRadius: tokens.borderRadiusMedium,
    borderBottomLeftRadius: tokens.borderRadiusMedium,
    zIndex: 1,
    pointerEvents: "none",
    ...KEEP_COLOURS,
  },
  value: {
    display: "inline-flex",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalS,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  placeholder: { color: tokens.colorNeutralForeground4 },
  // The read-only text box leaves almost no gap after its leading slot.
  readOnlyDot: { display: "inline-flex", paddingRight: tokens.spacingHorizontalXS },
  // A small solid swatch with a neutral border, so pale colours stay visible on white.
  dot: {
    flexShrink: 0,
    width: "10px",
    height: "10px",
    borderRadius: tokens.borderRadiusCircular,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    boxSizing: "border-box",
    ...KEEP_COLOURS,
  },
  // In bar mode, each list option shows a small bar instead of a dot.
  optionBar: {
    flexShrink: 0,
    width: "4px",
    height: "16px",
    borderRadius: tokens.borderRadiusSmall,
    ...KEEP_COLOURS,
  },
});

function Indicator({ color, shape }: { color: HexColor | null; shape: "dot" | "optionBar" }) {
  const styles = useStyles();
  if (!color) return null;
  return <span aria-hidden="true" className={styles[shape]} style={{ backgroundColor: color }} />;
}

/**
 * Fail soft: if rendering ever throws, show the value as plain text rather
 * than breaking the form. When the rendered data changes (`renderKey`), it
 * tries the control again. Logs one warning per failure.
 */
export class RagChoiceErrorBoundary extends React.Component<
  { fallbackText: string; renderKey: string; children?: React.ReactNode },
  BoundaryState
> {
  public state: BoundaryState = { failed: false, renderKey: null };

  public static getDerivedStateFromProps(props: { renderKey: string }, state: BoundaryState): BoundaryState | null {
    return resetBoundary(state, props.renderKey);
  }

  public static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true };
  }

  public componentDidCatch(error: unknown): void {
    console.warn("RagChoice: rendering failed, showing the value as text", error);
  }

  public render(): React.ReactNode {
    return this.state.failed ? <span>{this.props.fallbackText}</span> : this.props.children;
  }
}

export function RagChoiceView(props: RagChoiceViewProps): React.ReactElement {
  const { items, display, indicator, readOnly, required, ariaLabel, theme, onChange } = props;
  const styles = useStyles();
  const showBar = indicator === "bar" && display.color !== null;
  const dot = indicator === "dot" ? <Indicator color={display.color} shape="dot" /> : null;

  const onOptionSelect = React.useCallback(
    (_event: SelectionEvents, data: OptionOnSelectData) => onChange(data.optionValue),
    [onChange],
  );

  const buttonContent = display.text ? (
    <span className={styles.value}>
      {dot}
      {display.text}
    </span>
  ) : (
    <span className={mergeClasses(styles.value, styles.placeholder)}>{PLACEHOLDER}</span>
  );

  return (
    <FluentProvider theme={theme ?? webLightTheme} className={styles.provider}>
      <div className={styles.root}>
        {showBar && <span aria-hidden="true" className={styles.bar} style={{ backgroundColor: display.color ?? undefined }} />}
        {readOnly ? (
          <Input
            className={styles.dropdown}
            appearance={APPEARANCE}
            aria-label={ariaLabel}
            readOnly
            value={display.text}
            placeholder={READ_ONLY_EMPTY}
            contentBefore={dot && display.color ? { className: styles.readOnlyDot, children: dot } : undefined}
          />
        ) : (
          <Dropdown
            className={styles.dropdown}
            appearance={APPEARANCE}
            aria-label={ariaLabel}
            aria-required={required || undefined}
            value={display.text}
            placeholder={PLACEHOLDER}
            selectedOptions={display.selectedKey === null ? [] : [display.selectedKey]}
            onOptionSelect={onOptionSelect}
            button={{ children: buttonContent }}
          >
            {items.map((item) => (
              <Option key={item.key} value={item.key} text={item.label} disabled={item.disabled}>
                <span className={styles.value}>
                  <Indicator color={item.color} shape={indicator === "bar" ? "optionBar" : "dot"} />
                  {item.label}
                </span>
              </Option>
            ))}
          </Dropdown>
        )}
      </div>
    </FluentProvider>
  );
}
