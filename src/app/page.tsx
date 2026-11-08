import { ArrowRight, Link as LinkIcon } from "lucide-react";
import { CreateRoomDialog } from "@/components/landing/create-room-dialog";
import { JoinRoomDialog } from "@/components/landing/join-room-dialog";
import { RoomPreview } from "@/components/landing/room-preview";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <div className="relative min-h-dvh overflow-x-clip">
      {/* A single warm pool of light, like a lamp behind the screen */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-280px] h-[620px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(227_166_100/0.10),transparent)]" />

      <header className="relative mx-auto flex max-w-[1200px] items-center justify-between px-5 pt-[calc(var(--safe-top)+20px)] sm:px-8">
        <Logo />
        <nav className="flex items-center gap-1">
          <a href="#privacy" className="hidden rounded-md px-3 py-2 text-sm text-paper-dim transition-colors hover:text-paper sm:block">
            Privacy
          </a>
          <JoinRoomDialog>
            <Button variant="ghost" size="sm">
              Join a room
            </Button>
          </JoinRoomDialog>
        </nav>
      </header>

      <main className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
        <section className="grid items-center gap-12 pb-20 pt-14 md:pt-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:pt-24">
          <div className="max-w-[520px] animate-fade-in">
            <p className="mb-5 text-[13px] font-medium uppercase tracking-[0.14em] text-paper-faint">A private room for two</p>
            <h1 className="font-display text-[52px] leading-[0.98] tracking-[-0.02em] text-paper sm:text-[68px]">
              Movie night,
              <br />
              <em className="text-lamp">from two places.</em>
            </h1>
            <p className="mt-6 max-w-[440px] text-[17px] leading-relaxed text-paper-dim">
              See each other, talk the whole way through, and watch the same moment at the same time. Just you and one other person.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <CreateRoomDialog>
                <Button variant="primary" size="lg" data-testid="create-room">
                  Create a private room <ArrowRight />
                </Button>
              </CreateRoomDialog>
              <JoinRoomDialog>
                <Button variant="secondary" size="lg">
                  <LinkIcon /> Join with a link
                </Button>
              </JoinRoomDialog>
            </div>
            <p className="mt-5 text-[13px] text-paper-faint">No account. No recording. Rooms disappear after 12 hours.</p>
          </div>

          <div className="animate-fade-in [animation-delay:120ms]">
            <RoomPreview />
          </div>
        </section>

        <section aria-labelledby="how" className="border-t hairline py-16">
          <h2 id="how" className="sr-only">
            How it feels
          </h2>
          <div className="grid gap-10 md:grid-cols-3 md:gap-8">
            <Feature n="01" title="Faces, the whole time">
              Your cameras float beside the film — drag them anywhere, shrink them, or go face-to-face when the credits roll.
            </Feature>
            <Feature n="02" title="In sync, without the countdown">
              Either of you can pause, scrub or change speed. Both screens follow, and small drifts are corrected quietly.
            </Feature>
            <Feature n="03" title="Two volume knobs">
              Turn the film down without turning your friend down. Your mic stays independent of what’s playing.
            </Feature>
          </div>
        </section>

        <section id="privacy" aria-labelledby="privacy-title" className="grid gap-10 border-t hairline py-16 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
          <div>
            <h2 id="privacy-title" className="font-display text-[38px] leading-[1.05] tracking-[-0.01em]">
              What stays private
            </h2>
            <p className="mt-4 max-w-[400px] text-paper-dim">
              Closeby is built so there’s very little to keep. Here is exactly what exists while your room is open.
            </p>
          </div>
          <dl className="grid gap-px overflow-hidden rounded-lg border hairline bg-[var(--line)] sm:grid-cols-2">
            <Fact term="Never leaves your device">Movie files you choose. Each of you picks your own copy; we only see its name and size.</Fact>
            <Fact term="Never recorded">Video, voice and screen shares travel live between you and are not recorded or stored.</Fact>
            <Fact term="Never stored on our servers">Chat messages. They pass between the two of you and vanish when the room closes.</Fact>
            <Fact term="Kept until the room expires">Your display names, the room code, playback position and watchlist titles — deleted within 12 hours.</Fact>
          </dl>
        </section>
      </main>

      <footer className="relative mx-auto flex max-w-[1200px] flex-col gap-2 border-t hairline px-5 py-8 pb-[calc(var(--safe-bottom)+32px)] text-[13px] text-paper-faint sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>Closeby — made for two.</span>
        <span>Works best in current Chrome, Edge, Firefox and Safari. Headphones help.</span>
      </footer>
    </div>
  );
}

function Feature({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="font-mono text-[12px] text-lamp">{n}</span>
      <h3 className="mt-3 text-[17px] font-medium text-paper">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-paper-dim">{children}</p>
    </div>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="bg-ink-900 p-5">
      <dt className="text-sm font-medium text-paper">{term}</dt>
      <dd className="mt-1.5 text-[14px] leading-relaxed text-paper-dim">{children}</dd>
    </div>
  );
}
