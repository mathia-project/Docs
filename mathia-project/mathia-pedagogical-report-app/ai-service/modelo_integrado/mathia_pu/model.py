"""Bagging PU para ordenar perfiles, sin estimar probabilidades de necesidad."""
import numpy as np
from sklearn.impute import SimpleImputer
from sklearn.model_selection import GroupShuffleSplit, StratifiedGroupKFold, StratifiedKFold
from sklearn.tree import DecisionTreeClassifier

from .features import BASE_FEATURE_COLUMNS, COUNT_COLUMNS, TIME_FEATURE_COLUMNS


class BaggingPU:
    """Cada árbol compara P con una muestra bootstrap de U, negativa provisional.

    La media de salidas es un índice de ordenación. U no es negativo confirmado.
    Inspirado en Mordelet y Vert, con árboles en lugar de SVM.
    """

    def __init__(self, n_estimators=100, max_depth=5, min_samples_leaf=3,
                 unlabeled_ratio=1.0, seed=42):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.min_samples_leaf = min_samples_leaf
        self.unlabeled_ratio = unlabeled_ratio
        self.seed = seed

    def fit(self, X, labels):
        labels = np.asarray(labels)
        if set(np.unique(labels)) != {0, 1}:
            raise ValueError("El ajuste PU requiere positivos conocidos (1) y no etiquetados (0).")
        self.columns_ = list(X.columns)
        self.base_columns_ = [c for c in self.columns_ if c not in TIME_FEATURE_COLUMNS]
        # Una columna temporal sin observaciones en ajuste no aporta información.
        self.time_columns_ = [c for c in self.columns_ if c in TIME_FEATURE_COLUMNS and X[c].notna().any()]
        self.imputer_ = SimpleImputer(strategy="constant", fill_value=-1, keep_empty_features=True)
        values = self.imputer_.fit_transform(X[self.base_columns_])
        if self.time_columns_:
            # La mediana se aprende exclusivamente dentro del ajuste. Un tiempo
            # ausente no se convierte en cero ni en una respuesta muy rápida.
            self.time_imputer_ = SimpleImputer(strategy="median", keep_empty_features=True)
            # log1p conserva el orden y evita desbordar la representación interna
            # de los árboles ante tiempos finitos muy grandes; no recorta datos.
            values = np.column_stack([values, self.time_imputer_.fit_transform(np.log1p(X[self.time_columns_]))])
        positive = np.flatnonzero(labels == 1)
        unlabeled = np.flatnonzero(labels == 0)
        rng = np.random.default_rng(self.seed)
        size = max(1, int(np.ceil(len(positive) * self.unlabeled_ratio)))
        self.estimators_ = []
        for _ in range(self.n_estimators):
            provisional = rng.choice(unlabeled, size=size, replace=True)
            indices = np.concatenate([positive, provisional])
            tree = DecisionTreeClassifier(
                max_depth=self.max_depth, min_samples_leaf=self.min_samples_leaf,
                class_weight="balanced", random_state=int(rng.integers(0, 2**31 - 1)),
            )
            tree.fit(values[indices], labels[indices])
            self.estimators_.append(tree)
        return self

    def score_samples(self, X):
        if list(X.columns) != self.columns_:
            raise ValueError("Las columnas de predicción no coinciden con las del ajuste.")
        values = self.imputer_.transform(X[self.base_columns_])
        if self.time_columns_:
            values = np.column_stack([values, self.time_imputer_.transform(np.log1p(X[self.time_columns_]))])
        return np.mean([tree.predict_proba(values)[:, 1] for tree in self.estimators_], axis=0)


def feature_columns(include_volume=True, include_time=False):
    return ([c for c in BASE_FEATURE_COLUMNS if include_volume or c not in COUNT_COLUMNS]
            + (TIME_FEATURE_COLUMNS if include_time else []))


VARIANTS = {
    "sin_recuentos": (False, False),
    "con_recuentos": (True, False),
    "sin_recuentos_con_tiempos": (False, True),
    "con_recuentos_con_tiempos": (True, True),
}


def variant_name(include_volume, include_time):
    return next(name for name, flags in VARIANTS.items() if flags == (include_volume, include_time))


def _new_model(settings, seed):
    return BaggingPU(**{k: settings[k] for k in
                        ("n_estimators", "max_depth", "min_samples_leaf", "unlabeled_ratio")}, seed=seed)


