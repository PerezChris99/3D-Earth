# Palantir-Style Intelligence Platform: Security Audit & Hardening Matrix

This document tracks the security posture of the platform. We must assume that an intelligence dashboard will be targeted by:
1. **DDoS/Botnets** trying to take down the feed or scrape all track data.
2. **XSS/Injection attacks** via crafted payload inputs (e.g., spoofed ADS-B planes with JS in their callsigns).
3. **Data exfiltration** via unauthorized API access.

---

## 🛡️ Current Defenses (Phase 0 Implemented)

### 1. HTTP Header Hardening (XSS, Clickjacking, MIME-Sniffing)
* **Tool:** `helmet` (Node.js middleware)
* **Status:** **ACTIVE**
* **Mechanism:** Sets `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`. 
* **Content Security Policy (CSP):** Strictly whitelisted scripts and assets. Only explicitly trusted CDNs (Three.js, Unpkg, Cloudflare) and `self` are allowed to execute scripts. If an attacker injects `<script>alert(1)</script>` via a malicious map marker, the browser will block it.

### 2. Denial of Service (DDoS) & Brute Force Prevention
* **Tool:** `express-rate-limit`
* **Status:** **ACTIVE**
* **Mechanism:** The REST API strictly limits connections to 100 requests per 15-minute window per IP. This prevents automated scrapers from overwhelming the backend, draining our API quotas from upstream sources (OpenSky/AISHub), and crashing the server.

### 3. Cross-Origin Resource Sharing (CORS) Locks
* **Tool:** `cors`
* **Status:** **ACTIVE**
* **Mechanism:** Disallows random websites from making AJAX calls to our `/api` endpoints or connecting to our WebSocket. Controlled via `.env` parameter `ALLOWED_ORIGINS`.

### 4. Payload Size Limits & Memory Exhaustion
* **Mechanism:** `express.json({ limit: '10kb' })`
* **Status:** **ACTIVE**
* **Mechanism:** An attacker might try sending a 5GB JSON payload to crash the V8 V8 engine. We cap incoming payloads at 10 kilobytes.

### 5. API Key Segregation
* **Mechanism:** `.env` and `dotenv`
* **Status:** **ACTIVE**
* **Mechanism:** The frontend *never* holds the keys for OpenSky, Space-Track, or AISHub. The backend holds them, performs server-to-server calls, strips out unnecessary/sensitive fields, and pushes only coordinates to the frontend.

---

## 🚧 Upcoming Hardening Tasks (Phases 1-3)

As we integrate PostgreSQL and User Access, we must implement:

### 1. Authentication Authorization & Broken Access Control
* **Fix needed:** Implement JWT (JSON Web Tokens) with short expiries (15 mins) and secure HttpOnly rotating refresh cookies.
* **Why:** WebSockets can be hijacked. We must require a valid Bearer token during the WS handshake handshake upgrade `req.headers.upgrade`.

### 2. SQL Injection (SQLi) & Timescale Exploits
* **Fix needed:** Use parameterized queries (e.g., `pg` npm package or Prisma/Sequelize ORM) for ALL track queries. Never concat strings: `WHERE id = ` + req.params.id;

### 3. Rate-Limiting the WebSocket
* **Fix needed:** `express-rate-limit` only protects REST routes. We need to implement connection limits and message payload limits on the `ws` connections globally. (e.g. disconnect a client sending > 10 messages per second).

### 4. Geofencing (WAF)
* **Fix needed:** When deployed (via Nginx or Cloudflare), restrict backend access to trusted country IP ranges or corporate VPN IPs.

---

> **Note on "Static/Prod" Preservation:** 
> Because we split this work into the `perez` branch, the `main` branch remains 100% static and hack-proof by its nature (it relies directly on public endpoints). The backend changes here are isolated until you choose to merge them.