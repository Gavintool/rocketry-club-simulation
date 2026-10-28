# Rocketry Club Flight Lab

A static, browser-based flight visualizer with a perspective 3D scene, terrain, follow and overview cameras, and a simplified planar rocket model. The blue rocket and smiley face are preserved.

## Run locally

```sh
python3 visualizer.py
```

Open <http://127.0.0.1:8000>. Select **Simulate flight**, then **Play flight**. Drag to orbit, scroll to zoom, or select **Whole flight** to see the entire path. Event buttons jump to rail exit, burnout, apogee, parachute deployment, and ground contact. The timeline works in either camera mode.

Three.js 0.180.0 is included locally in `vendor/` under its MIT license. No package installation or CDN connection is needed at runtime. A browser with WebGL2 is required. Stop the local server with Ctrl+C.

## Flight model

The state includes horizontal and vertical position/velocity, pitch angle, and pitch rate. SI units are used. Positive wind and positive launch tilt point towards +x. Altitude is the center of mass above a flat ground plane. The mesh dimensions use the configured body length and diameter; fins and canopy shape are illustrative.

- A 1 m launch rail constrains motion and attitude until rail exit.
- Thrust follows the evolving rocket axis; propellant mass decreases linearly during the burn.
- Air-relative velocity drives drag. A normal force at the center of pressure behind the CG creates a pitch moment; rotational velocity at that point supplies aerodynamic damping.
- The static margin sets the CP-to-CG lever in body diameters, capped at 40% of body length.
- With recovery enabled, a canopy starts opening 0.4 seconds after detected apogee and inflates over 0.8 seconds. Canopy drag slows the descent. Suspension torque approximates the rocket hanging below the canopy.
- With recovery disabled, aerodynamic pitch dynamics continue through descent. The default 3 m/s wind case turns nose-down. Exact symmetric, vertical, zero-wind flight can remain nose-up because no perturbation is imposed.
- Ground contact stops playback at the rocket's conservative bounding extent. Landing speed is the speed at contact; no bounce, crash deformation, or canopy collapse is modeled.

Angle of attack is the unsigned angle between the rocket axis and air-relative velocity, undefined at zero airspeed. A rocket hanging nose-up under a parachute can have a 180-degree AoA while descending; this does not indicate nose-first flight.

## Accuracy limits

This is an educational model, not a validated flight predictor. The normal-force slope (6 per radian), uniform-rod inertia, constant CG/CP, drag coefficient, canopy coefficient (1.5), and suspension torque are estimates. High-AoA forces and opening transients are particularly approximate. The force model is planar, although the view is 3D. It omits roll, structural failure, variable atmosphere, gusts, measured thrust curves, and full six-degree-of-freedom aerodynamics. Use measured rocket/motor data and validated simulation tools for launch planning.

The CG/CP stability principle is described in [NASA Glenn's rocket stability guide](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/conditions-for-rocket-stability/). This implementation has not been validated or endorsed by NASA.

## Command line and tests

```sh
python3 simulation.py --wind 3
python3 simulation.py --wind 3 --no-recovery
python3 -m unittest discover -s tests -v
```

Tests cover a vertical no-drag analytical case, mirrored winds, pitch reversal during unrecovered descent, slower parachute landing, ground termination, timestep convergence, and invalid inputs.

## GitHub Pages

The website runs entirely in the browser, including the flight calculation in a Web Worker. No Python backend is needed for hosting. All assets use relative URLs so the site works under the repository path.

After pushing, open **Settings → Pages**, choose **Deploy from a branch**, select **main / (root)**, and save. GitHub Pages requires a public repository on GitHub Free; paid plans may support a private source repository. The site itself is intended to be public.

`simulation.js` is the browser implementation and `simulation.py` remains the reference command-line implementation. Run `python3 -m unittest discover -s tests -v` with Node.js installed to include the cross-language parity checks.

## Import an OpenRocket design

Choose an `.ork` file using **OpenRocket design** in the controls. ZIP-based designs with a root `rocket.ork` XML entry and legacy plain XML and gzip files are supported. The design is read in your browser and is not uploaded.

The first stage’s nose cone, body tubes, transitions, freeform and trapezoidal fins are approximated in the 3D view. The overall length and maximum body diameter update the flight model; the first supported parachute diameter updates recovery. If you edit length or diameter, the imported mesh scales to match. Other stages, components and exact nose profiles may not be represented. An imported motor’s name may be shown, but its curve, motor mass, rocket mass, drag and stability are not calculated or imported. **Enter or verify these values yourself** before simulating. This remains a simplified educational model, not OpenRocket’s flight solver.

To run import tests, use `npm install` followed by `npm test` (Node.js and Python are required). JSZip 3.10.1 is included locally under its MIT/GPL dual license; see `vendor/JSZIP-LICENSE.md`.
