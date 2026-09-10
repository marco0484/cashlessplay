
async function login(modo){

  // Guardamos solamente el modo de operación
  localStorage.setItem(
    "modo",
    modo
  );

  const API =
    modo === "cloud"
      ? "https://cashlessplay.vercel.app"
      : "http://localhost:3000";

  const nombre =
    document.getElementById("username").value.trim();

  const pin =
    document.getElementById("pin").value.trim();

  if(!nombre || !pin){

    alert("Completa los campos");
    return;

  }

  try{

    const res = await fetch(API + "/login", {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      // Permite que el navegador reciba
      // y posteriormente envíe la cookie de sesión
      credentials: "include",

      body: JSON.stringify({
        nombre,
        pin
      })

    });

    const data = await res.json();

    if(!res.ok){

      alert(
        data.mensaje ||
        "Credenciales incorrectas"
      );

      return;

    }

    // Ya NO guardamos staff_id en localStorage.
    // El staff_id ahora viaja dentro de la
    // cookie HttpOnly creada por el servidor.

localStorage.setItem(
  "staff_nombre",
  data.nombre
);

/* ===================================== */
/* VERIFICAR QUE LA SESIÓN QUEDÓ ACTIVA */
/* ===================================== */

const sesion = await fetch(
  API + "/sesion",
  {
    credentials: "include"
  }
);

const sesionData = await sesion.json();

console.log(
  "🔐 SESIÓN DESPUÉS DEL LOGIN:",
  sesionData
);

if(!sesion.ok){

  alert(
    "Login correcto, pero la sesión no quedó activa."
  );

  console.error(
    "❌ LA COOKIE NO FUE RECONOCIDA",
    sesionData
  );

  return;
}

console.log(
  "✅ LOGIN + SESIÓN CORRECTOS"
);

window.location.href =
  "index.html";

  }catch(err){

    console.error(
      "❌ ERROR LOGIN:",
      err
    );

    alert(
      "Error de conexión con el servidor"
    );

  }

}
