import { toast } from 'sonner';

export async function shareInvite(code: string, tripName: string) {
  const url = `${location.origin}/join/${code}`;
  const text = `Join "${tripName}" on SajiloTrip to track trip money. Open the link, tap Create account with your phone number and pick a password. Code: ${code}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: tripName, text, url });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast.success('Invite link copied');
  } catch {
    toast(`Trip code: ${code}`);
  }
}
