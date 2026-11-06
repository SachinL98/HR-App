import { api, type BillingOverview } from "@/lib/api";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import type { Key } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { requireAny } from "@/lib/guard";

export const metadata = { title: "Plan and billing · Seamless Source HR" };

const NAMES: Record<string, Key> = { FREE: "plan.FREE", BRONZE: "plan.BRONZE", SILVER: "plan.SILVER", GOLD: "plan.GOLD", PLATINUM: "plan.PLATINUM" };
const TONES: Record<string, "good" | "warn" | "bad" | "info" | "neutral"> = { trial: "info", trial_grace: "warn", trial_ended: "bad", active: "good", past_due: "warn", canceled: "bad" };

export default async function Billing() {
  await requireAny("billing.manage");
  const { t: tr, tag } = await getI18n();
  const d = (v: string | null) => (v ? new Date(v).toLocaleDateString(tag, { dateStyle: "long" }) : "—");
  // The email sits in the middle of the sentence, so split the translation around it.
  const [before, after] = tr("set.bill.contact", { email: "\u0000" }).split("\u0000");
  const NAME = (k: string) => tr(NAMES[k] ?? "plan.FREE");
  const b = await api<BillingOverview>("/billing");
  const label = tr(`set.bill.state.${b.plan.state}` as Key);
  const tone = TONES[b.plan.state] ?? "neutral";
  const contact = process.env.BILLING_CONTACT_EMAIL;
  return (
    <>
      <PageHeader title={tr("set.bill.title")} sub={tr("set.bill.sub")}>
        <Badge tone={tone}>{label}</Badge>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={tr("set.bill.now")} value={NAME(b.plan.tier)} note={b.plan.chosen !== b.plan.tier ? tr("set.bill.chose", { plan: NAME(b.plan.chosen) }) : undefined} />
        <Stat label={tr("set.bill.people")} value={tr("set.bill.peopleOf", { used: b.plan.seatsUsed, limit: b.plan.seatLimit })} note={b.plan.invitesPending ? tr("set.bill.invites", { n: b.plan.invitesPending }) : undefined} tone={b.plan.overLimit ? "warn" : undefined} />
        <Stat label={b.subscription.status === "TRIALING" ? tr("set.bill.trialEnds") : tr("set.bill.periodEnds")} value={<span className="text-xl">{d(b.subscription.status === "TRIALING" ? b.subscription.trialEndsAt : b.subscription.currentPeriodEnd)}</span>} />
        <Stat label={tr("set.bill.billed")} value={<span className="text-xl">{b.subscription.status === "TRIALING" ? tr("set.bill.notYet") : tr(b.subscription.interval === "year" ? "set.bill.perYear" : "set.bill.perMonth")}</span>} />
      </div>

      <Card title={tr("set.bill.includes")} sub={tr("set.bill.includesSub")} className="mb-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {b.features.map((f) => (
            <section key={f.tier} className={`rounded-ui border p-4 ${f.tier === b.plan.tier ? "border-primary bg-primary/5" : "border-line bg-surface-2"}`}>
              <h3 className="flex items-center justify-between text-sm font-semibold">{NAME(f.tier)} {f.tier === b.plan.tier && <Badge tone="info">{tr("set.bill.yours")}</Badge>}</h3>
              <p className="mt-1 text-xs text-muted">{f.seats ? tr("set.bill.upTo", { n: f.seats }) : tr("set.bill.unlimited")}</p>
              <ul className="mt-3 space-y-1.5 text-sm">{f.items.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className="text-primary">✓</span>{i}</li>)}</ul>
            </section>
          ))}
        </div>
      </Card>

      <Card title={tr("set.bill.change")}>
        <p className="text-sm text-muted">
          {contact
            ? <>{before}<a className="link" href={`mailto:${contact}`}>{contact}</a>{after}</>
            : tr("set.bill.contactGeneric")}
        </p>
      </Card>
    </>
  );
}
