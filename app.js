const SB_URL="https://ekioqxtazurafzyrnbxb.supabase.co";
const SB_KEY="sb_publishable_pEw21Cdi-Vd499oxX1488w_pguQ4W_I";
const STATUSES=[["todo","Te doen"],["bezig","Bezig"],["review","Review"],["klaar","Klaar"]];
const PRIO={hoog:"Hoog",normaal:"Normaal",laag:"Laag"};
const PRIO_ORDER={hoog:0,normaal:1,laag:2};
const COLORS=["#a8741a","#3b6fb0","#2f7d55","#8a4fb0","#c2412d","#2a8a8f","#6b7484"];
const PW_KEY="bounty-takenbord-pw", ME_KEY="bounty-takenbord-me";
const MAX_PDF=4*1024*1024, MAX_GIF=3*1024*1024;
const $=s=>document.querySelector(s);
let pw=null, me=null, tasks=[], team=[], filterWho="all", query="", editing=null, dragId=null, busy=false;
let detail={comments:[],attachments:[]}, detailKey="", notifs={unread:0,items:[]}, lightboxAtt=null;

/* ---------- Server ---------- */
async function rpc(fn,args){
  const r=await fetch(SB_URL+"/rest/v1/rpc/"+fn,{method:"POST",headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":"application/json"},body:JSON.stringify({pw,...args})});
  const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
  if(!r.ok){const e=new Error((data&&data.message)||("HTTP "+r.status));e.wrongPw=(data&&data.message||"").includes("wrong_password");e.status=r.status;throw e}
  return data;
}
function store(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch{}}
function recall(k){try{return localStorage.getItem(k)}catch{return null}}

/* ---------- Helpers ---------- */
function toast(msg){const t=$("#toast");t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2600)}
function todayStr(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function fmtDate(s){if(!s)return"";const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d).toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}
function ago(iso){const s=(Date.now()-new Date(iso))/1000;if(s<60)return"zojuist";if(s<3600)return Math.floor(s/60)+" min geleden";if(s<86400)return Math.floor(s/3600)+" uur geleden";
  if(s<172800)return"gisteren";return new Date(iso).toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}
function member(id){return team.find(m=>m.id===id)}
function nameOf(id){return member(id)?.name||"Iemand"}
function initials(n){return (n||"?").split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase()}
function avatar(m){const el=document.createElement("span");el.className="av";if(!m){el.classList.add("none");el.textContent="?";return el}
  el.style.background=m.color||COLORS[0];el.textContent=initials(m.name);return el}
function isLate(t){return t.due && t.status!=="klaar" && t.due<todayStr()}
function tid(t){return "BS-"+String(t.nr).padStart(3,"0")}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function escRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
const ICON_CMT='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const ICON_ATT='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>';

/* ---------- Inloggen + wie ben jij ---------- */
async function login(p,remember){
  pw=p;
  try{const d=await rpc("bounty_load",{});apply(d);if(remember)store(PW_KEY,p);
    $("#login").hidden=true;$("#app").hidden=false;me=recall(ME_KEY);
    if(!member(me))askWho();else{renderMe();loadNotifs()}
    startPolling();return true}
  catch(e){pw=null;return e.wrongPw?"wrong":"net"}
}
$("#login-form").addEventListener("submit",async e=>{
  e.preventDefault();const btn=$("#login-btn"),err=$("#login-err");btn.disabled=true;err.hidden=true;btn.textContent="Bezig met inloggen…";
  const res=await login($("#l-pw").value,$("#l-remember").checked);
  btn.disabled=false;btn.textContent="Inloggen";
  if(res!==true){err.hidden=false;err.textContent=res==="wrong"?"Dit wachtwoord klopt niet. Vraag het teamwachtwoord aan Fabian.":"Geen verbinding met de server. Controleer je internet en probeer het opnieuw."}
});
$("#logout-btn").onclick=()=>{store(PW_KEY,null);pw=null;stopPolling();tasks=[];team=[];closeAll();$("#app").hidden=true;$("#login").hidden=false;$("#l-pw").value=""};

function askWho(){const p=$("#who-pick");p.replaceChildren();
  for(const m of team){const b=el("button");b.type="button";b.setAttribute("aria-pressed",String(m.id===me));b.append(avatar(m),m.name);
    b.onclick=()=>{me=m.id;store(ME_KEY,me);$("#who-modal").hidden=true;renderMe();loadNotifs();render();toast("Hoi "+m.name+"!")};p.append(b)}
  $("#who-modal").hidden=false}
$("#me-btn").onclick=askWho;
function renderMe(){const b=$("#me-btn");b.replaceChildren(avatar(member(me)),member(me)?.name||"Kies wie je bent")}

/* ---------- Data verversen ---------- */
function apply(d){tasks=d.tasks||[];team=d.team||[];render();if(!$("#team-panel").hidden)renderTeam();if(me&&!member(me)&&!$("#app").hidden){me=null;store(ME_KEY,null);askWho()}}
async function refresh(){if(!pw||busy)return;
  try{apply(await rpc("bounty_load",{}));loadNotifs();
    if(editing&&!$("#task-panel").hidden&&!$("#cmt-in").value)loadDetail(editing,true)}
  catch(e){if(e.wrongPw){toast("Het teamwachtwoord is gewijzigd. Log opnieuw in.");$("#logout-btn").click()}}}
let timer=null;
function startPolling(){stopPolling();timer=setInterval(()=>{if(document.visibilityState==="visible")refresh()},12000)}
function stopPolling(){if(timer)clearInterval(timer);timer=null}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refresh()});
async function act(fn,args,okMsg){busy=true;try{const r=await rpc(fn,args);busy=false;await refresh();if(okMsg)toast(okMsg);return r}
  catch(e){busy=false;toast(e.wrongPw?"Het teamwachtwoord klopt niet meer. Log opnieuw in.":e.status===413?"Dit bestand is te groot om te uploaden.":"Opslaan mislukt. Controleer je verbinding en probeer het opnieuw.");throw e}}

