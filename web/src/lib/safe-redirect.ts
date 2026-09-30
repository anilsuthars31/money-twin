/**
 * Where to send someone after signing in. Only same-site paths are allowed ("/skills",
 * "/play/demo?x=1"), so a crafted ?callbackUrl=https://evil.example can't bounce users off-site.
 */
export function safeCallbackUrl(value: unknown, fallback = "/account"): string {
  if (typeof value !== "string" || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  try {
    const url = new URL(value, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
