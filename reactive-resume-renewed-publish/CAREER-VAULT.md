# Career Vault and Career Intelligence

Reactive Resume Renewed v5.4 turns the Career Vault into a local-first career content and job-targeting system. The entire workflow below is deterministic and works without an AI provider or API key.

## Resume import

Open **Career Vault → Import Resume** and choose either a resume already in the app or a file:

- Reactive Resume JSON is parsed with the project's native schema.
- PDF text is extracted locally with PDF.js.
- DOCX text is extracted from the document's OOXML archive.
- TXT is read directly.

The importer detects summary, experience, education, project, skill, and certification blocks. It then shows a review screen where each block can be selected or omitted before saving. Exact content fingerprints identify existing duplicates and deselect them by default.

PDF and DOCX layout conventions vary. The deterministic parser intentionally favors reviewable, truthful blocks over invented structure; imported blocks remain editable.

## Vault metadata and history

Every Vault item can store:

- keywords and technologies;
- industries and target roles;
- an importance score from 1 to 5;
- source file, source resume, import batch, and source type;
- exact content fingerprint;
- immutable version-history entries.

Creating, editing, restoring, bulk-updating, or importing an item records a version. Restoring an earlier revision creates a new revision, so history is never rewritten.

## Application analysis

Save the job description on an Application, open its detail panel, and select **Analyze Job** in **Career Intelligence**.

The local engine:

1. normalizes common aliases such as AWS/Amazon Web Services, K8s/Kubernetes, and CI/CD terminology;
2. separates required, preferred, and general requirements;
3. compares those requirements with Vault content and explicit metadata;
4. calculates a weighted match percentage;
5. lists matched requirements and missing keywords;
6. ranks relevant Vault blocks with readable match reasons.

The analysis is persisted with the Application. Re-run it after changing the job description or Vault.

## Targeted resume snapshots

From an Application analysis, select recommended Vault blocks and optionally choose a base resume. The base resume contributes its contact details, picture, template, typography, colors, page settings, and layout. The selected Vault blocks replace its career sections.

The generated resume is independent and editable. A `resume_snapshot` record stores the exact Vault content and version number used, the base resume, the Application, and the analysis result. Later Vault edits do not silently change a submitted resume.

## Export

Use **Career Vault → Export Vault**:

- JSON contains complete portable Vault metadata and content.
- Markdown is a human-readable backup.
- DOCX and PDF render active Vault content through the project's existing document exporters.
- Choosing a base resume for DOCX/PDF preserves that design and contact data.

## Database migration

Migration `20260806234922_rapid_hydra` adds enriched Vault columns and the following tables:

- `vault_import`
- `vault_item_version`
- `application_analysis`
- `resume_snapshot`

The production server applies migrations automatically during startup. Existing v5.3 Vault items are preserved and receive an initial version-history record.
