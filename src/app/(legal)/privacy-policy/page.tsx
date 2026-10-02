import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Bomb Blast Arena",
};

const h2 = "font-display text-ui-yellow text-lg mt-10 mb-3 tracking-wide";
const p = "text-ui-muted leading-relaxed mb-4";

export default function PrivacyPolicy() {
  return (
    <>
      <h1 className="font-display text-3xl text-ui-yellow tracking-wide">
        Privacy Policy
      </h1>
      <p className={`${p} mt-2 text-sm`}>Last updated: September 2026</p>

      <h2 className={h2}>1. Overview</h2>
      <p className={p}>
        Bomb Blast Arena (the &ldquo;Game&rdquo;) is a casual browser game that
        can also
        run as a Discord Activity. The Game is designed to collect as little
        data as possible: there are no user accounts, no analytics trackers,
        and no advertising.
      </p>

      <h2 className={h2}>2. Information we process</h2>
      <p className={p}>
        <span className="text-ui-text">Nickname.</span> If you play online, you
        choose a nickname that is shared with other players in your room. It
        is kept in memory on the relay server for the duration of the session
        and is not stored persistently.
      </p>
      <p className={p}>
        <span className="text-ui-text">Room and gameplay data.</span> Room
        codes, player rosters, and in-game state are relayed through our
        WebSocket relay server in real time and discarded when the session
        ends. Game statistics (scores, wins, time played) exist only for the
        duration of a match.
      </p>
      <p className={p}>
        <span className="text-ui-text">Discord data.</span> When launched as a
        Discord Activity, the Game uses Discord&rsquo;s Embedded App SDK. With
        your authorization we request the &ldquo;identify&rdquo; scope (to
        authenticate the session), &ldquo;rpc.activities.write&rdquo; (to
        update your Rich Presence status), and
        &ldquo;guilds.members.read&rdquo; (to use your server nickname as
        your default in-game name). We do not read your messages, friends
        list, or other server data, and we do not store Discord profile
        information.
      </p>
      <p className={p}>
        <span className="text-ui-text">Local storage.</span> Preferences such
        as audio volume and mute state are stored in your browser&rsquo;s local
        storage and never leave your device.
      </p>

      <h2 className={h2}>3. What we do not collect</h2>
      <p className={p}>
        We do not collect email addresses, real names, location data, or
        payment information. We do not use cookies for tracking, and we do not
        sell or share personal data with third parties.
      </p>

      <h2 className={h2}>4. Third-party services</h2>
      <p className={p}>
        The Game is delivered through infrastructure providers (hosting and
        network tunneling) that may process standard request metadata such as
        IP addresses as part of serving traffic. When used inside Discord,
        Discord&rsquo;s own Privacy Policy applies to data Discord collects.
      </p>

      <h2 className={h2}>5. Data retention</h2>
      <p className={p}>
        Session data (nicknames, room state, scores) exists only in memory
        while a session is active and is deleted when it ends. We keep no
        persistent player profiles.
      </p>

      <h2 className={h2}>6. Children&rsquo;s privacy</h2>
      <p className={p}>
        The Game does not knowingly collect personal information from children
        under the age required by applicable law. If you believe a child has
        provided us personal information, contact us and we will address it.
      </p>

      <h2 className={h2}>7. Changes</h2>
      <p className={p}>
        We may update this policy from time to time. The current version is
        always available at this URL, and the &ldquo;Last updated&rdquo; date
        reflects the
        latest revision.
      </p>

      <h2 className={h2}>8. Contact</h2>
      <p className={p}>
        Questions about this policy can be sent to{" "}
        <span className="text-ui-text">bomb-blast-arena@gmail.com</span>.
      </p>
    </>
  );
}
