"use client";
import { createContext, useContext } from "react";
import type { RoomController } from "./controller";
import { useRoom } from "./store";

export const ControllerContext = createContext<RoomController | null>(null);

export function useController(): RoomController {
  const c = useContext(ControllerContext);
  if (!c) throw new Error("useController outside room");
  return c;
}

/** Re-render whenever LiveKit state changes; returns the live Room. */
export function useLk() {
  useRoom((s) => s.lk);
  return useController().room;
}
