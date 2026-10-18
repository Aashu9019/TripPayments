import { Phone } from 'lucide-react';

/** Digits in international form; bare 10-digit Nepali mobiles get +977. */
export function intlDigits(phone: string) {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('9')) d = `977${d}`;
  return d;
}

/** "+9779841234567" -> "+977 984-1234567" for display. */
export function formatPhone(phone: string) {
  const d = intlDigits(phone);
  if (d.startsWith('977') && d.length === 13) return `+977 ${d.slice(3, 6)}-${d.slice(6)}`;
  return phone.startsWith('+') || d.length > 10 ? `+${d}` : phone;
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

/** Call + WhatsApp buttons that sit at the end of a row. */
export function ContactButtons({ phone, name }: { phone: string; name: string }) {
  const d = intlDigits(phone);
  if (d.length < 7) return null;
  return (
    <div className="contact-btns">
      <a className="call-btn" href={`tel:+${d}`} aria-label={`Call ${name}`}>
        <Phone size={18} />
      </a>
      <a className="call-btn wa" href={`https://wa.me/${d}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${name}`}>
        <WhatsAppIcon />
      </a>
    </div>
  );
}
