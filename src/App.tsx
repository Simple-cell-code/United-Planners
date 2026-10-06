import { createContext, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Bell, BellRing, Building2, CalendarCheck2, CalendarDays,
  Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, Eye, EyeOff,
  Filter, Flag, LayoutDashboard, ListFilter, LogOut, MapPin, Megaphone, Menu,
  Plus, Search, Settings, ShieldCheck, Sparkles, Ticket, Trash2, UserRound, Users, X,
} from 'lucide-react';

type Status = 'LIVE' | 'STARTING SOON' | 'UPCOMING' | 'COMPLETED' | 'CANCELLED' | 'PENDING';
type Approval = 'Approved' | 'Pending' | 'Rejected';
type TimeFormat = '12h' | '24h';
type PublicView = 'Home' | 'Events' | 'Upcoming Events' | 'Calendar' | 'Plan an Event' | 'Notifications' | 'United Planners' | 'About Us' | 'Contact';
type EventItem = {
  id: number; name: string; type: string; date: string; start: string; end: string;
  location: string; venue: string; status: Status; dress: string; organizer: string;
  image: string; description: string; approval: Approval; attendees: number; price: string;
  registration?: string; contact?: string; guests?: string; imageFile?: string;
};
type AnnouncementCategory = 'General update' | 'Event announcement' | 'Service notice' | 'Community news';
const announcementCategories: AnnouncementCategory[] = ['General update', 'Event announcement', 'Service notice', 'Community news'];
type Announcement = { id: number; sender: string; senderTitle: string; title: string; message: string; createdAt: string; category?: AnnouncementCategory };
type UserRole = 'admin' | 'member';
type AppUser = { id: number; name: string; email: string; role: UserRole; userCode?: string; isBlocked?: boolean; viewName?: string; firstName?: string; lastName?: string; dateOfBirth?: string; gender?: string; avatar?: string; };
type AdminAccountRecord = { id: number; name: string; email: string; role: UserRole; userCode: string; isBlocked: boolean; active: boolean; createdAt: string };
type MemberPreferences = { showUpcomingEvents: boolean; showAnnouncements: boolean; showReminderSummary: boolean };
const profilePictureMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxProfilePictureBytes = 5 * 1024 * 1024;
const defaultMemberPreferences: MemberPreferences = { showUpcomingEvents: true, showAnnouncements: true, showReminderSummary: true };
const getInitials = (name: string) => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0]?.toUpperCase() ?? '')
  .join('') || 'UP';
const readMemberPreferences = (userId: number): MemberPreferences => {
  try {
    const stored = window.localStorage.getItem(`united-planners-member-settings-${userId}`);
    return stored ? { ...defaultMemberPreferences, ...JSON.parse(stored) as Partial<MemberPreferences> } : defaultMemberPreferences;
  } catch {
    return defaultMemberPreferences;
  }
};
type PersistedSiteData = { events: EventItem[] | null; announcements: Announcement[]; reminders: Record<string, string[]> };

