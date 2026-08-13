"""Sanitizer for designer-authored HTML (the HtmlBlock in Builder Mode).

Applies on every design save/upload path (services/site_design.py) so a block
of free-form HTML can never carry scripts into the PLATFORM-RENDERED site
(/e/... SSR and generated pages).

Deliberately NOT applied to Custom Code Mode uploads: a user-uploaded static
website (site_versions, source_type="user_upload") is stored and served
verbatim — its isolation comes from the sandbox CSP at the serving layer
(app/api/sites.py), not from rewriting the user's files.
"""

import nh3

_ALLOWED_TAGS = {
    "a", "abbr", "article", "aside", "b", "blockquote", "br", "caption",
    "code", "dd", "div", "dl", "dt", "em", "figcaption", "figure", "footer",
    "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "img", "li",
    "mark", "ol", "p", "pre", "q", "s", "section", "small", "span", "strong",
    "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time",
    "u", "ul",
}
_ALLOWED_ATTRS = {
    "*": {"class", "style", "title", "dir", "lang"},
    "a": {"href", "target"},  # rel is managed by nh3's link_rel (noopener…)
    "img": {"src", "alt", "width", "height", "loading"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan", "scope"},
    "time": {"datetime"},
}


def sanitize_html(raw: str) -> str:
    """User-authored HTML → safe HTML. Strips script/style tags, event
    handlers, javascript: URLs and any tag/attr outside the allowlist."""
    if not raw:
        return ""
    return nh3.clean(raw, tags=_ALLOWED_TAGS, attributes=_ALLOWED_ATTRS)
