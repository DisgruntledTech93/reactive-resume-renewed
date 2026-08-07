import type { Application } from "../types";
import { CheckCircleIcon, MagnifyingGlassIcon, TargetIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { Checkbox } from "@reactive-resume/ui/components/checkbox";
import { Input } from "@reactive-resume/ui/components/input";
import { Label } from "@reactive-resume/ui/components/label";
import { Combobox } from "@/components/ui/combobox";
import { orpc } from "@/libs/orpc/client";
import { applicationsListQueryKey } from "../queries";

type Props = { application: Application };

export function ApplicationIntelligence({ application }: Props) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [syncedFingerprint, setSyncedFingerprint] = useState("");
	const [baseResumeId, setBaseResumeId] = useState(application.resumeId ?? "");
	const [name, setName] = useState(`${application.role} at ${application.company}`.slice(0, 100));
	const { data: resumes } = useQuery(orpc.resume.list.queryOptions());
	const { data: analysis } = useQuery(
		orpc.applications.intelligence.get.queryOptions({ input: { applicationId: application.id } }),
	);
	if (analysis && analysis.jobFingerprint !== syncedFingerprint) {
		setSyncedFingerprint(analysis.jobFingerprint);
		setSelected(new Set(analysis.recommendations.slice(0, 12).map((item) => item.vaultItemId)));
	}

	const analyze = useMutation(
		orpc.applications.intelligence.analyze.mutationOptions({
			onSuccess: (result) => {
				setSyncedFingerprint(result.jobFingerprint);
				setSelected(new Set(result.recommendations.slice(0, 12).map((item) => item.vaultItemId)));
				void queryClient.invalidateQueries({
					queryKey: orpc.applications.intelligence.get.queryKey({ input: { applicationId: application.id } }),
				});
				void queryClient.invalidateQueries({ queryKey: applicationsListQueryKey() });
				toast.success("Local career analysis completed.");
			},
			onError: (error) => toast.error(error.message || "The application could not be analyzed."),
		}),
	);
	const createResume = useMutation(
		orpc.vault.createResume.mutationOptions({
			onSuccess: (result) => {
				toast.success(`Created "${result.name}" from a versioned Vault snapshot.`);
				void navigate({ to: "/builder/$resumeId", params: { resumeId: result.id } });
			},
			onError: (error) => toast.error(error.message || "The targeted resume could not be created."),
		}),
	);
	const resumeOptions = (resumes ?? []).map((resume) => ({ value: resume.id, label: resume.name }));
	const toggle = (id: string) => {
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	return (
		<section className="space-y-3 rounded-xl border bg-muted/20 p-4">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="flex items-center gap-2 font-semibold text-sm">
						<TargetIcon /> Career Intelligence
					</div>
					<p className="mt-1 text-muted-foreground text-xs">
						Deterministic keyword analysis using this application's saved job description. No AI or API key is used.
					</p>
				</div>
				<Button
					size="sm"
					variant={analysis ? "outline" : "default"}
					disabled={!application.jobDescription?.trim() || analyze.isPending}
					onClick={() => analyze.mutate({ applicationId: application.id })}
				>
					<MagnifyingGlassIcon /> {analyze.isPending ? "Analyzing..." : analysis ? "Analyze Again" : "Analyze Job"}
				</Button>
			</div>

			{!application.jobDescription?.trim() && (
				<p className="rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
					Add the job description to this application to enable local matching.
				</p>
			)}

			{analysis && (
				<>
					<div className="grid gap-3 sm:grid-cols-[100px_1fr]">
						<div className="flex flex-col items-center justify-center rounded-xl border bg-background p-3">
							<span className="font-bold text-3xl">{analysis.score}%</span>
							<span className="text-muted-foreground text-xs">Vault match</span>
						</div>
						<div className="space-y-2">
							<div>
								<div className="mb-1 flex items-center gap-1.5 text-xs">
									<CheckCircleIcon className="text-green-600" /> Matched requirements
								</div>
								<div className="flex flex-wrap gap-1">
									{analysis.matchedRequirements.length ? (
										analysis.matchedRequirements.map((item) => (
											<Badge key={item} variant="secondary">
												{item}
											</Badge>
										))
									) : (
										<span className="text-muted-foreground text-xs">No direct matches yet.</span>
									)}
								</div>
							</div>
							<div>
								<div className="mb-1 flex items-center gap-1.5 text-xs">
									<WarningCircleIcon className="text-amber-600" /> Missing keywords
								</div>
								<div className="flex flex-wrap gap-1">
									{analysis.missingKeywords.length ? (
										analysis.missingKeywords.map((item) => (
											<Badge key={item} variant="outline">
												{item}
											</Badge>
										))
									) : (
										<span className="text-muted-foreground text-xs">No gaps detected.</span>
									)}
								</div>
							</div>
						</div>
					</div>

					<div className="space-y-2">
						<div className="font-medium text-xs uppercase tracking-wide">Ranked Vault Recommendations</div>
						{analysis.recommendations.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No matching Vault blocks were found. Add relevant keywords or technologies to your Vault items.
							</p>
						) : (
							analysis.recommendations.slice(0, 20).map((item) => (
								<div
									key={item.vaultItemId}
									className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-2.5"
								>
									<Checkbox checked={selected.has(item.vaultItemId)} onCheckedChange={() => toggle(item.vaultItemId)} />
									<div className="min-w-0 flex-1">
										<div className="flex items-center justify-between gap-2">
											<span className="truncate font-medium text-sm">{item.label}</span>
											<Badge variant="outline">{item.score}%</Badge>
										</div>
										<p className="mt-0.5 text-muted-foreground text-xs">{item.rationale}</p>
									</div>
								</div>
							))
						)}
					</div>

					{analysis.recommendations.length > 0 && (
						<div className="space-y-3 rounded-xl border bg-background p-3">
							<div className="font-medium text-sm">Create Targeted Resume Snapshot</div>
							<div className="space-y-1.5">
								<Label>Resume Name</Label>
								<Input value={name} onChange={(event) => setName(event.target.value)} />
							</div>
							<div className="space-y-1.5">
								<Label>Base Resume Design and Contact Details</Label>
								<Combobox
									className="w-full"
									value={baseResumeId || null}
									options={resumeOptions}
									placeholder="Use the standard design"
									showClear
									onValueChange={(value) => setBaseResumeId(value ?? "")}
								/>
								<p className="text-muted-foreground text-xs">
									The base resume supplies its design, picture, and contact data. Selected Vault content is copied and
									version-snapshotted.
								</p>
							</div>
							<Button
								className="w-full"
								disabled={!name.trim() || selected.size === 0 || createResume.isPending}
								onClick={() =>
									createResume.mutate({
										name: name.trim(),
										baseResumeId: baseResumeId || null,
										applicationId: application.id,
										itemIds: [...selected],
										tags: ["career-intelligence", application.company, application.role],
									})
								}
							>
								{createResume.isPending ? "Creating Snapshot..." : `Create Resume from ${selected.size} Selected`}
							</Button>
						</div>
					)}
				</>
			)}
		</section>
	);
}
