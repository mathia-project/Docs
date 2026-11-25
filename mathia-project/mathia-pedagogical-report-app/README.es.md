# Mathia Pedagogical Report

[English](README.md) | **Español**

Aplicación educativa para gestionar centros, clases, alumnado, recursos, pruebas e informes pedagógicos. Utiliza SolidJS, Directus, PostgreSQL y FastAPI.

## Inicio local

Requisitos: Docker con Compose v2 y Python 3.11 o posterior. Docker debe estar en ejecución. La primera instalación necesita conexión a Internet para descargar imágenes y dependencias. No se necesita Node.js ni instalar Python dentro del servicio: los contenedores incluyen sus entornos.

Desde esta carpeta, en Windows:

```powershell
py scripts/bootstrap.py
```

En Linux o macOS:

```bash
python3 scripts/bootstrap.py
```

El asistente crea `.env` con contraseñas aleatorias, construye las imágenes y espera al arranque de los servicios. PostgreSQL inicializa el esquema; el bootstrap de Directus configura colecciones, relaciones, roles y permisos, y carga un centro, una clase y cuentas ficticias de prueba. No importa datos de ninguna instalación existente.

| Servicio | Dirección predeterminada |
| --- | --- |
| Aplicación | http://localhost:5173 |
| Administración Directus | http://localhost:8055 |
| Documentación API FastAPI | http://localhost:8000/docs |
| Estado FastAPI | http://localhost:8000/health |

Las cuentas son `admin@example.com`, `director@example.com`, `teacher@example.com`, `student@example.com` y `student2@example.com`. Las contraseñas están en el archivo local `.env`: `DIRECTUS_ADMIN_PASSWORD`, `SEED_DIRECTOR_PASSWORD`, `SEED_TEACHER_PASSWORD` y los campos `password` de `SEED_STUDENTS_JSON`. Para estas cuentas de demostración utiliza la pestaña de acceso por correo electrónico.

Las cuentas se crean en el primer arranque. Cambiar una contraseña de semilla en `.env` no equivale a cambiarla en una base ya inicializada; para ello utiliza Directus Admin.

## Configuración

Para revisar o personalizar la configuración antes de arrancar:

```bash
python scripts/bootstrap.py --configure-only
```

Edita `.env` y ejecuta de nuevo el asistente. Si cambias `APP_PORT`, `DIRECTUS_PORT` o `AI_SERVICE_PORT`, actualiza también las URLs y los orígenes CORS correspondientes. En Linux/macOS utiliza `python3` si ese es el nombre del intérprete.

La generación utiliza el proveedor `mock` y la búsqueda externa está desactivada en Docker Compose. Los resultados generativos son simulados para probar los flujos y no representan respuestas de Gemini. La inferencia del modelo educativo local utiliza el artefacto incluido en `ai-service/modelo_integrado/`; solo deben cargarse artefactos de confianza. Este entregable no incluye claves, credenciales, identificadores de proyectos ni montajes de Google Cloud. El adaptador de Vertex AI se conserva en el código para una integración posterior con credenciales propias.

## Operación local

```bash
docker compose ps -a
docker compose logs --tail=100
docker compose stop
```

Para volver a arrancar, ejecuta `scripts/bootstrap.py`. El asistente conserva `.env` y los volúmenes existentes. El contenedor `directus-bootstrap` debe terminar con código `0`; los demás servicios deben estar saludables.

Para detener y retirar los contenedores, conservando los datos:

```bash
docker compose down
```

Para eliminar **todos los datos locales** de esta instalación y volver a inicializar desde cero:

```bash
docker compose down --volumes
python scripts/bootstrap.py
```

Los servicios se publican exclusivamente en `127.0.0.1`. Esta configuración es para pruebas locales con HTTP. PostgreSQL, archivos subidos y snapshots se almacenan en volúmenes de Docker del proyecto `mathia-local`.

## Estructura

```text
app/                 SPA SolidJS, traducciones y pruebas
ai-service/          FastAPI, proveedores, modelo y pruebas
directus/bootstrap/  Relaciones, roles, permisos y datos iniciales
directus/migrations/ Integridad entre tablas de negocio y Directus
postgres/            Esquema, migraciones y comprobaciones SQL
data/                Catálogo curricular y ejemplos de importación
docs/                Contratos y formatos de importación
scripts/bootstrap.py Asistente de arranque local
```

PostgreSQL es la fuente de verdad. Directus gestiona autenticación y CRUD, con permisos relacionales por centro y clase. FastAPI gestiona cálculos, inferencia e informes; la SPA consume las APIs. El catálogo curricular se incluye como archivos para evitar depender de un submódulo Git al trasladar esta carpeta.

## Desarrollo y validación

Para trabajar fuera de los contenedores, instala Node.js compatible con `app/package.json` y Python 3.14 para el servicio y su modelo.

```bash
cd app
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Desde `ai-service`, crea y activa un entorno virtual e instala `requirements-dev.txt`:

```bash
python -m pip install -r requirements-dev.txt
python -m pytest
python -m ruff check app tests
python -m app.schemas.export_report_schemas --check
```

Desde `directus/bootstrap`:

```bash
npm test
npm run validate
```

## Publicar el código

Copia el contenido de esta carpeta al repositorio de destino, incluidos `.gitignore`, `.env.example` y los demás archivos ocultos de configuración. No copies un `.env` generado ni los directorios de dependencias o resultados de pruebas. No se incluye historial Git, bases de datos, archivos subidos ni copias de seguridad.

El código conserva la licencia GPL-3.0 incluida en [LICENSE](LICENSE). Las dependencias mantienen sus propias licencias. El catálogo curricular procede de [CCSS-Mapping](https://github.com/andrejfranulic/CCSS-Mapping); sus registros conservan la información de procedencia.
