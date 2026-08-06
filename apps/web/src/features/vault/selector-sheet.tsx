import type { SectionType } from "@reactive-resume/schema/resume/data";
import type { VaultItemType } from "@reactive-resume/schema/vault/data";
import type { VaultItem } from "./types";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { Checkbox } from "@reactive-resume/ui/components/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@reactive-resume/ui/components/input-group";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@reactive-resume/ui/components/sheet";
import { generateId } from "@reactive-resume/utils/string";
import { useUpdateResumeData } from "@/features/resume/builder/draft";
import { createSectionItem } from "@/libs/resume/section-actions";
import { orpc } from "@/libs/orpc/client";
import { VAULT_TYPE_LABELS } from "./constants";
import { getVaultContentPreview } from "./utils";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	type: VaultItemType;
	customSectionId?: string;
	onAddItems?: (items: VaultItem[]) => void;
};

export function VaultSelectorSheet({ open, onOpenChange, type, customSectionId, onAddItems }: Props) {
	const updateResumeData = useUpdateResumeData();
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const { data: items, isLoading } = useQuery(
		orpc.vault.list.queryOptions({ input: { types: [type], includeArchived: false } }),
	);

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return items ?? [];
		return (items ?? []).filter(
			(item) =>
				item.label.toLowerCase().includes(query) ||
				item.tags.some((tag) => tag.toLowerCase().includes(query)) ||
				getVaultContentPreview(item.content).toLowerCase().includes(query),
		);
	}, [items, search]);

	const toggle = (id: string) => {
		setSelected((previous) => (previous.includes(id) ? previous.filter((itemId) => itemId !== id) : [...previous, id]));
	};

	const close = () => {
		setSelected([]);
		setSearch("");
		onOpenChange(false);
	};

	const addSelected = () => {
		const chosen = (items ?? []).filter((item) => selected.includes(item.id));
		if (chosen.length === 0) return;
		if (onAddItems) {
			onAddItems(chosen);
		} else {
			updateResumeData((draft) => {
				for (const item of chosen) {
					const content = { ...structuredClone(item.content), id: generateId(), hidden: false };
					if (type === "summary") draft.summary.content = (content as { content: string }).content;
					else createSectionItem(draft, type as SectionType, content as Record<string, unknown>, customSectionId);
				}
			});
		}
		toast.success(
			chosen.length === 1 ? t`Added one Vault block to this resume.` : t`Added ${chosen.length} Vault blocks to this resume.`,
		);
		close();
	};

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (next) onOpenChange(true);
				else close();
			}}
		>
			<SheetContent side="right" className="w-full gap-0 data-[side=right]:sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>
						<Trans>Add from Career Vault</Trans>
					</SheetTitle>
					<SheetDescription>
						<Trans>Select reusable {VAULT_TYPE_LABELS[type].toLowerCase()} blocks for this resume.</Trans>
					</SheetDescription>
				</SheetHeader>

				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pb-4">
					<InputGroup>
						<InputGroupAddon align="inline-start">
							<MagnifyingGlassIcon />
						</InputGroupAddon>
						<InputGroupInput
							value={search}
							placeholder={t`Search Vault blocks...`}
							onChange={(event) => setSearch(event.target.value)}
						/>
					</InputGroup>

					<div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
						{isLoading && <p className="py-8 text-center text-muted-foreground text-sm"><Trans>Loading Vault…</Trans></p>}
						{!isLoading && filtered.length === 0 && (
							<div className="rounded-xl border border-dashed p-8 text-center">
								<p className="font-medium"><Trans>No matching Vault blocks</Trans></p>
								<p className="mt-1 text-muted-foreground text-sm">
									<Trans>Save an item from the resume builder or create one in Career Vault.</Trans>
								</p>
							</div>
						)}
						{filtered.map((item) => {
							const checked = selected.includes(item.id);
							return (
								<div
									key={item.id}
									className="flex w-full items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/40"
								>
									<Checkbox
										checked={checked}
										onCheckedChange={() => toggle(item.id)}
										aria-label={t`Select ${item.label}`}
									/>
									<button type="button" className="min-w-0 flex-1 text-left" onClick={() => toggle(item.id)}>
										<p className="truncate font-medium text-sm">{item.label}</p>
										{getVaultContentPreview(item.content) && (
											<p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
												{getVaultContentPreview(item.content)}
											</p>
										)}
										{item.tags.length > 0 && (
											<div className="mt-2 flex flex-wrap gap-1">
												{item.tags.slice(0, 5).map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
											</div>
										)}
									</button>
								</div>
							);
						})}
					</div>
				</div>

				<SheetFooter>
					<Button variant="ghost" onClick={close}><Trans>Cancel</Trans></Button>
					<Button disabled={selected.length === 0} onClick={addSelected}>
						<Trans>Add Selected ({selected.length})</Trans>
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
