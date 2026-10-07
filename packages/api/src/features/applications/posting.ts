import type { WebAccessContext } from "../web-access/contracts";
import { z } from "zod";
import { htmlToText } from "../web-access/builtin";
import { MAX_CONTENT_CHARS } from "../web-access/contracts";
import { readPage, searchWeb } from "../web-access/service";

export { htmlToText } from "../web-access/builtin";
export { WebAccessError as PostingFetchError } from "../web-access/contracts";

/** Matches the applications feature's cap on a saved posting. */
export const MAX_POSTING_CHARS = MAX_CONTENT_CHARS;

/** A lone http(s) link, as opposed to pasted posting text. */
export const isPostingLink = (input: string) => /^https?:\/\/\S+$/i.test(input.trim());

export async function fetchJobPosting(input: string, context: WebAccessContext) {
	const { content, html, ...source } = await readPage(input, context);
	const page = readJobPosting(html ?? "");
	const text = page?.description || content;
	const truncated = source.truncated || text.length > MAX_POSTING_CHARS;
	return {
		page,
		text: text.slice(0, MAX_POSTING_CHARS),
		source: {
			...source,
			...(page?.description ? { format: "text" as const } : {}),
			truncated,
			completeness: truncated ? ("incomplete" as const) : source.completeness,
		},
	};
}

export const postingSearchResult = z.object({
	url: z.string(),
	title: z.string().max(1_000),
	description: z.string().max(5_000).default(""),
});

/** Job-specific query intent belongs here, never in the generic retrieval service. */
export async function searchJobPostings(query: string, context: WebAccessContext) {
	return (await searchWeb(`${query} job posting`, context)).map(({ url, title, snippet }) => ({
		url,
		title,
		description: snippet ?? "",
	}));
}

export type PagePosting = {
	role: string;
	company: string;
	location: string;
	description: string;
};

const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function decodeJavaScriptStringLiteral(value: string) {
	let output = "";
	for (let index = 0; index < value.length; index++) {
		const character = value[index];
		if (character !== "\\" || index + 1 >= value.length) {
			output += character;
			continue;
		}
		const next = value[++index];
		if (next === "x") {
			const hexadecimal = value.slice(index + 1, index + 3);
			if (/^[0-9a-fA-F]{2}$/.test(hexadecimal)) {
				output += String.fromCharCode(Number.parseInt(hexadecimal, 16));
				index += 2;
				continue;
			}
			output += "\\x";
			continue;
		}
		if (next === "u") {
			const hexadecimal = value.slice(index + 1, index + 5);
			if (/^[0-9a-fA-F]{4}$/.test(hexadecimal)) {
				output += String.fromCharCode(Number.parseInt(hexadecimal, 16));
				index += 4;
				continue;
			}
			output += "\\u";
			continue;
		}
		switch (next) {
			case "n": output += "\n"; break;
			case "r": output += "\r"; break;
			case "t": output += "\t"; break;
			case "b": output += "\b"; break;
			case "f": output += "\f"; break;
			case "v": output += "\v"; break;
			case "\n": break;
			case "\r":
				if (value[index + 1] === "\n") index++;
				break;
			default: output += next;
		}
	}
	return output;
}

function cleanEmbeddedJobHtml(html: string) {
	return htmlToText(
		html
			.replace(/<\s*br\s*\/?>/gi, "\n")
			.replace(/<\/(?:p|li|ul|ol|div|section|article|h[1-6])>/gi, "\n"),
	)
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function readZohoJobPosting(html: string): PagePosting | null {
	const jobsMatch = html.match(/\bvar\s+jobs\s*=\s*JSON\.parse\('((?:\\[\s\S]|[^'\\])*)'\);/i);
	const encodedJobs = jobsMatch?.[1];
	if (!encodedJobs) return null;

	try {
		const parsed = JSON.parse(decodeJavaScriptStringLiteral(encodedJobs)) as unknown;
		if (!Array.isArray(parsed)) return null;
		const job = parsed.find((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
		if (!job) return null;

		const stringValue = (key: string) => {
			const value = job[key];
			return typeof value === "string" ? value.trim() : "";
		};
		const role = stringValue("Posting_Title") || stringValue("Job_Opening_Name");
		const location = [stringValue("City"), stringValue("State"), stringValue("Country")].filter(Boolean).join(", ");
		const salary = stringValue("Salary");
		const jobType = stringValue("Job_Type");
		const experience = stringValue("Work_Experience");
		const description = stringValue("Job_Description");
		const remote = job.Remote_Job === true ? "Remote: Yes" : job.Remote_Job === false ? "Remote: No" : "";
		const pageTitleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
		const pageTitle = pageTitleMatch?.[1] ? htmlToText(pageTitleMatch[1]) : "";

		const details = [
			pageTitle ? `Page title: ${pageTitle}` : "",
			salary ? `Salary: ${salary}` : "",
			remote,
			location ? `Location: ${location}` : "",
			jobType ? `Job type: ${jobType}` : "",
			experience ? `Experience: ${experience}` : "",
			description ? cleanEmbeddedJobHtml(description) : "",
		]
			.filter(Boolean)
			.join("\n\n")
			.trim();

		return { role, company: "", location, description: details };
	} catch {
		return null;
	}
}


function readLocation(value: unknown): string {
	const place = (Array.isArray(value) ? value[0] : value) as { address?: Record<string, unknown> } | undefined;
	const address = place?.address;
	if (!address || typeof address !== "object") return "";
	return [address.addressLocality, address.addressRegion, address.addressCountry]
		.map((part) => (typeof part === "object" && part ? asText((part as { name?: unknown }).name) : asText(part)))
		.filter(Boolean)
		.join(", ");
}

/**
 * The JobPosting a page describes in its JSON-LD (most job boards publish one), read without any AI: title,
 * hiring organisation, location and the description as text.
 */
export function readJobPosting(html: string): PagePosting | null {
	const zoho = readZohoJobPosting(html);
	if (zoho) return zoho;

	for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
		let json: unknown;
		try {
			json = JSON.parse(match[1] ?? "");
		} catch {
			continue;
		}

		const graph = (json as { "@graph"?: unknown } | null)?.["@graph"];
		const candidates = [json, ...(Array.isArray(json) ? json : []), ...(Array.isArray(graph) ? graph : [])];
		const posting = candidates.find((item) => {
			const type = (item as { "@type"?: unknown } | null)?.["@type"];
			return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
		}) as Record<string, unknown> | undefined;
		if (!posting) continue;

		const organization = posting.hiringOrganization as { name?: unknown } | string | undefined;
		return {
			role: asText(posting.title),
			company: typeof organization === "string" ? organization.trim() : asText(organization?.name),
			location: readLocation(posting.jobLocation),
			description: htmlToText(asText(posting.description)),
		};
	}

	return null;
}
