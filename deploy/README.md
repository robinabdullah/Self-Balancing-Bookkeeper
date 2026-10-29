# Deploying to the partners' VPS (D-030, D-031, D-071)

Self-Balancing Bookkeeper runs on the partners' Singapore VPS as two **systemd** services, as
`ubuntu`, with Node 24 from nvm (D-068, N-7.1):
- `self-balancing-bookkeeper`, web: a Next.js standalone build on `127.0.0.1:4007`;
- `self-balancing-bookkeeper-api`, the api: the NestJS bundle on `127.0.0.1:4006`, which only web
  calls.

They sit behind the VPS's **existing nginx**, which serves HTTPS on `business.example.com` (a
placeholder: use your own domain) and routes to web only. No Docker. Supabase stays for the
database and login.

```
/home/ubuntu/Self-Balancing-Bookkeeper/   the repo clone on `main`: pull and build here
  .env.local                              the production secrets (mode 600, git-ignored); on a
                                          dev laptop `.env.local` is local Supabase instead (D-066)
/var/www/self-balancing-bookkeeper/       the live copy, both apps:
  node_modules/, apps/web/                  web's standalone tree (server.js, .next/, public/)
  api/                                      the api's bundle (main.js, fonts/)
  web.env, api.env                          each app's lines of .env.local (mode 600)
  RELEASE                                   the branch and commit of this copy
/var/www/self-balancing-bookkeeper-old/   the previous copy, for rollback
```

`scripts/deploy.sh` runs in the clone:
1. it checks `.env.local` has every key below;
2. `npm ci`, then builds web and the api at low CPU priority, and migrates the database once;
3. it copies both builds to `/var/www/self-balancing-bookkeeper-new`, writing `web.env` (only the
   `NEXT_PUBLIC_*` lines) and `api.env` (the database URL, the Supabase lines and the card key);
4. it swaps that with the live copy (the live one becomes `-old`);
5. it restarts the api and waits for `http://127.0.0.1:4006/health`, then restarts web and waits
   for `http://127.0.0.1:4007/login`.

If the build or the migration fails, `/var/www` is not touched. If the new copy doesn't answer, the
old one is moved back and started.

## One-time setup

Run these on the VPS as `ubuntu`. On the partners' VPS the old app is still live: follow
[Switching from the old app](#switching-from-the-old-app), which uses steps 2–5 and 7 here.

1. **DNS.** Cloudflare has an `A` record for `business.example.com`. If it is proxied (orange
   cloud), set Cloudflare → SSL/TLS to **Full (strict)**; "Flexible" makes an endless redirect
   once certbot adds HTTPS.
2. **The clone is on `main`.** Merge `dev` into `main` and push, then clone it with the VPS's
   deploy key:
   ```bash
   git clone <this repo> ~/Self-Balancing-Bookkeeper
   cd ~/Self-Balancing-Bookkeeper && git checkout main && git pull
   ```
3. **Secrets.** Create `~/Self-Balancing-Bookkeeper/.env.local` and run
   `chmod 600 ~/Self-Balancing-Bookkeeper/.env.local`:
   ```
   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_ANON_KEY=<anon key>
   ```
   The api reads the same URL and anon key under its own names (`SUPABASE_URL`,
   `SUPABASE_ANON_KEY`). On a legacy HS256 project only, add `SUPABASE_JWT_SECRET` (N-7.2's
   key-type check). Web's copy gets only the `NEXT_PUBLIC_*` lines; the rest go to the api's.

   Use Supabase's **session pooler** connection string (port 5432): it works over IPv4 (the
   direct `db.<ref>.supabase.co` host is IPv6-only), and the migrations can run through it. It
   allows 15 clients by default. The api keeps one pool of at most 10 (CR-030), so a migration or
   script still fits beside it; a second app or pool on the same URL would not (the switch's
   step 1 raises the Pool Size).
   A password with special characters must be URL-encoded. The `NEXT_PUBLIC_*` values are built
   into the app, so changing any value needs a new release. In Supabase → Authentication → URL
   Configuration, set the Site URL to `https://business.example.com`.

   **Card details key** (D-046): saved card details are encrypted with `CARD_SECRET_KEY`
   (32 random bytes, base64). **When switching from the old app, copy its line from
   `~/Mobile-Business-Lite/.env.local` and skip the command below:** a new key can't read the cards
   saved so far. On a fresh install only, make it once on the VPS and add it to `.env.local`:
   ```bash
   echo "CARD_SECRET_KEY=$(openssl rand -base64 32)" >> ~/Self-Balancing-Bookkeeper/.env.local
   ```
   - **Copy the key into your password manager.** Without it, the saved card details can't be
     read: not even from a backup.
   - Never change or lose it once cards are saved; when moving from the old app, copy its key.
   - It is never in git or in the database, and it is not a `NEXT_PUBLIC_` value.
   - The api reads it on restart; web never gets it. `deploy.sh` refuses to release without it.
