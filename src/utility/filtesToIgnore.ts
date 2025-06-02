export const ignoredFilePatterns = [
  // Lock files
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.lock',
  'pipfile.lock',
  'poetry.lock',
  'bun.lock',
  'deno-lock',
  'go.sum',
  'cargo.lock',
  '.lock',

  // Test snapshots
  '.snap',
  '__snapshots__/',

  // Minified/bundled files
  '.min.js',
  '.min.css',
  '.bundle.js',
  '.bundle.css',

  // Build artifacts
  'dist/',
  'build/',
  'coverage/',
  'target/',
  'bin/',
  'obj/',
  'out/',
  '.gradle/',

  // Generated documentation
  '.generated.',
  'auto-generated',
  '_generated',

  // Framework generated
  '.next/',
  '.nuxt/',
  '.svelte-kit/',
  'node_modules/',

  // IDE files
  '.vscode/',
  '.idea/',
  '.vs/',
  '*.swp',
  '*.swo',
  '.ds_store',
  'thumbs.db',

  // Version control
  '.git/',
  '.svn/',
  '.hg/',

  // Language specific generated
  '*.pyc',
  '*.class',
  '*.jar',
  '*.war',
  'vendor/',

  // Misc
  '*.autobumper*',
  'translations/',
  '.kotlin/',
  'db/migrate/',
  '*.pb.go',

  // Python specific
  '*.pyo',
  '*.pyd',
  '__pycache__/',
  '.Python',
  'develop-eggs/',
  'downloads/',
  'eggs/',
  '.eggs/',
  'lib/',
  'lib64/',
  'parts/',
  'sdist/',
  'var/',
  'wheels/',
  '*.egg-info/',
  '.installed.cfg',
  '*.egg',

  // Virtual environments
  'venv/',
  'env/',
  'ENV/',
  'env.bak/',
  'venv.bak/',
  '.venv/',
  '.env/',

  // Django specific
  '*.log',
  'local_settings.py',
  'db.sqlite3',
  'db.sqlite3-journal',
  'media/',
  'staticfiles/',
  'static/',
  'migrations/',

  // Flask specific
  'instance/',
  '.webassets-cache',

  // Jupyter Notebooks
  '.ipynb_checkpoints/',

  // pytest
  '.pytest_cache/',
  '.coverage',
  'htmlcov/',
  '.tox/',

  // mypy
  '.mypy_cache/',
  '.dmypy.json',
  'dmypy.json',

  // Celery
  'celerybeat-schedule',
  'celerybeat.pid',

  // Sphinx documentation
  'docs/_build/',
]

export const ignoredFileExtensions = new Set([
  '.snap',
  '.min.js',
  '.min.css',
  '.bundle.js',
  '.bundle.css',
  '.pyc',
  '.class',
  '.jar',
  '.war',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
])
