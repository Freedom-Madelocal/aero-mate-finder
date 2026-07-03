The PDF drawer is capped by the shared Sheet component’s built-in responsive class: `sm:max-w-sm`. Even though `TdsPdfViewer` sets `width: 60vw` to `100vw`, the component still applies a max-width of about 24rem on larger screens, so dragging appears to stop early and the PDF gets cut off.

Plan:
1. Override the Sheet max-width in `TdsPdfViewer` so the drawer can actually honor its dynamic `widthVw` value up to full viewport width.
2. Keep the current default width at 60vw and keep the existing minimum width so it does not collapse smaller than intended.
3. Keep the resize handle and maximize/restore button behavior, but ensure both use the real drawer width instead of being constrained by the underlying Sheet styles.
4. Verify in the preview that the drawer expands past the screenshot width and can reach near/full screen without cutting off the PDF.