/* ---------- Bord ---------- */
function render(){
  $("#st-open").textContent=tasks.filter(t=>t.status!=="klaar").length;
  $("#st-bezig").textContent=tasks.filter(t=>t.status==="bezig").length;
  $("#st-late").textContent=tasks.filter(isLate).length;
  $("#st-klaar").textContent=tasks.filter(t=>t.status==="klaar").length;
  if(filterWho!=="all"&&filterWho!=="none"&&!member(filterWho))filterWho="all";
  const chips=$("#who-chips");chips.replaceChildren();
  const opts=[["all","Iedereen"],...team.map(m=>[m.id,m.name]),["none","Niet toegewezen"]];
  for(const [id,label] of opts){const b=el("button","chip");b.type="button";b.setAttribute("aria-pressed",String(filterWho===id));
    if(id!=="all"&&id!=="none")b.append(avatar(member(id)));b.append(label);b.onclick=()=>{filterWho=id;render()};chips.append(b)}
  const q=query.trim().toLowerCase();
  const vis=tasks.filter(t=>(filterWho==="all"||(filterWho==="none"?!member(t.assignee):t.assignee===filterWho))&&(!q||(t.title+" "+(t.descr||"")+" "+(t.category||"")+" "+tid(t)).toLowerCase().includes(q)));
  const board=$("#board");board.replaceChildren();
  for(const [s,label] of STATUSES){
    const list=vis.filter(t=>t.status===s).sort((a,b)=>(PRIO_ORDER[a.priority]??1)-(PRIO_ORDER[b.priority]??1)||(a.due||"9999").localeCompare(b.due||"9999")||a.nr-b.nr);
    const col=el("section","col");col.dataset.s=s;
    const h=el("div","col-h");h.innerHTML=`<h2><span class="dot"></span>${label}</h2><span class="count">${list.length}</span>`;col.append(h);
    col.addEventListener("dragover",e=>{if(!dragId)return;e.preventDefault();col.classList.add("drop")});
    col.addEventListener("dragleave",()=>col.classList.remove("drop"));
    col.addEventListener("drop",e=>{e.preventDefault();col.classList.remove("drop");if(dragId)moveTask(dragId,s);dragId=null});
    if(!list.length)col.append(el("div","empty",tasks.length?"Geen taken hier.":"Nog geen taken."));
    for(const t of list)col.append(card(t));
    if(s!=="klaar"){const add=el("button","add-inline","+ Taak toevoegen");add.type="button";add.onclick=()=>openTask(null,s);col.append(add)}
    board.append(col)
  }
}
function card(t){
  const c=el("button","card"+(t.priority==="hoog"&&t.status!=="klaar"?" top-prio":""));c.type="button";c.draggable=true;
  c.addEventListener("dragstart",e=>{dragId=t.id;c.classList.add("dragging");e.dataTransfer.effectAllowed="move";try{e.dataTransfer.setData("text/plain",t.id)}catch{}});
  c.addEventListener("dragend",()=>c.classList.remove("dragging"));
  c.onclick=()=>openTask(t);
  const top=el("div","card-top");
  const p=el("span","pill p-"+(t.priority||"normaal"),PRIO[t.priority]||"Normaal");
  top.append(el("span","tid",tid(t)),p);
  const meta=el("div","card-meta");
  const who=el("span","who");const m=member(t.assignee);who.append(avatar(m),document.createTextNode(m?m.name:"Niet toegewezen"));
  const right=el("div","tags");
  if(t.category)right.append(el("span","cat",t.category));
  if(t.due)right.append(el("span","due"+(isLate(t)?" late":""),(isLate(t)?"Te laat · ":"")+fmtDate(t.due)));
  meta.append(who,right);
  c.append(top,el("h3",null,t.title),meta);
  if(t.comment_count||t.attachment_count){const cc=el("div","card-counts");
    if(t.comment_count){const s=el("span");s.innerHTML=ICON_CMT;s.append(String(t.comment_count));s.title=t.comment_count+" reacties";cc.append(s)}
    if(t.attachment_count){const s=el("span");s.innerHTML=ICON_ATT;s.append(String(t.attachment_count));s.title=t.attachment_count+" bijlagen";cc.append(s)}
    c.append(cc)}
  return c
}

