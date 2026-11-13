-- Applied to Supabase project Ashish_Retail (mnrseaapxpofdznnqrsv) on 2026-11-13.
-- The admin passcode hash is NOT in this file. Set or rotate it with:
--   insert into public.hackathon_admin_secrets (id, passcode_sha256)
--   values (1, '<sha256 hex of passcode>')
--   on conflict (id) do update set passcode_sha256 = excluded.passcode_sha256;
-- Generate the hash locally:  printf %s 'NEW_PASSCODE' | shasum -a 256

create table public.hackathon_registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- about you
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  phone text check (char_length(phone) <= 40),
  location text check (char_length(location) <= 120),
  work_authorized boolean not null default false,
  -- education
  university text not null check (char_length(university) between 2 and 160),
  degree_level text not null check (degree_level in ('bachelors','masters','phd','bootcamp','other')),
  major text check (char_length(major) <= 120),
  graduation_year int not null check (graduation_year between 2020 and 2035),
  -- skills
  python_level int not null default 0 check (python_level between 0 and 4),
  javascript_level int not null default 0 check (javascript_level between 0 and 4),
  llm_experience text not null check (llm_experience in ('none','used_apis','built_agents','shipped_production')),
  skills text[] not null default '{}' check (cardinality(skills) <= 20),
  hackathons_count int not null default 0 check (hackathons_count between 0 and 100),
  -- links
  github_url text check (char_length(github_url) <= 300),
  linkedin_url text check (char_length(linkedin_url) <= 300),
  portfolio_url text check (char_length(portfolio_url) <= 300),
  -- free text
  project_description text not null check (char_length(project_description) between 20 and 3000),
  why_join text not null check (char_length(why_join) between 20 and 2000),
  team_status text not null default 'need_team' check (team_status in ('have_team','need_team')),
  dietary_needs text check (char_length(dietary_needs) <= 300),
  consent boolean not null check (consent),
  -- reviewer-only
  status text not null default 'pending' check (status in ('pending','invited','waitlisted','declined')),
  reviewer_adjustment int not null default 0 check (reviewer_adjustment between -20 and 20),
  reviewer_notes text,
  reviewed_at timestamptz
);
create unique index hackathon_registrations_email_key on public.hackathon_registrations (lower(email));

alter table public.hackathon_registrations enable row level security;

-- Students (anon) may only INSERT, only the applicant columns, and never read anything back.
revoke all on public.hackathon_registrations from anon, authenticated;
grant insert (full_name, email, phone, location, work_authorized, university, degree_level, major,
  graduation_year, python_level, javascript_level, llm_experience, skills, hackathons_count,
  github_url, linkedin_url, portfolio_url, project_description, why_join, team_status,
  dietary_needs, consent) on public.hackathon_registrations to anon, authenticated;
create policy hackathon_public_insert on public.hackathon_registrations
  for insert to anon, authenticated with check (status = 'pending' and reviewer_adjustment = 0);

-- Admin passcode (SHA-256 hash only; plaintext never stored). No policies = no client access.
create table public.hackathon_admin_secrets (
  id int primary key default 1 check (id = 1),
  passcode_sha256 text not null
);
alter table public.hackathon_admin_secrets enable row level security;
revoke all on public.hackathon_admin_secrets from anon, authenticated;

-- Auto score, 0-100
create or replace function public.hackathon_auto_score(r public.hackathon_registrations)
returns int language sql stable set search_path = public as $$
  select (
    case r.llm_experience when 'shipped_production' then 25 when 'built_agents' then 18 when 'used_apis' then 8 else 0 end
    + r.python_level * 3
    + r.javascript_level * 2
    + least(cardinality(r.skills), 5) * 3
    + case when coalesce(r.github_url,'') <> '' then 5 else 0 end
    + case when coalesce(r.portfolio_url,'') <> '' then 3 else 0 end
    + least(r.hackathons_count, 5)
    + case when char_length(r.project_description) >= 300 then 7 when char_length(r.project_description) >= 120 then 4 else 0 end
    + case when char_length(r.why_join) >= 200 then 5 when char_length(r.why_join) >= 80 then 3 else 0 end
    + case r.degree_level when 'phd' then 5 when 'masters' then 5 when 'bachelors' then 3 when 'bootcamp' then 2 else 0 end
    + case when r.graduation_year between extract(year from now())::int and extract(year from now())::int + 1 then 5
           when r.graduation_year < extract(year from now())::int then 3 else 1 end
    + case when r.work_authorized then 5 else 0 end
  )::int
