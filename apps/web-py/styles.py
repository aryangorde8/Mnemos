"""The Mnemos editorial-dark aesthetic, carried over from the React app's palette."""

CSS = """
:root{
  --ink:#0b0a08; --ink-2:#14100a; --paper:#f3ecdf; --paper-dim:#c9bda8;
  --paper-faint:#8a8071; --rule:#241d14; --rule-strong:#3a2f20;
  --vermilion:#f25738; --saffron:#e0a43b; --ease:cubic-bezier(.2,.7,.2,1);
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:var(--ink); color:var(--paper);
  font-family:'IBM Plex Sans',system-ui,sans-serif; font-weight:300;
  line-height:1.55; letter-spacing:.005em;
  background-image:
    radial-gradient(60% 50% at 50% -10%, rgba(242,87,56,.10), transparent 70%),
    radial-gradient(50% 40% at 50% 110%, rgba(60,40,20,.25), transparent 70%);
  background-attachment:fixed; min-height:100vh;
}
a{color:inherit; text-decoration:none}
.display,h1,h2,h3{font-family:'Instrument Serif',Georgia,serif; font-weight:400; letter-spacing:-.01em}
.i{font-style:italic}
.mono{font-family:'IBM Plex Mono',ui-monospace,monospace}
.wrap{max-width:1040px; margin:0 auto; padding:0 28px}

header.nav{position:sticky; top:0; z-index:20; backdrop-filter:blur(10px);
  background:rgba(11,10,8,.7); border-bottom:1px solid var(--rule)}
header.nav .wrap{display:flex; align-items:baseline; gap:22px; height:64px}
header.nav .brand{font-family:'Instrument Serif',serif; font-size:1.5rem; font-style:italic}
header.nav .tag{color:var(--paper-faint); font-size:.7rem; letter-spacing:.22em; text-transform:uppercase}
header.nav nav{margin-left:auto; display:flex; gap:20px; font-size:.82rem}
header.nav nav a{color:var(--paper-dim); transition:color .2s}
header.nav nav a:hover,header.nav nav a.on{color:var(--vermilion)}

.eyebrow{color:var(--vermilion); font-size:.7rem; letter-spacing:.24em; text-transform:uppercase; font-weight:500}
.hero{padding:96px 0 40px}
.hero h1{font-size:clamp(2.6rem,6vw,4.4rem); line-height:1.04; margin:14px 0 18px}
.muted{color:var(--paper-dim)}
.faint{color:var(--paper-faint)}
.accent{color:var(--vermilion)}
.saffron{color:var(--saffron)}

.btn{display:inline-block; border:1px solid var(--rule-strong); border-radius:999px;
  padding:9px 20px; font-size:.85rem; transition:all .2s var(--ease); cursor:pointer; background:transparent; color:var(--paper)}
.btn:hover{border-color:var(--vermilion); color:var(--vermilion)}
.btn.primary{border-color:var(--vermilion); color:var(--vermilion)}
.btn.primary:hover{background:var(--vermilion); color:var(--ink)}

.label{color:var(--paper-faint); font-size:.68rem; letter-spacing:.18em; text-transform:uppercase; font-family:'IBM Plex Mono',monospace}
.card{border:1px solid var(--rule); border-radius:4px; padding:22px 24px; background:rgba(20,16,10,.4)}
.grid{display:grid; gap:16px}
.grid.cols-2{grid-template-columns:1fr 1fr}
.grid.cols-3{grid-template-columns:repeat(3,1fr)}
@media(max-width:760px){.grid.cols-2,.grid.cols-3{grid-template-columns:1fr}}

input.field,textarea.field{width:100%; background:transparent; border:none; border-bottom:1px solid var(--rule-strong);
  color:var(--paper); font-family:'Instrument Serif',serif; font-size:1.8rem; padding:10px 0; outline:none}
input.field:focus,textarea.field:focus{border-color:var(--vermilion)}
input.field::placeholder{color:var(--paper-faint)}

/* reasoning stream */
.stream{border-left:2px solid var(--vermilion); padding:6px 0 6px 22px; margin-top:24px; min-height:40px}
.tok-thought{color:var(--paper-dim); font-family:'Instrument Serif',serif; font-size:1.12rem; font-style:italic}
.stream-block{margin:14px 0; padding:10px 0; border-top:1px solid var(--rule)}
.stream-block .head{font-family:'IBM Plex Mono',monospace; font-size:.74rem; letter-spacing:.1em}
.stream-block .sub{font-family:'IBM Plex Mono',monospace; font-size:.78rem; color:var(--paper-dim); margin-top:4px}
.answer{font-family:'Instrument Serif',serif; font-size:1.32rem; line-height:1.5; color:var(--paper); margin-top:22px;
  border-top:1px solid var(--rule); padding-top:20px; white-space:pre-wrap}
.pill{display:inline-block; background:rgba(242,87,56,.14); color:var(--vermilion); border-radius:999px;
  padding:1px 8px; font-family:'IBM Plex Mono',monospace; font-size:.72rem; margin:0 2px}

table.ledger{width:100%; border-collapse:collapse; font-size:.9rem}
table.ledger th{text-align:left; color:var(--paper-faint); font-size:.66rem; letter-spacing:.16em; text-transform:uppercase;
  font-family:'IBM Plex Mono',monospace; padding:8px 12px; border-bottom:1px solid var(--rule)}
table.ledger td{padding:11px 12px; border-bottom:1px solid var(--rule); vertical-align:top}
.dir-out{color:var(--vermilion)} .dir-in{color:var(--saffron)}

.result{padding:14px 0; border-bottom:1px solid var(--rule)}
.result .t{font-family:'Instrument Serif',serif; font-size:1.15rem}
.result .x{color:var(--paper-dim); font-size:.9rem; margin-top:4px}
.kpi{font-family:'Instrument Serif',serif; font-size:2.4rem; line-height:1}
.empty{color:var(--paper-faint); font-style:italic; padding:24px 0}
.spinner{color:var(--vermilion); font-family:'IBM Plex Mono',monospace; font-size:.8rem}
.htmx-indicator{opacity:0; transition:opacity .2s} .htmx-request .htmx-indicator{opacity:1}
"""
