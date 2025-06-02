import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { exec } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { clearDatabase, createDatabase } from '../../db/database'
import { authors, blameLines, files } from '../../db/schema'
import { GitService } from '../GitService'

const execAsync = promisify(exec)

describe('GitService - Files with $ character', () => {
  let tempRepoPath: string
  let gitService: GitService
  let db: ReturnType<typeof createDatabase>

  beforeEach(async () => {
    // Create temporary directory
    tempRepoPath = await mkdtemp(join(tmpdir(), 'linelord-test-'))

    // Initialize git repository
    await execAsync('git init', { cwd: tempRepoPath })
    await execAsync('git config user.name "Test User"', { cwd: tempRepoPath })
    await execAsync('git config user.email "test@example.com"', {
      cwd: tempRepoPath,
    })

    // Create test files with $ characters in names
    const filesWithDollar = [
      'product.$id.tsx',
      'category.$slug.js',
      'routes/user.$userId.ts',
      'components/layout.$theme.css',
    ]

    for (const fileName of filesWithDollar) {
      const filePath = join(tempRepoPath, fileName)

      // Ensure directory exists
      const dir = join(tempRepoPath, fileName.split('/').slice(0, -1).join('/'))
      if (fileName.includes('/')) {
        await execAsync(`mkdir -p "${dir}"`)
      }

      // Create file with some content
      await writeFile(
        filePath,
        `// File: ${fileName}\nfunction test() {\n  return "Hello from ${fileName}";\n}\n`,
      )
    }

    // Add and commit files
    await execAsync('git add .', { cwd: tempRepoPath })
    await execAsync('git commit -m "Add test files with $ characters"', {
      cwd: tempRepoPath,
    })

    // Create database and service
    db = createDatabase()
    gitService = new GitService(tempRepoPath, db)
  })

  afterEach(async () => {
    // Clean up
    clearDatabase(db)
    await rm(tempRepoPath, { recursive: true, force: true })
  })

  it('should process files with $ characters in filenames', async () => {
    // Initialize the git service
    await gitService.initialize()

    // Check that files with $ characters were processed
    const stats = await db.select().from(files)

    const dollarFiles = stats.filter((file) => file.path.includes('$'))
    expect(dollarFiles).toHaveLength(4)

    // Verify specific files exist
    const filePaths = dollarFiles.map((f) => f.path)
    expect(filePaths).toContain('product.$id.tsx')
    expect(filePaths).toContain('category.$slug.js')
    expect(filePaths).toContain('routes/user.$userId.ts')
    expect(filePaths).toContain('components/layout.$theme.css')

    // Check that blame data was created for these files
    const blameData = await db.select().from(blameLines)

    // Should have blame lines for the $ files
    expect(blameData.length).toBeGreaterThan(0)

    // Verify each file has the expected number of lines
    for (const file of dollarFiles) {
      expect(file.totalLines).toBe(4) // Each test file has 4 lines
      expect(file.isBinary).toBe(false)
      expect(file.isIgnored).toBe(false)
    }
  })

  it('should create author records when processing $ files', async () => {
    await gitService.initialize()

    // Check that author was created
    const authorRecords = await db.select().from(authors)
    expect(authorRecords).toHaveLength(1)
    expect(authorRecords[0]).toBeDefined()
    expect(authorRecords[0]?.name).toBe('Test User')
    expect(authorRecords[0]?.email).toBe('test@example.com')

    // Verify blame lines reference the author
    const blameLineRecords = await db.select().from(blameLines)
    expect(
      authorRecords[0] &&
        blameLineRecords.every(
          (line) => line.authorId === authorRecords[0]?.id,
        ),
    ).toBe(true)
  })

  it('should handle complex $ patterns in filenames', async () => {
    const complexFiles = [
      'api/users/$id/profile.$format.json',
      'routes/blog/$year-$month-$day.tsx',
      'assets/$locale/messages.$format.json',
    ]

    for (const fileName of complexFiles) {
      const filePath = join(tempRepoPath, fileName)

      // Ensure directory exists
      const dir = join(tempRepoPath, fileName.split('/').slice(0, -1).join('/'))
      if (fileName.includes('/')) {
        // Use node:fs/promises mkdir instead of shell command to avoid $ issues
        await mkdir(dir, { recursive: true })
      }

      await writeFile(
        filePath,
        `// Complex file: ${fileName}\nexport default {};`,
      )
    }

    await execAsync('git add .', { cwd: tempRepoPath })
    await execAsync('git commit -m "Add complex $ files"', {
      cwd: tempRepoPath,
    })

    // Reinitialize service with new files
    clearDatabase(db)
    await gitService.initialize()

    const stats = await db.select().from(files)
    const complexDollarFiles = stats.filter((file) =>
      complexFiles.some((cf) => file.path.includes(cf)),
    )

    expect(complexDollarFiles).toHaveLength(3)

    // Verify all files were processed without errors
    for (const file of complexDollarFiles) {
      expect(file.totalLines).toBe(2) // Each complex file has 2 lines
      expect(file.isBinary).toBe(false)
    }
  })

  it('should process files that start with $ character', async () => {
    // Create files that start with $
    const dollarStartFiles = ['$.ident.ts', '$utils.js', '$config.json']

    for (const fileName of dollarStartFiles) {
      const filePath = join(tempRepoPath, fileName)
      await writeFile(
        filePath,
        `// File starting with $: ${fileName}\nconst value = "${fileName}";\nexport default value;`,
      )
    }

    // Add and commit the new files
    await execAsync('git add .', { cwd: tempRepoPath })
    await execAsync('git commit -m "Add files starting with $"', {
      cwd: tempRepoPath,
    })

    // Reinitialize service with new files
    clearDatabase(db)
    await gitService.initialize()

    // Check that files starting with $ were processed
    const stats = await db.select().from(files)
    console.log(
      'All files in database:',
      stats.map((f) => f.path),
    )

    const dollarStartFilesInDb = stats.filter((file) =>
      dollarStartFiles.includes(file.path),
    )

    expect(dollarStartFilesInDb).toHaveLength(3)

    // Verify specific files exist
    const filePaths = dollarStartFilesInDb.map((f) => f.path)
    expect(filePaths).toContain('$.ident.ts')
    expect(filePaths).toContain('$utils.js')
    expect(filePaths).toContain('$config.json')

    // Check that blame data was created for these files
    const blameData = await db.select().from(blameLines)
    const dollarFileIds = dollarStartFilesInDb.map((f) => f.id)
    const blameForDollarFiles = blameData.filter((line) =>
      dollarFileIds.includes(line.fileId),
    )

    expect(blameForDollarFiles.length).toBeGreaterThan(0)

    // Verify each file has the expected number of lines
    for (const file of dollarStartFilesInDb) {
      expect(file.totalLines).toBe(3) // Each test file has 3 lines
      expect(file.isBinary).toBe(false)
      expect(file.isIgnored).toBe(false)
    }
  })
})
