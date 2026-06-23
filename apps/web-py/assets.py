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

# ── type a headline character-by-character (hero · live-trace divergent) ──
TYPE_JS = """
(function(){var el=document.getElementById('typed');if(!el)return;var t=el.getAttribute('data-text')||'';
if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){el.textContent=t;return;}
el.textContent='';var i=0;(function tick(){if(i<=t.length){el.textContent=t.slice(0,i);i++;setTimeout(tick,42);}else{el.classList.add('caret');}})();})();
"""

# ── ingest · the vault fills: light cells in a stable shuffled order ──
VAULT_JS = """
(function(){var grid=document.getElementById('vault-grid');if(!grid)return;
var cells=[].slice.call(grid.children),order=[],n=cells.length;for(var i=0;i<n;i++)order.push(i);
var s=20261;function rnd(){s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff;}
for(var i=n-1;i>0;i--){var j=Math.floor(rnd()*(i+1));var t=order[i];order[i]=order[j];order[j]=t;}
var cols=['#f25738','#e8c547','#f3ecdf','#9c9486'];var k=0,cnt=document.getElementById('vault-count');
var iv=setInterval(function(){if(k>=n){clearInterval(iv);return;}var c=cells[order[k]];c.style.background=cols[order[k]%cols.length];k++;if(cnt)cnt.textContent=k.toLocaleString('en-US');},6);
})();
"""

