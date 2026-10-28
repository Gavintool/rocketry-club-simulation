"""Planar educational rocket model with pitch dynamics and optional recovery."""
import argparse
import math


def simulate(mass, propellant, thrust, burn_time, drag_coefficient, diameter,
             dt=0.004, include_trajectory=False, wind=0.0, launch_angle=0.0,
             length=0.7, recovery=True, chute_diameter=0.65, stability=1.5):
    """SI units. Pitch is radians internally, clockwise from vertical.

    Aerodynamic normal force acts behind the CG at stability * diameter.
    Normal-force slope (6/rad), constant CG/CP, and uniform-rod inertia are
    illustrative estimates, not a validated aerodynamic model.
    Trajectory: t, altitude AGL, vy, x, vx, unsigned AoA degrees or null,
    unwrapped pitch radians, pitch rate rad/s, parachute inflation fraction.
    """
    vals = (mass, propellant, thrust, burn_time, drag_coefficient, diameter,
            dt, wind, launch_angle, length, chute_diameter, stability)
    if not all(math.isfinite(v) for v in vals):
        raise ValueError('All parameters must be finite numbers')
    if not (0.05 <= mass <= 20 and 0 <= propellant < mass and mass-propellant >= .02
            and 0 < thrust <= 2000 and .02 <= burn_time <= 15
            and 0 <= drag_coefficient <= 3 and .01 <= diameter <= .3
            and diameter * 3 <= length <= 4 and .001 <= dt <= .02
            and abs(launch_angle) <= 30 and abs(wind) <= 20
            and .1 <= chute_diameter <= 3 and .25 <= stability <= 4):
        raise ValueError('Parameters outside supported range. Use the input limits; dry mass must be at least 0.02 kg and length at least 3 body diameters.')
    g, rho = 9.81, 1.225
    area = math.pi * (diameter / 2) ** 2
    chute_area = math.pi * (chute_diameter / 2) ** 2
    angle0 = math.radians(launch_angle)
    theta, omega = angle0, 0.0
    if thrust * math.cos(theta) <= mass*g:
        raise ValueError('Vertical thrust must exceed initial weight for liftoff')
    lever = min(stability * diameter, length * .4)
    t = x = vx = vy = 0.0
    y = length/2
    rail_distance = 0.0
    apogee = y
    apogee_time = deploy_time = None
    max_speed = 0.0
    chute = 0.0
    trajectory = []
    events = []
    grounded = False

    def sample():
        u, v = vx-wind, vy
        speed = math.hypot(u, v)
        aoa = math.degrees(math.acos(max(-1, min(1, (u*math.sin(theta)+v*math.cos(theta))/speed)))) if speed > 1e-8 else None
        return [t, y, vy, x, vx, aoa, theta, omega, chute]

    if include_trajectory:
        trajectory.append(sample())
    for step in range(math.ceil(300/dt)):
        previous = (t, x, y, vx, vy, theta, omega)
        h = min(dt, burn_time-t) if t < burn_time else dt
        m = mass - propellant*min(t/burn_time, 1)
        inertia = m*(length*length/12 + diameter*diameter/16)
        ux, uy = math.sin(theta), math.cos(theta)
        nx, ny = uy, -ux
        rx, ry = vx-wind, vy
        speed = math.hypot(rx, ry)
        drag = .5*rho*area*drag_coefficient*speed
        fx, fy = -drag*rx, -drag*ry-m*g
        # Velocity at the CP includes rigid-body rotational velocity.
        cpx, cpy = rx-lever*omega*nx, ry-lever*omega*ny
        cp_speed = math.hypot(cpx, cpy)
        transverse = cpx*nx+cpy*ny
        normal = -.5*rho*area*6*cp_speed*transverse
        torque = -lever*normal
        fx += normal*nx
        fy += normal*ny
        if t < burn_time:
            fx += thrust*ux
            fy += thrust*uy
        if recovery and apogee_time is not None and t >= apogee_time+.4:
            if deploy_time is None:
                deploy_time = t
                events.append({'name':'Parachute deployment', 'time':t})
            chute = min(1, (t-deploy_time)/.8)
            # Idealized opening ramp and canopy drag; not opening-shock analysis.
            factor = .5*rho*1.5*chute_area*chute*speed
            fx -= factor*rx
            fy -= factor*ry
            # Approximate suspension restoring torque: nose hangs towards canopy.
            target = math.atan2(-rx, -ry) if speed > .1 else 0
            delta = math.atan2(math.sin(target-theta), math.cos(target-theta))
            torque += inertia*chute*(5*delta-4*omega)
        if rail_distance < 1.0:
            # Constrain the rocket to a 1 m launch rail during initial acceleration.
            along = max(0, (fx*math.sin(angle0)+fy*math.cos(angle0))/m)
            along_v = vx*math.sin(angle0)+vy*math.cos(angle0)+along*h
            vx, vy = along_v*math.sin(angle0), along_v*math.cos(angle0)
            rail_distance += along_v*h
            theta, omega = angle0, 0
            if rail_distance >= 1:
                events.append({'name':'Rail exit', 'time':t+h})
        else:
            vx += fx/m*h
            vy += fy/m*h
            omega += torque/inertia*h
            theta += omega*h
        x += vx*h
        y += vy*h
        t += h
        if not all(math.isfinite(v) for v in (x,y,vx,vy,theta,omega)) or abs(omega)>500:
            raise ValueError('Simulation became unstable; reduce extreme inputs')
        if previous[4] > 0 >= vy and apogee_time is None:
            apogee_time = t
            events.append({'name':'Apogee', 'time':t})
        apogee = max(apogee,y)
        max_speed = max(max_speed, math.hypot(vx,vy))
        # Conservative bounding extent prevents the rendered model crossing terrain.
        extent = length/2*abs(math.cos(theta))+max(diameter/2,length*.15)*abs(math.sin(theta))
        if vy < 0 and y <= extent:
            before = previous[2] - (length/2*abs(math.cos(previous[5]))+max(diameter/2,length*.15)*abs(math.sin(previous[5])))
            fraction = max(0,min(1,before/(before-(y-extent)))) if before > 0 else 0
            t = previous[0]+h*fraction
            x = previous[1]+(x-previous[1])*fraction
            theta = previous[5]+(theta-previous[5])*fraction
            y = length/2*abs(math.cos(theta))+max(diameter/2,length*.15)*abs(math.sin(theta))
            grounded = True
            events.append({'name':'Ground contact', 'time':t})
        if include_trajectory and ((step+1)%max(1,round(.04/dt))==0 or grounded):
            trajectory.append(sample())
        if grounded:
            out = dict(apogee_m=apogee,max_speed_m_s=max_speed,flight_time_s=t,
                       downrange_m=x,landing_speed_m_s=math.hypot(vx,vy),events=events,
                       parameters=dict(length=length,diameter=diameter,wind=wind,burn_time=burn_time,
                                       launch_angle=launch_angle,recovery=recovery,chute_diameter=chute_diameter))
            if include_trajectory:
                out['trajectory']=trajectory
            return out
    raise RuntimeError('Flight exceeds the 300 second simulation limit')


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name,default in [('mass',.5),('propellant',.05),('thrust',20),('burn-time',1.5),
                         ('drag-coefficient',.75),('diameter',.04),('wind',3),('launch-angle',0),
                         ('length',.7),('chute-diameter',.65),('stability',1.5)]:
        p.add_argument('--'+name,type=float,default=default)
    p.add_argument('--no-recovery',action='store_true')
    a=vars(p.parse_args());a['recovery']=not a.pop('no_recovery')
    try:
        r=simulate(**a)
    except (ValueError,RuntimeError,OverflowError) as e:
        p.error(str(e))
    for key in ('apogee_m','max_speed_m_s','flight_time_s','downrange_m','landing_speed_m_s'):
        print(f'{key}: {r[key]:.2f}')


if __name__=='__main__':
    main()
