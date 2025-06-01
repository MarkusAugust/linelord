<div align="center">

<h1>👑 ⚔️ LineLord ⚔️ 👑</h1>

## The Barbarians Guide to Git Repository Conquest

</div>

> _"What is best in code? To crush the bugs, see them driven from your repository, and to hear the lamentations of their stack traces!"_
>
> — Gorvek the Ironbane

## ⚔️ What is LineLord?

Know, O Prince, that between the years when repositories were young and the rise of the great codebases, there was an age undreamed of. And unto this, **LineLord**, destined to track every line of code and every developer who dared shape the digital realm!

LineLord is a mighty CLI tool forged in the fires of the Ashen Vale, wielding the ancient powers of `git blame` to reveal the true warriors who have conquered your codebase. No sorcery, no external APIs, no mystical dependencies — only the raw strength of native git commands combined with intelligent caching, blessed by the flame-maned steeds of Horn!

### 🏰 Features Fit for a Galdane Warrior

- **🗡️ Native Git Power**: Uses git commands with intelligent SQLite caching — works anywhere git draws breath
- **🧠 Intelligent Author Merging**: Automatically unites "zygofer.whisperer@alderstone.realm" with "Zygofer the Defiler" using the wisdom of ancient rune-matching
- **📊 Comprehensive Battle Reports**: File-level ownership, project statistics, and developer rankings
- **⚡ Lightning-Fast Analysis**: Parallel processing with smart caching that would make Horn's volcanic forge proud
- **🎯 Smart Filtering**: Respects .gitignore, excludes binaries and generated files like a seasoned Rust Brother
- **⚙️ Configurable Thresholds**: Control large file limits to suit your conquest needs
- **🎨 Epic Forbidden Lands Theme**: Because code analysis should feel like surviving the Blood Mist!

## 🏹 Installation - Claim Your Weapon

### The Swift Path via Homebrew

The easiest way to arm yourself with LineLord is through Homebrew, as trusted as a Galdane battle-axe:

```bash
# Add the LineLord tap (repository of formulas)
brew tap markusaugust/linelord

# Install LineLord
brew install linelord
```

If LineLord responds with Gorvek's wisdom, your installation is complete!

## ⚔️ Usage - Enter the Digital Battlefield

### Quick Conquest

```bash
# Analyze current directory
linelord

# Analyze specific repository
linelord ~/projects/my-epic-codebase

# Use path flag (supports ~ expansion)
linelord --path ~/code/forbidden-toolkit

# Show version information
linelord --version

# Display help and available options
linelord --help
```

### Advanced Usage - Master the Battlefield

```bash
# Custom file size threshold (default: 50KB)
linelord --threshold=100 ~/large-repo    # Skip files >100KB
linelord -t 25 .                         # More aggressive filtering

# Combine path and threshold for total conquest
linelord --path=~/enterprise-codebase --threshold=200

# Short flags for swift warriors
linelord -p ~/code/project -t 75
```

### Navigation Commands

Once in LineLord's realm:

- **ESC or 'q'** - Return to previous screen or exit
- **Arrow keys** - Navigate menus like a seasoned Galdane rider
- **Enter** - Select your conquest
- **:q** or **:x** - Exit like a vim warrior (from main menu)

### Battle Reports Available

1. **📊 Repository Statistics** - Quick overview of your digital domain
2. **📈 Extended Repository Statistics** - Detailed battle reports with file breakdowns
3. **👤 Single Developer Statistics** - Focus on one warrior's contributions
4. **ℹ️ About** - Learn the ways of LineLord

## 🔄 Updating Your Weapon - Stay Sharp for Battle

### The Honorable Upgrade Path

When a new version is forged in Horn's volcanic fires, Homebrew makes updating as simple as drawing your blade:

```bash
# Update Homebrew's knowledge of available formulas
brew update

# Upgrade LineLord to the latest version
brew upgrade linelord
```

### Stay Informed of New Releases

```bash
# Check what version is available
brew info linelord

# See all outdated formulas (including LineLord if applicable)
brew outdated
```

## 🛡️ What Gets Analyzed?

### The Worthy (Included)

_"These are the true scrolls of power! Written by mortal hands with sweat and blood, each line a testament to the warrior's craft. LineLord honors these works, for they bear the mark of genuine battle against the demonic corruption of bugs!"_

- ✅ All git-tracked text files
- ✅ Source code in any language
- ✅ Configuration files
- ✅ Documentation
- ✅ Scripts and makefiles

### The Unworthy (Excluded)

_"What Galdane warrior has time for scrolls that weigh more than a war hammer? LineLord casts aside these digital beasts, for they are likely the work of Zytera's corruption and code generation, not true craftsmanship!"_

- ❌ Binary files (auto-detected)
- ❌ Generated files (package-lock.json, yarn.lock, etc.)
- ❌ Build artifacts (dist/, build/, node_modules/)
- ❌ IDE and OS files (.vscode/, .DS_Store)
- ❌ Files usually ignored by .gitignore
- ❌ **Bloated files (configurable threshold, default: 50KB)**

## 📊 Understanding the Battle Reports

### Repository Statistics

- **Developer count** - How many warriors have touched your codebase
- **File metrics** - Total files vs analyzed files vs large files cast aside
- **Line counts** - The true measure of a codebase's might
- **Contribution percentages** - Who rules which territories

### The Great Filtering

