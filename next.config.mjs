import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
// Security headers on every response. Deliberately no script-src CSP yet:
// Razorpay checkout injects scripts and an iframe from several hosts and a
// wrong policy would silently break payments — roll one out in
// Report-Only mode first. frame-ancestors still stops other sites from
// framing the login/payment pages (clickjacking), except the client's own
// domains.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self' https://thedivinetarotonline.com https://*.thedivinetarotonline.com; base-uri 'self'; object-src 'none'",
  },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// withSentryConfig is a no-op wrapper when SENTRY_DSN isn't set (nothing
// about the build changes), so this is safe to leave in place even for a
// deployment that never configures Sentry at all — see the "Error
// tracking" section in README.md.
export default withSentryConfig(nextConfig, {
  silent: true, // don't print Sentry's build-time logs unless something's actually wrong
  // Source-map upload needs an auth token + org/project — only relevant if
  // you want readable stack traces in the Sentry dashboard. Skipped here
  // (SENTRY_AUTH_TOKEN unset) rather than requiring yet another key up
  // front; add it later if minified stack traces become annoying to read.
});
