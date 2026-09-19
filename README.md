<div align="center">

<h1>👑 ⚔️ LineLord ⚔️ 👑</h1>

## The Barbarians Guide to Git Repository Conquest

</div>

> _"What is best in code? To crush the bugs, see them driven from your repository, and to hear the lamentations of their stack traces!"_
>
> — Gorvek the Ironbane

## ⚔️ What is LineLord?

Know, O Prince, that between the years when repositories were young and the rise of the great codebases, there was an age undreamed of. And unto this, **LineLord**, destined to track every line of code and every developer who dared shape the digital realm!

LineLord is a mighty CLI tool forged in the fires of the Ashen Vale, wielding the ancient powers of `git blame` to reveal the true warriors who have conquered your codebase. No sorcery, no external APIs, no mystical dependencies — only the raw strength of native git commands, blessed by the flame-maned steeds of Horn!

### 🏰 Features Fit for a Galdane Warrior

- **🗡️ Native Git Power**: Uses git commands and an in-memory SQLite index — works anywhere git draws breath
- **🧠 Intelligent Author Merging**: Automatically unites "zygofer.whisperer@alderstone.realm" with "Zygofer the Defiler" using the wisdom of ancient fuzzy matching
- **📊 Comprehensive Battle Reports**: File-level ownership, project statistics, and developer rankings
- **⚡ Lightning-Fast Analysis**: Parallel processing that would make Horn's volcanic forge proud
- **🎯 Smart Filtering**: Analyses tracked files only, and sets aside binaries, generated files and anything over the size threshold
- **⚔️ Brutal Barbarian Rankings**: Ranks warriors by the ground they still hold — territory owned, solo-conquered files, and code that has outlived a year
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

```bash
# Cache control
linelord --no-cache          # do not read or write the stored analysis
linelord --refresh           # ignore what is stored and read everything again
linelord --clear-cache       # forget this repository's stored analysis
linelord --clear-all-caches  # forget every repository's
```

The analysis is kept in `$XDG_CACHE_HOME/linelord` (or `~/.cache/linelord`),
one file per repository. It holds file paths, commit hashes and dates, and
contributor names and email addresses — not file contents. Caches nobody has
opened for fifteen days are removed, and once the directory passes 500 MB the
least recently used caches are deleted until it is back under. If it cannot be written, the analysis runs anyway.

Run it anywhere inside a repository and it analyses the whole repository, not
just the directory you happen to be standing in. Point it somewhere that is not
a repository, or give a threshold that is zero, negative or not a number, and it
says so and stops — rather than handing you an empty or unfiltered analysis with
no explanation.

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

- ✅ All git-tracked text files under size threshold
- ✅ Source code in any language
- ✅ Configuration files
- ✅ Documentation
- ✅ Scripts and makefiles
- ✅ Tests — they are code somebody wrote and owns, and they count

### The Unworthy (Excluded)

_"What Galdane warrior has time for scrolls that weigh more than a war hammer? LineLord casts aside these digital beasts, for they are likely the work of Zytera's corruption and code generation, not true craftsmanship!"_

- ❌ Binary files — git decides, by the same rule it uses when choosing whether
  to show you a diff. If `git diff` prints the contents, LineLord counts them;
  if it says `Binary files differ`, it does not. That means SVG counts, being
  markup somebody wrote, and a blob with an unfamiliar extension does not
- ❌ Generated files (package-lock.json, yarn.lock, etc.) — matched as proper
  globs, so a directory is excluded only when a whole path segment matches;
  `checkout/` is not `out/`
- ❌ Build artifacts (dist/, build/, node_modules/)
- ❌ Untracked files — only what git tracks is analysed, so whatever `.gitignore` keeps out of the repository is already out of scope
- ❌ **Bloated files (configurable threshold, default: 50KB)**
- ❌ **Blank lines (banished from the realm)**

Disagree with a verdict? `.gitattributes` settles it, for git and LineLord
alike:

```gitattributes
generated.sql binary     # count it as a blob, though it is text
weird.dat     diff       # count it as text, though git would guess otherwise
```
- ❌ **Uncommitted changes** — analysis runs against `HEAD`, so unsaved edits in your working copy are never counted and never attributed to anyone

## ⚔️ Brutal Barbarian Rankings

A ranking of warriors by conquest rather than by volume. Every metric counts
lines that are **still alive in `HEAD`**:

| Metric | What it counts |
| --- | --- |
| Battle Scars | Surviving lines in large or legacy-looking files |
| Territory Conquered | Files where the warrior owns more than half the lines |
| Solo Quests | Files where every surviving line is theirs |
| Weapon Mastery | Distinct file types they hold lines in |
| Ancient Code | Surviving lines last touched more than a year ago |
| Massive Battles | Days when over 100 of their surviving lines were last touched |
| Campaigns | Distinct days their surviving lines were last touched |

### How to read the numbers

The theming is a joke about conquest. The numbers are not.

- Nothing here counts commits, and nothing here looks at **when** anyone worked.
  A late night costs you nothing and earns you nothing.
- **Old code means stable code, not good code.** The code nobody dares touch
  scores exactly as well as the code that earned its place.
- Reformatting resets a line's age. A single `prettier` commit can hand one
  warrior the whole codebase — use `.git-blame-ignore-revs` to keep it honest.
- **These numbers are not a measure of anyone's productivity**, and LineLord
  should not be used as one.

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

LineLord uses **current line ownership** (via `git blame`), not historical commits:

- 👑 **Crown** - The supreme ruler of your codebase
- 🥈 **Silver Honor** - The second most dominating code warrior
- 🥉 **Bronze Glory** - The third most dominating code warrior
- **Glorious/Lowly** - The mightiest and humblest contributors

### Pie Chart Visualization

- 🔴 **Red** - For the mightiest contributor
- **Top 10 limit** - Only the worthiest warriors are displayed

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
- **Within one run**: The blame data is held in memory, so moving between screens is instant
- **Between runs**: Nothing is kept. Every launch re-analyses the repository from scratch

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

LineLord is open source software released under the **GNU General Public License v3.0 (GPL-3)**.

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

_All dependencies use permissive licenses and remain under their original terms._
