// Persistent client-side logging.
// Buffers events in localStorage so entries survive page crashes / reloads
// (Aw Snap, OOM), then flushes them to /api/logs on next successful load.
//
// Include with: <script src="/public/js/logger.js"></script>
// Then use window.TapLogger.log(type, message, extra).

(function () {
  var LS_BUFFER   = 'taplist:logs:buffer';
  var LS_CLIENT   = 'taplist:logs:client_id';
  var MAX_BUFFER  = 200;         // ring-buffer size
  var FLUSH_EVERY = 10000;       // ms
  var HEARTBEAT   = 60000;       // ms — memory snapshot cadence

  function safeGet(key)      { try { return localStorage.getItem(key); }         catch { return null; } }
  function safeSet(key, val) { try { localStorage.setItem(key, val); }           catch {} }

  function clientId() {
    var id = safeGet(LS_CLIENT);
    if (!id) {
      id = 'c-' + Math.random().toString(36).slice(2, 10);
      safeSet(LS_CLIENT, id);
    }
    return id;
  }

  function readBuffer() {
    try { return JSON.parse(safeGet(LS_BUFFER) || '[]') || []; } catch { return []; }
  }
  function writeBuffer(entries) {
    try { safeSet(LS_BUFFER, JSON.stringify(entries.slice(-MAX_BUFFER))); } catch {}
  }

  function memorySnapshot() {
    if (performance && performance.memory) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      };
    }
    return null;
  }

  var CID = clientId();

  function push(type, message, extra) {
    var entry = {
      ts: Date.now(),
      type: String(type || 'info'),
      message: message == null ? '' : String(message).slice(0, 2000),
      url: location.href,
      client_id: CID,
      memory: memorySnapshot(),
    };
    if (extra && extra.stack) entry.stack = String(extra.stack).slice(0, 4000);
    if (extra && extra.data)  entry.extra = extra.data;

    var buf = readBuffer();
    buf.push(entry);
    writeBuffer(buf);
  }

  function flush() {
    var buf = readBuffer();
    if (buf.length === 0) return;
    // Snapshot the batch, clear buffer optimistically, restore on failure.
    var batch = buf.slice(0, 100);
    writeBuffer(buf.slice(batch.length));
    try {
      fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        keepalive: true,
      }).catch(function () {
        // On failure, prepend the batch back so we retry next time.
        var later = readBuffer();
        writeBuffer(batch.concat(later));
      });
    } catch (e) {
      var later2 = readBuffer();
      writeBuffer(batch.concat(later2));
    }
  }

  // Global error hooks
  window.addEventListener('error', function (e) {
    push('error', (e && e.message) || 'unknown error', {
      stack: e && e.error && e.error.stack,
      data: e && e.filename ? { file: e.filename, line: e.lineno, col: e.colno } : undefined,
    });
  });
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e && e.reason;
    push('rejection', reason && (reason.message || String(reason)), {
      stack: reason && reason.stack,
    });
  });

  // Periodic heartbeat with memory snapshot
  setInterval(function () { push('heartbeat', 'alive'); }, HEARTBEAT);

  // Flush loop
  setInterval(flush, FLUSH_EVERY);
  // First flush shortly after load so buffered entries from a prior crash go out.
  setTimeout(flush, 1500);
  // Best-effort flush on pagehide (works with keepalive).
  window.addEventListener('pagehide', flush);

  // Log the load event so we can see fresh loads / crash reloads.
  push('info', 'page loaded');

  window.TapLogger = { log: push, flush: flush, clientId: CID };
})();
