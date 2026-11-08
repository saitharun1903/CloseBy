"use client";
import { useEffect } from "react";

/** Wake the (scale-to-zero) database and a server instance before the user clicks anything. */
export function Warmup() {
  useEffect(() => {
    void fetch("/api/health", { cache: "no-store" }).catch(() => {});
  }, []);
  return null;
}
