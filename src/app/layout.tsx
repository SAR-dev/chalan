import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { headers } from "next/headers"
import NextTopLoader from "nextjs-toploader"
import { DevModeBanner } from "@/components/dev-mode-banner"
import { ServiceWorkerRegister } from "@/components/service-worker-register"
import { SkipToContent } from "@/components/skip-to-content"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { siteConfig } from "@/config/site"
import "./globals.css"
import { ReactNode } from "react"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: siteConfig.name,
    template: `%s – ${siteConfig.name}`,
  },
  description: siteConfig.description,
  generator: new URL(siteConfig.siteUrl).hostname,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: siteConfig.name,
  },
  formatDetection: {
    telephone: false,
  },
  authors: [{ name: siteConfig.author }],
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.siteUrl,
    images: [siteConfig.ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
  },
  alternates: {
    canonical: siteConfig.siteUrl,
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  // x-nonce is set by the edge proxy (src/proxy.ts) for every page request so
  // Next can nonce its inline scripts AND we can forward it to next-themes,
  // which injects its own inline <script> for theme flash prevention.
  const headerList = await headers()
  const nonce = headerList.get("x-nonce") ?? undefined

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-background font-sans antialiased">
        <DevModeBanner />
        <SkipToContent />
        {/* No nonce here on purpose: nextjs-toploader renders <style nonce> without
            suppressHydrationWarning, and React doesn't expose the nonce to the
            client render (nonce="" vs server value → hydration mismatch). Styles are
            allowed by `style-src 'unsafe-inline'`, so they don't need one. */}
        <NextTopLoader />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
          <Toaster />
        </ThemeProvider>
        {process.env.NEXT_PUBLIC_ENV === "production" && <Analytics />}
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