def select_threshold(scores, review_fraction):
    """Política de carga de revisión, conservadora ante empates; usar score > umbral."""
    scores = np.asarray(scores, dtype=float)
    if scores.size < 2 or not np.isfinite(scores).all():
        raise ValueError("Se requieren al menos dos puntuaciones U de calibración válidas.")
    threshold = float(np.quantile(scores, 1 - review_fraction, method="higher"))
    return threshold, {
        "umbral": threshold,
        "fraccion_revision_referencia": review_fraction,
        "fraccion_u_calibracion_sugerida": float(np.mean(scores > threshold)),
        "u_calibracion": int(len(scores)),
        "puntuaciones_calibracion_constantes": bool(np.ptp(scores) < 1e-12),
        "regla": "IndiceAtencion > umbral (empates no seleccionados)",
    }


def _calibration_split(y, settings, seed, groups=None):
    """Reserva interna distinta del ajuste y de la validación exterior."""
    y = np.asarray(y)
    if groups is None:
        candidates = np.flatnonzero(y == 0)
        if len(candidates) < 4 or (y == 1).sum() < 2:
            raise ValueError("Cada ajuste necesita al menos 2 P y 4 U antes de reservar calibración.")
        count = min(len(candidates) - 2, max(2, int(np.ceil(len(candidates) * settings["calibration_fraction"]))))
        calibration = np.random.default_rng(seed).choice(candidates, size=count, replace=False)
        fit = np.setdiff1d(np.arange(len(y)), calibration)
        return fit, calibration
    if len(np.unique(groups)) < 2:
        raise ValueError("No hay colegios suficientes para separar ajuste y calibración.")
    splitter = GroupShuffleSplit(n_splits=100, test_size=settings["calibration_fraction"], random_state=seed)
    for fit, calibration in splitter.split(np.zeros(len(y)), y, groups):
        if (y[fit] == 1).sum() >= 2 and (y[fit] == 0).sum() >= 2 and (y[calibration] == 0).sum() >= 2:
            return fit, calibration
    raise ValueError("No se puede reservar colegios para calibración con suficientes P/U. Revise grupos o aporte más alumnos; no se sustituye silenciosamente la validación por colegio.")


def fit_calibrated(X, y, settings, seed, groups=None, coverage=None):
    fit, calibration = _calibration_split(y, settings, seed, groups)
    model = _new_model(settings, seed).fit(X.iloc[fit], np.asarray(y)[fit])
    # Los positivos que caen en colegios de calibración tampoco participan en ajuste.
    cal_u = calibration[np.asarray(y)[calibration] == 0]
    discarded = 0
    if coverage is not None:
        supported = support_columns(coverage.iloc[fit])
        eligible, _ = eligibility(coverage.iloc[cal_u], settings["min_responses"], supported)
        discarded = int(np.sum(~eligible))
        cal_u = cal_u[eligible]
    if len(cal_u) < 2:
        raise ValueError("No hay al menos dos alumnos U de calibración con categorías y dificultades representadas en el ajuste.")
    threshold, details = select_threshold(model.score_samples(X.iloc[cal_u]), settings["review_fraction"])
    details.update({"alumnos_ajuste": int(len(fit)), "p_ajuste": int(np.sum(np.asarray(y)[fit] == 1)),
                    "u_ajuste": int(np.sum(np.asarray(y)[fit] == 0)), "alumnos_reserva": int(len(calibration)),
                    "u_reserva_sin_cobertura": discarded})
    return model, threshold, details, fit, calibration


def support_columns(summary):
    return [c for c in COUNT_COLUMNS if c != "TotalRealizados" and summary[c].sum() > 0]


def eligibility(summary, min_responses, supported):
    unsupported = [c for c in COUNT_COLUMNS if c != "TotalRealizados" and c not in supported]
    low = summary["TotalRealizados"].to_numpy() < min_responses
    unseen = (summary[unsupported] > 0).any(axis=1).to_numpy() if unsupported else np.zeros(len(summary), dtype=bool)
    reasons = np.where(low, "Respuestas por debajo del mínimo configurado",
                       np.where(unseen, "Categoría o combinación Curso × Dificultad sin ejemplos en el ajuste", ""))
    return ~(low | unseen), reasons


def _time_route(summary, supported_time):
    """Usar la alternativa sin tiempos si falta todo el tiempo o su respaldo."""
    unsupported = [c for c in TIME_FEATURE_COLUMNS if c not in supported_time]
    unseen = summary[unsupported].notna().any(axis=1).to_numpy() if unsupported else np.zeros(len(summary), dtype=bool)
    return summary["TiemposValidos"].to_numpy() > 0, unseen


