import { ArrowRight, ArrowUpRight, Link as LinkIcon } from "lucide-react";
import { CreateRoomDialog } from "@/components/landing/create-room-dialog";
import { JoinRoomDialog } from "@/components/landing/join-room-dialog";
import { RoomPreview } from "@/components/landing/room-preview";
import { Logo } from "@/components/logo";
import { Warmup } from "@/components/warmup";
import { cn } from "@/lib/cn";

/*
 * Landing — "a private cinema for two".
 * Warm projector light on near-black, an editorial serif for the voice,
 * film grain, and the product itself lit like the screen in a dark room.
 */

const SHOWING = ["YouTube, signed in", "Your own films", "Any website", "Live reactions", "A nudge across the miles", "Sleep timer for two", "Faces, always", "Perfect sync"];

export default function Landing() {
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-velvet text-cream selection:bg-glow/30">
      <Warmup />

      {/* Atmosphere: projector beam, warm floor light, grain. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[1500px] overflow-hidden">
        <div className="absolute left-1/2 top-[-120px] h-[1100px] w-[1500px] -translate-x-1/2 animate-flicker bg-[conic-gradient(from_180deg_at_50%_0%,transparent_158deg,rgb(255_179_107/0.13)_172deg,rgb(255_211_161/0.2)_180deg,rgb(255_179_107/0.13)_188deg,transparent_202deg)] blur-2xl" />
        <div className="absolute left-1/2 top-[-260px] h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_179_107/0.18),transparent)]" />
      </div>
      <div aria-hidden className="grain pointer-events-none fixed inset-0 z-50 opacity-[0.07] mix-blend-overlay" />

      <header className="relative z-10 mx-auto flex max-w-[1240px] items-center justify-between px-5 pt-[calc(var(--safe-top)+20px)] sm:px-8">
        <Logo className="text-cream" />
        <nav className="flex items-center gap-1 sm:gap-2">
          <a href="#how" className="hidden rounded-full px-3 py-2 text-[14px] text-cream/60 transition-colors hover:text-cream sm:block">
            How it works
          </a>
          <a href="#privacy" className="hidden rounded-full px-3 py-2 text-[14px] text-cream/60 transition-colors hover:text-cream sm:block">
            Privacy
          </a>
          <JoinRoomDialog>
            <button className="h-9 rounded-full border border-cream/15 px-4 text-[14px] font-medium text-cream transition-colors hover:border-cream/30 hover:bg-cream/[0.06]">Join a room</button>
          </JoinRoomDialog>
        </nav>
      </header>

      <main className="relative">
        {/* ───────────── Hero ───────────── */}
        <section className="mx-auto max-w-[1240px] px-5 pb-10 pt-14 text-center sm:px-8 sm:pt-24 [@media(max-height:520px)]:pt-8">
          <p className="mx-auto flex w-fit animate-rise items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-glow-soft/80">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-glow/60" />A private cinema for two
            <span className="h-px w-8 bg-gradient-to-l from-transparent to-glow/60" />
          </p>
          <h1 className="mx-auto mt-7 max-w-[1000px] font-serif text-[clamp(54px,10.5vw,138px)] font-normal [@media(max-height:520px)]:text-[clamp(40px,7vw,64px)] leading-[0.9] tracking-[-0.025em] text-cream">
            <span className="block animate-rise [animation-delay:80ms]">Movie night,</span>
            <span className="block animate-rise [animation-delay:180ms]">
              <em className="bg-gradient-to-b from-glow-soft to-glow bg-clip-text pr-[0.06em] text-transparent">for two</em> —
            </span>
            <span className="block animate-rise [animation-delay:280ms]">wherever you are.</span>
          </h1>
          <p className="mx-auto mt-8 max-w-[540px] animate-rise text-balance text-[17px] leading-relaxed text-cream/65 [animation-delay:420ms] sm:text-[18px]">
            See each other’s faces while you watch YouTube, your own films or any website — in perfect sync, as if you were on the same sofa.
          </p>
          <div className="mt-10 flex animate-rise flex-col items-center justify-center gap-3 [animation-delay:520ms] sm:flex-row">
            <CreateRoomDialog>
              <button
                className="group flex h-14 w-full items-center justify-center gap-2 rounded-full bg-cream px-8 text-[16px] font-semibold text-[#120d09] shadow-[0_0_0_1px_rgb(255_255_255/0.2),0_18px_50px_-12px_rgb(255_179_107/0.55)] transition-[transform,box-shadow] duration-300 hover:shadow-[0_0_0_1px_rgb(255_255_255/0.3),0_24px_70px_-10px_rgb(255_179_107/0.75)] active:scale-[0.98] sm:w-auto"
                data-testid="create-room"
              >
                Start a room
                <ArrowRight className="size-[18px] transition-transform duration-300 group-hover:translate-x-0.5" />
              </button>
            </CreateRoomDialog>
            <JoinRoomDialog>
              <button className="flex h-14 w-full items-center justify-center gap-2 rounded-full border border-cream/15 px-7 text-[16px] font-medium text-cream transition-colors hover:border-cream/30 hover:bg-cream/[0.05] sm:w-auto">
                <LinkIcon className="size-[17px] opacity-70" /> I have a link
              </button>
            </JoinRoomDialog>
          </div>
          <p className="mt-6 flex animate-rise items-center justify-center gap-3 text-[13px] text-cream/40 [animation-delay:600ms]">
            <span>Free</span>
            <Dot />
            <span>No account</span>
            <Dot />
            <span>Nothing recorded</span>
          </p>

          {/* The screen. */}
          <div className="relative mx-auto mt-16 max-w-[1080px] animate-rise [animation-delay:700ms] sm:mt-20 [perspective:2200px]">
            <div className="relative [transform:rotateX(7deg)] [transform-origin:50%_100%]">
              <div aria-hidden className="absolute -inset-x-[8%] -top-[12%] bottom-[30%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(255_179_107/0.22),transparent)] blur-2xl" />
              <RoomPreview />
            </div>
            {/* Light spilling onto the floor. */}
            <div aria-hidden className="mx-auto -mt-2 h-24 w-[85%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(255_179_107/0.16),transparent)] blur-xl" />
          </div>
        </section>

        {/* ───────────── Now showing (ticker) ───────────── */}
        <section aria-label="What you can do together" className="relative border-y border-cream/[0.08] py-5 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
          <div className="flex w-max animate-marquee gap-10 whitespace-nowrap font-serif text-[26px] italic text-cream/75 sm:text-[30px]" aria-hidden>
            {[...SHOWING, ...SHOWING].map((t, i) => (
              <span key={i} className="flex items-center gap-10">
                {t}
                <span className="not-italic text-glow/70">✦</span>
              </span>
            ))}
          </div>
          <ul className="sr-only">
            {SHOWING.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        {/* ───────────── How it works ───────────── */}
        <section id="how" aria-labelledby="how-title" className="mx-auto max-w-[1240px] scroll-mt-10 px-5 py-24 sm:px-8 sm:py-32">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
            <div>
              <Eyebrow>Tonight’s programme</Eyebrow>
              <h2 id="how-title" className="mt-5 font-serif text-[clamp(40px,6vw,72px)] leading-[0.95] tracking-[-0.02em]">
                Three steps <em className="text-glow-soft">to the</em> same sofa.
              </h2>
              <p className="mt-6 max-w-[400px] text-[16px] leading-relaxed text-cream/60">No downloads, no accounts, no browser extensions. It works on phones, tablets and laptops.</p>
            </div>
            <ol className="divide-y divide-cream/[0.08] border-y border-cream/[0.08]">
              <Step n="i." title="Open a room">
                One tap gives you a private room that holds exactly two people. Add a PIN if you like.
              </Step>
              <Step n="ii." title="Send the link">
                Share it however you talk — WhatsApp, iMessage, anything. They’re in with one tap, no sign-up.
              </Step>
              <Step n="iii." title="Press play — together">
                Pick a YouTube video, a film on your laptop or any website. When either of you pauses, it pauses for both.
              </Step>
            </ol>
          </div>
        </section>

        {/* ───────────── Features (bento) ───────────── */}
        <section aria-labelledby="features" className="mx-auto max-w-[1240px] px-5 pb-24 sm:px-8 sm:pb-32">
          <div className="max-w-[720px]">
            <Eyebrow>The details</Eyebrow>
            <h2 id="features" className="mt-5 font-serif text-[clamp(40px,6vw,72px)] leading-[0.95] tracking-[-0.02em]">
              Made for the two of you, <em className="text-glow-soft">down to the frame.</em>
            </h2>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-6">
            <Card className="md:col-span-4 md:row-span-2" title="In sync, to the frame." kicker="Sync">
              <p>
                The server keeps one clock for the room. Pause, skip or change speed on either side and both screens follow — then quietly correct any drift, so you laugh at the same moment.
              </p>
              <SyncVisual />
            </Card>
            <Card className="md:col-span-2" title="Real YouTube, signed in." kicker="Watch">
              <p>Open youtube.com inside the room, sign in with Google, and keep your playlists and Premium.</p>
            </Card>
            <Card className="md:col-span-2" title="Any website." kicker="Browse">
              <p>A shared cloud browser you both see, hear and click. Plan a trip, shop, scroll together.</p>
            </Card>
            <Card className="md:col-span-3" title="Little rituals." kicker="Together">
              <p>Send a nudge that buzzes their phone. Set a sleep timer and drift off to the same film.</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Chip>
                  <span className="text-[#ff5c7a]">♥</span> Nudge
                </Chip>
                <Chip>
                  ☾ <span className="font-mono text-[12px] text-cream/70">29:59</span>
                </Chip>
                <Chip>🍿 😂 😮</Chip>
                <Chip>Lower film when talking</Chip>
              </div>
            </Card>
            <Card className="md:col-span-3" title="Two volume knobs." kicker="Sound">
              <p>Turn the film down without turning them down. Your mic is never mixed with the movie.</p>
              <div className="mt-6 space-y-3">
                <Knob label="Film" value={0.62} />
                <Knob label="Their voice" value={0.9} />
              </div>
            </Card>
            <Card className="md:col-span-3" title="Your own films, never uploaded." kicker="Files">
              <p>You each pick your copy of the file and it plays in sync. It never leaves your device.</p>
            </Card>
            <Card className="md:col-span-3" title="Faces, always." kicker="Call">
              <p>HD video and clear voices beside the film, never on top of it. Drag your cameras anywhere.</p>
            </Card>
          </div>
        </section>

        {/* ───────────── Privacy ───────────── */}
        <section id="privacy" aria-labelledby="privacy-title" className="scroll-mt-10 border-t border-cream/[0.08]">
          <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] lg:gap-20">
            <div>
              <Eyebrow>Privacy</Eyebrow>
              <h2 id="privacy-title" className="mt-5 font-serif text-[clamp(44px,6.5vw,84px)] leading-[0.92] tracking-[-0.02em]">
                Nothing recorded.
                <br />
                <em className="text-cream/45">Nothing kept.</em>
              </h2>
              <p className="mt-6 max-w-[420px] text-[16px] leading-relaxed text-cream/60">There’s very little to keep, and we keep it briefly. This is everything that exists while a room is open.</p>
            </div>
            <dl className="self-end">
              <Fact term="Never leaves your device">Films you choose. You each pick your own copy; we only see its name and size.</Fact>
              <Fact term="Never recorded">Video, voice and screen shares travel live between you and are never stored.</Fact>
              <Fact term="Never on our servers">Chat messages pass between the two of you and vanish when the room closes.</Fact>
              <Fact term="Gone within 12 hours">Your display names, the room code, playback position and the titles in your queue.</Fact>
            </dl>
          </div>
        </section>

        {/* ───────────── Closing ───────────── */}
        <section className="relative overflow-hidden border-t border-cream/[0.08]">
          <div aria-hidden className="absolute left-1/2 top-full h-[600px] w-[1200px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(255_179_107/0.2),transparent)]" />
          <div className="relative mx-auto max-w-[1240px] px-5 py-28 text-center sm:px-8 sm:py-36">
            <p className="font-serif text-[clamp(44px,8vw,112px)] leading-[0.92] tracking-[-0.02em]">
              Tonight’s showing:
              <br />
              <em className="bg-gradient-to-b from-glow-soft to-glow bg-clip-text pr-[0.06em] text-transparent">the two of you.</em>
            </p>
            <div className="mt-12 flex justify-center">
              <CreateRoomDialog>
                <button
                  className="group flex h-14 items-center gap-2 rounded-full bg-cream px-8 text-[16px] font-semibold text-[#120d09] shadow-[0_18px_50px_-12px_rgb(255_179_107/0.55)] transition-[box-shadow] duration-300 hover:shadow-[0_24px_70px_-10px_rgb(255_179_107/0.75)] active:scale-[0.98]"
                  data-testid="create-room-footer"
                >
                  Start a room <ArrowUpRight className="size-[18px] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </button>
              </CreateRoomDialog>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative mx-auto flex max-w-[1240px] flex-col gap-3 border-t border-cream/[0.08] px-5 py-8 pb-[calc(var(--safe-bottom)+32px)] text-[13px] text-cream/40 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span className="flex items-center gap-2">
          <Logo className="scale-90 text-cream/70" /> <span>— made for two.</span>
        </span>
        <span>Works in Chrome, Edge, Safari and Firefox. Headphones make it better.</span>
      </footer>
    </div>
  );
}

