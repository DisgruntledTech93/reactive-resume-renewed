import type { RoleItem } from "@reactive-resume/schema/resume/data";
import type { VaultItemContent, VaultItemType } from "@reactive-resume/schema/vault/data";
import type { VaultItem } from "./types";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { PlusIcon, TrashSimpleIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
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
import { ChipInput } from "@/components/input/chip-input";
import { RichInput } from "@/components/input/rich-input";
import { Combobox } from "@/components/ui/combobox";
import { generateId } from "@reactive-resume/utils/string";
import { orpc } from "@/libs/orpc/client";
import { VAULT_TYPE_LABELS, VAULT_TYPE_OPTIONS } from "./constants";
import { createEmptyVaultContent, getVaultContentLabel } from "./utils";

const emptyForm = (type: VaultItemType = "experience") => ({
	type,
	label: "",
	tags: [] as string[],
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
	const [form, setForm] = useState<FormState>(() =>
		buildFormState(item, initialType, initialContent, initialLabel),
	);

	useEffect(() => {
		if (open) setForm(buildFormState(item, initialType, initialContent, initialLabel));
	}, [open, item, initialType, initialContent, initialLabel]);

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: orpc.vault.list.queryKey() });
		void queryClient.invalidateQueries({ queryKey: orpc.vault.tags.queryKey() });
	};

	const create = useMutation(
		orpc.vault.create.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success(t`Saved to your Career Vault.`);
				onOpenChange(false);
			},
			onError: (error) => toast.error(error.message || t`Couldn't save this Vault item.`),
		}),
	);
	const update = useMutation(
		orpc.vault.update.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success(t`Vault item updated.`);
				onOpenChange(false);
			},
			onError: (error) => toast.error(error.message || t`Couldn't update this Vault item.`),
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
			toast.error(t`Complete the required fields before saving this Vault block.`);
			return;
		}

		const label = form.label.trim() || getVaultContentLabel(form.type, content);
		const payload = {
			type: form.type,
			label,
			content,
			tags: form.tags,
			notes: form.notes.trim() || null,
			sourceResumeId: item?.sourceResumeId ?? null,
			sourceItemId: item?.sourceItemId ?? null,
		};
		if (item) update.mutate({ id: item.id, ...payload });
		else create.mutate(payload);
	};

	const content = form.content as ContentRecord;
	const website = (content.website ?? {}) as ContentRecord;
	const pending = create.isPending || update.isPending;

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
				<Label>
					<Trans>Website URL</Trans>
				</Label>
				<Input value={stringValue(website.url)} onChange={(event) => setWebsiteField("url", event.target.value)} />
			</div>
			<div className="space-y-1.5">
				<Label>
					<Trans>Link Label</Trans>
				</Label>
				<Input value={stringValue(website.label)} onChange={(event) => setWebsiteField("label", event.target.value)} />
			</div>
			<div className="flex items-center gap-2 sm:col-span-2">
				<Switch
					checked={website.inlineLink === true}
					onCheckedChange={(checked) => setWebsiteField("inlineLink", checked)}
				/>
				<Label>
					<Trans>Show the link in the item title</Trans>
				</Label>
			</div>
		</div>
	);

	const keywordField = (key = "keywords") => (
		<div className="space-y-1.5 sm:col-span-2">
			<Label>
				<Trans>Keywords</Trans>
			</Label>
			<ChipInput value={stringArrayValue(content[key])} onChange={(value) => setContentField(key, value)} />
		</div>
	);

	const levelField = () => (
		<div className="space-y-1.5">
			<Label>
				<Trans>Level (0–5)</Trans>
			</Label>
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
					<SheetTitle>{item ? <Trans>Edit Vault item</Trans> : <Trans>Add to Career Vault</Trans>}</SheetTitle>
					<SheetDescription>
						<Trans>Store one reusable career block. Resumes receive an editable snapshot of this content.</Trans>
					</SheetDescription>
				</SheetHeader>

				<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 [&>*]:shrink-0">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label>
								<Trans>Block Type</Trans>
							</Label>
							<Combobox
								value={form.type}
								options={VAULT_TYPE_OPTIONS}
								onValueChange={(value) => {
									if (!value || value === form.type) return;
									const type = value as VaultItemType;
									setForm({ ...emptyForm(type), tags: form.tags, notes: form.notes });
								}}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>
								<Trans>Vault Label</Trans>
							</Label>
							<Input
								value={form.label}
								placeholder={t`Optional friendly name`}
								onChange={(event) => setForm((previous) => ({ ...previous, label: event.target.value }))}
							/>
						</div>
					</div>

					<div className="rounded-xl border bg-muted/20 p-4">
						<p className="mb-4 font-medium text-sm">{VAULT_TYPE_LABELS[form.type]}</p>
						<div className="grid gap-4 sm:grid-cols-2">
							{form.type === "summary" && richField("content", <Trans>Summary</Trans>)}

							{form.type === "profiles" && (
								<>
									{textField("network", <Trans>Network</Trans>)}
									{textField("username", <Trans>Username</Trans>)}
									{websiteFields()}
								</>
							)}

							{form.type === "experience" && (
								<>
									{textField("company", <Trans>Company</Trans>)}
									{textField("location", <Trans>Location</Trans>)}
									{textField("position", <Trans>Position</Trans>)}
									{textField("period", <Trans>Period</Trans>)}
									{websiteFields()}
									<div className="flex items-center justify-between sm:col-span-2">
										<div>
											<Label>
												<Trans>Role Progression</Trans>
											</Label>
											<p className="text-muted-foreground text-xs">
												<Trans>Use roles when you held multiple positions at the same company.</Trans>
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
											<Trans>Add Role</Trans>
										</Button>
									</div>
									{roles.map((role, index) => (
										<div key={role.id} className="grid gap-3 rounded-lg border p-3 sm:col-span-2 sm:grid-cols-2">
											<div className="space-y-1.5">
												<Label>
													<Trans>Role</Trans>
												</Label>
												<Input value={role.position} onChange={(event) => updateRole(index, "position", event.target.value)} />
											</div>
											<div className="space-y-1.5">
												<Label>
													<Trans>Period</Trans>
												</Label>
												<Input value={role.period} onChange={(event) => updateRole(index, "period", event.target.value)} />
											</div>
											<div className="space-y-1.5 sm:col-span-2">
												<Label>
													<Trans>Description</Trans>
												</Label>
												<RichInput value={role.description} onChange={(value) => updateRole(index, "description", value)} />
											</div>
											<Button
												type="button"
												variant="ghost"
												className="justify-self-start text-destructive hover:text-destructive sm:col-span-2"
												onClick={() => setContentField("roles", roles.filter((_, roleIndex) => roleIndex !== index))}
											>
												<TrashSimpleIcon />
												<Trans>Remove Role</Trans>
											</Button>
										</div>
									))}
									{roles.length === 0 && richField("description", <Trans>Description</Trans>)}
								</>
							)}

							{form.type === "education" && (
								<>
									{textField("school", <Trans>School</Trans>)}
									{textField("degree", <Trans>Degree</Trans>)}
									{textField("area", <Trans>Area of Study</Trans>)}
									{textField("grade", <Trans>Grade</Trans>)}
									{textField("location", <Trans>Location</Trans>)}
									{textField("period", <Trans>Period</Trans>)}
									{websiteFields()}
									{richField("description", <Trans>Description</Trans>)}
								</>
							)}

							{form.type === "projects" && (
								<>
									{textField("name", <Trans>Project Name</Trans>)}
									{textField("period", <Trans>Period</Trans>)}
									{websiteFields()}
									{richField("description", <Trans>Description</Trans>)}
								</>
							)}

							{form.type === "skills" && (
								<>
									{textField("name", <Trans>Skill</Trans>)}
									{textField("proficiency", <Trans>Proficiency</Trans>)}
									{levelField()}
									{keywordField()}
								</>
							)}

							{form.type === "languages" && (
								<>
									{textField("language", <Trans>Language</Trans>)}
									{textField("fluency", <Trans>Fluency</Trans>)}
									{levelField()}
								</>
							)}

							{form.type === "interests" && (
								<>
									{textField("name", <Trans>Interest</Trans>)}
									{keywordField()}
								</>
							)}

							{form.type === "awards" && (
								<>
									{textField("title", <Trans>Award</Trans>)}
									{textField("awarder", <Trans>Awarded By</Trans>)}
									{textField("date", <Trans>Date</Trans>)}
									{websiteFields()}
									{richField("description", <Trans>Description</Trans>)}
								</>
							)}

							{form.type === "certifications" && (
								<>
									{textField("title", <Trans>Certification</Trans>)}
									{textField("issuer", <Trans>Issuer</Trans>)}
									{textField("date", <Trans>Date</Trans>)}
									{websiteFields()}
									{richField("description", <Trans>Description</Trans>)}
								</>
							)}

							{form.type === "publications" && (
								<>
									{textField("title", <Trans>Publication</Trans>)}
									{textField("publisher", <Trans>Publisher</Trans>)}
									{textField("date", <Trans>Date</Trans>)}
									{websiteFields()}
									{richField("description", <Trans>Description</Trans>)}
								</>
							)}

							{form.type === "volunteer" && (
								<>
									{textField("organization", <Trans>Organization</Trans>)}
									{textField("location", <Trans>Location</Trans>)}
									{textField("period", <Trans>Period</Trans>)}
									{websiteFields()}
									{richField("description", <Trans>Description</Trans>)}
								</>
							)}

							{form.type === "references" && (
								<>
									{textField("name", <Trans>Name</Trans>)}
									{textField("position", <Trans>Position</Trans>)}
									{textField("phone", <Trans>Phone</Trans>)}
									{websiteFields()}
									{richField("description", <Trans>Description</Trans>)}
								</>
							)}
						</div>
					</div>

					<div className="space-y-1.5">
						<Label>
							<Trans>Tags</Trans>
						</Label>
						<ChipInput
							value={form.tags}
							onChange={(value) => setForm((previous) => ({ ...previous, tags: value }))}
						/>
						<p className="text-muted-foreground text-xs">
							<Trans>Add role, industry, technology, or accomplishment tags.</Trans>
						</p>
					</div>

					<div className="space-y-1.5">
						<Label>
							<Trans>Private Notes</Trans>
						</Label>
						<Textarea
							value={form.notes}
							placeholder={t`Evidence, metrics to verify, or reminders. These notes never appear on a resume.`}
							onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
						/>
					</div>
				</div>

				<SheetFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						<Trans>Cancel</Trans>
					</Button>
					<Button disabled={pending} onClick={submit}>
						{item ? <Trans>Save Changes</Trans> : <Trans>Save to Vault</Trans>}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
