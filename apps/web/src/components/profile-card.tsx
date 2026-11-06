"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removePhoto, saveProfile, uploadPhoto } from "@/app/actions";
import { ActionForm } from "./action-form";
import { Avatar, Button, Field } from "./ui";
import { useI18n } from "./i18n";
import type { Profile } from "@/lib/api";

const SIZE = 256;

/** Centre-crop to a square and shrink in the browser, so uploads stay small whatever the original photo. */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("unreadable"))), "image/jpeg", 0.85));
}

export function ProfileCard({ me, p }: { me: { id: string; photoFileId?: string | null }; p: Profile }) {
  const { t } = useI18n();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const name = `${p.firstName} ${p.lastName}`;

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setMsg({ t: t("profile.chooseImage"), bad: true });
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("photo", await toSquareJpeg(f), "photo.jpg");
        const r = await uploadPhoto(fd);
        setMsg(r.ok ? { t: r.ok } : { t: r.error ?? "", bad: true });
        router.refresh();
      } catch {
        setMsg({ t: t("profile.unreadable"), bad: true });
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex items-center gap-4 lg:flex-col lg:items-start">
        <button type="button" onClick={() => input.current?.click()} disabled={pending} aria-label={t("profile.changePhoto")} className="group relative rounded-full">
          <Avatar name={name} size={96} member={me} />
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">{t("profile.change")}</span>
        </button>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => input.current?.click()}>{p.hasPhoto ? t("profile.changePhoto") : t("profile.uploadPhoto")}</Button>
            {p.hasPhoto && (
              <Button type="button" variant="ghost" size="sm" disabled={pending}
                onClick={() => start(async () => { const r = await removePhoto(); setMsg(r.ok ? { t: r.ok } : { t: r.error ?? "", bad: true }); router.refresh(); })}>{t("profile.removePhoto")}</Button>
            )}
          </div>
          <p className="max-w-56 text-xs text-muted">{t("profile.photoHint")}</p>
          {msg && <p role="status" className={`text-xs ${msg.bad ? "text-red-600" : "text-emerald-600"}`}>{msg.t}</p>}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      <div className="space-y-5">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">{t("profile.name")}</dt><dd className="font-medium">{name}</dd></div>
          <div><dt className="text-xs text-muted">{t("profile.email")}</dt><dd className="font-medium">{p.email}</dd></div>
          <div><dt className="text-xs text-muted">{t("people.jobRole")}</dt><dd className="font-medium">{p.jobRole ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted">{t("people.department")}</dt><dd className="font-medium">{p.department ?? "—"}</dd></div>
        </dl>
        <ActionForm action={saveProfile} submit={t("profile.save")} className="grid gap-4 sm:grid-cols-2">
          <Field label={t("profile.preferredName")} name="preferredName" defaultValue={p.preferredName} maxLength={80} />
          <Field label={t("profile.phone")} name="phone" defaultValue={p.phone} maxLength={40} autoComplete="tel" />
        </ActionForm>
        <p className="text-xs text-muted">{t("profile.managedNote")}</p>
      </div>
    </div>
  );
}
