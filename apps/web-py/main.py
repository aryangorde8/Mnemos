"""Mnemos frontend — FastHTML (pure Python, HTMX + SSE). Replaces the React app.

Serves the UI and talks to the agent backend (apps/agent-py) over HTTP/SSE.
"""
from __future__ import annotations

from urllib.parse import quote

from fasthtml.common import (  # type: ignore
    A, Aside, Br, Canvas, Div, EventStream, Footer, Form, H1, H3, Header, Input, Main, Nav,
    NotStr, P, Script, Span, Style, Table, Tbody, Td, Th, Thead, Title, Tr, fast_app, sse_message,
)

import backend
from styles import CSS

_FONTS = NotStr(
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1'
    "&family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500;600"
    '&display=swap" rel="stylesheet">'
)
_SSE_EXT = NotStr('<script src="https://cdn.jsdelivr.net/npm/htmx-ext-sse@2.2.3/dist/sse.js"></script>')

app, rt = fast_app(pico=False, hdrs=(_FONTS, Style(CSS), _SSE_EXT), htmlkw={"lang": "en"})

NAV = [("overview", "/overview"), ("ask", "/ask"), ("search", "/search"), ("debate", "/debate"),
       ("memory", "/memory"), ("commitments", "/commitments"), ("actions", "/actions"),
       ("briefings", "/briefings"), ("ingest", "/ingest")]


CMDK_TARGETS = [("home", "/")] + NAV

_CMDK_JS = """
(function(){var ov=document.getElementById('cmdk');if(!ov)return;
var input=document.getElementById('cmdk-input'),list=document.getElementById('cmdk-list');
var items=[].slice.call(list.children),sel=0;
function vis(){return items.filter(function(it){return it.style.display!=='none';});}
function mark(i){var v=vis();sel=Math.max(0,Math.min(v.length-1,i));items.forEach(function(it){it.classList.remove('sel');});if(v[sel])v[sel].classList.add('sel');}
function filt(){var q=input.value.toLowerCase();items.forEach(function(it){it.style.display=it.textContent.toLowerCase().indexOf(q)>=0?'':'none';});mark(0);}
function open(){ov.classList.add('open');input.value='';filt();setTimeout(function(){input.focus();},10);}
function close(){ov.classList.remove('open');}
function go(){var v=vis();if(v[sel])window.location=v[sel].getAttribute('data-href');}
document.addEventListener('keydown',function(e){
if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){e.preventDefault();ov.classList.contains('open')?close():open();return;}
if(!ov.classList.contains('open'))return;
if(e.key==='Escape')close();else if(e.key==='ArrowDown'){e.preventDefault();mark(sel+1);}
else if(e.key==='ArrowUp'){e.preventDefault();mark(sel-1);}else if(e.key==='Enter'){e.preventDefault();go();}});
input.addEventListener('input',filt);
ov.addEventListener('click',function(e){if(e.target===ov)close();});
items.forEach(function(it){it.addEventListener('click',function(){window.location=it.getAttribute('data-href');});
it.addEventListener('mouseenter',function(){mark(vis().indexOf(it));});});})();
"""


def command_palette():
    items = [Div(Span(label), Span(href, cls="k"), cls="cmdk-item", data_href=href)
             for label, href in CMDK_TARGETS]
    overlay = Div(Div(
        Input(id="cmdk-input", cls="cmdk-input", placeholder="jump to…", autocomplete="off"),
        Div(*items, id="cmdk-list", cls="cmdk-list"),
        cls="cmdk-panel"), id="cmdk", cls="cmdk-overlay")
    return (overlay, Script(_CMDK_JS))


