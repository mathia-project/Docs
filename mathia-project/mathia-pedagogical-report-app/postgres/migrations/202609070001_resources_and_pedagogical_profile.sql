BEGIN;

-- 1. Extend resources table with curriculum alignment and target levels
ALTER TABLE public.resources
    ADD COLUMN IF NOT EXISTS course_id text,
    ADD COLUMN IF NOT EXISTS category_id text,
    ADD COLUMN IF NOT EXISTS domain_id text,
    ADD COLUMN IF NOT EXISTS cluster_id text,
    ADD COLUMN IF NOT EXISTS standard_id text,
    ADD COLUMN IF NOT EXISTS target_level text NOT NULL DEFAULT 'practice';

DO $check_fks$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'resources_course_fk'
    ) THEN
        ALTER TABLE public.resources
            ADD CONSTRAINT resources_course_fk
            FOREIGN KEY (course_id) REFERENCES public.curriculum_courses(id)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'resources_category_fk'
    ) THEN
        ALTER TABLE public.resources
            ADD CONSTRAINT resources_category_fk
            FOREIGN KEY (category_id) REFERENCES public.curriculum_categories(id)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'resources_domain_fk'
    ) THEN
        ALTER TABLE public.resources
            ADD CONSTRAINT resources_domain_fk
            FOREIGN KEY (domain_id) REFERENCES public.curriculum_domains(id)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'resources_cluster_fk'
    ) THEN
        ALTER TABLE public.resources
            ADD CONSTRAINT resources_cluster_fk
            FOREIGN KEY (cluster_id) REFERENCES public.curriculum_clusters(id)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'resources_standard_fk'
    ) THEN
        ALTER TABLE public.resources
            ADD CONSTRAINT resources_standard_fk
            FOREIGN KEY (standard_id) REFERENCES public.curriculum_standards(id)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'resources_target_level_allowed'
    ) THEN
        ALTER TABLE public.resources
            ADD CONSTRAINT resources_target_level_allowed
            CHECK (target_level IN ('reinforcement', 'practice', 'enrichment'));
    END IF;
END $check_fks$;

CREATE INDEX IF NOT EXISTS resources_course_domain_idx
    ON public.resources (course_id, domain_id, status);

CREATE INDEX IF NOT EXISTS resources_target_level_idx
    ON public.resources (target_level);