/* ---------- Panelen ---------- */
function showPanel(id){$("#scrim").hidden=false;$(id).hidden=false}
function closePanels(){$("#scrim").hidden=true;$("#task-panel").hidden=true;$("#team-panel").hidden=true;editing=null;detailKey="";hideMentions()}
function closeAll(){closePanels();closeNotif();closeLightbox()}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=closePanels);
$("#scrim").onclick=closePanels;
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;
  if(!$("#mention-menu").hidden)return;
  if(!$("#lightbox").hidden)closeLightbox();else if(!$("#notif").hidden)closeNotif();else closePanels()});

function fillAssignee(sel){const s=$("#f-assignee");s.replaceChildren(new Option("Niet toegewezen",""));for(const m of team)s.append(new Option(m.name,m.id));s.value=member(sel)?sel:""}
function openTask(t,status){
  closeNotif();
  editing=t?t.id:null;detailKey="";
  $("#tp-title").textContent=t?"Taak "+tid(t):"Nieuwe taak";
  $("#f-title").value=t?.title||"";$("#f-desc").value=t?.descr||"";
  fillAssignee(t?t.assignee:(filterWho!=="all"&&filterWho!=="none"?filterWho:""));
  $("#f-status").value=t?.status||status||"todo";$("#f-prio").value=t?.priority||"normaal";
  $("#f-due").value=t?.due||"";$("#f-cat").value=t?.category||"Plugin";
  $("#f-meta").textContent=t?.created_at?"Aangemaakt op "+new Date(t.created_at).toLocaleDateString("nl-NL",{day:"numeric",month:"long",year:"numeric"}):"";
  resetDel();$("#del-area").hidden=!t;
  $("#extras").hidden=!t;$("#extras-hint").hidden=!!t;
  $("#cmt-in").value="";
  if(t){detail={comments:[],attachments:[]};renderDetail();loadDetail(t.id)}
  showPanel("#task-panel");$("#tp-body").scrollTop=0;
  if(!t)setTimeout(()=>$("#f-title").focus(),30)
}
function resetDel(){const a=$("#del-area");a.replaceChildren();const b=el("button","btn danger","Verwijderen");b.type="button";b.onclick=askDel;a.append(b)}
function askDel(){const a=$("#del-area");a.replaceChildren();const w=el("div","confirm");w.append("Zeker weten?");
  const y=el("button","btn danger","Ja, verwijder");y.type="button";y.onclick=delTask;
  const n=el("button","btn ghost","Nee");n.type="button";n.onclick=resetDel;w.append(y,n);a.append(w)}