def topbar(active: str = "", home: bool = False):
    mid = (Span("2026 · vol. 001 · day 020 / 028", cls="chrome") if home
           else Nav(*[A(label, href=href, cls=("on" if active == label else "")) for label, href in NAV]))
    return Header(Div(
        A(Span("Mnemos", cls="brand-i"), " ", Span("μν.", cls="label"), href="/",
          style="display:flex;align-items:baseline;gap:8px"),
        Div(mid, Span(Span(cls="pulse-dot"), " ", Span("live", cls="chrome"),
                      style="display:inline-flex;align-items:center;gap:7px"),
            cls="tb-right"),
        cls="row"), cls="topbar")


def leftrail():
    return Aside(Span("Mnemos · the memory agent · v0.0.1", cls="vrail"),
                 Span("an editorial built on what you've seen", cls="vrail"), cls="leftrail")


def footer(active: str = ""):
    return Footer(Div(Span("a memory-first agent · built for action", cls="chrome"),
                      Span(active or "home", cls="chrome"),
                      Span("press ⌘K to begin", cls="chrome"), cls="row"), cls="bottombar")


def ihead(active: str = ""):
    links = [("home", "/"), ("ask", "/ask"), ("memory", "/memory"), ("search", "/search")]
    kids = []
    for i, (label, href) in enumerate(links):
        if i:
            kids.append(Span("·", cls="faint"))
        kids.append(A(label, href=href, cls=("on" if active == label else "")))
    return Header(Div(
        A(Span("Mnemos", cls="brand-i"), " ", Span(f"μν. — {active or 'overview'}", cls="label"),
          href="/", style="display:flex;align-items:baseline;gap:8px"),
        Nav(*kids), cls="row"), cls="ihead")


def shell(active: str, *content):
    return (ihead(active),
            Main(Div(*content, cls="wrap"), style="padding:52px 0 90px"),
            *command_palette())


# ─────────────────────────── pages ───────────────────────────

