import "./globals.css";
import { AuthGate } from "../components/AuthGate";
import { LanguageProvider } from "../components/LanguageProvider";

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "Vie AI — Twój osobisty agent",
  description: "Prywatny asystent AI, który zna Twoje dokumenty i pamięta rozmowy.",
  applicationName: "Vie AI",
  alternates: { canonical: "/" },
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "32x32" }, { url: "/icon.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "pl_PL",
    title: "Vie AI — Twój osobisty agent",
    description: "Agent AI z bazą wiedzy, pamięcią i automatyzacją.",
    siteName: "Vie AI",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Vie AI — Twój biznes. Twoja wiedza. Twój agent." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vie AI — Twój osobisty agent",
    description: "Agent AI z bazą wiedzy, pamięcią i automatyzacją.",
    images: ["/og-image.png"],
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07090d" },
    { media: "(prefers-color-scheme: light)", color: "#f5f7f1" },
  ],
};

const themeScript = `
  try {
    const saved = localStorage.getItem('vie-theme');
    const theme = saved === 'light' || saved === 'dark' ? saved : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = 'dark';
  }
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <LanguageProvider><AuthGate>{children}</AuthGate></LanguageProvider>
      </body>
    </html>
  );
}
