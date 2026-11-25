"""Conservar diagnósticos conocidos sin utilizarlos como predictores."""
import pandas as pd

from .features import _identifier, _key, _label_sets


def recorded_diagnoses(frame, config):
    """Una lista de etiquetas conocidas por fila; desconocidos se rechazan."""
    labels = _label_sets(config)
    known = labels["P"] | labels["EXCLUIDO"]
    allowed = known | labels["U"]
    diagnostic = config["columns"]["diagnosis"]
    output = []
    flags = []
    for _, row in frame.iterrows():
        values = []
        if diagnostic in frame.columns:
            values.append(row[diagnostic])
        if "DiagnosticoRegistrado" in frame.columns:
            recorded = row["DiagnosticoRegistrado"]
            if not pd.isna(recorded):
                values.extend(str(recorded).split(" | "))
        preserved = []
        for value in values:
            key = _key(value)
            if key not in allowed:
                raise ValueError("Diagnóstico desconocido en la entrada; configure su significado antes de predecir.")
            if key in known:
                preserved.append(_identifier(value))
        status = _key(row.get("EstadoPU", ""))
        if status not in {"", "p", "u", "excluido"}:
            raise ValueError("EstadoPU debe ser P, U o EXCLUIDO.")
        flags.append(bool(preserved) or status in {"p", "excluido"})
        output.append(" | ".join(sorted(set(preserved))))
    return flags, output


def attach_diagnosis_history(summary, raw, config):
    """Cualquier diagnóstico conocido del historial protege al alumno entero."""
    diagnostic = config["columns"]["diagnosis"]
    if diagnostic not in raw.columns:
        return summary
    ids = config["columns"]["student_id"]
    _, records = recorded_diagnoses(raw, config)
    metadata = raw[ids].copy()
    for col in ids:
        metadata[col] = metadata[col].map(_identifier)
    metadata["_record"] = records
    history = metadata.groupby(ids, sort=False, as_index=False).agg(
        DiagnosticoRegistrado=("_record", lambda items: " | ".join(sorted({v for item in items for v in item.split(" | ") if v}))),
    )
    return summary.merge(history, on=ids, how="left", validate="one_to_one", sort=False)
