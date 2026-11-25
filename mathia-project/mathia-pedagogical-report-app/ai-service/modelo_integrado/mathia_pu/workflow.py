"""Entrenar y predecir con la misma transformación, configuración y esquema."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform

import joblib
import numpy as np
import pandas as pd
import sklearn

from .config import validate_config
from .diagnosis import attach_diagnosis_history, recorded_diagnoses
from .features import (BASE_FEATURE_COLUMNS, CATEGORIES, COUNT_COLUMNS, COURSE_DIFFICULTIES,
                       FEATURE_COLUMNS, SUMMARY_COLUMNS, TIME_COUNT_COLUMNS,
                       TIME_FEATURE_COLUMNS, SEX_COLUMN, normalize_sex, aggregate_responses)
from .model import eligibility, evaluate, fit_variant, score_variant


SCHEMA_VERSION = 4


def _write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def train_and_save(raw, config, output_dir):
    validate_config(config)
    output = Path(output_dir)
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError("La carpeta de salida debe ser nueva o estar vacía; no se sobrescriben modelos.")
    summary, audit = aggregate_responses(raw, config, training=True)
    summary = attach_diagnosis_history(summary, raw, config)
    settings = config["training"]
    usable = summary["EstadoPU"].isin(["P", "U"]) & (summary["TotalRealizados"] >= settings["min_responses"])
    students = summary.loc[usable].reset_index(drop=True)
    audit["students_below_minimum"] = int((summary["TotalRealizados"] < settings["min_responses"]).sum())
    audit["students_used"] = int(len(students))
    reports, oof = evaluate(students, config)
    y = students["EstadoPU"].eq("P").to_numpy(dtype=int)
    group = config["columns"]["validation_group"]
    bundle, details, fit, calibration = fit_variant(
        students, y, settings, settings["seed"], settings["include_volume"], settings["include_time"],
        students[group].to_numpy() if group else None,
    )
    versions = {"python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__,
                "scikit_learn": sklearn.__version__, "joblib": joblib.__version__}
    provenance = hashlib.sha256(pd.util.hash_pandas_object(raw, index=False).values.tobytes()).hexdigest()
    artifact = {
        "schema_version": SCHEMA_VERSION, "created_utc": datetime.now(timezone.utc).isoformat(),
        "config": config, **bundle,
        "versions": versions, "input_hash": provenance,
        "score_kind": "indice_PU_no_calibrado",
        "total_realizados_range": [int(students.iloc[fit]["TotalRealizados"].min()), int(students.iloc[fit]["TotalRealizados"].max())],
    }
    details["estratos_con_ejemplos_ajuste"] = bundle["supported_strata"]
    details["umbral_provisional"] = True
    report = {
        "auditoria": audit, "validacion": reports, "modelo_final": details,
        "versiones": versions, "huella_datos": provenance,
        "metodo_validacion": "Alumnos completos; calibración interna reservada y validación exterior independiente" + ("; separación por colegio" if group else ""),
        "limitaciones": [
            "Los alumnos sin diagnóstico son no etiquetados, nunca negativos confirmados.",
            "El índice no es probabilidad de diagnóstico ni de necesidad de atención.",
            "La recuperación de P mide diagnósticos registrados, no sensibilidad poblacional.",
            "No pueden estimarse falsos positivos ni especificidad con U sin evaluar.",
            "La fracción de revisión es una política provisional; no estima prevalencia.",
            "Los diagnósticos registrados pueden estar sesgados por colegio, acceso o gravedad; PU no elimina ese sesgo.",
            "Se agregan historiales de varios cursos; no se valida detección temprana ni se ajusta dificultad entre sistemas educativos.",
            "La comparación sin recuentos conserva diferencias en cobertura y precisión de las proporciones.",
            "El mínimo de respuestas es configurable y no ha sido validado como umbral de fiabilidad.",
            "Los tiempos ausentes usan medianas del ajuste o un modelo alternativo sin tiempos; nunca representan respuesta instantánea.",
            "El tiempo transcurrido puede incluir pausas; las unidades y el método de registro deben ser coherentes entre entrenamiento y predicción.",
            "El umbral alternativo sin tiempos se estima con todos los U elegibles de reserva; la fracción de revisión puede diferir en el subgrupo sin tiempos.",
            "Los índices de las rutas con y sin tiempos no tienen necesariamente la misma escala; use su umbral correspondiente, no un ranking común de ambos índices.",
        ],
    }
    summary["UsoModeloFinal"] = "Excluido"
    eligible_indices = np.flatnonzero(usable.to_numpy())
    summary.loc[eligible_indices[fit], "UsoModeloFinal"] = "Ajuste"
    summary.loc[eligible_indices[calibration], "UsoModeloFinal"] = "ReservaUmbral"
    output.mkdir(parents=True, exist_ok=True)
    # El artefacto se publica al final, después de los informes.
    summary.to_csv(output / "resumen_alumnos.csv", index=False, encoding="utf-8-sig")
    oof.to_csv(output / "validacion_alumnos.csv", index=False, encoding="utf-8-sig")
    _write_json(output / "informe_validacion.json", report)
    _write_json(output / "config_utilizada.json", config)
    _write_json(output / "esquema_entrada.json", {
        "schema_version": SCHEMA_VERSION,
        "identificadores": config["columns"]["student_id"],
        "variables_base_obligatorias": BASE_FEATURE_COLUMNS,
        "variables_temporales": TIME_FEATURE_COLUMNS,
        "recuentos_temporales_solo_metadatos": TIME_COUNT_COLUMNS,
        "bloque_temporal": "Incluir las 37 columnas juntas (19 medidas y 18 recuentos) o ninguna (ruta sin tiempos).",
        "unidad_tiempos_agregados": "native" if config["time"]["input_unit"] == "native" else "s",
        "variables_modelo_principal": bundle["feature_columns"],
        "variables_modelo_sin_tiempos": bundle["fallback_columns"],
    })
    joblib.dump(artifact, output / "modelo_pu.joblib")
    return report


def load_artifact(path):
    """Cargar únicamente artefactos propios/de confianza: joblib ejecuta pickle."""
    artifact = joblib.load(path)
    if not isinstance(artifact, dict) or artifact.get("schema_version") != SCHEMA_VERSION:
        raise ValueError("Formato de modelo incompatible. La versión 4 incorpora Curso × Dificultad; reentrene los artefactos de la versión 1, 2 o 3.")
    if artifact["versions"]["scikit_learn"] != sklearn.__version__:
        raise ValueError("Use la misma versión de scikit-learn que figura en informe_validacion.json.")
    return artifact


def _validate_summary(summary, config):
    if summary.empty or not summary.columns.is_unique:
        raise ValueError("El resumen debe tener alumnos y columnas únicas.")
    ids = config["columns"]["student_id"]
    missing = [c for c in ids + BASE_FEATURE_COLUMNS if c not in summary.columns]
    if missing:
        raise ValueError("Faltan columnas en el resumen: " + ", ".join(missing))
    temporal_block = TIME_FEATURE_COLUMNS + TIME_COUNT_COLUMNS
    present = [c for c in temporal_block if c in summary.columns]
    if present and len(present) != len(temporal_block):
        raise ValueError("El bloque temporal debe incluir sus 19 medidas y 18 recuentos, o estar completamente ausente.")
    data = summary[ids + BASE_FEATURE_COLUMNS + present].copy()
    if not present:
        for col in TIME_FEATURE_COLUMNS:
            data[col] = np.nan
        for col in TIME_COUNT_COLUMNS:
            data[col] = 0
    data = data[ids + SUMMARY_COLUMNS]
    for col in ids:
        if data[col].isna().any() or data[col].astype(str).str.strip().eq("").any():
            raise ValueError("El resumen contiene identificadores vacíos.")
        data[col] = data[col].astype(str).str.strip()
    if data.duplicated(ids).any():
        raise ValueError("El resumen debe contener exactamente una fila por alumno.")
    for col in SUMMARY_COLUMNS:
        if col == SEX_COLUMN:
            data[col] = data[col].map(normalize_sex)
            continue
        cleaned = data[col].replace(r"^\s*$", np.nan, regex=True)
        try:
            data[col] = pd.to_numeric(cleaned, errors="raise")
        except (ValueError, TypeError) as exc:
            raise ValueError(f"La columna {col} debe ser numérica o vacía cuando no hay respuestas.") from exc
        if np.isinf(data[col].to_numpy(dtype=float)).any():
            raise ValueError(f"La columna {col} contiene infinitos.")
        if col in COUNT_COLUMNS + TIME_COUNT_COLUMNS:
            if data[col].isna().any() or (data[col] < 0).any() or (data[col] % 1 != 0).any():
                raise ValueError(f"La columna {col} debe contener recuentos enteros no negativos.")
        elif col in TIME_FEATURE_COLUMNS:
            if (data[col] < 0).any():
                raise ValueError(f"La columna temporal {col} no puede ser negativa.")
            if col != "TiempoIQR" and config["time"]["zero_is_missing"] and data[col].eq(0).any():
                raise ValueError(f"La columna {col} no puede ser cero con la política temporal configurada.")
        elif ((data[col] < 0) | (data[col] > 1)).any():
            raise ValueError(f"La columna {col} debe estar entre 0 y 1.")
    total = data["TotalRealizados"].to_numpy()
    for stratum in [None, *COURSE_DIFFICULTIES, *CATEGORIES]:
        count = data["TotalRealizados" if stratum is None else f"Realizados_{stratum}"]
        ratio = data["ProporcionAciertos" if stratum is None else f"ProporcionAciertos_{stratum}"]
        if not np.array_equal(count.eq(0).to_numpy(), ratio.isna().to_numpy()):
            raise ValueError("Una proporción solo debe quedar vacía cuando su número de respuestas sea cero.")
    for strata in (COURSE_DIFFICULTIES, CATEGORIES):
        if not np.array_equal(data[[f"Realizados_{s}" for s in strata]].sum(axis=1).to_numpy(), total):
            raise ValueError("Los recuentos por dificultad y por categoría deben sumar TotalRealizados.")
        correct = sum(data[f"Realizados_{s}"] * data[f"ProporcionAciertos_{s}"].fillna(0) for s in strata)
        mask = total > 0
        if not np.allclose(correct[mask] / total[mask], data.loc[mask, "ProporcionAciertos"], atol=1e-5, rtol=0):
            raise ValueError("Las proporciones por grupo no son coherentes con la proporción global.")
    for stratum in [None, *COURSE_DIFFICULTIES, *CATEGORIES]:
        suffix = "" if stratum is None else f"_{stratum}"
        count = data[f"TiemposValidos{suffix}"]
        responses = data["TotalRealizados" if stratum is None else f"Realizados{suffix}"]
        median = data[f"TiempoMediana{suffix}"]
        if (count > responses).any():
            raise ValueError("Los tiempos válidos no pueden superar las respuestas realizadas de su bloque.")
        if not np.array_equal(count.eq(0).to_numpy(), median.isna().to_numpy()):
            raise ValueError("La mediana temporal debe estar ausente exactamente cuando no hay tiempos válidos en su bloque.")
    for strata in (COURSE_DIFFICULTIES, CATEGORIES):
        if not np.array_equal(data[[f"TiemposValidos_{s}" for s in strata]].sum(axis=1).to_numpy(), data["TiemposValidos"].to_numpy()):
            raise ValueError("Los recuentos temporales por dificultad y categoría deben sumar TiemposValidos.")
    if not np.array_equal(data["TiemposValidos"].lt(2).to_numpy(), data["TiempoIQR"].isna().to_numpy()):
        raise ValueError("TiempoIQR debe estar ausente exactamente cuando hay menos de dos tiempos válidos.")
    return data


def predict_summary(summary, artifact):
    """37 variables base (sexo y Curso × Dificultad), 19 tiempos y 18 metadatos."""
    if artifact.get("schema_version") != SCHEMA_VERSION:
        raise ValueError("Versión de esquema de modelo incompatible.")
    config = artifact["config"]
    data = _validate_summary(summary, config)
    known, preserved = recorded_diagnoses(summary, config)
    known = np.asarray(known, dtype=bool)
    eligible, reasons = eligibility(data, config["training"]["min_responses"], artifact["supported_strata"])
    eligible &= ~known
    scores = np.full(len(data), np.nan)
    thresholds = np.full(len(data), np.nan)
    routes = np.full(len(data), "sin_prediccion", dtype=object)
    if eligible.any():
        scores[eligible], thresholds[eligible], routes[eligible] = score_variant(data.loc[eligible], artifact)
    suggested = pd.array([pd.NA] * len(data), dtype="boolean")
    suggested[eligible] = scores[eligible] > thresholds[eligible]
    result = data[config["columns"]["student_id"]].copy()
    result["SugiereAtencionEducativa"] = suggested
    result["Estado"] = np.where(~eligible, "Información insuficiente",
                                np.where(scores > thresholds, "Se sugiere atención educativa", "Sin señal suficiente"))
    result["IndiceAtencion"] = scores
    result["TotalRealizados"] = data["TotalRealizados"].to_numpy()
    result["TiemposValidos"] = data["TiemposValidos"].to_numpy()
    result["ModeloUtilizado"] = routes
    result["UmbralAplicado"] = thresholds
    result["Motivo"] = reasons
    low, high = artifact["total_realizados_range"]
    result["VolumenFueraRangoAjuste"] = (data["TotalRealizados"] < low) | (data["TotalRealizados"] > high)
    result["DiagnosticoRegistrado"] = preserved
    result.loc[known, "Estado"] = "Diagnóstico registrado: sin predicción"
    result.loc[known, "ModeloUtilizado"] = "sin_prediccion_diagnostico"
    result.loc[known, "Motivo"] = "Se conserva el diagnóstico existente; no se ejecuta el modelo."
    return result


def predict_responses(raw, artifact):
    summary, _ = aggregate_responses(raw, artifact["config"], training=False)
    summary = attach_diagnosis_history(summary, raw, artifact["config"])
    return predict_summary(summary, artifact)
