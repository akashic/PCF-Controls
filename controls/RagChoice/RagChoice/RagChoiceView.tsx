import * as React from "react";
import {
  Dropdown,
  FluentProvider,
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
import { PLACEHOLDER, type ChoiceItem, type DisplayValue, type IndicatorStyle } from "./logic";

export interface RagChoiceViewProps {
  items: readonly ChoiceItem[];
  display: DisplayValue;
  indicator: IndicatorStyle;
  disabled: boolean;
  ariaLabel: string | undefined;
  /** The platform's token theme, if modern theming is on. */
  theme: Theme | undefined;
  onChange: (key: string | undefined) => void;
}

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
  // A small solid swatch with a neutral border, so pale colours stay visible on white.
  dot: {
    flexShrink: 0,
    width: "10px",
    height: "10px",
    borderRadius: tokens.borderRadiusCircular,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    boxSizing: "border-box",
  },
  // In bar mode, each list option shows a small bar instead of a dot.
  optionBar: {
    flexShrink: 0,
    width: "4px",
    height: "16px",
    borderRadius: tokens.borderRadiusSmall,
  },
});

function Indicator({ color, shape }: { color: HexColor | null; shape: "dot" | "optionBar" }) {
  const styles = useStyles();
  if (!color) return null;
  return <span aria-hidden="true" className={styles[shape]} style={{ backgroundColor: color }} />;
}

/**
 * Fail soft: if rendering ever throws, show the value as plain text rather
 * than breaking the form. Logs one warning per instance.
 */
export class RagChoiceErrorBoundary extends React.Component<
  { fallbackText: string; children?: React.ReactNode },
  { failed: boolean }
> {
  public state = { failed: false };

  public static getDerivedStateFromError(): { failed: boolean } {
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
  const { items, display, indicator, disabled, ariaLabel, theme, onChange } = props;
  const styles = useStyles();
  const showBar = indicator === "bar" && display.color !== null;

  const onOptionSelect = React.useCallback(
    (_event: SelectionEvents, data: OptionOnSelectData) => onChange(data.optionValue),
    [onChange],
  );

  const buttonContent = display.text ? (
    <span className={styles.value}>
      {indicator === "dot" && <Indicator color={display.color} shape="dot" />}
      {display.text}
    </span>
  ) : (
    <span className={mergeClasses(styles.value, styles.placeholder)}>{PLACEHOLDER}</span>
  );

  return (
    <FluentProvider theme={theme ?? webLightTheme} className={styles.provider}>
      <div className={styles.root}>
        {showBar && <span aria-hidden="true" className={styles.bar} style={{ backgroundColor: display.color ?? undefined }} />}
        <Dropdown
          className={styles.dropdown}
          aria-label={ariaLabel}
          disabled={disabled}
          value={display.text}
          placeholder={PLACEHOLDER}
          selectedOptions={display.selectedKey === null ? [] : [display.selectedKey]}
          onOptionSelect={onOptionSelect}
          button={{ children: buttonContent }}
        >
          {items.map((item) => (
            <Option key={item.key} value={item.key} text={item.label}>
              <span className={styles.value}>
                <Indicator color={item.color} shape={indicator === "bar" ? "optionBar" : "dot"} />
                {item.label}
              </span>
            </Option>
          ))}
        </Dropdown>
      </div>
    </FluentProvider>
  );
}