$("#task-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const t={title:$("#f-title").value.trim(),descr:$("#f-desc").value.trim(),assignee:$("#f-assignee").value||"",status:$("#f-status").value,
    priority:$("#f-prio").value,due:$("#f-due").value||"",category:$("#f-cat").value,actor:me||""};
  if(!t.title){$("#f-title").focus();return}
  const wasNew=!editing;if(editing)t.id=editing;
  const btn=$("#save-btn");btn.disabled=true;
  try{const id=await act("bounty_save_task",{t},wasNew?"Taak aangemaakt. Je kunt nu foto's toevoegen en reageren.":"Taak opgeslagen");
    if(wasNew){const nt=tasks.find(x=>x.id===id);if(nt)openTask(nt);else closePanels()}else closePanels()}
  catch{}finally{btn.disabled=false}
});
async function delTask(){if(!editing)return;try{await act("bounty_archive_task",{task_id:editing},"Taak verwijderd");closePanels()}catch{}}
async function moveTask(id,status){const t=tasks.find(x=>x.id===id);if(!t||t.status===status)return;
  t.status=status;render();try{await act("bounty_save_task",{t:{id,status,actor:me||""}},"Verplaatst naar "+STATUSES.find(s=>s[0]===status)[1])}catch{}}

/* ---------- Reacties + bijlagen ---------- */
async function loadDetail(id,quiet){
  try{const d=await rpc("bounty_task_detail",{task_id:id});if(editing!==id)return;
    const key=JSON.stringify([d.comments.map(c=>c.id),d.attachments.map(a=>a.id)]);
    if(quiet&&key===detailKey)return;detailKey=key;detail=d;renderDetail()}
  catch(e){if(!quiet)toast("Reacties en bijlagen laden mislukt.")}
}
function renderBody(text){const frag=document.createDocumentFragment();
  const names=team.map(m=>m.name).sort((a,b)=>b.length-a.length);
  if(!names.length){frag.append(text);return frag}
  const re=new RegExp("@("+names.map(escRe).join("|")+")(?![\\p{L}\\p{N}_])","giu");let last=0,m;
  while((m=re.exec(text))){frag.append(text.slice(last,m.index));frag.append(el("span","mention","@"+m[1]));last=m.index+m[0].length}
  frag.append(text.slice(last));return frag}
function renderDetail(){
  const list=$("#comments");list.replaceChildren();$("#cmt-count").textContent=detail.comments.length;
  if(!detail.comments.length)list.append(el("p","hint","Nog geen reacties. Stel een vraag of geef een update."));
  for(const c of detail.comments){const row=el("div","cmt");row.append(avatar(member(c.author)));
    const b=el("div","cmt-b");const meta=el("div","cmt-meta");meta.append(el("b",null,nameOf(c.author)),el("span",null,ago(c.created_at)));
    if(c.author&&c.author===me){const x=el("button","cmt-x","Verwijderen");x.type="button";
      x.onclick=async()=>{if(x.dataset.sure){try{await act("bounty_archive_comment",{comment_id:c.id},"Reactie verwijderd");loadDetail(editing)}catch{}}else{x.dataset.sure="1";x.textContent="Zeker weten?";setTimeout(()=>{delete x.dataset.sure;x.textContent="Verwijderen"},3000)}};meta.append(x)}
    const p=el("p","cmt-text");p.append(renderBody(c.body));b.append(meta,p);row.append(b);list.append(row)}
  const th=$("#thumbs");[...th.querySelectorAll(".thumb:not(.loading)")].forEach(n=>n.remove());$("#att-count").textContent=detail.attachments.length;
  const firstLoading=th.querySelector(".thumb.loading");
  for(const a of detail.attachments){const b=el("button","thumb");b.type="button";b.title=a.name+" · "+nameOf(a.author)+" · "+ago(a.created_at);
    if(a.thumb){const i=el("img");i.src=a.thumb;i.alt=a.name;i.loading="lazy";b.append(i)}else b.append(el("span","file",(a.mime==="application/pdf"?"PDF · ":"")+a.name));
    b.onclick=()=>openAttachment(a);th.insertBefore(b,firstLoading)}
}
async function openAttachment(a){
  try{const d=await rpc("bounty_get_attachment",{attachment_id:a.id});if(!d){toast("Deze bijlage bestaat niet meer.");return}
    if(d.mime==="application/pdf"){const blob=await (await fetch(d.data)).blob();const url=URL.createObjectURL(blob);const l=el("a");l.href=url;l.target="_blank";l.rel="noopener";l.download=d.name;document.body.append(l);l.click();l.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return}
    lightboxAtt=a;$("#lb-img").src=d.data;$("#lb-img").alt=d.name;$("#lb-name").textContent=d.name+" · "+nameOf(a.author);$("#lightbox").hidden=false}
  catch{toast("Openen mislukt. Probeer het opnieuw.")}
}
function closeLightbox(){$("#lightbox").hidden=true;$("#lb-img").removeAttribute("src");lightboxAtt=null;const d=$("#lb-del");d.textContent="Verwijderen";delete d.dataset.sure}
$("#lb-close").onclick=closeLightbox;
$("#lightbox").addEventListener("click",e=>{if(e.target.id==="lightbox")closeLightbox()});
$("#lb-del").onclick=async()=>{const d=$("#lb-del");if(!lightboxAtt)return;
  if(!d.dataset.sure){d.dataset.sure="1";d.textContent="Zeker weten?";return}
  try{await act("bounty_archive_attachment",{attachment_id:lightboxAtt.id},"Bijlage verwijderd");closeLightbox();loadDetail(editing)}catch{}};