function Dot() {
  return <span aria-hidden className="size-1 rounded-full bg-glow/50" />;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-glow-soft/75">
      <span className="h-px w-8 bg-glow/50" />
      {children}
    </p>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[56px_minmax(0,1fr)] gap-4 py-8 sm:grid-cols-[88px_minmax(0,1fr)] sm:py-10">
      <span className="font-serif text-[34px] italic leading-none text-glow/80 sm:text-[44px]">{n}</span>
      <div>
        <h3 className="text-[19px] font-semibold tracking-[-0.015em] text-cream sm:text-[21px]">{title}</h3>
        <p className="mt-2 max-w-[460px] text-[15px] leading-relaxed text-cream/60 sm:text-[16px]">{children}</p>
      </div>
    </li>
  );
}

function Card({ title, kicker, className, children }: { title: string; kicker: string; className?: string; children: React.ReactNode }) {
  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[28px] border border-cream/[0.08] bg-[linear-gradient(180deg,rgb(255_255_255/0.035),rgb(255_255_255/0.01))] p-7 transition-colors duration-500 hover:border-glow/25 sm:p-8",
        "[&>p]:mt-3 [&>p]:max-w-[520px] [&>p]:text-[15px] [&>p]:leading-relaxed [&>p]:text-cream/60",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-[radial-gradient(closest-side,rgb(255_179_107/0.14),transparent)] opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-glow-soft/60">{kicker}</span>
      <h3 className="mt-4 font-serif text-[30px] leading-[1.02] tracking-[-0.01em] text-cream sm:text-[34px]">{title}</h3>
      {children}
    </article>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-cream/10 bg-cream/[0.04] px-3.5 text-[13px] font-medium text-cream/85">{children}</span>;
}

