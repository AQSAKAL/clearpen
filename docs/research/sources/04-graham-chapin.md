# 04 · Paul Graham on simple writing, and Sasha Chapin's critique

Studied for Clearpen, an app whose AI edits but never writes. All five texts were fetched in full from their primary URLs on 2026-10-27; the plain-text copies are in `scratch/graham/*.txt`. Direct quotation is kept to short, attributed phrases; everything else is paraphrase. Where this note refers to Clearpen's code it means `packages/core/src/prompts.ts` (REWRITES, EDIT_SYSTEM, JUDGE_SYSTEM, the Review and Check prompts) and `packages/core/src/checks.ts` (the LOGIC rules, `checkRepeats`).

## 1. Sources

- **Paul Graham, "Write Simply" (March 2021)**, paulgraham.com/simply.html, about 550 words. He uses ordinary words and simple sentences, gives six reasons (readers keep more energy for the ideas and read further; it is considerate; many readers are not native speakers; it keeps you honest; it lasts), then admits the real reason is taste: a complicated sentence looks clumsy to him. Process: fast first draft, then days of editing, mostly cutting.
- **Paul Graham, "Write Like You Talk" (October 2015)**, paulgraham.com/talk.html, about 900 words. Write in spoken language. The test: would you say this sentence this way to a friend? Read the draft aloud before publishing; in bad cases explain the piece to a friend and replace the draft with what you said.
- **Paul Graham, "Putting Ideas into Words" (February 2022)**, paulgraham.com/words.html, about 1,100 words. Writing is a test of ideas, not a transcript of them: the first words are usually wrong, half the ideas arrive while writing, and the real test is rereading as a rational stranger who knows only what is on the page.
- **Paul Graham, "How to Write Usefully" (February 2020)**, paulgraham.com/useful.html, about 3,000 words. An essay should be useful: important, novel, correct and strong, the four multiplied together. The Morris technique (publish only what you are sure of), "loose, then tight", qualification as a skill, and the costs of strength and brevity (they make people angry and invite misrepresentation).
- **Sasha Chapin, "Paul Graham Isn't a Simple Writer, and Here Are Some of His Cool Tricks" (3 April 2021)**, sashachapin.substack.com, about 1,100 words. A writing coach's reply to "Write Simply", written two weeks after it. Simplicity is not what makes Graham good; many people write simply and are dull. Chapin dissects three passages of Graham's essay "Haters" (January 2020) and names three tactics: self-riffing, occasional fancy language, chattiness.

## 2. Graham's principles

Each: (a) the rule, (b) his reason, (c) an example from the text, (d) how a tool could detect a violation.

### A. Words and sentences

**1. Use ordinary words and simple sentences.** *(Simply, Useful)*
- Why: reading costs energy; whatever the prose does not burn is left for the ideas, and readers who are not tired read to the end. Also consideration (fancy prose makes readers carry your train), non-native readers (their grasp of ideas may be far ahead of their English), durability (future readers are like foreign readers today), and his own taste: an unnecessarily intellectual word looks clumsy, not fancy.
- Example: the Italian dish *saltimbocca*, "leap into the mouth"; his coinage *saltintesta*: the ideas leap into the head and the reader barely notices the words. In "Useful" he compares an over-worded sentence to a program that is too long.
- Detect: **code** — per paragraph, the share of words outside a spoken-English frequency list (say, the top 10–20k of a conversational corpus), the share of Latinate nominalisations (`-tion`, `-ment`, `-ality`, `-ize/-ise`), mean sentence length and clause count (commas + subordinators per sentence). Report density per paragraph, never a single word (see 4 below). **LLM** — "Rewrite each sentence the way the author would say it aloud; list only the sentences where the two versions differ, and quote the words that differ."

