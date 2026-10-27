const SB_URL="https://ekioqxtazurafzyrnbxb.supabase.co";
const SB_KEY="sb_publishable_pEw21Cdi-Vd499oxX1488w_pguQ4W_I";
const STATUSES=[["todo","Te doen"],["bezig","Bezig"],["review","Review"],["klaar","Klaar"]];
const PRIO={hoog:"Hoog",normaal:"Normaal",laag:"Laag"};
const PRIO_ORDER={hoog:0,normaal:1,laag:2};
const COLORS=["#a8741a","#3b6fb0","#2f7d55","#8a4fb0","#c2412d","#2a8a8f","#6b7484"];
const PW_KEY="bounty-takenbord-pw";
const $=s=>document.querySelector(s);
let pw=null, tasks=[], team=[], filterWho="all", query="", editing=null, dragId=null, busy=false;

async function rpc(fn,args){
  const r=await fetch(SB_URL+"/rest/v1/rpc/"+fn,{method:"POST",headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":"application/json"},body:JSON.stringify({pw,...args})});
  const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
  if(!r.ok){const e=new Error((data&&data.message)||("HTTP "+r.status));e.wrongPw=(data&&data.message||"").includes("wrong_password");throw e}
  return data;
}
function store(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch{}}
function recall(k){try{return localStorage.getItem(k)}catch{return null}}

function toast(msg){const t=$("#toast");t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2400)}
function todayStr(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function fmtDate(s){if(!s)return"";const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d).toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}
function member(id){return team.find(m=>m.id===id)}
function initials(n){return (n||"?").split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase()}
function avatar(m){const el=document.createElement("span");el.className="av";if(!m){el.classList.add("none");el.textContent="?";return el}
  el.style.background=m.color||COLORS[0];el.textContent=initials(m.name);return el}
function isLate(t){return t.due && t.status!=="klaar" && t.due<todayStr()}
function tid(t){return "BS-"+String(t.nr).padStart(3,"0")}

// Login
async function login(p,remember){
  pw=p;
  try{const d=await rpc("bounty_load",{});apply(d);if(remember)store(PW_KEY,p);
    $("#login").hidden=true;$("#app").hidden=false;startPolling();return true}
  catch(e){pw=null;return e.wrongPw?"wrong":"net"}
}
$("#login-form").addEventListener("submit",async e=>{
  e.preventDefault();const btn=$("#login-btn"),err=$("#login-err");btn.disabled=true;err.hidden=true;btn.textContent="Bezig met inloggen…";
  const res=await login($("#l-pw").value,$("#l-remember").checked);
  btn.disabled=false;btn.textContent="Inloggen";
  if(res!==true){err.hidden=false;err.textContent=res==="wrong"?"Dit wachtwoord klopt niet. Vraag het teamwachtwoord aan Fabian.":"Geen verbinding met de server. Controleer je internet en probeer het opnieuw."}
});
$("#logout-btn").onclick=()=>{store(PW_KEY,null);pw=null;stopPolling();tasks=[];team=[];$("#app").hidden=true;$("#login").hidden=false;$("#l-pw").value=""};

// Data
function apply(d){tasks=d.tasks||[];team=d.team||[];render();if(!$("#team-panel").hidden)renderTeam()}
async function refresh(){if(!pw||busy)return;try{apply(await rpc("bounty_load",{}))}catch(e){if(e.wrongPw){toast("Het teamwachtwoord is gewijzigd. Log opnieuw in.");$("#logout-btn").click()}}}
let timer=null;
function startPolling(){stopPolling();timer=setInterval(()=>{if(document.visibilityState==="visible")refresh()},12000)}
function stopPolling(){if(timer)clearInterval(timer);timer=null}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refresh()});
async function act(fn,args,okMsg){busy=true;try{const r=await rpc(fn,args);busy=false;await refresh();if(okMsg)toast(okMsg);return r}
  catch(e){busy=false;toast(e.wrongPw?"Het teamwachtwoord klopt niet meer. Log opnieuw in.":"Opslaan mislukt. Controleer je verbinding en probeer het opnieuw.");throw e}}

