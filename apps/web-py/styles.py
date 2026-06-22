"""The Mnemos editorial-dark aesthetic — exact palette/typography from the React app."""

CSS = """
:root{
  --ink:#050402; --ink-1:#0e0a05; --ink-2:#14100a; --ink-3:#1b1610;
  --rule:#2a2218; --rule-strong:#3a3024; --rule-soft:#1f1a13;
  --paper:#f3ecdf; --paper-dim:#d8d2c5; --paper-muted:#9c9486; --paper-faint:#6c645a; --paper-ghost:#4a443c;
  --vermilion:#f25738; --vermilion-deep:#b73826; --saffron:#e8c547;
  --ease:cubic-bezier(.2,.7,.2,1);
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:var(--ink); color:var(--paper);
  font-family:'IBM Plex Sans',system-ui,sans-serif; font-weight:300; line-height:1.55; letter-spacing:.005em;
  background-image:
    radial-gradient(46% 44% at 62% 30%, rgba(242,87,56,.13), transparent 72%),
    radial-gradient(50% 40% at 50% 116%, rgba(60,40,20,.22), transparent 70%);
  background-attachment:fixed; min-height:100vh;
}
a{color:inherit; text-decoration:none}
.display,h1,h2,h3{font-family:'Instrument Serif',Georgia,serif; font-weight:400; letter-spacing:-.015em}
.display-i,.i{font-family:'Instrument Serif',Georgia,serif; font-style:italic}
.mono{font-family:'IBM Plex Mono',ui-monospace,monospace}
.wrap{max-width:1240px; margin:0 auto; padding:0 40px}
.accent{color:var(--vermilion)} .saffron{color:var(--saffron)}
.muted{color:var(--paper-dim)} .faint{color:var(--paper-faint)}
.label{color:var(--paper-faint); font-size:.68rem; letter-spacing:.2em; text-transform:uppercase; font-family:'IBM Plex Mono',monospace}
.chrome{color:var(--paper-faint); font-size:.7rem; letter-spacing:.14em; font-family:'IBM Plex Mono',monospace}
.eyebrow{color:var(--vermilion); font-size:.7rem; letter-spacing:.24em; text-transform:uppercase; font-weight:500; font-family:'IBM Plex Mono',monospace}

@keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(242,87,56,.5)}50%{opacity:.5;box-shadow:0 0 0 5px rgba(242,87,56,0)}}
.pulse-dot{display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--vermilion);animation:pulse 2.4s var(--ease) infinite}
.pulse-dot.muted{background:var(--paper-faint);animation:none}

/* ── editorial home ── */
.topbar{position:fixed;inset-inline:0;top:0;z-index:20;border-bottom:1px solid rgba(42,34,24,.7);backdrop-filter:blur(8px);background:rgba(5,4,2,.55)}
.topbar .row{display:flex;align-items:center;justify-content:space-between;max-width:1240px;margin:0 auto;padding:16px 40px}
.brand-i{font-family:'Instrument Serif',serif;font-style:italic;font-size:1.4rem;color:var(--paper)}
.bottombar{position:fixed;inset-inline:0;bottom:0;z-index:20;border-top:1px solid rgba(42,34,24,.7);background:rgba(5,4,2,.55);backdrop-filter:blur(8px)}
.bottombar .row{display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center;max-width:1240px;margin:0 auto;padding:14px 40px}
.bottombar .row span:nth-child(2){text-align:center}
.bottombar .row span:last-child{text-align:right}
.leftrail{position:fixed;left:10px;top:88px;bottom:88px;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:space-between;pointer-events:none}
.vrail{writing-mode:vertical-rl;transform:rotate(180deg);font-family:'IBM Plex Mono',monospace;font-size:.6rem;letter-spacing:.26em;text-transform:uppercase;color:var(--paper-ghost);white-space:nowrap}
@media(max-width:900px){.leftrail{display:none}}
.const-layer{position:fixed;inset-inline:0;top:0;height:720px;z-index:0;pointer-events:none}
.const-layer canvas{display:block;width:100%;height:720px;pointer-events:auto;cursor:crosshair}
.const-fade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,transparent 0,transparent 55%,rgba(5,4,2,.65) 88%,rgba(5,4,2,.95) 100%)}
.hero-main{position:relative;z-index:10;max-width:1240px;margin:0 auto;padding:120px 40px 140px}
.kicker{display:flex;align-items:center;gap:12px;margin-bottom:26px}
.drawline{display:inline-block;width:32px;height:1px;background:var(--vermilion)}
.hero-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:48px;align-items:start}
@media(max-width:900px){.hero-grid{grid-template-columns:1fr}}
.hero-head h1{font-size:clamp(2.6rem,7vw,5.6rem);line-height:1.0;letter-spacing:-.022em;color:var(--paper);margin:0;text-wrap:balance}
.hero-sub{max-width:560px;font-size:1rem;color:var(--paper-dim);line-height:1.65;margin-top:30px}
.cta{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:34px}
.btn-decisive{display:inline-block;border:1px solid var(--rule-strong);color:var(--paper);font-family:'IBM Plex Mono',monospace;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;padding:11px 18px;transition:all .2s var(--ease)}
.btn-decisive:hover{border-color:var(--vermilion);color:var(--vermilion)}
.btn-decisive.primary{border-color:var(--vermilion);color:var(--vermilion)}
.btn-decisive.primary:hover{background:var(--vermilion);color:var(--ink)}
.btn-decisive.ghost{border-color:var(--rule)}
.corner-stream-pane{border:1px solid var(--rule);border-radius:3px;padding:16px 18px;background:rgba(14,10,5,.5);backdrop-filter:blur(6px)}
.cs-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px}
.cs-body{font-family:'IBM Plex Mono',monospace;font-size:.74rem;line-height:1.7;min-height:84px}
.cs-line{display:block;opacity:0;transform:translateX(-6px);animation:rise .5s var(--ease) forwards}
@keyframes rise{to{opacity:1;transform:none}}
.cs-think{color:var(--paper-muted);font-style:italic}
.cs-tool{color:var(--vermilion)}
.cs-obs{color:var(--paper-faint)}
.tb-right{display:flex;align-items:center;gap:20px}
.topbar nav{display:flex;gap:15px;flex-wrap:wrap;font-family:'IBM Plex Mono',monospace;font-size:.72rem;letter-spacing:.05em}
.topbar nav a{color:var(--paper-muted);transition:color .2s}
.topbar nav a:hover,.topbar nav a.on{color:var(--vermilion)}

/* ── ⌘K command palette ── */
.cmdk-overlay{display:none;position:fixed;inset:0;z-index:100;background:rgba(3,2,1,.62);backdrop-filter:blur(4px)}
.cmdk-overlay.open{display:flex;align-items:flex-start;justify-content:center;padding-top:14vh}
.cmdk-panel{width:560px;max-width:90vw;background:var(--ink-1);border:1px solid var(--rule-strong);border-radius:6px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.55)}
.cmdk-input{width:100%;padding:18px 20px;background:transparent;border:none;border-bottom:1px solid var(--rule);color:var(--paper);font-family:'Instrument Serif',serif;font-size:1.35rem;outline:none}
.cmdk-input::placeholder{color:var(--paper-faint)}
.cmdk-list{max-height:52vh;overflow:auto;padding:6px}
.cmdk-item{display:flex;align-items:center;padding:11px 14px;border-radius:4px;cursor:pointer;font-size:.92rem;color:var(--paper-dim)}
.cmdk-item .k{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:var(--paper-faint)}
.cmdk-item.sel{background:rgba(242,87,56,.12);color:var(--vermilion)}
.cmdk-item.sel .k{color:var(--vermilion)}

/* ── inner editorial header ── */
.ihead{border-bottom:1px solid rgba(42,34,24,.7)}
.ihead .row{display:flex;align-items:center;justify-content:space-between;max-width:1240px;margin:0 auto;padding:16px 40px}
.ihead nav{display:flex;align-items:center;gap:6px;font-family:'IBM Plex Mono',monospace;font-size:.74rem;letter-spacing:.05em}
.ihead nav a{color:var(--paper-muted);transition:color .2s;padding:0 4px}
.ihead nav a:hover,.ihead nav a.on{color:var(--vermilion)}
.ihead nav .faint{color:var(--paper-ghost)}

/* ── overview: four wedges + status ── */
.ov-head{font-size:clamp(2rem,5.4vw,3.6rem);line-height:1.04;letter-spacing:-.02em;color:var(--paper);max-width:28ch;margin:24px 0 0}
.ov-sub{max-width:60ch;font-size:1rem;color:var(--paper-dim);line-height:1.65;margin-top:24px}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);margin-top:64px}
@media(max-width:900px){.tiles{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.tiles{grid-template-columns:1fr}}
.tile{position:relative;display:block;padding:36px 32px 32px;border-top:1px solid var(--rule);border-right:1px solid var(--rule);background:linear-gradient(180deg,rgba(50,35,22,.18) 0%,rgba(28,20,12,0) 100%);transition:background .3s}
.tile.last{border-right:none}
.tile:hover{background:linear-gradient(180deg,rgba(50,35,22,.30) 0%,rgba(28,20,12,0) 100%)}
.tile-hair{position:absolute;left:32px;right:32px;top:0;height:1px;background:var(--vermilion);transform:scaleX(0);transform-origin:left;transition:transform .5s var(--ease)}
.tile:hover .tile-hair{transform:scaleX(1)}
.tile-top{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:32px}
.tile-glyph{font-family:'Instrument Serif',serif;font-style:italic;font-size:2.4rem;color:var(--ink-3);line-height:1}
.tile-title{font-family:'Instrument Serif',serif;font-size:2.5rem;line-height:1;letter-spacing:-.015em;color:var(--paper)}
.tile-body{font-size:.92rem;color:var(--paper-muted);line-height:1.6;max-width:34ch;margin-top:20px}
.hair{height:1px;background:var(--rule);border:none;margin:0}
.pills{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:48px}
.status-pill{display:inline-flex;align-items:center;gap:9px;border:1px solid var(--rule);border-radius:3px;padding:8px 13px;background:rgba(20,16,10,.4)}
.status-pill-lbl{font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;color:var(--paper)}
.status-pill-val{font-family:'IBM Plex Mono',monospace;font-size:.72rem;color:var(--paper)}
.status-pill-val.off{color:var(--paper-faint)}
.spark{display:inline-flex;align-items:flex-end;gap:1px;height:11px;width:42px;margin-left:2px}
.spark span{width:2px;background:var(--vermilion);opacity:.85;border-radius:1px;transition:height .35s ease}
.signoff{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px;margin-top:64px}
.tabular{font-variant-numeric:tabular-nums}

/* ── inner-page shell ── */
header.nav{position:sticky;top:0;z-index:20;backdrop-filter:blur(10px);background:rgba(5,4,2,.7);border-bottom:1px solid var(--rule)}
header.nav .wrap{display:flex;align-items:baseline;gap:20px;height:64px}
header.nav .brand{font-family:'Instrument Serif',serif;font-size:1.5rem;font-style:italic}
header.nav .tag{color:var(--paper-faint);font-size:.7rem;letter-spacing:.22em;text-transform:uppercase}
header.nav nav{margin-left:auto;display:flex;gap:18px;font-size:.8rem;flex-wrap:wrap}
header.nav nav a{color:var(--paper-muted);transition:color .2s}
header.nav nav a:hover,header.nav nav a.on{color:var(--vermilion)}

.hero{padding:88px 0 40px}
.hero h1{font-size:clamp(2.4rem,5.5vw,4rem);line-height:1.05;margin:14px 0 18px}
.btn{display:inline-block;border:1px solid var(--rule-strong);border-radius:999px;padding:9px 20px;font-size:.85rem;transition:all .2s var(--ease);cursor:pointer;background:transparent;color:var(--paper)}
.btn:hover{border-color:var(--vermilion);color:var(--vermilion)}
.btn.primary{border-color:var(--vermilion);color:var(--vermilion)}.btn.primary:hover{background:var(--vermilion);color:var(--ink)}
.card{border:1px solid var(--rule);border-radius:4px;padding:22px 24px;background:rgba(20,16,10,.4)}
.grid{display:grid;gap:16px}.grid.cols-2{grid-template-columns:1fr 1fr}.grid.cols-3{grid-template-columns:repeat(3,1fr)}
@media(max-width:760px){.grid.cols-2,.grid.cols-3{grid-template-columns:1fr}}
input.field,textarea.field{width:100%;background:transparent;border:none;border-bottom:1px solid var(--rule-strong);color:var(--paper);font-family:'Instrument Serif',serif;font-size:1.8rem;padding:10px 0;outline:none}
input.field:focus{border-color:var(--vermilion)}input.field::placeholder{color:var(--paper-faint)}
.stream{border-left:2px solid var(--vermilion);padding:6px 0 6px 22px;margin-top:24px;min-height:40px}
.tok-thought{color:var(--paper-dim);font-family:'Instrument Serif',serif;font-size:1.12rem;font-style:italic}
.stream-block{margin:14px 0;padding:10px 0;border-top:1px solid var(--rule)}
.stream-block .head{font-family:'IBM Plex Mono',monospace;font-size:.74rem;letter-spacing:.1em}
.stream-block .sub{font-family:'IBM Plex Mono',monospace;font-size:.78rem;color:var(--paper-dim);margin-top:4px}
.answer{font-family:'Instrument Serif',serif;font-size:1.32rem;line-height:1.5;color:var(--paper);margin-top:22px;border-top:1px solid var(--rule);padding-top:20px;white-space:pre-wrap}
.pill{display:inline-block;background:rgba(242,87,56,.14);color:var(--vermilion);border-radius:999px;padding:1px 8px;font-family:'IBM Plex Mono',monospace;font-size:.72rem;margin:0 2px}
table.ledger{width:100%;border-collapse:collapse;font-size:.9rem}
table.ledger th{text-align:left;color:var(--paper-faint);font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;font-family:'IBM Plex Mono',monospace;padding:8px 12px;border-bottom:1px solid var(--rule)}
table.ledger td{padding:11px 12px;border-bottom:1px solid var(--rule);vertical-align:top}
.dir-out{color:var(--vermilion)}.dir-in{color:var(--saffron)}
.result{padding:14px 0;border-bottom:1px solid var(--rule)}
.result .t{font-family:'Instrument Serif',serif;font-size:1.15rem}.result .x{color:var(--paper-dim);font-size:.9rem;margin-top:4px}
.kpi{font-family:'Instrument Serif',serif;font-size:2.4rem;line-height:1}
.empty{color:var(--paper-faint);font-style:italic;padding:24px 0}
"""
