# @clearpen/editor

Clearpen's editor: CodeMirror 6 with rendered Markdown, image previews, focus mode, and the marks the AI features use: ghost text for the next sentence, tracked suggestions with ✓/✕, note underlines and analysis highlights. `createEditor(parent, options)` returns an API for the app; import `@clearpen/editor/editor.css` once.

Tab never leaves the editor by accident. It accepts the ghost text or hint that's showing, otherwise indents a list item, and otherwise does nothing. Esc then Tab moves focus on.

Images render only from `https://` or a relative path such as `media/<hash>.png`, mapped to a displayable URL by the app's `resolveImage`. Other schemes never render.

With `tickers` on (the option, or `setTickers`), each ticker in the prose — `$AAPL`, `NASDAQ:AAPL`, `(NASDAQ: AAPL)` — gets TradingView's `<tv-ticker-tag>` after it, a live price. The editor only places the element; the app loads its script, and until it does the tag shows nothing.


Markdown is rendered, not shown as source. Heading and quote markers recede; a link shows its words, not its URL; bold, italic, strikethrough and inline code are styled. At the point being edited, the syntax comes back: a heading or quote marker at the start of its line, a link while the caret is inside it, inline code while the caret is inside it. Tables stay tables while their cells are edited; the edits are written back to the Markdown when focus leaves the table (or when a save reads the text). The document is still the Markdown string, so offsets, suggestions and exports are unchanged.