// Uploaden
$("#att-add").onclick=()=>$("#file-in").click();
$("#drop-zone").onclick=()=>$("#file-in").click();
$("#file-in").addEventListener("change",e=>{uploadFiles([...e.target.files]);e.target.value=""});
const dz=$("#drop-zone");
dz.addEventListener("dragover",e=>{e.preventDefault();dz.classList.add("over")});
dz.addEventListener("dragleave",()=>dz.classList.remove("over"));
dz.addEventListener("drop",e=>{e.preventDefault();dz.classList.remove("over");uploadFiles([...e.dataTransfer.files])});
$("#tp-body").addEventListener("paste",e=>{if(!editing)return;const f=[...(e.clipboardData?.files||[])];if(f.length){e.preventDefault();uploadFiles(f)}});

function readURL(file){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);r.readAsDataURL(file)})}
function loadImg(src){return new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=src})}
function scaled(img,max,q){const r=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement("canvas");
  c.width=Math.max(1,Math.round(img.naturalWidth*r));c.height=Math.max(1,Math.round(img.naturalHeight*r));const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);return c.toDataURL("image/jpeg",q)}
async function prepare(file){
  const isPdf=file.type==="application/pdf"||/\.pdf$/i.test(file.name);
  if(isPdf){if(file.size>MAX_PDF)throw new Error("PDF's mogen maximaal 4 MB zijn.");return {mime:"application/pdf",data:await readURL(file),thumb:null,size:file.size}}
  if(!file.type.startsWith("image/"))throw new Error("Alleen foto's en PDF's kunnen worden toegevoegd.");
  const src=await readURL(file);let img;try{img=await loadImg(src)}catch{throw new Error("Deze foto kan je browser niet openen. Probeer JPG of PNG.")}
  const thumb=scaled(img,320,.72);
  if(file.type==="image/gif"&&file.size<=MAX_GIF)return {mime:"image/gif",data:src,thumb,size:file.size};
  const data=scaled(img,1800,.84);return {mime:"image/jpeg",data,thumb,size:Math.round(data.length*.75)}
}
async function uploadFiles(files){
  if(!editing||!files.length)return;const taskId=editing;
  for(const f of files){
    const ph=el("div","thumb loading","Uploaden…");$("#thumbs").append(ph);
    try{const p=await prepare(f);
      const name=f.type==="image/gif"||p.mime==="application/pdf"?f.name:f.name.replace(/\.[^.]+$/,"")+".jpg";
      busy=true;await rpc("bounty_add_attachment",{task_id:taskId,author:me,name:name.slice(0,200)||"foto.jpg",mime:p.mime,size_bytes:p.size,thumb:p.thumb,data:p.data});busy=false;
      toast(f.name+" toegevoegd")}
    catch(e){busy=false;toast(e.status===413?"Dit bestand is te groot om te uploaden.":e.status?"Uploaden mislukt. Probeer het opnieuw.":e.message)}
    finally{ph.remove()}
  }
  if(editing===taskId){detailKey="";await loadDetail(taskId)}refresh()
}

// Reageren met @-taggen
const cmtIn=$("#cmt-in"),menu=$("#mention-menu");let menuItems=[],menuSel=0,menuStart=-1;
function mentionQuery(){const pos=cmtIn.selectionStart,before=cmtIn.value.slice(0,pos);const m=/(^|\s)@([^\s@]*)$/.exec(before);
  return m?{start:pos-m[2].length-1,q:m[2].toLowerCase()}:null}
