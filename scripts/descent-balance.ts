/**
 * Weigh the descent: let the bot play it, and print how far each background
 * gets and what kills it.
 *
 *   bun run descent-balance        # 200 runs of each background
 *   bun run descent-balance 50     # fewer, faster
 *
 * The runs are on seeds 1 to n, so the same rules give the same table. Run it
 * before and after changing a number in `site/descent/core`.
 */
import { report, weigh } from '../site/descent/bot/balance'

const runs = Number(process.argv[2] ?? 200)
if (!Number.isInteger(runs) || runs < 1)
  throw new Error(`runs must be a whole number above 0, not ${process.argv[2]}`)
console.log(report(weigh(runs)))