function render(){
  $("#st-open").textContent=tasks.filter(t=>t.status!=="klaar").length;
  $("#st-bezig").textContent=tasks.filter(t=>t.status==="bezig").length;
  $("#st-late").textContent=tasks.filter(isLate).length;
  $("#st-klaar").textContent=tasks.filter(t=>t.status==="klaar").length;
  if(filterWho!=="all"&&filterWho!=="none"&&!member(filterWho))filterWho="all";
  const chips=$("#who-chips");chips.replaceChildren();
  const opts=[["all","Iedereen"],...team.map(m=>[m.id,m.name]),["none","Niet toegewezen"]];
  for(const [id,label] of opts){const b=document.createElement("button");b.type="button";b.className="chip";b.setAttribute("aria-pressed",String(filterWho===id));
    if(id!=="all"&&id!=="none")b.append(avatar(member(id)));b.append(label);b.onclick=()=>{filterWho=id;render()};chips.append(b)}
  const q=query.trim().toLowerCase();
  const vis=tasks.filter(t=>(filterWho==="all"||(filterWho==="none"?!member(t.assignee):t.assignee===filterWho))&&(!q||(t.title+" "+(t.descr||"")+" "+(t.category||"")+" "+tid(t)).toLowerCase().includes(q)));
  const board=$("#board");board.replaceChildren();
  for(const [s,label] of STATUSES){
    const list=vis.filter(t=>t.status===s).sort((a,b)=>(PRIO_ORDER[a.priority]??1)-(PRIO_ORDER[b.priority]??1)||(a.due||"9999").localeCompare(b.due||"9999")||a.nr-b.nr);
    const col=document.createElement("section");col.className="col";col.dataset.s=s;
    const h=document.createElement("div");h.className="col-h";h.innerHTML=`<h2><span class="dot"></span>${label}</h2><span class="count">${list.length}</span>`;col.append(h);
    col.addEventListener("dragover",e=>{if(!dragId)return;e.preventDefault();col.classList.add("drop")});
    col.addEventListener("dragleave",()=>col.classList.remove("drop"));
    col.addEventListener("drop",e=>{e.preventDefault();col.classList.remove("drop");if(dragId)moveTask(dragId,s);dragId=null});
    if(!list.length){const e=document.createElement("div");e.className="empty";e.textContent=tasks.length?"Geen taken hier.":"Nog geen taken.";col.append(e)}
    for(const t of list)col.append(card(t));
    if(s!=="klaar"){const add=document.createElement("button");add.type="button";add.className="add-inline";add.textContent="+ Taak toevoegen";add.onclick=()=>openTask(null,s);col.append(add)}
    board.append(col)
  }
}
function card(t){
  const c=document.createElement("button");c.type="button";c.className="card"+(t.priority==="hoog"&&t.status!=="klaar"?" top-prio":"");c.draggable=true;
  c.addEventListener("dragstart",e=>{dragId=t.id;c.classList.add("dragging");e.dataTransfer.effectAllowed="move";try{e.dataTransfer.setData("text/plain",t.id)}catch{}});
  c.addEventListener("dragend",()=>c.classList.remove("dragging"));
  c.onclick=()=>openTask(t);
  const top=document.createElement("div");top.className="card-top";
  const id=document.createElement("span");id.className="tid";id.textContent=tid(t);
  const p=document.createElement("span");p.className="pill p-"+(t.priority||"normaal");p.textContent=PRIO[t.priority]||"Normaal";
  top.append(id,p);
  const h=document.createElement("h3");h.textContent=t.title;
  const meta=document.createElement("div");meta.className="card-meta";
  const who=document.createElement("span");who.className="who";const m=member(t.assignee);who.append(avatar(m),document.createTextNode(m?m.name:"Niet toegewezen"));
  const right=document.createElement("div");right.className="tags";
  if(t.category){const cat=document.createElement("span");cat.className="cat";cat.textContent=t.category;right.append(cat)}
  if(t.due){const d=document.createElement("span");d.className="due"+(isLate(t)?" late":"");d.textContent=(isLate(t)?"Te laat · ":"")+fmtDate(t.due);right.append(d)}
  meta.append(who,right);c.append(top,h,meta);return c
}

function showPanel(id){$("#scrim").hidden=false;$(id).hidden=false}
function closePanels(){$("#scrim").hidden=true;$("#task-panel").hidden=true;$("#team-panel").hidden=true;editing=null}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=closePanels);
$("#scrim").onclick=closePanels;
document.addEventListener("keydown",e=>{if(e.key==="Escape")closePanels()});

