const modo = localStorage.getItem("modo") || "local";

const API =
  modo === "cloud"
    ? "https://cashlessplay.vercel.app"
    : "http://localhost:3000";

const money = valor =>
  Number(valor || 0).toLocaleString("es-MX", {
    style:"currency",
    currency:"MXN",
    maximumFractionDigits:0
  });

function setText(id, value){
  const el = document.getElementById(id);
  if(el) el.innerText = value;
}

async function cargarDashboard(){
  try{
    const res = await fetch(`${API}/dashboard`);

    if(!res.ok){
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    const ventas = Number(data.ventas_total || 0);
    const recargas = Number(data.recargas_total || 0);
    const usuarios = Number(data.usuarios || 0);
    const saldo = Number(data.saldo_total || 0);

    setText("ventas", money(ventas));
    setText("recargas", money(recargas));
    setText("usuarios", usuarios.toLocaleString("es-MX"));
    setText("saldo", money(saldo));

    const usoRecargas =
      recargas > 0
        ? Math.min((ventas / recargas) * 100, 100)
        : 0;

    const saldoPromedio =
      usuarios > 0
        ? saldo / usuarios
        : 0;

    setText("uso-recargas", `${usoRecargas.toFixed(1)}%`);
    setText("saldo-promedio", money(saldoPromedio));

    setText(
      "ventas-detalle",
      ventas > 0 ? "Consumo registrado correctamente" : "Sin ventas registradas"
    );

    setText(
      "recargas-detalle",
      recargas > 0 ? "Saldo ingresado al ecosistema" : "Sin recargas registradas"
    );

    setText(
      "usuarios-detalle",
      usuarios === 1 ? "1 wallet activa" : `${usuarios} wallets activas`
    );

    setText(
      "saldo-detalle",
      saldo > 0 ? "Disponible para consumo" : "Sin saldo circulante"
    );

    setText(
      "resumen-dashboard",
      `Se ha consumido el ${usoRecargas.toFixed(1)}% del saldo recargado. Cada usuario mantiene en promedio ${money(saldoPromedio)} disponible.`
    );

  }catch(err){
    console.error("DASHBOARD ERROR:", err);
    setText("resumen-dashboard", "No se pudieron cargar las métricas.");
  }
}

cargarDashboard();