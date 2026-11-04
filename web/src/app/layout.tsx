import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import Controls from "@/components/Controls";
import { DICTS } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { getLocale, getT } from "@/i18n/server";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    openGraph: { title: t("meta.title"), description: t("meta.description"), type: "website" },
    twitter: { card: "summary_large_image", title: t("meta.title"), description: t("meta.description") },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    // suppressHydrationWarning: next-themes fija data-theme antes de hidratar
    <html lang={locale} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
          <I18nProvider locale={locale} dict={DICTS[locale]}>
            <Controls />
            {children}
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
