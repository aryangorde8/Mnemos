"""Inline client JS — small, dependency-free snippets the surfaces need.

Everything is authored in Python strings and injected via FastHTML `Script(...)`. No build step,
no framework. The only other JS in the app is FastHTML's bundled HTMX (+ the SSE extension).
Canvas animation and keyboard-driven UI genuinely require JS; these are kept deliberately tiny.
"""

# ── ⌘K command palette: filter + keyboard + routing by kind ──
CMDK_JS = """
(function(){var ov=document.getElementById('cmdk');if(!ov)return;
var input=document.getElementById('cmdk-input'),list=document.getElementById('cmdk-list');
var items=[].slice.call(list.children),sel=0;
function vis(){return items.filter(function(it){return it.style.display!=='none';});}
function mark(i){var v=vis();sel=Math.max(0,Math.min(v.length-1,i));items.forEach(function(it){it.classList.remove('sel');});if(v[sel])v[sel].classList.add('sel');}
function filt(){var q=input.value.toLowerCase();items.forEach(function(it){it.style.display=it.getAttribute('data-q').indexOf(q)>=0?'':'none';});mark(0);}
function open(){ov.classList.add('open');input.value='';filt();setTimeout(function(){input.focus();},10);}
function close(){ov.classList.remove('open');}
function go(){var v=vis();if(v[sel])window.location=v[sel].getAttribute('data-href');}
window.__cmdkOpen=open;
document.addEventListener('keydown',function(e){
if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){e.preventDefault();ov.classList.contains('open')?close():open();return;}
if(e.altKey&&['1','2','3','4','5','6'].indexOf(e.key)>=0){var hrefs=['/','/ingest','/ask','/approve','/memory','/search'];e.preventDefault();window.location=hrefs[+e.key-1];return;}
if(!ov.classList.contains('open'))return;
if(e.key==='Escape')close();else if(e.key==='ArrowDown'){e.preventDefault();mark(sel+1);}
else if(e.key==='ArrowUp'){e.preventDefault();mark(sel-1);}else if(e.key==='Enter'){e.preventDefault();go();}});
input.addEventListener('input',filt);
ov.addEventListener('click',function(e){if(e.target===ov)close();});
items.forEach(function(it){it.addEventListener('click',function(){window.location=it.getAttribute('data-href');});
it.addEventListener('mouseenter',function(){mark(vis().indexOf(it));});});
[].slice.call(document.querySelectorAll('[data-cmdk-open]')).forEach(function(b){b.addEventListener('click',open);});
[].slice.call(document.querySelectorAll('.cmdk-chip')).forEach(function(c){c.addEventListener('click',function(){input.value=c.textContent;filt();input.focus();});});
})();
"""

# ── live ticking clock in the top bar ──
CLOCK_JS = """
(function(){var el=document.getElementById('clock');if(!el)return;
function t(){el.textContent=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
t();setInterval(t,1000);})();
"""