function Knob({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-24 shrink-0 text-[13px] text-cream/60">{label}</span>
      <span className="relative h-1 flex-1 rounded-full bg-cream/10">
        <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-glow/60 to-glow-soft" style={{ width: `${value * 100}%` }} />
        <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cream shadow-[0_0_12px_rgb(255_179_107/0.6)]" style={{ left: `${value * 100}%` }} />
      </span>
      <span className="w-9 text-right font-mono text-[12px] text-cream/50">{Math.round(value * 100)}</span>
    </div>
  );
}

/** Two timelines, one playhead: what "in sync" means. */
function SyncVisual() {
  return (
    <div aria-hidden className="mt-auto pt-10">
      <div className="rounded-2xl border border-cream/[0.08] bg-black/30 p-5 sm:p-6">
        <div className="relative space-y-5">
          {[
            ["Maya", "Mumbai", 0.61],
            ["Sam", "London", 0.61],
          ].map(([name, city, v]) => (
            <div key={name as string} className="flex items-center gap-4">
              <span className="w-28 shrink-0 leading-tight">
                <span className="block text-[14px] font-semibold text-cream">{name}</span>
                <span className="block text-[12px] text-cream/40">{city}</span>
              </span>
              <span className="relative h-1.5 flex-1 rounded-full bg-cream/10">
                <span className="absolute inset-y-0 left-0 rounded-full bg-cream/70" style={{ width: `${(v as number) * 100}%` }} />
              </span>
            </div>
          ))}
          {/* the shared playhead */}
          <span className="pointer-events-none absolute -bottom-2 -top-2 left-[calc(8rem+(100%-8rem)*0.61)] w-px bg-glow shadow-[0_0_14px_2px_rgb(255_179_107/0.7)]" />
        </div>
        <div className="mt-6 flex items-center justify-between border-t border-cream/[0.08] pt-4 font-mono text-[12px] text-cream/50">
          <span>
            <span className="mr-2 inline-block size-1.5 rounded-full bg-ok align-middle" />
            In sync
          </span>
          <span>drift 0.04 s</span>
        </div>
      </div>
    </div>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-cream/[0.08] py-6 last:border-b sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-8">
      <dt className="text-[15px] font-semibold text-cream">{term}</dt>
      <dd className="text-[15px] leading-relaxed text-cream/60">{children}</dd>
    </div>
  );
}
