"use client";
import { useEffect, useState } from "react";
import { browserProfile } from "./browser-profile";

/** Opt-in toggle: keep Google/YouTube sign-ins in the shared browser on this device. */
export function RememberSignIn() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(browserProfile.remembering()), []);
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-left text-[12.5px] leading-snug text-paper-dim">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-[#ff0033]"
        checked={on}
        onChange={(e) => {
          browserProfile.setRemembering(e.target.checked);
          setOn(e.target.checked);
        }}
        data-testid="remember-signin"
      />
      <span>
        Keep me signed in to YouTube &amp; Google next time I open it from this device.{" "}
        <span className="text-white/45">Your partner sees and can use the same screen while it’s open.</span>
      </span>
    </label>
  );
}
