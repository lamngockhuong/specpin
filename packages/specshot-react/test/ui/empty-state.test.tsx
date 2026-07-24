import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "../../src/ui/empty-state.js";

function makeFile(name = "shot.png"): File {
  return new File(["data"], name, { type: "image/png" });
}

describe("EmptyState", () => {
  it("invokes onLoadImage when a file is chosen via the file input", () => {
    const onLoadImage = vi.fn();
    const { container } = render(<EmptyState onLoadImage={onLoadImage} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile();
    fireEvent.change(input, { target: { files: [file] } });
    expect(onLoadImage).toHaveBeenCalledWith(file);
  });

  it("invokes onLoadImage on drop and toggles drag-over styling", () => {
    const onLoadImage = vi.fn();
    const { container } = render(<EmptyState onLoadImage={onLoadImage} />);
    const dropZone = container.querySelector(".empty-state") as HTMLElement;

    fireEvent.dragOver(dropZone);
    expect(dropZone.className).toContain("drag-over");

    const file = makeFile("shot.svg");
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    expect(onLoadImage).toHaveBeenCalledWith(file);
  });

  it("opens the file picker from the button", () => {
    const { container } = render(<EmptyState onLoadImage={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    fireEvent.click(screen.getByText(/choose image/i));
    expect(clickSpy).toHaveBeenCalled();
  });
});
