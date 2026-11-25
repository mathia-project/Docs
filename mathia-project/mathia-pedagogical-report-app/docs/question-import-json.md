# Contrato JSON para importar preguntas en bloque

Este documento define el formato que debe producir un agente de IA para crear
ficheros de preguntas importables por Mathia. La definición validable está en
`data/questions/question-import.schema.json` y el ejemplo completo en
`data/questions/example-question-batch.es.json`.

## Formato del fichero

- Codificación: UTF-8.
- Extensión recomendada: `.json`.
- Nombre recomendado: `questions-{idioma}-{dominio}-{secuencia}.json`, por
  ejemplo `questions-es-6-rp-001.json`.
- Cada fichero es un documento JSON completo e independiente.
- No se permiten comentarios, comas finales, bloques Markdown ni texto antes o
  después del JSON.
- Un lote se importa completo: si alguna pregunta no es válida, la interfaz no
  permite confirmar la importación.
- Tamaño operativo recomendado: entre 25 y 100 preguntas por fichero. El
  contrato no impone un máximo.

Estructura raíz:

```json
{
  "schema_version": "1.0",
  "questions": []
}
```

Solo existen dos propiedades en la raíz:

| Campo | Tipo | Obligatorio | Regla |
| --- | --- | --- | --- |
| `schema_version` | string | sí | Debe ser exactamente `"1.0"`. |
| `questions` | array | sí | Debe contener al menos una pregunta en los ficheros generados. |

## Objeto pregunta

```json
{
  "external_id": "Q-6RP-001",
  "question_type": "single_choice",
  "prompt": "Una receta usa 2 tazas de agua por cada 3 tazas de harina. ¿Qué razón representa el agua respecto a la harina?",
  "options": [
    { "key": "A", "content": "2:3" },
    { "key": "B", "content": "3:2" },
    { "key": "C", "content": "2:5" },
    { "key": "D", "content": "5:2" }
  ],
  "correct_options": ["A"],
  "explanation": "La razón compara 2 tazas de agua con 3 tazas de harina, por lo que es 2:3.",
  "difficulty": "easy",
  "language": "es",
  "curriculum": {
    "domain_code": "6.RP",
    "cluster_code": "6.RP.A",
    "standard_code": "6.RP.A.1",
    "substandard_code": null
  },
  "answer_config": {}
}
```

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `external_id` | string o `null` | no | Identificador estable de la pregunta. Debe ser único, sin distinguir mayúsculas/minúsculas, dentro del centro. Se recomienda incluir nivel, dominio y secuencia. |
| `question_type` | enum | sí | `single_choice`, `multiple_choice`, `true_false`, `numeric` o `short_text`. |
| `prompt` | string no vacío | sí | Enunciado que verá el alumno. Puede contener saltos de línea. |
| `options` | array | según tipo | Opciones visibles de los tres tipos de selección. No se usa en preguntas numéricas o de texto corto. |
| `correct_options` | array de strings | según tipo | Claves de las opciones correctas. Cada clave debe existir en `options`. |
| `explanation` | string o `null` | no | Explicación pedagógica de la solución. Se recomienda incluirla siempre. No se muestra durante un intento activo. |
| `difficulty` | enum | sí | `easy`, `medium` o `hard`. |
| `language` | string | sí | Código BCP 47 sencillo: dos o tres minúsculas y región opcional en mayúsculas; ejemplos: `es`, `en`, `ca`, `es-ES`. |
| `curriculum` | object | sí | Ruta curricular exacta. El dominio siempre es obligatorio. |
| `answer_config` | object | según tipo | Configuración determinista de respuesta. Solo contiene datos en preguntas numéricas. |

El importador establece automáticamente valores que el agente no debe enviar:

- `source = "ai"`;
- `status = "draft"`;
- `visibility = "private"`;
- centro y propietario a partir del usuario autenticado;
- fechas e identificadores internos.

No deben añadirse al JSON propiedades como `school_id`, `teacher_id`, `status`,
`visibility`, `source`, `is_correct`, `position`, `metadata` o identificadores
UUID de Directus.

## Objeto opción

```json
{ "key": "A", "content": "2:3" }
```

