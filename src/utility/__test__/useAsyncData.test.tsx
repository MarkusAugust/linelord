import { describe, expect, it } from 'bun:test'
import { Text } from 'ink'
import { render } from 'ink-testing-library'
import { useAsyncData } from '../useAsyncData'

/** A promise whose fate the test decides, after rendering. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Let React and Ink get through the microtasks a settled promise queues. */
const settle = () => new Promise((done) => setTimeout(done, 0))

function Screen({ load }: { load: () => Promise<string> }) {
  const data = useAsyncData(load, [load])
  if (data.status === 'loading') return <Text>loading</Text>
  if (data.status === 'failed') return <Text>failed: {data.error}</Text>
  return <Text>ready: {data.data}</Text>
}

describe('useAsyncData', () => {
  it('starts loading and ends with the data', async () => {
    const answer = deferred<string>()
    const { lastFrame } = render(<Screen load={() => answer.promise} />)

    expect(lastFrame()).toBe('loading')

    answer.resolve('the stones are old')
    await settle()

    expect(lastFrame()).toBe('ready: the stones are old')
  })

  it('reports a failure by its message rather than staying on loading for good', async () => {
    const answer = deferred<string>()
    const { lastFrame } = render(<Screen load={() => answer.promise} />)

    // The effect that subscribes to the promise runs after the first frame;
    // rejecting before then is an unhandled rejection, not a test of the hook.
    await settle()
    answer.reject(new Error('the well is dry'))
    await settle()

    expect(lastFrame()).toBe('failed: the well is dry')
  })

  it('turns a thrown non-Error into text as well', async () => {
    const { lastFrame } = render(
      <Screen load={() => Promise.reject('a bare string')} />,
    )
    await settle()

    expect(lastFrame()).toBe('failed: a bare string')
  })

  it('forgets an answer that arrives after the screen has been left', async () => {
    const answer = deferred<string>()
    const { lastFrame, unmount } = render(
      <Screen load={() => answer.promise} />,
    )

    unmount()
    answer.resolve('too late')
    await settle()

    // The last frame drawn was the loading one, and nothing was drawn after
    // the unmount: a result written into a dead component would show up as a
    // React warning at best and a corrupted terminal at worst.
    expect(lastFrame()).toBe('loading')
  })

  it('loads again when what it depends on changes', async () => {
    const first = () => Promise.resolve('first')
    const second = () => Promise.resolve('second')
    const { lastFrame, rerender } = render(<Screen load={first} />)
    await settle()
    expect(lastFrame()).toBe('ready: first')

    rerender(<Screen load={second} />)
    await settle()
    expect(lastFrame()).toBe('ready: second')
  })
})
