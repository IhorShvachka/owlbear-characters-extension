import OBR from "@owlbear-rodeo/sdk";
import "./style.css";
import { readDnd5eJsonFile, type Dnd5eSheet } from "./dnd5e-import";

const KEY = "com.ihorshvachka.characters.sheets.prototype.v1";
type RecordSheet = { id: string; ownerId: string; ownerName: string; sheet: Dnd5eSheet; updatedAt: number };
type Player = { id: string; name: string; role: "GM" | "PLAYER" };
type Store = { sheets: RecordSheet[] };
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = '<header><div class="eyebrow">OWLBEAR RODEO · D&D 5E</div><h1>Листи персонажів</h1><p class="muted">Імпорт JSON та персональні листи.</p></header><div class="notice"><strong>Прототип:</strong> листи зберігаються у спільних метаданих кімнати. Приховування в інтерфейсі не забезпечує приватності. Не використовуй для секретних даних до підключення захищеного сервера.</div><div id="status" class="status">Підключення…</div><section id="gm-tools" class="panel hidden"><div class="section-title">ІМПОРТ JSON · ГМ</div><label>Файл персонажа D&D 5e<input id="file" type="file" accept=".json,application/json"></label><div id="preview" class="preview muted">Вибери JSON для попереднього перегляду.</div><label>Призначити гравцю<select id="owner"><option value="">Не призначено</option></select></label><button id="import" disabled>Імпортувати</button></section><section id="gm-list" class="panel hidden"><div class="section-title">УСІ ПЕРСОНАЖІ</div><div id="roster"></div></section><section class="panel"><div class="section-title">ЛИСТ ПЕРСОНАЖА</div><h2 id="sheet-name">Очікування даних…</h2><p id="sheet-meta" class="muted"></p><div id="empty" class="empty">ГМ ще не призначив тобі персонажа.</div><div id="sheet" class="hidden"><div id="stats" class="stats-grid"></div><div class="section-title subsection">ХАРАКТЕРИСТИКИ</div><div id="abilities" class="ability-grid"></div><div class="section-title subsection">БОЙОВІ ДАНІ</div><div class="fields"><label>Поточні HP<input id="hp" type="number" min="0"></label><label>Максимальні HP<input id="maxhp" type="number" min="0"></label><label>Клас обладунку<input id="ac" type="number" min="0"></label><label>Ініціатива<input id="initiative" type="number"></label><label>Швидкість<input id="speed"></label><label class="wide">Нотатки<textarea id="notes" rows="3"></textarea></label></div><button id="save">Зберегти зміни</button><div class="section-title subsection">НАВИЧКИ ТА РЯТУВАЛЬНІ КИДКИ</div><div id="skills" class="data-list"></div><div class="section-title subsection">СПОРЯДЖЕННЯ</div><div id="equipment" class="data-list"></div><div class="section-title subsection">ЗАКЛИНАННЯ</div><div id="spells" class="data-list"></div><div class="section-title subsection">УМІННЯ ТА РИСИ</div><div id="features" class="data-list"></div><details><summary>Оригінальний JSON</summary><pre id="raw"></pre></details></div></section><footer>D&D 5e · Підтримка інших форматів додаватиметься адаптерами.</footer>';

