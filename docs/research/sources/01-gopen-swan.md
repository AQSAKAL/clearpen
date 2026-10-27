# Gopen & Swan, "The Science of Scientific Writing" (1990)

Read in full from the JSTOR scan (American Scientist 78(6): 550–558). Page numbers below are the journal's. Local copy: `scratch/gopen/gopen-swan.pdf` (text: `gopen-swan.txt` beside it).

## 1. Source

A nine-page article for working scientists by George Gopen (English and law, Duke) and Judith Swan (biochemistry, teaches scientific writing at Princeton), built on Joseph Williams's and Gregory Colomb's "reader expectations" linguistics. It argues that readers decide what prose means mostly from *where in the sentence* information sits, and derives seven structural principles by revising four real published passages (mitochondrial URFs, earthquakes, dG:dC enthalpy, TFIIIA transcription). Explicitly not about plain English: "We have striven not for simplification but for clarification" (551).

## 2. Principles

The authors' own numbered summary (558) is the canonical list; items 1–7 below are those, in their order, verbatim rule text in quotation marks. Items 8–11 are structural ideas developed in the body that an editor needs as well.

### P1. Subject–verb separation

**(a) Rule.** "Follow a grammatical subject as soon as possible with its verb" (558). Anything of length between the subject and its verb is read as an interruption and therefore as less important. If the interruption is important, give it its own clause; if it is an aside, delete it.

**(b) Reason.** Readers have "a pressing need for syntactic resolution, fulfilled only by the arrival of the verb" (552). Until the verb arrives they do not know what the sentence is about, so they hold attention for the verb and "resist recognizing anything in the interrupting material as being of primary importance." The longer the interruption, the more likely it holds something important, but "its structural location will continue to brand it as merely interruptive" (552).

**(c) Example (551–552).** Original: "The smallest of the URF's (URFA6L), a 207-nucleotide (nt) reading frame overlapping out of phase the NH2-terminal portion of the adenosinetriphosphatase (ATPase) subunit 6 gene has been identified as..." — 23 words between subject "the smallest" and verb "has been identified", more than half of a 42-word sentence. Two alternative fixes, which only the author can choose between:
- Promote: "The smallest of the URF's is URFA6L, a 207-nucleotide (nt) reading frame ...; it has been identified as the animal equivalent of..."
- Delete: "The smallest of the URF's (URFA6L) has been identified as the animal equivalent of the recently discovered yeast H+-ATPase subunit 8 gene."
The passage's third sentence (62 words) has 27 words between "experiments" and "have indicated", then a "that" clause whose subject "six human URF's" is 20 words from its verb "encode" (553).

**(d) Detection.**
- *Code (approximate, no parser needed):* for each sentence, take the span from the first content word to the first finite verb. Finite verb = a closed list of auxiliaries and copulas (is/are/was/were/has/have/had/does/do/did/can/could/will/would/may/might/must/should/shall) or the first word ending in -s/-ed that follows a noun-like token (noisy). Within that span, measure delimited interruptions: material inside parentheses or brackets, between paired commas or dashes, a relative clause opened by which/who/that/whose, or a participial phrase (-ing/-ed after a comma). Flag when the interruption span is ≥ 8 words, or ≥ 1/3 of the sentence. The paper's cases are 20+ words; a conservative first threshold is 10. Parenthetical and bracketed spans alone (count words inside `(...)`/`[...]` before the first verb) give a high-precision subset with regex only.
- *Code with a light POS tagger* (e.g. a dependency-free library): find subject head and governing finite verb; word distance ≥ 8 → flag; also flag a second subject–verb gap inside a "that" clause.
- *LLM:* "Name the grammatical subject and its main verb. How many words lie between them? If more than eight, propose two rewrites that keep every fact: (1) the intervening material becomes its own clause after a semicolon or as a new sentence; (2) the intervening material is dropped. Do not choose; present both."

### P2. Stress position: new, emphatic information at the point of syntactic closure

