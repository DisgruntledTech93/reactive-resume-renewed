import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
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
import { Combobox } from "@/components/ui/combobox";
import { orpc } from "@/libs/orpc/client";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function ImportResumeToVaultSheet({ open, onOpenChange }: Props) {
	const queryClient = useQueryClient();
	const [resumeId, setResumeId] = useState("");
	const { data: resumes } = useQuery(orpc.resume.list.queryOptions());
	const options = (resumes ?? []).map((resume) => ({ value: resume.id, label: resume.name }));
	const importResume = useMutation(
		orpc.vault.importFromResume.mutationOptions({
			onSuccess: (result) => {
				void queryClient.invalidateQueries({ queryKey: orpc.vault.list.queryKey() });
				void queryClient.invalidateQueries({ queryKey: orpc.vault.tags.queryKey() });
				toast.success(`Imported ${result.imported} new blocks and refreshed ${result.updated} existing blocks.`);
				setResumeId("");
				onOpenChange(false);
			},
			onError: (error) => toast.error(error.message || `Couldn't import this resume.`),
		}),
	);

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) setResumeId("");
				onOpenChange(next);
			}}
		>
			<SheetContent side="right" className="w-full data-[side=right]:sm:max-w-md">
				<SheetHeader>
					<SheetTitle>{"Import Resume into Vault"}</SheetTitle>
					<SheetDescription>
						{"Copy every reusable section item into your Career Vault. Re-importing refreshes blocks from that resume."}
					</SheetDescription>
				</SheetHeader>
				<div className="flex-1 space-y-2 px-4">
					<Label>{"Resume"}</Label>
					<Combobox
						className="w-full"
						value={resumeId}
						options={options}
						placeholder={`Select a resume`}
						onValueChange={(value) => setResumeId(value ?? "")}
					/>
					<p className="text-muted-foreground text-xs">
						{"Your original resume is not changed. Imported blocks stay editable in the Vault."}
					</p>
				</div>
				<SheetFooter>
					<Button
						variant="ghost"
						onClick={() => {
							setResumeId("");
							onOpenChange(false);
						}}
					>
						{"Cancel"}
					</Button>
					<Button disabled={!resumeId || importResume.isPending} onClick={() => importResume.mutate({ resumeId })}>
						{"Import Blocks"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