| Campo | Tipo | Obligatorio | Regla |
| --- | --- | --- | --- |
| `key` | string | sí | Única dentro de la pregunta. Usar `A`, `B`, `C`, `D`, etc. El importador la convierte a mayúsculas. |
| `content` | string no vacío | sí | Texto visible de la opción. |

El orden del array determina la posición. La solución no se marca en la opción:
se declara una sola vez mediante `correct_options`. El JSON de IA actual no
admite `feedback` por opción.

## Ruta curricular

```json
{
  "domain_code": "6.RP",
  "cluster_code": "6.RP.A",
  "standard_code": "6.RP.A.1",
  "substandard_code": null
}
```

| Campo | Tipo | Obligatorio | Regla |
| --- | --- | --- | --- |
| `domain_code` | string | sí | ID o código exacto de un dominio existente. |
| `cluster_code` | string o `null` | no | Debe pertenecer al dominio indicado. Es obligatorio si se informa un estándar. |
| `standard_code` | string o `null` | no | Debe pertenecer al clúster indicado. Se recomienda usar el ID canónico, por ejemplo `6.RP.A.1`. |
| `substandard_code` | string o `null` | no | Debe pertenecer al estándar indicado. Se recomienda usar el ID canónico, por ejemplo `6.RP.A.3a`. |

La fuente de verdad para escoger códigos es
`data/standards/final/ccss_math_grades_6_10.json`:

- las claves de `domains`, `clusters`, `standards` y `substandards` son los IDs
  canónicos;
- `clusters[id].domainId` debe coincidir con `domain_code`;
- `standards[id].clusterId` debe coincidir con `cluster_code`;
- `substandards[id].standardId` debe coincidir con `standard_code`;
- los cursos se consultan en `courses`, pero no se escriben en el fichero de
  preguntas: la relación de curso se deduce del currículo.

El importador también puede resolver algunos alias, códigos abreviados y
`ccssId`, pero el agente debe usar los IDs canónicos para que el resultado sea
inequívoco. Nunca debe inventar un código ni mezclar elementos de distintas
rutas curriculares.

## Reglas por tipo de pregunta

### `single_choice`

- `options`: obligatorio, mínimo dos opciones; se recomiendan cuatro.
- `correct_options`: exactamente una clave.
- `answer_config`: omitir o usar `{}`.
- Debe existir una única respuesta inequívocamente correcta.

### `multiple_choice`

- `options`: obligatorio, mínimo dos opciones; se recomiendan cuatro o cinco.
- `correct_options`: una o más claves, sin duplicados.
- La corrección exige coincidencia exacta del conjunto completo. No hay
  puntuación parcial.
- `answer_config`: omitir o usar `{}`.
- El enunciado debe decir claramente que puede haber varias respuestas.

### `true_false`

- `options`: exactamente dos opciones.
- Convención recomendada para `es`: `A = "Verdadero"`, `B = "Falso"`.
- `correct_options`: exactamente una de las dos claves.
- `answer_config`: omitir o usar `{}`.

### `numeric`

- `options`: omitir o usar `[]`.
- `correct_options`: omitir o usar `[]`.
- `answer_config.correct_value`: número JSON finito obligatorio.
- `answer_config.tolerance`: número mayor o igual que cero; si se omite se
  interpreta como `0` (respuesta exacta).
- Los decimales JSON usan punto, no coma. No se permiten `NaN` ni `Infinity`.
- La respuesta se acepta cuando
  `abs(respuesta_alumno - correct_value) <= tolerance`.
- Si se requiere una unidad, debe indicarse en el enunciado. La interfaz actual
  recoge únicamente el valor numérico y no valida una unidad separada.

Ejemplo:

```json
"answer_config": {
  "correct_value": 12.5,
  "tolerance": 0.01
}
```

### `short_text`

- `options`: omitir o usar `[]`.
- `correct_options`: omitir o usar `[]`.
- `answer_config`: omitir o usar `{}`.
- El tipo puede almacenarse, pero actualmente el reproductor del alumno no
  ofrece campo de respuesta ni existe corrección automática/manual completa.
  El agente no debe generarlo para pruebas ejecutables hasta que esa función se
  implemente; solo debe usarlo si se solicita expresamente para preparar banco
  de preguntas futuro.

