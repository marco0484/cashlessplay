const modo =
localStorage.getItem("modo") || "local";

const API =
  modo === "cloud"
    ? "https://cashlessplay.vercel.app"
    : "http://localhost:3000";

console.log("MODO:", modo);
console.log("API:", API);

async function cargarHistorial(){

  try{

    const res =
    await fetch(
      `${API}/historial`
    );

    if(!res.ok){

      throw new Error(
        `HTTP ${res.status}`
      );

    }

    const data =
await res.json();

const tabla =
document.getElementById(
  "tabla-historial"
);

const total =
document.getElementById(
  "total-registros"
);

tabla.innerHTML = "";

if(total){

  total.innerText =
  `${data.length} registros`;

}

data.forEach(item=>{

  tabla.innerHTML += `
  <tr>
    <td>${item.id}</td>
    <td>${new Date(item.creado).toLocaleString()}</td>
    <td>${item.user_id}</td>
    <td class="${
      item.tipo === "RECARGA"
        ? "tipo-recarga"
        : "tipo-venta"
    }">
      ${item.tipo}
    </td>
    <td class="monto">
      $${item.monto}
    </td>
    <td>
      ${item.staff_id || "-"}
    </td>
  </tr>
  `;

});


  }catch(err){

    console.error(
      "HISTORIAL ERROR:",
      err
    );

  }

}

cargarHistorial();