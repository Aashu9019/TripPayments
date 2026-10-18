import { useEffect, useState, type ReactNode } from 'react';
import { Drawer } from 'vaul';
import { X, Wallet } from 'lucide-react';
import { initials } from '../lib/format';
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
    </span>
  );
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
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={desktop ? 'right' : 'bottom'} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="sheet-overlay" />
        <Drawer.Content className={desktop ? 'sheet side' : 'sheet'} aria-describedby={undefined}>
          {!desktop && <div className="sheet-handle" aria-hidden />}
          <div className="sheet-head">
            <Drawer.Title asChild>
              <h2>{title}</h2>
            </Drawer.Title>
            <Drawer.Close className="icon-btn" aria-label="Close">
              <X size={20} />
            </Drawer.Close>
          </div>
          <div className="sheet-body">{children}</div>
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
