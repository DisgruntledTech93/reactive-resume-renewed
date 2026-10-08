import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { toast } from "@reactive-resume/ui/components/toast";
import { generateId } from "@reactive-resume/utils/string";
import { RichTextEditor } from "./rich-text-editor";
import { VaultSelectorSheet } from "@/features/vault/selector-sheet";
import { orpc } from "@/libs/orpc/client";
import { useCurrentBuilderResumeSelector, useUpdateResumeData } from "@/features/resume/builder/draft";

/** The summary: one rich text, with the guidance the spec gives. Improve joins it in M10. */
export function SummaryEditor({ locked }: { locked: boolean }) {
	const content = useCurrentBuilderResumeSelector((resume) => resume.data.summary.content);
	const updateResumeData = useUpdateResumeData();
	const queryClient = useQueryClient();
	const [vaultOpen, setVaultOpen] = useState(false);
	const saveToVault = useMutation(
		orpc.vault.create.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries();
				toast.add({ type: "success", description: t`Summary saved to your Career Vault.` });
			},
			onError: (error) =>
				toast.add({ type: "error", description: error.message || t`Couldn't save this summary.` }),
		}),
	);

	return (
		<div className="grid gap-2">
			<RichTextEditor
				label={t`Summary`}
				value={content}
				disabled={locked}
				hint={<Trans>2–3 sentences reads best</Trans>}
				onChange={(html) =>
					updateResumeData(
						(draft) => {
							draft.summary.content = html;
						},
						{ coalesceKey: "summary.content" },
					)
				}
			/>
			{!locked && (
				<div className="grid grid-cols-2 gap-2">
					<Button
						variant="secondary"
						size="sm"
						disabled={!content.trim() || saveToVault.isPending}
						onClick={() =>
							saveToVault.mutate({
								type: "summary",
								label: "Professional Summary",
								content: { id: generateId(), hidden: false, content },
							})
						}
					>
						<Icon name="auto_awesome" />
						{"Save to Vault"}
					</Button>
					<Button variant="secondary" size="sm" onClick={() => setVaultOpen(true)}>
						<Icon name="add" />
						{"Use Vault Summary"}
					</Button>
				</div>
			)}
			<VaultSelectorSheet open={vaultOpen} onOpenChange={setVaultOpen} type="summary" />
		</div>
	);
}
