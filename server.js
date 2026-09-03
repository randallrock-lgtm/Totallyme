const express=require('express'),http=require('http'),{Server}=require('socket.io');
const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:'*'}});
app.use(express.static(__dirname+'/public'));
const rooms=new Map(),W=1100,H=700,MAX=4;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const cards=[
 {name:'Heavy Rounds',desc:'+25% damage',icon:'💥',id:'damage',rarity:'common'},
 {name:'Adrenaline',desc:'+15% move speed',icon:'🏃',id:'speed',rarity:'common'},
 {name:'Vitality',desc:'+25 max HP',icon:'❤️',id:'health',rarity:'common'},
 {name:'Rapid Fire',desc:'+20% fire rate',icon:'⚡',id:'fire',rarity:'rare'},
 {name:'Lucky',desc:'+10% crit chance',icon:'🍀',id:'crit',rarity:'rare'},
 {name:'Scavenger',desc:'+25% scrap',icon:'🪙',id:'scrap',rarity:'rare'}
];
function code(){let c;do c=Math.random().toString(36).slice(2,8).toUpperCase();while(rooms.has(c));return c}
function publicLobby(r){const p={};for(const [id,x] of Object.entries(r.players))p[id]={id,username:x.username,ready:x.ready,alive:x.alive,custom:x.custom};io.to(r.code).emit('lobbyState',{code:r.code,hostId:r.hostId,players:p})}
function alive(r){return Object.values(r.players).filter(p=>p.alive)}
function scale(r){let n=Math.max(1,Object.keys(r.players).length);return {hp:1+(n-1)*.65,dmg:1+(n-1)*.25,count:1+(n-1)*.45}}
function spawn(r,boss=false){
 let side=Math.floor(Math.random()*4),x=side<2?(side?W-25:25):Math.random()*W,y=side>=2?(side===3?H-25:25):Math.random()*H;
 const base=boss?220+r.wave*45:28+r.wave*5;
 r.zombies.push({id:Math.random().toString(36).slice(2),x,y,hp:base*r.scale.hp,maxHp:base*r.scale.hp,speed:(boss?35:55)+Math.min(40,r.wave*1.5),damage:(boss?22:8)*r.scale.dmg,boss});
}
function cards3(){return [...cards].sort(()=>Math.random()-.5).slice(0,3)}
function begin(r){
 r.started=true;r.vote=null;r.zombies=[];r.bullets=[];r.kills=0;r.quota=Math.min(12+r.wave*5,80);
 r.scale=scale(r);Object.values(r.players).forEach(p=>{p.alive=true;p.hp=p.maxHp;p.ready=false});
 for(let i=0;i<Math.ceil(r.quota*r.scale.count);i++)spawn(r,false);
 if(r.wave%5===0)spawn(r,true);
 io.to(r.code).emit('roundStart',{wave:r.wave});publicLobby(r)
}
function startCountdown(r){if(r.counting||r.started)return;let ps=Object.values(r.players);if(!ps.length||!ps.every(p=>p.ready))return;
 r.counting=true;let n=5;io.to(r.code).emit('countdown',n);let t=setInterval(()=>{n--;io.to(r.code).emit('countdown',n);if(n<=0){clearInterval(t);r.counting=false;begin(r)}},1000)}
function clear(r){r.started=false;r.zombies=[];r.bullets=[];r.vote={id:Math.random().toString(36).slice(2),cards:cards3(),votes:{},voted:{},endsAt:Date.now()+10000,rerolls:3};
 io.to(r.code).emit('roundCleared',{wave:r.wave,cards:r.vote.cards,voteId:r.vote.id});io.to(r.code).emit('cardVoteState',r.vote);io.to(r.code).emit('rerollState',{left:3})}
function finishVote(r){if(!r.vote)return;let best=0;for(let i=1;i<3;i++)if((r.vote.votes[i]||0)>(r.vote.votes[best]||0))best=i;
 const c=r.vote.cards[best];io.to(r.code).emit('cardVoteResult',{card:c});r.vote=null;r.wave++;
 Object.values(r.players).forEach(p=>{p.alive=true;p.hp=p.maxHp;p.ready=false});
 setTimeout(()=>begin(r),400)}
