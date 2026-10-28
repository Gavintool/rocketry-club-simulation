# Rocketry Club Simulation

A small, dependency-free Python starter that estimates a model rocket’s vertical flight.

## Run

```sh
python3 simulation.py
python3 simulation.py --mass 0.5 --thrust 20 --burn-time 1.5
python3 simulation.py --help
```

The output reports estimated apogee, maximum speed, and flight time. Mass is in kilograms, thrust in newtons, diameter in meters, and time in seconds.

## Model and limitations

The model assumes vertical flight, constant thrust during the burn, linearly decreasing propellant mass, constant air density, gravity, and quadratic drag. It ignores wind, stability, launch guides, changing atmospheric conditions, parachutes, and motor thrust curves. The falling rocket is modeled without recovery.

This is an educational approximation, not a tool for real-world launch or safety decisions.
