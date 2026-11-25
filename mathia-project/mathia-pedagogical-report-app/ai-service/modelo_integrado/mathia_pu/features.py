"""One student, one fixed response-history summary; no assigned-item totals.

Counts retain repeated attempts deliberately. Empty performance strata remain
missing rather than being confused with observed zero accuracy. Diagnosis is
used only to construct training status and is never a model feature.
"""

from __future__ import annotations

import numbers
import unicodedata
from collections.abc import Mapping
from typing import Any

import numpy as np
import pandas as pd


DIFFICULTIES = ("D1", "D2", "D3")
COURSES = (1, 2, 3, 4)
COURSE_DIFFICULTIES = tuple(f"Curso{course}_{difficulty}" for course in COURSES for difficulty in DIFFICULTIES)
CATEGORIES = ("Algebra", "Numeros", "Geometria", "Estadistica", "Funciones")
COUNT_COLUMNS = ["TotalRealizados"] + [
    f"Realizados_{stratum}" for stratum in (*COURSE_DIFFICULTIES, *CATEGORIES)
]
SEX_COLUMN = "Sexo(M=1)"
BASE_FEATURE_COLUMNS = [SEX_COLUMN, "TotalRealizados", "ProporcionAciertos"] + [
    column
    for stratum in (*COURSE_DIFFICULTIES, *CATEGORIES)
    for column in (f"Realizados_{stratum}", f"ProporcionAciertos_{stratum}")
]
TIME_FEATURE_COLUMNS = ["TiempoMediana", "TiempoIQR"] + [
    f"TiempoMediana_{stratum}" for stratum in (*COURSE_DIFFICULTIES, *CATEGORIES)
]
TIME_COUNT_COLUMNS = ["TiemposValidos"] + [
    f"TiemposValidos_{stratum}" for stratum in (*COURSE_DIFFICULTIES, *CATEGORIES)
]
FEATURE_COLUMNS = BASE_FEATURE_COLUMNS + TIME_FEATURE_COLUMNS
# Time counts describe coverage; they are deliberately not predictors.
SUMMARY_COLUMNS = FEATURE_COLUMNS + TIME_COUNT_COLUMNS


def _missing(value: Any) -> bool:
    return bool(pd.isna(value)) or (isinstance(value, str) and not value.strip())


def _identifier(value: Any) -> str:
    """Normalize numeric IDs without changing leading zeroes in text IDs."""
    if _missing(value):
        raise ValueError("El identificador de alumno o grupo no puede estar vacío.")
    if isinstance(value, numbers.Integral) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, numbers.Real) and not isinstance(value, bool):
        if not np.isfinite(value):
            raise ValueError("El identificador de alumno o grupo debe ser finito.")
        if float(value).is_integer():
            return str(int(value))
    return str(value).strip()


def _key(value: Any) -> str:
    if _missing(value):
        return ""
    value = _identifier(value)
    value = unicodedata.normalize("NFKD", value.casefold())
    return " ".join("".join(c for c in value if not unicodedata.combining(c)).split())


def _flag(value: Any, column: str, allow_missing: bool = False) -> int | None:
    if _missing(value):
        if allow_missing:
            return None
        raise ValueError(f"La columna {column!r} contiene una respuesta obligatoria vacía.")
    key = _key(value)
    if key in {"s", "si", "1"}:
        return 1
    if key in {"n", "no", "0"}:
        return 0
    raise ValueError(f"La columna {column!r} debe contener S/N o 1/0.")


def normalize_sex(value):
    """Codificación original; nunca inferir sexo ni imputar desconocidos."""
    if isinstance(value, (bool, np.bool_)):
        raise ValueError("Sexo(M=1) debe contener 0 o 1, no booleanos.")
    key = _key(value)
    if key not in {"0", "1", "0.0", "1.0"}:
        raise ValueError("Sexo(M=1) es obligatorio y debe contener 0 o 1.")
    return int(float(key))


