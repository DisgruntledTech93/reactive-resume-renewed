# Reactive Resume Renewed Build Report

Release: `5.3.0-vault.1`

## Completed

- Added a user-scoped PostgreSQL Career Vault for summaries, profiles, work experience, education, projects, skills, languages, interests, awards, certifications, publications, volunteer work, and references.
- Added Vault create, read, update, archive, restore, duplicate, delete, tag, search, filter, bulk, import, job-match, and resume-creation APIs.
- Added a Career Vault dashboard with reusable block editing and private notes.
- Added resume import with source-aware refresh behavior to prevent duplicate imports.
- Added **Save to Career Vault** and **Add from Vault** controls to the resume builder.
- Added job-description matching and targeted resume assembly with optional base-resume design preservation.
- Updated application AI tailoring to select only real Vault blocks, create a new resume, and avoid mutating canonical Vault content.
- Added migration `20260806174500_career_vault` and a matching Drizzle snapshot.
- Added a GitHub Actions workflow that publishes an AMD64 image to `ghcr.io/disgruntledtech93/reactive-resume-renewed`.
- Added a CoreForge deployment script that backs up PostgreSQL and the Compose file before replacing only the application container.

## Validation performed

- Parsed every modified TypeScript and TSX file with TypeScript. No parser-level errors were found.
- Parsed all changed JSON and workflow YAML files.
- Validated the deployment script with `bash -n`.
- Verified that the new migration snapshot links to the previous migration and differs only by the 21 expected Vault schema entries.
- Verified API router, database schema export, dashboard navigation, and generated route-tree wiring.
- Scanned source files for merge-conflict markers and changed files for trailing whitespace.
- Tested the generated patch against a clean copy of the uploaded source with `git apply --check`.

## Environment limitation

A full `pnpm install`, monorepo typecheck, test run, and Docker build could not be executed in this sandbox because the uploaded archive did not include dependencies and outbound package-registry DNS is unavailable. The included GitHub Actions workflow performs the real Node 24 Docker build with the repository lockfile when the completed source is pushed to the fork.

## Deployment references

- Feature guide: `CAREER-VAULT.md`
- CoreForge deployment: `DEPLOY-COREFORGE.md`
- Automated deployment script: `deployment/coreforge/deploy.sh`
