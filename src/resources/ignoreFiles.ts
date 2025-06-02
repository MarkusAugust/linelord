export const binaryExts = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.bmp',
  '.svg',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.wmv',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.webp',
  '.tiff',
  '.tif',
  '.psd',
  '.ai',
  '.eps',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
  '.flv',
  '.mkv',
  '.webm',
  '.m4v',
  '.3gp',
  '.wav',
  '.flac',
  '.aac',
  '.ogg',
  '.m4a',
  '.otf',
  '.fon',
  '.deb',
  '.rpm',
  '.msi',
  '.dmg',
  '.pkg',
  '.iso',
  '.img',
  '.bin',
  '.dat',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.mdb',
])

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

  // Snapshot extensions
  '.snapshot',
  '.snap.js',
  '.snap.ts',

  // Compiled/Generated
  '.o',
  '.obj',
  '.lib',
  '.a',
  '.tsbuildinfo',
  '.d.ts.map',

  // Archives
  '.tar',
  '.tgz',
  '.tar.gz',
  '.tar.bz2',
  '.tar.xz',
  '.cab',
  '.msi',
  '.msm',
  '.msp',

  // Logs
  '.log',
  '.out',
  '.err',

  // Temporary
  '.tmp',
  '.temp',
  '.bak',
  '.backup',
  '.orig',
  '.swp',
  '.swo',

  // Database
  '.db',
  '.sqlite',
  '.sqlite3',
  '.mdb',

  // Mobile
  '.apk',
  '.ipa',
  '.aab',
  '.dex',

  // Security
  '.key',
  '.pem',
  '.crt',
  '.p12',
  '.pfx',
])

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

  // Snapshot files
  '*.snapshot',
  '.snapshots/',
  '**/__snapshots__/**',
  '*.snap.js',
  '*.snap.ts',
  '*.test.snap',
  '*.spec.snap',

  // Testing artifacts
  '.nyc_output/',
  'junit.xml',
  'test-results/',
  '.jest/',
  'karma.conf.js',

  // Cache directories
  '.cache/',
  '.parcel-cache/',
  '.rts2_cache_cjs/',
  '.rts2_cache_es/',
  '.rts2_cache_umd/',
  '.npm/',
  '.yarn/',
  '.pnp.*',

  // Logs
  '*.log.*',
  'logs/',
  'npm-debug.log*',
  'yarn-debug.log*',
  'yarn-error.log*',
  'lerna-debug.log*',

  // Runtime data
  'pids/',
  '*.pid',
  '*.seed',
  '*.pid.lock',

  // TypeScript
  '*.tsbuildinfo',
  '.tscache/',

  // ESLint/Prettier
  '.eslintcache',
  '.stylelintcache',

  // Storybook
  'storybook-static/',

  // Temporary files
  '*.tmp',
  '*.temp',
  '.temporary/',
  '~*',

  // Backup files
  '*.bak',
  '*.backup',
  '*.orig',
  '*~',

  // Archives (patterns)
  '*.tar.*',
  '*.tgz',
  '*.tar.gz',
  '*.tar.bz2',
  '*.tar.xz',

  // Java specific
  'hs_err_pid*',
  'replay_pid*',
  '.mtj.tmp/',

  // .NET specific
  '[Dd]ebug/',
  '[Rr]elease/',
  'x64/',
  'x86/',
  '*.user',
  '*.suo',
  '*.sln.docstates',
  '*.userprefs',

  // Ruby specific
  '.bundle/',
  'vendor/bundle/',
  '.yardoc/',
  '_yardoc/',
  'doc/',
  '.sass-cache/',

  // PHP specific
  'composer.phar',

  // Go specific
  '*.test',
  '*.prof',

  // Swift specific
  '.build/',
  'DerivedData/',
  '*.hmap',
  '*.ipa',
  '*.xcworkspace',

  // Mobile development
  '*.apk',
  '*.ap_',
  '*.aab',
  '*.dex',
  'captures/',
  'fastlane/report.xml',
  'fastlane/Preview.html',
  'fastlane/screenshots',
  'fastlane/test_output',

  // Machine Learning
  '*.h5',
  '*.hdf5',
  '*.model',
  '*.pkl',
  '*.pickle',
  'checkpoints/',
  'tensorboard/',

  // Terraform
  '.terraform/',
  '*.tfstate',
  '*.tfstate.*',
  '.terraform.lock.hcl',

  // Docker
  '.dockerignore',

  // OS specific
  '.DS_Store',
  '.DS_Store?',
  '._*',
  '.Spotlight-V100',
  '.Trashes',
  'ehthumbs.db',
  'Thumbs.db',
  'Desktop.ini',
  '$RECYCLE.BIN/',

  // Security
  '.env.*',
  '.envrc',
  'secrets/',
  '*.key',
  '*.pem',
  '*.crt',
  '*.csr',
  '*.p12',
  '*.pfx',

  // Profiling
  'profiler/',
  'flame-graph.html',

  // Database migrations
  'database/migrations/', // Laravel
  'priv/repo/migrations/', // Phoenix/Elixir
  'migrate/',
  'migration/',
  '**/migrations/**',
  'schema/',
  'db/schema.rb', // Rails schema
  'prisma/migrations/', // Prisma
  'knex_migrations/', // Knex.js
  'flyway/', // Flyway migrations
  'liquibase/', // Liquibase
  'database/seeds/', // Database seeds
  'seeds/',
  'fixtures/', // Test fixtures
  '**/db/migrate/**',
  '**/database/migrations/**',

  // Migration file patterns
  '*.migration.*',
  '*_migration.*',
  '*.migrate.*',
  '*_migrate.*',
  '*.schema.*',
  '*_schema.*',
]
