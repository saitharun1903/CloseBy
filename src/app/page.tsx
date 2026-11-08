import { ArrowRight, Globe, Link as LinkIcon, Lock, MonitorPlay, PlayCircle, SlidersHorizontal, Users } from "lucide-react";
import { CreateRoomDialog } from "@/components/landing/create-room-dialog";
import { JoinRoomDialog } from "@/components/landing/join-room-dialog";
import { RoomPreview } from "@/components/landing/room-preview";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-black">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-420px] h-[900px] w-[1400px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgb(10_132_255/0.16),transparent)]" />

      <header className="relative mx-auto flex max-w-[1200px] items-center justify-between px-5 pt-[calc(var(--safe-top)+18px)] sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2">
          <a href="#privacy" className="hidden rounded-full px-3 py-2 text-[14px] text-paper-dim transition-colors hover:text-paper sm:block">
            Privacy
          </a>
          <JoinRoomDialog>
            <Button variant="secondary" size="sm">
              Join a room
            </Button>
          </JoinRoomDialog>
        </nav>
      </header>

      <main className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
        <section className="pb-16 pt-16 text-center sm:pt-24">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1 text-[13px] font-medium text-paper-dim">
            <span className="size-1.5 rounded-full bg-ok" /> Private rooms for two
          </p>
          <h1 className="mx-auto mt-6 max-w-[880px] text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] text-paper sm:text-[76px]">
            Watch together.
            <br />
            <span className="bg-gradient-to-r from-[#7cc4ff] via-[#a78bfa] to-[#ff8a7a] bg-clip-text text-transparent">Feel like you’re together.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-[560px] text-[18px] leading-relaxed text-paper-dim">
            Video call while you watch YouTube, your own films, or browse the web together — perfectly in sync, with no screen-sharing hassle.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <CreateRoomDialog>
              <Button variant="primary" size="lg" data-testid="create-room">
                Start a room <ArrowRight />
              </Button>
            </CreateRoomDialog>
            <JoinRoomDialog>
              <Button variant="secondary" size="lg">
                <LinkIcon /> I have a link
              </Button>
            </JoinRoomDialog>
          </div>
          <p className="mt-5 text-[13px] text-paper-faint">Free · No account · Nothing is recorded</p>

          <div className="mx-auto mt-16 max-w-[1040px] animate-fade-in [animation-delay:120ms]">
            <RoomPreview />
          </div>
        </section>

        <section aria-labelledby="features" className="py-16">
          <h2 id="features" className="text-center text-[32px] font-semibold tracking-[-0.035em] sm:text-[44px]">
            Everything a movie night needs.
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Feature icon={PlayCircle} title="YouTube, built in">
              Search or paste a link. Play, pause and skip for both of you — no extensions.
            </Feature>
            <Feature icon={Globe} title="Browse together">
              Open a shared browser and go anywhere. You both see it, hear it and can click.
            </Feature>
            <Feature icon={MonitorPlay} title="Your own films">
              Each picks their copy of a file and it plays in perfect sync. Nothing is uploaded.
            </Feature>
            <Feature icon={Users} title="Faces, always">
              Crisp HD video calling with draggable picture-in-picture while you watch.
            </Feature>
            <Feature icon={SlidersHorizontal} title="Two volume knobs">
              Turn the video down without turning your friend down. Your mic stays separate.
            </Feature>
            <Feature icon={Lock} title="Just the two of you">
              Rooms hold exactly two people, can have a PIN, and delete themselves after 12 hours.
            </Feature>
          </div>
        </section>

        <section id="privacy" aria-labelledby="privacy-title" className="mb-16 rounded-[32px] bg-ink-900 p-8 ring-1 ring-white/[0.06] sm:p-12">
          <div className="grid gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
            <div>
              <h2 id="privacy-title" className="text-[32px] font-semibold leading-[1.08] tracking-[-0.035em]">
                Private by design.
              </h2>
              <p className="mt-4 max-w-[380px] text-[16px] leading-relaxed text-paper-dim">There’s very little to keep, and we keep it briefly. Here’s exactly what exists while a room is open.</p>
            </div>
            <dl className="grid gap-px overflow-hidden rounded-2xl bg-white/[0.06] sm:grid-cols-2">
              <Fact term="Never leaves your device">Films you choose. You each pick your own copy; we only see its name and size.</Fact>
              <Fact term="Never recorded">Video, voice and screen shares travel live between you and are never stored.</Fact>
              <Fact term="Never stored on our servers">Chat messages pass between the two of you and vanish when the room closes.</Fact>
              <Fact term="Deleted within 12 hours">Your display names, the room code, playback position and watchlist titles.</Fact>
            </dl>
          </div>
        </section>
      </main>

      <footer className="relative mx-auto flex max-w-[1200px] flex-col gap-2 border-t hairline px-5 py-8 pb-[calc(var(--safe-bottom)+32px)] text-[13px] text-paper-faint sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>© Closeby — made for two.</span>
        <span>Best in Chrome, Edge, Safari or Firefox. Headphones help.</span>
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-ink-900 p-6 ring-1 ring-white/[0.06] transition-colors hover:bg-ink-850">
      <span className="grid size-11 place-items-center rounded-2xl bg-white/[0.08]">
        <Icon className="size-[22px] text-paper" />
      </span>
      <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.015em] text-paper">{title}</h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-paper-dim">{children}</p>
    </div>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="bg-ink-900 p-5">
      <dt className="text-[14px] font-semibold text-paper">{term}</dt>
      <dd className="mt-1.5 text-[14px] leading-relaxed text-paper-dim">{children}</dd>
    </div>
  );
}