function join(s,r){s.data.room=r.code;s.join(r.code);r.players[s.id]={id:s.id,username:s.data.username||'Player',ready:false,alive:true,hp:100,maxHp:100,x:W/2,y:H/2,angle:0,dx:0,dy:0,shoot:false,custom:{}};publicLobby(r)}
io.on('connection',s=>{
 s.on('setUsername',n=>{s.data.username=String(n||'Player').replace(/[<>]/g,'').slice(0,16)||'Player'});
 s.on('createRoom',()=>{let c=code(),r={code:c,hostId:s.id,players:{},wave:1,started:false,counting:false,zombies:[],bullets:[],vote:null};rooms.set(c,r);join(s,r);s.emit('roomCreated',c)});
 s.on('joinRoom',c=>{let r=rooms.get(String(c||'').toUpperCase());if(!r)return s.emit('roomError','Room not found.');if(r.started||r.counting)return s.emit('roomError','Round already started.');if(Object.keys(r.players).length>=MAX)return s.emit('roomError','Lobby is full.');join(s,r);s.emit('joinedRoom',r.code)});
 s.on('readyToggle',()=>{let r=rooms.get(s.data.room),p=r?.players[s.id];if(!p||r.started)return;p.ready=!p.ready;publicLobby(r)});
 s.on('hostStart',()=>{let r=rooms.get(s.data.room);if(r?.hostId===s.id)startCountdown(r)});
 s.on('input',q=>{let r=rooms.get(s.data.room),p=r?.players[s.id];if(!r||!p||!r.started||!p.alive)return;p.dx=clamp(+q.dx||0,-1,1);p.dy=clamp(+q.dy||0,-1,1);p.angle=+q.aim||0;p.shoot=!!q.shoot;p.custom=q.custom||{}});
 s.on('shoot',q=>{let r=rooms.get(s.data.room),p=r?.players[s.id];if(!r||!p||!r.started||!p.alive)return;
   const now=Date.now(),cd=300/(1+(p.fire||0));if(now-(p.lastShot||0)<cd)return;p.lastShot=now;
   let dmg=20*(1+(p.damage||0));if(Math.random()<(p.crit||0))dmg*=2;
   r.bullets.push({id:Math.random().toString(36).slice(2),x:p.x,y:p.y,vx:Math.cos(p.angle)*650,vy:Math.sin(p.angle)*650,damage:dmg,owner:s.id,life:1.5});
 });
 s.on('cardVote',q=>{let r=rooms.get(s.data.room);if(!r?.vote||q.voteId!==r.vote.id||r.vote.voted[s.id]!=null)return;let i=+q.index;if(i<0||i>2)return;r.vote.voted[s.id]=i;r.vote.votes[i]=(r.vote.votes[i]||0)+1;io.to(r.code).emit('cardVoteState',r.vote)});
 s.on('rerollVote',q=>{let r=rooms.get(s.data.room);if(!r?.vote||q.voteId!==r.vote.id||r.vote.rerolls<=0||r.vote.voted[s.id]!=null)return;r.vote.rerolls--;r.vote.cards=cards3();r.vote.votes={};r.vote.voted={};r.vote.id=Math.random().toString(36).slice(2);r.vote.endsAt=Date.now()+10000;io.to(r.code).emit('cardVoteState',r.vote);io.to(r.code).emit('rerollState',{left:r.vote.rerolls})});
 s.on('disconnect',()=>{let r=rooms.get(s.data.room);if(!r)return;delete r.players[s.id];if(r.hostId===s.id)r.hostId=Object.keys(r.players)[0]||null;if(!Object.keys(r.players).length)rooms.delete(r.code);else publicLobby(r)})
});
setInterval(()=>{
 for(const r of rooms.values()){
  if(!r.started)continue;let ps=Object.values(r.players),live=alive(r);
  for(const p of live){p.x=clamp(p.x+p.dx*235*.05,20,W-20);p.y=clamp(p.y+p.dy*235*.05,20,H-20)}
  for(const b of r.bullets){b.x+=b.vx*.05;b.y+=b.vy*.05;b.life-=.05;for(const z of r.zombies){if(z.hp>0&&Math.hypot(z.x-b.x,z.y-b.y)<24){z.hp-=b.damage;b.life=0;if(z.hp<=0)r.kills++}}}
  r.bullets=r.bullets.filter(b=>b.life>0&&b.x>-50&&b.x<W+50&&b.y>-50&&b.y<H+50);
  for(const z of r.zombies.filter(z=>z.hp>0)){let t=null,best=Infinity;for(const p of live){let dd=d(z,p);if(dd<best){best=dd;t=p}}if(t){z.x+=(t.x-z.x)/Math.max(1,best)*z.speed*.05;z.y+=(t.y-z.y)/Math.max(1,best)*z.speed*.05;if(best<27){t.hp-=z.damage*.05;if(t.hp<=0){t.hp=0;t.alive=false;io.to(t.id).emit('playerDown')}}}}
  r.zombies=r.zombies.filter(z=>z.hp>0);
  if(!live.length){r.started=false;io.to(r.code).emit('gameOver');continue}
  if(r.kills>=r.quota&&r.zombies.length===0)clear(r);
  const remote={};for(const p of ps)remote[p.id]={id:p.id,username:p.username,x:p.x,y:p.y,angle:p.angle,hp:p.hp,maxHp:p.maxHp,alive:p.alive,custom:p.custom};
  io.to(r.code).emit('remotePlayers',remote);io.to(r.code).emit('authoritativeZombies',r.zombies)
 }
 for(const r of rooms.values())if(r.vote&&Date.now()>=r.vote.endsAt)finishVote(r)
},50);
const PORT=process.env.PORT||3000;server.listen(PORT,()=>console.log('Authoritative Zombie Survivor server on '+PORT));
