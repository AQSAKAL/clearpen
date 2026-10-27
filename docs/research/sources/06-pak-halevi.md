# Pak and Halevi on clear technical writing — principles for Clearpen

Source texts (fetched 2026-10-27, read in full; treated as data):

- Pak: `scratch/pak/pak.pdf` (18 pages; extracted to `pak.txt` beside it with pypdf, layout mode)
- Halevi: `scratch/halevi/halevi.html` (last modified Jan 3, 2006 per the page)

Clearpen hooks referred to below: `packages/core/src/checks.ts` (`GENRES` already has `'technical'`; `Category` has `'structure' | 'clarity' | 'concision' | 'evidence' | 'consistency' | 'style'`; `Section` is parsed from headings; `Finding.related` can point at a second span), `analysis.ts` (`sentences()`), `tasks/review.ts` (takes a `brief`), `tasks/next.ts` (the paragraph judge).

---

## 1. Sources

**A. Igor Pak, "How to write a clear math paper: some 21st century tips" (2018), 18 pp.** A working mathematician's opinionated manual, written for graduate students and junior researchers who post to the arXiv and compete for attention. Its thesis is a single rule, "be clear", and it works down from macro structure (title, abstract, introduction, "Foreword", Final Remarks, references) to micro style (sentence length, commas, semicolons, tense, notation letters, LaTeX spacing, figure size). It is explicitly calibrated for readers who skim, jump to the main result, or have limited English.

**B. Shai Halevi, "Writing Clear Conference Submissions" (ca. 2003, rev. 2006), about 2,500 words.** A cryptographer and frequent program-committee member telling submitters what he wants to see as a reviewer. Two principles, "know what you want to say" and "think of your readers", unfolded into concrete advice for the abstract, the introduction and the technical sections. Short, example-driven (the fictional "Inactive-Pooch system of Theo Retician"), and about reading under time pressure.

A correction to the brief: Halevi does not say "30 minutes". His words are that "most readers only have a few hours to read, understand, and evaluate your paper." The 5-minute figure is his *author-side* test: explain the new idea to a colleague back from vacation in five minutes, no background.

---

## 2. Principles

Legend: [Pak], [Halevi], [both]. For each: (a) rule, (b) reason, (c) example from the text, (d) detection. Thresholds marked "proposed" are my calibration, not the authors'; the authors' own numbers are quoted where they give them.

### 2.1 Sentence-level rules

**1. Write short sentences; if a sentence must be long, mark every clause with commas on both sides. [Pak]**
(a) "Write short sentences. If you must have longer sentences, separate each clause with commas." Commas exist "to make the sentence structure clearer, rather than to indicate where the English speakers make a pause." Put commas on both sides of every clause and subclause; ignore the Oxford-comma debate.
(b) Readers with "limited English, short attention span and no patience."
(c) "Consider an integer x, whose square is 4, and which is positive."
(d) Code: `sentences()` word count; proposed thresholds for the technical genre: note at > 30 words, stronger at > 40; also flag a sentence with ≥ 3 subordinators (which/that/where/such that/whose/if/unless/provided) and fewer than 2 commas. LLM (Shorten/Simplify instruction): "Split into two sentences at the clause boundary; do not drop any condition or quantifier."

**2. Do not use semicolons; make the logical link explicit as two sentences. [Pak]**
(a) "Do not use a semicolon – it implies a logical connection between the clauses, which is best made explicit between the sentences."
(b) The connection stays implicit; the reader has to infer it.
(c) None beyond the rule.
(d) Code: count `;` outside code spans, tables and lists; in the technical genre any semicolon joining two independent clauses gets a note ("Split, and say how the two halves connect: therefore, because, but"). Pure code; precision is high.

**3. Plain phrasing beats erudite phrasing; unclear writing hides false claims. [Pak]**
(a) Say the thing directly.
(b) Pak's footnote: the statement he uses as an example is false, "but that's part of my point – how would anyone even know that in the second version? When you are unclear, all claims look reasonably true." Clarity is what makes claims checkable.
(c) "Abelian groups have trivial center" versus the 40-word version starting "It was discovered by Galois, and later proved formally by Jordan in 1870 (see [Struik]), that having the identity being the only fixed element…"
(d) Code: a claim sentence (contains "is/are/implies/holds/follows") whose subject and verb are separated by > 15 words, or that has a nested parenthetical plus a citation before the main verb. LLM (Review, evidence category): "Restate this sentence's claim in ≤ 12 words; if you cannot, the sentence is hiding its claim." Ties directly to Clearpen's existing unsupported-claim notes: a claim the model cannot restate cannot be checked.

**4. Prefer plain words; repetition is fine; avoid "difficult words". [Pak]**
(a) "It is perfectly ok to be repetitive and have ten therefore's and be clear, rather than vary the style and have difficult words like 'henceforth'."
(b) Non-native readers and skimmers.
(c) "henceforth" named as the example of a word to avoid.
(d) Code: wordlist for the technical genre (henceforth, hitherto, heretofore, whence, thence, aforementioned, notwithstanding, viz., inter alia, mutatis mutandis, ergo, albeit, whilst, amongst, utilise/utilize when "use" would do). **Important inversion for the Improve prompt:** in the technical genre the model must NOT vary connectives or introduce synonyms for the sake of style; repeated "therefore" is correct. This is the opposite of general-prose editing and needs to be stated in the prompt.

**5. Once a term is introduced, use only that form; no derived variants. [Pak]**
(a) "If you introduce a mathematical term, do not use its variations even if to you they make perfect sense… Stick to basic forms."
(b) Each variant is a new word for a reader without native English.
(c) Define "nice graph", then do not write "niceness of graphs imply…".
(d) Code: collect defined terms (patterns: `we call X`, `X is called`, `is said to be X`, `Definition`, first bold/italic/quoted noun phrase, "(X)" abbreviations). For each head word, search for derivations by suffix (-ness, -ity, -ly, -ize/-ise, -ation, -al, plural/adjective swaps) and for the term with a different modifier order. Note: "You defined 'nice graph'; 'niceness' is a new word for the reader. Use the defined form." Pure code with a small stemmer; false positives are low because defined terms are rare.

**6. Use only the present indefinite (occasionally past indefinite) outside the Introduction and Final Remarks. [Pak]**
(a) "Outside of the Introduction and Final Remarks, use only present indefinite and occasionally past indefinite."
(b) Tense shifts cost attention and add nothing in a proof or method section.
(c) None beyond the rule.
(d) Code: in body sections, count `will|shall|would|had been|has been|is going to` + verb; note when a body section uses future tense for its own content ("we will now show" → "we now show"). Exempt the Introduction's roadmap, where "In Section 3 we prove…" is fine either way.

