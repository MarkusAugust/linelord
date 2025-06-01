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
║   --help           Show this help                            ║
║                                                              ║
║ EXAMPLES:                                                    ║
║   $ linelord                          # Analyze current dir  ║
║   $ linelord ~/projects/barbarian     # Analyze specific     ║
║   $ linelord --path=~/code/conan      # Using path flag      ║
║   $ linelord -t 100                   # Set 100KB threshold  ║
║   $ linelord --threshold=25 ~/repo    # 25KB threshold       ║
║                                                              ║
║ FEATURES:                                                    ║
║   🗡️  Native Git Power - Uses only git commands               ║
║   🧠 Intelligent Author Merging on similar names             ║
║   📊 Comprehensive Battle Reports - File ownership stats     ║
║   🎯 Smart Filtering - Excludes binaries & large files       ║
║   ⚙️  Configurable Thresholds - Control large file limits     ║
║   ⚡ Lightning-Fast Analysis - Parallel processing           ║
║                                                              ║
║  ⚔️  "Count your lines, claim your territory, conquer!"       ║
╚══════════════════════════════════════════════════════════════╝
`
