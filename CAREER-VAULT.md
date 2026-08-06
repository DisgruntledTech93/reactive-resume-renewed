# Career Vault

Reactive Resume Renewed adds a reusable, user-owned content library to Reactive Resume.

## Included workflow

- Store summaries, profiles, work experience, education, projects, skills, languages, interests, awards, certifications, publications, volunteer work, and references as independent Vault blocks.
- Import an existing resume into the Vault. Re-importing refreshes blocks linked to that resume instead of creating duplicates.
- Search by label, tags, private notes, or block content; filter by block type and tags; archive, restore, duplicate, edit, and delete blocks.
- Add one or many Vault blocks directly from any compatible section in the resume builder.
- Save existing builder items and professional summaries back to the Vault.
- Paste a job description, review keyword-ranked recommendations, select the exact blocks to use, and create a targeted resume that preserves an optional base resume's contact information, template, typography, colors, and layout.
- From an application, the existing **Tailor my resume** AI action now selects truthful content from the Career Vault, rewrites only supported descriptions, creates a new resume, and links it to the application.

## Snapshot behavior

Adding a Vault block to a resume creates an independent copy with a new item ID. Editing a job-specific resume never changes the canonical Vault block, and editing the Vault never silently changes a resume that may already have been submitted.

## Data and privacy

Vault blocks are stored in PostgreSQL in the `vault_item` table and are scoped to the authenticated user. Private notes are used for search and matching but are never inserted into generated resumes.

## Database migration

The application runs database migrations during startup. Migration `20260806174500_career_vault` creates the Vault table, ownership foreign key, optional source-resume link, indexes, and import deduplication constraint.
