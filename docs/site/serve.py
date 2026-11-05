"""Сайт документации ShlapaBank в стиле Confluence: дерево страниц слева, страница, оглавление справа.

Источник — Markdown-файлы в папке docs/guide (в контейнере смонтирована как /guide):
- каждая страница — файл .md, заголовок страницы — первая строка «# ...»;
- порядок в меню — по имени файла (удобно начинать с номера: 01-start.md, 02-test-data.md);
- index.md — главная страница;
- подпапка — группа в меню, её название берётся из index.md подпапки (или из имени папки).

Сайт пересобирается сам, когда меняется любой .md: правите файл → обновляете страницу в браузере.

    python serve.py <папка с .md> [порт]
"""

import html
import http.server
import json
import re
import shutil
import sys
import threading
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

import markdown
from markdown.extensions.toc import slugify_unicode

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "/guide")
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8000
OUT_ROOT = Path("/tmp/site")
CURRENT: Path | None = None  # папка последней сборки, её и отдаёт сервер

# Старые адреса страниц → новые (после переименований ссылки и закладки не ломаются).
REDIRECTS = {
    "01-test-data.html": "02-test-data.html",
    "02-errors.html": "03-errors.html",
    "03-swagger.html": "tools/02-swagger.html",
    "04-swagger.html": "tools/02-swagger.html",
    "01-sms.html": "tools/01-sms.html",
    "04-api.html": "tools/02-swagger.html",
    "tools/03-test-api.html": "tools/02-swagger.html",
}
ASSETS = Path(__file__).parent / "assets"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".json"}  # картинки и файлы для скачивания (коллекции)

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")  # бэкенд банка внутри docker-сети
BANK_URL = "http://localhost:8080/"
SWAGGER_URL = "http://localhost:8080/docs"

# Голые адреса http(s)://… в тексте становятся ссылками (кроме кода и уже оформленных ссылок).
BARE_URL = re.compile(r"(?<![(<\[\"'=])(https?://[^\s)<>|`\"']+[^\s)<>|`\"'.,;:!?])")


