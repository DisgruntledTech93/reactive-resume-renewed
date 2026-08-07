import type { RoleItem } from "@reactive-resume/schema/resume/data";
import type { VaultItemContent, VaultItemType } from "@reactive-resume/schema/vault/data";
import type { ReactNode } from "react";
import type { VaultItem } from "./types";
import { PlusIcon, TrashSimpleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { parseVaultItemContent } from "@reactive-resume/schema/vault/data";
import { Button } from "@reactive-resume/ui/components/button";
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
import { Switch } from "@reactive-resume/ui/components/switch";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { generateId } from "@reactive-resume/utils/string";
import { ChipInput } from "@/components/input/chip-input";
import { RichInput } from "@/components/input/rich-input";
import { Combobox } from "@/components/ui/combobox";
import { orpc } from "@/libs/orpc/client";
import { VAULT_TYPE_LABELS, VAULT_TYPE_OPTIONS } from "./constants";
import { createEmptyVaultContent, getVaultContentLabel } from "./utils";

const emptyForm = (type: VaultItemType = "experience") => ({
	type,
	label: "",
	tags: [] as string[],
	keywords: [] as string[],
	technologies: [] as string[],
	industries: [] as string[],
	targetRoles: [] as string[],
	importance: 3,
	notes: "",
	content: createEmptyVaultContent(type),
});

type FormState = ReturnType<typeof emptyForm>;
type ContentRecord = Record<string, unknown>;

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	item?: VaultItem | null;
	initialType?: VaultItemType;
	initialContent?: VaultItemContent;
	initialLabel?: string;
};

function toForm(item: VaultItem): FormState {
	return {
		type: item.type,
		label: item.label,
		tags: item.tags,
		keywords: item.keywords,
		technologies: item.technologies,
		industries: item.industries,
		targetRoles: item.targetRoles,
		importance: item.importance,
		notes: item.notes ?? "",
		content: structuredClone(item.content),
	};
}

function buildFormState(
	item: VaultItem | null | undefined,
	initialType: VaultItemType,
	initialContent?: VaultItemContent,
	initialLabel?: string,
): FormState {
	if (item) return toForm(item);
	return {
		...emptyForm(initialType),
		...(initialContent ? { content: structuredClone(initialContent) } : {}),
		...(initialLabel ? { label: initialLabel } : {}),
	};
}

function stringValue(value: unknown) {
	return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
	return typeof value === "number" ? value : 0;
}

