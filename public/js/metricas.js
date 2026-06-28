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

let productosChart = null;

async function cargarProductosTop(){

  try{

    const res = await fetch(`${API}/productos-top`);

    if(!res.ok){
      throw new Error(`HTTP ${res.status}`);
    }

    const productos = await res.json();

    const labels = productos.map(item => item.nombre);
    const valores = productos.map(item => Number(item.total));

    const ctx = document.getElementById("productosChart");

    if(!ctx){
      return;
    }

    if(productosChart){
      productosChart.destroy();
    }

    productosChart = new Chart(ctx,{
      type:"bar",
      data:{
        labels,
        datasets:[{
          data:valores,
          borderRadius:14,
          borderSkipped:false,
          backgroundColor:(context)=>{
            const chart = context.chart;
            const {ctx,chartArea} = chart;

            if(!chartArea){
              return "#8b5cf6";
            }

            const gradient = ctx.createLinearGradient(0,0,chartArea.right,0);
            gradient.addColorStop(0,"#7c3aed");
            gradient.addColorStop(.5,"#06b6d4");
            gradient.addColorStop(1,"#22c55e");

            return gradient;
          }
        }]
      },
      options:{
        indexAxis:"y",
        responsive:true,
        maintainAspectRatio:false,
        animation:{
          duration:900,
          easing:"easeOutQuart"
        },
        plugins:{
          legend:{
            display:false
          },
          tooltip:{
            backgroundColor:"rgba(15,23,42,.95)",
            titleColor:"#fff",
            bodyColor:"#cbd5e1",
            borderColor:"rgba(255,255,255,.12)",
            borderWidth:1,
            padding:14,
            displayColors:false,
            callbacks:{
              label:(context)=>{
                return `${context.raw} consumos`;
              }
            }
          }
        },
        scales:{
          x:{
            beginAtZero:true,
            grid:{
              color:"rgba(255,255,255,.06)"
            },
            ticks:{
              color:"#94a3b8",
              precision:0
            }
          },
          y:{
            grid:{
              display:false
            },
            ticks:{
              color:"#f8fafc",
              font:{
                size:13,
                weight:"600"
              }
            }
          }
        }
      }
    });

  }catch(err){

    console.error("PRODUCTOS TOP ERROR:", err);

  }

}

cargarProductosTop();