def page_title(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return path.stem


def link_bare_urls(text: str) -> str:
    out, in_fence = [], False
    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            out.append(line)
            continue
        if in_fence:
            out.append(line)
            continue
        # Внутри `кода` адреса не трогаем: чётные куски — обычный текст, нечётные — код.
        parts = line.split("`")
        for i in range(0, len(parts), 2):
            parts[i] = BARE_URL.sub(r"<\1>", parts[i])
        out.append("`".join(parts))
    return "\n".join(out)


def group_info(folder: Path) -> tuple[str, int]:
    """Название и место группы в меню. Файл _group.txt: 1-я строка — название, 2-я — порядок (меньше — выше).
    Без него: название из index.md папки (или имя папки), порядок 100."""
    meta = folder / "_group.txt"
    if meta.exists():
        lines = [line.strip() for line in meta.read_text(encoding="utf-8").splitlines() if line.strip()]
        order = int(lines[1]) if len(lines) > 1 and lines[1].isdigit() else 100
        return lines[0], order
    index = folder / "index.md"
    return (page_title(index) if index.exists() else folder.name.replace("-", " ").capitalize()), 100


def collect_pages() -> list[dict]:
    """Плоский список страниц в порядке меню. У страницы в подпапке есть group."""
    pages = []

    def add_dir(folder: Path, group: str | None):
        files = sorted(p for p in folder.glob("*.md") if p.name != "index.md")
        index = folder / "index.md"
        if index.exists():
            files.insert(0, index)
        for f in files:
            rel = f.relative_to(SRC)
            pages.append({
                "src": f,
                "url": rel.with_suffix(".html").as_posix(),
                "title": page_title(f),
                "group": group,
                "is_group_index": group is not None and f.name == "index.md",
            })
        subs = [p for p in folder.iterdir() if p.is_dir() and not p.name.startswith((".", "_")) and p.name != "images"]
        for sub in sorted(subs, key=lambda d: (group_info(d)[1], d.name)):
            add_dir(sub, group_info(sub)[0])

    add_dir(SRC, None)
    return pages


ROOT_GROUP = "Общее"  # категория для страниц в корне docs/guide


def render_sidebar(pages: list[dict], current: dict, prefix: str) -> str:
    items, open_group = [], object()
    for p in pages:
        group = p["group"] or ROOT_GROUP
        if group != open_group:
            if items:
                items.append("</ul></li>")
            items.append(f'<li class="group"><span class="group-title">{html.escape(group)}</span><ul>')
            open_group = group
        active = ' class="active" aria-current="page"' if p is current else ""
        # Обзор группы называется «Обзор», корневая страница — «Главная»: не повторяем названия.
        if p["is_group_index"]:
            label = "Обзор"
        elif p["group"] is None and p["url"] == "index.html":
            label = "Главная"
        else:
            label = p["title"]
        items.append(f'<li><a href="{prefix}{p["url"]}"{active}>{html.escape(label)}</a></li>')
    if items:
        items.append("</ul></li>")
    return "<ul>" + "".join(items) + "</ul>"


_CELL = re.compile(r"(<td[^>]*>)(.*?)(</td>)", re.S)
_CODE = re.compile(r"(<code[^>]*>.*?</code>)", re.S)


def keep_amounts_whole(body: str) -> str:
    """В ячейках таблиц суммы («150 000 ₽», «1 000 000 ₽») не разрываются переносом строки.

    Пробелы внутри числа и перед ₽ заменяются неразрывными; содержимое <code> не трогаем —
    его копируют кликом, там должны остаться обычные символы.
    """
    def fix_text(text: str) -> str:
        text = re.sub(r"(?<=\d) (?=\d{3}(?!\d))", " ", text)
        return re.sub(r"(?<=\d) (?=₽)", " ", text)

    def fix_cell(m: re.Match) -> str:
        parts = _CODE.split(m.group(2))
        inner = "".join(p if i % 2 else fix_text(p) for i, p in enumerate(parts))
        return m.group(1) + inner + m.group(3)

    return _CELL.sub(fix_cell, body)


def render_page(page: dict, pages: list[dict]) -> str:
    md = markdown.Markdown(
        extensions=["tables", "fenced_code", "toc", "attr_list", "admonition", "sane_lists"],
        # slugify_unicode: якоря у русских заголовков (#общие-правила), иначе кириллица выкидывается
        extension_configs={"toc": {"toc_depth": "2-3", "permalink": False, "slugify": slugify_unicode}},
    )
    body = md.convert(link_bare_urls(page["src"].read_text(encoding="utf-8")))
    # Внешние адреса открываются в новой вкладке, чтобы документация оставалась открытой.
    body = re.sub(r'<a href="(https?://[^"]+)"', r'<a href="\1" target="_blank" rel="noopener"', body)
    body = keep_amounts_whole(body)
    depth = page["url"].count("/")
    prefix = "../" * depth
    toc_tokens = []

    def flatten(tokens):
        for t in tokens:
            toc_tokens.append(t)
            flatten(t.get("children", []))

    flatten(md.toc_tokens)
    toc = "".join(
        f'<li class="lvl{t["level"]}"><a href="#{t["id"]}">{html.escape(t["name"])}</a></li>'
        for t in toc_tokens if t["level"] in (2, 3)
    )
    idx = pages.index(page)
    prev_p = pages[idx - 1] if idx > 0 else None
    next_p = pages[idx + 1] if idx + 1 < len(pages) else None
    pager = '<nav class="pager">'
    pager += f'<a class="prev" href="{prefix}{prev_p["url"]}"><small>Назад</small>{html.escape(prev_p["title"])}</a>' if prev_p else "<span></span>"
    pager += f'<a class="next" href="{prefix}{next_p["url"]}"><small>Далее</small>{html.escape(next_p["title"])}</a>' if next_p else "<span></span>"
    pager += "</nav>"
    crumbs = '<a href="' + prefix + 'index.html">Документация</a>'
    if page["group"]:
        crumbs += f' <span>/</span> {html.escape(page["group"])}'

    return f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(page["title"]) + ("" if page["title"] == "Документация ShlapaBank" else " · Документация ShlapaBank")}</title>
<link rel="stylesheet" href="{prefix}assets/style.css">
<link rel="icon" href="{prefix}assets/favicon.svg" type="image/svg+xml">
</head>
<body>
<header class="topbar">
  <button class="menu-btn" type="button" aria-label="Меню" data-testid="docs-menu-btn">☰</button>
  <a class="brand" href="{prefix}index.html"><span class="logo">S</span>ShlapaBank <span class="brand-sub">Документация</span></a>
  <div class="search">
    <input type="search" placeholder="Поиск по документации" aria-label="Поиск по документации" data-testid="docs-search">
    <div class="search-results" hidden></div>
  </div>
  <nav class="top-links">
    <a href="{BANK_URL}" target="_blank" rel="noopener">Интернет-банк</a>
    <a href="{prefix}tools/01-sms.html" data-testid="docs-sms-link">SMS</a>
    <a class="swagger-link" href="{SWAGGER_URL}" target="_blank" rel="noopener" data-testid="docs-swagger-link">Swagger API</a>
  </nav>
</header>
<div class="layout">
  <aside class="sidebar" data-testid="docs-sidebar">
    <nav class="side-links" aria-label="Ссылки стенда">
      <a href="{BANK_URL}" target="_blank" rel="noopener" data-testid="docs-menu-bank-link">Интернет-банк</a>
      <a href="{prefix}tools/01-sms.html" data-testid="docs-menu-sms-link">SMS</a>
      <a href="{SWAGGER_URL}" target="_blank" rel="noopener" data-testid="docs-menu-swagger-link">Swagger API</a>
    </nav>
    {render_sidebar(pages, page, prefix)}
  </aside>
  <main class="content">
    <div class="crumbs">{crumbs}</div>
    <article class="page">{body}</article>
    {pager}
  </main>
  <aside class="toc">{'<div class="toc-title">На этой странице</div><ul>' + toc + '</ul>' if toc else ''}</aside>
