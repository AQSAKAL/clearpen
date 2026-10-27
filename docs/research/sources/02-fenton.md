# Fenton, "Improving your technical writing skills" — study notes for Clearpen

Page numbers below are the PDF's own ("Page n/33"). Text studied: Version 4.1, 25 September 2003, 33 pages, fetched from https://web.mae.ufl.edu/designlab/Online%20Resources_files/Technical%20Writing%201.pdf (Fenton's QMUL copy at eecs.qmul.ac.uk/~norman/... now redirects to an empty webspace page). Local copies: `scratchpad/dl/fenton/fenton.pdf` and the extracted `fenton.txt`.

**Not in this text, despite what the brief expected:** no fog index or any readability formula, no numeric sentence-length threshold ("reasonably short" is all he says), no "and/or" rule (Fenton himself writes "and/or" on pp. 10 and 12), no "which vs that", no "so what" test by that name. The nearest thing to "so what" is his rule that every sentence must contribute to the report's single stated objective (p. 5). Those items probably come from Kirkman or Turk & Kirkman (his references, p. 33) or from another text in this study; do not cite Fenton for them.

## 1. Source

Norman Fenton (Computer Science, Queen Mary, University of London), a 33-page plain-English guide, originally his "Good Writing" web pages (2000), revised 2003. Aimed at students and researchers writing technical and business reports, "but the principles are relevant to any form of writing" (p. 1). He says the ideas are "not original" but a "modern consensus" drawn from Jay, Kirkman, O'Connor, Turk & Kirkman. The thesis: simplicity and informality — shorter sentences, simplest words, active not passive, personal not impersonal, verbs not noun constructs — produce reports that "get results".

## 2. Principles

Each entry: (a) rule, (b) Fenton's reason, (c) example from the text, (d) detection. "Code" = deterministic heuristic; "LLM" = model judgment.

