# Clarity Portal — Product Roadmap

## MVP (Ready to Send to Beta Users) ✓

These are production-ready and tested:

### Decision-Making Tools (LIVE)
- [x] **GROW Model** — Structure decisions through Goal, Reality, Options, Will-do
- [x] **Tough Conversation Framework** — Prepare feedback scripts and coaching questions
- [x] **Inversion Thinking** — Identify risks and plan mitigation
- [x] **Where My Team Should Focus** — Strategic alignment with critical success factors

### Workflows in Development
- [ ] **Risk Mitigation Model** — Full workflow (list risks → identify mitigations → prioritize)

### Core Features (LIVE)
- [x] User authentication (email/password)
- [x] Decision saving & persistence
- [x] Decision history with status tracking
- [x] Decision summaries (one-pager review)
- [x] After-Action Reviews
- [x] Draft saving
- [x] Data persistence across sessions
- [x] Clean form clearing for fresh decisions

### Known Issues (Low Priority for MVP)
- [ ] Tough Conversation showing DRAFT badge when completed (cosmetic - user can work around)
- [ ] Strategic Alignment "Where my team should focus" not saving (CRITICAL - need to fix before sending to users)
- [ ] Duplicate option handling when using same text multiple times (edge case)

---

## Phase 1: MVP Features (First 2 Weeks)

### High Priority (Must Have)
- [ ] Fix Strategic Alignment not saving (blocker)
- [ ] Fix Tough Conversation draft badge issue
- [ ] **Risk Mitigation Model** — Full decision workflow (identify risks → mitigation strategies)
- [ ] Add "Plan My Day" light tool (5-minute decision about priorities)
- [ ] Add "Not to Do List" (quick filter of low-value activities)
- [ ] User feedback form on decisions (know what's resonating)
- [ ] Email notifications for saved decisions

### Medium Priority (Should Have)
- [ ] "Make a Development Plan (Simple IDP)" — lightweight personal development
- [ ] "Find My Sweet Spot" (Strengths/Interests/Values) — self-discovery
- [ ] Breathing guide (4 in, 6 out) on welcome page (calm entrance experience)
- [ ] Setting to customize breath length
- [ ] Export decision as PDF
- [ ] Share decision with a colleague (read-only link)

### Low Priority (Nice to Have)
- [ ] Analytics dashboard (see which tools users prefer)
- [ ] Progress tracking over time
- [ ] Decision templates
- [ ] Mobile app
- [ ] Real-time collaboration

---

## Phase 2: Scale (Weeks 3-6)

- [ ] Google/Microsoft login options
- [ ] Team workspace (see colleagues' decision summaries)
- [ ] Progress check-ins on saved decisions
- [ ] Email reminders for decisions with upcoming deadlines
- [ ] Decision categories/tagging
- [ ] Search across decisions
- [ ] API for integrations

---

## Phase 3: Engagement (Weeks 7+)

- [ ] Notification preferences
- [ ] AI-powered coaching suggestions
- [ ] Decision outcome tracking (did the plan work?)
- [ ] Community features (anonymous sharing of patterns)
- [ ] Habit formation tools
- [ ] Learning resources curated by decision type

---

## For Beta Launch (Send to 20-30 People)

### Must be Fixed
1. **Strategic Alignment not saving** — This is a blocker; users will get frustrated
2. **Tough Conversation draft badge** — Visual indication of completeness

### Should be Tested
1. Data persistence across sessions (recent fix — verify in testing)
2. Form clearing on fresh decisions (recent fix — verify)
3. Decision summary layout and information hierarchy
4. Navigation flow between all decision types
5. Browser compatibility (Chrome, Safari, Firefox)

### Nice to Mention to Beta Users
- Features in development: Plan My Day, Breathing exercises, Export to PDF
- Ask what other decision scenarios they face
- Collect feedback on language/terminology
- Ask which tool was most valuable

---

## User Research Questions for Beta

1. Which decision type did you find most useful?
2. What decision type do you wish we had?
3. Did the framework help you think differently about the decision?
4. How did the review/summary compare to making the decision alone?
5. Would you pay for this? If yes, what would make it worth paying for?
6. What's one thing we should change?

---

## Technical Debt to Address After MVP

- Remove redundant localStorage clearing from decision pages (code cleanup)
- Refactor FormContext to use unique IDs for options (handles duplicate text edge case)
- Add automated tests for data persistence
- Performance optimization (lazy load decision workflows)
- Analytics integration (track feature usage)

---

## Success Metrics for Beta

- 80%+ of users complete at least one decision
- 50%+ of users save a decision
- Average rating 4+/5 stars (if asking)
- Users mention at least one "aha" moment
- Requests for specific features (indicates engagement)