def fit_variant(summary, y, settings, seed, include_volume, include_time, groups=None):
    """Un artefacto con modelo principal y alternativa sin tiempos calibrada.

    Los alumnos de ajuste y de reserva son idénticos para las cuatro variantes.
    La alternativa se calibra con todos los U elegibles de reserva. El modelo
    temporal se calibra solo con los U que seguirían esa ruta en predicción.
    """
    base_cols = feature_columns(include_volume, False)
    base, base_threshold, base_details, fit, calibration = fit_calibrated(
        summary[base_cols], y, settings, seed, groups, coverage=summary,
    )
    supported = support_columns(summary.iloc[fit])
    supported_time = [c for c in TIME_FEATURE_COLUMNS if summary.iloc[fit][c].notna().any()]
    bundle = {
        "model": base, "threshold": base_threshold, "feature_columns": base_cols,
        "fallback_model": base, "fallback_threshold": base_threshold, "fallback_columns": base_cols,
        "supported_strata": supported, "supported_time_features": supported_time,
        "include_volume": include_volume, "time_requested": include_time, "time_enabled": False,
    }
    details = {
        "variante": variant_name(include_volume, include_time),
        "alumnos_ajuste": int(len(fit)), "alumnos_reserva": int(len(calibration)),
        "sin_tiempos": base_details, "con_tiempos": None,
        "tiempo_activo": False, "motivo_sin_modelo_temporal": "No solicitado" if not include_time else "Sin tiempos válidos en el ajuste",
    }
    if include_time and supported_time:
        cal_u = calibration[np.asarray(y)[calibration] == 0]
        valid, _ = eligibility(summary.iloc[cal_u], settings["min_responses"], supported)
        has_time, unseen = _time_route(summary.iloc[cal_u], supported_time)
        temporal_calibration = cal_u[valid & has_time & ~unseen]
        if len(temporal_calibration) >= 2:
            time_cols = feature_columns(include_volume, True)
            temporal = _new_model(settings, seed).fit(summary.iloc[fit][time_cols], np.asarray(y)[fit])
            threshold, time_details = select_threshold(
                temporal.score_samples(summary.iloc[temporal_calibration][time_cols]), settings["review_fraction"],
            )
            bundle.update(model=temporal, threshold=threshold, feature_columns=time_cols, time_enabled=True)
            details.update(con_tiempos=time_details, tiempo_activo=True, motivo_sin_modelo_temporal=None)
        else:
            details["motivo_sin_modelo_temporal"] = "Menos de dos U de reserva con tiempos respaldados por el ajuste"
    # Informe de la regla completa, incluidas las rutas, sobre la reserva U.
    cal_u = calibration[np.asarray(y)[calibration] == 0]
    cal_valid, _ = eligibility(summary.iloc[cal_u], settings["min_responses"], supported)
    cal_scores, cal_thresholds, routes = score_variant(summary.iloc[cal_u], bundle)
    details["u_reserva_elegibles"] = int(cal_valid.sum())
    details["fraccion_u_reserva_sugerida_regla_completa"] = float(np.mean((cal_scores > cal_thresholds)[cal_valid]))
    details["u_reserva_ruta_temporal"] = int(np.sum(cal_valid & (routes == "con_tiempos")))
    details["u_reserva_ruta_sin_tiempos"] = int(np.sum(cal_valid & (routes == "sin_tiempos")))
    details["alternativa_sin_tiempos"] = "Entrenada con los mismos alumnos de ajuste y umbral estimado con todos los U elegibles de reserva"
    return bundle, details, fit, calibration


def score_variant(summary, bundle):
    """Devuelve índice, umbral por alumno y ruta; nunca usa diagnóstico."""
    scores = np.empty(len(summary), dtype=float)
    thresholds = np.full(len(summary), bundle["fallback_threshold"], dtype=float)
    routes = np.full(len(summary), "sin_tiempos", dtype=object)
    temporal = np.zeros(len(summary), dtype=bool)
    if bundle["time_enabled"]:
        has_time, unseen = _time_route(summary, bundle["supported_time_features"])
        temporal = has_time & ~unseen
    if (~temporal).any():
        scores[~temporal] = bundle["fallback_model"].score_samples(summary.loc[~temporal, bundle["fallback_columns"]])
    if temporal.any():
        scores[temporal] = bundle["model"].score_samples(summary.loc[temporal, bundle["feature_columns"]])
        thresholds[temporal] = bundle["threshold"]
        routes[temporal] = "con_tiempos"
    return scores, thresholds, routes


def metrics(labels, scores, eligible, suggested):
    labels = np.asarray(labels)
    result = {"alumnos": int(len(labels)), "p_conocidos": int(np.sum(labels == 1)),
              "u_sin_evaluar": int(np.sum(labels == 0)), "sin_informacion_suficiente": int(np.sum(~eligible))}
    for value, key in [(1, "p_conocidos"), (0, "u")]:
        mask = labels == value
        result[f"{key}_sugeridos"] = int(np.sum(suggested & mask))
        result[f"fraccion_{key}_sugerida"] = float(np.mean(suggested[mask])) if mask.any() else None
    return result


