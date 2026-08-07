import type { RouterOutput } from "@/libs/orpc/client";
import { FileArrowUpIcon, FileTextIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { Checkbox } from "@reactive-resume/ui/components/checkbox";
import { Label } from "@reactive-resume/ui/components/label";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@reactive-resume/ui/components/sheet";
import { Tabs, TabsList, TabsTrigger } from "@reactive-resume/ui/components/tabs";
import { Combobox } from "@/components/ui/combobox";
import { orpc } from "@/libs/orpc/client";
import { VAULT_TYPE_LABELS } from "./constants";

type ImportPreview = RouterOutput["vault"]["previewFileImport"];

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function ImportResumeToVaultSheet({ open, onOpenChange }: Props) {
	const queryClient = useQueryClient();
	const fileRef = useRef<HTMLInputElement>(null);
	const [source, setSource] = useState<"file" | "resume">("file");
	const [resumeId, setResumeId] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<ImportPreview | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const { data: resumes } = useQuery(orpc.resume.list.queryOptions());
	const options = (resumes ?? []).map((resume) => ({ value: resume.id, label: resume.name }));

	const acceptPreview = (result: ImportPreview) => {
		setPreview(result);
		setSelected(
			new Set(result.candidates.filter((candidate) => !candidate.duplicateOfId).map((candidate) => candidate.id)),
		);
	};

	const previewFile = useMutation(
		orpc.vault.previewFileImport.mutationOptions({
			onSuccess: acceptPreview,
			onError: (error) => toast.error(error.message || "The resume could not be read."),
		}),
	);
	const previewResume = useMutation(
		orpc.vault.previewResumeImport.mutationOptions({
			onSuccess: acceptPreview,
			onError: (error) => toast.error(error.message || "The resume could not be prepared for review."),
		}),
	);
	const commit = useMutation(
		orpc.vault.commitImport.mutationOptions({
			onSuccess: (result) => {
				void queryClient.invalidateQueries({ queryKey: orpc.vault.list.queryKey() });
				void queryClient.invalidateQueries({ queryKey: orpc.vault.tags.queryKey() });
				toast.success(
					`Imported ${result.imported} Vault block${result.imported === 1 ? "" : "s"}${result.skippedDuplicates ? `; skipped ${result.skippedDuplicates} duplicate${result.skippedDuplicates === 1 ? "" : "s"}` : ""}.`,
				);
				reset();
				onOpenChange(false);
			},
			onError: (error) => toast.error(error.message || "The selected blocks could not be imported."),
		}),
	);

	const reset = () => {
		setResumeId("");
		setFile(null);
		setPreview(null);
		setSelected(new Set());
	};
	const pending = previewFile.isPending || previewResume.isPending || commit.isPending;
	const toggle = (id: string) => {
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) reset();
				onOpenChange(next);
			}}
		>
			<SheetContent side="right" className="w-full gap-0 data-[side=right]:sm:max-w-2xl">
				<SheetHeader>
					<SheetTitle>{preview ? "Review Imported Blocks" : "Import Resume into Vault"}</SheetTitle>
					<SheetDescription>
						{preview
							? "Choose the reusable career blocks to keep. Nothing is saved until you confirm."
							: "Import Reactive Resume JSON, PDF, DOCX, or TXT without an AI provider or API key."}
					</SheetDescription>
				</SheetHeader>

				<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
					{!preview ? (
						<div className="space-y-5">
							<Tabs value={source} onValueChange={(value) => setSource(value as "file" | "resume")}>
								<TabsList className="grid w-full grid-cols-2">
									<TabsTrigger value="file">Upload a File</TabsTrigger>
									<TabsTrigger value="resume">Resume in This App</TabsTrigger>
								</TabsList>
							</Tabs>

							{source === "file" ? (
								<div className="space-y-3">
									<input
										ref={fileRef}
										type="file"
										className="hidden"
										accept=".json,.pdf,.docx,.txt,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
										onChange={(event) => setFile(event.target.files?.[0] ?? null)}
									/>
									<button
										type="button"
										className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center hover:bg-muted/40"
										onClick={() => fileRef.current?.click()}
									>
										<FileArrowUpIcon className="size-8 text-muted-foreground" />
										<span className="font-medium">{file?.name ?? "Choose a resume file"}</span>
										<span className="text-muted-foreground text-xs">
											Reactive Resume JSON, PDF, DOCX, or TXT · 10 MB maximum
										</span>
									</button>
									<p className="text-muted-foreground text-xs">
										PDF and Word files use local text extraction and deterministic section detection. You can correct
										every block after import.
									</p>
								</div>
							) : (
								<div className="space-y-2">
									<Label>Resume</Label>
									<Combobox
										className="w-full"
										value={resumeId}
										options={options}
										placeholder="Select a resume"
										onValueChange={(value) => setResumeId(value ?? "")}
									/>
									<p className="text-muted-foreground text-xs">The selected resume is not changed.</p>
								</div>
							)}
						</div>
					) : (
						<div className="space-y-3">
							<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-3 text-sm">
								<div className="flex items-center gap-2">
									<FileTextIcon />
									<span className="font-medium">{preview.fileName}</span>
									<Badge variant="outline">{preview.fileType}</Badge>
								</div>
								<span>
									{selected.size} of {preview.candidates.length} selected
								</span>
							</div>
							{preview.duplicateCount > 0 && (
								<div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
									<WarningCircleIcon className="mt-0.5 shrink-0" />
									<span>
										{preview.duplicateCount} exact duplicate{preview.duplicateCount === 1 ? " was" : "s were"} detected
										and deselected.
									</span>
								</div>
							)}
							{preview.candidates.map((item) => (
								<div
									key={item.id}
									className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 has-[[data-checked]]:border-primary/50 has-[[data-checked]]:bg-primary/5"
								>
									<Checkbox
										checked={selected.has(item.id)}
										disabled={!!item.duplicateOfId}
										onCheckedChange={() => toggle(item.id)}
									/>
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-medium">{item.label}</span>
											<Badge variant="outline">{VAULT_TYPE_LABELS[item.type]}</Badge>
											{item.duplicateOfId && <Badge variant="secondary">Exact duplicate</Badge>}
										</div>
										{item.technologies.length > 0 && (
											<p className="mt-1 text-muted-foreground text-xs">Technologies: {item.technologies.join(", ")}</p>
										)}
										{item.targetRoles.length > 0 && (
											<p className="mt-1 text-muted-foreground text-xs">Useful for: {item.targetRoles.join(", ")}</p>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				<SheetFooter className="flex-row justify-end gap-2">
					<Button
						variant="ghost"
						onClick={() => {
							if (preview) {
								setPreview(null);
								setSelected(new Set());
							} else {
								reset();
								onOpenChange(false);
							}
						}}
					>
						{preview ? "Back" : "Cancel"}
					</Button>
					{preview ? (
						<Button
							disabled={selected.size === 0 || pending}
							onClick={() => commit.mutate({ importId: preview.importId, selectedCandidateIds: [...selected] })}
						>
							{commit.isPending ? "Importing..." : `Import ${selected.size} Selected`}
						</Button>
					) : (
						<Button
							disabled={pending || (source === "file" ? !file : !resumeId)}
							onClick={() => {
								if (source === "file" && file) previewFile.mutate({ file });
								if (source === "resume" && resumeId) previewResume.mutate({ resumeId });
							}}
						>
							{pending ? "Reading Resume..." : "Review Detected Blocks"}
						</Button>
					)}
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
