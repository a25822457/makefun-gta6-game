// Sol Bay mission playthrough bot (test harness, not part of the shipped game).
// Drives the live game through all 5 missions using the real input and physics.
// Loaded into the page by tools/playthrough.py; exposes window.__bot.
(() => {
  const g = window.__game;
  const S = g.state;
  const input = g.input;
  const STEP = 1 / 60;
  const log = [];
  const K = (g.config && g.config.keys) || {};
  const FWD = K.forward || 'KeyW';
  const BACK = K.back || 'KeyS';
  const LEFT = K.left || 'KeyA';
  const RIGHT = K.right || 'KeyD';
  const RUN = K.run || 'ShiftLeft';
  const INTERACT = K.interact || 'KeyE';

  function step(n) { for (let i = 0; i < n; i++) g.updateSteps(1, STEP); }
  function setKeys(codes) {
    input._down.clear();
    for (const c of codes) input._down.add(c);
  }
  function press(code) { input._pressed.add(code); step(1); }

  function snap() {
    return {
      money: Math.round(S.money), health: Math.round(S.health),
      wanted: S.wanted, done: [...S.missionsDone],
      cur: g.missions.current ? g.missions.current.id : null,
      obj: g.missions.objectiveIndex,
      objText: S.missionObjective,
      end: S.endState,
      pos: [+g.player.position.x.toFixed(1), +g.player.position.z.toFixed(1)],
      onFoot: g.player.onFoot,
      veh: g.player.vehicle ? g.player.vehicle.type : null,
      kmh: Math.round(Math.abs(g.player.speed || 0) * 3.6),
      armed: !!S.player.armed,
      alive: (g.combat.enemies || []).filter((e) => e.alive).length,
      police: (g.police.cars || []).length,
      cops: (g.police.cops || []).length,
      kills: S.stats.kills,
      menu: g.menus ? g.menus.visible : null,
    };
  }

  function angDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    return d;
  }
  function headingTo(x, z) {
    return Math.atan2(-(x - g.player.position.x), -(z - g.player.position.z));
  }
  function distTo(x, z) {
    return Math.hypot(x - g.player.position.x, z - g.player.position.z);
  }
  function nearestNode(x, z) {
    let best = null;
    let bd = Infinity;
    for (const [id, n] of g.city.roadGraph.nodes) {
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bd) { bd = d; best = { id, x: n.x, z: n.z }; }
    }
    return best;
  }
  function bfsPath(fromId, toId) {
    const adj = new Map();
    for (const e of g.city.roadGraph.edges) {
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a).push(e.b);
      adj.get(e.b).push(e.a);
    }
    const prev = new Map([[fromId, null]]);
    const q = [fromId];
    while (q.length) {
      const cur = q.shift();
      if (cur === toId) break;
      for (const nb of adj.get(cur) || []) {
        if (!prev.has(nb)) { prev.set(nb, cur); q.push(nb); }
      }
    }
    if (!prev.has(toId)) return null;
    const path = [];
    let cur = toId;
    while (cur) { path.unshift(cur); cur = prev.get(cur); }
    return path.map((id) => g.city.roadGraph.nodes.get(id));
  }

  // Drive (in a car) or walk (on foot) to a target via road nodes, then straight in.
  function goto(tx, tz, opts) {
    opts = opts || {};
    const maxSteps = opts.maxSteps || 60 * 240;
    const reach = opts.reach || 6;
    const fromN = nearestNode(g.player.position.x, g.player.position.z);
    const toN = nearestNode(tx, tz);
    let wps = [];
    const path = bfsPath(fromN.id, toN.id);
    if (path) wps = path.map((n) => ({ x: n.x, z: n.z }));
    wps.push({ x: tx, z: tz });
    let wi = 0;
    let steps = 0;
    let lastX = g.player.position.x;
    let lastZ = g.player.position.z;
    let reversed = 0;
    let stuckNotes = 0;
    let lastStuckStep = -1000;
    while (steps < maxSteps) {
      if (distTo(tx, tz) <= reach) { setKeys([]); return { ok: true, steps, ...snap() }; }
      if (S.endState) { setKeys([]); return { ok: false, reason: 'endState:' + S.endState, steps, ...snap() }; }
      const wp = wps[Math.min(wi, wps.length - 1)];
      const d = Math.hypot(wp.x - g.player.position.x, wp.z - g.player.position.z);
      if (d < (wi < wps.length - 1 ? 9 : reach)) { wi += 1; continue; }
      // Aim at the waypoint offset 2.5 m to the right of the line of travel
      // (right-hand lane): traffic cars drive on the road centre line, and
      // following one nose-to-tail is the main way the autopilot wedges.
      // The road is 12 m wide, so a 2.5 m offset stays on the asphalt.
      let aimX = wp.x;
      let aimZ = wp.z;
      if (!g.player.onFoot) {
        const adx = wp.x - g.player.position.x;
        const adz = wp.z - g.player.position.z;
        const al = Math.hypot(adx, adz) || 1;
        aimX = wp.x + (adz / al) * 2.5;
        aimZ = wp.z + (-adx / al) * 2.5;
      }
      const desired = headingTo(aimX, aimZ);
      const cur = g.player.onFoot ? g.player.cameraYaw : g.player.heading;
      if (g.player.onFoot) g.player.cameraYaw = desired;
      const diff = angDiff(cur, desired);
      const speed = Math.abs(g.player.speed || 0);
      let codes = [];
      if (g.player.onFoot) {
        codes = [FWD, RUN];
      } else if (reversed > 0) {
        codes = [BACK, diff > 0 ? RIGHT : LEFT];
        reversed -= 1;
      } else {
        // Cap speed by how sharp the turn is, looking AHEAD: if the path
        // turns sharply at the waypoint we are driving to, slow down
        // before we get there. A car arriving at 20 m/s cannot make a
        // 90-degree turn on a 12 m road without clipping the building
        // on the far side — and the old cap only slowed it once it was
        // already in the turn, which is too late.
        const ad = Math.abs(diff);
        let cap = ad > 1.1 ? 8 : ad > 0.5 ? 12 : 20;
        const nextWp = wps[Math.min(wi + 1, wps.length - 1)];
        if (nextWp && wi < wps.length - 1) {
          // Leg into this waypoint starts at the previous waypoint, or at
          // the player when this is the first one.
          const prevX = wi > 0 ? wps[wi - 1].x : g.player.position.x;
          const prevZ = wi > 0 ? wps[wi - 1].z : g.player.position.z;
          const turn = Math.abs(angDiff(
            Math.atan2(wp.x - prevX, wp.z - prevZ),
            Math.atan2(nextWp.x - wp.x, nextWp.z - wp.z),
          ));
          if (turn > 0.5) {
            // Sharp turn ahead: the closer we are, the slower we go.
            cap = Math.min(cap, d < 30 ? 9 : 13);
          }
        }
        if (speed > cap + 1) {
          codes = [BACK]; // brake
          if (ad > 0.15) codes.push(ad > 0 ? LEFT : RIGHT);
        } else {
          codes = [FWD];
          if (diff > 0.12) codes.push(LEFT);
          else if (diff < -0.12) codes.push(RIGHT);
        }
      }
      setKeys(codes);
      step(1);
      steps += 1;
      if (steps % 150 === 0) {
        const moved = Math.hypot(g.player.position.x - lastX, g.player.position.z - lastZ);
        if (moved < 1.5 && steps - lastStuckStep > 300) {
          if (g.player.onFoot) {
            // On foot, wedged against a building (mission markers sit
            // inside blocks, not on roads): sidestep perpendicular to the
            // target to slide around it, alternating sides each time.
            stuckNotes += 1;
            lastStuckStep = steps;
            const side = stuckNotes % 2 === 0 ? LEFT : RIGHT;
            log.push('goto on-foot stuck at ' + JSON.stringify(snap().pos) + ', sidestepping ' + side);
            setKeys([FWD, side]);
            for (let s = 0; s < 45; s++) { step(1); steps += 1; }
            setKeys([]);
          } else {
            reversed = 60;
            stuckNotes += 1;
            lastStuckStep = steps;
            log.push('goto stuck at ' + JSON.stringify(snap().pos) + ' wp=' + wi + '/' + wps.length + ' (n=' + stuckNotes + '), reversing');
            if (stuckNotes >= 3) {
              // Recompute the route from where we actually are.
              const fromN2 = nearestNode(g.player.position.x, g.player.position.z);
              const path2 = bfsPath(fromN2.id, toN.id);
              if (path2) {
                wps = path2.map((n) => ({ x: n.x, z: n.z }));
                wps.push({ x: tx, z: tz });
                wi = 0;
                stuckNotes = 0;
                log.push('goto re-routed from ' + JSON.stringify(snap().pos));
              }
            }
          }
        }
        lastX = g.player.position.x;
        lastZ = g.player.position.z;
      }
    }
    setKeys([]);
    return { ok: false, reason: 'timeout', steps, ...snap() };
  }

  // Enter the nearest car within 3 m (E). Returns true when in a car.
  function enterCar() {
    const car = g.vehicles ? g.vehicles.nearestCar(g.player.position, 3) : null;
    if (!car) return { ok: false, reason: 'no car within 3m', ...snap() };
    press(INTERACT);
    return { ok: !g.player.onFoot, ...snap() };
  }

  // Walk to the nearest driverless car of a given type and get in it.
  function getInCarOfType(type, maxDist) {
    maxDist = maxDist || 60;
    if (!g.player.onFoot) return { ok: false, reason: 'already in a car', ...snap() };
    let best = null;
    let bd = maxDist;
    for (const car of g.vehicles.cars) {
      if (car.type !== type) continue;
      if (car.driver !== null && car.driver !== undefined) continue;
      const d = Math.hypot(car.position.x - g.player.position.x, car.position.z - g.player.position.z);
      if (d < bd) { bd = d; best = car; }
    }
    if (!best) return { ok: false, reason: 'no parked ' + type + ' within ' + maxDist + 'm', ...snap() };
    const r = goto(best.position.x, best.position.z, { reach: 2.5, maxSteps: 60 * 120 });
    if (!r.ok) return { ok: false, reason: 'could not walk to ' + type, ...r };
    return enterCar();
  }

  // Walk to the nearest driverless (parked) car and get in it.
  function getInNearestCar(maxDist) {
    maxDist = maxDist || 200;
    if (!g.player.onFoot) return { ok: true, already: true, ...snap() };
    let best = null;
    let bd = maxDist;
    for (const car of g.vehicles.cars) {
      if (car.driver !== null && car.driver !== undefined) continue;
      const d = Math.hypot(car.position.x - g.player.position.x, car.position.z - g.player.position.z);
      if (d < bd) { bd = d; best = car; }
    }
    if (!best) return { ok: false, reason: 'no parked car within ' + maxDist + 'm', ...snap() };
    const r = goto(best.position.x, best.position.z, { reach: 2.5, maxSteps: 60 * 120 });
    if (!r.ok) return { ok: false, reason: 'could not walk to car', ...r };
    return enterCar();
  }

  // Walk/drive to a mission marker and press E to start it. The car only
  // needs to get close (12 m); the last stretch is on foot, because a car
  // cannot always squeeze within 6 m of a marker.
  function startMissionAt(x, z) {
    let r = goto(x, z, { reach: 12, maxSteps: 60 * 240 });
    if (!r.ok) return { ok: false, reason: 'could not reach marker', ...r };
    if (!g.player.onFoot) press(INTERACT); // exit the car first
    step(10);
    r = goto(x, z, { reach: 6, maxSteps: 60 * 60 });
    if (!r.ok) return { ok: false, reason: 'could not reach marker on foot', ...r };
    // Debug: record exactly what the E press sees.
    const dbg = () => {
      const car = g.vehicles ? g.vehicles.nearestCar(g.player.position, 3) : null;
      return {
        onFoot: g.player.onFoot,
        pos: [+g.player.position.x.toFixed(1), +g.player.position.z.toFixed(1)],
        dist: +Math.hypot(g.player.position.x - x, g.player.position.z - z).toFixed(2),
        nearCar: car ? car.type : null,
        cur: g.missions.current ? g.missions.current.id : null,
        pressedHasE: input._pressed.has(INTERACT),
      };
    };
    log.push('startMissionAt E#1 before: ' + JSON.stringify(dbg()));
    press(INTERACT);
    step(5);
    log.push('startMissionAt E#1 after: ' + JSON.stringify(dbg()));
    if (!g.missions.current) {
      press(INTERACT);
      step(5);
      log.push('startMissionAt E#2 after: ' + JSON.stringify(dbg()));
    }
    return { ok: !!g.missions.current, ...snap() };
  }

  // Aim the camera so the pistol ray passes through the enemy's chest, then hold fire.
  function aimAtEnemy(e) {
    const p = g.player.position;
    const dx = e.position.x - p.x;
    const dz = e.position.z - p.z;
    const L = Math.hypot(dx, dz);
    if (L < 0.5) return false;
    const d = { x: dx / L, z: dz / L };
    g.player.cameraYaw = Math.atan2(-d.x, -d.z);
    // Camera sits 6.5 m behind the player; the ray through the player's head
    // (y 1.6) must reach chest height (y ~1.0) at distance L.
    const h = 1.6 + 3.9 / Math.max(L, 3);
    const s = (h - 1.6 - 1.28) / 6.5;
    g.player.cameraPitch = Math.asin(Math.max(-1, Math.min(1, s)));
    return true;
  }

  // Shoot the squad until all are dead, the player is down, or time runs out.
  function fight(maxSteps) {
    maxSteps = maxSteps || 60 * 90;
    const startKills = S.stats.kills;
    const startShots = S.stats.shotsFired || 0;
    let steps = 0;
    let minHealth = S.health;
    while (steps < maxSteps) {
      const alive = (g.combat.enemies || []).filter((e) => e.alive);
      const shotsFired = (S.stats.shotsFired || 0) - startShots;
      if (alive.length === 0) {
        input._mouseDown = false;
        setKeys([]);
        return { ok: true, steps, kills: S.stats.kills - startKills, minHealth, shotsFired, ...snap() };
      }
      if (S.endState) {
        input._mouseDown = false;
        setKeys([]);
        return { ok: false, reason: 'endState:' + S.endState, steps, kills: S.stats.kills - startKills, minHealth, shotsFired, ...snap() };
      }
      let best = null;
      let bd = Infinity;
      for (const e of alive) {
        const d = Math.hypot(e.position.x - g.player.position.x, e.position.z - g.player.position.z);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) aimAtEnemy(best);
      input._mouseDown = true;
      // Strafe while shooting: a stationary shooter gets busted by any foot
      // cop that walks up (bust needs player speed < 1.5), so keep moving
      // sideways — alternating every half second keeps the aim on target
      // while the player stays too fast to be grabbed.
      const strafe = Math.floor(steps / 30) % 2 === 0 ? 'KeyA' : 'KeyD';
      setKeys([strafe]);
      step(1);
      steps += 1;
      if (S.health < minHealth) minHealth = S.health;
      if (steps % 600 === 0) {
        log.push('fight t=' + (steps / 60).toFixed(0) + 's alive=' + alive.length + ' hp=' + Math.round(S.health) + ' pos=' + JSON.stringify(snap().pos));
      }
    }
    input._mouseDown = false;
    setKeys([]);
    return { ok: false, reason: 'timeout', steps, kills: S.stats.kills - startKills, minHealth, shotsFired: (S.stats.shotsFired || 0) - startShots, ...snap() };
  }

  // Ram the vault truck until it stops (or press E beside it as a fallback).
  function ramTruck(maxSteps) {
    maxSteps = maxSteps || 60 * 120;
    let steps = 0;
    let lastHits = g.missions._truckHits || 0;
    while (steps < maxSteps) {
      if (!g.missions.current) return { ok: false, reason: 'no current mission', steps, ...snap() };
      if (g.missions._truckStopped) { setKeys([]); return { ok: true, steps, hits: g.missions._truckHits, ...snap() }; }
      if (S.endState) { setKeys([]); return { ok: false, reason: 'endState:' + S.endState, steps, hits: g.missions._truckHits, ...snap() }; }
      const t = g.missions._vaultTruck;
      if (!t) return { ok: false, reason: 'no vault truck', steps, ...snap() };
      const r = goto(t.position.x, t.position.z, { reach: 4, maxSteps: 60 });
      if (r.ok) {
        // We are on top of the truck: back off and come again.
        setKeys([BACK]);
        step(30);
        setKeys([]);
      }
      if ((g.missions._truckHits || 0) > lastHits) {
        lastHits = g.missions._truckHits;
        log.push('ram hit #' + lastHits + ' at t=' + (steps / 60).toFixed(1) + 's');
      }
      steps += 60;
    }
    setKeys([]);
    return { ok: false, reason: 'timeout', steps, hits: g.missions._truckHits, ...snap() };
  }

  // Flee until the wanted level reaches zero, driving corner to corner.
  function escape(maxSteps) {
    maxSteps = maxSteps || 60 * 300;
    let steps = 0;
    while (steps < maxSteps) {
      if (S.wanted <= 0) { setKeys([]); return { ok: true, steps, ...snap() }; }
      if (S.endState) { setKeys([]); return { ok: false, reason: 'endState:' + S.endState, steps, ...snap() }; }
      // Farthest corner from the nearest police car.
      let nearest = null;
      let nd = Infinity;
      for (const e of g.police.cars) {
        const d = Math.hypot(e.car.position.x - g.player.position.x, e.car.position.z - g.player.position.z);
        if (d < nd) { nd = d; nearest = e; }
      }
      const corners = [[-220, -220], [220, -220], [-220, 220], [220, 220]];
      let best = corners[0];
      let bd = -1;
      for (const c of corners) {
        const ref = nearest ? nearest.car.position : g.player.position;
        const d = Math.hypot(c[0] - ref.x, c[1] - ref.z);
        if (d > bd) { bd = d; best = c; }
      }
      const legStart = steps;
      const r = goto(best[0], best[1], { reach: 12, maxSteps: 60 * 90 });
      steps += Math.max(1, r.steps || 0);
      if (steps - legStart < 1) step(1);
      log.push('escape leg done t=' + (steps / 60).toFixed(0) + 's wanted=' + S.wanted + ' quiet=' + S.quietSeconds.toFixed(0) + ' police=' + (g.police.cars || []).length + ' pos=' + JSON.stringify(snap().pos));
      if (!r.ok && r.reason !== 'timeout' && !r.reason.startsWith('endState')) {
        // goto failed for another reason; keep trying a different corner.
      }
    }
    setKeys([]);
    return { ok: false, reason: 'timeout', steps, ...snap() };
  }

  function waitSteps(n) { step(n); return { ...snap() }; }
  function setTimer(s) { g.missions.timer = s; return { timer: g.missions.timer, ...snap() }; }
  function pressE() { press(INTERACT); step(5); return { ...snap() }; }
  function exitCar() { if (!g.player.onFoot) press(INTERACT); step(5); return { ...snap() }; }
  function getLog() { return log.slice(); }
  function clearLog() { log.length = 0; }

  window.__bot = {
    snap, goto, enterCar, getInNearestCar, getInCarOfType, startMissionAt, fight, ramTruck,
    escape, waitSteps, setTimer, pressE, exitCar, getLog, clearLog,
  };
  return 'bot ready';
})();
