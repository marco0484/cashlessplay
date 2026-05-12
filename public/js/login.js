const API = ""

async function login(){

const nombre =
document.getElementById("username").value.trim()

const pin =
document.getElementById("pin").value.trim()

// 🔥 VALIDACIÓN
if(!nombre || !pin){

  alert("Completa los campos")

  return

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

})

const data = await res.json()

if(!res.ok){

  alert(
    data.mensaje ||
    "Credenciales incorrectas"
  )

  return

}

// 🔥 GUARDAR SESIÓN
localStorage.setItem(
  "staff_id",
  data.staff_id
)

localStorage.setItem(
  "staff_nombre",
  data.nombre
)

console.log(
  "✅ LOGIN OK:",
  data
)

// 🔥 REDIRECCIÓN
window.location.href = "index.html"

}catch(err){

console.error(
  "❌ ERROR LOGIN:",
  err
)

alert(
  "Error de conexión con el servidor"
)

}

}

// 🔥 ENTER PARA LOGIN
document.addEventListener(
  "keydown",
  (e) => {

    if(e.key === "Enter"){

      login()

    }

})