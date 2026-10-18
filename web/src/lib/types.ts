export type Role = 'leader' | 'member';

export interface Member {
  id: string;
  name: string;
  role: Role;
  phone: string;
  color: number;
  claimed: boolean;
  left_at: string | null;
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
  transfers: { from: string; to: string; amount: number }[];
}

export interface TripState {
  trip: Trip;
  members: Member[];
  entries: Entry[];
  places: Place[];
  ledger: Ledger;
  version: number;
}

export interface Session {
  memberId: string;
  token: string;
  tripName: string;
}
