import type { ResumeData, SectionType } from "@reactive-resume/schema/resume/data";
import type {
	VaultImportCandidate,
	VaultImportFileType,
	VaultItemContent,
	VaultItemType,
} from "@reactive-resume/schema/vault/data";
import { inflateRawSync } from "node:zlib";
import { parseReactiveResumeJSON } from "@reactive-resume/import/reactive-resume-json";
import { parseVaultItemContent, vaultItemTypeSchema } from "@reactive-resume/schema/vault/data";
import { generateId } from "@reactive-resume/utils/string";
import { extractDeterministicKeywords, isTechnologyKeyword } from "./intelligence";

type DraftCandidate = Omit<VaultImportCandidate, "fingerprint" | "duplicateOfId">;

const sectionTypes = vaultItemTypeSchema.options.filter((type): type is SectionType => type !== "summary");
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toHtml(lines: string[]): string {
	const cleaned = lines.map((line) => line.trim()).filter(Boolean);
	if (cleaned.length === 0) return "";
	const bullets = cleaned.filter((line) => /^[-*•▪◦]/.test(line));
	if (bullets.length >= Math.ceil(cleaned.length / 2)) {
		return `<ul>${cleaned.map((line) => `<li>${escapeHtml(line.replace(/^[-*•▪◦]\s*/, ""))}</li>`).join("")}</ul>`;
	}
	return cleaned.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

function inferMetadata(text: string) {
	const keywords = extractDeterministicKeywords(text);
	const technologies = keywords.filter(isTechnologyKeyword);
	const normalized = text.toLowerCase();
	const industries = [
		[/government|public sector|municipal|federal|state agency/, "Government"],
		[/healthcare|medical|patient|clinical/, "Healthcare"],
		[/financial|banking|fintech|insurance/, "Financial Services"],
		[/retail|e-?commerce|shopify/, "Retail and E-commerce"],
		[/education|university|school|student/, "Education"],
		[/manufactur|industrial/, "Manufacturing"],
	] as const;
	const targetRoles = [
		[/devops|docker|kubernetes|terraform|ci\/cd|linux/, "DevOps Engineer"],
		[/software|javascript|typescript|react|python|java|api/, "Software Engineer"],
		[/security|cyber|incident response/, "Security Engineer"],
		[/project management|stakeholder|scrum|agile/, "Project Manager"],
		[/accessibility|wcag/, "Accessibility Specialist"],
		[/support|troubleshooting|customer service/, "Technical Support Specialist"],
	] as const;
	return {
		keywords,
		technologies,
		industries: industries.filter(([pattern]) => pattern.test(normalized)).map(([, label]) => label),
		targetRoles: targetRoles.filter(([pattern]) => pattern.test(normalized)).map(([, label]) => label),
		importance: 3,
	};
}

function candidate(type: VaultItemType, label: string, content: VaultItemContent): DraftCandidate {
	const text = `${label} ${JSON.stringify(content)}`;
	return {
		id: generateId(),
		type,
		label: label.slice(0, 160) || "Imported Vault Item",
		content: parseVaultItemContent(type, content),
		...inferMetadata(text),
	};
}

export function resumeDataToCandidates(data: ResumeData): DraftCandidate[] {
	const candidates: DraftCandidate[] = [];
	if (data.summary.content.trim()) {
		candidates.push(
			candidate("summary", "Professional Summary", { id: generateId(), hidden: false, content: data.summary.content }),
		);
	}
	for (const type of sectionTypes) {
		for (const item of data.sections[type].items) {
			const content = parseVaultItemContent(type, item);
			candidates.push(candidate(type, getCandidateLabel(type, content), content));
		}
	}
	for (const section of data.customSections) {
		if (section.type === "cover-letter") continue;
		for (const item of section.items) {
			const content = parseVaultItemContent(section.type, item);
			candidates.push(candidate(section.type, getCandidateLabel(section.type, content), content));
		}
	}
	return candidates;
}

function getCandidateLabel(type: VaultItemType, content: VaultItemContent): string {
	const item = content as Record<string, unknown>;
	const fields: Record<VaultItemType, string[]> = {
		summary: ["content"],
		profiles: ["network", "username"],
		experience: ["position", "company"],
		education: ["degree", "school"],
		projects: ["name"],
		skills: ["name"],
		languages: ["language"],
		interests: ["name"],
		awards: ["title"],
		certifications: ["title"],
		publications: ["title"],
		volunteer: ["organization"],
		references: ["name"],
	};
	return (
		fields[type]
			.map((field) => item[field])
			.find((value): value is string => typeof value === "string" && !!value.trim()) ?? "Imported Item"
	);
}

function assertRange(buffer: Buffer, offset: number, length: number) {
	if (offset < 0 || length < 0 || offset + length > buffer.length) throw new Error("Invalid DOCX archive.");
}

function extractDocxText(data: Uint8Array): string {
	const buffer = Buffer.from(data);
	const minimum = Math.max(0, buffer.length - 0xffff - 22);
	let endOffset = -1;
	for (let offset = buffer.length - 22; offset >= minimum; offset--) {
		if (buffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
			endOffset = offset;
			break;
		}
	}
	if (endOffset < 0) throw new Error("Invalid DOCX archive.");
	assertRange(buffer, endOffset, 22);
	const directorySize = buffer.readUInt32LE(endOffset + 12);
	const directoryOffset = buffer.readUInt32LE(endOffset + 16);
	assertRange(buffer, directoryOffset, directorySize);
	let offset = directoryOffset;
	while (offset < directoryOffset + directorySize) {
		assertRange(buffer, offset, 46);
		if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) throw new Error("Invalid DOCX archive.");
		const method = buffer.readUInt16LE(offset + 10);
		const compressedSize = buffer.readUInt32LE(offset + 20);
		const nameLength = buffer.readUInt16LE(offset + 28);
		const extraLength = buffer.readUInt16LE(offset + 30);
		const commentLength = buffer.readUInt16LE(offset + 32);
		const localOffset = buffer.readUInt32LE(offset + 42);
		const nameOffset = offset + 46;
		assertRange(buffer, nameOffset, nameLength);
		const name = buffer.toString("utf8", nameOffset, nameOffset + nameLength);
		if (name === "word/document.xml") {
			assertRange(buffer, localOffset, 30);
			if (buffer.readUInt32LE(localOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE)
				throw new Error("Invalid DOCX archive.");
			const localNameLength = buffer.readUInt16LE(localOffset + 26);
			const localExtraLength = buffer.readUInt16LE(localOffset + 28);
			const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
			assertRange(buffer, dataOffset, compressedSize);
			const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
			const xml = (method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null)?.toString("utf8");
			if (!xml) throw new Error("Unsupported DOCX compression.");
			return xml
				.replace(/<w:tab\b[^>]*\/>/g, "\t")
				.replace(/<w:br\b[^>]*\/>/g, "\n")
				.replace(/<\/w:p>/g, "\n")
				.replace(/<[^>]+>/g, "")
				.replace(/&amp;/g, "&")
				.replace(/&lt;/g, "<")
				.replace(/&gt;/g, ">")
				.replace(/&quot;/g, '"')
				.replace(/&apos;/g, "'")
				.replace(/\n{3,}/g, "\n\n")
				.trim();
		}
		offset = nameOffset + nameLength + extraLength + commentLength;
	}
	throw new Error("DOCX document content not found.");
}

async function extractPdfText(data: Uint8Array): Promise<string> {
	const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
	const pdf = await getDocument({ data: new Uint8Array(data) }).promise;
	const pages: string[] = [];
	for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
		const page = await pdf.getPage(pageNumber);
		const content = await page.getTextContent();
		pages.push(
			content.items
				.map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : ""))
				.join("")
				.trim(),
		);
	}
	return pages.join("\n\n").trim();
}