LineLord's wisdom recognizes that not all files deserve the honor of analysis:

- **Binary files** are banished like demons from the Forbidden Lands
- **Generated files** are dismissed as the work of corrupted Rust Brothers
- **Oversized scrolls** are deemed unworthy of a warrior's attention - _"By Gorvek's flame-scarred hands, what mortal could craft such bloated code? These are the spawn of demonic tools and Zytera's dark magic!"_

**Configure your threshold:** Use `--threshold=X` where X is your desired KB limit. Smaller values = more aggressive filtering.

### The Ranking System

LineLord uses **current ownership** (via `git blame`), not historical commits:

- 👑 **Crown** - The supreme ruler of your codebase
- **Glorious/Lowly** - The mightiest and humblest contributors

### Pie Chart Visualization

- 🔴 **Red** - For the mightiest contributor
- **Top 10 limit** - Only the worthiest warriors are displayed

## 🏗️ Technical Architecture - The Forge of LineLord

### The Engine of Conquest

LineLord combines the raw power of git with sophisticated intelligence:

- **Git Analysis**: Uses `git blame --line-porcelain` for precise line ownership
- **Smart Caching**: SQLite database accelerates re-analysis of the same repository
- **Author Intelligence**: Fuzzy matching algorithm merges similar author identities
- **Parallel Processing**: Batch processing handles large repositories with warrior efficiency
- **Intelligent Filtering**: Multi-layered approach excludes unworthy files

### Performance Architecture

LineLord processes repositories through multiple services:

- **GitService**: Handles all git command interactions
- **AuthorNormalizationService**: Merges similar author names intelligently
- **AnalysisService**: Generates battle reports and statistics
- **LineLordService**: Orchestrates the entire conquest

## 🎯 Pro Tips for Digital Galdanes

### Getting the Best Results

```bash
# Run from repository root for full conquest
cd /path/to/your/repo
linelord

# For large repos, be patient - true analysis takes time
# LineLord processes files in parallel like a Galdane war-band!

# Tune the threshold for your needs
linelord --threshold=25    # More aggressive filtering
linelord --threshold=200   # Allow larger files
```

### Understanding Merged Authors

LineLord automatically merges similar names:

- "gorvek@ashendale.realm" + "Gorvek the Ironbane" → "Gorvek the Ironbane"
- "z.tera" + "Zytera the Defiler" → "Zytera the Defiler"
- "raven.sister@koracia.village" + "Sister Nightshroud" → "Sister Nightshroud"
- Uses fuzzy matching with ancient rune-comparison techniques

### Performance Notes

- **Small repos (< 100 files)**: Lightning fast as Ashwind's charge ⚡
- **Medium repos (100-1000 files)**: Swift as Gorvek's blade 🗡️
- **Large repos (1000+ files)**: Worthy of a Galdane warrior's patience 🏰
- **Re-analysis**: Cached results make subsequent runs swift as wind

### Optimizing Large Repository Analysis

```bash
# For massive codebases, increase the threshold to skip more files
linelord --threshold=500 ~/enterprise-monorepo

# Focus on specific directories
cd ~/project/src && linelord

# Use path flag to avoid navigating
linelord --path=~/project/core --threshold=100
```

## 🗡️ Contributing to the Saga

Want to forge improvements to LineLord? Contact the maintainer!

## 📜 Gorvek's Wisdom

> _"Contemplate this upon the ruins of Falender: merge conflicts are temporary, but git history is forever."_

> _"What is steel compared to the code that wields it? What is the compiler compared to the mind that guides it?"_

> _"Let Rust Brothers and demon-worshippers brood over questions of reality and illusion. The developer knows that code either works or it does not!"_

> _"Horn cares little for your frameworks. He cares if the work is done."_

> _"Between the time when the Blood Mist shrouded the land, and the rise of the new age of exploration, there was an age undreamed of. And onto this, LineLord, destined to track all code in your repository!"_

## 📄 License

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

_Usage is granted to those who prove themselves worthy in the eyes of Horn, the grim god of fire and forge. Let the weak tremble before LineLord's might, for only true warriors of the digital realm may wield its power!_

LineLord is open source software released under the **GNU General Public License v3.0 (GPL-3)**.

This means you are free to:

- Use LineLord for any purpose
- Study and modify the source code
- Distribute copies of LineLord
- Distribute your modified versions

**However, GPL-3 requires that:**

- Any distributed copies or modifications must also be licensed under GPL-3
- You must provide source code when distributing binaries
- You must preserve copyright notices and license information
- Modified versions must be clearly marked as changed

**GPL-3 ensures that LineLord and any derivative works remain free and open source for all warriors of the digital realm!**

---

## 🙏 Acknowledgments

LineLord stands on the shoulders of these mighty open source warriors:

### Core Dependencies

- **[ink](https://github.com/vadimdemedes/ink)** - React for CLI interfaces
- **[meow](https://github.com/sindresorhus/meow)** - CLI argument parsing
- **[fastest-levenshtein](https://github.com/ka-weihe/fastest-levenshtein)** - Author name matching
- **[picocolors](https://github.com/alexeyraspopov/picocolors)** - Terminal colors
- **[react](https://reactjs.org/)** - UI framework

### Development Tools

- **[Biome](https://biomejs.dev/)** - Code formatting and linting
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety

_All dependencies use permissive licenses (MIT, ISC, Apache 2.0) and remain under their original terms._
