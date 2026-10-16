# ADR-0011: Admin console as a Next.js static export on S3 + CloudFront

**Status:** Accepted

**Decision.** `output: 'export'` with client-side data fetching through the generated API client. Detail pages are
addressed by query string (`/partners/detail/?id=`) instead of dynamic segments. Security headers (CSP, HSTS,
frame-deny) come from a CloudFront response-headers policy; an optional WAF IP allow-list can restrict access to
office or VPN ranges.

**Consequences.** No server to patch or scale; the attack surface is the API it calls. No server-side rendering,
which is acceptable for an authenticated internal tool.
