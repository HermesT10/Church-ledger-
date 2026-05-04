import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import {
  THEME_COOKIE_NAME,
  htmlClassForThemeCookie,
  parseThemeCookie,
} from "@/lib/theme-cookie";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ChurchLedger",
  description: "Church accounting and financial management",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const themePreference = parseThemeCookie(
    cookieStore.get(THEME_COOKIE_NAME)?.value
  );

  const htmlThemeClass = htmlClassForThemeCookie(themePreference);

  return (
    <html lang="en" suppressHydrationWarning className={htmlThemeClass}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider initialTheme={themePreference}>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
