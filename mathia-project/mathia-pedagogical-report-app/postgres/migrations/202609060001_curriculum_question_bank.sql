BEGIN;

CREATE TABLE IF NOT EXISTS public.curriculum_categories (
    id text PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name jsonb NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT curriculum_categories_id_not_blank CHECK (btrim(id) <> ''),
    CONSTRAINT curriculum_categories_code_not_blank CHECK (btrim(code) <> ''),
    CONSTRAINT curriculum_categories_name_object CHECK (jsonb_typeof(name) = 'object')
);

CREATE TABLE IF NOT EXISTS public.curriculum_courses (
    id text PRIMARY KEY,
    grade_level integer NOT NULL UNIQUE,
    name jsonb NOT NULL,
    spanish_equivalent jsonb,
    pathway jsonb NOT NULL DEFAULT '{}'::jsonb,
    source jsonb NOT NULL DEFAULT '{}'::jsonb,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT curriculum_courses_id_not_blank CHECK (btrim(id) <> ''),
    CONSTRAINT curriculum_courses_grade_level_valid CHECK (grade_level > 0),
    CONSTRAINT curriculum_courses_name_object CHECK (jsonb_typeof(name) = 'object'),
    CONSTRAINT curriculum_courses_spanish_equivalent_object CHECK (
        spanish_equivalent IS NULL OR jsonb_typeof(spanish_equivalent) = 'object'
    ),
    CONSTRAINT curriculum_courses_pathway_object CHECK (jsonb_typeof(pathway) = 'object'),
    CONSTRAINT curriculum_courses_source_object CHECK (jsonb_typeof(source) = 'object')
);

