import { describe, expect, it } from "vitest";
import { detectImportFileType, plainTextToCandidates } from "./document-import";

describe("Career Vault document import", () => {
	it("detects supported formats from content and filenames", () => {
		expect(
			detectImportFileType("resume.pdf", "application/octet-stream", new Uint8Array([0x25, 0x50, 0x44, 0x46])),
		).toBe("pdf");
		expect(
			detectImportFileType("resume.docx", "application/octet-stream", new Uint8Array([0x50, 0x4b, 0x03, 0x04])),
		).toBe("docx");
		expect(detectImportFileType("resume.txt", "text/plain", new Uint8Array())).toBe("txt");
	});

	it("creates reviewable blocks from conventional plain-text sections", () => {
		const items = plainTextToCandidates(`
SUMMARY
DevOps engineer focused on reliable automation.

EXPERIENCE
Platform Engineer | Example Co
2022 - Present
- Built Docker deployment automation on Linux.

SKILLS
Docker, Linux, Terraform, AWS

CERTIFICATIONS
AWS Certified Solutions Architect
		`);
		expect(items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "summary" }),
				expect.objectContaining({ type: "experience" }),
				expect.objectContaining({ type: "skills" }),
				expect.objectContaining({ type: "certifications" }),
			]),
		);
		const experience = items.find((item) => item.type === "experience");
		expect(experience?.technologies).toEqual(expect.arrayContaining(["Docker", "Linux"]));
	});
});