</div>
<script>window.DOCS_PREFIX = "{prefix}";</script>
<script src="{prefix}search-index.js"></script>
<script src="{prefix}assets/app.js"></script>
</body>
</html>
"""


def build() -> None:
    pages = collect_pages()
    tmp = OUT_ROOT / f"build-{time.time_ns()}"
    shutil.copytree(ASSETS, tmp / "assets")
    index = []
    for p in pages:
        target = tmp / p["url"]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(render_page(p, pages), encoding="utf-8")
        text = p["src"].read_text(encoding="utf-8")
        # Заголовок страницы в тексте поиска не нужен — он и так показан отдельно.
        body_text = " ".join(line for line in text.splitlines() if not line.startswith("# "))
        # Картинки и адреса ссылок в поиск не попадают — только видимый текст.
        plain = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", body_text)
        plain = re.sub(r"\]\([^)]*\)", "]", plain)
        plain = re.sub(r"<[^>]+>", " ", plain)
        plain = re.sub(r"[#|*`>\[\]()!]+", " ", plain)
        # Дефис внутри слова (next-day, phone-transfer) оставляем — по нему ищут; одиночные «-» разметки убираем.
        plain = re.sub(r"(?<!\w)-+|-+(?!\w)", " ", plain)
        index.append({"url": p["url"], "title": p["title"], "text": re.sub(r"\s+", " ", plain)[:20000]})
    # Картинки и файлы лежат рядом со страницами (docs/guide/images/, docs/guide/files/) и копируются как есть.
    for f in SRC.rglob("*"):
        if f.is_file() and f.suffix.lower() in IMAGE_SUFFIXES:
            target = tmp / f.relative_to(SRC)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, target)
    if not pages:
        (tmp / "index.html").write_text("<p>В папке docs/guide нет ни одной страницы .md</p>", encoding="utf-8")
    (tmp / "search-index.js").write_text(
        "window.DOCS_INDEX = " + json.dumps(index, ensure_ascii=False) + ";", encoding="utf-8"
    )
    for old_url, new_url in REDIRECTS.items():
        target = tmp / old_url
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(_redirect_page("../" * old_url.count("/") + new_url), encoding="utf-8")
    # Каждая сборка — в своей папке; сервер переключается на неё одним присваиванием, без момента «файлов нет».
    global CURRENT
    previous = CURRENT
    CURRENT = tmp
    if previous and previous != tmp:
        threading.Timer(30, shutil.rmtree, args=(previous,), kwargs={"ignore_errors": True}).start()
    print(f"docs: собрано страниц: {len(pages)}", flush=True)


def _redirect_page(url: str) -> str:
    return (f'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url={url}">'
            f'<title>Страница переехала</title><p>Страница переехала: <a href="{url}">{url}</a></p>')


def snapshot() -> dict:
    return {str(p): p.stat().st_mtime for p in SRC.rglob("*")
            if p.is_file() and (p.suffix == ".md" or p.suffix.lower() in IMAGE_SUFFIXES)}


def watch() -> None:
    seen = snapshot()
    while True:
        time.sleep(1.5)
        try:
            now = snapshot()
            if now != seen:
                seen = now
                build()
        except Exception as e:  # битый файл не должен ронять сайт
            print(f"docs: ошибка сборки: {e}", flush=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(CURRENT), **kwargs)

    def send_error(self, code, message=None, explain=None):
        if code != 404:
            return super().send_error(code, message, explain)
        body = ('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Страница не найдена</title>'
                '<link rel="stylesheet" href="/assets/style.css"><body><main class="content">'
                '<article class="page"><h1>Страница не найдена</h1>'
                '<p>Такой страницы в документации нет — возможно, она переехала.</p>'
                '<p><a href="/index.html">На главную документации</a></p></article></main></body></html>').encode()
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # Страница «SMS» читает тестовое API банка через этот же сайт (другой порт браузер бы не пустил).
        if self.path.startswith("/api/v1/test/sms"):
            return self._proxy()
        return super().do_GET()

    def _proxy(self):
        try:
            with urllib.request.urlopen(BACKEND_URL + self.path, timeout=5) as r:
                status, body = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, body = e.code, e.read()
        except OSError:
            status, body = 502, json.dumps({"error": {"code": "bank_unavailable",
                                                      "message": "Банк не отвечает"}}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    build()
    threading.Thread(target=watch, daemon=True).start()
    print(f"docs: сайт запущен на порту {PORT} контейнера (снаружи — http://localhost:8090/)", flush=True)
    http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