### 1. One objective, written in one sentence, stated at the start (p. 5)
- (a) Before writing, write the document's single objective in one sentence; state it at the beginning; remove anything that does not contribute to it.
- (b) "If you fail to do this you will almost certainly produce something that is unsatisfactory." If you cannot write it in one sentence "you are not yet ready to start any writing."
- (c) His own: "to help students write well structured, easy-to-understand technical reports".
- (d) LLM: "From the opening paragraphs, state this article's objective in one sentence. If you cannot, say so." Then per paragraph: "Does this paragraph contribute to that objective? If not, say what it does instead." Feature: an optional "Objective" field at the top of an article that Review uses as the yardstick (this is Fenton's version of the "so what" test). Code: none.

### 2. Write for a specific reader: intelligent but uninformed (p. 5)
- (a) Assume one specific reader who is intelligent but does not know your subject; optionally state the reader profile up front.
- (b) Knowing the reader decides what to explain, what jargon is allowed, how much background is needed.
- (c) His own profile: "students and researchers with a good working knowledge of English... not suitable for children under 13."
- (d) LLM, given a reader profile set by the author: flag terms, acronyms and assumed knowledge that reader would not have. Code: undefined-acronym check (see 21). Feature: a per-article "Reader" setting fed into Review and Simplify prompts.

### 3. Short sentences: one unit of information each (pp. 6–7)
- (a) A sentence carries a single unit of information. Avoid compound sentences; be suspicious of `and`, `or`, `while` joining clauses. Use parentheses sparingly; never nest them. Check for faulty construction (comma splices).
- (b) "There is nothing clever about writing long, complex sentences. For technical writing it is simply wrong." Passive and noun constructs are the main causes of length; fixing those shortens sentences.
- (c) Bad: "Time division multiplexed systems are basically much simpler, the combination and separation of channels being affected by timing circuits rather than by filters and inter-channel interference is less dependent on system non-linearities, due to the fact that only one channel is using the common communication medium at any instant." Good (three sentences): "Systems multiplexed by time division are basically much simpler. The channels are combined and separated by timing circuits, not by filters. Interference between channels depends less on non-linear features of the system, because only one channel is using the common communication medium at any time."
- (d) Code: word count per sentence; Fenton gives no number, so choose one (suggest warn at >30 words, strong at >40). Count clause-joining conjunctions: ≥2 of {and, or, while, but} between independent clauses (heuristic: conjunction preceded by a comma or followed by a subject pronoun/noun + finite verb) → "compound sentence". Nested parentheses: `\([^()]*\(` → flag always. Comma-splice heuristic: `, [a-z]+ being ` / `, due to the fact that`. LLM for Shorten: "Split this into sentences of one idea each; do not drop information."

### 4. Short paragraphs: one coherent idea, under half a page (p. 7)
- (a) A paragraph contains one coherent idea and is less than half a page. A run of very short paragraphs is also bad: it is "often the result of poorly structured thinking" and usually wants a list.
- (b) Long paragraphs hide structure; short successive paragraphs are hard to read.
- (c) None given beyond the rule; the list examples (principle 5) show the fix.
- (d) Code: paragraph > ~200–250 words (half a page of 12pt single-spaced) → note "more than one idea?"; ≥3 consecutive paragraphs of ≤2 sentences → "would this be clearer as a list?". LLM: "Does this paragraph contain more than one idea? If so, where would you split it?" This is close to the existing next-sentence judge (point / reason / why it matters).

### 5. If it is a list, display it as a list (pp. 7–8)
- (a) When sentences in a paragraph form a sequence or a set, introduce them with the relating idea and set them as a list: numbered if order matters, bullets otherwise. Punctuation: items under one line get none; otherwise a full stop on each.
- (b) "The simple rule of thumb is: if what you are describing is a list then you should always display it as a list." Lists make things "clearer and less cluttered"; "You should never be sparing in your use of such lists."
- (c) The "getting to university" paragraph ("First of all you have to set your alarm... You should next take a shower and then get yourself dressed... finally walk to the University") becomes a 10-step numbered list. The "good software engineering" paragraph ("One such principle is... It is also important to... Another principle is... In addition to the previous principles...") becomes four bullets.
- (d) Code: count sequence/enumeration markers in one paragraph — {first(ly), second(ly), third(ly), next, then, after that, finally, lastly, one such, another, also, in addition, furthermore, moreover} — ≥3 in a paragraph with ≥3 sentences → "hidden list". Also "a number of X" / "the following" / "several" followed by prose rather than a list. LLM: "Are these sentences parallel items of one list? If so, give the lead-in sentence and the items, marking whether order matters." Output as tracked edit converting prose to Markdown list.

### 6. Replace difficult words and phrases with simpler alternatives (p. 9)
- (a) Prefer the plain word. Table 1 (section 5 below) lists the pairs. Never `utilise` or `facilitate`; never `render` meaning `make`.
- (b) "the simplest words and expressions possible"; `utilise` and `facilitate` are "respectively the most useless and pompous words in the English language" (p. 17).
- (c) Eurostar announcement "Do not hesitate to contact us in the event that you are in need of assistance at this time" → "Please contact us if you need help now". "The testing strategy rendered it impossible..." → "made it impossible".
- (d) Code: word/phrase table with replacements, case-insensitive, inflection-aware (utilise/utilises/utilised/utilising/utilisation; facilitate/facilitates/facilitated/facilitating). Offer as one-click tracked edit. `render` needs LLM confirmation (legitimate in graphics/building senses).

### 7. Avoid stock phrases (p. 9)
- (a) Replace the eight stock phrases of Table 2 with their one-word equivalents.
- (b) "cumbersome and pompous."
- (c) "At this precise moment in time" → "Now"; "I am in receipt of" → "I have".
- (d) Code: regex table (section 5). Deterministic tracked edits.

### 8. Avoid legal words and pomposity (p. 10)
- (a) Never use legalisms (forthwith, hereof, thereof, herewith, aforementioned, "the said X").
- (b) Lawyers write to be unreadable; copying them makes you unreadable, not clever.
- (c) "The said software compiler" → "The software compiler"; "The aforementioned people have agreed" → "A and B have agreed".
- (d) Code: word list (section 5). `the said` and `aforementioned` → delete or ask LLM to name the referent.

### 9. Avoid jargon; define it on first use (p. 10)
- (a) Avoid specialist shorthand unless every reader shares the field; otherwise define the term the first time it appears and/or provide a glossary.
- (b) Jargon excludes the uninformed reader you are writing for.
- (c) "MS/DOS, Poisson distribution, distributor cap" are fine only for computer specialists, statisticians, mechanics respectively.
- (d) Code: acronyms and all-caps tokens used without a bracketed definition at first occurrence (see 21). LLM, given the reader profile: "List terms this reader would not know that are not explained where first used."

### 10. Avoid abstract words that pad a sentence (pp. 10–11)
- (a) Avoid `nature`, `position`, `character`, `condition`, `situation` when they merely wrap an adjective or a verb.
- (b) They "repeat an idea already expressed in another word", wasting space and blunting the message.
- (c) "The product is not of a satisfactory nature" → "The product is unsatisfactory"; "After specification we are in a position to begin detailed design" → "After specification we can begin detailed design"; "We are now in the situation of being able to begin" → "We can now begin".
- (d) Code: `of an? \w+ (nature|character)` → adjective alone; `in a position to` → `can`; `in the situation of being able to` → `can`; `in a \w+ condition` → adjective. Tracked edits with LLM to fix agreement.

### 11. Cut redundant words (p. 11)
- (a) Do not say in several words what one says; delete words that repeat an idea already present.
- (b) Redundancy "leads to unnecessarily complex sentences".
- (c) "The printer is located in the immediate vicinity of the computer" → "The printer is near the computer"; "The user can visibly see" → "can see"; "a shirt that was blue in colour" → "a blue shirt"; "The reason for the increase... was due to" → "The increase... was due to".
- (d) Code: phrase table (section 5, "Redundancy"). LLM for the general case in Shorten: "Remove every word whose idea is already expressed by another word in the sentence; keep meaning."

### 12. Avoid empty modifying words (pp. 11–12)
- (a) Drop vague intensifiers/qualifiers (`suitable`, `suitably`, `absolute(ly)`, `considerable`...) unless they modify something concrete and measurable.
- (b) "John left the building in suitable haste" means exactly what "John left the building in haste" means. The `-ly` form is "also usually redundant".
- (c) absolute nonsense → nonsense; absolutely critical → critical; considerable difficulty → difficulty; considerably difficult → difficult. Allowed: "Jane set John a suitable task" (concrete reference).
- (d) Code: list of 14 modifiers plus their `-ly` forms (section 5) → flag; auto-delete only when followed by an abstract noun or an adjective (nonsense, critical, difficulty, important, clear, obvious). LLM decides concrete vs. abstract use. Fits Clearpen's existing "sweeping claims" check family.

### 13. Remove repetition across the document (p. 12)
- (a) Each idea appears once, in the best place; the only allowable repetition is in introductions and summaries. Method: list the key ideas as they appear; where one appears twice, pick its place and delete or merge the rest.
- (b) "Poorly structured reports are often characterised by the same idea being described in different places."
- (c) None beyond the rule.
- (d) Code: near-duplicate sentence detection (word 3-gram Jaccard ≥ 0.5 between sentences in different paragraphs, excluding the first and last section) → margin note linking the two places. LLM: "List the key claims of each paragraph; flag claims made in more than one paragraph outside the introduction and the conclusion." Complements the existing contradiction check (same machinery, opposite sign).

### 14. Use verbs, not abstract nouns made from verbs (pp. 12–13)
- (a) Where a sentence uses a noun derived from a verb (`development`, `specification`, `measurement`, `analysis`, `testing`, `execution`, `utilisation`, `consideration`), use the verb.
- (b) "Turning verbs into abstract nouns always results in longer sentences than necessary." The published sentence "It was reported by Jones that method x facilitated the utilisation of inspection techniques by the testing team" breaks "just about every principle" (noun construct, forbidden words, passive).
- (c) "Half the team were involved in the development of system Y" → "involved in developing system Y"; "Acid rain accounts for the destruction of ancient stone-work" → "Acid rain destroys ancient stone-work"; "The analysis of the software was performed by Fred" → "Fred analysed the software"; "Clicking the icon causes the execution of the program" → "The program executes when the icon is clicked".
- (d) Code: patterns `(the|a|an) \w+(tion|sion|ment|ance|ence|al|ure|ing) of` preceded within 4 words by a light verb {perform, carry out, conduct, undertake, achieve, make, cause, involve, account for, take into, be responsible for} or followed by `was (performed|carried out|conducted|undertaken) by`. Also `take into consideration` → `consider`. LLM rewrites: "Rewrite with the action as a verb and the doer as the subject; keep all facts."

### 15. Active rather than passive (p. 13)
- (a) Write in the active voice unless you have a specific reason to stress the thing acted upon.
- (b) Passive is "the most common reason for poorly structured sentences and it always leads to longer sentences". Writers use it believing it is more formal; "It is not."
- (c) "The report was written by Bloggs, and was found to be excellent" → "Bloggs wrote the report, and it was excellent"; "It was reported by the manager that the project was in trouble" → "The manager reported that..."; "The precise mechanism responsible for this antagonism cannot be elucidated" → "We do not know what causes this antagonism"; "The stability of the process is enhanced by co-operation" → "Co-operation improves the stability of the process". Allowed: "the city was destroyed by constant bombing" (emphasis on the city).
- (d) Code: `\b(is|are|was|were|be|been|being)\b( \w+ly)? \w+(ed|en|t)\b( by\b)?` with an irregular-participle list; `It (was|is|has been) \w+ed (by|that)` is the strongest signal ("It was reported by X that" → "X reported that"). Report as a count per paragraph; flag when > 1 in 3 sentences. LLM for the rewrite and for the exception ("Is the thing acted on the real topic here?").

### 16. Personal rather than impersonal (pp. 13–14)
- (a) Write "I"/"we", not "the author", "the writer", "the author of this report", and never "one" ("One can conclude").
- (b) Impersonal style is "more natural"-sounding only to those taught it; it forces passives and noun constructs, creates ambiguity (which author?) and even uncertainty: "It is not possible to state the exact mode of operation of the drug" may mean the authors don't know, or that the drug cannot work. "The 'royal' we is better than the royal 'one'."
- (c) "The current research work of the author of this report is also described" → "I also describe my current research work"; "it is the writer's belief that" → "I believe"; "Examination and discussion of the results obtained, are necessary before a decision can be taken" → "We must examine and discuss the results before we decide"; "Recent experiments involving formal inspections have resulted in..." — ambiguous whose.
- (d) Code: `the (author|writer)('s)?( of this (report|article|paper))?`, `the authors`, `\bone (can|may|might|should|could)\b`, `it is (the )?(author|writer)'s (belief|view|opinion)`, `it is not possible to (state|say|determine)`. Flag; LLM rewrite in first person. Make this a tone option the author can turn off (journals and some house styles still want third person).

### 17. Explain new ideas with an example before the definition, plus analogy or diagram (p. 15)
- (a) When introducing a new or abstract concept, give an example first, then the general definition; use an analogy; use a simple diagram where possible.
- (b) "The general rule is to try to provide an example before providing an abstract definition or generalisation."
- (c) He introduces active/passive by showing "Joe tested the software" / "The software was tested by Joe" before defining them. Email explained to someone out of a 20-year coma as "sending a letter, but without... a stamp".
- (d) LLM: detect definitional sentences (`X is`, `X refers to`, `X means`, `we define`, `so-called`) and ask "Is there a concrete example of X within this paragraph or the next? If not, note that the idea is defined but not shown." This is a natural extension of the next-sentence judge: a paragraph that defines without exemplifying has not made its point. Code can locate the definitional sentences; the judgment is the model's.

### 18. Name the same thing the same way every time (pp. 15–16)
- (a) Decide once what each key "thing" is called and use that name throughout. Ignore the school rule "never use the same word twice". Never use one word for two different things.
- (b) Varied naming "causes confusion and annoyance to readers"; it either reflects schooling or hides "genuine confusion in their own minds".
- (c) A project report used project / group project / group for the project; project plan / requirements / requirements specification for the plan; system / software / project / code / final code for the system. Fixed by using exactly `project`, `plan`, `system`.
- (d) LLM (primary): "List the key things this draft refers to. For each, list every name used for it. Flag any thing with more than one name, and any name used for more than one thing." Code assist: extract repeated noun phrases and known near-synonym sets (system/software/code/tool/program; plan/spec/specification/requirements; user/customer/client; article/post/piece/essay) and report co-occurrence in one draft. Feature: a "Terms" panel per article that lists the chosen names and flags drift. One of the most valuable and least-automated of Fenton's rules.

### 19. Gender-neutral pronouns without "he/she" (p. 16)
- (a) For a non-specific person do not write `he`, `she`, `him`, `her`, nor `he/she`, `him/her`. Use `they/them/their`, recast in the plural, use `you/your`, or rewrite to avoid the pronoun.
- (b) Avoidable without adding complexity; "the awful 'he/she'".
- (c) "ask your boss if he wants you to help him" → "if they want you to help them"; "England expects every man to do his duty" → "everyone to do their duty"; "every employee should leave his desk tidy" → "leave your desk tidy".
- (d) Code: `\b(he/she|she/he|him/her|his/her|his or her|he or she|s/he)\b` → tracked edit to they/them/their. Generic singular antecedent + gendered pronoun (`the (user|reader|programmer|employee|customer)... (he|his|him)`) needs LLM to confirm the antecedent is generic.

### 20. Avoid the common confusables and misspellings; be consistent in spelling variety (pp. 18–19)
- (a) Learn the confusable pairs in Table 3 and the misspellings in Table 4; use a dictionary when unsure. Use British spelling (-ise, colour) unless writing for an American audience.
- (b) Spellcheckers miss confusables, which are "frequently misused in place of a similar sounding word".
- (c) affect (verb, influence) vs effect (noun, result; verb, bring about); practice (noun) vs practise (verb); its vs it's.
- (d) Code: confusable table with part-of-speech context rules, e.g. `(the|an|this|its) affect` → effect; `to effect (the|a)` ok; `(will|can|could|may|might|to) affect` ok; `(the|an|its) principle (reason|cause|aim)` → principal; `it's (own|\w+s\b)` → its; `its (a|an|not|been)` → it's. Spelling variety: detect mixed -ise/-ize and -our/-or in one draft → "inconsistent spelling"; the variety itself is a per-article setting, not a rule. Clearpen's autocorrect can carry the misspelling list.

### 21. Abbreviations only where necessary; define initials once (p. 19)
- (a) Never abbreviate out of laziness: no `approx.` (write "about"), no `e.g.` (write "for example"). `etc.` is redundant after "such as". A long name used once is written in full; used more than once, write it in full the first time with the initials in brackets, then use the initials; consider a glossary.
- (b) Abbreviations shift work to the reader; `etc.` after `such as` says the same thing twice.
- (c) "He eats lots of fruit, such as apples, oranges, bananas, etc." → "He eats lots of fruit: apples, oranges, bananas, etc." or drop etc. "Tottenham Hotspur Football Club (THFC)" then "THFC".
- (d) Code: `\bapprox\.`, `\be\.g\.`, `\bi\.e\.` → expansions; `(such as|for example|including|e\.g\.)[^.]*\betc\.` → redundant etc.; acronym detection: token `[A-Z]{2,6}s?` whose first occurrence is not immediately preceded by a bracket definition or followed by `(` → "undefined"; acronym defined but used once → "write it out". All deterministic.

### 22. Punctuation rules (pp. 20–21)
- (a) Capitals only for sentence starts, proper names, organisations/places, Acts, labels from proper names (Marxist, not communist), compass points inside country names (South Africa, not south London), titles with a name (the Duke of York, not the duke), historical periods, God. Apostrophes only for omitted letters (isn't, it's = it is) or possession (snake's, snakes', Jones's, boss's); never in plurals or possessive pronouns (its, hers, theirs). Commas for four reasons only: list items (semicolons if items contain commas), opening qualifier ("However,"), disambiguation ("alteration, of course"), inserted phrase (sentence must still make sense without it). Exclamation marks only for real exclamations or factorial.
- (b) Fewer commas follow from shorter sentences. The humour exclamation mark: "If the sentence was funny, the reader should have found it funny without having to be told to laugh."
- (c) Wrong: "I gave the cat it's food", "I like tomatoe's", "In the 1960's", "All the department's were represented", "I should of done my homework" (→ should've).
- (d) Code: `\b(19|20)\d\d's\b` → drop apostrophe; `\w+'s (were|are|have)\b` → plural apostrophe; `\b(should|could|would|must|might) of\b` → `have`; `!` at end of a sentence longer than ~5 words → "exclamation mark"; `[a-z]+'s` for pronouns `(it|her|their|our|your)'s` followed by a noun → possessive. Commas: count ≥3 commas with no list or qualifier → suggest splitting; inserted-phrase test is an LLM question: "Remove the words between the commas; does the sentence still make sense?" Over-capitalisation: mid-sentence capitalised common nouns not in a proper-noun list → LLM to confirm.

### 23. Document structure: introduce, tell, summarise; no hanging parts (pp. 23–26)
- (a) Every report has title, author, date, version, abstract (>5 pages), page numbers, contents (>10 pages), conclusions (>5 pages). Sections numbered; each heading accurately reflects its content; at every level at least two components (never a lone subsection); component lengths at one level not drastically different; before the first subsection, an introduction that walks through the subsections; a summary at the end of each main section. "Tell readers what you are going to tell them. Tell them it. Tell them what you have told them."
- (b) A 20-page document with one 18-page section and two 1-page ones "is an indication of poorly structured thinking." Hanging subsections break the logic of decomposition.
- (c) The disallowed outline: 1, 2, 2.1, 3 (2.1 is "hanging"); allowed: 1, 2, 2.1, 2.2, 3.
- (d) Code on the Markdown heading tree: exactly one child heading under a parent → "hanging subsection"; sibling section word counts with max/min ratio > 5 → "unbalanced sections"; no body text between a heading and its first child heading → "no introduction to this section"; last section not a summary/conclusion for drafts over N words → note. LLM: "Does this heading accurately describe the section's content? Does the introduction name what each subsection covers?" For articles, the structural part that transfers is: lead-in before subsections, no lone subsection, headings that match content, a closing that restates.

### 24. Figures and tables: numbered, cited by number, every one cited (pp. 26–27)
- (a) Number and label every figure and table; refer to them only by number ("Figure 1 shows"), never spatially ("the figure above"); every figure must be cited somewhere.
- (b) "Spatial references to figures without numbering are nearly always ambiguous"; reformatting moves figures.
- (c) "the figure above shows a footballer" → "Figure 1 shows a footballer".
- (d) Code: `\b(figure|table|chart|image|diagram|graph) (above|below)\b`, `\bthe (following|preceding) (figure|table)\b` → flag; images/tables with no caption; captions numbered but number never referenced in body → "uncited"; references to Figure N with no such figure → "missing".

### 25. Informative, not descriptive, abstracts/openings (pp. 29–30)
- (a) An abstract or executive summary states what the document found and recommends, not merely what it discusses. Never write a descriptive abstract.
- (b) Descriptive abstracts "provide no sensible information at all (beyond what you might find in the document title and table of contents)"; "most readers never get further than the abstract"; they are usually written before the work was done — "the abstract is merely a plan for the author."
- (c) Descriptive: "This report describes the advantages and disadvantages of each of the options available... and provides a recommendation." Informative: lists the four options, gives their costs and politics, and ends "We recommend option 3." Version B of the VDM study gives numbers (0.6 vs 1.4 faults per KLOC, 25% longer) and reservations.
- (d) Code on the first paragraph(s): density of `This (report|article|paper|post) (describes|discusses|presents|examines|considers|explains|outlines|looks at)` and `we (describe|discuss|present|consider|explain)` with no numbers, no named result, no recommendation verb (recommend, found, show that, conclude) → "descriptive opening". LLM: "Does the opening tell the reader what the article found or argues, or only what it will talk about?" Feature: a "Summary check" on the lede/standfirst.

### 26. Mathematics: italic variables, displayed equations, no symbol-initial sentences (p. 31)
- (a) Variables in italics; equations on their own line and labelled (except two-variable ones like x = y); never begin a sentence with a mathematical symbol.
- (b) Inline equations wrap and blur into prose; a sentence starting "z is..." is ambiguous and hard to read.
- (c) "z is in turn expressed as a function" → "The variable z is in turn expressed as a function".
- (d) Code: sentence starting with a single letter or `$`/symbol; inline `=` expression with ≥3 operands outside a display block. Low priority for Clearpen's article use case.

### 27. Review process: dictionary, a reader, a checklist (pp. 5, 28, 32)
- (a) Check unfamiliar words in a dictionary before using them. Find a friend or colleague to read a draft (they need not know the field). Before any review: check structure, run the spellchecker, read as the reader would. Act on the friend's recommendations.
- (b) The friend "can at least check the structure and style" and will "find the same problems that your intended audience would."
- (c) Fenton's own first book: "an outstanding technical editor highlighted the many problems with my writing."
- (d) Clearpen's Review is that friend. The checklist maps directly to a pre-publish check: structure checks (23–24), spelling (20), and the "read as the reader" pass as LLM review in the reader's persona (2).

## 3. Taxonomy of problems Fenton names

| Problem | One-line definition | Page |
|---|---|---|
| No objective | Document lacks a single stated objective expressible in one sentence | 5 |
| Off-objective material | Sentences that do not contribute to the objective | 5 |
| No specific reader | Writing without a target reader (intelligent but uninformed) in mind | 5 |
| Compound sentence | Two or more units of information joined with and/or/while | 6 |
| Faulty construction | Sentence held together by misused commas (comma splice, dangling participial clause) | 7 |
| Nested parentheses | Parentheses inside parentheses | 7 |
| Overlong paragraph | Paragraph longer than half a page or holding more than one idea | 7 |
| Fragmented paragraphs | Successive very short paragraphs; "poorly structured thinking" | 7 |
| Hidden list | A sequence or set written as prose rather than as a list | 7–8 |
| Difficult/pompous word | Long word with a plain equivalent (utilise, facilitate, commence...) | 9 |
| Stock phrase | Formulaic padding ("At this precise moment in time") | 9 |
| Legal word | Legalisms (forthwith, hereof, aforementioned, "the said") | 10 |
| Jargon | Field-specific shorthand undefined for the reader | 10 |
| Abstract wrapper word | nature, position, character, condition, situation wrapping a simpler word | 10–11 |
| Redundancy | Several words for one idea; one word repeating another ("visibly see") | 11 |
| Empty modifier | Vague intensifier/qualifier with no concrete reference (suitable, considerable) | 11–12 |
| Repetition | Same idea stated in more than one place outside intro/summary | 12 |
| Noun construct | Verb turned into an abstract noun ("the development of" for "developing") | 12 |
| Passive construction | "was tested by Joe" where "Joe tested" would do | 13 |
| Impersonal style | "the author", "the writer's belief", "one can" for I/we | 13–14 |
| Impersonal ambiguity | Impersonal phrasing that hides who did it or whether it is unknown vs impossible | 14 |
| Undefined concept | New idea defined without a prior example, analogy or diagram | 15 |
| Inconsistent naming | Same thing called by different names | 15–16 |
| Ambiguous naming | Same word used for different things | 16 |
| Gendered generic pronoun | he/his/she for a non-specific person, or "he/she" | 16 |
| Confusable | Wrong member of a sound-alike pair (affect/effect) | 18 |
| Misspelling | Table 4 words and the like | 19 |
| Spelling variety | American spelling for a non-American audience (or mixed) | 19 |
| Lazy abbreviation | approx., e.g. in place of words | 19 |
| Redundant etc. | etc. after "such as" | 19 |
| Undefined initials | Acronym not expanded on first use; or abbreviated though used once | 19 |
| Over-capitalisation | Capitals outside the permitted cases | 20 |
| Misplaced apostrophe | Plural or possessive-pronoun apostrophe ("1960's", "it's food") | 20 |
| "should of" | of for have | 20 |
| Comma misuse | Commas outside the four reasons; unremovable inserted phrase | 21 |
| Humour exclamation mark | ! to signal a joke | 21 |
| Missing front matter | No title/author/date/version/page numbers/abstract/contents/conclusions | 23 |
| Hanging component | A section with exactly one subsection | 25 |
| Unbalanced components | Sibling sections of drastically different length | 25 |
| Missing introduction | No overview and walkthrough before the first subsection | 25 |
| Missing summary | No closing restatement at section or document end | 26 |
| Spatial figure reference | "the figure above" instead of "Figure 1" | 27 |
| Uncited figure | Figure or table never referred to in the text | 27 |
| Descriptive abstract | Abstract that says what the report does, not what it found | 29–30 |
| Unitalicised variable / inline equation / symbol-initial sentence | Mathematical typesetting faults | 31 |

## 4. Process (what matters for a writing tool)

1. **Before writing** (p. 5): decide one objective; write it in one sentence; state it at the start; hold a specific reader in mind (intelligent, uninformed) and consider stating the reader profile; list the areas to cover, note each main point, sort into logical groups; keep a dictionary; line up a reviewer. Tool: optional Objective and Reader fields per article that Review reads; an outline/grouping aid.
2. **Every sentence earns its place** (p. 5): "make sure that every sentence makes a contribution to the objective. If material you write does not make a contribution to the objective remove it" — but keep it for another document. Tool: a "cut but keep" scrap area rather than deletion.
3. **Pre-review checklist** (pp. 5, 28): structure conforms to the rules; spellchecker run; read as the reader; table of contents and figure references up to date.
4. **Repetition removal method** (p. 12): list key ideas in order of appearance; where one recurs, choose its single home, delete or merge the rest. Tool: a claims list per paragraph with duplicates linked.
5. **Naming method** (p. 16): identify each distinct "thing", decide its name once, apply throughout. Tool: a Terms list per article.
6. **Introduce new ideas by example first** (p. 15); define, then generalise.
7. **Section rhythm** (p. 26): tell them what you will tell them, tell them, tell them what you told them — at document and section level. The only allowable repetition lives here.
8. **Abstract last, and informative** (pp. 29–30): an abstract written before the work is a plan, not a summary.
9. **A human reader before submission** (p. 32): have a trusted friend read it; act on their recommendations. Review is the stand-in.
10. **Attitude** (pp. 4, 32): writing is learnable, not a gift; the author improved by having an editor mark his faults — exactly Clearpen's accept-one-by-one model.

## 5. Word lists (verbatim, for deterministic checks)

### Table 1 — Words and expressions to avoid → simple alternative (p. 9)

| Avoid | Use |
|---|---|
| utilise | use |
| facilitate | help |
| at this time | now |
| in respect of | about |
| commence | start |
| terminate | end, stop |
| ascertain | find out |
| in the event of | if |
| in consequence | so |
| enquire | ask |
| endeavour | try |
| transmit | send |
| demonstrate | show |
| initiate | begin |
| assist, assistance | help |
| necessitate | need |
| in excess of | more than |
| dwelling | house |
| render (meaning make) | make |

(Table 1 lists `terminate → end, stop` twice. `render` is from the paragraph after the table: avoid "unless you are talking about building maintenance or computer graphics". The conclusion, p. 32, singles out: utilise, facilitate, endeavour, necessitate, render.)

### Table 2 — Stock phrases to avoid (p. 9)

| Bad | Good |
|---|---|
| There is a reasonable expectation that ... | Probably ... |
| Owing to the situation that ... | Because, since ... |
| Should a situation arise where ... | If ... |
| Taking into consideration such factors as ... | Considering ... |
| Prior to the occasion when ... | Before ... |
| At this precise moment in time ... | Now ... |
| Do not hesitate to ... | Please ... |
| I am in receipt of ... | I have ... |

### Legal words to avoid (p. 10)

| Legal word | Replacement |
|---|---|
| forthwith | (now / immediately) |
| henceforth | (from now on) |
| hereat | (delete) |
| hereof | (of this) |
| hereto | (to this) |
| herewith | (with this / enclosed) |
| Of the (4th) inst. | (of the 4th of this month / the date) |
| thereat | (there) |
| therein | (in it) |
| thereof | (of it) |
| whereat | (where) |
| whereon | (on which) |
| the said X | the X |
| the aforementioned people | A and B (name them) |

(Fenton gives the list of twelve words without replacements; the bracketed replacements are mine. "The said" and "aforementioned" examples are his.)

### Abstract words to use sparingly (pp. 10–11)

| Abstract word | Example bad → good |
|---|---|
| nature | "not of a satisfactory nature" → "unsatisfactory" |
| character | "not of a satisfactory character" → "unsatisfactory" |
| position | "we are in a position to begin" → "we can begin" |
| situation | "in the situation of being able to begin" → "can now begin" |
| condition | (listed, no example) |

### Redundancy — with → without (p. 11)

| With redundancy | Without redundancy |
|---|---|
| The printer is located adjacent to the computer | The printer is adjacent to the computer |
| The printer is located in the immediate vicinity of the computer | The printer is near the computer |
| The user can visibly see the image moving | The user can see the image moving |
| He wore a shirt that was blue in colour | He wore a blue shirt |
| The input is suitably processed | The input is processed |
| This is done by means of inserting an artificial fault | This is done by inserting an artificial fault |
| The reason for the increase in number of faults found was due to an increase in testing | The increase in number of faults found was due to an increase in testing |
| It is likely that problems will arise with regards to the completion of the specification phase | You will probably have problems completing the specification phase |
| Within a comparatively short period we will be able to finish the design | Soon we will be able to finish the design |

Derived phrase rules: `located adjacent to` → `adjacent to`; `located in` → `in`; `in the immediate vicinity of` → `near`; `visibly see` → `see`; `<colour> in colour` → `<colour>`; `suitably` → delete; `by means of` → `by`; `the reason for X was due to Y` → `X was due to Y`; `it is likely that` → `probably`; `with regards to the completion of` → `completing`; `within a comparatively short period` → `soon`; `due to the fact that` → `because` (from the p. 7 example).

### Modifying words — bad → good (pp. 11–12)

| Bad | Good |
|---|---|
| in suitable haste | in haste |
| suitably impressed | impressed |
| absolute nonsense | nonsense |
| absolutely critical | critical |
| considerable difficulty | difficulty |
| considerably difficult | difficult |

"The most common modifying words to avoid" (p. 12), each also in its `-ly` form:

| | | |
|---|---|---|
| appreciable | excessive | sufficient |
| approximate | fair | suitable |
| comparative | negligible | undue |
| definite | reasonable | utter |
| evident | relative | |

Allowed when the reference is concrete: "Jane set John a suitable task".

### Noun constructs → verbs (p. 12)

| Bad | Good |
|---|---|
| Half the team were involved in the development of system Y | Half the team were involved in developing system Y |
| He used to help in the specification of new software | He used to help specify new software |
| Acid rain accounts for the destruction of ancient stone-work | Acid rain destroys ancient stone-work |
| When you take into consideration ... | When you consider ... |
| Clicking the icon causes the execution of the program | The program executes when the icon is clicked |
| Measurement of static software properties was performed by the tool | The tool measured static software properties |
| The analysis of the software was performed by Fred | Fred analysed the software |
| The testing of the software was carried out by Jane | Jane tested the software |
| It was reported by Jones that method x facilitated the utilisation of inspection techniques by the testing team | Jones reported that method x helped the testing team use inspection techniques |

### Passive → active (p. 13)

| Bad | Good |
|---|---|
| The report was written by Bloggs, and was found to be excellent | Bloggs wrote the report, and it was excellent |
| The values were measured automatically by the control system | The control system measured the values automatically |
| It was reported by the manager that the project was in trouble | The manager reported that the project was in trouble |
| The precise mechanism responsible for this antagonism cannot be elucidated | We do not know what causes this antagonism |
| The stability of the process is enhanced by co-operation | Co-operation improves the stability of the process |

Allowed passive: "the city was destroyed by constant bombing" (stress on the thing acted on).

### Impersonal → personal (pp. 13–14)

| Bad | Good |
|---|---|
| The author's results have shown ... / The results by the author of this report show ... | My results have shown ... |
| The current research work of the author of this report is also described | I also describe my current research work |
| In the previous report of the authors the rationale for the proposed method was discussed in detail | In our previous report we discussed in detail the rationale for the proposed method |
| However, it is the writer's belief that this situation should not have occurred | However, I believe this situation should not have occurred |
| Examination and discussion of the results obtained, are necessary before a decision can be taken | We must examine and discuss the results before we decide |
| One can conclude from the experiment ... | We can conclude ... (avoid "one") |

Flag as ambiguous: "Recent experiments involving formal inspections have resulted in ..." (whose?); "It is not possible to state the exact mode of operation of the drug" (unknown, or impossible?).

### Gendered pronouns (p. 16)

| Avoid | Use |
|---|---|
| he / she, him / her, his / her (non-specific person) | they, them, their |
| he/she, him/her | (never; recast) |
| every man ... his duty | everyone ... their duty |
| every employee should leave his desk tidy | leave your desk tidy |
| ask your boss if he wants you to help him | ask if the boss wants some help |

### Table 3 — Commonly confused words (p. 18)

| Word | Meaning | Word | Meaning |
|---|---|---|---|
| affect | verb: to influence | effect | noun: result; verb: to bring about |
| adverse | adjective: unfavourable | averse | adjective: opposed to, disinclined |
| principle | noun: a standard or rule of conduct | principal | adjective or noun: most important |
| stationery | noun: writing materials | stationary | adjective: not moving |
| illicit | adjective: illegal | elicit | verb: to give rise to |
| flaunt | verb: to show off | flout | verb: to show contempt |
| allusion | noun: a passing reference | illusion | noun: a false impression |
| complement | noun: something that completes; verb: to make complete | compliment | noun: praise; verb: to praise |
| council | noun: an assembly | counsel | verb: to recommend; noun: recommendation |
| ensure | verb: to make certain | insure | verb: to protect against risk |
| mitigate | verb: to moderate | militate | verb: to influence (for or against) |
| practice | noun ("put my ideas into practice") | practise | verb |
| advice | noun: recommendation | advise | verb |

Plus from p. 20: `it's` (it is) vs `its` (possessive); `should of` → `should've` / `should have`.

### Table 4 — Commonly misspelt words (p. 19)

| | | |
|---|---|---|
| accommodate | embarrass | necessary |
| commemorate | gauge | parallel |
| commitment | harass | privilege |
| committee | mileage | questionnaire |

### Spelling variety (p. 19)

| American | British (Fenton's default) |
|---|---|
| -ize (generalize, formalize) | -ise (generalise, formalise) |
| color, flavor | colour, flavour |

### Abbreviations (p. 19)

| Avoid | Use |
|---|---|
| approx. | approximately (better: about) |
| e.g. | for example |
| such as X, Y, Z, etc. | such as X, Y, Z — or — : X, Y, Z, etc. |
| THFC (used once) | Tottenham Hotspur Football Club |
| THFC (used more than once) | full name with "(THFC)" at first use, then THFC; glossary |

### Apostrophe errors (p. 20)

| Wrong | Right |
|---|---|
| I gave the cat it's food | its food |
| I like tomatoe's | tomatoes |
| In the 1960's | 1960s |
| All the department's were represented | departments |
| I should of done my homework | I should've done my homework |

### Figure references (p. 27)

| Avoid | Use |
|---|---|
| the figure above shows | Figure 1 shows |

### Opening/abstract verbs that signal a descriptive abstract (pp. 29–30, from his examples)

describes, discuss, describe the background, describe the experimental set-up, present a range of results, explain the measurements, compare, consider, present a number of strong recommendations — i.e. "This report describes..." / "We describe... We present... We explain... Finally, we present..." with no result stated.

## 6. Quotes (under 15 words each)

- "Always turn the lights out when you go home, especially on a Friday." (p. 4)
- "Every report should have a single clear objective." (p. 5)
- "assume that the reader is intelligent but uninformed" (p. 5)
- "every sentence makes a contribution to the objective" (p. 5)
- "there is nothing clever about writing long, complex sentences" (p. 6)
- "A sentence should contain a single unit of information." (p. 6)
- "Never use nested parentheses if you want to retain your reader." (p. 7)
- "A paragraph should contain a single coherent idea." (p. 7)
- "if what you are describing is a list then you should always display it as a list" (p. 8)
- "You should never be sparing in your use of such lists." (p. 8)
- "if you mean 'make' then just write 'make' not 'render'" (p. 9)
- "This wastes space and blunts the message." (p. 10)
- "Turning verbs into abstract nouns always results in longer sentences than necessary" (p. 12)
- "Using the passive style is the most common reason for poorly structured sentences" (p. 13)
- "the 'royal' we is better than the royal 'one'" (p. 14)
- "provide an example before providing an abstract definition or generalisation" (p. 15)
- "You should always use the same word to refer to the same thing." (p. 15)
- "ignore the 'rule' that says you should never use the same word twice" (p. 17)
- "utilise or facilitate ... the most useless and pompous words in the English language" (p. 17)
- "the fewer commas you can use the better" (p. 21)
- "Tell readers what you are going to tell them. Tell them it." (p. 26)
- "Spatial references to figures without numbering are nearly always ambiguous." (p. 27)
- "most readers never get further than the abstract" (p. 30)
- "the abstract is merely a plan for the author" (p. 30)
- "Good technical writing is about using plain English." (p. 32)
- "You do not have to know and use long words and complicated phrases." (p. 32)

## 7. Assessment for an app that edits but never writes

Fenton's book is a list of local, mechanical faults with known fixes, which suits tracked edits perfectly: almost every rule can be shown as a deletion or a substitution the author accepts or rejects. Highest value:

1. **Word-level plain-English substitutions (principles 6, 7, 8, 10, 11, 12, 21, 22).** Fully deterministic: Table 1, Table 2, legalisms, abstract wrappers, the redundancy phrases, the 14 modifiers, lazy abbreviations, `etc.` after `such as`, plural apostrophes, "should of", gendered "he/she". Build one phrase-rule table with replacements and offer each as a one-click tracked edit, labelled "Clearpen's rules". Modifiers and `render` need the model only to decide whether the use is concrete.

2. **Passive and noun-construct detection (14, 15).** Code finds candidates reliably (be + participle, especially "It was X-ed by Y that"; "the X-tion of Y was performed by Z"; light verb + nominalisation). The rewrite into active voice with the doer as subject needs the model, and so does the exception ("is the thing acted on the real topic?"). This is the heart of Simplify/Shorten prompts: "Make the doer the subject; turn nouns made from verbs back into verbs; one idea per sentence; cut words that repeat an idea; keep every fact."

3. **Consistent naming of things (18).** Most valuable new feature and essentially a model task: list the key things, list the names used for each, flag drift and overloaded words. Code can assist with known synonym clusters and repeated noun phrases. Fits Review as margin notes ("You call this 'the system' here and 'the software' above").

4. **Hidden lists and paragraph structure (4, 5).** Code: sequence markers (first/then/next/finally/another/also/in addition ≥3 in a paragraph), runs of one-sentence paragraphs, over-long paragraphs. Model: propose the lead-in sentence and items as a tracked conversion. Also feeds the next-sentence judge: a paragraph that enumerates in prose has structure it is not showing.

5. **Objective and informative opening (1, 25).** The model's job: state the article's objective from its opening; flag paragraphs that do not serve it; tell whether the lede says what the article found or only what it discusses. Code can pre-flag "This article describes/discusses..." openings with no numbers or claims. This is Fenton's version of "so what", and it pairs with Clearpen's existing unsupported-claim notes: a descriptive opening is the mirror image of an unsupported claim (it promises instead of stating).

Also cheap and worth having in code: hanging subsections and heading-tree balance (23), spatial figure references and uncited figures (24), undefined acronyms (21), confusables with POS context (20), near-duplicate sentences for repetition (13), exclamation marks (22), nested parentheses and sentence word counts (3). Skip or keep as settings: British spelling, impersonal style (house styles vary), mathematics typesetting.

Prompt-writing lessons from Fenton for the Qwen editing tasks: show an example before the rule (he does this himself and recommends it); give the model the explicit word tables rather than "write plainly"; name the doer when converting passives; forbid adding information when shortening ("keep every fact"); never let the model vary a term for elegance — same thing, same name.
