-- Append-only audit history for educational-support model results.
CREATE TABLE IF NOT EXISTS public.student_support_predictions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    suggests_educational_support boolean,
    status text NOT NULL,
    attention_index double precision,
    applied_threshold double precision,
    model_name text NOT NULL,
    model_version text NOT NULL,
    model_route text NOT NULL,
    evidence_level text NOT NULL,
    total_responses integer NOT NULL,
    valid_response_times integer NOT NULL DEFAULT 0,
    volume_outside_fit_range boolean NOT NULL DEFAULT false,
    warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
    reason text,
    generated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT student_support_predictions_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT student_support_predictions_student_school_fk
        FOREIGN KEY (student_id, school_id)
        REFERENCES public.student_profiles (id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT student_support_predictions_student_fk
        FOREIGN KEY (student_id) REFERENCES public.student_profiles (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT student_support_predictions_status_allowed CHECK (
        status IN (
            'support_suggested',
            'no_support_signal',
            'insufficient_information',
            'diagnosis_recorded'
        )
    ),
    CONSTRAINT student_support_predictions_decision_status_consistent CHECK (
        (suggests_educational_support IS TRUE AND status = 'support_suggested')
        OR (suggests_educational_support IS FALSE AND status = 'no_support_signal')
        OR (
            suggests_educational_support IS NULL
            AND status IN ('insufficient_information', 'diagnosis_recorded')
        )
    ),
    CONSTRAINT student_support_predictions_scores_paired CHECK (
        (attention_index IS NULL) = (applied_threshold IS NULL)
    ),
    CONSTRAINT student_support_predictions_scores_match_decision CHECK (
        (suggests_educational_support IS NULL AND attention_index IS NULL)
        OR (suggests_educational_support IS NOT NULL AND attention_index IS NOT NULL)
    ),
    CONSTRAINT student_support_predictions_attention_index_range CHECK (
        attention_index IS NULL OR (
            attention_index BETWEEN 0.0 AND 1.0
            AND attention_index::text NOT IN ('NaN', 'Infinity', '-Infinity')
        )
    ),
    CONSTRAINT student_support_predictions_threshold_range CHECK (
        applied_threshold IS NULL OR (
            applied_threshold BETWEEN 0.0 AND 1.0
            AND applied_threshold::text NOT IN ('NaN', 'Infinity', '-Infinity')
        )
    ),
    CONSTRAINT student_support_predictions_evidence_allowed CHECK (
        evidence_level IN ('insufficient', 'limited', 'standard')
    ),
    CONSTRAINT student_support_predictions_response_counts_valid CHECK (
        total_responses >= 0
        AND valid_response_times >= 0
        AND valid_response_times <= total_responses
    ),
    CONSTRAINT student_support_predictions_warnings_array CHECK (
        jsonb_typeof(warnings) = 'array'
    ),
    CONSTRAINT student_support_predictions_model_name_not_blank CHECK (
        btrim(model_name) <> ''
    ),
    CONSTRAINT student_support_predictions_model_version_not_blank CHECK (
        btrim(model_version) <> ''
    ),
    CONSTRAINT student_support_predictions_model_route_not_blank CHECK (
        btrim(model_route) <> ''
    )
);

-- Keep reruns able to upgrade a database on which an earlier draft of this
-- migration was already applied.
ALTER TABLE public.student_support_predictions
    DROP CONSTRAINT IF EXISTS student_support_predictions_status_allowed,
    DROP CONSTRAINT IF EXISTS student_support_predictions_decision_status_consistent;

ALTER TABLE public.student_support_predictions
    ADD CONSTRAINT student_support_predictions_status_allowed CHECK (
        status IN (
            'support_suggested',
            'no_support_signal',
            'insufficient_information',
            'diagnosis_recorded'
        )
    ),
    ADD CONSTRAINT student_support_predictions_decision_status_consistent CHECK (
        (suggests_educational_support IS TRUE AND status = 'support_suggested')
        OR (suggests_educational_support IS FALSE AND status = 'no_support_signal')
        OR (
            suggests_educational_support IS NULL
            AND status IN ('insufficient_information', 'diagnosis_recorded')
        )
    );

DO $add_directus_relation$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'student_support_predictions_student_fk'
          AND conrelid = 'public.student_support_predictions'::regclass
    ) THEN
        ALTER TABLE public.student_support_predictions
            ADD CONSTRAINT student_support_predictions_student_fk
            FOREIGN KEY (student_id) REFERENCES public.student_profiles (id)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END;
$add_directus_relation$;

CREATE INDEX IF NOT EXISTS student_support_predictions_student_generated_idx
    ON public.student_support_predictions (student_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS student_support_predictions_school_generated_idx
    ON public.student_support_predictions (school_id, generated_at DESC);

COMMENT ON TABLE public.student_support_predictions IS
    'Immutable application history of educational-support model results; each execution inserts a row.';

COMMENT ON COLUMN public.student_support_predictions.suggests_educational_support IS
    'TRUE suggests human educational review/support, FALSE means no sufficient signal, NULL means no prediction.';

COMMENT ON COLUMN public.student_support_predictions.attention_index IS
    'PU prioritization index. It is not a diagnostic probability and must be interpreted with applied_threshold.';

COMMENT ON COLUMN public.student_support_predictions.warnings IS
    'Array of stable warning codes captured with the prediction.';

CREATE OR REPLACE FUNCTION public.prevent_student_support_prediction_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'student_support_predictions is append-only';
END;
$$;

DROP TRIGGER IF EXISTS student_support_predictions_append_only
    ON public.student_support_predictions;

CREATE TRIGGER student_support_predictions_append_only
    BEFORE UPDATE OR DELETE ON public.student_support_predictions
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_student_support_prediction_mutation();
