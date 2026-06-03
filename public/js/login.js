async function login(modo){

  localStorage.setItem(
    "modo",
    modo
  );

  const API =
    modo === "cloud"
      ? "https://api.cosmicpass.space"
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

    localStorage.setItem(
      "staff_id",
      data.staff_id
    );

    localStorage.setItem(
      "staff_nombre",
      data.nombre
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