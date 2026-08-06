import { describe, expect, it } from "vitest";
import { parseVaultItemContent, vaultItemPayloadSchema, vaultItemTypeSchema } from "./data";

describe("Career Vault schemas", () => {
	it("supports every reusable resume section and excludes cover letters", () => {
		expect(vaultItemTypeSchema.options).toEqual([
			"summary",
			"profiles",
			"experience",
			"education",
			"projects",
			"skills",
			"languages",
			"interests",
			"awards",
			"certifications",
			"publications",
			"volunteer",
			"references",
		]);
		expect(vaultItemTypeSchema.safeParse("cover-letter").success).toBe(false);
	});

	it("accepts a valid experience block", () => {
		const result = vaultItemPayloadSchema.safeParse({
			type: "experience",
			content: {
				id: "experience-1",
				hidden: false,
				company: "Example Organization",
				position: "Developer",
				location: "Remote",
				period: "2024 – Present",
				website: { url: "", label: "", inlineLink: false },
				description: "<p>Built accessible applications.</p>",
				roles: [],
			},
		});
		expect(result.success).toBe(true);
	});

	it("validates content against the selected block type", () => {
		expect(() =>
			parseVaultItemContent("skills", {
				id: "wrong-shape",
				hidden: false,
				company: "Not a skill",
			}),
		).toThrow();
	});
});