# ── ingest run: animate counters + cycle the hot pipeline phase ──
INGEST_JS = """
(function(){var root=document.getElementById('ingest-run');if(!root)return;
var goal=+root.getAttribute('data-goal')||0,chunksGoal=+root.getAttribute('data-chunks')||0;
var cDone=document.getElementById('c-items'),cChunks=document.getElementById('c-chunks'),cVec=document.getElementById('c-vectors'),fill=document.getElementById('ing-fill');
var phases=[].slice.call(root.querySelectorAll('.phase-cell')),hot=0,done=false,t=0;
function fmt(n){return Math.round(n).toLocaleString('en-US');}
function paint(p){if(cDone)cDone.firstChild.textContent=fmt(goal*p);if(cChunks)cChunks.firstChild.textContent=fmt(chunksGoal*p);if(cVec)cVec.firstChild.textContent=fmt(chunksGoal*p);if(fill)fill.style.width=(p*100)+'%';}
function complete(){done=true;paint(1);phases.forEach(function(c,i){c.classList.remove('hot');c.classList.add('done');});var b=document.getElementById('ing-banner');if(b)b.style.display='';}
var iv=setInterval(function(){if(done)return;t+=0.018;if(t>=1){complete();clearInterval(iv);return;}paint(t);},90);
var hv=setInterval(function(){if(done){clearInterval(hv);return;}phases.forEach(function(c){c.classList.remove('hot');});if(phases[hot])phases[hot].classList.add('hot');hot=(hot+1)%phases.length;},700);
var skip=document.getElementById('ing-skip');if(skip)skip.addEventListener('click',function(){complete();clearInterval(iv);clearInterval(hv);});
})();
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

# ── draft card · toggle inline edit (view ↔ editable textarea) ──
EDIT_JS = """
window.mnEdit=function(aid){var v=document.getElementById('view-'+aid),e=document.getElementById('edit-'+aid);
if(!e)return;var editing=e.style.display!=='none';e.style.display=editing?'none':'block';
if(v)v.style.display=editing?'':'none';if(!editing){e.focus();}};
"""

# ── approve · queue: accordion (one row open at a time) ──
ACCORDION_JS = """
(function(){var rows=[].slice.call(document.querySelectorAll('.acc-row'));
rows.forEach(function(r){var h=r.querySelector('.acc-head');if(!h)return;
h.style.cursor='pointer';h.addEventListener('click',function(e){if(e.target.closest('button,a'))return;
var open=r.classList.contains('open');rows.forEach(function(x){x.classList.remove('open');});if(!open)r.classList.add('open');});});
if(rows[0])rows[0].classList.add('open');})();
"""

# ── search · animated: auto-advance the phases + animate bars ──
SEARCH_ANIMATE_JS = """
[].slice.call(document.querySelectorAll('.scorebar .bar')).forEach(function(b){requestAnimationFrame(function(){b.style.width=(b.getAttribute('data-w')||0)+'%';});});
(function(){var cells=[].slice.call(document.querySelectorAll('.pipe-cell'));if(!cells.length)return;
var panes={};[].slice.call(document.querySelectorAll('.ph-pane')).forEach(function(p){panes[p.getAttribute('data-phase')]=p;});
var i=0;function step(){cells.forEach(function(c,j){c.classList.toggle('active',j===i);c.classList.toggle('past',j<i);});
var ph=cells[i].getAttribute('data-phase');Object.keys(panes).forEach(function(k){panes[k].style.display=k===ph?'':'none';});i=(i+1)%cells.length;}
step();var iv=setInterval(step,900);var rr=document.getElementById('rerun');if(rr)rr.addEventListener('click',function(){i=0;step();});})();
"""

# ── memory: hover a star → update the right rail ──
MEMORY_JS = """
(function(){var rail=document.getElementById('mem-rail');if(!rail)return;
var stars=[].slice.call(document.querySelectorAll('.star-hit'));
function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function sparkHtml(series){if(!series)return '';var v=series.split(',').map(Number);var mx=Math.max.apply(null,v.concat([1]));
var bars=v.map(function(n){return '<span style=\\"height:'+Math.max(1,n/mx*16)+'px\\"></span>';}).join('');
return '<div class=\\"label\\" style=\\"margin-bottom:6px\\">mentions over time</div><span class=\\"spark v\\" style=\\"height:16px;gap:2px\\">'+bars+'</span>';}
function projHtml(p){if(!p)return '';return '<div class=\\"label\\" style=\\"margin-bottom:8px\\">projects</div>'+p.split(',').map(function(t){return '<span class=\\"tag\\" style=\\"margin:0 4px 4px 0\\">'+esc(t)+'</span>';}).join('');}
function show(el){var d=el.dataset;var rows=[['magnitude',d.mag],['mentions',d.mentions],['last seen',d.last||'—'],['ra · dec',d.radec]];
rail.innerHTML='<div class=\\"nm\\">'+esc(d.name)+'</div>'+(d.role?'<div class=\\"label\\" style=\\"margin-top:4px\\">'+esc(d.role)+'</div>':'')+
rows.map(function(kv){return '<div class=\\"kv\\"><span class=\\"k\\">'+kv[0]+'</span><span class=\\"v\\">'+esc(kv[1])+'</span></div>';}).join('')+
'<div style=\\"margin-top:18px\\">'+sparkHtml(d.series)+'</div>'+'<div style=\\"margin-top:18px\\">'+projHtml(d.projects)+'</div>';}
stars.forEach(function(el){el.addEventListener('mouseenter',function(){show(el);
var halo=document.getElementById('halo');if(halo){halo.setAttribute('cx',el.getAttribute('data-cx'));halo.setAttribute('cy',el.getAttribute('data-cy'));halo.setAttribute('r',(+el.getAttribute('data-r')+6));halo.style.opacity=1;}});});
var chart=document.getElementById('mem-svg');if(chart)chart.addEventListener('mouseleave',function(){var halo=document.getElementById('halo');if(halo)halo.style.opacity=0;});
[].slice.call(document.querySelectorAll('.mem-legend .row')).forEach(function(row){var pid=row.getAttribute('data-proj');
row.addEventListener('mouseenter',function(){[].slice.call(document.querySelectorAll('[data-projlines]')).forEach(function(g){g.style.opacity=g.getAttribute('data-projlines')===pid?1:0.12;});});
row.addEventListener('mouseleave',function(){[].slice.call(document.querySelectorAll('[data-projlines]')).forEach(function(g){g.style.opacity=1;});});});
})();
"""
