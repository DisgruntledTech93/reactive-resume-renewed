import type { ResumeData, SectionType } from "@reactive-resume/schema/resume/data";

export function createSectionItem(
	data: ResumeData,
	type: SectionType,
	content: Record<string, unknown>,
	customSectionId?: string,
) {
	const section = customSectionId
		? data.customSections.find((candidate) => candidate.id === customSectionId)
		: (data as unknown as Record<string, unknown>)[type];

	if (!section || typeof section !== "object" || !("items" in section)) return;
	const items = (section as { items?: unknown }).items;
	if (!Array.isArray(items)) return;
	items.push(content);
}