function updateMentions(){const mq=mentionQuery();if(!mq){hideMentions();return}
  menuItems=team.filter(t=>t.name.toLowerCase().startsWith(mq.q)||t.name.toLowerCase().includes(mq.q)).slice(0,8);
  if(!menuItems.length){hideMentions();return}
  menuStart=mq.start;menuSel=Math.min(menuSel,menuItems.length-1);menu.replaceChildren();
  menuItems.forEach((m,i)=>{const b=el("button");b.type="button";b.setAttribute("role","option");b.setAttribute("aria-selected",String(i===menuSel));
    b.append(avatar(m),m.name);if(m.role){const r=el("span","hint",m.role);r.style.marginLeft="auto";b.append(r)}
    b.addEventListener("mousedown",e=>{e.preventDefault();pickMention(i)});menu.append(b)});
  menu.hidden=false}
function hideMentions(){menu.hidden=true;menuItems=[];menuSel=0;menuStart=-1}
function pickMention(i){const m=menuItems[i];if(!m)return;const v=cmtIn.value,pos=cmtIn.selectionStart;
  const ins="@"+m.name+" ";cmtIn.value=v.slice(0,menuStart)+ins+v.slice(pos);const np=menuStart+ins.length;cmtIn.setSelectionRange(np,np);hideMentions();cmtIn.focus()}
cmtIn.addEventListener("input",()=>{menuSel=0;updateMentions()});
cmtIn.addEventListener("click",updateMentions);
cmtIn.addEventListener("blur",()=>setTimeout(hideMentions,150));
cmtIn.addEventListener("keydown",e=>{
  if(!menu.hidden&&menuItems.length){
    if(e.key==="ArrowDown"){e.preventDefault();menuSel=(menuSel+1)%menuItems.length;updateMentions();return}
    if(e.key==="ArrowUp"){e.preventDefault();menuSel=(menuSel-1+menuItems.length)%menuItems.length;updateMentions();return}
    if(e.key==="Enter"||e.key==="Tab"){e.preventDefault();pickMention(menuSel);return}
    if(e.key==="Escape"){e.preventDefault();e.stopPropagation();hideMentions();return}}
  if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){e.preventDefault();sendComment()}});
$("#cmt-send").onclick=sendComment;
async function sendComment(){
  const body=cmtIn.value.trim();if(!body||!editing)return;
  if(!member(me)){askWho();return}
  const mentions=team.filter(m=>new RegExp("@"+escRe(m.name)+"(?![\\p{L}\\p{N}_])","iu").test(body)).map(m=>m.id);
  const btn=$("#cmt-send");btn.disabled=true;
  try{await act("bounty_add_comment",{task_id:editing,author:me,body,mentions},mentions.length?"Reactie geplaatst, "+mentions.map(nameOf).join(", ")+" krijgt een melding":"Reactie geplaatst");
    cmtIn.value="";detailKey="";await loadDetail(editing);const l=$("#comments");l.lastElementChild?.scrollIntoView({block:"nearest"})}
  catch{}finally{btn.disabled=false}
}

/* ---------- Meldingen ---------- */
async function loadNotifs(){if(!member(me))return;
  try{notifs=await rpc("bounty_notifications_for",{member:me});renderBadge();if(!$("#notif").hidden)renderNotifs()}catch{}}
function renderBadge(){const b=$("#bell-badge");b.hidden=!notifs.unread;b.textContent=notifs.unread>99?"99+":notifs.unread;
  document.title=(notifs.unread?"("+notifs.unread+") ":"")+"Bounty SMP Takenbord";
  $("#bell").setAttribute("aria-label",notifs.unread?"Meldingen, "+notifs.unread+" ongelezen":"Meldingen")}
function notifText(n){const a=nameOf(n.actor),t=n.nr?"BS-"+String(n.nr).padStart(3,"0"):"een taak";
  return {mention:a+" heeft je getagd in "+t,comment:a+" reageerde op jouw taak "+t,assigned:a+" heeft "+t+" aan je toegewezen",upload:a+" voegde een bijlage toe aan "+t}[n.kind]||a+" deed iets in "+t}
