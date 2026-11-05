// Поиск, копирование значений из таблиц, подсветка текущего раздела в оглавлении, меню на телефоне.
(function () {
  var prefix = window.DOCS_PREFIX || "";
  var index = window.DOCS_INDEX || [];

  // ---- Поиск по заголовкам и тексту страниц ----
  var input = document.querySelector(".search input");
  var box = document.querySelector(".search-results");
  var sel = -1;

  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  function snippet(text, q) {
    var i = text.toLowerCase().indexOf(q);
    if (i < 0) return "";
    var start = Math.max(0, i - 40);
    return (start > 0 ? "…" : "") + text.slice(start, i + q.length + 60).trim() + "…";
  }

  function render() {
    // Дефис внутри слова сохраняем (next-day, phone-transfer) — в индексе он тоже остаётся.
    var q = input.value.trim().toLowerCase().replace(/\s+/g, " ");
    sel = -1;
    if (q.length < 2) { box.hidden = true; return; }
    // Запасной вариант — тот же запрос через пробел: «next-day» найдёт и «next day».
    var qAlt = q.indexOf("-") >= 0 ? q.replace(/-+/g, " ").trim() : null;
    var has = function (s) {
      s = s.toLowerCase();
      return s.indexOf(q) >= 0 || (!!qAlt && s.indexOf(qAlt) >= 0);
    };
    var hits = index
      .map(function (p) {
        var inTitle = has(p.title);
        var inText = has(p.text);
        return { p: p, score: inTitle ? 2 : inText ? 1 : 0 };
      })
      .filter(function (h) { return h.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 10);
    box.innerHTML = hits.length
      ? hits.map(function (h) {
          var snip = snippet(h.p.text, q) || (qAlt ? snippet(h.p.text, qAlt) : "");
          return '<a href="' + prefix + h.p.url + '">' + esc(h.p.title) + "<small>" + esc(snip) + "</small></a>";
        }).join("")
      : '<div class="empty">Ничего не найдено</div>';
    box.hidden = false;
  }

  if (input) {
    input.addEventListener("input", render);
    input.addEventListener("keydown", function (e) {
      var links = box.querySelectorAll("a");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!links.length) return;
        sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
        links.forEach(function (a, i) { a.classList.toggle("sel", i === sel); });
      } else if (e.key === "Enter" && links.length) {
        location.href = links[Math.max(sel, 0)].href;
      } else if (e.key === "Escape") {
        box.hidden = true;
        input.blur();
      }
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".search")) box.hidden = true;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      }
    });
  }

  // ---- Клик по значению в таблице копирует его ----
  var toast;
  function showToast(text) {
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.hidden = true; }, 1400);
  }

  // Копирование в буфер: современный способ, а если браузер не дал доступ — через скрытое поле.
  function copyText(value, onOk) {
    var fallback = function () {
      var t = document.createElement("textarea");
      t.value = value;
      t.setAttribute("readonly", "");
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      t.remove();
      if (ok) onOk(); else showToast("Не удалось скопировать — выделите значение вручную");
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(value).then(onOk, fallback);
    else fallback();
  }

  document.querySelectorAll(".page td code").forEach(function (code) {
    code.title = "Нажмите, чтобы скопировать";
    code.addEventListener("click", function () {
      var value = code.textContent;
      copyText(value, function () {
        code.classList.add("copied");
        setTimeout(function () { code.classList.remove("copied"); }, 1000);
        showToast("Скопировано: " + value);
      });
    });
  });

  // ---- Таблицы на телефоне — карточками: подписываем ячейки названиями столбцов ----
  document.querySelectorAll(".page table").forEach(function (table) {
    var heads = Array.prototype.map.call(table.querySelectorAll("thead th"), function (th) { return th.textContent.trim(); });
    if (!heads.length) return;
    table.classList.add("cards");
    table.querySelectorAll("tbody tr").forEach(function (tr) {
      Array.prototype.forEach.call(tr.children, function (td, i) { td.setAttribute("data-label", heads[i] || ""); });
    });
  });

  // ---- Кнопка «Копировать» у блоков кода ----
  document.querySelectorAll(".page pre").forEach(function (pre) {
    var code = pre.querySelector("code");
    // Схемы (```text) не копируют — кнопка там только мешает.
    if (!code || code.classList.contains("language-text")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = "Копировать";
    btn.addEventListener("click", function () {
      copyText(code.textContent.replace(/\n$/, ""), function () {
        btn.textContent = "Скопировано";
        setTimeout(function () { btn.textContent = "Копировать"; }, 1200);
      });
    });
    pre.appendChild(btn);
  });

  // ---- Подсветка текущего раздела в оглавлении ----
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
  var heads = tocLinks
    .map(function (a) { return document.getElementById(decodeURIComponent(a.hash.slice(1))); })
    .filter(Boolean);
  function onScroll() {
    var current = null;
    heads.forEach(function (h) { if (h.getBoundingClientRect().top < 120) current = h; });
    tocLinks.forEach(function (a) {
      a.classList.toggle("active", current !== null && a.hash === "#" + current.id);
    });
  }
  if (heads.length) {
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // ---- Страница «SMS»: последние SMS из тестового API, обновление каждые 2 секунды ----
  var viewer = document.getElementById("sms-viewer");
  if (viewer) {
    viewer.innerHTML =
      '<div class="sms-toolbar">' +
      '<label for="sms-phone">Телефон</label>' +
      '<input id="sms-phone" type="tel" maxlength="25" placeholder="все клиенты" data-testid="sms-phone">' +
      '<span class="sms-status" data-testid="sms-status"></span>' +
      "</div>" +
      '<div class="sms-list" data-testid="sms-list"></div>' +
      '<div class="sms-pager" hidden>' +
      '<button type="button" class="sms-prev" data-testid="sms-prev">← Новее</button>' +
      '<span class="sms-page" data-testid="sms-page"></span>' +
      '<button type="button" class="sms-next" data-testid="sms-next">Старее →</button>' +
      "</div>";
    var phoneInput = viewer.querySelector("#sms-phone");
    var list = viewer.querySelector(".sms-list");
    var status = viewer.querySelector(".sms-status");
    var pager = viewer.querySelector(".sms-pager");
    var prevBtn = viewer.querySelector(".sms-prev");
    var nextBtn = viewer.querySelector(".sms-next");
    var pageLabel = viewer.querySelector(".sms-page");
    var PAGE = 5;
    var page = 0;
    var lastJson = "";
    try { phoneInput.value = localStorage.getItem("docs.smsPhone") || ""; } catch (e) { /* без памяти */ }

    var fmtTime = function (iso) {
      var d = new Date(iso);
      return d.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    };
    var fmtPhone = function (p) {
      return p.length === 12 ? p.slice(0, 2) + " " + p.slice(2, 5) + " " + p.slice(5, 8) + "-" + p.slice(8, 10) + "-" + p.slice(10) : p;
    };

    var load = function () {
      var raw = phoneInput.value.trim();
      var digits = raw.replace(/\D/g, "");
      var validPhone = digits.length === 10 || (digits.length === 11 && /^[78]/.test(digits));
      if (raw && (/[^\d\s()+\-]/.test(raw) || !validPhone)) {
        // Неполный или неверный номер — не показываем молча SMS всех клиентов, а говорим, что не так.
        status.textContent = "Введите 10 цифр телефона, например 9991234567";
        status.className = "sms-status err";
        list.innerHTML = "";
        pager.hidden = true;
        lastJson = "";
        return;
      }
      // Берём на одну SMS больше страницы — так видно, есть ли следующая страница.
      var url = "/api/v1/test/sms?limit=" + (PAGE + 1) + "&offset=" + page * PAGE + (digits ? "&phone=" + digits : "");
      fetch(url)
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          if (!res.ok) {
            status.textContent = (res.body.error && res.body.error.message) || "Ошибка";
            status.className = "sms-status err";
            return;
          }
          status.textContent = "обновлено " + new Date().toLocaleTimeString("ru-RU");
          status.className = "sms-status";
          var hasNext = res.body.length > PAGE;
          var items = res.body.slice(0, PAGE);
          var json = JSON.stringify(items) + hasNext;
          if (json === lastJson) return;  // не перерисовываем без изменений — выделение текста не сбивается
          lastJson = json;
          pager.hidden = page === 0 && !hasNext;
          prevBtn.disabled = page === 0;
          nextBtn.disabled = !hasNext;
          pageLabel.textContent = "Страница " + (page + 1);
          if (!items.length) {
            list.innerHTML = '<div class="sms-empty">' + (page ? "На этой странице SMS нет" : "SMS пока нет") + "</div>";
            return;
          }
          list.innerHTML = items.map(function (s, i) {
            return '<div class="sms-item' + (i === 0 && page === 0 ? " newest" : "") + '" data-testid="sms-item">' +
              '<div class="sms-meta"><b>' + esc(fmtPhone(s.phone)) + "</b>" +
              '<span class="sms-tag ' + (s.purpose === "LOGIN" ? "login" : "op") + '">' +
              (s.purpose === "LOGIN" ? "вход" : "операция") + "</span>" +
              "<span>" + esc(fmtTime(s.created_at)) + "</span></div>" +
              '<div class="sms-text">' + esc(s.text) + "</div>" +
              '<button type="button" class="sms-code" data-code="' + esc(s.code) + '" title="Скопировать код">' +
              esc(s.code) + "<small>копировать</small></button>" +
              "</div>";
          }).join("");
        })
        .catch(function () {
          status.textContent = "банк не отвечает";
          status.className = "sms-status err";
        });
    };

    list.addEventListener("click", function (e) {
      var btn = e.target.closest(".sms-code");
      if (!btn) return;
      var code = btn.getAttribute("data-code");
      copyText(code, function () {
        showToast("Скопировано: " + code);
        btn.classList.add("copied");
        setTimeout(function () { btn.classList.remove("copied"); }, 1200);
      });
    });
    phoneInput.addEventListener("input", function () {
      try { localStorage.setItem("docs.smsPhone", phoneInput.value); } catch (e) { /* без памяти */ }
      page = 0;
      lastJson = "";
      load();
    });
    var goTo = function (p) {
      page = Math.max(0, p);
      lastJson = "";
      load();
      viewer.scrollIntoView({ block: "start" });
    };
    prevBtn.addEventListener("click", function () { goTo(page - 1); });
    nextBtn.addEventListener("click", function () { goTo(page + 1); });
    load();
    setInterval(load, 2000);
  }

  // ---- Меню на узком экране ----
  var menuBtn = document.querySelector(".menu-btn");
  if (menuBtn) {
    menuBtn.addEventListener("click", function () { document.body.classList.toggle("menu-open"); });
  }
})();