def evaluate(summary, config):
    """Cuatro variantes; mismos alumnos, repartos y reservas para el umbral."""
    settings = config["training"]
    y = (summary["EstadoPU"] == "P").to_numpy(dtype=int)
    p, u = int(y.sum()), int((y == 0).sum())
    if p < 3 or u < 6:
        raise ValueError(f"Para validar y calibrar se necesitan al menos 3 P y 6 U elegibles; recibidos {p} P y {u} U.")
    group_col = config["columns"]["validation_group"]
    groups = summary[group_col].to_numpy() if group_col else None
    folds = min(settings["cv_folds"], p, u)
    if groups is None:
        splitter = StratifiedKFold(n_splits=folds, shuffle=True, random_state=settings["seed"])
    else:
        folds = min(folds, len(np.unique(groups)))
        if folds < 3:
            raise ValueError("Se requieren al menos tres colegios para ajuste, calibración y validación separados.")
        splitter = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=settings["seed"])
    splits = list(splitter.split(summary, y, groups))
    metadata = list(dict.fromkeys(config["columns"]["student_id"] + ([group_col] if group_col else [])))
    oof = summary[metadata + ["EstadoPU", "TotalRealizados", "TiemposValidos"]].copy()
    reports = {}
    for variant, (counts, with_time) in VARIANTS.items():
        scores = np.full(len(summary), np.nan)
        thresholds = np.full(len(summary), np.nan)
        eligible = np.zeros(len(summary), dtype=bool)
        suggested = np.zeros(len(summary), dtype=bool)
        fold_numbers = np.zeros(len(summary), dtype=int)
        routes = np.full(len(summary), "sin_tiempos", dtype=object)
        fit_reports = []
        for number, (train, test) in enumerate(splits, start=1):
            fold_seed = (settings["seed"] + number) % (2**32)
            bundle, details, fit, _ = fit_variant(
                summary.iloc[train], y[train], settings, fold_seed, counts, with_time,
                None if groups is None else groups[train],
            )
            supported = support_columns(summary.iloc[train[fit]])
            valid, _ = eligibility(summary.iloc[test], settings["min_responses"], supported)
            current_scores, threshold, current_routes = score_variant(summary.iloc[test], bundle)
            scores[test] = np.where(valid, current_scores, np.nan)
            thresholds[test] = threshold
            eligible[test] = valid
            suggested[test] = valid & (current_scores > threshold)
            fold_numbers[test] = number
            routes[test] = current_routes
            details.update({"particion": number, "validacion": metrics(y[test], current_scores, valid, suggested[test])})
            fit_reports.append(details)
        report = metrics(y, scores, eligible, suggested)
        report["alumnos_ruta_temporal"] = int(np.sum(eligible & (routes == "con_tiempos")))
        report["alumnos_ruta_sin_tiempos"] = int(np.sum(eligible & (routes == "sin_tiempos")))
        report["particiones"] = fit_reports
        report["por_volumen"] = {}
        # Tramos descriptivos fijos: 90 es referencia observada, nunca mínimo ni denominador.
        volume = summary["TotalRealizados"].to_numpy()
        for name, mask in [("1_a_29", volume < 30), ("30_a_89", (volume >= 30) & (volume < 90)), ("90_o_mas", volume >= 90)]:
            report["por_volumen"][name] = metrics(y[mask], scores[mask], eligible[mask], suggested[mask])
        time_count = summary["TiemposValidos"].to_numpy()
        report["por_cobertura_temporal"] = {}
        for name, mask in [("sin_tiempos", time_count == 0),
                           ("parcial", (time_count > 0) & (time_count < volume)),
                           ("completa", time_count == volume)]:
            report["por_cobertura_temporal"][name] = metrics(y[mask], scores[mask], eligible[mask], suggested[mask])
        if groups is not None:
            report["por_grupo"] = [
                {"grupo": str(g), **metrics(y[groups == g], scores[groups == g], eligible[groups == g], suggested[groups == g])}
                for g in np.unique(groups)
            ]
        reports[variant] = report
        oof[f"Indice_{variant}"] = scores
        oof[f"Umbral_{variant}"] = thresholds
        oof[f"Elegible_{variant}"] = eligible
        oof[f"Sugerido_{variant}"] = suggested
        oof[f"ModeloUtilizado_{variant}"] = np.where(eligible, routes, "sin_prediccion")
        oof["Particion"] = fold_numbers
    return reports, oof
