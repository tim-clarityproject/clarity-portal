# Guided questions: the rules and the tools still to build (Draft 6, approved by Tim 27 Nov 2026, 12:54)

Written on 27 Nov 2026 (Polish 1, Stage D, item 1). Every guided question in the portal follows the 40 rules below (question-rules.md, Tim’s answers of 27 Nov), and every tool not built yet is built from its questions here, **word for word**, as each is built. Nothing sits under a question except a quiet "See an example", which opens two or three different examples on tap (GuidedTool’s `step.example` as an array; never one example that assumes who they are). The commit question at a tool’s end can’t be skipped; every other question can (rule 34). [Words in square brackets] change for the person: their own earlier answer, their coach’s name, or the words for their role and country (the table below, `withRoleWords` in `src/lib/roleWords.js`, tested by `tests/performance/role-words.test.mjs`).

Source files: `~/Downloads/clarity-phase-6a/stage-d/question-rules.md` and `draft-6-tool-questions.md` (Draft 6’s "Questions for Tim" were answered as recommended: "Why not a 5?" kept as the one Why; "If you wanted to wreck it, what would you do?" kept in both Pre-mortems; the Journal has no commit question). The built tools’ own changes are Draft 11 (`draft-11-built-tool-questions.md`).

## Which tools already follow it (27 Nov 2026)

- **Emotional wash:** Draft 6’s nine screens with Draft 7’s word list (`src/lib/emotionalWash/model.js`; docs/rules/emotional-wash.md). One call made where Draft 6 is silent: with no thought to act on there is no commit screen, so the summary follows the last choice (for Tim).
- **Journal:** one screen, "What’s on your mind?", saving as you type, no commit question, Done (`src/pages/DailyJournal.jsx`). "Need a prompt?" stays behind its quiet link (Tim’s walk of Stage B).
- **Pre-mortem, Pressure plan and Meeting planner:** rebuilt to Draft 6 in the same stage (Stage D helper DQ2a; see its notes).
- **Give difficult feedback** and the other built tools: Draft 11 (Stage D helper DQ1).
- **Life balance review:** not yet. Draft 6’s screens need somewhere to keep the answers that `wheel_of_life_checkins` has no column for (the best area, "What would lift it?", what gives and drains energy, the first step’s day), so it waits for a migration (Stage D, DQ2b’s report).
- **Not built, built from this file later:** Delegation audit, Identity beyond the role, After-action review (today a Journal review type only), Above or below the line, Prepare for a difficult conversation, Prepare for a pitch, Map my stakeholders, Understand their sweet spot, Decide who decides, Strategy on a page and Pre-mortem for an initiative.

## The 40 question rules (Tim’s answers, 27 Nov 2026)

