import Link from "next/link";
import { connection } from "next/server";
import { api, type CalendarData, type Department, type Me, type Meeting, type Org } from "@/lib/api";
import { dayIn, timeIn } from "@/lib/tz";
import { addDays, cellFor, eachDay, iso, isoWeekday, LABEL, parse, rangeFor, shift, SHORT, today, TONE, type View } from "@/lib/cal";
import { ActionForm } from "@/components/action-form";
import { MeetingForm } from "@/components/meeting-form";
import { StatusLegend } from "@/components/status-legend";
import { Card, Field, PageHeader } from "@/components/ui";
import { cancelMeeting, createMeeting, markOutOfOffice, rsvpMeeting } from "../../actions";

export const metadata = { title: "Calendar · HR App" };

const VIEWS: View[] = ["day", "week", "month", "year"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; dept?: string; who?: string }> }) {
  await connection(); // the page depends on the current date, so render per request
  const sp = await searchParams;
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : "month";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today();
  const range = rangeFor(view, date);
  const me = await api<Me>("/me");
  const departments = await api<Department[]>("/departments");
  const who = view === "year" ? (sp.who || me.id) : undefined; // a year of everyone would be unreadable, so show one person
  const qs = new URLSearchParams({ from: range.from, to: range.to });
  if (sp.dept) qs.set("departmentId", sp.dept);
  if (who) qs.set("memberId", who);
  const data = await api<CalendarData>(`/calendar?${qs}`);
  const everyone = view === "year" ? (await api<CalendarData>(`/calendar?from=${range.from}&to=${range.from}`)).members : data.members;

  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ view, date, ...(sp.dept ? { dept: sp.dept } : {}), ...(sp.who ? { who: sp.who } : {}) });
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) p.delete(k);
      else p.set(k, v);
    }
    return `/calendar?${p}`;
  };
  let meetings: Meeting[] = [];
  let tz = "UTC";
  if (view === "day") {
    const org = await api<Org>("/org");
    tz = org.timeZone;
    const t = parse(date).getTime();
    const found = await api<Meeting[]>(`/meetings?from=${new Date(t - 14 * 3600_000).toISOString()}&to=${new Date(t + 38 * 3600_000).toISOString()}`);
    meetings = found.filter((m) => dayIn(m.startsAt, tz) === date);
  }
  const d = parse(date);
  const title = view === "day" ? date : view === "week" ? `${range.from} to ${range.to}` : view === "month" ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : String(d.getUTCFullYear());

  return (
    <>
      <PageHeader title="Availability" sub="See who is in the office, working from home, on leave or out.">
        <nav aria-label="Calendar view" className="flex overflow-hidden rounded-ui border border-line text-sm">
          {VIEWS.map((v) => (
            <Link key={v} href={link({ view: v })} aria-current={v === view ? "page" : undefined}
              className={`px-3 py-1.5 capitalize ${v === view ? "bg-primary text-primary-fg" : "bg-surface hover:bg-bg"}`}>{v}</Link>
          ))}
        </nav>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={link({ date: shift(view, date, -1) })} className="rounded-ui border border-line bg-surface px-3 py-1.5 text-sm" aria-label="Previous">←</Link>
        <Link href={link({ date: today() })} className="rounded-ui border border-line bg-surface px-3 py-1.5 text-sm">Today</Link>
        <Link href={link({ date: shift(view, date, 1) })} className="rounded-ui border border-line bg-surface px-3 py-1.5 text-sm" aria-label="Next">→</Link>
        <h2 className="text-lg font-semibold">{title}</h2>
        <form className="ml-auto flex gap-2 text-sm" action="/calendar">
          <input type="hidden" name="view" value={view} /><input type="hidden" name="date" value={date} />
          {view === "year" ? (
            <select name="who" defaultValue={who} aria-label="Person" className="rounded-ui border border-line bg-surface px-2 py-1.5">
              {everyone.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
            </select>
          ) : (
            <select name="dept" defaultValue={sp.dept ?? ""} aria-label="Department" className="rounded-ui border border-line bg-surface px-2 py-1.5">
              <option value="">All departments</option>
              {departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          <button className="rounded-ui border border-line bg-surface px-3 py-1.5" type="submit">Filter</button>
        </form>
      </div>
      <div className="mb-4"><StatusLegend /></div>

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          {view === "day" && (
            <Card>
              <h2 className="mb-3 font-semibold">Meetings</h2>
              {meetings.length === 0 && <p className="text-sm text-muted">No meetings you are part of on this day.</p>}
              <ul className="space-y-3">
                {meetings.map((m) => {
                  const mine = m.attendees.find((a) => a.memberId === me.id);
                  return (
                    <li key={m.id} className="rounded-ui border border-line p-3 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium">{m.title}</p>
                        <p className="text-muted">{timeIn(m.startsAt, tz)}–{timeIn(m.endsAt, tz)} ({tz})</p>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Organized by {m.organizer.firstName} {m.organizer.lastName} · {m.attendees.length} invited
                        {m.location ? ` · ${m.location}` : ""}
                      </p>
                      {m.meetUrl && <a href={m.meetUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-primary underline">Join video call</a>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {mine && m.organizerId !== me.id && (
                          <form action={rsvpMeeting} className="flex items-center gap-1">
                            <input type="hidden" name="id" value={m.id} />
                            {(["YES", "MAYBE", "NO"] as const).map((r) => (
                              <button key={r} name="rsvp" value={r} aria-pressed={mine.rsvp === r}
                                className={`rounded-ui border px-2.5 py-1 text-xs ${mine.rsvp === r ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface"}`}>
                                {r === "YES" ? "Going" : r === "MAYBE" ? "Maybe" : "Can't go"}
                              </button>
                            ))}
                          </form>
                        )}
                        {(m.organizerId === me.id || me.permissions.includes("meeting.manage_all")) && (
                          <form action={cancelMeeting}><input type="hidden" name="id" value={m.id} />
                            <button className="rounded-ui border border-line px-2.5 py-1 text-xs text-red-600">Cancel meeting</button></form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {view === "day" && (
            <Card className="mt-6 p-0">
              <h2 className="p-3 pb-0 font-semibold">Who is available</h2>
              <ul>
                {data.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 border-b border-line p-3 last:border-0">
                    <span className="font-medium">{m.firstName} {m.lastName}</span>
                    <span className="flex gap-2">
                      {cellFor(data, m.id, date).map((c, i) => (
                        <span key={i} className={`rounded-full px-2.5 py-1 text-xs font-medium ${TONE[c.type]}`}>{c.label}{c.part !== "FULL" ? ` (${c.part === "AM" ? "morning" : "afternoon"})` : ""}{c.detail ? ` · ${c.detail}` : ""}</span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(view === "week" || view === "month") && (
            <Card className="overflow-x-auto p-0">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-36 bg-surface p-2 text-left font-medium">Person</th>
                    {eachDay(range.from, range.to).map((day) => (
                      <th key={day} className={`min-w-10 p-1 text-center font-medium ${day === today() ? "text-primary" : "text-muted"}`}>
                        {view === "week" ? <>{DOW[isoWeekday(parse(day)) - 1]}<br /></> : null}{Number(day.slice(8))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((m) => (
                    <tr key={m.id} className="border-t border-line">
                      <th scope="row" className="sticky left-0 bg-surface p-2 text-left font-medium">{m.firstName} {m.lastName}</th>
                      {eachDay(range.from, range.to).map((day) => {
                        const cells = cellFor(data, m.id, day);
                        return (
                          <td key={day} className="p-0.5 text-center">
                            {cells.map((c, i) => (
                              <span key={i} title={`${LABEL[c.type]}${c.detail ? ` · ${c.detail}` : ""}`}
                                className={`block rounded px-0.5 py-1 ${TONE[c.type]}`}>{view === "week" ? SHORT[c.type] : c.part !== "FULL" ? "½" : SHORT[c.type].slice(0, 1)}</span>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {view === "year" && (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {MONTHS.map((name, mi) => {
                const first = new Date(Date.UTC(d.getUTCFullYear(), mi, 1));
                const days = new Date(Date.UTC(d.getUTCFullYear(), mi + 1, 0)).getUTCDate();
                const lead = isoWeekday(first) - 1;
                return (
                  <Card key={name} className="p-3">
                    <h3 className="mb-2 text-sm font-semibold">{name}</h3>
                    <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
                      {DOW.map((x) => <span key={x} className="text-muted">{x[0]}</span>)}
                      {Array.from({ length: lead }).map((_, i) => <span key={`b${i}`} />)}
                      {Array.from({ length: days }).map((_, i) => {
                        const day = iso(addDays(first, i));
                        const c = cellFor(data, who!, day)[0];
                        return <span key={day} title={`${day} · ${LABEL[c.type]}${c.detail ? ` · ${c.detail}` : ""}`} className={`rounded py-1 ${TONE[c.type]}`}>{i + 1}</span>;
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
        {view === "day" && (
          <Card>
            <h2 className="mb-3 font-semibold">Schedule a meeting</h2>
            <MeetingForm action={createMeeting} date={date}
              members={data.members.filter((m) => m.id !== me.id).map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}` }))}
              departments={departments.map((x) => ({ id: x.id, name: x.name }))} />
          </Card>
        )}
        <Card>
          <h2 className="mb-3 font-semibold">Out of office</h2>
          <p className="mb-3 text-sm text-muted">Going out during work hours? Let people know. No approval needed.</p>
          <ActionForm action={markOutOfOffice} submit="Mark out of office">
            <Field label="Date" name="date" type="date" defaultValue={today()} required />
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" name="from" type="time" defaultValue="14:00" required />
              <Field label="To" name="to" type="time" defaultValue="15:00" required />
            </div>
          </ActionForm>
        </Card>
        </div>
      </div>
    </>
  );
}
