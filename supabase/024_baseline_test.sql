-- =============================================================================
-- 024_baseline_test.sql
-- Checks a database matches the baseline in 024_baseline_live_structure.sql
--
-- WHAT IT DOES
--   One read-only query: it changes nothing and can be run on test or live at
--   any time. It compares every table, column, default, constraint, index,
--   security rule, function, trigger and the two extensions the functions use
--   with the baseline, and shows one line per result:
--     DIFFERENCE: ...   something in the baseline is missing or not the same
--     NOTE: ...         something from a later migration, or not in the
--                       baseline at all (worth a look, but not a failure)
--   The last line is "ALL CHECKS PASSED" when nothing is missing or
--   different, or "N DIFFERENCES FOUND" otherwise.
--
--   Functions are compared by a fingerprint (md5) of their full definition.
--   Grants are not compared: the test project's grants come from how its copy
--   was made, so they don't show live's (see the Phase 1 step 2 notes).
--
-- RUN ORDER: 024 first (or on its own, to see whether a database matches).
-- =============================================================================

with
expected (kind, key, val) as (values
    ('column', 'alignment_sessions.access_code_hash', 'text not null'),
    ('column', 'alignment_sessions.client_label', 'text not null'),
    ('column', 'alignment_sessions.completed_at', 'timestamp with time zone'),
    ('column', 'alignment_sessions.created_at', 'timestamp with time zone not null default now()'),
    ('column', 'alignment_sessions.created_by', 'text'),
    ('column', 'alignment_sessions.current_step', 'jsonb'),
    ('column', 'alignment_sessions.data', 'jsonb not null default ''{}''::jsonb'),
    ('column', 'alignment_sessions.failed_attempts', 'integer not null default 0'),
    ('column', 'alignment_sessions.id', 'uuid not null default gen_random_uuid()'),
    ('column', 'alignment_sessions.link_disabled', 'boolean not null default false'),
    ('column', 'alignment_sessions.link_emails', 'jsonb not null default ''[]''::jsonb'),
    ('column', 'alignment_sessions.locked_until', 'timestamp with time zone'),
    ('column', 'alignment_sessions.notified_at', 'timestamp with time zone'),
    ('column', 'alignment_sessions.respondent_email', 'text not null'),
    ('column', 'alignment_sessions.status', 'text not null default ''invited''::text'),
    ('column', 'alignment_sessions.token', 'text not null'),
    ('column', 'alignment_sessions.updated_at', 'timestamp with time zone not null default now()'),
    ('column', 'alignment_sessions.user_id', 'uuid'),
    ('column', 'alignment_sessions.version', 'integer not null default 0'),
    ('column', 'breathing_sessions.breathing_mode', 'text not null'),
    ('column', 'breathing_sessions.created_at', 'timestamp with time zone default now()'),
    ('column', 'breathing_sessions.date', 'timestamp with time zone default now()'),
    ('column', 'breathing_sessions.duration', 'integer not null default 0'),
    ('column', 'breathing_sessions.id', 'uuid not null default gen_random_uuid()'),
    ('column', 'breathing_sessions.updated_at', 'timestamp with time zone default now()'),
    ('column', 'breathing_sessions.user_id', 'uuid not null'),
    ('column', 'daily_journals.body', 'jsonb not null default ''[]''::jsonb'),
    ('column', 'daily_journals.body_text', 'text'),
    ('column', 'daily_journals.created_at', 'timestamp with time zone default now()'),
    ('column', 'daily_journals.id', 'uuid not null default gen_random_uuid()'),
    ('column', 'daily_journals.journal_date', 'date not null'),
    ('column', 'daily_journals.status', 'text not null default ''draft''::text'),
    ('column', 'daily_journals.updated_at', 'timestamp with time zone default now()'),
    ('column', 'daily_journals.user_id', 'uuid not null'),
    ('column', 'decisions.created_at', 'timestamp without time zone default now()'),
    ('column', 'decisions.draft', 'boolean default false'),
    ('column', 'decisions.form_data', 'jsonb'),
    ('column', 'decisions.id', 'uuid not null default gen_random_uuid()'),
    ('column', 'decisions.status', 'text default ''draft''::text'),
    ('column', 'decisions.title', 'text'),
    ('column', 'decisions.tool_type', 'text'),
    ('column', 'decisions.updated_at', 'timestamp without time zone default now()'),
    ('column', 'decisions.user_id', 'uuid not null'),
    ('column', 'guest_sessions.created_at', 'timestamp without time zone default now()'),
    ('column', 'guest_sessions.form_data', 'jsonb'),
    ('column', 'guest_sessions.session_id', 'text not null'),
    ('column', 'guest_sessions.updated_at', 'timestamp without time zone default now()'),
    ('column', 'journal_entries.content', 'text not null'),
    ('column', 'journal_entries.created_at', 'timestamp with time zone default now()'),
    ('column', 'journal_entries.entry_date', 'date not null'),
    ('column', 'journal_entries.id', 'uuid not null default gen_random_uuid()'),
    ('column', 'journal_entries.review_type', 'text not null'),
    ('column', 'journal_entries.status', 'text not null default ''final''::text'),
    ('column', 'journal_entries.title', 'text'),
    ('column', 'journal_entries.updated_at', 'timestamp with time zone default now()'),
    ('column', 'journal_entries.user_id', 'uuid not null'),
    ('column', 'mission_progress_reviews.created_at', 'timestamp with time zone default now()'),
    ('column', 'mission_progress_reviews.id', 'uuid not null default gen_random_uuid()'),
    ('column', 'mission_progress_reviews.mission_id', 'uuid not null'),
    ('column', 'mission_progress_reviews.plan_version_id', 'uuid'),
    ('column', 'mission_progress_reviews.review_data', 'jsonb not null default ''{}''::jsonb'),
    ('column', 'mission_progress_reviews.status', 'text not null default ''final''::text'),
    ('column', 'mission_progress_reviews.updated_at', 'timestamp with time zone default now()'),
    ('column', 'mission_progress_reviews.user_id', 'uuid not null'),
    ('column', 'mission_versions.change_note', 'text not null'),
    ('column', 'mission_versions.change_type', 'text not null'),
    ('column', 'mission_versions.created_at', 'timestamp with time zone not null default now()'),
    ('column', 'mission_versions.id', 'uuid not null default gen_random_uuid()'),
    ('column', 'mission_versions.major', 'integer not null'),
    ('column', 'mission_versions.minor', 'integer not null default 0'),
    ('column', 'mission_versions.mission_id', 'uuid not null'),
    ('column', 'mission_versions.restored_from', 'uuid'),
    ('column', 'mission_versions.snapshot', 'jsonb not null'),
    ('column', 'mission_versions.user_id', 'uuid not null'),
    ('column', 'missions.archived_at', 'timestamp with time zone'),
    ('column', 'missions.created_at', 'timestamp with time zone default now()'),
    ('column', 'missions.id', 'uuid not null default gen_random_uuid()'),
    ('column', 'missions.title', 'text not null'),
    ('column', 'missions.updated_at', 'timestamp with time zone default now()'),
    ('column', 'missions.user_id', 'uuid not null'),
    ('column', 'plans.created_at', 'timestamp without time zone default now()'),
    ('column', 'plans.form_data', 'jsonb'),
    ('column', 'plans.id', 'uuid not null default gen_random_uuid()'),
    ('column', 'plans.name', 'text'),
    ('column', 'plans.progress_percent', 'integer default 0'),
    ('column', 'plans.status', 'text default ''in_progress''::text'),
    ('column', 'plans.type', 'text'),
    ('column', 'plans.updated_at', 'timestamp without time zone default now()'),
    ('column', 'plans.user_id', 'uuid not null'),
    ('column', 'profiles.breathing_settings', 'jsonb default ''{"sound": false, "cycles": 5, "duration": 5}''::jsonb'),
    ('column', 'profiles.created_at', 'timestamp without time zone default now()'),
    ('column', 'profiles.email', 'text'),
    ('column', 'profiles.first_name', 'text'),
    ('column', 'profiles.goal_visibility', 'jsonb default ''{}''::jsonb'),
    ('column', 'profiles.id', 'uuid not null'),
    ('column', 'profiles.last_breathing_guide_shown', 'timestamp without time zone'),
    ('column', 'profiles.last_name', 'text'),
    ('column', 'profiles.organisation', 'text'),
    ('column', 'profiles.personal_goal', 'text'),
    ('column', 'profiles.role', 'text'),
    ('column', 'profiles.show_mission_in_header', 'boolean default true'),
    ('column', 'profiles.terms_accepted', 'boolean default false'),
    ('column', 'profiles.updated_at', 'timestamp without time zone default now()'),
    ('column', 'reflections.content', 'text'),
    ('column', 'reflections.created_at', 'timestamp without time zone default now()'),
    ('column', 'reflections.id', 'uuid not null default gen_random_uuid()'),
    ('column', 'reflections.linked_decision_id', 'uuid'),
    ('column', 'reflections.title', 'text'),
    ('column', 'reflections.updated_at', 'timestamp without time zone default now()'),
    ('column', 'reflections.user_id', 'uuid not null'),
    ('column', 'strategic_alignments.created_at', 'timestamp without time zone default now()'),
    ('column', 'strategic_alignments.form_data', 'jsonb'),
    ('column', 'strategic_alignments.id', 'uuid not null default gen_random_uuid()'),
    ('column', 'strategic_alignments.status', 'text default ''draft''::text'),
    ('column', 'strategic_alignments.title', 'text'),
    ('column', 'strategic_alignments.updated_at', 'timestamp without time zone default now()'),
    ('column', 'strategic_alignments.user_id', 'uuid not null'),
    ('column', 'strategies.created_at', 'timestamp with time zone default now()'),
    ('column', 'strategies.description', 'text'),
    ('column', 'strategies.id', 'uuid not null default gen_random_uuid()'),
    ('column', 'strategies.mission_id', 'uuid not null'),
    ('column', 'strategies.name', 'text not null'),
    ('column', 'strategies.sort_order', 'integer default 0'),
    ('column', 'strategies.updated_at', 'timestamp with time zone default now()'),
    ('column', 'tactics.action', 'text not null'),
    ('column', 'tactics.created_at', 'timestamp with time zone default now()'),
    ('column', 'tactics.current_value', 'numeric'),
    ('column', 'tactics.id', 'uuid not null default gen_random_uuid()'),
    ('column', 'tactics.is_done', 'boolean default false'),
    ('column', 'tactics.last_reviewed_at', 'timestamp with time zone'),
    ('column', 'tactics.sort_order', 'integer default 0'),
    ('column', 'tactics.strategy_id', 'uuid not null'),
    ('column', 'tactics.target_value', 'numeric'),
    ('column', 'tactics.type', 'text not null'),
    ('column', 'tactics.unit', 'text'),
    ('column', 'tactics.updated_at', 'timestamp with time zone default now()'),
    ('column', 'wheel_of_life_areas.active', 'boolean not null default true'),
    ('column', 'wheel_of_life_areas.area_key', 'text not null'),
    ('column', 'wheel_of_life_areas.created_at', 'timestamp with time zone not null default now()'),
    ('column', 'wheel_of_life_areas.id', 'uuid not null default gen_random_uuid()'),
    ('column', 'wheel_of_life_areas.kind', 'text not null'),
    ('column', 'wheel_of_life_areas.label', 'text'),
    ('column', 'wheel_of_life_areas.sort_order', 'integer not null default 0'),
    ('column', 'wheel_of_life_areas.target', 'smallint'),
    ('column', 'wheel_of_life_areas.target_updated_at', 'timestamp with time zone'),
    ('column', 'wheel_of_life_areas.updated_at', 'timestamp with time zone not null default now()'),
    ('column', 'wheel_of_life_areas.user_id', 'uuid not null'),
    ('column', 'wheel_of_life_checkins.areas', 'jsonb not null'),
    ('column', 'wheel_of_life_checkins.checkin_at', 'timestamp with time zone not null default now()'),
    ('column', 'wheel_of_life_checkins.checkin_date', 'date not null'),
    ('column', 'wheel_of_life_checkins.created_at', 'timestamp with time zone not null default now()'),
    ('column', 'wheel_of_life_checkins.focus_area_key', 'text'),
    ('column', 'wheel_of_life_checkins.focus_note', 'text'),
    ('column', 'wheel_of_life_checkins.id', 'uuid not null default gen_random_uuid()'),
    ('column', 'wheel_of_life_checkins.notes', 'jsonb not null default ''{}''::jsonb'),
    ('column', 'wheel_of_life_checkins.scores', 'jsonb not null'),
    ('column', 'wheel_of_life_checkins.user_id', 'uuid not null'),
    ('column', 'wheel_of_life_settings.chart_style', 'text not null default ''sectional''::text'),
    ('column', 'wheel_of_life_settings.updated_at', 'timestamp with time zone not null default now()'),
    ('column', 'wheel_of_life_settings.user_id', 'uuid not null'),
    ('column note', 'profiles.breathing_settings', 'User breathing guide 
  preferences (cycles, duration, sound)'),
    ('column note', 'profiles.goal_visibility', 'Which goals are visible to 
  user (JSON object)'),
    ('column note', 'profiles.last_breathing_guide_shown', 'Timestamp of 
  when breathing guide was last displayed to user'),
    ('column note', 'profiles.personal_goal', 'User''s personal goal/purpose displayed in header'),
    ('column note', 'profiles.show_mission_in_header', 'Whether to display the mission statement in the page 
  header'),
    ('column note', 'profiles.terms_accepted', 'Whether user has accepted 
  terms of service'),
    ('constraint', 'alignment_sessions.alignment_sessions_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'alignment_sessions.alignment_sessions_respondent_email_check', 'CHECK ((respondent_email = lower(btrim(respondent_email))))'),
    ('constraint', 'alignment_sessions.alignment_sessions_status_check', 'CHECK ((status = ANY (ARRAY[''invited''::text, ''in_progress''::text, ''complete''::text])))'),
    ('constraint', 'alignment_sessions.alignment_sessions_token_key', 'UNIQUE (token)'),
    ('constraint', 'alignment_sessions.alignment_sessions_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL'),
    ('constraint', 'breathing_sessions.breathing_sessions_breathing_mode_check', 'CHECK ((breathing_mode = ANY (ARRAY[''vagal''::text, ''box''::text, ''sigh''::text])))'),
    ('constraint', 'breathing_sessions.breathing_sessions_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'breathing_sessions.breathing_sessions_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('constraint', 'daily_journals.daily_journals_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'daily_journals.daily_journals_status_check', 'CHECK ((status = ANY (ARRAY[''draft''::text, ''final''::text])))'),
    ('constraint', 'daily_journals.daily_journals_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('constraint', 'daily_journals.daily_journals_user_id_journal_date_key', 'UNIQUE (user_id, journal_date)'),
    ('constraint', 'decisions.decisions_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'decisions.decisions_tool_type_check', 'CHECK ((tool_type = ANY (ARRAY[''grow''::text, ''inversion''::text, ''tough-conversation''::text, ''strategic-alignment''::text, ''if_then_planning''::text, ''daily_plan''::text, ''plan_meeting''::text, ''stop_doing_audit''::text])))'),
    ('constraint', 'decisions.decisions_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE'),
    ('constraint', 'guest_sessions.guest_sessions_pkey', 'PRIMARY KEY (session_id)'),
    ('constraint', 'journal_entries.journal_entries_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'journal_entries.journal_entries_review_type_check', 'CHECK ((review_type = ANY (ARRAY[''after-action''::text, ''progress''::text, ''weekly-momentum''::text, ''plan-review''::text])))'),
    ('constraint', 'journal_entries.journal_entries_status_check', 'CHECK ((status = ANY (ARRAY[''final''::text, ''draft''::text])))'),
    ('constraint', 'journal_entries.journal_entries_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('constraint', 'mission_progress_reviews.mission_progress_reviews_mission_id_fkey', 'FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE'),
    ('constraint', 'mission_progress_reviews.mission_progress_reviews_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'mission_progress_reviews.mission_progress_reviews_plan_version_id_fkey', 'FOREIGN KEY (plan_version_id) REFERENCES mission_versions(id) ON DELETE SET NULL'),
    ('constraint', 'mission_progress_reviews.mission_progress_reviews_status_check', 'CHECK ((status = ANY (ARRAY[''final''::text, ''draft''::text])))'),
    ('constraint', 'mission_progress_reviews.mission_progress_reviews_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('constraint', 'mission_versions.mission_versions_change_type_check', 'CHECK ((change_type = ANY (ARRAY[''start''::text, ''major''::text, ''minor''::text, ''restore''::text])))'),
    ('constraint', 'mission_versions.mission_versions_mission_id_fkey', 'FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE'),
    ('constraint', 'mission_versions.mission_versions_mission_id_major_minor_key', 'UNIQUE (mission_id, major, minor)'),
    ('constraint', 'mission_versions.mission_versions_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'mission_versions.mission_versions_restored_from_fkey', 'FOREIGN KEY (restored_from) REFERENCES mission_versions(id)'),
    ('constraint', 'mission_versions.mission_versions_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('constraint', 'missions.missions_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'missions.missions_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('constraint', 'plans.plans_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'plans.plans_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE'),
    ('constraint', 'profiles.profiles_id_fkey', 'FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('constraint', 'profiles.profiles_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'reflections.reflections_linked_decision_id_fkey', 'FOREIGN KEY (linked_decision_id) REFERENCES decisions(id) ON DELETE SET NULL'),
    ('constraint', 'reflections.reflections_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'reflections.reflections_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE'),
    ('constraint', 'strategic_alignments.strategic_alignments_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'strategic_alignments.strategic_alignments_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE'),
    ('constraint', 'strategies.strategies_mission_id_fkey', 'FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE'),
    ('constraint', 'strategies.strategies_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'tactics.tactics_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'tactics.tactics_strategy_id_fkey', 'FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE'),
    ('constraint', 'tactics.tactics_type_check', 'CHECK ((type = ANY (ARRAY[''tickable''::text, ''measurable''::text])))'),
    ('constraint', 'wheel_of_life_areas.wheel_of_life_areas_key_check', 'CHECK ((((kind = ''standard''::text) AND (area_key = ANY (ARRAY[''career''::text, ''financial''::text, ''health''::text, ''relationships''::text, ''romance''::text, ''growth''::text, ''fun''::text, ''home''::text, ''contribution''::text, ''meaning''::text]))) OR ((kind = ''own''::text) AND (area_key ~~ ''own\_%''::text) AND (char_length(area_key) <= 60))))'),
    ('constraint', 'wheel_of_life_areas.wheel_of_life_areas_kind_check', 'CHECK ((kind = ANY (ARRAY[''standard''::text, ''own''::text])))'),
    ('constraint', 'wheel_of_life_areas.wheel_of_life_areas_label_check', 'CHECK ((((kind = ''standard''::text) AND (label IS NULL)) OR ((kind = ''own''::text) AND (label IS NOT NULL) AND ((char_length(btrim(label)) >= 1) AND (char_length(btrim(label)) <= 24)))))'),
    ('constraint', 'wheel_of_life_areas.wheel_of_life_areas_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'wheel_of_life_areas.wheel_of_life_areas_target_check', 'CHECK (((target >= 0) AND (target <= 10)))'),
    ('constraint', 'wheel_of_life_areas.wheel_of_life_areas_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('constraint', 'wheel_of_life_areas.wheel_of_life_areas_user_key', 'UNIQUE (user_id, area_key)'),
    ('constraint', 'wheel_of_life_checkins.wheel_of_life_checkins_focus_key_check', 'CHECK (((focus_area_key IS NULL) OR (scores ? focus_area_key)))'),
    ('constraint', 'wheel_of_life_checkins.wheel_of_life_checkins_focus_note_check', 'CHECK (((focus_note IS NULL) OR (char_length(focus_note) <= 500)))'),
    ('constraint', 'wheel_of_life_checkins.wheel_of_life_checkins_pkey', 'PRIMARY KEY (id)'),
    ('constraint', 'wheel_of_life_checkins.wheel_of_life_checkins_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('constraint', 'wheel_of_life_checkins.wheel_of_life_checkins_valid', 'CHECK (wheel_of_life_checkin_valid(scores, notes, areas))'),
    ('constraint', 'wheel_of_life_settings.wheel_of_life_settings_chart_style_check', 'CHECK ((chart_style = ANY (ARRAY[''sectional''::text, ''radar''::text, ''delta''::text])))'),
    ('constraint', 'wheel_of_life_settings.wheel_of_life_settings_pkey', 'PRIMARY KEY (user_id)'),
    ('constraint', 'wheel_of_life_settings.wheel_of_life_settings_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
    ('extension', 'pgcrypto', 'in schema extensions'),
    ('extension', 'uuid-ossp', 'in schema extensions'),
    ('function', '_alignment_auth(text,text,text)', 'af5d004bb8e86615c1f52fc68aebad5f'),
    ('function', '_alignment_validate(jsonb)', '23ead43d19f3886f08485fac49a9b796'),
    ('function', 'alignment_disable(text)', '6045f7885f0c29bb46c82f25e9a118a7'),
    ('function', 'alignment_email_check(text,text,text,text)', '8ca614de144555dcb23e710239bec9f7'),
    ('function', 'alignment_email_failed(text,text,text,text)', '7e9c3d3537f35b1a7a10790843c4580b'),
    ('function', 'alignment_list()', 'e2eb7d7f00f5524701e5e212a5ee33f4'),
    ('function', 'alignment_open(text,text,text)', '509e72cb9548fac661450fc92486f620'),
    ('function', 'alignment_save(text,text,text,jsonb,jsonb,integer,boolean)', 'b90b6c3cc840cbe65d800c4e4bf73a81'),
    ('function', 'create_alignment_session(text,text)', '9601661036d787172182481d36b7bc8d'),
    ('function', 'create_profile_on_signup()', '84d7a9f6af1687bb75b5a9c8b0388ca8'),
    ('function', 'update_updated_at()', '4529872e9cf2a42b7c4ff9a4855225ea'),
    ('function', 'wheel_of_life_checkin_valid(jsonb,jsonb,jsonb)', 'd106906d1877841ecbaf18dd33f160ec'),
    ('function', 'wheel_of_life_touch()', '7fe3580d15f84ede49d7f4cdca68a2b2'),
    ('index', 'breathing_sessions.idx_breathing_sessions_date', 'CREATE INDEX idx_breathing_sessions_date ON public.breathing_sessions USING btree (date)'),
    ('index', 'breathing_sessions.idx_breathing_sessions_user_id', 'CREATE INDEX idx_breathing_sessions_user_id ON public.breathing_sessions USING btree (user_id)'),
    ('index', 'daily_journals.idx_daily_journals_user_date', 'CREATE INDEX idx_daily_journals_user_date ON public.daily_journals USING btree (user_id, journal_date DESC)'),
    ('index', 'decisions.idx_decisions_created_at', 'CREATE INDEX idx_decisions_created_at ON public.decisions USING btree (created_at DESC)'),
    ('index', 'decisions.idx_decisions_user_id', 'CREATE INDEX idx_decisions_user_id ON public.decisions USING btree (user_id)'),
    ('index', 'journal_entries.idx_journal_entries_created_at', 'CREATE INDEX idx_journal_entries_created_at ON public.journal_entries USING btree (created_at DESC)'),
    ('index', 'journal_entries.idx_journal_entries_entry_date', 'CREATE INDEX idx_journal_entries_entry_date ON public.journal_entries USING btree (entry_date DESC)'),
    ('index', 'journal_entries.idx_journal_entries_status', 'CREATE INDEX idx_journal_entries_status ON public.journal_entries USING btree (user_id, review_type, status)'),
    ('index', 'journal_entries.idx_journal_entries_user_id', 'CREATE INDEX idx_journal_entries_user_id ON public.journal_entries USING btree (user_id)'),
    ('index', 'mission_progress_reviews.idx_mission_progress_reviews_created_at', 'CREATE INDEX idx_mission_progress_reviews_created_at ON public.mission_progress_reviews USING btree (created_at DESC)'),
    ('index', 'mission_progress_reviews.idx_mission_progress_reviews_mission_id', 'CREATE INDEX idx_mission_progress_reviews_mission_id ON public.mission_progress_reviews USING btree (mission_id)'),
    ('index', 'mission_progress_reviews.idx_mission_progress_reviews_plan_version_id', 'CREATE INDEX idx_mission_progress_reviews_plan_version_id ON public.mission_progress_reviews USING btree (plan_version_id)'),
    ('index', 'mission_progress_reviews.idx_mission_progress_reviews_user_id', 'CREATE INDEX idx_mission_progress_reviews_user_id ON public.mission_progress_reviews USING btree (user_id)'),
    ('index', 'mission_versions.idx_mission_versions_mission_major_minor', 'CREATE INDEX idx_mission_versions_mission_major_minor ON public.mission_versions USING btree (mission_id, major DESC, minor DESC)'),
    ('index', 'missions.idx_missions_archived_at', 'CREATE INDEX idx_missions_archived_at ON public.missions USING btree (archived_at)'),
    ('index', 'missions.idx_missions_user_id', 'CREATE INDEX idx_missions_user_id ON public.missions USING btree (user_id)'),
    ('index', 'reflections.idx_reflections_created_at', 'CREATE INDEX idx_reflections_created_at ON public.reflections USING btree (created_at DESC)'),
    ('index', 'reflections.idx_reflections_user_id', 'CREATE INDEX idx_reflections_user_id ON public.reflections USING btree (user_id)'),
    ('index', 'strategic_alignments.idx_strategic_alignments_created_at', 'CREATE INDEX idx_strategic_alignments_created_at ON public.strategic_alignments USING btree (created_at DESC)'),
    ('index', 'strategic_alignments.idx_strategic_alignments_user_id', 'CREATE INDEX idx_strategic_alignments_user_id ON public.strategic_alignments USING btree (user_id)'),
    ('index', 'strategies.idx_strategies_mission_id', 'CREATE INDEX idx_strategies_mission_id ON public.strategies USING btree (mission_id)'),
    ('index', 'tactics.idx_tactics_strategy_id', 'CREATE INDEX idx_tactics_strategy_id ON public.tactics USING btree (strategy_id)'),
    ('index', 'wheel_of_life_areas.idx_wheel_of_life_areas_user', 'CREATE INDEX idx_wheel_of_life_areas_user ON public.wheel_of_life_areas USING btree (user_id)'),
    ('index', 'wheel_of_life_checkins.idx_wheel_of_life_checkins_user_at', 'CREATE INDEX idx_wheel_of_life_checkins_user_at ON public.wheel_of_life_checkins USING btree (user_id, checkin_at DESC)'),
    ('security rule', 'breathing_sessions: Users can delete their own breathing
  sessions', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'breathing_sessions: Users can insert their own breathing
  sessions', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'breathing_sessions: Users can update their own breathing
  sessions', 'permissive update to public using (auth.uid() = user_id)'),
    ('security rule', 'breathing_sessions: Users can view their own breathing
  sessions', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'breathing_sessions: delete_own_records', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'breathing_sessions: insert_own_records', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'breathing_sessions: select_own_records', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'breathing_sessions: update_own_records', 'permissive update to public using (auth.uid() = user_id) with check (auth.uid() = user_id)'),
    ('security rule', 'daily_journals: Users can delete their own journals', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'daily_journals: Users can insert their own journals', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'daily_journals: Users can update their own journals', 'permissive update to public using (auth.uid() = user_id)'),
    ('security rule', 'daily_journals: Users can view their own journals', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'decisions: Users can delete their own decisions', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'decisions: Users can insert their own decisions', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'decisions: Users can update their own decisions', 'permissive update to public using (auth.uid() = user_id)'),
    ('security rule', 'decisions: Users can view their own decisions', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'decisions: delete_own_records', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'decisions: insert_own_records', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'decisions: select_own_records', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'decisions: update_own_records', 'permissive update to public using (auth.uid() = user_id) with check (auth.uid() = user_id)'),
    ('security rule', 'journal_entries: Users can delete own entries', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'journal_entries: Users can delete their own journal entries', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'journal_entries: Users can insert own entries', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'journal_entries: Users can insert their own journal entries', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'journal_entries: Users can update own entries', 'permissive update to public using (auth.uid() = user_id)'),
    ('security rule', 'journal_entries: Users can update their own journal entries', 'permissive update to public using (auth.uid() = user_id)'),
    ('security rule', 'journal_entries: Users can view own entries', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'journal_entries: Users can view their own journal entries', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'journal_entries: delete_own_records', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'journal_entries: insert_own_records', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'journal_entries: select_own_records', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'journal_entries: update_own_records', 'permissive update to public using (auth.uid() = user_id) with check (auth.uid() = user_id)'),
    ('security rule', 'mission_progress_reviews: Users can delete their own reviews', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'mission_progress_reviews: Users can insert their own reviews', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'mission_progress_reviews: Users can view their own reviews', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'mission_versions: Users can insert their own plan versions', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'mission_versions: Users can view their own plan versions', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'missions: Users can delete their own missions', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'missions: Users can insert their own missions', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'missions: Users can update their own missions', 'permissive update to public using (auth.uid() = user_id)'),
    ('security rule', 'missions: Users can view their own missions', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'plans: Users can delete their own plans', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'plans: Users can insert their own plans', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'plans: Users can update their own plans', 'permissive update to public using (auth.uid() = user_id)'),
    ('security rule', 'plans: Users can view their own plans', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'plans: delete_own_records', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'plans: insert_own_records', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'plans: select_own_records', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'plans: update_own_records', 'permissive update to public using (auth.uid() = user_id) with check (auth.uid() = user_id)'),
    ('security rule', 'profiles: Allow profile creation on signup', 'permissive insert to public with check true'),
    ('security rule', 'profiles: Users can update their own profile', 'permissive update to public using (auth.uid() = id)'),
    ('security rule', 'profiles: Users can view their own profile', 'permissive select to public using (auth.uid() = id)'),
    ('security rule', 'profiles: delete_own_records', 'permissive delete to public using (auth.uid() = id)'),
    ('security rule', 'profiles: insert_own_records', 'permissive insert to public with check (auth.uid() = id)'),
    ('security rule', 'profiles: select_own_records', 'permissive select to public using (auth.uid() = id)'),
    ('security rule', 'profiles: update_own_records', 'permissive update to public using (auth.uid() = id) with check (auth.uid() = id)'),
    ('security rule', 'reflections: Users can delete their own reflections', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'reflections: Users can insert their own reflections', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'reflections: Users can update their own reflections', 'permissive update to public using (auth.uid() = user_id)'),
    ('security rule', 'reflections: Users can view their own reflections', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'reflections: delete_own_records', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'reflections: insert_own_records', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'reflections: select_own_records', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'reflections: update_own_records', 'permissive update to public using (auth.uid() = user_id) with check (auth.uid() = user_id)'),
    ('security rule', 'strategic_alignments: Users can delete their own alignments', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'strategic_alignments: Users can insert their own alignments', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'strategic_alignments: Users can update their own alignments', 'permissive update to public using (auth.uid() = user_id)'),
    ('security rule', 'strategic_alignments: Users can view their own alignments', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'strategic_alignments: delete_own_records', 'permissive delete to public using (auth.uid() = user_id)'),
    ('security rule', 'strategic_alignments: insert_own_records', 'permissive insert to public with check (auth.uid() = user_id)'),
    ('security rule', 'strategic_alignments: select_own_records', 'permissive select to public using (auth.uid() = user_id)'),
    ('security rule', 'strategic_alignments: update_own_records', 'permissive update to public using (auth.uid() = user_id) with check (auth.uid() = user_id)'),
    ('security rule', 'strategies: Users can delete strategies from their missions', 'permissive delete to public using (mission_id IN ( SELECT missions.id
   FROM missions
  WHERE (missions.user_id = auth.uid())))'),
    ('security rule', 'strategies: Users can insert strategies to their missions', 'permissive insert to public with check (mission_id IN ( SELECT missions.id
   FROM missions
  WHERE (missions.user_id = auth.uid())))'),
    ('security rule', 'strategies: Users can update strategies in their missions', 'permissive update to public using (mission_id IN ( SELECT missions.id
   FROM missions
  WHERE (missions.user_id = auth.uid())))'),
    ('security rule', 'strategies: Users can view strategies from their missions', 'permissive select to public using (mission_id IN ( SELECT missions.id
   FROM missions
  WHERE (missions.user_id = auth.uid())))'),
    ('security rule', 'tactics: Users can delete tactics from their strategies', 'permissive delete to public using (strategy_id IN ( SELECT strategies.id
   FROM strategies
  WHERE (strategies.mission_id IN ( SELECT missions.id
           FROM missions
          WHERE (missions.user_id = auth.uid())))))'),
    ('security rule', 'tactics: Users can insert tactics to their strategies', 'permissive insert to public with check (strategy_id IN ( SELECT strategies.id
   FROM strategies
  WHERE (strategies.mission_id IN ( SELECT missions.id
           FROM missions
          WHERE (missions.user_id = auth.uid())))))'),
    ('security rule', 'tactics: Users can update tactics in their strategies', 'permissive update to public using (strategy_id IN ( SELECT strategies.id
   FROM strategies
  WHERE (strategies.mission_id IN ( SELECT missions.id
           FROM missions
          WHERE (missions.user_id = auth.uid())))))'),
    ('security rule', 'tactics: Users can view tactics from their strategies', 'permissive select to public using (strategy_id IN ( SELECT strategies.id
   FROM strategies
  WHERE (strategies.mission_id IN ( SELECT missions.id
           FROM missions
          WHERE (missions.user_id = auth.uid())))))'),
    ('security rule', 'wheel_of_life_areas: Users can insert their own wheel areas', 'permissive insert to authenticated with check (auth.uid() = user_id)'),
    ('security rule', 'wheel_of_life_areas: Users can update their own wheel areas', 'permissive update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)'),
    ('security rule', 'wheel_of_life_areas: Users can view their own wheel areas', 'permissive select to authenticated using (auth.uid() = user_id)'),
    ('security rule', 'wheel_of_life_checkins: Users can delete their own wheel check-ins', 'permissive delete to authenticated using (auth.uid() = user_id)'),
    ('security rule', 'wheel_of_life_checkins: Users can insert their own wheel check-ins', 'permissive insert to authenticated with check (auth.uid() = user_id)'),
    ('security rule', 'wheel_of_life_checkins: Users can view their own wheel check-ins', 'permissive select to authenticated using (auth.uid() = user_id)'),
    ('security rule', 'wheel_of_life_settings: Users can insert their own wheel settings', 'permissive insert to authenticated with check (auth.uid() = user_id)'),
    ('security rule', 'wheel_of_life_settings: Users can update their own wheel settings', 'permissive update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)'),
    ('security rule', 'wheel_of_life_settings: Users can view their own wheel settings', 'permissive select to authenticated using (auth.uid() = user_id)'),
    ('table', 'alignment_sessions', 'row security on'),
    ('table', 'breathing_sessions', 'row security on'),
    ('table', 'daily_journals', 'row security on'),
    ('table', 'decisions', 'row security on'),
    ('table', 'guest_sessions', 'row security on'),
    ('table', 'journal_entries', 'row security on'),
    ('table', 'mission_progress_reviews', 'row security on'),
    ('table', 'mission_versions', 'row security on'),
    ('table', 'missions', 'row security on'),
    ('table', 'plans', 'row security on'),
    ('table', 'profiles', 'row security on'),
    ('table', 'reflections', 'row security on'),
    ('table', 'strategic_alignments', 'row security on'),
    ('table', 'strategies', 'row security on'),
    ('table', 'tactics', 'row security on'),
    ('table', 'wheel_of_life_areas', 'row security on'),
    ('table', 'wheel_of_life_checkins', 'row security on'),
    ('table', 'wheel_of_life_settings', 'row security on'),
    ('trigger', 'auth.users.on_auth_user_created', 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION create_profile_on_signup()'),
    ('trigger', 'public.decisions.update_decisions_updated_at', 'CREATE TRIGGER update_decisions_updated_at BEFORE UPDATE ON public.decisions FOR EACH ROW EXECUTE FUNCTION update_updated_at()'),
    ('trigger', 'public.journal_entries.update_journal_entries_updated_at', 'CREATE TRIGGER update_journal_entries_updated_at BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at()'),
    ('trigger', 'public.reflections.update_reflections_updated_at', 'CREATE TRIGGER update_reflections_updated_at BEFORE UPDATE ON public.reflections FOR EACH ROW EXECUTE FUNCTION update_updated_at()'),
    ('trigger', 'public.strategic_alignments.update_strategic_alignments_updated_at', 'CREATE TRIGGER update_strategic_alignments_updated_at BEFORE UPDATE ON public.strategic_alignments FOR EACH ROW EXECUTE FUNCTION update_updated_at()'),
    ('trigger', 'public.wheel_of_life_areas.wheel_of_life_areas_touch', 'CREATE TRIGGER wheel_of_life_areas_touch BEFORE UPDATE ON public.wheel_of_life_areas FOR EACH ROW EXECUTE FUNCTION wheel_of_life_touch()'),
    ('trigger', 'public.wheel_of_life_settings.wheel_of_life_settings_touch', 'CREATE TRIGGER wheel_of_life_settings_touch BEFORE UPDATE ON public.wheel_of_life_settings FOR EACH ROW EXECUTE FUNCTION wheel_of_life_touch()')
),
-- Changes made by later migrations to things in the baseline. A database is
-- still a match if it has either the baseline's version or the later one.
later_version (kind, key, val, migration) as (values
    ('function', 'alignment_open(text,text,text)', 'e4051cae7f3cdbadd0336526d48c5902', '022')
),
-- Things later migrations add. They are listed as notes, not differences.
-- (kind and key are LIKE patterns.)
later_addition (kind, key, migration) as (values
    ('security rule', 'mission_progress_reviews: Users can update their own reviews', '023'),
    ('table', 'migration_log', '025'),
    ('function', 'record_migration(%', '025')
),
actual (kind, key, val) as (
  select 'table'::text as kind, c.relname::text as key,
         'row security ' || case when c.relrowsecurity then 'on' else 'off' end
         || case when c.relforcerowsecurity then ', forced' else '' end as val
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
  union all
  select 'column', c.relname || '.' || a.attname,
         pg_catalog.format_type(a.atttypid, a.atttypmod)
         || case when a.attnotnull then ' not null' else '' end
         || coalesce(' default ' || pg_catalog.pg_get_expr(ad.adbin, ad.adrelid), '')
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    left join pg_catalog.pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
   where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
  union all
  select 'column note', c.relname || '.' || a.attname, d.description
    from pg_catalog.pg_description d
    join pg_catalog.pg_class c on c.oid = d.objoid and d.classoid = 'pg_catalog.pg_class'::pg_catalog.regclass
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid
   where n.nspname = 'public' and d.objsubid > 0
  union all
  select 'constraint', c.relname || '.' || co.conname, pg_catalog.pg_get_constraintdef(co.oid)
    from pg_catalog.pg_constraint co
    join pg_catalog.pg_class c on c.oid = co.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and co.contype in ('p', 'u', 'c', 'f', 'x')
  union all
  select 'index', c.relname || '.' || i.relname, pg_catalog.pg_get_indexdef(i.oid)
    from pg_catalog.pg_index x
    join pg_catalog.pg_class i on i.oid = x.indexrelid
    join pg_catalog.pg_class c on c.oid = x.indrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_catalog.pg_constraint co where co.conindid = x.indexrelid and co.conrelid = c.oid)
  union all
  select 'security rule', p.tablename || ': ' || p.policyname,
         lower(p.permissive) || ' ' || lower(p.cmd) || ' to ' || array_to_string(p.roles, ', ')
         || coalesce(' using ' || p.qual, '') || coalesce(' with check ' || p.with_check, '')
    from pg_catalog.pg_policies p
   where p.schemaname = 'public'
  union all
  select 'function', p.oid::pg_catalog.regprocedure::text, pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_catalog.pg_depend d
                      where d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass and d.objid = p.oid and d.deptype = 'e')
  union all
  select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname, pg_catalog.pg_get_triggerdef(t.oid)
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_proc p on p.oid = t.tgfoid
    join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
   where not t.tgisinternal and (n.nspname = 'public' or (n.nspname = 'auth' and pn.nspname = 'public'))
  union all
  select 'extension', e.extname, 'in schema ' || n.nspname
    from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid = e.extnamespace
   where e.extname in ('pgcrypto', 'uuid-ossp')
),
compared as (
  select coalesce(e.kind, a.kind) as kind, coalesce(e.key, a.key) as key, e.val as expected, a.val as found
    from expected e full join actual a on a.kind = e.kind and a.key = e.key
),
differences as (
  select 1 as sort, 'DIFFERENCE: ' || c.kind || ' ' || c.key ||
         case when c.found is null then ' is missing.'
              else ' is not the same.' || E'\n  Baseline: ' || c.expected || E'\n  Found:    ' || c.found end as line
    from compared c
   where c.expected is not null and c.found is distinct from c.expected
     and not exists (select 1 from later_version l where l.kind = c.kind and l.key = c.key and l.val = c.found)
),
extra as (
  select c.kind, c.key from compared c where c.expected is null
),
notes as (
  select 2 as sort, 'NOTE: ' || c.kind || ' ' || c.key || ' has the version from migration ' || l.migration || '.' as line
    from compared c join later_version l on l.kind = c.kind and l.key = c.key and l.val = c.found
  union all
  -- One note per extra table (its columns, keys and rules are not listed
  -- again), and one per other extra part.
  select 3, 'NOTE: ' || x.kind || ' ' || x.key || ' is not part of the baseline' ||
            coalesce(' (added by migration ' ||
                     (select min(la.migration) from later_addition la where x.kind like la.kind and x.key like la.key) || ')', '') || '.'
    from extra x
   where x.kind in ('table', 'function', 'trigger', 'extension')
      or not exists (select 1 from extra t where t.kind = 'table'
                      and t.key = split_part(split_part(x.key, ':', 1), '.', 1))
)
select line as result from (
  select sort, line from differences
  union all
  select sort, line from notes
  union all
  select 9, case when (select count(*) from differences) = 0
                 then 'ALL CHECKS PASSED: 381 parts of the baseline are all here and the same.'
                 when (select count(*) from differences) = 1 then '1 DIFFERENCE FOUND (listed above).'
                 else (select count(*) from differences) || ' DIFFERENCES FOUND (listed above).' end
) r
order by sort, line;
