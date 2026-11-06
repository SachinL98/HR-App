import { api, type Org } from "@/lib/api";
import { PageHeader } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { ThemeEditor } from "@/components/theme-editor";
import { saveTheme } from "../../../actions";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Appearance · Seamless Source HR" };

export default async function Appearance() {
  await requireAny("branding.manage");
  const { t: tr } = await getI18n();
  const org = await api<Org>("/org");
  return (
    <>
      <PageHeader title={tr("set.look.title")} sub={tr("set.look.sub")} />
      <ThemeEditor action={saveTheme} initial={{ themePrimary: org.themePrimary, themeAccent: org.themeAccent, themeMode: org.themeMode, themeRadius: org.themeRadius }} />
    </>
  );
}
