# Clear writing: what the literature says, and what Clearpen does with it

*Research synthesis, 27 October 2026. Six readings, one per file in [sources/](sources/), each with the principles, the author's reasons, examples and a detection recipe. This document is the short version: the principles Clearpen adopts, where each comes from, and what in the app enforces it.*

| Reading | Who, what | Notes |
|---|---|---|
| Gopen & Swan, *The Science of Scientific Writing* (1990) | reader-expectation linguistics for scientists | [01-gopen-swan.md](sources/01-gopen-swan.md) |
| Fenton, *Improving your technical writing skills* (2003) | plain-English rules with word tables | [02-fenton.md](sources/02-fenton.md) |
| Eisenberg, *Guide to Technical Editing* (1992), with the JPL *Levels of Edit* | how an editor works on an author's text | [03-eisenberg.md](sources/03-eisenberg.md) |
| Graham, *Write Simply*, *Write Like You Talk*, *How to Write Usefully*; Chapin's reply | simplicity, strength, and what simplicity misses | [04-graham-chapin.md](sources/04-graham-chapin.md) |
| Hobbs on clarity; Menary, *Writing as Thinking*; Galbraith, *Cognitive Models of Writing* | what clarity is, and what writing does to thought | [05-hobbs-menary-cognitive.md](sources/05-hobbs-menary-cognitive.md) |
| Pak, *How to write a clear math paper*; Halevi, *Writing Clear Conference Submissions* | the reader who skims a technical paper | [06-pak-halevi.md](sources/06-pak-halevi.md) |

Three readings needed care. Fenton has no readability formula and no sentence-length number, whatever the folklore says. Halevi's reviewer has "a few hours", not thirty minutes. Eisenberg's book could not be read; its notes reconstruct the method from the publisher, a long first-hand review, the scan's structure and the JPL framework she works within, and they say so line by line.

## 1. The stance

The readings agree on more than the rules. Four things frame everything below.

**Readers take meaning from position.** Gopen & Swan's finding is that a sentence's shape tells the reader what to stress and what to skip before they have understood a word of it. Where the subject sits, where the verb arrives, what the sentence ends on: these decide the interpretation. Vocabulary and length are secondary. "We have striven not for simplification but for clarification."

**Clarity has levels, and the sentence is the lowest.** Hobbs ranks presentational clarity (are the ideas and the argument thought through) above text structure above sentence polish; Kant fails the third and remains Kant. Eisenberg's field says the same as procedure: edit at the deepest level first, because polishing a sentence that will be cut is wasted work. For a tool, that is an ordering rule: argument notes before structure notes before sentence notes, and no sentence notes on a paragraph that has not yet made its point.

**The draft is the writer's thinking, not its record.** Menary's thesis is that manipulating written sentences is part of cognition; Galbraith's models locate the writer's ideas in the act of formulating them; Hobbs's "Beethovians" use the page as an extension of mind. So a tool that rewrites the writer's sentences on its own initiative is doing their thinking. Clearpen's existing posture, proposals accepted one at a time and never a drafted paragraph, is what these texts prescribe. They add two rules: intervene at read-back moments, never inside a sentence being written; and prefer views and questions to answers.

**Principles, not rules.** Gopen & Swan: "our best stylists turn out to be our most skillful violators." Graham: fancy words are fine on purpose, never by accident. Chapin: what reads as a violation (a lone "very", mixed contractions, a repeated word) is often the voice. Every finding below is therefore phrased as what a reader will do at that passage, is dismissed with one click, and is capped so a long draft gets a sample rather than a flood.

## 2. The principles, and what enforces them

Each entry: the principle, where it comes from, and what in Clearpen applies it. "Code" is a deterministic check in `packages/core/src/style.ts`, shown as a margin note labelled "from Clearpen's rules"; "prompt" is the instruction the model gets in `prompts.ts`.

### 2.1 Keep the subject next to its verb

A reader holds a sentence open until the verb arrives and reads anything in between as an aside, however important. If the aside matters, it gets its own sentence; if not, it goes. (Gopen & Swan, principle 1.)

- **Code:** `interruption` measures the words inside bracketed, dashed or comma-set asides before the first finite verb; ten or more in one aside, or fourteen in total, earns a note naming the count and the verb.
- **Prompt:** the first line of `EDITING_PRINCIPLES`; the **Clarify** action moves a long aside into its own sentence; the reading lens has the verdict "subject far from verb".