def normalize_course(value):
    """Nivel de la respuesta, sin sumar curso y dificultad ni asumir equivalencias."""
    if isinstance(value, (bool, np.bool_)):
        raise ValueError("Curso debe ser 1, 2, 3 o 4.")
    key = _key(value)
    if key not in {str(c) for c in COURSES} | {f"{c}.0" for c in COURSES}:
        raise ValueError("Curso es obligatorio en respuestas realizadas y debe ser 1, 2, 3 o 4.")
    return int(float(key))


def _label_sets(config: Mapping[str, Any]) -> dict[str, set[str]]:
    statuses: dict[str, set[str]] = {}
    for field, status in (
        ("positive_diagnoses", "P"),
        ("unlabeled_diagnoses", "U"),
        ("excluded_diagnoses", "EXCLUIDO"),
    ):
        values = config.get(field, [])
        if not isinstance(values, (list, tuple, set)):
            raise ValueError(f"{field} debe ser una lista de etiquetas.")
        statuses[status] = {_key(value) for value in values}
    # A blank diagnosis explicitly represents unknown, regardless of the lists.
    if "" in statuses["P"] or "" in statuses["EXCLUIDO"]:
        raise ValueError("Un diagnóstico vacío solo puede representar un alumno no etiquetado.")
    statuses["U"].add("")
    if not statuses["P"]:
        raise ValueError("Debe definirse al menos una etiqueta en positive_diagnoses.")
    if (
        statuses["P"] & statuses["U"]
        or statuses["P"] & statuses["EXCLUIDO"]
        or statuses["U"] & statuses["EXCLUIDO"]
    ):
        raise ValueError("Las listas de diagnósticos positivos, no etiquetados y excluidos se solapan.")
    return statuses


def _category_mapping(config: Mapping[str, Any]) -> dict[str, str]:
    canonical = {_key(category): category for category in CATEGORIES}
    mapping = dict(canonical)
    supplied = config.get("category_map", {})
    if not isinstance(supplied, Mapping):
        raise ValueError("category_map debe ser un objeto de etiqueta original a categoría Big Five.")
    for original, category in supplied.items():
        normalized_original = _key(original)
        normalized_category = _key(category)
        if not normalized_original or normalized_category not in canonical:
            raise ValueError("category_map contiene una etiqueta vacía o una categoría Big Five desconocida.")
        resolved = canonical[normalized_category]
        if normalized_original in mapping and mapping[normalized_original] != resolved:
            raise ValueError("category_map contiene asignaciones incompatibles tras normalizar las etiquetas.")
        mapping[normalized_original] = resolved
    return mapping


def _response_times(
    source: pd.DataFrame, performed: pd.Series, config: Mapping[str, Any]
) -> tuple[np.ndarray, dict[str, Any]]:
    """Parse only completed responses; invalid times never invalidate a pupil."""
    column = config["columns"].get("response_time", "TiempoRespuesta")
    if not isinstance(column, str) or not column.strip():
        raise ValueError("columns.response_time debe ser un nombre de columna no vacío.")
    settings = config.get("time", {})
    if not isinstance(settings, Mapping):
        raise ValueError("time debe ser un objeto de configuración.")
    unit = settings.get("input_unit", "ms")
    factors = {"native": 1.0, "s": 1.0, "ms": 0.001, "min": 60.0}
    if not isinstance(unit, str) or unit not in factors:
        raise ValueError("time.input_unit debe ser native, s, ms o min.")
    zero_is_missing = settings.get("zero_is_missing", True)
    if not isinstance(zero_is_missing, bool):
        raise ValueError("time.zero_is_missing debe ser true o false.")
    present = column in source.columns
    result = np.full(len(source), np.nan)
    audit: dict[str, Any] = {
        "column": column,
        "column_present": present,
        "input_unit": unit,
        "output_unit": "native" if unit == "native" else "s",
        "zero_is_missing": zero_is_missing,
        "performed": int(performed.sum()),
        "valid": 0,
        "missing": 0,
        "blank": 0,
        "non_numeric": 0,
        "non_finite": 0,
        "negative": 0,
        "zero_excluded": 0,
    }
    positions = np.flatnonzero(performed.to_numpy())
    raw_times = source.loc[performed, column].tolist() if present else [None] * len(positions)
    for position, value in zip(positions, raw_times):
        if _missing(value):
            audit["blank"] += 1
            continue
        if isinstance(value, (bool, np.bool_)):
            audit["non_numeric"] += 1
            continue
        try:
            parsed = float(value)
        except (ValueError, TypeError):
            audit["non_numeric"] += 1
            continue
        except OverflowError:
            audit["non_finite"] += 1
            continue
        if not np.isfinite(parsed):
            audit["non_finite"] += 1
        elif parsed < 0:
            audit["negative"] += 1
        elif parsed == 0 and zero_is_missing:
            audit["zero_excluded"] += 1
        else:
            converted = parsed * factors[unit]
            if not np.isfinite(converted):
                audit["non_finite"] += 1
                continue
            result[position] = converted
            audit["valid"] += 1
    audit["missing"] = audit["performed"] - audit["valid"]
    return result, audit


