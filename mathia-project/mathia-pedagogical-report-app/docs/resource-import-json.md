# Contrato JSON para generación e importación de recursos

El contrato canónico está en `data/resources/resource-import.schema.json` y usa
`schema_version: "1.0"`.

## Regla de generación

- `document`: la IA genera el contenido en `body` y registra la instrucción en
  `generation.mode: "generated"`.
- `exercise`: la IA genera el contenido Markdown en `body` y, además, una
  representación estructurada en `exercise`. Cada ejercicio debe incluir
  enunciado y solución.
- `link` y `video`: la IA no inventa el recurso. Usa `generation.mode:
  "web_search"`, conserva la URL elegida y registra la consulta, la fecha y
  los resultados consultados en `generation.search`.
- `provided`: permite importar un recurso aportado manualmente o por otro
  sistema sin afirmar que ha sido generado o encontrado por búsqueda.

## Seguridad y revisión

Los recursos generados o descubiertos deben entrar como `draft`. La aplicación
puede publicarlos después de una revisión docente. La URL solo puede usar
`http` o `https`.

La información de generación se conserva dentro de `resources.metadata` con
las claves `external_id`, `generation` y, cuando corresponde, `exercise`. Esto
permite auditar el origen sin añadir todavía columnas específicas a PostgreSQL.

## Identificación y currículo

`external_id` permite que el generador identifique el mismo recurso entre
lotes. Los campos curriculares aceptan IDs o códigos que existan en el catálogo:
`course_id`, `category_id`, `domain_id`, `cluster_id` y `standard_id`. El
importador comprueba además que la jerarquía curricular sea coherente. Las
alineaciones a subestándares quedan para la tabla relacional
`resource_curriculum_alignments`.

Un ejemplo completo se encuentra en
`data/resources/example-resource-batch.es.json`.
