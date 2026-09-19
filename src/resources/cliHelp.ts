export const CLI_HELP = `
╔══════════════════════════════════════════════════════════════╗
║                     ⚔️  LineLord CLI  ⚔️                       ║
║             The Barbarian's Guide to Git Repository          ║
║                          Conquest                            ║
╠══════════════════════════════════════════════════════════════╣
║ USAGE:                                                       ║
║   $ linelord [repository]                                    ║
║                                                              ║
║ OPTIONS:                                                     ║
║   --path, -p       Path to repository (supports ~ )          ║
║   --threshold, -t  File size threshold in KB (default: 50)   ║
║   --version, -v    Display version information               ║
║   --no-cache       Do not read or write the stored analysis  ║
║   --refresh        Ignore what is stored and read everything ║
║   --clear-cache    Forget this repository's stored analysis  ║
║   --clear-all-caches  Forget every repository's              ║
║   --fuzzy-authors  Guess which identities are one person     ║
║   --write-mailmap  Write those guesses to .mailmap           ║
║   --help           Show this help                            ║
║                                                              ║
║ EXAMPLES:                                                    ║
║   $ linelord                          # Analyze current dir  ║
║   $ linelord ~/projects/barbarian     # Analyze specific     ║
║   $ linelord --path=~/code/gorvek      # Using path flag     ║
║   $ linelord -t 100                   # Set 100KB threshold  ║
║   $ linelord --threshold=25 ~/repo    # 25KB threshold       ║
║                                                              ║
║ FEATURES:                                                    ║
║   🗡️  Native Git Power - Uses only git commands               ║
║   🧠 Honest Identity - one address is one warrior            ║
║   📊 Comprehensive Battle Reports - File ownership stats     ║
║   🎯 Smart Filtering - Excludes binaries & large files       ║
║   ⚙️  Configurable Thresholds - Control large file limits     ║
║   ⚡ Lightning-Fast Analysis - Parallel processing           ║
║                                                              ║
║  ⚔️  "Count your lines, claim your territory, conquer!"       ║
╚══════════════════════════════════════════════════════════════╝
`
