"""HTML round-trip tests (no DB): design → .html files → design.

Pins the end-user contract: text edited in the HTML comes back into the
design; deleted/reordered sections follow the HTML; hand-written markup
survives as sanitized HtmlBlocks; live blocks pass through verbatim."""

from app.services.site_design import validate_design
from app.services.site_html import (
    design_to_site_files,
    sanitize_html,
    site_files_to_design,
)


def _cfg():
    return {
        "puck": {
            "root": {"props": {"theme": "elegant", "customCss": ".a{color:red}"}},
            "content": [
                {"type": "Banner", "props": {"id": "Banner-1", "title": "標題", "subtitle": "副標", "image": "/media/x.png", "ctaLabel": "去", "ctaHref": "/guide", "height": "l"}},
                {"type": "Heading", "props": {"id": "Heading-2", "text": "介紹", "level": "h2", "align": "left"}},
                {"type": "Paragraph", "props": {"id": "Para-3", "text": "một đoạn văn"}},
                {"type": "StatsBand", "props": {"id": "Stats-4", "style": {}}},
                {"type": "TextCard", "props": {"id": "Card-5", "title": "卡", "text": "內容"}},
                {"type": "Notice", "props": {"id": "N-6", "title": "注意", "tone": "info", "items": [{"text": "一"}, {"text": "二"}]}},
                {"type": "InfoList", "props": {"id": "I-7", "title": "資訊", "items": [{"label": "距離", "value": "2km"}]}},
                {"type": "Places", "props": {"id": "P-8", "title": "地點", "items": [{"name": "廟", "description": "老廟"}]}},
                {"type": "Image", "props": {"id": "Img-9", "url": "/media/a.png", "alt": "ảnh", "height": "auto"}},
                {"type": "Button", "props": {"id": "B-10", "label": "按我", "href": "/x", "variant": "solid"}},
                {"type": "Columns", "props": {"id": "C-11", "ratio": "1-1",
                    "left": [{"type": "Paragraph", "props": {"id": "Pl-12", "text": "trái"}}],
                    "right": [{"type": "Paragraph", "props": {"id": "Pr-13", "text": "phải"}}]}},
                {"type": "Divider", "props": {"id": "D-14"}},
                {"type": "Spacer", "props": {"id": "S-15", "size": "m"}},
            ],
            "zones": {},
        },
        "pages": [
            {"slug": "guide", "title": "指南", "nav": True,
             "data": {"root": {"props": {}}, "content": [{"type": "Heading", "props": {"id": "H-20", "text": "怎麼玩", "level": "h2"}}], "zones": {}}},
        ],
        "header": {"root": {"props": {}}, "content": [{"type": "SiteHeader", "props": {"id": "SH-30"}}], "zones": {}},
        "footer": None,
    }


def _roundtrip(cfg, edit=None):
    files = design_to_site_files(cfg, event_name="Sự kiện", brand_color="#dc2626")
    if edit:
        files = edit(files)
    return site_files_to_design(files, cfg), files


def _types(design):
    return [b["type"] for b in design["puck"]["content"]]


def test_full_roundtrip_preserves_every_block():
    cfg = _cfg()
    design, files = _roundtrip(cfg)
    assert _types(design) == _types({"puck": cfg["puck"]})
    by_id = {b["props"].get("id"): b["props"] for b in design["puck"]["content"]}
    assert by_id["Banner-1"]["title"] == "標題"
    assert by_id["Banner-1"]["ctaHref"] == "/guide"
    assert by_id["Banner-1"]["height"] == "l"          # machine prop rides zprops
    assert by_id["N-6"]["items"] == [{"text": "一"}, {"text": "二"}]
    assert by_id["I-7"]["items"] == [{"label": "距離", "value": "2km"}]
    assert by_id["P-8"]["items"] == [{"name": "廟", "description": "老廟"}]
    assert by_id["C-11"]["left"][0]["props"]["text"] == "trái"
    assert by_id["C-11"]["right"][0]["props"]["text"] == "phải"
    # pages + chrome + root props survive
    assert design["pages"][0]["slug"] == "guide"
    assert design["pages"][0]["data"]["content"][0]["props"]["text"] == "怎麼玩"
    assert design["header"]["content"][0]["type"] == "SiteHeader"
    assert design["puck"]["root"]["props"]["theme"] == "elegant"
    assert design["puck"]["root"]["props"]["customCss"] == ".a{color:red}"
    # and the whole thing passes the normal gate
    validate_design(design)


def test_user_edits_flow_back():
    def edit(files):
        out = dict(files)
        out["index.html"] = (
            out["index.html"]
            .replace("một đoạn văn", "đoạn văn ĐÃ SỬA")
            .replace("<li>一</li>", "<li>一</li>\n<li>三</li>")
        )
        out["style.css"] = ".hero{border:1px solid red}"
        return out

    design, _ = _roundtrip(_cfg(), edit)
    by_id = {b["props"].get("id"): b["props"] for b in design["puck"]["content"]}
    assert by_id["Para-3"]["text"] == "đoạn văn ĐÃ SỬA"
    assert [i["text"] for i in by_id["N-6"]["items"]] == ["一", "三", "二"]
    assert design["puck"]["root"]["props"]["customCss"] == ".hero{border:1px solid red}"


def test_deleted_section_and_custom_markup():
    def edit(files):
        out = dict(files)
        html = out["index.html"]
        # delete the TextCard section entirely
        start = html.index('<section data-zb="TextCard"')
        end = html.index("</section>", start) + len("</section>")
        html = html[:start] + html[end:]
        # user writes their own markup + a script that must not survive
        html = html.replace(
            "</main>",
            '<div class="mine"><h2>Khối tự viết</h2><b>đậm</b>'
            '<script>alert(1)</script><img src=x onerror=alert(2)></div>\n</main>',
        )
        out["index.html"] = html
        return out

    design, _ = _roundtrip(_cfg(), edit)
    types = _types(design)
    assert "TextCard" not in types
    assert types[-1] == "HtmlBlock"
    html = design["puck"]["content"][-1]["props"]["html"]
    assert "Khối tự viết" in html and "<b>" in html
    assert "script" not in html and "onerror" not in html
    validate_design(design)  # sanitized again at the gate, still valid


def test_live_block_placeholder_edits_are_ignored():
    def edit(files):
        out = dict(files)
        out["index.html"] = out["index.html"].replace("此區塊由平台自動渲染", "hacked text")
        return out

    design, _ = _roundtrip(_cfg(), edit)
    stats = next(b for b in design["puck"]["content"] if b["type"] == "StatsBand")
    assert stats["props"].get("id") == "Stats-4"
    assert "hacked" not in str(stats["props"])


def test_new_page_file_creates_page():
    def edit(files):
        out = dict(files)
        out["lien-he.html"] = (
            "<html><head><title>Liên hệ</title></head>"
            "<body><main data-zoustec-content><p>alo</p></main></body></html>"
        )
        del out["guide.html"]  # the zip IS the site: missing file = deleted page
        return out

    design, _ = _roundtrip(_cfg(), edit)
    assert [p["slug"] for p in design["pages"]] == ["lien-he"]
    page = design["pages"][0]
    assert page["title"] == "Liên hệ"
    assert page["data"]["content"][0]["type"] == "HtmlBlock"


def test_sanitize_html_strips_dangerous_content():
    assert sanitize_html('<a href="javascript:alert(1)">x</a>').count("javascript") == 0
    assert "<iframe" not in sanitize_html('<iframe src="https://evil"></iframe>')
    assert sanitize_html("<p style='color:red'>ok</p>").startswith("<p")
