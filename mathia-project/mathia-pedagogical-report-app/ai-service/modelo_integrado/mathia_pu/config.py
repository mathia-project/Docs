"""Configuración explícita y lectura sin perder ceros iniciales de identificadores."""
from copy import deepcopy
import json
from pathlib import Path
import unicodedata

import pandas as pd


DEFAULT_CONFIG = {
    "columns": {
        "student_id": ["Identificador"],
        "sex": "Sexo(M=1)",
        "course": "Curso",
        "performed": "Realizado",
        "correct": "Correcto",
        "difficulty": "Dificultad",
        "category": "TipoEjercicio",
        "response_time": "TiempoRespuesta",
        "diagnosis": "Diagnostico",
        "validation_group": None,
    },
    "category_map": {},
    "positive_diagnoses": [f"D{i}" for i in range(1, 9)] + ["S", "SI", "1"],
    "unlabeled_diagnoses": ["D0", "N", "NO", "0", "", "SIN DIAGNOSTICO"],
    "excluded_diagnoses": [],
    "time": {
        "input_unit": "ms",
        "zero_is_missing": True,
    },
    "training": {
        "n_estimators": 100,
        "max_depth": 5,
        "min_samples_leaf": 3,
        "unlabeled_ratio": 1.0,
        "cv_folds": 5,
        "seed": 42,
        "calibration_fraction": 0.25,
        "review_fraction": 0.20,
        "min_responses": 1,
        "include_volume": True,
        "include_time": True,
    },
}


def _token(value):
    return "".join(c for c in unicodedata.normalize("NFKD", str(value).strip())
                   if not unicodedata.combining(c)).upper()


def load_config(path=None):
    config = deepcopy(DEFAULT_CONFIG)
    if path is not None:
        override = json.loads(Path(path).read_text(encoding="utf-8-sig"))
        if not isinstance(override, dict):
            raise ValueError("La configuración debe ser un objeto JSON.")
        for key, value in override.items():
            if key not in config:
                raise ValueError(f"Opción desconocida: {key}")
            if key in ("columns", "training", "time"):
                if not isinstance(value, dict) or set(value) - set(config[key]):
                    raise ValueError(f"Opciones desconocidas o inválidas en {key}.")
                config[key].update(value)
            else:
                config[key] = value
    validate_config(config)
    return config


def validate_config(config):
    cols = config["columns"]
    ids = cols["student_id"]
    if not isinstance(ids, list) or not ids or any(not isinstance(c, str) or not c.strip() for c in ids):
        raise ValueError("columns.student_id debe ser una lista de columnas de identificación.")
    if len(ids) != len(set(ids)):
        raise ValueError("Columnas de identificación repetidas.")
    required = [cols[k] for k in ("sex", "course", "performed", "correct", "difficulty", "category", "response_time", "diagnosis")]
    if any(not isinstance(c, str) or not c.strip() for c in required):
        raise ValueError("Los nombres de columna deben ser textos no vacíos.")
    if len(set(required + ids)) != len(required + ids):
        raise ValueError("Cada campo debe usar una columna distinta.")
    group = cols["validation_group"]
    if group is not None and (not isinstance(group, str) or not group.strip() or group in required):
        raise ValueError("validation_group debe ser una columna de colegio/grupo o null.")
    # Evitar sobrescribir metadatos con variables calculadas.
    reserved = {"Sexo(M=1)", "EstadoPU", "TotalRealizados", "ProporcionAciertos", "TiempoMediana", "TiempoIQR", "TiemposValidos"}
    reserved_prefixes = ("Realizados_", "ProporcionAciertos_", "TiempoMediana_", "TiemposValidos_")
    if any(c in reserved or c.startswith(reserved_prefixes) for c in ids + ([group] if group else [])):
        raise ValueError("Las columnas de identidad/grupo colisionan con el resumen calculado.")
    label_sets = []
    for name in ("positive_diagnoses", "unlabeled_diagnoses", "excluded_diagnoses"):
        if not isinstance(config[name], list):
            raise ValueError(f"{name} debe ser una lista.")
        label_sets.append({_token(v) for v in config[name]})
    if not label_sets[0] or "" in label_sets[0] or "" not in label_sets[1]:
        raise ValueError("Debe haber positivos explícitos; la etiqueta vacía debe ser no etiquetada.")
    if any(a & b for i, a in enumerate(label_sets) for b in label_sets[i + 1:]):
        raise ValueError("Las etiquetas positivas, no etiquetadas y excluidas deben ser disjuntas.")
    if not isinstance(config["category_map"], dict):
        raise ValueError("category_map debe ser un diccionario.")
    time = config["time"]
    if not isinstance(time, dict):
        raise ValueError("time debe ser un objeto de configuración.")
    if not isinstance(time.get("input_unit"), str) or time["input_unit"] not in {"native", "s", "ms", "min"}:
        raise ValueError("time.input_unit debe ser native, s, ms o min; native conserva la unidad original sin asumirla.")
    if not isinstance(time.get("zero_is_missing"), bool):
        raise ValueError("time.zero_is_missing debe ser true o false.")
    tr = config["training"]
    for key in ("n_estimators", "max_depth", "min_samples_leaf", "cv_folds", "min_responses"):
        if isinstance(tr[key], bool) or not isinstance(tr[key], int) or tr[key] < 1:
            raise ValueError(f"training.{key} debe ser un entero positivo.")
    if tr["cv_folds"] < 2:
        raise ValueError("Se requieren al menos dos particiones de validación.")
    if isinstance(tr["seed"], bool) or not isinstance(tr["seed"], int) or not 0 <= tr["seed"] < 2**32:
        raise ValueError("seed debe ser un entero entre 0 y 2**32 - 1.")
    for key in ("calibration_fraction", "review_fraction"):
        if isinstance(tr[key], bool) or not isinstance(tr[key], (int, float)) or not 0 < tr[key] < 1:
            raise ValueError(f"training.{key} debe estar entre 0 y 1, sin incluirlos.")
    if not isinstance(tr["unlabeled_ratio"], (float, int)) or not 0 < tr["unlabeled_ratio"] < 100:
        raise ValueError("unlabeled_ratio debe ser positivo y menor de 100.")
    for key in ("include_volume", "include_time"):
        if not isinstance(tr[key], bool):
            raise ValueError(f"{key} debe ser true o false.")


def read_responses(path, sep=",", encoding="utf-8-sig"):
    # keep_default_na=False: un ID literal NA no debe desaparecer.
    return pd.read_csv(path, sep=sep, encoding=encoding, dtype=str, keep_default_na=False)