4. **Check that the VPS reaches the database** (it prints the host and port, never the password):
   ```bash
   cd ~/Self-Balancing-Bookkeeper && npm ci
   node -e 'require("@next/env").loadEnvConfig("."); const u = new URL(process.env.DATABASE_URL); console.log("host:", u.hostname, "port:", u.port); require("postgres")(process.env.DATABASE_URL, { connect_timeout: 10 })`select 1`.then(() => { console.log("DB OK"); process.exit(0) }).catch((e) => { console.error("DB FAIL:", e.message); process.exit(1) })'
   ```
5. **Services.** Install Node 24 (`nvm install 24`). Ports 4006 and 4007 must be free
   (`ss -ltn | grep -E ':400[67]'` prints nothing).
   ```bash
   sudo cp ~/Self-Balancing-Bookkeeper/deploy/self-balancing-bookkeeper.service \
     ~/Self-Balancing-Bookkeeper/deploy/self-balancing-bookkeeper-api.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable self-balancing-bookkeeper self-balancing-bookkeeper-api
   ```
   They start on the first deploy. Both files use Node's nvm path
   (`/home/ubuntu/.nvm/versions/node/v24.22.1/bin/node`). If `nvm which 24` prints another one,
   or after an nvm upgrade, update both files there and run `sudo systemctl daemon-reload`.
   Otherwise systemd logs `Failed to locate executable` and `status=203/EXEC`:
   ```bash
   NODE_VER=$(basename "$(dirname "$(dirname "$(nvm which 24)")")")
   sudo sed -i "s|/node/v24.22.1/|/node/$NODE_VER/|" \
     /etc/systemd/system/self-balancing-bookkeeper.service \
     /etc/systemd/system/self-balancing-bookkeeper-api.service
   sudo systemctl daemon-reload
   ```
   (After a later upgrade, replace `v24.22.1` there with the version the files now hold.)
6. **nginx and HTTPS** (a fresh VPS only; when switching from the old app, its site is kept):
   ```bash
   sudo cp ~/Self-Balancing-Bookkeeper/deploy/nginx.conf \
     /etc/nginx/sites-available/self-balancing-bookkeeper
   sudo ln -s /etc/nginx/sites-available/self-balancing-bookkeeper /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d business.example.com
   ```
   `nginx -t` checks the other apps' sites too; reload only when it passes.
7. **First release.**
   ```bash
   bash ~/Self-Balancing-Bookkeeper/scripts/deploy.sh
   ```

## Switching from the old app

The old app (the single Next.js app, D-031: unit `mobile-business`, `/var/www/mobile-business`,
port 4005, the clone `~/Mobile-Business-Lite`) keeps serving `business.example.com`. The new app
runs beside it on the same database and is tried first on its own subdomain (D-072).
`business2.example.com` is a placeholder for it; like the main site, it is open. No database change
is needed.

