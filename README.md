# AI Agents Hackathon: Student Registration

A registration site for the all-day AI Agents recruiting hackathon (Applied AI Engineer hiring). Students apply on a public page. Organizers rank applicants on a passcode-protected admin page and invite the top N (default 30).

- **Frontend:** static HTML/CSS/JS with no build step, hosted on GitHub Pages from `main`
- **Backend:** Supabase project `Ashish_Retail`, tables prefixed `hackathon_`

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Event info and application form |
| `admin.html` | Ranked applicant list, review, invite cutoff, CSV export (passcode required) |

Edit `config.js` to set the event date, location, application deadline and seat count.

## How ranking works

Each application gets an **auto score (0–100)**, computed in Postgres by `hackathon_auto_score()`:

| Signal | Points |
|---|---|
| LLM experience: not yet / used APIs / built agents / shipped to users | 0 / 8 / 18 / 25 |
| Python level (0–4) × 3 | up to 12 |
| JS/TS level (0–4) × 2 | up to 8 |
| Skills selected × 3 (max 5) | up to 15 |
| GitHub link / portfolio link | 5 / 3 |
| Hackathons attended (max 5) | up to 5 |
| Project description depth (≥120 / ≥300 chars) | 4 / 7 |
| "Why join" depth (≥80 / ≥200 chars) | 3 / 5 |
| Degree: PhD or Master's / Bachelor's / Bootcamp | 5 / 3 / 2 |
| Graduating this year or next / already graduated / later | 5 / 3 / 1 |
| Work authorized | 5 |

**Final score = auto score + reviewer adjustment (±20).** Reviewers set the adjustment after reading the application. Ties are broken by earliest application.

Workflow once applications close:
1. Open `admin.html`, read applications (click a row) and adjust scores, notes or status.
2. Set **Seats** (default 30). A dashed line in the table shows where the cutoff falls.
3. Click **Invite top N**. The top N non-declined applicants become `invited` and everyone else becomes `waitlisted`.
4. Export the CSV and send emails.

## Security model

- The browser uses the Supabase **publishable** key, which is safe to expose.
- `anon` may only **insert** applicant columns. It cannot select, update, or set reviewer fields such as `status`. Duplicate emails are rejected (HTTP 409).
- Admin access goes through `SECURITY DEFINER` RPCs (`hackathon_admin_*`) that check a passcode against a SHA-256 hash in `hackathon_admin_secrets`. That table has RLS enabled and no policies, so clients can't read it. The Supabase advisor flags these RPCs as anon-executable. This is intentional.
- Applicant data in the admin page is rendered with `textContent` only, and CSV export neutralizes spreadsheet formulas.

### Rotate the admin passcode

```bash
printf %s 'NEW_PASSCODE' | shasum -a 256
```
Then in the Supabase SQL editor:
```sql
update public.hackathon_admin_secrets set passcode_sha256 = '<hash>' where id = 1;
```

## Schema

See `supabase/migrations/20261113_hackathon_registrations.sql`.

## Local preview

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