const authUsersKey = 'united-planners-auth-users';
const authSessionKey = 'united-planners-auth-session';
const authTokenKey = 'united-planners-auth-token';
const defaultUsers: AppUser[] = [
  { id: 1, name: 'Fai Atula', email: 'admin@unitedplanners.com', role: 'admin' },
  { id: 2, name: 'United Planners Guest', email: 'member@unitedplanners.com', role: 'member' },
];
const toLocalDateISO = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
const dateOffset = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return toLocalDateISO(date); };
const photos = {
  concert: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1100&q=85',
  market: 'https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=1100&q=85',
  dinner: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1100&q=85',
  art: 'https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?auto=format&fit=crop&w=1100&q=85',
  run: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1100&q=85',
  garden: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1100&q=85',
};
const initialEvents: EventItem[] = [];
const dateLabel = (value: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, options);
const localEventTimestamp = (dateValue: string, timeValue: string) => {
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(timeValue.trim());
  if (!match) return Number.NaN;
  const [year, month, day] = dateValue.split('-').map(Number);
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem) hours = hours % 12 + (meridiem === 'PM' ? 12 : 0);
  if (hours > 23 || minutes > 59) return Number.NaN;
  return new Date(year, month - 1, day, hours, minutes).getTime();
};
const displayEventTime = (value: string, format: TimeFormat) => {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: format === '12h' ? 'numeric' : '2-digit', minute: '2-digit', hour12: format === '12h' });
};
const downloadFile = (content: BlobPart, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
const buildReportRows = (events: EventItem[]) => events
  .map(event => ({
    'Event name': event.name,
    'Type': event.type,
    'Date': event.date,
    'Start': event.start,
    'End': event.end,
    'Venue': event.venue,
    'Location': event.location,
    'Organizer': event.organizer,
    'Dress code': event.dress,
    'Status': event.status,
    'Approval': event.approval,
    'Price / RSVP': event.registration || event.price,
    'Attendees': String(event.attendees),
  }));
const exportEventReport = (events: EventItem[], rangeLabel: string, format: 'csv' | 'doc') => {
  const rows = buildReportRows(events);
  const header = Object.keys(rows[0] ?? {}).join(',');
  const csv = [header, ...rows.map(row => Object.values(row).map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))].join('\n');

  if (format === 'csv') {
    downloadFile(csv, `${rangeLabel.toLowerCase().replace(/\s+/g, '-')}.csv`, 'text/csv;charset=utf-8;');
    return;
  }

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8" /><title>${rangeLabel}</title></head>
      <body>
        <h1>${rangeLabel}</h1>
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%;">
          <thead>
            <tr>
              ${Object.keys(rows[0] ?? {}).map(key => `<th>${key}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `<tr>${Object.values(row).map(value => `<td>${String(value)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </body>
    </html>`;
  downloadFile(html, `${rangeLabel.toLowerCase().replace(/\s+/g, '-')}.doc`, 'application/msword;charset=utf-8;');
};
type ExportRow = Record<string, string>;
const openAdminExportWindow = (title: string, category: string, rows: ExportRow[]) => {
  const preview = window.open('', '_blank', 'width=1100,height=780,resizable=yes,scrollbars=yes');
  if (!preview) return false;

  const columns = Object.keys(rows[0] ?? {});
  const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
  const table = columns.length
    ? `<table><thead><tr>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(column => `<td>${escapeHtml(row[column] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '<p class="empty">There are no rows in this list yet.</p>';

  preview.document.open();
  preview.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 20% 0%,#14282b,#0a0d10 55%);color:#f5f8f8;font:14px 'DM Sans',Segoe UI,sans-serif}.shell{max-width:1120px;margin:auto;padding:36px 24px 60px}.eyebrow{color:#60e4e7;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase}h1{font-size:30px;margin:10px 0 8px}.lede{color:#aab6b8;margin:0 0 26px}.controls{display:grid;grid-template-columns:minmax(220px,1fr) minmax(250px,1.5fr);gap:16px;padding:18px;border:1px solid #293538;border-radius:9px;background:#101619;margin-bottom:18px}.field{display:flex;flex-direction:column;gap:8px}.field label,.format-title{font-size:11px;color:#b5c0c2;font-weight:700}.field input[type=text]{height:42px;border:1px solid #344246;border-radius:6px;background:#0a1012;color:#f5f8f8;padding:0 12px;font:inherit}.formats{display:flex;gap:9px}.format{flex:1;display:flex;align-items:center;gap:9px;padding:10px;border:1px solid #344246;border-radius:6px;background:#0b1113;cursor:pointer}.format:has(input:checked){border-color:#60e4e7;background:#112427}.format input{accent-color:#60e4e7}.format span{font-size:12px;font-weight:700}.format small{display:block;color:#97a5a8;font-size:10px;font-weight:400;margin-top:3px}.hint{grid-column:1/-1;margin:0;color:#94a2a4;font-size:11px}.preview{overflow:auto;border:1px solid #293538;border-radius:8px;background:#101619}table{border-collapse:collapse;width:100%;min-width:650px;text-align:left}th,td{padding:12px 14px;border-bottom:1px solid #263135;font-size:12px;vertical-align:top}th{position:sticky;top:0;background:#172124;color:#60e4e7;font-size:10px;letter-spacing:.8px;text-transform:uppercase}td{color:#dbe3e4}.empty{padding:30px;color:#9ba8aa}.footer{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.button{min-height:40px;padding:0 15px;border-radius:6px;border:1px solid #344246;background:#11191c;color:#dce6e7;font-weight:700;cursor:pointer}.button:hover{border-color:#60e4e7}.primary{border-color:#60e4e7;background:linear-gradient(135deg,#7ff5f7,#60e4e7);color:#071214}.primary:disabled{opacity:.45;cursor:not-allowed}@media(max-width:650px){.shell{padding:24px 14px}.controls{grid-template-columns:1fr}.hint{grid-column:auto}.formats{flex-direction:column}h1{font-size:24px}}
    </style></head><body><main class="shell"><div class="eyebrow">United Planners · Admin export</div><h1>${escapeHtml(title)}</h1><p class="lede">Review the rows and choose an editable format. This preview reflects the data currently in this workspace.</p><section class="controls"><div class="field"><label for="filename">File name</label><input id="filename" type="text" value="${escapeHtml(category)}"></div><div class="field"><span class="format-title">Download format</span><div class="formats"><label class="format"><input type="radio" name="format" value="csv" checked><span>Excel / CSV<small>Editable spreadsheet rows and columns</small></span></label><label class="format"><input type="radio" name="format" value="doc"><span>Word document<small>Editable formatted report and table</small></span></label></div></div><p class="hint" id="format-hint">CSV opens as a spreadsheet that you can edit, sort, and filter.</p></section><section class="preview">${table}</section><div class="footer"><button class="button" id="close-preview">Close preview</button><button class="button primary" id="download-file" ${rows.length ? '' : 'disabled'}>Download file</button></div></main></body></html>`);
  preview.document.close();

  const updateHint = () => {
    const format = preview.document.querySelector<HTMLInputElement>('input[name="format"]:checked')?.value;
    const hint = preview.document.getElementById('format-hint');
    if (hint) hint.textContent = format === 'doc' ? 'Word opens as a formatted document with an editable table.' : 'CSV opens as a spreadsheet that you can edit, sort, and filter.';
  };
  preview.document.querySelectorAll('input[name="format"]').forEach(input => input.addEventListener('change', updateHint));
  preview.document.getElementById('close-preview')?.addEventListener('click', () => preview.close());
  preview.document.getElementById('download-file')?.addEventListener('click', () => {
    const format = preview.document.querySelector<HTMLInputElement>('input[name="format"]:checked')?.value;
    const baseName = (preview.document.getElementById('filename') as HTMLInputElement | null)?.value.trim() || category;
    const safeName = baseName.replace(/[\\/:*?"<>|]/g, '-').replace(/\.(csv|doc)$/i, '');
    if (format === 'doc') {
      const html = `<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1>${table}</body></html>`;
      downloadFile(html, `${safeName}.doc`, 'application/msword;charset=utf-8;');
      return;
    }
    const csv = [columns, ...rows.map(row => columns.map(column => row[column] ?? ''))]
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    downloadFile(csv, `${safeName}.csv`, 'text/csv;charset=utf-8;');
  });
  return true;
};
const reminderOptions = ['1 week before', '3 days before', '1 day before', '1 hour before'];
const ReminderContext = createContext<{ reminders: Record<string, string[]>; onSave: (id: number, items: string[]) => void }>({ reminders: {}, onSave: () => undefined });
const getSeenNotificationIds = (key: string): number[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is number => typeof id === 'number') : [];
  } catch {
    return [];
  }
};
const rememberNotification = (key: string, id: number) => {
  const seen = getSeenNotificationIds(key);
  if (seen.includes(id)) return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...seen, id]));
  } catch {}
};
const readStoredUsers = (): AppUser[] => {
  if (typeof window === 'undefined') return defaultUsers;
  try {
    const stored = window.localStorage.getItem(authUsersKey);
    if (!stored) {
      window.localStorage.setItem(authUsersKey, JSON.stringify(defaultUsers));
      return defaultUsers;
    }
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.length) return defaultUsers;
    const sanitized = parsed.map(value => {
      const user = { ...value as Record<string, unknown> };
      delete user.password;
      delete user.avatar;
      return user;
    });
    window.localStorage.setItem(authUsersKey, JSON.stringify(sanitized));
    return sanitized as AppUser[];
  } catch {
    return defaultUsers;
  }
};
const persistStoredUsers = (users: AppUser[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(authUsersKey, JSON.stringify(users.map(user => {
      const safeUser = { ...user };
      delete safeUser.avatar;
      return safeUser;
    })));
  } catch {}
};
const readStoredSession = (): AppUser | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(authSessionKey);
    if (!stored) return null;
    const user = JSON.parse(stored) as Record<string, unknown>;
    delete user.password;
    delete user.avatar;
    return user as AppUser;
  } catch {
    return null;
  }
};
const readStoredAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(authTokenKey);
  } catch {
    return null;
  }
};
const persistStoredAuthToken = (token: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (!token) {
      window.localStorage.removeItem(authTokenKey);
      return;
    }
    window.localStorage.setItem(authTokenKey, token);
  } catch {}
};
class AuthApiError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}
const authRequest = async <T,>(path: string, body: Record<string, string>): Promise<T> => {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as (T & { error?: string; code?: string }) | null;
  if (!response.ok) throw new AuthApiError(payload?.error || 'The authentication service is unavailable.', payload?.code);
  if (!payload) throw new AuthApiError('The authentication service returned an invalid response.');
  return payload as T;
};
const persistStoredSession = (user: AppUser | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (!user) {
      window.localStorage.removeItem(authSessionKey);
      return;
    }
    const safeUser = { ...user } as AppUser & { password?: string };
    delete safeUser.password;
    delete safeUser.avatar;
    window.localStorage.setItem(authSessionKey, JSON.stringify(safeUser));
  } catch {}
};
const teamMembers = [
  { name: 'Fai Atula', role: 'Lead developer', accent: 'cyan', summary: 'Builds the experiences that keep every moment feeling seamless, responsive, and intentional.' },
  { name: 'Nathan Gathondu', role: 'Concept artist', accent: 'purple', summary: 'Shapes the visual direction and mood boards that turn ideas into memorable event vibes.' },
  { name: 'Jayk Isaac', role: 'Marketing representative', accent: 'amber', summary: 'Connects the community to the story, campaigns, and moments worth sharing.' },
  { name: 'Jayden Njagua', role: 'AI developer & assistant developer', accent: 'teal', summary: 'Helps refine interfaces, interactions, and the polish behind every detail.' },
  { name: 'Leo Ombati', role: 'Assistant developer', accent: 'rose', summary: 'Supports product quality through experimentation, testing, and thoughtful iteration.' },
];

function Brand({ onClick }: { onClick?: () => void }) {
  return <button className="brand" onClick={onClick} aria-label="United Planners"><span className="brand-mark"><span /><span /><span /></span><span className="brand-wordmark">UNITED<span>PLANNERS</span></span></button>;
}
function TeamGrid() {
  return <div className="team-grid">{teamMembers.map(person => <div key={person.name} className={`team-card ${person.accent}`}><div className="team-card-top"><span className="team-avatar">{person.name.split(' ').map(part => part[0]).slice(0,2).join('')}</span><span className="team-role">{person.role}</span></div><h3>{person.name}</h3><p>{person.summary}</p></div>)}</div>;
}
function StatusPill({ status }: { status: Status }) {
  return <span className={`status status-${status.toLowerCase().replace(' ', '-')}`}><i />{status}</span>;
}
function ReminderPicker({ event, current, onSave }: { event: EventItem; current: string[]; onSave: (id: number, items: string[]) => boolean | void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(current.length ? current : ['1 week before']);
  const [cancelConfirmation, setCancelConfirmation] = useState(false);
  const [chimeActive, setChimeActive] = useState(false);
  useEffect(() => setItems(current.length ? current : ['1 week before']), [current.join('|')]);
  return <div className="reminder-schedule">
    <button type="button" className={`reminder-trigger ${current.length ? 'is-saved' : ''} ${chimeActive ? 'chime-active' : ''}`} aria-label={current.length ? `Edit reminders for ${event.name}` : `Set a reminder for ${event.name}`} aria-expanded={open} onClick={() => setOpen(value => !value)}>{current.length ? <BellRing size={15}/> : <Bell size={15}/>}<span>{current.length ? 'Reminder set' : 'Set reminder'}</span></button>
    {open && <div className="reminder-popover">
      <strong>{current.length ? 'Your reminder is set for' : 'Choose when to remind you'}</strong>
      {current.length > 0 && <p className="picker-reminder-summary">We’ll remind you {current.join(', ')} before this event.</p>}
      {reminderOptions.map(option => <label key={option}><input type="checkbox" checked={items.includes(option)} onChange={() => setItems(value => value.includes(option) ? value.filter(item => item !== option) : [...value, option])} />{option}</label>)}
      <button type="button" className="button button-primary" disabled={!items.length} onClick={() => { const saved = onSave(event.id, items); if (saved === false) return; if (items.length) { playReminderChime(); setChimeActive(true); window.setTimeout(() => setChimeActive(false), 700); } setOpen(false); }}><Bell size={14}/>{current.length ? 'Update reminder' : 'Save reminder'}</button>
      {current.length > 0 && <button type="button" className="button reminder-cancel-button" onClick={() => setCancelConfirmation(true)}><Trash2 size={14}/>Cancel reminder</button>}
    </div>}
    {cancelConfirmation && <div className="reminder-cancel-backdrop picker-cancel-backdrop" onClick={() => setCancelConfirmation(false)}>
      <div className="reminder-cancel-dialog" role="dialog" aria-modal="true" aria-labelledby={`cancel-reminder-${event.id}`} onClick={e => e.stopPropagation()}>
        <span className="reminder-cancel-icon"><Trash2 size={18}/></span>
        <h3 id={`cancel-reminder-${event.id}`}>Cancel this reminder?</h3>
        <p>Your {current.join(', ')} reminder for {event.name} will be removed.</p>
        <div className="reminder-cancel-actions">
          <button className="button button-ghost" onClick={() => setCancelConfirmation(false)}>Keep reminder</button>
          <button className="button reminder-cancel-button" onClick={() => { const saved = onSave(event.id, []); if (saved === false) return; setCancelConfirmation(false); setOpen(false); }}>Cancel reminder</button>
        </div>
      </div>
    </div>}
  </div>;
}
function EventCard({ event, onOpen, reminders, onReminder }: { event: EventItem; onOpen: (item: EventItem) => void; reminders: Record<string, string[]>; onReminder: (id: number, items: string[]) => void }) {
  return <article className="event-card"><button className="event-image" onClick={() => onOpen(event)} style={{ backgroundImage: `url(${event.image})` }} aria-label={`View ${event.name}`}><span className="image-category">{event.type}</span><span className="image-open"><ArrowUpRight size={17} /></span>{event.status === 'LIVE' && <span className="image-live"><i /> LIVE NOW</span>}</button><div className="event-card-body"><div className="card-title-row"><button className="event-title" onClick={() => onOpen(event)}>{event.name}</button><ReminderPicker event={event} current={reminders[event.id] ?? []} onSave={onReminder} /></div><div className="event-meta"><span><CalendarDays size={14} />{dateLabel(event.date)}</span><span><Clock3 size={14} />{event.start} – {event.end}</span></div><div className="event-meta"><span><MapPin size={14} />{event.location}</span><span className="dress-meta">Dress: {event.dress}</span></div><div className="card-footer"><StatusPill status={event.status} /><button className="text-link" onClick={() => onOpen(event)}>View event <ArrowRight size={14} /></button></div>{reminders[event.id]?.length ? <div className="reminder-note"><Bell size={13}/><span><strong>Reminder set</strong><small>{reminders[event.id].join(', ')}</small></span></div> : null}</div></article>;
}
function UpcomingRow({ event, onOpen }: { event: EventItem; onOpen: (item: EventItem) => void }) {
  const reminderState = useContext(ReminderContext);
  return <div className="upcoming-row"><button className="upcoming-thumb" style={{ backgroundImage: `url(${event.image})` }} onClick={() => onOpen(event)} aria-label={`Open ${event.name}`} /><div className="upcoming-date"><span>{dateLabel(event.date, { month: 'short' }).toUpperCase()}</span><strong>{dateLabel(event.date, { day: 'numeric' })}</strong></div><button className="upcoming-info" onClick={() => onOpen(event)}><span className="upcoming-type">{event.type} <i /> {event.start}</span><strong>{event.name}</strong><span className="upcoming-location"><MapPin size={13} />{event.location}</span></button><ReminderPicker event={event} current={reminderState.reminders[event.id] ?? []} onSave={reminderState.onSave}/></div>;
}
function playReminderChime() {
  try {
    const context = new window.AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, start);
    oscillator.frequency.exponentialRampToValueAtTime(1320, start + 0.12);
    oscillator.frequency.exponentialRampToValueAtTime(880, start + 0.28);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { void context.close(); };
    oscillator.start(start);
    oscillator.stop(start + 0.35);
  } catch {}
}
function EventDetails({ event, close, onReminder, savedReminders }: { event: EventItem; close: () => void; onReminder: (id: number, items: string[]) => boolean | void; savedReminders: string[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(timer); }, []);
  const [preferences, setPreferences] = useState(savedReminders.length ? savedReminders : reminderOptions.slice(0, 1));
  const [showReminders, setShowReminders] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  useEffect(() => setPreferences(savedReminders.length ? savedReminders : reminderOptions.slice(0, 1)), [event.id, savedReminders.join('|')]);
  const reminderIsSaved = savedReminders.length > 0;
  const target = localEventTimestamp(event.date, event.status === 'LIVE' ? event.end : event.start);
  const remaining = Math.max(0, target - now);
  const countdown = event.status === 'CANCELLED' ? 'Event cancelled' : event.status === 'COMPLETED' ? 'Event has ended' : event.status === 'LIVE' ? `LIVE NOW · Ends in ${Math.floor(remaining / 3600000)}h ${Math.floor((remaining % 3600000) / 60000)}m` : `${Math.floor(remaining / 86400000)}d ${Math.floor((remaining % 86400000) / 3600000)}h until start`;
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="event-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={close} aria-label="Close"><X size={19} /></button>
        <div className="modal-hero" style={{ backgroundImage: `linear-gradient(0deg,rgba(5,8,10,.75),transparent 65%),url(${event.image})` }}>
          <span className="image-category">{event.type}</span>
          {event.status === 'LIVE' && <span className="image-live"><i /> LIVE NOW</span>}
        </div>
        <div className="modal-content">
          <div className="modal-heading">
            <div><StatusPill status={event.status} /><h2>{event.name}</h2><p>{event.description}</p></div>
            <button className={`button button-outline detail-reminder-trigger ${reminderIsSaved ? 'is-saved' : ''}`} aria-expanded={showReminders} onClick={() => setShowReminders(value => !value)}>
              {reminderIsSaved ? <BellRing size={16} /> : <Bell size={16} />}
              {reminderIsSaved ? 'Reminder set' : 'Set reminder'}
            </button>
          </div>
          {showReminders && <div className="detail-reminder">
            <strong>{reminderIsSaved ? 'Your reminder is set for' : 'Remind me before'}</strong>
            {reminderIsSaved && <p className="detail-reminder-summary">We’ll remind you {savedReminders.join(', ')} before this event.</p>}
            {reminderOptions.map(item => <label key={item}><input type="checkbox" checked={preferences.includes(item)} onChange={() => setPreferences(value => value.includes(item) ? value.filter(x => x !== item) : [...value, item])} />{item}</label>)}
            <div className="detail-reminder-actions">
              <button className="button button-primary" disabled={!preferences.length} onClick={() => { const saved = onReminder(event.id, preferences); if (saved === false) return; playReminderChime(); setShowReminders(false); }}>{reminderIsSaved ? 'Update reminder' : 'Save reminder'}</button>
              {reminderIsSaved && <button className="button reminder-cancel-button" onClick={() => setShowCancelConfirmation(true)}><Trash2 size={14} />Cancel reminder</button>}
            </div>
          </div>}
          <div className="detail-grid">
            <Detail icon={<CalendarDays />} title="DATE" text={dateLabel(event.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} />
            <Detail icon={<Clock3 />} title="TIME" text={`${event.start} – ${event.end}`} />
            <Detail icon={<MapPin />} title="WHERE" text={`${event.venue} · ${event.location}`} />
            <Detail icon={<Sparkles />} title="DRESS CODE" text={event.dress} />
            <Detail icon={<Ticket />} title="TICKETS / RSVP" text={event.registration || event.price} />
            <Detail icon={<Users />} title="ORGANIZED BY" text={event.organizer} />
            <Detail icon={<Clock3 />} title={event.status === 'LIVE' ? 'EXPECTED END' : 'COUNTDOWN'} text={countdown} />
          </div>
          <div className="map-preview"><div className="map-roads" /><span className="map-pin"><MapPin size={19} /></span><div className="map-label"><strong>{event.venue}</strong><span>{event.location} · Map preview</span></div><button className="text-link">Get directions <ArrowUpRight size={14} /></button></div>
          <div className="schedule-row"><div><span className="eyebrow">THE PLAN</span><p><strong>{event.start}</strong> Doors open & welcome<br /><strong>{event.end}</strong> Event wraps up</p></div>{event.status === 'LIVE' && <div className="live-update"><span className="live-dot" />Organizers say: We’re live — come on in!</div>}</div>
        </div>
        {showCancelConfirmation && <div className="reminder-cancel-backdrop" onClick={() => setShowCancelConfirmation(false)}>
          <div className="reminder-cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="reminder-cancel-title" onClick={e => e.stopPropagation()}>
            <span className="reminder-cancel-icon"><Trash2 size={18} /></span>
            <h3 id="reminder-cancel-title">Cancel this reminder?</h3>
            <p>Your {savedReminders.join(', ')} reminder for {event.name} will be removed.</p>
            <div className="reminder-cancel-actions">
              <button className="button button-ghost" onClick={() => setShowCancelConfirmation(false)}>Keep reminder</button>
              <button className="button reminder-cancel-button" onClick={() => { const saved = onReminder(event.id, []); if (saved === false) return; setShowCancelConfirmation(false); setShowReminders(false); }}>Cancel reminder</button>
            </div>
          </div>
        </div>}
      </div>
    </div>
  );
}
function Detail({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="detail-item"><span className="detail-icon">{icon}</span><div><small>{title}</small><strong>{text}</strong></div></div>;
}
function CalendarGrid({ date, events, onOpen, onEmpty }: { date: Date; events: EventItem[]; onOpen: (event: EventItem) => void; onEmpty: () => void }) {
  const offset = (new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7;
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, i) => i - offset + 1);
  return <div className="calendar-grid"><div className="calendar-weekdays">{['MON','TUE','WED','THU','FRI','SAT','SUN'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-days">{cells.map((day, i) => { const valid = day > 0 && day <= count; const iso = valid ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}` : ''; return <button key={i} className={`calendar-day ${valid ? '' : 'outside'} ${iso === dateOffset(0) ? 'is-today' : ''}`} onClick={() => { const event = events.find(item => item.date === iso); if (event) onOpen(event); else if (valid) onEmpty(); }}><span>{valid ? day : day < 1 ? new Date(date.getFullYear(),date.getMonth(),day).getDate() : day-count}</span>{events.filter(event => event.date === iso).slice(0,2).map(event => <i key={event.id} className={event.type === 'Community' ? 'purple-event' : ''} onClick={e => { e.stopPropagation(); onOpen(event); }}>{event.name}</i>)}</button>; })}</div></div>;
}
function PlanModal({ close, submit }: { close: () => void; submit: (event: Omit<EventItem,'id'|'status'|'approval'|'image'|'attendees'|'price'>) => void }) {
  const [form, setForm] = useState({ name:'', description:'', date:dateOffset(7), start:'6:00 PM', end:'9:00 PM', location:'', venue:'', type:'Community', dress:'Casual', organizer:'', contact:'', guests:'', registration:'', imageFile:'' });
  const update = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  return <div className="modal-backdrop" onClick={close}><div className="form-modal" onClick={e => e.stopPropagation()}><div className="form-modal-header"><div><span className="eyebrow"><span className="eyebrow-line" />LET’S MAKE IT HAPPEN</span><h2>Plan an event.</h2><p>Our team reviews every submission before it goes live.</p></div><button className="modal-close" onClick={close} aria-label="Close"><X size={19}/></button></div><form onSubmit={e => { e.preventDefault(); submit(form); }}><label>Event name<input required value={form.name} onChange={e=>update('name',e.target.value)} /></label><label>Date<input required type="date" value={form.date} onChange={e=>update('date',e.target.value)} /></label><label className="full-field">Description<textarea required rows={3} value={form.description} onChange={e=>update('description',e.target.value)} /></label><label>Start time<input required value={form.start} onChange={e=>update('start',e.target.value)} /></label><label>End time<input required value={form.end} onChange={e=>update('end',e.target.value)} /></label><label>Event type<select value={form.type} onChange={e=>update('type',e.target.value)}>{['Community','Music','Arts','Food & Drink','Market','Workshop','Social'].map(type=><option key={type}>{type}</option>)}</select></label><label>Dress code<input value={form.dress} onChange={e=>update('dress',e.target.value)} /></label><label>Venue<input required value={form.venue} onChange={e=>update('venue',e.target.value)} /></label><label>Location<input required value={form.location} onChange={e=>update('location',e.target.value)} /></label><label>Expected guests<input type="number" min="1" value={form.guests} onChange={e=>update('guests',e.target.value)} /></label><label>Organizer<input required value={form.organizer} onChange={e=>update('organizer',e.target.value)} /></label><label>Contact email<input required type="email" value={form.contact} onChange={e=>update('contact',e.target.value)} /></label><label>Event image<input type="file" accept="image/*" onChange={e=>update('imageFile',e.target.files?.[0]?.name ?? '')} /></label><label className="full-field">Registration details<input value={form.registration} onChange={e=>update('registration',e.target.value)} placeholder="Ticket, RSVP, or free entry details" /></label><div className="form-submit full-field"><span><ShieldCheck size={15}/>Submission is private until approved.</span><button className="button button-primary" type="submit">Send for review <ArrowRight size={16}/></button></div></form></div></div>;
}

function PlanWizard({ submit }: { submit: (event: Omit<EventItem,'id'|'status'|'approval'|'image'|'attendees'|'price'>) => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: '', type: 'Community', otherType: '', description: '', date: dateOffset(14), start: '', end: '', venue: '', location: '', organizer: '', contact: '', guests: '', registration: '', imageFile: '' });
  const [imageError, setImageError] = useState('');
  const [timeFormat, setTimeFormat] = useState<TimeFormat>('12h');
  const steps = ['Your idea', 'When & where', 'The host', 'Review'];
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const field = (label: string, key: keyof typeof form, props: { type?: string; required?: boolean; placeholder?: string; min?: string } = {}) => <label>{label}<input name={key} type={props.type || 'text'} required={props.required} min={props.min} placeholder={props.placeholder} value={form[key]} onChange={event => { event.currentTarget.setCustomValidity(''); update(key, event.target.value); }} /></label>;
  const submitStep = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < steps.length - 1) setStep(current => current + 1);
    else submit({ ...form, type: form.type === 'Other' ? form.otherType.trim() : form.type, start: displayEventTime(form.start, timeFormat), end: displayEventTime(form.end, timeFormat), dress: 'Casual' });
  };

  return <section className="content-section planner-page is-visible" id="plan-event">
    <div className="planner-heading"><div className="eyebrow"><span className="eyebrow-line"/>LET’S MAKE IT HAPPEN</div><h2>Good plans start<br/><span>with an idea.</span></h2><p>Work through a few quick steps. Your event will be sent to our team for review before it appears on the calendar.</p></div>
    <div className="planner-layout"><aside className="planner-steps" aria-label="Planning steps">{steps.map((label, index) => <div key={label} className={`planner-step ${index === step ? 'active' : ''} ${index < step ? 'complete' : ''}`}><span>{index < step ? <Check size={15}/> : `0${index + 1}`}</span><div><strong>{label}</strong><small>{['Shape the event', 'Pick a time and place', 'Add a point of contact', 'Check everything'][index]}</small></div></div>)}</aside>
      <form className="planner-form" onSubmit={submitStep}><div className="planner-form-heading"><span>STEP {step + 1} OF {steps.length}</span><h3>{['Tell us what you’re dreaming up', 'Choose when and where', 'Who should we contact?', 'Ready for a final check?'][step]}</h3></div>
        {step === 0 && <div className="planner-fields">{field('Event name', 'name', { required: true, placeholder: 'e.g. Sunday makers market' })}<label>Event type<select value={form.type} onChange={event => update('type', event.target.value)}>{['Community','Music','Arts','Food & Drink','Market','Workshop','Social','Other'].map(type => <option key={type}>{type}</option>)}</select></label>{form.type === 'Other'&&<label className="full-field other-event-type"><span>Name your event type</span><input required minLength={2} maxLength={50} pattern=".*\S.*" placeholder="Give your event its own category name" value={form.otherType} onChange={event => update('otherType', event.target.value)} /><small>This name appears as the event category across the website.</small></label>}<label className="full-field">What will happen?<textarea required rows={4} placeholder="Give us the short version of what guests can expect." value={form.description} onChange={event => update('description', event.target.value)} /></label><label className="full-field planner-photo-field">Event banner photo<input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { setImageError('Choose an image smaller than 5 MB.'); event.currentTarget.value = ''; return; } setImageError(''); const reader = new FileReader(); reader.onload = () => update('imageFile', typeof reader.result === 'string' ? reader.result : ''); reader.readAsDataURL(file); }} />{imageError&&<small className="planner-photo-error">{imageError}</small>}{form.imageFile&&<span className="planner-photo-preview"><img src={form.imageFile} alt="Event banner preview"/><span>Banner preview</span></span>}</label></div>}
        {step === 1 && <><div className="planner-time-format"><span>Display event times as</span><div className="calendar-view-toggle" role="group" aria-label="Event time format"><button type="button" className={timeFormat==='12h'?'selected':''} aria-pressed={timeFormat==='12h'} onClick={()=>setTimeFormat('12h')}>12-hour</button><button type="button" className={timeFormat==='24h'?'selected':''} aria-pressed={timeFormat==='24h'} onClick={()=>setTimeFormat('24h')}>24-hour</button></div><small>The time picker follows your device; this controls how times appear on the event.</small></div><div className="planner-fields">{field('Event date', 'date', { type: 'date', required: true })}{field('Start time', 'start', { type: 'time', required: true })}{field('End time', 'end', { type: 'time', required: true })}{field('Venue', 'venue', { required: true, placeholder: 'Venue or meeting point' })}{field('City / neighborhood', 'location', { required: true, placeholder: 'e.g. Westlands, Nairobi' })}</div></>}
        {step === 2 && <div className="planner-fields">{field('Organizer name', 'organizer', { required: true, placeholder: 'Person or organization' })}{field('Contact email', 'contact', { type: 'email', required: true, placeholder: 'you@example.com' })}{field('Expected guests', 'guests', { type: 'number', placeholder: 'Approximate number' })}{field('Ticket or RSVP details', 'registration', { placeholder: 'Free entry, RSVP link, or price' })}</div>}
        {step === 3 && <div className="planner-review"><p>Here’s the plan you’re sending for review:</p>{form.imageFile&&<div className="planner-review-photo"><img src={form.imageFile} alt="Selected event banner"/><span>Event banner photo</span></div>}<div><span>EVENT</span><strong>{form.name}</strong></div><div><span>TYPE</span><strong>{form.type === 'Other' ? form.otherType || 'Custom type needed' : form.type}</strong></div><div><span>WHEN</span><strong>{form.date} · {displayEventTime(form.start, timeFormat)}–{displayEventTime(form.end, timeFormat)}</strong></div><div><span>WHERE</span><strong>{form.venue}, {form.location}</strong></div><div><span>ORGANIZER</span><strong>{form.organizer} · {form.contact}</strong></div><div><span>DETAILS</span><strong>{form.description}</strong></div></div>}
        <div className="planner-controls">{step > 0 ? <button type="button" className="button button-outline" onClick={() => setStep(current => current - 1)}><ChevronLeft size={16}/>Back</button> : <span className="planner-note"><ShieldCheck size={15}/>Reviewed before publishing</span>}<button type="submit" className="button button-primary">{step === steps.length - 1 ? 'Send for review' : 'Continue'}<ArrowRight size={16}/></button></div>
      </form></div>
  </section>;
}

