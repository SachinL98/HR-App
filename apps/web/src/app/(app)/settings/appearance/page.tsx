import { api, type Org } from "@/lib/api";
import { PageHeader } from "@/components/ui";
import { requireAny } from "@/lib/guard";
import { ThemeEditor } from "@/components/theme-editor";
import { saveTheme } from "../../../actions";

export const metadata = { title: "Appearance · HR App" };

export default async function Appearance() {
  await requireAny("branding.manage");
  const org = await api<Org>("/org");
  return (
    <>
      <PageHeader title="Appearance" sub="Choose the colours everyone in your company sees in the web and mobile apps." />
      <ThemeEditor action={saveTheme} initial={{ themePrimary: org.themePrimary, themeAccent: org.themeAccent, themeMode: org.themeMode, themeRadius: org.themeRadius }} />
    </>
  );
}
