import type { VaultItemType } from "@reactive-resume/schema/vault/data";
import type { VaultMatch } from "./types";
import { ArrowLeftIcon, SparkleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { Checkbox } from "@reactive-resume/ui/components/checkbox";
import { Input } from "@reactive-resume/ui/components/input";
import { Label } from "@reactive-resume/ui/components/label";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@reactive-resume/ui/components/sheet";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { Combobox } from "@/components/ui/combobox";
import { orpc } from "@/libs/orpc/client";
import { VAULT_TYPE_LABELS } from "./constants";
import { getVaultContentPreview } from "./utils";

const TYPE_LIMITS: Record<VaultItemType, number> = {
	summary: 1,
	profiles: 4,
	experience: 5,
	education: 3,
	projects: 4,
	skills: 15,
	languages: 4,
	interests: 4,
	awards: 5,
	certifications: 6,
	publications: 5,
	volunteer: 4,
	references: 3,
};

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

function suggestedIds(matches: VaultMatch[]) {
	const counts = new Map<VaultItemType, number>();
	const selected: string[] = [];
	for (const match of matches) {
		const count = counts.get(match.item.type) ?? 0;
		if (count >= TYPE_LIMITS[match.item.type]) continue;
		if (match.score < 5 && match.item.type !== "education" && match.item.type !== "certifications") continue;
		counts.set(match.item.type, count + 1);
		selected.push(match.item.id);
	}
	return selected;
}

export function TargetedResumeSheet({ open, onOpenChange }: Props) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [baseResumeId, setBaseResumeId] = useState("");
	const [jobDescription, setJobDescription] = useState("");
	const [matches, setMatches] = useState<VaultMatch[]>([]);
	const [selected, setSelected] = useState<string[]>([]);
	const [step, setStep] = useState<"setup" | "select">("setup");
	const { data: resumes } = useQuery(orpc.resume.list.queryOptions());
	const resumeOptions = (resumes ?? []).map((resume) => ({ value: resume.id, label: resume.name }));

	const reset = () => {
		setName("");
		setBaseResumeId("");
		setJobDescription("");
		setStep("setup");
		setMatches([]);
		setSelected([]);
	};

	const close = () => {
		reset();
		onOpenChange(false);
	};

	const match = useMutation(
		orpc.vault.match.mutationOptions({
			onSuccess: (result) => {
				setMatches(result);
				setSelected(suggestedIds(result));
				setStep("select");
			},
			onError: (error) => toast.error(error.message || `Couldn't analyze this job description.`),
		}),
	);
	const create = useMutation(
		orpc.vault.createResume.mutationOptions({
			onSuccess: (result) => {
				void queryClient.invalidateQueries({ queryKey: orpc.resume.list.queryKey() });
				toast.success(`Created "${result.name}" from your Career Vault.`);
				close();
				void navigate({ to: "/builder/$resumeId", params: { resumeId: result.id } });
			},
			onError: (error) => toast.error(error.message || `Couldn't create the targeted resume.`),
		}),
	);

	const grouped = useMemo(() => {
		const groups = new Map<VaultItemType, VaultMatch[]>();
		for (const result of matches) {
			const current = groups.get(result.item.type) ?? [];
			current.push(result);
			groups.set(result.item.type, current);
		}
		return [...groups.entries()];
	}, [matches]);

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (next) onOpenChange(true);
				else close();
			}}
		>
			<SheetContent side="right" className="w-full gap-0 data-[side=right]:sm:max-w-2xl">
				<SheetHeader>
					<SheetTitle className="flex items-center gap-2">
						{step === "select" && (
							<Button size="icon" variant="ghost" onClick={() => setStep("setup")} aria-label={`Back`}>
								<ArrowLeftIcon />
							</Button>
						)}
						{"Build a Targeted Resume"}
					</SheetTitle>
					<SheetDescription>
						{step === "setup" ? (
							"Match a job posting against your Vault, then choose the exact blocks to include."
						) : (
							"Review the recommended blocks. The new resume receives independent copies you can tailor further."
						)}
					</SheetDescription>
				</SheetHeader>

				{step === "setup" ? (
					<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
						<div className="space-y-1.5">
							<Label>{"Resume Name"}</Label>
							<Input value={name} placeholder={`Example: WordPress Accessibility Specialist`} onChange={(event) => setName(event.target.value)} />
						</div>
						<div className="space-y-1.5">
							<Label>{"Base Resume / Template"}</Label>
							<Combobox
								className="w-full"
								showClear
								value={baseResumeId}
								options={resumeOptions}
								placeholder={`Optional: preserve a resume's design and contact details`}
								onValueChange={(value) => setBaseResumeId(value ?? "")}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>{"Job Description"}</Label>
							<Textarea
								className="min-h-72"
								value={jobDescription}
								placeholder={`Paste the full job listing here...`}
								onChange={(event) => setJobDescription(event.target.value)}
							/>
						</div>
					</div>
				) : (
					<div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
						<div className="rounded-xl border bg-muted/30 p-3 text-sm">
							<strong>{selected.length}</strong> {"blocks selected from"} <strong>{matches.length}</strong> {"matches."}
						</div>
						{grouped.map(([type, results]) => (
							<section key={type} className="space-y-2">
								<div className="flex items-center justify-between">
									<h3 className="font-medium text-sm">{VAULT_TYPE_LABELS[type]}</h3>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => {
											const ids = results.map((result) => result.item.id);
											const allSelected = ids.every((id) => selected.includes(id));
											setSelected((previous) =>
												allSelected ? previous.filter((id) => !ids.includes(id)) : [...new Set([...previous, ...ids])],
											);
										}}
									>
										{results.every((result) => selected.includes(result.item.id)) ? "Clear" : "Select all"}
									</Button>
								</div>
								{results.map((result) => {
									const toggleResult = () =>
										setSelected((previous) =>
											previous.includes(result.item.id)
												? previous.filter((id) => id !== result.item.id)
												: [...previous, result.item.id],
										);
									return (
										<div key={result.item.id} className="flex w-full items-start gap-3 rounded-xl border p-3 hover:bg-muted/40">
											<Checkbox
												checked={selected.includes(result.item.id)}
												onCheckedChange={toggleResult}
												aria-label={`Select ${result.item.label}`}
											/>
											<button type="button" className="min-w-0 flex-1 text-left" onClick={toggleResult}>
												<div className="min-w-0">
													<div className="flex items-start justify-between gap-3">
														<p className="font-medium text-sm">{result.item.label}</p>
														<Badge variant={result.score >= 40 ? "default" : "outline"}>{result.score}%</Badge>
													</div>
													{getVaultContentPreview(result.item.content) && (
														<p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
															{getVaultContentPreview(result.item.content)}
														</p>
													)}
													{result.matchedKeywords.length > 0 && (
														<p className="mt-2 text-muted-foreground text-xs">
															{"Matched:"} {result.matchedKeywords.slice(0, 8).join(" · ")}
														</p>
													)}
												</div>
											</button>
										</div>
									);
								})}
							</section>
						))}
					</div>
				)}

				<SheetFooter>
					<Button variant="ghost" onClick={close}>{"Cancel"}</Button>
					{step === "setup" ? (
						<Button
							disabled={!name.trim() || jobDescription.trim().length < 20 || match.isPending}
							onClick={() => match.mutate({ jobDescription: jobDescription.trim(), limit: 200 })}
						>
							<SparkleIcon />
							{match.isPending ? "Analyzing…" : "Match My Vault"}
						</Button>
					) : (
						<Button
							disabled={selected.length === 0 || create.isPending}
							onClick={() => create.mutate({ name: name.trim(), baseResumeId: baseResumeId || null, itemIds: selected, tags: ["targeted"] })}
						>
							{`Create Resume (${selected.length}blocks)`}
						</Button>
					)}
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