_CONSTELLATION_JS = """
(function(){var cvs=document.getElementById('constellation');if(!cvs)return;var parent=cvs.parentElement;
var reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;var dpr=window.devicePixelRatio||1;var H=720;
var stars=[],links=[],mouse={x:-1000,y:-1000},trace=null;
function build(w,h){var N=77;stars=[];for(var i=0;i<N;i++){var yb=Math.pow(Math.random(),1.3);
stars.push({x:Math.random()*w,y:yb*h*0.85+20,vx:(Math.random()-.5)*.08,vy:(Math.random()-.5)*.08,r:.7+Math.random()*1.8,mag:Math.random(),phase:Math.random()*6.2832});}
links=[];for(var i=0;i<stars.length;i++)for(var j=i+1;j<stars.length;j++){var dx=stars[i].x-stars[j].x,dy=stars[i].y-stars[j].y;if(Math.hypot(dx,dy)<120)links.push([i,j]);}}
function resize(){var w=parent.getBoundingClientRect().width;cvs.width=w*dpr;cvs.height=H*dpr;cvs.style.width=w+'px';cvs.style.height=H+'px';build(w,H);}
resize();new ResizeObserver(resize).observe(parent);
function mkpath(start){var path=[start],used={};used[start]=1;for(var s=0;s<7;s++){var cur=stars[path[path.length-1]],nx=-1,nd=1e9;for(var i=0;i<stars.length;i++){if(used[i])continue;var d=Math.hypot(stars[i].x-cur.x,stars[i].y-cur.y);if(d<nd&&d<200){nd=d;nx=i;}}if(nx<0)break;used[nx]=1;path.push(nx);}return{path:path,t0:performance.now(),dur:2500};}
if(!reduced){cvs.addEventListener('mousemove',function(e){var r=cvs.getBoundingClientRect();mouse={x:e.clientX-r.left,y:e.clientY-r.top};});
cvs.addEventListener('mouseleave',function(){mouse={x:-1000,y:-1000};});
cvs.addEventListener('click',function(e){var r=cvs.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;if(!stars.length)return;var n=0,nd=1e9;for(var i=0;i<stars.length;i++){var d=Math.hypot(stars[i].x-mx,stars[i].y-my);if(d<nd){nd=d;n=i;}}trace=mkpath(n);});}
function loop(now){var ctx=cvs.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);var W=cvs.width/dpr,Hh=cvs.height/dpr;ctx.clearRect(0,0,W,Hh);
if(!reduced){for(var k=0;k<stars.length;k++){var s=stars[k],dx=mouse.x-s.x,dy=mouse.y-s.y,d2=dx*dx+dy*dy;if(d2<22500){var f=(1-d2/22500)*.03;s.vx+=dx*f*.002;s.vy+=dy*f*.002;}s.vx*=.985;s.vy*=.985;s.x+=s.vx;s.y+=s.vy;s.phase+=.004+s.mag*.006;}}
for(var l=0;l<links.length;l++){var a=stars[links[l][0]],b=stars[links[l][1]],dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);if(d>180)continue;ctx.strokeStyle='rgba(108,100,90,'+((1-d/180)*.18)+')';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
for(var k=0;k<stars.length;k++){var s=stars[k],tw=.55+.45*Math.sin(s.phase);ctx.beginPath();ctx.fillStyle='rgba(243,236,223,'+(.35+s.mag*.45*tw)+')';ctx.arc(s.x,s.y,s.r,0,6.2832);ctx.fill();}
if(trace){var el=now-trace.t0,prog=Math.min(1,el/trace.dur),segs=trace.path.length-1,sp=prog*segs;ctx.strokeStyle='#f25738';ctx.lineWidth=1.1;ctx.beginPath();for(var k2=0;k2<segs;k2++){var a=stars[trace.path[k2]],b=stars[trace.path[k2+1]];if(sp>=k2+1){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}else if(sp>k2){var lo=sp-k2;ctx.moveTo(a.x,a.y);ctx.lineTo(a.x+(b.x-a.x)*lo,a.y+(b.y-a.y)*lo);break;}else break;}ctx.stroke();var hi=trace.path[Math.min(Math.floor(sp)+1,segs)],head=stars[hi];if(head){ctx.fillStyle='#f25738';ctx.beginPath();ctx.arc(head.x,head.y,2.5,0,6.2832);ctx.fill();ctx.beginPath();ctx.strokeStyle='rgba(242,87,56,.4)';ctx.lineWidth=.6;ctx.arc(head.x,head.y,8+4*Math.sin(now*.006),0,6.2832);ctx.stroke();}if(prog>=1)trace=null;}
requestAnimationFrame(loop);}requestAnimationFrame(loop);
if(!reduced){function fire(){if(stars.length)trace=mkpath(Math.floor(Math.random()*stars.length));}setTimeout(fire,800);setInterval(fire,4200);}})();
"""

_LIVESTREAM_JS = """
(function(){var el=document.getElementById('livestream');if(!el)return;
var sets=[[['cs-think','user wants to know if Q3 plan slipped'],['cs-tool','memory.search · "Q3 roadmap status"'],['cs-obs','6 docs · top cosine 0.91']],
[['cs-think','draft a decline to Marcus, propose Thursday'],['cs-tool','draft_email → critique_draft'],['cs-obs','critic · revise · 1 high · voice 8/10']],
[['cs-think','what do I owe Sarah this week?'],['cs-tool','list_commitments · outgoing'],['cs-obs','9 open · Q3 doc due May 22']]];
var idx=0;function render(){var s=sets[idx%sets.length];el.innerHTML='';s.forEach(function(line,i){var d=document.createElement('span');d.className='cs-line '+line[0];d.style.animationDelay=(i*0.12)+'s';d.textContent=(line[0]==='cs-think'?'  ':'· ')+line[1];el.appendChild(d);});idx++;}
render();setInterval(render,1900);})();
"""


