<div align="center">

<h1>👑 ⚔️ LineLord ⚔️ 👑</h1>

## The Barbarian's Guide to Git Repository Conquest

</div>

> _"What is best in code? To crush the bugs, see them driven from your repository, and to hear the lamentations of their stack traces!"_
>
> — Conan the Coder

## ⚔️ What is LineLord?

Know, O Prince, that between the years when repositories were young and the rise of the great codebases, there was an age undreamed of. And unto this, **LineLord**, destined to track every line of code, every commit, and every developer who dared shape the digital realm!

LineLord is a mighty CLI tool forged in the fires of necessity, wielding the ancient powers of `git blame` to reveal the true warriors who have conquered your codebase. No sorcery, no external APIs, no mystical dependencies — only the raw strength of native git commands!

### 🏰 Features Fit for a Barbarian King

- **🗡️ Native Git Power**: Uses only git commands — works anywhere git draws breath
- **🧠 Intelligent Author Merging**: Automatically unites "thulsa.doom@stygia.com" with "Thulsa Doom" using the wisdom of Levenshtein distance
- **📊 Comprehensive Battle Reports**: File-level ownership, project statistics, and developer rankings
- **⚡ Lightning-Fast Analysis**: Parallel processing that would make Crom himself proud
- **🎯 Smart Filtering**: Respects .gitignore, excludes binaries and generated files
- **🎨 Epic Conan Theme**: Because code analysis should feel like a heroic quest!

## 🏹 Installation - Claim Your Weapon

### The Swift Path via Homebrew

The easiest way to arm yourself with LineLord is through Homebrew, as trusted as an Atlantean blade:

```bash
# Add the LineLord tap (repository of formulas)
brew tap markusaugust/linelord

# Install LineLord
brew install linelord
```

If LineLord responds with Conan's wisdom, your installation is complete!

## ⚔️ Usage - Enter the Digital Battlefield

### Quick Conquest

```bash
# Analyze current directory
linelord

# Analyze specific repository
linelord ~/projects/my-epic-codebase

# Use path flag (supports ~ expansion)
linelord --path ~/code/barbarian-toolkit

# Learn about LineLord's powers
linelord --about
```

### Navigation Commands

Once in LineLord's realm:

- **ESC or 'q'** - Return to previous screen or exit
- **Arrow keys** - Navigate menus like a seasoned warrior
- **Enter** - Select your conquest

### Battle Reports Available

1. **📊 Repository Statistics** - Quick overview of your digital domain
2. **📈 Extended Repository Statistics** - Detailed battle reports with file breakdowns
3. **👤 Single Developer Statistics** - Focus on one warrior's contributions
4. **ℹ️ About** - Learn the ways of LineLord

## 🔄 Updating Your Weapon - Stay Sharp for Battle

### The Honorable Upgrade Path

When a new version is forged in the fires of development, Homebrew makes updating as simple as drawing your sword:

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

- ✅ All git-tracked text files
- ✅ Source code in any language
- ✅ Configuration files
- ✅ Documentation
- ✅ Scripts and makefiles

### The Unworthy (Excluded)

- ❌ Binary files (auto-detected)
- ❌ Generated files (package-lock.json, yarn.lock, etc.)
- ❌ Build artifacts (dist/, build/, node_modules/)
- ❌ IDE and OS files (.vscode/, .DS_Store)
- ❌ Files ignored by .gitignore

## 📊 Understanding the Battle Reports

### Repository Statistics

- **Developer count** - How many warriors have touched your codebase
- **File metrics** - Total files vs analyzed files
- **Line counts** - The true measure of a codebase's size
- **Contribution percentages** - Who rules which territories

### The Ranking System

LineLord uses **current ownership** (via `git blame`), not historical commits:

- 👑 **Crown** - The supreme ruler of your codebase
- **Glorious/Lowly** - The mightiest and humblest contributors

### Pie Chart Visualization

- 🔴 **Red** - For the mightiest contributor
- **Top 10 limit** - Only the worthiest warriors are displayed

## 🎯 Pro Tips for Digital Barbarians

### Getting the Best Results

```bash
# Run from repository root for full conquest
cd /path/to/your/repo
linelord

# For large repos, be patient - true analysis takes time
# LineLord processes files in parallel like a barbarian horde!
```

### Understanding Merged Authors

LineLord automatically merges similar names:

- "conan@cimmeria.com" + "Conan of Cimmeria" → "Conan of Cimmeria"
- "t.doom" + "Thulsa Doom" → "Thulsa Doom"
- "valeria.sword@aquilonia.gov" + "Valeria" → "Valeria"
- Uses fuzzy matching with Levenshtein distance

### Performance Notes

- **Small repos (< 100 files)**: Lightning fast ⚡
- **Medium repos (100-1000 files)**: Swift as Conan's blade 🗡️
- **Large repos (1000+ files)**: Worthy of a barbarian's patience 🏰

## 🐛 Troubleshooting - When Crom Frowns

**"Not a valid git repository"**

```bash
# Ensure you're in a git repository
git status
# If not initialized:
git init
```

**"No authors found"**

```bash
# Repository needs at least one commit
git add .
git commit -m "Initial barbarian conquest"
```

**LineLord command not found after installation**

```bash
# Restart your terminal or reload your shell
source ~/.zshrc  # or ~/.bashrc

# If still not found, check Homebrew installation
brew doctor
```

## 🗡️ Contributing to the Saga

Want to forge improvements to LineLord? Contact the maintainers - but know that Crom has not yet deemed this worthy of open source release. The source code remains guarded like the treasures of Aquilonia until the gods approve.

## 📜 Conan's Wisdom

> _"Contemplate this upon the Tree of Woe: merge conflicts are temporary, but git history is forever."_

> _"What is steel compared to the code that wields it? What is the compiler compared to the mind that guides it?"_

> _"Trust no framework you cannot debug with your own hands."_

> _"Crom cares little for your frameworks. He cares if the work is done."_

> _"Between the time when the repositories drank Atlantis and the rise of the Sons of JavaScript, there was an age undreamed of..."_

## 📄 License

LineLord's power remains closely guarded. The source and distribution are controlled until Crom deems it worthy of wider release.

_Usage is granted to those who prove themselves worthy in the eyes of the maintainers._

---

**By Crom's hammer, may your code be strong and your commits be clean!** 🪓

_LineLord - Forged in the digital fires of necessity, tempered by the wisdom of git, and blessed by the spirit of Conan the Barbarian._
