const API =
"https://api.cosmicpass.space";

async function cargarHistorial(){

  try{

    const res =
    await fetch(
      `${API}/historial`
    );

    const data =
    await res.json();

    const tabla =
    document.getElementById(
      "tabla-historial"
    );

    tabla.innerHTML = "";

    data.forEach(item=>{

      tabla.innerHTML += `
      <tr>
        <td>${item.id}</td>
        <td>${item.creado}</td>
        <td>${item.user_id}</td>
        <td>${item.tipo}</td>
        <td>$${item.monto}</td>
        <td>${item.staff_id || "-"}</td>
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