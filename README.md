# VVVF LAB · GPS Edition

A browser-only Shanghai Metro-inspired VVVF sound experiment. Existing V3 synthesis and its 17 vehicle labels / 7 shared templates are preserved; V4 adds live geolocation speed input.

## Use

Open the HTTPS GitHub Pages URL on a phone, tap **启用 GPS 与声音**, and grant location access. Prefer outdoors or near a window. Only passengers should operate this app; it is not a speedometer or safety instrument. Use headphones at a low volume.

- Native `coords.speed` (m/s) is preferred. When unavailable, distance / elapsed time estimates speed, with positional uncertainty filtering.
- Bad accuracy, stale fixes, implausible jumps and low-speed jitter are filtered. GPS samples update a short-horizon trend predictor. Extrapolation is bounded to 1.2 seconds and a maximum 4 km/h offset; after that it holds rather than extrapolating indefinitely. Stale fixes still mute immediately at the existing timeout. Stationary fixes reset the trend. Prediction needs two consistent direction observations; alternating noise is held inside a 0.35 m/s deadband, with persistent changes accepted. Modulation stages use stateful ±1 Hz hysteresis and reset on program, train, stop and stale-state changes. GPS mode has explicit coast/traction controls: coast mutes traction audio and reverb while speed tracking continues. GPS cannot infer whether the real vehicle is coasting. The primary readout is an estimated simulated speed, not an exact GPS speed. The instrument and audio accelerate/decelerate toward it at the adjustable rate (default 0.9 m/s², so a 10 km/h change takes over 3 seconds), with a short acceleration ramp rather than exponential catch-up. A light 0.6-second input filter reduces noise. Signed slip follows the continuous acceleration, not an instantaneous mode switch. GPS mode follows the traction modulation curve in both directions to avoid switching to a separate brake program; manual mode retains the original brake program. Smoothed speed drives the existing wheel / gear / motor-pole / slip-frequency model.
- Synthesis remains within the original 0–100 km/h range. The GPS readout still shows the actual estimate above that range.
- GPS acceleration only approximates traction/braking; it does not read the train's controls.
- No signal for 6 seconds pauses synthesis. Stop, page exit, or backgrounding clears the watch and local positions. Returning to the foreground requires another tap.
- GPS coordinates are processed in memory only, never stored or uploaded by this application. No analytics or external application assets are requested. Browser/OS location services retain their own behavior.
- Manual controls, both listening perspectives, the Alstom community program, and dry/cabin/tunnel ambience remain available.

## Hosting

Static files are in `dist/`. Serve that folder via HTTPS. The supplied GitHub Actions workflow tests and deploys `dist/` to GitHub Pages (select **GitHub Actions** as Pages source). All asset paths are relative, so a project subpath works.

## Tests

Requires Node.js 22 or later. No package installation is required.

    node --check dist/app.js
    node --check dist/gps.js
    node --test tests/*.test.cjs

Automated tests cover speed conversion, null-speed fallback, jitter, stale fixes, accuracy, jump rejection, stop/restart, late callbacks, permission denial, repeated starts, backgrounding, speed caps, and retained manual control. These use simulated positions; they do not certify real mobile GPS performance or audible similarity to an actual train.

## Sound model and attribution

The model is an educational approximation, not an accurately calibrated Shanghai train simulation. Multiple train labels share design templates, and the Alstom community program is independent of train labels. The sound uses three-phase PWM, simplified RL currents and a rotating-field torque-ripple proxy.

Read [`dist/NOTICE.txt`](dist/NOTICE.txt) before reusing the SHE data. Existing upstream non-commercial restrictions and attribution remain in force. This repository does not relicense those tables under a permissive license.
