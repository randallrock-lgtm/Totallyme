const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const app=express(), server=http.createServer(app);
const io=new Server(server,{cors:{origin:'*'}});
app.use(express.static(__dirname+'/public'));

const rooms=new Map();
const MAX=4;
function code(){let c;do c=Math.random().toString(36).slice(2,8).toUpperCase();while(rooms.has(c));return c}
function cleanName(n){return String(n||'Player').replace(/[^a-zA-Z0-9 _\-!?]/g,'').slice(0,16)||'Player'}
function state(room){return {hostId:room.hostId,started:room.started,round:room.round,players:room.players}}
function emitLobby(room){io.to(room.code).emit('lobbyState',state(room))}
function join(socket,c){
 const r=rooms.get(c); if(!r)return socket.emit('roomError','Lobby not found.');
 if(r.started)return socket.emit('roomError','That game has already started.');
 if(Object.keys(r.players).length>=MAX)return socket.emit('roomError','Lobby is full (4 players max).');
 socket.data.room=c;socket.join(c);
 r.players[socket.id]={username:'Player',x:550,y:350,angle:0,hp:100,maxHp:100,alive:true,spectating:false,customization:{},hostId:r.hostId};
 emitLobby(r);socket.emit('joinedRoom',c);
}
function aliveCount(r){return Object.values(r.players).filter(p=>p.alive).length}
io.on('connection',socket=>{
 socket.on('createRoom',()=>{
   const c=code();const r={code:c,hostId:socket.id,started:false,round:1,players:{},cards:null,votes:{},voteTimer:null};
   rooms.set(c,r);join(socket,c);socket.emit('roomCreated',c);
 });
 socket.on('joinRoom',c=>join(socket,String(c||'').trim().toUpperCase()));
 socket.on('profile',p=>{
   const r=rooms.get(socket.data.room),me=r?.players[socket.id];if(!me)return;
   me.username=cleanName(p.username);me.customization=p.customization||{};emitLobby(r);
 });
 socket.on('startGame',()=>{
   const r=rooms.get(socket.data.room);if(!r||r.hostId!==socket.id||r.started)return;
   r.started=true;r.round=1;emitLobby(r);io.to(r.code).emit('gameStarted',{round:1});
 });
 socket.on('playerState',p=>{
   const r=rooms.get(socket.data.room),me=r?.players[socket.id];if(!me)return;
   me.x=Number(p.x)||550;me.y=Number(p.y)||350;me.angle=Number(p.angle)||0;me.hp=Math.max(0,Number(p.hp)||0);me.maxHp=Math.max(1,Number(p.maxHp)||100);me.alive=!!p.alive;me.spectating=!!p.spectating;
   if(p.customization)me.customization=p.customization;
   io.to(r.code).emit('remoteState',{players:r.players});
   if(r.started&&aliveCount(r)===0)io.to(r.code).emit('allDead');
 });
 socket.on('playerDead',()=>{
   const r=rooms.get(socket.data.room),me=r?.players[socket.id];if(!me)return;
   me.alive=false;io.to(r.code).emit('remoteState',{players:r.players});
   if(r.started&&aliveCount(r)===0)io.to(r.code).emit('allDead');
 });
 socket.on('roundClear',data=>{
   const r=rooms.get(socket.data.room);if(!r||!r.started)return;
   if(!Array.isArray(data.cards)||data.cards.length!==3)return;
   // Only the first player who reports the clear starts the team vote.
   if(r.voteTimer)return;
   r.cards=data.cards;r.votes={};r.round=Number(data.round)||r.round;
   Object.keys(r.players).forEach(id=>r.votes[id]=-1);
   io.to(r.code).emit('roundVote',{cards:r.cards,seconds:10});
   let remaining=10;
   r.voteTimer=setInterval(()=>{
     remaining--;
     const counts=[0,0,0];Object.values(r.votes).forEach(v=>{if(v>=0&&v<3)counts[v]++});
     io.to(r.code).emit('voteUpdate',counts);
     if(remaining<=0){
       clearInterval(r.voteTimer);r.voteTimer=null;
       let winner=0;if(counts[1]>counts[winner])winner=1;if(counts[2]>counts[winner])winner=2;
       r.round++;
       Object.values(r.players).forEach(p=>{p.alive=true;p.hp=p.maxHp});
       io.to(r.code).emit('voteResult',{card:r.cards[winner],round:r.round});
       r.cards=null;r.votes={};
     }
   },1000);
 });
 socket.on('vote',i=>{
   const r=rooms.get(socket.data.room);if(!r||!r.voteTimer)return;
   const n=Number(i);if(n>=0&&n<3)r.votes[socket.id]=n;
   const counts=[0,0,0];Object.values(r.votes).forEach(v=>{if(v>=0&&v<3)counts[v]++});
   io.to(r.code).emit('voteUpdate',counts);
 });
 socket.on('disconnect',()=>{
   const c=socket.data.room,r=rooms.get(c);if(!r)return;
   delete r.players[socket.id];
   if(r.voteTimer){clearInterval(r.voteTimer);r.voteTimer=null}
   if(!Object.keys(r.players).length){rooms.delete(c);return}
   if(r.hostId===socket.id){r.hostId=Object.keys(r.players)[0];r.players[r.hostId].hostId=r.hostId;io.to(r.code).emit('hostChanged',r.hostId)}
   emitLobby(r);
 });
});
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log('Zombie Survivor online lobby server listening on '+PORT));
