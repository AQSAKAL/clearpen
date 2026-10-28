# @clearpen/editor

Clearpen's editor: CodeMirror 6 with Markdown styling, image previews, focus mode, and the marks the AI features use: ghost text for the next sentence, tracked suggestions with ✓/✕, note underlines and analysis highlights. `createEditor(parent, options)` returns an API for the app; import `@clearpen/editor/editor.css` once.

Tab never leaves the editor by accident. It accepts the ghost text or hint that's showing, otherwise indents a list item, and otherwise does nothing. Esc then Tab moves focus on.

Images render only from `https://` or a relative path such as `media/<hash>.png`, mapped to a displayable URL by the app's `resolveImage`. Other schemes never render.

With `tickers` on (the option, or `setTickers`), each ticker in the prose — `$AAPL`, `NASDAQ:AAPL`, `(NASDAQ: AAPL)` — gets TradingView's `<tv-ticker-tag>` after it, a live price. The editor only places the element; the app loads its script, and until it does the tag shows nothing.
