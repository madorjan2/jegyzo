import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import { apiFetch, apiOpenBlob } from './api';
import { AdminPage } from './AdminPage';

interface EventListItem {
  id: number;
  name: string;
  category: string;
  status: string;
  venue: { id: number; name: string; city: string };
  startsAt: string;
  durationMinutes: number;
  posterUrl: string | null;
  cheapestPrice: number | null;
}

interface EventDetails {
  id: number;
  name: string;
  category: string;
  status: string;
  visibleInList: boolean;
  venue: { id: number; name: string; city: string; address: string };
  startsAt: string;
  doorsOpenAt: string | null;
  durationMinutes: number;
  description: string;
  posterUrl: string | null;
  freeSeats: number;
  cheapestPrice: number | null;
  ticketTypes: { id: number; name: string; price: number; capacity: number | null; sectionId: number; maxPerUser: number; isActive: boolean }[];
}

interface SeatMapData {
  eventId: number;
  hasSeatMap: boolean;
  sections: {
    id: number; name: string; kind: string; capacity: number | null; position: number;
    rows: { id: number; label: string; position: number; seats: { id: number; number: number; label: string; state: string }[] }[];
  }[];
}

export interface Profile {
  id: number; email: string; fullName: string; phone: string | null;
  role: string; locale: string; isActive: boolean;
}

export function LanguageSwitcher() {
  const { t } = useTranslation();
  return (
    <select
      aria-label={t('language.label')}
      value={i18n.language}
      onChange={(e) => {
        const lng = e.target.value === 'en' ? 'en' : 'hu';
        void i18n.changeLanguage(lng);
        localStorage.setItem('locale', lng);
        // JGY-98: a signed-in user's choice is stored on the profile too,
        // so the next login starts in the same language (BR-14).
        if (localStorage.getItem('accessToken')) {
          void apiFetch('/profile', { method: 'PATCH', body: JSON.stringify({ locale: lng }) });
        }
      }}
    >
      <option value="hu">{t('language.hu')}</option>
      <option value="en">{t('language.en')}</option>
    </select>
  );
}