function fillAssignee(sel){const s=$("#f-assignee");s.replaceChildren(new Option("Niet toegewezen",""));for(const m of team)s.append(new Option(m.name,m.id));s.value=member(sel)?sel:""}
function openTask(t,status){
  editing=t?t.id:null;
  $("#tp-title").textContent=t?"Taak "+tid(t):"Nieuwe taak";
  $("#f-title").value=t?.title||"";$("#f-desc").value=t?.descr||"";
  fillAssignee(t?.assignee||(filterWho!=="all"&&filterWho!=="none"?filterWho:""));
  $("#f-status").value=t?.status||status||"todo";$("#f-prio").value=t?.priority||"normaal";
  $("#f-due").value=t?.due||"";$("#f-cat").value=t?.category||"Plugin";
  $("#f-meta").textContent=t?.created_at?"Aangemaakt op "+new Date(t.created_at).toLocaleDateString("nl-NL",{day:"numeric",month:"long",year:"numeric"}):"";
  resetDel();$("#del-area").hidden=!t;
  showPanel("#task-panel");setTimeout(()=>$("#f-title").focus(),30)
}
function resetDel(){const a=$("#del-area");a.replaceChildren();const b=document.createElement("button");b.className="btn danger";b.type="button";b.textContent="Verwijderen";b.onclick=askDel;a.append(b)}
function askDel(){const a=$("#del-area");a.replaceChildren();const w=document.createElement("div");w.className="confirm";w.append("Zeker weten?");
  const y=document.createElement("button");y.type="button";y.className="btn danger";y.textContent="Ja, verwijder";y.onclick=delTask;
  const n=document.createElement("button");n.type="button";n.className="btn ghost";n.textContent="Nee";n.onclick=resetDel;w.append(y,n);a.append(w)}

$("#task-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const t={title:$("#f-title").value.trim(),descr:$("#f-desc").value.trim(),assignee:$("#f-assignee").value||"",status:$("#f-status").value,
    priority:$("#f-prio").value,due:$("#f-due").value||"",category:$("#f-cat").value};
  if(!t.title){$("#f-title").focus();return}
  if(editing)t.id=editing;
  const btn=$("#save-btn");btn.disabled=true;
  try{await act("bounty_save_task",{t},editing?"Taak opgeslagen":"Taak aangemaakt");closePanels()}catch{}finally{btn.disabled=false}
});
async function delTask(){if(!editing)return;try{await act("bounty_archive_task",{task_id:editing},"Taak verwijderd");closePanels()}catch{}}
async function moveTask(id,status){const t=tasks.find(x=>x.id===id);if(!t||t.status===status)return;
  t.status=status;render();try{await act("bounty_save_task",{t:{id,status}},"Verplaatst naar "+STATUSES.find(s=>s[0]===status)[1])}catch{}}

function renderTeam(){const l=$("#team-list");l.replaceChildren();
  if(!team.length){const e=document.createElement("p");e.className="hint";e.textContent="Nog geen teamleden. Voeg hieronder de eerste toe.";l.append(e)}
  for(const m of team){const r=document.createElement("div");r.className="team-row";r.append(avatar(m));
    const d=document.createElement("div");const b=document.createElement("b");b.textContent=m.name;const s=document.createElement("small");s.textContent=m.role||"";d.append(b,s);
    const open=tasks.filter(t=>t.assignee===m.id&&t.status!=="klaar").length;const ld=document.createElement("span");ld.className="load-row";ld.textContent=open+" open";
    const x=document.createElement("button");x.type="button";x.className="x";x.setAttribute("aria-label","Verwijder "+m.name);x.textContent="✕";
    x.onclick=()=>act("bounty_archive_member",{member_id:m.id},m.name+" verwijderd").catch(()=>{});
    r.append(d,ld,x);l.append(r)}}
$("#team-btn").onclick=()=>{renderTeam();showPanel("#team-panel")};
$("#team-form").addEventListener("submit",async e=>{e.preventDefault();const name=$("#m-name").value.trim();if(!name)return;
  try{await act("bounty_save_member",{m:{name,role:$("#m-role").value.trim(),color:COLORS[team.length%COLORS.length]}},name+" toegevoegd");$("#m-name").value="";$("#m-role").value=""}catch{}});
$("#pw-form").addEventListener("submit",async e=>{e.preventDefault();const np=$("#np").value;
  if(np.length<8){toast("Kies een wachtwoord van minstens 8 tekens.");return}
  try{await act("bounty_change_password",{new_pw:np});pw=np;if(recall(PW_KEY))store(PW_KEY,np);$("#np").value="";toast("Teamwachtwoord gewijzigd. Deel het nieuwe wachtwoord met je team.")}catch{}});

$("#new-btn").onclick=()=>openTask(null,"todo");
$("#q").addEventListener("input",e=>{query=e.target.value;render()});

(async()=>{const saved=recall(PW_KEY);if(saved){const r=await login(saved,true);if(r==="wrong")store(PW_KEY,null);if(r!==true){$("#login").hidden=false}}else $("#login").hidden=false})();
