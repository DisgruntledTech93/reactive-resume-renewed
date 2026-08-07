import type { VaultItemType } from "@reactive-resume/schema/vault/data";

export const VAULT_TYPE_LABELS: Record<VaultItemType, string> = {
	summary: "Summaries",
	profiles: "Profiles",
	experience: "Work Experience",
	education: "Education",
	projects: "Projects",
	skills: "Skills",
	languages: "Languages",
	interests: "Interests",
	awards: "Awards",
	certifications: "Certifications",
	publications: "Publications",
	volunteer: "Volunteer Work",
	references: "References",
};

export const VAULT_TYPE_OPTIONS = Object.entries(VAULT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
