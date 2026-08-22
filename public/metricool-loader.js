function loadScript(a) {
  var b = document.getElementsByTagName('head')[0]
  var c = document.createElement('script')
  c.type = 'text/javascript'
  c.src = 'https://tracker.metricool.com/resources/be.js'
  c.onreadystatechange = a
  c.onload = a
  b.appendChild(c)
}
loadScript(function () {
  beTracker.t({ hash: '8b1b5a741d012ab82445b3c6168afe5d' })
})
