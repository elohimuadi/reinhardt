export function notifyParent(session) {
  window.parent.postMessage({ session }, '*')
}
