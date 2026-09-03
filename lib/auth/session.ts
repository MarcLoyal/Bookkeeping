import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "kb_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string, tokenVersion: number): Promise<void> {
  const token = await new SignJWT({ sub: userId, tv: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export type SessionClaims = { userId: string; tokenVersion: number };

/**
 * Returns the session cookie's claims, or null. Verifies the JWT
 * signature/expiry; does NOT hit the database — callers that need to know
 * whether the session survives a password reset must compare tokenVersion
 * against the user's current row themselves (see getCurrentUser).
 */
export async function getSessionClaims(): Promise<SessionClaims | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.sub !== "string" || typeof payload.tv !== "number") return null;
    return { userId: payload.sub, tokenVersion: payload.tv };
  } catch {
    return null;
  }
}
