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
	it("keeps complex resume headings and mixed credentials organized", () => {
		const items = plainTextToCandidates(`
PROFESSIONAL SUMMARY
Operations engineer focused on reliable systems.

CORE COMPETENCIES
Linux, Docker, WordPress, accessibility

TARGET ROLE ALIGNMENT
• This paragraph is tailored to one specific job and should not become a reusable Vault block.

RELEVANT PROFESSIONAL EXPERIENCE
Application Support Specialist
Nov 2022 - Present
State Agency | Jefferson City, MO
• Restored service and documented repeatable fixes.

LEADERSHIP, FIELD SERVICE & EARLIER EXPERIENCE
Owner / Operator
Jan 2020 - Oct 2022
Example Services | Waynesville, MO
• Managed field operations and customer support.

CERTIFICATIONS, TRAINING & EDUCATION
• AWS Certified Solutions Architect preparation - LinkedIn Learning course in progress, 2026.
• B.S. Artificial Intelligence Engineering - Western Governors University, in progress.
• Security+ - CERT12345, active through Dec 2025; Certified Ethical Hacker - ECC12345, active through Dec 2025.
• Six Sigma Yellow Belt and Green Belt; Managing Virtual Teams; PHP Certificate.

TECHNICAL TOOLS & KEYWORDS
PostgreSQL, Redis, Node.js, Nginx, Splunk
		`);

		const experiences = items.filter((item) => item.type === "experience");
		expect(experiences).toHaveLength(2);
		expect(experiences[0]).toMatchObject({
			type: "experience",
			content: expect.objectContaining({
				company: "State Agency",
				position: "Application Support Specialist",
				location: "Jefferson City, MO",
			}),
		});
		expect(items.some((item) => item.type === "education")).toBe(true);
		expect(items.filter((item) => item.type === "certifications").length).toBeGreaterThanOrEqual(4);

		const skills = items.filter((item) => item.type === "skills");
		expect(skills).toHaveLength(1);
		expect(skills[0]?.content).toEqual(
			expect.objectContaining({
				keywords: expect.arrayContaining(["Linux", "Docker", "PostgreSQL", "Redis", "Node.js"]),
			}),
		);

		expect(items.some((item) => item.label.includes("TARGET ROLE ALIGNMENT"))).toBe(false);
		expect(
			items
				.filter((item) => item.type === "certifications")
				.some((item) => item.label.includes("PostgreSQL") || item.label.includes("TECHNICAL TOOLS")),
		).toBe(false);
	});

});