**(a) Rule.** "Place in the stress position the 'new information' you want the reader to emphasize" (558). The stress position is the end of a sentence; more exactly, it begins at "the moment of syntactic closure" (552), when the reader knows nothing is left but what is being read. A colon or semicolon, properly used (the preceding material can stand as a sentence), creates a secondary stress position. An indented list announced as the remainder of a sentence occupies its stress position, and each item has its own.

**(b) Reason.** Readers "naturally emphasize the material that arrives at the end of a sentence" (552): a "mental breath" taken at the start is exhaled at the end, and the exhalation produces emphasis; readers "delight in being rewarded at the end of a labor." Two failures, "both are bad" (552): the stress position holds something unworthy, so the reader has no structural clue what else to emphasize; or it holds an "imposter" that *can* take emphasis, so the reader emphasizes the wrong thing and the writer "will have lost an important opportunity to influence the reader's interpretive process."

**(c) Example (555).** Earthquake paragraph, sentence 2 original: "The rates at which tectonic plates move and accumulate strain at their boundaries are approximately uniform." — already right, stress on "approximately uniform". Sentence 6 original: "Along the southern segment of the San Andreas fault the recurrence interval is 145 years with variations of several decades." Revised: "[For example,] the recurrence interval along the southern segment of the San Andreas fault is 145 years with variations of several decades." (new fact at the end; place name moved out of the opening). The URF sentence 3 ends on a "disappointingly anticlimactic verb ('have indicated')" buried mid-sentence while the real news (which URFs encode subunits) is spread across the tail (553).

**(d) Detection.**
- *Code:* isolate the stress position = text after the last colon/semicolon (if the material before it is clause-like) or the last ~6 content words before the terminal mark. Flag low-value occupants by lexicon: trailing citations/parentheses "(Smith 2019)", "(see Table 1)"; time/place adverbials ("in 2019", "last year", "in the United States") when the sentence has a number or claim earlier; hedges ("in some cases", "to some extent", "in general", "for the most part"); afterthought markers ("as well", "too", "etc.", "respectively", "among others", "and so on"); meta-phrases ("as discussed above", "in this article", "as shown below"); attribution tags (", he said.", ", according to X."). Also flag an *old-information ending*: the final noun phrase's stems all appear in the previous sentence while a first-appearance noun phrase sits in the opening (see P4). Severity: note, not fix.
- *Code for "too long":* see P8.
- *LLM:* "Quote the words at the end of this sentence (after the last colon or semicolon, or the final phrase). Is that the single most important new point of the sentence? If not, name what is, and propose a reordering of the author's own words that ends on it."

### P3. Topic position: whose story

**(a) Rule.** "Place the person or thing whose 'story' a sentence is telling at the beginning of the sentence, in the topic position" (558). Across a paragraph, keep the protagonist(s) in the topic positions so the focus does not shift every sentence. Passive voice is legitimate when it keeps the story's protagonist up front.

**(b) Reason.** "Readers expect a unit of discourse to be a story about whoever shows up first" (554). "Bees disperse pollen" and "Pollen is dispersed by bees" are "two different but equally respectable sentences about the same facts"; the passive one "is the superior sentence if it appears in a paragraph that intends to tell us a continuing story about pollen" (554). When the occupant of the topic position changes every sentence, "the focus of the story constantly shifts" and "no two readers would be likely to construct exactly the same story" (554).

**(c) Example (554–557).** Earthquake paragraph topic positions listed: "Large earthquakes / The rates / Therefore... one / subsequent mainshocks / great plate boundary ruptures / the southern segment of the San Andreas fault / the smaller the standard deviation..." — mostly first appearances. TFIIIA paragraph: "The story's focus ... changes in every sentence" with six competing strands (egg extract, TFIIIA, oocyte extract, RNA polymerase III, 5S RNA, transcription); the revision leads most sentences with "egg extract" or "TFIIIA": "Transcription of the 5S RNA genes in the egg extract is TFIIIA-dependent" → "In the egg extract, the availability of TFIIIA limits transcription of the 5S RNA genes" (557).

