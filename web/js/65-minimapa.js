  // ---------- minimapa ----------
  const mini = $('mini'), mctx = mini.getContext('2d');
  let miniImgs = {}, HB = null;
  function loadMini() {
    for (const l of LAYERS) {
      const d = l.src(state.season); if (!d) continue;
      const w = +d.Image.Size.Width, h = +d.Image.Size.Height;
      const maxl = Math.ceil(Math.log2(Math.max(w, h))), k = Math.ceil(Math.log2(w / 440));
      const img = new Image(); img.onload = () => { miniImgs[l.key] = img; }; img.src = d.Image.Url + `${maxl - k}/0_0.${d.Image.Format || "png"}${verOf(d.Image.Url)}`;
      l.hrel = h / w;
    }
  }
  function drawMini() {
    HB = homeBounds();
    const s = mini.width / HB.width, mh = Math.round(HB.height * s);
    if (mini.height !== mh) mini.height = mh;
    mctx.fillStyle = '#1b2333'; mctx.fillRect(0, 0, mini.width, mini.height);
    mctx.imageSmoothingEnabled = false;
    for (const l of LAYERS) if (shown(l.key) && miniImgs[l.key]) mctx.drawImage(miniImgs[l.key], (l.x - HB.x) * s, (l.y - HB.y) * s, l.w * s, l.w * (l.hrel || 0.56) * s);
    if (state.night > 0.35) { mctx.fillStyle = `rgba(10,14,40,${(smooth(0.35, 0.95, state.night) * 0.6).toFixed(2)})`; mctx.fillRect(0, 0, mini.width, mini.height); }
    const b = viewer.viewport.getBounds(true);
    mctx.strokeStyle = '#f2c66d'; mctx.lineWidth = 2;
    mctx.strokeRect(Math.round((b.x - HB.x) * s) + 1, Math.round((b.y - HB.y) * s) + 1, Math.max(4, Math.round(b.width * s)), Math.max(4, Math.round(b.height * s)));
  }
  { let drag = false;
    const go = (e) => { if (!HB) return; const r = mini.getBoundingClientRect(), s = HB.width / r.width; viewer.viewport.panTo(new OpenSeadragon.Point(HB.x + (e.clientX - r.left) * s, HB.y + (e.clientY - r.top) * s)); };
    mini.addEventListener('pointerdown', (e) => { drag = true; mini.setPointerCapture(e.pointerId); go(e); });
    mini.addEventListener('pointermove', (e) => { if (drag) go(e); });
    mini.addEventListener('pointerup', () => { drag = false; });
  }