# ── hero constellation particle field (2D canvas) ──
CONSTELLATION_JS = """
(function(){var cvs=document.getElementById('constellation');if(!cvs)return;var parent=cvs.parentElement;
var reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;var dpr=window.devicePixelRatio||1;
var stars=[],links=[],mouse={x:-1000,y:-1000},trace=null,W=0,H=0;
function build(w,h){var N=Math.round(Math.min(90,w*h/14000));stars=[];for(var i=0;i<N;i++){
stars.push({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.08,vy:(Math.random()-.5)*.08,r:.7+Math.random()*1.8,mag:Math.random(),phase:Math.random()*6.2832});}
links=[];for(var i=0;i<stars.length;i++)for(var j=i+1;j<stars.length;j++){var dx=stars[i].x-stars[j].x,dy=stars[i].y-stars[j].y;if(Math.hypot(dx,dy)<130)links.push([i,j]);}}
function resize(){var rb=parent.getBoundingClientRect();W=rb.width;H=rb.height;cvs.width=W*dpr;cvs.height=H*dpr;cvs.style.width=W+'px';cvs.style.height=H+'px';build(W,H);}
resize();new ResizeObserver(resize).observe(parent);
function mkpath(start){var path=[start],used={};used[start]=1;for(var s=0;s<6;s++){var cur=stars[path[path.length-1]],nx=-1,nd=1e9;for(var i=0;i<stars.length;i++){if(used[i])continue;var d=Math.hypot(stars[i].x-cur.x,stars[i].y-cur.y);if(d<nd&&d<220){nd=d;nx=i;}}if(nx<0)break;used[nx]=1;path.push(nx);}return{path:path,t0:performance.now(),dur:2500};}
if(!reduced){cvs.addEventListener('mousemove',function(e){var r=cvs.getBoundingClientRect();mouse={x:e.clientX-r.left,y:e.clientY-r.top};});
cvs.addEventListener('mouseleave',function(){mouse={x:-1000,y:-1000};});
cvs.addEventListener('click',function(e){var r=cvs.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;if(!stars.length)return;var n=0,nd=1e9;for(var i=0;i<stars.length;i++){var d=Math.hypot(stars[i].x-mx,stars[i].y-my);if(d<nd){nd=d;n=i;}}trace=mkpath(n);});}
function loop(now){var ctx=cvs.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
if(!reduced){for(var k=0;k<stars.length;k++){var s=stars[k],dx=mouse.x-s.x,dy=mouse.y-s.y,d2=dx*dx+dy*dy;if(d2<22500){var f=(1-d2/22500)*.03;s.vx+=dx*f*.002;s.vy+=dy*f*.002;}s.vx*=.985;s.vy*=.985;s.x+=s.vx;s.y+=s.vy;if(s.x<0||s.x>W)s.vx*=-1;if(s.y<0||s.y>H)s.vy*=-1;s.phase+=.004+s.mag*.006;}}
for(var l=0;l<links.length;l++){var a=stars[links[l][0]],b=stars[links[l][1]],dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);if(d>180)continue;ctx.strokeStyle='rgba(108,100,90,'+((1-d/180)*.16)+')';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
for(var k=0;k<stars.length;k++){var s=stars[k],tw=.55+.45*Math.sin(s.phase);ctx.beginPath();ctx.fillStyle='rgba(243,236,223,'+(.32+s.mag*.45*tw)+')';ctx.arc(s.x,s.y,s.r,0,6.2832);ctx.fill();}
if(trace){var el=now-trace.t0,prog=Math.min(1,el/trace.dur),segs=trace.path.length-1,sp=prog*segs;ctx.strokeStyle='#f25738';ctx.lineWidth=1.1;ctx.beginPath();for(var k2=0;k2<segs;k2++){var a=stars[trace.path[k2]],b=stars[trace.path[k2+1]];if(sp>=k2+1){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}else if(sp>k2){var lo=sp-k2;ctx.moveTo(a.x,a.y);ctx.lineTo(a.x+(b.x-a.x)*lo,a.y+(b.y-a.y)*lo);break;}else break;}ctx.stroke();var hi=trace.path[Math.min(Math.floor(sp)+1,segs)],head=stars[hi];if(head){ctx.fillStyle='#f25738';ctx.beginPath();ctx.arc(head.x,head.y,2.5,0,6.2832);ctx.fill();ctx.beginPath();ctx.strokeStyle='rgba(242,87,56,.4)';ctx.lineWidth=.6;ctx.arc(head.x,head.y,8+4*Math.sin(now*.006),0,6.2832);ctx.stroke();}if(prog>=1)trace=null;}
requestAnimationFrame(loop);}requestAnimationFrame(loop);
if(!reduced){function fire(){if(stars.length)trace=mkpath(Math.floor(Math.random()*stars.length));}setTimeout(fire,900);setInterval(fire,4200);}})();
"""

