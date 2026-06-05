const API =
"https://api.cosmicpass.space";

async function cargarDashboard(){

  try{

    const res =
    await fetch(
      `${API}/dashboard`
    );

    const data =
    await res.json();

    document.getElementById("ventas")
      .innerText =
      "$" + data.ventas_total;

    document.getElementById("recargas")
      .innerText =
      "$" + data.recargas_total;

    document.getElementById("usuarios")
      .innerText =
      data.usuarios;

    document.getElementById("saldo")
      .innerText =
      "$" + data.saldo_total;

  }catch(err){

    console.error(
      "DASHBOARD ERROR:",
      err
    );

  }

}

cargarDashboard();