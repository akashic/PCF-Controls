// Smoke test of the React view (outside the coverage gate; checked in dev too).
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RendererProvider, createDOMRenderer, renderToStyleElements } from "@fluentui/react-components";
import { normalizeHex, type HexColor } from "@wb-pcf/shared";
import { buildChoiceItems, displayValue } from "../RagChoice/logic";
import { RagChoiceErrorBoundary, RagChoiceView, type RagChoiceViewProps } from "../RagChoice/RagChoiceView";

const RED = normalizeHex("#D13438") as HexColor;
const items = buildChoiceItems([{ Label: "Red", Value: 1, Color: RED }], null, false);

function render(props: Partial<RagChoiceViewProps> = {}) {
  const renderer = createDOMRenderer();
  const html = renderToStaticMarkup(
    <RendererProvider renderer={renderer}>
      <RagChoiceView
        items={items}
        display={displayValue(items, 1, true)}
        indicator="dot"
        readOnly={false}
        required={false}
        ariaLabel="RAG status"
        theme={undefined}
        onChange={() => undefined}
        {...props}
      />
    </RendererProvider>,
  );
  const css = renderToStaticMarkup(<>{renderToStyleElements(renderer)}</>);
  return { html, css };
}

/** The atomic class Griffel generated for one declaration, such as `forced-color-adjust:none`. */
function classFor(css: string, declaration: string): string {
  const match = new RegExp(`\\.([\\w-]+)\\{${declaration}[;}]`).exec(css);
  if (!match) throw new Error(`no class for ${declaration}`);
  return match[1];
}

/** The class attribute of the element with this inline background colour (the dot or bar). */
function indicatorClasses(html: string): string[] {
  return [...html.matchAll(/class="([^"]+)" style="background-color:#D13438"/g)].map((m) => m[1]);
}

describe("RagChoiceView", () => {
  it("marks a required dropdown aria-required", () => {
    expect(render({ required: true }).html).toMatch(/role="combobox"[^>]*aria-required="true"|aria-required="true"[^>]*role="combobox"/);
  });

  it("leaves aria-required off an optional dropdown", () => {
    expect(render().html).not.toContain("aria-required");
  });

  it.each([["dot" as const], ["bar" as const]])("keeps the %s's colour in forced-colours mode", (indicator) => {
    const { html, css } = render({ indicator });
    const keep = classFor(css, "forced-color-adjust:none");
    const classes = indicatorClasses(html);
    expect(classes.length).toBeGreaterThan(0);
    for (const c of classes) expect(c.split(" ")).toContain(keep);
  });
});

describe("RagChoiceErrorBoundary", () => {
  const props = (key: string) => ({ fallbackText: "Red", renderKey: key });
  const derive = (key: string, state: { failed: boolean; renderKey: string | null }) =>
    RagChoiceErrorBoundary.getDerivedStateFromProps(props(key), state) ?? state;

  it("shows the fallback text after a failure, and the control again once the data changes", () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const boundary = new RagChoiceErrorBoundary({ ...props("a"), children: <span>control</span> });
    boundary.state = derive("a", boundary.state);
    boundary.state = { ...boundary.state, ...RagChoiceErrorBoundary.getDerivedStateFromError() };
    // A re-render with the same data stays on the fallback.
    boundary.state = derive("a", boundary.state);
    expect(renderToStaticMarkup(<>{boundary.render()}</>)).toBe("<span>Red</span>");
    // New data (a new value, options or a lock) tries the control again.
    boundary.state = derive("b", boundary.state);
    expect(renderToStaticMarkup(<>{boundary.render()}</>)).toBe("<span>control</span>");
  });
});
