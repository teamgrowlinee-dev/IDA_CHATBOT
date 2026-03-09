import crypto from "node:crypto";
import type { Request, Response } from "express";

export const PROFILE_COOKIE_NAME = "ida_profile_id";
const PROFILE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const PROFILE_ID_REGEX = /^[a-zA-Z0-9_-]{12,80}$/;

const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader) return {};
  const pairs = cookieHeader.split(";").map((part) => part.trim()).filter(Boolean);
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
};

const createProfileId = (): string => `prof_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

const isValidProfileId = (value: string): boolean => PROFILE_ID_REGEX.test(value);

export const resolveProfileId = (req: Request, res: Response): string => {
  const cookies = parseCookies(req.headers.cookie);
  const fromCookie = String(cookies[PROFILE_COOKIE_NAME] ?? "").trim();
  const fromHeader = String(req.headers["x-ida-profile-id"] ?? "").trim();
  const fromQuery = String(req.query.profileId ?? "").trim();

  const picked = [fromCookie, fromHeader, fromQuery].find((candidate) => isValidProfileId(candidate));
  const profileId = picked || createProfileId();

  if (!picked || picked !== fromCookie) {
    res.cookie(PROFILE_COOKIE_NAME, profileId, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: PROFILE_MAX_AGE_SECONDS * 1000
    });
  }

  return profileId;
};
