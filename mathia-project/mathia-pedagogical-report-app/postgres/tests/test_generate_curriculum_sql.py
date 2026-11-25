"""Tests for the deterministic CCSS-to-PostgreSQL generator."""

import json
import sys
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from generate_curriculum_sql import DEFAULT_DATA, generate, sql_text  # noqa: E402


class CurriculumSqlGeneratorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = json.loads(DEFAULT_DATA.read_text(encoding="utf-8"))
        cls.sql = generate(cls.document)

    def test_generation_is_deterministic(self):
        self.assertEqual(self.sql, generate(self.document))

    def test_all_catalog_records_are_emitted(self):
        for item_id in self.document["categories"]:
            self.assertIn(sql_text(item_id), self.sql)
        for item_id in self.document["standards"]:
            self.assertIn(sql_text(item_id), self.sql)
        for item_id in self.document["substandards"]:
            self.assertIn(sql_text(item_id), self.sql)

    def test_quotes_are_escaped_for_postgresql(self):
        self.assertEqual(sql_text("teacher's"), "'teacher''s'")

    def test_course_domains_are_emitted(self):
        self.assertIn("DELETE FROM public.curriculum_course_domains;", self.sql)
        self.assertIn("INSERT INTO public.curriculum_course_domains", self.sql)
        count = 0
        for course in self.document["courses"]:
            for category in course["categories"]:
                for domain in category["domains"]:
                    expected_snippet = f"({sql_text(course['id'])}, {sql_text(domain['domainId'])})"
                    self.assertIn(expected_snippet, self.sql)
                    count += 1
        self.assertEqual(count, 42)

    def test_seed_is_transactional_and_idempotent(self):
        self.assertTrue(self.sql.startswith("-- Generated"))
        self.assertIn("BEGIN;", self.sql)
        self.assertIn("ON CONFLICT (id) DO UPDATE SET", self.sql)
        self.assertTrue(self.sql.endswith("COMMIT;\n"))


if __name__ == "__main__":
    unittest.main()
