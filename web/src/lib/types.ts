export type Role = 'leader' | 'coleader' | 'member';

export interface Member {
  id: string;
  name: string;
  role: Role;
  phone: string;
  color: number;
  claimed: boolean;
  left_at: string | null;
  /** Profile photo id from the member's account, if they set one. */
  avatar?: string | null;
}

export type EntryKind = 'expense' | 'deposit' | 'payment';

export interface Entry {
  id: string;
  kind: EntryKind;
  title: string;
  category: string;
  amount: number;
  from_id: string | null;
  to_id: string | null;
  split_mode: 'equal' | 'exact';
  shares: Record<string, number>;
  date: string;
  note: string;
  created_by: string | null;
  created_at: string;
}

export type PlaceKind = 'stop' | 'stay' | 'contact';

export interface Place {
  id: string;
  kind: PlaceKind;
  title: string;
  phone: string;
  address: string;
  day: number | null;
  note: string;
  sort: number;
}

export interface Trip {
  code: string;
  name: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  currency: string;
  notes: string;
  fund_keeper_id: string | null;
  version: number;
}

export interface Ledger {
  net: Record<string, number>;
  spent: Record<string, number>;
  paid: Record<string, number>;
  deposited: Record<string, number>;
  total: number;
  fund: { in: number; out: number; cash: number; keeperId: string | null };
  /** Fewest payments (debts simplified through other people). */
  transfers: { from: string; to: string; amount: number }[];
  /** Who owes whom directly, pair by pair. */
  direct: { from: string; to: string; amount: number }[];
}

export interface TripState {
  /** True when you are not a member: only the join preview is sent. */
  preview?: boolean;
  trip: Trip;
  /** Your member id in this trip, or null if you haven't joined. */
  meId: string | null;
  members: Member[];
  entries: Entry[];
  places: Place[];
  ledger: Ledger;
  version: number;
}

export interface User {
  id: string;
  phone: string;
  name: string;
  avatarId?: string | null;
}

/** A trip in the signed-in user's list, with their own balance. */
export interface MyTrip {
  code: string;
  name: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  currency: string;
  role: Role;
  people: number;
  total: number;
  net: number;
}

