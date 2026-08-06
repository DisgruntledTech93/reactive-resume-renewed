import type { VaultItemType } from "@reactive-resume/schema/vault/data";
import type { VaultItem } from "@/features/vault/types";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
	ArchiveIcon,
	ArrowCounterClockwiseIcon,
	CopySimpleIcon,
	DotsThreeVerticalIcon,
	DownloadSimpleIcon,
	MagnifyingGlassIcon,
	PencilSimpleLineIcon,
	PlusIcon,
	SparkleIcon,
	TrashSimpleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@reactive-resume/ui/components/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@reactive-resume/ui/components/input-group";
import { Label } from "@reactive-resume/ui/components/label";
import { Separator } from "@reactive-resume/ui/components/separator";
import { Switch } from "@reactive-resume/ui/components/switch";
import { generateId } from "@reactive-resume/utils/string";
import { cn } from "@reactive-resume/utils/style";
import { Combobox } from "@/components/ui/combobox";
import { ImportResumeToVaultSheet } from "@/features/vault/import-resume-sheet";
import { VaultItemFormSheet } from "@/features/vault/item-form-sheet";
import { TargetedResumeSheet } from "@/features/vault/targeted-resume-sheet";
import { VAULT_TYPE_LABELS, VAULT_TYPE_OPTIONS } from "@/features/vault/constants";
import { getVaultContentPreview } from "@/features/vault/utils";
import { useConfirm } from "@/hooks/use-confirm";
import { orpc } from "@/libs/orpc/client";
import { DashboardHeader } from "../-components/header";

export const Route = createFileRoute("/dashboard/vault/")({ component: RouteComponent });

