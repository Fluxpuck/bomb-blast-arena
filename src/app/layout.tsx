import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
// Vendored woff2 files (Google Fonts, latin subset) — next/font/google fetches
// fonts at build time, which fails in the Docker build's restricted network.
import localFont from "next/font/local";
import {
  COMPONENT_EMBED_PATH,
  requestOrigin,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SOCIAL_IMAGE,
  THEME_COLOR,
} from "../discord/linkPreview";
import "./globals.css";

const bungee = localFont({
  src: "./fonts/bungee.woff2",
  weight: "400",
  variable: "--font-bungee",
});
const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk.woff2",
  weight: "300 700",
  variable: "--font-space",
});
const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono.woff2",
  weight: "100 800",
  variable: "--font-mono",
});

// Discord link preview metadata (og:/twitter:/theme-color). The app is
// self-hostable under any host, so metadataBase — and therefore absolute
// og:image URLs — is resolved per request instead of baked in. Reading
// headers() here opts every page into dynamic rendering.
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(requestOrigin(await headers())),
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    openGraph: {
      siteName: SITE_NAME,
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      type: "website",
      images: [
        {
          url: SOCIAL_IMAGE.path,
          width: SOCIAL_IMAGE.width,
          height: SOCIAL_IMAGE.height,
          alt: SOCIAL_IMAGE.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [SOCIAL_IMAGE.path],
    },
  };
}

// Discord reads theme-color as the preview's accent color.
export const viewport: Viewport = {
  themeColor: THEME_COLOR,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The component-embed tag must be in the server-rendered <head>, which
  // the metadata API can't emit — React hoists <link> elements rendered
  // anywhere into <head>, so it lives here in the layout. Its linked JSON
  // must be absolute on the page's own host, hence the request origin.
  const componentEmbedUrl = `${requestOrigin(await headers())}${COMPONENT_EMBED_PATH}`;
  return (
    <html lang="en">
      <body
        className={`${bungee.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} overflow-hidden font-sans text-ui-text`}
      >
        <link
          rel="discord:component-embed"
          type="application/json"
          href={componentEmbedUrl}
        />
        {children}
      </body>
    </html>
  );
}