function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const sendEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = `From: ${name}\nReply email: ${email}\n\n${message}`;
    window.location.href = `mailto:hello@unitedplanners.org?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  return <section className="content-section contact-page is-visible" id="contact"><div className="contact-intro"><div className="eyebrow"><span className="eyebrow-line"/>WE’RE ALL EARS</div><h2>Let’s make<br/><span>something happen.</span></h2><p>Questions, ideas, or a good story to share? Send us a note and we’ll get back to you.</p><div className="contact-official"><span>OFFICIAL EMAIL</span><a href="mailto:hello@unitedplanners.org">hello@unitedplanners.org <ArrowUpRight size={16}/></a></div></div><form className="contact-form" onSubmit={sendEmail}><div className="contact-form-heading"><span>WRITE TO THE TEAM</span><p>Your email app will open with your message ready to send.</p></div><label>Your name<input value={name} onChange={event => setName(event.target.value)} placeholder="Name" /></label><label>Your email<input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label><label>Subject<input required value={subject} onChange={event => setSubject(event.target.value)} placeholder="What’s this about?" /></label><label>Message<textarea required rows={5} value={message} onChange={event => setMessage(event.target.value)} placeholder="Tell us a little more..." /></label><button className="button button-primary" type="submit">Prepare email <ArrowRight size={16}/></button></form></section>;
}

export default function App() {
  const [admin, setAdmin] = useState(false);
  const [adminSignIn, setAdminSignIn] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => readStoredSession());
  const [authToken, setAuthToken] = useState<string | null>(() => readStoredAuthToken());
  const [memberDashboardOpen, setMemberDashboardOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  const [publicView, setPublicViewState] = useState<PublicView>('Home');
  const [pageTransition, setPageTransition] = useState<'idle' | 'exit' | 'enter'>('idle');
  const transitionTimer = useRef<number | undefined>(undefined);
  const [adminPage, setAdminPage] = useState('Dashboard');
  const [events, setEvents] = useState(initialEvents);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All events');
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [reminders, setReminders] = useState<Record<string,string[]>>({});
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dataStoreReady, setDataStoreReady] = useState(false);
  const [dataStoreAvailable, setDataStoreAvailable] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [announcedEvent, setAnnouncedEvent] = useState<EventItem | null>(null);
  const [toast, setToast] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [calendarMode, setCalendarMode] = useState<'Month'|'Week'|'Day'>('Month');
  const [calendarDate, setCalendarDate] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [systemNow, setSystemNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setSystemNow(new Date()), 15_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!authToken) {
      if (currentUser) setCurrentUser(null);
      return;
    }
    let active = true;
    void fetch('/api/auth/me', { headers: { Authorization: `Bearer ${authToken}` }, cache: 'no-store' }).then(async response => {
      const verifiedUser = response.ok ? await response.json().catch(() => null) as { role?: UserRole; userCode?: string } | null : null;
      if (!active) return;
      if (response.ok) {
        if (verifiedUser) setCurrentUser(previous => previous ? { ...previous, role: verifiedUser.role || previous.role, userCode: verifiedUser.userCode || previous.userCode } : previous);
        void fetch('/api/auth/me/avatar', { headers: { Authorization: `Bearer ${authToken}` }, cache: 'no-store' }).then(async avatarResponse => {
          if (!avatarResponse.ok) throw new Error(`Profile picture request failed (${avatarResponse.status}).`);
          const payload = await avatarResponse.json() as { avatar?: unknown };
          if (payload.avatar !== null && typeof payload.avatar !== 'string') throw new Error('The profile picture response is invalid.');
          const avatar = typeof payload.avatar === 'string' ? payload.avatar : undefined;
          if (active) setCurrentUser(previous => previous ? { ...previous, avatar } : previous);
        }).catch(error => console.warn('Could not load the profile picture.', error));
        return;
      }
      setCurrentUser(null);
      setAuthToken(null);
      setAdmin(false);
      setMemberDashboardOpen(false);
      if (response.status === 403) window.alert('This account has been blocked from the United Planners service.');
    }).catch(() => {
      if (!active) return;
      setCurrentUser(null);
      setAuthToken(null);
      setAdmin(false);
      setMemberDashboardOpen(false);
    });
    return () => { active = false; };
  }, [authToken]);
  useEffect(() => {
    if (!currentUser || !authToken) return;
    const heartbeat = async () => {
      try {
        const response = await fetch('/api/presence/heartbeat', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } });
        if (response.status === 403) {
          const data = await response.json().catch(() => null);
          if (data?.code === 'ACCOUNT_BLOCKED') {
            setCurrentUser(null);
            setAuthToken(null);
            setAdmin(false);
            setMemberDashboardOpen(false);
            window.alert('This account has been blocked from the United Planners service.');
          }
        }
      } catch {}
    };
    void heartbeat();
    const interval = window.setInterval(() => { void heartbeat(); }, 15_000);
    return () => window.clearInterval(interval);
  }, [authToken, currentUser?.id]);
  const applySiteData = (data: Partial<PersistedSiteData> | null | undefined) => {
    if (!data) return;
    setEvents(Array.isArray(data.events) ? data.events : []);
    setAnnouncements(Array.isArray(data.announcements) ? data.announcements : []);
    setReminders(data.reminders && typeof data.reminders === 'object' && !Array.isArray(data.reminders) ? data.reminders : {});
  };
  useEffect(() => {
    let active = true;
    const loadSiteData = async () => {
      try {
        const response = await fetch('/api/site-data', { cache: 'no-store', headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} });
        if (!response.ok) throw new Error(`Site data request failed (${response.status})`);
        const data = await response.json() as PersistedSiteData;
        if (!active) return;
        applySiteData(data);
        setDataStoreAvailable(true);
      } catch (error) {
        console.error('Could not load saved United Planners data.', error);
      } finally {
        if (active) setDataStoreReady(true);
      }
    };
    void loadSiteData();
    return () => { active = false; };
  }, [authToken]);
  useEffect(() => {
    if (!dataStoreReady || !dataStoreAvailable) return;
    const refreshSiteData = async () => {
      try {
        const response = await fetch('/api/site-data', { cache: 'no-store', headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} });
        if (!response.ok) throw new Error(`Site data refresh failed (${response.status})`);
        const data = await response.json() as PersistedSiteData;
        applySiteData(data);
      } catch (error) {
        console.warn('Could not refresh United Planners data for another device.', error);
      }
    };
    const interval = window.setInterval(() => {
      void refreshSiteData();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [dataStoreReady, dataStoreAvailable, authToken]);
  useEffect(() => {
    if (!dataStoreReady || !dataStoreAvailable) return;
    const stream = new EventSource('/api/site-data/stream');
    stream.addEventListener('announcements', event => {
      try {
        const liveAnnouncements = JSON.parse((event as MessageEvent<string>).data) as Announcement[];
        if (Array.isArray(liveAnnouncements)) setAnnouncements(liveAnnouncements);
      } catch (error) {
        console.warn('Could not apply a live United Planners update.', error);
      }
    });
    stream.addEventListener('events', event => {
      try {
        const liveEvents = JSON.parse((event as MessageEvent<string>).data) as EventItem[];
        if (Array.isArray(liveEvents)) setEvents(liveEvents);
      } catch (error) {
        console.warn('Could not apply live event updates.', error);
      }
    });
    return () => stream.close();
  }, [dataStoreReady, dataStoreAvailable]);
  useEffect(() => {
    if (!dataStoreReady || !dataStoreAvailable || !authToken) return;
    const saveTimer = window.setTimeout(() => {
      fetch('/api/site-data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ events, announcements, reminders }),
      }).then(response => {
        if (!response.ok) throw new Error(`Site data save failed (${response.status})`);
      }).catch(error => console.error('Could not save United Planners data.', error));
    }, 350);
    return () => window.clearTimeout(saveTimer);
  }, [events, announcements, reminders, dataStoreReady, dataStoreAvailable, authToken]);
  const setPublicView = (view: PublicView) => {
    if (view === publicView) return;
    window.clearTimeout(transitionTimer.current);
    setPageTransition('exit');
    transitionTimer.current = window.setTimeout(() => {
      setPublicViewState(view);
      setPageTransition('enter');
      transitionTimer.current = window.setTimeout(() => setPageTransition('idle'), 380);
    }, 190);
  };
  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>('.search-section,.content-section,.next-week-section,.plan-section,.about-section');
    if (!('IntersectionObserver' in window)) { targets.forEach(target => target.classList.add('is-visible')); return; }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), { threshold: .08 });
    targets.forEach(target => observer.observe(target)); return () => observer.disconnect();
  }, []);
  useEffect(() => () => window.clearTimeout(transitionTimer.current), []);
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const deviceNotification = new Notification('United Planners', { body: message });
        deviceNotification.onclick = () => window.focus();
      } catch (error) {
        console.warn('Device notification could not be displayed.', error);
      }
    }
  };
  useEffect(() => {
    if (currentUser) {
      setAdmin(currentUser.role === 'admin');
      persistStoredSession(currentUser);
      return;
    }
    setAdmin(false);
    persistStoredSession(null);
  }, [currentUser]);
  useEffect(() => {
    persistStoredAuthToken(authToken);
    if (!authToken) {
      setCurrentUser(null);
    }
  }, [authToken]);
  const announceEvent = (event: EventItem) => { playEventAnnouncementChime(); setAnnouncedEvent(event); };
  const publishAnnouncement = (announcement: Omit<Announcement,'id'|'createdAt'>) => setAnnouncements(current => [{ ...announcement, id: Date.now(), createdAt: new Date().toISOString() }, ...current]);
  const saveReminder = (id: number, items: string[]) => {
    if (!currentUser || !authToken) {
      setAuthMode('signin');
      setAdminSignIn(true);
      notify('Sign in to save or manage event reminders.');
      return false;
    }
    const event = events.find(item => item.id === id);
    setReminders(current => ({ ...current, [id]: items }));
    notify(items.length ? `Reminder set for ${event?.name ?? 'event'}` : `Reminder removed${event ? ` for ${event.name}` : ''}`);
    return true;
  };
  const updateEvent = (id: number, changes: Partial<EventItem>) => setEvents(current => current.map(event => event.id === id ? { ...event, ...changes } : event));
  const filtered = useMemo(() => events.filter(event => `${event.name} ${event.location} ${event.type}`.toLowerCase().includes(query.toLowerCase()) && (category === 'All events' || event.type === category) && event.approval === 'Approved'), [events, query, category]);
  const todayEvents = filtered.filter(event => event.date === toLocalDateISO(systemNow));
  const upcoming = filtered.filter(event => event.date > dateOffset(0));
  const nextWeek = upcoming.filter(event => event.date >= dateOffset(7) && event.date <= dateOffset(10));
  const pending = events.filter(event => event.approval === 'Pending');
  const submitEvent = (event: Omit<EventItem,'id'|'status'|'approval'|'image'|'attendees'|'price'>) => setEvents(current => [{ ...event, id: Date.now(), status: 'PENDING', approval: 'Pending', image: event.imageFile || photos.garden, attendees: 0, price: event.registration || 'Details to come' }, ...current]);
  const publishAdminEvent = (event: Omit<EventItem,'id'|'status'|'approval'|'image'|'attendees'|'price'>) => {
    const now = new Date();
    const start = localEventTimestamp(event.date, event.start);
    const end = localEventTimestamp(event.date, event.end);
    const status: Status = event.date < toLocalDateISO(now) || (Number.isFinite(end) && end < now.getTime())
      ? 'COMPLETED'
      : Number.isFinite(start) && start <= now.getTime() && (!Number.isFinite(end) || end >= now.getTime())
        ? 'LIVE'
        : 'UPCOMING';
    setEvents(current => [{ ...event, id: Date.now(), status, approval: 'Approved', image: event.imageFile || photos.garden, attendees: 0, price: event.registration || 'Details to come' }, ...current]);
  };
  const navigatePublic = (view: PublicView) => {
    setPublicView(view);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const openNotifications = () => {
    if (!('Notification' in window)) {
      notify('This browser does not support device notifications.');
    } else if (Notification.permission === 'default') {
      void Notification.requestPermission().then(permission => notify(permission === 'granted' ? 'Device notifications enabled.' : 'Device notifications were not enabled.'));
    } else if (Notification.permission === 'denied') {
      notify('Device notifications are blocked in this browser’s site settings.');
    }
    navigatePublic('Notifications');
  };

  const renderPublicPage = () => {
    const sectionClass = 'page-panel';

    switch (publicView) {
      case 'Events':
        return <div className={sectionClass}><section className="search-section is-visible" id="events"><div className="section-heading-row"><div><div className="eyebrow"><span className="eyebrow-line"/>DISCOVER SOMETHING GOOD</div><h2>Find your next <span>thing.</span></h2></div><p>From little local gems to the big nights out,<br/>it all starts right here.</p></div><div className="search-bar"><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by event, place, or vibe..." aria-label="Search events"/><span className="search-divider"/><label><MapPin size={16}/><span>Nairobi, Kenya</span><ChevronDown size={15}/></label><button className="button button-primary search-submit" onClick={()=>document.getElementById('happening')?.scrollIntoView({behavior:'smooth'})}>Find events <ArrowRight size={16}/></button></div><div className="discovery-tags"><span>Popular right now</span>{['All events','Music','Food & Drink','Arts','Community','Market'].map(type=><button key={type} className={`tag ${category===type?'active':''}`} onClick={()=>setCategory(type)}>{type}</button>)}</div></section><section className="content-section today-section is-visible" id="happening"><div className="section-heading-row"><div><div className="eyebrow"><span className="live-dot"/>RIGHT NOW IN NAIROBI</div><h2>Happening <span>today.</span></h2></div><button className="text-link section-link" onClick={()=>setPublicView('Upcoming Events')}>See upcoming <ArrowRight size={15}/></button></div><div className="event-grid">{todayEvents.length?todayEvents.map(event=><EventCard key={event.id} event={event} onOpen={setSelected} reminders={reminders} onReminder={saveReminder}/>):<div className="empty-state"><CompassIcon/><strong>No events found just yet.</strong><span>Try another search or event type.</span><button className="text-link" onClick={()=>{setQuery('');setCategory('All events');}}>Show all events <ArrowRight size={14}/></button></div>}</div></section></div>;
      case 'Upcoming Events':
        return <div className={sectionClass}><section className="content-section upcoming-section is-visible" id="upcoming"><div className="section-heading-row"><div><div className="eyebrow"><span className="eyebrow-line"/>MAKE A DATE OF IT</div><h2>Coming <span>up.</span></h2></div><div className="section-aside"><p>Good plans are closer than you think.</p><button className="text-link" onClick={()=>setPublicView('Calendar')}>Browse calendar <ArrowRight size={15}/></button></div></div><div className="upcoming-layout"><div className="upcoming-feature" style={{backgroundImage:`linear-gradient(0deg,rgba(7,10,12,.92),rgba(7,10,12,.05) 75%),url(${upcoming[0]?.image||photos.art})`}}><div className="feature-date"><span>{upcoming[0]?dateLabel(upcoming[0].date,{month:'short'}).toUpperCase():'OCT'}</span><strong>{upcoming[0]?dateLabel(upcoming[0].date,{day:'numeric'}):'08'}</strong></div><div className="feature-content"><span className="feature-kicker">EDITOR’S PICK · {upcoming[0]?.type||'COMMUNITY'}</span><h3>{upcoming[0]?.name||'Make a little room for wonder.'}</h3><p><MapPin size={14}/>{upcoming[0]?.location||'Nairobi, Kenya'} · <Clock3 size={14}/>{upcoming[0]?.start||'6:00 PM'}</p><button className="button button-primary" onClick={()=>upcoming[0]&&setSelected(upcoming[0])}>Get the details <ArrowRight size={16}/></button></div></div><div className="upcoming-list">{upcoming.slice(1,5).map(event=><UpcomingRow key={event.id} event={event} onOpen={setSelected}/>)}</div></div></section><section className="next-week-section is-visible"><div className="next-week-copy"><div className="eyebrow"><Sparkles size={14}/>A LITTLE SOMETHING TO LOOK FORWARD TO</div><h2>Next week,<br/><span>sorted.</span></h2><p>Put something good on the calendar. Your future self will thank you.</p><button className="button button-outline" onClick={()=>setPublicView('Calendar')}>Explore the week <ArrowRight size={16}/></button></div><div className="next-week-events">{(nextWeek.length?nextWeek:upcoming.slice(0,2)).map(event=><UpcomingRow key={event.id} event={event} onOpen={setSelected}/>)}</div><div className="week-decoration">07<span>DAYS</span></div></section></div>;
      case 'Calendar':
        return <div className={sectionClass}><section className="content-section calendar-section is-visible" id="calendar"><div className="section-heading-row"><div><div className="eyebrow"><span className="eyebrow-line"/>SAVE YOURSELF A SEAT</div><h2>On the <span>calendar.</span></h2></div><div className="calendar-view-toggle">{(['Month','Week','Day'] as const).map(mode=><button key={mode} className={calendarMode===mode?'selected':''} onClick={()=>setCalendarMode(mode)}>{mode}</button>)}</div></div><div key={`${calendarDate.getFullYear()}-${calendarDate.getMonth()}-${calendarMode}`} className="calendar-shell calendar-content-transition"><div className="calendar-top"><div className="calendar-month"><button className="icon-button" onClick={()=>setCalendarDate(new Date(calendarDate.getFullYear(),calendarDate.getMonth()-1,1))}><ChevronLeft size={18}/></button><h3>{calendarDate.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h3><button className="icon-button" onClick={()=>setCalendarDate(new Date(calendarDate.getFullYear(),calendarDate.getMonth()+1,1))}><ChevronRight size={18}/></button></div><div className="calendar-key"><span><i className="key-cyan"/>Approved</span><span><i className="key-purple"/>Community</span></div></div>{calendarMode==='Month'?<CalendarGrid date={calendarDate} events={events} onOpen={setSelected} onEmpty={()=>notify('No event on this day')}/>:<div className="calendar-agenda">{upcoming.slice(0,calendarMode==='Day'?2:5).map(event=><UpcomingRow key={event.id} event={event} onOpen={setSelected}/>)}</div>}</div></section></div>;
      case 'Notifications': {
        if (!currentUser || !authToken) return <div className={sectionClass}><section className="content-section planner-page is-visible"><div className="planner-heading"><span className="eyebrow"><span className="eyebrow-line"/>MEMBER ACCESS</span><h2>Sign in to view <span>reminders.</span></h2><p>Your saved reminder schedule is available after you sign in.</p><button className="button button-primary" onClick={() => { setAuthMode('signin'); setAdminSignIn(true); }}>Sign in <ArrowRight size={15}/></button></div></section></div>;
        const remindedEvents = events.filter(event => (reminders[event.id] ?? []).length > 0).sort((a, b) => a.date.localeCompare(b.date));
        return <div className={sectionClass}><section className="content-section reminders-page is-visible"><div className="section-heading-row"><div><div className="eyebrow"><span className="eyebrow-line"/>YOUR PLANS, RIGHT ON TIME</div><h2>Event <span>reminders.</span></h2></div><p>{remindedEvents.length} event{remindedEvents.length === 1 ? '' : 's'} saved for a reminder.</p></div>{remindedEvents.length ? <div className="reminder-list">{remindedEvents.map(event => <article className="reminder-list-item" key={event.id}><div className="reminder-list-image" style={{backgroundImage:`url(${event.image})`}}/><div className="reminder-list-details"><span>{dateLabel(event.date,{weekday:'short',month:'short',day:'numeric'})} · {event.start}</span><h3>{event.name}</h3><p><MapPin size={13}/>{event.venue} · {event.location}</p><div className="reminder-time-chips">{reminders[event.id].map(time => <span key={time}><Bell size={12}/>{time}</span>)}</div></div><div className="reminder-list-actions"><button className="button button-outline" onClick={()=>setSelected(event)}>View event</button><button className="icon-button" onClick={()=>saveReminder(event.id,[])} aria-label={`Remove reminders for ${event.name}`} title="Remove reminders"><Trash2 size={16}/></button></div></article>)}</div> : <div className="reminders-empty"><Bell size={22}/><strong>No event reminders yet</strong><p>Choose the bell on an event and save a reminder schedule. Your events will show up here.</p><button className="button button-primary" onClick={()=>navigatePublic('Events')}>Explore events <ArrowRight size={15}/></button></div>}</section></div>;
      }
      case 'Plan an Event':
        return currentUser && authToken
          ? <div className={sectionClass}><PlanWizard submit={event => { submitEvent(event); notify('Event sent for administrator review'); }} /></div>
          : <div className={sectionClass}><section className="content-section planner-page is-visible"><div className="planner-heading"><span className="eyebrow"><span className="eyebrow-line"/>MEMBER ACCESS</span><h2>Sign in to plan <span>an event.</span></h2><p>Sign in or create an account to submit an event for review.</p><button className="button button-primary" onClick={() => { setAuthMode('signin'); setAdminSignIn(true); }}>Sign in or register <ArrowRight size={15}/></button></div></section></div>;
      case 'United Planners':
        return <div className={sectionClass}><section className="company-page is-visible"><div className="company-page-content"><div className="company-page-brand"><Brand onClick={() => navigatePublic('Home')}/></div><div className="eyebrow"><span className="eyebrow-line"/>A COMMUNITY BUILT AROUND SHOWING UP</div><h1>United Planners</h1><p className="company-page-lead">We help people find their people, discover local events, and turn “we should go” into a plan that actually happens.</p><div className="company-pillars"><div><CalendarDays size={18}/><strong>Find your next thing</strong><span>Explore experiences happening around your community.</span></div><div><Users size={18}/><strong>Bring people together</strong><span>Make it easier to share a good plan with your people.</span></div><div><Sparkles size={18}/><strong>Make room for more</strong><span>Support organizers creating moments worth remembering.</span></div></div><button className="button button-primary" onClick={() => navigatePublic('Events')}>Explore events <ArrowRight size={16}/></button><section className="company-team"><div className="eyebrow"><span className="eyebrow-line"/>MEET THE PEOPLE BEHIND THE PLANS</div><h2>Our Team</h2><TeamGrid /></section></div></section></div>;
      case 'About Us':
        return <div className={sectionClass}><section className="about-section is-visible" id="about"><div className="eyebrow"><span className="eyebrow-line"/>A LITTLE MORE TOGETHER</div><div className="about-content"><h2>Less scrolling.<br/><span>More stories.</span></h2><p>United Planners helps good people find good things to do. We bring events, organizers, and the curious together in one welcoming place — because the best plans are the ones you make together.</p><div className="about-stats"><div><strong>1.2k<span>+</span></strong><small>LOCAL EVENTS</small></div><div><strong>18<span>k</span></strong><small>GOOD PEOPLE</small></div><div><strong>42</strong><small>NEIGHBORHOODS</small></div></div></div><TeamGrid /></section></div>;
      case 'Contact':
        return <div className={sectionClass}><ContactPage /></div>;
      default:
        return <div className={sectionClass}><section className="hero-section" id="home"><div className="hero-grain"/><div className="hero-content"><div className="eyebrow hero-eyebrow"><span className="eyebrow-line"/>YOUR CITY. YOUR MOMENTS.</div><h1>Plan it. Find it.<br/><span>Experience it.</span></h1><p className="hero-copy">The good stuff is happening all around you.<br/>Find your people, make a plan, and be there.</p><div className="hero-buttons"><button className="button button-primary" onClick={()=>setPublicView('Events')}>Explore events <ArrowRight size={17}/></button><button className="button button-ghost" onClick={()=>setPublicView('Plan an Event')}>Plan an event <Plus size={17}/></button></div><div className="hero-trust"><div className="avatar-stack"><span>J</span><span>M</span><span>A</span><span>+</span></div><span>Good things happen together.</span></div></div><div className="hero-visual"><div className="hero-image-main" style={{backgroundImage:`url(${photos.concert})`}}><div className="hero-image-label"><span className="live-dot"/>HAPPENING AROUND YOU</div></div><div className="floating-date"><CalendarDays size={16}/><div><strong>{dateLabel(dateOffset(0),{month:'short',day:'numeric'})}</strong><span>Find your next moment</span></div><ArrowUpRight size={17}/></div><div className="hero-small-image" style={{backgroundImage:`url(${photos.dinner})`}}/></div><div className="hero-bottom"><span>MAKE ROOM FOR A LITTLE MORE</span><button className="hero-link" onClick={()=>setPublicView('Events')} aria-label="Open events"><ArrowDown size={18}/></button><span>SCROLL TO EXPLORE</span></div></section><section className="search-section is-visible" id="events"><div className="section-heading-row"><div><div className="eyebrow"><span className="eyebrow-line"/>DISCOVER SOMETHING GOOD</div><h2>Find your next <span>thing.</span></h2></div><p>From little local gems to the big nights out,<br/>it all starts right here.</p></div><div className="search-bar"><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by event, place, or vibe..." aria-label="Search events"/><span className="search-divider"/><label><MapPin size={16}/><span>Nairobi, Kenya</span><ChevronDown size={15}/></label><button className="button button-primary search-submit" onClick={()=>setPublicView('Events')}>Find events <ArrowRight size={16}/></button></div><div className="discovery-tags"><span>Popular right now</span>{['All events','Music','Food & Drink','Arts','Community','Market'].map(type=><button key={type} className={`tag ${category===type?'active':''}`} onClick={()=>setCategory(type)}>{type}</button>)}</div></section><section className="content-section today-section is-visible" id="happening"><div className="section-heading-row"><div><div className="eyebrow"><span className="live-dot"/>RIGHT NOW IN NAIROBI</div><h2>Happening <span>today.</span></h2></div><button className="text-link section-link" onClick={()=>setPublicView('Upcoming Events')}>See upcoming <ArrowRight size={15}/></button></div><div className="event-grid">{todayEvents.length?todayEvents.map(event=><EventCard key={event.id} event={event} onOpen={setSelected} reminders={reminders} onReminder={saveReminder}/>):<div className="empty-state"><CompassIcon/><strong>No events found just yet.</strong><span>Try another search or event type.</span><button className="text-link" onClick={()=>{setQuery('');setCategory('All events');}}>Show all events <ArrowRight size={14}/></button></div>}</div></section><section className="content-section upcoming-section is-visible" id="upcoming"><div className="section-heading-row"><div><div className="eyebrow"><span className="eyebrow-line"/>MAKE A DATE OF IT</div><h2>Coming <span>up.</span></h2></div><div className="section-aside"><p>Good plans are closer than you think.</p><button className="text-link" onClick={()=>setPublicView('Calendar')}>Browse calendar <ArrowRight size={15}/></button></div></div><div className="upcoming-layout"><div className="upcoming-feature" style={{backgroundImage:`linear-gradient(0deg,rgba(7,10,12,.92),rgba(7,10,12,.05) 75%),url(${upcoming[0]?.image||photos.art})`}}><div className="feature-date"><span>{upcoming[0]?dateLabel(upcoming[0].date,{month:'short'}).toUpperCase():'OCT'}</span><strong>{upcoming[0]?dateLabel(upcoming[0].date,{day:'numeric'}):'08'}</strong></div><div className="feature-content"><span className="feature-kicker">EDITOR’S PICK · {upcoming[0]?.type||'COMMUNITY'}</span><h3>{upcoming[0]?.name||'Make a little room for wonder.'}</h3><p><MapPin size={14}/>{upcoming[0]?.location||'Nairobi, Kenya'} · <Clock3 size={14}/>{upcoming[0]?.start||'6:00 PM'}</p><button className="button button-primary" onClick={()=>upcoming[0]&&setSelected(upcoming[0])}>Get the details <ArrowRight size={16}/></button></div></div><div className="upcoming-list">{upcoming.slice(1,5).map(event=><UpcomingRow key={event.id} event={event} onOpen={setSelected}/>)}</div></div></section><section className="next-week-section is-visible"><div className="next-week-copy"><div className="eyebrow"><Sparkles size={14}/>A LITTLE SOMETHING TO LOOK FORWARD TO</div><h2>Next week,<br/><span>sorted.</span></h2><p>Put something good on the calendar. Your future self will thank you.</p><button className="button button-outline" onClick={()=>setPublicView('Calendar')}>Explore the week <ArrowRight size={16}/></button></div><div className="next-week-events">{(nextWeek.length?nextWeek:upcoming.slice(0,2)).map(event=><UpcomingRow key={event.id} event={event} onOpen={setSelected}/>)}</div><div className="week-decoration">07<span>DAYS</span></div></section><section className="plan-section is-visible" id="plan-event"><div className="plan-orb"/><div className="plan-copy"><div className="eyebrow"><span className="eyebrow-line"/>GOT A GOOD THING IN MIND?</div><h2>Make it<br/><span>happen.</span></h2><p>Bring people together around something you love. Tell us a little about it and our team will help take it from idea to on the calendar.</p><button className="button button-primary" onClick={()=>setFormOpen(true)}>Start planning <ArrowRight size={17}/></button><div className="plan-footnote"><ShieldCheck size={15}/>Every event is reviewed before it goes live.</div></div><div className="plan-visual"><div className="plan-photo" style={{backgroundImage:`url(${photos.garden})`}}/><div className="review-card"><span className="review-icon"><Check size={16}/></span><div><strong>Thoughtfully reviewed</strong><span>Made for good gatherings.</span></div><ArrowUpRight size={16}/></div></div></section><section className="about-section is-visible" id="about"><div className="eyebrow"><span className="eyebrow-line"/>A LITTLE MORE TOGETHER</div><div className="about-content"><h2>Less scrolling.<br/><span>More stories.</span></h2><p>United Planners helps good people find good things to do. We bring events, organizers, and the curious together in one welcoming place — because the best plans are the ones you make together.</p><div className="about-stats"><div><strong>1.2k<span>+</span></strong><small>LOCAL EVENTS</small></div><div><strong>18<span>k</span></strong><small>GOOD PEOPLE</small></div><div><strong>42</strong><small>NEIGHBORHOODS</small></div></div><div className="developer-credit"><span>LEAD DEVELOPER</span><strong>Fai Atula</strong></div></div></section><footer className="site-footer" id="contact"><div className="footer-top"><div><Brand onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}/><p>Find your people. Make a plan.<br/>Be there for the good stuff.</p></div><div className="footer-column"><span>EXPLORE</span><button className="footer-link" onClick={()=>setPublicView('Events')}>Find events</button><button className="footer-link" onClick={()=>setPublicView('Upcoming Events')}>Upcoming</button><button className="footer-link" onClick={()=>setPublicView('Calendar')}>Calendar</button></div><div className="footer-column"><span>MAKE IT HAPPEN</span><button className="footer-link" onClick={()=>setPublicView('Plan an Event')}>Plan an event</button><button className="footer-link" onClick={()=>setPublicView('About Us')}>About us</button><a href="mailto:hello@unitedplanners.com">Contact us</a></div><div className="footer-newsletter"><span>GOOD THINGS, OCCASIONALLY.</span><p>A little inspiration for your inbox.</p><div><input placeholder="Your email address" aria-label="Email address"/><button onClick={()=>notify('Thanks for joining the list!')} aria-label="Subscribe"><ArrowRight size={17}/></button></div></div></div><div className="footer-bottom"><span>© 2026 UNITED PLANNERS</span><span>Made for being there.</span><span>PRIVACY · TERMS</span></div></footer></div>;
    }
  };

  if (currentUser?.role === 'member' && memberDashboardOpen && !admin) return <><MemberDashboard currentUser={currentUser} events={events} announcements={announcements} reminders={reminders} onOpenEvent={setSelected} onUpdateUser={updatedUser => { const users = readStoredUsers(); persistStoredUsers(users.some(user => user.id === updatedUser.id) ? users.map(user => user.id === updatedUser.id ? updatedUser : user) : [...users, updatedUser]); setCurrentUser(updatedUser); }} onBack={() => setMemberDashboardOpen(false)} onLogout={() => { setMemberDashboardOpen(false); setCurrentUser(null); setAdmin(false); navigatePublic('Home'); }} onOpenReminderArea={() => { setMemberDashboardOpen(false); navigatePublic('Notifications'); }} />{selected&&<EventDetails event={selected} close={()=>setSelected(null)} onReminder={saveReminder} savedReminders={reminders[selected.id]??[]}/>}</>;
  if (admin) return <><AdminApp events={events} pending={pending} reminders={reminders} announcements={announcements} announcedEvent={announcedEvent} dismissAnnouncedEvent={()=>setAnnouncedEvent(null)} page={adminPage} setPage={setAdminPage} exit={() => { setAdmin(false); setCurrentUser(null); setAuthToken(null); setAdminLoading(false); }} update={updateEvent} add={publishAdminEvent} announceEvent={announceEvent} onReminder={saveReminder} publishAnnouncement={publishAnnouncement} notify={notify} currentUser={currentUser} authToken={authToken} />{announcements[0]&&<AnnouncementWidget key={announcements[0].id} announcement={announcements[0]} onOpen={()=>setSelectedAnnouncement(announcements[0])}/ >}{selectedAnnouncement&&<AnnouncementDetail announcement={selectedAnnouncement} close={()=>setSelectedAnnouncement(null)}/>}</>;
  if (adminLoading) return <div className="admin-loading-screen"><div className="admin-loading-card"><div className="admin-loading-orb" /><div className="admin-loading-copy"><span className="signin-chip"><ShieldCheck size={14}/>Preparing workspace</span><h2>Opening the admin dashboard</h2><p>Loading event tools, insights, and workspace settings.</p></div><div className="admin-loading-bar"><span /></div></div></div>;
  if (adminSignIn) return <AdminSignIn currentUser={currentUser} setCurrentUser={setCurrentUser} setAuthToken={setAuthToken} authMode={authMode} setAuthMode={setAuthMode} onBack={() => setAdminSignIn(false)} onSignIn={(user) => { setMemberDashboardOpen(false); setCurrentUser(user); setAdminSignIn(false); setAdmin(user.role === 'admin'); if (user.role === 'admin') { setAdminLoading(true); window.setTimeout(() => { setAdminLoading(false); setAdmin(true); }, 600); } else { navigatePublic('Home'); } }} />;
  return <div className="app-shell" data-view={publicView}><header className="site-header"><div className="header-inner"><Brand onClick={() => navigatePublic('United Planners')}/><nav className={`main-nav ${mobileMenu?'nav-open':''}`} aria-label="Main navigation">{(['Home','Events','Upcoming Events','Calendar','Plan an Event','Notifications','About Us','Contact'] as PublicView[]).map(view=><button key={view} className={publicView===view?'active':''} onClick={()=>navigatePublic(view)}>{view}</button>)}</nav><div className="header-actions"><button className={`icon-button notification-button ${publicView==='Notifications'?'active':''}`} onClick={openNotifications} aria-label={`Notifications, ${Object.values(reminders).filter(items=>items.length).length} reminders`}><Bell size={18}/>{Object.values(reminders).some(items=>items.length>0)&&<i/>}</button>{currentUser?.role === 'member' ? <button className="button button-small button-outline profile-trigger" onClick={()=>setMemberDashboardOpen(true)} aria-label={`Open member dashboard for ${currentUser.viewName || currentUser.name.split(' ')[0]}`}><span className="profile-trigger-avatar">{currentUser.avatar ? <img src={currentUser.avatar} alt={currentUser.viewName || currentUser.name} /> : <UserRound size={15}/>}</span><span>{currentUser.viewName || currentUser.name.split(' ')[0]}</span></button> : <button className="button button-small button-outline" onClick={()=>{ setAuthMode('signin'); setAdminSignIn(true); }}><ShieldCheck size={15}/>Sign in</button>}<button className="mobile-toggle" onClick={()=>setMobileMenu(!mobileMenu)} aria-label="Toggle navigation"><Menu/></button></div></div></header>
    <main className={`page-transition ${pageTransition}`}><ReminderContext.Provider value={{reminders,onSave:saveReminder}}>{renderPublicPage()}</ReminderContext.Provider></main>
    {announcements[0]&&<AnnouncementWidget key={announcements[0].id} announcement={announcements[0]} onOpen={()=>setSelectedAnnouncement(announcements[0])}/>}
    {selectedAnnouncement&&<AnnouncementDetail announcement={selectedAnnouncement} close={()=>setSelectedAnnouncement(null)}/>}
    {announcedEvent&&<EventAnnouncementToast key={announcedEvent.id} event={announcedEvent} stacked={Boolean(announcements[0])} onOpen={()=>{setSelected(announcedEvent);setAnnouncedEvent(null);}} onDismiss={()=>setAnnouncedEvent(null)}/>}
    {selected&&<EventDetails event={selected} close={()=>setSelected(null)} onReminder={saveReminder} savedReminders={reminders[selected.id]??[]}/>} {formOpen&&<PlanModal close={()=>setFormOpen(false)} submit={event=>{submitEvent(event);setFormOpen(false);notify('Event sent for administrator review');}}/>}{toast&&<div className="toast"><CheckCircle2 size={17}/>{toast}<button onClick={()=>setToast('')} aria-label="Dismiss"><X size={14}/></button></div>}
    </div>;
}

function MemberDashboard({ currentUser, events, announcements, reminders, onOpenEvent, onUpdateUser, onBack, onLogout, onOpenReminderArea }: { currentUser: AppUser; events: EventItem[]; announcements: Announcement[]; reminders: Record<string, string[]>; onOpenEvent: (event: EventItem) => void; onUpdateUser: (user: AppUser) => void; onBack: () => void; onLogout: () => void; onOpenReminderArea: () => void; }) {
  const upcoming = events.filter(event => event.approval === 'Approved').slice(0, 4);
  const saved = Object.entries(reminders).filter(([, items]) => items.length > 0).length;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState(() => readMemberPreferences(currentUser.id));
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const displayName = currentUser.viewName || currentUser.name.split(' ')[0];

  const updatePreferences = (nextPreferences: MemberPreferences) => {
    setPreferences(nextPreferences);
    try {
      window.localStorage.setItem(`united-planners-member-settings-${currentUser.id}`, JSON.stringify(nextPreferences));
    } catch {}
  };

  const handleLogout = () => {
    setLogoutConfirmOpen(false);
    onLogout();
  };

  if (settingsOpen) return <MemberAccountSettings currentUser={currentUser} preferences={preferences} onUpdatePreferences={updatePreferences} onUpdateUser={onUpdateUser} onBack={() => setSettingsOpen(false)} onLogout={handleLogout} onOpenReminderArea={onOpenReminderArea} reminderCount={saved} />;

  return <div className="member-dashboard"><div className="member-shell"><header className="member-header"><button className="member-back-button" onClick={onBack}><ArrowLeft size={15}/>Back to home</button><div className="member-header-account"><span className="member-profile-mark">{currentUser.avatar ? <img src={currentUser.avatar} alt={displayName} className="member-profile-avatar" /> : <span className="member-profile-initials">{getInitials(displayName)}</span>}</span><span>{displayName}</span><button type="button" className="icon-button notification-button member-reminders-button" onClick={onOpenReminderArea} aria-label={`Open reminders${saved ? `, ${saved} saved` : ''}`} title="Reminders"><BellRing size={18}/><span>Reminders</span>{saved > 0 && <i/>}</button><button className="member-settings-button" onClick={()=>setSettingsOpen(true)} aria-label="Account settings" title="Account settings"><Settings size={17}/></button><button className="button button-outline logout-button" onClick={()=>setLogoutConfirmOpen(true)}>Log out</button></div></header><div className="member-welcome"><div><span className="signin-chip"><ShieldCheck size={14}/>Member dashboard</span><h1>Welcome back, {displayName}.</h1><p>Find your next plan and keep the good moments close.</p><button className="button button-primary" onClick={onOpenReminderArea}><Bell size={15}/>Review reminders</button></div><div className="member-welcome-art" style={{backgroundImage:`url(${upcoming[0]?.image || photos.concert})`}}><span>{upcoming[0] ? 'UP NEXT' : 'YOUR COMMUNITY'}</span>{upcoming[0]&&<strong>{upcoming[0].name}</strong>}</div></div>
    <div className="member-grid">
      <div className="member-panel highlight-panel"><h3>Your plans</h3><p>{saved} reminder{saved === 1 ? '' : 's'} saved across your upcoming events.</p><button className="button button-primary" onClick={onOpenReminderArea}>Review reminders</button><div className="member-user-code"><span>YOUR USER CODE</span><strong>{currentUser.userCode || 'Code unavailable'}</strong></div></div>
      {preferences.showAnnouncements&&<div className="member-panel"><h3>Announcements</h3>{announcements.length ? announcements.slice(0,2).map(item => <div key={item.id} className="member-announcement"><strong>{item.title}</strong><span>{item.sender} · {item.senderTitle}</span><p>{item.message}</p></div>) : <p>No new announcements yet.</p>}</div>}
    </div>
    {preferences.showUpcomingEvents&&<div className="member-panel"><div className="panel-heading"><div><h3>Upcoming events</h3><p>Events you can explore and save to your reminders.</p></div></div><div className="event-grid">{upcoming.length ? upcoming.map(event => <article key={event.id} className="event-card"><button className="event-image" style={{ backgroundImage: `url(${event.image})` }} onClick={() => onOpenEvent(event)} aria-label={`Open ${event.name}`}><span className="image-category">{event.type}</span></button><div className="event-card-body"><div className="card-title-row"><button className="event-title" onClick={() => onOpenEvent(event)}>{event.name}</button></div><div className="event-meta"><span><CalendarDays size={14} />{dateLabel(event.date)}</span><span><Clock3 size={14} />{event.start}</span></div><div className="event-meta"><span><MapPin size={14} />{event.location}</span></div></div></article>) : <div className="empty-state"><strong>No approved events yet.</strong><span>Refresh after new events are published.</span></div>}</div></div>}
    {logoutConfirmOpen && <div className="logout-confirm-overlay" role="dialog" aria-modal="true"><div className="logout-confirm-dialog"><h3>Log out of your account?</h3><p>You can always sign back in from the home screen whenever you’re ready.</p><div className="logout-confirm-actions"><button className="button button-ghost" onClick={()=>setLogoutConfirmOpen(false)}>Cancel</button><button className="button button-primary" onClick={handleLogout}>Log out</button></div></div></div>}
  </div></div>;
}

function MemberAccountSettings({ currentUser, preferences, onUpdatePreferences, onUpdateUser, onBack, onLogout, onOpenReminderArea, reminderCount }: { currentUser: AppUser; preferences: MemberPreferences; onUpdatePreferences: (preferences: MemberPreferences) => void; onUpdateUser: (user: AppUser) => void; onBack: () => void; onLogout: () => void; onOpenReminderArea: () => void; reminderCount: number; }) {
  const [viewName, setViewName] = useState(currentUser.viewName || currentUser.name.split(' ')[0]);
  const [newEmail, setNewEmail] = useState('');
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [emailChangeStep, setEmailChangeStep] = useState<'request' | 'verify'>('request');
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const [emailUpdateError, setEmailUpdateError] = useState('');
  const [emailUpdateMessage, setEmailUpdateMessage] = useState('');
  const [emailUpdateLoading, setEmailUpdateLoading] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const displayName = currentUser.viewName || currentUser.name.split(' ')[0];
  const togglePreference = (key: keyof MemberPreferences) => onUpdatePreferences({ ...preferences, [key]: !preferences[key] });
  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedViewName = viewName.trim();
    if (!trimmedViewName) return;
    onUpdateUser({ ...currentUser, viewName: trimmedViewName });
    setViewName(trimmedViewName);
    setSavedMessage('Profile updated on this device.');
    window.setTimeout(() => setSavedMessage(''), 2600);
  };
  const requestAccountEmailCode = async () => {
    setEmailUpdateError('');
    setEmailUpdateMessage('');
    const token = readStoredAuthToken();
    if (!token) {
      setEmailUpdateError('Your session expired. Sign in again before changing your email.');
      return;
    }
    if (!newEmail.trim() || !emailCurrentPassword) {
      setEmailUpdateError('Enter your new email and current password.');
      return;
    }
    setEmailUpdateLoading(true);
    try {
      const response = await fetch('/api/auth/email/change/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: newEmail.trim(), currentPassword: emailCurrentPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to send an email verification code.');
      setEmailVerificationCode('');
      setEmailChangeStep('verify');
      setEmailUpdateMessage(data.message || `A verification code was sent to ${newEmail.trim()}.`);
    } catch (error) {
      setEmailUpdateError(error instanceof Error ? error.message : 'Unable to send an email verification code.');
    } finally {
      setEmailUpdateLoading(false);
    }
  };
  const verifyAccountEmail = async () => {
    setEmailUpdateError('');
    const token = readStoredAuthToken();
    if (!token) {
      setEmailUpdateError('Your session expired. Sign in again before changing your email.');
      return;
    }
    setEmailUpdateLoading(true);
    try {
      const response = await fetch('/api/auth/email/change/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: newEmail.trim(), code: emailVerificationCode.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to verify the new email.');
      onUpdateUser({ ...currentUser, email: data.email });
      setEmailCurrentPassword('');
      setEmailVerificationCode('');
      setEmailUpdateMessage('Email address verified and updated.');
      setEmailChangeOpen(false);
    } catch (error) {
      setEmailUpdateError(error instanceof Error ? error.message : 'Unable to verify the new email.');
    } finally {
      setEmailUpdateLoading(false);
    }
  };
  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setAvatarError('');
    if (!profilePictureMimeTypes.includes(file.type)) {
      setAvatarError('Choose a JPEG, PNG, or WebP image for your profile picture.');
      return;
    }
    if (file.size > maxProfilePictureBytes) {
      setAvatarError('Choose a profile picture smaller than 5 MB.');
      return;
    }
    const token = readStoredAuthToken();
    if (!token) {
      setAvatarError('Your session expired. Sign in again before changing your profile picture.');
      return;
    }

    setAvatarUploading(true);
    try {
      const response = await fetch('/api/auth/me/avatar', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': file.type },
        body: file,
      });
      const data = await response.json().catch(() => null) as { avatar?: unknown; error?: string } | null;
      if (!response.ok) throw new Error(data?.error || 'Unable to save your profile picture.');
      if (typeof data?.avatar !== 'string') throw new Error('The server did not return the saved profile picture.');
      onUpdateUser({ ...currentUser, avatar: data.avatar });
      setSavedMessage('Profile photo saved to your account.');
      window.setTimeout(() => setSavedMessage(''), 2600);
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : 'Unable to save your profile picture.');
    } finally {
      setAvatarUploading(false);
    }
  };
  const preferenceRow = (key: keyof MemberPreferences, title: string, description: string) => <div className="member-setting-row" key={key}><div><strong>{title}</strong><span>{description}</span></div><button type="button" className={`member-setting-toggle ${preferences[key] ? 'on' : ''}`} role="switch" aria-checked={preferences[key]} aria-label={title} onClick={() => togglePreference(key)}><span/></button></div>;

  return <div className="member-dashboard"><div className="member-shell"><header className="member-header"><button className="member-back-button" onClick={onBack}><ArrowLeft size={15}/>Back to dashboard</button><div className="member-header-account"><span className="member-profile-mark">{currentUser.avatar ? <img src={currentUser.avatar} alt={displayName} className="member-profile-avatar" /> : <span className="member-profile-initials">{getInitials(displayName)}</span>}</span><span>{displayName}</span><button type="button" className="icon-button notification-button member-reminders-button" onClick={onOpenReminderArea} aria-label={`Open reminders${reminderCount ? `, ${reminderCount} saved` : ''}`} title="Reminders"><BellRing size={18}/><span>Reminders</span>{reminderCount > 0 && <i/>}</button><button className="button button-outline logout-button" onClick={()=>setLogoutConfirmOpen(true)}><LogOut size={14}/>Log out</button></div></header><section className="member-settings-heading"><span className="signin-chip"><Settings size={14}/>Account settings</span><h1>Make it yours.</h1><p>Manage your profile and the activity shown in your member dashboard.</p></section>
    <div className="member-settings-layout"><section className="member-settings-panel"><div className="member-settings-panel-heading"><span className="member-settings-icon"><UserRound size={17}/></span><div><h2>Profile</h2><p>Your account details and display name.</p></div></div><form className="member-settings-form" onSubmit={saveProfile}><div className="member-avatar-picker"><div className="member-avatar-preview">{currentUser.avatar ? <img src={currentUser.avatar} alt="Profile preview" /> : <span>{getInitials(displayName)}</span>}</div><label className="member-avatar-upload"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarUploading} onChange={handleAvatarChange} />{avatarUploading ? 'Uploading…' : 'Choose profile photo'}</label></div>{avatarError && <p className="member-avatar-error" role="alert">{avatarError}</p>}<label>View name<input required maxLength={40} value={viewName} onChange={event=>setViewName(event.target.value)} /></label><div className="member-current-email"><div><span>Current email</span><strong>{currentUser.email}</strong></div><button type="button" className="button button-outline" onClick={()=>{setEmailChangeOpen(true);setEmailUpdateError('');setEmailUpdateMessage('');}}>Change email</button></div>{emailUpdateMessage&&<p className="member-email-update-success" role="status">{emailUpdateMessage}</p>}<div className="member-settings-detail-grid"><div><span>Full name</span><strong>{currentUser.name}</strong></div>{currentUser.dateOfBirth&&<div><span>Date of birth</span><strong>{new Date(`${currentUser.dateOfBirth}T12:00:00`).toLocaleDateString(undefined,{dateStyle:'medium'})}</strong></div>}{currentUser.gender&&<div><span>Gender</span><strong>{currentUser.gender}</strong></div>}</div><div className="member-settings-save-row"><button className="button button-primary" type="submit"><CheckCircle2 size={15}/>Save profile</button>{savedMessage&&<span role="status">{savedMessage}</span>}</div></form></section>
      <section className="member-settings-panel"><div className="member-settings-panel-heading"><span className="member-settings-icon"><Bell size={17}/></span><div><h2>Activity settings</h2><p>Choose what appears on your dashboard.</p></div></div><div className="member-settings-list">{preferenceRow('showUpcomingEvents','Upcoming events','Show approved events in your dashboard.')}{preferenceRow('showAnnouncements','Announcements','Show published announcements in your dashboard.')}{preferenceRow('showReminderSummary','Reminder summary','Show your saved reminder count and shortcut.')}</div></section>
      <section className="member-settings-panel member-device-panel"><div className="member-settings-panel-heading"><span className="member-settings-icon"><Clock3 size={17}/></span><div><h2>Device preferences</h2><p>Dates and times follow your browser settings.</p></div></div><div className="member-settings-detail-grid"><div><span>Time zone</span><strong>{timezone}</strong></div><div><span>Language</span><strong>{navigator.language}</strong></div></div><p className="member-settings-note">Profile and activity preferences are stored in this browser for this prototype. They are not synced to a server or used to send notifications.</p></section>
    </div><button className="member-settings-logout" onClick={()=>setLogoutConfirmOpen(true)}><LogOut size={16}/>Log out of this account</button>
    {emailChangeOpen && <div className="member-email-change-backdrop" onClick={()=>{if(!emailUpdateLoading)setEmailChangeOpen(false);}}>
      <section className="member-email-change-dialog" role="dialog" aria-modal="true" aria-labelledby="member-email-change-title" onClick={event=>event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close email change" disabled={emailUpdateLoading} onClick={()=>setEmailChangeOpen(false)}><X size={18}/></button>
        <span className="signin-chip"><ShieldCheck size={14}/>ACCOUNT SECURITY</span>
        <h2 id="member-email-change-title">Change your email</h2>
        <p>{emailChangeStep === 'request' ? <>Current address: <strong>{currentUser.email}</strong>. Confirm your password to send a verification code to your new address.</> : emailUpdateMessage}</p>
        {emailChangeStep === 'request' ? <form className="member-email-update" onSubmit={event=>{event.preventDefault();void requestAccountEmailCode();}}>
          <label>New email address<input type="email" autoFocus autoComplete="email" required value={newEmail} onChange={event=>setNewEmail(event.target.value)} placeholder="you@example.com" /></label>
          <label>Current password<input type="password" autoComplete="current-password" required value={emailCurrentPassword} onChange={event=>setEmailCurrentPassword(event.target.value)} /></label>
          {emailUpdateError&&<p className="auth-message auth-error" role="alert">{emailUpdateError}</p>}
          <div className="member-email-change-actions"><button type="button" className="button button-ghost" disabled={emailUpdateLoading} onClick={()=>setEmailChangeOpen(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={emailUpdateLoading}>{emailUpdateLoading?<><span className="member-email-spinner"/>Sending…</>:'Send verification code'}</button></div>
        </form> : <form className="member-email-update" onSubmit={event=>{event.preventDefault();void verifyAccountEmail();}}>
          <label>Six-digit code<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus required value={emailVerificationCode} onChange={event=>setEmailVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" /></label>
          {emailUpdateError&&<p className="auth-message auth-error" role="alert">{emailUpdateError}</p>}
          <div className="member-email-change-actions"><button type="button" className="button button-ghost" disabled={emailUpdateLoading} onClick={()=>{setEmailChangeStep('request');setEmailVerificationCode('');setEmailUpdateError('');}}>Back</button><button type="submit" className="button button-primary" disabled={emailUpdateLoading}>{emailUpdateLoading?<><span className="member-email-spinner"/>Verifying…</>:'Verify and change email'}</button></div>
        </form>}
      </section>
    </div>}
    {logoutConfirmOpen && <div className="logout-confirm-overlay" role="dialog" aria-modal="true"><div className="logout-confirm-dialog"><h3>Log out of your account?</h3><p>You can always sign back in from the home screen whenever you’re ready.</p><div className="logout-confirm-actions"><button className="button button-ghost" onClick={()=>setLogoutConfirmOpen(false)}>Cancel</button><button className="button button-primary" onClick={()=>{ setLogoutConfirmOpen(false); onLogout(); }}>Log out</button></div></div></div>}
  </div></div>;
}

function AdminSignIn({ currentUser, setCurrentUser, setAuthToken, authMode, setAuthMode, onBack, onSignIn }: { currentUser: AppUser | null; setCurrentUser: (user: AppUser | null) => void; setAuthToken: (token: string | null) => void; authMode: 'signin' | 'register'; setAuthMode: (mode: 'signin' | 'register') => void; onBack: () => void; onSignIn: (user: AppUser) => void; }) {
  const [firstName, setFirstName] = useState(currentUser?.firstName ?? '');
  const [lastName, setLastName] = useState(currentUser?.lastName ?? '');
  const [dob, setDob] = useState(currentUser?.dateOfBirth ?? '');
  const [gender, setGender] = useState(currentUser?.gender ?? '');
  const [viewName, setViewName] = useState(currentUser?.viewName ?? currentUser?.name?.split(' ')[0] ?? '');
  const [email, setEmail] = useState(currentUser?.email ?? 'admin@unitedplanners.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [authResult, setAuthResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successVisible, setSuccessVisible] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<'email' | 'code'>('email');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const triggerSuccess = (message: string) => {
    setSuccessMessage(message);
    setSuccessVisible(true);
    window.setTimeout(() => setSuccessVisible(false), 1500);
    window.setTimeout(() => setSuccessMessage(null), 1900);
  };

  const showAuthResult = (type: 'success' | 'error', message: string) => {
    setAuthResult({ type, message });
    window.setTimeout(() => setAuthResult(null), 2400);
  };

  const resetRegisterFields = () => {
    setFirstName('');
    setLastName('');
    setDob('');
    setGender('');
    setViewName('');
    setEmail('');
    setPassword('');
  };

  const openPasswordRecovery = () => {
    setRecoveryEmail(email.trim());
    setRecoveryCode('');
    setRecoveryPassword('');
    setRecoveryPasswordConfirm('');
    setRecoveryError('');
    setRecoveryMessage('');
    setRecoveryStep('email');
    setForgotPasswordOpen(true);
  };

  const requestRecoveryCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRecoveryLoading(true);
    setRecoveryError('');
    setRecoveryMessage('');
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to request a reset code.');
      setRecoveryMessage(data.message || 'If an account exists for that email, a reset code has been sent.');
      setRecoveryStep('code');
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : 'Unable to request a reset code.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const submitPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRecoveryError('');
    if (recoveryPassword !== recoveryPasswordConfirm) {
      setRecoveryError('The new passwords do not match.');
      return;
    }
    setRecoveryLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail.trim(), code: recoveryCode.trim(), password: recoveryPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to reset the password.');
      setForgotPasswordOpen(false);
      setPassword('');
      setEmail(recoveryEmail.trim());
      setAuthMode('signin');
      setAuthError('');
      triggerSuccess(data.message || 'Password reset. Sign in with your new password.');
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : 'Unable to reset the password.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setAuthError('');
    setAuthResult(null);

    await new Promise(resolve => window.setTimeout(resolve, 900));

    if (authMode === 'register') {
      const trimmedFirst = firstName.trim();
      const trimmedLast = lastName.trim();
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedPassword = password.trim();
      const trimmedViewName = viewName.trim();

      if (!trimmedFirst || !trimmedLast || !trimmedEmail || !trimmedPassword || !dob) {
        setAuthError('Please complete your first name, second name, date of birth, email, and password.');
        setIsLoading(false);
        showAuthResult('error', 'Registration failed. Please complete all required fields.');
        return;
      }

      let remoteUser: { id: number; name: string; email: string; role: UserRole; userCode?: string; token?: string; viewName?: string };
      try {
        remoteUser = await authRequest('/api/auth/register', {
          name: `${trimmedFirst} ${trimmedLast}`.trim(),
          email: trimmedEmail,
          password: trimmedPassword,
        });
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : 'Unable to create your account.');
        setIsLoading(false);
        showAuthResult('error', error instanceof Error ? error.message : 'Registration failed. Please try again.');
        return;
      }

      const fullName = `${trimmedFirst} ${trimmedLast}`.trim();
      const newUser: AppUser = { id: remoteUser.id, name: remoteUser.name || fullName, email: remoteUser.email, role: remoteUser.role, userCode: remoteUser.userCode, firstName: trimmedFirst, lastName: trimmedLast, dateOfBirth: dob, gender, viewName: remoteUser.viewName || trimmedViewName || trimmedFirst };

      if (remoteUser?.token) {
        setAuthToken(remoteUser.token);
      }
      setCurrentUser(newUser);
      setIsLoading(false);
      showAuthResult('success', 'Registration successful. Your account is ready.');
      window.setTimeout(() => {
        setAuthMode('signin');
        resetRegisterFields();
        setEmail('admin@unitedplanners.com');
        setPassword('admin1234');
      }, 1500);
      return;
    }

    let remoteUser: { id: number; name: string; email: string; role: UserRole; userCode?: string; token?: string; viewName?: string };
    try {
      remoteUser = await authRequest('/api/auth/login', { email: email.trim(), password });
    } catch (error) {
      if (error instanceof AuthApiError && error.code === 'ACCOUNT_BLOCKED') {
        showAuthResult('error', 'This account has been blocked. Contact an administrator for help.');
      } else {
        setAuthError(error instanceof Error ? error.message : 'Incorrect email or password.');
        showAuthResult('error', error instanceof Error ? error.message : 'Sign in failed. Please check your details.');
      }
      setIsLoading(false);
      return;
    }

    if (remoteUser.token) {
      setAuthToken(remoteUser.token);
    }

    const signedInUser: AppUser = { ...remoteUser, viewName: remoteUser.viewName || remoteUser.name.split(' ')[0], firstName: remoteUser.name.split(' ')[0], lastName: remoteUser.name.split(' ').slice(1).join(' '), email: remoteUser.email };

    setCurrentUser(signedInUser);
    setIsLoading(false);
    showAuthResult('success', `Signed in successfully. Welcome, ${signedInUser.viewName}.`);

    window.setTimeout(() => {
      onSignIn(signedInUser);
    }, 1600);
  };

  return <div className="admin-signin-shell">
    <div className="signin-card">
      <div className="signin-header"><Brand onClick={onBack}/><span className="admin-label">{authMode === 'signin' ? 'SIGN IN' : 'REGISTER'}</span></div>
      <div className="signin-intro" key={authMode}><span className="signin-chip"><ShieldCheck size={14}/>{authMode === 'signin' ? 'Account access' : 'Create account'}</span><h2>{authMode === 'signin' ? 'Welcome back' : 'Create your account'}</h2><p>{authMode === 'signin' ? 'Use your United Planners credentials to access the workspace.' : 'Create your profile and join the United Planners community.'}</p></div>
      <div className="signin-meta"><span><CheckCircle2 size={13}/>Secure workspace</span><span><Bell size={13}/>Event reminders ready</span></div>
      <div className="auth-tab-toggle" data-mode={authMode}><span className="auth-tab-indicator" aria-hidden="true"/><button type="button" className={authMode === 'signin' ? 'selected' : ''} onClick={() => { setAuthMode('signin'); setAuthError(''); }}>Sign in</button><button type="button" className={authMode === 'register' ? 'selected' : ''} onClick={() => { setAuthMode('register'); setAuthError(''); }}>Register</button></div>
      <form className="signin-form" key={authMode} onSubmit={handleSubmit}>
        {authMode === 'register' && <>
          <div className="form-row two-col"><label><span>First name</span><input value={firstName} onChange={event => setFirstName(event.target.value)} placeholder="First name" /></label><label><span>Second name</span><input value={lastName} onChange={event => setLastName(event.target.value)} placeholder="Second name" /></label></div>
          <div className="form-row two-col"><label><span>Date of birth</span><input type="date" value={dob} onChange={event => setDob(event.target.value)} /></label><label><span>Gender (optional)</span><select value={gender} onChange={event => setGender(event.target.value)}><option value="">Select</option><option value="Female">Female</option><option value="Male">Male</option><option value="Other">Other</option><option value="Prefer not to say">Prefer not to say</option></select></label></div>
          <div className="form-row"><label><span>View name</span><input value={viewName} onChange={event => setViewName(event.target.value)} placeholder="Your display name" /></label></div>
        </>}
        <label><span>Email</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder={authMode === 'signin' ? 'admin@unitedplanners.com' : 'your@email.com'} /></label>
        <label className="password-field"><span>Password</span><div className="password-wrap"><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={authMode === 'signin' ? 'Password' : 'Create a password'} /><button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} title={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>
        {authError && <p className="auth-error">{authError}</p>}
        <div className="signin-options"><label className="remember-me"><input type="checkbox" checked={rememberMe} onChange={() => setRememberMe(value => !value)} /><span>Remember me</span></label>{authMode === 'signin' ? <button type="button" className="text-link buffered-link" onClick={onBack}>Need another route?</button> : <button type="button" className="text-link buffered-link" onClick={() => setAuthMode('signin')}>Already have an account?</button>}</div>
        {authMode === 'signin' && <button type="button" className="text-link forgot-password-link" onClick={openPasswordRecovery}>Forgot password?</button>}
        <button className="button button-primary signin-submit" type="submit" disabled={isLoading}><ShieldCheck size={15}/>{authMode === 'signin' ? 'Sign in' : 'Create account'}</button>
      </form>
      {authMode === 'signin' ? <p className="auth-bottom-link">No account? <button type="button" className="text-link" onClick={() => { setAuthMode('register'); setAuthError(''); }}>Register here</button></p> : <p className="auth-bottom-link">Already have an account? <button type="button" className="text-link" onClick={() => { setAuthMode('signin'); setAuthError(''); }}>Sign in here</button></p>}
      <button className="button button-ghost" type="button" onClick={onBack}>Back to site</button>
    </div>
    {isLoading && <div className="auth-result-overlay" role="dialog" aria-modal="true" aria-label="Authentication loading"><div className="auth-result-card auth-loading-card"><span className="auth-result-spinner" aria-hidden="true"/><strong>{authMode === 'register' ? 'Creating your account…' : 'Signing you in…'}</strong><span>Checking your details securely</span></div></div>}
    {authResult && <div className="auth-result-overlay" role="dialog" aria-modal="true" aria-label="Authentication result"><div className={`auth-result-card auth-${authResult.type}-card`} role="status"><span className="auth-result-icon">{authResult.type === 'success' ? <CheckCircle2 size={23}/> : <X size={23}/>}</span><strong>{authResult.type === 'success' ? (authMode === 'register' ? 'Registration successful' : 'Signed in successfully') : 'Authentication failed'}</strong><span>{authResult.message}</span></div></div>}
    {successMessage && <div className="auth-success-overlay" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4, 8, 12, 0.48)', backdropFilter: 'blur(5px)', opacity: successVisible ? 1 : 0, transition: 'opacity 0.35s ease', pointerEvents: 'auto', zIndex: 1800 }}><div className="auth-success-card" style={{ background: 'rgba(10, 17, 21, 0.93)', border: '1px solid rgba(112, 236, 255, 0.3)', boxShadow: '0 18px 50px rgba(0, 0, 0, 0.35)', color: '#eefcff', borderRadius: '18px', padding: '1.2rem 1.4rem', display: 'flex', alignItems: 'center', gap: '0.8rem', transform: successVisible ? 'translateY(0) scale(1)' : 'translateY(-12px) scale(0.96)', transition: 'all 0.35s ease', maxWidth: '90vw' }}><CheckCircle2 size={18} style={{ color: '#6ef0b0' }} /><span>{successMessage}</span></div></div>}
    {forgotPasswordOpen && <div className="password-recovery-backdrop" onClick={() => { if (!recoveryLoading) setForgotPasswordOpen(false); }}>
      <section className="password-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="password-recovery-title" onClick={event => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close password recovery" disabled={recoveryLoading} onClick={() => setForgotPasswordOpen(false)}><X size={18}/></button>
        <span className="signin-chip"><ShieldCheck size={14}/>ACCOUNT RECOVERY</span>
        <h2 id="password-recovery-title">{recoveryStep === 'email' ? 'Reset your password' : 'Check your email'}</h2>
        <p>{recoveryStep === 'email' ? 'Enter your account email. We’ll send a one-time code if it matches an account.' : recoveryMessage}</p>
        {recoveryStep === 'email' ? <form className="password-recovery-form" onSubmit={requestRecoveryCode}>
          <label>Email address<input autoFocus type="email" autoComplete="email" required value={recoveryEmail} onChange={event => setRecoveryEmail(event.target.value)} placeholder="you@example.com"/></label>
          {recoveryError && <p className="auth-error" role="alert">{recoveryError}</p>}
          <button className="button button-primary" type="submit" disabled={recoveryLoading}>Send reset code <ArrowRight size={15}/></button>
        </form> : <form className="password-recovery-form" onSubmit={submitPasswordReset}>
          <label>Six-digit code<input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={recoveryCode} onChange={event => setRecoveryCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000"/></label>
          <label>New password<input type="password" autoComplete="new-password" minLength={8} required value={recoveryPassword} onChange={event => setRecoveryPassword(event.target.value)} placeholder="At least 8 characters"/></label>
          <label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} required value={recoveryPasswordConfirm} onChange={event => setRecoveryPasswordConfirm(event.target.value)} placeholder="Enter it again"/></label>
          {recoveryError && <p className="auth-error" role="alert">{recoveryError}</p>}
          <button className="button button-primary" type="submit" disabled={recoveryLoading}>Reset password <ArrowRight size={15}/></button>
          <button type="button" className="text-link recovery-resend" disabled={recoveryLoading} onClick={() => { setRecoveryStep('email'); setRecoveryError(''); }}>Use a different email or request another code</button>
        </form>}
        {recoveryLoading && <div className="password-recovery-loading"><div className="password-recovery-loading-card"><span className="auth-spinner"/><strong>{recoveryStep === 'email' ? 'Sending reset code…' : 'Updating password…'}</strong></div></div>}
      </section>
    </div>}
  </div>;
}

function CompassIcon() { return <Sparkles size={25}/>; }

function playAnnouncementChime() {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return;
  const context = new AudioContextConstructor();
  void context.resume().then(() => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = context.currentTime + 0.02;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(740, startAt);
    oscillator.frequency.setValueAtTime(988, startAt + 0.12);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.035, startAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.34);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { void context.close(); };
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.36);
  }).catch(() => { void context.close(); });
}

function AnnouncementWidget({ announcement, onOpen }: { announcement: Announcement; onOpen: () => void }) {
  const [phase, setPhase] = useState<'entering' | 'leaving' | 'hidden'>('entering');
  const [alreadyShown] = useState(() => getSeenNotificationIds('united-planners-seen-announcements').includes(announcement.id));
  const dismissalTimer = useRef<number | undefined>(undefined);
  const exitTimer = useRef<number | undefined>(undefined);
  const remainingTime = useRef(10_000);
  const timerStartedAt = useRef(0);
  const scheduleDismissal = useRef<() => void>(() => undefined);
  const chimePlayedFor = useRef<number | null>(null);

  useEffect(() => {
    if (alreadyShown) return;
    rememberNotification('united-planners-seen-announcements', announcement.id);
    const dismiss = () => {
      dismissalTimer.current = undefined;
      setPhase('leaving');
      exitTimer.current = window.setTimeout(() => setPhase('hidden'), 320);
    };
    scheduleDismissal.current = () => {
      timerStartedAt.current = Date.now();
      dismissalTimer.current = window.setTimeout(dismiss, remainingTime.current);
    };
    setPhase('entering');
    if (chimePlayedFor.current !== announcement.id) {
      chimePlayedFor.current = announcement.id;
      playAnnouncementChime();
    }
    scheduleDismissal.current();
    return () => {
      window.clearTimeout(dismissalTimer.current);
      window.clearTimeout(exitTimer.current);
    };
  }, [announcement.id, alreadyShown]);

  const pauseDismissal = () => {
    if (dismissalTimer.current === undefined) return;
    window.clearTimeout(dismissalTimer.current);
    dismissalTimer.current = undefined;
    remainingTime.current = Math.max(0, remainingTime.current - (Date.now() - timerStartedAt.current));
  };
  const resumeDismissal = () => {
    if (phase !== 'hidden' && phase !== 'leaving' && dismissalTimer.current === undefined) scheduleDismissal.current();
  };

  if (alreadyShown || phase === 'hidden') return null;
  return <button className={`announcement-widget ${phase}`} onClick={onOpen} onMouseEnter={pauseDismissal} onMouseLeave={resumeDismissal} onFocus={pauseDismissal} onBlur={resumeDismissal} aria-label={`Read ${announcement.category || 'General update'} from ${announcement.sender}: ${announcement.title}`}><span className="announcement-widget-kicker"><Megaphone size={14}/>{announcement.category || 'General update'}</span><span className="announcement-widget-sender"><strong>{announcement.sender}</strong> · {announcement.senderTitle}</span><strong>{announcement.title}</strong><span className="announcement-widget-copy">{announcement.message}</span><span className="announcement-widget-link">Read full announcement <ArrowUpRight size={14}/></span></button>;
}

function AnnouncementDetail({ announcement, close }: { announcement: Announcement; close: () => void }) {
  return <div className="announcement-detail-backdrop" onClick={close}><article className="announcement-detail" role="dialog" aria-modal="true" aria-labelledby="announcement-title" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={close} aria-label="Close announcement"><X size={19}/></button><span className="announcement-detail-kicker"><Megaphone size={15}/>{announcement.category || 'General update'} · UNITED PLANNERS</span><div className="announcement-detail-meta"><time>{new Date(announcement.createdAt).toLocaleString(undefined,{dateStyle:'long',timeStyle:'short'})}</time><p className="announcement-detail-sender">Sent by <strong>{announcement.sender}</strong><span> · {announcement.senderTitle}</span></p></div><h2 id="announcement-title">{announcement.title}</h2><div className="announcement-detail-message">{announcement.message.split('\n').map((paragraph,index)=><p key={index}>{paragraph || '\u00a0'}</p>)}</div><button className="button button-outline" onClick={close}>Close announcement</button></article></div>;
}

function playEventAnnouncementChime() {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return;
  const context = new AudioContextConstructor();
  void context.resume().then(() => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = context.currentTime + 0.03;
    const notes = [659, 784, 988, 784, 659, 880];
    oscillator.type = 'sine';
    notes.forEach((frequency, index) => {
      const noteAt = startAt + index * 0.5;
      oscillator.frequency.setValueAtTime(frequency, noteAt);
      gain.gain.setValueAtTime(0.0001, noteAt);
      gain.gain.exponentialRampToValueAtTime(0.025, noteAt + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteAt + 0.38);
    });
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { void context.close(); };
    oscillator.start(startAt);
    oscillator.stop(startAt + 3);
  }).catch(() => { void context.close(); });
}

function EventAnnouncementToast({ event, onOpen, onDismiss, stacked }: { event: EventItem; onOpen: () => void; onDismiss: () => void; stacked: boolean }) {
  const [phase, setPhase] = useState<'entering' | 'leaving' | 'hidden'>('entering');
  const [alreadyShown] = useState(() => getSeenNotificationIds('united-planners-seen-event-notifications').includes(event.id));
  const timer = useRef<number | undefined>(undefined);
  const exitTimer = useRef<number | undefined>(undefined);
  const remaining = useRef(10_000);
  const startedAt = useRef(0);
  const schedule = useRef<() => void>(() => undefined);
  const dismiss = useRef<() => void>(() => undefined);
  const dismissCallback = useRef(onDismiss);
  dismissCallback.current = onDismiss;

  useEffect(() => {
    if (alreadyShown) return;
    rememberNotification('united-planners-seen-event-notifications', event.id);
    dismiss.current = () => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      setPhase('leaving');
      exitTimer.current = window.setTimeout(() => dismissCallback.current(), 320);
    };
    schedule.current = () => {
      startedAt.current = Date.now();
      timer.current = window.setTimeout(() => dismiss.current(), remaining.current);
    };
    schedule.current();
    return () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(exitTimer.current);
    };
  }, [event.id, alreadyShown]);

  const pause = () => {
    if (timer.current === undefined) return;
    window.clearTimeout(timer.current);
    timer.current = undefined;
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
  };
  const resume = () => {
    if (phase !== 'leaving' && phase !== 'hidden' && timer.current === undefined) schedule.current();
  };

  if (alreadyShown || phase === 'hidden') return null;
  return <aside className={`event-announcement-toast ${phase} ${stacked ? 'stacked' : ''}`} onMouseEnter={pause} onMouseLeave={resume} onFocus={pause} onBlur={resume}><button className="event-announcement-close" onClick={() => dismiss.current()} aria-label="Dismiss new event notification"><X size={14}/></button><span className="event-announcement-kicker"><BellRing size={14}/>NEW EVENT APPROVED</span><div className="event-announcement-photo" style={{backgroundImage:`url(${event.image})`}}/><strong>{event.name}</strong><span className="event-announcement-meta"><CalendarDays size={13}/>{dateLabel(event.date)} · {event.start}<MapPin size={13}/>{event.location}</span><button className="button button-primary event-announcement-open" onClick={onOpen}>View event & reminder options <ArrowRight size={14}/></button></aside>;
}

function AdminApp({ events, pending, reminders, announcements, announcedEvent, dismissAnnouncedEvent, page, setPage, exit, update, add, announceEvent, onReminder, publishAnnouncement, notify, currentUser, authToken }: { events: EventItem[]; pending: EventItem[]; reminders: Record<string,string[]>; announcements: Announcement[]; announcedEvent: EventItem | null; dismissAnnouncedEvent: ()=>void; page: string; setPage: (page:string)=>void; exit: ()=>void; update:(id:number,changes:Partial<EventItem>)=>void; add:(event:Omit<EventItem,'id'|'status'|'approval'|'image'|'attendees'|'price'>)=>void; announceEvent:(event:EventItem)=>void; onReminder:(id:number,items:string[])=>void; publishAnnouncement:(announcement:Omit<Announcement,'id'|'createdAt'>)=>void; notify:(message:string)=>void; currentUser: AppUser | null; authToken: string | null }) {
  const [query,setQuery]=useState(''); const [status,setStatus]=useState('All statuses'); const [type,setType]=useState('All types'); const [selected,setSelected]=useState<EventItem|null>(null); const [showForm,setShowForm]=useState(false);
  const [managedUsers,setManagedUsers]=useState<AdminAccountRecord[]>([]);
  const [userSearch,setUserSearch]=useState('');
  const [activeUserCount,setActiveUserCount]=useState(0);
  const [userDirectoryError,setUserDirectoryError]=useState('');
  const userDirectoryRequestId=useRef(0);
  const [blockingUserIds,setBlockingUserIds]=useState<Set<number>>(()=>new Set());
  const [recentlyBlockedUserId,setRecentlyBlockedUserId]=useState<number|null>(null);
  const [openedAnnouncement,setOpenedAnnouncement]=useState<Announcement|null>(null);
  const [calendarDate,setCalendarDate]=useState(()=>{const now=new Date();return new Date(now.getFullYear(),now.getMonth(),1)});
  const [adminForm,setAdminForm]=useState({ name:'', email:'', password:'' });
  const [adminFormError,setAdminFormError]=useState('');
  const [adminFormSuccess,setAdminFormSuccess]=useState('');
  const refreshUserDirectory = async () => {
    if (!authToken) return;
    const requestId = ++userDirectoryRequestId.current;
    try {
      const response = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${authToken}` }, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load registered users.');
      if (requestId !== userDirectoryRequestId.current) return;
      setManagedUsers(data.users as AdminAccountRecord[]);
      setActiveUserCount(Number(data.activeCount) || 0);
      setUserDirectoryError('');
    } catch (error) {
      if (requestId !== userDirectoryRequestId.current) return;
      setUserDirectoryError(error instanceof Error ? error.message : 'Unable to load registered users.');
    }
  };
  useEffect(() => {
    void refreshUserDirectory();
    const interval = window.setInterval(() => { void refreshUserDirectory(); }, 3_000);
    return () => window.clearInterval(interval);
  }, [authToken]);
  useEffect(() => {
    if (recentlyBlockedUserId === null) return;
    const timeout = window.setTimeout(() => setRecentlyBlockedUserId(null), 1_200);
    return () => window.clearTimeout(timeout);
  }, [recentlyBlockedUserId]);
  const toggleAccountBlock = async (user: AdminAccountRecord) => {
    setBlockingUserIds(current => new Set(current).add(user.id));
    try {
      const response = await fetch(`/api/admin/users/${user.id}/block`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ isBlocked: !user.isBlocked }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update the account.');
      userDirectoryRequestId.current += 1;
      setManagedUsers(current => current.map(account => account.id === user.id ? { ...account, isBlocked: Boolean(data.isBlocked) } : account));
      if (data.isBlocked) setRecentlyBlockedUserId(user.id);
      notify(`${user.name} has been ${data.isBlocked ? 'blocked' : 'unblocked'}.`);
      void refreshUserDirectory();
    } catch (error) {
      setUserDirectoryError(error instanceof Error ? error.message : 'Unable to update the account.');
    } finally {
      setBlockingUserIds(current => {
        const updated = new Set(current);
        updated.delete(user.id);
        return updated;
      });
    }
  };
  const shown=events.filter(event=>`${event.name} ${event.location} ${event.organizer}`.toLowerCase().includes(query.toLowerCase())&&(status==='All statuses'||event.status===status)&&(type==='All types'||event.type===type)&&(page!=='Pending Approvals'||event.approval==='Pending'));
  const matchingUsers=managedUsers.filter(user=>`${user.name} ${user.email} ${user.userCode} ${user.role}`.toLowerCase().includes(userSearch.trim().toLowerCase()));
  const organizerList=[...new Set(events.map(event=>event.organizer).filter(Boolean))];
  const nav=[['Dashboard',<LayoutDashboard size={17}/>],['Events',<CalendarDays size={17}/>],['Pending Approvals',<ShieldCheck size={17}/>],['Users',<Users size={17}/>],['Organizers',<Building2 size={17}/>],['Notifications',<Megaphone size={17}/>],['Calendar',<CalendarCheck2 size={17}/>],['Reports',<Ticket size={17}/>],['Website Settings',<Settings size={17}/>]] as const;
  const approve=(event:EventItem)=>{const publishedEvent={...event,approval:'Approved' as const,status:event.status==='PENDING'?'UPCOMING' as const:event.status};update(event.id,{approval:publishedEvent.approval,status:publishedEvent.status});announceEvent(publishedEvent);notify('Event approved and published');};
  const reject=(event:EventItem)=>{update(event.id,{approval:'Rejected',status:'CANCELLED'});notify('Submission rejected');};
  const create=(event:Omit<EventItem,'id'|'status'|'approval'|'image'|'attendees'|'price'>)=>{add(event);setShowForm(false);notify('Event published on the website');};
  const submitAnnouncement=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);publishAnnouncement({sender:String(form.get('sender')||'').trim(),senderTitle:String(form.get('senderTitle')||'').trim(),category:String(form.get('category')||'General update') as AnnouncementCategory,title:String(form.get('title')||''),message:String(form.get('message')||'')});event.currentTarget.reset();notify('Announcement published on the website');};
  const createAdminAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAdminFormError('');
    setAdminFormSuccess('');

    if (!authToken) {
      setAdminFormError('Your admin session is no longer valid. Please sign in again.');
      return;
    }

    const payload = {
      name: adminForm.name.trim(),
      email: adminForm.email.trim().toLowerCase(),
      password: adminForm.password.trim(),
    };

    if (!payload.name || !payload.email || !payload.password) {
      setAdminFormError('Please complete all admin fields before creating the account.');
      return;
    }

    try {
      const response = await fetch('/api/admin/create-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') ? data.error : 'Unable to create admin account.');
      }

      setAdminForm({ name: '', email: '', password: '' });
      setAdminFormSuccess(`Admin account created for ${data.email}.`);
      notify(`New admin account created for ${data.email}`);
    } catch (error) {
      setAdminFormError(error instanceof Error ? error.message : 'Unable to create admin account.');
    }
  };
  const titles: Record<string, string> = {
    Dashboard: `Good morning, ${currentUser?.viewName || currentUser?.name?.split(' ')[0] || 'Fai Atula'}`,
    Events: 'Event management',
    'Pending Approvals': 'Pending approvals',
    Users: 'User management',
    Organizers: 'Organizer management',
    Notifications: 'Notifications',
    Calendar: 'Event calendar',
    Reports: 'Reports & insights',
    'Website Settings': 'Website settings',
  };
  return <div className="admin-app"><aside className="admin-sidebar"><div className="admin-brand-row"><Brand onClick={exit}/><span className="admin-label">ADMIN</span></div><div className="admin-workspace"><span className="workspace-avatar">FA</span><div><strong>Fai Atula</strong><small>Administrator</small></div><ChevronDown size={15}/></div><div className="sidebar-caption">WORKSPACE</div><nav className="admin-nav">{nav.map(([label,icon])=><button key={label} className={page===label?'active':''} onClick={()=>setPage(label)}>{icon}<span>{label}</span>{label==='Pending Approvals'&&pending.length>0?<b>{pending.length}</b>:null}</button>)}</nav><div className="sidebar-bottom"><div className="admin-user-avatar">FA</div><div><strong>Fai Atula</strong><small>Administrator</small></div></div><button className="sidebar-logout" onClick={exit}><LogOut size={16}/>Back to public site</button></aside><main className="admin-main"><header className="admin-topbar"><div className="admin-breadcrumb"><span>United Planners</span><ChevronRight size={14}/><strong>{page}</strong></div><div className="admin-top-actions"><span className="demo-badge"><i/>ADMIN WORKSPACE</span><button className="icon-button" onClick={()=>notify(`${pending.length} submissions need review`)}><Bell size={18}/></button><span className="admin-user-avatar small">FA</span></div></header><div className="admin-page-content"><div className="admin-page-title"><div><div className="eyebrow"><span className="eyebrow-line"/>UNITED PLANNERS · ADMIN</div><h1>{titles[page]}</h1><p>Review, organize, and manage your community events.</p></div>{['Events','Pending Approvals'].includes(page)&&<button className="button button-primary" onClick={()=>setShowForm(true)}><Plus size={16}/>Create event</button>}</div>
    {page==='Dashboard'&&<><div className="metrics-grid">{[['Total Events',events.length],['Upcoming Events',events.filter(e=>e.status==='UPCOMING').length],['Live Events',events.filter(e=>e.status==='LIVE').length],['Pending Approvals',pending.length],['Completed Events',events.filter(e=>e.status==='COMPLETED').length],['Registered Attendees',events.reduce((sum,e)=>sum+e.attendees,0).toLocaleString()]].map(([label,value])=><div className="metric-card" key={String(label)}><span className="metric-label">{label}</span><strong>{value}</strong><small>Across your workspace</small></div>)}</div><div className="admin-panel"><div className="panel-heading"><div><h3>Recent activity</h3><p>Latest event and notification actions.</p></div><button className="text-link" onClick={()=>setPage('Events')}>Manage events <ArrowRight size={14}/></button></div>{[['New event submitted','A Table for Everyone'],['Event approved','Sunday Makers Market'],['Event details updated','Afterglow: Rooftop Sessions'],['Reminder notification sent','City in Motion 5K']].map(row=><div className="activity-item" key={row[0]}><span className="activity-icon blue"><Check size={15}/></span><div><strong>{row[0]}</strong><span>{row[1]}</span></div><time>Today</time></div>)}</div><div className="admin-panel"><div className="panel-heading"><div><h3>Needs your eye</h3><p>{pending.length} submissions waiting</p></div><button className="text-link" onClick={()=>setPage('Pending Approvals')}>Review queue <ArrowRight size={14}/></button></div>{pending.slice(0,3).map(event=><button className="review-item" key={event.id} onClick={()=>setSelected(event)}><span className="review-thumb" style={{backgroundImage:`url(${event.image})`}}/><span className="review-details"><strong>{event.name}</strong><small>{event.organizer} · {dateLabel(event.date)}</small></span><ChevronRight size={16}/></button>)}</div></>}
    {(page==='Events'||page==='Pending Approvals')&&<div className="admin-panel events-panel"><div className="event-toolbar"><div className="admin-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search events, organizers, locations..."/></div><label className="filter-select"><ListFilter size={16}/><select value={status} onChange={e=>setStatus(e.target.value)}><option>All statuses</option>{['LIVE','STARTING SOON','UPCOMING','COMPLETED','CANCELLED','PENDING'].map(item=><option key={item}>{item}</option>)}</select></label><label className="filter-select"><Filter size={15}/><select value={type} onChange={e=>setType(e.target.value)}><option>All types</option>{[...new Set(events.map(event=>event.type))].map(item=><option key={item}>{item}</option>)}</select></label></div><div className="active-filters"><span className="table-muted">Showing {shown.length} of {events.length} events · filter by status, type, name, organizer, or location</span><button className="text-link" onClick={()=>{setQuery('');setStatus('All statuses');setType('All types');}}>Clear filters</button></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>EVENT</th><th>ORGANIZER</th><th>DATE & TIME</th><th>LOCATION</th><th>TYPE</th><th>STATUS</th><th>APPROVAL</th><th>ACTIONS</th></tr></thead><tbody>{shown.map(event=><tr key={event.id}><td><button className="table-event" onClick={()=>setSelected(event)}><span className="table-event-thumb" style={{backgroundImage:`url(${event.image})`}}/><span><strong>{event.name}</strong><small>{event.attendees} attendees</small></span></button></td><td>{event.organizer}</td><td><strong>{dateLabel(event.date,{month:'short',day:'numeric'})}</strong><small>{event.start} – {event.end}</small></td><td>{event.location}</td><td><span className="type-chip">{event.type}</span></td><td><StatusPill status={event.status}/></td><td><span className={`approval-chip ${event.approval.toLowerCase()}`}><i/>{event.approval}</span></td><td><div className="row-actions"><button className="icon-button" onClick={()=>setSelected(event)} aria-label="View"><Eye size={15}/></button>{event.approval==='Pending'?<><button className="icon-button" onClick={()=>approve(event)} aria-label="Approve"><Check size={15}/></button><button className="icon-button danger-icon" onClick={()=>reject(event)} aria-label="Reject"><X size={15}/></button></>:<button className="icon-button" onClick={()=>{update(event.id,{status:event.status==='CANCELLED'?'UPCOMING':'CANCELLED'});notify('Event status updated; reminder subscribers notified');}} aria-label="Cancel or restore"><Flag size={15}/></button>}<button className="icon-button" onClick={()=>{if(window.confirm('Archive this event?')){update(event.id,{approval:'Rejected',status:'CANCELLED'});notify('Event archived');}}} aria-label="Archive"><Trash2 size={15}/></button></div></td></tr>)}</tbody></table>{!shown.length&&<div className="table-empty"><Search size={20}/><strong>No matching events</strong><span>Change or clear your filters.</span></div>}</div></div>}
    {page==='Users'&&<>
      <div className="admin-panel">
        <div className="panel-heading"><div><h3>Registered accounts</h3><p>{activeUserCount} active now · {managedUsers.length} registered. Activity is based on sign-in heartbeats from the last minute.</p></div><button className="button button-outline" onClick={()=>{const rows=managedUsers.map(user=>({'Name':user.name,'Email':user.email,'Role':user.role,'User code':user.userCode,'Status':user.isBlocked?'Blocked':'Active','Currently online':user.active?'Yes':'No','Joined':new Date(user.createdAt).toLocaleDateString()}));if(!openAdminExportWindow('Registered users','registered-users',rows))notify('Allow pop-ups to open the export preview');}}><Download size={15}/>Export user list</button></div>
        {userDirectoryError&&<p className="auth-message auth-error">{userDirectoryError}</p>}
        <div className="user-directory-toolbar"><div className="admin-search"><Search size={16}/><input aria-label="Find a user" placeholder="Find by name, email, or user code..." value={userSearch} onChange={event=>setUserSearch(event.target.value)}/></div><span className="table-muted">Showing {matchingUsers.length} of {managedUsers.length}</span></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>USER</th><th>ROLE</th><th>USER CODE</th><th>ACCOUNT</th><th>ACTIVITY</th><th>ACTIONS</th></tr></thead><tbody>{matchingUsers.map(user=><tr key={user.id}><td><strong>{user.name}</strong><small>{user.email}</small></td><td>{user.role}</td><td><code>{user.userCode}</code></td><td><span className={`approval-chip ${user.isBlocked?'rejected':'approved'} ${user.isBlocked&&recentlyBlockedUserId===user.id?'account-blocked-feedback':''}`}><i/>{user.isBlocked?'Blocked':'Active'}</span></td><td>{user.active?'Online':'Offline'}</td><td><button className={`button ${user.isBlocked?'button-outline':'button-ghost'} account-block-button ${user.isBlocked?'is-blocked':''}`} disabled={user.role==='admin'||blockingUserIds.has(user.id)} onClick={()=>void toggleAccountBlock(user)}>{blockingUserIds.has(user.id)?'Updating…':user.isBlocked?'Unblock':'Block'}</button></td></tr>)}</tbody></table></div>
        {!matchingUsers.length&&!userDirectoryError&&<div className="announcement-admin-empty">{managedUsers.length?'No users match that search.':'Loading registered users…'}</div>}
      </div>
      <div className="admin-panel"><div className="panel-heading"><div><h3>Create a new admin</h3><p>Only an authenticated admin can create another admin account.</p></div></div><form className="notification-form" onSubmit={createAdminAccount}><label>Full name<input value={adminForm.name} onChange={event => setAdminForm(current => ({ ...current, name: event.target.value }))} placeholder="New admin name" required /></label><label>Email address<input type="email" value={adminForm.email} onChange={event => setAdminForm(current => ({ ...current, email: event.target.value }))} placeholder="admin@yourdomain.com" required /></label><label>Password<input type="password" value={adminForm.password} onChange={event => setAdminForm(current => ({ ...current, password: event.target.value }))} placeholder="Create a secure password" required /></label>{adminFormError && <p className="auth-message auth-error">{adminFormError}</p>}{adminFormSuccess && <p className="auth-message auth-success">{adminFormSuccess}</p>}<button className="button button-primary" type="submit"><ShieldCheck size={15}/>Create admin account</button></form></div>
    </>}
    {page==='Organizers'&&<div className="admin-panel"><div className="panel-heading"><div><h3>Organizer accounts</h3><p>Organizer access and submitted event history.</p></div><div className="panel-actions"><button className="button button-outline" onClick={()=>{const rows=organizerList.map(name=>{const organizerEvents=events.filter(event=>event.organizer===name);return {'Organizer':name,'Submitted events':String(organizerEvents.length),'Event names':organizerEvents.map(event=>event.name).join('; '),'Event dates':organizerEvents.map(event=>event.date).join('; ')};});if(!openAdminExportWindow('Organizer list','organizer-list',rows))notify('Allow pop-ups to open the export preview');}}><Download size={15}/>Export list</button><button className="button button-outline" onClick={()=>notify('Organizer invitation prepared')}><Plus size={15}/>Invite organizer</button></div></div>{organizerList.map(name=><div className="management-row" key={name}><div><strong>{name}</strong><span>{events.filter(event=>event.organizer===name).length} submitted events · manage only their own</span></div><span className="approval-chip approved"><i/>Approved</span><button className="button button-outline" onClick={()=>notify(`${name} organizer access updated`)}>Manage</button></div>)}</div>}
    {page==='Notifications'&&<>
      <div className="admin-panel">
        <div className="panel-heading"><div><h3>Publish an announcement</h3><p>This appears on the public website and syncs to open pages immediately.</p></div></div>
        <form className="notification-form" onSubmit={submitAnnouncement}>
          <label>Sender name<input name="sender" required pattern=".*\S.*" maxLength={80} defaultValue="Fai Atula" placeholder="Name of sender"/></label>
          <label>Sender title<input name="senderTitle" required pattern=".*\S.*" maxLength={80} defaultValue="Lead Developer" placeholder="e.g. Lead Developer"/></label>
          <label>Message type<select name="category" defaultValue="General update">{announcementCategories.map(category=><option key={category} value={category}>{category}</option>)}</select></label>
          <label>Title<input name="title" required maxLength={100} placeholder="Announcement title"/></label>
          <label>Message<textarea name="message" required rows={5} maxLength={4000} placeholder="Write the complete announcement..."/></label>
          <p className="announcement-admin-note">Announcements are visible to everyone who can access the website.</p>
          <button className="button button-primary" type="submit"><Megaphone size={15}/>Publish announcement</button>
        </form>
      </div>
      <div className="admin-panel announcement-admin-panel">
        <div className="panel-heading"><div><h3>Published messages</h3><p>{announcements.length} total · {announcementCategories.filter(category=>announcements.some(item=>(item.category||'General update')===category)).map(category=>`${category}: ${announcements.filter(item=>(item.category||'General update')===category).length}`).join(' · ') || 'No message types yet'}</p></div></div>
        {announcements.length ? <div className="announcement-admin-list">{announcements.map(announcement=><button className="announcement-admin-preview" key={announcement.id} onClick={()=>setOpenedAnnouncement(announcement)}><span><Megaphone size={14}/>{announcement.category||'General update'} · PUBLISHED BY {announcement.sender} · {announcement.senderTitle} · {new Date(announcement.createdAt).toLocaleDateString('en-KE')}</span><strong>{announcement.title}</strong><p>{announcement.message}</p><i>Open full announcement <ArrowUpRight size={13}/></i></button>)}</div> : <div className="announcement-admin-empty">No announcements published yet.</div>}
      </div>
      {openedAnnouncement&&<AnnouncementDetail announcement={openedAnnouncement} close={()=>setOpenedAnnouncement(null)}/ >}
    </>}
    {page==='Calendar'&&<div className="admin-panel"><div className="panel-heading"><div><h3>All platform events</h3><p>Approved, pending, live, completed, and cancelled events.</p></div></div><CalendarGrid key={`${calendarDate.getFullYear()}-${calendarDate.getMonth()}`} date={calendarDate} events={events} onOpen={setSelected} onEmpty={()=>notify('No event on this day')}/><button className="button button-outline" onClick={()=>setCalendarDate(new Date(calendarDate.getFullYear(),calendarDate.getMonth()+1,1))}>Next month <ArrowRight size={14}/></button></div>}
    {page==='Reports'&&<div className="reports-grid"><div className="admin-panel"><div className="panel-heading"><div><h3>Event outcomes</h3><p>Useful platform statistics.</p></div></div>{['Created','Approved','Rejected','Cancelled','Completed','Reminder subscriptions','Registrations'].map(label=><div className="breakdown-row" key={label}><span className="breakdown-dot"/><span>{label}</span><strong>{label==='Created'?events.length:label==='Approved'?events.filter(e=>e.approval==='Approved').length:label==='Rejected'?events.filter(e=>e.approval==='Rejected').length:label==='Cancelled'?events.filter(e=>e.status==='CANCELLED').length:label==='Completed'?events.filter(e=>e.status==='COMPLETED').length:label==='Registrations'?events.reduce((sum,e)=>sum+e.attendees,0):Object.keys(reminders).length}</strong></div>)}</div><div className="admin-panel"><div className="panel-heading"><div><h3>30-day export report</h3><p>Download a printable list of events happening in the next 30 days.</p></div></div><div className="report-actions"><button className="button button-primary" onClick={()=>{ const now = new Date(); const future = new Date(); future.setDate(now.getDate() + 30); const inRange = events.filter(event => { const eventDate = new Date(`${event.date}T12:00:00`); return eventDate >= now && eventDate <= future; }); exportEventReport(inRange, 'Events in next 30 days', 'csv'); }}>Export Excel (.csv)</button><button className="button button-outline" onClick={()=>{ const now = new Date(); const future = new Date(); future.setDate(now.getDate() + 30); const inRange = events.filter(event => { const eventDate = new Date(`${event.date}T12:00:00`); return eventDate >= now && eventDate <= future; }); exportEventReport(inRange, 'Events in next 30 days', 'doc'); }}>Export Word (.doc)</button><button className="button button-ghost" onClick={()=>exportEventReport(events, 'All events', 'csv')}>Export all events</button></div></div></div>}
    {page==='Website Settings'&&<div className="admin-panel settings-panel"><div className="panel-heading"><div><h3>Platform preferences</h3><p>Public submissions always require administrator approval.</p></div></div>{['Public event submissions','Require administrator approval','Automatic cancellation notices','Default reminder: one week before'].map(setting=><div className="settings-row" key={setting}><div><strong>{setting}</strong><span>Updates are reflected in this demo workspace.</span></div><button className="toggle-switch on" onClick={e=>e.currentTarget.classList.toggle('on')} aria-label={`Toggle ${setting}`}><i/></button></div>)}<div className="security-notice"><ShieldCheck size={18}/><div><strong>Demo access only</strong><span>This dashboard has no real authentication or server-side authorization.</span></div></div></div>}
    </div></main>{announcedEvent&&<EventAnnouncementToast key={announcedEvent.id} event={announcedEvent} stacked={Boolean(announcements[0])} onOpen={()=>{setSelected(announcedEvent);dismissAnnouncedEvent();}} onDismiss={dismissAnnouncedEvent}/ >}{selected&&<EventDetails event={selected} close={()=>setSelected(null)} onReminder={onReminder} savedReminders={reminders[selected.id]??[]}/ >}{showForm&&<PlanModal close={()=>setShowForm(false)} submit={create}/>}</div>;
}