# ── hero / ingest live mini reasoning stream ──
LIVESTREAM_JS = """
(function(){var el=document.getElementById('livestream');if(!el)return;
var sets=[
[['think','user asks where the Q3 plan slipped'],['tool','memory.search · "Q3 roadmap status"'],['obs','← 6 docs · top cosine 0.91'],['ans','the slip traces to the data migration.']],
[['think','draft a decline to Marcus, propose Thursday'],['tool','draft_email → critique_draft'],['obs','← critic · revise · 1 high · voice 8/10'],['ans','held for your approval.']],
[['think','what do I owe Sarah this week?'],['tool','list_commitments · outgoing'],['obs','← 9 open · Q3 doc due May 22'],['ans','one item is overdue.']]];
var idx=0;function render(){var s=sets[idx%sets.length];el.innerHTML='';s.forEach(function(line,i){var d=document.createElement('span');d.className='mini-line '+line[0];d.style.opacity=(i===s.length-1?1:0.5);d.style.animation='rise-up var(--reveal) var(--ease) both';d.style.animationDelay=(i*0.12)+'s';d.textContent=(line[0]==='think'?'· ':line[0]==='tool'?'› ':line[0]==='obs'?'‹ ':'◆ ')+line[1];el.appendChild(d);});idx++;}
render();setInterval(render,2100);})();
"""

# ── search: animate score bars + phase scrubbing (pure client toggle) ──
SEARCH_JS = """
(function(){
function animate(){[].slice.call(document.querySelectorAll('.scorebar .bar')).forEach(function(b){requestAnimationFrame(function(){b.style.width=(b.getAttribute('data-w')||0)+'%';});});}
animate();
var cells=[].slice.call(document.querySelectorAll('.pipe-cell'));var panes={};
[].slice.call(document.querySelectorAll('.ph-pane')).forEach(function(p){panes[p.getAttribute('data-phase')]=p;});
function select(ph,idx){cells.forEach(function(c,i){c.classList.toggle('active',c.getAttribute('data-phase')===ph);c.classList.toggle('past',i<idx);});Object.keys(panes).forEach(function(k){panes[k].style.display=k===ph?'':'none';});}
cells.forEach(function(c,i){c.addEventListener('click',function(){select(c.getAttribute('data-phase'),i);});});
})();
"""

# ── search results: re-run score-bar animation after an HTMX swap ──
SEARCH_SWAP_JS = """
[].slice.call(document.querySelectorAll('.scorebar .bar')).forEach(function(b){requestAnimationFrame(function(){b.style.width=(b.getAttribute('data-w')||0)+'%';});});
(function(){var cells=[].slice.call(document.querySelectorAll('.pipe-cell'));var panes={};
[].slice.call(document.querySelectorAll('.ph-pane')).forEach(function(p){panes[p.getAttribute('data-phase')]=p;});
function select(ph,idx){cells.forEach(function(c,i){c.classList.toggle('active',c.getAttribute('data-phase')===ph);c.classList.toggle('past',i<idx);});Object.keys(panes).forEach(function(k){panes[k].style.display=k===ph?'':'none';});}
cells.forEach(function(c,i){c.addEventListener('click',function(){select(c.getAttribute('data-phase'),i);});});})();
"""

# ── run status · flip "streaming" to "complete" when the SSE closes ──
# The label is rendered once when a run starts and nothing ever cleared it, so a finished
# answer still sat under a pulsing dot claiming to be streaming. Delegated on document
# because the prompt head arrives by htmx swap, after this script has run.
STREAM_STATE_JS = """
(function(){
var obs=null;
function settle(state){
var el=document.querySelector('[data-run-state]');
if(!el||el.getAttribute('data-run-state')!=='streaming')return;  // idempotent: see below
if(obs){obs.disconnect();obs=null;}
var dot=el.querySelector('.pulse-dot');if(dot)dot.classList.remove('pulse-dot');
el.setAttribute('data-run-state',state);
var lbl=el.querySelector('[data-run-label]');if(lbl)lbl.textContent=state==='error'?' failed':' complete';}
document.addEventListener('htmx:sseClose',function(){settle('done');});
document.addEventListener('htmx:sseError',function(){settle('error');});
// sseClose is not fired by every htmx/extension build, so the run-stats fragment the
// agent sends last is the backstop: if it is in the DOM, the run is over regardless.
//
// settle() writes to the DOM, so an observer that called it unguarded would re-trigger
// itself on its own mutation and spin forever — which is exactly what it did, hanging
// the tab. Two brakes: the guard above makes settle a no-op once the state has left
// "streaming", and the observer disconnects the moment it fires. It also watches #run
// rather than document.body, so unrelated page mutations never wake it.
function watch(){
var root=document.getElementById('run');if(!root)return;
if(obs)obs.disconnect();
obs=new MutationObserver(function(){if(document.querySelector('[data-run-done]'))settle('done');});
obs.observe(root,{childList:true,subtree:true});}
document.addEventListener('htmx:afterSwap',function(e){
if(e.target&&e.target.id==='run')watch();});
})();
"""

