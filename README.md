# Docs
Documentation about MathiA Project

[Mathia Project Home](https://mathia-project.eu)

![Co-founded by European Union](https://ec.europa.eu/regional_policy/images/information-sources/logo-download-center/eu_co_funded_en.jpg)

## This repository contains relevant information about the 'Mathia Project'.

### The following index lists the main areas and topics you can find in this repository.

All project materials are located in [`mathia-project/`](mathia-project/). The index below explains where to find the research models, the application, and the supporting documentation.

#### Research models — [`mathia-model/`](mathia-project/mathia-model/)

| Folder | Contents |
| --- | --- |
| [`LDD/`](mathia-project/mathia-model/LDD/) | Classification experiments for identifying cognitive and learning differences in mathematics education. Includes data preparation, training and classification notebooks, HTML versions, CSV datasets, and trained model artifacts. See the [folder README](mathia-project/mathia-model/LDD/README.md) for file descriptions. |
| [`ERA/`](mathia-project/mathia-model/ERA/) | Educational resource allocation using a genetic algorithm. Includes resource catalogue and student profile generation, optimization notebooks, HTML versions, and CSV inputs and outputs. See the [folder README](mathia-project/mathia-model/ERA/README.md) for file descriptions. |

#### Educational application — [`mathia-pedagogical-report-app/`](mathia-project/mathia-pedagogical-report-app/)

The application brings together school and student management, educational resources, tests, and pedagogical reports. Start with its [English README](mathia-project/mathia-pedagogical-report-app/README.md) for an overview, local installation instructions, demo accounts, and validation commands.

| Folder | Contents |
| --- | --- |
| [`app/`](mathia-project/mathia-pedagogical-report-app/app/) | SolidJS web interface for directors, teachers, and students, including translations and frontend tests. |
| [`ai-service/`](mathia-project/mathia-pedagogical-report-app/ai-service/) | FastAPI service for evaluation, predictions, question and resource generation, and pedagogical reports, including service tests. |
| [`ai-service/modelo_integrado/`](mathia-project/mathia-pedagogical-report-app/ai-service/modelo_integrado/) | Integrated educational prediction model, its input schema, configuration, and inference code. |
| [`directus/`](mathia-project/mathia-pedagogical-report-app/directus/) | Backend administration setup, with bootstrap scripts for relationships, roles, permissions, and demo data, plus Directus migrations. |
| [`postgres/`](mathia-project/mathia-pedagogical-report-app/postgres/) | Database schema and initialization scripts, migrations, curriculum generation scripts, and SQL checks. |
| [`data/`](mathia-project/mathia-pedagogical-report-app/data/) | Curriculum standards, question and resource import schemas and examples, and report JSON schemas and examples. |
| [`docs/`](mathia-project/mathia-pedagogical-report-app/docs/) | Documentation for question and resource imports, the report generation contract, and report presentation and PDF output. |
| [`scripts/`](mathia-project/mathia-pedagogical-report-app/scripts/) | Local setup automation, including `bootstrap.py` to configure and start the application with Docker Compose. |

#### Web ecosystem documentation — [`mathia-web/`](mathia-project/mathia-web/)

Legal notices and terms of use, privacy policies, and cookie policies for the MathiA website and its demo, learning, logbook, and resources subdomains, available in four languages.

| File | Contents |
| --- | --- |
| [`legal-notices.en.md`](mathia-project/mathia-web/legal-notices.en.md) | Legal notice and terms of use, privacy policy, and cookie policy in English. |
| [`textos-legales.es.md`](mathia-project/mathia-web/textos-legales.es.md) | Legal notice and terms of use, privacy policy, and cookie policy in Spanish. |
| [`note-legali.it.md`](mathia-project/mathia-web/note-legali.it.md) | Legal notice and terms of use, privacy policy, and cookie policy in Italian. |
| [`avisos-legais.pt.md`](mathia-project/mathia-web/avisos-legais.pt.md) | Legal notice and terms of use, privacy policy, and cookie policy in Portuguese. |

For an evaluation, begin with the application README to run the demo, explore `mathia-model/` to review the research experiments, and consult the application's `docs/` and `data/` folders for contracts and example formats.
