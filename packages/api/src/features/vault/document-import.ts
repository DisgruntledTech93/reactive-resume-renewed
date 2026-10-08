import type { ResumeData, SectionType } from "@reactive-resume/schema/resume/data";
import type {
	VaultImportCandidate,
	VaultImportFileType,
	VaultItemContent,
	VaultItemType,
} from "@reactive-resume/schema/vault/data";
import { inflateRawSync } from "node:zlib";
import { parseResumeText } from "@reactive-resume/import/plain-text";
import { parseReactiveResumeJSON } from "@reactive-resume/import/reactive-resume-json";
import { parseVaultItemContent, vaultItemTypeSchema } from "@reactive-resume/schema/vault/data";
import { generateId } from "@reactive-resume/utils/string";
import { extractDeterministicKeywords, isTechnologyKeyword } from "./intelligence";

type DraftCandidate = Omit<VaultImportCandidate, "fingerprint" | "duplicateOfId">;

const sectionTypes = vaultItemTypeSchema.options.filter((type): type is SectionType => type !== "summary");
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

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


const BULLET_PREFIX = /^[-*•▪◦]\s*/;
const DEGREE_PATTERN =
	/\b(?:b\.?\s?s\.?|bachelor(?:'s)?|m\.?\s?s\.?|master(?:'s)?|ph\.?\s?d\.?|doctorate|associate(?:'s)?(?:\s+degree)?)\b/i;

function normalizeHeadingText(line: string) {
	return line
		.replace(/[:：]\s*$/, "")
		.replace(/&/g, " and ")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

function looksLikeResumeHeading(line: string) {
	const trimmed = line.trim().replace(/[:：]\s*$/, "");
	if (!trimmed || trimmed.length > 90 || /\d/.test(trimmed)) return false;
	const letters = trimmed.replace(/[^\p{L}]/gu, "");
	return letters.length >= 3 && letters === letters.toLocaleUpperCase() && letters !== letters.toLocaleLowerCase();
}

function isMixedCredentialsHeading(line: string) {
	const heading = normalizeHeadingText(line);
	return heading.includes("certification") && heading.includes("education");
}

function isTargetedAlignmentHeading(line: string) {
	const heading = normalizeHeadingText(line);
	return (
		heading.includes("role alignment") ||
		heading.includes("job alignment") ||
		heading.includes("position alignment") ||
		heading.includes("target role")
	);
}

function normalizeVaultHeadings(text: string) {
	const lines = text.replace(/\r\n?/g, "\n").split("\n");
	const output: string[] = [];
	let skippingTargeted = false;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		const heading = normalizeHeadingText(line);
		const resumeHeading = looksLikeResumeHeading(line);

		if (isTargetedAlignmentHeading(line)) {
			skippingTargeted = true;
			continue;
		}

		if (skippingTargeted) {
			if (!resumeHeading) continue;
			skippingTargeted = false;
		}

		if (
			heading === "relevant experience" ||
			heading === "relevant professional experience" ||
			heading === "leadership field service and earlier experience" ||
			heading === "earlier professional experience"
		) {
			output.push("EXPERIENCE");
			continue;
		}

		if (
			heading === "technical tools and keywords" ||
			heading === "technical tools" ||
			heading === "tools and technologies" ||
			heading === "technical competencies"
		) {
			output.push("SKILLS");
			continue;
		}

		output.push(rawLine);
	}

	return output.join("\n");
}

function collectCredentialParagraphs(lines: string[]) {
	const paragraphs: string[] = [];
	let current = "";

	const flush = () => {
		const value = current.trim();
		if (value) paragraphs.push(value);
		current = "";
	};

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) {
			flush();
			continue;
		}

		if (BULLET_PREFIX.test(line)) {
			flush();
			current = line.replace(BULLET_PREFIX, "").trim();
			continue;
		}

		current = current ? \`\${current} \${line}\` : line;
	}

	flush();
	return paragraphs.flatMap((paragraph) => paragraph.split(/\s*;\s*/).map((part) => part.trim()).filter(Boolean));
}

function extractMixedCredentialCandidates(text: string): { text: string; candidates: DraftCandidate[] } {
	const lines = text.replace(/\r\n?/g, "\n").split("\n");
	const output: string[] = [];
	const mixedLines: string[] = [];
	let inMixed = false;

	for (const rawLine of lines) {
		const line = rawLine.trim();

		if (!inMixed && isMixedCredentialsHeading(line)) {
			inMixed = true;
			continue;
		}

		if (inMixed && looksLikeResumeHeading(line)) {
			inMixed = false;
			output.push(rawLine);
			continue;
		}

		if (inMixed) mixedLines.push(rawLine);
		else output.push(rawLine);
	}

	const candidates: DraftCandidate[] = [];
	for (const paragraph of collectCredentialParagraphs(mixedLines)) {
		const cleaned = paragraph.replace(/\s+/g, " ").replace(/\.$/, "").trim();
		if (!cleaned) continue;

		if (DEGREE_PATTERN.test(cleaned) && /university|college|school/i.test(cleaned)) {
			const parts = cleaned.split(/\s+-\s+/);
			const degree = (parts.shift() ?? cleaned).trim();
			const school = parts
				.join(" - ")
				.replace(/,\s*(?:currently\s+)?in progress.*$/i, "")
				.trim();
			candidates.push(
				candidate("education", school ? \`\${degree} — \${school}\` : degree, {
					id: generateId(),
					hidden: false,
					school: school || "Imported Institution",
					degree,
					area: "",
					grade: "",
					location: "",
					period: /in progress/i.test(cleaned) ? "In progress" : "",
					website: { url: "", label: "", inlineLink: false },
					description: "",
				}),
			);
			continue;
		}

		const years = cleaned.match(/\b(?:19|20)\d{2}\b/g);
		const date = years?.at(-1) ?? "";
		const parts = cleaned.split(/\s+-\s+/);
		let title = cleaned
			.replace(/,\s*(?:active through|valid through|expires?|in progress).*$/i, "")
			.replace(/,\s*(?:19|20)\d{2}\.?$/i, "")
			.trim();
		let issuer = "";

		const lastPart = parts.at(-1) ?? "";
		if (parts.length > 1 && /university|college|school|learning|institute|academy/i.test(lastPart)) {
			title = parts.slice(0, -1).join(" - ").trim();
			issuer = lastPart
				.replace(/,\s*(?:19|20)\d{2}\.?$/i, "")
				.replace(/\s+course\s+in\s+progress.*$/i, "")
				.trim();
		} else if (parts.length > 1 && /^[A-Z0-9-]{6,}/.test(lastPart)) {
			title = parts.slice(0, -1).join(" - ").trim();
		}

		candidates.push(
			candidate("certifications", title || cleaned, {
				id: generateId(),
				hidden: false,
				title: title || cleaned,
				issuer,
				date,
				website: { url: "", label: "", inlineLink: false },
				description: cleaned === title ? "" : cleaned,
			}),
		);
	}

	return { text: output.join("\n"), candidates };
}

function repairImportedExperience(data: ResumeData) {
	for (const item of data.sections.experience.items) {
		if (item.position.trim() || !item.company.trim()) continue;

		const paragraph = /^<p>(.*?)<\/p>/.exec(item.description);
		if (!paragraph?.[1]) continue;

		const organizationLine = paragraph[1]
			.replace(/&amp;/gi, "&")
			.replace(/&nbsp;/gi, " ")
			.replace(/&#39;/gi, "'")
			.replace(/&quot;/gi, '"')
			.trim();
		if (!organizationLine || /[.!?]$/.test(organizationLine)) continue;

		const [organization = "", detail = ""] = organizationLine.split(/\s*\|\s*/, 2);
		if (!organization.trim()) continue;

		item.position = item.company;
		item.company = organization.trim();

		const possibleLocation = detail.trim();
		if (
			possibleLocation &&
			!/(university|college|school|training|client|platform)/i.test(possibleLocation) &&
			(possibleLocation.split(/\s+/).length <= 5 || /,\s*[A-Z]{2}\b/.test(possibleLocation))
		) {
			item.location = possibleLocation;
		}

		item.description = item.description.slice(paragraph[0].length);
	}
}

function collapseImportedSkills(items: DraftCandidate[]): DraftCandidate[] {
	const skillItems = items.filter((item) => item.type === "skills");
	if (skillItems.length <= 1) return items;

	const keywords = [
		...new Set(
			skillItems.flatMap((item) => {
				const content = item.content as { name?: string; keywords?: string[] };
				return [content.name ?? "", ...(content.keywords ?? [])].map((value) => value.trim()).filter(Boolean);
			}),
		),
	].slice(0, 100);

	const combined = candidate("skills", "Imported Skills", {
		id: generateId(),
		hidden: false,
		icon: "",
		iconColor: "",
		name: "Core Skills",
		proficiency: "",
		level: 0,
		keywords,
	});

	const firstSkillIndex = items.findIndex((item) => item.type === "skills");
	const withoutSkills = items.filter((item) => item.type !== "skills");
	withoutSkills.splice(Math.max(0, firstSkillIndex), 0, combined);
	return withoutSkills;
}

export function plainTextToCandidates(text: string): DraftCandidate[] {
	const mixed = extractMixedCredentialCandidates(text);
	const normalized = normalizeVaultHeadings(mixed.text);
	const data = parseResumeText(normalized);
	repairImportedExperience(data);

	const parsed = collapseImportedSkills(resumeDataToCandidates(data));
	const candidates = [...parsed, ...mixed.candidates];

	if (candidates.length === 0 && text.trim()) {
		return [
			candidate("summary", "Imported Resume Content", {
				id: generateId(),
				hidden: false,
				content: text.trim(),
			}),
		];
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