def _time_statistics(values: pd.Series) -> dict[str, float | None]:
    valid = values.dropna()
    names = ("min", "q25", "median", "q75", "p99", "max")
    if valid.empty:
        return dict.fromkeys(names)
    quantiles = valid.quantile([0.25, 0.5, 0.75, 0.99], interpolation="linear")
    return dict(zip(names, [float(valid.min()), *map(float, quantiles), float(valid.max())]))


def _time_profile(completed: pd.DataFrame) -> dict[str, Any]:
    count = int(completed["_time"].notna().sum())
    return {
        "performed": int(len(completed)),
        "valid": count,
        "missing": int(len(completed) - count),
        "coverage": count / len(completed) if len(completed) else None,
        "stats": _time_statistics(completed["_time"]),
    }


def _add_time_audit(
    audit: dict[str, Any], work: pd.DataFrame, source: pd.DataFrame,
    group_column: str | None, id_columns: list[str],
) -> None:
    completed = work.loc[work["_performed"].eq(1)]
    profile = _time_profile(completed)
    audit.update(stats=profile["stats"], coverage=profile["coverage"])
    for key, axis, strata in (
        ("by_difficulty", "_difficulty", DIFFICULTIES),
        ("by_course_difficulty", "_course_difficulty", COURSE_DIFFICULTIES),
        ("by_category", "_category", CATEGORIES),
    ):
        audit[key] = {
            stratum: _time_profile(completed.loc[completed[axis].eq(stratum)])
            for stratum in strata
        }
    group_columns = list(dict.fromkeys(
        ([group_column] if group_column else [])
        + [column for column in source.columns if _key(column) in {"pais", "colegio"}]
    ))
    audit["by_group"] = {}
    for column in group_columns:
        # School/country can form part of a compound ID; never publish pupil IDs.
        if column in id_columns and _key(column) not in {"pais", "colegio"}:
            continue
        grouped = completed.copy()
        grouped["_audit_group"] = source.loc[completed.index, column].map(
            lambda value: None if _missing(value) else _identifier(value)
        )
        audit["by_group"][column] = [
            {"group": None if _missing(label) else str(label), **_time_profile(history)}
            for label, history in grouped.groupby("_audit_group", sort=False, dropna=False)
        ]