function renderNotifs(){const l=$("#notif-list");l.replaceChildren();
  if(!notifs.items.length){l.append(el("div","n-empty","Nog geen meldingen. Je krijgt er een als iemand je tagt, op je taak reageert of je iets toewijst."));return}
  for(const n of notifs.items){const b=el("button","n-item"+(n.read?"":" unread"));b.type="button";b.append(avatar(member(n.actor)));
    const body=el("div","n-body");body.append(el("span",null,notifText(n)));
    if(n.snippet){body.append(el("q",null,"“"+n.snippet+"”"))}else if(n.title)body.append(el("q",null,n.title));
    body.append(el("span","n-time",ago(n.created_at)));b.append(body);if(!n.read)b.append(el("span","n-dot"));
    b.onclick=async()=>{if(!n.read){n.read=true;notifs.unread=Math.max(0,notifs.unread-1);renderBadge();rpc("bounty_mark_read",{member:me,ids:[n.id]}).catch(()=>{})}
      const t=tasks.find(x=>x.id===n.task_id);closeNotif();if(t)openTask(t);else toast("Deze taak bestaat niet meer.")};
    l.append(b)}}
function placeNotif(){const r=$("#bell").getBoundingClientRect();$("#notif").style.top=Math.round(r.bottom+8)+"px";
  $("#notif").style.maxHeight="calc(100vh - "+Math.round(r.bottom+24)+"px)"}
window.addEventListener("resize",()=>{if(!$("#notif").hidden)placeNotif()});
window.addEventListener("scroll",()=>{if(!$("#notif").hidden)placeNotif()},{passive:true});
function openNotif(){if(!member(me)){askWho();return}renderNotifs();placeNotif();$("#notif").hidden=false;$("#bell").setAttribute("aria-expanded","true");loadNotifs()}
function closeNotif(){$("#notif").hidden=true;$("#bell").setAttribute("aria-expanded","false")}
$("#bell").onclick=e=>{e.stopPropagation();$("#notif").hidden?openNotif():closeNotif()};
document.addEventListener("click",e=>{if(!$("#notif").hidden&&!e.target.closest("#notif")&&!e.target.closest("#bell"))closeNotif()});
$("#notif-all").onclick=async()=>{if(!notifs.unread)return;notifs.items.forEach(n=>n.read=true);notifs.unread=0;renderBadge();renderNotifs();
  try{await rpc("bounty_mark_read",{member:me,ids:null})}catch{}};

/* ---------- Team ---------- */
function renderTeam(){const l=$("#team-list");l.replaceChildren();
  if(!team.length)l.append(el("p","hint","Nog geen teamleden. Voeg hieronder de eerste toe."));
  for(const m of team){const r=el("div","team-row");r.append(avatar(m));
    const d=el("div");d.append(el("b",null,m.name+(m.id===me?" (jij)":"")),el("small",null,m.role||""));
    const open=tasks.filter(t=>t.assignee===m.id&&t.status!=="klaar").length;
    const x=el("button","x","✕");x.type="button";x.setAttribute("aria-label","Verwijder "+m.name);
    x.onclick=()=>{if(!x.dataset.sure){x.dataset.sure="1";x.textContent="Zeker?";setTimeout(()=>{delete x.dataset.sure;x.textContent="✕"},3000);return}
      act("bounty_archive_member",{member_id:m.id},m.name+" verwijderd").catch(()=>{})};
    r.append(d,el("span","load-row",open+" open"),x);l.append(r)}}
$("#team-btn").onclick=()=>{renderTeam();showPanel("#team-panel")};
$("#team-form").addEventListener("submit",async e=>{e.preventDefault();const name=$("#m-name").value.trim();if(!name)return;
  try{await act("bounty_save_member",{m:{name,role:$("#m-role").value.trim(),color:COLORS[team.length%COLORS.length]}},name+" toegevoegd");$("#m-name").value="";$("#m-role").value=""}catch{}});
$("#pw-form").addEventListener("submit",async e=>{e.preventDefault();const np=$("#np").value;
  if(np.length<8){toast("Kies een wachtwoord van minstens 8 tekens.");return}
  try{await act("bounty_change_password",{new_pw:np});pw=np;if(recall(PW_KEY))store(PW_KEY,np);$("#np").value="";toast("Teamwachtwoord gewijzigd. Deel het nieuwe wachtwoord met je team.")}catch{}});

$("#new-btn").onclick=()=>openTask(null,"todo");
$("#q").addEventListener("input",e=>{query=e.target.value;render()});

(async()=>{const saved=recall(PW_KEY);if(saved){const r=await login(saved,true);if(r==="wrong")store(PW_KEY,null);if(r!==true)$("#login").hidden=false}else $("#login").hidden=false})();