# ── draft card · toggle inline edit (view ↔ editable textarea) ──
EDIT_JS = """
window.mnEdit=function(aid){var v=document.getElementById('view-'+aid),e=document.getElementById('edit-'+aid);
if(!e)return;var editing=e.style.display!=='none';e.style.display=editing?'none':'block';
if(v)v.style.display=editing?'':'none';if(!editing){e.focus();}};
"""

# ── custom black-themed dropdown (native <select> can't be dark-styled cross-browser) ──
# Delegated on document so it works for htmx-swapped content. A trigger toggles its menu;
# picking an option updates the label + hidden input; htmx on the option (filters) still fires.
DROPDOWN_JS = """
(function(){
function closeAll(){document.querySelectorAll('[data-dd-menu]').forEach(function(m){m.setAttribute('hidden','');});}
document.addEventListener('click',function(e){
  var trg=e.target.closest('[data-dd-trigger]');
  if(trg){var menu=trg.parentElement.querySelector('[data-dd-menu]');var wasOpen=!menu.hasAttribute('hidden');
    closeAll();if(!wasOpen)menu.removeAttribute('hidden');e.preventDefault();return;}
  var opt=e.target.closest('[data-dd-opt]');
  if(opt){var dd=opt.closest('[data-dd]');
    var v=dd.querySelector('[data-dd-val]');if(v)v.textContent=opt.textContent;
    var inp=dd.querySelector('[data-dd-input]');if(inp)inp.value=opt.getAttribute('data-val');
    dd.querySelectorAll('[data-dd-opt]').forEach(function(o){o.classList.remove('active');});
    opt.classList.add('active');closeAll();return;}
  closeAll();
});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeAll();});
})();
"""