const $ = <T extends HTMLElement>(s: string) => app.querySelector<T>(s)!;
const status = $("#status");
const owner = $("#owner") as HTMLSelectElement;
const fileInput = $("#file") as HTMLInputElement;
const preview = $("#preview");
const importButton = $("#import") as HTMLButtonElement;
const roster = $("#roster");
let ready = false, isGM = false, playerId = "", pending: Dnd5eSheet | null = null, activeId = "";
let players: Player[] = [];
let store: Store = { sheets: [] };
const esc = (v: unknown): string => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"} as Record<string,string>)[c]!);
const say = (s: string) => { status.textContent = s; };
const active = () => store.sheets.find(s => s.id === activeId) || null;
const canEdit = (s: RecordSheet) => isGM || s.ownerId === playerId;
function renderOwners() {
  const prev = owner.value;
  owner.innerHTML = '<option value="">Не призначено</option>' + players.filter(p=>p.role!=="GM").map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join("");
  if (players.some(p=>p.id===prev)) owner.value=prev;
}
function renderRoster() {
  if (!isGM) return;
  if (!store.sheets.length) { roster.innerHTML='<p class="muted">Персонажів поки немає.</p>'; return; }
  roster.innerHTML=store.sheets.map(s=>'<article class="roster-item"><div><strong>'+esc(s.sheet.name)+'</strong><div class="muted">'+esc(s.ownerName||"Не призначено")+'</div></div><div class="roster-actions"><select data-owner="'+esc(s.id)+'" aria-label="Призначити гравця"><option value="">Не призначено</option>'+players.filter(p=>p.role!=="GM").map(p=>'<option value="'+esc(p.id)+'" '+(p.id===s.ownerId?'selected':'')+'>'+esc(p.name)+'</option>').join("")+'</select><button class="secondary" data-open="'+esc(s.id)+'">Відкрити</button><button class="danger" data-delete="'+esc(s.id)+'">Видалити</button></div></article>').join("");
}
function renderList(target: string, items: unknown[]) {
  const el=$(target);
  if (!items.length) { el.innerHTML='<p class="muted">Дані не розпізнані або відсутні.</p>'; return; }
  el.innerHTML=items.slice(0,100).map(item=>{
    if(typeof item==="string"||typeof item==="number") return '<div class="data-row">'+esc(item)+'</div>';
    const o=item&&typeof item==="object"?item as Record<string,unknown>:{};
    const name=o.name??o.label??o.title??o.definition??"Елемент", detail=o.description??o.quantity??o.notes??"";
    return '<div class="data-row"><strong>'+esc(typeof name==="object"?JSON.stringify(name):name)+'</strong><span class="muted">'+esc(typeof detail==="object"?JSON.stringify(detail):detail)+'</span></div>';
  }).join("");
}
function renderSheet() {
  const s=active();
  const empty=$("#empty"), panel=$("#sheet"), name=$("#sheet-name"), meta=$("#sheet-meta");
  if(!s) { name.textContent=isGM?"Вибери персонажа":"Немає призначеного листа"; meta.textContent=""; empty.classList.remove("hidden"); panel.classList.add("hidden"); return; }
  empty.classList.add("hidden"); panel.classList.remove("hidden");
  const d=s.sheet, editable=canEdit(s);
  name.textContent=d.name; meta.textContent=[d.race,d.className,d.level!==null?"Рівень "+d.level:""].filter(Boolean).join(" · ");
  $("#stats").innerHTML=[["HP",(d.hitPoints.current??"—")+" / "+(d.hitPoints.maximum??"—")],["КЗ",d.armorClass??"—"],["Ініціатива",d.initiative??"—"],["Бонус майстерності",d.proficiencyBonus??"—"]].map(x=>'<div class="stat-card"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong></div>').join("");
  const labels: Record<string,string>={str:"СИЛ",dex:"СПР",con:"СТІЛ",int:"ІНТ",wis:"МУД",cha:"ХАР"};
  $("#abilities").innerHTML=Object.entries(d.abilities).map(([k,v])=>'<div class="ability"><span>'+labels[k]+'</span><strong>'+(v??"—")+'</strong><small>'+(v===null?"—":((Math.floor((v-10)/2)>=0?"+":"")+Math.floor((v-10)/2)))+'</small></div>').join("");
  const fields: Array<[string,unknown]>=[["#hp",d.hitPoints.current],["#maxhp",d.hitPoints.maximum],["#ac",d.armorClass],["#initiative",d.initiative],["#speed",d.speed],["#notes",d.notes]];
  fields.forEach(([id,v])=>{const el=$(id) as HTMLInputElement|HTMLTextAreaElement;el.value=v===null||v===undefined?"":String(v);el.disabled=!editable;});
  ($("#save") as HTMLButtonElement).classList.toggle("hidden",!editable);
  $("#raw").textContent=JSON.stringify(d.raw,null,2);
  renderList("#skills",Object.entries(d.skills).map(([name,value])=>({name,value})));
  renderList("#equipment",d.equipment);renderList("#spells",d.spells);renderList("#features",d.features);
}
async function loadStore() {
  const metadata=await OBR.room.getMetadata(), value=metadata[KEY] as Store|undefined;
  store=value&&Array.isArray(value.sheets)?value:{sheets:[]};
  if(!isGM&&!store.sheets.some(s=>s.id===activeId&&s.ownerId===playerId)) activeId=store.sheets.find(s=>s.ownerId===playerId)?.id||"";
  if(isGM&&!store.sheets.some(s=>s.id===activeId)) activeId="";
  renderRoster();renderSheet();
}
async function saveStore() { await OBR.room.setMetadata({[KEY]:store}); }
fileInput.addEventListener("change",async()=>{
  pending=null;importButton.disabled=true;preview.textContent="Перевірка JSON…";
  const file=fileInput.files?.[0];if(!file)return;
  try{
    pending=await readDnd5eJsonFile(file);const d=pending;
    preview.className="preview";preview.innerHTML='<strong>'+esc(d.name)+'</strong><p class="muted">'+esc([d.race,d.className,d.level!==null?"Рівень "+d.level:""].filter(Boolean).join(" · "))+'</p><div class="preview-stats"><span>HP '+esc(d.hitPoints.current??"—")+'/'+esc(d.hitPoints.maximum??"—")+'</span><span>КЗ '+esc(d.armorClass??"—")+'</span><span>Навичок '+Object.keys(d.skills).length+'</span><span>Заклинань '+d.spells.length+'</span></div>';
    importButton.disabled=false;say("JSON перевірено. Признач гравця та імпортуй.");
  }catch(e){preview.textContent=e instanceof Error?e.message:"Не вдалося прочитати JSON.";say(preview.textContent);}
});
importButton.addEventListener("click",async()=>{
  if(!ready||!isGM||!pending)return;
  if(JSON.stringify(pending.raw).length>9000){say("JSON завеликий для метаданих кімнати. Імпорт скасовано: потрібне зовнішнє сховище.");return;}
  const p=players.find(x=>x.id===owner.value);
  const rec:RecordSheet={id:crypto.randomUUID(),ownerId:p?.id||"",ownerName:p?.name||"",sheet:pending,updatedAt:Date.now()};
  store.sheets.push(rec);activeId=rec.id;
  try{await saveStore();await loadStore();renderOwners();fileInput.value="";pending=null;importButton.disabled=true;preview.textContent="Вибери JSON для попереднього перегляду.";say("Персонажа імпортовано.");}
  catch{store.sheets=store.sheets.filter(s=>s.id!==rec.id);say("Не вдалося зберегти. Можливо, перевищено ліміт метаданих.");}
});
roster.addEventListener("click",async e=>{
  const t=e.target as HTMLElement, open=t.closest<HTMLButtonElement>("[data-open]"), del=t.closest<HTMLButtonElement>("[data-delete]");
  if(open?.dataset.open){activeId=open.dataset.open;renderSheet();}
  if(del?.dataset.delete&&isGM){store.sheets=store.sheets.filter(s=>s.id!==del.dataset.delete);if(activeId===del.dataset.delete)activeId="";try{await saveStore();await loadStore();say("Персонажа видалено.");}catch{say("Не вдалося видалити персонажа.");}}
});
roster.addEventListener("change",async e=>{
  const el=(e.target as HTMLElement).closest<HTMLSelectElement>("[data-owner]");if(!el||!isGM)return;
  const s=store.sheets.find(x=>x.id===el.dataset.owner);if(!s)return;
  const p=players.find(x=>x.id===el.value);s.ownerId=p?.id||"";s.ownerName=p?.name||"";s.updatedAt=Date.now();
  try{await saveStore();await loadStore();say("Призначення оновлено.");}catch{say("Не вдалося зберегти призначення.");}
});
$("#save").addEventListener("click",async()=>{
  const s=active();if(!s||!canEdit(s))return;
  const num=(id:string)=>{const v=($(id) as HTMLInputElement).value.trim();return v===""?null:Number(v);};
  s.sheet.hitPoints.current=num("#hp");s.sheet.hitPoints.maximum=num("#maxhp");s.sheet.armorClass=num("#ac");s.sheet.initiative=num("#initiative");
  s.sheet.speed=($("#speed") as HTMLInputElement).value;s.sheet.notes=($("#notes") as HTMLTextAreaElement).value;s.updatedAt=Date.now();
  try{await saveStore();renderSheet();say("Зміни збережено.");}catch{say("Не вдалося зберегти зміни.");}
});
OBR.onReady(async()=>{
  try{
    playerId=await OBR.player.getId();isGM=await OBR.player.getRole()==="GM";
    $("#gm-tools").classList.toggle("hidden",!isGM);$("#gm-list").classList.toggle("hidden",!isGM);
    players=(await OBR.party.getPlayers()).map(p=>({id:p.id,name:p.name,role:p.role}));renderOwners();ready=true;
    await loadStore();say(isGM?"Підключено як ГМ. Імпортуй JSON персонажа.":"Підключено. Показано лист, призначений твоєму профілю.");
    OBR.party.onChange(async()=>{players=(await OBR.party.getPlayers()).map(p=>({id:p.id,name:p.name,role:p.role}));renderOwners();renderRoster();});
    OBR.room.onMetadataChange(()=>{void loadStore().catch(e=>console.error(e));});
  }catch(e){console.error(e);say("Не вдалося ініціалізувати розширення.");}
});
