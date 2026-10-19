import { useEffect, useState, type FocusEvent, type ReactNode } from 'react';
import { Drawer } from 'vaul';
import { X, Wallet } from 'lucide-react';
import { initials } from '../lib/format';
import { avatarUrl } from '../lib/api';
import type { Member } from '../lib/types';

export function Avatar({ member, size }: { member?: Member | null; size?: 'sm' }) {
  if (!member) {
    return (
      <span className={`avatar fund ${size ?? ''}`} aria-hidden>
        <Wallet size={size ? 12 : 16} strokeWidth={2} />
      </span>
    );
  }
  return (
    <span className={`avatar ${size ?? ''}`} style={{ background: `var(--m${member.color % 8})` }} aria-hidden>
      {initials(member.name)}
      {member.avatar && <AvatarPhoto id={member.avatar} />}
    </span>
  );
}

/** Photo laid over the initials; if it fails to load, the initials show through. */
function AvatarPhoto({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img className="avatar-img" src={avatarUrl(id)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export const useDesktop = () => useMediaQuery('(min-width: 960px)');

/**
 * Height of the on-screen keyboard, from the visual viewport.
 * Returns null while no keyboard is open (or the browser lacks visualViewport).
 */
function useKeyboard(active: boolean) {
  const [kb, setKb] = useState<{ inset: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) {
      setKb(null);
      return;
    }
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // Ignore small changes like the URL bar collapsing.
      setKb(inset > 80 ? { inset, height: vv.height } : null);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return kb;
}

/** Keep the focused field visible inside the sheet once the keyboard has settled. */
function revealField(e: FocusEvent<HTMLElement>) {
  const el = e.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  window.setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
}

/** Bottom sheet on phones, side panel on desktop. Both drag-to-dismiss via Vaul. */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const desktop = useDesktop();
  const kb = useKeyboard(open && !desktop);
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={desktop ? 'right' : 'bottom'} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="sheet-overlay" />
        <Drawer.Content
          className={desktop ? 'sheet side' : 'sheet'}
          aria-describedby={undefined}
          // Sit on top of the on-screen keyboard instead of letting iOS push the sheet off screen.
          style={kb ? { bottom: kb.inset, maxHeight: kb.height - 8 } : undefined}
          onOpenAutoFocus={(e) => {
            // On phones, focusing during the slide-in makes iOS jump the page; let people tap the field.
            if (!desktop) e.preventDefault();
          }}
        >
          {!desktop && <div className="sheet-handle" aria-hidden />}
          <div className="sheet-head">
            <Drawer.Title asChild>
              <h2>{title}</h2>
            </Drawer.Title>
            <Drawer.Close className="icon-btn" aria-label="Close">
              <X size={20} />
            </Drawer.Close>
          </div>
          <div className="sheet-body" onFocus={desktop ? undefined : revealField}>
            {children}
          </div>
          {footer && <div className="sheet-foot">{footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function Check({ on }: { on: boolean }) {
  return (
    <span className="check" data-on={on} aria-hidden>
      {on && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2 5 8.5 9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/** Sticky header that draws its hairline only after content scrolls under it. */
export function TopBar({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className="topbar" data-scrolled={scrolled}>
      {children}
    </header>
  );
}

/** Mouse/trackpad devices. Phones skip autofocus so the keyboard never pops mid-animation. */
export const FINE_POINTER = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
