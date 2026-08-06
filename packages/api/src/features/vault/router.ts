import { protectedProcedure } from "../../context";
import { vaultDto } from "../../dto/vault";
import { resumeMutationRateLimit } from "../../middleware/rate-limit";
import { vaultService } from "./service";

export const vaultRouter = {
	list: protectedProcedure
		.route({ method: "GET", path: "/vault", tags: ["Vault"], operationId: "listVaultItems" })
		.input(vaultDto.list.input)
		.output(vaultDto.list.output)
		.handler(({ input, context }) => vaultService.list({ userId: context.user.id, ...input })),


	tags: protectedProcedure
		.route({ method: "GET", path: "/vault/tags", tags: ["Vault"], operationId: "listVaultTags" })
		.input(vaultDto.tags.input)
		.output(vaultDto.tags.output)
		.handler(({ context }) => vaultService.tags({ userId: context.user.id })),

	getById: protectedProcedure
		.route({ method: "GET", path: "/vault/{id}", tags: ["Vault"], operationId: "getVaultItem" })
		.input(vaultDto.getById.input)
		.output(vaultDto.getById.output)
		.handler(({ input, context }) => vaultService.getById({ id: input.id, userId: context.user.id })),

	create: protectedProcedure
		.route({ method: "POST", path: "/vault", tags: ["Vault"], operationId: "createVaultItem" })
		.input(vaultDto.create.input)
		.use(resumeMutationRateLimit)
		.output(vaultDto.create.output)
		.handler(({ input, context }) => vaultService.create({ userId: context.user.id, ...input })),

	update: protectedProcedure
		.route({ method: "PUT", path: "/vault/{id}", tags: ["Vault"], operationId: "updateVaultItem" })
		.input(vaultDto.update.input)
		.use(resumeMutationRateLimit)
		.output(vaultDto.update.output)
		.handler(({ input, context }) => vaultService.update({ userId: context.user.id, ...input })),

	delete: protectedProcedure
		.route({ method: "DELETE", path: "/vault/{id}", tags: ["Vault"], operationId: "deleteVaultItem" })
		.input(vaultDto.delete.input)
		.use(resumeMutationRateLimit)
		.output(vaultDto.delete.output)
		.handler(({ input, context }) => vaultService.delete({ id: input.id, userId: context.user.id })),

	bulkUpdate: protectedProcedure
		.route({ method: "POST", path: "/vault/bulk-update", tags: ["Vault"], operationId: "bulkUpdateVaultItems" })
		.input(vaultDto.bulkUpdate.input)
		.use(resumeMutationRateLimit)
		.output(vaultDto.bulkUpdate.output)
		.handler(({ input, context }) => vaultService.bulkUpdate({ userId: context.user.id, ...input })),

	bulkDelete: protectedProcedure
		.route({ method: "POST", path: "/vault/bulk-delete", tags: ["Vault"], operationId: "bulkDeleteVaultItems" })
		.input(vaultDto.bulkDelete.input)
		.use(resumeMutationRateLimit)
		.output(vaultDto.bulkDelete.output)
		.handler(({ input, context }) => vaultService.bulkDelete({ userId: context.user.id, ...input })),

	importFromResume: protectedProcedure
		.route({ method: "POST", path: "/vault/import-resume", tags: ["Vault"], operationId: "importResumeIntoVault" })
		.input(vaultDto.importFromResume.input)
		.use(resumeMutationRateLimit)
		.output(vaultDto.importFromResume.output)
		.handler(({ input, context }) => vaultService.importFromResume({ userId: context.user.id, ...input })),

	match: protectedProcedure
		.route({ method: "POST", path: "/vault/match", tags: ["Vault"], operationId: "matchVaultToJob" })
		.input(vaultDto.match.input)
		.output(vaultDto.match.output)
		.handler(({ input, context }) => vaultService.match({ userId: context.user.id, ...input })),

	createResume: protectedProcedure
		.route({ method: "POST", path: "/vault/create-resume", tags: ["Vault"], operationId: "createResumeFromVault" })
		.input(vaultDto.createResume.input)
		.use(resumeMutationRateLimit)
		.output(vaultDto.createResume.output)
		.handler(({ input, context }) => vaultService.createResume({ userId: context.user.id, locale: context.locale, ...input })),
};
