import { protectedProcedure } from "../../context";
import { vaultDto } from "../../dto/vault";
import { resumeMutationRateLimit } from "../../middleware/rate-limit";
import { vaultService } from "../vault/service";

export const applicationIntelligenceRouter = {
	analyze: protectedProcedure
		.route({
			method: "POST",
			path: "/applications/{applicationId}/career-analysis",
			tags: ["Applications"],
			operationId: "analyzeApplicationCareerMatch",
		})
		.input(vaultDto.applicationAnalysis.input)
		.use(resumeMutationRateLimit)
		.output(vaultDto.applicationAnalysis.output)
		.handler(({ input, context }) => vaultService.analyzeApplication({ userId: context.user.id, ...input })),

	get: protectedProcedure
		.route({
			method: "GET",
			path: "/applications/{applicationId}/career-analysis",
			tags: ["Applications"],
			operationId: "getApplicationCareerMatch",
		})
		.input(vaultDto.getApplicationAnalysis.input)
		.output(vaultDto.getApplicationAnalysis.output)
		.handler(({ input, context }) => vaultService.getApplicationAnalysis({ userId: context.user.id, ...input })),
};
