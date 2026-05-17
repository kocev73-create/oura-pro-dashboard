const API = "https://api.ouraring.com/v2/usercollection";
const el = id => document.getElementById(id);
let lastWeek = null;
let lastToday = null;

function isoDate(daysAgo=0){
  const d = new Date();
  d.setDate(d.getDate()-daysAgo);
  return d.toISOString().slice(0,10);
}
function setStatus(msg){ el("status").textContent = msg; }
function cls(score){
  if(score == null) return "";
  if(score >= 80) return "good";
  if(score >= 65) return "warn";
  return "bad";
}
async function oura(path, token){
  const res = await fetch(API + path, {headers:{Authorization:`Bearer ${token}`}});
  if(!res.ok) throw new Error(await res.text());
  return await res.json();
}
function token(){
  return localStorage.getItem("oura_token") || el("token").value.trim();
}
function noteKey(date=isoDate(0)){ return "oura_note_" + date; }

function saveNote(){
  const obj = {
    alcohol: el("alcohol").value,
    lateFood: el("lateFood").value,
    note: el("note").value.trim(),
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(noteKey(), JSON.stringify(obj));
  el("insight").textContent = "Beleška je sačuvana. Ponovo učitaj podatke za osvežen zaključak.";
}
function readNote(date=isoDate(0)){
  try { return JSON.parse(localStorage.getItem(noteKey(date)) || "{}"); }
  catch { return {}; }
}

function stressEstimate(readiness, sleep, note){
  let points = 0;
  const reasons = [];
  if((readiness?.score ?? 100) < 65){ points += 30; reasons.push("nizak readiness"); }
  if((sleep?.score ?? 100) < 70){ points += 25; reasons.push("lošiji san"); }
  const hrv = sleep?.average_hrv || readiness?.contributors?.hrv_balance;
  if(hrv && hrv < 30){ points += 20; reasons.push("nizak HRV"); }
  const hr = sleep?.lowest_heart_rate;
  if(hr && hr > 65){ points += 15; reasons.push("povišen puls tokom sna"); }
  if(note?.alcohol === "light") { points += 8; reasons.push("alkohol"); }
  if(note?.alcohol === "medium") { points += 18; reasons.push("alkohol"); }
  if(note?.alcohol === "heavy") { points += 30; reasons.push("više alkohola"); }
  if(note?.lateFood === "yes") { points += 8; reasons.push("kasna hrana"); }
  if(points >= 55) return {label:"Visok", class:"bad", points, reasons};
  if(points >= 30) return {label:"Srednji", class:"warn", points, reasons};
  return {label:"Nizak", class:"good", points, reasons};
}

function makeInsight(readiness, sleep, note){
  const s = stressEstimate(readiness, sleep, note);
  const r = readiness?.score, sl = sleep?.score, hrv = sleep?.average_hrv, hr = sleep?.lowest_heart_rate;
  const lines = [];

  if(r == null && sl == null) return "Nema dovoljno Oura podataka za danas.";

  if(r >= 80) lines.push("Telo danas izgleda dobro oporavljeno.");
  else if(r >= 65) lines.push("Oporavak je solidan, ali ne treba preterivati.");
  else lines.push("Danas je telo pod većim opterećenjem. Bolje lakši tempo, više vode i ranije spavanje.");

  if(sl != null && sl < 70) lines.push("San nije bio idealan, pa stres i puls mogu lakše da skoče.");
  if(hrv != null && hrv < 30) lines.push("HRV je nizak, što često ide uz umor, stres, alkohol, bolest ili loš oporavak.");
  if(hr != null && hr > 65) lines.push("Puls tokom sna je viši, što može značiti da telo još radi na oporavku.");
  if(note?.alcohol && note.alcohol !== "no") lines.push("Zabeležen je alkohol — prati sutra HRV, puls i readiness.");
  if(note?.lateFood === "yes") lines.push("Kasna hrana može pogoršati san i podići puls tokom noći.");
  if(note?.note) lines.push("Tvoja beleška: " + note.note);

  lines.push(`Procena stresa: ${s.label} (${s.points}/100).`);
  return lines.join(" ");
}

function setPills(readiness, sleep, stress){
  const pills = [];
  if(readiness?.score != null) pills.push(`<span class="pill ${cls(readiness.score)}">Readiness ${readiness.score}</span>`);
  if(sleep?.score != null) pills.push(`<span class="pill ${cls(sleep.score)}">Sleep ${sleep.score}</span>`);
  pills.push(`<span class="pill ${stress.class}">Stres ${stress.label}</span>`);
  el("pills").innerHTML = pills.join("");
}

async function loadToday(){
  const t = token();
  if(!t) return setStatus("Prvo unesi token.");
  setStatus("Učitavam...");
  const today = isoDate(0), yesterday = isoDate(1);
  try{
    const [rdata, sdata] = await Promise.all([
      oura(`/daily_readiness?start_date=${yesterday}&end_date=${today}`, t),
      oura(`/daily_sleep?start_date=${yesterday}&end_date=${today}`, t)
    ]);
    const readiness = rdata.data?.at(-1) || null;
    const sleep = sdata.data?.at(-1) || null;
    const note = readNote();
    const stress = stressEstimate(readiness, sleep, note);

    lastToday = {readiness, sleep, note, stress};

    el("todayGrid").classList.remove("hidden");
    el("readiness").textContent = readiness?.score ?? "—";
    el("readiness").className = cls(readiness?.score);
    el("sleep").textContent = sleep?.score ?? "—";
    el("sleep").className = cls(sleep?.score);
    el("hrv").textContent = sleep?.average_hrv ? sleep.average_hrv + " ms" : "—";
    el("hr").textContent = sleep?.lowest_heart_rate ? sleep.lowest_heart_rate + " bpm" : "—";
    el("stress").textContent = stress.label;
    el("stress").className = stress.class;
    el("redzone").textContent = (readiness?.score < 65 || sleep?.score < 65 || stress.points >= 55) ? "DA" : "NE";
    el("redzone").className = el("redzone").textContent === "DA" ? "bad" : "good";

    el("insight").textContent = makeInsight(readiness, sleep, note);
    setPills(readiness, sleep, stress);
    makeAlerts();
    el("raw").textContent = JSON.stringify(lastToday, null, 2);
    setStatus("Podaci učitani.");
  }catch(e){
    setStatus("Greška. Moguće je da lokalni fajl ili CodePen blokira Oura API. Najbolje rešenje je GitHub Pages online link.");
    el("raw").textContent = String(e);
  }
}

function drawChart(rows){
  const c = el("chart"), ctx = c.getContext("2d");
  ctx.clearRect(0,0,c.width,c.height);
  ctx.font = "13px -apple-system, BlinkMacSystemFont, Segoe UI";
  ctx.fillText("7 dana: Readiness / Sleep / HRV", 18, 24);

  const pad = 34, w = c.width - pad*2, h = c.height - 62;
  ctx.strokeStyle = "#ddd"; ctx.beginPath();
  ctx.moveTo(pad, 44); ctx.lineTo(pad, 44+h); ctx.lineTo(pad+w, 44+h); ctx.stroke();

  const series = [
    {key:"readiness", name:"Readiness"},
    {key:"sleep", name:"Sleep"},
    {key:"hrvScaled", name:"HRV"}
  ];
  series.forEach((ser, si)=>{
    ctx.beginPath();
    rows.forEach((r,i)=>{
      const x = pad + (w/(Math.max(rows.length-1,1))) * i;
      const val = r[ser.key];
      const y = 44 + h - (Math.max(0, Math.min(100, val || 0))/100)*h;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
    ctx.fillText(ser.name, pad + si*120, c.height-12);
  });
  rows.forEach((r,i)=>{
    const x = pad + (w/(Math.max(rows.length-1,1))) * i;
    ctx.fillText(r.date.slice(5), x-16, 44+h+18);
  });
}

async function loadWeek(){
  const t = token();
  if(!t) return setStatus("Prvo unesi token.");
  setStatus("Učitavam 7 dana...");
  try{
    const start = isoDate(7), end = isoDate(0);
    const [rdata, sdata] = await Promise.all([
      oura(`/daily_readiness?start_date=${start}&end_date=${end}`, t),
      oura(`/daily_sleep?start_date=${start}&end_date=${end}`, t)
    ]);
    const rmap = Object.fromEntries((rdata.data||[]).map(x=>[x.day, x]));
    const smap = Object.fromEntries((sdata.data||[]).map(x=>[x.day, x]));
    const rows = [];
    for(let i=6;i>=0;i--){
      const d = isoDate(i);
      const r = rmap[d], s = smap[d];
      rows.push({
        date:d,
        readiness:r?.score ?? null,
        sleep:s?.score ?? null,
        hrv:s?.average_hrv ?? null,
        hrvScaled:s?.average_hrv ? Math.min(100, s.average_hrv*2) : null,
        lowestHr:s?.lowest_heart_rate ?? null,
        note:readNote(d)
      });
    }
    lastWeek = rows;
    drawChart(rows);
    el("raw").textContent = JSON.stringify(rows, null, 2);
    makeAlerts();
    setStatus("Nedeljni podaci učitani.");
  }catch(e){
    setStatus("Greška pri učitavanju 7 dana.");
    el("raw").textContent = String(e);
  }
}

function average(arr){
  const vals = arr.filter(x=>x != null);
  return vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : null;
}

function makeReport(){
  if(!lastWeek){
    el("report").textContent = "Prvo klikni “Učitaj poslednjih 7 dana”.";
    return;
  }
  const avgR = average(lastWeek.map(x=>x.readiness));
  const avgS = average(lastWeek.map(x=>x.sleep));
  const avgHrv = average(lastWeek.map(x=>x.hrv));
  const badDays = lastWeek.filter(x=>(x.readiness??100)<65 || (x.sleep??100)<65).length;
  const alcoholDays = lastWeek.filter(x=>x.note?.alcohol && x.note.alcohol !== "no").length;

  let txt = `NEDELJNI OURA IZVEŠTAJ\n\n`;
  txt += `Prosečan readiness: ${avgR ?? "—"}\n`;
  txt += `Prosečan sleep score: ${avgS ?? "—"}\n`;
  txt += `Prosečan HRV: ${avgHrv ?? "—"} ms\n`;
  txt += `Broj slabijih dana: ${badDays}\n`;
  txt += `Dani sa alkoholom u beleškama: ${alcoholDays}\n\n`;

  if(badDays >= 3) txt += `Zaključak: Ove nedelje telo je više puta bilo u opterećenju. Preporuka: manje alkohola/kasne hrane, ranije spavanje i lakši tempo 1-2 dana.\n`;
  else txt += `Zaključak: Nedelja izgleda relativno stabilno. Prati trend HRV i puls tokom sna.\n`;

  txt += `\nDetalji po danima:\n`;
  lastWeek.forEach(x=>{
    txt += `${x.date}: Readiness ${x.readiness ?? "—"}, Sleep ${x.sleep ?? "—"}, HRV ${x.hrv ?? "—"} ms`;
    if(x.note?.note) txt += `, beleška: ${x.note.note}`;
    txt += `\n`;
  });
  el("report").textContent = txt;
}

function makeAlerts(){
  const alerts = [];
  if(lastToday){
    if(lastToday.stress.points >= 55) alerts.push("Danas je procena stresa visoka — smanji tempo ako možeš.");
    if(lastToday.sleep?.score < 65) alerts.push("San je u crvenoj zoni.");
    if(lastToday.readiness?.score < 65) alerts.push("Readiness je nizak — telo nije potpuno spremno.");
  }
  if(lastWeek){
    const low = lastWeek.filter(x=>(x.readiness??100)<65 || (x.sleep??100)<65).length;
    if(low >= 3) alerts.push("Tri ili više slabijih dana u poslednjih 7 dana — obrati pažnju na oporavak.");
  }
  el("alerts").innerHTML = alerts.length ? alerts.map(a=>`<div class="pill bad">${a}</div>`).join("") : "Nema ozbiljnih upozorenja za sada.";
}

el("saveToken").onclick = () => {
  const t = el("token").value.trim();
  if(!t) return setStatus("Nisi uneo token.");
  localStorage.setItem("oura_token", t);
  setStatus("Token sačuvan.");
};
el("clearToken").onclick = () => {
  localStorage.removeItem("oura_token");
  el("token").value = "";
  setStatus("Token obrisan.");
};
el("saveNote").onclick = saveNote;
el("loadToday").onclick = loadToday;
el("loadWeek").onclick = loadWeek;
el("makeReport").onclick = makeReport;

window.onload = () => {
  const t = localStorage.getItem("oura_token");
  if(t) el("token").value = t;
  const n = readNote();
  if(n.alcohol) el("alcohol").value = n.alcohol;
  if(n.lateFood) el("lateFood").value = n.lateFood;
  if(n.note) el("note").value = n.note;
};
