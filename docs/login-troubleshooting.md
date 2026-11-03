# Database timeout and login troubleshooting

## Session persistence after restarting the server

- The CRM uses a database-backed Better Auth session and a persistent, HTTP-only browser cookie. It does not need a separate refresh token.
- Remembered sessions last 30 days by default and slide forward after use. Set `AUTH_SESSION_DAYS` to a whole number from 1 to 90 if agency policy requires a different duration.
- Continue using exactly `http://localhost:3000` in development. `localhost` and `127.0.0.1` are different browser cookie hosts; signing in on one does not sign in the other.
- Use a normal browser profile. Incognito, Private and Guest profiles commonly remove cookies when their last window closes.
- After changing the session configuration, sign in once to receive the new 30-day cookie. Existing cookies and database sessions retain their original expiry.
- Stopping and restarting `npm run dev` must not require a new login in the same normal browser profile. Sign out, password reset, deactivation, role change, cookie clearing or expiry can legitimately require login again.

The reported `Server selection timed out after 8000 ms` means the server could not select an available MongoDB server. It does not prove that a password is wrong.

On 30 October 2026, a read-only check from this machine successfully pinged Atlas using `.env.local`. Both URI database and `MONGODB_DB_NAME` pointed to `earlybird`. The Owner staff record was active and had an auth user/password record. A request to the running localhost login endpoint returned the expected 401 for a deliberately nonexistent test account, demonstrating that login requests could reach the database at that point. No real credentials were changed.

## Application fixes

- Failed initial MongoDB connection promises are cleared so the next request can retry after a transient network problem.
- Sign-in distinguishes server/database unavailability from invalid credentials and rate limiting.
- Authentication failures never return MongoDB connection strings to the browser.

## If the problem returns

1. Refresh `http://localhost:3000` and try the existing email/password.
2. In the project terminal, run `npm run db:check`. It prints safe connection/account status, not passwords.
3. If the check passes but the browser still fails, stop the local development server with Ctrl+C and run `npm run dev` again. Environment-variable changes require a restart.
4. If the check fails, check internet/VPN/firewall, whether the Atlas cluster is running, and whether the current machine IP is allowed in Atlas Network Access. Do not broaden access to all IPs as a workaround.
5. Only investigate password recovery after the connection works and the application reports an actual credentials error. `npm run owner:recover` intentionally changes access by issuing a private one-time activation/reset link; do not run it simply because Atlas timed out.

Do not post `.env.local`, MongoDB passwords, auth secrets or activation links in messages. No URI or password edit was needed for the successful diagnostic above.
