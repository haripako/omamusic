const test = require("node:test")
const assert = require("node:assert/strict")
const { scoreStreamNode, findBestStreamNode, selectStreamNode } = require("./StreamModel.js")

function streamNode(overrides) {
  return Object.assign(
    {
      isStream: true,
      name: "",
      properties: {}
    },
    overrides
  )
}

test("scoreStreamNode", async (t) => {
  await t.test("scores a process-binary match highest", () => {
    const node = streamNode({ properties: { "application.process.binary": "youtube-music" } })
    assert.equal(scoreStreamNode(node, "youtube-music"), 3)
  })

  await t.test("scores an application-name match above a bare name match", () => {
    const byAppName = streamNode({ properties: { "application.name": "Chromium" } })
    const byName = streamNode({ name: "Chromium" })
    assert.equal(scoreStreamNode(byAppName, "chromium"), 2)
    assert.equal(scoreStreamNode(byName, "chromium"), 1)
  })

  await t.test("matches either direction (hint contains field, or field contains hint)", () => {
    const node = streamNode({ properties: { "application.process.binary": "youtube-music" } })
    assert.equal(scoreStreamNode(node, "com.github.th-ch.youtube-music"), 3)
  })

  await t.test("scores 0 when nothing overlaps", () => {
    const node = streamNode({ name: "spotify" })
    assert.equal(scoreStreamNode(node, "chromium"), 0)
  })

  await t.test("is case-insensitive", () => {
    const node = streamNode({ name: "Chromium" })
    assert.equal(scoreStreamNode(node, "CHROMIUM"), 1)
  })

  await t.test("returns 0 for a falsy candidate", () => {
    assert.equal(scoreStreamNode(null, "chromium"), 0)
  })
})

test("findBestStreamNode", async (t) => {
  await t.test("picks the highest-scoring live stream", () => {
    const low = streamNode({ name: "chromium" })
    const high = streamNode({ properties: { "application.process.binary": "chromium" } })
    assert.strictEqual(findBestStreamNode([low, high], "chromium"), high)
  })

  await t.test("skips non-stream nodes", () => {
    const notAStream = streamNode({ isStream: false, properties: { "application.process.binary": "chromium" } })
    assert.strictEqual(findBestStreamNode([notAStream], "chromium"), null)
  })

  await t.test("skips null/undefined entries in the list", () => {
    const node = streamNode({ name: "chromium" })
    assert.strictEqual(findBestStreamNode([null, undefined, node], "chromium"), node)
  })

  await t.test("returns null when nothing matches", () => {
    const node = streamNode({ name: "spotify" })
    assert.strictEqual(findBestStreamNode([node], "chromium"), null)
  })

  await t.test("returns null for an empty or missing list", () => {
    assert.strictEqual(findBestStreamNode([], "chromium"), null)
    assert.strictEqual(findBestStreamNode(undefined, "chromium"), null)
  })
})

test("selectStreamNode", async (t) => {
  await t.test("returns null when hint is empty", () => {
    const node = streamNode({ name: "chromium" })
    assert.strictEqual(selectStreamNode([node], "", null), null)
    assert.strictEqual(selectStreamNode([node], "   ", null), null)
  })

  await t.test("with no current node, picks the best match", () => {
    const node = streamNode({ name: "chromium" })
    assert.strictEqual(selectStreamNode([node], "chromium", null), node)
  })

  // This is the regression test for the crash: a naive rescan-and-reassign
  // approach reassigns `node` on every call even when the current node is
  // still perfectly valid, which is what drove the binding loop and the
  // resulting double-unbind crash (see StreamModel.js and the PR description
  // for the full mechanism). Sticky selection must return the exact same
  // object reference when the current node is still live and matching.
  await t.test("keeps the current node instead of reassigning it when it is still a live match", () => {
    const current = streamNode({ name: "chromium" })
    const otherEqualScoreCandidate = streamNode({ name: "chromium" })
    const nodes = [current, otherEqualScoreCandidate]

    const result = selectStreamNode(nodes, "chromium", current)

    assert.strictEqual(result, current, "must return the exact same reference, not a rescanned equal-scoring one")
  })

  await t.test("re-selects when the current node is no longer in the list (removed)", () => {
    const removed = streamNode({ name: "chromium" })
    const replacement = streamNode({ name: "chromium" })

    const result = selectStreamNode([replacement], "chromium", removed)

    assert.strictEqual(result, replacement)
  })

  await t.test("re-selects when the current node no longer matches the hint (player changed)", () => {
    const stale = streamNode({ name: "chromium" })
    const freshMatch = streamNode({ name: "firefox" })

    const result = selectStreamNode([stale, freshMatch], "firefox", stale)

    assert.strictEqual(result, freshMatch)
  })

  await t.test("re-selects when the current node is no longer a live stream", () => {
    const stopped = streamNode({ name: "chromium", isStream: false })
    const replacement = streamNode({ name: "chromium" })

    const result = selectStreamNode([stopped, replacement], "chromium", stopped)

    assert.strictEqual(result, replacement)
  })

  await t.test("returns null when there is no current node and nothing matches", () => {
    const node = streamNode({ name: "spotify" })
    assert.strictEqual(selectStreamNode([node], "chromium", null), null)
  })
})
