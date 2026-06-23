"""The Mnemos editorial-dark aesthetic.

Ported faithfully from the design handoff (`Mnemos-III.html` <style> = token source of truth)
plus per-surface classes for the six canon surfaces. Square corners, hairline rules, one curve,
two accents (vermilion = live/proposed, saffron = the Critic). No box-shadows for elevation.
"""

CSS = """
:root{
  --ink-0:#050402; --ink-1:#0e0a05; --ink-2:#14100a; --ink-3:#1b1610; --ink-4:#221c14;
  --rule:#2a2218; --rule-strong:#3a3024; --rule-soft:#1f1a13;
  --paper:#f3ecdf; --paper-dim:#d8d2c5; --paper-muted:#9c9486; --paper-faint:#6c645a; --paper-ghost:#4a443c;
  --vermilion:#f25738; --vermilion-deep:#b73826; --vermilion-haze:rgba(242,87,56,0.06); --saffron:#e8c547;
  --ease:cubic-bezier(.2,.7,.2,1); --snap:220ms; --reveal:320ms; --slow:620ms;
}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:0ms!important;transition-duration:0ms!important}}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
button{background:transparent;border:0;color:inherit;font:inherit;cursor:pointer;padding:0}
a{color:inherit;text-decoration:none}
hr{border:0;height:1px;background:var(--rule);margin:0}
input,textarea{font-family:inherit;color:inherit;background:transparent;border:0;outline:0}
body{
  background:var(--ink-0); color:var(--paper);
  font-family:'IBM Plex Sans',system-ui,sans-serif; font-weight:400; font-size:15px; line-height:24px;
  letter-spacing:-0.003em; -webkit-font-smoothing:antialiased; text-rendering:geometricPrecision;
  min-height:100vh; overflow-x:hidden;
}
body::before{content:'';position:fixed;inset:0;z-index:1;pointer-events:none;
  background:radial-gradient(ellipse 1200px 480px at 50% -10%, var(--vermilion-haze), transparent 70%),
             radial-gradient(ellipse 80% 60% at 50% 100%, rgba(20,16,10,0.6), transparent 70%);}
body::after{content:'';position:fixed;inset:0;z-index:1;pointer-events:none;
  background:repeating-linear-gradient(0deg,rgba(243,236,223,0.012) 0 1px,transparent 1px 3px);}
::selection{background:var(--vermilion);color:var(--ink-0)}

/* ── type utilities ── */
.serif,h1,h2,h3{font-family:'Instrument Serif',Georgia,serif;font-weight:400;letter-spacing:-0.01em}
.italic,.i{font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-weight:400;letter-spacing:-0.005em}
.mono{font-family:'IBM Plex Mono',ui-monospace,monospace}
.num,.tabular{font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1}
.accent{color:var(--vermilion)} .saffron{color:var(--saffron)}
.paper{color:var(--paper)} .dim,.muted{color:var(--paper-dim)} .faint{color:var(--paper-faint)} .ghost{color:var(--paper-ghost)}
.label{font-family:'IBM Plex Mono',monospace;font-weight:500;text-transform:uppercase;letter-spacing:0.16em;color:var(--paper-faint);font-size:10px;line-height:16px}
.chrome{font-family:'IBM Plex Mono',monospace;font-size:11px;line-height:16px;color:var(--paper-muted);letter-spacing:0.01em;font-variant-numeric:tabular-nums}
.hr-soft{height:1px;background:var(--rule-soft);border:0;margin:0}
.glyph-mk{font-family:'Instrument Serif',serif;font-style:italic;font-size:24px;color:var(--paper-faint);line-height:1}

/* ── motion primitives ── */
@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
.caret::after{content:'';display:inline-block;width:1px;height:1.05em;background:var(--vermilion);margin-left:3px;vertical-align:-0.16em;animation:blink 1.1s steps(1,start) infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(242,87,56,0.55)}70%{box-shadow:0 0 0 6px rgba(242,87,56,0)}100%{box-shadow:0 0 0 0 rgba(242,87,56,0)}}
.pulse-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--vermilion);animation:pulse 1.8s var(--ease) infinite}
.pulse-dot.saffron{background:var(--saffron);animation:none}
.pulse-dot.muted{background:var(--paper-faint);animation:none}
@keyframes rise-left{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
@keyframes rise-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes rise-fade{from{opacity:0}to{opacity:1}}
.anim-rise-left{animation:rise-left var(--reveal) var(--ease) both}
.anim-rise-up{animation:rise-up var(--reveal) var(--ease) both}
.anim-rise-fade{animation:rise-fade var(--reveal) var(--ease) both}
:where(button,a,[tabindex],input):focus-visible{outline:1px solid var(--vermilion);outline-offset:2px}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track{background:var(--ink-0)}
::-webkit-scrollbar-thumb{background:var(--rule);border:3px solid var(--ink-0)}
::-webkit-scrollbar-thumb:hover{background:var(--rule-strong)}

/* ── kicker ── */
.kicker{display:flex;align-items:center;gap:10px}
.kicker .rule{width:32px;height:1px;background:var(--vermilion);display:inline-block}
.kicker .num{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--paper-faint)}
.kicker.saffron .rule{background:var(--saffron)}

/* ── nav rail (left, 200px) ── */
.nav-rail{position:fixed;left:0;top:0;bottom:0;width:200px;border-right:1px solid var(--rule);background:rgba(14,10,5,0.78);backdrop-filter:blur(8px);z-index:30;display:flex;flex-direction:column;padding:24px 0}
.nav-rail .mark{padding:0 22px;display:flex;flex-direction:column;align-items:flex-start;gap:3px;margin-bottom:32px}
.nav-rail .mark .name{font-family:'Instrument Serif',serif;font-style:italic;font-size:27px;line-height:1;color:var(--paper);letter-spacing:-0.01em}
.nav-rail .mark .ver{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--paper-faint);letter-spacing:0.14em}
.nav-item{display:grid;grid-template-columns:24px 1fr auto;align-items:baseline;gap:10px;padding:9px 22px;text-align:left;border-left:2px solid transparent;transition:all var(--snap) var(--ease)}
.nav-item:hover{background:rgba(255,255,255,0.02)}
.nav-item.active{border-left-color:var(--vermilion);background:var(--ink-2)}
.nav-item .n{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--paper-faint);letter-spacing:0.12em}
.nav-item .l{font-family:'Instrument Serif',serif;font-style:italic;font-size:18px;letter-spacing:-0.005em;color:var(--paper-dim)}
.nav-item.active .l{color:var(--paper)}
.nav-item .k{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--paper-faint)}
.nav-rail .foot{margin-top:auto;padding:0 22px}
.nav-rail .foot .v{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--paper-faint);line-height:18px}
.nav-extra{display:flex;flex-direction:column;margin-top:14px;padding-top:10px;border-top:1px solid var(--rule-soft)}
.nav-extra a{padding:6px 22px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.04em;color:var(--paper-faint);transition:color var(--snap) var(--ease)}
.nav-extra a:hover,.nav-extra a.active{color:var(--vermilion)}

/* ── top status bar ── */
.topbar{position:fixed;top:0;left:200px;right:0;height:48px;z-index:25;display:flex;align-items:center;gap:18px;padding:0 24px;border-bottom:1px solid var(--rule);background:rgba(14,10,5,0.84);backdrop-filter:blur(8px)}
.topbar .crumb{display:flex;align-items:baseline;gap:12px}
.topbar .crumb .path{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--paper-muted)}
.topbar .crumb .here{font-family:'Instrument Serif',serif;font-style:italic;font-size:18px;color:var(--paper);letter-spacing:-0.005em}
.topbar .spacer{flex:1}
.topbar .pill{display:flex;align-items:center;gap:8px;padding:5px 10px;border:1px solid var(--rule);font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--paper-muted);letter-spacing:0.04em}
.topbar .pill .v{color:var(--paper)}
.topbar .pill .v.off{color:var(--paper-faint)}
.topbar .ask-btn{display:flex;align-items:center;gap:10px;padding:6px 12px;border:1px solid var(--rule);font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--paper-dim);transition:all var(--snap) var(--ease)}
.topbar .ask-btn:hover{border-color:var(--vermilion);color:var(--paper)}
.topbar .ask-btn .q{font-family:'Instrument Serif',serif;font-style:italic;color:var(--vermilion);font-size:14px;line-height:1}
.topbar .ask-btn .k{color:var(--paper-faint)}
@media(max-width:880px){.topbar .pill{display:none}}

/* ── page shell ── */
.page{margin-left:200px;padding-top:48px;min-height:100vh;position:relative}
.surface{padding:32px 56px 80px}
@media(max-width:900px){.nav-rail{display:none}.topbar{left:0}.page{margin-left:0}.surface{padding:28px 24px 64px}}
.surface-head{margin-bottom:30px}
.surface-h1{font-family:'Instrument Serif',serif;font-size:clamp(28px,3.4vw,44px);line-height:1.02;letter-spacing:-0.015em;color:var(--paper);margin:18px 0 0}

/* ── decisive buttons ── */
.btn-d{font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.16em;padding:9px 16px;border:1px solid var(--rule-strong);color:var(--paper-dim);transition:all var(--snap) var(--ease);display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
.btn-d:hover{color:var(--ink-0);background:var(--paper);border-color:var(--paper)}
.btn-d.primary{border-color:var(--vermilion);color:var(--paper)}
.btn-d.primary:hover{background:var(--vermilion);color:var(--ink-0)}
.btn-d.ghost:hover{color:var(--vermilion);background:transparent;border-color:var(--vermilion)}
.btn-d.saffron{border-color:var(--saffron);color:var(--paper)}
.btn-d.saffron:hover{background:var(--saffron);color:var(--ink-0)}
.btn-d:disabled{opacity:.4;cursor:not-allowed;border-color:var(--rule);color:var(--paper-faint)}
.btn-d:disabled:hover{background:transparent;color:var(--paper-faint);border-color:var(--rule)}

/* ── tag / kbd / spark ── */
.tag{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;padding:1px 6px;border:1px solid var(--rule);color:var(--paper-faint);display:inline-block}
.tag.v{color:var(--vermilion);border-color:var(--vermilion)}
.tag.s{color:var(--saffron);border-color:var(--saffron)}
.kbd{font-family:'IBM Plex Mono',monospace;font-size:10px;padding:1px 5px;border:1px solid var(--rule);background:var(--ink-2);color:var(--paper-faint);letter-spacing:0.04em}
.spark{display:inline-flex;align-items:flex-end;gap:1px;height:10px;vertical-align:-1px}
.spark span{width:2px;background:var(--paper-muted);transition:height var(--reveal) var(--ease)}
.spark.v span{background:var(--vermilion)} .spark.s span{background:var(--saffron)}

/* ── citation chip ── */
.cite-wrap{position:relative;display:inline-block}
.cite{display:inline-flex;align-items:baseline;gap:6px;padding:2px 8px 3px;border:1px solid var(--rule);background:var(--ink-2);transition:border-color var(--snap) var(--ease),background-color var(--snap) var(--ease);line-height:1}
.cite:hover{border-color:var(--vermilion);background:var(--ink-3)}
.cite .sup{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--vermilion);vertical-align:super}
.cite .ttl{font-family:'Instrument Serif',serif;font-style:italic;font-size:14px;color:var(--paper-dim)}
.cite .src{font-family:'IBM Plex Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:var(--paper-faint);padding:1px 4px;border:1px solid var(--rule);margin-left:4px}
.cite-tip{position:absolute;bottom:calc(100% + 8px);left:0;z-index:30;width:340px;padding:12px 14px;background:var(--ink-1);border:1px solid var(--rule-strong);opacity:0;visibility:hidden;transition:opacity var(--snap) var(--ease)}
.cite-wrap:hover .cite-tip{opacity:1;visibility:visible}
.cite-tip .ttl{font-family:'Instrument Serif',serif;font-style:italic;font-size:16px;color:var(--paper);margin-bottom:6px}
.cite-tip .ex{font-size:13px;color:var(--paper-dim);line-height:1.55}

/* ── ⌘K command palette ── */
.cmdk-back{display:none;position:fixed;inset:0;background:rgba(5,4,2,0.84);backdrop-filter:blur(3px);z-index:80;align-items:flex-start;justify-content:center;padding-top:88px}
.cmdk-back.open{display:flex;animation:rise-fade 200ms var(--ease) both}
.cmdk{width:680px;max-width:92vw;background:var(--ink-1);border:1px solid var(--rule-strong);animation:rise-up var(--reveal) var(--ease) both}
.cmdk .in-row{display:flex;align-items:center;padding:18px 22px;border-bottom:1px solid var(--rule);gap:14px}
.cmdk .in-row .q{font-family:'Instrument Serif',serif;font-style:italic;color:var(--vermilion);font-size:32px;line-height:1}
.cmdk input{flex:1;font-family:'Instrument Serif',serif;font-style:italic;font-size:22px;color:var(--paper)}
.cmdk input::placeholder{color:var(--paper-faint)}
.cmdk-list{padding:6px 0;max-height:380px;overflow:auto}
.cmdk-item{display:grid;grid-template-columns:36px 1fr auto;gap:14px;padding:11px 22px;width:100%;text-align:left;border-left:2px solid transparent;transition:all 160ms var(--ease);align-items:center}
.cmdk-item .glyph{font-family:'IBM Plex Mono',monospace;font-size:14px;color:var(--paper-faint);text-align:center}
.cmdk-item .ttl{font-family:'Instrument Serif',serif;font-style:italic;font-size:16px;color:var(--paper);display:block}
.cmdk-item .sub{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--paper-muted)}
.cmdk-item.sel{border-left-color:var(--vermilion);background:var(--ink-2)}
.cmdk-item.sel .glyph{color:var(--vermilion)}
.cmdk-foot{border-top:1px solid var(--rule);padding:14px 22px}
.cmdk-chips{display:flex;flex-wrap:wrap;gap:6px}
.cmdk-chip{padding:4px 10px;border:1px solid var(--rule);font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--paper-muted);transition:all var(--snap) var(--ease)}
.cmdk-chip:hover{border-color:var(--vermilion);color:var(--paper)}
.cmdk-bar{display:flex;justify-content:space-between;padding:10px 22px;border-top:1px solid var(--rule)}

/* ── hero ── */
.hero{position:relative;overflow:hidden;min-height:calc(100vh - 48px)}
.hero canvas{position:absolute;inset:0;width:100%;height:100%;z-index:0;cursor:crosshair}
.hero-fade{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(180deg,transparent 0,transparent 50%,rgba(5,4,2,.65) 88%,rgba(5,4,2,.95) 100%)}
.hero-inner{position:relative;z-index:2;padding:64px 56px 40px;pointer-events:none}
.hero-inner a,.hero-inner button,.hero-grid .panel{pointer-events:auto}
.hero-grid{display:grid;grid-template-columns:minmax(0,1.1fr) 360px;gap:56px;align-items:start;margin-top:30px}
@media(max-width:980px){.hero-grid{grid-template-columns:1fr}}
.hero-h1{font-family:'Instrument Serif',serif;font-size:clamp(46px,7vw,88px);line-height:0.98;letter-spacing:-0.022em;color:var(--paper);margin:0;text-wrap:balance}
.hero-sub{max-width:520px;font-size:16px;color:var(--paper-dim);line-height:1.65;margin-top:26px}
.hero-cta{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:32px}
.panel{border:1px solid var(--rule);background:rgba(14,10,5,0.78);backdrop-filter:blur(8px);padding:16px 18px}
.panel-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.mini-stream{font-family:'IBM Plex Mono',monospace;font-size:12px;line-height:1.7;min-height:96px}
.mini-line{display:block;transition:opacity var(--reveal) var(--ease)}
.mini-line.think{color:var(--paper-muted);font-style:italic}
.mini-line.tool{color:var(--vermilion)}
.mini-line.obs{color:var(--paper-faint)}
.mini-line.ans{color:var(--paper)}

/* ── 4-tile footer ── */
.tiles{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--rule);margin-top:56px;position:relative;z-index:2}
@media(max-width:900px){.tiles{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.tiles{grid-template-columns:1fr}}
.tile{position:relative;display:block;padding:34px 28px 30px;border-right:1px solid var(--rule);transition:background var(--reveal) var(--ease)}
.tile.last{border-right:none}
.tile:hover{background:var(--ink-1)}
.tile-top{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:30px}
.tile-glyph{font-family:'Instrument Serif',serif;font-style:italic;font-size:34px;color:var(--ink-4);line-height:1}
.tile-title{font-family:'Instrument Serif',serif;font-size:30px;line-height:1;letter-spacing:-0.015em;color:var(--paper)}
.tile-body{font-size:13px;color:var(--paper-muted);line-height:1.6;max-width:34ch;margin-top:14px}

/* ── ingest run ── */
.counters{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--rule);border:1px solid var(--rule);margin-top:8px}
.counter{background:var(--ink-1);padding:24px 26px}
.counter .big{font-family:'IBM Plex Mono',monospace;font-size:38px;line-height:1;color:var(--paper);font-variant-numeric:tabular-nums lining-nums}
.counter .big .goal{color:var(--paper-faint);font-size:22px}
.counter .cap{margin-top:12px}
.counter.atlas .big{color:var(--vermilion)}
.progress{height:2px;background:var(--ink-3);margin:26px 0 8px;overflow:hidden}
.progress .fill{height:100%;background:var(--vermilion);width:0;transition:width var(--slow) var(--ease)}
.phases{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--rule);border:1px solid var(--rule);margin-top:26px}
.phase-cell{background:var(--ink-1);padding:16px 18px;transition:all var(--snap) var(--ease)}
.phase-cell .pn{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--paper-faint);letter-spacing:.14em;text-transform:uppercase}
.phase-cell .pl{font-family:'Instrument Serif',serif;font-style:italic;font-size:18px;color:var(--paper-dim);margin-top:8px}
.phase-cell.hot{background:var(--ink-2);border-left:2px solid var(--vermilion)}
.phase-cell.hot .pl{color:var(--paper)}
.phase-cell.done .pn::after{content:' ✓';color:var(--saffron)}
.src-table{width:100%;border-collapse:collapse}
.src-table td{padding:11px 8px;border-bottom:1px solid var(--rule);vertical-align:middle}
.src-table .nm{font-family:'Instrument Serif',serif;font-style:italic;font-size:16px;color:var(--paper)}
.src-table .ct{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--paper-dim);text-align:right;font-variant-numeric:tabular-nums}

/* ── ask: prompt header ── */
.prompt-head{border-bottom:1px solid var(--rule);padding-bottom:22px;margin-bottom:6px}
.prompt-q{font-family:'Instrument Serif',serif;font-style:italic;font-size:33px;line-height:1.08;color:var(--paper);margin:10px 0 0}
.prompt-meta{display:flex;flex-wrap:wrap;align-items:center;gap:16px;margin-top:16px}
.field{width:100%;border-bottom:1px solid var(--rule-strong);font-family:'Instrument Serif',serif;font-style:italic;font-size:30px;color:var(--paper);padding:8px 0}
.field:focus{border-color:var(--vermilion)}
.field::placeholder{color:var(--paper-faint)}

/* ── reasoning stream ── */
.stream{position:relative;margin-top:24px;padding-left:30px}
.stream::before{content:'';position:absolute;left:4px;top:4px;bottom:4px;width:1px;background:linear-gradient(180deg,var(--vermilion),var(--rule) 30%,var(--rule))}
.node{position:relative;padding:10px 0 14px}
.node .dot{position:absolute;left:-30px;top:14px;width:9px;height:9px;background:var(--ink-1);border:1px solid var(--rule-strong)}
.node .ts{position:absolute;left:-30px;top:28px;font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--paper-faint);transform:translateX(-100%);padding-right:10px}
.node .kind{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase}
.node.thought .dot{border-color:var(--vermilion)} .node.thought .kind{color:var(--vermilion)}
.node.tool .dot{background:var(--saffron);border-color:var(--saffron)} .node.tool .kind{color:var(--saffron)}
.node.obs .kind{color:var(--paper-muted)}
.node.answer .dot{background:var(--paper);border-color:var(--paper)} .node.answer .kind{color:var(--paper)}
.node .thought-txt{font-family:'Instrument Serif',serif;font-style:italic;font-size:17px;color:var(--paper-dim);margin-top:6px;line-height:1.45}
.node .tool-txt{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--paper-dim);margin-top:6px}
.node .obs-txt{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--paper-faint);margin-top:6px}
.answer-body{font-family:'Instrument Serif',serif;font-size:20px;line-height:1.5;color:var(--paper);margin-top:8px;border-left:2px solid var(--vermilion);padding-left:18px;white-space:pre-wrap}
.cites{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;padding-left:18px}

/* ── approval + critic cards ── */
.ac-grid{display:grid;grid-template-columns:1fr 1px 400px;gap:0;margin-top:30px;border:1px solid var(--rule)}
@media(max-width:1040px){.ac-grid{grid-template-columns:1fr}}
.ac-grid .vrule{background:var(--rule)}
.draft{position:relative;padding:26px 28px;border-left:2px solid var(--vermilion)}
.draft::before{content:'';position:absolute;left:0;right:0;top:0;height:2px;background:var(--vermilion);max-width:56px}
.draft .meta{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--paper-muted);line-height:1.9}
.draft .meta b{color:var(--paper-faint);font-weight:500}
.draft .subj{font-family:'Instrument Serif',serif;font-style:italic;font-size:24px;color:var(--paper);margin:14px 0 12px}
.draft .body{font-size:15px;color:var(--paper-dim);line-height:1.7;white-space:pre-wrap}
.field-edit{width:100%;min-height:170px;background:var(--ink-2);border:1px solid var(--rule-strong);color:var(--paper-dim);font-family:'IBM Plex Sans',system-ui,sans-serif;font-size:15px;line-height:1.7;padding:12px 14px;resize:vertical;outline:none}
.field-edit:focus{border-color:var(--saffron)}
.field-edit-line{width:100%;background:var(--ink-2);border:1px solid var(--rule-strong);color:var(--paper);font-family:'IBM Plex Mono',monospace;font-size:13px;padding:8px 10px;outline:none}
.field-edit-line:focus{border-color:var(--saffron)}
.decide-done{font-family:'IBM Plex Mono',monospace;font-size:12px;padding:10px 0;margin-top:24px;border-top:1px solid var(--rule)}
.mark{text-decoration:underline wavy var(--saffron);text-underline-offset:3px;cursor:help}
.mark sup{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--saffron)}
.decide{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:24px;padding-top:20px;border-top:1px solid var(--rule)}
.decide .warn{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--vermilion)}
.critic{padding:26px 24px;border-left:2px solid var(--saffron);background:var(--ink-1)}
.critic.blocking{border-left-color:var(--vermilion)}
.critic .verdict{font-family:'Instrument Serif',serif;font-style:italic;font-size:20px;color:var(--paper);margin-bottom:4px}
.note{padding:14px 0;border-top:1px solid var(--rule)}
.note .sev{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;padding:1px 6px;border:1px solid var(--rule)}
.note .sev.blocking{color:var(--vermilion);border-color:var(--vermilion)}
.note .sev.caution{color:var(--saffron);border-color:var(--saffron)}
.note .sev.minor{color:var(--paper-muted)}
.note .sev.fact{color:var(--paper-dim)}
.note .anchor{font-family:'Instrument Serif',serif;font-style:italic;font-size:15px;color:var(--paper);margin:8px 0 4px}
.note .text{font-size:13px;color:var(--paper-dim);line-height:1.55}
.note .cite-link{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--saffron);margin-top:6px;display:inline-block}
.critic-foot{margin-top:18px;padding-top:14px;border-top:1px solid var(--rule);font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--paper-faint)}

/* ── approve: queue navigator ── */
.qnav{display:flex;align-items:center;gap:14px;margin-top:8px}
.qdots{display:flex;gap:7px}
.qdot{width:8px;height:8px;border:1px solid var(--rule-strong);background:transparent}
.qdot.active{background:var(--vermilion);border-color:var(--vermilion)}
.qdot.blocking{border-color:var(--vermilion)}

/* ── memory constellation ── */
.mem-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:0;border:1px solid var(--rule);margin-top:8px}
@media(max-width:1100px){.mem-grid{grid-template-columns:1fr}}
.mem-chart{position:relative;min-width:0;padding:8px}
.mem-chart svg{display:block;width:100%;height:auto}
.star{cursor:crosshair}
.star-hit{fill:transparent;cursor:crosshair}
.mem-legend{position:absolute;top:18px;right:18px;background:rgba(14,10,5,0.82);border:1px solid var(--rule);padding:10px 12px;backdrop-filter:blur(4px)}
.mem-legend .row{display:flex;align-items:center;gap:8px;padding:3px 0;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--paper-muted)}
.mem-legend .swatch{width:10px;height:1px;display:inline-block}
.mem-rail{border-left:1px solid var(--rule);padding:22px 22px;min-height:420px}
.mem-rail .nm{font-family:'Instrument Serif',serif;font-style:italic;font-size:24px;color:var(--paper)}
.mem-rail .kv{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--rule-soft);font-family:'IBM Plex Mono',monospace;font-size:11px}
.mem-rail .kv .k{color:var(--paper-faint)} .mem-rail .kv .v{color:var(--paper-dim)}

/* ── search pipeline ── */
.pipe{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:var(--rule);border:1px solid var(--rule);margin-top:8px}
.pipe-cell{background:var(--ink-1);padding:14px 14px;text-align:left;transition:all var(--snap) var(--ease)}
.pipe-cell .pn{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--paper-faint);letter-spacing:.12em;text-transform:uppercase}
.pipe-cell .pl{font-family:'Instrument Serif',serif;font-style:italic;font-size:16px;color:var(--paper-dim);margin-top:6px}
.pipe-cell .ps{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--paper-faint);margin-top:4px}
.pipe-cell.active{background:var(--ink-2);box-shadow:inset 0 -2px 0 var(--vermilion)}
.pipe-cell.active .pl{color:var(--paper)}
.pipe-cell.past .pn::after{content:' ✓';color:var(--saffron)}
.search-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:0;margin-top:26px;border:1px solid var(--rule)}
@media(max-width:1040px){.search-grid{grid-template-columns:1fr}}
.hits{min-width:0}
.hit{display:grid;grid-template-columns:34px 1fr 200px;gap:18px;padding:18px 22px;border-bottom:1px solid var(--rule)}
.hit .rank{font-family:'IBM Plex Mono',monospace;font-size:22px;color:var(--paper-faint);font-variant-numeric:tabular-nums}
.hit .ttl{font-family:'Instrument Serif',serif;font-style:italic;font-size:18px;color:var(--paper)}
.hit .ex{font-size:13px;color:var(--paper-dim);line-height:1.55;margin-top:6px}
.scorebox{display:flex;flex-direction:column;gap:7px}
.scorebar{display:grid;grid-template-columns:46px 1fr 42px;gap:8px;align-items:center}
.scorebar .sl{font-family:'IBM Plex Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--paper-faint)}
.scorebar .track{height:3px;background:var(--ink-3);position:relative;overflow:hidden}
.scorebar .bar{position:absolute;left:0;top:0;bottom:0;width:0;transition:width 420ms var(--ease)}
.scorebar .bar.vector{background:var(--vermilion)} .scorebar .bar.bm25{background:var(--saffron)}
.scorebar .bar.rrf{background:var(--paper-muted)} .scorebar .bar.rerank{background:var(--paper)}
.scorebar .sv{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--paper-dim);text-align:right;font-variant-numeric:tabular-nums}
.inspector{border-left:1px solid var(--rule);padding:22px 22px;min-width:0}
.inspector .ph-title{font-family:'Instrument Serif',serif;font-style:italic;font-size:20px;color:var(--paper)}
.inspector .blk{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--paper-dim);line-height:1.7;word-break:break-word}
.inspector .formula{border:1px solid var(--rule);padding:10px 12px;margin-top:12px;color:var(--paper);background:var(--ink-2)}

/* ── generic editorial bits (extras) ── */
.card{border:1px solid var(--rule);padding:22px 24px;background:var(--ink-1)}
.grid{display:grid;gap:16px}.grid.cols-2{grid-template-columns:1fr 1fr}.grid.cols-3{grid-template-columns:repeat(3,1fr)}
@media(max-width:760px){.grid.cols-2,.grid.cols-3{grid-template-columns:1fr}}
.ledger{width:100%;border-collapse:collapse;font-size:14px}
.ledger th{text-align:left;color:var(--paper-faint);font-size:10px;letter-spacing:.16em;text-transform:uppercase;font-family:'IBM Plex Mono',monospace;padding:8px 12px;border-bottom:1px solid var(--rule)}
.ledger td{padding:11px 12px;border-bottom:1px solid var(--rule);vertical-align:top}
.dir-out{color:var(--vermilion)} .dir-in{color:var(--saffron)}
.result{padding:14px 0;border-bottom:1px solid var(--rule)}
.result .t{font-family:'Instrument Serif',serif;font-style:italic;font-size:18px;color:var(--paper)}
.result .x{color:var(--paper-dim);font-size:14px;margin-top:4px}
.empty{color:var(--paper-faint);font-style:italic;padding:24px 0}
.pill-inline{display:inline-block;background:rgba(242,87,56,.14);color:var(--vermilion);padding:1px 8px;font-family:'IBM Plex Mono',monospace;font-size:11px;margin:0 2px}
.answer{font-family:'Instrument Serif',serif;font-size:20px;line-height:1.5;color:var(--paper);margin-top:12px;white-space:pre-wrap}
.stream-block{margin:12px 0;padding:10px 0;border-top:1px solid var(--rule)}
.stream-block .head{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.1em}
.stream-block .sub{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--paper-dim);margin-top:4px}

/* ── variant strip (top of each surface) ── */
.variant-strip{display:flex;align-items:center;border-bottom:1px solid var(--rule);background:var(--ink-1)}
.variant-strip .label-cell{padding:10px 20px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--paper-faint);border-right:1px solid var(--rule)}
.variant-strip .vbtn{padding:10px 18px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--paper-muted);border-right:1px solid var(--rule);display:flex;align-items:baseline;gap:8px;transition:all var(--snap) var(--ease);white-space:nowrap}
.variant-strip .vbtn:hover{color:var(--paper);background:var(--ink-2)}
.variant-strip .vbtn.active{color:var(--paper);background:var(--ink-2);box-shadow:inset 0 -1px 0 var(--vermilion)}
.variant-strip .vbtn .v-num{color:var(--paper-faint);font-size:9px}
.variant-strip .vbtn.active .v-num{color:var(--vermilion)}
.variant-strip .meta{margin-left:auto;padding:0 20px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--paper-faint);white-space:nowrap}
@media(max-width:760px){.variant-strip .meta{display:none}}

/* ── hero · typographic ── */
.hero-typo{padding:80px 56px 56px;max-width:1120px}
.hero-typo h1{font-family:'Instrument Serif',serif;font-size:clamp(48px,8.4vw,100px);line-height:0.96;letter-spacing:-0.025em;color:var(--paper);margin:18px 0 0;text-wrap:balance}
/* ── hero · live trace ── */
.trace-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:48px;margin-top:30px}
@media(max-width:980px){.trace-grid{grid-template-columns:1fr}}
.typed{font-family:'Instrument Serif',serif;font-style:italic;font-size:clamp(34px,5vw,60px);line-height:1.02;letter-spacing:-0.02em;color:var(--paper);min-height:1.1em}
.stat-block{border:1px solid var(--rule);background:var(--ink-1)}
.stat-row{display:flex;justify-content:space-between;align-items:baseline;padding:12px 16px;border-bottom:1px solid var(--rule-soft);white-space:nowrap;gap:14px}
.stat-row:last-child{border-bottom:none}
.stat-row .k{font-family:'IBM Plex Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--paper-faint)}
.stat-row .v{font-family:'IBM Plex Mono',monospace;font-size:17px;color:var(--paper);font-variant-numeric:tabular-nums}

/* ── ingest · the vault fills (cell grid) ── */
.vault-legend{display:flex;flex-wrap:wrap;gap:14px;margin:18px 0 10px}
.vault-legend .lg{display:inline-flex;align-items:center;gap:6px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--paper-muted)}
.vault-legend .sw{width:9px;height:9px}
.vault-grid{display:grid;grid-template-columns:repeat(48,1fr);gap:2px;margin-top:10px}
.vcell{aspect-ratio:1;background:var(--ink-3)}
@media(max-width:900px){.vault-grid{grid-template-columns:repeat(24,1fr)}}

/* ── ask · calm + split-critic ── */
.ask-calm{display:grid;grid-template-columns:1fr 380px;margin-top:26px;border:1px solid var(--rule)}
.ask-3col{display:grid;grid-template-columns:1fr 1px 1fr 1px 1fr;margin-top:26px;border:1px solid var(--rule)}
.ask-3col .col{padding:20px;min-width:0}
.ask-3col .vrule{background:var(--rule)}
@media(max-width:980px){.ask-calm,.ask-3col{grid-template-columns:1fr}.ask-3col .vrule{display:none}}

/* ── approve · accordion queue ── */
.acc-row{border:1px solid var(--rule);border-top:none}
.acc-row:first-child{border-top:1px solid var(--rule)}
.acc-row.blocking{border-left:2px solid var(--vermilion)}
.acc-head{display:grid;grid-template-columns:12px 1fr auto auto 18px;gap:14px;align-items:center;padding:15px 18px}
.acc-subj{font-family:'Instrument Serif',serif;font-style:italic;font-size:18px;color:var(--paper)}
.acc-body{padding:0 18px 18px;display:none}
.acc-row.open .acc-body{display:block}
.acc-row.open .acc-head{border-bottom:1px solid var(--rule)}
.acc-chev{font-family:'IBM Plex Mono',monospace;color:var(--paper-faint);transition:transform var(--snap) var(--ease)}
.acc-row.open .acc-chev{transform:rotate(90deg)}

/* ── approve · ledger ── */
.tiles-sum{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--rule);border:1px solid var(--rule);margin:8px 0 24px}
.tile-sum{background:var(--ink-1);padding:18px 20px}
.tile-sum .big{font-family:'IBM Plex Mono',monospace;font-size:30px;color:var(--paper);font-variant-numeric:tabular-nums}
.tile-sum.block .big{color:var(--vermilion)}
.sev-strip{display:inline-flex;gap:3px;align-items:center}
.sev-dot{width:7px;height:7px;border-radius:50%;display:inline-block}

/* ── memory · ledger + card catalog ── */
.proj-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:24px}
@media(max-width:760px){.proj-cards{grid-template-columns:1fr}}
.catalog{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-top:8px}
@media(max-width:1100px){.catalog{grid-template-columns:repeat(3,1fr)}}
@media(max-width:680px){.catalog{grid-template-columns:1fr 1fr}}
.catalog-card{border:1px solid var(--rule);background:var(--ink-1);padding:16px 16px 14px;position:relative}
.catalog-card .hole{width:10px;height:10px;border:1px solid var(--rule-strong);border-radius:50%;position:absolute;top:12px;right:14px}
.catalog-card .spine{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--paper-faint)}
.catalog-card .nm{font-family:'Instrument Serif',serif;font-style:italic;font-size:20px;color:var(--paper);margin:8px 0 4px}
"""
