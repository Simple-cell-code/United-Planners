# United Planners

A responsive event discovery and planning app built with React, TypeScript, Vite, Express, and MySQL.

## Start locally

1. Make sure the Windows `MySQL80` service is running.
2. Copy `.env.example` to `.env` and enter your local MySQL credentials and a private `JWT_SECRET`.
3. Install dependencies with `npm install` if needed.
4. In one PowerShell terminal, start the API from the project folder:

   ```powershell
   npm run server
   ```

   The API creates or migrates the account, password-reset, and profile-picture fields when it starts.
5. In a second PowerShell terminal, start the website:

   ```powershell
   npm run dev
   ```

6. Open the local URL printed by Vite, usually `http://localhost:5173`.

Keep MySQL, the API, and Vite running. Vite proxies authentication, presence, and admin API requests to the local Express server.

## Password recovery email

Forgot-password codes are sent to the account email and expire after 10 minutes. Gmail is the default SMTP host (`smtp.gmail.com`, port `465`, TLS enabled). To enable delivery:

1. Enable 2-Step Verification on the Gmail account.
2. Create a Google App Password for the mailer; do not use your regular Google password.
3. Put the Gmail address in `SMTP_USER` and the App Password in `SMTP_PASSWORD` in `.env`. Keep both private.
4. Restart `npm run server`.

You can override `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, and optionally `SMTP_FROM` for another mail provider. Until valid SMTP credentials are supplied, the recovery form reports that email delivery is unavailable; it does not expose or collect an existing password.

Changing the account email also sends a one-time verification code to the proposed new address. The account keeps its current email until that code is confirmed; verification codes expire after 10 minutes.

## Sharing with Ngrok

Run `ngrok http 5173` in another terminal and share its HTTPS forwarding URL. Keep MySQL, the API, Vite, and Ngrok running on the same computer. The Ngrok URL serves the same Vite instance and its shared file-backed data API.

## Data and account behavior

- Passwords are hashed in MySQL. API sessions use signed JWTs; admin operations are checked by the server.
- Member profile pictures are validated as JPEG, PNG, or WebP files up to 5 MB and stored as image bytes in the MySQL user record, so they load on other signed-in devices.
- Each account receives a stable user code. Admins can view/export registered accounts, see accounts active within the last minute, and block or unblock member accounts.
- Announcements and events are stored in `data/site-data.json`. Open pages receive new events and announcements over server-sent events without reloading; periodic polling remains as a fallback. Admin-created events publish immediately, while member submissions remain pending until an admin approves them.
- Events and reminder schedules are stored in the local JSON file on the computer running Vite. They are shared through that host, not stored in MySQL.
- Event planning and reminder management require a valid signed-in account. Public event browsing remains available without signing in.

This project is a local prototype, not a hardened production service. For public deployment, replace local file-backed event/message data with a secured database, configure HTTPS and production secrets, and use a managed deployment and notification service.