function stringArrayValue(value: unknown) {
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function VaultItemFormSheet({
	open,
	onOpenChange,
	item,
	initialType = "experience",
	initialContent,
	initialLabel,
}: Props) {
	const queryClient = useQueryClient();
	const [form, setForm] = useState<FormState>(() => buildFormState(item, initialType, initialContent, initialLabel));

	useEffect(() => {
		if (open) setForm(buildFormState(item, initialType, initialContent, initialLabel));
	}, [open, item, initialType, initialContent, initialLabel]);

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: orpc.vault.list.queryKey() });
		void queryClient.invalidateQueries({ queryKey: orpc.vault.tags.queryKey() });
	};
	const { data: versions } = useQuery(
		orpc.vault.versions.queryOptions({ input: { id: item?.id ?? "new" }, enabled: open && !!item }),
	);

	const create = useMutation(
		orpc.vault.create.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success("Saved to your Career Vault.");
				onOpenChange(false);
			},
			onError: (error) => toast.error(error.message || `Couldn't save this Vault item.`),
		}),
	);
	const update = useMutation(
		orpc.vault.update.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success("Vault item updated.");
				onOpenChange(false);
			},
			onError: (error) => toast.error(error.message || `Couldn't update this Vault item.`),
		}),
	);
	const restore = useMutation(
		orpc.vault.restoreVersion.mutationOptions({
			onSuccess: () => {
				invalidate();
				if (item) {
					void queryClient.invalidateQueries({ queryKey: orpc.vault.versions.queryKey({ input: { id: item.id } }) });
				}
				toast.success("Vault version restored as a new revision.");
				onOpenChange(false);
			},
			onError: (error) => toast.error(error.message || "The selected version could not be restored."),
		}),
	);

	const setContentField = (key: string, value: unknown) => {
		setForm((previous) => ({
			...previous,
			content: { ...(previous.content as ContentRecord), [key]: value } as VaultItemContent,
		}));
	};

	const setWebsiteField = (key: "url" | "label" | "inlineLink", value: string | boolean) => {
		const record = form.content as ContentRecord;
		const current = (record.website ?? {}) as ContentRecord;
		setContentField("website", { ...current, [key]: value });
	};

	const submit = () => {
		const content = { ...(form.content as ContentRecord), hidden: false } as VaultItemContent;
		try {
			parseVaultItemContent(form.type, content);
		} catch {
			toast.error("Complete the required fields before saving this Vault block.");
			return;
		}

		const label = form.label.trim() || getVaultContentLabel(form.type, content);
		const payload = {
			type: form.type,
			label,
			content,
			tags: form.tags,
			keywords: form.keywords,
			technologies: form.technologies,
			industries: form.industries,
			targetRoles: form.targetRoles,
			importance: form.importance,
			notes: form.notes.trim() || null,
			sourceType: item?.sourceType ?? ("manual" as const),
			sourceName: item?.sourceName ?? null,
			sourceResumeId: item?.sourceResumeId ?? null,
			sourceItemId: item?.sourceItemId ?? null,
		};
		if (item) update.mutate({ id: item.id, ...payload });
		else create.mutate(payload);
	};

	const content = form.content as ContentRecord;
	const website = (content.website ?? {}) as ContentRecord;
	const pending = create.isPending || update.isPending || restore.isPending;

	const textField = (key: string, label: ReactNode, placeholder?: string) => (
		<div className="space-y-1.5">
			<Label>{label}</Label>
			<Input
				value={stringValue(content[key])}
				placeholder={placeholder}
				onChange={(event) => setContentField(key, event.target.value)}
			/>
		</div>
	);

	const richField = (key: string, label: ReactNode) => (
		<div className="space-y-1.5 sm:col-span-2">
			<Label>{label}</Label>
			<RichInput value={stringValue(content[key])} onChange={(value) => setContentField(key, value)} />
		</div>
	);

	const websiteFields = () => (
		<div className="grid gap-3 rounded-lg border p-3 sm:col-span-2 sm:grid-cols-2">
			<div className="space-y-1.5">
				<Label>{"Website URL"}</Label>
				<Input value={stringValue(website.url)} onChange={(event) => setWebsiteField("url", event.target.value)} />
			</div>
			<div className="space-y-1.5">
				<Label>{"Link Label"}</Label>
				<Input value={stringValue(website.label)} onChange={(event) => setWebsiteField("label", event.target.value)} />
			</div>
			<div className="flex items-center gap-2 sm:col-span-2">
				<Switch
					checked={website.inlineLink === true}
					onCheckedChange={(checked) => setWebsiteField("inlineLink", checked)}
				/>
				<Label>{"Show the link in the item title"}</Label>
			</div>
		</div>
	);

	const keywordField = (key = "keywords") => (
		<div className="space-y-1.5 sm:col-span-2">
			<Label>{"Keywords"}</Label>
			<ChipInput value={stringArrayValue(content[key])} onChange={(value) => setContentField(key, value)} />
		</div>
	);

	const levelField = () => (
		<div className="space-y-1.5">
			<Label>{"Level (0–5)"}</Label>
			<Input
				type="number"
				min={0}
				max={5}
				value={numberValue(content.level)}
				onChange={(event) => setContentField("level", Number(event.target.value))}
			/>
		</div>
	);

	const roles = Array.isArray(content.roles) ? (content.roles as RoleItem[]) : [];
	const updateRole = (index: number, key: keyof RoleItem, value: string) => {
		setContentField(
			"roles",
			roles.map((role, roleIndex) => (roleIndex === index ? { ...role, [key]: value } : role)),
		);
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full gap-0 data-[side=right]:sm:max-w-2xl">
				<SheetHeader>
					<SheetTitle>{item ? "Edit Vault item" : "Add to Career Vault"}</SheetTitle>
					<SheetDescription>
						{"Store one reusable career block. Resumes receive an editable snapshot of this content."}
					</SheetDescription>
				</SheetHeader>

				<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 [&>*]:shrink-0">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label>{"Block Type"}</Label>
							<Combobox
								value={form.type}
								options={VAULT_TYPE_OPTIONS}
								onValueChange={(value) => {
									if (!value || value === form.type) return;
									const type = value as VaultItemType;
									setForm({
										...emptyForm(type),
										tags: form.tags,
										keywords: form.keywords,
										technologies: form.technologies,
										industries: form.industries,
										targetRoles: form.targetRoles,
										importance: form.importance,
										notes: form.notes,
									});
								}}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>{"Vault Label"}</Label>
							<Input
								value={form.label}
								placeholder={"Optional friendly name"}
								onChange={(event) => setForm((previous) => ({ ...previous, label: event.target.value }))}
							/>
						</div>
					</div>

					<div className="rounded-xl border p-4">
						<div>
							<h3 className="font-medium text-sm">Career Intelligence Metadata</h3>
							<p className="text-muted-foreground text-xs">
								Used by local application matching and ranked recommendations.
							</p>
						</div>
						<div className="mt-4 grid gap-4 sm:grid-cols-2">
							<div className="space-y-1.5 sm:col-span-2">
								<Label>{"Keywords"}</Label>
								<ChipInput
									value={form.keywords}
									onChange={(keywords) => setForm((previous) => ({ ...previous, keywords }))}
								/>
							</div>
							<div className="space-y-1.5">
								<Label>{"Technologies"}</Label>
								<ChipInput
									value={form.technologies}
									onChange={(technologies) => setForm((previous) => ({ ...previous, technologies }))}
								/>
							</div>
							<div className="space-y-1.5">
								<Label>{"Industries"}</Label>
								<ChipInput
									value={form.industries}
									onChange={(industries) => setForm((previous) => ({ ...previous, industries }))}
								/>
							</div>
							<div className="space-y-1.5 sm:col-span-2">
								<Label>{"Target Roles"}</Label>
								<ChipInput
									value={form.targetRoles}
									onChange={(targetRoles) => setForm((previous) => ({ ...previous, targetRoles }))}
								/>
							</div>
							<div className="space-y-1.5">
								<Label>{"Importance (1-5)"}</Label>
								<Input
									type="number"
									min={1}
									max={5}
									value={form.importance}
									onChange={(event) =>
										setForm((previous) => ({
											...previous,
											importance: Math.max(1, Math.min(5, Number(event.target.value))),
										}))
									}
								/>
							</div>
							{item?.sourceName && (
								<div className="space-y-1.5">
									<Label>{"Source"}</Label>
									<Input value={item.sourceName} readOnly />
								</div>
							)}
						</div>
					</div>

					<div className="rounded-xl border bg-muted/20 p-4">
						<p className="mb-4 font-medium text-sm">{VAULT_TYPE_LABELS[form.type]}</p>
						<div className="grid gap-4 sm:grid-cols-2">
							{form.type === "summary" && richField("content", "Summary")}

							{form.type === "profiles" && (
								<>
									{textField("network", "Network")}
									{textField("username", "Username")}
									{websiteFields()}
								</>
							)}

							{form.type === "experience" && (
								<>
									{textField("company", "Company")}
									{textField("location", "Location")}
									{textField("position", "Position")}
									{textField("period", "Period")}
									{websiteFields()}
									<div className="flex items-center justify-between sm:col-span-2">
										<div>
											<Label>{"Role Progression"}</Label>
											<p className="text-muted-foreground text-xs">
												{"Use roles when you held multiple positions at the same company."}
											</p>
										</div>
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() =>
												setContentField("roles", [
													...roles,
													{ id: generateId(), position: "", period: "", description: "" },
												])
											}
										>
											<PlusIcon />
											{"Add Role"}
										</Button>
									</div>
									{roles.map((role, index) => (
										<div key={role.id} className="grid gap-3 rounded-lg border p-3 sm:col-span-2 sm:grid-cols-2">
											<div className="space-y-1.5">
												<Label>{"Role"}</Label>
												<Input
													value={role.position}
													onChange={(event) => updateRole(index, "position", event.target.value)}
												/>
											</div>
											<div className="space-y-1.5">
												<Label>{"Period"}</Label>
												<Input
													value={role.period}
													onChange={(event) => updateRole(index, "period", event.target.value)}
												/>
											</div>
											<div className="space-y-1.5 sm:col-span-2">
												<Label>{"Description"}</Label>
												<RichInput
													value={role.description}
													onChange={(value) => updateRole(index, "description", value)}
												/>
											</div>
											<Button
												type="button"
												variant="ghost"
												className="justify-self-start text-destructive hover:text-destructive sm:col-span-2"
												onClick={() =>
													setContentField(
														"roles",
														roles.filter((_, roleIndex) => roleIndex !== index),
													)
												}
											>
												<TrashSimpleIcon />
												{"Remove Role"}
											</Button>
										</div>
									))}
									{roles.length === 0 && richField("description", "Description")}
								</>
							)}

							{form.type === "education" && (
								<>
									{textField("school", "School")}
									{textField("degree", "Degree")}
									{textField("area", "Area of Study")}
									{textField("grade", "Grade")}
									{textField("location", "Location")}
									{textField("period", "Period")}
									{websiteFields()}
									{richField("description", "Description")}
								</>
							)}

							{form.type === "projects" && (
								<>
									{textField("name", "Project Name")}
									{textField("period", "Period")}
									{websiteFields()}
									{richField("description", "Description")}
								</>
							)}

							{form.type === "skills" && (
								<>
									{textField("name", "Skill")}
									{textField("proficiency", "Proficiency")}
									{levelField()}
									{keywordField()}
								</>
							)}

							{form.type === "languages" && (
								<>
									{textField("language", "Language")}
									{textField("fluency", "Fluency")}
									{levelField()}
								</>
							)}

							{form.type === "interests" && (
								<>
									{textField("name", "Interest")}
									{keywordField()}
								</>
							)}

							{form.type === "awards" && (
								<>
									{textField("title", "Award")}
									{textField("awarder", "Awarded By")}
									{textField("date", "Date")}
									{websiteFields()}
									{richField("description", "Description")}
								</>
							)}

							{form.type === "certifications" && (
								<>
									{textField("title", "Certification")}
									{textField("issuer", "Issuer")}
									{textField("date", "Date")}
									{websiteFields()}
									{richField("description", "Description")}
								</>
							)}

							{form.type === "publications" && (
								<>
									{textField("title", "Publication")}
									{textField("publisher", "Publisher")}
									{textField("date", "Date")}
									{websiteFields()}
									{richField("description", "Description")}
								</>
							)}

							{form.type === "volunteer" && (
								<>
									{textField("organization", "Organization")}
									{textField("location", "Location")}
									{textField("period", "Period")}
									{websiteFields()}
									{richField("description", "Description")}
								</>
							)}

							{form.type === "references" && (
								<>
									{textField("name", "Name")}
									{textField("position", "Position")}
									{textField("phone", "Phone")}
									{websiteFields()}
									{richField("description", "Description")}
								</>
							)}
						</div>
					</div>

					<div className="space-y-1.5">
						<Label>{"Tags"}</Label>
						<ChipInput value={form.tags} onChange={(value) => setForm((previous) => ({ ...previous, tags: value }))} />
						<p className="text-muted-foreground text-xs">{"Add role, industry, technology, or accomplishment tags."}</p>
					</div>

					{item && versions && versions.length > 0 && (
						<div className="space-y-2 rounded-xl border p-4">
							<div>
								<h3 className="font-medium text-sm">Version History</h3>
								<p className="text-muted-foreground text-xs">
									Restoring creates a new version; existing history remains intact.
								</p>
							</div>
							{versions.slice(0, 10).map((version) => (
								<div
									key={version.id}
									className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-2 text-sm"
								>
									<div>
										<span className="font-medium">Version {version.version}</span>
										<span className="ml-2 text-muted-foreground">{version.changeReason}</span>
									</div>
									<Button
										type="button"
										size="sm"
										variant="outline"
										disabled={version.version === item.version || restore.isPending}
										onClick={() => restore.mutate({ id: item.id, versionId: version.id })}
									>
										{version.version === item.version ? "Current" : "Restore"}
									</Button>
								</div>
							))}
						</div>
					)}

					<div className="space-y-1.5">
						<Label>{"Private Notes"}</Label>
						<Textarea
							value={form.notes}
							placeholder={"Evidence, metrics to verify, or reminders. These notes never appear on a resume."}
							onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
						/>
					</div>
				</div>

				<SheetFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						{"Cancel"}
					</Button>
					<Button disabled={pending} onClick={submit}>
						{item ? "Save Changes" : "Save to Vault"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
