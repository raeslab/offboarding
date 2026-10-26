/*
 * Site configuration. Edit texts, options and help messages here;
 * no other file needs to change for wording updates.
 */
window.OFFBOARDING_CONFIG = {
  groupName: 'Raes Lab',
  organisation: 'VIB-KU Leuven Center for Microbiology',
  siteTitle: 'Data & code offboarding',
  reportTitle: 'Data & Code Offboarding Report',
  sendTo: 'your supervisor',

  // Bump the suffix if the data model ever changes incompatibly.
  storageKey: 'raeslab-offboarding-v1',

  gitlab: {
    namespace: 'raeslab',
    namespaceUrl: '' // e.g. 'https://gitlab.example.org/raeslab' — shown as a link when set
  },

  // Soft format checks (case-insensitive). Only a warning is shown.
  patterns: {
    uNumber: { regex: '^u\\d{7}$', example: 'u0123456' },
    vsc: { regex: '^vsc\\d{5}$', example: 'vsc12345' }
  },

  // Fonts used for the web page and embedded in the PDF (see scripts/fetch_vendor.py).
  pdfFonts: {
    family: 'NunitoSans',
    normal: 'vendor/fonts/NunitoSans-400.ttf',
    bold: 'vendor/fonts/NunitoSans-700.ttf',
    italic: 'vendor/fonts/NunitoSans-400-italic.ttf'
  },

  locationTypes: [
    { value: 'tier1', label: 'Tier1', placeholder: 'Path / collection on Tier1 storage' },
    { value: 'tier2-staging', label: 'Tier2-staging', placeholder: 'e.g. /staging/leuven/stg_00000/project/...' },
    { value: 'gitlab', label: 'GitLab', placeholder: 'Repository URL in the raeslab namespace' },
    { value: 'other', label: 'Other…', placeholder: 'Path or URL', needsSpec: true }
  ],

  categories: [
    { key: 'raw', label: 'Raw data', help: 'Unprocessed data as received from the instrument, sequencing provider or collaborator.' },
    { key: 'processed', label: 'Processed data', help: 'Intermediate and final results derived from the raw data (tables, figures, models, …).' },
    { key: 'code', label: 'Code', help: 'Scripts, notebooks, pipelines and workflow definitions used in this project.' }
  ],

  answerOptions: [
    { value: 'yes', label: 'Yes', tone: 'ok' },
    { value: 'partial', label: 'Partially', tone: 'warn' },
    { value: 'no', label: 'No', tone: 'bad' },
    { value: 'na', label: 'N/A', tone: 'neutral' }
  ],

  publishedKinds: [
    { value: 'dataset', label: 'Dataset' },
    { value: 'code', label: 'Code / software' }
  ],

  tooltips: {
    oneDrive: 'Research data must not stay on your personal OneDrive after you leave. Agree with your supervisor where these data need to go (e.g. Tier1 or Tier2-staging) and move them before your last day.',
    gitlab: 'All projects must be moved to the raeslab namespace on GitLab. Get in touch with a maintainer of the raeslab group to do the move; you cannot transfer projects into the group yourself.',
    vsc: 'Your VSC (Flemish Supercomputer Center) account, e.g. vsc12345. Tick the box if you never had one.',
    successor: 'The colleague who becomes responsible for the data and code of this project. Leave empty if this is not yet known.',
    sensitive: 'Personal data in the sense of the GDPR (e.g. human participant metadata) or other confidential data. Pseudonymisation or linking keys must be stored separately from the data.',
    published: 'Datasets and code that were made public, e.g. reads on ENA/SRA, data on Zenodo or GEO, code on GitHub or GitLab. These can be in different places: add one row for each.',
    retention: 'E.g. imposed by the funder, an ethics committee or a data agreement. If not, the standard institutional retention policy applies.',
    depositions: 'Depositions required by the funder or journal, e.g. raw reads to ENA/SRA, data to Zenodo.',
    codeChecklist: 'These questions apply to all repositories of all projects listed above.'
  },

  // Quick yes/no questions per project; details are only asked when the answer is "Yes".
  gates: {
    sensitive: 'Does this project contain personal or otherwise sensitive data (GDPR)?',
    published: 'Have datasets or code from this project been published?',
    retention: 'Are there specific retention or deletion requirements for these data?',
    depositions: 'Are data or code depositions required (by the funder or a journal)?'
  },

  codeChecks: [
    {
      id: 'readme',
      label: 'Every repository contains a README.md',
      help: 'With installation instructions, a description of what is in the repository and how the results were generated.'
    },
    {
      id: 'envs',
      label: 'Software versions are pinned in every repository',
      help: 'Using renv, venv/requirements.txt, conda environment files, containers (Docker/Apptainer), … so the analysis can be reproduced.'
    },
    {
      id: 'exampleData',
      label: 'Example data is included to run the code',
      help: 'A small dataset (or clear instructions where to find it) that lets someone else test the code.'
    }
  ]
};
