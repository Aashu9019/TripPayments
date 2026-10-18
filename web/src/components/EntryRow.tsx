import { ArrowRight, Bed, Bus, Compass, Mountain, PiggyBank, ReceiptText, ShoppingBag, Ticket, Utensils } from 'lucide-react';
import { useLoadedTrip } from '../lib/trip-context';
import { categoryLabel, money } from '../lib/format';
import type { Entry } from '../lib/types';
import { useOpenEntry } from '../screens/TripShell';

const ICONS: Record<string, typeof Utensils> = {
  food: Utensils,
  stay: Bed,
  transport: Bus,
  permit: Ticket,
  guide: Compass,
  gear: ShoppingBag,
  other: ReceiptText,
};

export function EntryRow({ entry, fresh }: { entry: Entry; fresh?: boolean }) {
  const { data, member, me } = useLoadedTrip();
  const open = useOpenEntry();
  const cur = data.trip.currency;
  const name = (id: string | null) => (id === me?.id ? 'You' : (member(id)?.name ?? 'Someone'));
  const mine = me ? (entry.shares[me.id] ?? 0) : 0;

  let Icon = ICONS[entry.category] ?? Mountain;
  let title = entry.title;
  let sub: string;
  if (entry.kind === 'expense') {
    const n = Object.keys(entry.shares).length;
    sub = `${entry.from_id ? name(entry.from_id) : 'Common fund'} paid · ${categoryLabel(entry.category)} · ${n === data.members.length ? 'everyone' : `${n} ${n === 1 ? 'person' : 'people'}`}`;
  } else if (entry.kind === 'deposit') {
    Icon = PiggyBank;
    title = `${name(entry.from_id)} → common fund`;
    sub = entry.note || 'Into the common fund';
  } else {
    Icon = ArrowRight;
    title = `${name(entry.from_id)} paid ${name(entry.to_id) === 'You' ? 'you' : name(entry.to_id)}`;
    sub = entry.note || 'Settled up';
  }

  return (
    <li className={fresh ? 'row-enter' : undefined}>
      <button className="row" onClick={() => open({ kind: entry.kind, entry })}>
        <span className="glyph">
          <Icon size={18} strokeWidth={1.8} />
        </span>
        <div className="row-main">
          <div className="row-title">{title}</div>
          <div className="row-sub">{sub}</div>
        </div>
        <div className="row-end">
          <div className="row-title">{money(entry.amount, cur)}</div>
          {entry.kind === 'expense' && mine > 0 && <div className="row-sub">your share {money(mine, cur)}</div>}
        </div>
      </button>
    </li>
  );
}
