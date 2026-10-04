import { TextAttributes } from '@opentui/core'
import packageJson from '../../../../package.json'
import { HONESTY_NOTES } from '../../../core/honestyNotes'
import { useScreenKeys } from '../keys'
import { useScrollPage } from '../list'
import { Heading } from '../parts'
import { bannerAsciiSmall } from '../resources/asciiArt'
import { C } from '../theme'

const REPOSITORY = 'https://github.com/MarkusAugust/linelord'
const SOBERNETICS = 'https://sobernetics.no'

/** A two-column line: a term, and what it means. */
function Pair({
  term,
  meaning,
  colour = C.cyan,
}: {
  term: string
  meaning: string
  colour?: string
}) {
  return (
    <box style={{ flexDirection: 'row', flexShrink: 0, paddingRight: 3 }}>
      <text
        fg={colour}
        style={{ width: 26, flexShrink: 0 }}
      >{`  ${term}`}</text>
      <text fg={C.gray} style={{ flexGrow: 1, flexShrink: 1 }}>
        {meaning}
      </text>
    </box>
  )
}

export function About() {
  const page = useScrollPage()
  useScreenKeys({
    hint: '↑↓ jk scroll · PgUp PgDn · ? help · ← h Esc back',
    onAction: page.act,
  })

  return (
    <box style={{ flexDirection: 'column', flexGrow: 1, padding: 1 }}>
      <box
        title=" 📜 About LineLord "
        style={{
          border: true,
          borderColor: C.green,
          flexDirection: 'column',
          flexGrow: 1,
          paddingLeft: 2,
          paddingRight: 2,
        }}
      >
        <scrollbox
          ref={page.scroll}
          style={{ flexGrow: 1, scrollbarOptions: { showArrows: true } }}
        >
          <box style={{ flexDirection: 'column', marginTop: 1, flexShrink: 0 }}>
            {bannerAsciiSmall.map((line) => (
              <text key={line} fg={C.green} wrapMode="none">
                {line}
              </text>
            ))}
            <text
              fg={C.gray}
            >{`Version ${packageJson.version} · reads git blame and reports who holds which line`}</text>
          </box>

          <Heading>🪓 WHAT IT DOES</Heading>
          <text fg={C.text}>
            LineLord runs git blame on every file in HEAD and counts, for each
            line still standing, who last changed it. Every number on every
            screen is a count of those lines, or of the files, days and file
            types they are in. By the Ashfall, discover who truly holds your
            codebase.
          </text>

          <Heading>🏰 WHAT IT BRINGS TO THE BATTLEFIELD</Heading>
          <Pair
            term="Native git"
            meaning="every number comes from git blame; nothing but git is needed"
          />
          <Pair
            term="Honest identity"
            meaning="one address is one warrior; .mailmap is how you say otherwise, and LineLord writes it for you"
          />
          <Pair
            term="Code longevity"
            meaning="how old the code each warrior still holds is; with --history, how long code lasts"
          />
          <Pair
            term="Ignore revisions"
            meaning="a reformatting commit is looked past with .git-blame-ignore-revs or --ignore-rev, and its lines go back to whoever wrote them"
          />
          <Pair
            term="A scroll of memory"
            meaning="a repository that has not moved opens at once; only changed files are read again"
          />
          <Pair
            term="Twelve at a time"
            meaning="files are blamed in parallel, twelve by default"
          />

          <Heading>📊 WHAT GETS COUNTED</Heading>
          <Pair
            term="✅"
            meaning="lines alive in HEAD, in text files git tracks"
            colour={C.green}
          />
          <Pair
            term="❌"
            meaning="blank lines, and lines of only whitespace"
            colour={C.red}
          />
          <Pair
            term="❌"
            meaning="binary files, and files over the threshold: 50 KB, or -t"
            colour={C.red}
          />
          <Pair
            term="❌"
            meaning="lock files, minified and bundled code, test snapshots, compiled output, archives and generated directories"
            colour={C.red}
          />
          <Pair term="❌" meaning="changes not yet committed" colour={C.red} />

          <Heading>⚡ BATTLE-TESTED WISDOM</Heading>
          <Pair
            term="•"
            meaning="Age is when a line was last changed, not when it was written"
            colour={C.text}
          />
          <Pair
            term="•"
            meaning="A great refactor moves territory to whoever ran it — unless .git-blame-ignore-revs looks past it"
            colour={C.text}
          />
          <Pair
            term="•"
            meaning="Warriors are told apart by email address; .mailmap unites them, in git as well as here"
            colour={C.text}
          />
          <Pair
            term="•"
            meaning="Nothing ever leaves your machine: no network, no telemetry. The cache is in ~/.cache/linelord"
            colour={C.text}
          />

          <Heading>⏳ ON THE AGE OF CODE</Heading>
          {HONESTY_NOTES.age.lines.map((line) => (
            <text key={line} fg={C.gray}>{`  ${line}`}</text>
          ))}
          <Heading>🪓 ON THE RANKINGS</Heading>
          {HONESTY_NOTES.rankings.lines.map((line) => (
            <text key={line} fg={C.gray}>{`  ${line}`}</text>
          ))}

          <Heading>📄 LICENCE</Heading>
          <text fg={C.text}>Copyright (C) 2026 August Søberg-Klyver.</text>
          <text fg={C.gray}>
            Free software under the GNU General Public License, version 3. It
            costs nothing and comes with no warranty. The name LineLord and its
            mark are not part of that grant.
          </text>

          <Heading>🔗 FIND US</Heading>
          <text>
            <span fg={C.gray}>{'  Source, issues and releases   '}</span>
            <a href={REPOSITORY} fg={C.cyan}>
              {REPOSITORY}
            </a>
          </text>
          <text>
            <span fg={C.gray}>{'  Made by Søbernetics           '}</span>
            <a href={SOBERNETICS} fg={C.cyan}>
              {SOBERNETICS}
            </a>
          </text>

          <text
            fg={C.green}
            attributes={TextAttributes.ITALIC}
            style={{ marginTop: 1 }}
          >
            "Count your lines, claim your territory, conquer!"
          </text>
          <text> </text>
        </scrollbox>
      </box>
    </box>
  )
}