@rt("/")
def home():
    constellation = Div(Canvas(id="constellation"), Div(cls="const-fade"), cls="const-layer")
    hero = Main(
        Div(Span(cls="drawline"), Span("── mnemos · the memory agent"), cls="kicker label"),
        Div(
            Div(H1("Your professional memory,", Br(),
                   Span("made navigable.", cls="display-i accent")), cls="hero-head"),
            Div(Div(Span("live · stream 0x4a91", cls="label"), Span(cls="pulse-dot"), cls="cs-head"),
                Div(id="livestream", cls="cs-body"), cls="corner-stream-pane"),
            cls="hero-grid"),
        P("Ingest your email, calendar, notes, slack, and docs. Mnemos reasons over the corpus "
          "with Gemini 3 Pro, drafts the action, and a second ",
          Span("Critic agent", cls="saffron"), " audits the draft — before you approve with one click.",
          cls="hero-sub"),
        Div(A("watch it reason →", href="/ask", cls="btn-decisive primary"),
            A("tour the memory", href="/memory", cls="btn-decisive"),
            A("read the overview", href="/overview", cls="btn-decisive ghost"),
            Span("click anywhere on the field to trace", cls="chrome", style="margin-left:8px"),
            cls="cta"),
        cls="hero-main")
    bottombar = Footer(Div(
        Span("a memory-first agent · built for action", cls="chrome"),
        Span("2026.05.20 — vault active · 242 docs", cls="chrome"),
        Span("press ⌘K to begin", cls="chrome"), cls="row"), cls="bottombar")
    return (Title("Mnemos — the memory agent"),
            topbar(home=True), constellation, leftrail(), hero, bottombar,
            *command_palette(),
            Script(_CONSTELLATION_JS + _LIVESTREAM_JS))


_TILES = [
    ("01", "❡", "Memory", "ingested.",
     "Mail, calendar, notes, slack, docs — vectorized in MongoDB Atlas, queryable in milliseconds.", "/memory"),
    ("02", "◆", "Reasoning", "streamed.",
     "Gemini 3 Pro thinks out loud over SSE. Every thought, retrieval, observation, citation — in order.", "/ask"),
    ("03", "✎", "Critique", "audited.",
     "A second agent red-pencils the first. Drafts arrive with their own copy-editor's notes.", "/ask"),
    ("04", "⌗", "Hybrid retrieval", "cited.",
     "Vector + BM25 fused via RRF and reranked. Every claim traceable to a chunk in the vault.", "/search"),
]

_SPARK_JS = """
(function(){function step(sp){var b=[].slice.call(sp.children);for(var i=0;i<b.length-1;i++)b[i].style.height=b[i+1].style.height;b[b.length-1].style.height=(2+Math.random()*7).toFixed(1)+'px';}
document.querySelectorAll('.spark.live').forEach(function(sp){setInterval(function(){step(sp);},600);});})();
"""


def _tile(t, last):
    num, glyph, title, ital, body, href = t
    return A(
        Span(cls="tile-hair"),
        Div(Span(num, cls="label"), Span(glyph, cls="tile-glyph"), cls="tile-top"),
        Div(title, " ", Span(ital, cls="display-i accent"), cls="tile-title"),
        P(body, cls="tile-body"),
        href=href, cls="tile" + (" last" if last else ""))


def _spark(seed):
    import math
    bars = [Span(style=f"height:{2 + (math.sin(i * 0.7 + seed) + 1) * 3:.1f}px") for i in range(16)]
    return Span(*bars, cls="spark live")


def _pill(label, value, latency, seed, on=True):
    children = [Span(cls="pulse-dot" if on else "pulse-dot muted"),
                Span(label, cls="status-pill-lbl"),
                Span(value, cls="status-pill-val" + ("" if on else " off"))]
    if latency is not None:
        children.append(Span(f"{latency}ms", cls="chrome tabular", style="font-size:.66rem"))
    children.append(_spark(seed))
    return Div(*children, cls="status-pill")


