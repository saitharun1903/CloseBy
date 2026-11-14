# Closeby browser host (parked prototype)

Closeby's own shared browser: a real Chromium per room, running on a virtual
display, streamed into the room's LiveKit call as an extra participant
(screen + sound), and driven by mouse/keyboard events sent over the data
channel.

**Status: parked.** It is not connected to the app. It needs an always-on
Linux server (it can't run on Vercel), so the app keeps using Hyperbeam.
Verified locally: Chromium streamed at ~25 fps into a local LiveKit room, and
address-bar navigation over the data channel worked.

Remaining work if revived: app integration (provider + token for the bot,
LiveKit room cap 3 with the bot hidden from "partner" logic, client view with
our own address bar, input capture, partner cursor), Dockerfile, deployment.

Free hosting option: Oracle Cloud "Always Free" (Mumbai/Hyderabad). Needs a
card for identity verification at sign-up.

Run (Linux with Xvfb, ffmpeg, PulseAudio, Chromium):

    npm install
    BROWSER_HOST_SECRET=<32+ chars> CHROME_PATH=/path/to/chrome npm start
