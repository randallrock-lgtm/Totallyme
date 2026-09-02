const express=require('express');
const http=require('http');
const {Server}=require('socket.io');

const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:'*'}});

app.use(express.static(__dirname+'/public'));

const rooms=new Map();

function makeCode(){
  let code;
  do code=Math.random().toString(36).slice(2,8).toUpperCase();
  while(rooms.has(code));
  return code;
}
function broadcastPlayers(room){
  io.to(room.code).emit('roomPlayers',room.players);
}
function joinRoom(socket,code){
  const room=rooms.get(code);
  if(!room)return socket.emit('roomError','Room not found.');
  if(Object.keys(room.players).length>=4)return socket.emit('roomError','Room is full (4 players max).');
  socket.data.room=code;
  room.players[socket.id]={x:550,y:350,angle:0,hp:100,maxHp:100,alive:true};
  socket.join(code);
  broadcastPlayers(room);
}

io.on('connection',socket=>{
  socket.on('createRoom',()=>{
    const code=makeCode();
    rooms.set(code,{code,players:{}});
    joinRoom(socket,code);
    socket.emit('roomCreated',code);
  });

  socket.on('joinRoom',raw=>{
    const code=String(raw||'').trim().toUpperCase();
    joinRoom(socket,code);
    if(rooms.has(code))socket.emit('joinedRoom',code);
  });

  socket.on('playerState',state=>{
    const code=socket.data.room;
    const room=rooms.get(code);
    if(!room||!room.players[socket.id])return;
    const p=room.players[socket.id];
    p.x=Math.max(20,Math.min(1080,Number(state.x)||550));
    p.y=Math.max(20,Math.min(680,Number(state.y)||350));
    p.angle=Number(state.angle)||0;
    p.hp=Math.max(0,Number(state.hp)||0);
    p.maxHp=Math.max(1,Number(state.maxHp)||100);
    p.alive=state.alive!==false&&p.hp>0;
    broadcastPlayers(room);
  });

  socket.on('disconnect',()=>{
    const code=socket.data.room;
    const room=rooms.get(code);
    if(!room)return;
    delete room.players[socket.id];
    if(Object.keys(room.players).length===0)rooms.delete(code);
    else broadcastPlayers(room);
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log('Zombie Survivor online server listening on '+PORT));
