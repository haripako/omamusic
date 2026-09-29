import QtQuick
import Quickshell
import Quickshell.Services.Pipewire
import "StreamModel.js" as StreamModel

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
Item {
  id: root

  // MPRIS identity of the selected player, e.g. "Chromium".
  property string appHint: ""

  // Not a declarative binding to a fresh scan -- see refreshNode(). A naive
  // `readonly property var node: findNode()` re-scanned (and reassigned)
  // on every PipeWire event of any kind, which produced a QML binding loop
  // and, downstream, a crash: see StreamModel.selectStreamNode for the full
  // explanation and the crash this fixes.
  property var node: null

  readonly property bool available: node !== null && node.audio !== null
  readonly property real volume: available ? node.audio.volume : 0

  function setVolume(value) {
    if (root.available) root.node.audio.volume = Math.max(0, Math.min(1, value))
  }

  // Re-selects the stream node, keeping the current one if it is still a
  // live match rather than always taking the freshly-rescanned best match --
  // see StreamModel.selectStreamNode.
  function refreshNode() {
    var nodes = Pipewire.ready ? Pipewire.nodes.values : []
    var selected = StreamModel.selectStreamNode(nodes, root.appHint, root.node)
    if (selected !== root.node) root.node = selected
  }

  onAppHintChanged: refreshNode()

  Connections {
    target: Pipewire.nodes
    function onValuesChanged() { root.refreshNode() }
  }

  Connections {
    target: Pipewire
    function onReadyChanged() { root.refreshNode() }
  }

  Component.onCompleted: refreshNode()

  // Node properties stay stale unless the object is explicitly tracked.
  PwObjectTracker {
    objects: root.node ? [root.node] : []
  }
}
