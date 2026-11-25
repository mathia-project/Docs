"""Unit tests for AI-assisted question generation schemas, validation, and proposal generation."""

import pytest
from pydantic import ValidationError

from app.schemas.question_generation import (
    CurriculumRoute,
    GeneratedAnswerConfig,
    GeneratedOption,
    GeneratedQuestionItem,
    QuestionGenerationRequest,
)
from app.services.question_generator import _build_fallback_questions


def test_single_choice_validation():
    curr = CurriculumRoute(domain_code="6.RP", cluster_code="6.RP.A", standard_code="6.RP.A.1")
    
    # Valid single choice
    q = GeneratedQuestionItem(
        question_type="single_choice",
        prompt="What is 1 + 1?",
        options=[
            GeneratedOption(key="A", content="2"),
            GeneratedOption(key="B", content="3"),
        ],
        correct_options=["A"],
        difficulty="easy",
        language="en",
        curriculum=curr,
    )
    assert q.question_type == "single_choice"
    assert len(q.options) == 2

    # Invalid: fewer than 2 options
    with pytest.raises(ValidationError):
        GeneratedQuestionItem(
            question_type="single_choice",
            prompt="What is 1 + 1?",
            options=[GeneratedOption(key="A", content="2")],
            correct_options=["A"],
            difficulty="easy",
            language="en",
            curriculum=curr,
        )

    # Invalid: correct option not in options
    with pytest.raises(ValidationError):
        GeneratedQuestionItem(
            question_type="single_choice",
            prompt="What is 1 + 1?",
            options=[
                GeneratedOption(key="A", content="2"),
                GeneratedOption(key="B", content="3"),
            ],
            correct_options=["C"],
            difficulty="easy",
            language="en",
            curriculum=curr,
        )

    # Invalid: more than 1 correct option for single_choice
    with pytest.raises(ValidationError):
        GeneratedQuestionItem(
            question_type="single_choice",
            prompt="What is 1 + 1?",
            options=[
                GeneratedOption(key="A", content="2"),
                GeneratedOption(key="B", content="3"),
            ],
            correct_options=["A", "B"],
            difficulty="easy",
            language="en",
            curriculum=curr,
        )


def test_multiple_choice_validation():
    curr = CurriculumRoute(domain_code="6.RP", cluster_code="6.RP.A", standard_code="6.RP.A.1")
    
    # Valid multiple choice
    q = GeneratedQuestionItem(
        question_type="multiple_choice",
        prompt="Which are prime numbers?",
        options=[
            GeneratedOption(key="A", content="2"),
            GeneratedOption(key="B", content="3"),
            GeneratedOption(key="C", content="4"),
        ],
        correct_options=["A", "B"],
        difficulty="medium",
        language="en",
        curriculum=curr,
    )
    assert len(q.correct_options) == 2

    # Invalid: no correct options declared
    with pytest.raises(ValidationError):
        GeneratedQuestionItem(
            question_type="multiple_choice",
            prompt="Which are prime numbers?",
            options=[
                GeneratedOption(key="A", content="2"),
                GeneratedOption(key="B", content="3"),
            ],
            correct_options=[],
            difficulty="medium",
            language="en",
            curriculum=curr,
        )


def test_true_false_validation():
    curr = CurriculumRoute(domain_code="6.RP", cluster_code="6.RP.A", standard_code="6.RP.A.1")
    
    # Valid true_false
    q = GeneratedQuestionItem(
        question_type="true_false",
        prompt="2 is prime.",
        options=[
            GeneratedOption(key="A", content="True"),
            GeneratedOption(key="B", content="False"),
        ],
        correct_options=["A"],
        difficulty="easy",
        language="en",
        curriculum=curr,
    )
    assert q.question_type == "true_false"

    # Invalid: 3 options for true_false
    with pytest.raises(ValidationError):
        GeneratedQuestionItem(
            question_type="true_false",
            prompt="2 is prime.",
            options=[
                GeneratedOption(key="A", content="True"),
                GeneratedOption(key="B", content="False"),
                GeneratedOption(key="C", content="Maybe"),
            ],
            correct_options=["A"],
            difficulty="easy",
            language="en",
            curriculum=curr,
        )


