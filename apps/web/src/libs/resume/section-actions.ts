import type { ResumeData, SectionType } from "@reactive-resume/schema/resume/data";

export function createSectionItem(
	data: ResumeData,
	type: SectionType,
	content: Record<string, unknown>,
	customSectionId?: string,
): boolean {
	const section = customSectionId
		? data.customSections.find((candidate) => candidate.id === customSectionId)
		: data.sections[type];

	if (!section || !Array.isArray(section.items)) return false;

	(section.items as Record<string, unknown>[]).push(content);
	return true;
}
