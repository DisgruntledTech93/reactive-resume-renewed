import { describe, expect, it } from "vitest";
import { analyzeJobDescription, extractJobRequirements, normalizeKeyword } from "./intelligence";

describe("deterministic Career Intelligence", () => {
	it("normalizes common technology aliases", () => {
		expect(normalizeKeyword("AWS")).toBe("amazon web services");
		expect(normalizeKeyword("K8s")).toBe("kubernetes");
		expect(normalizeKeyword("CI CD")).toBe("ci/cd");
	});

	it("extracts required and preferred requirements without an AI provider", () => {
		const requirements = extractJobRequirements("Requirements\n- Docker and Linux\nPreferred\n- Terraform and AWS");
		expect(requirements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ label: "Docker", priority: "required" }),
				expect.objectContaining({ label: "Terraform", priority: "preferred" }),
			]),
		);
	});

	it("scores the application and ranks matching Vault content", () => {
		const result = analyzeJobDescription("Required: Docker, Linux, Terraform and AWS automation.", [
			{
				id: "v1",
				label: "Container platform",
				type: "projects",
				version: 2,
				content: {
					id: "p1",
					hidden: false,
					name: "CoreForge",
					period: "2026",
					website: { url: "", label: "", inlineLink: false },
					description: "<p>Docker and Linux automation</p>",
				},
				keywords: ["automation"],
				technologies: ["Docker", "Linux"],
				industries: [],
				targetRoles: ["DevOps Engineer"],
				importance: 5,
				updatedAt: new Date("2026-01-01"),
			},
		]);
		expect(result.score).toBeGreaterThan(0);
		expect(result.recommendations[0]).toEqual(expect.objectContaining({ vaultItemId: "v1" }));
		expect(result.missingKeywords).toContain("Terraform");
	});
});