const HEADINGS: Array<[RegExp, VaultItemType]> = [
	[/^(professional\s+)?summary|profile|objective$/i, "summary"],
	[/^(work\s+)?experience|employment(\s+history)?|professional\s+experience$/i, "experience"],
	[/^education|academic(\s+background)?$/i, "education"],
	[/^projects?|selected\s+projects$/i, "projects"],
	[/^(technical\s+)?skills|competencies|technologies$/i, "skills"],
	[/^certifications?|licenses?(\s+and\s+certifications)?$/i, "certifications"],
];

function splitSections(text: string): Map<VaultItemType, string[]> {
	const sections = new Map<VaultItemType, string[]>();
	let current: VaultItemType = "summary";
	for (const rawLine of text.replace(/\r/g, "").split("\n")) {
		const line = rawLine.trim();
		const heading = HEADINGS.find(([pattern]) => pattern.test(line.replace(/:$/, "")));
		if (heading) {
			current = heading[1];
			continue;
		}
		const values = sections.get(current) ?? [];
		values.push(line);
		sections.set(current, values);
	}
	return sections;
}

function structuredBlocks(lines: string[]): string[][] {
	const joined = lines.join("\n").trim();
	if (!joined) return [];
	const blankBlocks = joined.split(/\n\s*\n+/).map((block) => block.split("\n").filter(Boolean));
	if (blankBlocks.length > 1) return blankBlocks.filter((block) => block.length > 0);
	const blocks: string[][] = [];
	let current: string[] = [];
	for (const line of lines.filter(Boolean)) {
		if (/\b(19|20)\d{2}\b.*\b(19|20)\d{2}|\bpresent\b/i.test(line) && current.length >= 2) {
			blocks.push(current);
			current = [];
		}
		current.push(line);
	}
	if (current.length > 0) blocks.push(current);
	return blocks;
}