$$;

create or replace function public.hackathon_admin_ok(p_passcode text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.hackathon_admin_secrets
                 where passcode_sha256 = encode(sha256(convert_to(coalesce(p_passcode,''), 'UTF8')), 'hex'))
$$;

create or replace function public.hackathon_admin_list(p_passcode text)
returns table (
  rank bigint, final_score int, auto_score int, id uuid, created_at timestamptz,
  full_name text, email text, phone text, location text, work_authorized boolean,
  university text, degree_level text, major text, graduation_year int,
  python_level int, javascript_level int, llm_experience text, skills text[], hackathons_count int,
  github_url text, linkedin_url text, portfolio_url text, project_description text, why_join text,
  team_status text, dietary_needs text, status text, reviewer_adjustment int, reviewer_notes text
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.hackathon_admin_ok(p_passcode) then
    raise exception 'invalid passcode' using errcode = '28000';
  end if;
  return query
  with s as (
    select h.*, public.hackathon_auto_score(h) as a from public.hackathon_registrations h
  )
  select rank() over (order by (s.a + s.reviewer_adjustment) desc, s.created_at asc),
         (s.a + s.reviewer_adjustment)::int, s.a, s.id, s.created_at,
         s.full_name, s.email, s.phone, s.location, s.work_authorized,
         s.university, s.degree_level, s.major, s.graduation_year,
         s.python_level, s.javascript_level, s.llm_experience, s.skills, s.hackathons_count,
         s.github_url, s.linkedin_url, s.portfolio_url, s.project_description, s.why_join,
         s.team_status, s.dietary_needs, s.status, s.reviewer_adjustment, s.reviewer_notes
  from s order by 1, s.created_at;
end $$;

create or replace function public.hackathon_admin_update(
  p_passcode text, p_id uuid, p_status text, p_adjustment int, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.hackathon_admin_ok(p_passcode) then
    raise exception 'invalid passcode' using errcode = '28000';
  end if;
  update public.hackathon_registrations
     set status = coalesce(p_status, status),
         reviewer_adjustment = coalesce(p_adjustment, reviewer_adjustment),
         reviewer_notes = p_notes,
         reviewed_at = now()
   where id = p_id;
end $$;

-- Invite the top N (by final score) among non-declined applicants; waitlist the rest.
create or replace function public.hackathon_admin_apply_cutoff(p_passcode text, p_capacity int)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.hackathon_admin_ok(p_passcode) then
    raise exception 'invalid passcode' using errcode = '28000';
  end if;
  with ranked as (
    select h.id, row_number() over (order by public.hackathon_auto_score(h) + h.reviewer_adjustment desc, h.created_at) as rn
    from public.hackathon_registrations h where h.status <> 'declined'
  )
  update public.hackathon_registrations h
     set status = case when r.rn <= p_capacity then 'invited' else 'waitlisted' end, reviewed_at = now()
    from ranked r where r.id = h.id;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.hackathon_auto_score(public.hackathon_registrations) from public, anon, authenticated;
revoke all on function public.hackathon_admin_ok(text) from public;
revoke all on function public.hackathon_admin_list(text) from public;
revoke all on function public.hackathon_admin_update(text, uuid, text, int, text) from public;
revoke all on function public.hackathon_admin_apply_cutoff(text, int) from public;
-- Intentionally callable by anon: every admin function is gated by the passcode check.
grant execute on function public.hackathon_admin_ok(text) to anon, authenticated;
grant execute on function public.hackathon_admin_list(text) to anon, authenticated;
grant execute on function public.hackathon_admin_update(text, uuid, text, int, text) to anon, authenticated;
grant execute on function public.hackathon_admin_apply_cutoff(text, int) to anon, authenticated;
