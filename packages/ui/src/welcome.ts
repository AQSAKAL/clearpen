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

Typos are fixed as you go: a capital to start each sentence the moment you finish its first word, and slips like “mi favorite” once you finish the sentence. A fix is underlined for a moment; **${mod}Z** right after puts back what you typed, and Margin leaves those words alone.

## Check it

- **Review** (${mod}⇧E) reads the whole draft. Margin's own checks come first: table totals, percentages, contradictions, sweeping claims. The AI's notes follow, each beside the passage it's about. Click a note to see its passage, then *Apply* its fix or dismiss it.
- **Check ▾** on a selection fact-checks it, tests its logic or compares it with the rest of the draft. A correction is shown only if the model stands by it when asked again.
- **The word count** opens Insights: reading level, long sentences, passive voice, and the phrases that make writing sound machine-made.

## Start here

- **New article** in the sidebar starts a blank page. Your work saves as you type.
- **Projects** group articles — a blog, a book, a series. Drag an article onto a project to move it, or right-click it.
- **Markdown** shapes the text: \`#\` for a heading, \`**bold**\`, \`*italic*\`, \`-\` for a list, \`>\` for a quote. Paste or drop an image to add it.
- **${mod}S** saves a version you can go back to, and Margin saves one every ten minutes and before any AI edit. Find them under ⋯ → Version history.
- **${mod}⇧P** shows the article the way a reader will see it; **${mod}.** dims everything but the paragraph you're in.
- **The model** at the bottom of the sidebar is the AI on this computer. Click it to choose which model does which job.

## Coming next

Thinking aids for planning a section, Ask, and help with publishing arrive in the next updates of this build. Margin edits; the writing itself is yours.

When you're done here, press **New article** and write something of your own.
`;
