import type { Metadata } from "next";
import { Geist, Noto_Sans_Sinhala, Noto_Sans_Tamil } from "next/font/google";
import { Suspense } from "react";
import { I18nRoot } from "@/components/i18n-root";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
// Geist has no Sinhala or Tamil letters, so these two take over for those languages.
const sinhala = Noto_Sans_Sinhala({ variable: "--font-sinhala", subsets: ["sinhala"], display: "swap" });
const tamil = Noto_Sans_Tamil({ variable: "--font-tamil", subsets: ["tamil"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Seamless Source HR", template: "%s" },
  description: "People, leave, payroll and documents for your company, made simple.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${sinhala.variable} ${tamil.variable} h-full antialiased`}>
      <body className="min-h-full"><Suspense fallback={null}><I18nRoot>{children}</I18nRoot></Suspense></body>
    </html>
  );
}