1. **Voice:** as if Tim asked it face to face, across the table in a session.
2. **Length:** one short sentence, about 12 words or fewer.
3. **Openers:** What and How; never Why (it can feel like being put on the spot).
4. **Ownership:** always "you" and "your" (your team, your week, what you want).
5. **Contractions:** always (what's, you're, didn't), the way people talk.
6. **Hard things:** named plainly ("What got in the way this week?"), no softening first.
7. **Challenge:** supportive, with an edge: kind, but doesn't let them off the hook.
8. **Leading:** never; open questions only, with no answer hidden inside.
9. **Under the question (Tim: "we're trying to keep it clean aren't we"; Claude's call):** nothing by default, just the question and the answer box. Only where a question would otherwise leave people stuck, a quiet "See an example" opens examples on tap.
10. **Examples (Tim: "we could cock it up by assuming"; Claude's call):** never one example that assumes who they are. Where examples are on tap, show two or three short, different ones (for example one from business, one from sport, one personal), so no one feels the question was written for someone else.
11. **Specific:** always concrete: this week, this meeting, one person, one thing.
12. **How many:** as many as they like; the question doesn't cap the answer. (Limits already decided for a tool stay, for example the Daily plan's few to-dos for today.)
13. **Start:** straight into question 1; the tool's one line on the hub is enough.
14. **End:** one question to commit, for example "What will you do first?" (Tim: "intentional action is the thing we want most from people using the portal").
15. **Time:** real, near time: today, this week, before Friday. Never "going forward" or "in future".
16. **Results:** performance words: perform, deliver, win, progress, your best.
17. **Metaphors:** rarely, and only one Tim would actually say; plain words first.
18. **Feelings:** ask, never name a feeling first ("How are you feeling about it?", never "Are you stressed?").
19. **Follow-ups:** quote their own words back ("You said the board meeting. What would make it go well?").
20. **Coach "I":** never; it's their space, and Tim speaks through the question.
21. **Scales, the solution-focused way (Tim: "why is it a X not X-1, what would make it X+1"):** rate, then two follow-ups built from their own number: "What makes it a 6, not a 5?" and "What would make it a 7?" Written with "What" to keep rule 3; the meaning is Tim's.
22. **Answer choices:** in their own voice, as full sentences ("The team isn't pulling in the same direction.").
23. **What's working:** asked early in most tools, so they build on it before fixing gaps.
24. **Other people:** brought in by role ("What does your team need from you this week?").
25. **Their own plan:** named in the question ("Which of your Strategies does this move forward?").
26. **Never in a question:** coaching jargon (reflect, journey, unpack, lean into, space, mindset); business clichés (leverage, synergy, bandwidth, circle back); softeners (just, maybe, perhaps, kind of, a little bit); judging words (should, failed, wrong, weak).
27. **Under pressure (Reset tools):** shorter and steadier: fewer words, calm, one thing at a time.
28. **Humour:** rarely, a light touch, only where Tim would smile saying it in a session.
29. **The future, pictured done (Tim's own words):** "Imagine it's Friday and you've nailed the week. What will you have done?" "Imagine…" is allowed to set the scene before a What or How question, and Tim's everyday words like "nailed" are welcome.
30. **What they can't control:** bring them back to what they can ("What part of this is yours to act on?").
31. **Knowing it's worked:** asked in planning tools ("How will you know it's worked?").
32. **The commit question:** what and when ("What will you do, and when?").
33. **Daily tools:** 4 to 6 questions, about 3 minutes.
34. **Skipping:** any question can be skipped except the commit question at the end.
35. **By role and by country (Tim: "americanisms and britishisms need to be respected. squad isn't used in the states. staff is used more in the UK"):** the question stays the same; only the nouns change, by the person's role and by their country (the spelling rule already follows the region). For example, a UK head coach hears "your squad" and "your staff", a US head coach "your team" and "your roster" or "coaching staff" where it fits, a business leader "your team". Claude drafts the word list (UK and US for each role) for Tim to approve with Draft 6.
36. **Naming the coach:** where it helps, offer a chat with the person's own coach by first name ("Want to talk this through with Maya?"); anyone without a coach is offered Tim.
37. **Short or vague answers:** nothing happens; move on. Their answer is their answer.
38. **Praise:** never ("Great answer!" would sound like a computer).
39. **Asking for action:** straight to it ("What will you do first?"), never "could".
40. **The check (Tim: "you read the full draft and audit it against a bunch of my fathom recordings"):** Claude reads Tim's own questions in a set of his recorded coaching sessions (Fathom), keeps only Tim's questions and never a client's words or details, builds a list of his real phrasing, then checks every redrafted question against it and against these 40 rules before Tim sees Draft 6.

### What this means in one line
Every question sounds like Tim across the table: short, concrete, "you" and "your", What or How, never leading, plainly naming hard things, supportive with an edge, and ending with what they'll do and when.

## Words that change by role and country (question rule 35)

The question stays the same; only these words change. Spelling already follows the region.

| Word in a question | Business, UK | Business, US | Sport, UK | Sport, US |
| --- | --- | --- | --- | --- |
| [team] | team | team | squad | team |
| [staff] | staff | people | staff | coaching staff |
| [board] | board | board | board or owners | owners or front office |
| [year] | this year | this year | this season | this season |
| [work] | work | work | the game | the game |
| [organisation] | organisation | organization | club | organization |

The role is the one chosen at sign-up (`person_settings.describes_you`: Head coach is sport, every other role business); the country is the account’s (`person_settings.country`), with the time zone as the fallback (rule 29y).

## Built, waiting for its migration

The Life balance review keeps its 10 areas and its check-ins; these are its Draft 6 screens, to build once the answers have somewhere to be kept (see "Which tools already follow it").

### Life Balance Review (~6 minutes)

1. **How's [area] right now?** *(one area per screen, last time's answer shown faintly; Very poor to Very good; the 10 areas as built)*
2. **Which area's going best for you?** *(answer boxes)*
3. **Which area matters most to you this month?** *(answer boxes, lowest areas first, no suggestion on a tie)*
4. **What makes [area] "[rating]", not "[one lower]"?** *(box)*
5. **What would lift [area] one step?** *(box)*
6. Optional: **What gives you energy, and what drains it?** *(two lists; Skip this step)*
7. **What will you do first, and when?** *(box and date; offers a to-do or a habit; can't be skipped)*
8. **Summary:** your wheel beside last time's, the area to lift and your first step. *(Save my review)*

## The tools not built yet, word for word from Draft 6

Each is a numbered list of screens: the question in bold, then the kind of answer in brackets.

## Plan: Decide

### Delegation audit (~10 minutes)

1. **What do you spend your week on?** *(list)* · See an example: Signing off budgets / Planning training / Weekly one-to-ones
2. **What are you already handing over well?** *(box)*
3. **Which of these can only you do?** *(tick list)*
4. **Who in [team] will own "[task]"?** *(box, or "Not sure yet"; one screen for each task not ticked)*
5. **What will they need from you to own it well?** *(box)* · See an example: The client history / A first session together / Sign-off up to £5k
6. **How will you know the handover's worked?** *(box)*
7. **Which will you hand over first, and when?** *(answer boxes and date; can't be skipped)*
8. **Summary:** what only you can do; what you'll hand over, to whom, and what they need. *(Save my audit)*

## Reset

### Identity beyond the role (~8 minutes)

Private: no eye.

1. **Who are you outside [work]?** *(box)* · See an example: Dad / Runner / The friend people call first
2. **What would still be yours if this role ended tomorrow?** *(box)*
3. **What are you proudest of that's nothing to do with your title?** *(box)*
4. **Which of your strengths go with you into any role?** *(box)*
5. **What will you do this week that's nothing to do with [work]?** *(box and day; can't be skipped)*
6. **Summary:** your answers as a short reminder, with "Remind me in 3 months" (on by default). *(Save my reminder)*

## Review

### After-action review (~6 minutes)

The classic four questions (decided 21 Oct), with your scaling and the line check.

1. **What are you looking back on?** *(drop-down from your Peak moments and plans, or a box)*
2. **What was meant to happen?** *(box)*
3. **What actually happened?** *(box)*
4. **What made the difference between the two?** *(box)*
5. **Out of 10, how did you perform?** *(1 to 10)*
6. **Why not a [your number less one]?** *(box)*
7. **What would have made it a [your number plus one]?** *(box)*
8. **Where were you, above or below the line?** *(the five positions, one tap)*
9. **What will you keep doing?** *(box)*
10. **What will you change, and when?** *(box and date; offers "Make a Pressure plan for next time" or "Add to this week"; can't be skipped)*
11. **Summary:** what happened, your score, the lesson, and your change. *(Save my review)*

### Above or below the line (~2 minutes)

1. **Where are you right now?** *(the five positions, from well above to well below, one tap)*
2. **What do you notice in how you're acting?** *(pick any: "I'm owning it." / "I'm curious." / "I'm blaming others." / "I'm making excuses." / "I'm waiting for someone else."; Something else)*
3. Above only: **What's keeping you above the line today?** *(box)*
4. Below only: **What part of this is yours to act on?** *(box)*
5. **What will you do next, and when?** *(box and time; it can become tomorrow's one thing; can't be skipped)*
6. **Summary:** your position, what you noticed, and your next move. *(Finish)*

## Interpersonal

### Prepare for a difficult conversation (~12 minutes)

The steps agreed on 21 Oct, as questions.

1. **What would success look like for you?** *(box)*
2. **What's your position, and what's behind it?** *(box)*
3. **Argue their side as well as they would. What's their position, and what's behind it?** *(box)*
4. **What do you already agree on?** *(box)*
5. **When have you handled a conversation like this well?** *(box)*
6. **What will they push back with, and how will you answer?** *(pairs: Their point, Your answer; Add another)*
7. **What might you be missing?** *(box)*
8. **What's the highest-integrity way to handle this?** *(box)*
9. **What's your opening line?** *(box)*
10. **What won't you give up?** *(box)*
11. **When and where will you have the conversation?** *(date and a box; can't be skipped)*
12. **Summary,** with "Want to talk this through with [coach's first name]?". Home offers "How did it go?" the next day. *(Save my plan)*

### Prepare for a pitch (~12 minutes)

1. **Who are you pitching to?** *(box)*
2. **What do you want them to do at the end?** *(box)*
3. **If you had 15 seconds, what would you say?** *(box)*
4. **What three points back it up?** *(three boxes)*
5. **What are the toughest questions they'll ask?** *(list)*
6. **You said "[question]". How will you answer it?** *(box; one screen per question)*
7. **When will you rehearse it out loud, and with whom?** *(date and a box; can't be skipped)*
8. **Summary,** then "Make a Pressure plan for the day?", with the event and date filled in. *(Save my pitch)*

### Map my stakeholders (~15 minutes)

1. **Who has the most say in how you perform?** *(list of names and roles)*
2. **How much influence does [name] have?** *(Low, Some, High)*
3. **Where's [name] on what you're doing?** *("They're against it." / "They're not sure yet." / "They're behind it.")*
4. **How's your relationship with [name] right now?** *(Very poor to Very good; asked monthly)*
5. **What does [name] need from you?** *(box)*
6. **Who do you go to for challenge, support and expertise?** *(three lists; a gap is flagged quietly)*
7. **Who will you speak to first, and when?** *(answer boxes and date; can't be skipped)*
8. **Summary:** the map by influence and support, who needs what, your advisers and any gaps. *(Save my map)*

### Understand their sweet spot (~10 minutes)

The Find my sweet spot questions turned towards one person in your [team].

1. **Who in [team] are you thinking about?** *(box)*
2. **What do they find easy that others find hard?** *(box)*
3. **What do they enjoy that others find boring?** *(box)*
4. **What can't they walk past?** *(box)* · See an example: Sloppy detail / Someone left out / A problem nobody owns
5. **Where do those three meet in their work?** *(box)*
6. **Where will you use them more this month?** *(box)*
7. **When will you talk to them about it?** *(date; offers "Add to this week"; can't be skipped)*
8. **Summary,** with the three-circle diagram. *(Save)*

### Decide who decides (~10 minutes)

1. **Which decisions keep coming up in [team]?** *(list)*
2. **For "[decision]", who decides?** *(Green "They decide, act and report back." / Amber "They decide, and I confirm before they act." / Red "I decide.")*
3. **Who owns it?** *(box; Green and Amber only)*
4. **What will they need from you to own it well?** *(box)*
5. **How will you know it's working?** *(box)*
6. **When will you tell [team], and how?** *(date and a box; can't be skipped)*
7. **Summary:** every decision with its colour and owner. Green decisions feed Map my team's autonomy. *(Save)*

## Strategic

### Strategy on a page (~20 minutes)

1. **What's your [team]'s mission?** *(box; your own Mission is not used here)*
2. **What's working well right now?** *(list)*
3. **What are your three to five priorities for [year]?** *(list, up to five)*
4. **How will you know "[priority]" is working?** *(one measure each)*
5. **What won't you chase?** *(list)*
6. Optional: send [team] **"What's unclear or missing?"** before it's final. *(Send a link, or Skip this step)*
7. **When will you share it with [team]?** *(date; can't be skipped)*
8. **Summary:** the page itself, with the PDF to share. *(Save my page)*

### Pre-mortem for an initiative (~15 minutes)

The Pre-mortem's steps, for a team project, with an owner on each action.

1. **Which initiative is it?** *(box)*
2. **What's already going for it?** *(list)*
3. **Imagine it's a year on and it's gone badly. What happened?** *(list)*
4. **If you wanted to wreck it, what would you do?** *(list, adds to 3)*
5. **Which are most likely, and which would hurt most?** *(two picks of up to three)*
6. **You said "[cause]". What will stop that happening?** *(box)*
7. **Who owns that, and by when?** *(name and date)*
8. **What will you do first, and when?** *(box and date; can't be skipped)*
9. **Summary:** the causes, each with its prevention, owner and date, and the PDF. *(Save my pre-mortem)*
