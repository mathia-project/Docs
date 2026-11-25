# Integrated educational model

modelo_pu.joblib contains the inference artifact used by the service. mathia_pu/ contains its loader and prediction code; esquema_entrada.json describes the input and config_utilizada.json records its configuration.

Results are suggestions for educational review, not diagnoses. The service checks course coverage and available evidence before making a suggestion.

Only load artifacts from trusted sources: pickle-based formats can execute code during loading. The service does not accept arbitrary user-uploaded models. Training data is not included.
