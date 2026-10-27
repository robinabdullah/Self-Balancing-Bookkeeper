# Deploying to the partners' VPS (D-030, D-031)

The app runs on the partners' Singapore VPS as a **systemd** service (a Next.js standalone build,
`node apps/web/server.js` on `127.0.0.1:4005`, as `ubuntu`, Node 20 from nvm) behind the VPS's **existing
nginx**, which serves HTTPS on `business.example.com` (a placeholder: use your own domain). No Docker. Supabase stays for the database
and login.

```
/home/ubuntu/Mobile-Business-Lite/   the repo clone on `main`: pull and build here
  .env.local                         the production secrets (mode 600, git-ignored); on a
                                     dev laptop `.env.local` is local Supabase instead (D-066)
/var/www/mobile-business/            the live copy (node_modules/, and apps/web/ with server.js,
                                     .next/ and .env.local)
/var/www/mobile-business-old/        the previous copy, for rollback
```

`scripts/deploy.sh` runs in the clone: `npm ci`, build at low CPU priority, migrate the database,
copy the build (with `.env.local`) to `/var/www/mobile-business-new`, swap it with the live copy
(the live one becomes `-old`) and restart the service. If the build or the migration fails,
`/var/www` is not touched. If the new copy doesn't start, the old one is moved back.

## One-time setup

Run these on the VPS as `ubuntu`.

1. **DNS.** Cloudflare has an `A` record for `business.example.com`. If it is proxied (orange
   cloud), set Cloudflare → SSL/TLS to **Full (strict)**; "Flexible" makes an endless redirect
   once certbot adds HTTPS.
2. **The clone is on `main`.** Merge `dev` into `main` and push, then:
   ```bash
   cd ~/Mobile-Business-Lite && git checkout main && git pull
   ```
3. **Secrets.** Create `~/Mobile-Business-Lite/.env.local` and run
   `chmod 600 ~/Mobile-Business-Lite/.env.local`:
   ```
   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```
   Use Supabase's **session pooler** connection string (port 5432): it works over IPv4 (the
   direct `db.<ref>.supabase.co` host is IPv6-only), and the migrations can run through it. It
   allows 15 clients. The app keeps one pool of at most 10 per server (CR-030), so a migration
   or script still fits beside it; a second app or pool on the same URL would not. A
   password with special characters must be URL-encoded. The `NEXT_PUBLIC_*` values are built into
   the app, so changing any value needs a new release. In Supabase → Authentication → URL
   Configuration, set the Site URL to `https://business.example.com`.

   **Card details key** (D-046): saved card details are encrypted with `CARD_SECRET_KEY`
   (32 random bytes, base64). Make it once on the VPS and add it to `.env.local`:
   ```bash
   echo "CARD_SECRET_KEY=$(openssl rand -base64 32)" >> ~/Mobile-Business-Lite/.env.local
   ```
   - **Copy the key into your password manager.** Without it, the saved card details can't be
     read: not even from a backup.
   - Never change or lose it once cards are saved.
   - It is never in git or in the database, and it is not a `NEXT_PUBLIC_` value.
   - The service reads it on restart. Without the key, the app refuses to save or show card
     details.
4. **Check that the VPS reaches the database** (it prints the host and port, never the password):
   ```bash
   cd ~/Mobile-Business-Lite && npm ci
   node -e 'require("@next/env").loadEnvConfig("."); const u = new URL(process.env.DATABASE_URL); console.log("host:", u.hostname, "port:", u.port); require("postgres")(process.env.DATABASE_URL, { connect_timeout: 10 })`select 1`.then(() => { console.log("DB OK"); process.exit(0) }).catch((e) => { console.error("DB FAIL:", e.message); process.exit(1) })'
   ```
5. **Service.** Port 4005 must be free (`ss -ltn | grep :4005` prints nothing).
   ```bash
   sudo cp ~/Mobile-Business-Lite/deploy/mobile-business.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable mobile-business
   ```
   It starts on the first deploy. The file uses Node's nvm path
   (`/home/ubuntu/.nvm/versions/node/v20.19.6/bin/node`); after an nvm upgrade, update it there.
6. **nginx and HTTPS.**
   ```bash
   sudo cp ~/Mobile-Business-Lite/deploy/nginx.conf /etc/nginx/sites-available/mobile-business
   sudo ln -s /etc/nginx/sites-available/mobile-business /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d business.example.com
   ```
   `nginx -t` checks the other apps' sites too; reload only when it passes.
7. **First release.**
   ```bash
   bash ~/Mobile-Business-Lite/scripts/deploy.sh
   ```

## Releasing

Merge `dev` into `main` and push, then on the VPS (or save this as `~/deploy-mobile-business.sh`):

```bash
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd /home/ubuntu/Mobile-Business-Lite && git pull
bash scripts/deploy.sh
sudo journalctl -u mobile-business -f
```

- **Roll back** to the previous copy: `bash ~/Mobile-Business-Lite/scripts/deploy.sh --rollback`
  (run it again to swap back). This switches the code only. Database migrations are not undone,
  so a migration must keep the previous copy working (add columns; don't drop or rename them in
  the same release).
- **Logs:** `sudo journalctl -u mobile-business -f`. **Status:** `systemctl status mobile-business`.

## Checks

- **A failed build leaves the live copy serving (M-CR-011.1):** check out a branch with a type
  error in the clone and run `bash scripts/deploy.sh`. It stops at the build, `/var/www` is
  unchanged and the site still works. Then `git checkout main`.
- **Smoke test (M-CR-011.2):** `https://business.example.com` has a valid certificate; a private
  window goes to `https://business.example.com/login`; each partner logs in on their phone, saves
  one entry and deletes it; the other apps on the VPS still respond.
