const modo =
localStorage.getItem("modo") || "local";

const API =
  modo === "cloud"
    ? "https://cashlessplay.vercel.app"
    : "http://localhost:3000";

console.log("MODO:", modo);
console.log("API:", API);

async function cargarDashboard(){

  try{

    const res =
    await fetch(
      `${API}/dashboard`
    );

    if(!res.ok){

      throw new Error(
        `HTTP ${res.status}`
      );

    }

    const data =
    await res.json();

    document.getElementById("ventas")
      .innerText =
      "$" + (data.ventas_total || 0);

    document.getElementById("recargas")
      .innerText =
      "$" + (data.recargas_total || 0);

    document.getElementById("usuarios")
      .innerText =
      data.usuarios || 0;

    document.getElementById("saldo")
      .innerText =
      "$" + (data.saldo_total || 0);

  }catch(err){

    console.error(
      "DASHBOARD ERROR:",
      err
    );

  }

}

cargarDashboard();