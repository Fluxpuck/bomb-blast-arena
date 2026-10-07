// =========================
// Discord link previews
// =========================
// Copy, metadata constants, and the component-embed payload served to
// Discord's crawler when a link to the game is unfurled in chat. The app is
// self-hostable under arbitrary hosts (direct URL, tunnels, Discord's
// *.discordsays.com activity proxy), so every absolute URL is built from
// the request's own origin — no domain is baked in.
//
// Docs: https://docs.discord.com/developers/link-previews/overview
//       https://docs.discord.com/developers/link-previews/component-embeds

export const SITE_NAME = "Bomb Blast Arena";
export const SITE_TITLE = "Bomb Blast Arena";
export const SITE_DESCRIPTION =
  "A lo-fi love letter to the classic grid-bomber. Drop bombs, blast barrels, grab power-ups, and be the last bot standing — solo vs AI, or online with friends.";

// The brand yellow doubles as the standard preview's theme-color and the
// component embed's accent_color (which needs the same value as an int).
export const THEME_COLOR = "#ffce3d";
const ACCENT_COLOR = 0xffce3d;

export const REPO_URL = "https://github.com/Fluxpuck/bomb-blast-arena";

// The asset kit's dedicated social banner (src/app/assets "02 · SOCIAL BANNER").
export const SOCIAL_IMAGE = {
  path: "/marketing/bomb-blast-arena-banner-1280x640.png",
  width: 1280,
  height: 640,
  alt: "Bomb Blast Arena",
};
const TITLE_IMAGE = "/marketing/bomb-blast-arena-title-1920x1080.png";
const ICON_IMAGE = "/marketing/bomb-blast-arena-icon-180.png";

// Route serving the component-embed JSON (src/app/component-embed.json).
export const COMPONENT_EMBED_PATH = "/component-embed.json";

/**
 * The public origin links and payloads are built on. A configured
 * `SITE_URL` wins: it pins HTTPS in deployments whose proxy doesn't
 * forward a proto, and keeps spoofed Host/X-Forwarded-* headers out of
 * the emitted URLs. Otherwise the origin is derived per request.
 */
export function siteOrigin(requestHeaders: {
  get(name: string): string | null;
}): string {
  const configured = process.env.SITE_URL?.trim();
  if (configured) return new URL(configured).origin;
  return requestOrigin(requestHeaders);
}

/**
 * The public origin the current request was served on. The host comes
 * from the forwarded headers tunnels and proxies set (falling back to
 * the plain Host header); the protocol is `http` on loopback and
 * `https` anywhere else — see the proto note below.
 */
export function requestOrigin(requestHeaders: {
  get(name: string): string | null;
}): string {
  // Forwarded headers may carry a comma-separated chain; the first entry is
  // the client-facing value.
  const host = (
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000"
  )
    .split(",")[0]
    .trim();
  const forwardedProto = (requestHeaders.get("x-forwarded-proto") ?? "")
    .split(",")[0]
    .trim();
  const isLoopback =
    host.startsWith("localhost") ||
    host.startsWith("127.") ||
    host.startsWith("[::1]");
  // Next.js synthesizes a missing x-forwarded-proto from its own backend
  // connection, so "http" here is ambiguous: it may be the synthesized
  // value behind a TLS-terminating proxy that didn't forward the proto.
  // Only an explicit "https" is trusted; public hosts default to https —
  // the only scheme Discord's crawler can reach in a normal deployment.
  const proto = forwardedProto === "https" || !isLoopback ? "https" : "http";
  return `${proto}://${host}`;
}

/**
 * The component-embed payload Discord renders in place of the standard
 * preview: a single top-level Container (type 17), which is the only
 * allowed top-level component. Every button is link-style (5) — the only
 * button style component embeds accept — and all media URLs are absolute
 * on the request's own host, as the docs require.
 */
export function componentEmbedPayload(origin: string) {
  return {
    component: {
      type: 17,
      accent_color: ACCENT_COLOR,
      components: [
        {
          type: 9,
          components: [
            {
              type: 10,
              content: `# [${SITE_NAME}](${origin})\n${SITE_DESCRIPTION}`,
            },
          ],
          accessory: {
            type: 11,
            media: { url: `${origin}${ICON_IMAGE}` },
            description: `${SITE_NAME} icon`,
          },
        },
        {
          type: 12,
          items: [
            {
              media: { url: `${origin}${SOCIAL_IMAGE.path}` },
              description: SOCIAL_IMAGE.alt,
            },
            {
              media: { url: `${origin}${TITLE_IMAGE}` },
              description: "Title screen",
            },
          ],
        },
        {
          type: 10,
          content:
            "- Solo vs up to 3 AI opponents\n- Online multiplayer — 4-letter room codes, spectators, Discord invites\n- Destructible barrels, chain reactions, power-ups",
        },
        { type: 14, spacing: 1 },
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              url: origin,
              label: `Play ${SITE_NAME}`,
            },
            { type: 2, style: 5, url: REPO_URL, label: "GitHub" },
          ],
        },
      ],
    },
  };
}
