import { NextRequest, NextResponse } from "next/server";

// =========================
// Discord OAuth token exchange
// =========================
// Exchanges the authorization code returned by the Embedded App SDK's
// authorize() command for an access token. The client secret stays
// server-side — it must never reach the browser bundle.

export async function POST(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      "[api/token] Discord not configured:",
      !clientId ? "NEXT_PUBLIC_DISCORD_CLIENT_ID missing" : "",
      !clientSecret ? "DISCORD_CLIENT_SECRET missing" : ""
    );
    return NextResponse.json(
      { error: "Discord is not configured" },
      { status: 500 }
    );
  }

  let code: string | undefined;
  try {
    ({ code } = await request.json());
  } catch {
    console.warn("[api/token] rejected: body is not JSON");
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!code) {
    console.warn("[api/token] rejected: missing code");
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!response.ok) {
    // Discord's OAuth error body ({ error, error_description }) carries no
    // secrets and names the real cause (invalid_client, invalid_grant…).
    const detail = await response.text().catch(() => "");
    console.error(
      `[api/token] Discord token exchange failed (${response.status}):`,
      detail
    );
    return NextResponse.json(
      { error: "Token exchange failed", status: response.status },
      { status: 502 }
    );
  }

  const { access_token, scope } = await response.json();
  console.info("[api/token] token issued, scopes:", scope);
  return NextResponse.json({ access_token });
}
