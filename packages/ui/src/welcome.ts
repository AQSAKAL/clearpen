// The first article a new writer sees: a short tour of what's here.

export const WELCOME_TITLE = 'Welcome to Margin';

export const welcomeText = (
  mod: string,
) => `Margin is a quiet place to write articles. Everything stays on this computer: your library is one file, and Margin works without an internet connection.

## Try it on this paragraph

In today's fast-paced world, it is very important for writers to basically make sure that the things they write are able to be understood by the people who are reading them, because if they are not understood then the point of writing them is lost.

**Select the paragraph above** and choose *Shorten* or *Improve*. Only the words that change are marked: click ✓ or ✕ on each, press ${mod}↵ to accept them all, or Esc to keep your original. You can also type an instruction in the bar, such as “make it punchier”.

## Keep the logic whole

Finish a sentence and pause. Margin checks whether your paragraph has made its point, given a reason and said why it matters. If something is missing, the one sentence that supplies it appears in grey: **Tab** keeps it, **${mod}→** takes one word, and typing on ignores it. When the paragraph is complete you'll see *¶ point made*, and Tab starts a new one. **${mod}J** asks for a suggestion at any time, and ⋯ → Next-sentence suggestions turns them off.

## Start here

- **New article** in the sidebar starts a blank page. Your work saves as you type.
- **Projects** group articles — a blog, a book, a series. Drag an article onto a project to move it, or right-click it.
- **Markdown** shapes the text: \`#\` for a heading, \`**bold**\`, \`*italic*\`, \`-\` for a list, \`>\` for a quote. Paste or drop an image to add it.
- **${mod}S** saves a version you can go back to, and Margin saves one every ten minutes and before any AI edit. Find them under ⋯ → Version history.
- **${mod}⇧P** shows the article the way a reader will see it; **${mod}.** dims everything but the paragraph you're in.
- **The model** at the bottom of the sidebar is the AI on this computer. Click it to choose which model does which job.

## Coming next

Checks of your facts, logic and numbers, an editor's review, and thinking aids for planning a section arrive in the next updates of this build. Margin edits; the writing itself is yours.

When you're done here, press **New article** and write something of your own.
`;
