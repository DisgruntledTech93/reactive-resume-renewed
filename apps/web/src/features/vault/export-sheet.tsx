import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { ComponentType } from "react";
import { FileDocIcon, FileJsIcon, FilePdfIcon, MarkdownLogoIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { buildDocx } from "@reactive-resume/docx";
import { getResumeSectionTitle } from "@reactive-resume/pdf/section-title";
import { Button } from "@reactive-resume/ui/components/button";
import { Label } from "@reactive-resume/ui/components/label";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@reactive-resume/ui/components/sheet";
import { downloadWithAnchor, generateFilename } from "@reactive-resume/utils/file";
import { Combobox } from "@/components/ui/combobox";
import { createResumePdfBlob } from "@/features/resume/export/pdf-document";
import { orpc } from "@/libs/orpc/client";
import { createSectionTitleResolverForLocale } from "@/libs/resume/section-title-locale";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

async function createTitleResolver(data: ResumeData) {
	const resolveSectionTitle = await createSectionTitleResolverForLocale(data.metadata.page.locale);
	return (sectionId: string) => getResumeSectionTitle({ ...data, resolveSectionTitle }, sectionId);
}

export function VaultExportSheet({ open, onOpenChange }: Props) {
	const [baseResumeId, setBaseResumeId] = useState("");
	const [isRendering, setIsRendering] = useState(false);
	const { data: resumes } = useQuery(orpc.resume.list.queryOptions());
	const resumeOptions = (resumes ?? []).map((resume) => ({ value: resume.id, label: resume.name }));
	const portable = useMutation(orpc.vault.exportPortable.mutationOptions());
	const resumeData = useMutation(orpc.vault.exportResumeData.mutationOptions());
	const pending = portable.isPending || resumeData.isPending || isRendering;

	const downloadPortable = async (format: "json" | "markdown") => {
		try {
			const result = await portable.mutateAsync({ format, includeArchived: false });
			downloadWithAnchor(new Blob([result.content], { type: result.mimeType }), result.fileName);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "The Vault export could not be generated.");
		}
	};

	const downloadDocument = async (format: "docx" | "pdf") => {
		setIsRendering(true);
		try {
			const result = await resumeData.mutateAsync({ baseResumeId: baseResumeId || null });
			const blob =
				format === "docx"
					? await buildDocx(result.data, await createTitleResolver(result.data))
					: await createResumePdfBlob(result.data);
			downloadWithAnchor(blob, generateFilename(result.name, format));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : `The ${format.toUpperCase()} export could not be generated.`,
			);
		} finally {
			setIsRendering(false);
		}
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full data-[side=right]:sm:max-w-lg">
				<SheetHeader>
					<SheetTitle>Export Career Vault</SheetTitle>
					<SheetDescription>
						Keep a portable backup or render the active Vault as a conventional document.
					</SheetDescription>
				</SheetHeader>
				<div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4">
					<div className="grid grid-cols-2 gap-3">
						<ExportButton
							icon={FileJsIcon}
							title="JSON"
							description="Complete portable data"
							disabled={pending}
							onClick={() => void downloadPortable("json")}
						/>
						<ExportButton
							icon={MarkdownLogoIcon}
							title="Markdown"
							description="Readable text backup"
							disabled={pending}
							onClick={() => void downloadPortable("markdown")}
						/>
						<ExportButton
							icon={FileDocIcon}
							title="DOCX"
							description="Editable resume document"
							disabled={pending}
							onClick={() => void downloadDocument("docx")}
						/>
						<ExportButton
							icon={FilePdfIcon}
							title="PDF"
							description="Print-ready resume document"
							disabled={pending}
							onClick={() => void downloadDocument("pdf")}
						/>
					</div>
					<div className="space-y-2 rounded-xl border p-4">
						<Label>Base Resume for DOCX and PDF</Label>
						<Combobox
							className="w-full"
							value={baseResumeId || null}
							options={resumeOptions}
							placeholder="Use the standard design"
							showClear
							onValueChange={(value) => setBaseResumeId(value ?? "")}
						/>
						<p className="text-muted-foreground text-xs">
							Choose a base to preserve its design and contact details. JSON and Markdown always export the full Vault
							metadata.
						</p>
					</div>
				</div>
				<SheetFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

type ExportButtonProps = {
	icon: ComponentType<{ className?: string }>;
	title: string;
	description: string;
	disabled: boolean;
	onClick: () => void;
};

function ExportButton({ icon: Icon, title, description, disabled, onClick }: ExportButtonProps) {
	return (
		<button
			type="button"
			disabled={disabled}
			className="flex flex-col items-start gap-2 rounded-xl border p-4 text-left hover:bg-muted/50 disabled:opacity-50"
			onClick={onClick}
		>
			<Icon className="size-6" />
			<div>
				<div className="font-medium">{title}</div>
				<div className="text-muted-foreground text-xs">{description}</div>
			</div>
		</button>
	);
}
