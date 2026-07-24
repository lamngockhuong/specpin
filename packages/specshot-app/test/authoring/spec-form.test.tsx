import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpecForm } from "../../src/authoring/spec-form.js";

function baseProps() {
  return {
    itemNo: "1",
    locale: "en",
    existingSpecs: [] as { id: string; title: string }[],
    onPendingSpecBuilt: vi.fn(),
    onExistingSpecSelected: vi.fn(),
  };
}

describe("SpecForm", () => {
  it("builds a fingerprint-less pending Spec from valid localized content", () => {
    const onPendingSpecBuilt = vi.fn();
    render(<SpecForm {...baseProps()} onPendingSpecBuilt={onPendingSpecBuilt} />);

    fireEvent.change(screen.getByLabelText(/Spec id/), { target: { value: "login-submit-btn" } });
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Submit button" } });
    fireEvent.change(screen.getByLabelText(/Description/), {
      target: { value: "Submits the login form" },
    });
    fireEvent.change(screen.getByLabelText(/Business rules/), {
      target: { value: "Disabled while submitting\nShows a spinner" },
    });
    fireEvent.click(screen.getByText("Save pending spec"));

    expect(onPendingSpecBuilt).toHaveBeenCalledTimes(1);
    const result = onPendingSpecBuilt.mock.calls[0]?.[0];
    expect(result.valid).toBe(true);
    expect(result.spec).toMatchObject({
      id: "login-submit-btn",
      title: { en: "Submit button" },
      description: { en: "Submits the login form" },
      businessRules: [{ en: "Disabled while submitting" }, { en: "Shows a spinner" }],
    });
    expect(result.spec.fingerprint).toBeUndefined();
  });

  it("surfaces a validation error and does not call onPendingSpecBuilt for an empty id", () => {
    const onPendingSpecBuilt = vi.fn();
    const { container } = render(
      <SpecForm {...baseProps()} onPendingSpecBuilt={onPendingSpecBuilt} />,
    );

    // Bypass the required-field browser validation by submitting the form directly.
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Title" } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: "Desc" } });
    fireEvent.submit(screen.getByText("Save pending spec").closest("form") as HTMLFormElement);

    expect(onPendingSpecBuilt).not.toHaveBeenCalled();
    const errorEl = container.querySelector(".form-error");
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toBeTruthy();
  });

  it("switches to the existing-spec path and links the chosen specId", () => {
    const onExistingSpecSelected = vi.fn();
    render(
      <SpecForm
        {...baseProps()}
        existingSpecs={[{ id: "checkout-cta", title: "Checkout CTA" }]}
        onExistingSpecSelected={onExistingSpecSelected}
      />,
    );

    fireEvent.click(screen.getByText("Existing spec"));
    fireEvent.change(screen.getByLabelText(/Existing spec/), {
      target: { value: "checkout-cta" },
    });
    fireEvent.click(screen.getByText("Link existing spec"));

    expect(onExistingSpecSelected).toHaveBeenCalledWith("checkout-cta");
  });

  it("disables the existing-spec mode toggle when the host supplies no options", () => {
    render(<SpecForm {...baseProps()} existingSpecs={[]} />);
    expect(screen.getByText("Existing spec")).toBeDisabled();
  });
});
