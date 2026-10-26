-- =============================================================================
-- 031_evidence_library.sql
-- Phase 1 data model, part 6 of 6: the evidence library
-- (phase-1-data-model-spec.md section 11)
--
-- Made by scripts/make-evidence-seed.mjs from docs/claims-register.md and
-- scripts/evidence-library-template.sql. Change those, not this file, then
-- run: node scripts/make-evidence-seed.mjs
--
-- WHAT THIS DOES (plain English)
--     evidence_references        each source: citation, link(s), what it
--                                found, size of effect, how it was checked,
--                                date checked, who added it
--     evidence_claims            each claim as the portal says it, where it
--                                shows, its strength (Strong, Moderate, Early,
--                                Our model), caveat and references
--     evidence_tools             each tool: what it's based on, its strength,
--                                its claims, whether it is flagged for Tim
--                                (Early or Our model), and the "Why this
--                                works" switch that hides it from clients
--                                (the record stays)
--     evidence_claim_references, evidence_tool_claims   the links between them
--   Seeded exactly from the claims register version 1.1 (Parts A, B and C):
--   {"references":33,"claims":46,"claimReferences":39,"tools":37,"toolClaims":69,"flaggedTools":21}
--
-- WHO CAN SEE WHAT
--   The owner (Tim) adds and edits. Coaches read. Clients read only a
--   visible tool's "Why this works", through public.why_this_works().
--
-- SAFE TO RUN TWICE
--   Yes. The seed adds only what is missing, so later edits are kept.
--
-- HOW TO RUN
--   After 030. Then run supabase/031_evidence_library_test.sql.
-- =============================================================================