export function plainTextToCandidates(text: string): DraftCandidate[] {
	const sections = splitSections(text);
	const candidates: DraftCandidate[] = [];
	const summary = (sections.get("summary") ?? []).filter(Boolean);
	if (summary.length > 0) {
		candidates.push(
			candidate("summary", "Professional Summary", { id: generateId(), hidden: false, content: toHtml(summary) }),
		);
	}
	for (const block of structuredBlocks(sections.get("experience") ?? [])) {
		const periodIndex = block.findIndex((line) => /\b(19|20)\d{2}\b|\bpresent\b/i.test(line));
		const first = block[0] ?? "Imported Experience";
		const second = block[1] ?? "";
		const company = first.includes("|") ? first.split("|").at(-1)?.trim() || first : first;
		const position = first.includes("|") ? first.split("|")[0]?.trim() || "" : second;
		const descriptionLines = block.filter((_, index) => index > 1 && index !== periodIndex);
		candidates.push(
			candidate("experience", `${position || company}${position && company ? ` at ${company}` : ""}`, {
				id: generateId(),
				hidden: false,
				company,
				position,
				location: "",
				period: periodIndex >= 0 ? (block[periodIndex] ?? "") : "",
				website: { url: "", label: "", inlineLink: false },
				description: toHtml(descriptionLines),
				roles: [],
			}),
		);
	}
	for (const block of structuredBlocks(sections.get("education") ?? [])) {
		candidates.push(
			candidate("education", block[1] || block[0] || "Education", {
				id: generateId(),
				hidden: false,
				school: block[0] || "Imported Institution",
				degree: block[1] || "",
				area: "",
				grade: "",
				location: "",
				period: block.find((line) => /\b(19|20)\d{2}\b/.test(line)) ?? "",
				website: { url: "", label: "", inlineLink: false },
				description: toHtml(block.slice(2)),
			}),
		);
	}
	for (const block of structuredBlocks(sections.get("projects") ?? [])) {
		candidates.push(
			candidate("projects", block[0] || "Imported Project", {
				id: generateId(),
				hidden: false,
				name: block[0] || "Imported Project",
				period: block.find((line) => /\b(19|20)\d{2}\b/.test(line)) ?? "",
				website: { url: "", label: "", inlineLink: false },
				description: toHtml(block.slice(1)),
			}),
		);
	}
	const skillLines = (sections.get("skills") ?? []).filter(Boolean);
	if (skillLines.length > 0) {
		const keywords = skillLines
			.flatMap((line) => line.replace(/^[-*•▪◦]\s*/, "").split(/[,;|]/))
			.map((value) => value.trim())
			.filter(Boolean);
		candidates.push(
			candidate("skills", "Imported Skills", {
				id: generateId(),
				hidden: false,
				icon: "",
				iconColor: "",
				name: "Core Skills",
				proficiency: "",
				level: 0,
				keywords: [...new Set(keywords)].slice(0, 100),
			}),
		);
	}
	for (const line of (sections.get("certifications") ?? []).filter(Boolean)) {
		candidates.push(
			candidate("certifications", line.replace(/^[-*•▪◦]\s*/, ""), {
				id: generateId(),
				hidden: false,
				title: line.replace(/^[-*•▪◦]\s*/, ""),
				issuer: "",
				date: "",
				website: { url: "", label: "", inlineLink: false },
				description: "",
			}),
		);
	}
	if (candidates.length === 0 && text.trim()) {
		candidates.push(
			candidate("summary", "Imported Resume Content", {
				id: generateId(),
				hidden: false,
				content: toHtml(text.split("\n")),
			}),
		);
	}
	return candidates;
}

export function detectImportFileType(name: string, contentType: string, bytes: Uint8Array): VaultImportFileType {
	const lower = name.toLowerCase();
	if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
	if (bytes[0] === 0x50 && bytes[1] === 0x4b && lower.endsWith(".docx")) return "docx";
	if (contentType === "application/json" || lower.endsWith(".json")) return "reactive-resume-json";
	if (contentType === "text/plain" || lower.endsWith(".txt")) return "txt";
	if (lower.endsWith(".pdf")) return "pdf";
	if (lower.endsWith(".docx")) return "docx";
	throw new Error("Unsupported resume format. Use Reactive Resume JSON, PDF, DOCX, or TXT.");
}

export async function parseImportDocument(input: {
	name: string;
	contentType: string;
	data: Uint8Array;
}): Promise<{ fileType: VaultImportFileType; candidates: DraftCandidate[] }> {
	const fileType = detectImportFileType(input.name, input.contentType, input.data);
	if (fileType === "reactive-resume-json") {
		return {
			fileType,
			candidates: resumeDataToCandidates(parseReactiveResumeJSON(new TextDecoder().decode(input.data))),
		};
	}
	const text =
		fileType === "pdf"
			? await extractPdfText(input.data)
			: fileType === "docx"
				? extractDocxText(input.data)
				: new TextDecoder().decode(input.data);
	if (!text.trim()) throw new Error("No readable resume text was found in this file.");
	return { fileType, candidates: plainTextToCandidates(text) };
}

export type { DraftCandidate };
