import type { RouterOutput } from "@/libs/orpc/client";

export type VaultItem = RouterOutput["vault"]["list"][number];
export type VaultMatch = RouterOutput["vault"]["match"][number];
