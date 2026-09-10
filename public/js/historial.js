const modo =
  localStorage.getItem("modo") || "local";

const API =
  window.location.origin;

console.log("MODO:", modo);
console.log("API:", API);


/* ===================================== */
/* VERIFICAR SESIÓN */
/* ===================================== */

async function verificarSesion(){

  try{

    const res =
      await fetch(
        `${API}/sesion`,
        {
          credentials: "include"
        }
      );

    if(!res.ok){

      console.warn(
        "Sesión no válida:",
        res.status
      );

      window.location.replace(
        "login.html"
      );

      return null;
    }

    const data =
      await res.json();

    console.log(
      "✅ SESIÓN HISTORIAL:",
      data
    );

    return data;

  }catch(err){

    console.error(
      "ERROR VERIFICANDO SESIÓN:",
      err
    );

    window.location.replace(
      "login.html"
    );

    return null;
  }

}


/* ===================================== */
/* CARGAR HISTORIAL */
/* ===================================== */

async function cargarHistorial(){

  try{

    const res =
      await fetch(
        `${API}/historial`,
        {
          credentials: "include"
        }
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

    if(!tabla){
      return;
    }

    tabla.innerHTML = "";

    if(total){

      total.innerText =
        `${data.length} registros`;

    }

    data.forEach(item => {

      tabla.innerHTML += `
        <tr>

          <td>
            ${item.id}
          </td>

          <td>
            ${new Date(
              item.creado
            ).toLocaleString()}
          </td>

          <td>
            ${item.user_id}
          </td>

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
            ${item.staff_nombre || "-"}
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


/* ===================================== */
/* INICIO */
/* ===================================== */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    const staff =
      await verificarSesion();

    if(!staff){
      return;
    }

    cargarHistorial();

  }
);