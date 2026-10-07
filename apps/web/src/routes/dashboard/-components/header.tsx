import type { ComponentType, ReactNode } from "react";

type Props = {
	icon?: ComponentType<{ className?: string }>;
	title: ReactNode;
	actions?: ReactNode;
};

export function DashboardHeader({ icon: Icon, title, actions }: Props) {
	return (
		<header className="flex flex-wrap items-center justify-between gap-3">
			<div className="flex items-center gap-2">
				{Icon && <Icon className="size-7 text-ink-2" />}
				<h1 className="font-display text-[30px] leading-9 font-medium">{title}</h1>
			</div>
			{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
		</header>
	);
}
