const express=require("express");
const http=require("http");
const {Server}=require("socket.io");

const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:"*"}});

app.use(express.static(__dirname+"/public"));

const rooms=new Map();
const W=1100,H=700;

function makeRoom(){
  let code;
  do code=Math.random().toString(36).slice(2,8).toUpperCase();
  while(rooms.has(code));
  rooms.set(code,{players:{},zombies:[],bullets:[],wave:1,last:Date.now()});
  return code;
}
function spawnZombie(room){
  const side=Math.floor(Math.random()*4);
  let x=side===0?20:side===1?W-20:Math.random()*W;
  let y=side===2?20:side===3?H-20:Math.random()*H;
  room.zombies.push({id:Math.random().toString(36).slice(2),x,y,hp:10,speed:45});
}

io.on("connection",socket=>{
  socket.on("createRoom",()=>{
    const code=makeRoom();
    join(socket,code);
    socket.emit("roomCreated",code);
  });

  socket.on("joinRoom",code=>{
    code=(code||"").toUpperCase();
    if(!rooms.has(code))return socket.emit("roomError","Room not found");
    if(Object.keys(rooms.get(code).players).length>=4)return socket.emit("roomError","Room is full");
    join(socket,code);socket.emit("joinedRoom",code);
  });

  socket.on("input",input=>{
    const code=socket.data.room;if(!code)return;
    const p=rooms.get(code)?.players[socket.id];if(!p)return;
    p.dx=Math.max(-1,Math.min(1,Number(input.dx)||0));
    p.dy=Math.max(-1,Math.min(1,Number(input.dy)||0));
    p.angle=Number(input.aim)||0;p.shoot=!!input.shoot;
  });

  socket.on("disconnect",()=>{
    const code=socket.data.room;if(!code)return;
    const room=rooms.get(code);if(!room)return;
    delete room.players[socket.id];
    if(!Object.keys(room.players).length)rooms.delete(code);
  });
});

function join(socket,code){
  const room=rooms.get(code);
  room.players[socket.id]={x:W/2+Math.random()*80-40,y:H/2+Math.random()*80-40,
    angle:0,hp:100,maxHp:100,dx:0,dy:0,shoot:false,cooldown:0};
  socket.data.room=code;socket.join(code);
}

setInterval(()=>{
  const now=Date.now(),dt=Math.min(.05,(now-(global.last||now))/1000);global.last=now;
  for(const room of rooms.values()){
    const ps=Object.values(room.players);
    for(const p of ps){
      p.x=Math.max(20,Math.min(W-20,p.x+p.dx*235*dt));
      p.y=Math.max(20,Math.min(H-20,p.y+p.dy*235*dt));
      p.cooldown-=dt;
      if(p.shoot&&p.cooldown<=0){
        p.cooldown=.20;
        room.bullets.push({x:p.x+Math.cos(p.angle)*28,y:p.y+Math.sin(p.angle)*28,
          vx:Math.cos(p.angle)*720,vy:Math.sin(p.angle)*720,life:1});
      }
    }
    while(room.zombies.length<Math.min(30,room.wave*3))spawnZombie(room);
    for(const z of room.zombies){
      let target=ps.reduce((a,p)=>!a||dist(z,p)<dist(z,a)?p:a,null);
      if(target){
        const d=Math.max(1,dist(z,target));
        z.x+=(target.x-z.x)/d*z.speed*dt;
        z.y+=(target.y-z.y)/d*z.speed*dt;
      }
    }
    for(const b of room.bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;}
    for(let i=room.bullets.length-1;i>=0;i--){
      const b=room.bullets[i];
      let hit=false;
      for(let j=room.zombies.length-1;j>=0;j--){
        const z=room.zombies[j];
        if(Math.hypot(b.x-z.x,b.y-z.y)<18){z.hp-=2;hit=true;if(z.hp<=0)room.zombies.splice(j,1);break;}
      }
      if(hit||b.life<=0||b.x<0||b.x>W||b.y<0||b.y>H)room.bullets.splice(i,1);
    }
    if(!room.zombies.length){room.wave++;for(let i=0;i<room.wave*3;i++)spawnZombie(room);}
    io.sockets.sockets.forEach(s=>{
      if(s.data.room && rooms.get(s.data.room)===room)
        s.emit("state",{players:room.players,zombies:room.zombies,bullets:room.bullets,wave:room.wave});
    });
  }
},50);

function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log("Zombie Survivor server listening on "+PORT));
