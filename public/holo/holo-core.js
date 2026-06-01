/* ============================================================
   HOLO CORE
   Shared scaffolding for the Baal/Terra hologram pages.
   Builds DOM chrome, the Three.js scene, the startup/collapse
   animation, drag handling, labels, and the loc-detail screen.

   Per-world differences are passed in as `config` to
   window.HoloCore.create(config).
   ============================================================ */

(function () {
  "use strict";

  // ----- shared constants -----
  const STARTUP_DUR = 3.2;
  const COLLAPSE_DUR = 1.4;
  const PLANET_RADIUS = 15;

  // ----- DOM helpers -----
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "style") Object.assign(e.style, attrs[k]);
        else if (k === "class") e.className = attrs[k];
        else if (k === "dataset") Object.assign(e.dataset, attrs[k]);
        else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
        else if (k === "html") e.innerHTML = attrs[k];
        else e.setAttribute(k, attrs[k]);
      }
    }
    for (const k of kids) {
      if (k == null) continue;
      e.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
    }
    return e;
  }

  function buildChrome(cfg) {
    const launchUi = el("div", { id: "launch-ui" },
      el("div", { id: "launch-brand" }, cfg.brand || ""),
      el("button", { id: "btn-launch", type: "button", "aria-label": "Initiate hologram projection" }, cfg.launchLabel || "⬡ INITIATE PROJECTION")
    );

    const btnStop = el("button", { id: "btn-stop", type: "button", "aria-label": "Terminate hologram projection" }, cfg.collapseLabel || "■ TERMINATE SIGNAL");

    const loading = el("div", { id: "loading" },
      el("div", { id: "loading-text" }, cfg.loadingText || "[ ACCESSING ARCHIVE ]"),
      el("div", { id: "loading-bar-wrap" }, el("div", { id: "loading-bar" }))
    );

    const hudTop = el("div", { id: "hud-top" },
      el("div", { id: "title" }, cfg.title || ""),
      el("div", { id: "subtitle" }, cfg.subtitle || "")
    );

    const hudSigil = cfg.sigil ? el("div", { id: "hud-sigil" }, cfg.sigil) : null;

    const hudCorners = el("div", { id: "hud-corners" },
      el("div", { class: "corner tl" }),
      el("div", { class: "corner tr" }),
      el("div", { class: "corner bl" }),
      el("div", { class: "corner br" })
    );

    const scanBar = el("div", { id: "scan-bar" });

    const startupOverlay = el("div", { id: "startup-overlay" },
      el("div", { id: "startup-noise" }),
      el("div", { id: "startup-beam" }),
      el("div", { id: "startup-sweep" }),
      el("div", { id: "startup-point" })
    );

    const labelsRoot = el("div", { id: "labels" });

    const hudBottomKids = [el("div", { id: "hud-info", html: cfg.hudInfo || "" })];
    if (cfg.astroStatus) hudBottomKids.push(el("div", { id: "astro-status", html: cfg.astroStatus }));
    const hudBottom = el("div", { id: "hud-bottom" }, ...hudBottomKids);

    const locScreen = el("div", { id: "loc-screen", role: "dialog", "aria-modal": "true", "aria-labelledby": "screen-title" },
      el("div", { id: "loc-screen-head" },
        el("span", { id: "screen-title" }),
        el("button", { id: "screen-close", type: "button", "aria-label": "Close" }, "✕")
      ),
      el("div", { id: "loc-screen-body" },
        el("div", { id: "screen-lore" }),
        el("span", { id: "screen-placeholder" }, cfg.screenPlaceholder || "[ VISUAL FEED PENDING UPLINK ]")
      )
    );

    const fallback = el("div", { id: "webgl-fallback" },
      el("div", null,
        el("div", null, "[ COGITATOR LINK FAILURE ]"),
        el("div", { style: { marginTop: "16px", opacity: ".7" } }, "WebGL not available on this device.")
      )
    );

    const body = document.body;
    body.appendChild(launchUi);
    body.appendChild(btnStop);
    body.appendChild(loading);
    body.appendChild(hudTop);
    if (hudSigil) body.appendChild(hudSigil);
    body.appendChild(hudCorners);
    body.appendChild(scanBar);
    body.appendChild(startupOverlay);
    body.appendChild(labelsRoot);
    body.appendChild(hudBottom);
    body.appendChild(locScreen);
    body.appendChild(fallback);

    return {
      launchUi, btnStop, loading, hudTop, hudSigil, hudCorners,
      scanBar, startupOverlay, labelsRoot, hudBottom, locScreen, fallback
    };
  }

  // ----- audio (deferred) -----
  function makeAudio(cfg) {
    const slots = {};
    const paths = cfg.sounds || { up: "sounds/holo_up.mp3", down: "sounds/holo_down.mp3" };
    function play(key) {
      let a = slots[key];
      if (!a) {
        try {
          a = new Audio(paths[key]);
          a.volume = 0.7;
          slots[key] = a;
        } catch (_) { return; }
      }
      try { a.currentTime = 0; a.play().catch(() => {}); } catch (_) {}
    }
    return { play };
  }

  // ----- main -----
  function create(cfg) {
    const chrome = buildChrome(cfg);

    // -- WebGL detection / fallback --
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      chrome.loading.style.display = "none";
      chrome.launchUi.style.display = "none";
      chrome.fallback.style.display = "flex";
      return;
    }

    const audio = makeAudio(cfg);

    // -- scene/camera/renderer --
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 2000);
    camera.position.z = 42;

    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    const canvas = renderer.domElement;
    canvas.style.touchAction = "none";
    canvas.style.display = "block";
    document.body.insertBefore(canvas, document.body.firstChild);

    // -- loading bar --
    const loadingBar = document.getElementById("loading-bar");
    function setProgress(p) { loadingBar.style.width = p + "%"; }
    setProgress(10);

    // -- star field --
    (function addStars() {
      const N = 4000;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(N * 3);
      const col = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const r = 800 + Math.random() * 400;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3]     = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
        pos[i * 3 + 2] = r * Math.cos(ph);
        const w = Math.random() * 0.3;
        col[i * 3]     = 0.8 + w;
        col[i * 3 + 1] = 0.78 + w * 0.45;
        col[i * 3 + 2] = 0.72;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color",    new THREE.BufferAttribute(col, 3));
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
        size: 0.6, sizeAttenuation: true, vertexColors: true,
        transparent: true, opacity: 0.9
      })));
    })();

    setProgress(35);

    // Per-world bake may be sync (returns Texture) or async (returns Promise<Texture>).
    // Promise.resolve handles both. Everything that depends on the planet texture
    // lives inside the .then below.
    Promise.resolve(cfg.bakeTexture(renderer)).then((planetTex) => {
    setProgress(70);

    // -- planet --
    const planetGeo = new THREE.SphereGeometry(PLANET_RADIUS, 128, 128);
    const planetMatCfg = Object.assign({
      map: planetTex,
      roughness: 0.85,
      metalness: 0.04,
      envMapIntensity: 0.1
    }, cfg.planetMaterial || {});
    if (cfg.planetMaterial && cfg.planetMaterial.emissive != null) {
      planetMatCfg.emissive = new THREE.Color(cfg.planetMaterial.emissive);
      planetMatCfg.emissiveMap = planetTex;
    }
    const planetMat = new THREE.MeshStandardMaterial(planetMatCfg);
    const planet = new THREE.Mesh(planetGeo, planetMat);

    // -- holographic latitude lines --
    const wireframe = new THREE.Group();
    (cfg.latLines || []).forEach((spec) => {
      const latR = spec.deg * Math.PI / 180;
      const r = (PLANET_RADIUS + 0.15) * Math.cos(latR);
      const y = (PLANET_RADIUS + 0.15) * Math.sin(latR);
      const pts = [];
      for (let i = 0; i <= 128; i++) {
        const a = i / 128 * Math.PI * 2;
        pts.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
      }
      wireframe.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: spec.color, transparent: true, opacity: spec.opacity,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      ));
    });

    // -- atmosphere rim shader --
    const atmCfg = cfg.atmosphere || {};
    const atmosphereMat = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(atmCfg.color != null ? atmCfg.color : 0xff4400) },
        intensity: { value: atmCfg.intensity != null ? atmCfg.intensity : 1.2 },
        rimPower:  { value: atmCfg.power != null ? atmCfg.power : 2.8 },
        rimAlpha:  { value: atmCfg.alpha != null ? atmCfg.alpha : 0.75 }
      },
      vertexShader: `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        uniform float intensity;
        uniform float rimPower;
        uniform float rimAlpha;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float rim = 1.0 - max(0.0, dot(normalize(vWorldNormal), viewDir));
          rim = pow(rim, rimPower);
          gl_FragColor = vec4(glowColor * rim, rim * rimAlpha * intensity);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const atmRadius = atmCfg.radius != null ? atmCfg.radius : 15.75;
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(atmRadius, 64, 64), atmosphereMat);

    // -- rings --
    const ringRefs = (cfg.rings || []).map((spec) => {
      const geo = new THREE.RingGeometry(spec.inner, spec.outer, 128);
      const mat = new THREE.MeshBasicMaterial({
        color: spec.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: spec.opacity != null ? spec.opacity : 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = spec.tiltX != null ? spec.tiltX : Math.PI / 2;
      mesh.rotation.z = spec.tiltZ || 0;
      return { mesh, mat, spec };
    });

    // -- scan plane --
    const scanCfg = cfg.scan || {};
    const scanMat = new THREE.MeshBasicMaterial({
      color: scanCfg.color != null ? scanCfg.color : 0xff5500,
      transparent: true,
      opacity: scanCfg.opacity != null ? scanCfg.opacity : 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const scanPlane = new THREE.Mesh(new THREE.PlaneGeometry(32, 0.08), scanMat);

    // -- scene group --
    const sceneGroup = new THREE.Group();
    sceneGroup.add(planet, wireframe, atmosphere, scanPlane, ...ringRefs.map((r) => r.mesh));
    scene.add(sceneGroup);
    sceneGroup.scale.setScalar(0);

    // -- lights --
    const lights = cfg.lights || {};
    const sunCfg = lights.sun || { color: 0xff9955, intensity: 1.3, position: [-6, 2, 5] };
    const sun = new THREE.DirectionalLight(sunCfg.color, sunCfg.intensity);
    sun.position.set(...sunCfg.position);
    scene.add(sun);
    const ambCfg = lights.ambient || { color: 0x1a0500, intensity: 0.9 };
    scene.add(new THREE.AmbientLight(ambCfg.color, ambCfg.intensity));
    if (lights.rim) {
      const rim = new THREE.DirectionalLight(lights.rim.color, lights.rim.intensity);
      rim.position.set(...lights.rim.position);
      scene.add(rim);
    }

    // -- labels with 3D beacons --
    const _scratchV = new THREE.Vector3();
    const beaconGeo = new THREE.CylinderGeometry(0.04, 0.04, 3, 8);
    beaconGeo.rotateX(Math.PI / 2);
    beaconGeo.translate(0, 0, 1.5);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: cfg.beaconColor != null ? cfg.beaconColor : 0xff4400,
      transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false
    });

    function openScreen(loc) {
      isPaused = true;
      chrome.locScreen.classList.add("glitching");
      setTimeout(() => chrome.locScreen.classList.remove("glitching"), 300);
      document.getElementById("screen-title").textContent = "[ " + loc.name + " ]";
      const loreEl = document.getElementById("screen-lore");
      const placeholder = document.getElementById("screen-placeholder");
      loreEl.textContent = "";
      placeholder.style.display = "none";
      placeholder.classList.remove("glitching");
      chrome.locScreen.style.display = "block";
      runTypewriter(loreEl, placeholder, loc.desc);
    }

    function closeScreen() {
      stopTypewriter();
      isPaused = false;
      chrome.locScreen.style.display = "none";
    }

    const points = (cfg.locations || []).map((p) => {
      const div = el("div", { class: "label" }, p.name);
      div.style.pointerEvents = "all";
      div.style.cursor = "pointer";
      div.setAttribute("role", "button");
      div.setAttribute("tabindex", "0");
      div.setAttribute("aria-label", "Open detail for " + p.name);
      const handler = () => openScreen(p);
      div.addEventListener("click", handler);
      div.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); }
      });
      chrome.labelsRoot.appendChild(div);

      const phi = (90 - p.lat) * Math.PI / 180;
      const theta = (p.lon + 180) * Math.PI / 180;
      const pos = new THREE.Vector3(
        -(PLANET_RADIUS * Math.sin(phi) * Math.cos(theta)),
        PLANET_RADIUS * Math.cos(phi),
        PLANET_RADIUS * Math.sin(phi) * Math.sin(theta)
      );

      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.copy(pos);
      beacon.lookAt(pos.clone().multiplyScalar(2));
      planet.add(beacon);

      return { el: div, pos };
    });

    function updateLabels() {
      planet.updateMatrixWorld();
      const planD = planet.position.distanceTo(camera.position);
      const visibleByScale = sceneGroup.scale.x >= 0.1;
      const w = innerWidth, h = innerHeight;
      for (const p of points) {
        _scratchV.copy(p.pos).applyMatrix4(planet.matrixWorld);
        const camD = _scratchV.distanceTo(camera.position);
        if (camD > planD || !visibleByScale) {
          if (p.el.style.visibility !== "hidden") p.el.style.visibility = "hidden";
        } else {
          _scratchV.project(camera);
          p.el.style.visibility = "visible";
          p.el.style.transform = "translate(" + ((_scratchV.x * 0.5 + 0.5) * w) + "px," + (-(_scratchV.y * 0.5 - 0.5) * h) + "px)";
        }
      }
    }

    // -- typewriter (single module-scoped handle) --
    let typewriterId = null;
    function stopTypewriter() {
      if (typewriterId != null) { clearInterval(typewriterId); typewriterId = null; }
    }
    function runTypewriter(loreEl, placeholder, text) {
      stopTypewriter();
      let i = 0;
      const scrap = "X#01>";
      typewriterId = setInterval(() => {
        if (Math.random() > 0.95 && i < text.length - 1) {
          loreEl.textContent = text.substring(0, i) + scrap[Math.floor(Math.random() * scrap.length)];
        } else {
          loreEl.textContent = text.substring(0, i + 1);
          i++;
        }
        if (i >= text.length) {
          stopTypewriter();
          setTimeout(() => {
            placeholder.style.display = "block";
            placeholder.classList.add("glitching");
          }, 400);
        }
      }, 30);
    }

    // -- pointer drag (canvas-scoped) --
    let isDragging = false, isPaused = false;
    let rotY = 0, rotX = 0, targetRotY = 0, targetRotX = 0;
    let lastX = 0, lastY = 0;
    const autoSpeed = 0.18; // rad/sec

    canvas.addEventListener("pointerdown", (e) => {
      isDragging = true;
      lastX = e.clientX; lastY = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      targetRotY += (e.clientX - lastX) * 0.006;
      targetRotX += (e.clientY - lastY) * 0.006;
      targetRotX = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, targetRotX));
      lastX = e.clientX; lastY = e.clientY;
    });
    const release = (e) => {
      isDragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("pointerleave", release);

    // -- screen close handlers --
    document.getElementById("screen-close").addEventListener("click", closeScreen);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && chrome.locScreen.style.display === "block") closeScreen();
    });

    // -- resize --
    addEventListener("resize", () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    });

    // -- extras hook --
    const extras = (typeof cfg.buildExtras === "function")
      ? cfg.buildExtras({ scene, sceneGroup, planet, renderer, atmosphere, THREE })
      : null;

    // -- startup / collapse / launch --
    let holoActive = false, collapseAnim = false;
    let startupPhase = 0, startupT = 0, collapseT = 0;
    const activeTimeouts = [];
    function pushTo(ms, fn) { activeTimeouts.push(setTimeout(fn, ms)); }
    function clearTimeoutsAll() { activeTimeouts.splice(0).forEach(clearTimeout); }

    const HUD_IDS = ["hud-top", "hud-corners", "scan-bar", "labels", "hud-bottom", "startup-overlay"];
    if (chrome.hudSigil) HUD_IDS.push("hud-sigil");

    function launchHolo() {
      if (holoActive) return;
      holoActive = true;
      audio.play("up");
      chrome.launchUi.style.transition = "opacity 0.4s";
      chrome.launchUi.style.opacity = "0";
      setTimeout(() => { chrome.launchUi.style.display = "none"; }, 400);

      HUD_IDS.forEach((id) => {
        const elx = document.getElementById(id);
        if (!elx) return;
        elx.style.transition = "opacity 0.01s";
        elx.style.opacity = "1";
        if (id === "labels" || id === "hud-bottom") elx.style.pointerEvents = "";
      });

      pushTo(STARTUP_DUR * 1000, () => { chrome.btnStop.style.display = "block"; });
      triggerStartup();
    }

    function collapseHolo() {
      if (!holoActive || collapseAnim) return;
      collapseAnim = true;
      collapseT = 0;
      audio.play("down");
      clearTimeoutsAll();

      HUD_IDS.filter((id) => id !== "startup-overlay").forEach((id) => {
        const elx = document.getElementById(id);
        if (!elx) return;
        elx.style.transition = "opacity 0.5s";
        elx.style.opacity = "0";
        elx.style.pointerEvents = "none";
      });

      chrome.startupOverlay.style.display = "none";
      const sweep = document.getElementById("startup-sweep");
      sweep.style.transition = "none";
      sweep.style.bottom = "-60%";
      chrome.btnStop.style.display = "none";
    }

    function triggerStartup() {
      startupPhase = 1;
      startupT = 0;
      chrome.startupOverlay.style.display = "block";

      const point = document.getElementById("startup-point");
      const beam  = document.getElementById("startup-beam");
      const noise = document.getElementById("startup-noise");
      const sweep = document.getElementById("startup-sweep");
      const hud   = document.getElementById("hud-top");
      const info  = document.getElementById("hud-bottom");
      const sigil = chrome.hudSigil;

      hud.style.opacity = "0";
      info.style.opacity = "0";
      if (sigil) sigil.style.opacity = "0";
      hud.style.transition = "opacity 0.6s ease";
      info.style.transition = "opacity 0.8s ease";
      if (sigil) sigil.style.transition = "opacity 1.1s ease";
      point.style.transition = "opacity 0.08s ease";
      point.style.opacity = "1";

      pushTo(100, () => {
        beam.style.transition = "opacity 0.2s ease";
        noise.style.transition = "opacity 0.3s ease";
        beam.style.opacity = "0.9";
        noise.style.opacity = "1";
      });
      pushTo(300, () => {
        sweep.style.transition = "bottom 2.4s cubic-bezier(0.16, 1, 0.3, 1)";
        sweep.style.bottom = "100%";
      });
      pushTo(1000, () => {
        point.style.transition = "opacity 0.5s ease";
        beam.style.transition  = "opacity 0.5s ease";
        point.style.opacity = "0";
        beam.style.opacity = "0";
      });
      pushTo(2200, () => {
        noise.style.transition = "opacity 1.0s ease";
        noise.style.opacity = "0";
        hud.style.opacity = "1";
        info.style.opacity = "1";
        if (sigil) sigil.style.opacity = "1";
      });
      pushTo(STARTUP_DUR * 1000, () => {
        startupPhase = 2;
        chrome.startupOverlay.style.display = "none";
        sweep.style.transition = "none";
        sweep.style.bottom = "-60%";
      });
    }

    document.getElementById("btn-launch").addEventListener("click", launchHolo);
    chrome.btnStop.addEventListener("click", collapseHolo);

    // -- animation loop (delta-time based) --
    let time = 0;
    let lastFrame = 0;

    function frame(now) {
      requestAnimationFrame(frame);
      const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0.016;
      lastFrame = now;
      time += dt;

      if (startupPhase === 1) {
        startupT += dt;
        const t = Math.min(startupT / STARTUP_DUR, 1.0);
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const flicker = startupT < 0.6 ? 0.5 + Math.random() * 0.5 : 1.0;
        sceneGroup.scale.setScalar(ease * flicker);
      }

      if (collapseAnim) {
        collapseT += dt;
        const t = Math.min(collapseT / COLLAPSE_DUR, 1.0);
        const ease = 1 - (1 - t) * (1 - t) * (1 - t);
        const flicker = t > 0.75 ? (Math.random() > 0.15 ? 1.0 : 0.0) : 1.0;
        sceneGroup.scale.setScalar((1.0 - ease) * flicker);
        if (t >= 1.0) {
          collapseAnim = false;
          holoActive = false;
          sceneGroup.scale.setScalar(0);
          startupPhase = 0;
          startupT = 0;
          const lu = chrome.launchUi;
          lu.style.display = "flex";
          lu.style.opacity = "0";
          setTimeout(() => {
            lu.style.transition = "opacity 0.6s";
            lu.style.opacity = "1";
          }, 50);
        }
      }

      if (!isDragging && !isPaused && holoActive && !collapseAnim) {
        targetRotY += autoSpeed * dt;
      }
      rotY += (targetRotY - rotY) * Math.min(1, 4.2 * dt);
      rotX += (targetRotX - rotX) * Math.min(1, 4.2 * dt);

      planet.rotation.y = rotY;
      planet.rotation.x = rotX;
      atmosphere.rotation.y = rotY * 0.98;
      atmosphere.rotation.x = rotX;
      wireframe.rotation.y = rotY * 1.05;
      wireframe.rotation.x = rotX * 1.05;

      // ring animation (declarative)
      for (const { mesh, mat, spec } of ringRefs) {
        if (spec.pulse) {
          const ph = spec.pulse.phase || 0;
          mat.opacity = spec.pulse.base + Math.sin(time * spec.pulse.freq + ph) * spec.pulse.amp;
        }
        if (spec.rotY) mesh.rotation.y = time * spec.rotY;
        if (spec.rotZ) mesh.rotation.z = time * spec.rotZ;
      }

      // scan plane
      const scanSpeed = scanCfg.speed != null ? scanCfg.speed : 5.5;
      const scanRotSpeed = scanCfg.rotSpeed != null ? scanCfg.rotSpeed : 0.4;
      const scanBase = scanCfg.pulseBase != null ? scanCfg.pulseBase : 0.35;
      const scanAmp = scanCfg.pulseAmp != null ? scanCfg.pulseAmp : 0.15;
      const scanFreq = scanCfg.pulseFreq != null ? scanCfg.pulseFreq : 4;
      scanPlane.position.y = ((time * scanSpeed) % 36) - 18;
      scanPlane.rotation.x = Math.PI / 2;
      scanPlane.rotation.z = time * scanRotSpeed;
      scanMat.opacity = scanBase + Math.sin(time * scanFreq) * scanAmp;

      if (extras && extras.update) extras.update(time, dt);

      updateLabels();
      renderer.render(scene, camera);
    }

    // -- finalize boot --
    setProgress(100);
    setTimeout(() => { chrome.loading.style.display = "none"; }, 300);
    requestAnimationFrame(frame);
    }).catch((err) => {
      console.error("Hologram bake failed:", err);
      chrome.loading.style.display = "none";
      chrome.launchUi.style.display = "none";
      chrome.fallback.style.display = "flex";
    });
  }

  window.HoloCore = { create };
})();
