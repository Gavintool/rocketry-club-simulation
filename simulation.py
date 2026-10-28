"""A simple vertical model rocket flight. Run with: python3 simulation.py

Educational approximation only; do not use for real launch decisions.
"""
import argparse
import math


def simulate(mass, propellant, thrust, burn_time, drag_coefficient, diameter, dt=0.01):
    """Integrate vertical motion with constant thrust and quadratic drag (SI units)."""
    if not (mass > propellant >= 0 and thrust > 0 and burn_time > 0
            and drag_coefficient >= 0 and diameter > 0 and dt > 0):
        raise ValueError("Invalid rocket parameters")
    gravity, density = 9.81, 1.225
    area = math.pi * (diameter / 2) ** 2
    t = height = velocity = apogee = max_speed = 0.0
    if thrust <= mass * gravity:
        raise ValueError("Thrust must exceed initial weight for liftoff")
    while t < 300:
        burning = t < burn_time
        current_mass = mass - propellant * min(t / burn_time, 1)
        drag = 0.5 * density * drag_coefficient * area * velocity * abs(velocity)
        acceleration = ((thrust if burning else 0) - drag) / current_mass - gravity
        velocity += acceleration * dt
        height += velocity * dt
        t += dt
        apogee = max(apogee, height)
        max_speed = max(max_speed, abs(velocity))
        if height <= 0 and t > dt:
            return {"apogee_m": apogee, "max_speed_m_s": max_speed, "flight_time_s": t}
    raise RuntimeError("Flight did not finish within 300 seconds")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mass", type=float, default=0.5, help="initial mass in kg")
    parser.add_argument("--propellant", type=float, default=0.05, help="propellant mass in kg")
    parser.add_argument("--thrust", type=float, default=20, help="constant thrust in N")
    parser.add_argument("--burn-time", type=float, default=1.5, help="burn duration in seconds")
    parser.add_argument("--drag-coefficient", type=float, default=0.75)
    parser.add_argument("--diameter", type=float, default=0.04, help="body diameter in meters")
    args = parser.parse_args()
    try:
        result = simulate(args.mass, args.propellant, args.thrust, args.burn_time,
                          args.drag_coefficient, args.diameter)
    except ValueError as error:
        parser.error(str(error))
    print(f"Apogee: {result['apogee_m']:.1f} m")
    print(f"Maximum speed: {result['max_speed_m_s']:.1f} m/s")
    print(f"Flight time: {result['flight_time_s']:.1f} s")


if __name__ == "__main__":
    main()
