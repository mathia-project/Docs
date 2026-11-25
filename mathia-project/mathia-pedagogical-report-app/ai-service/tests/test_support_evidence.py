import pytest

from app.services.support_evidence import assess_response_evidence


@pytest.mark.parametrize("total", [0, 1, 29])
def test_fewer_than_30_responses_blocks_prediction(total: int) -> None:
    evidence = assess_response_evidence(total)

    assert evidence.level == "insufficient"
    assert evidence.can_predict is False
    assert evidence.suggests_educational_support is None
    assert evidence.state == "Información insuficiente"
    assert evidence.model_used == "sin_prediccion_respuestas_insuficientes"
    assert "30" in evidence.reason


@pytest.mark.parametrize("total", [30, 31, 89])
def test_30_to_89_responses_allows_prediction_with_limited_evidence(total: int) -> None:
    evidence = assess_response_evidence(total)

    assert evidence.level == "limited"
    assert evidence.can_predict is True
    assert evidence.volume_outside_fit_range is False
    assert "evidencia limitada" in evidence.reason


@pytest.mark.parametrize("total", [90, 91, 204])
def test_90_to_204_responses_has_standard_evidence(total: int) -> None:
    evidence = assess_response_evidence(total)

    assert evidence.level == "standard"
    assert evidence.can_predict is True
    assert evidence.volume_outside_fit_range is False
    assert evidence.reason == ""


@pytest.mark.parametrize("total", [205, 500])
def test_more_than_204_responses_keeps_prediction_and_marks_range_warning(total: int) -> None:
    evidence = assess_response_evidence(total)

    assert evidence.level == "standard"
    assert evidence.can_predict is True
    assert evidence.volume_outside_fit_range is True
    assert "204" in evidence.reason


@pytest.mark.parametrize("total", [-1, True])
def test_invalid_response_volume_is_rejected(total: int) -> None:
    with pytest.raises(ValueError, match="entero no negativo"):
        assess_response_evidence(total)
