import QtQuick
import Quickshell
import Quickshell.Services.Pipewire

// Volume for players that do not implement the MPRIS volume property.
//
// Browsers are the common case: they publish a full MPRIS session but leave
// volume out of it, so the popup would otherwise show no volume control at
// all. Driving the player's PipeWire playback stream instead moves exactly
// the knob a mixer would, which is as close to real volume as the browser
// route can get.
//
// The stream node only exists while audio is actually flowing, so this
// reports unavailable when playback is stopped — the slider hides rather
// than pretending to control something.
//
// The tracker below binds every playback stream up front instead of binding
// just the selected node. The tracker's input may not depend on anything the
// tracker itself populates: `properties` is only filled in once a node is
// bound, so a binding shaped like `node: findNode(); objects: [node]` reads
// its own output and quickshell reports it as a binding loop. That loop made
// the tracker list oscillate, which drove repeated proxy unbind/rebind cycles
// in quickshell's PipeWire service and could crash it
// (quickshell-mirror/quickshell#529). Filtering by `isStream`/`isSink`/`audio`
// is safe: those are populated when the node is discovered, before any
// binding, exactly like the shell's own audio panel and media service do it.
Item {
  id: root

  // MPRIS identity of the selected player, e.g. "Chromium".
  property string appHint: ""

  readonly property var nodes: Pipewire.ready ? Pipewire.nodes.values : []

  // Every playback stream currently visible to PipeWire. This list only
  // reads unbound node attributes, so it never depends on the tracker below.
  readonly property var playbackStreams: {
    var list = []
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      // isStream + isSink = Stream/Output/Audio: what a player emits, not
      // what a microphone captures. `audio` excludes video-only streams.
      if (n && n.isStream && n.isSink && n.audio) list.push(n)
    }
    return list
  }

  readonly property var node: selectNode()
  readonly property bool available: node !== null && node.audio !== null
  readonly property real volume: available ? node.audio.volume : 0

  function setVolume(value) {
    if (root.available) root.node.audio.volume = Math.max(0, Math.min(1, value))
  }

  function overlaps(field, hint) {
    var value = String(field || "").trim().toLowerCase()
    if (value === "") return false
    // Either direction: PipeWire may report "chromium" where MPRIS says
    // "Chromium", or a binary "youtube-music" against the identity
    // "com.github.th-ch.youtube-music".
    return value.indexOf(hint) !== -1 || hint.indexOf(value) !== -1
  }

  // The process binary outranks the application name because Electron clients
  // report themselves as "Chromium" too — with a browser also running, the
  // name alone would happily pick the wrong stream.
  function scoreNode(candidate, hint) {
    var props = candidate.properties || {}
    if (overlaps(props["application.process.binary"], hint)) return 3
    if (overlaps(props["application.name"], hint)) return 2
    if (overlaps(candidate.name, hint)) return 1
    return 0
  }

  // Runs against already-bound streams, so reading `properties` here is
  // valid. Re-evaluating never changes the tracker's input list.
  function selectNode() {
    var hint = String(root.appHint).trim().toLowerCase()
    if (hint === "") return null

    var best = null
    var bestScore = 0

    for (var i = 0; i < root.playbackStreams.length; i++) {
      var candidate = root.playbackStreams[i]
      var score = scoreNode(candidate, hint)
      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    }
    return best
  }

  // Node properties stay stale unless the object is explicitly tracked.
  // Tracking the whole stream list keeps every candidate's `properties`
  // fresh and lets `selectNode` re-score reactively; setting a stable list
  // re-refs before unref'ing, so no proxy is torn down on re-evaluation.
  PwObjectTracker {
    objects: root.playbackStreams
  }
}