@rt("/overview")
async def overview():
    ready = await backend.get_json("/ready") or {}
    stats = await backend.get_json("/ingest/stats") or {}
    atlas_on = ready.get("atlas") == "configured"
    vertex_on = ready.get("vertex") == "configured"
    docs = stats.get("documents")
    chunks = stats.get("chunks")
    corpus = (f"{docs if docs is not None else 0} / 247 documents"
              + (f" · {chunks} chunks" if chunks else " · vault offline until ingest"))
    return (Title("Mnemos — overview"), shell(
        "overview",
        Div(Span(cls="drawline"), Span("── mnemos · overview · the four wedges"), cls="kicker label"),
        H1("What Mnemos is, ", Span("in four lines.", cls="display-i accent"), cls="ov-head"),
        P("Each tile below opens onto a working surface — the memory page is browseable, the reasoning "
          "stream is live, the critic is armed, the hybrid retrieval is real. Press a tile to enter the "
          "product where it actually does the thing.", cls="ov-sub"),
        Div(*[_tile(t, i == len(_TILES) - 1) for i, t in enumerate(_TILES)], cls="tiles"),
        Div(cls="hair"),
        Div(_pill("Atlas", "connected" if atlas_on else "offline", 12 if atlas_on else None, 1, atlas_on),
            _pill("Vertex", "connected" if vertex_on else "awaiting creds", 86 if vertex_on else None, 2, vertex_on),
            _pill("Agent", "live", 4, 3, True),
            cls="pills"),
        Div(Span("corpus: ", Span(corpus, cls="tabular"), cls="chrome"),
            Span("— signed, the agent.", cls="chrome"), cls="signoff"),
        Script(_SPARK_JS),
    ))


@rt("/ask")
def ask():
    return (Title("Mnemos — ask"), shell(
        "ask",
        P("03 · multi-step reasoning", cls="eyebrow"),
        H1("What should the agent ", Span("do for you?", cls="accent i")),
        Form(
            Input(name="q", cls="field", placeholder="what did I commit to Sarah last week?",
                  autocomplete="off", autofocus=True),
            hx_get="/ask/run", hx_target="#result", hx_swap="innerHTML",
            style="margin-top:18px",
        ),
        Div(id="result", style="margin-top:8px"),
    ))


@rt("/ask/run")
def ask_run(q: str = ""):
    q = (q or "").strip()
    if not q:
        return Div("type a question and hit enter.", cls="empty")
    return Div(
        P(Span("● ", cls="accent"), Span("streaming", cls="mono"), f" · {q}", cls="mono faint",
          style="font-size:.8rem; margin-bottom:6px"),
        Div(
            id="stream", cls="stream",
            hx_ext="sse", sse_connect=f"/ask/stream?q={quote(q)}",
            sse_swap="message", hx_swap="beforeend", sse_close="done",
        ),
    )


@rt("/ask/stream")
async def ask_stream(q: str = ""):
    async def gen():
        async for ev in backend.stream_events("/agent/ask", {"query": q}):
            frag = render_event(ev)
            if frag is not None:
                yield sse_message(frag)
            if ev.get("kind") in ("done", "error"):
                yield sse_message(Div(), event="done")
                break
    return EventStream(gen())


def render_event(ev: dict):
    kind = ev.get("kind")
    if kind == "thought":
        return Span(ev.get("chunk", ""), cls="tok-thought")
    if kind == "tool_call":
        args = ev.get("args", {}) or {}
        auto = " (auto)" if args.get("auto") else ""
        summary = ", ".join(f"{k}: {v}" for k, v in args.items() if k != "auto")[:140]
        return Div(P("→ " + ev.get("name", "") + auto, cls="head accent"),
                   P(summary, cls="sub"), cls="stream-block")
    if kind == "observation":
        res = ev.get("result", {}) or {}
        sub = res.get("summary") or (("error: " + res.get("error", "")) if not res.get("ok") else "ok")
        return Div(P("← " + ev.get("name", ""), cls="head faint"),
                   P(str(sub)[:160], cls="sub"), cls="stream-block")
    if kind == "answer":
        return Div(ev.get("chunk", ""), cls="answer")
    if kind == "error":
        return Div("error: " + ev.get("message", ""), cls="answer accent")
    if kind == "done":
        u = ev.get("usage", {}) or {}
        return Div(f"{ev.get('turns','?')} turns · {u.get('totalTokens','?')} tokens · "
                   f"${u.get('estimatedCostUsd','?')} · {ev.get('totalMs','?')}ms",
                   cls="sub faint mono", style="margin-top:18px")
    return None