### 2.2 End on the point

Readers stress whatever a sentence ends on. A sentence that trails off on "as well", "respectively" or "as discussed above" tells the reader to stress nothing, or the wrong thing. (Gopen & Swan, principle 2.) Length is not the problem: a sentence is too long when it carries more stress-worthy items than it has places of closure. (Principle 8.)

- **Code:** `weak-ending` flags a closing afterthought, at most two per paragraph; a closing citation is exempt. `count-mismatch` catches "three reasons:" above a list of four, the flag-word mechanism of the paper's "both".
- **Prompt:** "end on the new point"; Shorten is told to split at a closure rather than delete, and to keep the last sentence of a paragraph.

### 2.3 Old before new, and whose story

Open a sentence on what the previous sentence established; put the new information at the end. A paragraph is a story about whoever keeps appearing in its openings; if every sentence opens on something new, no two readers build the same story. Misplaced old and new is, in the authors' experience, "the No. 1 problem" in professional writing, and it comes from drafting linearly: the new thought is written down first and the context added later. (Gopen & Swan, principles 3, 4, 6 and the "logical gap".)

- **Code:** `new-before-old` compares a sentence's opening and closing content words with the two sentences before it; `topic-shift` lists the openers of a paragraph whose sentences each start on something unseen; `no-link` marks a sentence that shares nothing with the two before it. One structural note per paragraph, since attending to one problem leads to the others.
- **View:** the **Skeleton** in Insights lists each sentence by its opening words and its verb, the diagnosis the paper itself performs on its examples.
- **Prompt:** the next-sentence writer is told to pick up the idea the last sentence ended on; the review's second level is this; the reading lens has "new before old" and "no link back".

### 2.4 Put the action in the verb

