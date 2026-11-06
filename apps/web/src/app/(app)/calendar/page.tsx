import Link from "next/link";
import { connection } from "next/server";
import { api, type CalendarData, type Department, type Me, type Meeting, type Org } from "@/lib/api";
import { dayIn, timeIn } from "@/lib/tz";
import { addDays, cellFor, eachDay, iso, isoWeekday, parse, rangeFor, shift, SHORT, today, TONE, type View } from "@/lib/cal";
import { ActionForm } from "@/components/action-form";
import { MeetingForm } from "@/components/meeting-form";
import { dayLabels, StatusLegend } from "@/components/status-legend";
import { Button, buttonClass, Card, Empty, Field, PageHeader, Split } from "@/components/ui";
import { CalendarLink } from "@/components/calendar-link";
import { cancelMeeting, createMeeting, markOutOfOffice, rsvpMeeting } from "../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Calendar · Seamless Source HR" };

const VIEWS: View[] = ["day", "week", "month", "year"];
const monthNames = (tag: string) => Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(tag, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 1))));
// 5 Jan 2026 is a Monday.
const weekdayNames = (tag: string) => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 5 + i))));

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
  const feed = await api<{ exists: boolean }>("/calendar-feed");
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
  const { t, tag } = await getI18n();
  const MONTHS = monthNames(tag);
  const DOW = weekdayNames(tag);
  const LABEL = dayLabels(t);
  const title = view === "day" ? date : view === "week" ? `${range.from} to ${range.to}` : view === "month" ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : String(d.getUTCFullYear());

  return (
    <>
      <PageHeader title={t("calendar.title")} sub={t("calendar.sub")}>
        <nav aria-label="Calendar view" className="flex rounded-ui border border-line bg-surface p-0.5 text-sm shadow-[var(--shadow)]">
          {VIEWS.map((v) => (
            <Link key={v} href={link({ view: v })} aria-current={v === view ? "page" : undefined}
              className={`min-h-8 rounded-[calc(var(--ui-radius)-2px)] px-3.5 py-1 font-medium leading-6 ${v === view ? "bg-primary text-primary-fg" : "text-muted hover:text-ink"}`}>{t(`calendar.${v}`)}</Link>
          ))}
        </nav>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={link({ date: shift(view, date, -1) })} className={buttonClass("ghost")} aria-label="Previous">←</Link>
        <Link href={link({ date: today() })} className={buttonClass("ghost")}>{t("calendar.today")}</Link>
        <Link href={link({ date: shift(view, date, 1) })} className={buttonClass("ghost")} aria-label="Next">→</Link>
        <h2 className="ml-2 text-lg font-semibold tracking-tight">{title}</h2>
        <form className="ml-auto flex gap-2" action="/calendar">
          <input type="hidden" name="view" value={view} /><input type="hidden" name="date" value={date} />
          {view === "year" ? (
            <select name="who" defaultValue={who} aria-label={t("calendar.person")} className="input w-auto min-w-44">
              {everyone.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
            </select>
          ) : (
            <select name="dept" defaultValue={sp.dept ?? ""} aria-label="Department" className="input w-auto min-w-44">
              <option value="">{t("calendar.allDepartments")}</option>
              {departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          <Button variant="ghost" type="submit">{t("calendar.apply")}</Button>
        </form>
      </div>
      <div className="mb-4"><StatusLegend t={t} /></div>

      <Split side="20rem">
        <div className="min-w-0">
          {view === "day" && (
            <Card title="Meetings" sub="Ones you are part of">
              {meetings.length === 0 && <Empty>No meetings on this day.</Empty>}
              <ul className="space-y-3">
                {meetings.map((m) => {
                  const mine = m.attendees.find((a) => a.memberId === me.id);
                  return (
                    <li key={m.id} className="rounded-ui border border-line bg-surface-2 p-4 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium">{m.title}</p>
                        <p className="text-muted">{timeIn(m.startsAt, tz)}–{timeIn(m.endsAt, tz)} ({tz})</p>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Organized by {m.organizer.firstName} {m.organizer.lastName} · {m.attendees.length} invited
                        {m.location ? ` · ${m.location}` : ""}
                      </p>
                      {m.meetUrl && <a href={m.meetUrl} target="_blank" rel="noopener noreferrer" className="link mt-1 inline-block">Join video call</a>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {mine && m.organizerId !== me.id && (
                          <form action={rsvpMeeting} className="flex items-center gap-1">
                            <input type="hidden" name="id" value={m.id} />
                            {(["YES", "MAYBE", "NO"] as const).map((r) => (
                              <button key={r} name="rsvp" value={r} aria-pressed={mine.rsvp === r}
                                className={`min-h-8 rounded-ui border px-3 text-xs font-medium ${mine.rsvp === r ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface hover:bg-surface-2"}`}>
                                {r === "YES" ? "Going" : r === "MAYBE" ? "Maybe" : "Can't go"}
                              </button>
                            ))}
                          </form>
                        )}
                        {(m.organizerId === me.id || me.permissions.includes("meeting.manage_all")) && (
                          <form action={cancelMeeting}><input type="hidden" name="id" value={m.id} />
                            <Button variant="danger" size="sm" type="submit">Cancel meeting</Button></form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {view === "day" && (
            <Card className="mt-6" title="Who is available" flush>
              <ul className="rows">
                {data.members.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <span className="font-medium">{m.firstName} {m.lastName}</span>
                    <span className="flex gap-2">
                      {cellFor(data, m.id, date).map((c, i) => (
                        <span key={i} className={`rounded-full px-2.5 py-1 text-xs font-medium ${TONE[c.type]}`}>{LABEL[c.type]}{c.part !== "FULL" ? ` (${c.part === "AM" ? "morning" : "afternoon"})` : ""}{c.detail ? ` · ${c.detail}` : ""}</span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(view === "week" || view === "month") && (
            <Card flush className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-40 bg-surface-2 p-3 text-left font-semibold text-muted">Person</th>
                    {eachDay(range.from, range.to).map((day) => (
                      <th key={day} className={`min-w-9 bg-surface-2 p-1.5 text-center font-semibold ${day === today() ? "text-primary" : "text-muted"}`}>
                        {view === "week" ? <>{DOW[isoWeekday(parse(day)) - 1]}<br /></> : null}{Number(day.slice(8))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((m) => (
                    <tr key={m.id} className="border-t border-line">
                      <th scope="row" className="sticky left-0 bg-surface p-3 text-left text-[13px] font-medium">{m.firstName} {m.lastName}</th>
                      {eachDay(range.from, range.to).map((day) => {
                        const cells = cellFor(data, m.id, day);
                        return (
                          <td key={day} className="p-0.5 text-center">
                            {cells.map((c, i) => (
                              <span key={i} title={`${LABEL[c.type]}${c.detail ? ` · ${c.detail}` : ""}`}
                                className={`block rounded px-0.5 py-1.5 font-medium ${TONE[c.type]}`}>{view === "week" ? SHORT[c.type] : c.part !== "FULL" ? "½" : SHORT[c.type].slice(0, 1)}</span>
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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {MONTHS.map((name, mi) => {
                const first = new Date(Date.UTC(d.getUTCFullYear(), mi, 1));
                const days = new Date(Date.UTC(d.getUTCFullYear(), mi + 1, 0)).getUTCDate();
                const lead = isoWeekday(first) - 1;
                return (
                  <Card key={name} className="p-4">
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
          <Card title="Schedule a meeting">
            <MeetingForm action={createMeeting} date={date}
              members={data.members.filter((m) => m.id !== me.id).map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}` }))}
              departments={departments.map((x) => ({ id: x.id, name: x.name }))} />
          </Card>
        )}
        <Card title="Show in Google or Outlook"><CalendarLink exists={feed.exists} /></Card>
        <Card title={t("calendar.oooTitle")} sub={t("calendar.oooSub")}>
          <ActionForm action={markOutOfOffice} submit={t("calendar.oooButton")} block>
            <Field label="Date" name="date" type="date" defaultValue={today()} required />
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" name="from" type="time" defaultValue="14:00" required />
              <Field label="To" name="to" type="time" defaultValue="15:00" required />
            </div>
          </ActionForm>
        </Card>
        </div>
      </Split>
    </>
  );
}
