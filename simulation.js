// Browser equivalent of simulation.py. Keep equations and defaults in sync.
export function simulate({mass=.5,propellant=.05,thrust=20,burn_time=1.5,
  drag_coefficient=.75,diameter=.04,dt=.004,wind=0,launch_angle=0,
  length=.7,recovery=true,chute_diameter=.65,stability=1.5}={}) {
  const vals=[mass,propellant,thrust,burn_time,drag_coefficient,diameter,dt,wind,launch_angle,length,chute_diameter,stability];
  if(!vals.every(Number.isFinite)) throw Error('All parameters must be finite numbers');
  if(!(mass>=.05&&mass<=20&&propellant>=0&&propellant<mass&&mass-propellant>=.02&&
    thrust>0&&thrust<=2000&&burn_time>=.02&&burn_time<=15&&drag_coefficient>=0&&drag_coefficient<=3&&
    diameter>=.01&&diameter<=.3&&length>=diameter*3&&length<=4&&dt>=.001&&dt<=.02&&
    Math.abs(launch_angle)<=30&&Math.abs(wind)<=20&&chute_diameter>=.1&&chute_diameter<=3&&stability>=.25&&stability<=4))
    throw Error('Parameters outside supported range. Use the input limits; dry mass must be at least 0.02 kg and length at least 3 body diameters.');
  const g=9.81,rho=1.225,area=Math.PI*(diameter/2)**2,chute_area=Math.PI*(chute_diameter/2)**2;
  const angle0=launch_angle*Math.PI/180,lever=Math.min(stability*diameter,length*.4);
  let theta=angle0,omega=0,t=0,x=0,vx=0,vy=0,y=length/2,rail_distance=0,apogee=y;
  let apogee_time=null,deploy_time=null,max_speed=0,chute=0,grounded=false;
  const trajectory=[],events=[];
  if(thrust*Math.cos(theta)<=mass*g)throw Error('Vertical thrust must exceed initial weight for liftoff');
  function sample(){const u=vx-wind,v=vy,speed=Math.hypot(u,v);
    const aoa=speed>1e-8?Math.acos(Math.max(-1,Math.min(1,(u*Math.sin(theta)+v*Math.cos(theta))/speed)))*180/Math.PI:null;
    return [t,y,vy,x,vx,aoa,theta,omega,chute];}
  trajectory.push(sample());
  for(let step=0;step<Math.ceil(300/dt);step++){
    const previous=[t,x,y,vx,vy,theta,omega];
    const h=t<burn_time?Math.min(dt,burn_time-t):dt,m=mass-propellant*Math.min(t/burn_time,1);
    const inertia=m*(length*length/12+diameter*diameter/16),ux=Math.sin(theta),uy=Math.cos(theta),nx=uy,ny=-ux;
    const rx=vx-wind,ry=vy,speed=Math.hypot(rx,ry),drag=.5*rho*area*drag_coefficient*speed;
    let fx=-drag*rx,fy=-drag*ry-m*g;
    const cpx=rx-lever*omega*nx,cpy=ry-lever*omega*ny,cp_speed=Math.hypot(cpx,cpy);
    const transverse=cpx*nx+cpy*ny,normal=-.5*rho*area*6*cp_speed*transverse;
    let torque=-lever*normal;fx+=normal*nx;fy+=normal*ny;
    if(t<burn_time){fx+=thrust*ux;fy+=thrust*uy;}
    if(recovery&&apogee_time!==null&&t>=apogee_time+.4){
      if(deploy_time===null){deploy_time=t;events.push({name:'Parachute deployment',time:t});}
      chute=Math.min(1,(t-deploy_time)/.8);
      const factor=.5*rho*1.5*chute_area*chute*speed;fx-=factor*rx;fy-=factor*ry;
      const target=speed>.1?Math.atan2(-rx,-ry):0,delta=Math.atan2(Math.sin(target-theta),Math.cos(target-theta));
      torque+=inertia*chute*(5*delta-4*omega);
    }
    if(rail_distance<1){
      const along=Math.max(0,(fx*Math.sin(angle0)+fy*Math.cos(angle0))/m);
      const along_v=vx*Math.sin(angle0)+vy*Math.cos(angle0)+along*h;
      vx=along_v*Math.sin(angle0);vy=along_v*Math.cos(angle0);rail_distance+=along_v*h;theta=angle0;omega=0;
      if(rail_distance>=1)events.push({name:'Rail exit',time:t+h});
    }else{vx+=fx/m*h;vy+=fy/m*h;omega+=torque/inertia*h;theta+=omega*h;}
    x+=vx*h;y+=vy*h;t+=h;
    if(![x,y,vx,vy,theta,omega].every(Number.isFinite)||Math.abs(omega)>500)throw Error('Simulation became unstable; reduce extreme inputs');
    if(previous[4]>0&&vy<=0&&apogee_time===null){apogee_time=t;events.push({name:'Apogee',time:t});}
    apogee=Math.max(apogee,y);max_speed=Math.max(max_speed,Math.hypot(vx,vy));
    const extent=length/2*Math.abs(Math.cos(theta))+Math.max(diameter/2,length*.15)*Math.abs(Math.sin(theta));
    if(vy<0&&y<=extent){
      const before=previous[2]-(length/2*Math.abs(Math.cos(previous[5]))+Math.max(diameter/2,length*.15)*Math.abs(Math.sin(previous[5])));
      const fraction=before>0?Math.max(0,Math.min(1,before/(before-(y-extent)))):0;
      t=previous[0]+h*fraction;x=previous[1]+(x-previous[1])*fraction;theta=previous[5]+(theta-previous[5])*fraction;
      y=length/2*Math.abs(Math.cos(theta))+Math.max(diameter/2,length*.15)*Math.abs(Math.sin(theta));
      grounded=true;events.push({name:'Ground contact',time:t});
    }
    if((step+1)%Math.max(1,Math.round(.04/dt))===0||grounded)trajectory.push(sample());
    if(grounded)return {apogee_m:apogee,max_speed_m_s:max_speed,flight_time_s:t,downrange_m:x,
      landing_speed_m_s:Math.hypot(vx,vy),events,trajectory,
      parameters:{length,diameter,wind,burn_time,launch_angle,recovery,chute_diameter}};
  }
  throw Error('Flight exceeds the 300 second simulation limit');
}
