import { RichTextEditor } from "@/features/resume/editor/write/rich-text-editor";

type Props = {
	value: string;
	onChange: (value: string) => void;
	label?: string;
	className?: string;
	disabled?: boolean;
};

export function RichInput({ value, onChange, label = "Rich text", className, disabled }: Props) {
	return (
		<RichTextEditor
			label={label}
			value={value}
			onChange={onChange}
			{...(className !== undefined ? { className } : {})}
			{...(disabled !== undefined ? { disabled } : {})}
		/>
	);
}