function RouteComponent() {
	const queryClient = useQueryClient();
	const confirm = useConfirm();
	const [search, setSearch] = useState("");
	const [types, setTypes] = useState<VaultItemType[]>([]);
	const [tags, setTags] = useState<string[]>([]);
	const [showArchived, setShowArchived] = useState(false);
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<VaultItem | null>(null);
	const [importOpen, setImportOpen] = useState(false);
	const [targetOpen, setTargetOpen] = useState(false);

	const { data: allTags } = useQuery(orpc.vault.tags.queryOptions());
	const { data: items, isLoading } = useQuery(
		orpc.vault.list.queryOptions({
			input: {
				search: search.trim() || undefined,
				types: types.length > 0 ? types : undefined,
				tags: tags.length > 0 ? tags : undefined,
				includeArchived: showArchived,
			},
		}),
	);

	const tagOptions = useMemo(() => (allTags ?? []).map((tag) => ({ value: tag, label: tag })), [allTags]);
	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: orpc.vault.list.queryKey() });
		void queryClient.invalidateQueries({ queryKey: orpc.vault.tags.queryKey() });
	};

	const update = useMutation(
		orpc.vault.update.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toast.error(error.message || t`Couldn't update this Vault item.`),
		}),
	);
	const remove = useMutation(
		orpc.vault.delete.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success(t`Vault item deleted.`);
			},
			onError: (error) => toast.error(error.message || t`Couldn't delete this Vault item.`),
		}),
	);
	const duplicate = useMutation(
		orpc.vault.create.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success(t`Vault item duplicated.`);
			},
			onError: (error) => toast.error(error.message || t`Couldn't duplicate this Vault item.`),
		}),
	);

	const deleteItem = async (item: VaultItem) => {
		const approved = await confirm(t`Permanently delete "${item.label}" from your Career Vault?`, {
			confirmText: t`Delete`,
			cancelText: t`Cancel`,
		});
		if (approved) remove.mutate({ id: item.id });
	};

	const openCreate = () => {
		setEditing(null);
		setFormOpen(true);
	};

	return (
		<div className="space-y-4">
			<DashboardHeader
				icon={ArchiveIcon}
				title={t`Career Vault`}
				actions={
					<>
						<Button size="sm" variant="outline" onClick={() => setTargetOpen(true)}>
							<SparkleIcon />
							<Trans>Build Targeted Resume</Trans>
						</Button>
						<Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
							<DownloadSimpleIcon />
							<Trans>Import Resume</Trans>
						</Button>
						<Button size="sm" onClick={openCreate}>
							<PlusIcon />
							<Trans>Add Block</Trans>
						</Button>
					</>
				}
			/>

			<Separator />

			<div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_220px_auto] lg:items-end">
				<div className="space-y-1.5">
					<Label className="text-muted-foreground text-xs"><Trans>Search</Trans></Label>
					<InputGroup>
						<InputGroupAddon align="inline-start"><MagnifyingGlassIcon /></InputGroupAddon>
						<InputGroupInput value={search} placeholder={t`Search labels, tags, notes, and content...`} onChange={(event) => setSearch(event.target.value)} />
					</InputGroup>
				</div>
				<div className="space-y-1.5">
					<Label className="text-muted-foreground text-xs"><Trans>Block Types</Trans></Label>
					<Combobox
						multiple
						className="w-full"
						value={types}
						options={VAULT_TYPE_OPTIONS}
						placeholder={t`All block types`}
						onValueChange={(value) => setTypes((value ?? []) as VaultItemType[])}
					/>
				</div>
				<div className={cn("space-y-1.5", tagOptions.length === 0 && "hidden")}>
					<Label className="text-muted-foreground text-xs"><Trans>Tags</Trans></Label>
					<Combobox
						multiple
						className="w-full"
						value={tags}
						options={tagOptions}
						placeholder={t`All tags`}
						onValueChange={(value) => setTags(value ?? [])}
					/>
				</div>
				<div className="flex h-9 items-center gap-2 rounded-md border px-3">
					<Switch checked={showArchived} onCheckedChange={setShowArchived} />
					<Label className="whitespace-nowrap"><Trans>Show archived</Trans></Label>
				</div>
			</div>

			{isLoading ? (
				<p className="py-16 text-center text-muted-foreground"><Trans>Loading your Career Vault…</Trans></p>
			) : (items?.length ?? 0) === 0 ? (
				<div className="rounded-2xl border border-dashed p-12 text-center">
					<ArchiveIcon className="mx-auto size-10 text-muted-foreground" />
					<h2 className="mt-4 font-semibold text-lg"><Trans>Your Career Vault is empty</Trans></h2>
					<p className="mx-auto mt-2 max-w-xl text-muted-foreground text-sm">
						<Trans>Import a resume or save blocks from the builder. Then assemble job-specific resumes without copying your history by hand.</Trans>
					</p>
					<div className="mt-5 flex flex-wrap justify-center gap-2">
						<Button variant="outline" onClick={() => setImportOpen(true)}><DownloadSimpleIcon /><Trans>Import Resume</Trans></Button>
						<Button onClick={openCreate}><PlusIcon /><Trans>Add First Block</Trans></Button>
					</div>
				</div>
			) : (
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{items?.map((item) => (
						<article key={item.id} className={cn("group flex min-h-56 flex-col rounded-2xl border bg-card p-4", item.archived && "opacity-60")}>
							<div className="flex items-start gap-3">
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant="outline">{VAULT_TYPE_LABELS[item.type]}</Badge>
										{item.archived && <Badge variant="secondary"><Trans>Archived</Trans></Badge>}
									</div>
									<h2 className="mt-2 line-clamp-2 font-semibold">{item.label}</h2>
								</div>
								<DropdownMenu>
									<DropdownMenuTrigger
										render={
											<Button size="icon" variant="ghost" aria-label={t`Options for ${item.label}`}>
												<DotsThreeVerticalIcon />
											</Button>
										}
									/>
									<DropdownMenuContent align="end">
										<DropdownMenuGroup>
											<DropdownMenuItem onClick={() => { setEditing(item); setFormOpen(true); }}><PencilSimpleLineIcon /><Trans>Edit</Trans></DropdownMenuItem>
											<DropdownMenuItem onClick={() => duplicate.mutate({
												type: item.type,
												label: `${item.label} (Copy)`,
												content: { ...structuredClone(item.content), id: generateId() },
												tags: item.tags,
												notes: item.notes,
												sourceResumeId: null,
												sourceItemId: null,
											})}><CopySimpleIcon /><Trans>Duplicate</Trans></DropdownMenuItem>
										</DropdownMenuGroup>
										<DropdownMenuSeparator />
										<DropdownMenuItem onClick={() => update.mutate({ id: item.id, archived: !item.archived })}>
											{item.archived ? <ArrowCounterClockwiseIcon /> : <ArchiveIcon />}
											{item.archived ? <Trans>Restore</Trans> : <Trans>Archive</Trans>}
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem variant="destructive" onClick={() => void deleteItem(item)}><TrashSimpleIcon /><Trans>Delete</Trans></DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>

							{getVaultContentPreview(item.content) ? (
								<p className="mt-3 line-clamp-4 text-muted-foreground text-sm leading-relaxed">{getVaultContentPreview(item.content)}</p>
							) : (
								<p className="mt-3 text-muted-foreground text-sm italic"><Trans>No description saved.</Trans></p>
							)}

							<div className="mt-auto pt-4">
								{item.tags.length > 0 && <div className="flex flex-wrap gap-1">{item.tags.slice(0, 8).map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>}
								<div className="mt-3 flex items-center justify-between text-muted-foreground text-xs">
									<span><Trans>Version {item.version}</Trans></span>
									<span>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(item.updatedAt))}</span>
								</div>
							</div>
						</article>
					))}
				</div>
			)}

			<VaultItemFormSheet open={formOpen} onOpenChange={setFormOpen} item={editing} />
			<ImportResumeToVaultSheet open={importOpen} onOpenChange={setImportOpen} />
			<TargetedResumeSheet open={targetOpen} onOpenChange={setTargetOpen} />
		</div>
	);
}
