/**
 * Optional connection to the sidecar via @specpin/api-client. Authoring +
 * export never require this: the app is usable end to end with no sidecar
 * running (offline success metric, see phase-06 plan). When connected it
 * additionally offers persisting pending specs/shots and listing existing
 * specs/screens for the authoring form and screen picker.
 *
 * The live SidecarClient is kept in a ref (not just React state) so a caller
 * that awaits `connect()` and immediately calls `fetchExistingSpecs()` in the
 * same handler sees the freshly connected client — state updates are batched
 * and would otherwise still read the pre-connect (null) value from the
 * closure captured before the state update landed.
 */
import { SidecarClient, SidecarError, type SpecWithFile } from "@specpin/api-client";
import type { Screen, ShotConfig, Spec } from "@specpin/spec-schema";
import { useCallback, useRef, useState } from "react";

export interface SidecarConnectOptions {
  baseUrl: string;
  token: string;
}

export interface UseSidecarResult {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  /** Resolves true on a successful connection, false otherwise (see `error`). */
  connect: (options: SidecarConnectOptions) => Promise<boolean>;
  saveSpec: (file: string, spec: Spec) => Promise<void>;
  putShot: (shot: ShotConfig) => Promise<void>;
  /** Existing specs known to the sidecar (pending or pinned) — the host
   *  decides how to present them (e.g. the "link existing spec" list). */
  fetchExistingSpecs: () => Promise<SpecWithFile[]>;
  fetchScreens: () => Promise<Screen[]>;
}

function messageOf(cause: unknown): string {
  if (cause instanceof SidecarError) return cause.message;
  return cause instanceof Error ? cause.message : "Could not reach the sidecar";
}

export function useSidecar(): UseSidecarResult {
  const clientRef = useRef<SidecarClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (options: SidecarConnectOptions): Promise<boolean> => {
    setConnecting(true);
    setError(null);
    const next = new SidecarClient(options);
    try {
      await next.health();
      clientRef.current = next;
      setConnected(true);
      return true;
    } catch (cause) {
      clientRef.current = null;
      setConnected(false);
      setError(messageOf(cause));
      return false;
    } finally {
      setConnecting(false);
    }
  }, []);

  const requireClient = useCallback((): SidecarClient => {
    if (!clientRef.current) throw new Error("Not connected to the sidecar");
    return clientRef.current;
  }, []);

  const saveSpec = useCallback(
    async (file: string, spec: Spec) => {
      await requireClient().saveSpec(file, spec);
    },
    [requireClient],
  );

  const putShot = useCallback(
    async (shot: ShotConfig) => {
      await requireClient().putShot(shot);
    },
    [requireClient],
  );

  const fetchExistingSpecs = useCallback(async (): Promise<SpecWithFile[]> => {
    const res = await requireClient().getSpecs();
    return res.specs;
  }, [requireClient]);

  const fetchScreens = useCallback(async (): Promise<Screen[]> => {
    const res = await requireClient().getScreens();
    return res.screens;
  }, [requireClient]);

  return {
    connected,
    connecting,
    error,
    connect,
    saveSpec,
    putShot,
    fetchExistingSpecs,
    fetchScreens,
  };
}
