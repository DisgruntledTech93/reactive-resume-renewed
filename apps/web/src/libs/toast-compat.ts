import { toast as baseToast } from "@reactive-resume/ui/components/toast";

export const toast = {
	success(description: string) {
		baseToast.add({ type: "success", description });
	},
	error(description: string) {
		baseToast.add({ type: "error", description });
	},
};
