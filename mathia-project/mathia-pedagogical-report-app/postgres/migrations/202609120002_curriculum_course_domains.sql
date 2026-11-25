BEGIN;

CREATE TABLE IF NOT EXISTS public.curriculum_course_domains (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    course_id text NOT NULL REFERENCES public.curriculum_courses(id) ON UPDATE CASCADE ON DELETE CASCADE,
    domain_id text NOT NULL REFERENCES public.curriculum_domains(id) ON UPDATE CASCADE ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT curriculum_course_domains_course_domain_uq UNIQUE (course_id, domain_id)
);

CREATE INDEX IF NOT EXISTS curriculum_course_domains_course_idx
    ON public.curriculum_course_domains (course_id, domain_id);

CREATE INDEX IF NOT EXISTS curriculum_course_domains_domain_idx
    ON public.curriculum_course_domains (domain_id, course_id);

DROP TRIGGER IF EXISTS set_curriculum_course_domains_updated_at ON public.curriculum_course_domains;
CREATE TRIGGER set_curriculum_course_domains_updated_at
    BEFORE UPDATE ON public.curriculum_course_domains
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add curriculum path validation trigger for resources
CREATE OR REPLACE FUNCTION public.validate_resource_curriculum_path()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    resolved_category_id text;
    domain_in_course boolean;
BEGIN
    IF NEW.domain_id IS NOT NULL THEN
        SELECT category_id INTO resolved_category_id
        FROM public.curriculum_domains
        WHERE id = NEW.domain_id;

        IF NEW.category_id IS NOT NULL AND resolved_category_id IS DISTINCT FROM NEW.category_id THEN
            RAISE EXCEPTION 'Resource domain (%) does not belong to category (%)',
                NEW.domain_id, NEW.category_id
                USING ERRCODE = '23514';
        END IF;

        IF NEW.category_id IS NULL AND resolved_category_id IS NOT NULL THEN
            NEW.category_id := resolved_category_id;
        END IF;
    END IF;

    IF NEW.course_id IS NOT NULL AND NEW.domain_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.curriculum_course_domains
            WHERE course_id = NEW.course_id AND domain_id = NEW.domain_id
        ) INTO domain_in_course;

        IF NOT domain_in_course THEN
            RAISE EXCEPTION 'Resource domain (%) is not available in course (%)',
                NEW.domain_id, NEW.course_id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resources_curriculum_path_guard ON public.resources;
CREATE TRIGGER resources_curriculum_path_guard
    BEFORE INSERT OR UPDATE OF course_id, category_id, domain_id
    ON public.resources
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_resource_curriculum_path();

COMMIT;

