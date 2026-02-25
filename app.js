(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SCALE = 480;
  const shapes = {
    'rectangle': [[0, 0], [1, 0], [1, 0.6], [0, 0.6]],
    'parallelogram': [[0, 0], [1, 0], [0.85, 0.6], [-0.15, 0.6]],
    'trapezoid': [[0.15, 0], [0.85, 0], [1, 0.6], [0, 0.6]],
    'right-triangle': [[0, 0], [1, 0], [0, 0.6]],
    'equilateral-triangle': [[0.5, 0], [1, 0.866], [0, 0.866]],
    'circle': [[0.5, 0.5], [1, 0.5]]
  };

  const workspace = document.getElementById('workspace');
  const trash = document.getElementById('trash');
  const contextMenuEl = document.getElementById('context-menu');
  let shapeIdCounter = 0;
  let altitudeIdCounter = 0;

  const VERTEX_SIZES = [2, 3, 4, 5, 6, 8];
  const PRESET_COLORS = ['#000000', '#0066cc', '#cc0000', '#009933', '#9933cc', '#ff6600'];
  const GRAYSCALE_COLORS = ['#333333', '#808080', '#c0c0c0'];
  const CLICK_MENU_DELAY = 250;

  let contextMenuTimeout = null;
  let altitudeDrawingMode = null;

  const MAX_UNDO = 50;
  let undoStack = [];
  let redoStack = [];

  function serializeWorkspace() {
    const groups = workspace.querySelectorAll('.shape-group');
    const shapesState = [];
    let maxAltitudeId = 0;
    groups.forEach(g => {
      const shapeType = g.dataset.shapeType || 'rectangle';
      const circles = g.querySelectorAll('.vertex');
      const vertices = Array.from(circles).map(c => [
        parseFloat(c.getAttribute('cx')),
        parseFloat(c.getAttribute('cy'))
      ]);
      const n = vertices.length;
      const vertexLabels = [];
      circles.forEach((_, i) => {
        const el = g.querySelector('.vertex-label[data-vertex-index="' + i + '"]');
        vertexLabels.push({
          text: (el && (el.textContent || el.getAttribute('data-label') || '')) || '',
          offsetDx: el && el.hasAttribute('data-offset-dx') ? parseFloat(el.getAttribute('data-offset-dx')) : LABEL_OFFSET_X,
          offsetDy: el && el.hasAttribute('data-offset-dy') ? parseFloat(el.getAttribute('data-offset-dy')) : LABEL_OFFSET_Y
        });
      });
      const vertexStyles = [];
      circles.forEach(c => {
        const r = c.getAttribute('data-size') || c.getAttribute('r') || '3';
        const fill = c.getAttribute('data-color') || c.style.fill || '';
        vertexStyles.push({ r: parseInt(r, 10), fill: fill || undefined });
      });
      const edgeLabels = [];
      for (let i = 0; i < n; i++) {
        const el = g.querySelector('.edge-label[data-edge-index="' + i + '"]');
        edgeLabels.push({
          text: (el && (el.textContent || el.getAttribute('data-label') || '')) || '',
          offsetDx: el && el.hasAttribute('data-offset-dx') ? parseFloat(el.getAttribute('data-offset-dx')) : 0,
          offsetDy: el && el.hasAttribute('data-offset-dy') ? parseFloat(el.getAttribute('data-offset-dy')) : 0
        });
      }
      const edgeStyles = [];
      const edgeLines = g.querySelectorAll('.shape-edge');
      edgeLines.forEach(line => {
        edgeStyles.push({
          stroke: line.getAttribute('data-stroke') || line.getAttribute('stroke') || '#000',
          strokeWidth: line.getAttribute('data-stroke-width') || line.getAttribute('stroke-width') || '2',
          strokeDasharray: line.getAttribute('data-stroke-dasharray') || undefined,
          strokeLinecap: line.getAttribute('data-stroke-linecap') || undefined
        });
      });
      const altitudes = [];
      g.querySelectorAll('.altitude-line').forEach(altLine => {
        const aid = altLine.getAttribute('data-altitude-id');
        if (aid) maxAltitudeId = Math.max(maxAltitudeId, parseInt(aid, 10));
        const labelEl = g.querySelector('.altitude-label[data-altitude-id="' + aid + '"]');
        altitudes.push({
          vertexIndex: parseInt(altLine.getAttribute('data-vertex-index'), 10),
          edgeIndex: parseInt(altLine.getAttribute('data-edge-index'), 10),
          t: parseFloat(altLine.getAttribute('data-edge-t')),
          labelText: labelEl ? (labelEl.textContent || labelEl.getAttribute('data-label') || '') : '',
          offsetDx: labelEl && labelEl.hasAttribute('data-offset-dx') ? parseFloat(labelEl.getAttribute('data-offset-dx')) : 0,
          offsetDy: labelEl && labelEl.hasAttribute('data-offset-dy') ? parseFloat(labelEl.getAttribute('data-offset-dy')) : 0
        });
      });
      const rightAngleMarks = [];
      g.querySelectorAll('.right-angle-mark').forEach(mark => {
        const vi = parseInt(mark.getAttribute('data-vertex-index'), 10);
        if (!isNaN(vi)) rightAngleMarks.push(vi);
      });
      shapesState.push({
        shapeType,
        vertices,
        vertexLabels,
        vertexStyles,
        edgeLabels,
        edgeStyles,
        altitudes,
        rightAngleMarks
      });
    });
    return { shapes: shapesState, nextAltitudeId: maxAltitudeId + 1 };
  }

  function createShapeFromState(s, nextShapeId, startAltitudeId) {
    const shapeType = s.shapeType;
    const vertices = s.vertices;
    const n = vertices.length;
    const id = 'shape-' + nextShapeId;
    const g = document.createElementNS(SVG_NS, 'g');
    g.id = id;
    g.classList.add('shape-group');
    g.dataset.shapeId = id;
    g.dataset.shapeType = shapeType;
    const isCircle = shapeType === 'circle';

    if (isCircle && n >= 2) {
      const cx = vertices[0][0];
      const cy = vertices[0][1];
      const r = Math.hypot(vertices[1][0] - cx, vertices[1][1] - cy) || 1;
      const circleEl = document.createElementNS(SVG_NS, 'circle');
      circleEl.classList.add('shape-body');
      circleEl.setAttribute('cx', cx);
      circleEl.setAttribute('cy', cy);
      circleEl.setAttribute('r', r);
      circleEl.setAttribute('fill', '#fff');
      circleEl.setAttribute('stroke', '#000');
      circleEl.setAttribute('stroke-width', '2');
      g.appendChild(circleEl);
    } else {
      const pts = vertices.map(p => p.join(',')).join(' ');
      const polygon = document.createElementNS(SVG_NS, 'polygon');
      polygon.classList.add('shape-body');
      polygon.setAttribute('points', pts);
      polygon.setAttribute('stroke', 'none');
      g.appendChild(polygon);
    }

    const edgesGroup = document.createElementNS(SVG_NS, 'g');
    edgesGroup.setAttribute('class', 'shape-edges');
    if (!isCircle) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('class', 'shape-edge');
        line.setAttribute('data-edge-index', i);
        line.setAttribute('x1', vertices[i][0]);
        line.setAttribute('y1', vertices[i][1]);
        line.setAttribute('x2', vertices[j][0]);
        line.setAttribute('y2', vertices[j][1]);
        const es = (s.edgeStyles && s.edgeStyles[i]) || {};
        line.setAttribute('stroke', es.stroke || '#000');
        line.setAttribute('stroke-width', String(es.strokeWidth || '2'));
        if (es.strokeDasharray) {
          line.setAttribute('data-stroke-dasharray', es.strokeDasharray);
          line.setAttribute('stroke-dasharray', es.strokeDasharray);
        }
        if (es.strokeLinecap) {
          line.setAttribute('data-stroke-linecap', es.strokeLinecap);
          line.setAttribute('stroke-linecap', es.strokeLinecap);
        }
        edgesGroup.appendChild(line);
      }
    }
    g.appendChild(edgesGroup);
    vertices.forEach((p, i) => {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.classList.add('vertex');
      const vs = (s.vertexStyles && s.vertexStyles[i]) || {};
      circle.setAttribute('r', String(vs.r || 3));
      circle.setAttribute('cx', p[0]);
      circle.setAttribute('cy', p[1]);
      circle.setAttribute('data-index', i);
      if (vs.fill) { circle.style.fill = vs.fill; circle.setAttribute('data-color', vs.fill); }
      circle.setAttribute('pointer-events', 'all');
      g.appendChild(circle);
    });
    const labelsGroup = document.createElementNS(SVG_NS, 'g');
    labelsGroup.setAttribute('class', 'vertex-labels');
    const vLabels = s.vertexLabels || [];
    vertices.forEach((p, i) => {
      const vl = vLabels[i] || {};
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('class', 'vertex-label');
      text.setAttribute('data-vertex-index', i);
      text.setAttribute('x', p[0] + (vl.offsetDx != null ? vl.offsetDx : LABEL_OFFSET_X));
      text.setAttribute('y', p[1] + (vl.offsetDy != null ? vl.offsetDy : LABEL_OFFSET_Y));
      text.setAttribute('text-anchor', 'start');
      text.setAttribute('dominant-baseline', 'auto');
      text.setAttribute('pointer-events', 'all');
      if (vl.text) { text.textContent = vl.text; text.setAttribute('data-label', vl.text); }
      text.setAttribute('data-offset-dx', String(vl.offsetDx != null ? vl.offsetDx : LABEL_OFFSET_X));
      text.setAttribute('data-offset-dy', String(vl.offsetDy != null ? vl.offsetDy : LABEL_OFFSET_Y));
      labelsGroup.appendChild(text);
    });
    g.appendChild(labelsGroup);
    const edgeLabelsGroup = document.createElementNS(SVG_NS, 'g');
    edgeLabelsGroup.setAttribute('class', 'edge-labels');
    if (!isCircle) {
      const eLabels = s.edgeLabels || [];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const mx = (vertices[i][0] + vertices[j][0]) / 2;
        const my = (vertices[i][1] + vertices[j][1]) / 2;
        const el = eLabels[i] || {};
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('class', 'edge-label');
        text.setAttribute('data-edge-index', i);
        text.setAttribute('x', mx + (el.offsetDx || 0));
        text.setAttribute('y', my + (el.offsetDy || 0));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        if (el.text) { text.textContent = el.text; text.setAttribute('data-label', el.text); }
        text.setAttribute('data-offset-dx', String(el.offsetDx != null ? el.offsetDx : 0));
        text.setAttribute('data-offset-dy', String(el.offsetDy != null ? el.offsetDy : 0));
        edgeLabelsGroup.appendChild(text);
      }
    }
    g.appendChild(edgeLabelsGroup);
    const altitudeLabelsGroup = document.createElementNS(SVG_NS, 'g');
    altitudeLabelsGroup.setAttribute('class', 'altitude-labels');
    g.appendChild(altitudeLabelsGroup);
    if (!isCircle) {
    (s.altitudes || []).forEach((alt, idx) => {
      const aid = String(startAltitudeId + idx);
      const vx = vertices[alt.vertexIndex][0];
      const vy = vertices[alt.vertexIndex][1];
      const ei = alt.edgeIndex;
      const ej = (ei + 1) % n;
      const ex1 = vertices[ei][0];
      const ey1 = vertices[ei][1];
      const ex2 = vertices[ej][0];
      const ey2 = vertices[ej][1];
      const perp = perpendicularPointToLine(vx, vy, ex1, ey1, ex2, ey2);
      if (perp) {
        const altLine = document.createElementNS(SVG_NS, 'line');
        altLine.setAttribute('x1', vx);
        altLine.setAttribute('y1', vy);
        altLine.setAttribute('x2', perp.x);
        altLine.setAttribute('y2', perp.y);
        altLine.setAttribute('stroke', '#666');
        altLine.setAttribute('stroke-width', '2');
        altLine.setAttribute('stroke-dasharray', '8,4');
        altLine.setAttribute('class', 'altitude-line');
        altLine.setAttribute('data-altitude-id', aid);
        altLine.setAttribute('data-vertex-index', String(alt.vertexIndex));
        altLine.setAttribute('data-edge-index', String(alt.edgeIndex));
        altLine.setAttribute('data-edge-t', String(alt.t));
        g.insertBefore(altLine, altitudeLabelsGroup);
        const mx = (vx + perp.x) / 2;
        const my = (vy + perp.y) / 2;
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('class', 'altitude-label');
        label.setAttribute('data-altitude-id', aid);
        label.setAttribute('data-offset-dx', String(alt.offsetDx != null ? alt.offsetDx : 0));
        label.setAttribute('data-offset-dy', String(alt.offsetDy != null ? alt.offsetDy : 0));
        label.setAttribute('x', mx + (alt.offsetDx || 0));
        label.setAttribute('y', my + (alt.offsetDy || 0));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');
        if (alt.labelText) { label.textContent = alt.labelText; label.setAttribute('data-label', alt.labelText); }
        altitudeLabelsGroup.appendChild(label);
      }
    });
    }
    (s.rightAngleMarks || []).forEach(vi => addRightAngleMark(g, vi));
    enableVertexDrag(g);
    enableVertexLabels(g);
    enableLabelDrag(g);
    enableEdgeLabels(g);
    enableAltitudeLabelDrag(g);
    enableShapeDragToTrash(g);
    g.addEventListener('dblclick', function (ev) {
      if (!ev.target.classList.contains('altitude-line')) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (contextMenuTimeout) {
        clearTimeout(contextMenuTimeout);
        contextMenuTimeout = null;
      }
      openAltitudeLabelEditor(g, ev.target);
    });
    workspace.appendChild(g);
    return g;
  }

  function restoreWorkspace(state) {
    if (!state || !state.shapes) return;
    const groups = workspace.querySelectorAll('.shape-group');
    groups.forEach(gr => gr.remove());
    let nextShapeId = 1;
    let nextAltitudeId = 1;
    state.shapes.forEach(shapeState => {
      createShapeFromState(shapeState, nextShapeId++, nextAltitudeId);
      const altCount = (shapeState.altitudes && shapeState.altitudes.length) || 0;
      nextAltitudeId += altCount;
    });
    shapeIdCounter = Math.max(shapeIdCounter, nextShapeId - 1);
    altitudeIdCounter = Math.max(altitudeIdCounter, nextAltitudeId - 1);
  }

  function pushUndo() {
    const state = serializeWorkspace();
    undoStack.push(state);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(serializeWorkspace());
    restoreWorkspace(undoStack.pop());
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(serializeWorkspace());
    restoreWorkspace(redoStack.pop());
  }

  function hideContextMenu() {
    contextMenuEl.style.display = 'none';
    contextMenuEl.innerHTML = '';
    document.removeEventListener('click', closeContextMenuOnClickOutside);
    document.removeEventListener('keydown', closeContextMenuOnEscape);
  }

  function closeContextMenuOnClickOutside(ev) {
    if (contextMenuEl.contains(ev.target)) return;
    hideContextMenu();
  }

  function closeContextMenuOnEscape(ev) {
    if (ev.key === 'Escape') hideContextMenu();
  }

  function showContextMenuAt(x, y, contentFn) {
    if (contextMenuTimeout) clearTimeout(contextMenuTimeout);
    contextMenuTimeout = null;
    contextMenuEl.innerHTML = '';
    contentFn(contextMenuEl);
    contextMenuEl.style.display = 'block';
    contextMenuEl.style.left = x + 'px';
    contextMenuEl.style.top = y + 'px';
    const rect = contextMenuEl.getBoundingClientRect();
    if (rect.right > window.innerWidth) contextMenuEl.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) contextMenuEl.style.top = (y - rect.height) + 'px';
    setTimeout(function () {
      document.addEventListener('click', closeContextMenuOnClickOutside);
      document.addEventListener('keydown', closeContextMenuOnEscape);
    }, 0);
  }

  function showVertexContextMenu(circle, clientX, clientY) {
    const r = parseInt(circle.getAttribute('r') || '3', 10);
    const fill = circle.getAttribute('data-color') || circle.getAttribute('fill') || window.getComputedStyle(circle).fill || '#000000';
    const stroke = circle.getAttribute('stroke') || window.getComputedStyle(circle).stroke || '#ffffff';
    showContextMenuAt(clientX, clientY, function (menu) {
      const title = document.createElement('div');
      title.className = 'context-menu-title';
      title.textContent = 'Vertex';
      menu.appendChild(title);
      const rowSize = document.createElement('div');
      rowSize.className = 'context-menu-row';
      rowSize.innerHTML = '<label>Point size</label>';
      const minR = 1, maxR = 12;
      let currentR = Math.max(minR, Math.min(maxR, r));
      const sizeDisplay = document.createElement('span');
      sizeDisplay.className = 'context-menu-size-value';
      sizeDisplay.textContent = currentR;
      const btnMinus = document.createElement('button');
      btnMinus.type = 'button';
      btnMinus.className = 'context-menu-size-btn';
      btnMinus.textContent = '−';
      const btnPlus = document.createElement('button');
      btnPlus.type = 'button';
      btnPlus.className = 'context-menu-size-btn';
      btnPlus.textContent = '+';
      function applyVertexSize(val) {
        currentR = val;
        sizeDisplay.textContent = currentR;
        circle.setAttribute('r', currentR);
        circle.setAttribute('data-size', String(currentR));
        btnMinus.disabled = currentR <= minR;
        btnPlus.disabled = currentR >= maxR;
      }
      btnMinus.addEventListener('click', function () {
        if (currentR > minR) applyVertexSize(currentR - 1);
      });
      btnPlus.addEventListener('click', function () {
        if (currentR < maxR) applyVertexSize(currentR + 1);
      });
      applyVertexSize(currentR);
      rowSize.appendChild(btnMinus);
      rowSize.appendChild(sizeDisplay);
      rowSize.appendChild(btnPlus);
      menu.appendChild(rowSize);
      const rowColor = document.createElement('div');
      rowColor.className = 'context-menu-row';
      rowColor.innerHTML = '<label>Color</label>';
      const colorWrap = document.createElement('div');
      colorWrap.className = 'context-menu-colors';
      PRESET_COLORS.forEach(function (hex) {
        const swatch = document.createElement('span');
        swatch.className = 'context-menu-color-swatch';
        swatch.style.backgroundColor = hex;
        swatch.addEventListener('click', function () {
          circle.style.fill = hex;
          circle.style.stroke = hex === '#000' ? '#fff' : '#333';
          circle.setAttribute('data-color', hex);
        });
        colorWrap.appendChild(swatch);
      });
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = (fill.startsWith('#') ? fill : '#000000').slice(0, 7);
      colorInput.style.width = '28px';
      colorInput.style.height = '24px';
      colorInput.style.border = 'none';
      colorInput.style.cursor = 'pointer';
      colorInput.addEventListener('input', function () {
        const hex = colorInput.value;
        circle.style.fill = hex;
        circle.style.stroke = hex === '#000000' ? '#fff' : '#333';
        circle.setAttribute('data-color', hex);
      });
      colorWrap.appendChild(colorInput);
      rowColor.appendChild(colorWrap);
      menu.appendChild(rowColor);
      const rowGray = document.createElement('div');
      rowGray.className = 'context-menu-row';
      rowGray.innerHTML = '<label>Grayscale</label>';
      const grayWrap = document.createElement('div');
      grayWrap.className = 'context-menu-colors';
      GRAYSCALE_COLORS.forEach(function (hex) {
        const swatch = document.createElement('span');
        swatch.className = 'context-menu-color-swatch';
        swatch.style.backgroundColor = hex;
        swatch.addEventListener('click', function () {
          circle.style.fill = hex;
          circle.style.stroke = hex === '#333333' ? '#fff' : '#333';
          circle.setAttribute('data-color', hex);
        });
        grayWrap.appendChild(swatch);
      });
      rowGray.appendChild(grayWrap);
      menu.appendChild(rowGray);
      const rowAltitude = document.createElement('div');
      rowAltitude.className = 'context-menu-row';
      rowAltitude.innerHTML = '<label>Tools</label>';
      const btnAltitude = document.createElement('button');
      btnAltitude.type = 'button';
      btnAltitude.className = 'context-menu-style-btn';
      btnAltitude.textContent = 'Draw an altitude';
      btnAltitude.addEventListener('click', function () {
        hideContextMenu();
        startAltitudeDrawing(circle);
      });
      rowAltitude.appendChild(btnAltitude);
      const shapeGroup = circle.closest('.shape-group');
      const vertexIndex = parseInt(circle.getAttribute('data-index'), 10);
      if (shapeGroup && !isNaN(vertexIndex) && isNearRightAngle(shapeGroup, vertexIndex)) {
        const existingMark = shapeGroup.querySelector('.right-angle-mark[data-vertex-index="' + vertexIndex + '"]');
        const btnRightAngle = document.createElement('button');
        btnRightAngle.type = 'button';
        btnRightAngle.className = 'context-menu-style-btn';
        btnRightAngle.textContent = existingMark ? 'Remove right angle mark' : 'Right angle mark';
        btnRightAngle.addEventListener('click', function () {
          hideContextMenu();
          if (existingMark) {
            existingMark.remove();
            pushUndo();
          } else {
            addRightAngleMark(shapeGroup, vertexIndex);
            pushUndo();
          }
        });
        rowAltitude.appendChild(btnRightAngle);
      }
      menu.appendChild(rowAltitude);
    });
  }

  function perpendicularPointToLine(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = px - x1;
    const wy = py - y1;
    const c1 = wx * vx + wy * vy;
    const c2 = vx * vx + vy * vy;
    if (c2 < 1e-10) return null;
    const t = c1 / c2;
    return {
      x: x1 + t * vx,
      y: y1 + t * vy,
      t: t
    };
  }

  function isPerpendicular(vx, vy, ex1, ey1, ex2, ey2) {
    const edgeVecX = ex2 - ex1;
    const edgeVecY = ey2 - ey1;
    const dot = vx * edgeVecX + vy * edgeVecY;
    const edgeLen = Math.hypot(edgeVecX, edgeVecY);
    const vertexLen = Math.hypot(vx, vy);
    if (edgeLen < 1e-10 || vertexLen < 1e-10) return false;
    const cosAngle = Math.abs(dot / (edgeLen * vertexLen));
    return cosAngle < 0.1;
  }

  function startAltitudeDrawing(circle) {
    const shapeGroup = circle.closest('.shape-group');
    if (!shapeGroup) return;
    const vertexIndex = parseInt(circle.getAttribute('data-index'), 10);
    const vx = parseFloat(circle.getAttribute('cx'));
    const vy = parseFloat(circle.getAttribute('cy'));
    const tempLine = document.createElementNS(SVG_NS, 'line');
    tempLine.setAttribute('x1', vx);
    tempLine.setAttribute('y1', vy);
    tempLine.setAttribute('x2', vx);
    tempLine.setAttribute('y2', vy);
    tempLine.setAttribute('stroke', '#666');
    tempLine.setAttribute('stroke-width', '2');
    tempLine.setAttribute('stroke-dasharray', '8,4');
    tempLine.setAttribute('class', 'altitude-temp');
    workspace.appendChild(tempLine);
    altitudeDrawingMode = {
      shapeGroup: shapeGroup,
      vertexIndex: vertexIndex,
      vertexX: vx,
      vertexY: vy,
      tempLine: tempLine,
      snappedEdge: null,
      snappedPoint: null
    };
    function updateAltitude(ev) {
      if (!altitudeDrawingMode) return;
      const [mx, my] = getWorkspacePoint(ev);
      const points = getVertexCoords(shapeGroup);
      const n = points.length;
      let bestSnap = null;
      let bestDist = Infinity;
      const SNAP_THRESHOLD = 20;
      const PERP_THRESHOLD = 0.1;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (i === vertexIndex || j === vertexIndex) continue;
        const perp = perpendicularPointToLine(vx, vy, points[i][0], points[i][1], points[j][0], points[j][1]);
        if (!perp || perp.t < -0.1 || perp.t > 1.1) continue;
        const distToPerp = Math.hypot(mx - perp.x, my - perp.y);
        const vecX = perp.x - vx;
        const vecY = perp.y - vy;
        if (isPerpendicular(vecX, vecY, points[i][0], points[i][1], points[j][0], points[j][1]) && distToPerp < SNAP_THRESHOLD && distToPerp < bestDist) {
          bestDist = distToPerp;
          bestSnap = { edgeIndex: i, x: perp.x, y: perp.y, t: perp.t };
        }
      }
      if (bestSnap) {
        tempLine.setAttribute('x2', bestSnap.x);
        tempLine.setAttribute('y2', bestSnap.y);
        altitudeDrawingMode.snappedEdge = bestSnap.edgeIndex;
        altitudeDrawingMode.snappedPoint = { x: bestSnap.x, y: bestSnap.y, t: bestSnap.t };
      } else {
        tempLine.setAttribute('x2', mx);
        tempLine.setAttribute('y2', my);
        altitudeDrawingMode.snappedEdge = null;
        altitudeDrawingMode.snappedPoint = null;
      }
    }
    function finishAltitude(ev) {
      if (!altitudeDrawingMode) return;
      if (ev.target.closest('#context-menu') || ev.target.closest('.vertex-label-editor')) return;
      const t = ev.target;
      const isVertexOrEdge = t.classList.contains('vertex') || t.classList.contains('shape-edge');
      if (isVertexOrEdge) {
        tempLine.remove();
        altitudeDrawingMode = null;
        document.removeEventListener('mousemove', updateAltitude);
        document.removeEventListener('click', finishAltitude, true);
        document.removeEventListener('keydown', cancelAltitude);
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      if (altitudeDrawingMode.snappedPoint) {
        pushUndo();
        const aid = String(++altitudeIdCounter);
        const x1 = altitudeDrawingMode.vertexX;
        const y1 = altitudeDrawingMode.vertexY;
        const x2 = altitudeDrawingMode.snappedPoint.x;
        const y2 = altitudeDrawingMode.snappedPoint.y;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const altLine = document.createElementNS(SVG_NS, 'line');
        altLine.setAttribute('x1', x1);
        altLine.setAttribute('y1', y1);
        altLine.setAttribute('x2', x2);
        altLine.setAttribute('y2', y2);
        altLine.setAttribute('stroke', '#666');
        altLine.setAttribute('stroke-width', '2');
        altLine.setAttribute('stroke-dasharray', '8,4');
        altLine.setAttribute('class', 'altitude-line');
        altLine.setAttribute('data-altitude-id', aid);
        altLine.setAttribute('data-vertex-index', String(altitudeDrawingMode.vertexIndex));
        altLine.setAttribute('data-edge-index', String(altitudeDrawingMode.snappedEdge));
        altLine.setAttribute('data-edge-t', String(altitudeDrawingMode.snappedPoint.t));
        const altLabelsGroup = shapeGroup.querySelector('.altitude-labels');
        shapeGroup.insertBefore(altLine, altLabelsGroup);
        if (altLabelsGroup) {
          const shapePoints = getVertexCoords(shapeGroup);
          const offset = getAltitudeLabelOffset(mx, my, x1, y1, x2, y2, shapePoints);
          const label = document.createElementNS(SVG_NS, 'text');
          label.setAttribute('class', 'altitude-label');
          label.setAttribute('data-altitude-id', aid);
          label.setAttribute('data-offset-dx', String(offset.dx));
          label.setAttribute('data-offset-dy', String(offset.dy));
          label.setAttribute('x', mx + offset.dx);
          label.setAttribute('y', my + offset.dy);
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('dominant-baseline', 'middle');
          altLabelsGroup.appendChild(label);
        }
      }
      tempLine.remove();
      altitudeDrawingMode = null;
      document.removeEventListener('mousemove', updateAltitude);
      document.removeEventListener('click', finishAltitude, true);
      document.removeEventListener('keydown', cancelAltitude);
    }
    function cancelAltitude(ev) {
      if (!altitudeDrawingMode) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        tempLine.remove();
        altitudeDrawingMode = null;
        document.removeEventListener('mousemove', updateAltitude);
        document.removeEventListener('click', finishAltitude);
        document.removeEventListener('keydown', cancelAltitude);
      }
    }
    document.addEventListener('mousemove', updateAltitude);
    document.addEventListener('click', finishAltitude, true);
    document.addEventListener('keydown', cancelAltitude);
  }

  function showEdgeContextMenu(shapeGroup, edgeIndex, clientX, clientY) {
    const line = shapeGroup.querySelector('.shape-edge[data-edge-index="' + edgeIndex + '"]');
    if (!line) return;
    const strokeWidth = line.getAttribute('data-stroke-width') || line.getAttribute('stroke-width') || '2';
    const stroke = line.getAttribute('data-stroke') || line.getAttribute('stroke') || window.getComputedStyle(line).stroke || '#000000';
    showContextMenuAt(clientX, clientY, function (menu) {
      const title = document.createElement('div');
      title.className = 'context-menu-title';
      title.textContent = 'Edge';
      menu.appendChild(title);
      const rowWidth = document.createElement('div');
      rowWidth.className = 'context-menu-row';
      rowWidth.innerHTML = '<label>Line width</label>';
      const minW = 1, maxW = 10;
      let currentW = Math.max(minW, Math.min(maxW, parseInt(strokeWidth, 10) || 2));
      const widthDisplay = document.createElement('span');
      widthDisplay.className = 'context-menu-size-value';
      widthDisplay.textContent = currentW;
      const btnMinus = document.createElement('button');
      btnMinus.type = 'button';
      btnMinus.className = 'context-menu-size-btn';
      btnMinus.textContent = '−';
      const btnPlus = document.createElement('button');
      btnPlus.type = 'button';
      btnPlus.className = 'context-menu-size-btn';
      btnPlus.textContent = '+';
      function applyEdgeWidth(val) {
        currentW = val;
        widthDisplay.textContent = currentW;
        line.style.strokeWidth = val;
        line.setAttribute('stroke-width', String(val));
        line.setAttribute('data-stroke-width', String(val));
        var da = (line.getAttribute('data-stroke-dasharray') || '').trim();
        if (da.indexOf('0,') === 0 || da.indexOf('0 ,') === 0) {
          var gap = Math.max(Math.round(val * 2.2), 4);
          var dottedVal = '0, ' + gap;
          line.style.strokeDasharray = dottedVal;
          line.setAttribute('stroke-dasharray', dottedVal);
          line.setAttribute('data-stroke-dasharray', dottedVal);
        }
        btnMinus.disabled = currentW <= minW;
        btnPlus.disabled = currentW >= maxW;
      }
      btnMinus.addEventListener('click', function () {
        if (currentW > minW) applyEdgeWidth(currentW - 1);
      });
      btnPlus.addEventListener('click', function () {
        if (currentW < maxW) applyEdgeWidth(currentW + 1);
      });
      applyEdgeWidth(currentW);
      rowWidth.appendChild(btnMinus);
      rowWidth.appendChild(widthDisplay);
      rowWidth.appendChild(btnPlus);
      menu.appendChild(rowWidth);
      const rowStyle = document.createElement('div');
      rowStyle.className = 'context-menu-row';
      rowStyle.innerHTML = '<label>Line style</label>';
      const dasharray = (line.getAttribute('data-stroke-dasharray') || line.getAttribute('stroke-dasharray') || '').trim();
      const linecap = (line.getAttribute('data-stroke-linecap') || line.getAttribute('stroke-linecap') || '').trim();
      const isDotted = (linecap === 'round' && (dasharray.indexOf('0,') === 0 || dasharray.indexOf('0 ,') === 0)) || dasharray === '2,2' || dasharray === '1,2' || dasharray === '1, 2';
      const isDashed = !isDotted && (dasharray === '8,4' || (dasharray.indexOf(',') !== -1 && dasharray !== ''));
      const isSolid = !dasharray || dasharray === 'none' || (!isDashed && !isDotted);
      function dottedGap(w) {
        return Math.max(Math.round(w * 2.2), 4);
      }
      function setLineStyle(value, dasharrayValue) {
        if (value === 'dotted') {
          var gap = dottedGap(currentW);
          var dottedVal = '0, ' + gap;
          line.style.strokeLinecap = 'round';
          line.style.strokeDasharray = dottedVal;
          line.setAttribute('stroke-linecap', 'round');
          line.setAttribute('stroke-dasharray', dottedVal);
          line.setAttribute('data-stroke-linecap', 'round');
          line.setAttribute('data-stroke-dasharray', dottedVal);
          btnDotted.classList.add('context-menu-style-active');
          btnSolid.classList.remove('context-menu-style-active');
          btnDashed.classList.remove('context-menu-style-active');
        } else {
          line.style.strokeLinecap = value === 'solid' ? 'butt' : 'butt';
          line.setAttribute('stroke-linecap', 'butt');
          line.setAttribute('data-stroke-linecap', 'butt');
          line.style.strokeDasharray = dasharrayValue;
          line.setAttribute('stroke-dasharray', dasharrayValue);
          line.setAttribute('data-stroke-dasharray', dasharrayValue);
          [btnSolid, btnDashed, btnDotted].forEach(function (b) { b.classList.remove('context-menu-style-active'); });
          if (dasharrayValue === '') btnSolid.classList.add('context-menu-style-active');
          else if (dasharrayValue === '8,4') btnDashed.classList.add('context-menu-style-active');
        }
      }
      const btnSolid = document.createElement('button');
      btnSolid.type = 'button';
      btnSolid.className = 'context-menu-style-btn' + (isSolid ? ' context-menu-style-active' : '');
      btnSolid.textContent = 'Solid';
      btnSolid.addEventListener('click', function () { setLineStyle('solid', ''); });
      const btnDashed = document.createElement('button');
      btnDashed.type = 'button';
      btnDashed.className = 'context-menu-style-btn' + (isDashed ? ' context-menu-style-active' : '');
      btnDashed.textContent = 'Dashed';
      btnDashed.addEventListener('click', function () { setLineStyle('dashed', '8,4'); });
      const btnDotted = document.createElement('button');
      btnDotted.type = 'button';
      btnDotted.className = 'context-menu-style-btn' + (isDotted ? ' context-menu-style-active' : '');
      btnDotted.textContent = 'Dotted';
      btnDotted.addEventListener('click', function () { setLineStyle('dotted'); });
      rowStyle.appendChild(btnSolid);
      rowStyle.appendChild(btnDashed);
      rowStyle.appendChild(btnDotted);
      menu.appendChild(rowStyle);
      const rowColor = document.createElement('div');
      rowColor.className = 'context-menu-row';
      rowColor.innerHTML = '<label>Color</label>';
      const colorWrap = document.createElement('div');
      colorWrap.className = 'context-menu-colors';
      PRESET_COLORS.forEach(function (hex) {
        const swatch = document.createElement('span');
        swatch.className = 'context-menu-color-swatch';
        swatch.style.backgroundColor = hex;
        swatch.addEventListener('click', function () {
          line.style.stroke = hex;
          line.setAttribute('data-stroke', hex);
        });
        colorWrap.appendChild(swatch);
      });
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = (stroke.startsWith('#') ? stroke : '#000000').slice(0, 7);
      colorInput.style.width = '28px';
      colorInput.style.height = '24px';
      colorInput.style.border = 'none';
      colorInput.style.cursor = 'pointer';
      colorInput.addEventListener('input', function () {
        line.style.stroke = colorInput.value;
        line.setAttribute('data-stroke', colorInput.value);
      });
      colorWrap.appendChild(colorInput);
      rowColor.appendChild(colorWrap);
      menu.appendChild(rowColor);
      const rowGray = document.createElement('div');
      rowGray.className = 'context-menu-row';
      rowGray.innerHTML = '<label>Grayscale</label>';
      const grayWrap = document.createElement('div');
      grayWrap.className = 'context-menu-colors';
      GRAYSCALE_COLORS.forEach(function (hex) {
        const swatch = document.createElement('span');
        swatch.className = 'context-menu-color-swatch';
        swatch.style.backgroundColor = hex;
        swatch.addEventListener('click', function () {
          line.style.stroke = hex;
          line.setAttribute('data-stroke', hex);
        });
        grayWrap.appendChild(swatch);
      });
      rowGray.appendChild(grayWrap);
      menu.appendChild(rowGray);
    });
  }

  function getWorkspacePoint(ev) {
    const rect = workspace.getBoundingClientRect();
    const scaleX = workspace.width.baseVal.value / rect.width;
    const scaleY = workspace.height.baseVal.value / rect.height;
    return [
      (ev.clientX - rect.left) * scaleX,
      (ev.clientY - rect.top) * scaleY
    ];
  }

  function ensureWorkspaceSize() {
    const rect = workspace.getBoundingClientRect();
    if (workspace.width.baseVal.value !== rect.width || workspace.height.baseVal.value !== rect.height) {
      workspace.setAttribute('width', rect.width);
      workspace.setAttribute('height', rect.height);
    }
  }

  function pointsToPolygon(points, cx, cy) {
    const minX = Math.min(...points.map(p => p[0]));
    const maxX = Math.max(...points.map(p => p[0]));
    const minY = Math.min(...points.map(p => p[1]));
    const maxY = Math.max(...points.map(p => p[1]));
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    return points.map(([x, y]) => [
      cx + (x - midX) * SCALE,
      cy + (y - midY) * SCALE
    ]);
  }

  function createShape(shapeType, x, y) {
    const points = shapes[shapeType];
    if (!points) return null;
    const coords = pointsToPolygon(points, x, y);
    const id = 'shape-' + ++shapeIdCounter;
    const g = document.createElementNS(SVG_NS, 'g');
    g.id = id;
    g.classList.add('shape-group');
    g.dataset.shapeId = id;
    g.dataset.shapeType = shapeType;

    const n = coords.length;
    const isCircle = shapeType === 'circle';

    if (isCircle) {
      const cx = coords[0][0];
      const cy = coords[0][1];
      const r = Math.hypot(coords[1][0] - cx, coords[1][1] - cy) || 1;
      const circleEl = document.createElementNS(SVG_NS, 'circle');
      circleEl.classList.add('shape-body');
      circleEl.setAttribute('cx', cx);
      circleEl.setAttribute('cy', cy);
      circleEl.setAttribute('r', r);
      circleEl.setAttribute('fill', '#fff');
      circleEl.setAttribute('stroke', '#000');
      circleEl.setAttribute('stroke-width', '2');
      g.appendChild(circleEl);
    } else {
      const polygon = document.createElementNS(SVG_NS, 'polygon');
      polygon.classList.add('shape-body');
      polygon.setAttribute('points', coords.map(p => p.join(',')).join(' '));
      polygon.setAttribute('stroke', 'none');
      g.appendChild(polygon);
    }

    const edgesGroup = document.createElementNS(SVG_NS, 'g');
    edgesGroup.setAttribute('class', 'shape-edges');
    if (!isCircle) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('class', 'shape-edge');
        line.setAttribute('data-edge-index', i);
        line.setAttribute('x1', coords[i][0]);
        line.setAttribute('y1', coords[i][1]);
        line.setAttribute('x2', coords[j][0]);
        line.setAttribute('y2', coords[j][1]);
        line.setAttribute('stroke', '#000');
        line.setAttribute('stroke-width', '2');
        edgesGroup.appendChild(line);
      }
    }
    g.appendChild(edgesGroup);

    coords.forEach((p, i) => {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.classList.add('vertex');
      circle.setAttribute('r', isCircle && i === 0 ? 2 : 3);
      circle.setAttribute('cx', p[0]);
      circle.setAttribute('cy', p[1]);
      circle.setAttribute('data-index', i);
      circle.setAttribute('pointer-events', 'all');
      g.appendChild(circle);
    });

    const labelsGroup = document.createElementNS(SVG_NS, 'g');
    labelsGroup.setAttribute('class', 'vertex-labels');
    coords.forEach((p, i) => {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('class', 'vertex-label');
      text.setAttribute('data-vertex-index', i);
      text.setAttribute('x', p[0] + 8);
      text.setAttribute('y', p[1] - 8);
      text.setAttribute('text-anchor', 'start');
      text.setAttribute('dominant-baseline', 'auto');
      text.setAttribute('pointer-events', 'all');
      labelsGroup.appendChild(text);
    });
    g.appendChild(labelsGroup);

    const edgeLabelsGroup = document.createElementNS(SVG_NS, 'g');
    edgeLabelsGroup.setAttribute('class', 'edge-labels');
    if (!isCircle) {
      const cx = coords.reduce((s, p) => s + p[0], 0) / n;
      const cy = coords.reduce((s, p) => s + p[1], 0) / n;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const mx = (coords[i][0] + coords[j][0]) / 2;
        const my = (coords[i][1] + coords[j][1]) / 2;
        const outX = mx - cx;
        const outY = my - cy;
        const len = Math.hypot(outX, outY) || 1;
        const dx = (outX / len) * EDGE_LABEL_OFFSET_DISTANCE;
        const dy = (outY / len) * EDGE_LABEL_OFFSET_DISTANCE;
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('class', 'edge-label');
        text.setAttribute('data-edge-index', i);
        text.setAttribute('data-offset-dx', String(dx));
        text.setAttribute('data-offset-dy', String(dy));
        text.setAttribute('x', mx + dx);
        text.setAttribute('y', my + dy);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        edgeLabelsGroup.appendChild(text);
      }
    }
    g.appendChild(edgeLabelsGroup);

    const altitudeLabelsGroup = document.createElementNS(SVG_NS, 'g');
    altitudeLabelsGroup.setAttribute('class', 'altitude-labels');
    g.appendChild(altitudeLabelsGroup);

    const rightAngleMarksGroup = document.createElementNS(SVG_NS, 'g');
    rightAngleMarksGroup.setAttribute('class', 'right-angle-marks');
    g.appendChild(rightAngleMarksGroup);

    if (shapeType === 'right-triangle') {
      addRightAngleMark(g, 0);
    }

    enableVertexDrag(g);
    enableVertexLabels(g);
    enableLabelDrag(g);
    enableEdgeLabels(g);
    enableEdgeLabelDrag(g);
    enableAltitudeLabelDrag(g);
    enableShapeDragToTrash(g);
    g.addEventListener('dblclick', function (ev) {
      if (!ev.target.classList.contains('altitude-line')) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (contextMenuTimeout) {
        clearTimeout(contextMenuTimeout);
        contextMenuTimeout = null;
      }
      openAltitudeLabelEditor(g, ev.target);
    });
    workspace.appendChild(g);
    return g;
  }

  const LABEL_OFFSET_X = 8;
  const LABEL_OFFSET_Y = -8;

  function updatePolygonFromVertices(g) {
    const shapeBody = g.querySelector('.shape-body');
    const circles = g.querySelectorAll('.vertex');
    const points = Array.from(circles).map(c => [
      parseFloat(c.getAttribute('cx')),
      parseFloat(c.getAttribute('cy'))
    ]);
    const n = points.length;

    if (g.dataset.shapeType === 'circle' && n >= 2) {
      const cx = points[0][0];
      const cy = points[0][1];
      const r = Math.hypot(points[1][0] - cx, points[1][1] - cy) || 1;
      shapeBody.setAttribute('cx', cx);
      shapeBody.setAttribute('cy', cy);
      shapeBody.setAttribute('r', r);
      updateLabelPositions(g);
      return;
    }

    const polygon = shapeBody;
    polygon.setAttribute('points', points.map(p => p.join(',')).join(' '));
    const edges = g.querySelectorAll('.shape-edge');
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const line = edges[i];
      if (line) {
        line.setAttribute('x1', points[i][0]);
        line.setAttribute('y1', points[i][1]);
        line.setAttribute('x2', points[j][0]);
        line.setAttribute('y2', points[j][1]);
      }
    }
    updateLabelPositions(g);
    updateEdgeLabelPositions(g);
    updateAltitudeLines(g);
    updateRightAngleMarks(g);
  }

  function updateAltitudeLines(g) {
    const circles = g.querySelectorAll('.vertex');
    const points = Array.from(circles).map(c => [
      parseFloat(c.getAttribute('cx')),
      parseFloat(c.getAttribute('cy'))
    ]);
    const n = points.length;
    const altitudeLines = g.querySelectorAll('.altitude-line');
    altitudeLines.forEach(function (altLine) {
      const vertexIndex = parseInt(altLine.getAttribute('data-vertex-index'), 10);
      const edgeIndex = parseInt(altLine.getAttribute('data-edge-index'), 10);
      const t = parseFloat(altLine.getAttribute('data-edge-t'));
      if (isNaN(vertexIndex) || isNaN(edgeIndex) || isNaN(t) || vertexIndex < 0 || vertexIndex >= n || edgeIndex < 0 || edgeIndex >= n) return;
      const vx = points[vertexIndex][0];
      const vy = points[vertexIndex][1];
      const i = edgeIndex;
      const j = (edgeIndex + 1) % n;
      const ex1 = points[i][0];
      const ey1 = points[i][1];
      const ex2 = points[j][0];
      const ey2 = points[j][1];
      const perp = perpendicularPointToLine(vx, vy, ex1, ey1, ex2, ey2);
      if (perp) {
        altLine.setAttribute('x1', vx);
        altLine.setAttribute('y1', vy);
        altLine.setAttribute('x2', perp.x);
        altLine.setAttribute('y2', perp.y);
        const aid = altLine.getAttribute('data-altitude-id');
        if (aid) {
          const mx = (vx + perp.x) / 2;
          const my = (vy + perp.y) / 2;
          const labelEl = g.querySelector('.altitude-label[data-altitude-id="' + aid + '"]');
          if (labelEl) {
            const dx = labelEl.hasAttribute('data-offset-dx') ? parseFloat(labelEl.getAttribute('data-offset-dx')) : 0;
            const dy = labelEl.hasAttribute('data-offset-dy') ? parseFloat(labelEl.getAttribute('data-offset-dy')) : 0;
            labelEl.setAttribute('x', mx + dx);
            labelEl.setAttribute('y', my + dy);
          }
        }
      }
    });
  }

  const EDGE_LABEL_OFFSET_X = 0;
  const EDGE_LABEL_OFFSET_Y = 0;
  const EDGE_LABEL_OFFSET_DISTANCE = 14;

  function updateEdgeLabelPositions(g) {
    const circles = g.querySelectorAll('.vertex');
    const n = circles.length;
    for (let i = 0; i < n; i++) {
      const c0 = circles[i];
      const c1 = circles[(i + 1) % n];
      const mx = (parseFloat(c0.getAttribute('cx')) + parseFloat(c1.getAttribute('cx'))) / 2;
      const my = (parseFloat(c0.getAttribute('cy')) + parseFloat(c1.getAttribute('cy'))) / 2;
      const text = g.querySelector('.edge-label[data-edge-index="' + i + '"]');
      if (text) {
        const dx = text.hasAttribute('data-offset-dx') ? parseFloat(text.getAttribute('data-offset-dx')) : EDGE_LABEL_OFFSET_X;
        const dy = text.hasAttribute('data-offset-dy') ? parseFloat(text.getAttribute('data-offset-dy')) : EDGE_LABEL_OFFSET_Y;
        text.setAttribute('x', mx + dx);
        text.setAttribute('y', my + dy);
      }
    }
  }

  function updateLabelPositions(g) {
    const circles = g.querySelectorAll('.vertex');
    circles.forEach((c, i) => {
      const text = g.querySelector('.vertex-label[data-vertex-index="' + i + '"]');
      if (text) {
        const cx = parseFloat(c.getAttribute('cx'));
        const cy = parseFloat(c.getAttribute('cy'));
        const dx = text.hasAttribute('data-offset-dx') ? parseFloat(text.getAttribute('data-offset-dx')) : LABEL_OFFSET_X;
        const dy = text.hasAttribute('data-offset-dy') ? parseFloat(text.getAttribute('data-offset-dy')) : LABEL_OFFSET_Y;
        text.setAttribute('x', cx + dx);
        text.setAttribute('y', cy + dy);
      }
    });
  }

  function getVertexCoords(g) {
    const circles = g.querySelectorAll('.vertex');
    return Array.from(circles).map(c => [
      parseFloat(c.getAttribute('cx')),
      parseFloat(c.getAttribute('cy'))
    ]);
  }

  const RIGHT_ANGLE_COS_THRESHOLD = 0.08;
  const RIGHT_ANGLE_MARK_SIZE = 24;

  function isNearRightAngle(g, vertexIndex) {
    const points = getVertexCoords(g);
    const n = points.length;
    if (n < 3 || vertexIndex < 0 || vertexIndex >= n) return false;
    const prev = (vertexIndex - 1 + n) % n;
    const next = (vertexIndex + 1) % n;
    const v = points[vertexIndex];
    const p = points[prev];
    const q = points[next];
    const ux = p[0] - v[0];
    const uy = p[1] - v[1];
    const wx = q[0] - v[0];
    const wy = q[1] - v[1];
    const lu = Math.hypot(ux, uy) || 1e-6;
    const lw = Math.hypot(wx, wy) || 1e-6;
    const cosAngle = (ux * wx + uy * wy) / (lu * lw);
    return Math.abs(cosAngle) < RIGHT_ANGLE_COS_THRESHOLD;
  }

  function polygonSignedArea(points) {
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i][0] * points[j][1] - points[j][0] * points[i][1];
    }
    return area * 0.5;
  }

  function addRightAngleMark(g, vertexIndex) {
    if (g.querySelector('.right-angle-mark[data-vertex-index="' + vertexIndex + '"]')) return;
    const points = getVertexCoords(g);
    const n = points.length;
    if (n < 3 || vertexIndex < 0 || vertexIndex >= n) return;
    const prev = (vertexIndex - 1 + n) % n;
    const next = (vertexIndex + 1) % n;
    const v = points[vertexIndex];
    const p = points[prev];
    const q = points[next];
    const s = RIGHT_ANGLE_MARK_SIZE;
    let ux = (p[0] - v[0]) / (Math.hypot(p[0] - v[0], p[1] - v[1]) || 1e-6);
    let uy = (p[1] - v[1]) / (Math.hypot(p[0] - v[0], p[1] - v[1]) || 1e-6);
    let wx = (q[0] - v[0]) / (Math.hypot(q[0] - v[0], q[1] - v[1]) || 1e-6);
    let wy = (q[1] - v[1]) / (Math.hypot(q[0] - v[0], q[1] - v[1]) || 1e-6);
    // Offset segments: horizontal (parallel to u) moved by w toward center, vertical (parallel to w) moved by u toward center.
    const xA = v[0] + wx * s;
    const yA = v[1] + wy * s;
    const xB = v[0] + wx * s + ux * s;
    const yB = v[1] + wy * s + uy * s;
    const xC = v[0] + ux * s;
    const yC = v[1] + uy * s;
    const xD = v[0] + ux * s + wx * s;
    const yD = v[1] + uy * s + wy * s;
    const mark = document.createElementNS(SVG_NS, 'g');
    mark.setAttribute('class', 'right-angle-mark');
    mark.setAttribute('data-vertex-index', String(vertexIndex));
    const edgeLine = g.querySelector('.shape-edge');
    const edgeStrokeWidth = edgeLine ? (edgeLine.getAttribute('data-stroke-width') || edgeLine.getAttribute('stroke-width') || '2') : '2';
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'right-angle-mark-line');
    path.setAttribute('d', 'M' + xA + ',' + yA + 'L' + xB + ',' + yB + 'M' + xC + ',' + yC + 'L' + xD + ',' + yD);
    path.setAttributeNS(SVG_NS, 'stroke', '#000000');
    path.setAttributeNS(SVG_NS, 'stroke-width', edgeStrokeWidth);
    path.setAttributeNS(SVG_NS, 'fill', 'none');
    path.style.setProperty('stroke', '#000000');
    path.style.setProperty('stroke-width', edgeStrokeWidth + 'px');
    path.style.setProperty('fill', 'none');
    mark.appendChild(path);
    let marksGroup = g.querySelector('.right-angle-marks');
    if (!marksGroup) {
      marksGroup = document.createElementNS(SVG_NS, 'g');
      marksGroup.setAttribute('class', 'right-angle-marks');
      g.appendChild(marksGroup);
    }
    marksGroup.appendChild(mark);
    g.appendChild(marksGroup);
  }

  function updateRightAngleMarks(g) {
    const points = getVertexCoords(g);
    const n = points.length;
    const marks = Array.from(g.querySelectorAll('.right-angle-mark'));
    marks.forEach(function (mark) {
      const vertexIndex = parseInt(mark.getAttribute('data-vertex-index'), 10);
      if (vertexIndex < 0 || vertexIndex >= n) {
        mark.remove();
        return;
      }
      if (!isNearRightAngle(g, vertexIndex)) {
        mark.remove();
        return;
      }
      const prev = (vertexIndex - 1 + n) % n;
      const next = (vertexIndex + 1) % n;
      const v = points[vertexIndex];
      const p = points[prev];
      const q = points[next];
      const s = RIGHT_ANGLE_MARK_SIZE;
      let ux = (p[0] - v[0]) / (Math.hypot(p[0] - v[0], p[1] - v[1]) || 1e-6);
      let uy = (p[1] - v[1]) / (Math.hypot(p[0] - v[0], p[1] - v[1]) || 1e-6);
      let wx = (q[0] - v[0]) / (Math.hypot(q[0] - v[0], q[1] - v[1]) || 1e-6);
      let wy = (q[1] - v[1]) / (Math.hypot(q[0] - v[0], q[1] - v[1]) || 1e-6);
      const xA = v[0] + wx * s;
      const yA = v[1] + wy * s;
      const xB = v[0] + wx * s + ux * s;
      const yB = v[1] + wy * s + uy * s;
      const xC = v[0] + ux * s;
      const yC = v[1] + uy * s;
      const xD = v[0] + ux * s + wx * s;
      const yD = v[1] + uy * s + wy * s;
      const path = mark.querySelector('.right-angle-mark-line');
      if (path && path.setAttribute) {
        const edgeLine = g.querySelector('.shape-edge');
        const edgeStrokeWidth = edgeLine ? (edgeLine.getAttribute('data-stroke-width') || edgeLine.getAttribute('stroke-width') || '2') : '2';
        path.setAttribute('d', 'M' + xA + ',' + yA + 'L' + xB + ',' + yB + 'M' + xC + ',' + yC + 'L' + xD + ',' + yD);
        path.setAttributeNS(SVG_NS, 'stroke-width', edgeStrokeWidth);
        path.style.setProperty('stroke-width', edgeStrokeWidth + 'px');
      }
    });
  }

  function pointInPolygon(px, py, points) {
    const n = points.length;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = points[i][0], yi = points[i][1];
      const xj = points[j][0], yj = points[j][1];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  const ALTITUDE_LABEL_OFFSET = 18;
  const INSIDE_TEST_SCALE = 1.2;

  function getAltitudeLabelOffset(mx, my, vx, vy, fx, fy, shapePoints) {
    const dx = fx - vx;
    const dy = fy - vy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const perpX = -uy;
    const perpY = ux;
    const offset = ALTITUDE_LABEL_OFFSET;
    const sideA = { dx: perpX * offset, dy: perpY * offset };
    const sideB = { dx: -perpX * offset, dy: -perpY * offset };
    const testScale = INSIDE_TEST_SCALE;
    const insideA = pointInPolygon(mx + sideA.dx * testScale, my + sideA.dy * testScale, shapePoints);
    const insideB = pointInPolygon(mx + sideB.dx * testScale, my + sideB.dy * testScale, shapePoints);
    if (insideA && !insideB) return sideA;
    if (!insideA && insideB) return sideB;
    if (insideA && insideB) return sideA;
    const cx = shapePoints.reduce((s, p) => s + p[0], 0) / shapePoints.length;
    const cy = shapePoints.reduce((s, p) => s + p[1], 0) / shapePoints.length;
    const toCenterX = cx - mx;
    const toCenterY = cy - my;
    const dist = Math.hypot(toCenterX, toCenterY) || 1;
    return { dx: (toCenterX / dist) * offset, dy: (toCenterY / dist) * offset };
  }

  function distanceToSegment(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = px - x1;
    const wy = py - y1;
    const c1 = wx * vx + wy * vy;
    const c2 = vx * vx + vy * vy;
    let t = 0;
    if (c2 > 1e-10) {
      t = Math.max(0, Math.min(1, c1 / c2));
    }
    const closestX = x1 + t * vx;
    const closestY = y1 + t * vy;
    const dist = Math.hypot(px - closestX, py - closestY);
    return { dist, t };
  }

  const VERTEX_DRAG_THRESHOLD = 3;
  const ROTATION_CURSOR = "url('data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="black" stroke-width="2" d="M12 5 a7 7 0 1 1 0 14 a7 7 0 0 1 0 -14"/><path fill="black" d="M12 3 L14.5 9 L12 7 L9.5 9 Z"/></svg>') + "') 12 12, auto";

  function enableVertexDrag(g) {
    let dragging = null;
    let pendingVertex = null;
    let pendingVertexShift = false;
    let pendingVertexCtrl = false;
    let lastClickedVertex = null;
    let startX, startY, startCx, startCy;
    let scalingShape = null;
    let rotatingShape = null;

    g.querySelectorAll('.vertex').forEach(circle => {
      circle.addEventListener('mousedown', function (ev) {
        if (altitudeDrawingMode) return;
        ev.preventDefault();
        ev.stopPropagation();
        pendingVertex = this;
        pendingVertexShift = ev.shiftKey;
        pendingVertexCtrl = ev.ctrlKey;
        startX = ev.clientX;
        startY = ev.clientY;
        startCx = parseFloat(this.getAttribute('cx'));
        startCy = parseFloat(this.getAttribute('cy'));
      });
      circle.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (lastClickedVertex !== this) return;
        lastClickedVertex = null;
        if (contextMenuTimeout) clearTimeout(contextMenuTimeout);
        const cx = ev.clientX;
        const cy = ev.clientY;
        contextMenuTimeout = setTimeout(function () {
          contextMenuTimeout = null;
          showVertexContextMenu(this, cx, cy);
        }.bind(this), CLICK_MENU_DELAY);
      });
      circle.addEventListener('dblclick', function (ev) {
        if (contextMenuTimeout) {
          clearTimeout(contextMenuTimeout);
          contextMenuTimeout = null;
        }
      });
    });

    document.addEventListener('mousemove', function (ev) {
      if (rotatingShape) {
        const [mx, my] = getWorkspacePoint(ev);
        const cx = rotatingShape.centerX;
        const cy = rotatingShape.centerY;
        const currentAngle = Math.atan2(my - cy, mx - cx);
        const delta = currentAngle - rotatingShape.startAngle;
        const cos = Math.cos(delta);
        const sin = Math.sin(delta);
        const pts = rotatingShape.startPoints;
        const circles = rotatingShape.g.querySelectorAll('.vertex');
        circles.forEach(function (c, idx) {
          const px = pts[idx][0];
          const py = pts[idx][1];
          const rx = px - cx;
          const ry = py - cy;
          c.setAttribute('cx', cx + rx * cos - ry * sin);
          c.setAttribute('cy', cy + rx * sin + ry * cos);
        });
        updatePolygonFromVertices(rotatingShape.g);
        document.body.style.cursor = ROTATION_CURSOR;
      } else if (scalingShape) {
        const [mx, my] = getWorkspacePoint(ev);
        const cx = scalingShape.centerX;
        const cy = scalingShape.centerY;
        const pts = scalingShape.startPoints;
        const i = scalingShape.draggedIndex;
        const dx0 = pts[i][0] - cx;
        const dy0 = pts[i][1] - cy;
        const dist0 = Math.hypot(dx0, dy0) || 1e-6;
        const dx1 = mx - cx;
        const dy1 = my - cy;
        const dist1 = Math.hypot(dx1, dy1);
        const s = Math.max(0.2, Math.min(5, dist1 / dist0));
        const circles = scalingShape.g.querySelectorAll('.vertex');
        circles.forEach((c, idx) => {
          const px = pts[idx][0];
          const py = pts[idx][1];
          c.setAttribute('cx', cx + (px - cx) * s);
          c.setAttribute('cy', cy + (py - cy) * s);
        });
        updatePolygonFromVertices(scalingShape.g);
      } else if (dragging) {
        const rect = workspace.getBoundingClientRect();
        const scaleX = workspace.width.baseVal.value / rect.width;
        const scaleY = workspace.height.baseVal.value / rect.height;
        const dx = (ev.clientX - startX) * scaleX;
        const dy = (ev.clientY - startY) * scaleY;
        dragging.setAttribute('cx', startCx + dx);
        dragging.setAttribute('cy', startCy + dy);
        startX = ev.clientX;
        startY = ev.clientY;
        startCx = parseFloat(dragging.getAttribute('cx'));
        startCy = parseFloat(dragging.getAttribute('cy'));
        updatePolygonFromVertices(dragging.closest('.shape-group'));
      } else if (pendingVertex) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) >= VERTEX_DRAG_THRESHOLD) {
          pushUndo();
          const shapeGroup = pendingVertex.closest('.shape-group');
          const startPoints = getVertexCoords(shapeGroup);
          if (pendingVertexCtrl) {
            const centerX = startPoints.reduce((s, p) => s + p[0], 0) / startPoints.length;
            const centerY = startPoints.reduce((s, p) => s + p[1], 0) / startPoints.length;
            const [mx, my] = getWorkspacePoint(ev);
            rotatingShape = {
              g: shapeGroup,
              centerX: centerX,
              centerY: centerY,
              startPoints: startPoints,
              startAngle: Math.atan2(my - centerY, mx - centerX),
              draggedIndex: parseInt(pendingVertex.getAttribute('data-index'), 10)
            };
            document.body.style.cursor = ROTATION_CURSOR;
          } else if (pendingVertexShift) {
            const centerX = startPoints.reduce((s, p) => s + p[0], 0) / startPoints.length;
            const centerY = startPoints.reduce((s, p) => s + p[1], 0) / startPoints.length;
            scalingShape = {
              g: shapeGroup,
              centerX: centerX,
              centerY: centerY,
              startPoints: startPoints,
              draggedIndex: parseInt(pendingVertex.getAttribute('data-index'), 10)
            };
          } else {
            dragging = pendingVertex;
            startCx = parseFloat(dragging.getAttribute('cx'));
            startCy = parseFloat(dragging.getAttribute('cy'));
          }
          pendingVertex = null;
          pendingVertexShift = false;
          pendingVertexCtrl = false;
          startX = ev.clientX;
          startY = ev.clientY;
        }
      } else if (!rotatingShape && ev.target.closest && ev.target.closest('.shape-group .vertex') && ev.ctrlKey) {
        document.body.style.cursor = ROTATION_CURSOR;
      } else if (!rotatingShape) {
        document.body.style.cursor = '';
      }
    });

    document.addEventListener('mouseup', function () {
      if (pendingVertex && !dragging && !scalingShape && !rotatingShape) lastClickedVertex = pendingVertex;
      pendingVertex = null;
      dragging = null;
      scalingShape = null;
      rotatingShape = null;
      document.body.style.cursor = '';
    });

    document.addEventListener('keyup', function (ev) {
      if (ev.key === 'Control') document.body.style.cursor = '';
    });
  }

  function enableLabelDrag(g) {
    let draggingLabel = null;
    let pendingLabelDrag = null;
    let startX, startY, startTextX, startTextY;
    const DRAG_THRESHOLD = 3;

    g.querySelectorAll('.vertex-label').forEach(text => {
      text.addEventListener('mousedown', function (ev) {
        ev.stopPropagation();
        pendingLabelDrag = this;
        startX = ev.clientX;
        startY = ev.clientY;
        startTextX = parseFloat(this.getAttribute('x'));
        startTextY = parseFloat(this.getAttribute('y'));
      });
    });

    document.addEventListener('mousemove', function (ev) {
      if (draggingLabel) {
        const rect = workspace.getBoundingClientRect();
        const scaleX = workspace.width.baseVal.value / rect.width;
        const scaleY = workspace.height.baseVal.value / rect.height;
        const dx = (ev.clientX - startX) * scaleX;
        const dy = (ev.clientY - startY) * scaleY;
        draggingLabel.setAttribute('x', startTextX + dx);
        draggingLabel.setAttribute('y', startTextY + dy);
        startX = ev.clientX;
        startY = ev.clientY;
        startTextX = parseFloat(draggingLabel.getAttribute('x'));
        startTextY = parseFloat(draggingLabel.getAttribute('y'));
      } else if (pendingLabelDrag) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
          draggingLabel = pendingLabelDrag;
          pendingLabelDrag = null;
          startX = ev.clientX;
          startY = ev.clientY;
          startTextX = parseFloat(draggingLabel.getAttribute('x'));
          startTextY = parseFloat(draggingLabel.getAttribute('y'));
        }
      }
    });

    document.addEventListener('mouseup', function (ev) {
      if (draggingLabel) {
        const shapeGroup = draggingLabel.closest('.shape-group');
        const index = parseInt(draggingLabel.getAttribute('data-vertex-index'), 10);
        const circle = shapeGroup.querySelector('.vertex[data-index="' + index + '"]');
        if (circle) {
          const cx = parseFloat(circle.getAttribute('cx'));
          const cy = parseFloat(circle.getAttribute('cy'));
          const tx = parseFloat(draggingLabel.getAttribute('x'));
          const ty = parseFloat(draggingLabel.getAttribute('y'));
          draggingLabel.setAttribute('data-offset-dx', tx - cx);
          draggingLabel.setAttribute('data-offset-dy', ty - cy);
        }
      }
      draggingLabel = null;
      pendingLabelDrag = null;
    });
  }

  function openVertexLabelEditor(shapeGroup, vertexIndex, editorX, editorY) {
    const circle = shapeGroup.querySelector('.vertex[data-index="' + vertexIndex + '"]');
    if (!circle) return;
    const textEl = shapeGroup.querySelector('.vertex-label[data-vertex-index="' + vertexIndex + '"]');
    const currentLabel = (textEl && textEl.textContent) || circle.getAttribute('data-label') || '';
    if (editorX == null) editorX = parseFloat(circle.getAttribute('cx')) + LABEL_OFFSET_X;
    if (editorY == null) editorY = parseFloat(circle.getAttribute('cy')) + LABEL_OFFSET_Y - 18;

    const fo = document.createElementNS(SVG_NS, 'foreignObject');
    fo.setAttribute('x', editorX);
    fo.setAttribute('y', editorY);
    fo.setAttribute('width', 200);
    fo.setAttribute('height', 36);
    fo.setAttribute('class', 'vertex-label-editor');
    fo.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentLabel;
    input.className = 'vertex-label-input';
    fo.appendChild(input);
    workspace.appendChild(fo);
    input.focus();
    input.select();

    function commit() {
      const value = input.value.trim();
      if (value !== currentLabel) {
        pushUndo();
        if (textEl) textEl.textContent = value;
        circle.setAttribute('data-label', value);
        updateLabelPositions(shapeGroup);
      }
      fo.remove();
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = currentLabel; input.blur(); }
    });
  }

  function enableVertexLabels(g) {
    g.querySelectorAll('.vertex').forEach(circle => {
      circle.addEventListener('dblclick', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openVertexLabelEditor(g, parseInt(this.getAttribute('data-index'), 10));
      });
    });
    g.querySelectorAll('.vertex-label').forEach(text => {
      text.addEventListener('dblclick', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) {
          clearTimeout(contextMenuTimeout);
          contextMenuTimeout = null;
        }
        const index = parseInt(this.getAttribute('data-vertex-index'), 10);
        const x = parseFloat(this.getAttribute('x'));
        const y = parseFloat(this.getAttribute('y'));
        openVertexLabelEditor(g, index, x, y - 18);
      });
    });
  }

  const EDGE_HIT_THRESHOLD = 24;

  function getClosestEdgeIndex(g, px, py) {
    const points = getVertexCoords(g);
    const n = points.length;
    let bestDist = Infinity;
    let bestEdge = null;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const { dist, t } = distanceToSegment(px, py, points[i][0], points[i][1], points[j][0], points[j][1]);
      if (dist < bestDist && t >= 0.05 && t <= 0.95) {
        bestDist = dist;
        bestEdge = i;
      }
    }
    return bestDist < EDGE_HIT_THRESHOLD ? bestEdge : null;
  }

  function getClosestEdgeAcrossShapes(px, py) {
    const groups = workspace.querySelectorAll('.shape-group');
    let bestDist = Infinity;
    let best = null;
    groups.forEach(g => {
      const points = getVertexCoords(g);
      const n = points.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const { dist, t } = distanceToSegment(px, py, points[i][0], points[i][1], points[j][0], points[j][1]);
        if (dist < bestDist && t >= 0.05 && t <= 0.95 && dist < EDGE_HIT_THRESHOLD) {
          bestDist = dist;
          best = { g: g, edgeIndex: i };
        }
      }
    });
    return best;
  }

  function openEdgeLabelEditor(shapeGroup, edgeIndex, editorX, editorY) {
    const textEl = shapeGroup.querySelector('.edge-label[data-edge-index="' + edgeIndex + '"]');
    if (!textEl) return;
    const currentLabel = textEl.textContent || textEl.getAttribute('data-label') || '';
    const tx = parseFloat(textEl.getAttribute('x'));
    const ty = parseFloat(textEl.getAttribute('y'));
    if (editorX == null) editorX = tx;
    if (editorY == null) editorY = ty - 18;

    const fo = document.createElementNS(SVG_NS, 'foreignObject');
    fo.setAttribute('x', editorX);
    fo.setAttribute('y', editorY);
    fo.setAttribute('width', 200);
    fo.setAttribute('height', 36);
    fo.setAttribute('class', 'vertex-label-editor');
    fo.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentLabel;
    input.className = 'vertex-label-input';
    fo.appendChild(input);
    workspace.appendChild(fo);
    input.focus();
    input.select();

    function commit() {
      const value = input.value.trim();
      if (value !== currentLabel) {
        pushUndo();
        textEl.textContent = value;
        textEl.setAttribute('data-label', value);
        updateEdgeLabelPositions(shapeGroup);
      }
      fo.remove();
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = currentLabel; input.blur(); }
    });
  }

  function openAltitudeLabelEditor(shapeGroup, altLine, editorX, editorY) {
    const aid = altLine.getAttribute('data-altitude-id');
    if (!aid) return;
    const textEl = shapeGroup.querySelector('.altitude-label[data-altitude-id="' + aid + '"]');
    if (!textEl) return;
    const currentLabel = textEl.textContent || textEl.getAttribute('data-label') || '';
    const tx = parseFloat(textEl.getAttribute('x'));
    const ty = parseFloat(textEl.getAttribute('y'));
    if (editorX == null) editorX = tx;
    if (editorY == null) editorY = ty - 18;

    const fo = document.createElementNS(SVG_NS, 'foreignObject');
    fo.setAttribute('x', editorX);
    fo.setAttribute('y', editorY);
    fo.setAttribute('width', 200);
    fo.setAttribute('height', 36);
    fo.setAttribute('class', 'vertex-label-editor');
    fo.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentLabel;
    input.className = 'vertex-label-input';
    fo.appendChild(input);
    workspace.appendChild(fo);
    input.focus();
    input.select();

    function commit() {
      const value = input.value.trim();
      if (value !== currentLabel) {
        pushUndo();
        textEl.textContent = value;
        textEl.setAttribute('data-label', value);
      }
      fo.remove();
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = currentLabel; input.blur(); }
    });
  }

  function enableEdgeLabels(g) {
    const polygon = g.querySelector('.shape-body');
    if (polygon) {
      polygon.addEventListener('dblclick', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) {
          clearTimeout(contextMenuTimeout);
          contextMenuTimeout = null;
        }
        if (!ev.target.classList.contains('shape-body')) return;
        const [px, py] = getWorkspacePoint(ev);
        const edgeIndex = getClosestEdgeIndex(g, px, py);
        if (edgeIndex !== null) openEdgeLabelEditor(g, edgeIndex);
      });
    }
    g.querySelectorAll('.edge-label').forEach(text => {
      text.addEventListener('dblclick', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) {
          clearTimeout(contextMenuTimeout);
          contextMenuTimeout = null;
        }
        const index = parseInt(this.getAttribute('data-edge-index'), 10);
        const x = parseFloat(this.getAttribute('x'));
        const y = parseFloat(this.getAttribute('y'));
        openEdgeLabelEditor(g, index, x, y - 18);
      });
    });
  }

  function enableEdgeLabelDrag(g) {
    let draggingLabel = null;
    let pendingLabelDrag = null;
    let startX, startY, startTextX, startTextY;
    const DRAG_THRESHOLD = 3;

    g.querySelectorAll('.edge-label').forEach(text => {
      text.addEventListener('mousedown', function (ev) {
        ev.stopPropagation();
        pendingLabelDrag = this;
        startX = ev.clientX;
        startY = ev.clientY;
        startTextX = parseFloat(this.getAttribute('x'));
        startTextY = parseFloat(this.getAttribute('y'));
      });
    });

    document.addEventListener('mousemove', function (ev) {
      if (draggingLabel) {
        const rect = workspace.getBoundingClientRect();
        const scaleX = workspace.width.baseVal.value / rect.width;
        const scaleY = workspace.height.baseVal.value / rect.height;
        const dx = (ev.clientX - startX) * scaleX;
        const dy = (ev.clientY - startY) * scaleY;
        draggingLabel.setAttribute('x', startTextX + dx);
        draggingLabel.setAttribute('y', startTextY + dy);
        startX = ev.clientX;
        startY = ev.clientY;
        startTextX = parseFloat(draggingLabel.getAttribute('x'));
        startTextY = parseFloat(draggingLabel.getAttribute('y'));
      } else if (pendingLabelDrag) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
          draggingLabel = pendingLabelDrag;
          pendingLabelDrag = null;
          startX = ev.clientX;
          startY = ev.clientY;
          startTextX = parseFloat(draggingLabel.getAttribute('x'));
          startTextY = parseFloat(draggingLabel.getAttribute('y'));
        }
      }
    });

    document.addEventListener('mouseup', function (ev) {
      if (draggingLabel) {
        const shapeGroup = draggingLabel.closest('.shape-group');
        const index = parseInt(draggingLabel.getAttribute('data-edge-index'), 10);
        const circles = shapeGroup.querySelectorAll('.vertex');
        const n = circles.length;
        const c0 = circles[index];
        const c1 = circles[(index + 1) % n];
        const mx = (parseFloat(c0.getAttribute('cx')) + parseFloat(c1.getAttribute('cx'))) / 2;
        const my = (parseFloat(c0.getAttribute('cy')) + parseFloat(c1.getAttribute('cy'))) / 2;
        const tx = parseFloat(draggingLabel.getAttribute('x'));
        const ty = parseFloat(draggingLabel.getAttribute('y'));
        draggingLabel.setAttribute('data-offset-dx', tx - mx);
        draggingLabel.setAttribute('data-offset-dy', ty - my);
      }
      draggingLabel = null;
      pendingLabelDrag = null;
    });
  }

  function enableAltitudeLabelDrag(g) {
    let draggingLabel = null;
    let pendingLabelDrag = null;
    let startX, startY, startTextX, startTextY;
    const DRAG_THRESHOLD = 3;

    g.addEventListener('dblclick', function (ev) {
      if (!ev.target.classList.contains('altitude-label')) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (contextMenuTimeout) {
        clearTimeout(contextMenuTimeout);
        contextMenuTimeout = null;
      }
      const aid = ev.target.getAttribute('data-altitude-id');
      const altLine = g.querySelector('.altitude-line[data-altitude-id="' + aid + '"]');
      if (altLine) {
        const x = parseFloat(ev.target.getAttribute('x'));
        const y = parseFloat(ev.target.getAttribute('y'));
        openAltitudeLabelEditor(g, altLine, x, y - 18);
      }
    });

    g.addEventListener('mousedown', function (ev) {
      if (!ev.target.classList.contains('altitude-label')) return;
      ev.stopPropagation();
      pendingLabelDrag = ev.target;
      startX = ev.clientX;
      startY = ev.clientY;
      startTextX = parseFloat(ev.target.getAttribute('x'));
      startTextY = parseFloat(ev.target.getAttribute('y'));
    });

    document.addEventListener('mousemove', function (ev) {
      if (draggingLabel) {
        const rect = workspace.getBoundingClientRect();
        const scaleX = workspace.width.baseVal.value / rect.width;
        const scaleY = workspace.height.baseVal.value / rect.height;
        const dx = (ev.clientX - startX) * scaleX;
        const dy = (ev.clientY - startY) * scaleY;
        draggingLabel.setAttribute('x', startTextX + dx);
        draggingLabel.setAttribute('y', startTextY + dy);
        startX = ev.clientX;
        startY = ev.clientY;
        startTextX = parseFloat(draggingLabel.getAttribute('x'));
        startTextY = parseFloat(draggingLabel.getAttribute('y'));
      } else if (pendingLabelDrag) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
          draggingLabel = pendingLabelDrag;
          pendingLabelDrag = null;
          startX = ev.clientX;
          startY = ev.clientY;
          startTextX = parseFloat(draggingLabel.getAttribute('x'));
          startTextY = parseFloat(draggingLabel.getAttribute('y'));
        }
      }
    });

    document.addEventListener('mouseup', function (ev) {
      if (draggingLabel) {
        const shapeGroup = draggingLabel.closest('.shape-group');
        const aid = draggingLabel.getAttribute('data-altitude-id');
        const altLine = shapeGroup ? shapeGroup.querySelector('.altitude-line[data-altitude-id="' + aid + '"]') : null;
        if (altLine) {
          const x1 = parseFloat(altLine.getAttribute('x1'));
          const y1 = parseFloat(altLine.getAttribute('y1'));
          const x2 = parseFloat(altLine.getAttribute('x2'));
          const y2 = parseFloat(altLine.getAttribute('y2'));
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const tx = parseFloat(draggingLabel.getAttribute('x'));
          const ty = parseFloat(draggingLabel.getAttribute('y'));
          draggingLabel.setAttribute('data-offset-dx', tx - mx);
          draggingLabel.setAttribute('data-offset-dy', ty - my);
        }
      }
      draggingLabel = null;
      pendingLabelDrag = null;
    });
  }

  const SHAPE_DRAG_THRESHOLD = 3;

  function enableShapeDragToTrash(g) {
    let shapeDrag = null;
    let pendingShapeDrag = null;
    let edgeDragIndices = null;
    let didMove = false;
    let startX, startY, startCoords;

    function startShapeDrag(ev) {
      if (ev.target.classList.contains('vertex')) return;
      pendingShapeDrag = { g: g, ev: ev };
      shapeDrag = null;
      edgeDragIndices = null;
      didMove = false;
      startX = ev.clientX;
      startY = ev.clientY;
      startCoords = getVertexCoords(g);
      const [px, py] = getWorkspacePoint(ev);
      const points = startCoords;
      const n = points.length;
      let bestDist = Infinity;
      let bestEdge = null;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const { dist, t } = distanceToSegment(px, py, points[i][0], points[i][1], points[j][0], points[j][1]);
        if (dist < bestDist && t >= 0.05 && t <= 0.95) {
          bestDist = dist;
          bestEdge = [i, j];
        }
      }
      if (bestDist < EDGE_HIT_THRESHOLD && bestEdge) {
        edgeDragIndices = bestEdge;
      } else {
        edgeDragIndices = null;
      }
    }
    function moveShapeDrag(ev) {
      if (shapeDrag) {
        didMove = true;
        const rect = workspace.getBoundingClientRect();
        const scaleX = workspace.width.baseVal.value / rect.width;
        const scaleY = workspace.height.baseVal.value / rect.height;
        const dx = (ev.clientX - startX) * scaleX;
        const dy = (ev.clientY - startY) * scaleY;
        startX = ev.clientX;
        startY = ev.clientY;
        const circles = shapeDrag.querySelectorAll('.vertex');
        if (edgeDragIndices) {
          edgeDragIndices.forEach(i => {
            const c = circles[i];
            c.setAttribute('cx', startCoords[i][0] + dx);
            c.setAttribute('cy', startCoords[i][1] + dy);
          });
        } else {
          circles.forEach((c, i) => {
            c.setAttribute('cx', startCoords[i][0] + dx);
            c.setAttribute('cy', startCoords[i][1] + dy);
          });
        }
        startCoords = getVertexCoords(shapeDrag);
        updatePolygonFromVertices(shapeDrag);
        const tr = trash.getBoundingClientRect();
        trash.classList.toggle('drag-over', ev.clientX >= tr.left && ev.clientX <= tr.right && ev.clientY >= tr.top && ev.clientY <= tr.bottom);
      } else if (pendingShapeDrag) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) >= SHAPE_DRAG_THRESHOLD) {
          pushUndo();
          shapeDrag = g;
          startX = ev.clientX;
          startY = ev.clientY;
        }
      }
    }
    function endShapeDrag(ev) {
      if (shapeDrag) {
        const tr = trash.getBoundingClientRect();
        if (ev.clientX >= tr.left && ev.clientX <= tr.right && ev.clientY >= tr.top && ev.clientY <= tr.bottom) {
          pushUndo();
          shapeDrag.remove();
        }
        trash.classList.remove('drag-over');
      } else if (pendingShapeDrag && !didMove && ev.target.classList.contains('shape-body')) {
        const [px, py] = getWorkspacePoint(ev);
        const edgeIndex = g.dataset.shapeType === 'circle' ? null : getClosestEdgeIndex(g, px, py);
        if (edgeIndex !== null) {
          if (contextMenuTimeout) clearTimeout(contextMenuTimeout);
          const cx = ev.clientX;
          const cy = ev.clientY;
          contextMenuTimeout = setTimeout(function () {
            contextMenuTimeout = null;
            showEdgeContextMenu(g, edgeIndex, cx, cy);
          }, CLICK_MENU_DELAY);
        }
      }
      shapeDrag = null;
      pendingShapeDrag = null;
      edgeDragIndices = null;
      document.removeEventListener('mousemove', moveShapeDrag);
      document.removeEventListener('mouseup', endShapeDrag);
    }

    g.addEventListener('mousedown', function (ev) {
      if (ev.target.classList.contains('vertex')) return;
      if (ev.target.classList.contains('vertex-label') || ev.target.classList.contains('edge-label') || ev.target.classList.contains('altitude-label')) return;
      if (altitudeDrawingMode) return;
      ev.preventDefault();
      startShapeDrag(ev);
      document.addEventListener('mousemove', moveShapeDrag);
      document.addEventListener('mouseup', endShapeDrag);
    });
  }

  document.querySelectorAll('.shape-icon').forEach(icon => {
    icon.addEventListener('dragstart', function (ev) {
      ev.dataTransfer.setData('application/x-shape-type', this.dataset.shape);
      ev.dataTransfer.effectAllowed = 'copy';
    });
  });

  workspace.addEventListener('dragover', function (ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    workspace.classList.add('drag-over');
  });
  workspace.addEventListener('dragleave', function () {
    workspace.classList.remove('drag-over');
  });
  workspace.addEventListener('drop', function (ev) {
    ev.preventDefault();
    workspace.classList.remove('drag-over');
    const type = ev.dataTransfer.getData('application/x-shape-type');
    if (!type) return;
    ensureWorkspaceSize();
    pushUndo();
    const [x, y] = getWorkspacePoint(ev);
    createShape(type, x, y);
  });

  workspace.addEventListener('click', function (ev) {
    if (ev.target !== workspace) return;
    const [px, py] = getWorkspacePoint(ev);
    const hit = getClosestEdgeAcrossShapes(px, py);
    if (hit) {
      if (contextMenuTimeout) clearTimeout(contextMenuTimeout);
      const cx = ev.clientX;
      const cy = ev.clientY;
      contextMenuTimeout = setTimeout(function () {
        contextMenuTimeout = null;
        showEdgeContextMenu(hit.g, hit.edgeIndex, cx, cy);
      }, CLICK_MENU_DELAY);
    }
  });

  workspace.addEventListener('dblclick', function (ev) {
    if (ev.target !== workspace) return;
    ev.preventDefault();
    if (contextMenuTimeout) {
      clearTimeout(contextMenuTimeout);
      contextMenuTimeout = null;
    }
    const [px, py] = getWorkspacePoint(ev);
    const hit = getClosestEdgeAcrossShapes(px, py);
    if (hit) openEdgeLabelEditor(hit.g, hit.edgeIndex);
  });

  trash.addEventListener('dragover', function (ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    trash.classList.add('drag-over');
  });
  trash.addEventListener('dragleave', function () {
    trash.classList.remove('drag-over');
  });
  trash.addEventListener('drop', function (ev) {
    ev.preventDefault();
    trash.classList.remove('drag-over');
  });

  const helpOverlay = document.getElementById('help-overlay');
  const helpHint = document.getElementById('help-hint');

  function isTypingElement(el) {
    if (!el || !el.closest) return false;
    const tag = el.tagName && el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || el.isContentEditable) return true;
    return false;
  }

  function showHelp() {
    if (helpOverlay) {
      helpOverlay.style.display = 'flex';
      helpOverlay.setAttribute('aria-hidden', 'false');
    }
  }

  function hideHelp() {
    if (helpOverlay) {
      helpOverlay.style.display = 'none';
      helpOverlay.setAttribute('aria-hidden', 'true');
    }
  }

  function toggleHelp() {
    if (helpOverlay && helpOverlay.style.display !== 'none') hideHelp();
    else showHelp();
  }

  if (helpOverlay) {
    helpOverlay.addEventListener('click', function (ev) {
      if (ev.target === helpOverlay) hideHelp();
    });
  }

  document.addEventListener('keydown', function (ev) {
    if (ev.ctrlKey && ev.key === 'z') {
      ev.preventDefault();
      undo();
    } else if (ev.ctrlKey && ev.key === 'y') {
      ev.preventDefault();
      redo();
    } else if (ev.key === 'h' && !isTypingElement(ev.target)) {
      ev.preventDefault();
      toggleHelp();
    } else if (ev.key === 'Escape' && helpOverlay && helpOverlay.style.display !== 'none') {
      ev.preventDefault();
      hideHelp();
    }
  });

  window.addEventListener('resize', ensureWorkspaceSize);
  ensureWorkspaceSize();
})();
