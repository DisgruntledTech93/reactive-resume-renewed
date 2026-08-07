import type { RoleItem } from "@reactive-resume/schema/resume/data";
import type { VaultItemContent, VaultItemType } from "@reactive-resume/schema/vault/data";
import { generateId } from "@reactive-resume/utils/string";

const website = () => ({ url: "", label: "", inlineLink: false });

export function createEmptyVaultContent(type: VaultItemType): VaultItemContent {
	switch (type) {
		case "summary":
			return { id: generateId(), hidden: false, content: "" };
		case "profiles":
			return { id: generateId(), hidden: false, icon: "link", iconColor: "", network: "", username: "", website: website() };
		case "experience":
			return {
				id: generateId(),
				hidden: false,
				company: "",
				position: "",
				location: "",
				period: "",
				website: website(),
				description: "",
				roles: [] as RoleItem[],
			};
		case "education":
			return {
				id: generateId(),
				hidden: false,
				school: "",
				degree: "",
				area: "",
				grade: "",
				location: "",
				period: "",
				website: website(),
				description: "",
			};
		case "projects":
			return { id: generateId(), hidden: false, name: "", period: "", website: website(), description: "" };
		case "skills":
			return {
				id: generateId(),
				hidden: false,
				icon: "acorn",
				iconColor: "",
				name: "",
				proficiency: "",
				level: 0,
				keywords: [],
			};
		case "languages":
			return { id: generateId(), hidden: false, language: "", fluency: "", level: 0 };
		case "interests":
			return { id: generateId(), hidden: false, icon: "heart", iconColor: "", name: "", keywords: [] };
		case "awards":
			return { id: generateId(), hidden: false, title: "", awarder: "", date: "", website: website(), description: "" };
		case "certifications":
			return { id: generateId(), hidden: false, title: "", issuer: "", date: "", website: website(), description: "" };
		case "publications":
			return { id: generateId(), hidden: false, title: "", publisher: "", date: "", website: website(), description: "" };
		case "volunteer":
			return {
				id: generateId(),
				hidden: false,
				organization: "",
				location: "",
				period: "",
				website: website(),
				description: "",
			};
		case "references":
			return { id: generateId(), hidden: false, name: "", position: "", website: website(), phone: "", description: "" };
	}
}

export function getVaultContentLabel(type: VaultItemType, content: VaultItemContent) {
	const item = content as Record<string, unknown>;
	const candidates: Record<VaultItemType, string[]> = {
		summary: ["content"],
		profiles: ["network", "username"],
		experience: ["company", "position"],
		education: ["school", "degree"],
		projects: ["name"],
		skills: ["name"],
		languages: ["language"],
		interests: ["name"],
		awards: ["title", "awarder"],
		certifications: ["title", "issuer"],
		publications: ["title", "publisher"],
		volunteer: ["organization"],
		references: ["name", "position"],
	};
	for (const key of candidates[type]) {
		const value = item[key];
		if (typeof value === "string" && value.trim()) return stripHtml(value).slice(0, 160);
	}
	return type === "summary" ? "Professional Summary" : "Untitled Vault Item";
}

export function stripHtml(value: string) {
	return value
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/\s+/g, " ")
		.trim();
}

export function getVaultContentPreview(content: VaultItemContent) {
	const item = content as Record<string, unknown>;
	const value =
		(typeof item.description === "string" && item.description) ||
		(typeof item.content === "string" && item.content) ||
		(typeof item.proficiency === "string" && item.proficiency) ||
		(typeof item.period === "string" && item.period) ||
		(typeof item.username === "string" && item.username) ||
		"";
	return stripHtml(value).slice(0, 220);
}
