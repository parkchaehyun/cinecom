import NextAuth from "next-auth";
import Naver from "next-auth/providers/naver";
import type { JWT } from "next-auth/jwt";

// The cafe write API posts *as the logged-in member*, so the session must carry their
// Naver access token. Tokens last ~1h — without refresh, posting breaks mid-session.
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: "RefreshFailed";
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number; // epoch seconds
    error?: "RefreshFailed";
  }
}

async function refresh(token: JWT): Promise<JWT> {
  if (!token.refreshToken) return { ...token, error: "RefreshFailed" };
  try {
    const res = await fetch("https://nid.naver.com/oauth2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.AUTH_NAVER_ID ?? "",
        client_secret: process.env.AUTH_NAVER_SECRET ?? "",
        refresh_token: token.refreshToken,
      }),
      cache: "no-store",
    });
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: string;
      error?: string;
    };
    if (!res.ok || data.error || !data.access_token) throw new Error(data.error ?? "no token");
    return {
      ...token,
      accessToken: data.access_token,
      // Naver does not always return a new refresh token — keep the existing one.
      refreshToken: data.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + Number(data.expires_in ?? 3600),
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshFailed" };
  }
}

// Client id/secret come from AUTH_NAVER_ID / AUTH_NAVER_SECRET automatically.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Naver],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          error: undefined,
        };
      }
      // Refresh a minute before expiry rather than after a failed post.
      if (token.expiresAt && Date.now() < token.expiresAt * 1000 - 60_000) return token;
      return refresh(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
  },
});
