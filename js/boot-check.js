// Web test site only (tools/build-www.mjs leaves this out of the app). If the
// game hasn't started a few seconds after the page loads, say so and offer a
// way back to the real save, instead of leaving a blank page. A plain script,
// not a module, so it still runs when the game's modules fail to load.
(function () {
  if (location.hostname.endsWith('github.io')) return; // that copy never runs the game
  var shown = false;
  function rescue(reason) {
    if (shown || window.__appleStarted) return;
    shown = true;
    var box = document.createElement('div');
    box.id = 'boot-rescue';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;z-index:2000;left:50%;top:50%;transform:translate(-50%,-50%);width:min(340px,calc(100vw - 32px));box-sizing:border-box;' +
      'padding:18px 18px 14px;background:#fffaf2;color:#3a1f2b;border:3px solid #3a1f2b;border-radius:16px;font:15px/1.45 system-ui,sans-serif;text-align:center;box-shadow:0 6px 0 rgba(58,31,43,.35)';
    box.innerHTML = '<p style="margin:0 0 6px;font-size:18px"><b>🍎 The game didn’t start</b></p>' +
      '<p style="margin:0 0 12px"></p>' +
      '<button id="boot-reload" style="font:inherit;padding:7px 14px;margin:3px;border:2px solid #3a1f2b;border-radius:10px;background:#fff">Reload</button>' +
      '<button id="boot-real" style="font:inherit;padding:7px 14px;margin:3px;border:2px solid #3a1f2b;border-radius:10px;background:#3a1f2b;color:#fffaf2">Back to my real save</button>' +
      '<p style="margin:10px 0 0;font-size:12px;opacity:.7">"Back to my real save" turns the test tools’ settings off. Nothing is deleted.</p>';
    box.querySelector('p:nth-child(2)').textContent = reason;
    document.body.appendChild(box);
    document.getElementById('boot-reload').onclick = function () { location.reload(); };
    document.getElementById('boot-real').onclick = function () { location.href = location.pathname + '?realsave'; };
    // A slow start that got there after all: put the game back.
    var t = setInterval(function () { if (window.__appleStarted) { clearInterval(t); box.remove(); } }, 500);
  }
  var lastError = '';
  window.addEventListener('error', function (e) {
    lastError = (e && e.message) || (e && e.target && e.target.src ? 'Couldn\u2019t load ' + e.target.src : lastError);
  }, true);
  setTimeout(function () {
    rescue(lastError ? 'Error: ' + lastError : 'Something stopped it from loading, or the connection is slow.');
  }, 6000);
})();
