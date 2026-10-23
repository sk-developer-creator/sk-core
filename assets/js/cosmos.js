'use strict';

/* A small 3D light field: depth-sorted particles travelling toward the viewer,
   plus one slow comet whose glow and trail move through the same space. */
(function () {
  var canvas = document.querySelector('.cosmos__canvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var frameId = 0;
  var resizeTimer = 0;
  var width = 0;
  var height = 0;
  var dpr = 1;
  var cx = 0;
  var cy = 0;
  var clock = 0;
  var last = 0;
  var particles = [];
  var FOV = 480;
  var TAU = Math.PI * 2;
  var COLORS = ['248,245,255', '248,245,255', '209,164,255', '168,85,255', '240,77,255'];

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function makeParticle(z) {
    return {
      x: random(-1000, 1000),
      y: random(-700, 700),
      z: z || random(30, 1150),
      size: random(0.45, 1.5),
      color: COLORS[(Math.random() * COLORS.length) | 0]
    };
  }

  function reset() {
    var count = width < 720 ? 72 : width > 1600 ? 170 : 140;
    particles = [];
    for (var i = 0; i < count; i += 1) particles.push(makeParticle());
  }

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (!width || !height) return false;
    dpr = Math.min(1.75, window.devicePixelRatio || 1);
    if (width * height * dpr * dpr > 2400000) dpr = Math.max(0.75, Math.sqrt(2400000 / (width * height)));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = width / 2;
    cy = height * 0.44;
    reset();
    return true;
  }

  function drawLight(time) {
    var angle = time * 0.00058;
    var angle2 = time * 0.00041 + 1.1;
    var z = 440 + Math.sin(time * 0.00021) * 100;
    var scale = FOV / z;
    var x = cx + Math.sin(angle) * width * 0.28 * scale;
    var y = cy + Math.cos(angle2) * height * 0.18 * scale;
    var radius = Math.max(18, Math.min(width, height) * 0.07 * scale);

    var lastX = x;
    var lastY = y;
    for (var i = 1; i <= 14; i += 1) {
      var t = time - i * 74;
      var zz = 440 + Math.sin(t * 0.00021) * 100;
      var ss = FOV / zz;
      var tx = cx + Math.sin(t * 0.00058) * width * 0.28 * ss;
      var ty = cy + Math.cos(t * 0.00041 + 1.1) * height * 0.18 * ss;
      var fade = 1 - i / 15;
      ctx.strokeStyle = 'rgba(240,120,255,' + (fade * 0.24) + ')';
      ctx.lineWidth = Math.max(0.5, radius * 0.13 * fade);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,235,255,' + (fade * 0.5) + ')';
      ctx.beginPath();
      ctx.arc(tx, ty, Math.max(0.45, radius * 0.07 * fade), 0, TAU);
      ctx.fill();
      lastX = tx;
      lastY = ty;
    }

    var glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, 'rgba(255,255,255,0.98)');
    glow.addColorStop(0.08, 'rgba(255,245,255,0.9)');
    glow.addColorStop(0.28, 'rgba(240,77,255,0.3)');
    glow.addColorStop(0.65, 'rgba(168,85,255,0.1)');
    glow.addColorStop(1, 'rgba(118,37,232,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.2, radius * 0.075), 0, TAU);
    ctx.fill();
  }

  function draw(delta) {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';

    var step = Math.min(48, delta || 16);
    clock += step;

    for (var i = 0; i < particles.length; i += 1) {
      var p = particles[i];
      if (!p) continue;

      var k = FOV / p.z;
      var x = cx + p.x * k;
      var y = cy + p.y * k;
      var radius = Math.max(0.35, Math.min(7.5, p.size * k * 1.15));
      var alpha = Math.min(0.9, 0.12 + (1 - p.z / 1250) * 0.9);

      if (x > -30 && x < width + 30 && y > -30 && y < height + 30) {
        var tailK = FOV / (p.z + 10);
        var tailX = cx + p.x * tailK;
        var tailY = cy + p.y * tailK;
        ctx.strokeStyle = 'rgba(' + p.color + ',' + (alpha * 0.16) + ')';
        ctx.lineWidth = Math.max(0.4, radius * 0.55);
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(x, y);
        ctx.stroke();

        if (radius > 0.7) {
          ctx.fillStyle = 'rgba(' + p.color + ',' + (alpha * 0.12) + ')';
          ctx.beginPath();
          ctx.arc(x, y, radius * 2.6, 0, TAU);
          ctx.fill();
        }

        ctx.fillStyle = 'rgba(' + p.color + ',' + alpha + ')';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TAU);
        ctx.fill();
      }

      p.z -= (0.12 + p.z * 0.00045) * step;
      if (p.z < 18) particles[i] = makeParticle(random(900, 1250));
    }

    drawLight(clock);
    ctx.globalCompositeOperation = 'source-over';
  }

  function stop() {
    if (frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }

  function frame(now) {
    var delta = last ? now - last : 16;
    last = now;
    draw(delta);
    frameId = window.requestAnimationFrame(frame);
  }

  function start() {
    if (frameId || reduce.matches || document.hidden) return;
    last = 0;
    frameId = window.requestAnimationFrame(frame);
  }

  function ready() {
    if (!resize()) return false;
    if (reduce.matches) draw(16);
    else start();
    return true;
  }

  if (!ready()) return;

  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      ready();
    }, 120);
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else if (!reduce.matches) start();
  });

  function motionPreference() {
    if (reduce.matches) {
      stop();
      draw(16);
    } else {
      start();
    }
  }

  if (reduce.addEventListener) reduce.addEventListener('change', motionPreference);
  else if (reduce.addListener) reduce.addListener(motionPreference);
})();
