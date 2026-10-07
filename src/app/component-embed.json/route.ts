import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { componentEmbedPayload, requestOrigin } from "../../discord/linkPreview";

// =========================
// Discord component-embed JSON
// =========================
// Payload for the <link rel="discord:component-embed"> tag the root layout
// emits. The linked JSON must live on the page's own host, so it is served
// per-request with media and button URLs absolute on the request origin.
// Dynamic by nature: headers() opts the route into per-request rendering.
export async function GET() {
  return NextResponse.json(componentEmbedPayload(requestOrigin(await headers())));
}
