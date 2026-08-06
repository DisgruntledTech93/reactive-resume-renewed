import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { ArchiveIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@reactive-resume/ui/components/button";
import { generateId } from "@reactive-resume/utils/string";
import { RichInput } from "@/components/input/rich-input";
import { useCurrentBuilderResumeSelector, useUpdateResumeData } from "@/features/resume/builder/draft";
import { VaultSelectorSheet } from "@/features/vault/selector-sheet";
import { orpc } from "@/libs/orpc/client";
import { SectionBase } from "../shared/section-base";

export function SummarySectionBuilder() {
	const section = useCurrentBuilderResumeSelector((resume) => resume.data.summary);
	const updateResumeData = useUpdateResumeData();
	const queryClient = useQueryClient();
	const [vaultOpen, setVaultOpen] = useState(false);
	const saveToVault = useMutation(
		orpc.vault.create.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: orpc.vault.list.queryKey() });
				toast.success(t`Summary saved to your Career Vault.`);
			},
			onError: (error) => toast.error(error.message || t`Couldn't save this summary.`),
		}),
	);

	const onChange = (value: string) => {
		updateResumeData((draft) => {
			draft.summary.content = value;
		});
	};

	return (
		<SectionBase type="summary">
			<RichInput value={section.content} onChange={onChange} />
			<div className="mt-2 grid grid-cols-2 overflow-hidden rounded-md border">
				<Button
					variant="ghost"
					className="rounded-none border-e"
					disabled={!section.content.trim() || saveToVault.isPending}
					onClick={() =>
						saveToVault.mutate({
							type: "summary",
							label: "Professional Summary",
							content: { id: generateId(), hidden: false, content: section.content },
							tags: [],
							notes: null,
							sourceResumeId: null,
							sourceItemId: null,
						})
					}
				>
					<ArchiveIcon />
					<Trans>Save to Vault</Trans>
				</Button>
				<Button variant="ghost" className="rounded-none" onClick={() => setVaultOpen(true)}>
					<PlusIcon />
					<Trans>Use Vault Summary</Trans>
				</Button>
			</div>
			<VaultSelectorSheet open={vaultOpen} onOpenChange={setVaultOpen} type="summary" />
		</SectionBase>
	);
}