**(d) Detection.**
- *Code:* per paragraph of ≥ 4 sentences, extract each sentence's topic = words from the start (after stripping leading connectives/adverbials such as "However,", "Therefore,", "In addition,", "For example,") up to the first finite verb (same verb list as P1), reduced to content-word stems. Count distinct topic heads and repeats. Flag when ≥ 4 consecutive sentences have pairwise-disjoint topic stems, or when fewer than 25% of sentences repeat any topic stem from an earlier sentence of the paragraph. Treat "this/these/it/they/such/the former/the latter" as repeats (anaphora). Report the extracted topic list to the author, as the paper does; the list itself is the diagnosis.
- *LLM:* "List the first noun phrase of each sentence in this paragraph. Whose story is the paragraph telling? If the answer changes from sentence to sentence, name the one or two recurring terms that should lead most sentences, and show which sentences could be re-led by them without changing their facts (passive voice is allowed if it keeps the protagonist first)."

### P4. Old information in the topic position (old before new)

**(a) Rule.** "Place appropriate 'old information' (material already stated in the discourse) in the topic position for linkage backward and contextualization forward" (558). The exact statement, with the authors' correction of the usual oversimplification: "Put in the topic position the old information that links backward; put in the stress position the new information you want the reader to emphasize" (556). It is *not* "old in topic, new in stress": since everything is either old or new, the middle of the sentence must also hold both; the principle concerns only the two ends.

**(b) Reason.** The topic position must supply "linkage (looking backward) and context (looking forward)" (554). Old information there "focuses attention on one particular strand of the discussion, both harkening backward and leaning forward." New information there "misleads the reader as to whose story is being told; it burdens the reader with new information that must be carried further into the sentence before it can be connected to the discussion; and it creates ambiguity as to which material the writer intended the reader to emphasize" (555). "In our experience, the misplacement of old and new information turns out to be the No. 1 problem in American professional writing today" (555). Cause: writers draft linearly and "rush to record that new information on paper, after which they can produce at their leisure the contextualizing material" (555); they attend to their own need to unburden rather than to the reader's need to receive.

**(c) Example (556).** dG:dC passage. Sentence 1 inverted so "dG" and "dC" arrive in the stress position as new: "We have directly measured the enthalpy of hydrogen bond formation between ... (dG) and ... (dC)." Then "Since 'dG' and 'dC' become the old information in the second sentence, keep them up front": "dG and dC were derivatized at the 5' and 3' hydroxyls with triisopropylsilyl groups; these groups serve both to solubilize ... and to prevent..." — "triisopropylsilyl groups" is new at one stress position, then becomes old and leads the next clause ("these groups").

