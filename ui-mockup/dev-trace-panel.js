/**
 * Учебная панель: перехват fetch (клиент) + опрос GET /api/v1/dev/trace/recent (сервер).
 * Секреты в телах JSON маскируются.
 */
(function () {
  var MAX_CLIENT = 100;
  var POLL_MS = 1800;
  var clientEntries = [];
  var serverEntries = [];
  var panelOpen = false;
  var pollTimer = null;
  var paused = false;

  function apiOrigin() {
    var b = "";
    try {
      b = localStorage.getItem("sb_api_base") || "";
    } catch (_) {}
    if (!b) b = "http://localhost:8001/api/v1";
    return b.replace(/\/api\/v1\/?$/, "");
  }

  var SENSITIVE_KEY = /^(password|current_password|new_password|access_token|refresh_token|otp|secret|authorization)$/i;

  function redactValue(key, val) {
    if (SENSITIVE_KEY.test(String(key))) return "••••";
    if (val && typeof val === "object") return redactObject(val);
    return val;
  }

  function redactObject(o) {
    if (o === null || o === undefined) return o;
    if (Array.isArray(o)) return o.map(function (x, i) { return redactValue(String(i), x); });
    if (typeof o !== "object") return o;
    var out = {};
    for (var k in o) {
      if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = redactValue(k, o[k]);
    }
    return out;
  }

  function summarizeBody(bodyStr) {
    if (!bodyStr || !bodyStr.length) return "";
    var t = bodyStr.slice(0, 4000);
    try {
      var j = JSON.parse(t);
      return JSON.stringify(redactObject(j)).slice(0, 1200);
    } catch (_) {
      return "[тело не JSON, " + bodyStr.length + " байт]";
    }
  }

  function pushClientLine(method, url, status, ms, bodyInit, preview) {
    var tsIso = new Date().toISOString();
    clientEntries.push({
      tsIso: tsIso,
      ts: tsIso.replace("T", " ").replace(/\.\d{3}Z$/, "").slice(0, 23),
      method: method,
      url: url,
      status: status,
      ms: ms,
      initSummary: bodyInit,
      preview: preview,
    });
    if (clientEntries.length > MAX_CLIENT) clientEntries.shift();
    if (panelOpen && !paused) render();
  }

  function shouldLogFetch(url) {
    try {
      var u = String(url);
      return u.indexOf("/api/v1") !== -1;
    } catch (_) {
      return false;
    }
  }

  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var method = (init && init.method) || "GET";
    var url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
    var t0 = typeof performance !== "undefined" ? performance.now() : 0;
    var bodyInit = "";
    if (init && init.body && typeof init.body === "string") {
      bodyInit = summarizeBody(init.body);
    }

    return origFetch.apply(this, arguments).then(function (res) {
      if (!shouldLogFetch(url)) return res;
      var t1 = typeof performance !== "undefined" ? performance.now() : 0;
      var ms = Math.round(t1 - t0);
      var preview = "";
      var ct = res.headers.get("content-type") || "";
      if (ct.indexOf("application/json") !== -1) {
        var clone = res.clone();
        preview = clone.text().then(function (txt) {
          return summarizeBody(txt).slice(0, 900);
        });
      } else if (ct.indexOf("text/html") !== -1) {
        preview = Promise.resolve("[HTML-ответ, см. вкладку сеть]");
      } else {
        preview = Promise.resolve("");
      }
      Promise.resolve(preview).then(function (pv) {
        pushClientLine(method, url, res.status, ms, bodyInit, pv);
      });
      return res;
    });
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatServerLine(e) {
    var warn = e.warn ? '<span class="sb-dev-log-warn"> ⚠ ' + escapeHtml(e.warn) + "</span>" : "";
    var stClass = e.status >= 500 ? "sb-dev-log-err" : e.status >= 400 ? "sb-dev-log-warn" : "";
    var db = e.db
      ? '<span class="sb-dev-log-db">БД: ' + escapeHtml(e.db) + "</span>"
      : '<span class="sb-dev-log-db">БД: —</span>';
    return (
      '<div class="sb-dev-log-line">' +
      '<span class="sb-dev-log-ts">' +
      escapeHtml((e.ts || "").replace("T", " ").replace("Z", "")) +
      "</span>" +
      '<span class="sb-dev-log-src-server" title="Обработка на backend: Uvicorn + FastAPI, время ответа, изменения в БД (ORM)">[backend]</span> ' +
      escapeHtml(e.method || "") +
      " " +
      escapeHtml(e.path || "") +
      (e.query ? "?" + escapeHtml(e.query) : "") +
      ' → <span class="' +
      stClass +
      '">' +
      escapeHtml(String(e.status)) +
      "</span>" +
      " " +
      escapeHtml(String(e.duration_ms)) +
      " ms" +
      " " +
      escapeHtml(e.trace_id || "") +
      warn +
      db +
      "</div>"
    );
  }

  function formatClientLine(e) {
    var stClass = e.status >= 500 ? "sb-dev-log-err" : e.status >= 400 ? "sb-dev-log-warn" : "";
    var prev = e.preview
      ? '<span class="sb-dev-log-resp">ответ: ' + escapeHtml(e.preview) + "</span>"
      : "";
    var ini = e.initSummary
      ? '<span class="sb-dev-log-resp">запрос: ' + escapeHtml(e.initSummary) + "</span>"
      : "";
    return (
      '<div class="sb-dev-log-line">' +
      '<span class="sb-dev-log-ts">' +
      escapeHtml(e.ts) +
      "</span>" +
      '<span class="sb-dev-log-src-client" title="Вид со стороны страницы: что ушло и что пришло в fetch (JSON маскируется)">[UI]</span> ' +
      escapeHtml(e.method) +
      " " +
      escapeHtml(e.url) +
      ' → <span class="' +
      stClass +
      '">' +
      escapeHtml(String(e.status)) +
      "</span> " +
      escapeHtml(String(e.ms)) +
      " ms" +
      ini +
      prev +
      "</div>"
    );
  }

  function render() {
    var body = document.getElementById("sbDevLogBody");
    if (!body) return;
    var merged = [];
    var i;
    for (i = Math.max(0, clientEntries.length - 40); i < clientEntries.length; i++) {
      merged.push({ k: "c", t: clientEntries[i].tsIso || clientEntries[i].ts, row: clientEntries[i] });
    }
    for (i = Math.max(0, serverEntries.length - 60); i < serverEntries.length; i++) {
      merged.push({ k: "s", t: serverEntries[i].ts || "", row: serverEntries[i] });
    }
    merged.sort(function (a, b) {
      return (a.t || "").localeCompare(b.t || "");
    });
    var parts = merged.map(function (m) {
      return m.k === "c" ? formatClientLine(m.row) : formatServerLine(m.row);
    });
    body.innerHTML = parts.length ? parts.join("") : '<div class="sb-dev-log-line">Пока пусто. Сделайте запрос к API.</div>';
    body.scrollTop = body.scrollHeight;
  }

  function pollServer() {
    if (!panelOpen || paused) return;
    var o = apiOrigin();
    origFetch
      .call(window, o + "/api/v1/dev/trace/recent", { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (r.status === 404) {
          serverEntries = [];
          render();
          return null;
        }
        return r.json();
      })
      .then(function (data) {
        if (data && Array.isArray(data.entries)) {
          serverEntries = data.entries;
          render();
        }
      })
      .catch(function () {});
  }

  function startPoll() {
    stopPoll();
    pollTimer = window.setInterval(pollServer, POLL_MS);
    pollServer();
  }

  function stopPoll() {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function buildUi() {
    if (document.getElementById("sbDevLogFab")) return;
    var fab = document.createElement("button");
    fab.type = "button";
    fab.id = "sbDevLogFab";
    fab.className = "sb-dev-log-fab";
    fab.textContent = "Log";
    fab.title = "Учебный лог: слой UI (fetch) и слой backend (API + БД)";

    var panel = document.createElement("div");
    panel.id = "sbDevLogPanel";
    panel.className = "sb-dev-log-panel";
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML =
      '<div class="sb-dev-log-panel-header">' +
      '<span class="sb-dev-log-panel-title">Учебный лог</span>' +
      '<span class="sb-dev-log-panel-hint">UI — что делает страница (fetch). Backend — обработка в Python и запись в БД. Пароли скрыты.</span>' +
      '<div class="sb-dev-log-actions">' +
      '<button type="button" id="sbDevLogPause">Пауза</button>' +
      '<button type="button" id="sbDevLogClear">Очистить вид</button>' +
      "</div></div>" +
      '<div id="sbDevLogBody" class="sb-dev-log-body"></div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    fab.addEventListener("click", function () {
      panelOpen = !panelOpen;
      panel.classList.toggle("sb-dev-log-open", panelOpen);
      panel.setAttribute("aria-hidden", panelOpen ? "false" : "true");
      if (panelOpen) startPoll();
      else stopPoll();
      if (panelOpen) render();
    });

    document.getElementById("sbDevLogClear").addEventListener("click", function () {
      clientEntries = [];
      serverEntries = [];
      render();
      if (panelOpen) pollServer();
    });

    document.getElementById("sbDevLogPause").addEventListener("click", function () {
      paused = !paused;
      document.getElementById("sbDevLogPause").textContent = paused ? "Продолжить" : "Пауза";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildUi);
  } else {
    buildUi();
  }
})();
