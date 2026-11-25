from app.services.evaluator import evaluate_single_answer


def test_evaluate_single_choice() -> None:
    scoring_key = {"correct_option_key": "B"}
    snapshot = {"question_type": "single_choice"}

    # Correct
    is_correct, score = evaluate_single_answer(
        question_type="single_choice",
        scoring_key=scoring_key,
        snapshot=snapshot,
        answer_payload={"selected_option_key": "B"},
        points=2.0,
    )
    assert is_correct is True
    assert score == 2.0

    # Incorrect
    is_correct, score = evaluate_single_answer(
        question_type="single_choice",
        scoring_key=scoring_key,
        snapshot=snapshot,
        answer_payload={"selected_option_key": "A"},
        points=2.0,
    )
    assert is_correct is False
    assert score == 0.0

    # Null answer
    is_correct, score = evaluate_single_answer(
        question_type="single_choice",
        scoring_key=scoring_key,
        snapshot=snapshot,
        answer_payload=None,
        points=2.0,
    )
    assert is_correct is False
    assert score == 0.0


def test_evaluate_multiple_choice() -> None:
    scoring_key = {"correct_option_keys": ["A", "C"]}
    snapshot = {"question_type": "multiple_choice"}

    # All correct in different order
    is_correct, score = evaluate_single_answer(
        question_type="multiple_choice",
        scoring_key=scoring_key,
        snapshot=snapshot,
        answer_payload={"selected_option_keys": ["C", "A"]},
        points=3.0,
    )
    assert is_correct is True
    assert score == 3.0

    # Partial (missing C)
    is_correct, score = evaluate_single_answer(
        question_type="multiple_choice",
        scoring_key=scoring_key,
        snapshot=snapshot,
        answer_payload={"selected_option_keys": ["A"]},
        points=3.0,
    )
    assert is_correct is False
    assert score == 0.0

    # Extra incorrect option
    is_correct, score = evaluate_single_answer(
        question_type="multiple_choice",
        scoring_key=scoring_key,
        snapshot=snapshot,
        answer_payload={"selected_option_keys": ["A", "B", "C"]},
        points=3.0,
    )
    assert is_correct is False
    assert score == 0.0


def test_evaluate_numeric() -> None:
    scoring_key = {"answer_config": {"correct_value": 42.5, "tolerance": 0.5}}
    snapshot = {"question_type": "numeric"}

    # Exact
    is_correct, score = evaluate_single_answer(
        question_type="numeric",
        scoring_key=scoring_key,
        snapshot=snapshot,
        answer_payload={"numeric_value": 42.5},
        points=1.5,
    )
    assert is_correct is True
    assert score == 1.5

    # Within tolerance
    is_correct, score = evaluate_single_answer(
        question_type="numeric",
        scoring_key=scoring_key,
        snapshot=snapshot,
        answer_payload={"numeric_value": 42.8},
        points=1.5,
    )
    assert is_correct is True
    assert score == 1.5

    # Outside tolerance
    is_correct, score = evaluate_single_answer(
        question_type="numeric",
        scoring_key=scoring_key,
        snapshot=snapshot,
        answer_payload={"numeric_value": 43.1},
        points=1.5,
    )
    assert is_correct is False
    assert score == 0.0


def test_evaluate_fallback_to_options_in_snapshot() -> None:
    scoring_key = None
    snapshot = {
        "question_type": "single_choice",
        "options": [
            {"option_key": "X", "is_correct": False},
            {"option_key": "Y", "is_correct": True},
        ],
    }

    is_correct, score = evaluate_single_answer(
        question_type="single_choice",
        scoring_key=scoring_key,
        snapshot=snapshot,
        answer_payload={"selected_option_key": "Y"},
        points=1.0,
    )
    assert is_correct is True
    assert score == 1.0


if __name__ == "__main__":
    test_evaluate_single_choice()
    test_evaluate_multiple_choice()
    test_evaluate_numeric()
    test_evaluate_fallback_to_options_in_snapshot()
    print("All 4 evaluator test suites passed successfully!")

