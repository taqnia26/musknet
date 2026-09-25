/** Only known uniqueness violations may be reported as a user-correctable conflict. */
export function influencerConflict(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth++) {
    const value = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (value.code === "23505") {
      if (value.constraint === "influencers_email_unique") return "Influencer email already exists";
      if (value.constraint === "influencers_referral_unique") return "Influencer referral code already exists";
      return null;
    }
    current = value.cause;
  }
  return null;
}