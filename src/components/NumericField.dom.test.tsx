// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NumericField } from "@/components/NumericField";

afterEach(cleanup);

function Harness({
  locale = "sv-SE",
  initial = null,
  ...props
}: { locale?: string; initial?: number | null } & Partial<
  React.ComponentProps<typeof NumericField>
>) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <>
      <NumericField
        aria-label="field"
        locale={locale}
        value={value}
        onCommit={setValue}
        {...props}
      />
      <output data-testid="committed">{value === null ? "null" : String(value)}</output>
    </>
  );
}

const input = () => screen.getByLabelText("field") as HTMLInputElement;
const committed = () => screen.getByTestId("committed").textContent;
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });

describe("NumericField – transient typing states", () => {
  it("never rewrites the text while the user is typing", () => {
    render(<Harness />);
    for (const step of ["0", "0,", "0,2", "0,25"]) {
      type(step);
      expect(input().value).toBe(step);
    }
    expect(committed()).toBe("0.25");
  });

  it("keeps a lone decimal separator and does not snap to 0", () => {
    render(<Harness initial={5} />);
    type("1.");
    expect(input().value).toBe("1.");
    type("1.5");
    expect(committed()).toBe("1.5");
  });

  it("keeps a grouped, half-typed value", () => {
    render(<Harness />);
    type("1 234,");
    expect(input().value).toBe("1 234,");
    fireEvent.blur(input());
    expect(committed()).toBe("1234");
  });
});

describe("NumericField – commit semantics", () => {
  it.each([
    ["1 234,5", 1234.5],
    ["1.234,5", 1234.5],
    ["1,234.5", 1234.5],
    ["1234.5", 1234.5],
    ["1234,5", 1234.5],
    ["1\u00a0234,5", 1234.5],
    ["1\u202f234,5", 1234.5],
  ])("commits %s as %s", (text, expected) => {
    render(<Harness />);
    type(text);
    fireEvent.blur(input());
    expect(Number(committed())).toBeCloseTo(expected, 6);
  });

  it("clears to null on an empty field", () => {
    render(<Harness initial={12} />);
    type("");
    expect(committed()).toBe("null");
  });

  it("ignores letters and currency codes entirely", () => {
    render(<Harness />);
    type("0,25 SEK");
    expect(input().value).toBe("0,25 ");
    fireEvent.blur(input());
    expect(committed()).toBe("0.25");
  });

  it("rejects a negative value when negatives are not allowed", () => {
    render(<Harness />);
    type("-5");
    expect(input().value).toBe("5");
    expect(committed()).toBe("5");
  });

  it("allows negatives when the field opts in", () => {
    render(<Harness allowNegative />);
    type("-2,5");
    fireEvent.blur(input());
    expect(committed()).toBe("-2.5");
  });

  it("clamps out-of-range values only on blur", () => {
    render(<Harness min={0} max={90} />);
    type("1");
    expect(committed()).toBe("1");
    type("120");
    fireEvent.blur(input());
    expect(committed()).toBe("90");
  });

  it("cannot even type letters into the field", () => {
    render(<Harness initial={30} />);
    type("abc");
    expect(input().value).toBe("");
  });

  it("restores the last good value when the text is not a valid number", () => {
    render(<Harness initial={30} />);
    type("1,2,3");
    fireEvent.blur(input());
    expect(committed()).toBe("30");
    expect(input().value).toBe("30");
  });

  it("handles a very large pasted value", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    type("9 999 999,99");
    fireEvent.blur(input());
    expect(onCommit).toHaveBeenCalledWith(9999999.99);
  });

  it("writes back the locale's own decimal separator", () => {
    render(<Harness locale="en-US" />);
    type("1234,5");
    fireEvent.blur(input());
    expect(input().value).toBe("1234.5");
  });
});
