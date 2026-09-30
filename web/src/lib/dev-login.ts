/**
 * The email-only dev login exists for Postman and automated tests. It is only ever on when
 * AUTH_DEV_LOGIN=true AND this isn't a production build (`next build` / `next start` set
 * NODE_ENV=production), so a leftover flag in .env can never open it up in production.
 */
export function isDevLoginEnabled(env: { NODE_ENV?: string; AUTH_DEV_LOGIN?: string }): boolean {
  return env.NODE_ENV !== "production" && env.AUTH_DEV_LOGIN === "true";
}