CREATE TABLE IF NOT EXISTS public.curriculum_domains (
    id text PRIMARY KEY,
    category_id text NOT NULL,
    code text NOT NULL UNIQUE,
    name jsonb NOT NULL,
    category_assignment text NOT NULL,
    source jsonb NOT NULL DEFAULT '{}'::jsonb,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT curriculum_domains_category_fk
        FOREIGN KEY (category_id) REFERENCES public.curriculum_categories (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT curriculum_domains_id_category_unique UNIQUE (id, category_id),
    CONSTRAINT curriculum_domains_id_not_blank CHECK (btrim(id) <> ''),
    CONSTRAINT curriculum_domains_code_not_blank CHECK (btrim(code) <> ''),
    CONSTRAINT curriculum_domains_name_object CHECK (jsonb_typeof(name) = 'object'),
    CONSTRAINT curriculum_domains_assignment_allowed CHECK (
        category_assignment IN ('official', 'project_crosswalk')
    ),
    CONSTRAINT curriculum_domains_source_object CHECK (jsonb_typeof(source) = 'object')
);

CREATE TABLE IF NOT EXISTS public.curriculum_clusters (
    id text PRIMARY KEY,
    domain_id text NOT NULL,
    code text NOT NULL UNIQUE,
    name jsonb NOT NULL,
    source jsonb NOT NULL DEFAULT '{}'::jsonb,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT curriculum_clusters_domain_fk
        FOREIGN KEY (domain_id) REFERENCES public.curriculum_domains (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT curriculum_clusters_id_domain_unique UNIQUE (id, domain_id),
    CONSTRAINT curriculum_clusters_id_not_blank CHECK (btrim(id) <> ''),
    CONSTRAINT curriculum_clusters_code_not_blank CHECK (btrim(code) <> ''),
    CONSTRAINT curriculum_clusters_name_object CHECK (jsonb_typeof(name) = 'object'),
    CONSTRAINT curriculum_clusters_source_object CHECK (jsonb_typeof(source) = 'object')
);

CREATE TABLE IF NOT EXISTS public.curriculum_standards (
    id text PRIMARY KEY,
    cluster_id text NOT NULL,
    code text NOT NULL,
    ccss_id text NOT NULL UNIQUE,
    description jsonb NOT NULL,
    markers jsonb NOT NULL DEFAULT '{}'::jsonb,
    source jsonb NOT NULL DEFAULT '{}'::jsonb,
    notes jsonb NOT NULL DEFAULT '[]'::jsonb,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT curriculum_standards_cluster_fk
        FOREIGN KEY (cluster_id) REFERENCES public.curriculum_clusters (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT curriculum_standards_id_cluster_unique UNIQUE (id, cluster_id),
    CONSTRAINT curriculum_standards_id_not_blank CHECK (btrim(id) <> ''),
    CONSTRAINT curriculum_standards_code_not_blank CHECK (btrim(code) <> ''),
    CONSTRAINT curriculum_standards_ccss_id_not_blank CHECK (btrim(ccss_id) <> ''),
    CONSTRAINT curriculum_standards_description_object CHECK (
        jsonb_typeof(description) = 'object'
    ),
    CONSTRAINT curriculum_standards_markers_object CHECK (jsonb_typeof(markers) = 'object'),
    CONSTRAINT curriculum_standards_source_object CHECK (jsonb_typeof(source) = 'object'),
    CONSTRAINT curriculum_standards_notes_array CHECK (jsonb_typeof(notes) = 'array')
);

CREATE TABLE IF NOT EXISTS public.curriculum_substandards (
    id text PRIMARY KEY,
    standard_id text NOT NULL,
    code text NOT NULL,
    ccss_id text NOT NULL UNIQUE,
    description jsonb NOT NULL,
    markers jsonb NOT NULL DEFAULT '{}'::jsonb,
    source jsonb NOT NULL DEFAULT '{}'::jsonb,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT curriculum_substandards_standard_fk
        FOREIGN KEY (standard_id) REFERENCES public.curriculum_standards (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT curriculum_substandards_id_standard_unique UNIQUE (id, standard_id),
    CONSTRAINT curriculum_substandards_id_not_blank CHECK (btrim(id) <> ''),
    CONSTRAINT curriculum_substandards_code_not_blank CHECK (btrim(code) <> ''),
    CONSTRAINT curriculum_substandards_ccss_id_not_blank CHECK (btrim(ccss_id) <> ''),
    CONSTRAINT curriculum_substandards_description_object CHECK (
        jsonb_typeof(description) = 'object'
    ),
    CONSTRAINT curriculum_substandards_markers_object CHECK (
        jsonb_typeof(markers) = 'object'
    ),
    CONSTRAINT curriculum_substandards_source_object CHECK (jsonb_typeof(source) = 'object')
);

CREATE TABLE IF NOT EXISTS public.curriculum_course_domains (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    course_id text NOT NULL,
    domain_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT curriculum_course_domains_course_fk
        FOREIGN KEY (course_id) REFERENCES public.curriculum_courses (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT curriculum_course_domains_domain_fk
        FOREIGN KEY (domain_id) REFERENCES public.curriculum_domains (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT curriculum_course_domains_course_domain_uq
        UNIQUE (course_id, domain_id)
);

CREATE INDEX IF NOT EXISTS curriculum_course_domains_course_idx
    ON public.curriculum_course_domains (course_id, domain_id);

CREATE INDEX IF NOT EXISTS curriculum_course_domains_domain_idx
    ON public.curriculum_course_domains (domain_id, course_id);

CREATE TABLE IF NOT EXISTS public.curriculum_course_standards (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    course_id text NOT NULL,
    standard_id text NOT NULL,
    inclusion text NOT NULL,
    coverage jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT curriculum_course_standards_course_fk
        FOREIGN KEY (course_id) REFERENCES public.curriculum_courses (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT curriculum_course_standards_standard_fk
        FOREIGN KEY (standard_id) REFERENCES public.curriculum_standards (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT curriculum_course_standards_inclusion_allowed CHECK (
        inclusion IN ('listed', 'optional_extension')
    ),
    CONSTRAINT curriculum_course_standards_coverage_array CHECK (
        jsonb_typeof(coverage) = 'array'
    )
);

CREATE TABLE IF NOT EXISTS public.curriculum_course_substandards (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    course_id text NOT NULL,
    substandard_id text NOT NULL,
    inclusion text NOT NULL,
    coverage jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT curriculum_course_substandards_course_fk
        FOREIGN KEY (course_id) REFERENCES public.curriculum_courses (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT curriculum_course_substandards_substandard_fk
        FOREIGN KEY (substandard_id) REFERENCES public.curriculum_substandards (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT curriculum_course_substandards_inclusion_allowed CHECK (
        inclusion IN ('listed', 'optional_extension')
    ),
    CONSTRAINT curriculum_course_substandards_coverage_array CHECK (
        jsonb_typeof(coverage) = 'array'
    )
);

ALTER TABLE public.curriculum_course_standards
    ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.curriculum_course_standards
    ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.curriculum_course_standards
    DROP CONSTRAINT IF EXISTS curriculum_course_standards_pkey;
ALTER TABLE public.curriculum_course_standards
    ADD CONSTRAINT curriculum_course_standards_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS curriculum_course_standards_course_standard_uq
    ON public.curriculum_course_standards (course_id, standard_id);

ALTER TABLE public.curriculum_course_substandards
    ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.curriculum_course_substandards
    ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.curriculum_course_substandards
    DROP CONSTRAINT IF EXISTS curriculum_course_substandards_pkey;
ALTER TABLE public.curriculum_course_substandards
    ADD CONSTRAINT curriculum_course_substandards_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS curriculum_course_substandards_course_substandard_uq
    ON public.curriculum_course_substandards (course_id, substandard_id);

CREATE TABLE IF NOT EXISTS public.curriculum_lookup_aliases (
    alias text PRIMARY KEY,
    item_kind text NOT NULL,
    standard_id text,
    substandard_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT curriculum_lookup_aliases_standard_fk
        FOREIGN KEY (standard_id) REFERENCES public.curriculum_standards (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT curriculum_lookup_aliases_substandard_fk
        FOREIGN KEY (substandard_id) REFERENCES public.curriculum_substandards (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT curriculum_lookup_aliases_kind_allowed CHECK (
        item_kind IN ('standard', 'substandard')
    ),
    CONSTRAINT curriculum_lookup_aliases_one_target CHECK (
        num_nonnulls(standard_id, substandard_id) = 1
    ),
    CONSTRAINT curriculum_lookup_aliases_kind_matches_target CHECK (
        (item_kind = 'standard' AND standard_id IS NOT NULL)
        OR (item_kind = 'substandard' AND substandard_id IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.question_bank_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid,
    created_by_user_id uuid,
    created_by_teacher_id uuid,
    external_id text,
    question_type text NOT NULL,
    prompt text NOT NULL,
    explanation text,
    difficulty text NOT NULL DEFAULT 'medium',
    language text NOT NULL DEFAULT 'en',
    domain_id text NOT NULL,
    cluster_id text,
    standard_id text,
    substandard_id text,
    visibility text NOT NULL DEFAULT 'private',
    status text NOT NULL DEFAULT 'draft',
    source text NOT NULL DEFAULT 'manual',
    source_reference text,
    answer_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT question_bank_items_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT question_bank_items_creator_school_fk
        FOREIGN KEY (created_by_teacher_id, school_id)
        REFERENCES public.teacher_profiles (id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT question_bank_items_creator_fk
        FOREIGN KEY (created_by_teacher_id) REFERENCES public.teacher_profiles (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT question_bank_items_domain_fk
        FOREIGN KEY (domain_id) REFERENCES public.curriculum_domains (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT question_bank_items_cluster_fk
        FOREIGN KEY (cluster_id) REFERENCES public.curriculum_clusters (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT question_bank_items_standard_fk
        FOREIGN KEY (standard_id) REFERENCES public.curriculum_standards (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT question_bank_items_substandard_fk
        FOREIGN KEY (substandard_id) REFERENCES public.curriculum_substandards (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT question_bank_items_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT question_bank_items_external_id_not_blank CHECK (
        external_id IS NULL OR btrim(external_id) <> ''
    ),
    CONSTRAINT question_bank_items_prompt_not_blank CHECK (btrim(prompt) <> ''),
    CONSTRAINT question_bank_items_type_allowed CHECK (
        question_type IN (
            'single_choice', 'multiple_choice', 'true_false', 'numeric', 'short_text'
        )
    ),
    CONSTRAINT question_bank_items_difficulty_allowed CHECK (
        difficulty IN ('easy', 'medium', 'hard')
    ),
    CONSTRAINT question_bank_items_language_format CHECK (
        language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'
    ),
    CONSTRAINT question_bank_items_visibility_allowed CHECK (
        visibility IN ('private', 'school', 'global')
    ),
    CONSTRAINT question_bank_items_visibility_scope CHECK (
        (
            visibility = 'global'
            AND school_id IS NULL
            AND created_by_user_id IS NULL
            AND created_by_teacher_id IS NULL
        )
        OR (visibility IN ('private', 'school') AND school_id IS NOT NULL)
    ),
    CONSTRAINT question_bank_items_status_allowed CHECK (
        status IN ('draft', 'published', 'archived')
    ),
    CONSTRAINT question_bank_items_source_allowed CHECK (
        source IN ('manual', 'csv', 'ai', 'migrated')
    ),
    CONSTRAINT question_bank_items_source_reference_not_blank CHECK (
        source_reference IS NULL OR btrim(source_reference) <> ''
    ),
    CONSTRAINT question_bank_items_answer_config_object CHECK (
        jsonb_typeof(answer_config) = 'object'
    ),
    CONSTRAINT question_bank_items_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT question_bank_items_published_at_required CHECK (
        status <> 'published' OR published_at IS NOT NULL
    )
);

ALTER TABLE public.question_bank_items
    ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

ALTER TABLE public.question_bank_items
    DROP CONSTRAINT IF EXISTS question_bank_items_visibility_scope;
ALTER TABLE public.question_bank_items
    ADD CONSTRAINT question_bank_items_visibility_scope CHECK (
        (
            visibility = 'global'
            AND school_id IS NULL
            AND created_by_user_id IS NULL
            AND created_by_teacher_id IS NULL
        )
        OR (visibility IN ('private', 'school') AND school_id IS NOT NULL)
    );

CREATE TABLE IF NOT EXISTS public.question_options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid,
    created_by_user_id uuid,
    question_id uuid NOT NULL,
    option_key text NOT NULL,
    content text NOT NULL,
    is_correct boolean NOT NULL DEFAULT false,
    position integer NOT NULL,
    feedback text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT question_options_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT question_options_question_fk
        FOREIGN KEY (question_id) REFERENCES public.question_bank_items (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT question_options_question_school_fk
        FOREIGN KEY (question_id, school_id)
        REFERENCES public.question_bank_items (id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT question_options_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT question_options_question_key_unique UNIQUE (question_id, option_key),
    CONSTRAINT question_options_question_position_unique UNIQUE (question_id, position),
    CONSTRAINT question_options_key_not_blank CHECK (btrim(option_key) <> ''),
    CONSTRAINT question_options_content_not_blank CHECK (btrim(content) <> ''),
    CONSTRAINT question_options_position_nonnegative CHECK (position >= 0)
);

ALTER TABLE public.question_options
    ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS question_bank_items_school_external_id_ci_uq
    ON public.question_bank_items (school_id, lower(external_id))
    WHERE school_id IS NOT NULL AND external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS question_bank_items_global_external_id_ci_uq
    ON public.question_bank_items (lower(external_id))
    WHERE school_id IS NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS curriculum_domains_category_idx
    ON public.curriculum_domains (category_id, active, code);

CREATE INDEX IF NOT EXISTS curriculum_clusters_domain_idx
    ON public.curriculum_clusters (domain_id, active, code);

CREATE INDEX IF NOT EXISTS curriculum_standards_cluster_idx
    ON public.curriculum_standards (cluster_id, active, id);

CREATE INDEX IF NOT EXISTS curriculum_substandards_standard_idx
    ON public.curriculum_substandards (standard_id, active, id);

CREATE INDEX IF NOT EXISTS curriculum_course_standards_standard_idx
    ON public.curriculum_course_standards (standard_id, course_id);

CREATE INDEX IF NOT EXISTS curriculum_course_substandards_substandard_idx
    ON public.curriculum_course_substandards (substandard_id, course_id);

CREATE INDEX IF NOT EXISTS question_bank_items_school_status_idx
    ON public.question_bank_items (school_id, status, updated_at DESC)
    WHERE school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS question_bank_items_curriculum_idx
    ON public.question_bank_items (
        domain_id, cluster_id, standard_id, substandard_id, difficulty, status
    );

CREATE INDEX IF NOT EXISTS question_bank_items_creator_idx
    ON public.question_bank_items (created_by_teacher_id, status, updated_at DESC)
    WHERE created_by_teacher_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS question_bank_items_creator_user_idx
    ON public.question_bank_items (created_by_user_id, status, updated_at DESC)
    WHERE created_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS question_options_question_idx
    ON public.question_options (question_id, position);

CREATE INDEX IF NOT EXISTS question_options_creator_user_idx
    ON public.question_options (created_by_user_id, question_id)
    WHERE created_by_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    table_name text;
    trigger_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'curriculum_categories',
        'curriculum_courses',
        'curriculum_domains',
        'curriculum_clusters',
        'curriculum_standards',
        'curriculum_substandards',
        'curriculum_course_standards',
        'curriculum_course_substandards',
        'curriculum_lookup_aliases',
        'question_bank_items',
        'question_options'
    ]
    LOOP
        trigger_name := 'set_' || table_name || '_updated_at';
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, table_name);
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
            || 'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
            trigger_name,
            table_name
        );
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.validate_question_curriculum_path()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    resolved_domain_id text;
    resolved_cluster_id text;
    resolved_standard_id text;
BEGIN
    IF NEW.cluster_id IS NOT NULL THEN
        SELECT domain_id INTO resolved_domain_id
        FROM public.curriculum_clusters
        WHERE id = NEW.cluster_id;

        IF resolved_domain_id IS DISTINCT FROM NEW.domain_id THEN
            RAISE EXCEPTION 'Question cluster (%) does not belong to domain (%)',
                NEW.cluster_id, NEW.domain_id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.standard_id IS NOT NULL THEN
        IF NEW.cluster_id IS NULL THEN
            RAISE EXCEPTION 'A question with a standard must also specify its cluster'
                USING ERRCODE = '23514';
        END IF;

        SELECT cluster_id INTO resolved_cluster_id
        FROM public.curriculum_standards
        WHERE id = NEW.standard_id;

        IF resolved_cluster_id IS DISTINCT FROM NEW.cluster_id THEN
            RAISE EXCEPTION 'Question standard (%) does not belong to cluster (%)',
                NEW.standard_id, NEW.cluster_id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.substandard_id IS NOT NULL THEN
        IF NEW.standard_id IS NULL THEN
            RAISE EXCEPTION 'A question with a substandard must also specify its standard'
                USING ERRCODE = '23514';
        END IF;

        SELECT standard_id INTO resolved_standard_id
        FROM public.curriculum_substandards
        WHERE id = NEW.substandard_id;

        IF resolved_standard_id IS DISTINCT FROM NEW.standard_id THEN
            RAISE EXCEPTION 'Question substandard (%) does not belong to standard (%)',
                NEW.substandard_id, NEW.standard_id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.set_question_creator_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    resolved_teacher_id uuid;
    resolved_school_id uuid;
BEGIN
    IF NEW.created_by_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id, school_id
      INTO resolved_teacher_id, resolved_school_id
      FROM public.teacher_profiles
     WHERE directus_user_id = NEW.created_by_user_id
       AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Question creator requires an active teacher profile'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.school_id IS DISTINCT FROM resolved_school_id THEN
        RAISE EXCEPTION 'Question creator and question must belong to the same school'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.created_by_teacher_id IS NOT NULL
      AND NEW.created_by_teacher_id <> resolved_teacher_id THEN
        RAISE EXCEPTION 'Question teacher does not match its Directus creator'
            USING ERRCODE = '23514';
    END IF;

    NEW.created_by_teacher_id := resolved_teacher_id;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS question_bank_items_creator_scope_guard
    ON public.question_bank_items;

CREATE TRIGGER question_bank_items_creator_scope_guard
BEFORE INSERT OR UPDATE OF school_id, created_by_user_id, created_by_teacher_id
ON public.question_bank_items
FOR EACH ROW
EXECUTE FUNCTION public.set_question_creator_scope();

DROP TRIGGER IF EXISTS question_bank_items_curriculum_path_guard
    ON public.question_bank_items;

CREATE TRIGGER question_bank_items_curriculum_path_guard
BEFORE INSERT OR UPDATE OF domain_id, cluster_id, standard_id, substandard_id
ON public.question_bank_items
FOR EACH ROW
EXECUTE FUNCTION public.validate_question_curriculum_path();

CREATE OR REPLACE FUNCTION public.validate_question_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    option_count integer;
    correct_count integer;
BEGIN
    IF NEW.status <> 'published' THEN
        RETURN NEW;
    END IF;

    IF NEW.question_type IN ('single_choice', 'multiple_choice', 'true_false') THEN
        SELECT count(*), count(*) FILTER (WHERE is_correct)
          INTO option_count, correct_count
          FROM public.question_options
         WHERE question_id = NEW.id;

        IF option_count < 2 THEN
            RAISE EXCEPTION 'A published choice question requires at least two options'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.question_type IN ('single_choice', 'true_false') AND correct_count <> 1 THEN
            RAISE EXCEPTION 'A published % question requires exactly one correct option',
                NEW.question_type
                USING ERRCODE = '23514';
        END IF;

        IF NEW.question_type = 'multiple_choice' AND correct_count < 1 THEN
            RAISE EXCEPTION 'A published multiple-choice question requires a correct option'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.question_type = 'true_false' AND option_count <> 2 THEN
            RAISE EXCEPTION 'A published true/false question requires exactly two options'
                USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.question_type = 'numeric'
      AND NOT (NEW.answer_config ? 'correct_value') THEN
        RAISE EXCEPTION 'A published numeric question requires answer_config.correct_value'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS question_bank_items_publication_guard
    ON public.question_bank_items;

CREATE CONSTRAINT TRIGGER question_bank_items_publication_guard
AFTER INSERT OR UPDATE OF status, question_type, answer_config
ON public.question_bank_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.validate_question_publication();

CREATE OR REPLACE FUNCTION public.protect_published_question_options()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    parent_status text;
    parent_school_id uuid;
    parent_creator_user_id uuid;
BEGIN
    SELECT status, school_id, created_by_user_id
      INTO parent_status, parent_school_id, parent_creator_user_id
    FROM public.question_bank_items
    WHERE id = COALESCE(NEW.question_id, OLD.question_id);

    IF TG_OP <> 'DELETE' AND parent_school_id IS DISTINCT FROM NEW.school_id THEN
        RAISE EXCEPTION 'Question option school does not match its question school'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP <> 'DELETE'
      AND parent_creator_user_id IS DISTINCT FROM NEW.created_by_user_id THEN
        RAISE EXCEPTION 'Question option creator does not match its question creator'
            USING ERRCODE = '23514';
    END IF;

    IF parent_status = 'published' THEN
        RAISE EXCEPTION 'Options of a published question are immutable; create a draft copy'
            USING ERRCODE = '23514';
    END IF;

    RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS question_options_published_guard
    ON public.question_options;

CREATE TRIGGER question_options_published_guard
BEFORE INSERT OR UPDATE OR DELETE
ON public.question_options
FOR EACH ROW
EXECUTE FUNCTION public.protect_published_question_options();

COMMENT ON TABLE public.curriculum_categories IS
    'Global curricular categories imported from the validated CCSS source.';
COMMENT ON TABLE public.curriculum_courses IS
    'Global grade/course definitions and their source alignment metadata.';
COMMENT ON TABLE public.curriculum_domains IS
    'Curricular domains; the minimum required classification for a question.';
COMMENT ON TABLE public.curriculum_clusters IS
    'Curricular clusters nested under a domain.';
COMMENT ON TABLE public.curriculum_standards IS
    'Canonical CCSS standards nested under a curricular cluster.';
COMMENT ON TABLE public.curriculum_substandards IS
    'Optional lettered CCSS substandards nested under a standard.';
COMMENT ON TABLE public.curriculum_lookup_aliases IS
    'Aliases from the source lookup used to resolve imported standard codes.';
COMMENT ON TABLE public.question_bank_items IS
    'Reusable, tenant-scoped or global questions classified to at least a domain.';
COMMENT ON COLUMN public.question_bank_items.answer_config IS
    'Type-specific deterministic answer settings; choice answers remain in question_options.';
COMMENT ON COLUMN public.question_bank_items.created_by_user_id IS
    'Directus security ownership anchor; PostgreSQL derives created_by_teacher_id from it.';
COMMENT ON TABLE public.question_options IS
    'Ordered answer options and scoring keys for choice-based questions.';
COMMENT ON COLUMN public.question_options.created_by_user_id IS
    'Directus ownership anchor; it must match the parent question creator.';

COMMIT;
