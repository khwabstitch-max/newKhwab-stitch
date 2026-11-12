import { beforeEach, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "../components/ui";
import { setLanguage } from "../i18n/core";

beforeEach(() => { setLanguage("en", false); });

it.each(["input", "select", "textarea"])("associates a custom %s with its label, existing help and validation", type => {
  const Control = type;
  render(<>
    <p id="original-help">Keep the original detail.</p>
    <Field name="different-name" label="Measurements" hint="Use the selected unit." error="Please enter a valid value.">
      <Control id="actual-control" aria-describedby="original-help" required>{type === "select" ? <option value="">Select</option> : undefined}</Control>
    </Field>
  </>);
  const input = screen.getByLabelText("Measurements", { exact: false });
  expect(input).toHaveAttribute("id", "actual-control");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("Keep the original detail. Use the selected unit. Please enter a valid value.");
});

it("generates distinct stable labels and help for unnamed controls", () => {
  const { rerender } = render(<><Field label="First value" hint="First help" /><Field label="Second value" hint="Second help" /></>);
  const first = screen.getByLabelText("First value").id;
  expect(first).not.toBe(screen.getByLabelText("Second value").id);
  rerender(<><Field label="First value" hint="First help" /><Field label="Second value" hint="Second help" /></>);
  expect(screen.getByLabelText("First value").id).toBe(first);
  expect(screen.getByLabelText("First value")).toHaveAccessibleDescription("First help");
});