# ── memory: hover a star → update the right rail ──
MEMORY_JS = r"""
/* 04 · memory — focus + neighbourhood.
   Mirrors expand_via_graph: resolve a seed entity, BFS 1-2 hops, draw the result.
   A hub entity touches nearly everything, so each ring keeps the strongest ties and
   reports how many it held back rather than truncating silently. */
(function(){
  var D = window.__MEM__; if (!D) return;
  var svg = document.getElementById("mem-svg"); if (!svg) return;
  var NS = "http://www.w3.org/2000/svg";
  var EDGE = {owes:{c:"#e8c547",w:2.1,o:.85}, manages:{c:"#f25738",w:1.8,o:.8},
              works_with:{c:"#d8d2c5",w:1.4,o:.5}, discusses:{c:"#6c645a",w:1,o:.42}};
  var RANK = {owes:0, manages:1, works_with:2, discusses:3};
  var CAP = {1:14, 2:20}, CX = 490, CY = 296, R1 = 150, R2 = 246;

  var byKey = {};
  D.ents.forEach(function(e){ if (!byKey[e.k]) byKey[e.k] = e; });
  /* Relations can point at entities /graph did not return (it caps each kind), so
     synthesise faint placeholders instead of dropping those edges. */
  D.rels.forEach(function(r){ [r.f, r.t].forEach(function(k){
    if (!byKey[k]) byKey[k] = {n:k.replace(/-/g," ").replace(/\b\w/g,function(c){return c.toUpperCase();}),
                               k:k, t:"unindexed", m:0, r:"", f:"", l:""};
  }); });

  var adj = {};
  D.rels.forEach(function(r){
    if (r.f === r.t) return;
    (adj[r.f] = adj[r.f] || []).push({o:r.t, k:r.k, e:r.e, dir:"out"});
    (adj[r.t] = adj[r.t] || []).push({o:r.f, k:r.k, e:r.e, dir:"in"});
  });

  /* entity_key slugifies the name, so "priya" and "priya-iyer" are separate entities
     that are probably one person. Name it rather than hide it. */
  var dupes = {}, keys = Object.keys(byKey);
  keys.forEach(function(a){ keys.forEach(function(b){
    if (a !== b && b.indexOf(a + "-") === 0 && byKey[a].t === byKey[b].t) {
      (dupes[a] = dupes[a] || []).push(b); (dupes[b] = dupes[b] || []).push(a);
    }
  }); });

  var focus = (D.ents[0] || {}).k, depth = 1;
  D.ents.forEach(function(e){ if (e.m > (byKey[focus] || {m:-1}).m) focus = e.k; });

  function el(t, a){ var n = document.createElementNS(NS, t);
    for (var k in a) n.setAttribute(k, a[k]); return n; }
  function esc(s){ var d = document.createElement("div"); d.textContent = s == null ? "" : s;
    return d.innerHTML; }
  function strongest(a, b){ var best = 9;
    (adj[a] || []).forEach(function(e){ if (e.o === b) best = Math.min(best, RANK[e.k]); });
    return best; }

  function neighbourhood(seed, d){
    var lvl = {}; lvl[seed] = 0; var frontier = [seed], dropped = {};
    for (var i = 1; i <= d; i++) {
      var cand = {};
      frontier.forEach(function(f){ (adj[f] || []).forEach(function(e){
        if (!(e.o in lvl)) cand[e.o] = 1; }); });
      /* A ring is supposed to mean distance from the seed. Ring 1 is capped, so a direct
         neighbour that lost its place used to re-enter here on a longer path and get
         drawn on the outer ring — a straight line from the centre across ring 1, for a
         node that was one hop away all along. Ten of the thirty edges at 2 hops were
         these. It is held back like any other cap casualty rather than misplaced. */
      if (i > 1) {
        Object.keys(cand).forEach(function(k){
          if (strongest(seed, k) < 9) delete cand[k];
        });
      }
      var fr = frontier;
      var ranked = Object.keys(cand).sort(function(x, y){
        var sx = 9, sy = 9;
        fr.forEach(function(f){ sx = Math.min(sx, strongest(f, x));
                                sy = Math.min(sy, strongest(f, y)); });
        return sx - sy || (byKey[y].m || 0) - (byKey[x].m || 0);
      });
      dropped[i] = Math.max(0, ranked.length - CAP[i]);
      var keep = ranked.slice(0, CAP[i]);
      keep.forEach(function(k){ lvl[k] = i; });
      frontier = keep;
    }
    return {lvl:lvl, dropped:dropped};
  }

  function draw(){
    var nb = neighbourhood(focus, depth), lvl = nb.lvl;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    [[R1, "1 hop"], [R2, depth > 1 ? "2 hops" : ""]].forEach(function(rc){
      if (!rc[1]) return;
      svg.appendChild(el("circle", {cx:CX, cy:CY, r:rc[0], fill:"none",
        stroke:"#241d15", "stroke-dasharray":"2 6"}));
      var t = el("text", {x:CX, y:CY - rc[0] - 7, "text-anchor":"middle", "class":"mem-ring"});
      t.textContent = rc[1]; svg.appendChild(t);
    });

    var pos = {}; pos[focus] = [CX, CY];
    [1, 2].forEach(function(ring){
      var members = Object.keys(lvl).filter(function(k){ return lvl[k] === ring; })
        .sort(function(a, b){ return (byKey[b].m || 0) - (byKey[a].m || 0); });
      var R = ring === 1 ? R1 : R2;
      members.forEach(function(k, i){
        var a = (i / members.length) * Math.PI * 2 - Math.PI / 2;
        pos[k] = [CX + Math.cos(a) * R, CY + Math.sin(a) * R];
      });
    });

    /* Peer chords — both ends on the same ring — are the ones that cross the figure, and
       they are never the reason anything is on screen: the seed's own edges put ring 1
       there, and ring 1 puts ring 2 there. Drawing the weak kinds (works_with, discusses)
       buries the structure they cross, so only commitments and reporting lines survive
       between peers; anything touching the focus is always drawn.
       This was applied at 2 hops first, on the assumption that 1 hop was sparse enough to
       leave alone. Measuring said otherwise — 1 hop carried 75 crossings against 2 hops'
       39 once the rings were honest, so the "sparse" view had become the tangled one.
       Live graph: 2 hops 89 edges / 497 crossings → 43 / 39; 1 hop 47 / 75 → 37 / 3. */
    var seen = {}, hiddenPeers = 0;
    D.rels.forEach(function(r){
      if (!pos[r.f] || !pos[r.t] || r.f === r.t) return;
      var id = [r.f, r.t, r.k].sort().join("|"); if (seen[id]) return; seen[id] = 1;
      var touches = r.f === focus || r.t === focus;
      if (!touches && lvl[r.f] === lvl[r.t] && RANK[r.k] > 1) { hiddenPeers++; return; }
      var st = EDGE[r.k] || EDGE.discusses;
      var ln = el("line", {x1:pos[r.f][0], y1:pos[r.f][1], x2:pos[r.t][0], y2:pos[r.t][1],
        stroke:st.c, "stroke-width":st.w, "stroke-linecap":"round",
        "stroke-opacity":touches ? st.o : st.o * 0.4});
      var ttl = el("title");
      ttl.textContent = byKey[r.f].n + " " + r.k + " " + byKey[r.t].n + (r.e ? " — " + r.e : "");
      ln.appendChild(ttl); svg.appendChild(ln);
    });

    Object.keys(lvl).sort(function(a, b){ return lvl[b] - lvl[a]; }).forEach(function(k){
      var xy = pos[k], x = xy[0], y = xy[1], e = byKey[k], isF = lvl[k] === 0;
      var rad = isF ? 15 : Math.max(4.5, Math.min(11, 4.5 + Math.sqrt(e.m || 1) * 1.5));
      var fill = e.t === "person" ? "#f25738" : e.t === "project" ? "#e8c547"
               : e.t === "unindexed" ? "#4a443c" : "#9c9486";
      var g = el("g", {"class":"mem-node", tabindex:"0", role:"button",
                       "aria-label":e.n + ", " + (e.m || 0) + " mentions"});
      if (isF) g.appendChild(el("circle", {cx:x, cy:y, r:rad + 9, fill:"none",
        stroke:"#f25738", "stroke-opacity":".33"}));
      g.appendChild(el("circle", {cx:x, cy:y, r:rad, fill:fill,
        "fill-opacity":isF ? 1 : lvl[k] === 1 ? .92 : .5,
        stroke:"#0e0a05", "stroke-width":isF ? 0 : 1.5}));
      if (dupes[k]) g.appendChild(el("circle", {cx:x + rad * .82, cy:y - rad * .82,
        r:2.6, fill:"#e8c547"}));
      /* Fan labels outward so ring neighbours never collide. */
      var dx = x - CX, dy = y - CY, horiz = Math.abs(dx) > 34, off = rad + 7;
      var t = el("text", {
        x: isF ? x : x + (!horiz ? 0 : dx < 0 ? -off : off),
        y: isF ? y + rad + 27 : y + (!horiz ? (dy < 0 ? -off - 2 : off + 9) : 4),
        "text-anchor": isF ? "middle" : (!horiz ? "middle" : dx < 0 ? "end" : "start"),
        "class": "mem-nlabel" + (isF ? " focus" : "")});
      t.textContent = e.n.length > 20 ? e.n.slice(0, 19) + "…" : e.n;
      if (!isF) t.setAttribute("fill-opacity", lvl[k] === 1 ? .95 : .55);
      g.appendChild(t);
      g.addEventListener("click", function(){ focus = k; draw(); });
      g.addEventListener("keydown", function(ev){
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); focus = k; draw(); } });
      svg.appendChild(g);
    });

    var shown = Object.keys(lvl).length - 1;
    var held = (nb.dropped[1] || 0) + (depth > 1 ? (nb.dropped[2] || 0) : 0);
    var cap = el("text", {x:14, y:588, "class":"mem-ring", "text-anchor":"start"});
    cap.textContent = (held ? "showing strongest " + shown + " of " + (shown + held) + " neighbours"
                            : "all " + shown + " neighbours shown")
                    + (hiddenPeers ? " · " + hiddenPeers + " weak peer links hidden" : "");
    svg.appendChild(cap);
    detail();
  }

  function detail(){
    var e = byKey[focus];
    function set(id, v){ var n = document.getElementById(id); if (n) n.textContent = v; }
    set("mem-name", e.n);
    set("mem-role", e.r || "No role recorded by the extractor.");
    set("mem-m", e.m || "—"); set("mem-f", e.f || "—"); set("mem-l", e.l || "—");
    set("mem-n", (adj[focus] || []).length);

    var dup = document.getElementById("mem-dup");
    if (dupes[focus]) {
      dup.hidden = false;
      set("mem-dupmsg", "“" + e.n + "” and " +
        dupes[focus].map(function(k){ return "“" + byKey[k].n + "”"; }).join(", ") +
        " are separate entities because entity_key slugifies the name. They are probably the " +
        "same person — their chunks and relations are split across both.");
    } else { dup.hidden = true; }

    var box = document.getElementById("mem-edges");
    box.innerHTML = ""; var seen = {};
    (adj[focus] || []).sort(function(a, b){ return RANK[a.k] - RANK[b.k]; }).forEach(function(r){
      var id = r.o + r.k + r.e; if (seen[id]) return; seen[id] = 1;
      var d = document.createElement("div"); d.className = "mem-edge";
      d.innerHTML = '<span class="kind k-' + r.k + '">' + r.k.replace("_", " ") + '</span>' +
        '<span>' + (r.dir === "out" ? "→ " : "← ") + '<b>' + esc(byKey[r.o].n) + '</b>' +
        (r.e ? '<br><span class="ev">' + esc(r.e) + '</span>' : '') + '</span>';
      box.appendChild(d);
    });
    if (!box.children.length) box.innerHTML = '<span class="ev">No relations recorded.</span>';

    var btns = document.querySelectorAll(".mem-ent");
    for (var i = 0; i < btns.length; i++)
      btns[i].setAttribute("aria-current",
        btns[i].getAttribute("data-k") === focus ? "true" : "false");
  }

  function renderList(filter){
    var list = document.getElementById("mem-list"); list.innerHTML = "";
    var f = (filter || "").trim().toLowerCase();
    var items = D.ents.filter(function(e){ return !f || e.n.toLowerCase().indexOf(f) >= 0; })
      .sort(function(a, b){ return b.m - a.m; }).slice(0, 60);
    items.forEach(function(e){
      var b = document.createElement("button");
      b.className = "mem-ent"; b.type = "button"; b.setAttribute("data-k", e.k);
      b.setAttribute("aria-current", e.k === focus ? "true" : "false");
      b.innerHTML = '<span class="dot k-' + e.t + '"></span><span>' + esc(e.n) +
                    '</span><span class="m">' + e.m + '</span>';
      b.addEventListener("click", function(){ focus = e.k; draw(); });
      list.appendChild(b);
    });
    if (!items.length) list.innerHTML = '<span class="ev">Nothing matches.</span>';
  }

  var q = document.getElementById("mem-q");
  if (q) { q.placeholder = "search " + Object.keys(byKey).length + " entities…";
           q.addEventListener("input", function(ev){ renderList(ev.target.value); }); }
  [["mem-d1", 1], ["mem-d2", 2]].forEach(function(pair){
    var b = document.getElementById(pair[0]); if (!b) return;
    b.addEventListener("click", function(){
      depth = pair[1];
      document.getElementById("mem-d1").setAttribute("aria-pressed", String(depth === 1));
      document.getElementById("mem-d2").setAttribute("aria-pressed", String(depth === 2));
      draw();
    });
  });
  renderList(""); draw();
})();
"""