@rt("/search")
def search():
    return (Title("Mnemos — search"), shell(
        "search",
        P("05 · hybrid retrieval", cls="eyebrow"),
        H1("Search the ", Span("memory.", cls="accent i")),
        Form(
            Input(name="q", cls="field", placeholder="inference SLO slip", autocomplete="off", autofocus=True),
            hx_get="/search/run", hx_target="#sresult", hx_swap="innerHTML",
            style="margin-top:18px",
        ),
        Div(P("vector + BM25 + reciprocal rank fusion", cls="label", style="margin-top:10px")),
        Div(id="sresult", style="margin-top:18px"),
    ))


@rt("/search/run")
async def search_run(q: str = ""):
    q = (q or "").strip()
    if not q:
        return Div("type a query.", cls="empty")
    data = await backend.post_json("/search", {"query": q, "limit": 10}) or {}
    results = data.get("results", [])
    if not results:
        return Div(f"no matches for “{q}”.", cls="empty")
    phases = " → ".join(data.get("phases", []))
    rows = [Div(
        Div(Span(r.get("source", ""), cls="pill"), " ", Span(r.get("title", ""), cls="t")),
        Div((r.get("text", "") or "")[:240], cls="x"),
        cls="result") for r in results]
    return Div(P(f"{phases} · {data.get('tookMs','?')}ms", cls="label", style="margin-bottom:8px"), *rows)


@rt("/commitments")
async def commitments():
    data = await backend.get_json("/commitments", {"limit": 50}) or {}
    items = data.get("commitments", []) if isinstance(data, dict) else []
    body = []
    for c in items:
        d = c.get("direction", "")
        body.append(Tr(
            Td(Span("● ", cls=("dir-out" if d == "outgoing" else "dir-in")), d, cls="mono"),
            Td(c.get("owedBy", ""), cls="mono faint"),
            Td(c.get("owedTo", ""), cls="mono faint"),
            Td(c.get("summary") or c.get("excerpt", "")),
            Td(c.get("dueDate") or "—", cls="mono faint"),
        ))
    table = (Table(Thead(Tr(Th("dir"), Th("from"), Th("to"), Th("commitment"), Th("due"))),
                   Tbody(*body), cls="ledger") if body
             else Div("ledger is empty — run the seed to build it.", cls="empty"))
    return (Title("Mnemos — commitments"), shell(
        "commitments",
        P("04 · the ledger", cls="eyebrow"),
        H1("What's ", Span("owed.", cls="accent i")),
        P(f"{len(items)} open commitments · source: {data.get('source','—')}", cls="label",
          style="margin:10px 0 20px"),
        table,
    ))


@rt("/memory")
async def memory():
    data = await backend.get_json("/graph") or {}
    ents = data.get("entities", {}) if isinstance(data, dict) else {}
    stats = data.get("stats", {}) if isinstance(data, dict) else {}

    def col(title, rows):
        items = [Div(Span(e.get("name", ""), cls="t"),
                     Span(f"  {e.get('mentions',0)}×", cls="faint mono", style="font-size:.78rem"),
                     Div(e.get("role") or "", cls="x") if e.get("role") else "",
                     cls="result") for e in rows[:18]]
        return Div(P(title, cls="label", style="margin-bottom:8px"),
                   *(items or [Div("—", cls="empty")]), cls="card")

    e = stats.get("entities", {})
    return (Title("Mnemos — memory"), shell(
        "memory",
        P("02 · the constellation", cls="eyebrow"),
        H1("The people & projects ", Span("in orbit.", cls="accent i")),
        P(f"{e.get('person','—')} people · {e.get('project','—')} projects · "
          f"{stats.get('relations','—')} relations", cls="label", style="margin:10px 0 22px"),
        Div(col("people", ents.get("person", [])),
            col("projects", ents.get("project", [])),
            col("topics", ents.get("topic", [])),
            cls="grid cols-3"),
    ))


