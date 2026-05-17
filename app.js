const API = "https://api.ouraring.com/v2/usercollection";

const el = id => document.getElementById(id);

function setStatus(msg){
  const s = document.getElementById("status");
  if(s) s.textContent = msg;
}

async function fetchJSON(endpoint, token){
  const res = await fetch(API + endpoint, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if(!res.ok){
    throw new Error("API greška: " + res.status);
  }

  return await res.json();
}

async function loadToday(){

  const token = localStorage.getItem("oura_token");

  if(!token){
    alert("Unesi token prvo.");
    return;
  }

  try {

    setStatus("Učitavanje...");

    const today = new Date().toISOString().slice(0,10);

    const sleep = await fetchJSON(
      `/sleep?start_date=${today}&end_date=${today}`,
      token
    );

    const readiness = await fetchJSON(
      `/daily_readiness?start_date=${today}&end_date=${today}`,
      token
    );

    const stress = await fetchJSON(
      `/daily_stress?start_date=${today}&end_date=${today}`,
      token
    );

    console.log(sleep);
    console.log(readiness);
    console.log(stress);

    setStatus("Podaci uspešno učitani ✅");

    alert("Radi! Pogledaj Console log.");

  } catch(err){

    console.error(err);

    setStatus("Greška: " + err.message);

    alert("Greška: " + err.message);
  }
}

window.onload = () => {

  const btn = document.querySelector("button");

  if(btn){
    btn.onclick = loadToday;
  }

};
