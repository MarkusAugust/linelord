import { defaultPorts } from '../../app/ports'
import {
  createLineLord,
  type LineLord,
  type LineLordOptions,
} from '../../core/lineLord'

/** LineLord over the real adapters, which is what these tests are about. */
export function lineLord(
  repoPath: string,
  thresholdBytes?: number,
  options?: LineLordOptions,
): LineLord {
  return createLineLord(defaultPorts(), repoPath, thresholdBytes, options)
}

export type { LineLord }