@rt("/actions")
async def actions():
    data = await backend.get_json("/actions", {"limit": 25}) or {}
    items = data.get("actions", []) if isinstance(data, dict) else []
    cards = []
    for a in items:
        p = a.get("proposal", {}) or {}
        kind = a.get("kind")
        title = (p.get("subject") if kind == "draft_email" else p.get("title")) or "(untitled)"
        meta = f"{kind} · {a.get('status')}"
        if a.get("sentVia"):
            meta += f" · {a.get('sentVia')}"
        if a.get("bookedVia"):
            meta += f" · {a.get('bookedVia')}"
        cards.append(Div(
            P(meta, cls="label"),
            H3(title, style="margin:6px 0"),
            P((p.get("body") or p.get("agenda") or "")[:220], cls="muted"),
            cls="card", style="margin-bottom:14px"))
    return (Title("Mnemos — actions"), shell(
        "actions",
        P("06 · the ledger of intent", cls="eyebrow"),
        H1("What the agent ", Span("proposed.", cls="accent i")),
        P(f"{len(items)} actions", cls="label", style="margin:10px 0 20px"),
        *(cards or [Div("no actions yet.", cls="empty")]),
    ))


@rt("/debate")
def debate():
    return (Title("Mnemos — debate"), shell(
        "debate",
        P("· multi-agent debate", cls="eyebrow"),
        H1("Primary ", Span("vs.", cls="accent i"), " Devil's Advocate."),
        P("two agents reason over the same query in parallel, then a synthesizer commits to a call.",
          cls="muted", style="max-width:600px"),
        Form(
            Input(name="q", cls="field", placeholder="should I cut the saved-view feature for the launch?",
                  autocomplete="off", autofocus=True),
            hx_get="/debate/run", hx_target="#dresult", hx_swap="innerHTML", style="margin-top:18px",
        ),
        Div(id="dresult", style="margin-top:8px"),
    ))


@rt("/debate/run")
def debate_run(q: str = ""):
    q = (q or "").strip()
    if not q:
        return Div("type a question.", cls="empty")
    return Div(
        P(Span("● ", cls="accent"), Span("two agents thinking", cls="mono"), cls="mono faint",
          style="font-size:.8rem; margin-bottom:6px"),
        Div(id="stream", cls="stream", hx_ext="sse", sse_connect=f"/debate/stream?q={quote(q)}",
            sse_swap="message", hx_swap="beforeend", sse_close="done"),
    )


@rt("/debate/stream")
async def debate_stream(q: str = ""):
    async def gen():
        async for ev in backend.stream_events("/debate", {"query": q}):
            frag = render_debate_event(ev)
            if frag is not None:
                yield sse_message(frag)
            if ev.get("kind") in ("debate_done", "synthesis_error"):
                yield sse_message(Div(), event="done")
                break
    return EventStream(gen())


def render_debate_event(ev: dict):
    kind = ev.get("kind")
    agent = ev.get("agent")
    if kind == "synthesis":
        return Div(P("⚖ synthesis", cls="head accent"), Div(ev.get("text", ""), cls="answer"),
                   cls="stream-block")
    if agent and kind == "answer":
        tag = "primary" if agent == "primary" else "devil's advocate"
        return Div(P(f"[{tag}]", cls="head " + ("accent" if agent == "primary" else "saffron")),
                   Div(ev.get("chunk", ""), cls="answer", style="font-size:1.1rem"), cls="stream-block")
    if agent and kind == "tool_call":
        return Div(P(f"[{agent}] → {ev.get('name','')}", cls="sub"), cls="stream-block",
                   style="border:none; padding:2px 0; margin:2px 0")
    return None


