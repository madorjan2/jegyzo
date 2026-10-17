// Admin backoffice page (JGY-75..88). Visible for ADMIN and SZERVEZO.
// All enforcement is server-side; the panel only triggers the endpoints.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch, ApiRequestError } from './api';

interface AdminEventRow {
  id: number; name: string; category: string; status: string;
  venueName: string; organizerUserId: number;
  startsAt: string; salesStartAt: string; salesEndAt: string;
}
interface AdminUserRow {
  id: number; email: string; fullName: string;
  role: string; locale: string; isActive: boolean;
}
interface AdminBookingRow {
  id: number; code: string; status: string; eventId: number;
  eventName: string; total: number; userId: number;
}
interface RefundRow {
  id: number; bookingCode: string; eventId: number; eventName: string;
  amount: number; status: string; createdAt: string;
}
interface StatsRow {
  eventId: number; soldTickets: number; revenue: number;
  utilization: number; totalCapacity: number;
}

const fmtPrice = (v: number) => `${v.toLocaleString('hu-HU')} Ft`;

export function AdminPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'events' | 'users' | 'bookings' | 'refunds'>('events');
  const [events, setEvents] = useState<AdminEventRow[] | null>(null);
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [bookings, setBookings] = useState<AdminBookingRow[] | null>(null);
  const [bookingEventId, setBookingEventId] = useState('');
  const [refunds, setRefunds] = useState<RefundRow[] | null>(null);
  const [stats, setStats] = useState<Record<number, StatsRow>>({});
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '', category: 'KONCERT', venueId: '1', startsAt: '', durationMinutes: '120',
    description: '', salesStartAt: '', salesEndAt: '', posterUrl: '',
  });

  const reload = async () => {
    setError(null);
    try {
      if (tab === 'events') {
        setEvents((await apiFetch('/admin/events')) as AdminEventRow[]);
      } else if (tab === 'users') {
        setUsers((await apiFetch(`/admin/users${userSearch ? `?search=${encodeURIComponent(userSearch)}` : ''}`)) as AdminUserRow[]);
      } else if (tab === 'bookings') {
        const q = bookingEventId ? `?eventId=${encodeURIComponent(bookingEventId)}` : '';
        setBookings((await apiFetch(`/admin/bookings${q}`)) as AdminBookingRow[]);
      } else if (tab === 'refunds') {
        setRefunds((await apiFetch('/admin/refunds')) as RefundRow[]);
      }
    } catch (err) {
      setError(((err as ApiRequestError).code ?? 'INTERNAL_ERROR') + ': ' + ((err as Error).message));
    }
  };

  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab, bookingEventId]);

  const loadStats = async (eventId: number) => {
    if (stats[eventId]) return;
    try {
      const s = (await apiFetch(`/events/${eventId}/statistics`)) as StatsRow;
      setStats((prev) => ({ ...prev, [eventId]: s }));
    } catch { /* organizer scope enforcement — skip */ }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); await reload(); } catch (err) {
      setError(((err as ApiRequestError).code ?? 'INTERNAL_ERROR') + ': ' + ((err as Error).message));
    }
  };

  const createEvent = () => act(() => apiFetch('/events', {
    method: 'POST',
    body: JSON.stringify({
      name: form.name, category: form.category, venueId: Number(form.venueId),
      startsAt: form.startsAt, durationMinutes: Number(form.durationMinutes),
      description: form.description,
      ...(form.posterUrl ? { posterUrl: form.posterUrl } : {}),
      ...(form.salesStartAt ? { salesStartAt: form.salesStartAt } : {}),
      ...(form.salesEndAt ? { salesEndAt: form.salesEndAt } : {}),
    }),
  }));

  const tabBtn = (key: typeof tab, label: string) => (
    <button className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
  );

  return (
    <div style={{ maxWidth: 840, margin: '0 auto' }}>
      <div className="topbar" style={{ position: 'static', marginBottom: '1rem' }}>
        {tabBtn('events', t('admin.events'))}
        {tabBtn('users', t('admin.users'))}
        {tabBtn('bookings', t('admin.bookings'))}
        {tabBtn('refunds', t('admin.refunds'))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {tab === 'events' && (
        <>
          <button onClick={() => setShowCreate((v) => !v)}>{t('admin.newEvent')}</button>
          {showCreate && (
            <form className="card" onSubmit={(e) => { e.preventDefault(); void createEvent(); }} style={{ marginBottom: '1rem' }}>
              <input placeholder="Név" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {['KONCERT', 'SZINHAZ', 'SPORT', 'FESZTIVAL', 'EGYEB'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input placeholder="venueId" type="number" min="1" required value={form.venueId} onChange={(e) => setForm({ ...form, venueId: e.target.value })} />
              <input placeholder="Kezdés" type="datetime-local" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
              <input placeholder="Perc" type="number" min="30" max="600" required value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
              <textarea placeholder="Leírás (min 50 karakter)" required minLength={50} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <input placeholder={t('admin.posterUrl')} value={form.posterUrl} onChange={(e) => setForm({ ...form, posterUrl: e.target.value })} />
              <button className="btn btn-primary" type="submit">{t('admin.create')}</button>
            </form>
          )}
          <table>
            <thead><tr><th>#</th><th>{t('admin.nameCol')}</th><th>{t('admin.filterStatus')}</th><th>{t('event.startsAt')}</th><th></th></tr></thead>
            <tbody>
              {events?.map((e) => (
                <tr key={e.id}>
                  <td>{e.id}</td>
                  <td>{e.name}<br /><span className="event-meta">{e.venueName} · org{e.organizerUserId}</span></td>
                  <td>{t(`status.${e.status as keyof typeof t | string}`)}<span style={{ display: 'none' }}>{e.status}</span></td>
                  <td>{new Date(e.startsAt).toLocaleDateString()}</td>
                  <td>
                    <button onClick={() => void loadStats(e.id)}>{t('admin.statistics')}</button>
                    {stats[e.id] && (
                      <span className="event-meta">
                        {' '}{t('admin.soldTickets')}: {stats[e.id].soldTickets}, {t('admin.revenue')}: {fmtPrice(stats[e.id].revenue)}, {t('admin.utilization')}: {stats[e.id].utilization}%
                      </span>
                    )}
                    {e.status === 'PISZKOZAT' && (
                      <>
                        {' '}<button onClick={() => void act(() => apiFetch(`/events/${e.id}/publish`, { method: 'POST', body: '' }))}>{t('admin.publish')}</button>
                        {' '}<button onClick={() => { if (window.confirm(t('admin.confirmDelete'))) void act(() => apiFetch(`/events/${e.id}`, { method: 'DELETE' })); }}>{t('admin.delete')}</button>
                      </>
                    )}
                    {e.status === 'PUBLIKALT' && (
                      <button onClick={() => void act(() => apiFetch(`/events/${e.id}/sales/pause`, { method: 'POST', body: '' }))}>{t('admin.pause')}</button>
                    )}
                    {e.status === 'ERTEKESITES_SZUNETELT' && (
                      <button onClick={() => void act(() => apiFetch(`/events/${e.id}/sales/resume`, { method: 'POST', body: '' }))}>{t('admin.resume')}</button>
                    )}
                    {(e.status === 'PUBLIKALT' || e.status === 'ERTEKESITES_SZUNETELT') && (
                      <button onClick={() => { if (window.confirm(t('admin.confirmCancelEvent'))) void act(() => apiFetch(`/events/${e.id}/cancel`, { method: 'POST' })); }}>{t('admin.cancelEvent')}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tab === 'users' && (
        <>
          <input
            placeholder={t('admin.searchPlaceholder')}
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void reload(); }}
          />
          <button onClick={() => void reload()}>{t('event.filterButton')}</button>
          <table>
            <thead><tr><th>#</th><th>{t('admin.userCol')}</th><th>{t('admin.role')}</th><th></th></tr></thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.fullName}<br /><span className="event-meta">{u.email}</span></td>
                  <td>{u.role} · {u.isActive ? t('admin.active') : t('admin.inactive')}</td>
                  <td>
                    {(['VASARLO', 'SZERVEZO', 'ADMIN'] as const).map((r) => (
                      <button key={r} disabled={u.role === r}
                        onClick={() => void act(() => apiFetch(`/admin/users/${u.id}/role`, { method: 'PATCH', body: JSON.stringify({ role: r }) }))}>
                        {r}
                      </button>
                    ))}
                    <button onClick={() => void act(() => apiFetch(`/admin/users/${u.id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive: !u.isActive }) }))}>
                      {u.isActive ? t('admin.deactivate') : t('admin.activate')}
                    </button>
                  </td>
                </tr>
              ))}
              {users !== null && users.length === 0 && <tr><td colSpan={4}>{t('admin.noResults')}</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {tab === 'bookings' && (
        <>
          <input
            placeholder={t('admin.filterEvent')}
            type="number" min="0"
            value={bookingEventId}
            onChange={(e) => setBookingEventId(e.target.value)}
          />
          <table>
            <thead><tr><th>#</th><th>{t('admin.userCol')}</th><th>{t('admin.eventCol')}</th><th>{t('admin.filterStatus')}</th><th>{t('admin.totalCol')}</th></tr></thead>
            <tbody>
              {bookings?.map((b) => (
                <tr key={b.id}>
                  <td>{b.code}</td>
                  <td>{b.userId}</td>
                  <td>{b.eventName}</td>
                  <td>{t(`status.${b.status as keyof typeof t | string}`)}<span style={{ display: 'none' }}>{b.status}</span></td>
                  <td>{fmtPrice(b.total)}</td>
                </tr>
              ))}
              {bookings !== null && bookings.length === 0 && <tr><td colSpan={5}>{t('admin.noResults')}</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {tab === 'refunds' && (
        <table>
          <thead><tr><th>{t('admin.eventCol')}</th><th>{t('admin.totalCol')}</th><th>{t('admin.refundStatus')}</th><th>{t('admin.createdAt')}</th></tr></thead>
          <tbody>
            {refunds?.map((r) => (
              <tr key={r.id}>
                <td>{r.eventName}</td>
                <td>{fmtPrice(r.amount)}</td>
                <td>{r.status}</td>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {refunds !== null && refunds.length === 0 && <tr><td colSpan={4}>{t('admin.noResults')}</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
