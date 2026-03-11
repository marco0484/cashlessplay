async function registrar(){

const nombre=document.getElementById("nombre").value
const email=document.getElementById("email").value

const res=await fetch("http://localhost:3000/registro",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
nombre:nombre,
email:email
})
})

const data=await res.json()

alert("Usuario creado: "+data.user_id)

}


async function recargar(){

const user_id=document.getElementById("userid").value
const monto=document.getElementById("monto").value

const res=await fetch("http://localhost:3000/recargar",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
user_id:user_id,
monto:monto
})
})

const data=await res.json()

alert(data.mensaje)

}