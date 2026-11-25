-- Migration: Controlled Class Grade Level
-- Enforce classes.grade_level as a controlled reference to curriculum_courses(id)

-- 1. Normalize existing classes to canonical course IDs
UPDATE public.classes
SET grade_level = 'grade-7'
WHERE grade_level ILIKE '%1%secundaria%'
   OR grade_level ILIKE '%1%eso%'
   OR grade_level = '7'
   OR grade_level ILIKE '%grade-7%';

UPDATE public.classes
SET grade_level = 'grade-8'
WHERE grade_level ILIKE '%2%secundaria%'
   OR grade_level ILIKE '%2%eso%'
   OR grade_level = '8'
   OR grade_level ILIKE '%grade-8%';

UPDATE public.classes
SET grade_level = 'grade-9'
WHERE grade_level ILIKE '%3%secundaria%'
   OR grade_level ILIKE '%3%eso%'
   OR grade_level = '9'
   OR grade_level ILIKE '%grade-9%';

UPDATE public.classes
SET grade_level = 'grade-10'
WHERE grade_level ILIKE '%4%secundaria%'
   OR grade_level ILIKE '%4%eso%'
   OR grade_level = '10'
   OR grade_level ILIKE '%grade-10%';

UPDATE public.classes
SET grade_level = 'grade-6'
WHERE grade_level ILIKE '%6%primaria%'
   OR grade_level = '6'
   OR grade_level ILIKE '%grade-6%';

-- Fallback for any other remaining unmatched non-null value to avoid constraint violation
UPDATE public.classes
SET grade_level = NULL
WHERE grade_level IS NOT NULL
  AND grade_level NOT IN (SELECT id FROM public.curriculum_courses);

-- 2. Add foreign key constraint referencing curriculum_courses(id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'classes_grade_level_course_fk'
    ) THEN
        ALTER TABLE public.classes
        ADD CONSTRAINT classes_grade_level_course_fk
        FOREIGN KEY (grade_level) REFERENCES public.curriculum_courses(id)
        ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END $$;