// FR-1003 / JGY-100: formatting is centralised here. Timezone is always
// Europe/Budapest regardless of the viewer's machine (BR-15).
const DTFMT = new Map<string, Intl.DateTimeFormat>([
  ['hu', new Intl.DateTimeFormat('hu-HU', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Budapest' })],
  ['en', new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Budapest' })],
]);

function fmtDate(iso: string): string {
  return (DTFMT.get(i18n.language) ?? DTFMT.get('hu')!).format(new Date(iso));
}

function fmtPrice(v: number | null): string {
  if (v === null) return '';
  return new Intl.NumberFormat(i18n.language === 'en' ? 'en-US' : 'hu-HU').format(v)
    + (i18n.language === 'en' ? ' HUF' : ' Ft');
}

function holdRemaining(iso: string): string {
  const s = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
  const m = Math.floor(s / 60), r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/** Ticket-stub logo mark. */
function LogoMark() {
  return (
    <svg className="brand-mark" width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="1.5" y="5.5" width="21" height="13" rx="3" fill="var(--accent)" />
      <path d="M14.5 5.5v13" stroke="var(--surface)" strokeWidth="1.4" strokeDasharray="1.6 2" />
      <circle cx="18" cy="12" r="1.5" fill="var(--surface)" />
      <path d="M4 9.5h6M4 12h6M4 14.5h6" stroke="var(--surface)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Event image with a branded gradient fallback when no poster is set. */
function Poster({ name, url }: { name: string; url?: string | null }) {
  if (url) return <img src={url} alt="" loading="lazy" />;
  return <div className="poster-fallback" aria-hidden="true">{(name.trim()[0] ?? 'J').toUpperCase()}</div>;
}

async function fetchList(q: { search?: string; category?: string | null; sort?: string }): Promise<EventListItem[]> {
  const p = new URLSearchParams();
  if (q.search) p.set('search', q.search);
  if (q.category) p.set('category', q.category);
  if (q.sort === 'price') { p.set('sort', 'price'); p.set('order', 'asc'); }
  else if (q.sort === 'popularity') { p.set('sort', 'popularity'); }
  const qs = p.toString();
  const data = await apiFetch(`/events${qs ? `?${qs}` : ''}`);
  return (data as { items: EventListItem[] }).items;
}

async function fetchDetails(id: number): Promise<EventDetails> {
  return (await apiFetch(`/events/${id}`)) as EventDetails;
}

async function fetchSeatMap(id: number): Promise<SeatMapData> {
  return (await apiFetch(`/events/${id}/seats`)) as SeatMapData;
}

const PAYMENT_ERROR_KEYS = [
  'CARD_INVALID_NUMBER', 'CARD_EXPIRED', 'CARD_CVC_INVALID', 'PAYMENT_DECLINED',
  'PAYMENT_INSUFFICIENT_FUNDS', 'PAYMENT_TIMEOUT', 'PAYMENT_PROCESSING_ERROR',
  'PAYMENT_ALREADY_COMPLETED', 'BOOKING_EXPIRED', 'BOOKING_WRONG_STATE',
  'CAPACITY_EXCEEDED', 'TICKET_LIMIT_EXCEEDED', 'SEAT_TAKEN',
];

/** Maps an API error code to a `paymentError.*` translation key. */
function paymentErrorKey(code: string | null | undefined): string {
  if (code && (PAYMENT_ERROR_KEYS.includes(code) || i18n.exists(`paymentError.${code}`))) {
    return `paymentError.${code}`;
  }
  return 'paymentError.GENERIC';
}

/**
 * Simulated card payment (E7). Validates the card server-side, then runs the
 * deterministic mock PSP. A declined attempt returns 200/201 with a non-SIKERES
 * status and an errorCode — the form stays open for a retry.
 */
export function PaymentForm({ bookingId, onPaid }: { bookingId: number; onPaid: () => void | Promise<void>; }) {
  const { t } = useTranslation();
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const card = { cardNumber, expiry, cvc };
      await apiFetch(`/bookings/${bookingId}/payment/initiate`, { method: 'POST', body: JSON.stringify(card) });
      const res = (await apiFetch(`/bookings/${bookingId}/payment`, {
        method: 'POST',
        body: JSON.stringify({ ...card, idempotencyKey: `${bookingId}-${Date.now()}-${Math.random().toString(36).slice(2)}` }),
      })) as { status: string; errorCode: string | null };
      if (res.status === 'SIKERES') { await onPaid(); return; }
      setError(t(paymentErrorKey(res.errorCode)));
    } catch (err) {
      const e2 = err as { code?: string; message?: string };
      setError(e2.code && i18n.exists(`paymentError.${e2.code}`) ? t(`paymentError.${e2.code}`) : (e2.message ?? t('error.generic')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '.5rem', maxWidth: 320, marginTop: '.6rem' }}>
      <h4 style={{ margin: 0 }}>{t('booking.payButton')}</h4>
      {error && <div className="error-banner">{error}</div>}
      <label>
        {t('booking.cardNumber')}
        <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} required inputMode="numeric"
          autoComplete="cc-number" placeholder="4242 4242 4242 4242" aria-label={t('booking.cardNumber')} />
      </label>
      <label>
        {t('booking.cardExpiry')}
        <input value={expiry} onChange={(e) => setExpiry(e.target.value)} required
          autoComplete="cc-exp" placeholder="12/2030" aria-label={t('booking.cardExpiry')} />
      </label>
      <label>
        {t('booking.cardCvc')}
        <input value={cvc} onChange={(e) => setCvc(e.target.value)} required inputMode="numeric"
          autoComplete="cc-csc" placeholder="123" aria-label={t('booking.cardCvc')} />
      </label>
      <button type="submit" disabled={busy}>{busy ? '…' : t('booking.payButton')}</button>
    </form>
  );
}

const CATEGORIES = ['KONCERT', 'SZINHAZ', 'SPORT', 'FESZTIVAL', 'EGYEB'] as const;

export function EventsListPage() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<EventListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState('date');

  useEffect(() => {
    let alive = true;
    fetchList({ search, category, sort })
      .then((items) => { if (alive) { setEvents(items); setError(null); } })
      .catch((err) => { if (alive) setError(err.message ?? t('error.generic')); });
    return () => { alive = false; };
  }, [search, category, sort, t, i18n.language]);

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <h1>{t('home.heroTitle')}</h1>
          <p className="hero-sub">{t('home.heroSub')}</p>
          <div className="search-bar">
            <input
              type="search"
              placeholder={t('event.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('event.searchPlaceholder')}
            />
          </div>
          <div className="chips">
            <button className={`chip ${category === null ? 'active' : ''}`} onClick={() => setCategory(null)}>{t('event.all')}</button>
            {CATEGORIES.map((c) => (
              <button key={c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
                {t(`category.${c}`)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="section-head">
        <h2>{t('home.upcoming')}</h2>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="sort" style={{ width: 'auto' }}>
          <option value="date">{t('event.sortDate')}</option>
          <option value="price">{t('event.sortPrice')}</option>
          <option value="popularity">{t('event.sortPopularity')}</option>
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {events !== null && events.length === 0 && !error && <div className="empty">{t('event.noResults')}</div>}

      <div className="event-grid">
        {events?.map((e) => (
          <article className="event-card" key={e.id}>
            <a className="event-media" href={`#/events/${e.id}`} aria-label={e.name}>
              <Poster name={e.name} url={e.posterUrl} />
              {e.status !== 'PUBLIKALT' && <span className={`badge ${e.status}`}>{t(`status.${e.status}`)}</span>}
            </a>
            <div className="event-body">
              <span className="event-cat">{t(`category.${e.category}`, { defaultValue: e.category })}</span>
              <h3 className="event-title"><a href={`#/events/${e.id}`}>{e.name}</a></h3>
              <span className="event-venue">{e.venue.name} · {e.venue.city}</span>
              <span className="event-date">{fmtDate(e.startsAt)}</span>
              <div className="event-foot">
                {e.cheapestPrice === null
                  ? <span className="price muted">{t('event.soldOut')}</span>
                  : <span className="price"><span className="from">{t('event.fromPrice')}</span>{fmtPrice(e.cheapestPrice)}</span>}
                <a className="btn btn-primary btn-sm" href={`#/events/${e.id}`}>{t('event.buy')}</a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

export function EventDetailsPage({ id }: { id: number }) {
  const { t } = useTranslation();
  const [ev, setEv] = useState<EventDetails | null>(null);
  const [map, setMap] = useState<SeatMapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<number, { price: number; ttId: number | null }>>(new Map());
  const [booking, setBooking] = useState<{ id: number; code: string; total: number; holdExpiresAt: string } | null>(null);
  const [paid, setPaid] = useState(false);
  const [standingQty, setStandingQty] = useState(1);

  const confirmStanding = async () => {
    // pick the first active standing ticket type (kind = ALLOHELYES via section kind)
    const standingType = ev?.ticketTypes.find((t) => t.capacity !== null && t.isActive);
    if (!standingType) { setError(t('error.generic')); return; }
    try {
      const res = await apiFetch('/bookings', { method: 'POST', body: JSON.stringify({ eventId: id, items: [{ ticketTypeId: standingType.id, quantity: standingQty }] }) });
      setBooking(res as { id: number; code: string; total: number; holdExpiresAt: string });
      setPaid(false);
    } catch (err) {
      const e2 = err as { message?: string };
      setError(e2.message ?? t('error.generic'));
    }
  };


  useEffect(() => {
    let alive = true;
    fetchDetails(id).then((d) => { if (alive) { setEv(d); setError(null); } }).catch((err) => { if (alive) setError(err.message ?? t('error.generic')); });
    fetchSeatMap(id).then((m) => { if (alive) setMap(m); }).catch(() => {});
    return () => { alive = false; };
  }, [id, t]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!ev) return <div className="empty">…</div>;

  const standingTypes = ev.ticketTypes.filter((tty) => tty.capacity !== null && tty.isActive);
  const seatSections = (map?.sections ?? []).filter((s) => s.rows.length > 0);

  const toggleSeat = (seat: { id: number }, sectionId: number) => {
    // BR-28: a seat is sold at the ticket type of its section.
    const tt = ev.ticketTypes.find((ttype) => ttype.sectionId === sectionId && ttype.isActive);
    if (!tt) { setError(t('error.generic')); return; }
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(seat.id)) next.delete(seat.id);
      else next.set(seat.id, { price: tt.price, ttId: tt.id });
      return next;
    });
  };
  const confirmBooking = async () => {
    try {
      const payloadItems = Array.from(selected.entries()).map(([seatId, sel]) => ({ seatId, ticketTypeId: sel.ttId }));
      const res = await apiFetch('/bookings', { method: 'POST', body: JSON.stringify({ eventId: id, items: payloadItems }) });
      setBooking(res as { id: number; code: string; total: number; holdExpiresAt: string });
      setPaid(false);
      setSelected(new Map());
    } catch (err) {
      const e2 = err as { message?: string };
      setError(e2.message ?? t('error.generic'));
    }
  };

  return (
    <>
      <a className="btn btn-ghost btn-sm" href="#/events" style={{ marginBottom: '1.1rem' }}>← {t('nav.events')}</a>
      <div className="detail-hero">
        <div className="detail-media">
          <Poster name={ev.name} url={ev.posterUrl} />
        </div>
        <div className="detail-info">
          <div className="detail-badges">
            <span className={`badge ${ev.status}`}>{t(`status.${ev.status}`)}</span>
            <span className="badge">{t(`category.${ev.category}`, { defaultValue: ev.category })}</span>
            {!ev.visibleInList && <span className="badge LEMONDVA">{t('event.cancelled')}</span>}
          </div>
          <h1>{ev.name}</h1>
          <ul className="meta-list">
            <li><span className="k">{t('event.city')}</span><span>{ev.venue.name}, {ev.venue.city}</span></li>
            <li><span className="k">{t('event.startsAt')}</span><span>{fmtDate(ev.startsAt)}</span></li>
            {ev.doorsOpenAt && <li><span className="k">{t('event.doorsOpen')}</span><span>{fmtDate(ev.doorsOpenAt)}</span></li>}
            <li><span className="k">{t('detail.seats')}</span><span>{ev.status === 'LEMONDVA' ? '—' : ev.freeSeats}</span></li>
          </ul>
          {ev.cheapestPrice !== null && (
            <p className="price" style={{ fontSize: '1.35rem' }}>
              <span className="from">{t('event.fromPrice')}</span>{fmtPrice(ev.cheapestPrice)}
            </p>
          )}
          {ev.status === 'LEMONDVA' && <div className="error-banner">{t('event.cancelled')}</div>}
          {ev.status === 'ERTEKESITES_SZUNETELT' && <div className="error-banner">{t('event.suspended')}</div>}
        </div>
      </div>

      <div className="detail-body">
        <section className="panel">
          <h3>{t('detail.about')}</h3>
          <p>{ev.description}</p>
        </section>

        <section className="panel">
          <h3>{t('detail.tickets')}</h3>
          <ul className="ticket-types">
            {ev.ticketTypes.map((tty) => (
              <li key={tty.id}>
                <span>
                  {tty.name}
                  <br />
                  <span className="muted" style={{ fontSize: '.82rem' }}>{t('booking.limit')} {tty.maxPerUser}</span>
                </span>
                <span className="tt-price">{fmtPrice(tty.price)}</span>
                <span className={`badge ${tty.isActive ? 'SZABAD' : 'LEJART'}`}>{tty.isActive ? t('status.SZABAD') : t('status.LEJART')}</span>
              </li>
            ))}
          </ul>
        </section>

        {ev.status !== 'LEMONDVA' && standingTypes.length > 0 && (
          <section className="panel">
            <h3>{t('booking.standing')} — {standingTypes.map((s) => fmtPrice(s.price)).join(', ')}</h3>
            <label style={{ maxWidth: 220 }}>
              {t('booking.quantity')}
              <input
                type="number"
                min={1}
                value={standingQty}
                onChange={(e) => setStandingQty(Number(e.target.value))}
                aria-label={t('booking.quantity')}
              />
            </label>
            {standingQty > 0 && (
              <button className="btn btn-primary" style={{ marginTop: '.6rem' }} onClick={confirmStanding}>{t('booking.addToCart')}</button>
            )}
          </section>
        )}

        {ev.status !== 'LEMONDVA' && seatSections.length > 0 && (
          <section className="panel">
            <h3>{t('booking.selectSeats')}</h3>
            <div className="seatmap">
              {seatSections.map((s) => (
                <div className="seat-section" key={s.id}>
                  <strong>{s.name}</strong>
                  {s.rows.map((r) => (
                    <div className="seat-row" key={r.id}>
                      <span className="row-label">{r.label}</span>
                      {r.seats.map((seat) => (
                        <button
                          key={seat.id}
                          type="button"
                          className={`seat ${seat.state === 'SZABAD' ? 'free' : 'taken'} ${selected.has(seat.id) ? 'selected' : ''}`}
                          title={`${seat.label} — ${t(`status.${seat.state}`)}`}
                          disabled={seat.state !== 'SZABAD'}
                          onClick={() => toggleSeat(seat, s.id)}
                        >{seat.number}</button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <p className="muted">{t('booking.seatSelected')}: {selected.size}</p>
            {selected.size > 0 && (
              <button className="btn btn-primary" onClick={confirmBooking}>{t('booking.addToCart')}</button>
            )}
          </section>
        )}

        {booking && (
          <section className="panel">
            <h3>{t('booking.total')}</h3>
            <p>{t('booking.code')}: <strong>{booking.code}</strong></p>
            <p className="price" style={{ fontSize: '1.2rem' }}>{fmtPrice(booking.total)}</p>
            {!paid && <p className="muted">{t('booking.holdTimer')}: {holdRemaining(booking.holdExpiresAt)}</p>}
            {paid
              ? <div className="success-banner">{t('booking.paySuccess')} <a href="#/my-tickets">{t('nav.myTickets')} →</a></div>
              : <PaymentForm bookingId={booking.id} onPaid={() => setPaid(true)} />}
          </section>
        )}
      </div>
    </>
  );
}

export function LoginPage({ onLogin }: { onLogin: (profile: Profile) => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      const { accessToken, refreshToken, user } = res as { accessToken: string; refreshToken: string; user: Profile };
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      // JGY-98: the session language follows the user's stored locale.
      if (user?.locale === 'en' || user?.locale === 'hu') {
        localStorage.setItem('locale', user.locale);
        void i18n.changeLanguage(user.locale);
      }
      onLogin(user);
    } catch (err) {
      const e2 = err as { message?: string };
      setError(e2.message ?? t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 380, margin: '0 auto' }}>
      <h2>{t('nav.login')}</h2>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={submit} style={{ display: 'grid', gap: '.6rem' }}>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Jelszó
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" disabled={busy}>{t('nav.login')}</button>
      </form>
      <p className="event-meta" style={{ marginTop: '.6rem' }}>
        Már regisztrált? <a href="#/register">Kattints ide</a>
      </p>
    </div>
  );
}

export function RegisterPage({ onLogin }: { onLogin: (profile: Profile) => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, fullName }) });
      const user = res as Profile;
      const r2 = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      const { accessToken, refreshToken } = r2 as { accessToken: string; refreshToken: string };
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      onLogin(user);
    } catch (err) {
      const e2 = err as { message?: string };
      setError(e2.message ?? t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 380, margin: '0 auto' }}>
      <h2>{t('nav.register')}</h2>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={submit} style={{ display: 'grid', gap: '.6rem' }}>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Teljes név
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} maxLength={80} />
        </label>
        <label>
          Jelszó
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </label>
        <button type="submit" disabled={busy}>{t('nav.register')}</button>
      </form>
      <p className="event-meta" style={{ marginTop: '.6rem' }}>
        Már regisztrált? <a href="#/login">{t('nav.login')}</a>
      </p>
    </div>
  );
}

interface MyBooking {
  id: number; code: string; status: string; total: number; createdAt: string; holdExpiresAt: string;
  event: { id: number; name: string; startsAt: string; venue: string };
  tickets: { id: number; code: string; status: string }[];
}

export function MyTicketsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<MyBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    apiFetch('/bookings')
      .then((d) => { if (alive) { setRows(d as MyBooking[]); setError(null); } })
      .catch((err) => { if (alive) setError(err.message ?? t('error.generic')); });
    return () => { alive = false; };
  }, [t, tick]);

  const isPending = (s: string) => s === 'ZAROLT' || s === 'FIZETESRE_VAR';

  const cancel = async (id: number) => {
    if (!window.confirm(t('booking.cancelConfirm'))) return;
    try {
      await apiFetch(`/bookings/${id}/cancel`, { method: 'POST' });
      setPayingId(null);
      setTick((x) => x + 1);
    } catch (err) {
      setError((err as Error).message ?? t('error.generic'));
    }
  };

  const download = async (code: string) => {
    try { await apiOpenBlob(`/tickets/${code}/pdf`, `${code}.pdf`); }
    catch { setError(t('error.generic')); }
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <h2>{t('nav.myTickets')}</h2>
      {error && <div className="error-banner">{error}</div>}
      {rows?.map((b) => (
        <div className="card" key={b.id} style={{ marginBottom: '.6rem' }}>
          <p><strong>{b.code}</strong> <span className={`badge ${b.status}`}>{t(`status.${b.status}`)}</span></p>
          <p className="event-meta">{b.event.name} · {fmtDate(b.event.startsAt)} · {b.event.venue}</p>
          <p className="event-price">{t('booking.total')}: {fmtPrice(b.total)}</p>

          {isPending(b.status) && (
            <>
              <p className="event-meta">{t('booking.holdTimer')}: {holdRemaining(b.holdExpiresAt)}</p>
              {payingId === b.id
                ? <PaymentForm bookingId={b.id} onPaid={() => { setPayingId(null); setTick((x) => x + 1); }} />
                : <button onClick={() => setPayingId(b.id)}>{t('booking.payButton')}</button>}
              {' '}
              <button onClick={() => void cancel(b.id)}>{t('booking.cancelButton')}</button>
            </>
          )}

          {b.tickets.map((ticket) => (
            <p key={ticket.id} className="event-meta">
              {ticket.code} · {t(`status.${ticket.status}`)}{' '}
              <button onClick={() => void download(ticket.code)}>{t('booking.downloadTicket')}</button>
            </p>
          ))}
        </div>
      ))}
      {rows !== null && rows.length === 0 && <div className="empty">{t('booking.noBookings')}</div>}
    </div>
  );
}

export function ProfilePage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch('/profile')
      .then((p) => { if (alive) setProfile(p as Profile); })
      .catch((err) => { if (alive) setError(err.message ?? t('error.generic')); });
    return () => { alive = false; };
  }, [t]);

  if (error) return <div className="error-banner" style={{ maxWidth: 480, margin: '0 auto' }}>{error}</div>;
  if (!profile) return <div className="empty">…</div>;

  return (
    <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
      <h2>{t('nav.profile')}</h2>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '.3rem 1rem' }}>
        <dt className="event-meta">E-mail</dt><dd>{profile.email}</dd>
        <dt className="event-meta">Név</dt><dd>{profile.fullName}</dd>
        <dt className="event-meta">Telefon</dt><dd>{profile.phone ?? '—'}</dd>
        <dt className="event-meta">Szerep</dt><dd>{profile.role}</dd>
        <dt className="event-meta">Nyelv</dt><dd>{profile.locale}</dd>
        <dt className="event-meta">Állapot</dt><dd>{profile.isActive ? 'aktív' : 'inaktív'}</dd>
      </dl>
    </div>
  );
}

export function App({ route, profile, onLogin, onLogout }: {
  route: string;
  profile: Profile | null;
  onLogin: (p: Profile) => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const m = route.match(/^\/events\/(\d+)$/);
  let body: React.ReactNode;
  let active: string | null = null;
  if (m) {
    body = <EventDetailsPage id={Number(m[1])} />;
    active = '/events';
  } else if (route === '/login') {
    body = profile ? <ProfilePage /> : <LoginPage onLogin={onLogin} />;
    active = '/login';
  } else if (route === '/register') {
    body = <RegisterPage onLogin={onLogin} />;
    active = '/register';
  } else if (route === '/profile') {
    body = profile ? <ProfilePage /> : <LoginPage onLogin={onLogin} />;
    active = '/profile';
  } else if (route === '/admin') {
    body = profile && (profile.role === 'ADMIN' || profile.role === 'SZERVEZO') ? <AdminPage /> : <LoginPage onLogin={onLogin} />;
    active = '/admin';
  } else if (route === '/my-tickets') {
    body = profile ? <MyTicketsPage /> : <LoginPage onLogin={onLogin} />;
    active = '/my-tickets';
  } else {
    body = <EventsListPage />;
    active = '/events';
  }

  const nav = (path: string, label: string) => (
    <a href={`#${path}`} className={active === path ? 'active' : ''}>{label}</a>
  );

  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="#/events"><LogoMark /> {t('app.title')}</a>
          <nav className="main-nav">
            {nav('/events', t('nav.events'))}
            {profile && nav('/my-tickets', t('nav.myTickets'))}
            {profile && (profile.role === 'ADMIN' || profile.role === 'SZERVEZO') && nav('/admin', t('admin.nav'))}
            {profile && nav('/profile', t('nav.profile'))}
          </nav>
          <div className="header-actions">
            <LanguageSwitcher />
            {profile
              ? <button className="btn btn-ghost btn-sm" onClick={onLogout}>{t('nav.logout')}</button>
              : (
                <>
                  <a className="btn btn-ghost btn-sm" href="#/login">{t('nav.login')}</a>
                  <a className="btn btn-primary btn-sm" href="#/register">{t('nav.register')}</a>
                </>
              )}
          </div>
        </div>
      </header>
      <main className="page">
        <div className="container">{body}</div>
      </main>
      <footer className="site-footer">
        <div className="container">
          <span><strong>{t('app.title')}</strong> — {t('app.tagline')}</span>
          <span>{t('footer.note')}</span>
        </div>
      </footer>
    </>
  );
}