def test_numeric_validation():
    curr = CurriculumRoute(domain_code="6.RP", cluster_code="6.RP.A", standard_code="6.RP.A.1")
    
    # Valid numeric
    q = GeneratedQuestionItem(
        question_type="numeric",
        prompt="Solve 5 * 5",
        difficulty="easy",
        language="en",
        curriculum=curr,
        answer_config=GeneratedAnswerConfig(correct_value=25.0, tolerance=0.1),
    )
    assert q.options == []
    assert q.correct_options == []
    assert q.answer_config.correct_value == 25.0

    # Invalid numeric: missing correct_value
    with pytest.raises(ValidationError):
        GeneratedQuestionItem(
            question_type="numeric",
            prompt="Solve 5 * 5",
            difficulty="easy",
            language="en",
            curriculum=curr,
            answer_config=GeneratedAnswerConfig(correct_value=None),
        )

    # Invalid numeric: negative tolerance
    with pytest.raises(ValidationError):
        GeneratedAnswerConfig(correct_value=10.0, tolerance=-1.0)


def test_question_generation_request_bounds():
    # Valid request
    req = QuestionGenerationRequest(
        course_id="grade-6",
        domain_id="6.RP",
        cluster_id="6.RP.A",
        standard_id="6.RP.A.1",
        question_type="single_choice",
        difficulty="medium",
        quantity=5,
    )
    assert req.quantity == 5

    # Invalid: quantity > 25 (max limit specified in prompt)
    with pytest.raises(ValidationError):
        QuestionGenerationRequest(
            course_id="grade-6",
            domain_id="6.RP",
            cluster_id="6.RP.A",
            standard_id="6.RP.A.1",
            question_type="single_choice",
            difficulty="medium",
            quantity=26,
        )

    # Invalid: quantity < 1
    with pytest.raises(ValidationError):
        QuestionGenerationRequest(
            course_id="grade-6",
            domain_id="6.RP",
            cluster_id="6.RP.A",
            standard_id="6.RP.A.1",
            question_type="single_choice",
            difficulty="medium",
            quantity=0,
        )


def test_fallback_questions_builder():
    req = QuestionGenerationRequest(
        course_id="grade-6",
        domain_id="6.RP",
        cluster_id="6.RP.A",
        standard_id="6.RP.A.1",
        question_type="single_choice",
        difficulty="easy",
        language="es",
        quantity=3,
        request_id="req-12345",
    )
    curr_info = {
        "course": {"id": "grade-6", "grade_level": 6},
        "domain": {"id": "6.RP", "code": "6.RP"},
        "cluster": {"id": "6.RP.A", "code": "6.RP.A"},
        "standard": {
            "id": "6.RP.A.1",
            "code": "6.RP.A.1",
            "ccss_id": "CCSS.MATH.CONTENT.6.RP.A.1",
            "description": {"es": "Comprender el concepto de razón."},
        },
        "substandard": None,
    }
    questions = _build_fallback_questions(req, curr_info)
    assert len(questions) == 3
    for q in questions:
        assert q.question_type == "single_choice"
        assert len(q.options) == 4
        assert q.correct_options == ["A"]
        assert q.curriculum.domain_code == "6.RP"
        assert q.curriculum.standard_code == "6.RP.A.1"
        assert q.external_id.startswith("AI-6RPA1-")


@pytest.mark.parametrize("question_type", ["single_choice", "multiple_choice", "true_false", "numeric"])
def test_italian_question_generation_fallback(question_type):
    req = QuestionGenerationRequest(
        course_id="grade-6",
        domain_id="6.RP",
        cluster_id="6.RP.A",
        standard_id="6.RP.A.1",
        question_type=question_type,
        difficulty="easy",
        language="it",
        quantity=1,
    )
    curriculum = {
        "course": {"id": "grade-6"},
        "domain": {"id": "6.RP", "code": "6.RP"},
        "cluster": {"id": "6.RP.A", "code": "6.RP.A"},
        "standard": {
            "id": "6.RP.A.1",
            "code": "6.RP.A.1",
            "ccss_id": "CCSS.MATH.CONTENT.6.RP.A.1",
            "description": {"es": "Comprender el concepto de razón."},
        },
        "substandard": None,
    }

    question = _build_fallback_questions(req, curriculum)[0]
    assert question.language == "it"
    assert "Comprender" not in question.prompt
    assert question.explanation == "La risposta selezionata è corretta."
    if question_type == "true_false":
        assert [option.content for option in question.options] == ["Vero", "Falso"]
    if question_type == "single_choice":
        assert question.options[0].content.startswith("L'affermazione")
