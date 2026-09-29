// Stream-node selection for StreamVolume.qml.
//
// Pure logic lives here (not in the .qml) for two reasons: it can be unit
// tested without a running Quickshell/PipeWire session, and StreamVolume.qml
// needs to call it in a way that keeps the *current* selection sticky rather
// than recomputing best-match on every PipeWire event -- see selectStreamNode.

function norm(value) {
  return (value === undefined || value === null) ? "" : String(value).trim().toLowerCase()
}

// Either direction: PipeWire may report "chromium" where MPRIS says
// "Chromium", or a binary "youtube-music" against the identity
// "com.github.th-ch.youtube-music".
function overlapsHint(field, hint) {
  var value = norm(field)
  var needle = norm(hint)
  if (value === "" || needle === "") return false
  return value.indexOf(needle) !== -1 || needle.indexOf(value) !== -1
}

// The process binary outranks the application name because Electron clients
// report themselves as "Chromium" too -- with a browser also running, the
// name alone would happily pick the wrong stream.
function scoreStreamNode(candidate, hint) {
  if (!candidate) return 0
  var props = candidate.properties || {}
  if (overlapsHint(props["application.process.binary"], hint)) return 3
  if (overlapsHint(props["application.name"], hint)) return 2
  if (overlapsHint(candidate.name, hint)) return 1
  return 0
}

function isLiveStream(candidate) {
  return !!(candidate && candidate.isStream)
}

// Scans every candidate and returns the best-scoring live stream for `hint`,
// or null if nothing scores above 0.
function findBestStreamNode(nodes, hint) {
  var best = null
  var bestScore = 0

  for (var i = 0; i < (nodes || []).length; i++) {
    var candidate = nodes[i]
    if (!isLiveStream(candidate)) continue
    var score = scoreStreamNode(candidate, hint)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }

  return best
}

// Sticky selection: once a node is picked, keep it as long as it is still a
// live, matching stream in `nodes` -- do not re-run the best-match scan (and
// therefore do not reassign the selected node, even to an equal-scoring
// candidate) just because *something else* in the node list changed.
//
// Without this, a `node` property bound directly to a fresh best-match scan
// on every Pipewire.nodes change re-triggers PwObjectTracker's bind/unbind on
// every unrelated PipeWire event. That produced a QML "Binding loop detected
// for property 'node'" warning and, moments later, the same underlying node
// getting unbound twice in rapid succession -- confirmed via a symbolicated
// core dump to crash the whole Omarchy shell with SIGSEGV inside
// pw_proxy_destroy (a double-destroy of an already-destroyed proxy).
function selectStreamNode(nodes, hint, currentNode) {
  var trimmedHint = norm(hint)
  if (trimmedHint === "") return null

  if (isLiveStream(currentNode) && scoreStreamNode(currentNode, trimmedHint) > 0) {
    for (var i = 0; i < (nodes || []).length; i++) {
      if (nodes[i] === currentNode) return currentNode
    }
  }

  return findBestStreamNode(nodes, trimmedHint)
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    scoreStreamNode: scoreStreamNode,
    findBestStreamNode: findBestStreamNode,
    selectStreamNode: selectStreamNode
  }
}