**2. Write in spoken language: the friend test.** *(Talk)*
- Why: written language is more complex, so more work to read; more formal and distant, so the reader's attention is allowed to drift; and worst, it fools the writer into thinking he has said more than he has.
- Example: nobody uses "pen" as a verb when talking; a history book calls Picasso "the mercurial Spaniard", which would raise eyebrows in conversation. His test: look at each sentence and ask whether you would say it that way to a friend; if not, imagine what you would say and use that. After a while you hear the clank when an unspeakable sentence hits the page.
- Detect: **code** — a list of written-only words and moves: `pen`(verb), `utilize`, `whilst`, `amongst`, `thus`, `hence`, `moreover`, `furthermore`, `aforementioned`, `said` + noun, `in order to`, `prior to`, `with regard to`, `it should be noted that`; epithets standing in for a name (`the` + adjective + nationality/profession after a name has been given). **LLM** (the stronger half) — "Would the author say this sentence, in these words, to a friend across a table? If not, give the sentence they would say." Output as a pinpoint edit, not a rewrite. This is the natural brief for Clearpen's **Simplify** action, which today says "swap jargon and long words for plain ones" — the friend framing is Graham's actual test and is broader than vocabulary.

**3. Complex ideas do not need complex sentences.** *(Talk)*
- Why: experts talking to each other about hard things use sentences no more complex than when discussing lunch; they use different words, but no more than needed. The harder the subject, the less you can afford to let language get in the way.
- Example: the "athletic clothing" image: informal language lets ideas move.
- Detect: **code** — flag sentences in technical paragraphs (paragraphs with code spans, acronyms or defined terms) whose clause count or length is well above the article's own median; that is syntax added on top of hard content. **LLM** — "Which sentences carry more structure than their idea needs? Show the idea in one plain sentence."

**4. Fancy words or complicated sentences are allowed for effect, never by accident.** *(Simply, Talk, Useful)*
- Why: the goal is not purity (you may not even want pure ideas); it is control. Poetry is "as much music as text"; a handful of prose writers can carry fancy language; corporate bad news and "the more bogus end of the humanities" use it to hide. For everyone else, simplicity is the default, and florid writing "works for some people" but you should be sure you are one.
- Example: the carve-out in "Write Simply": sometimes you want a complicated sentence or fancy word for effect, but you should never do it by accident.
- Detect: **code** — count ornate items (rare words, inverted word order, Latinate clusters) per sentence and per paragraph. One per paragraph is a choice; three in one sentence or a run across every sentence is an accident. Flag clusters only; never a singleton. **LLM** — only for clusters: "Is this phrase doing work (emphasis, a precise image, a joke) or is it decoration? If decoration, what plain phrase says the same?" This is the exact point where Chapin's critique bites (section 3), so the rule for a tool is: detect density, ask the author, never auto-replace.

**5. Simple writing keeps you honest; errors show in plain language.** *(Simply, Useful)*
- Why: fancy prose conceals ideas, and also conceals their absence; if you say nothing simply, everyone can see it, including you. A mistake is more obvious when expressed in simple language.
- Example: "Write Simply" names this as why some people write fancily: to hide having nothing to say.
- Detect: **LLM** — a two-step judgment: first state the claim of the sentence in the plainest words; then ask whether anything remains. "This sentence, said plainly, is: [X]. Is X a claim a reader could disagree with?" If nothing survives, the Review note is "Says nothing once simplified". **Code** — see principle 12 (the vaporous-phrase list); code cannot judge emptiness in general.

**6. Read it aloud; fix what does not sound like conversation, even phonetic awkwardness.** *(Talk, Useful)*
- Why: the ear catches what the eye forgives; rereading until nothing "catches" is his whole proofreading method (see 9).
- Example: before publishing he reads every essay aloud and fixes everything that does not sound like talk, including bits that are merely awkward to say.
- Detect: **code** — a read-aloud mode using the OS speech synthesiser (no model needed) is the faithful feature. Cheap heuristics for the silent case: doubled words (`that that`, `is is`), adjacent words sharing a syllable (`the thesis is`), accidental rhyme at clause ends, four or more stressed monosyllables in a row, a sentence over ~35 words without a comma. **LLM** — weak at phonetics; skip.

### B. Process