**(d) Detection.**
- *Code (the most valuable deterministic check in the paper):* for each sentence S_n (n ≥ 2) in a paragraph, build stem sets for its topic position (as in P3) and its stress position (as in P2). Build the "old" set = content-word stems of S_{n-1} and S_{n-2} (plus the paragraph's first sentence, plus a document glossary of terms already defined). Stems: lowercase, strip plural -s/-es, -ing, -ed, hyphen-split. Pronouns and demonstratives count as old. Compute: topic∩old = 0 AND stress∩old ≥ 1 → "new-before-old inversion" (strong flag: the sentence is probably reversible with its own words). topic∩old = 0 AND stress∩old = 0 → see P9 (logical gap). Paragraph flag when > 50% of its sentences (n ≥ 2) open on first-appearance material. Suppress on the first sentence of a paragraph and after a heading.
- *LLM, for Improve/Shorten rewrites:* "When you reorder a sentence, start it with the words that connect to the previous sentence and end it with the new point. Do not invent connections; if none exists, say so instead of adding one."
- *LLM, for Review:* "Sentence N opens with X, which has not appeared before, and ends with Y, which the previous sentence already established. Would the reader be better served by the reverse?"

### P5. Action in the verb

**(a) Rule.** "Articulate the action of every clause or sentence in its verb" (558). If the real action is hidden in a noun ("inhibition", "addition"), an adjective ("TFIIIA-dependent"), or a "there is", the verb should be rewritten to carry it.

**(b) Reason.** "Readers expect the action of a sentence to be articulated by the verb" (557). When it is not, "we as readers have no secondary structural clues for where to locate them. Each of us has to make a personal interpretive guess; the writer no longer controls the reader's interpretive act." Weak verbs also hide whether the author's hypotheses were stated at all.

**(c) Example (557).** Verb list of the TFIIIA paragraph: "is / is... is / are presumed to be / are transcribed / has / is... can be alleviated / destabilizes" — "too few clues as to what actions actually take place." The real actions, "limit" and "inhibit", never appear as verbs. Rewrites: "Transcription ... is TFIIIA-dependent" → "the availability of TFIIIA limits transcription"; "The addition of egg extract to the oocyte nuclear extract has two effects on transcription efficiency" → "When added to the nuclear extract, the egg extract affected the efficiency of transcription in two ways"; "there is a general inhibition of transcription" → "it inhibited transcription generally."

**(d) Detection.**
- *Code:* flag a sentence when its first finite verb is in a weak set {is, are, was, were, be, been, being, has, have, had, there is/are/was/were, occurs, exists, takes place, involves, represents, serves as, acts as, is characterized by, results in, leads to, makes, does, performs, provides, has an effect on, plays a role in} AND the sentence contains a nominalization: a token ending in -tion, -sion, -ment, -ance, -ence, -ity, -ness, -al (as noun), -age, -ure, or an -ing noun preceded by "the/an/of", or a compound adjective ending in -dependent/-based/-related/-driven/-mediated. Report the hidden action word so the author sees it ("inhibition" → "inhibit"). Paragraph-level: count sentences with weak main verbs; flag the paragraph when ≥ 60% (the TFIIIA paragraph is 6 of 7) and list the verbs as the paper does. Light-POS tagging raises precision; pure regex is workable because Clearpen already uses lexicons this way.
- *LLM:* "List the main verb of each sentence. For each sentence whose verb is a form of be/have/do or a 'there is', find the action hidden in a noun or adjective and rewrite the sentence with that action as the verb, same facts, same protagonist first. If no action is hidden (a genuine definition or state), leave it."

### P6. Context before anything new

**(a) Rule.** "In general, provide context for your reader before asking that reader to consider anything new" (558). This applies at every unit size: inside a sentence (P3, P4), across sentences, and in tables and figures.

**(b) Reason.** "In reading, as in most experiences, we appreciate the opportunity to become familiar with a new environment before having to function in it" (555). The opening table (550): time on the left, temperature on the right is easy because "the structure ... provides the reader with an easily perceived context (time) in which the significant piece of information (temperature) can be interpreted." Reversed columns make the same table "much harder to read."

**(c) Example (550).** `time (min) | temperature (°C)` with 0/3/6/9/12/15 on the left reads easily; `temperature | time` with the same numbers does not. Same information; only position differs.

**(d) Detection.**
- *Code, tables:* Clearpen already parses tables. Detect a column whose values form a regular sequence (equal steps, dates, ordinals, years) that is not the first column, while the first column is irregular numeric results → suggest swapping columns. Also: a term or acronym used before its definition — find `ABC` whose expansion pattern `Long Name (ABC)` or "ABC, the ..." occurs later in the document than its first bare use.
- *Code, paragraphs:* a paragraph whose first sentence has zero stem overlap with the heading above it and with the previous paragraph's final sentence (weak link; combine with P9).
- *LLM:* "Does this sentence/paragraph ask the reader to take in something new before telling them where it fits? What one piece of already-established context would need to come first?"

### P7. Structural emphasis should match substantive emphasis

**(a) Rule.** "In general, try to ensure that the relative emphases of the substance coincide with the relative expectations for emphasis raised by the structure" (558). Location brands information: interruption = minor; topic = the story's subject; stress = the point. Make the branding true.

**(b) Reason.** "Readers have relatively fixed expectations about where in the structure of prose they will encounter particular items of its substance" (551). "If these structural expectations are continually violated, readers are forced to divert energy from understanding the content of a passage to unraveling its structure. As the complexity of the content increases moderately, the possibility of misinterpretation or noninterpretation increases dramatically" (551). Good writers' prose has "shape" because they place things where readers expect them.

**(c) Example (552).** In the URF first sentence "the relative importance of the intervening material is difficult to evaluate"; it may be significant (then it was mis-positioned as an interruption) or an aside (then it should go). Either way the structure lied about its weight.

**(d) Detection.** Model only, as a capstone question in Review: "What are the two or three most important claims in this paragraph for the article's argument (use the outline/thesis)? For each, say where it sits structurally: interruption between subject and verb, sentence opening, mid-sentence, or sentence end. Flag any important claim sitting in an interruption or mid-sentence, and any trivial item sitting in a stress position." Code supplies the structural positions (P1–P5 extractors); the model supplies the importance judgment.

### P8. One unit of discourse, one point (and the real definition of "too long")

**(a) Rule.** "Each unit of discourse, no matter what the size, is expected to serve a single function, to make a single point" (552) — clause, sentence, paragraph, section, article. For sentences: "A sentence is too long when it has more viable candidates for stress positions than there are stress positions available" (553). Fixed word limits (the readability formulas' favourite is 29) are rejected: "We have seen 10-word sentences that are virtually impenetrable and ... 100-word sentences that flow effortlessly" (553). Long sentences are fine "as long as there is a medial syntactic closure for every piece of new, stress-worthy information along the way" (553).

**(b) Reason.** Without a stress position for each emphatic item, "readers are left too much to their own devices in deciding just what else in a sentence might be considered important" (553). "Sheer length was neither the problem nor the solution. The revised version is not noticeably shorter than the original; nevertheless, it is significantly easier to interpret" (553).

**(c) Example (556).** dG:dC sentence 2 "has only one stress position but two or three pieces of information that are probably worthy of emphasis — 'solubility... solvents,' 'prevent... from forming hydrogen bonds' and perhaps 'triisopropylsilyl groups.'" Fix: a semicolon makes a second stress position for "triisopropylsilyl groups", and the flag word "both" tells the reader two items will share the next one: "...with triisopropylsilyl groups; these groups serve both to solubilize ... and to prevent ...".

**(d) Detection.**
- *Code:* count stress positions = 1 + number of colons/semicolons whose left side contains a finite verb. Count "heavy" items = numeric tokens with units, quoted or defined terms, parentheticals, proper-noun phrases, coordinated verb phrases ("X, Y and Z" with verbs), and "as well as" additions. Flag when heavy items ≥ 3 and stress positions = 1 (regardless of word count). Replace or supplement any word-count trigger in Shorten with this. Also check announced counts: "two effects/three reasons/both" followed by a different number of enumerated items (First/Second, list bullets, "and" coordination) — the paper's "both" is exactly this flag-word mechanism.
- *LLM:* "List each distinct piece of information in this sentence that a reader must retain. How many points of closure does the sentence offer (end, semicolons, colons)? If items exceed closures, say which item currently holds the final position and which others compete, and propose where a semicolon or sentence break would give each its own closure. Do not cut content to make it shorter."
- *Paragraph level:* this is the principle behind Clearpen's "has the paragraph made its point" judge; the companion failure is a paragraph that makes two points, which the model can be asked to name.

### P9. The logical gap: unstated connections between sentences

**(a) Rule.** Every sentence should contain some old information that links it to what came before; when "old information does not appear at all in a sentence, whether in the topic position or elsewhere, readers are left to construct the logical linkage by themselves" (556). And an item placed in a stress position is a promise: the next sentence(s) should take it up.

**(b) Reason.** "Often this happens when the connections are so clear in the writer's mind that they seem unnecessary to state; at those moments, writers underestimate the difficulties and ambiguities inherent in the reading process" (556). Readers who lack the author's domain knowledge are "left in the dark" (556). Attending to old/new placement "can reveal where a writer has neglected to articulate essential connections."

**(c) Example (556–557).** After the revised dG:dC sentence 2 stresses two effects (solubility; preventing ribose hydroxyl H-bonds), sentence 3 jumps to "From isoperibolic titration measurements, the enthalpy ... is -6.65 ± 0.32 kcal/mol." The relationship between derivatization and measurement — "the point they most wished to make" — is missing. Two bridging sentences had to be supplied from chemistry knowledge: "Consequently, when the derivatized nucleosides are dissolved in non-aqueous solvents, hydrogen bonds form almost exclusively between the bases. Since the interbase hydrogen bonds are the only bonds to form upon mixing, their enthalpy of formation can be determined directly by measuring the enthalpy of mixing." Earthquake paragraph: connectors were all unarticulated, so the revision inserts "[However?]", "[Indeed?]", "[For example?]" with question marks, and the final sentence "leaves behind earthquakes that recur at variable intervals and switches instead to earthquakes that recur regularly" (555).

**(d) Detection.**
- *Code:* (i) zero-link sentence: S_n shares no content stems with S_{n-1} or S_{n-2}, has no anaphoric pronoun/demonstrative in its opening, and no connective → "no backward link". (ii) unkept promise: the stress-position stems of S_n appear nowhere in S_{n+1}..S_{n+2} and nowhere later in the paragraph → "ends on X, never returns to X" (the two-effects case). (iii) missing connective: two adjacent sentences with low overlap and no connective where one contains a number or an example-like proper noun → propose "For example?/However?/Therefore?" as a question. Clearpen's existing contradiction and next-sentence machinery sit at this level already.
- *LLM:* "Sentence N ends by emphasizing X. Sentence N+1 is about Y and does not mention X. What is the unstated step from X to Y? State it as a question to the author, not as new prose; if a single connective word (however, therefore, for example) would make the relation explicit, offer it and ask whether it is the right one." This is where the paper most directly supports the "one missing sentence" feature, with the caveat that the authors had to *guess* the content from outside knowledge; "Writers who use reader-expectation principles on their own prose will not have to conjecture or infer; they know what the prose is intended to convey" (558). The grey sentence should therefore be framed as the author's own missing step, easy to reject.

### P10. Medial closure: colons and semicolons as secondary stress positions

**(a) Rule.** "Secondary stress positions can be formed by the appearance of a properly used colon or semicolon; by grammatical convention, the material preceding these punctuation marks must be able to stand by itself as a complete sentence" (552–553).

**(b) Reason.** It lets "sentences be extended effortlessly to dozens of words" by giving each new stress-worthy item its own closure (553).

**(c) Example (553).** "...subunit 6 gene; it has been identified as the animal equivalent..." — the semicolon "created a second stress position to accommodate a second piece of information that seemed to require emphasis."

**(d) Detection.** *Code:* a semicolon or colon whose left side has no finite verb (a fragment, or a list separator) is not a stress position and should not be counted in P8; a colon introducing a list makes the list the stress position. When Shorten or Improve joins or splits sentences, prefer splitting at a point where the left side is a complete clause. *LLM:* when told a sentence has more items than closures, "split at a point where what precedes the break is a complete sentence."

### P11. Passive voice is a positional choice, not an error

**(a) Rule.** Choose active or passive by who should occupy the topic position (P3), not by a blanket rule. "The passivity of the second sentence does not by itself impair its quality" (554). Avoiding the passive is named alongside split infinitives as a rule whose "slavish adherence" fails (558).

**(d) Detection.** *Code:* do not flag passives alone. *LLM, Fix grammar/Improve instruction:* "Do not convert passive to active unless the result keeps the paragraph's protagonist at the start of the sentence."

## 3. Taxonomy of named problems

- **Subject–verb interruption** — material of length between a grammatical subject and its verb, read as unimportant whatever its content (552).
- **Anticlimax / unworthy stress** — the sentence ends on material not worth emphasis, leaving the reader no clue what to emphasize (552).
- **Imposter stress** — the sentence ends on emphasizable material the author did not mean to stress, so readers stress the wrong thing (552).
- **Uninformative verb** — a verb like "have indicated" that carries no action and disappoints at arrival (553).
- **Overloaded sentence ("too long")** — more stress-worthy candidates than stress positions; not a word count (553).
- **Shifting focus / whose story?** — the topic position's occupant changes every sentence; readers cannot build one story (554).
- **Several simultaneous stories** — multiple recurring strands of old information, none dominant (557).
- **Misplaced old and new information** — new in the topic position, old in the stress position; "the No. 1 problem" (555).
- **Logical gap** — a sentence with no old information at all, so the linkage must be invented by the reader (556).
- **Unkept stress promise** — material emphasized at a sentence end that the following sentences never take up (556).
- **Unarticulated connection** — a transition the writer left implicit (however/indeed/for example), hiding the argument's shape (555).
- **Topic drift at paragraph end** — the last sentence switches to a different subject class (variably vs regularly recurring earthquakes) (555).
- **Action outside the verb** — the real action sits in a noun, adjective ("-dependent") or "there is" construction (557).
- **Hidden hypothesis** — weak verbs conceal that the author's claim ("limit" vs "inhibit" connection) was never stated (557).
- **Context after new** — results before the context that makes them interpretable (reversed table) (550).
- **Confused sections** — experimental detail in Results, discussion mixed with results (551).
- **Jargon** — real but minor: lifting the hard words leaves the passage "still difficult" (551).
- **Rejected diagnoses:** sentence length by word count (553); passive voice as such (554, 558).

## 4. Process: drafting, revising, thinking

- **Why the No. 1 problem arises:** writers compose linearly and grab the new thought first, adding context afterwards (555). A revision pass should therefore inspect *sentence openings* specifically, the opposite of where the drafter's attention was.
- **Start anywhere:** "attending to any one structural problem eventually leads us to all the others" (557). A tool need not order its checks; one note per paragraph on the clearest violation is enough to pull the author into the rest.
- **Structure first, substance surfaces:** "revision revealed existing conceptual gaps and other problems that had been submerged in the originals by dysfunctional structures" (558); "Improving the quality of writing actually improves the quality of thought" (550). Only one of four examples could be fixed by rearrangement alone; the others needed material added or deleted. An editor that only reorders will hit a wall and should then *ask*.
- **Only the author knows:** fixes come in alternatives ("Only the author could tell us which of these revisions more accurately reflects his intentions", 552); the revisers "reflect only our interpretation of the author's intentions" (554); when revising their own prose, writers "will not have to conjecture or infer" (558). Tool implication: offer two concrete alternatives or a question, never a single confident rewrite of meaning.
- **Likelihood, not meaning:** "We cannot succeed in making even a single sentence mean one and only one thing; we can only increase the odds" (553). Notes should be phrased as predicted reader behaviour ("most readers will take X as the point") rather than as errors.
- **Principles, not rules:** "None of these reader-expectation principles should be considered 'rules.' Slavish adherence to them will succeed no better than has slavish adherence to avoiding split infinitives" (558). Two reasons: too many expectations operate at once for any fixed algorithm; and "any reader expectation can be violated to good effect. Our best stylists turn out to be our most skillful violators" — but only because they satisfy expectations most of the time. Tool implication: every finding is dismissible, severity is low, and frequency matters more than any single instance.
- **Style is habit:** "Writers who fail to put new information in the stress position of many sentences in one document are likely to repeat that unhelpful structural pattern in all other documents" — and therefore "can permanently reverse those habitual structural decisions" (558). Tool implication: per-author statistics across articles (share of sentences ending on weak material, share of weak verbs, mean subject–verb gap) are worth tracking; teaching the habit beats fixing the instance.
- **Readers blame themselves:** the earthquake paragraph "can make readers feel badly about themselves" though its sentences are not long, its vocabulary is reasonable and "they are free of grammatical and dictional errors" (554). A grammar check passing says nothing about clarity; Review must look at structure.
- **Not simplification:** the method keeps jargon and science intact (551). "Simplify" should mean restructure, not dumb down; swapping hard words for easy ones is a small part of the difficulty.
- **Reading as interpretation:** "the document cannot 'exist' without the interpretation of each reader" (558); meaning is co-produced by text and reader, which is why position, not just word choice, decides what is understood.

## 5. Quotes (journal page)

- "Readers do not simply read; they interpret." (550)
- "Improving the quality of writing actually improves the quality of thought." (550)
- "We have striven not for simplification but for clarification." (551)
- "Long sentences need not be difficult to read; they are only difficult to write." (551)
- "Readers expect a grammatical subject to be followed immediately by the verb." (552)
- "The stress position coincides with the moment of syntactic closure." (552)
- "Only the author could tell us which of these revisions" (552)
- "Sheer length was neither the problem nor the solution." (553)
- "more viable candidates for stress positions than there are stress positions available" (553)
- "we can only increase the odds" (553)
- "Save the best for last" / "First things first" (554)
- "a story about whoever shows up first" (554)
- "Pollen's story at that moment is a passive one." (554)
- "No one should have to work as hard as we did" (554)
- "the No. 1 problem in American professional writing today" (555)
- "Put in the topic position the old information that links backward" (556)
- "Readers expect the action of a sentence to be articulated by the verb." (557)
- "attending to any one structural problem eventually leads us to all the others" (557)
- "None of these reader-expectation principles should be considered 'rules.'" (558)
- "Our best stylists turn out to be our most skillful violators" (558)
- "There can be no fixed algorithm for good writing" (558)
- "they know what the prose is intended to convey" (558)
- "the structure of the prose becomes the structure of the scientific argument" (558)

## 6. Assessment for Clearpen

**Highest-value principles for an app that edits but never writes**

1. **Old-before-new at the sentence ends (P4 + P3).** The authors' own "No. 1 problem"; the fix is a reordering of the author's existing words, which is exactly a pinpoint edit; and the diagnosis is partly computable from lexical overlap between adjacent sentences. It also gives the next-sentence judge a second criterion: not only "has the paragraph made its point" but "does this sentence begin from where the last one ended."
2. **Stress position (P2, with P8's "too long" definition).** Sentence endings are easy to isolate; weak endings (citations, hedges, "respectively", time adverbials, old information) are lexicon-detectable; and the authors' definition of over-length should replace any word-count trigger in Shorten: split at a closure, don't delete content. A reorder keeps the author's words.
3. **Action in the verb (P5).** Weak-verb + nominalization is a classic, high-precision regex check; the paper's "list the verbs" display is itself a feature (show the verb column of a paragraph). Rewrite needs the model but is small and factual.
4. **Subject–verb separation (P1).** Detectable by counting words inside parentheticals/appositives before the first finite verb; the paper's two-way fix (promote to its own clause, or delete) is a natural "two suggestions, you pick" UI and embodies Clearpen's "AI proposes; you decide."
5. **Logical gap and unkept promise (P9).** Paragraph-level, adjacent-sentence overlap is computable; naming the missing step needs the model. This is the principle that most directly justifies and bounds the grey "missing sentence": the authors found that structure-first revision exposes exactly these gaps, but also that only the author knows what belongs there, so the proposal must be tentative and easy to refuse, and offering a connective-as-question ("For example?") is often the better move.

**Deterministic code vs model**

Code can do (today, with Clearpen's zero-dependency regex style; precision improves markedly with a small POS tagger): topic-position and stress-position extraction; old/new stem overlap between adjacent sentences; paragraph topic-head diversity; weak-ending lexicon; weak-verb + nominalization; parenthetical/appositive length before the first verb; stress-position count vs heavy-item count; announced count vs enumerated count ("both", "two effects"); unkept-promise (stress stems never recurring); table column orientation (regular sequence not in column 1); term-before-definition.

Model is needed for: deciding what is emphasis-worthy (P2's two failure modes are indistinguishable without judging importance); deciding whose story a paragraph should be when several strands recur; judging whether an interruption is important (promote) or an aside (delete); naming the unstated connection or the right connective; recognizing a deliberate, effective violation; the capstone "does structural emphasis match substantive emphasis" (P7).

**Instruction-level consequences for Clearpen's prompts**

- *Improve / Shorten / Simplify:* "Do not cut for length. Start each sentence with what the previous one established; end on its new point; put the action in the verb; keep subject and verb together. Keep the author's words and facts." Shorten's target is closures-per-item, not word count. Simplify is restructuring, not vocabulary swaps.
- *Fix grammar:* never passive→active by default.
- *Review:* notes phrased as reader behaviour ("a reader will take X as the point of this sentence because it ends it") and as alternatives or questions; low severity; dismissible; prefer per-paragraph lists (topic positions, verbs) that let the author see the pattern.
- *Next sentence:* two checks before proposing — does the previous sentence's stress item get picked up, and does the new sentence's opening link back; if the gap is a missing connection, offer the connective as a question before offering a sentence.