1. **Raise the pooler's Pool Size first.** Each app keeps a pool of up to 10 connections and
   holds idle ones, so together they need 20 of the session pooler's 15. Without this, the new
   app fails with `EMAXCONNSESSION max clients reached in session mode`, while `/health` (which
   doesn't touch the database) still passes. In Supabase, go to Project Settings → Database →
   Connection pooling configuration, and set Pool Size to **30**: two pools plus room for a
   migration or a script. It can go back to 15 after the clean-up.
2. **Deploy beside it:** steps 2–5 and 7 above. Then check on the VPS:
   ```bash
   curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4007/login   # 200
   curl -fsS http://127.0.0.1:4006/health                                     # {"ok":true}
   ```
   `business.example.com` still serves the old app.
3. **Try the new app at `business2.example.com`:**
   1. Add an `A` record for `business2` in Cloudflare, as in step 1. Keep it one level deep:
      Cloudflare's free certificate doesn't cover `a.b.example.com`.
   2. Add its nginx site:
      ```bash
      sudo cp ~/Self-Balancing-Bookkeeper/deploy/nginx.conf /etc/nginx/sites-available/business2
      sudo sed -i 's|business.example.com|business2.example.com|g' /etc/nginx/sites-available/business2
      sudo ln -s /etc/nginx/sites-available/business2 /etc/nginx/sites-enabled/
      sudo nginx -t && sudo systemctl reload nginx
      sudo certbot --nginx -d business2.example.com
      ```
   3. Check it:
      - each partner logs in;
      - the balances and reports match the old app's;
      - a test entry shows in both apps (they share one database), then delete it.
   4. Don't save a passkey there. A passkey belongs to its host, so it stops working after the
      switch.
4. **Switch** (at a quiet time): point the main site at the new web, then restart the old app once
   so it drops its database connections:
   ```bash
   sudo sed -i 's|127.0.0.1:4005|127.0.0.1:4007|' /etc/nginx/sites-available/mobile-business
   sudo nginx -t && sudo systemctl reload nginx
   sudo systemctl restart mobile-business
   ```
   The `sed` changes certbot's HTTPS block too. Then run the smoke test below. Card reveal works
   again with the partners' existing passkeys.
5. **Switch back**, if needed during the week: the same line reversed, then restart the new api so
   it drops its connections:
   ```bash
   sudo sed -i 's|127.0.0.1:4007|127.0.0.1:4005|' /etc/nginx/sites-available/mobile-business
   sudo nginx -t && sudo systemctl reload nginx
   sudo systemctl restart self-balancing-bookkeeper-api
   ```
6. **Clean up**, after a week of watching:
   ```bash
   sudo rm /etc/nginx/sites-enabled/business2 /etc/nginx/sites-available/business2
   sudo certbot delete --cert-name business2.example.com
   sudo systemctl disable --now mobile-business
   sudo rm /etc/systemd/system/mobile-business.service && sudo systemctl daemon-reload
   sudo rm -rf /var/www/mobile-business /var/www/mobile-business-old ~/Mobile-Business-Lite
   sudo mv /etc/nginx/sites-available/mobile-business \
     /etc/nginx/sites-available/self-balancing-bookkeeper
   sudo rm /etc/nginx/sites-enabled/mobile-business
   sudo ln -s /etc/nginx/sites-available/self-balancing-bookkeeper /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
   Then remove the `business2` DNS record. In Supabase, set Pool Size back to 15 if you like.

Logins and passkeys belong to one host. On `business2` the partners log in again, and the card
reveal doesn't work there: a passkey is tied to `business.example.com`.

## Releasing

Merge `dev` into `main` and push, then on the VPS (or save this as
`~/deploy-self-balancing-bookkeeper.sh`):

```bash
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd /home/ubuntu/Self-Balancing-Bookkeeper && git pull
bash scripts/deploy.sh
sudo journalctl -u self-balancing-bookkeeper-api -u self-balancing-bookkeeper -f
```

- **Roll back** to the previous copy:
  `bash ~/Self-Balancing-Bookkeeper/scripts/deploy.sh --rollback` (run it again to swap back).
  - Web and the api always swap together; the api restarts first, then web, with the same checks.
  - This switches the code only. Database migrations are not undone, so a migration must keep the
    previous copy working (add columns; don't drop or rename them in the same release).
  - While the old app is still parked, it must keep working too.
- **Logs:** `sudo journalctl -u self-balancing-bookkeeper-api -u self-balancing-bookkeeper -f`.
  **Status:** `systemctl status self-balancing-bookkeeper-api self-balancing-bookkeeper`.
  **Live release:** `cat /var/www/self-balancing-bookkeeper/RELEASE`.

## Checks

- **A failed build leaves the live copy serving (M-CR-011.1):** check out a branch with a type
  error in the clone and run `bash scripts/deploy.sh`. It stops at the build, `/var/www` is
  unchanged and the site still works. Then `git checkout main`.
- **The side-by-side switch (M-CR-048.x, rehearsed in a systemd container with nginx):**
  1. the old app is live on 4005;
  2. the new deploy starts both new units and leaves the old app running;
  3. the old app answers at `business-old`;
  4. after the switch, nginx sends `business` to 4007;
  5. switching back and again works;
  6. `--rollback` restarts both new units;
  7. a failed new release (a missing key, or an api that doesn't answer `/health`) leaves both
     hosts serving;
  8. after the clean-up and a reboot, only the new units run, and `business` serves them.

  That rehearsal parked the old app at `business-old`. D-072 tries the new app at `business2`
  instead, with the same nginx steps, and production has run it that way (CR-049).
- **Smoke test (M-CR-011.2):** `https://business.example.com` has a valid certificate; a private
  window goes to `https://business.example.com/login`; each partner logs in on their phone, saves
  one entry and deletes it; the other apps on the VPS still respond.
