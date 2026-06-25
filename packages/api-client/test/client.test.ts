import { describe, expect, it, vi } from "vitest";
import { SidecarClient, SidecarError } from "../src/index.js";
import type { Spec } from "@specpin/spec-schema";

const sampleSpec: Spec = {
  id: "login-btn",
  title: "Login",
  description: "submits the form",
  fingerprint: {
    cssSelector: "button",
    xpath: "/button",
    domPath: ["button"],
    tagName: "button",
    attributes: {},
    positionHint: { index: 0, siblingCount: 1 },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function client(fetchImpl: typeof fetch) {
  return new SidecarClient({ baseUrl: "http://127.0.0.1:9999/", token: "tok", fetch: fetchImpl });
}

describe("SidecarClient requests", () => {
  it("health() returns the parsed health payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true, version: "1.0", project: "Demo" }),
    );
    const res = await client(fetchImpl).health();
    expect(res).toEqual({ ok: true, version: "1.0", project: "Demo" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:9999/health");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("getSpecs() returns manifest + specs", async () => {
    const payload = { manifest: { version: "1.0" }, specs: [{ ...sampleSpec, _file: "a.spec.json" }] };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(payload));
    const res = await client(fetchImpl).getSpecs();
    expect(res.specs[0]._file).toBe("a.spec.json");
  });

  it("saveSpec() POSTs { file, spec }", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ file: "a.spec.json", spec: sampleSpec }));
    await client(fetchImpl).saveSpec("a.spec.json", sampleSpec);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:9999/specs");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ file: "a.spec.json", spec: sampleSpec });
  });

  it("updateSpec() PUTs to the id-scoped path", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "login-btn", spec: sampleSpec }));
    await client(fetchImpl).updateSpec("login-btn", sampleSpec);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:9999/specs/login-btn");
    expect(init.method).toBe("PUT");
  });

  it("deleteSpec() handles a 204 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(client(fetchImpl).deleteSpec("login-btn")).resolves.toBeUndefined();
    expect(fetchImpl.mock.calls[0][1].method).toBe("DELETE");
  });
});

describe("SidecarClient errors", () => {
  it("surfaces a 401 as SidecarError, not a raw fetch result", async () => {
    // Fresh Response per call: a Response body can only be read once.
    const fetchImpl = vi.fn().mockImplementation(() => jsonResponse({ error: "invalid token" }, 401));
    try {
      await client(fetchImpl).health();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SidecarError);
      const err = e as SidecarError;
      expect(err.status).toBe(401);
      expect(err.code).toBe("invalid token");
      expect(err.isAuthError).toBe(true);
    }
  });

  it("passes through schema validation details from a 400", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: "schema_invalid", details: ["/fingerprint is required"] }, 400),
    );
    try {
      await client(fetchImpl).saveSpec("a.spec.json", sampleSpec);
      expect.unreachable();
    } catch (e) {
      expect((e as SidecarError).details).toEqual(["/fingerprint is required"]);
    }
  });

  it("wraps network failures", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(client(fetchImpl).health()).rejects.toMatchObject({ code: "network_error" });
  });
});

function changeStream(keepOpen: boolean): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode("event: change\ndata: {}\n\n"));
      if (!keepOpen) controller.close();
    },
  });
}

describe("SidecarClient.subscribe (SSE)", () => {
  it("fires onChange on a change frame", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(changeStream(true), { status: 200 }));
    const onChange = vi.fn();
    const stop = client(fetchImpl).subscribe(onChange, { baseBackoffMs: 5 });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    stop();
  });

  it("reconnects after the stream drops", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(changeStream(false), { status: 200 })) // ends -> triggers reconnect
      .mockResolvedValue(new Response(changeStream(true), { status: 200 }));
    const stop = client(fetchImpl).subscribe(() => {}, { baseBackoffMs: 5 });
    await vi.waitFor(() => expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(2));
    stop();
  });

  it("reports connection state transitions", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(changeStream(true), { status: 200 }));
    const states: string[] = [];
    const stop = client(fetchImpl).subscribe(() => {}, {
      baseBackoffMs: 5,
      onState: (s) => states.push(s),
    });
    await vi.waitFor(() => expect(states).toContain("open"));
    stop();
    expect(states).toContain("connecting");
    expect(states).toContain("closed");
  });
});