"The addition of egg extract has two effects" hides the action in "addition" and gives the reader a verb that does nothing. Readers expect the verb to carry the action; when it does not, they guess. (Gopen & Swan, principle 5; Fenton's "noun constructs".)

- **Code:** `hidden-action` turns forty fixed idioms into their verbs as one-click edits ("made a decision" → "decided", "has an effect on" → "affects"), rewrites "the analysis of X was performed by Y" as "Y analysed X", and `weak-verb` flags a sentence whose verb is a form of *be* or *have* while two of its nouns are verbs in disguise, naming the verbs.
- **View:** the Skeleton shows a sentence's verb only when it is *is*, *has* or *does*, so a paragraph told in such verbs is visible at a glance.

### 2.5 Plain words, and one name per thing

"Utilise" is "use"; "prior to" is "before"; "in the event that" is "if". A pompous word costs the reader and tells them nothing. The school rule against repeating a word is wrong for technical prose: the same thing keeps the same name, and ten "therefore"s are fine. (Fenton's tables 1 and 2, his legalisms and redundancies; Pak; Graham's written-only words.)

- **Code:** `plain` carries Fenton's word tables, stock phrases, legalisms, abstract wrappers ("of a satisfactory nature"), redundancies ("visibly see", "located in"), "he/she", "should of", the decade apostrophe and the "etc." after "such as", each as a one-click edit. The replacement keeps a sentence-initial capital.
- **Prompt:** "Never vary a word for variety: the same thing keeps the same name."
- **Not yet:** a terms list per article that shows every name used for one thing (Fenton's most valuable and least automated rule).

### 2.6 A list is shown as a list

Steps or items told in prose, with "first", "then", "another", "finally", hide a structure the reader has to rebuild. (Fenton.)

- **Code:** `hidden-list` flags three or more such sentences in one paragraph, numbered if the order matters.

### 2.7 Define before use

An initialism the reader meets before it is spelled out, or never, loses them from that point; Pak's grad student "gives up on page 3". A term introduced once keeps its basic form, with no derived variants. (Fenton; Pak; Halevi; Eisenberg's Language Edit checklist.)

- **Code:** `initials` flags initials used twice or more and never expanded, and initials spelled out only after their first use, quoting the later definition. A list of initials everyone knows is exempt.
- **Not yet:** the same for single-letter symbols and defined terms, with a reminder when a term returns after a long gap.

### 2.8 Strong but true, and hedges that carry information

A claim should be as strong as the truth allows: "somewhere in Colorado" is true and useless, "in the exact middle" is strong and false. Being vague is the easy way to be correct, and a sentence that cannot be disagreed with says nothing. Qualification is a skill, not a tax: "I think" is weaker than the bare claim and that is exactly its information. (Graham, *How to Write Usefully*.)

- **Code:** `says-nothing` is the twin of the existing sweeping-generalisation check: a vaporous phrase ("a complex issue", "many factors", "it depends") in a sentence with no number and no name. `hedge-stack` flags three hedges in one sentence; one is never flagged.
- **Prompt:** the **confident** action cuts only hedges that carry no information; the review is told never to flag "I think".

### 2.9 Simplify the sentence, not the voice

Chapin's observation on Graham's own prose: what makes it work is not the plainness but the texture, a word picked up from the sentence before, one ornate phrase saved for the important sentiment, mixed contractions, a double question. A mechanical "simplify" removes exactly these and produces what Chapin calls GPT-3 copy. (Chapin; Graham's "never by accident".)

- **Prompt:** **Simplify** is now Graham's friend test ("the way the author would say it aloud to a friend") with a list of what to keep; **Shorten** keeps the word the next sentence picks up, every informative hedge and the last sentence of a paragraph, and varies sentence length as the author did.
- **Code:** `same-opener` and `monotone` flag density, never an instance: three sentences opening alike, or four sentences of the same length.
- **Not yet:** a guard on the Simplify diff that drops a change which flattens sentence-length variance or removes a pivot word.

### 2.10 Function before expression

An expert editor judges a paragraph by what it does for the argument before judging how it reads (Hayes; Bereiter & Scardamalia); sentence clarity is the lowest of three levels (Hobbs); real documents have many faults at once and the editor triages (Eisenberg).

- **Prompt:** the review reads at three named levels and reports in that order: the argument, the structure, the sentences. Sentence notes on a paragraph that has not made its point "are not worth making"; before any note, the same call lists the paragraphs that have not yet made their point, by number, with what each is missing.
- **Code:** the engine's exact checks run first and the style findings last, so a wrong figure outranks a weak ending on the same words; the model is handed what code already flagged and told not to repeat it. On a paragraph the model listed as unfinished, `heldBack` holds the sentence-level notes — the style findings, and the model's clarity, concision and style notes — under one note on the paragraph saying what it is missing, shown on request; exact checks and structure notes are never held.

### 2.11 Say what you found, early

Most readers never get past the opening. An abstract or lede that says what the piece will discuss, rather than what it found or argues, tells them nothing the title did not. Pak wants the first theorem on the first page; Halevi wants the reader to know what is new by the end of the introduction; Fenton and Eisenberg call the alternative a descriptive abstract and forbid it. (Pak; Halevi; Fenton; Eisenberg's "informative abstract".)

- **Code:** `descriptive-opening` flags a first paragraph that announces a topic with no claim, number or recommendation anywhere in it.
- **Prompt:** for a scientific, technical, business or investment piece, the review is told to leave a note on the opening when it never states the result or what is new.

### 2.12 The reader who skims

Pak's readers read titles, maybe abstracts, maybe the introduction, and skip to the main result; Halevi's reviewer has a few hours and does not remember earlier sections. Both want the structure described before the details, important things said more than once, pointers forward and back, no detours, no notation where words would do, no tale of how hard the problem was. (Pak; Halevi.)

- **Prompt:** `READERS` gives the review a reader per kind of piece, and the scientific reader is this one.
- **Code:** in the scientific and technical genres, `spatial-ref` flags "the figure below" (figures move when the page is laid out again) and `significant` asks whether the word means a test or just "large". The signposts (`signposts.ts`), in the same genres: `section-opening` flags a section of three paragraphs or more whose first sentence neither says what the section does ("This section…", "We now…", show, prove, describe, compare) nor states a claim with a number, a named thing or a result verb; `vague-pointer` flags "as discussed above", "see below", "later" and "previously" in a sentence that names no section, figure, table or theorem, and names the place itself when only one section lies that way; `no-map` leaves one note on an introduction to four or more sections with no pointer forward ("Section 2", "we first… then…", "the rest of this paper", a list of the parts); and, in the scientific genre only, `hardship` flags a sentence about how hard the problem was ("after many attempts", "surprisingly difficult", "it took us").
- **Not yet:** a notation registry, citation-range and locator checks.

### 2.13 Writing is thinking: views and questions, not answers

Writing helps thinking because sentences become stable objects that can be inspected, compared and rearranged (Menary, after Harris's "autoglottic space"). Knowledge transforms into argument when the writer works from the reader's problem rather than from what they happen to know (Bereiter & Scardamalia). A question joins the writer's own thinking where an answer replaces it (Vygotsky, via Clark). Spontaneous drafting produces ideas planning does not, if left alone (Galbraith).

- **Think aids:** two new kinds. **Steps** lays out the argument as the author's own claim sentences, quoted verbatim, with a question where a step is missing or a reason precedes its claim. **Reader** asks the one question a specific sceptical reader would put, and never answers it. The coach prompt now says why: "a question joins the author's own thinking where an answer would replace it."
- **View:** the Skeleton is the writer's sentences as objects.
- **Already Clearpen's design:** tracked edits, nothing changed unasked, the next sentence only after a finished sentence and a pause, never twice in a row.
- **Not yet:** a free-write mode with every aid off and a discovery pass afterwards; sentence cards to drag into a new order; the brief as five reader questions fed to every judge.

### 2.14 Name the problem, offer the fix, mark rather than retype

Eisenberg's page design is the editor-author relationship: beside every before-and-after sits a *Problem* note and a *Solution*, and often more than one solution. The JPL Language Edit makes every change "for a specific, identifiable reason", never preference, and brings missing material to the author's attention rather than supplying it.

- **Code:** every finding carries a title (the problem) and a message (the reader's reaction and the fix), and a suggestion only where the fix is one-for-one.
- **Prompt:** the reading lens returns a reorder of the author's own words or nothing; the review's "issue" field is defined as what a reader does at the passage.
- **Not yet:** two alternative edits where the change is stylistic rather than corrective (Gopen & Swan's "only the author could tell us which").

### 2.15 Passive voice is a position, not an error

"Pollen is dispersed by bees" is the better sentence in a paragraph about pollen. Fenton's exception ("the city was destroyed by constant bombing") is the same point. The question is who should occupy the opening of the sentence.

- **Prompt:** Fix grammar never converts a passive; Clarify and Improve keep one that keeps the paragraph's subject at the front; the **active** action names the doer.
- **Code:** no new passive check. The existing Insights highlight remains a highlight, not a finding.

## 3. What this change adds to Clearpen

| Where | What |
|---|---|
| `packages/core/src/style.ts` | the checks above, as `styleFindings(text, genre)`; `skeleton(text)`; `topicPosition`, `stressPosition`, `stem` for other code |
| `packages/core/src/checks.ts` | a `scientific` genre; style findings appended after the exact checks |
| `packages/core/src/prompts.ts` | `EDITING_PRINCIPLES` on every edit; `READERS` by genre; rewritten Improve, Shorten, Simplify, Fix grammar, Confident and Active; the new **Clarify** action; a review that reads at three levels, for a named reader, and knows what code already found; the **clarity** check lens; the **steps** and **reader** think kinds |
| `packages/core/src/intent.ts`, `notes.ts`, `tasks/review.ts` | "is this clear?" is a check, not an edit; the lens's categories; the review hands the model Clearpen's own findings |
| `packages/ui` | the Clarify button and the "Check how it reads" lens on the selection toolbar; in Insights, "What this is" (which checks run, who the review reads for) and the Skeleton |
| tests | `packages/core/test/style.test.ts`, `prompts.test.ts`: one flagged and one unflagged case per check, the prompts' commitments, the lens, the review's hand-off |

## 4. The scientific style

Choosing "A scientific paper" in Insights sets the article's genre. It changes three things: the review reads for Halevi's reviewer and checks that the opening states the main result and what is new; the engine runs `spatial-ref` and `significant`; and the generic checks that assume a business or investment piece stay off. The rest of the clear-writing checks run for every genre, because Gopen & Swan's readers are everyone's readers. Pak's math-journal conventions (abstract length, nothing cited in the body, Final Remarks as endnotes) are not enforced: he footnotes himself that other fields differ.

## 5. Next

In rough order of value, each grounded above: a terms list with every name used for one thing (2.5); gating sentence notes behind "point made" (2.10); a Simplify diff guard (2.9); a notation and defined-term registry with long-gap reminders (2.7); two alternatives for stylistic edits (2.14); a free-write mode with a discovery pass, sentence cards, and the brief as five reader questions (2.13).
