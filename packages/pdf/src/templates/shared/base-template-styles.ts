import type { Style } from "@react-pdf/types";
import type { Picture, ResumeData } from "@reactive-resume/schema/resume/data";
import type { getTemplateMetrics } from "./metrics";
import type { createRtlStyleHelpers } from "./rtl";
import { rgbaStringToHex } from "@reactive-resume/utils/color";

type BaseTemplateStylesInput = {
	metadata: ResumeData["metadata"];
	foreground: string;
	background: string;
	r: ReturnType<typeof createRtlStyleHelpers>;
	metrics: ReturnType<typeof getTemplateMetrics>;
	picture: Picture;
};

/**
 * Returns the ~20 byte-identical style slots shared by all 15 templates as plain objects.
 * Each template spreads the result into its own StyleSheet.create() call and overrides only
 * the slots that differ (heading fontWeight, bold fallback, inline gap, picture extras, etc.).
 *
 * ponytail: factory returns plain objects, not StyleSheet.create'd; each template does one
 * StyleSheet.create pass so the final resolved styles are identical to before.
 */
export function createBaseTemplateStyles({
	metadata,
	foreground,
	background,
	r,
	metrics,
	picture,
}: BaseTemplateStylesInput) {
	const bodyText = {
		fontFamily: metadata.typography.body.fontFamily,
		fontSize: metadata.typography.body.fontSize,
		fontWeight: metadata.typography.body.fontWeights[0] ?? "400",
		lineHeight: metadata.typography.body.lineHeight,
		color: foreground,
		...r.text,
	} satisfies Style;

	return {
		page: {
			color: foreground,
			backgroundColor: background,
			fontFamily: metadata.typography.body.fontFamily,
			fontSize: metadata.typography.body.fontSize,
			lineHeight: metadata.typography.body.lineHeight,
			direction: r.pageDirection,
		} satisfies Style,

		/** The canonical body text style; alias for `text` in StyleSheet slots. */
		text: bodyText,

		heading: {
			fontFamily: metadata.typography.heading.fontFamily,
			fontSize: metadata.typography.heading.fontSize,
			/** Default fallback "600". bronzor uses fontWeights[0]??"500"; scizor uses .at(-1)??"700". */
			fontWeight: metadata.typography.heading.fontWeights.at(-1) ?? "600",
			lineHeight: metadata.typography.heading.lineHeight,
			color: foreground,
			...r.text,
		} satisfies Style,

		div: {
			rowGap: metrics.gapY(0.125),
			columnGap: metrics.gapX(1 / 3),
		} satisfies Style,

		/** Default gap = gapX(1/3). chikorita overrides to gapX(0.25). */
		inline: {
			flexDirection: r.row,
			alignItems: "center",
			columnGap: metrics.gapX(1 / 3),
		} satisfies Style,

		link: {
			textDecoration: "none",
			color: foreground,
		} satisfies Style,

		small: {
			fontSize: metadata.typography.body.fontSize * 0.875,
		} satisfies Style,

		/** Default fallback "600". scizor overrides to "700". */
		bold: {
			fontWeight: metadata.typography.body.fontWeights.at(-1) ?? "600",
		} satisfies Style,

		richParagraph: {
			margin: 0,
			...bodyText,
		} satisfies Style,

		richListItemRow: {
			// Keep list rows constrained to the printable column. Without an explicit
			// width Yoga can size the row from its contents and let long bullets push
			// beyond the page edge.
			flexDirection: "row",
			columnGap: metrics.gapX(1 / 3),
			alignItems: "flex-start",
			width: "100%",
			maxWidth: "100%",
			minWidth: 0,
			flexShrink: 1,
		} satisfies Style,

		richListItemMarker: {
			// bodyText spread first so `textAlign` below isn't clobbered by bodyText.textAlign.
			...bodyText,
			width: metadata.typography.body.fontSize,
			textAlign: r.listMarkerTextAlign,
			alignSelf: "stretch",
			flexShrink: 0,
		} satisfies Style,

		richListItemContent: {
			// A zero flex-basis is important here: it makes the text consume only the
			// space remaining after the marker instead of using its intrinsic width.
			...bodyText,
			flexBasis: 0,
			flexGrow: 1,
			flexShrink: 1,
			minWidth: 0,
			maxWidth: "100%",
		} satisfies Style,

		splitRow: {
			// Split headers (company/location, title/date, etc.) must never grow wider
			// than their containing column. flexWrap can then move the trailing value
			// to the next line instead of allowing it to escape the page.
			flexDirection: r.row,
			flexWrap: "wrap",
			alignItems: "flex-start",
			justifyContent: "space-between",
			columnGap: metrics.gapX(2 / 3),
			width: "100%",
			maxWidth: "100%",
			minWidth: 0,
			flexShrink: 1,
		} satisfies Style,

		alignEnd: { ...r.alignEnd } satisfies Style,

		/**
		 * Standard picture style shared by 14/15 templates.
		 * ditto overrides: spread this and add `position: "absolute"`, `top`, `left`, `marginLeft`.
		 */
		picture: {
			width: picture.size,
			height: picture.size,
			objectFit: "cover",
			aspectRatio: picture.aspectRatio,
			borderRadius: picture.borderRadius,
			borderColor: rgbaStringToHex(picture.borderColor),
			borderWidth: picture.borderWidth,
			shadowColor: rgbaStringToHex(picture.shadowColor),
			shadowWidth: picture.shadowWidth,
			transform: `rotate(${picture.rotation}deg)`,
		},
	};
}