**7. Keep spelling to the most common form and consistent; typography should not create ambiguity. [Pak]**
(a) Use the most common spelling ("Standard American English"); let a search engine break ties; spaces around long dashes; do not trust LaTeX spacing; avoid look-alike letters (κ/k, υ/v, ∅ that looks like 0, ι, ϖ) and Gothic fonts.
(b) Visual ambiguity is a clarity failure, not a typesetting detail.
(c) `Φ(2a+c)Φ(c−2a)Φ(a)Φ(3a)` reads as a strange ⊕-like operator until thin spaces are added; the partition "12+10+10+2+1" written compactly as 1210221 "looks more like a partition 1210 + 1210 + 21."
(d) Code: (i) mixed British/American spellings of the *same* word in one document → consistency note (Clearpen's autocorrect principle forbids Americanising, so check consistency only, never change the dialect); (ii) `\w—\w` (unspaced em dash) → style note, configurable; (iii) in math spans, adjacent juxtaposed factors without spacing, e.g. `\)\w\(` patterns, and digit runs in compact notation → "Add spaces so the factors read as separate values." LLM not needed.

**8. Prefer English to notation; a formula in prose is a last resort. [both]**
(a) Halevi: "Go super easy on notations. Explain as much as possible with plain English, and use notations only as a last resort." Pak's version: don't be pedantic about standard notions and "just draw a picture and get on with your math."
(b) "Using notations such as P^b_{i,j,k,r} is a sure way to lose your readers. (Especially if you have a typo and you write t instead of r in one of the subscripts.)"
(c) Halevi finds "the advantage of an adversary that runs for t time, makes q queries and gets r replies" easier than `Adv^{CCA-PKT-RND5}_{A,B,T}(t,q,r)`. "If you have in the introduction something like [that], you should re-think your presentation."
(d) Code: math-token density (inline `$…$`, `\(…\)`, Unicode Greek/operator runs, `_{…}`, `^{…}`) per 100 words, per section. Proposed: Introduction > 2 math spans per 100 words → note "The introduction leans on notation; say it in words and point to the definition." Any sub/superscript with ≥ 3 indices (`_{a,b,c}`) or stacked super+sub with ≥ 4 symbols → "This notation will lose readers; name the quantity in words at least once." LLM: "Rewrite this formula's meaning in one plain sentence" as a *suggestion* in the margin, never an insertion.

### 2.2 Paragraph-level rules

**9. Keep paragraphs short, but do not chop a train of thought into fragments. [Pak, quoting Zinsser]**
(a) "Keep your paragraphs short… But don't go berserk. A succession of tiny paragraphs is as annoying as a paragraph that's too long."
(b) "Writing is visual—it catches the eye before it has a chance to catch the brain."
(c) Newspaper paragraphs "two or three sentences"; "midget paragraphs—verbless wonders" as the opposite failure.
(d) Code: paragraph sentence count and word count; proposed: > 8 sentences or > 180 words → "long paragraph"; ≥ 3 consecutive paragraphs of ≤ 1 sentence (outside lists and dialogue) → "chopped". Present as a structure note, not an edit.

**10. Every part says what it is doing now and what comes next; describe the structure before the details. [Halevi]**
(a) "Keep the reader informed about what's happening now and what's coming next. Describe the overall structure of any construction/proof before diving into the details. In every part, remind the reader what are the important issues in this part, what are you trying to do, what part does the next lemma play in the big picture."
(b) The reader cannot hold the plan in their head; the author can.
(c) The running example: say in the introduction that "in the proof of Lemma 3 in Section 5" the simulator need only handle the "important" threads, so keys can be t-wise independent.
(d) Code: first sentence of each section/subsection: does it contain an orientation marker (`In this section|We now|Here we|This section|Next we|The goal of this|We first|Before proving`)? Also: a section whose first paragraph is a formal statement (begins with "Let", "Definition", "Theorem", a formula) with no prose before it. LLM (per section): "Does the opening say what this section does and why it is needed for the main result? Answer yes/no and quote the sentence." Margin note: "This section starts in the details. One sentence saying what it does and why would orient the reader." This is the section-level analogue of Clearpen's paragraph judge.

**11. Say important things more than once; put many forward and backward pointers in. [Halevi]**
(a) "Don't assume that the reader remembers (or even read) everything that was written in the paper up to this point. If some aspect is important, describe it more than once. (If it is very important, more than twice.) Put many forward and backward pointers in the paper."
(b) Reviewers read non-linearly and under time pressure.
(c) "in the next section we show that…", "as discussed in Section 3, we need to have…".
(d) Code: count cross-reference phrases (`Section \d|§|see below|see above|as discussed|as noted|we show below|in the next section|recall that|as defined in`); for a document with ≥ 4 sections and 0 pointers, or a section > 600 words with none, note "No signposts: the reader has no way back to what this depends on." Also: the main claim (from the brief or the abstract's key sentence) appearing only once in the whole document → "Your main result is stated once; restate it where it is proved/used." **Prompt implication:** Shorten/Simplify in the technical genre must not remove a deliberate restatement or a "recall that…" reminder as redundancy.

**12. Remind the reader of notation introduced long before; explain every piece of notation. [both]**
(a) Halevi: "make sure that you explain every bit of notations. If you introduced a piece of notations four pages ago and now came back to it, it would help if you remind the reader what it means." Pak: "it is a good style to remind the reader of notation you introduced earlier."
(b) The reader does not remember and may have skipped the definition.
(c) "four pages ago" is Halevi's distance.
(d) Code: for each symbol/term defined (see rule 5 patterns and `let X be|denote by X|X :=`), record position; at each later use, if the gap since the last mention is > 1,500 words (≈ four pages) and the sentence has no re-explanation ("recall", "the X defined in", an apposition), note "Last mentioned N words ago; a four-word reminder would help." Precision is good for single-letter symbols inside math spans and for acronyms; mediocre for ordinary words.

**13. Do not branch into every variation; keep the line of the argument flowing; move asides to the end. [Halevi; Pak's Final Remarks]**
(a) Halevi: "Try to keep the presentation flowing without too much branching and detours… don't describe every little variation and every minute consideration to the fourth order." Don't use too many footnotes; prefer "a separate Discussion section at the end." Pak: whenever more context or references are wanted mid-text, "make a placeholder subsection in the Final Remarks" and leave a pointer.
(b) "The attention span of your reader is not infinite… Otherwise the reader will never make it to the next section, where you actually describe the crucial new observation that is the heart of the paper."
(c) Pak's pointers: "(for more on this, see §6.1)", "(cf. §6.4)", "We postpone the discussion on this until §6.8".
(d) Code: paragraphs or sentences beginning with aside markers (`Note that|Alternatively|One could also|A variant|In a more general setting|It is also possible|Interestingly|As an aside|In passing|Incidentally`) and parenthetical sentences; proposed: a section where > 30% of paragraphs open with an aside marker, or footnote markers `[^n]` exceeding 1 per 300 words or 10 in total → "Detours: consider moving these to a Discussion/Final Remarks section and leaving a pointer." LLM: "Which paragraphs in this section are not on the path to its result? List them." The tool proposes the move (a reordering edit), never writes the discussion.

**14. Define before use; explain what the target audience does not know, and only that. [both]**
(a) Halevi: "Explain in detail those things that the target audience is unfamiliar with (even if it is considered a basic result in some other field), and only mention in passing things that you believe are common knowledge." Pak: "Don't be pedantic" about standard notions (Q ⊂ R; what a domino tiling is).
(b) Over-explaining distracts; under-explaining loses the reader "on page 3".
(c) Halevi: "if one needs to know the entire history of civilization just to understand your terminology, can the presentation be altered?" Pak: Serre's advice against writing Q ⊂ R is dismissed as Bourbaki-level pedantry.
(d) Code: acronyms (`\b[A-Z]{2,6}s?\b`) whose first occurrence is not accompanied by an expansion in the same sentence ("Full Name (ACR)" or "ACR (Full Name)") → "Define on first use." Capitalised multiword terms and terms in quotes/italics used before any definition pattern. LLM (document-level, with the brief's stated audience): "List terms this draft uses before explaining them, and terms it explains that this audience already knows." The second half needs an audience setting in the brief; without one, only the first half should run.

**15. Do not tell the reader how hard the problem was or how many attempts it took. [Halevi]**
(a) "Don't try to impress the reader with how complicated the problem is, or how hard you had to work to solve it."
(b) "Most readers are not interested in how many versions of the definition or construction you went through before arriving at the current one."
(c) None beyond the rule.
(d) Code: wordlist (`surprisingly difficult|highly non-trivial|after many attempts|it took us|we tried several|considerable effort|far from obvious|turned out to be much harder`). LLM: "Does this sentence inform the reader about the result, or about the author's effort?" Note: "This tells the reader about your effort, not your result."

### 2.3 Document-structure rules

**16. Matryoshka structure: brief summary, longer summary, then the full account. [Pak]**
(a) "Start with a super brief summary, then make a longer summary, and only then, once the reader is hooked and interested in details, proceed to give a complete set of facts." For papers: title → abstract → introduction → main part → final remarks → references.
(b) Readers stop at different depths (see §3 below); each layer must stand alone.
(c) Newspaper writing guides; Pak's section 3.1.
(d) Code: does the document have the layers? (a title; an abstract/standfirst block or first paragraph that is a summary; an introduction section; body sections; a closing section). LLM: "Can a reader stop after the title, after the abstract, after the introduction, and still know the main result? Say at which layer the result first appears."

**17. State the main result early: first theorem on the first page, second at worst. [Pak]**
(a) "Start by setting up the problem and statements of the main results… But do aim to have your first theorem on the first page, or at worst on the second page." Introductions with no stated results work "only if they are short (under 1.5 pages), and the paper is itself a note (at most 10 pp)."
(b) "Some skip everything in the paper and go straight to main results."
(c) If the main theorem is too technical to state, "skip the main theorem altogether and include interesting, nontrivial, but easy to state corollaries… think of them as an advertisement of your paper." The corollary "is all that the paper passers-by will remember."
(d) Code: position of the first claim marker (`Theorem|Proposition|Main result|we prove|we show that|our main result|in this (paper|article|note) we`) measured in words from the start; proposed: > 450 words (≈ one page) → note; > 900 words (two pages) → stronger note. For non-math technical articles: first sentence in the first two paragraphs that the Review's claim detector classifies as the thesis. LLM: "Quote the sentence that states the main result. How many words in does it appear? Is it stated in a form a reader could repeat to a colleague?"

**18. The introduction must say what is new and why it matters; by its end the reader knows the idea. [both]**
(a) Halevi: "By the end of the introduction, the reader should know what is the new idea (even if not all the details)." Explain "what you do on a high level, and also why it is interesting." Pak: set up the problem; if resolving a conjecture or question, "state it (with attribution)"; explain the history "directly relevant to your main result".
(b) The introduction is "probably the only part of your paper that will be read by all but a few most devoted readers" (Pak); it is where the reviewer decides what the contribution is (Halevi).
(c) Halevi's Inactive-Pooch intro: describe Retician's scheme at a high level, say why the keys are expensive, observe that not everything needs simulating, point forward to Lemma 3 in Section 5. Pak's template: "Paper [A] asked about XYZ and proved weak-XYZ. Last year, paper [B] showed that strong-XYZ is false. In this paper we refine the tools in [B] to show that XYZ is also false."
(d) LLM over the introduction only, four yes/no questions each with a quote or "not found": (1) What problem? (2) Why does it matter? (3) What is new here? (4) How does it relate to prior work? Code pre-check: contrast/novelty markers in the intro (`unlike|in contrast|previous|prior|existing|first|improve|extend|we (introduce|propose|show|prove)`) — zero hits is a strong signal. Margin note names the missing question: "The introduction never says what is new relative to [B]."

**19. The one-sentence summary belongs in the abstract; say what kind of contribution it is. [Halevi]**
(a) "It is very helpful to the reader if you can put the one-sentence summary of your idea already in the abstract." Even when the idea is technical, say whether it is a new scheme, a better analysis, a new definition, an equivalence, an efficiency gain.
(b) "A reader that makes it to the technical part would know where to look for the main technical contribution."
(c) "the famous scheme of Retician needs to send O(k) bits for every tick. In this work we improve this to polylog(k) bits per tick, by carefully modifying the proof of the main reduction in Retician's work."
(d) LLM: "Does the abstract contain one sentence a colleague could repeat as 'the result'? Quote it. Does it say what kind of contribution this is (new construction / better analysis / new definition / equivalence / speed-up)?" Code: an abstract with no first-person or agentive verb (`we show|we prove|we give|we present|this paper`) and no comparative (`improve|faster|first|new`) → likely descriptive-only. Clearpen's `brief` field can hold the author's own one-sentence summary; Review then checks the abstract and introduction contain it.

**20. The abstract: dry facts, key results first, no details, no comparisons, no persons, and short. [Pak]**
(a) "Nothing personal, just dry facts about the results. State key results first and briefly mention the existence of others… Provide no details and no connections to other works unless absolutely necessary… make it clear, precise, plain and uninventive. As a rule of thumb, the number of lines in the abstract should be at 0.3–0.5 times the number of pages."
(b) "Large fraction of MathSciNet reviews are just the abstracts."
(c) "An abstract with 10 lines for a paper of 10 pages looks way too excessive." Citations are fine when they add precision: "stated by the author in [Pak12]" beats "in 2012".
(d) Code: abstract length vs body length. Pak's rule in words: at ≈ 12 words/line and ≈ 425 words/page, abstract ≈ 0.85–1.4% of the body (36–60 words for a 10-page paper). That is math-journal dry; for Clearpen propose a soft note at > 2% of body or > 250 words, and a note when the abstract has > 2 citations, a question, or first-person hedging (`I believe|we hope|we feel`). LLM: "Is the first sentence of the abstract a result or a motivation?" (Pak wants the result first.)

**21. The introduction does not contain technical definitions, examples or big figures; it points to them. [Pak]**
(a) "What not to include: Technical definitions, examples, big figures illustrating some special cases, etc. Instead… use '(see Figure 5.1)' or '(see the exact definition in §3.4)'." Only "a few technical definitions needed for these results" may appear.
(b) Length control; the interested reader "will click on the link… and use the Back button".
(c) The pointer phrasings above.
(d) Code: in the Introduction section, count `Definition`, numbered displayed equations, images, and paragraphs beginning `For example|Example`; proposed: ≥ 2 formal definitions or any image > a few lines of alt text in the intro → "Move to the body and point to it." Also intro length: Pak says "under 3 pages… ok", over 4 pages means subsections are needed with a Foreword first (≈ 1,300 and 1,700 words). This is a *math* convention; for Clearpen's technical genre it should be a soft "the introduction is N% of the article".

**22. Cite in the introduction only what bears directly on the main result; put the full history and the "give everybody his due" survey at the end. [Pak]** (Halevi: "Describe the relevant prior works, but skip the non-relevant ones.")
(a) "Only the most relevant papers should be cited in the Introduction. The rest are cited in the Final Remarks. Nothing is cited in the main part of the paper." Exception: a result used as a lemma needs a precise reference, "but don't elaborate on it."
(b) "There is no way to be both fair, clear and complete when citing in the middle of the paper, and without breaking the flow of the arguments." Halevi: no reason "to describe the entire history of research into secure multi-party computation just because you describe an efficient distributed protocol for computing the XOR function."
(c) Pak's worked related-work paragraph (partitions into even primes, [A]…[H]) "should go into Final Remarks. In the example, the Introduction should have only [A] and [B] papers mentioned." (Footnote: CS-theory style puts it all in the Introduction, condensed.)
(d) Code: citation markers per paragraph (`\[[^\]]+\]`, `\(\w+ et al\.,? \d{4}\)`, footnote refs); proposed: an introduction paragraph with ≥ 6 distinct citations, or an intro where > 40% of sentences carry a citation → "History paragraph: keep [A] and [B], move the rest to Related work / Final Remarks." Body sections: a citation accompanied by > 1 sentence of narrative about the cited paper → "Story about a reference mid-argument; a Remark or the Final Remarks would hold it." The genre setting decides which convention applies (math vs. CS).

**23. Never cite a range; name each paper's contribution, most important first. [Pak]**
(a) "It is a disservice to the community to write 'See [2–19] for some relevant work'… go over the papers individually, starting with the most important reference, and describe their contribution. Stop when you are tired."
(b) "This helps neither the readers to find anything at all, nor the authors of 2–19 to get credit; in fact, it pits them against each other."
(c) The [A]…[H] paragraph.
(d) Code: regex `\[\s*\d+\s*[–-]\s*\d+\s*\]` with span ≥ 3, or a bracket list with ≥ 5 keys and no verb about them in the sentence → note with Pak's reason. Pure code, high precision.

**24. The wording of a citation encodes how much the author vouches for it; be deliberate. [Pak]**
(a) Pak's 12-step ladder from "Roth proved Murakami's conjecture in [Roth]" (clear; the proof is there) through "[Roth]", ", see [Roth]", "[Roth], see also [Woolf]", "(see [Woolf])", "see e.g. [three books]", a footnote "See [Mailer]" (author never read it), "Personal communication", down to "Roth claims to have proved… in [Roth]" (known gap).
(b) Each phrasing tells an expert reader something different about reliability; sloppy phrasing misinforms.
(c) "see e.g. [Faulkner, Fitzgerald, Frost]" often means "the author was too lazy to look for the right reference so overcompensated with three random textbooks."
(d) Code: pattern classifier on the sentence around each citation: `in [X]` / `[X]` / `, see [X]` / `see e.g.` / `see also` / `personal communication` / `claims`. Margin note explains what the chosen form signals ("'see e.g.' signals a well-known result with no specific source; if [X] is the proof, write 'in [X]'"). LLM only to confirm the author's intent when asked.

**25. When quoting a specific result from a long work, give its location. [Pak]**
(a) "Whenever a specific result is quoted in a monograph or a paper over 5 pages, one should include a specific location of that result" — "Theorem 3.2", "Eq. (3.12)", or, most stably, section numbers of the arXiv version: "see [A, §3.1]".
(b) Multiple versions shift page numbers; readers need to find the statement.
(c) The forms above.
(d) Code: sentence contains `Theorem|Lemma|Proposition|Corollary|result|bound|shows that` + a citation key but no locator (`Thm\.?|Theorem \d|Lemma \d|§|Sec\.|p\.|Eq\.`) → low-severity "Which theorem of [X]? A locator helps the reader find it." Precision is modest; mark as a suggestion.

**26. The title is the first approximation of the contents: not too long, short, vague or generic; it says what is proved. [Pak]**
(a) Avoid titles like "On some problems in group theory". "Emphasize not the length but the content."
(b) Many readers "read many titles on the arXiv, only occasionally reading the abstracts."
(c) The tennis-ball ladder: prove all are white → "All tennis balls are white"; some → "On white tennis balls" or "New examples of white tennis balls"; new simple proof → "Short proof that all tennis balls are white"; counterexample → "Not all tennis balls are white"; further properties → "A remark on white tennis balls"; surveys must say "survey", and "A short survey" means incomplete, not few pages. Naming a cumbersome object ("Munro permutations") makes a title possible.
(d) Code: generic patterns (`^(On|Some|Towards|A note on|Some remarks on|Studies in|Aspects of|Notes on) `, title with no noun specific to the body, title > 15 words or < 2). LLM: "Does the title tell a reader what is proved/built/shown? Does it over- or under-claim relative to the main result sentence?" Margin note on the title line.

**27. Close the introduction with the structure of the paper in your own words. [Pak]**
(a) "In the last paragraph or subsection of the Introduction, outline the structure of the paper in your own words."
(b) "In the absence of the table of content, this helps the reader to navigate." (Pak: no table of contents unless > 60 pages.)
(c) None beyond the rule.
(d) Code: last paragraph of the Introduction section: does it mention `Section|§` at least twice or name ≥ 50% of the body section headings? If not → "No roadmap: a short paragraph saying what each section does would help the reader skip to what they need." Also detect a table of contents in a short article → "A table of contents in a short article is noise."

**28. The first paragraph may be the only place to be a writer: start with the big picture, not with "Let G = (V,E)". [Pak]**
(a) "Even if your paper is short, you can still get away with writing the first paragraph of the Introduction in [a nontechnical] style. In fact, I encourage you to do this." For long papers, a one-page "Foreword" subsection: big picture, motivating examples from other fields, underlying principles.
(b) "Since math writing tends to be so rigid, this is your only place to shine. Use it!"
(c) "Nothing is less inspiring than a paper which starts 'Let G = (V,E) be a loopless graph on n vertices.'"
(d) Code: first body sentence begins with `Let|Define|Denote|Suppose|Consider a|Assume`, or the first paragraph's math-token density > 3 per 100 words → "The article opens inside the formalism. One plain paragraph of why this matters would hold more readers." LLM: "Is the first paragraph readable by someone outside the subfield?" The tool must not write that paragraph; it notes the gap and the reason.

**29. Final Remarks are endnotes: short untitled subsections, decreasing importance, not read in order. [Pak]**
(a) Each subsection "between one-two paragraphs and a page at the most", ordered by "decreasing order of importance": expanded history first, then where to go next / applications, then own conjectures, then others' conjectures. Make placeholders while drafting; insert pointers from the body afterwards. "You are not supposed to read the Final Remarks in order."
(b) It is "an expanded footnote section", like endnotes in a monograph; otherwise the section is "like a paella".
(c) Objection quoted from a referee, "Devoting subsections to each paragraph makes this last section feel very disjointed," answered: that misses the point.
(d) Code: a closing section (heading matches `Final Remarks|Discussion|Concluding remarks|Notes`) that is one unbroken block > 400 words with no subsections → "Split into short numbered remarks, most important first." Also: every body pointer `see §6.x` should resolve to an existing subsection (dangling-reference check, pure code). Acknowledgements: short unnumbered section before References, "in the order of increasing importance" (conversations alphabetically, then specific help with what it was, then institutions, then grants) — a checklist, not a check.

**30. Figures: many, small, and incremental; big ones go to an appendix or the web. [Pak]**
(a) "Make a lot of them, but make them small… 3-5 cm." Need more detail? "Create several copies of the same picture, align them next to each other and add different levels of details on each copy." Over half a page → appendix or website with a link.
(b) Big figures "break the natural flow of the paper"; "the human eye is a very good instrument".
(c) None beyond the rule.
(d) Code: Markdown images with no reference from the text ("Figure N" never mentioned) → "This figure is never pointed to." Size is not knowable from Markdown; skip. Low priority for Clearpen.

**31. Rewrite the introduction last; let the paper stew; circulate before posting. [Pak] (Halevi: shelve it a month, or coauthors read each other's parts.)**
(a) "Start writing your paper by writing the first draft of the Introduction… and completely rewrite it after the rest of the paper is written." Then "let the paper stew for a week or two", show trusted colleagues, rewrite again. After finishing: a week off, reread "looking for typos, bad wording, imprecise statements", email colleagues, then arXiv; keep updating; errata separate.
(b) "More often than not, the paper turns up differently than you initially imagined it."
(c) None beyond the rule.
(d) This is process, not text. Clearpen's versions could support it: a "stale introduction" note when the body has changed by > 40% since the introduction section was last edited (code, from version diffs). The Review can also run the intro's four questions against the *current* body: "The introduction promises X; the body's main result is Y."

**32. Know what you want to say before you write: the one-sentence and one-paragraph summary; the five-minute colleague test. [Halevi]**
(a) "Try to summarize for yourself the main idea(s) in the paper as concisely as you can. Can you summarize it in one sentence? In one paragraph? Imagine that your colleague… just came back from vacation, and you want to tell her about your result in five minutes. You don't need to fill her up on background, just the new idea."
(b) "The most important thing in writing a paper is to decide what is it that you want to say… to teach the reader something new."
(c) Four bare-bone summaries, e.g. "The two seemingly unrelated concepts of L-functions and R-attacks are actually equivalent if you just look at them from this other direction"; "You have a new method… more efficient than previous work. You get the improvement by plugging the new work of Al Gorithm instead of the usual negotiation phase."
(d) A feature, not a check: before Review, ask the author for the one sentence (Clearpen's `brief`). Then LLM: "Does the abstract contain this? Does the introduction's end state it? Which section delivers it?" and code: does the sentence's key noun phrases recur in the abstract, the intro and at least one body heading?

**33. For the sake of clarity, ignore all rules. [Pak]**
(a) "When the rules of style and grammar make math unclear, you should simply ignore these rules. Try rewording the sentence first, of course, but if nothing works, go for it."
(b) Grammar rules are not the point; being understood is.
(c) Even "end all sentences with a period" can cause confusion when a sentence ends with a formula.
(d) Prompt implication for Fix grammar in the technical genre: never "fix" a sentence-final formula by adding a period inside math, never rewrite a formula-bearing sentence for grammar, never enforce Oxford commas or semicolon-vs-comma rules; when a grammar fix would change meaning near a formula, skip it. Also rule 4: do not vary repeated connectives.

---

## 3. The reader model

**Pak's readers** are a crowd of skimmers with no obligation to finish:
- "a graduate student at a small university with poor English skills… If confused on page 3, he is likely to give up and never finish." He may cite an older, weaker, better-written paper instead.
- "a postdoc at a major research university" checking 20 papers for her supervisor; she never sees the "notation explanation" disclaimer, decides the paper is irrelevant and moves on. You "lost both the citation and a chance to advance the area."
- "lazy senior scientists" who "brush off a paper… with ambiguous results and uncertain proofs"; clarity gives them "no excuse".
- The arXiv population: "Some people read many titles… only occasionally reading the abstracts. Some quickly skim most papers in their areas, but read none carefully. Some just read the introductions… Some skip everything in the paper and go straight to main results; if sufficiently interested, they then go back." The paper must work for all of these at once.
- Readers "with limited English, short attention span and no patience", who read PDFs, click internal links and press Back; who will not read Final Remarks in order.
- The reader's time is worth more than the author's: 30 minutes of the author's renaming beats "1 min each" of confusion for readers.

**Halevi's reader** is a program-committee member and a colleague:
- "most readers only have a few hours to read, understand, and evaluate your paper. They will need all the help that you can give them."
- They do not share the author's "intimate knowledge of all the relevant aspects" built over weeks.
- They do not remember, and may not have read, earlier sections; they read parts.
- Their "attention span… is not infinite"; detours mean they "never make it to the next section" with the key idea.
- They have a specific background: explain what *this* audience lacks, skip what it knows.
- They are not interested in the author's struggle, only in what is new and why it matters.
- The author-side proxy: a colleague back from vacation, five minutes, no background, "just the new idea".

**Implications for a Review feature**
1. **Review in reading order of a skimmer, not an editor.** Run checks on what each stopping point delivers: title alone; title + abstract; + first screen; + headings; + introduction. Report "A reader who stops after the abstract knows: …" using only quoted sentences. This turns Pak's Matryoshka and Halevi's "by the end of the introduction" into one judge.
2. **Find the first point of confusion.** Pak's "confused on page 3": the first term, acronym or symbol used before definition, and the first sentence over the length threshold, reported by position ("first stumble at word 380"). Code.
3. **Assume the reader forgot.** Flag long gaps between a definition and its use (rule 12); never let Shorten remove a reminder.
4. **Audience is a setting, not a guess.** Halevi's "explain what they don't know, skip what they know" is only checkable with a declared audience; the brief should carry it and the pedantry/under-explanation judge should refuse to run without it.
5. **Non-native by default in the technical genre.** Short sentences, repeated connectives, plain words, no derived variants: the Simplify instruction set for this genre is Pak's "downshift".
6. **Prefer the result to the journey.** Notes on effort-talk (rule 15) and on motivation-before-result in the abstract (rule 20).

---

## 4. Document-structure checks

Each check: what to run (code / LLM / both) and what the margin note should say. Anchors use Clearpen's `Section` spans; notes carry `category: 'structure'` unless stated. "Intro" means the first section or the text before the first level-2 heading.

| # | Check | How to detect | Margin note (draft wording) |
|---|---|---|---|
| S1 | Main claim stated early (Pak 3.5) | Code: word offset of the first claim-marker sentence (`we show/prove/present`, `Theorem`, `main result`, `in this article we`); thresholds 450 / 900 words. LLM confirms: "Quote the sentence stating the main result." | "The main result first appears N words in. Pak's rule: first theorem on the first page. A reader who skims will not reach it." |
| S2 | Intro answers Halevi's four questions | LLM over the intro only, returns {problem, why, new, prior} each as a quote or "not found". Code pre-check: novelty/contrast markers present? | "The introduction says what the problem is and why it matters, but never what is new here." (names the missing one) |
| S3 | One-sentence summary present in abstract (Halevi §2) | LLM: "Quote one sentence a colleague could repeat as the result; what kind of contribution does it name?" If a `brief` exists, code: do its key noun phrases appear in the abstract? | "The abstract describes the topic but no sentence states the result. Your brief says: '…' — it is not here." |
| S4 | Abstract is dry, result-first, short (Pak 3.3) | Code: length ratio (> 2% of body or > 250 words), first-person hedges, > 2 citations, a question mark; LLM: "Is the first sentence a result or a motivation?" | "Abstract: N words for an article of M. Results first, no connections to other work, no details." |
| S5 | Roadmap paragraph closes the intro (Pak 3.5) | Code: last intro paragraph mentions `Section|§` ≥ 2 times or ≥ 50% of body headings. | "No roadmap. One paragraph saying what each section does lets readers jump to what they need." |
| S6 | Every term/acronym defined before first use (Halevi §3; Pak 1.2) | Code: acronym without expansion at first use; defined-term registry vs first occurrences; symbols introduced after use in math spans. LLM with audience: "List terms used before they are explained." | "'XYZ' is used here and defined only in §4. Define it at first use or point forward." (`related` → the definition span) |
| S7 | Notation reminder after a long gap (Halevi §3; Pak 5.3) | Code: gap > 1,500 words between mentions of a defined symbol/term with no reminder phrase. | "'σ' was last mentioned 1,800 words ago. A few words recalling what it is would help." |
| S8 | Consistent notation across sections (Pak 1.2) | Code: a single-letter symbol defined twice with different patterns (`let h be a function` vs `h ∈ ℤ`), or used both as a function (`h(`) and as a variable; same term with two spellings/hyphenations. | "'h' is a variable in §2 and a function in §4. Rename one; a disclaimer is not enough, readers who skim won't see it." |
| S9 | No derived variants of defined terms (Pak 5.3) | Code: stem/suffix match against the defined-term registry. | "You defined 'nice graph'; 'niceness' is a new word for the reader. Use the defined form." |
| S10 | Each section opens with what it does (Halevi §3) | Code: orientation marker in the first sentence, or first paragraph is a bare formal statement. LLM: "Does the opening say what the section does and why it matters for the main result?" | "This section starts inside the details. Say first what it does and what it is for." |
| S11 | Signposts exist (Halevi §3; Pak 3.7) | Code: cross-reference phrase count per section and per document; 0 in a document with ≥ 4 sections. | "No forward or backward pointers in 2,400 words. Readers who skip will not find their way back." |
| S12 | Main point restated where used (Halevi §3) | Code: key noun phrases of the thesis sentence (from brief or S3) appear only once. LLM: "Where does the body restate or use the main result?" | "The main result is stated once, in the introduction. Restate it where it is proved." |
| S13 | Intro free of technical definitions, examples, big figures (Pak 3.5) | Code: `Definition`, numbered equations, images, `For example` paragraphs inside the intro; counts ≥ 2. | "Two formal definitions in the introduction. Point to them: '(see the exact definition in §3.4)'." |
| S14 | Intro opens with a plain paragraph (Pak 3.6) | Code: first body sentence begins `Let|Define|Denote|Suppose|Consider`; high math density in paragraph 1. | "The article opens with 'Let G = (V,E)…'. One plain paragraph on why this matters would hold more readers." |
| S15 | Citation hygiene: no ranges, no history dumps in intro, no mid-argument stories (Pak 4.3–4.4) | Code: `[2–19]` ranges; intro paragraph with ≥ 6 citations; body citation followed by > 1 narrative sentence. | "'See [2–19]' helps no one find anything and gives no one credit. Name each paper's contribution, most important first." |
| S16 | Citation of a specific result carries a locator (Pak 4.5) | Code: result word + citation key, no `Theorem N / § / p.` | "Which theorem of [X]? Add a locator (Theorem 3.2, §3.1)." (low severity) |
| S17 | Citation phrasing matches intent (Pak 4.2) | Code: classify `in [X]` / `see [X]` / `see e.g.` / `see also` / `claims`; show what it signals. | "'see e.g. [three sources]' signals a folklore result with no specific source. If [X] contains the proof, write 'in [X]'." |
| S18 | Detours and footnotes (Halevi §3; Pak 3.7) | Code: aside-marker paragraphs > 30% of a section; footnotes > 1/300 words or > 10. LLM: "Which paragraphs are not on the path to this section's result?" | "Four asides in this section. Move them to a Discussion/Final Remarks and leave '(see §6.2)'." |
| S19 | Closing section is structured endnotes (Pak 3.7) | Code: closing section is one block > 400 words with no subsections; dangling `§6.x` pointers. | "Final Remarks as one block. Split into short remarks, most important first; readers will not read it in order." |
| S20 | Title says what is shown (Pak 3.2) | Code: generic opener patterns; length. LLM: "Does the title match the main-result sentence? Over- or under-claim?" | "'On some problems in…' is generic. Say what is proved: 'All tennis balls are white' / 'Not all tennis balls are white'." |
| S21 | Notation density in the intro (Halevi §2) | Code: math spans per 100 words in intro > 2; any index set with ≥ 3 subscripts. | "The introduction leans on notation. Say it in words here and keep the symbols for §3." |
| S22 | Stale introduction (Pak 3.5) | Code (versions): body changed > 40% since intro last edited. LLM: "Does the introduction promise what the body delivers?" | "The body has changed since the introduction was written. Pak: rewrite the introduction last." |
| S23 | Effort-talk (Halevi §2) | Code wordlist + LLM confirmation. | "This tells the reader about your effort, not your result." |
| S24 | Example before generality | **Not a rule in either text.** Nearest support: Pak's easy-to-state corollaries as the intro's advertisement; "just draw a picture"; Halevi's plain-English overview before formal detail. Report as "intuition-before-formalism", LLM only: "Does a formal statement arrive before any informal explanation of it?" | "The theorem arrives before any plain statement of what it says. One sentence in words first would help." |

Checks S1, S5–S9, S11, S13–S17, S19, S21 are code-only or code-first. S2, S3, S10, S12, S22, S24 need the model. S4, S18, S20, S23 are code with optional LLM confirmation.

---

## 5. The don't-lists

Near-verbatim; the phrasing in the "Avoid" column follows the source closely.

### Pak

| Avoid | Where in Pak | Why (Pak's reason) | Checkable by |
|---|---|---|---|
| Using the same letter for two things (h a variable in one section, a function in another) and "fixing" it with a disclaimer | §1.2 | skimming readers never see the disclaimer; "being clear is not about you" | code (S8) |
| Letting grammar/style rules make the maths unclear | §1.5 | clarity outranks rules | prompt rule |
| A long paragraph; a "succession of tiny paragraphs" | §2.2 (Zinsser) | visual discouragement / chopped train of thought | code (rule 9) |
| Titles "too long, too short, too vague or generic (as in 'On some problems in group theory')" | §3.2 | title is the first approximation of contents | code + LLM (S20) |
| Calling a survey "short" when you mean few pages | §3.2 | "short survey" means incomplete | LLM |
| Anything personal in the abstract; details; connections to other work "unless absolutely necessary" | §3.3 | abstracts are read alone | code + LLM (S4) |
| An abstract of 10 lines for a 10-page paper | §3.3 | 0.3–0.5 lines per page | code (S4) |
| A table of contents under 60 pages | §3.4 | PDF readers have one | code |
| An introduction with no stated results (unless < 1.5 pages and the paper ≤ 10 pp) | §3.5 | people go straight to results | code + LLM (S1) |
| Technical definitions, examples, big figures in the Introduction | §3.5 | length; point to them instead | code (S13) |
| "Giving everybody his due" in the Introduction | §3.5, §4.4 | too many relevant papers; intro length | code (S15) |
| Opening with "Let G = (V,E) be a loopless graph on n vertices." | §3.6 | "Nothing is less inspiring"; only place to shine | code (S14) |
| A Final Remarks "paella": unstructured leftovers | §3.7 | not read in order; endnotes role | code (S19) |
| "See [2–19] for some relevant work" | §4.3 | finds nothing, credits no one, pits authors against each other | code (S15) |
| Citing anything in the main part except a result used as a lemma; telling the story of that result mid-proof | §4.4 | cannot be fair, clear and complete there | code (S15) |
| Quoting a specific result from a long work without a location | §4.5 | versions shift; readers must find it | code (S16) |
| BibTeX unless expert; inconsistent author spellings; bloated references; full middle names ("Richard Peter Stanley"); Cyrillic/characters in references | §4.6 | consistency and brevity | code (consistency only) |
| Being pedantic about standard notions (defining Q ⊂ R, what a tiling is) | §5.2 | "extra explanations are distracting" | LLM with audience |
| "Difficult words like 'henceforth'"; varying style for its own sake | §5.3 | limited-English readers | code wordlist + prompt rule |
| Tenses other than present (occasionally past) indefinite in the body | §5.3 | simplicity | code (rule 6) |
| Long sentences; clauses without commas | §5.3 | structure must be visible | code (rule 1) |
| Semicolons | §5.3 | implicit logical link | code (rule 2) |
| Unspaced long dashes | §5.3 | distracting | code |
| Uncommon spellings ("coöperation", "colouring") | §5.3 | most common spelling | code: consistency only (Clearpen never Americanises) |
| Variations of a defined term ("niceness of graphs") | §5.3 | each variant is a new word | code (S9) |
| Look-alike letters (κ/k, υ/v, ∅ vs 0, ι, ϖ, Ξ), Gothic fonts, ε vs ϵ confusion | §5.4 | visual ambiguity | code in math spans |
| Trusting LaTeX spacing: `Φ(2a+c)Φ(c−2a)`, `1210221` | §5.5 | reads as a different expression | code in math spans |
| BIG figures with too many details | §5.6 | break the flow | — (not knowable from Markdown) |
| Posting the day you finish; whitewashing a wrong published proof in a silent update | §6.1 | stew a week; errata are separate | process |

### Halevi

| Avoid | Where in Halevi | Why (Halevi's reason) | Checkable by |
|---|---|---|---|
| Not knowing the one-sentence version of your own result | §1.1 | "decide what is it that you want to say" | brief + LLM (S3) |
| Requiring "the entire history of civilization just to understand your terminology" | §1.2 | the reader's background is not yours | LLM with audience (S6) |
| Writing from the inside, with "intimate knowledge" the reader lacks | §1.2 | simulate the reader | process; S22 |
| An abstract without the one-sentence summary or the kind of contribution | §2 | reader must know where to look | LLM (S3) |
| An introduction that does not leave the reader knowing "what is the new idea" | §2 | reviewers decide from it | LLM (S2) |
| Notation in the introduction, e.g. `Adv^{CCA-PKT-RND5}_{A,B,T}(t,q,r)` | §2 | "re-think your presentation" | code (S21) |
| Describing non-relevant prior work ("the entire history of… multi-party computation" for an XOR protocol) | §2 | relevance | code + LLM (S15) |
| Trying "to impress the reader with how complicated the problem is, or how hard you had to work" | §2 | readers don't care about your versions | code + LLM (S23) |
| Diving into details before describing the overall structure | §3 | reader needs the plan | code + LLM (S10) |
| Assuming the reader "remembers (or even read)" earlier parts | §3 | parts are read out of order | code (S7, S11, S12) |
| Saying an important thing only once | §3 | "more than once… more than twice" | code + LLM (S12) |
| Few forward/backward pointers | §3 | navigation | code (S11) |
| Explaining what the audience knows; glossing over what it doesn't | §3 | target audience | LLM with audience |
| Heavy sub/superscripts, `P^b_{i,j,k,r}`; unexplained notation; notation from "four pages ago" without a reminder | §3 | "a sure way to lose your readers" | code (S7, S21) |
| "Branching and detours", "every little variation… to the fourth order" | §3 | finite attention; reader never reaches the key idea | code + LLM (S18) |
| Too many footnotes (prefer a Discussion section) | §3 | flow | code (S18) |

---

## 6. Quotes

All under 15 words, verbatim.

Pak:
- "When you are unclear, all claims look reasonably true." (§1.1, fn. 1)
- "being clear is not about you!" (§1.3)
- "clear rather than perfect writing" (§2.3)
- "make it clear, precise, plain and uninventive." (abstract, §3.3)
- "This is the hardest section to write." (introduction, §3.5)
- "aim to have your first theorem on the first page" (§3.5)
- "Nothing is less inspiring than a paper which starts 'Let G = (V,E)…'" (§3.6)
- "Nothing is cited in the main part of the paper." (§4.4)
- "a disservice to the community to write 'See [2–19] for some relevant work'" (§4.3)
- "Don't be pedantic." (§5.2)
- "Just draw a picture and get on with your math." (§5.2)
- "it is perfectly ok to be repetitive and have ten therefore's" (§5.3)
- "Write short sentences." (§5.3)
- "Do not use a semicolon" (§5.3)
- "Do NOT trust LaTeX." (§5.5)
- "Make a lot of them, but make them small." (figures, §5.6)

Halevi:
- "to write clearly you must know what you want to say" (Preface)
- "most readers only have a few hours to read, understand, and evaluate your paper" (§1.2)
- "the reader should know what is the new idea" (§2)
- "Go super easy on notations." (§2)
- "use notations only as a last resort" (§2)
- "Describe the relevant prior works, but skip the non-relevant ones." (§2)
- "Don't try to impress the reader with how complicated the problem is" (§2)
- "Keep the reader informed about what's happening now and what's coming next." (§3)
- "If some aspect is important, describe it more than once." (§3)
- "Put many forward and backward pointers in the paper." (§3)
- "make sure that you explain every bit of notations" (§3)
- "a sure way to lose your readers" (§3)
- "The attention span of your reader is not infinite" (§3)

---

## 7. Assessment: highest-value ideas for an app that edits but never writes

1. **The intro contract (S1–S3, S5): "what problem, why it matters, what is new, how it relates, where it is proved."** Both authors make the introduction the whole game; Pak adds a position rule (first theorem on page one) and a closing roadmap. Clearpen already has a `brief`; make the author's one-sentence result part of it and let Review check that the abstract contains it, the introduction ends knowing it, and a body section delivers it. Position and roadmap detection are **code**; the four questions and the "quote the result sentence" are **model** calls over the introduction only, which is small enough for a 4B model. The margin notes name what is missing; they never draft it. This is the single feature most distinct from generic editing.

2. **A definition and notation registry (S6–S9, S21).** Pak's h-variable/h-function story, Halevi's "explain every bit of notation" and "remind after four pages", Pak's "no niceness of graphs". Build a registry of defined terms, acronyms and single-letter symbols with positions; from it fall out: used-before-defined, redefined with a different meaning, derived variants, long-gap uses without a reminder, acronym without expansion, notation density in the intro. All **code**, high precision, and all anchorable to two spans (`Finding.related`). It also gives the Review a "first point of confusion" position, which is Pak's "confused on page 3" made measurable.

3. **Signposting and section openings (S10–S12).** Halevi's "what's happening now and what's coming next" is the section-level twin of Clearpen's paragraph judge. Code counts pointers and tests first sentences for orientation markers; the model judges whether a section's opening says what it does and why. A natural extension of `tasks/next.ts`: in the technical genre, the paragraph judge's triad (point, reason, why it matters) becomes (claim, where it is justified, role in the main result).

4. **A "technical" style profile for the edit prompts (rules 1, 2, 4, 5, 6, 11, 33).** This costs no new UI: in `GENRES: 'technical'`, Improve/Shorten/Simplify/Fix grammar get Pak's downshift as instructions, with three inversions of general-prose editing that must be explicit: (i) do not vary connectives or introduce synonyms for defined terms; (ii) do not remove restatements, "recall that…" reminders or forward pointers as redundancy; (iii) do not enforce grammar rules on or around formulas. Plus code-side rules with no model at all: semicolons, long sentences without commas, difficult-word list, future tense in body sections, term-variant detection, mixed spelling consistency (never Americanisation, per Clearpen's own rule).

5. **Citation and detour hygiene (S15–S19).** Pak's `[2–19]` rule, citation-count-per-intro-paragraph, locator-missing, and his citation-phrasing ladder are all regex-level **code** with crisp, teachable margin notes. Halevi's detours and footnotes are code-countable (aside markers, footnote density), with the model only needed to say which paragraphs are off the main line; the tool's proposal is a *move* to a Discussion/Final Remarks section with a pointer left behind, which is an edit, not writing.

Code-detectable without a model: 2, 5, the code half of 4, and the position/roadmap parts of 1 and 3. Needing a model: the four intro questions, "quote the result sentence", section-opening judgment, detour identification, pedantry-vs-under-explanation (and that one also needs a declared audience in the brief; without it the check should not run).

Two cautions. Several Pak thresholds are math-journal conventions (abstract at 0.3–0.5 lines per page, nothing cited in the body, Final Remarks as endnotes); Pak himself footnotes that CS-theory style differs. Clearpen should treat them as genre-tunable soft notes with the source named ("Pak's rule for math papers"), not as errors. And where Pak and Clearpen's principles collide (American spelling vs. never changing the author's dialect), Clearpen's principle wins and the check degrades to consistency.
