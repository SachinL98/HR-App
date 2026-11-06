import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { LanguageSwitch } from "@/components/language-switch";
import { getI18n } from "@/lib/i18n/server";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = await getI18n();
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-fg lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-[28rem] w-[28rem] rounded-full bg-white/10" />
        <Logo light size={44} className="relative" />
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">{t("auth.heroTitle")}</h2>
          <p className="mt-4 text-base opacity-85">{t("auth.heroText")}</p>
        </div>
        <p className="relative text-sm opacity-70">{t("auth.heroFoot")}</p>
      </aside>
      <main className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-10 sm:px-8">
        <div className="absolute right-4 top-4"><LanguageSwitch /></div>
        <div className="w-full max-w-[26rem]">
          <Logo size={40} className="mb-8 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