create table if not exists public.evidence_references (
  id               text primary key check (id ~ '^R[0-9]+$'),
  citation         text not null,
  links            text[] not null default '{}'::text[],
  found            text,
  effect_size      text,
  checked_on       text,
  date_checked     date,
  added_by         text,
  register_version text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.evidence_claims (
  id                 text primary key check (id ~ '^C[0-9]+$'),
  area               text,
  wording            text not null,
  where_it_shows     text,
  strength           text not null,
  strength_level     text not null check (strength_level in ('strong', 'moderate', 'early', 'our_model')),
  sources            text,
  caveat             text,
  practitioner_model boolean not null default false,
  register_version   text,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.evidence_claim_references (
  claim_id     text not null references public.evidence_claims (id) on delete cascade,
  reference_id text not null references public.evidence_references (id) on delete cascade,
  primary key (claim_id, reference_id)
);
create index if not exists evidence_claim_references_reference_idx on public.evidence_claim_references (reference_id);

create table if not exists public.evidence_tools (
  key                    text primary key check (key ~ '^[a-z0-9_]{2,60}$'),
  name                   text not null unique,
  based_on               text,
  claims                 text,
  strength               text not null,
  strength_level         text not null check (strength_level in ('strong', 'moderate', 'early', 'our_model')),
  flagged                boolean not null default false,
  why_this_works_visible boolean not null default true,
  register_version       text,
  sort_order             integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
comment on column public.evidence_tools.why_this_works_visible is
  'Tim''s switch: off hides the tool''s "Why this works" from clients; the record stays (Tim, 26 Oct, 16:54).';

create table if not exists public.evidence_tool_claims (
  tool_key text not null references public.evidence_tools (key) on delete cascade on update cascade,
  claim_id text not null references public.evidence_claims (id) on delete cascade,
  primary key (tool_key, claim_id)
);
create index if not exists evidence_tool_claims_claim_idx on public.evidence_tool_claims (claim_id);

do $touch$
declare t text;
begin
  foreach t in array array['evidence_references', 'evidence_claims', 'evidence_tools'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.p1_touch()', t || '_touch', t);
  end loop;
end
$touch$;

-- ---------------------------------------------------------------- grants and rules
do $rules$
declare t text;
begin
  foreach t in array array['evidence_references', 'evidence_claims', 'evidence_claim_references', 'evidence_tools', 'evidence_tool_claims'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "Evidence: coaches read" on public.%I', t);
    execute format('create policy "Evidence: coaches read" on public.%I for select to authenticated using ((select public.is_coach()))', t);
    execute format('drop policy if exists "Evidence: owner writes" on public.%I', t);
    execute format('create policy "Evidence: owner writes" on public.%I for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()))', t);
  end loop;
end
$rules$;

-- A tool's "Why this works", for clients: only while Tim's switch is on.
-- The tool's basis and strength, then each claim with its caveat and its
-- references. Null for a hidden or unknown tool.
create or replace function public.why_this_works(p_tool_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tool', t.name,
    'based_on', t.based_on,
    'strength', t.strength,
    'strength_level', t.strength_level,
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'wording', c.wording, 'strength', c.strength, 'strength_level', c.strength_level, 'caveat', c.caveat,
        'references', coalesce((select jsonb_agg(jsonb_build_object('citation', r.citation, 'links', to_jsonb(r.links)) order by r.id)
                                from public.evidence_claim_references cr join public.evidence_references r on r.id = cr.reference_id
                                where cr.claim_id = c.id), '[]'::jsonb))
        order by c.sort_order)
      from public.evidence_tool_claims tc join public.evidence_claims c on c.id = tc.claim_id
      where tc.tool_key = t.key), '[]'::jsonb)
  )
  from public.evidence_tools t
  where t.key = p_tool_key and t.why_this_works_visible and (select auth.uid()) is not null;
$$;
revoke all on function public.why_this_works(text) from public, anon;
grant execute on function public.why_this_works(text) to authenticated;

-- ---------------------------------------------------------------- the seed
-- Seeded from docs/claims-register.md version 1.1 by scripts/make-evidence-seed.mjs.
-- Added only where missing, so Tim's later edits in the library are never overwritten.
insert into public.evidence_references (id, citation, links, found, effect_size, checked_on, date_checked, added_by, register_version) values
  ('R1', 'Harkin B, Webb TL, Chang BPI, Prestwich A, Conner M, Kellar I, Benn Y, Sheeran P (2016). Does monitoring goal progress promote goal attainment? A meta-analysis of the experimental evidence. Psychological Bulletin, 142(2), 198–229.', array['https://doi.org/10.1037/bul0000025']::text[], 'Helping people track their progress made them more likely to reach their goals, more so when progress was physically recorded or shared.', 'd = 0.40; 138 studies, 19,951 people', 'Publisher (APA) PDF', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R2', 'Locke EA, Latham GP (2002). Building a practically useful theory of goal setting and task motivation: A 35-year odyssey. American Psychologist, 57(9), 705–717.', array['https://doi.org/10.1037/0003-066X.57.9.705']::text[], 'Seminal review: specific, hard goals lead to better performance than "do your best" across many tasks and settings.', 'Review; no single figure', 'PubMed 12237980; published PDF', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R3', 'Sheeran P, Listrom O, Gollwitzer PM (2025). The when and how of planning: Meta-analysis of the scope and components of implementation intentions in 642 tests. European Review of Social Psychology, 36(1), 162–194. Background: Gollwitzer PM, Sheeran P (2006). Implementation intentions and goal achievement: A meta-analysis of effects and processes. Advances in Experimental Social Psychology, 38, 69–119 (book series chapter).', array['https://doi.org/10.1080/10463283.2024.2334563', 'https://doi.org/10.1016/S0065-2601(06)38002-1']::text[], 'If-then plans improved what people thought, felt and did, more so when worded as a true if-then, when people were motivated and when the plan was rehearsed.', 'd = 0.27 to 0.66 across outcomes; 642 tests (2025). d = 0.65; 94 tests (2006)', 'Repository (Konstanz), both', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R4', 'Sheldon KM, Elliot AJ (1999). Goal striving, need satisfaction, and longitudinal well-being: The self-concordance model. Journal of Personality and Social Psychology, 76(3), 482–497. Koestner R, Otis N, Powers TA, Pelletier L, Gagnon H (2008). Autonomous motivation, controlled motivation, and goal progress. Journal of Personality, 76(5), 1201–1230.', array['https://doi.org/10.1037/0022-3514.76.3.482', 'https://doi.org/10.1111/j.1467-6494.2008.00519.x']::text[], 'Goals pursued for your own reasons got more sustained effort and more progress; goals driven by pressure were not linked to progress.', 'Longitudinal studies plus a meta-analysis (2008)', 'PubMed 10101878 and repository; library record (Koestner)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R5', 'Ryan RM, Deci EL (2000). Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being. American Psychologist, 55(1), 68–78. Van den Broeck A, Howard JL, Van Vaerenbergh Y, Leroy H, Gagné M (2021). Beyond intrinsic and extrinsic motivation: A meta-analysis on self-determination theory''s multidimensional conceptualization of work motivation. Organizational Psychology Review, 11(3), 240–273.', array['https://doi.org/10.1037/0003-066X.55.1.68', 'https://doi.org/10.1177/20413866211006173']::text[], 'Seminal theory, then a work meta-analysis: valuing your work best predicted performance; enjoying it best predicted wellbeing.', '124 samples (2021)', 'Published PDF (2000); repository (Monash, 2021)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R6', 'Keiser NL, Arthur W Jr (2021). A meta-analysis of the effectiveness of the after-action review (or debrief) and factors that influence its effectiveness. Journal of Applied Psychology, 106(7), 1007–1032. Tannenbaum SI, Cerasoli CP (2013). Do team and individual debriefs enhance performance? A meta-analysis. Human Factors, 55(1), 231–245.', array['https://doi.org/10.1037/apl0000821', 'https://doi.org/10.1177/0018720812448394']::text[], 'Two meta-analyses: debriefs and after-action reviews improve later performance of individuals and teams.', 'd = 0.67; 46 samples, 2,136 people (2013). 61 studies (2021)', 'Publisher (SAGE, 2013); the 2021 paper confirmed through a SAGE article''s reference list; its figures to be checked on the APA record before they are quoted', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R7', 'de Haan E, Nilsson VO (2023). What can we know about the effectiveness of coaching? A meta-analysis based only on randomized controlled trials. Academy of Management Learning and Education, 22(4). Jones RJ, Woods SA, Guillaume YRF (2016). The effectiveness of workplace coaching: A meta-analysis of learning and performance outcomes from coaching. Journal of Occupational and Organizational Psychology, 89(2), 249–277. Theeboom T, Beersma B, van Vianen AEM (2014). Does coaching work? Journal of Positive Psychology, 9(1), 1–18.', array['https://doi.org/10.5465/amle.2022.0107', 'https://doi.org/10.1111/joop.12119', 'https://doi.org/10.1080/17439760.2013.837499']::text[], 'Across randomised trials, coaching had a moderate positive effect, larger on self-reported outcomes, with signs of publication bias; earlier meta-analyses agree on positive effects.', 'g = 0.59; 37 trials, 2,528 people (2023). δ = 0.36; 17 studies (2016). g = 0.43 to 0.74 (2014)', 'Repositories (VU, Aston, UvA)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R8', 'Grant AM (2012). Making positive change: A randomized study comparing solution-focused vs. problem-focused coaching questions. Journal of Systemic Therapies, 31(2), 21–35. Neipp MC, Beyebach M, Núñez RM, Martínez-González MC (2016). The effect of solution-focused versus problem-focused questions: A replication. Journal of Marital and Family Therapy, 42(3), 525–535. Grant AM, O''Connor SA (2010). The differential effects of solution-focused and problem-focused coaching questions: a pilot study. Industrial and Commercial Training, 42(2), 102–111.', array['https://doi.org/10.1521/jsyt.2012.31.2.21', 'https://doi.org/10.1111/jmft.12140', 'https://doi.org/10.1108/00197851011026090']::text[], 'Solution-focused questions moved people towards their goals more, with more confidence and more planned action steps, than problem-focused questions.', '225 people (2012); 204 (2016); 74 (2010)', 'Repositories; publisher (Emerald, 2010)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R9', 'Lally P, van Jaarsveld CHM, Potts HWW, Wardle J (2010). How are habits formed: Modelling habit formation in the real world. European Journal of Social Psychology, 40(6), 998–1009. Singh B, Murphy A, Maher C, Smith AE (2024). Time to form a habit: A systematic review and meta-analysis of health behaviour habit formation and its determinants. Healthcare, 12(23), 2488.', array['https://doi.org/10.1002/ejsp.674', 'https://doi.org/10.3390/healthcare12232488']::text[], 'Habits took about two months to form on average, but anywhere from days to most of a year between people; missing a single day made little difference.', 'Range 18 to 254 days (2010); 4 to 335 days, 20 studies (2024)', 'Repositories (Surrey, Adelaide)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R10', 'Amabile T, Kramer S (2011). The Progress Principle: Using Small Wins to Ignite Joy, Engagement, and Creativity at Work. Harvard Business Review Press.', array['https://www.hbs.edu/faculty/Pages/item.aspx?num=40692']::text[], 'Nearly 12,000 diary entries from 7 companies: progress on meaningful work was the event most linked to good days at work.', 'Diary study; not a trial', 'Harvard Business School faculty page; HBR Store', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R11', 'Lim J, Dinges DF (2010). A meta-analysis of the impact of short-term sleep deprivation on cognitive variables. Psychological Bulletin, 136(3), 375–389. Lowe CJ, Safati A, Hall PA (2017). The neurocognitive consequences of sleep restriction: A meta-analytic review. Neuroscience and Biobehavioral Reviews, 80, 586–604. Van Dongen HPA, Maislin G, Mullington JM, Dinges DF (2003). The cumulative cost of additional wakefulness. Sleep, 26(2), 117–126.', array['https://doi.org/10.1037/a0018883', 'https://doi.org/10.1016/j.neubiorev.2017.07.010', 'https://doi.org/10.1093/sleep/26.2.117']::text[], 'Sleep loss harms attention and working memory; regularly sleeping too little also harms thinking, and people largely fail to notice their own decline.', 'g = 0.78 attention (2010); g = 0.38 overall for partial sleep loss, 61 studies (2017); 48 adults (2003)', 'Published PDF (2010); PubMed 28757454 (2017); publisher issue page and NASA record (2003)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R12', 'Fincham GW, Strauss C, Montero-Marin J, Cavanagh K (2023). Effect of breathwork on stress and mental health: A meta-analysis of randomised-controlled trials. Scientific Reports, 13, 432. Laborde S, Allen MS, Borges U, Dosseville F, Hosang T, Iskra M, et al. (2022). Effects of voluntary slow breathing on heart rate and heart rate variability: A systematic review and a meta-analysis. Neuroscience and Biobehavioral Reviews, 138, 104711. Balban MY, Neri E, Kogon MM, et al. (2023). Brief structured respiration practices enhance mood and reduce physiological arousal. Cell Reports Medicine, 4(1), 100895.', array['https://doi.org/10.1038/s41598-022-27247-y', 'https://doi.org/10.1016/j.neubiorev.2022.104711', 'https://doi.org/10.1016/j.xcrm.2022.100895']::text[], 'Breathwork gave small reductions in stress; slow breathing raises heart rate variability; in one trial, 5 minutes a day of slow-exhale breathing lifted mood more than mindfulness.', 'g = −0.35 for stress, 12 trials (2023); 223 studies (2022); 108 people (2023 trial, registered after it ran)', 'PubMed and repository (Fincham); repositories (Laborde); PMC9873947 (Balban)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R13', 'Lieberman MD, Eisenberger NI, Crockett MJ, Tom SM, Pfeifer JH, Way BM (2007). Putting feelings into words: Affect labeling disrupts amygdala activity in response to affective stimuli. Psychological Science, 18(5), 421–428. Torre JB, Lieberman MD (2018). Putting feelings into words: Affect labeling as implicit emotion regulation. Emotion Review, 10(2), 116–124. Shukla M, Mishra A (2026). Effectiveness of affect labelling as an emotion regulation strategy in individuals with high emotional reactivity: a systematic review. Current Psychology, 45(7), 683.', array['https://doi.org/10.1111/j.1467-9280.2007.01916.x', 'https://doi.org/10.1177/1754073917742706', 'https://doi.org/10.1007/s12144-026-09229-9']::text[], 'Naming a feeling lowers the brain''s alarm response; a recent review found body and brain effects fairly consistent, but effects on how people feel mixed.', 'Lab and brain-imaging studies; 32 studies (2026)', 'Publishers (APS, SAGE, Springer)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R14', 'Frattaroli J (2006). Experimental disclosure and its moderators: A meta-analysis. Psychological Bulletin, 132(6), 823–865.', array['https://doi.org/10.1037/0033-2909.132.6.823']::text[], 'Writing or talking about personal experiences had a small, reliable positive effect.', 'r = 0.075; 146 trials', 'PubMed 17073523', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R15', 'Davis DE, Choe E, Meyers J, et al. (2016). Thankful for the little things: A meta-analysis of gratitude interventions. Journal of Counseling Psychology, 63(1), 20–31. Cregg DR, Cheavens JS (2021). Gratitude interventions: Effective self-help? A meta-analysis of the impact on symptoms of depression and anxiety. Journal of Happiness Studies, 22(1), 413–445.', array['https://doi.org/10.1037/cou0000107', 'https://doi.org/10.1007/s10902-020-00236-6']::text[], 'Gratitude exercises give small benefits, often no better than other positive activities.', 'd = 0.31 against doing nothing (2016); g = −0.29 for low mood, 27 studies (2021)', 'PubMed 26575348 record (2016); RePEc index (2021)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R16', 'Mitchell DJ, Russo JE, Pennington N (1989). Back to the future: Temporal perspective in the explanation of events. Journal of Behavioral Decision Making, 2(1), 25–38. Klein G (2007). Performing a project premortem. Harvard Business Review, 85(9), 18–19. Veinott B, Klein GA, Wiggins S (2010). Evaluating the effectiveness of the PreMortem technique on plan confidence. Proceedings of the 7th International ISCRAM Conference, Seattle.', array['https://doi.org/10.1002/bdm.3960020103', 'https://hbr.org/2007/09/performing-a-project-premortem', 'https://idl.iscram.org/files/veinott/2010/1049_Veinott_etal2010.pdf']::text[], 'Treating an outcome as certain led people to give more explanations for it; Klein made this the pre-mortem; one study found it cut overconfidence in a plan more than listing pros and cons.', '178 people (2010)', 'Wiley listing (1989); HBR page (2007); ISCRAM library (2010)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R17', 'Sonnentag S, Cheng BH, Parker SL (2022). Recovery from work: Advancing the field toward the future. Annual Review of Organizational Psychology and Organizational Behavior, 9, 33–60. Bennett AA, Bakker AB, Field JG (2018). Recovery from work-related effort: A meta-analysis. Journal of Organizational Behavior, 39(3), 262–275. Sonnentag S, Fritz C (2007). The Recovery Experience Questionnaire. Journal of Occupational Health Psychology, 12(3), 204–221.', array['https://doi.org/10.1146/annurev-orgpsych-012420-091355', 'https://doi.org/10.1002/job.2217', 'https://doi.org/10.1037/1076-8998.12.3.204']::text[], 'Switching off from work goes with less fatigue, and feeling in control of your time with more vigour; recovery supports wellbeing and performance and can be trained.', '54 samples, 26,592 people (2018)', 'Repositories (CityU, Erasmus, Konstanz)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R18', 'Eastman CI, Burgess HJ (2009). How to travel the world without jet lag. Sleep Medicine Clinics, 4(2), 241–255. Janse van Rensburg DC, Jansen van Rensburg A, Fowler PM, et al. (2021). Managing travel fatigue and jet lag in athletes: A review and consensus statement. Sports Medicine, 51(10), 2029–2050.', array['https://doi.org/10.1016/j.jsmc.2009.02.006', 'https://doi.org/10.1007/s40279-021-01502-0']::text[], 'Timed light, avoiding light at the wrong time, and shifting sleep before a flight can move the body clock towards destination time; an expert consensus sets out practical steps but notes field evidence is lacking.', 'Reviews and consensus', 'CDC Stacks (2009); repository (UWA, 2021)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R19', 'Rudolph CW, Friedrich JC, Koziel RJ, Zacher H (2025). Character strengths use at work: A meta-analysis of relations with work performance and employee wellbeing. Applied Research in Quality of Life, 20(2), 753–788. Ghielen STS, van Woerkom M, Meyers MC (2018). Promoting positive outcomes through strengths interventions: A literature review. Journal of Positive Psychology, 13(6), 573–585.', array['https://doi.org/10.1007/s11482-025-10424-2', 'https://doi.org/10.1080/17439760.2017.1365164']::text[], 'Using strengths at work goes with higher performance and wellbeing; strengths exercises show promising results in a smaller set of studies.', 'ρ = 0.42 performance, 0.62 wellbeing (2025)', 'Publisher (Springer, 2025); repositories (2018)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R20', 'Watson NF, Badr MS, Belenky G, et al. (2015). Recommended amount of sleep for a healthy adult: A joint consensus statement of the AASM and SRS. Journal of Clinical Sleep Medicine, 11(6), 591–592. Hirshkowitz M, Whiton K, Albert SM, et al. (2015). National Sleep Foundation''s sleep time duration recommendations. Sleep Health, 1(1), 40–43.', array['https://doi.org/10.5664/jcsm.4758', 'https://doi.org/10.1016/j.sleh.2014.12.010']::text[], 'Adults should regularly sleep at least 7 hours; 7 to 9 hours for most adults.', 'Expert consensus', 'Publisher (AASM) PDF; PubMed 29073412', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R21', 'Bull FC, Al-Ansari SS, Biddle S, et al. (2020). World Health Organization 2020 guidelines on physical activity and sedentary behaviour. British Journal of Sports Medicine, 54(24), 1451–1462. Department of Health and Social Care (2019, updated 10 Jul 2026). UK Chief Medical Officers'' physical activity guidelines.', array['https://doi.org/10.1136/bjsports-2020-102955', 'https://www.gov.uk/government/publications/physical-activity-guidelines-uk-chief-medical-officers-report']::text[], '150 to 300 minutes of moderate or 75 to 150 of vigorous activity a week, plus muscle strengthening on 2 or more days, and less sitting.', 'Guidelines', 'Publisher (BMJ); GOV.UK', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R22', 'Ekelund U, Steene-Johannessen J, Brown WJ, et al. (2016). Does physical activity attenuate, or even eliminate, the detrimental association of sitting time with mortality? A harmonised meta-analysis of data from more than 1 million men and women. Lancet, 388(10051), 1302–1310.', array['https://doi.org/10.1016/S0140-6736(16)30370-1']::text[], 'About 60 to 75 minutes of moderate activity a day removed the extra risk linked to sitting more than 8 hours a day.', 'About 1 million people', 'Repositories (MRC Epidemiology, Cambridge)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R23', 'UK Chief Medical Officers (2016). UK Chief Medical Officers'' Low Risk Drinking Guidelines. Office for Health Improvement and Disparities (2017, updated 2020). Alcohol use disorders identification test for consumption (AUDIT C). Bush K, Kivlahan DR, McDonell MB, Fihn SD, Bradley KA (1998). The AUDIT alcohol consumption questions (AUDIT-C). Archives of Internal Medicine, 158(16), 1789–1795.', array['https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/545937/UK_CMOs__report.pdf', 'https://www.gov.uk/government/publications/alcohol-use-screening-tests', 'https://pubmed.ncbi.nlm.nih.gov/9738608/']::text[], 'No more than 14 units a week, spread over 3 or more days; the UK AUDIT-C asks how often someone had 6 or more units (women) or 8 or more (men) in one session; the three AUDIT-C questions pick out heavy drinking well.', 'AUDIT-C accuracy 0.89 (1998)', 'GOV.UK; article PDF', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R24', 'Elo A-L, Leppänen A, Jahkola A (2003). Validity of a single-item measure of stress symptoms. Scandinavian Journal of Work, Environment and Health, 29(6), 444–451. Carney CE, Buysse DJ, Ancoli-Israel S, et al. (2012). The consensus sleep diary: Standardizing prospective sleep self-monitoring. Sleep, 35(2), 287–302. Snyder E, Cai B, DeMuro C, Morrison MF, Ball W (2018). A new single-item sleep quality scale. Journal of Clinical Sleep Medicine, 14(11), 1849–1857. DeSalvo KB, Bloser N, Reynolds K, He J, Muntner P (2006). Mortality prediction with a single general self-rated health question: A meta-analysis. Journal of General Internal Medicine, 21(3), 267–275.', array['https://doi.org/10.5271/sjweh.752', 'https://doi.org/10.5665/sleep.1642', 'https://doi.org/10.5664/jcsm.7478', 'https://doi.org/10.1111/j.1525-1497.2005.00291.x']::text[], 'Single questions on stress, sleep quality and general health track longer measures, or later health, well enough for monitoring.', 'Single sleep item r = 0.76 to 0.92 with longer scales (2018); poor against excellent self-rated health RR 1.92, 22 cohorts (2006)', 'Journal site (Elo); repository (Carney); publisher (Snyder); NCBI record (DeSalvo)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R25', 'Edmondson A (1999). Psychological safety and learning behavior in work teams. Administrative Science Quarterly, 44(2), 350–383. Frazier ML, Fainshmidt S, Klinger RL, Pezeshkan A, Vracheva V (2017). Psychological safety: A meta-analytic review and extension. Personnel Psychology, 70(1), 113–165.', array['https://doi.org/10.2307/2666999', 'https://doi.org/10.1111/peps.12183']::text[], 'Teams that feel safe to speak up learn more, which goes with better performance; the meta-analysis links psychological safety to task performance.', '51 teams (1999); 136 samples, over 22,000 people (2017)', 'Crossref and SAGE (1999); repositories (2017)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R26', 'King JA (2021). Accelerating Excellence: The Principles that Drive Elite Performance. Self-published. Part 2, "Concordance", chapter 4, "Finding Your Sweet Spot", pages 59 to 76.', array['https://www.amazon.co.uk/dp/1838334912']::text[], 'The source of the sweet spot idea used in Find my sweet spot (a practitioner book, not research).', 'n/a', 'Book''s contents page, checked by Tim on the publisher''s preview, 26 Oct 2026', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R27', 'Howard GS (1980). Response-shift bias: A problem in evaluating interventions with pre/post self-reports. Evaluation Review, 4(1), 93–106. Pratt CC, McGuigan WM, Katzev AR (2000). Measuring program outcomes: Using retrospective pretest methodology. American Journal of Evaluation, 21(3), 341–349. Hill LG, Betz DL (2005). Revisiting the retrospective pretest. American Journal of Evaluation, 26(4), 501–517.', array['https://doi.org/10.1177/0193841X8000400105', 'https://doi.org/10.1177/109821400002100305', 'https://doi.org/10.1177/1098214005281356']::text[], 'People''s idea of a rating scale can change during a programme, which a "looking back" rating can correct; but looking back brings its own bias, so both are reported.', '307 people (2000); 100 people (2005)', 'Publisher (SAGE, 1980); repositories (2000, 2005)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R28', 'Mayne J (2001). Addressing attribution through contribution analysis: Using performance measures sensibly. Canadian Journal of Program Evaluation, 16(1), 1–24. Mayne J (2012). Contribution analysis: Coming of age? Evaluation, 18(3), 270–280.', array['https://doi.org/10.3138/cjpe.016.001', 'https://doi.org/10.1177/1356389012451663']::text[], 'Steps for a credible case that a programme contributed to results, without claiming it alone caused them.', 'Methods', 'Journal site (2001); publisher (SAGE, 2012)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R32', 'Ernst MD (2004). Permutation methods: A basis for exact inference. Statistical Science, 19(4), 676–685.', array['https://doi.org/10.1214/088342304000000396']::text[], 'Shuffle tests give exact chance figures with few assumptions, provided the shuffled data are interchangeable.', 'Methods', 'Project Euclid record', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R33', 'Benjamini Y, Hochberg Y (1995). Controlling the false discovery rate: A practical and powerful approach to multiple testing. Journal of the Royal Statistical Society, Series B, 57(1), 289–300.', array['https://doi.org/10.1111/j.2517-6161.1995.tb02031.x']::text[], 'A simple way to keep the share of false finds low when many tests are run.', 'Methods', 'Published PDF; repository (Tel Aviv)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R43', 'Rafaeli-Mor E, Steinberg J (2002). Self-complexity and well-being: A review and research synthesis. Personality and Social Psychology Review, 6(1), 31–58.', array['https://doi.org/10.1207/S15327957PSPR0601_2']::text[], 'The idea that a many-sided sense of self cushions stress had little support.', 'Synthesis of many studies', 'Publisher (SAGE)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R46', 'Smither JW, London M, Reilly RR (2005). Does performance improve following multisource feedback? A theoretical model, meta-analysis, and review of empirical findings. Personnel Psychology, 58(1), 33–66.', array['https://doi.org/10.1111/j.1744-6570.2005.514_1.x']::text[], 'Ratings improved only a little after 360 feedback on average, more when people set goals and acted on it. No newer meta-analysis was found.', '24 longitudinal studies', 'Repository (Stony Brook)', date '2026-10-26', 'Claude, for Tim', '1.1'),
  ('R47', 'Hopkins WG (2000). Measures of reliability in sports medicine and science. Sports Medicine, 30(1), 1–15.', array['https://doi.org/10.2165/00007256-200030010-00001']::text[], 'The standard sports science method: a change is only real when it is bigger than the measure''s typical error between repeat tests.', 'Methods', 'Author''s PDF with journal header; repository (VU)', date '2026-10-26', 'Claude, for Tim', '1.1')
on conflict (id) do nothing;

insert into public.evidence_claims (id, area, wording, where_it_shows, strength, strength_level, sources, caveat, practitioner_model, register_version, sort_order) values
  ('C1', 'Goals, plans and tracking', 'Tracking your progress makes you more likely to reach your goals, especially when you record it or share it.', 'Sprint, dashboard, debrief, How it works', 'Moderate (close to strong)', 'moderate', 'R1', 'Effects are larger when progress is written down or shared.', false, '1.1', 1),
  ('C2', 'Goals, plans and tracking', 'Specific, demanding goals lead to better performance than vague ones.', 'Outcome Objectives, set-up', 'Strong', 'strong', 'R2', 'Very complex tasks need learning goals as well as outcome goals.', false, '1.1', 2),
  ('C3', 'Goals, plans and tracking', 'Deciding in advance "if this happens, I''ll do that" makes it more likely you''ll act when it counts.', 'Pressure plan, Plan my day''s biggest risk', 'Strong', 'strong', 'R3', 'Effects are larger when the plan is worded as a true if-then, the person is motivated and the plan is rehearsed.', false, '1.1', 3),
  ('C4', 'Goals, plans and tracking', 'Goals you pursue for your own reasons get more sustained effort and are reached more often than goals driven by pressure.', 'Goal check, Find my sweet spot', 'Moderate', 'moderate', 'R4, R5', 'Longitudinal studies, much of it with students; motivation measured by self-report.', false, '1.1', 4),
  ('C5', 'Goals, plans and tracking', 'People perform and persist better when they feel ownership, growing competence and connection.', 'How it works, organisation pitch ("agree the what, own the how")', 'Moderate', 'moderate', 'R5', 'Mostly surveys at work, so the links are associations; the portal applies the theory, not tests it.', false, '1.1', 5),
  ('C9', 'Goals, plans and tracking', 'New habits take weeks to months to become automatic, and missing a day now and then doesn''t undo them.', 'Sprint length, kind streaks, How it works', 'Early', 'early', 'R9', 'Few studies measured time to a habit, many at high risk of bias; the time varied from days to most of a year. Never say "66 days" as a rule.', false, '1.1', 6),
  ('C10', 'Goals, plans and tracking', 'Seeing progress, even small wins, keeps motivation up.', 'Small-win ticks, unplanned wins, Performance Evidence', 'Early', 'early', 'R10', 'Based on diary studies of knowledge workers, not trials.', false, '1.1', 7),
  ('C6', 'Reviewing and learning', 'Regular structured debriefs improve performance.', 'Weekly debrief, after-action review, Review my day', 'Strong', 'strong', 'R6', 'Gains are biggest when debriefs are structured and focus on what to do next time.', false, '1.1', 8),
  ('C7', 'Reviewing and learning', 'Coaching improves performance, goal attainment and wellbeing at work.', 'How it works, organisation pitch', 'Moderate', 'moderate', 'R7', 'The trials-only review found signs of publication bias, and larger effects on self-reported than on observed outcomes.', false, '1.1', 9),
  ('C8', 'Reviewing and learning', 'Questions that focus on solutions and what''s working move people towards their goals faster than questions about problems.', 'Writing rules, Get unstuck, the debrief''s "What still went well?"', 'Early', 'early', 'R8', 'A pilot and two single-session experiments, mostly with students.', false, '1.1', 10),
  ('C11', 'Hardware: the body', 'Too little sleep slows attention, reactions and thinking.', 'Check-in, Hardware explanation, sleep patterns', 'Strong', 'strong', 'R11', 'Clearest for attention and working memory, smaller for reasoning. Mostly lab studies; people often don''t notice their own decline.', false, '1.1', 11),
  ('C12', 'Hardware: the body', 'Slow, controlled breathing can help settle your body and reduce stress.', 'Breathe', 'Moderate', 'moderate', 'R12', 'Effects on stress are small; many trials at some risk of bias; evidence for any one technique is early. Slow breathing reliably raises heart rate variability, a marker of the body''s calming system.', false, '1.1', 12),
  ('C17', 'Hardware: the body', 'Switching off and recovering from work helps people sustain energy and performance.', 'Recovery, Home''s recharge question', 'Moderate', 'moderate', 'R17', 'Mostly surveys over time; some recovery training trials.', false, '1.1', 13),
  ('C18', 'Hardware: the body', 'Timing light exposure and shifting sleep before travel can reduce jet lag.', 'Travel and jet lag plan', 'Moderate (light shifts the body clock); Early (full travel plans)', 'moderate', 'R18', 'Expert reviews and an expert consensus, built mostly on lab studies; the consensus itself says field evidence is lacking. The portal gives no melatonin or medication advice.', false, '1.1', 14),
  ('C20', 'Hardware: the body', 'Adults need 7 hours of sleep or more a night.', 'Check-in scoring, "green nights"', 'Strong', 'strong', 'R20', 'A population guideline; individual need varies.', false, '1.1', 15),
  ('C21', 'Hardware: the body', 'Adults are advised at least 150 minutes of moderate activity, or 75 vigorous, a week, plus muscle strengthening on 2 or more days.', 'Check-in movement questions', 'Strong', 'strong', 'R21', 'Guidelines for health, not for performance.', false, '1.1', 16),
  ('C22', 'Hardware: the body', 'Long hours of sitting carry extra health risk, which enough activity largely offsets.', 'Check-in sitting question', 'Moderate', 'moderate', 'R22', 'From observational studies.', false, '1.1', 17),
  ('C23', 'Hardware: the body', 'The UK low-risk guideline is no more than 14 units a week, spread over 3 or more days.', 'Check-in alcohol questions and units guide', 'Strong', 'strong', 'R23', 'A UK guideline; other countries differ. The heavy-session question uses the UK version of AUDIT-C''s third question (6 units for women, 8 for men), with our own wording and time frame.', false, '1.1', 18),
  ('C24', 'Hardware: the body', 'Short, single questions can track sleep quality, stress and health reliably enough to follow change over time.', 'Check-in, Plan my day, team pulse', 'Moderate', 'moderate', 'R24', 'Validated mostly for comparing groups or in patient samples; not a substitute for full questionnaires or diagnosis. Our questions are worded our own way, so they aren''t the validated items themselves.', false, '1.1', 19),
  ('C30', 'Hardware: the body', 'Software relies on hardware being maintained, so we look after both.', 'First check-in, How it works', 'Our model, built on C11, C17, C21', 'our_model', 'R11, R17, R21', 'The links between body and decision-making are well supported; the Hardware and Software frame is Tim''s.', false, '1.1', 20),
  ('C13', 'Emotions and reflection', 'Putting a feeling into precise words can reduce its intensity.', 'Emotional wash', 'Early', 'early', 'R13', 'Mostly lab and brain-imaging studies; a 2026 review found body and brain effects fairly consistent but effects on how people feel mixed.', false, '1.1', 21),
  ('C14', 'Emotions and reflection', 'Writing about difficult experiences can help, a little.', 'Journal', 'Moderate', 'moderate', 'R14', 'Effects are small and vary.', false, '1.1', 22),
  ('C15', 'Emotions and reflection', 'Noticing what you''re grateful for can lift wellbeing, a little.', 'Plan my day', 'Moderate', 'moderate', 'R15', 'Small effects, often no better than other positive activities.', false, '1.1', 23),
  ('C16', 'Planning for risk, strengths and teams', 'Imagining a plan has already gone wrong helps people spot more reasons it could fail.', 'Pre-mortem, Pre-mortem for an initiative', 'Early', 'early', 'R16', 'The original lab study found that treating an outcome as certain produced more explanations for it; one conference study found the pre-mortem cut overconfidence in a plan more than listing pros and cons. Never quote the popular "30% better" figure: it can''t be traced.', false, '1.1', 24),
  ('C19', 'Planning for risk, strengths and teams', 'Using your strengths more at work goes with better engagement and performance.', 'Find my sweet spot', 'Moderate', 'moderate', 'R19', 'A meta-analysis found strong links between using strengths at work and performance and wellbeing, but they are associations, not proof of cause; trials of strengths exercises are fewer.', false, '1.1', 25),
  ('C25', 'Planning for risk, strengths and teams', 'Teams where people feel safe to speak up learn and perform better.', 'Team pulse, Map my team, organisation pitch', 'Moderate', 'moderate', 'R25', 'Mostly surveys; cause and effect may run both ways.', false, '1.1', 26),
  ('C26', 'Planning for risk, strengths and teams', 'People do their best work where their strengths, interests and values align.', 'Find my sweet spot', 'Our model, drawing on C4, C19', 'our_model', 'R26, R4, R19', 'James A. King''s practitioner framework (Accelerating Excellence, chapter 4, in the part he calls "Concordance"). The overlap itself hasn''t been tested.', false, '1.1', 27),
  ('C43', 'Planning for risk, strengths and teams', 'A sense of self beyond the job can cushion setbacks.', 'Identity beyond the role', 'Early', 'early', 'R43', 'The review found the link weak and inconsistent.', false, '1.1', 28),
  ('C46', 'Planning for risk, strengths and teams', 'Feedback from several colleagues helps some people improve.', '360 (later)', 'Moderate', 'moderate', 'R46', 'Average gains are small; bigger when people act on it and follow up.', false, '1.1', 29),
  ('C27', 'How the portal measures (methods)', 'Asking people at the end to rate how things were at the start allows for them changing their idea of what "good" means.', 'Before and after impact', 'Moderate', 'moderate', 'R27', 'Studies disagree on which is less biased, so both kinds of rating are reported and neither is relied on alone.', false, '1.1', 30),
  ('C28', 'How the portal measures (methods)', 'Coaching contributes to results alongside many other things; the honest claim is contribution, not sole cause.', 'Every organisation report', 'Moderate (an established evaluation approach)', 'moderate', 'R28', 'A reasoned case for contribution, not statistical proof.', false, '1.1', 31),
  ('C31', 'How the portal measures (methods)', 'The Performance score, impact weights (1, 2, 3), weighting Strategies by objectives served, and the 85% standard.', 'Sprint, dashboard, How it works', 'Our model', 'our_model', 'Methods M4 to M7', 'Sensible choices, not research findings. Said plainly.', false, '1.1', 32),
  ('C32', 'How the portal measures (methods)', 'Shuffle (permutation) tests check whether a link in someone''s own data is likely to be chance.', 'Patterns', 'Strong (method)', 'strong', 'R32', 'Assumes the shuffled data are interchangeable, which time trends break; that''s why the method removes the trend and shuffles within blocks (methods M14.4 and M14.5). Says nothing about cause.', false, '1.1', 33),
  ('C33', 'How the portal measures (methods)', 'Correcting for checking many links at once keeps false patterns rare.', 'Patterns', 'Strong (method)', 'strong', 'R33', 'Controls the share of false finds, not each one; the go-live simulation checks the real rate (methods M14.7).', false, '1.1', 34),
  ('C47', 'How the portal measures (methods)', 'A change only counts as real when it''s bigger than the measure''s usual swing from one time to the next.', 'Check-in results, What improved, M23 checks', 'Strong (method)', 'strong', 'R47', 'The swing has to be worked out from real data first (methods M13 and M23).', false, '1.1', 35),
  ('C29', 'Practitioner models (said as "our model")', 'The wheel of life', 'Life balance review', 'Our model', 'our_model', null, null, true, '1.1', 36),
  ('C35', 'Practitioner models (said as "our model")', 'GROW (Goal, Reality, Options, Will)', 'Get unstuck', 'Our model', 'our_model', null, null, true, '1.1', 37),
  ('C36', 'Practitioner models (said as "our model")', 'Above or below the line', 'Above or below the line, emotional control', 'Our model', 'our_model', null, null, true, '1.1', 38),
  ('C37', 'Practitioner models (said as "our model")', 'Deliberate vs default', 'Deliberate vs default', 'Our model (Tim''s)', 'our_model', null, null, true, '1.1', 39),
  ('C38', 'Practitioner models (said as "our model")', 'Clear decision rights (Tim''s traffic light)', 'Decide who decides', 'Our model', 'our_model', null, null, true, '1.1', 40),
  ('C39', 'Practitioner models (said as "our model")', 'Trust, alignment and autonomy', 'Map my team', 'Our model (Tim''s), drawing on C5 and C25', 'our_model', null, null, true, '1.1', 41),
  ('C40', 'Practitioner models (said as "our model")', 'Stakeholder mapping by influence and support', 'Map my stakeholders', 'Our model', 'our_model', null, null, true, '1.1', 42),
  ('C41', 'Practitioner models (said as "our model")', 'After-action review (from US Army practice)', 'After-action review', 'Strong, via C6', 'strong', null, null, true, '1.1', 43),
  ('C42', 'Practitioner models (said as "our model")', 'Sprints of about 12 weeks with Recovery between', 'Performance Sprint', 'Our model, drawing on C1, C2, C17', 'our_model', null, null, true, '1.1', 44),
  ('C44', 'Practitioner models (said as "our model")', 'Practitioner tools: Time audit, Delegation audit, difficult conversations and feedback, pitch, Strategy on a page, Points of leverage', 'Those tools', 'Our model', 'our_model', null, null, true, '1.1', 45),
  ('C45', 'Practitioner models (said as "our model")', 'Strategic importance against progress', 'Strategic Alignment Health Check', 'Our model (Tim''s)', 'our_model', null, null, true, '1.1', 46)
on conflict (id) do nothing;

insert into public.evidence_claim_references (claim_id, reference_id) values
  ('C1', 'R1'),
  ('C2', 'R2'),
  ('C3', 'R3'),
  ('C4', 'R4'),
  ('C4', 'R5'),
  ('C5', 'R5'),
  ('C9', 'R9'),
  ('C10', 'R10'),
  ('C6', 'R6'),
  ('C7', 'R7'),
  ('C8', 'R8'),
  ('C11', 'R11'),
  ('C12', 'R12'),
  ('C17', 'R17'),
  ('C18', 'R18'),
  ('C20', 'R20'),
  ('C21', 'R21'),
  ('C22', 'R22'),
  ('C23', 'R23'),
  ('C24', 'R24'),
  ('C30', 'R11'),
  ('C30', 'R17'),
  ('C30', 'R21'),
  ('C13', 'R13'),
  ('C14', 'R14'),
  ('C15', 'R15'),
  ('C16', 'R16'),
  ('C19', 'R19'),
  ('C25', 'R25'),
  ('C26', 'R26'),
  ('C26', 'R4'),
  ('C26', 'R19'),
  ('C43', 'R43'),
  ('C46', 'R46'),
  ('C27', 'R27'),
  ('C28', 'R28'),
  ('C32', 'R32'),
  ('C33', 'R33'),
  ('C47', 'R47')
on conflict do nothing;

insert into public.evidence_tools (key, name, based_on, claims, strength, strength_level, flagged, register_version, sort_order) values
  ('individual_performance_plan', 'Individual Performance Plan', 'Mission, Outcome Objectives, Strategies, Tactics (Tim''s OST method); specific, challenging goals', 'C2, C1, C31', 'Moderate (goals: strong; the four-layer structure: our model)', 'moderate', false, '1.1', 1),
  ('performance_sprint', 'Performance Sprint', 'Short goal cycles with weekly tracking and a Recovery between sprints', 'C1, C2, C9, C17, C42', 'Moderate', 'moderate', false, '1.1', 2),
  ('weekly_performance_debrief', 'Weekly performance debrief', 'Structured debriefs; tracking progress', 'C6, C1', 'Strong', 'strong', false, '1.1', 3),
  ('plan_my_day', 'Plan my day', 'If-then planning; small next steps; sleep tracking with a standard sleep diary item; gratitude', 'C3, C10, C24, C15', 'Moderate', 'moderate', false, '1.1', 4),
  ('review_my_day', 'Review my day', 'Debriefs; progress and small wins', 'C6, C10', 'Moderate', 'moderate', false, '1.1', 5),
  ('individual_performance_dashboard', 'Individual Performance Dashboard', 'Tracking progress; patterns from the person''s own data', 'C1, C32, C33', 'Moderate (tracking); the pattern method is strong, but a finding is only one person''s link', 'moderate', false, '1.1', 6),
  ('hardware_and_software_check_in', 'Hardware and Software check-in', 'Plain single questions informed by validated measures and public guidelines', 'C11, C20 to C24, C30, C47', 'Moderate', 'moderate', false, '1.1', 7),
  ('recovery', 'Recovery', 'Recovery from work demands', 'C17', 'Moderate', 'moderate', false, '1.1', 8),
  ('find_my_sweet_spot', 'Find my sweet spot', 'Strengths use; self-concordance; James A. King''s sweet spot', 'C19, C4, C26', 'Moderate (strengths and self-concordance); the Venn itself: our model', 'moderate', true, '1.1', 9),
  ('understand_their_sweet_spot', 'Understand their sweet spot', 'As above, used by a boss to shape a role', 'C19, C26', 'Early', 'early', true, '1.1', 10),
  ('get_unstuck', 'Get unstuck (GROW)', 'The GROW coaching model; solution-focused questions', 'C35, C8, C7', 'Our model (GROW has little direct evidence of its own; coaching overall: moderate)', 'our_model', true, '1.1', 11),
  ('pre_mortem', 'Pre-mortem', 'Imagining the plan has already gone wrong (prospective hindsight)', 'C16', 'Early', 'early', true, '1.1', 12),
  ('pre_mortem_for_an_initiative', 'Pre-mortem for an initiative', 'As above, for a team', 'C16', 'Early', 'early', true, '1.1', 13),
  ('pressure_plan', 'Pressure plan', 'If-then plans for a high-pressure moment', 'C3', 'Strong', 'strong', false, '1.1', 14),
  ('breathe', 'Breathe', 'Slow, controlled breathing', 'C12', 'Moderate', 'moderate', false, '1.1', 15),
  ('emotional_wash', 'Emotional wash', 'Naming an emotion precisely', 'C13', 'Early', 'early', true, '1.1', 16),
  ('journal', 'Journal', 'Expressive writing', 'C14', 'Moderate (effects small)', 'moderate', false, '1.1', 17),
  ('identity_beyond_the_role', 'Identity beyond the role', 'Self-complexity and identity research', 'C43', 'Early', 'early', true, '1.1', 18),
  ('deliberate_vs_default', 'Deliberate vs default', 'Tim''s model', 'C37', 'Our model', 'our_model', true, '1.1', 19),
  ('above_or_below_the_line', 'Above or below the line', 'Ownership and responsibility model from leadership practice', 'C36', 'Our model', 'our_model', true, '1.1', 20),
  ('after_action_review', 'After-action review', 'Structured debriefs (from US Army practice)', 'C6, C41', 'Strong', 'strong', false, '1.1', 21),
  ('life_balance_review', 'Life balance review', 'The wheel of life, a coaching practice tool', 'C29', 'Our model', 'our_model', true, '1.1', 22),
  ('performance_evidence', 'Performance Evidence', 'Recalling progress and past successes', 'C10', 'Early', 'early', true, '1.1', 23),
  ('travel_and_jet_lag_plan', 'Travel and jet lag plan', 'Circadian science: timed light, shifting sleep before travel', 'C18', 'Moderate (light shifts the body clock); early (full travel plans)', 'moderate', false, '1.1', 24),
  ('time_audit_and_delegation_audit', 'Time audit and Delegation audit', 'Practitioner tools', 'C44', 'Our model', 'our_model', true, '1.1', 25),
  ('meeting_planner', 'Meeting planner', 'Clear outcomes and agendas; debriefs after', 'C2, C6', 'Moderate', 'moderate', false, '1.1', 26),
  ('prepare_for_a_difficult_conversation_give_difficult_feedback', 'Prepare for a difficult conversation, Give difficult feedback', 'Practitioner models of perspective-taking and feedback', 'C44', 'Our model', 'our_model', true, '1.1', 27),
  ('prepare_for_a_pitch', 'Prepare for a pitch', 'Practitioner model; then a Pressure plan', 'C44, C3', 'Our model', 'our_model', true, '1.1', 28),
  ('map_my_stakeholders', 'Map my stakeholders', 'Stakeholder mapping, a management practice tool', 'C40', 'Our model', 'our_model', true, '1.1', 29),
  ('map_my_team', 'Map my team (trust, alignment, autonomy)', 'Psychological safety and autonomy research; Tim''s framework', 'C25, C5, C39', 'Early', 'early', true, '1.1', 30),
  ('decide_who_decides', 'Decide who decides', 'Clear decision rights (Tim''s traffic light)', 'C38', 'Our model', 'our_model', true, '1.1', 31),
  ('strategic_alignment_health_check', 'Strategic Alignment Health Check', 'Tim''s model of strategic importance against progress', 'C45', 'Our model', 'our_model', true, '1.1', 32),
  ('strategy_on_a_page', 'Strategy on a page', 'Practitioner tool', 'C44', 'Our model', 'our_model', true, '1.1', 33),
  ('points_of_leverage', 'Points of leverage', 'Practitioner tool', 'C44', 'Our model', 'our_model', true, '1.1', 34),
  ('team_pulse', 'Team pulse', 'Short repeated pulse questions; psychological safety and support', 'C25, C24', 'Moderate (team climate links to performance); the five questions: our model', 'moderate', true, '1.1', 35),
  ('360_feedback', '360 feedback (later)', 'Multi-rater feedback for development', 'C46', 'Moderate', 'moderate', false, '1.1', 36),
  ('before_and_after_impact', 'Before and after impact', 'Ratings by others at the start and end, with a "looking back" rating', 'C27, C28', 'Moderate (the method); no comparison group', 'moderate', false, '1.1', 37)
on conflict (key) do nothing;

insert into public.evidence_tool_claims (tool_key, claim_id) values
  ('individual_performance_plan', 'C2'),
  ('individual_performance_plan', 'C1'),
  ('individual_performance_plan', 'C31'),
  ('performance_sprint', 'C1'),
  ('performance_sprint', 'C2'),
  ('performance_sprint', 'C9'),
  ('performance_sprint', 'C17'),
  ('performance_sprint', 'C42'),
  ('weekly_performance_debrief', 'C6'),
  ('weekly_performance_debrief', 'C1'),
  ('plan_my_day', 'C3'),
  ('plan_my_day', 'C10'),
  ('plan_my_day', 'C24'),
  ('plan_my_day', 'C15'),
  ('review_my_day', 'C6'),
  ('review_my_day', 'C10'),
  ('individual_performance_dashboard', 'C1'),
  ('individual_performance_dashboard', 'C32'),
  ('individual_performance_dashboard', 'C33'),
  ('hardware_and_software_check_in', 'C11'),
  ('hardware_and_software_check_in', 'C20'),
  ('hardware_and_software_check_in', 'C21'),
  ('hardware_and_software_check_in', 'C22'),
  ('hardware_and_software_check_in', 'C23'),
  ('hardware_and_software_check_in', 'C24'),
  ('hardware_and_software_check_in', 'C30'),
  ('hardware_and_software_check_in', 'C47'),
  ('recovery', 'C17'),
  ('find_my_sweet_spot', 'C19'),
  ('find_my_sweet_spot', 'C4'),
  ('find_my_sweet_spot', 'C26'),
  ('understand_their_sweet_spot', 'C19'),
  ('understand_their_sweet_spot', 'C26'),
  ('get_unstuck', 'C35'),
  ('get_unstuck', 'C8'),
  ('get_unstuck', 'C7'),
  ('pre_mortem', 'C16'),
  ('pre_mortem_for_an_initiative', 'C16'),
  ('pressure_plan', 'C3'),
  ('breathe', 'C12'),
  ('emotional_wash', 'C13'),
  ('journal', 'C14'),
  ('identity_beyond_the_role', 'C43'),
  ('deliberate_vs_default', 'C37'),
  ('above_or_below_the_line', 'C36'),
  ('after_action_review', 'C6'),
  ('after_action_review', 'C41'),
  ('life_balance_review', 'C29'),
  ('performance_evidence', 'C10'),
  ('travel_and_jet_lag_plan', 'C18'),
  ('time_audit_and_delegation_audit', 'C44'),
  ('meeting_planner', 'C2'),
  ('meeting_planner', 'C6'),
  ('prepare_for_a_difficult_conversation_give_difficult_feedback', 'C44'),
  ('prepare_for_a_pitch', 'C44'),
  ('prepare_for_a_pitch', 'C3'),
  ('map_my_stakeholders', 'C40'),
  ('map_my_team', 'C25'),
  ('map_my_team', 'C5'),
  ('map_my_team', 'C39'),
  ('decide_who_decides', 'C38'),
  ('strategic_alignment_health_check', 'C45'),
  ('strategy_on_a_page', 'C44'),
  ('points_of_leverage', 'C44'),
  ('team_pulse', 'C25'),
  ('team_pulse', 'C24'),
  ('360_feedback', 'C46'),
  ('before_and_after_impact', 'C27'),
  ('before_and_after_impact', 'C28')
on conflict do nothing;

select public.record_migration(31, '031_evidence_library');