-- 2. Student Domain Evaluations Table (Continuous pedagogical profile)
CREATE TABLE IF NOT EXISTS public.student_domain_evaluations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    domain_id text NOT NULL,
    category_id text,
    score numeric(4, 2) NOT NULL DEFAULT 5.00,
    is_baseline boolean NOT NULL DEFAULT true,
    evaluations_count integer NOT NULL DEFAULT 0,
    correct_questions_count integer NOT NULL DEFAULT 0,
    total_questions_count integer NOT NULL DEFAULT 0,
    total_score_awarded numeric(10, 4) NOT NULL DEFAULT 0,
    total_max_score numeric(10, 4) NOT NULL DEFAULT 0,
    last_attempt_id uuid,
    last_evaluated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT student_domain_evaluations_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT student_domain_evaluations_student_school_fk
        FOREIGN KEY (student_id, school_id) REFERENCES public.student_profiles(id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT student_domain_evaluations_student_fk
        FOREIGN KEY (student_id) REFERENCES public.student_profiles(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT student_domain_evaluations_domain_fk
        FOREIGN KEY (domain_id) REFERENCES public.curriculum_domains(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT student_domain_evaluations_category_fk
        FOREIGN KEY (category_id) REFERENCES public.curriculum_categories(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT student_domain_evaluations_attempt_fk
        FOREIGN KEY (last_attempt_id) REFERENCES public.test_attempts(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT student_domain_evaluations_student_domain_unique
        UNIQUE (student_id, domain_id),
    CONSTRAINT student_domain_evaluations_score_range
        CHECK (score >= 0.0 AND score <= 15.0),
    CONSTRAINT student_domain_evaluations_counts_non_negative
        CHECK (evaluations_count >= 0 AND correct_questions_count >= 0 AND total_questions_count >= 0)
);

CREATE INDEX IF NOT EXISTS student_domain_evaluations_student_idx
    ON public.student_domain_evaluations (student_id, score);

CREATE INDEX IF NOT EXISTS student_domain_evaluations_domain_idx
    ON public.student_domain_evaluations (domain_id);

CREATE INDEX IF NOT EXISTS student_domain_evaluations_school_idx
    ON public.student_domain_evaluations (school_id);

DROP TRIGGER IF EXISTS set_student_domain_evaluations_updated_at ON public.student_domain_evaluations;
CREATE TRIGGER set_student_domain_evaluations_updated_at
BEFORE UPDATE ON public.student_domain_evaluations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 3. Seed sample curated pedagogical resources for mathia-school
DO $seed$
DECLARE
    v_school_id uuid;
    v_teacher_id uuid;
BEGIN
    SELECT id INTO v_school_id FROM public.schools WHERE slug = 'mathia-school' LIMIT 1;
    SELECT id INTO v_teacher_id FROM public.teacher_profiles WHERE email = 'teacher@example.com' LIMIT 1;

    IF v_school_id IS NOT NULL AND v_teacher_id IS NOT NULL THEN
        -- Grade 6: 6.EE (Expressions & Equations) - Reinforcement & Practice
        INSERT INTO public.resources (
            school_id, created_by_teacher_id, title, description, resource_type,
            status, language, course_id, category_id, domain_id, target_level, body, url, published_at
        ) VALUES
        (
            v_school_id, v_teacher_id,
            'Guía Visual de Expresiones Algebraicas y Términos Semejantes',
            'Material de apoyo conceptual para comprender variables, coeficientes y simplificación.',
            'document', 'published', 'es', 'grade-6', 'A', '6.EE', 'reinforcement',
            '# Introducción a las Expresiones Algebraicas

Una expresión algebraica combina números, operaciones y letras (variables) que representan cantidades desconocidas.

### Conceptos Clave:
1. Variable: Letra que representa un número desconocido (ej. x, y, n).
2. Coeficiente: Número que multiplica a la variable (en 5x, el coeficiente es 5).
3. Término constante: Número sin variable (en 3x + 7, el 7 es constante).
4. Términos semejantes: Términos con exactamente las mismas variables y exponentes (ej. 4x y 9x).

### Regla de Oro:
Solo se pueden sumar o restar términos semejantes:
3x + 5x = (3 + 5)x = 8x
2x + 4 + 5x - 1 = 7x + 3',
            NULL, now()
        ),
        (
            v_school_id, v_teacher_id,
            'Vídeo Tutorial: Cómo Despejar Ecuaciones de Primer Grado',
            'Explicación en vídeo paso a paso sobre la propiedad uniforme de la igualdad para resolver ecuaciones.',
            'video', 'published', 'es', 'grade-6', 'A', '6.EE', 'reinforcement',
            NULL, 'https://www.youtube.com/watch?v=D3rI0ONOMMQ', now()
        ),
        (
            v_school_id, v_teacher_id,
            'Práctica Guiada: Aplicación de la Propiedad Distributiva',
            'Ejercicios interactivos y problemas de desarrollo con la propiedad distributiva a(b + c).',
            'exercise', 'published', 'es', 'grade-6', 'A', '6.EE', 'practice',
            'Desarrolla las siguientes expresiones y simplifica:
1. 3(2x + 4)
2. 5(x - 3) + 2x
3. 4(3x + 1) - 6x',
            NULL, now()
        ),
        -- Grade 6: 6.NS (The Number System)
        (
            v_school_id, v_teacher_id,
            'Vídeo Didáctico: Operaciones con Fracciones y Números Decimales',
            'Estrategias visuales y algoritmos para multiplicar y dividir fracciones y decimales.',
            'video', 'published', 'es', 'grade-6', 'N', '6.NS', 'practice',
            NULL, 'https://www.youtube.com/watch?v=xZ_p0tZ60t8', now()
        ),
        (
            v_school_id, v_teacher_id,
            'Ficha Resumen: Mínimo Común Múltiplo (MCM) y Máximo Común Divisor (MCD)',
            'Guía con el algoritmo de descomposición factorial en primos para resolver problemas aritméticos.',
            'document', 'published', 'es', 'grade-6', 'N', '6.NS', 'reinforcement',
            '# MCM y MCD: Métodos y Aplicaciones

Para calcular el MCM y MCD:
1. Descomponer cada número en factores primos.
2. MCD: Tomar los factores comunes con el menor exponente.
3. MCM: Tomar los factores comunes y no comunes con el mayor exponente.',
            NULL, now()
        ),
        -- Grade 6: 6.RP (Ratios & Proportional Relationships)
        (
            v_school_id, v_teacher_id,
            'Simulación Interactiva PhET: Tasas Unitarias y Razones',
            'Explora razones visuales y cálculo de precios unitarios con objetos del mundo real.',
            'link', 'published', 'es', 'grade-6', 'A', '6.RP', 'practice',
            NULL, 'https://phet.colorado.edu/sims/html/unit-rates/latest/unit-rates_all.html', now()
        ),
        -- Grade 6: 6.G (Geometry)
        (
            v_school_id, v_teacher_id,
            'Formulario Geométrico: Áreas de Polígonos y Volúmenes de Prismas',
            'Deducción visual de las fórmulas de triángulos, paralelogramos, trapecios y prismas rectos.',
            'document', 'published', 'es', 'grade-6', 'G', '6.G', 'practice',
            '# Fórmulas de Geometría
- Triángulo: A = (base * altura) / 2
- Trapecio: A = ((BaseMayor + baseMenor) * altura) / 2
- Prisma rectangular: V = largo * ancho * alto',
            NULL, now()
        ),
        -- Grade 6: 6.SP (Statistics & Probability)
        (
            v_school_id, v_teacher_id,
            'Actividad GeoGebra: Medidas de Tendencia Central y Gráficos de Caja',
            'Interactúa con conjuntos de datos y visualiza cómo la media y mediana cambian con valores extremos.',
            'link', 'published', 'es', 'grade-6', 'S', '6.SP', 'practice',
            NULL, 'https://www.geogebra.org/m/kHqC27cK', now()
        ),
        -- Grade 7: 7.RP & 7.EE
        (
            v_school_id, v_teacher_id,
            'Constante de Proporcionalidad y Pendiente Gráfica (1º ESO)',
            'Identificación de constantes unitarias y representación tabular y gráfica de relaciones proporcionales.',
            'document', 'published', 'es', 'grade-7', 'A', '7.RP', 'practice',
            '# Proporcionalidad Directa: y = kx',
            NULL, now()
        ),
        -- Grade 8: 8.F (Functions)
        (
            v_school_id, v_teacher_id,
            'Introducción a las Funciones Lineales (2º ESO)',
            'Concepto de función, dominio, recorrido y pendiente de la recta y = mx + b.',
            'video', 'published', 'es', 'grade-8', 'F', '8.F', 'practice',
            NULL, 'https://www.youtube.com/watch?v=kvZu4B6vL64', now()
        ),
        -- Grade 9: HSA-REI (3º ESO)
        (
            v_school_id, v_teacher_id,
            'Sistemas de Ecuaciones Lineales: Sustitución, Igualación y Reducción (3º ESO)',
            'Guía completa con ejemplos resueltos de los 3 métodos algebraicos.',
            'document', 'published', 'es', 'grade-9', 'A', 'HSA-REI', 'reinforcement',
            '# Resolución de Sistemas 2x2',
            NULL, now()
        ),
        -- Grade 10: HSF-IF (4º ESO)
        (
            v_school_id, v_teacher_id,
            'Estudio Completo de la Función Cuadrática: Vértice y Raíces (4º ESO)',
            'Cálculo analítico del vértice xv = -b/(2a), eje de simetría y fórmula general.',
            'document', 'published', 'es', 'grade-10', 'F', 'HSF-IF', 'practice',
            '# Parábolas y Funciones Cuadráticas: f(x) = ax^2 + bx + c',
            NULL, now()
        )
        ON CONFLICT DO NOTHING;
    END IF;
END $seed$;

-- 4. Initial sync: compute domain evaluations for existing submitted test attempts
DO $sync$
DECLARE
    r RECORD;
    v_score numeric(4, 2);
    v_correct int;
    v_total int;
    v_awarded numeric(10, 4);
    v_max numeric(10, 4);
BEGIN
    FOR r IN
        SELECT
            ta.school_id,
            ta.student_id,
            COALESCE(tvq.question_snapshot->>'domain_id', 'general') AS domain_id,
            cd.category_id,
            COUNT(DISTINCT ta.id) AS eval_count,
            COUNT(CASE WHEN taa.is_correct = true THEN 1 END) AS correct_count,
            COUNT(taq.id) AS total_count,
            COALESCE(SUM(taa.score_awarded), 0) AS total_awarded,
            COALESCE(SUM(tvq.points), 0) AS total_possible,
            (array_agg(ta.id ORDER BY ta.submitted_at DESC))[1] AS last_att_id,
            MAX(ta.submitted_at) AS last_sub_at
        FROM public.test_attempts ta
        JOIN public.test_attempt_questions taq ON taq.attempt_id = ta.id
        JOIN public.test_version_questions tvq ON tvq.id = taq.test_version_question_id
        LEFT JOIN public.test_attempt_answers taa ON taa.attempt_question_id = taq.id
        LEFT JOIN public.curriculum_domains cd ON cd.id = (tvq.question_snapshot->>'domain_id')
        WHERE ta.status IN ('submitted', 'graded')
          AND tvq.question_snapshot->>'domain_id' IS NOT NULL
        GROUP BY ta.school_id, ta.student_id, tvq.question_snapshot->>'domain_id', cd.category_id
    LOOP
        IF r.total_possible > 0 THEN
            v_score := ROUND(((r.total_awarded / r.total_possible) * 15.0)::numeric, 2);
        ELSE
            v_score := 5.00;
        END IF;

        INSERT INTO public.student_domain_evaluations (
            school_id, student_id, domain_id, category_id,
            score, is_baseline, evaluations_count,
            correct_questions_count, total_questions_count,
            total_score_awarded, total_max_score,
            last_attempt_id, last_evaluated_at
        ) VALUES (
            r.school_id, r.student_id, r.domain_id, r.category_id,
            v_score, false, r.eval_count,
            r.correct_count, r.total_count,
            r.total_awarded, r.total_possible,
            r.last_att_id, r.last_sub_at
        )
        ON CONFLICT (student_id, domain_id) DO UPDATE SET
            score = EXCLUDED.score,
            is_baseline = false,
            evaluations_count = EXCLUDED.evaluations_count,
            correct_questions_count = EXCLUDED.correct_questions_count,
            total_questions_count = EXCLUDED.total_questions_count,
            total_score_awarded = EXCLUDED.total_score_awarded,
            total_max_score = EXCLUDED.total_max_score,
            last_attempt_id = EXCLUDED.last_attempt_id,
            last_evaluated_at = EXCLUDED.last_evaluated_at,
            updated_at = now();
    END LOOP;
END $sync$;

-- 5. Trigger to automatically re-evaluate student pedagogical domain profile when an attempt is completed
CREATE OR REPLACE FUNCTION public.fn_sync_student_domain_evaluations()
RETURNS trigger AS $fn$
DECLARE
    r RECORD;
    v_score numeric(4, 2);
BEGIN
    FOR r IN
        SELECT
            NEW.school_id AS school_id,
            NEW.student_id AS student_id,
            COALESCE(tvq.question_snapshot->>'domain_id', 'general') AS domain_id,
            cd.category_id AS category_id,
            COUNT(DISTINCT ta.id) AS eval_count,
            COUNT(CASE WHEN taa.is_correct = true THEN 1 END) AS correct_count,
            COUNT(taq.id) AS total_count,
            COALESCE(SUM(taa.score_awarded), 0) AS total_awarded,
            COALESCE(SUM(tvq.points), 0) AS total_possible,
            (array_agg(ta.id ORDER BY ta.submitted_at DESC NULLS LAST))[1] AS last_att_id,
            MAX(ta.submitted_at) AS last_sub_at
        FROM public.test_attempts ta
        JOIN public.test_attempt_questions taq ON taq.attempt_id = ta.id
        JOIN public.test_version_questions tvq ON tvq.id = taq.test_version_question_id
        LEFT JOIN public.test_attempt_answers taa ON taa.attempt_question_id = taq.id
        LEFT JOIN public.curriculum_domains cd ON cd.id = (tvq.question_snapshot->>'domain_id')
        WHERE ta.student_id = NEW.student_id
          AND ta.status IN ('submitted', 'graded')
          AND tvq.question_snapshot->>'domain_id' IS NOT NULL
        GROUP BY tvq.question_snapshot->>'domain_id', cd.category_id
    LOOP
        IF r.total_possible > 0 THEN
            v_score := ROUND(((r.total_awarded / r.total_possible) * 15.0)::numeric, 2);
        ELSE
            v_score := 5.00;
        END IF;

        INSERT INTO public.student_domain_evaluations (
            school_id, student_id, domain_id, category_id,
            score, is_baseline, evaluations_count,
            correct_questions_count, total_questions_count,
            total_score_awarded, total_max_score,
            last_attempt_id, last_evaluated_at, updated_at
        ) VALUES (
            r.school_id, r.student_id, r.domain_id, r.category_id,
            v_score, false, r.eval_count,
            r.correct_count, r.total_count,
            r.total_awarded, r.total_possible,
            r.last_att_id, r.last_sub_at, now()
        )
        ON CONFLICT (student_id, domain_id) DO UPDATE SET
            score = EXCLUDED.score,
            is_baseline = false,
            evaluations_count = EXCLUDED.evaluations_count,
            correct_questions_count = EXCLUDED.correct_questions_count,
            total_questions_count = EXCLUDED.total_questions_count,
            total_score_awarded = EXCLUDED.total_score_awarded,
            total_max_score = EXCLUDED.total_max_score,
            last_attempt_id = EXCLUDED.last_attempt_id,
            last_evaluated_at = EXCLUDED.last_evaluated_at,
            updated_at = now();
    END LOOP;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_student_domain_evaluations ON public.test_attempts;
CREATE TRIGGER trg_sync_student_domain_evaluations
AFTER INSERT OR UPDATE OF status, score, graded_at ON public.test_attempts
FOR EACH ROW
WHEN (NEW.status IN ('submitted', 'graded'))
EXECUTE FUNCTION public.fn_sync_student_domain_evaluations();

COMMIT;