@rt("/briefings")
async def briefings():
    data = await backend.get_json("/briefings") or {}
    items = data.get("briefings", []) if isinstance(data, dict) else []
    cards = [Div(P(b.get("eventTitle", ""), cls="t"),
                 P((b.get("markdown", "") or "")[:220], cls="x"), cls="result") for b in items]
    return (Title("Mnemos — briefings"), shell(
        "briefings",
        P("· the 1-pager", cls="eyebrow"),
        H1("Walk in ", Span("prepared.", cls="accent i")),
        P("name a calendar event; the agent assembles attendees, open threads, and commitments.",
          cls="muted", style="max-width:580px"),
        Form(Input(name="t", cls="field", placeholder="Q3 Planning with Eng Leads", autocomplete="off"),
             hx_get="/briefings/run", hx_target="#bresult", hx_swap="innerHTML", style="margin-top:18px"),
        Div(id="bresult", style="margin-top:8px"),
        P("recent briefings", cls="label", style="margin:30px 0 10px"),
        *(cards or [Div("none generated yet.", cls="empty")]),
    ))


@rt("/briefings/run")
def briefings_run(t: str = ""):
    t = (t or "").strip()
    if not t:
        return Div("type an event title.", cls="empty")
    return Div(
        P(Span("● ", cls="accent"), Span("assembling briefing", cls="mono"), cls="mono faint",
          style="font-size:.8rem; margin-bottom:6px"),
        Div(id="stream", cls="stream", hx_ext="sse", sse_connect=f"/briefings/stream?t={quote(t)}",
            sse_swap="message", hx_swap="beforeend", sse_close="done"),
    )


@rt("/briefings/stream")
async def briefings_stream(t: str = ""):
    async def gen():
        async for ev in backend.stream_events("/briefings/generate", {"event_title": t}):
            k = ev.get("kind")
            if k == "context_loaded":
                yield sse_message(Div(f"context · {ev.get('relatedCount','?')} related · "
                                      f"{ev.get('commitmentCount','?')} commitment leads", cls="sub faint"))
            elif k == "synthesizing":
                yield sse_message(Div("drafting…", cls="sub faint"))
            elif k == "chunk":
                yield sse_message(Span(ev.get("text", ""), cls="answer", style="display:inline; border:none; padding:0"))
            elif k == "error":
                yield sse_message(Div("error: " + ev.get("message", ""), cls="head accent"))
                yield sse_message(Div(), event="done")
                break
            elif k == "done":
                yield sse_message(Div(), event="done")
                break
    return EventStream(gen())


@rt("/ingest")
async def ingest():
    stats = await backend.get_json("/ingest/stats") or {}
    sources = stats.get("sources", []) if isinstance(stats, dict) else []
    rows = [Tr(Td(s.get("source", ""), cls="mono"), Td(str(s.get("count", "")), cls="mono faint"))
            for s in sources]

    def kpi(n, label):
        return Div(Div(str(n), cls="kpi"), Div(label, cls="label", style="margin-top:8px"), cls="card")

    return (Title("Mnemos — ingest"), shell(
        "ingest",
        P("· the corpus", cls="eyebrow"),
        H1("Memory ", Span("intake.", cls="accent i")),
        Div(kpi(stats.get("documents", "—"), "documents"),
            kpi(stats.get("chunks", "—"), "chunks"), cls="grid cols-2", style="margin-top:24px"),
        Div(P("by source", cls="label", style="margin-bottom:10px"),
            (Table(Tbody(*rows), cls="ledger") if rows else Div("no corpus yet — run the seed.", cls="empty")),
            cls="card", style="margin-top:18px"),
        P("read-only. to (re)load the demo corpus, run  npm run seed -- --load", cls="faint mono",
          style="font-size:.78rem; margin-top:16px"),
    ))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5001)