## Reglas de coherencia que debe comprobar el agente

Antes de guardar el fichero, el agente debe verificar todas estas condiciones:

1. El documento puede parsearse como JSON y cumple el JSON Schema.
2. Todos los `external_id` del lote son distintos sin diferenciar mayúsculas y
   minúsculas, y no colisionan con IDs de lotes anteriores del mismo centro.
3. Cada `prompt` y cada `content` contiene texto real, no marcadores como
   `TODO`, `...` o `opción 1`.
4. Las claves de `options` son únicas y todas las claves de `correct_options`
   existen en esas opciones.
5. No hay dos opciones con contenido equivalente ni una opción que revele la
   solución por longitud, redacción o patrón.
6. La ruta dominio → clúster → estándar → subestándar existe y mantiene sus
   relaciones padre-hijo.
7. El contenido está en el idioma declarado y usa terminología apropiada para
   el nivel curricular.
8. La dificultad se valora por el razonamiento requerido, no por usar números
   artificialmente grandes o redacción confusa.
9. La explicación demuestra por qué la solución es correcta y, cuando aporta
   valor, aclara el error conceptual de los distractores.
10. Ninguna pregunta depende de imágenes, HTML, Markdown, LaTeX o archivos
    externos: la interfaz actual presenta el contenido como texto plano.
11. No se hace referencia a «la opción anterior», «la respuesta B» o la
    posición visual, porque las opciones pueden mostrarse en otro orden.
12. No se incluyen datos personales, contenido inseguro ni instrucciones para
    el agente dentro de los campos visibles al alumno.

El JSON Schema comprueba la estructura y muchas reglas condicionales. Las
reglas de pertenencia entre `correct_options` y `options`, unicidad de claves,
jerarquía curricular y calidad pedagógica requieren esta comprobación adicional
y la previsualización del importador.

## Instrucción lista para el agente generador

Puede proporcionarse al agente la siguiente instrucción junto con el número de
preguntas, idioma, nivel y objetivo curricular deseados:

```text
Genera un fichero JSON de preguntas para Mathia conforme a la versión 1.0.
Usa como contrato data/questions/question-import.schema.json y como catálogo
curricular data/standards/final/ccss_math_grades_6_10.json. Devuelve únicamente
JSON UTF-8, sin Markdown, comentarios ni texto adicional. Usa IDs curriculares
canónicos y comprueba toda la ruta padre-hijo. Genera external_id estables y
únicos. Cumple las reglas específicas del tipo de pregunta y las reglas de
coherencia de docs/question-import-json.md. Las preguntas deben ser autónomas,
pedagógicamente claras y tener una solución inequívoca. Incluye una explicación
útil en cada pregunta. No generes short_text para pruebas ejecutables.
```

## Validación y resultado de la importación

La pestaña «JSON IA» del banco de preguntas acepta el contenido del fichero. El
flujo normal es: parseo → resolución curricular → validación por fila →
previsualización → confirmación → creación como borrador privado.

Los nombres de error que puede mostrar la previsualización son:

| Error | Significado |
| --- | --- |
| `question_type` | Tipo no permitido. |
| `prompt` | Enunciado vacío. |
| `difficulty` | Dificultad no permitida. |
| `language` | Código de idioma con formato inválido. |
| `domain_code` | Dominio inexistente o ausente. |
| `cluster_code` | Clúster inexistente. |
| `cluster_parent` | El clúster no pertenece al dominio. |
| `standard_code` | Estándar inexistente o falta el clúster requerido. |
| `standard_parent` | El estándar no pertenece al clúster. |
| `substandard_code` | Subestándar inexistente o falta el estándar requerido. |
| `substandard_parent` | El subestándar no pertenece al estándar. |
| `correct_value` | Falta una respuesta numérica finita. |
| `tolerance` | La tolerancia no es numérica o es negativa. |

Después de importar, las preguntas permanecen en estado `draft`. Un profesor o
director debe revisarlas y publicarlas; la IA nunca publica directamente ni
escribe en PostgreSQL.
