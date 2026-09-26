# OmniShare

OmniShare is a secure cloud file-sharing application built with HTML, CSS, vanilla JavaScript, Supabase, and Vercel.

## Live Website

**Live app:** https://finalomnishare.vercel.app

## Current Architecture

- Supabase Auth for account sign-up/sign-in
- PostgreSQL metadata in `omnishare_files` and `omnishare_activity`
- Private Supabase Storage bucket: `omnishare-files`
- Row Level Security (RLS) so users can manage only their own files and activity
- Public cross-device retrieval through the `omnishare-retrieve` Edge Function
- Short-lived signed download URLs and one-hour signed preview URLs; the Storage bucket itself is not public
- Vercel for the web frontend

## What Works

- TUS resumable uploads for files above 6 MB with automatic retry and resume support
- Application/database architecture prepared for files up to 5 GB
- Current connected Supabase Free project is still limited by Supabase to 50 MB per file; Pro and above can configure much larger global limits
- Cross-device retrieval using secure IDs such as `OMNI-A1B2-C3D4`
- Recipient downloads without requiring an account
- Email/password account creation and sign-in for upload/library access
- Private per-user file library
- File expiration
- Secure random share IDs generated with Web Crypto
- Download counters and activity history
- Search and sorting
- Delete and clear-expired workflows
- Shareable retrieval links
- Secure inline previews for images, video, audio, PDF, and common text/code files
- Responsive light/dark interface

## Security Model

Files are uploaded to a **private** Supabase Storage bucket. The browser uses only a publishable Supabase key. Secret/service keys are never committed to the frontend.

Authenticated users can access only their own metadata and Storage paths through RLS. A recipient with a valid OmniShare ID calls a public Edge Function, which validates the ID and expiry and returns a short-lived signed download URL.

The share ID therefore acts as a capability link: treat it as private and only send it to intended recipients.

## Repository Layout

- `index.html` — application interface
- `styles.css` — responsive UI and authentication/retrieval styles
- `cloud-app.js` — production Supabase cloud engine
- `supabase-schema.sql` — reproducible database and Storage policies
- `supabase/functions/omnishare-retrieve/` — public retrieval Edge Function source

## Backend Objects

- `public.omnishare_files`
- `public.omnishare_activity`
- `storage.buckets.id = 'omnishare-files'`
- Edge Function: `omnishare-retrieve`

The reproducible database setup is stored in `supabase-schema.sql`, and the Edge Function source is under `supabase/functions/omnishare-retrieve/`.

## Developer

**Jim Rodmark Camus**  
BSIT — Network Technology  
GitHub: [@Sachibara](https://github.com/Sachibara)
