import { describe, expect, it } from 'bun:test'
import { parseBlamePorcelain } from '../blamePorcelain'

/**
 * The parser gets a string and gives back entries, which is the point: every
 * number LineLord reports rests on this reading, and until it was a function
 * of its own there was no way to check it against anything.
 */

const SHA_A = '0caa31a746b1885416bdc58cfb11fb2d4701d92c'
const SHA_B = '938709d0e97e7272842454fd168cf14848c2732c'

/** The header git writes before a line, in --line-porcelain form. */
function header(
  sha: string,
  original: number,
  final: number,
  author: string,
  email: string,
  time: number,
  extra: string[] = [],
): string {
  return [
    `${sha} ${original} ${final}`,
    `author ${author}`,
    `author-mail <${email}>`,
    `author-time ${time}`,
    'author-tz +0200',
    `committer ${author}`,
    `committer-mail <${email}>`,
    `committer-time ${time}`,
    'committer-tz +0200',
    `summary a commit`,
    ...extra,
    'filename f.txt',
  ].join('\n')
}

describe('parseBlamePorcelain', () => {
  it('takes the line number from git rather than counting', () => {
    // The old reading incremented a counter per line it chose to keep, so a
    // blank line anywhere above meant every number below it was too low --
    // pointing confidently at the wrong line of the file.
    const output = [
      `${header(SHA_A, 1, 1, 'A', 'a@x.com', 1000)}\n\tone`,
      `${header(SHA_A, 2, 2, 'A', 'a@x.com', 1000)}\n\t`,
      `${header(SHA_A, 3, 3, 'A', 'a@x.com', 1000)}\n\t\tindented`,
      `${header(SHA_B, 4, 4, 'B', 'b@x.com', 2000)}\n\tfour`,
    ].join('\n')

    const entries = parseBlamePorcelain(output)

    expect(entries.map((entry) => entry.lineNumber)).toEqual([1, 2, 3, 4])
    expect(entries.map((entry) => entry.content)).toEqual([
      'one',
      '',
      '\tindented',
      'four',
    ])
  })

  it('keeps the line number the line had in the commit it came from', () => {
    // A line can sit at 40 in HEAD and have been written as line 7. Tier 1 of
    // the longevity work reports where the oldest surviving line is now, but
    // the original is what lets anyone find it in the commit.
    const output = `${header(SHA_A, 7, 40, 'A', 'a@x.com', 1000)}\n\tmoved down`

    const [entry] = parseBlamePorcelain(output)

    expect(entry?.originalLineNumber).toBe(7)
    expect(entry?.lineNumber).toBe(40)
  })

  it('reads the author, the address and the time', () => {
    const output = `${header(SHA_A, 1, 1, 'Gorvek of Bonereach', 'gorvek@firma.no', 1789852140)}\n\tcode`

    const [entry] = parseBlamePorcelain(output)

    expect(entry?.author).toBe('Gorvek of Bonereach')
    expect(entry?.authorEmail).toBe('gorvek@firma.no')
    // Whole seconds, as git writes them: a number to compare, not a string.
    expect(entry?.authorTime).toBe(1789852140)
    expect(entry?.sha).toBe(SHA_A)
  })

  it('reads a repository whose hashes are sha-256', () => {
    // 64 hex characters, which the header pattern has to admit deliberately:
    // it matches a whole line rather than a prefix, so a length it does not
    // name is a length it rejects.
    const sha256 = 'a'.repeat(64)
    const output = `${header(sha256, 1, 1, 'A', 'a@x.com', 1000)}\n\tone`

    const [entry] = parseBlamePorcelain(output)

    expect(entry?.sha).toBe(sha256)
    expect(entry?.content).toBe('one')
  })

  it('does not mistake content for a header', () => {
    // Content always arrives behind a tab, so this is belt and braces: the
    // pattern is anchored at both ends, which is what lets it be strict about
    // the hash length without a line of a file ever tripping it.
    const output = `${header(SHA_A, 1, 1, 'A', 'a@x.com', 1000)}\n\t${SHA_B} 1 1`

    const entries = parseBlamePorcelain(output)

    expect(entries).toHaveLength(1)
    expect(entries[0]?.content).toBe(`${SHA_B} 1 1`)
  })

  it('carries the commit details across a group in plain --porcelain', () => {
    // Plain --porcelain writes the header once per commit and then only the
    // hash, which is most of why it is worth switching to. Lines after the
    // first would otherwise arrive with no author at all.
    const output = [
      `${header(SHA_A, 1, 1, 'A', 'a@x.com', 1000)}\n\tone`,
      `${SHA_A} 2 2\n\ttwo`,
      `${SHA_A} 3 3\n\tthree`,
    ].join('\n')

    const entries = parseBlamePorcelain(output)

    expect(entries).toHaveLength(3)
    for (const entry of entries) {
      expect(entry.author).toBe('A')
      expect(entry.authorEmail).toBe('a@x.com')
      expect(entry.authorTime).toBe(1000)
    }
    expect(entries.map((entry) => entry.lineNumber)).toEqual([1, 2, 3])
  })

  it('handles the boundary and previous lines git adds', () => {
    const output = [
      `${header(SHA_A, 1, 1, 'A', 'a@x.com', 1000, ['boundary'])}\n\tfirst`,
      `${header(SHA_B, 2, 2, 'B', 'b@x.com', 2000, [`previous ${SHA_A} f.txt`])}\n\tsecond`,
    ].join('\n')

    const entries = parseBlamePorcelain(output)

    expect(entries.map((entry) => entry.author)).toEqual(['A', 'B'])
  })

  it('keeps a final line that is empty', () => {
    // Trimming the output before splitting it dropped it, and with it one
    // line of somebody's ownership.
    const output = `${header(SHA_A, 1, 1, 'A', 'a@x.com', 1000)}\n\t`

    expect(parseBlamePorcelain(output)).toHaveLength(1)
  })

  it('keeps a commit dated to the epoch', () => {
    // Zero is a real instant. Reading it as "no time given" would drop the
    // line out of every question asked about age, silently.
    const output = `${header(SHA_A, 1, 1, 'A', 'a@x.com', 0)}\n\tone`

    expect(parseBlamePorcelain(output)[0]?.authorTime).toBe(0)
  })

  it('says so when there is no time at all, rather than guessing at one', () => {
    const output = `${SHA_A} 1 1\nauthor A\nauthor-mail <a@x.com>\nfilename f.txt\n\tone`

    expect(parseBlamePorcelain(output)[0]?.authorTime).toBe(null)
  })

  it('gives nothing back for an empty file', () => {
    expect(parseBlamePorcelain('')).toEqual([])
  })
})
