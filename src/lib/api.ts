"use client";
import type { ApiError } from "./protocol";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? (init?.body ? "POST" : "GET"),
      headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : init?.method && init.method !== "GET" ? undefined : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: init?.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiRequestError(0, "network", "Can’t reach Closeby. Check your connection and try again.");
  }
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = (data as ApiError | undefined)?.error;
    throw new ApiRequestError(res.status, err?.code ?? "http_" + res.status, err?.message ?? "Something went wrong. Please try again.", data);
  }
  return data as T;
}