**7. Loose, then tight: a fast first draft, then days of editing, mostly cutting.** *(Simply, Useful)*
- Why: the first draft is for trying out ideas; the editing is for getting everything right. Cutting is most of the editing, and cutting makes simple writing simpler.
- Example: he writes the first draft fast "trying out all kinds of ideas", then rewrites for days; some sentences he has read a hundred times before publishing; an essay takes two weeks and fifty rereads ("Words").
- Detect: a workflow constraint rather than a detector. The tool should stay out of the way while drafting (no Review during flow; the next-sentence judge already waits for a pause) and make cutting cheap and reversible (Shorten as cut-only, which Clearpen's prompt already is; versions on ⌘S). A **code** metric that honours this: words cut in an editing session, surfaced neutrally.

**8. The Morris technique: do not publish a sentence you are not sure is worth hearing; delete it and try again.** *(Useful)*
- Why: you cannot make every idea good, but you can make every published one good by not publishing the others. "Publication bias is the way to go" for essays. Abandoning branches of four or five paragraphs, sometimes a whole essay, is normal.
- Example: his friend Robert Morris, who says nothing unless sure it is worth hearing, so his opinions are rare and usually right.
- Detect: **LLM** — per sentence or paragraph: "Is this earning its place? Name which of true / important / new / strong it fails, in five words." Present as cut candidates the author deletes; the tool never deletes. **Code** cannot judge worth; it can present the candidates and track what the author kept.

**9. Reread until nothing catches; let a clumsy sentence through if you must, never a doubtful one.** *(Useful)*
- Why: on repeated rereading, passages that are clumsily written or that you are not sure are true start to annoy; the annoyance is at first unconscious and after ten readings explicit. Clumsiness is forgivable; incorrectness never is, because if a sentence does not seem right, asking why gives you the replacement.
- Example: the briars that catch your sleeve as you walk past; he will not publish until he can read the whole thing through without anything catching.
- Detect: **code** — the author's own behaviour is the signal: sentences re-edited in several successive versions, or where the cursor repeatedly lingers, are the briars; surface them as "you keep coming back to this". **LLM** — "Which sentences would an attentive reader stumble on, and is the problem clumsiness or doubt about whether it is true?" The second half feeds the fact/logic Check.

**10. Ask why a sentence does not seem right; the replacement is usually already in your head.** *(Useful)*
- Why: the writer's discomfort is diagnostic. Naming the cause produces the fix.
- Example: he says he never has to let a wrong-seeming sentence through, because asking why it seems wrong yields the correction.
- Detect: not a detector; a coaching move. When the author marks a sentence as bothering them, the tool should ask "what about it?" with a few named suspects (too strong? unsupported? not what you'd say? the wrong order?) rather than offering a rewrite. Fits Clearpen's COACH_SYSTEM (notes, not prose).

### C. The reader

Graham does not recommend a named persona. He uses three reader figures, each for a different test:

**11. The friend (for diction):** would you say it this way to a friend? *(Talk; see 2.)*

**12. The stranger (for correctness and completeness).** *(Words)*
- Rule: reread pretending to be a neutral reader who knows nothing of what is in your head, only what is on the page. Does it seem correct? Does it seem complete? The stranger is rational, so you can always satisfy him by asking what he needs: mention the x you left out, add the qualification. It may cost you some nice sentences; accept that.
- Why: ideas feel complete in the head and are not; the movie character who taps his head and says the plan is all up there has, at best, a plan for a plan. Someone who never writes has no fully formed ideas about anything nontrivial.
- Example: it takes him many cycles to get an essay past the stranger.
- Detect: this is the rationale behind Clearpen's next-sentence judge (JUDGE_SYSTEM asks which sentence states the point, which supports it, which draws the meaning). It generalises into a Review pass: **LLM** — "You know nothing except this page. What would you need to be told to accept this paragraph: a missing step, an undefined term, a qualification, an example?" Return the need, not the sentence. **Code** — undefined acronyms (an all-caps token never expanded), a paragraph-initial `This`/`That`/`It` with no noun in the previous sentence to attach to, a term used once in quotation marks and never explained.

**13. Yourself as proxy (for importance and novelty).** *(Useful)*
- Rule: write about what seems important to you and what you have thought about a lot; what surprises you will surprise many readers. If you did not learn anything writing the essay, do not publish it.
- Why: the reader is not completely unlike you. Importance is the number of people something matters to times how much ("a ragged comb, like a Riemann sum", not a rectangle). Novelty needs humility: admitting an idea is new to you means admitting prior ignorance, and confidence makes that admission easy.
- Detect: not detectable by code. **LLM**, at article level, as Think-aid questions, not notes: "Which sentence here could a reader who already knows the subject not have guessed?" and "Who is this for, and how much does it matter to them?" If the model cannot point at a sentence, the author learns something.

### D. Content: what a sentence must do

**14. Be correct, but not by being vague: make every claim as strong as it can be made without becoming false.** *(Useful)*
- Why: it is easy to be correct by being vague ("the issue is a complex one, there are many factors") and such sentences tell the reader nothing; it is easy to be strong by being false (the demagogue). Precision and correctness are opposing forces; useful writing is "bold, but true". The four components (importance, novelty, correctness, strength) multiply, so a zero in any one zeroes the sentence.
- Example: Pike's Peak. "Somewhere in Colorado" is true and useless; "near the middle of Colorado" is useful; "in the exact middle" is too far, because it is a bit east of the middle.
- Detect: both directions. *Too strong* is already covered by Clearpen's `generalisation` LOGIC rule (`everyone`, `all customers`, `every user`), whose message "say most or many, or give the number" is exactly the Pike's Peak move. *Too vague* has no check today; **code** can add the twin: a vaporous-phrase list (`a complex issue`, `many factors`, `it depends`, `a nuanced question`, `there are pros and cons`, `it would be a mistake to oversimplify`, `plays a role`, `can be important`, `in some ways`, `to some extent`, `various`, `a number of`), fired only when the sentence contains no number, name, or concrete noun. **LLM** — "Is this the strongest claim the author can honestly make? Offer the strongest true version, or say what the author would need to know to make it." As a note, not an edit: the author knows what they know.

**15. Qualification is a skill, not a tax; "I think" carries information.** *(Useful)*
- Why: strength comes from thinking well and from skilful qualification, which counterbalance "like the accelerator and clutch". Something you are sure of you state baldly; a dubious point is held at arm's length with perhapses. "I think x" is weaker than "x", and that is exactly why you need it: to express your degree of certainty. Qualifiers are not scalars: they can say how broadly something applies, how you know it, how happy you are about it, how it could be falsified.
- Example: he states the four components of useful writing with no qualification because he is sure of them; he rejects the rule that an essay sentence should never begin with "I think".
- Detect: **code** — stacked hedges on one clause (`perhaps` + `may` + `somewhat` + `in some cases` within one sentence), hedge density per paragraph, and *inconsistent certainty*: the same claim (matching key nouns) hedged in one paragraph and flat in another. **LLM** — "Does each hedge carry information (scope, source, confidence, falsifiability), or is it habit? Name only the habitual ones." Design consequence: Review must not flag `I think` as weakness, and Clearpen's `confident` tone action ("cut hedges and qualifiers") should become "cut hedges that carry no information; keep those that mark a real degree of certainty".

**16. Forestall honest misreadings in the body; dishonest ones in the notes.** *(Useful)*
- Why: a claim stated as strongly as truth allows is false if exaggerated slightly, so it invites misrepresentation, and critics usually disagree with something you did not write. A smart, well-meaning reader's likely misreading deserves a sentence in the body; defending against bad faith in the body "spoils your house". Sometimes it is better to say something slightly misleading and then correct it than to get it right in one shot: it is efficient and models discovery.
- Example: the footnote: railings on the balconies, not bars on the windows.
- Detect: **LLM** — "What is the most likely honest misreading of this claim, in one sentence?" as a Review note type ("Could be read as…"). Also a constraint on the contradiction check: a claim followed by `Not quite.`, `Or rather`, `Well,`, `Actually,`, `More precisely` is a deliberate refinement, not a contradiction. **Code** can recognise that pattern and suppress the contradiction note.

**17. Brevity is the diction of command; simple + strong + confident reads as curt.** *(Useful)*
- Why: people softening bad news use many words; to be short with someone is close to rude; elegance and curtness are "two names for the same thing". The Morris technique makes you sound confident because you are: you admitted your errors before publishing, not after.
- Example: he dislikes faking weakness ("perhaps" with a wink) across a whole essay.
- Detect: **LLM** — after Shorten/Simplify/Confident on a passage addressed to someone (a memo, a reply, a review), one judgment: "Has this become curt for its audience?" Shown as a note, not an undo. **Code** — a trivial proxy: the ratio of words removed, combined with second-person address and imperatives in the result.

**18. Writing changes the ideas; expect to be wrong at first.** *(Words)*
- Why: the first words are usually wrong; half the ideas in an essay arrived while writing it; ideas too broken to fix get discarded. Writing is a stricter test than talking because you must commit to one sequence of words with no tone of voice to carry meaning.
- Detect: a design stance, not a check. The tool should treat the draft as thinking in progress: no feature should lock a paragraph as "done" (Clearpen's "¶ point made" is a verdict on the paragraph's shape, fine), versions should be effortless, and the next-sentence suggestion must stay rare so it does not pre-empt the author's own discovery. Clearpen's rule "never twice in a row" honours this.

### What Graham does not say (to prevent over-reading him)

- He never says to avoid fancy words outright: only never by accident.
- He never says to cut qualifiers: he says to master them.
- He says simplicity is *not* a component of usefulness; it is consideration for the reader and an aid to catching mistakes.
- He does not recommend writing for a named persona. The friend, the stranger and yourself-as-proxy are three different tests.
- His "simple" is about words and sentence structure. He says nothing about rhythm, paragraph flow or emphasis, which is the gap Chapin walks into.

## 3. Chapin's critique

### 3.1 Thesis

Graham's advice in "Write Simply" is reasonable and Chapin says he could follow it more himself. But it is not Graham's secret. Plenty of people already write simply, put ideas down, get in and get out, and their writing is weak, monotonous and soulless; Chapin compares it to formulaic copy from GPT-3 at the end of a long day. So simplicity cannot be what makes Graham good. Graham is in fact not a simple writer: he is complex and subtle, only the complexity is not at the level of vocabulary, so you miss it unless you look. It lives in structure and flow, in many small tactics that keep the writing moving. Chapin does not know whether Graham uses them consciously (micro-skills become intuition), but they can be learned.

### 3.2 Evidence: three passages from Graham's "Haters"

All three come from one stretch of Graham's essay "Haters" (January 2020), which Chapin picks because it is a favourite.

**Tactic 1, self-riffing.** The passage: a hater's imagined outburst that a famous singer is "a fraud", followed by Graham's next sentence, which begins by pointing at that word ("That word 'fraud' is an important one") and then says that treating the object of hatred as a fraud is the "spectral signature" of a hater. Chapin's reading: instead of moving to the next phase of the argument, Graham refers back to his own language. He puts a word in the reader's head, calls attention to it, then follows the trajectory that word generates. The pivot from point to point is therefore frictionless. The problem it solves: most idea-based posts can be scanned, because nothing is gained from reading sentence to sentence; Graham's posts have to be read in order, and following the flow is itself pleasant. Chapin adds that "tactic" is a better word than "trick", since nothing is deceptive about it; it is "a graceful user experience".

**Tactic 2, occasional fancy language.** The same sentence: the hater's habit as the "spectral signature" of a hater, with its slightly unusual word order. Chapin notes Graham could have written something flat (that haters always think their targets are frauds, or that anyone who throws "fraud" around is probably a hater) and that Graham's version is far better. Why it works, in Chapin's analysis: the phrase is specific and poetic (it makes the hater sound like a person whose soul is polluted); the specificity makes the judgment more emphatic (Graham has saved "gleaming vocabulary" for the people he dislikes most); and the odd word order grabs attention. Rule extracted: when Graham deems a sentiment important, he uses "brain-catching language". And such sentences are rare in his work, which is the point: written steadily for ten paragraphs it would sound pretentious; an occasional flash of eloquence rewards attention, evokes, and endears the writer. Chapin concedes Graham does allow fancy language for effect in "Write Simply", but says the essay does not emphasise it, and allows that "take the 101 class first" may be the right general advice.

**Tactic 3, chattiness.** A longer passage: Graham asks two questions in a row (what sort of people become haters, can anyone?), admits he is not sure but has noticed patterns, says haters are generally losers "in a very specific sense", reasons that anyone famous knows how random fame is, and then qualifies: haters are not always complete losers, not always "the proverbial guy" in his mother's basement. Chapin's observations, each a thing a style rule would flag:
- Graham does not decide about contractions: "I'm" in one sentence, "they are" in the next. Chapin: a feature, not a bug; that is how people sound when they talk, because we are not robots.
- There is padding: "very specific". Writers are told to avoid "very" because it adds little information; Chapin disagrees: used now and again it is a chatty emphasiser.
- The double question "sounds really talky".
- "Proverbial guy" is high/low diction, what an educated person sounds like in a comfortable mood.
Chapin's general claim: great prose is often like a person talking, "but impossibly perfectly"; everyday speech, elevated. Graham's simplicity is "a familiar, casual, almost slapdash simplicity", not a scrubbed one.

### 3.3 What Chapin says actually makes Graham's prose work

Not vocabulary. Structure and flow: cohesion engineered sentence by sentence (the self-riff), a deliberate scarcity of ornament so that each flash signals importance, and the texture of speech kept in, inconsistencies and mild intensifiers included. He lists more he did not unpack: delicate criticism, understated praise, "pushing and pulling attention from line to line". His closing claim: using simple language is not nearly enough; writing decently is easy, writing really well takes a lot of work, "even, and perhaps especially" when aiming at simplicity.

### 3.4 Limits of the critique (for an honest reading)

- Chapin analyses one chunk of one essay and says so; he is making a point, not a survey.
- Tactic 3 is Graham's own 2015 essay "Write Like You Talk" restated; Chapin critiques "Write Simply" in isolation, so he and Graham agree more than the headline suggests.
- Chapin is a writing coach and ends by offering his services; the stance "rules are not enough, you need taste" is also a pitch. That does not make it wrong.
- His GPT-3 remark is the most useful line for Clearpen: an editing model fed only "simplify" instructions will produce exactly the prose he describes.

### 3.5 What the critique means for a tool

**Is "Simplify" a safe default edit?** Not unguarded. Everything Chapin identifies is something a mechanical simplifier removes, because each looks like a violation of a simplicity rule:

| Graham's move (per Chapin) | What a naive Simplify/Shorten does to it |
|---|---|
| Self-riff: the next sentence picks up a word from the last | Deletes the pickup clause as "repetition" or "padding" |
| One ornate phrase saved for the important sentiment | Replaces the rare word with a plain one, so emphasis is lost and all sentences weigh the same |
| Unusual word order for attention | Normalises to subject-verb-object |
| Inconsistent contractions | "Fixes" to one convention (and `formal` tone expands them all) |
| "very", a chatty intensifier at low density | Deletes it as a filler word |
| Double question | Collapses to one, or converts to a statement |
| High/low diction ("proverbial guy") | Levels the register |
| Short admission ("I'm not sure about this") | Cuts as a hedge |

The result is Chapin's monotone: every sentence the same length, the same weight, the same register. Simplification of *words* is largely safe; simplification of *texture* destroys the thing that made the passage readable.

**What a Simplify/Shorten feature must preserve** (each is checkable on the diff, by code, before the edits are shown):
1. Any word that the next sentence quotes or picks up (the pivot). Code: a token in sentence n that recurs in sentence n+1, especially inside quotation marks or after "that word", "this", "the same", is protected.
2. Questions stay questions; a question-pair stays a pair.
3. Contraction state is not changed in either direction unless the action is a tone change.
4. Intensifiers (`very`, `really`, `quite`) are cut only when their density is high (say, more than one per 60 words); a lone one is voice.
5. The one rare or ornate phrase in a paragraph is left alone and, at most, highlighted with a question. Only clusters get edits (principle 4).
6. Hedges that carry certainty (`I think`, `I'm not sure`, `probably`, `in my experience`) are never removed by Simplify or Shorten; `confident` may propose it, saying why.
7. Sentence-length variance is not flattened: if the standard deviation of sentence lengths in the result falls below roughly half of the original, the edit set is suspect. A long sentence followed by a four-word one is rhythm, not an error.
8. Shorten cuts; it does not paraphrase (Clearpen's prompt already says so). A cut that removes the last sentence of a paragraph (where the meaning usually lands) is flagged for the author.
9. Register mixing (a colloquial phrase in a formal paragraph) is preserved unless the author asked for a tone change.
10. The author's own emphasis devices (italics, a one-sentence paragraph, a fragment) survive.

## 4. Where Graham and Chapin agree, and the tension

**Agreement**
- Prose should sound like a person talking. Graham: the friend test, read it aloud. Chapin: great prose is a person talking, impossibly well. Graham's clank and Chapin's "talky" are the same ear.
- Fancy language is for effect and must be rare. Graham: never by accident. Chapin: an occasional flash; ten paragraphs of it would be pretentious.
- Simplicity is not the goal. Graham says it is not even a component of usefulness; Chapin says it is not nearly enough.
- Flow matters more than any sentence. Graham wants friction low enough that readers keep going to the end; Chapin wants a reader who cannot skim because each sentence sets up the next.
- Both reject rules applied without judgment: Graham's "never by accident" and Chapin's "feature, not a bug" are both appeals to intent.

**Tension**
- Graham frames good writing as subtraction: the gap between most writing and pure ideas "is not filled with poetry". Chapin says that what fills Graham's own gap is precisely structure, rhythm and the occasional poetic phrase, and that if you subtract to the bone you get GPT-3 copy.
- Graham names rules; Chapin names the taste that makes the rules work. Graham's own taste shows only as "it offends me not to" and the carve-out for effect. A tool built on Graham's rules alone implements the rules without the taste.
- Graham's strength principle pushes claims to their strongest true form; Chapin's chattiness keeps admissions of uncertainty in for their sound. Graham resolves this himself in "Useful": qualifiers carry information and belong, so the two are compatible, but a tool must know which hedge is which.

**Design constraints for an editing tool, stated as imperatives**
1. Shorten, but never flatten: cut words, never variance, never the pivot, never the one flash.
2. Simplify the sentence, not the voice: vocabulary and syntax are fair game; contractions, questions, asides, register and intensifier-at-low-density are not.
3. Flag density, not instances: one rare word, one "very", one long sentence is a choice; a run of them is a problem.
4. Treat echo as cohesion: a word repeated into the next sentence is how paragraphs hold together, not padding.
5. Protect hedges that carry information; attack only stacked or habitual ones; never flag "I think" by itself.
6. Fight vagueness as hard as overstatement: pair the sweeping-claim check with a says-nothing check.
7. Ask before you replace emphasis: an ornate phrase or inverted order gets a question in the margin, not an edit.
8. Keep the author deciding one change at a time: pinpoint edits with accept/reject are the right shape for exactly this reason, because the author's taste is the missing component, and the tool's job is to put candidates in front of it.
9. Measure an edit by what survives, not by what was removed.

## 5. Quotes

Kept to short phrases that work as handles; the surrounding thought is paraphrased in sections 2 and 3.

- "saltintesta" — Graham's coinage for ideas leaping into the head. *(Write Simply)*
- "you should never do it by accident" — on fancy words and complex sentences. *(Write Simply)*
- "writing simply keeps you honest" *(Write Simply)*
- "Informal language is the athletic clothing of ideas." *(Write Like You Talk)*
- "you'll hear the clank as it hits the page" — a sentence you would never say aloud. *(Write Like You Talk)*
- "Putting ideas into words is a severe test." *(Putting Ideas into Words)*
- "It may cost you some nice sentences" — satisfying the stranger. *(Putting Ideas into Words)*
- "Useful writing is bold, but true." *(How to Write Usefully)*
- "Brevity is the diction of command." *(How to Write Usefully)*
- "Don't underestimate qualification." *(How to Write Usefully)*
- "like briars that catch your sleeve" — passages that are clumsy or doubtful. *(How to Write Usefully)*
- "weak and monotonous and soulless" — what most simple writing is. *(Chapin)*
- "a graceful user experience" — the self-riff. *(Chapin)*
- "brain-catching language" — for the sentiment Graham deems important. *(Chapin)*
- "like a person talking, but impossibly perfectly" *(Chapin)*
- "a familiar, casual, almost slapdash simplicity" *(Chapin)*

## 6. Assessment: the highest-value ideas for an app that edits but never writes

**1. The friend test as the brief for Simplify.** Graham's operational test is not "use short words" but "would you say this, like this, to a friend?" Rewrite Clearpen's `simplify` instruction around it: "Make each sentence the way the author would say it aloud to a friend: plain words, spoken word order, one idea per sentence. Keep their contractions, questions, asides and emphasis. Change as few words as possible; add nothing." *Needs a model.* Code supplies the guard-rails from 3.5 on the resulting diff.

**2. The says-nothing check, twin of the sweeping-claim check.** Graham's Pike's Peak principle has two failure modes and Clearpen catches only one. A vaporous-phrase list fired on sentences with no number, name or concrete noun is *code-detectable* and cheap. The follow-up, "what is the strongest true version?", is a model note, phrased as a question so the author supplies the fact. This is also Graham's honesty principle (5): the claim restated plainly is either a claim or nothing.

**3. Density-based fanciness and the never-by-accident rule.** Count rare words, nominalisations and ornate order per sentence and paragraph; flag clusters, never singletons; offer a margin question ("on purpose?") for a lone flash rather than an edit. Detection is *code*; the question needs no model; deciding is the author's. This single rule reconciles Graham (default plain) with Chapin (the rare flash is the point).

**4. A qualification audit instead of hedge-cutting.** Code finds stacked hedges and inconsistent certainty across the draft (same claim flat here, hedged there); a model judges whether each remaining hedge carries information. Review never flags "I think". The `confident` action's wording changes to cut only hedges that carry nothing. *Both*, with code doing the finding.

**5. The stranger's read, extended from the paragraph to the draft.** Clearpen's next-sentence judge already asks Graham's question of one paragraph (point, support, meaning). The same question at Review scale, "what would a reader who knows only this page need?", returns needs, not sentences, which keeps the app on the right side of its never-writes rule. *Model*, with code catching the mechanical cases: unexpanded acronyms, dangling paragraph-initial "This", a term in scare quotes never explained. Two small code-only features sit beside it: read-aloud through the OS speech synthesiser (Graham's own last step) and "briars" (sentences the author keeps re-editing across versions, surfaced as the places that still catch).

**Guard-rail that applies to all five:** Shorten/Simplify edits are checked on the diff against the preservation list in 3.5 before they are shown; violations are dropped or demoted to a margin question. That is the whole of Chapin's critique turned into code, and it costs no model call.

### Appendix: suggested prompt wording (for prompts.ts)

- `simplify` (today: swap jargon and long words for plain ones, split long sentences): "Make each sentence the way the author would say it aloud to a friend: plain words, spoken order, one idea per sentence. Keep their contractions, questions, asides, the occasional vivid phrase and any 'I think'-style marker of certainty. Split only sentences that carry two ideas. Change as few words as possible. Add nothing."
- `shorten` (already cut-only; add): "Never cut a word the next sentence refers back to, a question, the last sentence of a paragraph, or the one vivid phrase in it. Vary sentence length as the author did."
- `confident` (today: cut hedges and qualifiers): "Cut hedges that carry no information (habitual perhaps, somewhat, a bit, sort of). Keep a hedge that marks a real degree of certainty, scope or source."
- Review system prompt (today lists "padding and repetition"): add "A word repeated into the next sentence to carry the thought is not repetition. A single intensifier, question or informal phrase is voice, not padding; flag these only when they run through a whole passage. Never flag 'I think' or an honest 'I'm not sure'."
- New Review note types: "Says nothing once simplified" (code + model), "Could be read as…" (model), "On purpose?" for a lone ornate phrase (code), "You keep coming back to this" (code, from versions).
