import { afterEach, describe, expect, it, vi } from "vitest";
import { mountLauncher } from "../src/renderers/launcher.js";

function launcherHost(): HTMLElement | null {
  return document.getElementById("specpin-launcher-host-sidebar");
}

afterEach(() => {
  document.body.innerHTML = "";
  launcherHost()?.remove();
  document.getElementById("specpin-launcher-host-modal")?.remove();
});

describe("mountLauncher", () => {
  it("mounts a Shadow-DOM pill and reopens on click", () => {
    const onReopen = vi.fn();
    mountLauncher(document, { mode: "sidebar", onReopen });

    const pill = launcherHost()?.shadowRoot?.querySelector<HTMLButtonElement>(".pill");
    expect(pill).toBeTruthy();
    pill?.click();
    expect(onReopen).toHaveBeenCalledOnce();
  });

  it("increment() shows a running count", () => {
    const launcher = mountLauncher(document, { mode: "sidebar", onReopen: vi.fn() });
    const count = () =>
      launcherHost()?.shadowRoot?.querySelector<HTMLElement>(".count")?.textContent;

    expect(count()).toBe("");
    launcher.increment();
    expect(count()).toBe("· 1");
    launcher.increment();
    expect(count()).toBe("· 2");
  });

  it("applies a stored position as clamped left/top (not the default corner)", () => {
    mountLauncher(document, { mode: "sidebar", position: { x: 120, y: 240 }, onReopen: vi.fn() });
    const pill = launcherHost()?.shadowRoot?.querySelector<HTMLElement>(".pill");
    expect(pill?.style.left).toBe("120px");
    expect(pill?.style.top).toBe("240px");
    // Switched off the default bottom/right anchor.
    expect(pill?.style.right).toBe("auto");
    expect(pill?.style.bottom).toBe("auto");
  });

  it("destroy() removes the host", () => {
    const launcher = mountLauncher(document, { mode: "sidebar", onReopen: vi.fn() });
    expect(launcherHost()).toBeTruthy();
    launcher.destroy();
    expect(launcherHost()).toBeNull();
  });
});