def aggregate_responses(
    df: pd.DataFrame,
    config: Mapping[str, Any],
    training: bool = False,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Aggregate every pupil, including pupils without completed responses.

    ``config['columns']`` supplies source-column names. ``student_id`` is a
    nonempty list of columns (or one column name). For training, diagnoses must
    be explicitly assigned to positive, unlabeled or excluded sets. Any positive
    history yields P; otherwise any excluded label yields EXCLUIDO; otherwise U.
    EXCLUIDO pupils are retained so callers can report and filter them explicitly.

    Validation groups must be present at training time and, when supplied, must
    be nonempty and constant within each pupil. At inference an absent validation
    group is allowed unless it is part of the pupil ID. No values from diagnostic histories are inspected during
    inference. Response times are optional, converted only from declared units,
    and summarized independently of correctness. Missing time does not discard
    a pupil or a response. The audit contains group summaries, never pupil IDs.
    """
    if not isinstance(df, pd.DataFrame) or df.empty:
        raise ValueError("Se requiere un dataframe no vacío de respuestas.")
    if not df.columns.is_unique:
        raise ValueError("El dataset contiene nombres de columnas duplicados.")
    if not isinstance(config, Mapping) or not isinstance(config.get("columns"), Mapping):
        raise ValueError("La configuración debe incluir el objeto columns.")
    columns = config["columns"]
    id_columns = columns.get("student_id")
    if isinstance(id_columns, str):
        id_columns = [id_columns]
    if (
        not isinstance(id_columns, (list, tuple))
        or not id_columns
        or any(not isinstance(column, str) or not column.strip() for column in id_columns)
        or len(set(id_columns)) != len(id_columns)
    ):
        raise ValueError("columns.student_id debe contener nombres de columnas distintos y no vacíos.")
    id_columns = list(id_columns)
    roles = ["sex", "course", "performed", "correct", "difficulty", "category"]
    if training:
        roles.append("diagnosis")
    for role in roles:
        if not isinstance(columns.get(role), str) or not columns[role].strip():
            raise ValueError(f"Debe configurarse columns.{role}.")
    group_column = columns.get("validation_group")
    if group_column is not None and (
        not isinstance(group_column, str) or not group_column.strip()
    ):
        raise ValueError("columns.validation_group debe ser un nombre de columna o null.")
    if not training and group_column not in df.columns:
        group_column = None
    preserved = id_columns + ([group_column] if group_column and group_column not in id_columns else [])
    if set(preserved) & set(SUMMARY_COLUMNS + ["EstadoPU"]):
        raise ValueError("Las columnas de identificación no pueden usar nombres reservados de características.")
    required = list(dict.fromkeys(preserved + [columns[role] for role in roles]))
    absent = [column for column in required if column not in df.columns]
    if absent:
        raise ValueError(f"Faltan columnas requeridas: {', '.join(absent)}.")

    source = df.reset_index(drop=True)
    ids = [source[column].map(_identifier).tolist() for column in id_columns]
    work = pd.DataFrame({"_student": list(zip(*ids))})
    work["_sex"] = source[columns["sex"]].map(normalize_sex)
    work["_performed"] = source[columns["performed"]].map(
        lambda value: _flag(value, columns["performed"])
    )
    correctness = source[columns["correct"]].map(
        lambda value: _flag(value, columns["correct"], allow_missing=True)
    )
    if (work["_performed"].eq(1) & correctness.isna()).any():
        raise ValueError("Hay ejercicios realizados sin valor en Correcto.")
    if (work["_performed"].eq(0) & correctness.eq(1)).any():
        raise ValueError("Hay ejercicios no realizados marcados como correctos.")
    work["_correct"] = correctness

    category_map = _category_mapping(config)
    difficulty_map = {_key(value): value for value in DIFFICULTIES}
    work["_difficulty"] = None
    work["_category"] = None
    performed = work["_performed"].eq(1)
    work["_course"] = np.nan
    work.loc[performed, "_course"] = source.loc[performed, columns["course"]].map(normalize_course)
    for role, mapping in (("difficulty", difficulty_map), ("category", category_map)):
        keys = source.loc[performed, columns[role]].map(_key)
        if not keys.isin(mapping).all():
            raise ValueError(
                f"La columna {columns[role]!r} contiene etiquetas vacías o desconocidas "
                "en ejercicios realizados. Revise la configuración."
            )
        work.loc[performed, f"_{role}"] = keys.map(mapping)
    work["_course_difficulty"] = None
    work.loc[performed, "_course_difficulty"] = (
        "Curso" + work.loc[performed, "_course"].astype(int).astype(str) + "_" + work.loc[performed, "_difficulty"]
    )
    if group_column:
        work["_validation_group"] = source[group_column].map(_identifier)
    work["_time"], time_audit = _response_times(source, performed, config)

    if training:
        label_sets = _label_sets(config)
        status_by_label = {
            label: status for status, labels in label_sets.items() for label in labels
        }
        diagnosis_keys = source[columns["diagnosis"]].map(_key)
        if not diagnosis_keys.isin(status_by_label).all():
            raise ValueError(
                "Hay diagnósticos desconocidos: todos deben figurar en positive_diagnoses, "
                "unlabeled_diagnoses o excluded_diagnoses."
            )
        work["_status"] = diagnosis_keys.map(status_by_label)

    rows: list[dict[str, Any]] = []
    mixed_positive_unlabeled = 0
    mixed_positive_excluded = 0
    for student, history in work.groupby("_student", sort=False):
        row: dict[str, Any] = dict(zip(id_columns, student))
        if history["_sex"].nunique() != 1:
            raise ValueError("Un alumno tiene valores contradictorios de Sexo(M=1); revise su historial.")
        row[SEX_COLUMN] = int(history["_sex"].iloc[0])
        if group_column:
            groups = history["_validation_group"].unique()
            if len(groups) != 1:
                raise ValueError("Un alumno tiene varios grupos de validación; revise su identificador o grupo.")
            row[group_column] = groups[0]
        completed = history.loc[history["_performed"].eq(1)]
        row["TotalRealizados"] = len(completed)
        row["ProporcionAciertos"] = float(completed["_correct"].mean()) if len(completed) else np.nan
        valid_times = completed["_time"].dropna()
        row["TiemposValidos"] = len(valid_times)
        row["TiempoMediana"] = float(valid_times.quantile(0.5)) if len(valid_times) else np.nan
        if len(valid_times) >= 2:
            quantiles = valid_times.quantile([0.25, 0.75], interpolation="linear")
            row["TiempoIQR"] = float(quantiles.iloc[1] - quantiles.iloc[0])
        else:
            row["TiempoIQR"] = np.nan
        for axis, strata in (("_course_difficulty", COURSE_DIFFICULTIES), ("_category", CATEGORIES)):
            for stratum in strata:
                stratum_rows = completed.loc[completed[axis].eq(stratum)]
                subset = stratum_rows["_correct"]
                row[f"Realizados_{stratum}"] = len(subset)
                row[f"ProporcionAciertos_{stratum}"] = float(subset.mean()) if len(subset) else np.nan
                stratum_times = stratum_rows["_time"].dropna()
                row[f"TiemposValidos_{stratum}"] = len(stratum_times)
                row[f"TiempoMediana_{stratum}"] = float(stratum_times.quantile(0.5)) if len(stratum_times) else np.nan
        if training:
            statuses = set(history["_status"])
            row["EstadoPU"] = "P" if "P" in statuses else "EXCLUIDO" if "EXCLUIDO" in statuses else "U"
            mixed_positive_unlabeled += int({"P", "U"}.issubset(statuses))
            mixed_positive_excluded += int({"P", "EXCLUIDO"}.issubset(statuses))
        rows.append(row)

    summary = pd.DataFrame(rows, columns=preserved + SUMMARY_COLUMNS + (["EstadoPU"] if training else []))
    summary[COUNT_COLUMNS + TIME_COUNT_COLUMNS] = summary[COUNT_COLUMNS + TIME_COUNT_COLUMNS].astype("int64")
    _add_time_audit(time_audit, work, source, group_column, id_columns)
    audit: dict[str, Any] = {
        "input_rows": int(len(source)),
        "performed_rows": int(performed.sum()),
        "students": int(len(summary)),
        "exact_duplicate_rows": int(source.duplicated().sum()),
        "zero_response_students": int(summary["TotalRealizados"].eq(0).sum()),
        "students_multiple_courses": int(work.loc[performed].groupby("_student")["_course"].nunique().gt(1).sum()),
        "performed_by_course_difficulty": {s: int(work["_course_difficulty"].eq(s).sum()) for s in COURSE_DIFFICULTIES},
        "response_time": time_audit,
    }
    if training:
        audit.update(
            positive_students=int(summary["EstadoPU"].eq("P").sum()),
            unlabeled_students=int(summary["EstadoPU"].eq("U").sum()),
            excluded_students=int(summary["EstadoPU"].eq("EXCLUIDO").sum()),
            mixed_positive_unlabeled_students=mixed_positive_unlabeled,
            mixed_positive_excluded_students=mixed_positive_excluded,
        )
    return summary, audit
