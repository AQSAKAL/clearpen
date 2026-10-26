// The first article a new writer sees: a short tour of what's here.

export const WELCOME_TITLE = 'Welcome to Margin';

export const welcomeText = (
  mod: string,
) => `Margin is a quiet place to write articles. Everything stays on this computer: your library is one file, and Margin works without an internet connection.

## Start here

- **New article** in the sidebar starts a blank page. Your work saves as you type.
- **Projects** group articles — a blog, a book, a series. Drag an article onto a project to move it, or right-click it.
- **Markdown** shapes the text: \`#\` for a heading, \`**bold**\`, \`*italic*\`, \`-\` for a list, \`>\` for a quote. Paste or drop an image to add it.
- **${mod}S** saves a version you can go back to, and Margin saves one every ten minutes. Find them under ⋯ → Version history.
- **${mod}⇧P** shows the article the way a reader will see it; **${mod}.** dims everything but the paragraph you're in.

## Coming next

The editor in the margin arrives in the next updates of this build: pinpoint edits you accept or reject, checks of your facts, logic and numbers, an editor's review, and the next logical sentence when a paragraph is missing one. Margin edits; the writing itself is yours.

When you're done here, press **New article** and write something of your own.
`;
