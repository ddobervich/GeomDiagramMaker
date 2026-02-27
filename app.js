(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SCALE = 480;
  function regularPolygonPoints(n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      pts.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]);
    }
    return pts;
  }

  const DEFAULT_REGULAR_POLYGON_SIDES = 6;
  const MIN_REGULAR_POLYGON_SIDES = 3;
  const MAX_REGULAR_POLYGON_SIDES = 12;

  const shapes = {
    'rectangle': [[0, 0], [1, 0], [1, 0.6], [0, 0.6]],
    'parallelogram': [[0, 0], [1, 0], [0.85, 0.6], [-0.15, 0.6]],
    'trapezoid': [[0.15, 0], [0.85, 0], [1, 0.6], [0, 0.6]],
    'right-triangle': [[0, 0], [1, 0], [0, 0.6]],
    'equilateral-triangle': [[0.5, 0], [1, 0.866], [0, 0.866]],
    'circle': [[0.5, 0.5], [1, 0.5]],
    'regular-polygon': null
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
  const DEFAULT_LABEL_FONT_SIZE = 22;
  const MIN_LABEL_FONT_SIZE = 10;
  const MAX_LABEL_FONT_SIZE = 48;

  let contextMenuTimeout = null;
  let altitudeDrawingMode = null;
  let chordDrawingMode = null;
  let apothemDrawingMode = null;
  let centerConnectDrawingMode = null;

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
          offsetDy: el && el.hasAttribute('data-offset-dy') ? parseFloat(el.getAttribute('data-offset-dy')) : LABEL_OFFSET_Y,
          fontSize: el && el.hasAttribute('data-font-size') ? parseInt(el.getAttribute('data-font-size'), 10) : undefined
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
          offsetDy: el && el.hasAttribute('data-offset-dy') ? parseFloat(el.getAttribute('data-offset-dy')) : 0,
          fontSize: el && el.hasAttribute('data-font-size') ? parseInt(el.getAttribute('data-font-size'), 10) : undefined
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
          offsetDy: labelEl && labelEl.hasAttribute('data-offset-dy') ? parseFloat(labelEl.getAttribute('data-offset-dy')) : 0,
          fontSize: labelEl && labelEl.hasAttribute('data-font-size') ? parseInt(labelEl.getAttribute('data-font-size'), 10) : undefined
        });
      });
      const rightAngleMarks = [];
      g.querySelectorAll('.right-angle-mark').forEach(mark => {
        const vi = parseInt(mark.getAttribute('data-vertex-index'), 10);
        if (!isNaN(vi)) rightAngleMarks.push(vi);
      });
      const state = {
        shapeType,
        vertices,
        vertexLabels,
        vertexStyles,
        edgeLabels,
        edgeStyles,
        altitudes,
        rightAngleMarks
      };
      if (shapeType === 'circle') {
        const circleRadii = [];
        g.querySelectorAll('.circle-radius-line').forEach((line, i) => {
          const idx = line.getAttribute('data-radius-index');
          const label = g.querySelector('.circle-line-label[data-type="radius"][data-radius-index="' + idx + '"]');
          circleRadii.push({
            angle: parseFloat(line.getAttribute('data-angle')) || 0,
            stroke: line.getAttribute('data-stroke') || line.getAttribute('stroke') || '#000',
            strokeWidth: line.getAttribute('data-stroke-width') || line.getAttribute('stroke-width') || '2',
            strokeDasharray: line.getAttribute('data-stroke-dasharray') || undefined,
            strokeLinecap: line.getAttribute('data-stroke-linecap') || undefined,
            labelText: label ? (label.textContent || label.getAttribute('data-label') || '') : '',
            offsetDx: label && label.hasAttribute('data-offset-dx') ? parseFloat(label.getAttribute('data-offset-dx')) : 0,
            offsetDy: label && label.hasAttribute('data-offset-dy') ? parseFloat(label.getAttribute('data-offset-dy')) : 0,
            fontSize: label && label.hasAttribute('data-font-size') ? parseInt(label.getAttribute('data-font-size'), 10) : undefined
          });
        });
        const circleDiameters = [];
        g.querySelectorAll('.circle-diameter-line').forEach((line, i) => {
          const idx = line.getAttribute('data-diameter-index');
          const label = g.querySelector('.circle-line-label[data-type="diameter"][data-diameter-index="' + idx + '"]');
          circleDiameters.push({
            angle: parseFloat(line.getAttribute('data-angle')) || 0,
            stroke: line.getAttribute('data-stroke') || line.getAttribute('stroke') || '#000',
            strokeWidth: line.getAttribute('data-stroke-width') || line.getAttribute('stroke-width') || '2',
            strokeDasharray: line.getAttribute('data-stroke-dasharray') || undefined,
            strokeLinecap: line.getAttribute('data-stroke-linecap') || undefined,
            labelText: label ? (label.textContent || label.getAttribute('data-label') || '') : '',
            offsetDx: label && label.hasAttribute('data-offset-dx') ? parseFloat(label.getAttribute('data-offset-dx')) : 0,
            offsetDy: label && label.hasAttribute('data-offset-dy') ? parseFloat(label.getAttribute('data-offset-dy')) : 0,
            fontSize: label && label.hasAttribute('data-font-size') ? parseInt(label.getAttribute('data-font-size'), 10) : undefined
          });
        });
        state.circleRadii = circleRadii;
        state.circleDiameters = circleDiameters;
      }
      if (shapeType === 'regular-polygon') {
        state.sides = Math.max(MIN_REGULAR_POLYGON_SIDES, Math.min(MAX_REGULAR_POLYGON_SIDES, parseInt(g.dataset.sides, 10) || DEFAULT_REGULAR_POLYGON_SIDES));
        const chords = [];
        g.querySelectorAll('.chord-line').forEach(function (line) {
          const a = parseInt(line.getAttribute('data-vertex-a'), 10);
          const b = parseInt(line.getAttribute('data-vertex-b'), 10);
          if (isNaN(a) || isNaN(b)) return;
          const label = g.querySelector('.chord-label[data-vertex-a="' + a + '"][data-vertex-b="' + b + '"]');
          chords.push({
            vertexA: a,
            vertexB: b,
            labelText: label ? (label.textContent || label.getAttribute('data-label') || '') : '',
            offsetDx: label && label.hasAttribute('data-offset-dx') ? parseFloat(label.getAttribute('data-offset-dx')) : 0,
            offsetDy: label && label.hasAttribute('data-offset-dy') ? parseFloat(label.getAttribute('data-offset-dy')) : 0,
            stroke: line.getAttribute('data-stroke') || line.getAttribute('stroke') || '#333',
            strokeWidth: line.getAttribute('data-stroke-width') || line.getAttribute('stroke-width') || '2',
            strokeDasharray: line.getAttribute('data-stroke-dasharray') || undefined,
            strokeLinecap: line.getAttribute('data-stroke-linecap') || undefined
          });
        });
        state.chords = chords;
        const apothems = [];
        g.querySelectorAll('.apothem-line').forEach(function (line) {
          const edgeIndex = parseInt(line.getAttribute('data-edge-index'), 10);
          if (!isNaN(edgeIndex) && edgeIndex >= 0) {
            const labelEl = g.querySelector('.apothem-label[data-edge-index="' + edgeIndex + '"]');
            const labelText = labelEl ? (labelEl.textContent || labelEl.getAttribute('data-label') || '') : '';
            apothems.push({ edgeIndex: edgeIndex, labelText: labelText });
          }
        });
        state.apothems = apothems;
        const centerEl = g.querySelector('.shape-center');
        if (centerEl) {
          state.centerPointStyle = {
            r: parseInt(centerEl.getAttribute('data-size') || centerEl.getAttribute('r') || '2', 10),
            fill: centerEl.getAttribute('data-color') || centerEl.style.fill || '#333'
          };
        }
        const centerLines = [];
        g.querySelectorAll('.center-line').forEach(function (line) {
          const vi = parseInt(line.getAttribute('data-vertex-index'), 10);
          if (!isNaN(vi) && vi >= 0) centerLines.push(vi);
        });
        state.centerLines = centerLines;
        const centerLineLabels = [];
        g.querySelectorAll('.center-line-label').forEach(function (label) {
          const vi = parseInt(label.getAttribute('data-vertex-index'), 10);
          if (!isNaN(vi) && vi >= 0) {
            centerLineLabels.push({
              vertexIndex: vi,
              labelText: label.textContent || label.getAttribute('data-label') || '',
              offsetDx: label.hasAttribute('data-offset-dx') ? parseFloat(label.getAttribute('data-offset-dx')) : 0,
              offsetDy: label.hasAttribute('data-offset-dy') ? parseFloat(label.getAttribute('data-offset-dy')) : 0
            });
          }
        });
        state.centerLineLabels = centerLineLabels;
      }
      shapesState.push(state);
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
    if (shapeType === 'regular-polygon') g.dataset.sides = String(Math.max(MIN_REGULAR_POLYGON_SIDES, Math.min(MAX_REGULAR_POLYGON_SIDES, s.sides != null ? s.sides : DEFAULT_REGULAR_POLYGON_SIDES)));
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
    if (shapeType === 'regular-polygon') {
      const cx = vertices.reduce((s, p) => s + p[0], 0) / n;
      const cy = vertices.reduce((s, p) => s + p[1], 0) / n;
      const centerCircle = document.createElementNS(SVG_NS, 'circle');
      centerCircle.setAttribute('class', 'shape-center');
      centerCircle.setAttribute('cx', cx);
      centerCircle.setAttribute('cy', cy);
      const cp = (s.centerPointStyle || {});
      centerCircle.setAttribute('r', String(cp.r != null ? cp.r : 2));
      centerCircle.setAttribute('data-size', String(cp.r != null ? cp.r : 2));
      if (cp.fill) { centerCircle.style.fill = cp.fill; centerCircle.setAttribute('data-color', cp.fill); }
      centerCircle.setAttribute('pointer-events', 'all');
      g.appendChild(centerCircle);
      if (s.centerLines && s.centerLines.length) {
        const centerLinesGroup = document.createElementNS(SVG_NS, 'g');
        centerLinesGroup.setAttribute('class', 'center-lines');
        g.insertBefore(centerLinesGroup, centerCircle.nextSibling);
        const pts = vertices;
        const n = pts.length;
        const cxx = pts.reduce((s, p) => s + p[0], 0) / n;
        const cyy = pts.reduce((s, p) => s + p[1], 0) / n;
        s.centerLines.forEach(function (vi) {
          if (vi < 0 || vi >= n) return;
          const line = document.createElementNS(SVG_NS, 'line');
          line.setAttribute('class', 'center-line');
          line.setAttribute('data-vertex-index', String(vi));
          line.setAttribute('x1', cxx);
          line.setAttribute('y1', cyy);
          line.setAttribute('x2', pts[vi][0]);
          line.setAttribute('y2', pts[vi][1]);
          line.setAttribute('stroke', '#333');
          line.setAttribute('data-stroke', '#333');
          line.setAttribute('stroke-width', '2');
          line.setAttribute('data-stroke-width', '2');
          line.setAttribute('stroke-dasharray', '8,4');
          line.setAttribute('data-stroke-dasharray', '8,4');
          line.style.strokeDasharray = '8,4';
          line.setAttribute('pointer-events', 'stroke');
          centerLinesGroup.appendChild(line);
        });
        if (s.centerLineLabels && s.centerLineLabels.length) {
          const centerLineLabelsGroup = document.createElementNS(SVG_NS, 'g');
          centerLineLabelsGroup.setAttribute('class', 'center-line-labels');
          g.insertBefore(centerLineLabelsGroup, centerLinesGroup.nextSibling);
          s.centerLineLabels.forEach(function (lab) {
            const vi = lab.vertexIndex;
            if (vi < 0 || vi >= n) return;
            const mx = (cxx + pts[vi][0]) / 2;
            const my = (cyy + pts[vi][1]) / 2;
            const labelEl = document.createElementNS(SVG_NS, 'text');
            labelEl.setAttribute('class', 'center-line-label edge-label');
            labelEl.setAttribute('data-vertex-index', String(vi));
            labelEl.setAttribute('x', mx + (lab.offsetDx || 0));
            labelEl.setAttribute('y', my + (lab.offsetDy || 0));
            labelEl.setAttribute('text-anchor', 'middle');
            labelEl.setAttribute('dominant-baseline', 'middle');
            labelEl.setAttribute('data-offset-dx', String(lab.offsetDx != null ? lab.offsetDx : 0));
            labelEl.setAttribute('data-offset-dy', String(lab.offsetDy != null ? lab.offsetDy : 0));
            if (lab.labelText) { labelEl.textContent = lab.labelText; labelEl.setAttribute('data-label', lab.labelText); }
            labelEl.setAttribute('pointer-events', 'all');
            centerLineLabelsGroup.appendChild(labelEl);
          });
        }
      }
    }
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
      if (vl.fontSize != null) setLabelFontSize(text, vl.fontSize);
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
        if (el.fontSize != null) setLabelFontSize(text, el.fontSize);
        edgeLabelsGroup.appendChild(text);
      }
    }
    g.appendChild(edgeLabelsGroup);
    const altitudeLabelsGroup = document.createElementNS(SVG_NS, 'g');
    altitudeLabelsGroup.setAttribute('class', 'altitude-labels');
    g.appendChild(altitudeLabelsGroup);
    if (isCircle && n >= 2) {
      const cx = vertices[0][0];
      const cy = vertices[0][1];
      const r = Math.hypot(vertices[1][0] - cx, vertices[1][1] - cy) || 1;
      const circleLinesGroup = document.createElementNS(SVG_NS, 'g');
      circleLinesGroup.setAttribute('class', 'circle-lines');
      g.insertBefore(circleLinesGroup, labelsGroup);
      (s.circleRadii || []).forEach(function (rad, idx) {
        const angle = rad.angle != null ? rad.angle : 0.5 + idx * 0.7;
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('class', 'circle-radius-line');
        line.setAttribute('data-type', 'radius');
        line.setAttribute('data-radius-index', String(idx));
        line.setAttribute('data-angle', String(angle));
        line.setAttribute('x1', cx);
        line.setAttribute('y1', cy);
        line.setAttribute('x2', cx + r * Math.cos(angle));
        line.setAttribute('y2', cy + r * Math.sin(angle));
        line.setAttribute('stroke', rad.stroke || '#000');
        line.setAttribute('data-stroke', rad.stroke || '#000');
        line.setAttribute('stroke-width', rad.strokeWidth || '2');
        line.setAttribute('data-stroke-width', rad.strokeWidth || '2');
        if (rad.strokeDasharray) { line.setAttribute('stroke-dasharray', rad.strokeDasharray); line.setAttribute('data-stroke-dasharray', rad.strokeDasharray); }
        if (rad.strokeLinecap) { line.setAttribute('stroke-linecap', rad.strokeLinecap); line.setAttribute('data-stroke-linecap', rad.strokeLinecap); }
        line.setAttribute('pointer-events', 'stroke');
        circleLinesGroup.appendChild(line);
      });
      (s.circleDiameters || []).forEach(function (diam, idx) {
        const angle = diam.angle != null ? diam.angle : idx * 0.6;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('class', 'circle-diameter-line');
        line.setAttribute('data-type', 'diameter');
        line.setAttribute('data-diameter-index', String(idx));
        line.setAttribute('data-angle', String(angle));
        line.setAttribute('x1', cx - r * cos);
        line.setAttribute('y1', cy - r * sin);
        line.setAttribute('x2', cx + r * cos);
        line.setAttribute('y2', cy + r * sin);
        line.setAttribute('stroke', diam.stroke || '#000');
        line.setAttribute('data-stroke', diam.stroke || '#000');
        line.setAttribute('stroke-width', diam.strokeWidth || '2');
        line.setAttribute('data-stroke-width', diam.strokeWidth || '2');
        if (diam.strokeDasharray) { line.setAttribute('stroke-dasharray', diam.strokeDasharray); line.setAttribute('data-stroke-dasharray', diam.strokeDasharray); }
        if (diam.strokeLinecap) { line.setAttribute('stroke-linecap', diam.strokeLinecap); line.setAttribute('data-stroke-linecap', diam.strokeLinecap); }
        line.setAttribute('pointer-events', 'stroke');
        circleLinesGroup.appendChild(line);
      });
      const circleLineLabelsGroup = document.createElementNS(SVG_NS, 'g');
      circleLineLabelsGroup.setAttribute('class', 'circle-line-labels');
      g.appendChild(circleLineLabelsGroup);
      (s.circleRadii || []).forEach(function (rad, idx) {
        const line = g.querySelector('.circle-radius-line[data-radius-index="' + idx + '"]');
        if (!line) return;
        const mid = { mx: (parseFloat(line.getAttribute('x1')) + parseFloat(line.getAttribute('x2'))) / 2, my: (parseFloat(line.getAttribute('y1')) + parseFloat(line.getAttribute('y2'))) / 2 };
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('class', 'circle-line-label edge-label');
        label.setAttribute('data-type', 'radius');
        label.setAttribute('data-radius-index', String(idx));
        label.setAttribute('x', mid.mx + (rad.offsetDx != null ? rad.offsetDx : 0));
        label.setAttribute('y', mid.my + (rad.offsetDy != null ? rad.offsetDy : 0));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute('pointer-events', 'all');
        label.setAttribute('data-offset-dx', String(rad.offsetDx != null ? rad.offsetDx : 0));
        label.setAttribute('data-offset-dy', String(rad.offsetDy != null ? rad.offsetDy : 0));
        if (rad.labelText) { label.textContent = rad.labelText; label.setAttribute('data-label', rad.labelText); }
        if (rad.fontSize != null) setLabelFontSize(label, rad.fontSize);
        circleLineLabelsGroup.appendChild(label);
      });
      (s.circleDiameters || []).forEach(function (diam, idx) {
        const line = g.querySelector('.circle-diameter-line[data-diameter-index="' + idx + '"]');
        if (!line) return;
        const mid = { mx: (parseFloat(line.getAttribute('x1')) + parseFloat(line.getAttribute('x2'))) / 2, my: (parseFloat(line.getAttribute('y1')) + parseFloat(line.getAttribute('y2'))) / 2 };
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('class', 'circle-line-label edge-label');
        label.setAttribute('data-type', 'diameter');
        label.setAttribute('data-diameter-index', String(idx));
        label.setAttribute('x', mid.mx + (diam.offsetDx != null ? diam.offsetDx : 0));
        label.setAttribute('y', mid.my + (diam.offsetDy != null ? diam.offsetDy : 0));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute('pointer-events', 'all');
        label.setAttribute('data-offset-dx', String(diam.offsetDx != null ? diam.offsetDx : 0));
        label.setAttribute('data-offset-dy', String(diam.offsetDy != null ? diam.offsetDy : 0));
        if (diam.labelText) { label.textContent = diam.labelText; label.setAttribute('data-label', diam.labelText); }
        if (diam.fontSize != null) setLabelFontSize(label, diam.fontSize);
        circleLineLabelsGroup.appendChild(label);
      });
    }
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
        if (alt.fontSize != null) setLabelFontSize(label, alt.fontSize);
        altitudeLabelsGroup.appendChild(label);
        addRightAngleMarkAtAltitudeFoot(g, altLine);
      }
    });
    }
    if (shapeType === 'regular-polygon' && s.chords && s.chords.length) {
      const chordLinesGroup = document.createElementNS(SVG_NS, 'g');
      chordLinesGroup.setAttribute('class', 'chord-lines');
      const chordLabelsGroup = document.createElementNS(SVG_NS, 'g');
      chordLabelsGroup.setAttribute('class', 'chord-labels');
      g.insertBefore(chordLinesGroup, altitudeLabelsGroup);
      g.insertBefore(chordLabelsGroup, chordLinesGroup.nextSibling);
      s.chords.forEach(function (c) {
        const a = c.vertexA;
        const b = c.vertexB;
        if (a < 0 || a >= n || b < 0 || b >= n || a === b) return;
        const x1 = vertices[a][0];
        const y1 = vertices[a][1];
        const x2 = vertices[b][0];
        const y2 = vertices[b][1];
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const chordLine = document.createElementNS(SVG_NS, 'line');
        chordLine.setAttribute('class', 'chord-line');
        chordLine.setAttribute('data-vertex-a', String(a));
        chordLine.setAttribute('data-vertex-b', String(b));
        chordLine.setAttribute('x1', x1);
        chordLine.setAttribute('y1', y1);
        chordLine.setAttribute('x2', x2);
        chordLine.setAttribute('y2', y2);
        chordLine.setAttribute('stroke', c.stroke || '#333');
        chordLine.setAttribute('data-stroke', c.stroke || '#333');
        chordLine.setAttribute('stroke-width', c.strokeWidth || '2');
        chordLine.setAttribute('data-stroke-width', c.strokeWidth || '2');
        chordLine.setAttribute('stroke-dasharray', c.strokeDasharray != null ? c.strokeDasharray : '8,4');
        chordLine.setAttribute('data-stroke-dasharray', c.strokeDasharray != null ? c.strokeDasharray : '8,4');
        if (c.strokeLinecap) { chordLine.setAttribute('stroke-linecap', c.strokeLinecap); chordLine.setAttribute('data-stroke-linecap', c.strokeLinecap); }
        chordLine.setAttribute('pointer-events', 'stroke');
        chordLinesGroup.appendChild(chordLine);
        const chordLabel = document.createElementNS(SVG_NS, 'text');
        chordLabel.setAttribute('class', 'chord-label edge-label');
        chordLabel.setAttribute('data-vertex-a', String(a));
        chordLabel.setAttribute('data-vertex-b', String(b));
        chordLabel.setAttribute('data-offset-dx', String(c.offsetDx != null ? c.offsetDx : 0));
        chordLabel.setAttribute('data-offset-dy', String(c.offsetDy != null ? c.offsetDy : 0));
        chordLabel.setAttribute('x', mx + (c.offsetDx || 0));
        chordLabel.setAttribute('y', my + (c.offsetDy || 0));
        chordLabel.setAttribute('text-anchor', 'middle');
        chordLabel.setAttribute('dominant-baseline', 'middle');
        chordLabel.setAttribute('pointer-events', 'all');
        if (c.labelText) { chordLabel.textContent = c.labelText; chordLabel.setAttribute('data-label', c.labelText); }
        chordLabelsGroup.appendChild(chordLabel);
      });
    }
    if (shapeType === 'regular-polygon' && s.apothems && s.apothems.length) {
      const pts = vertices;
      const n = pts.length;
      const centerX = pts.reduce((s, p) => s + p[0], 0) / n;
      const centerY = pts.reduce((s, p) => s + p[1], 0) / n;
      let apothemLinesGroup = g.querySelector('.apothem-lines');
      if (!apothemLinesGroup) {
        apothemLinesGroup = document.createElementNS(SVG_NS, 'g');
        apothemLinesGroup.setAttribute('class', 'apothem-lines');
        g.insertBefore(apothemLinesGroup, altitudeLabelsGroup);
      }
      let apothemLabelsGroup = g.querySelector('.apothem-labels');
      if (!apothemLabelsGroup && s.apothems.some(function (a) { return a.labelText; })) {
        apothemLabelsGroup = document.createElementNS(SVG_NS, 'g');
        apothemLabelsGroup.setAttribute('class', 'apothem-labels');
        g.insertBefore(apothemLabelsGroup, apothemLinesGroup.nextSibling);
      }
      s.apothems.forEach(function (a) {
        const edgeIndex = a.edgeIndex;
        if (edgeIndex < 0 || edgeIndex >= n) return;
        const midX = (pts[edgeIndex][0] + pts[(edgeIndex + 1) % n][0]) / 2;
        const midY = (pts[edgeIndex][1] + pts[(edgeIndex + 1) % n][1]) / 2;
        const apothemLine = document.createElementNS(SVG_NS, 'line');
        apothemLine.setAttribute('class', 'apothem-line');
        apothemLine.setAttribute('data-edge-index', String(edgeIndex));
        apothemLine.setAttribute('x1', centerX);
        apothemLine.setAttribute('y1', centerY);
        apothemLine.setAttribute('x2', midX);
        apothemLine.setAttribute('y2', midY);
        apothemLine.setAttribute('stroke', '#333');
        apothemLine.setAttribute('data-stroke', '#333');
        apothemLine.setAttribute('stroke-width', '2');
        apothemLine.setAttribute('data-stroke-width', '2');
        apothemLine.setAttribute('stroke-dasharray', '8,4');
        apothemLine.setAttribute('data-stroke-dasharray', '8,4');
        apothemLine.setAttribute('pointer-events', 'stroke');
        apothemLinesGroup.appendChild(apothemLine);
        if (apothemLabelsGroup && a.labelText) {
          const labelEl = document.createElementNS(SVG_NS, 'text');
          labelEl.setAttribute('class', 'apothem-label edge-label');
          labelEl.setAttribute('data-edge-index', String(edgeIndex));
          labelEl.setAttribute('x', midX);
          labelEl.setAttribute('y', midY);
          labelEl.setAttribute('text-anchor', 'middle');
          labelEl.setAttribute('dominant-baseline', 'middle');
          labelEl.setAttribute('data-offset-dx', '0');
          labelEl.setAttribute('data-offset-dy', '0');
          labelEl.setAttribute('data-label', a.labelText);
          labelEl.textContent = a.labelText;
          labelEl.setAttribute('pointer-events', 'all');
          apothemLabelsGroup.appendChild(labelEl);
        }
      });
    }
    (s.rightAngleMarks || []).forEach(vi => addRightAngleMark(g, vi));
    enableVertexDrag(g);
    enableVertexLabels(g);
    enableLabelDrag(g);
    enableEdgeLabels(g);
    enableEdgeLabelDrag(g);
    if (isCircle) enableCircleLineLabelDrag(g);
    if (shapeType === 'regular-polygon') {
      enableChordLabelDrag(g);
      enableApothemLabelDrag(g);
      enableCenterLineLabelDrag(g);
    }
    enableAltitudeLabelDrag(g);
    enableShapeDragToTrash(g);
    g.addEventListener('dblclick', function (ev) {
      if (ev.target.classList.contains('circle-radius-line') || ev.target.classList.contains('circle-diameter-line')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) {
          clearTimeout(contextMenuTimeout);
          contextMenuTimeout = null;
        }
        openCircleLineLabelEditor(g, ev.target);
        return;
      }
      if (ev.target.classList.contains('circle-line-label')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) {
          clearTimeout(contextMenuTimeout);
          contextMenuTimeout = null;
        }
        const type = ev.target.getAttribute('data-type');
        const idx = type === 'radius' ? ev.target.getAttribute('data-radius-index') : ev.target.getAttribute('data-diameter-index');
        const line = type === 'radius'
          ? g.querySelector('.circle-radius-line[data-radius-index="' + idx + '"]')
          : g.querySelector('.circle-diameter-line[data-diameter-index="' + idx + '"]');
        if (line) openCircleLineLabelEditor(g, line);
        return;
      }
      if (ev.target.classList.contains('chord-line')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) { clearTimeout(contextMenuTimeout); contextMenuTimeout = null; }
        openChordLabelEditor(g, ev.target);
        return;
      }
      if (ev.target.classList.contains('chord-label')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) { clearTimeout(contextMenuTimeout); contextMenuTimeout = null; }
        const va = ev.target.getAttribute('data-vertex-a');
        const vb = ev.target.getAttribute('data-vertex-b');
        const chordLine = g.querySelector('.chord-line[data-vertex-a="' + va + '"][data-vertex-b="' + vb + '"]');
        if (chordLine) {
          const x = parseFloat(ev.target.getAttribute('x'));
          const y = parseFloat(ev.target.getAttribute('y'));
          openChordLabelEditor(g, chordLine, x, y - 18);
        }
        return;
      }
      if (ev.target.classList.contains('apothem-line')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) { clearTimeout(contextMenuTimeout); contextMenuTimeout = null; }
        openApothemLabelEditor(g, ev.target);
        return;
      }
      if (ev.target.classList.contains('apothem-label')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) { clearTimeout(contextMenuTimeout); contextMenuTimeout = null; }
        const edgeIndex = ev.target.getAttribute('data-edge-index');
        const apothemLine = g.querySelector('.apothem-line[data-edge-index="' + edgeIndex + '"]');
        if (apothemLine) {
          const x = parseFloat(ev.target.getAttribute('x'));
          const y = parseFloat(ev.target.getAttribute('y'));
          openApothemLabelEditor(g, apothemLine, x, y - 18);
        }
        return;
      }
      if (ev.target.classList.contains('center-line')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) { clearTimeout(contextMenuTimeout); contextMenuTimeout = null; }
        openCenterLineLabelEditor(g, ev.target);
        return;
      }
      if (ev.target.classList.contains('center-line-label')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) { clearTimeout(contextMenuTimeout); contextMenuTimeout = null; }
        const vertexIndex = ev.target.getAttribute('data-vertex-index');
        const centerLine = g.querySelector('.center-line[data-vertex-index="' + vertexIndex + '"]');
        if (centerLine) {
          const x = parseFloat(ev.target.getAttribute('x'));
          const y = parseFloat(ev.target.getAttribute('y'));
          openCenterLineLabelEditor(g, centerLine, x, y - 18);
        }
        return;
      }
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

  function getLabelFontSize(labelEl) {
    const v = parseInt(labelEl.getAttribute('data-font-size'), 10);
    return isNaN(v) ? DEFAULT_LABEL_FONT_SIZE : Math.max(MIN_LABEL_FONT_SIZE, Math.min(MAX_LABEL_FONT_SIZE, v));
  }

  function setLabelFontSize(labelEl, size) {
    const val = Math.max(MIN_LABEL_FONT_SIZE, Math.min(MAX_LABEL_FONT_SIZE, size));
    labelEl.setAttribute('data-font-size', String(val));
    labelEl.style.fontSize = val + 'pt';
  }

  function showLabelFontSizeContextMenu(labelEl, clientX, clientY) {
    let didPushUndo = false;
    let currentSize = getLabelFontSize(labelEl);
    showContextMenuAt(clientX, clientY, function (menu) {
      const title = document.createElement('div');
      title.className = 'context-menu-title';
      title.textContent = 'Label font size';
      menu.appendChild(title);
      const row = document.createElement('div');
      row.className = 'context-menu-row';
      const btnMinus = document.createElement('button');
      btnMinus.type = 'button';
      btnMinus.className = 'context-menu-size-btn';
      btnMinus.textContent = '−';
      const sizeDisplay = document.createElement('span');
      sizeDisplay.className = 'context-menu-size-value';
      sizeDisplay.textContent = currentSize;
      const btnPlus = document.createElement('button');
      btnPlus.type = 'button';
      btnPlus.className = 'context-menu-size-btn';
      btnPlus.textContent = '+';
      function updateSize(val) {
        if (val !== currentSize && !didPushUndo) { pushUndo(); didPushUndo = true; }
        currentSize = val;
        sizeDisplay.textContent = currentSize;
        setLabelFontSize(labelEl, currentSize);
        btnMinus.disabled = currentSize <= MIN_LABEL_FONT_SIZE;
        btnPlus.disabled = currentSize >= MAX_LABEL_FONT_SIZE;
      }
      btnMinus.addEventListener('click', function () {
        if (currentSize > MIN_LABEL_FONT_SIZE) updateSize(currentSize - 1);
      });
      btnPlus.addEventListener('click', function () {
        if (currentSize < MAX_LABEL_FONT_SIZE) updateSize(currentSize + 1);
      });
      updateSize(currentSize);
      row.appendChild(btnMinus);
      row.appendChild(sizeDisplay);
      row.appendChild(btnPlus);
      menu.appendChild(row);
    });
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
      const shapeGroup = circle.closest('.shape-group');
      const vertexIndex = parseInt(circle.getAttribute('data-index'), 10);
      const isCircleShape = shapeGroup && shapeGroup.dataset.shapeType === 'circle';
      const isRegularPolygon = shapeGroup && shapeGroup.dataset.shapeType === 'regular-polygon';
      if (!isCircleShape && !isRegularPolygon) {
        const btnAltitude = document.createElement('button');
        btnAltitude.type = 'button';
        btnAltitude.className = 'context-menu-style-btn';
        btnAltitude.textContent = 'Draw an altitude';
        btnAltitude.addEventListener('click', function () {
          hideContextMenu();
          startAltitudeDrawing(circle);
        });
        rowAltitude.appendChild(btnAltitude);
      }
      if (isRegularPolygon) {
        const btnChord = document.createElement('button');
        btnChord.type = 'button';
        btnChord.className = 'context-menu-style-btn';
        btnChord.textContent = 'Draw chord';
        btnChord.addEventListener('click', function () {
          hideContextMenu();
          startChordDrawing(circle);
        });
        rowAltitude.appendChild(btnChord);
      }
      if (isCircleShape) {
        const radiusLines = shapeGroup.querySelectorAll('.circle-radius-line');
        const diameterLines = shapeGroup.querySelectorAll('.circle-diameter-line');
        const btnRadius = document.createElement('button');
        btnRadius.type = 'button';
        btnRadius.className = 'context-menu-style-btn';
        btnRadius.textContent = radiusLines.length === 0 ? 'Draw a radius' : 'Remove a radius';
        btnRadius.addEventListener('click', function () {
          hideContextMenu();
          if (radiusLines.length === 0) {
            addCircleRadius(shapeGroup);
          } else {
            removeCircleRadius(shapeGroup);
          }
          pushUndo();
        });
        rowAltitude.appendChild(btnRadius);
        const btnDiameter = document.createElement('button');
        btnDiameter.type = 'button';
        btnDiameter.className = 'context-menu-style-btn';
        btnDiameter.textContent = diameterLines.length === 0 ? 'Draw a diameter' : 'Remove a diameter';
        btnDiameter.addEventListener('click', function () {
          hideContextMenu();
          if (diameterLines.length === 0) {
            addCircleDiameter(shapeGroup);
          } else {
            removeCircleDiameter(shapeGroup);
          }
          pushUndo();
        });
        rowAltitude.appendChild(btnDiameter);
      }
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
        addRightAngleMarkAtAltitudeFoot(shapeGroup, altLine);
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

  function startChordDrawing(vertexCircle) {
    const shapeGroup = vertexCircle.closest('.shape-group');
    if (!shapeGroup || shapeGroup.dataset.shapeType !== 'regular-polygon') return;
    const fromVertexIndex = parseInt(vertexCircle.getAttribute('data-index'), 10);
    if (isNaN(fromVertexIndex)) return;
    const points = getVertexCoords(shapeGroup);
    const vx = points[fromVertexIndex][0];
    const vy = points[fromVertexIndex][1];
    const tempLine = document.createElementNS(SVG_NS, 'line');
    tempLine.setAttribute('x1', vx);
    tempLine.setAttribute('y1', vy);
    tempLine.setAttribute('x2', vx);
    tempLine.setAttribute('y2', vy);
    tempLine.setAttribute('stroke', '#666');
    tempLine.setAttribute('stroke-width', '2');
    tempLine.setAttribute('stroke-dasharray', '8,4');
    tempLine.setAttribute('class', 'chord-temp');
    workspace.appendChild(tempLine);
    chordDrawingMode = { shapeGroup: shapeGroup, fromVertexIndex: fromVertexIndex, tempLine: tempLine };
    function updateChordTemp(ev) {
      if (!chordDrawingMode || !chordDrawingMode.tempLine) return;
      const [mx, my] = getWorkspacePoint(ev);
      chordDrawingMode.tempLine.setAttribute('x2', mx);
      chordDrawingMode.tempLine.setAttribute('y2', my);
    }
    function finishChord(ev) {
      if (!chordDrawingMode) return;
      if (chordDrawingMode.tempLine) {
        chordDrawingMode.tempLine.remove();
        chordDrawingMode.tempLine = null;
      }
      if (ev.target.closest('#context-menu') || ev.target.closest('.vertex-label-editor')) return;
      const t = ev.target;
      if (!t.classList.contains('vertex')) {
        chordDrawingMode = null;
        document.removeEventListener('mousemove', updateChordTemp);
        document.removeEventListener('click', finishChord, true);
        document.removeEventListener('keydown', cancelChord);
        return;
      }
      const g = t.closest('.shape-group');
      if (g !== chordDrawingMode.shapeGroup) {
        chordDrawingMode = null;
        document.removeEventListener('mousemove', updateChordTemp);
        document.removeEventListener('click', finishChord, true);
        document.removeEventListener('keydown', cancelChord);
        return;
      }
      const toVertexIndex = parseInt(t.getAttribute('data-index'), 10);
      if (toVertexIndex === chordDrawingMode.fromVertexIndex) {
        chordDrawingMode = null;
        document.removeEventListener('mousemove', updateChordTemp);
        document.removeEventListener('click', finishChord, true);
        document.removeEventListener('keydown', cancelChord);
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      const va = Math.min(chordDrawingMode.fromVertexIndex, toVertexIndex);
      const vb = Math.max(chordDrawingMode.fromVertexIndex, toVertexIndex);
      let chordLinesGroup = shapeGroup.querySelector('.chord-lines');
      if (!chordLinesGroup) {
        chordLinesGroup = document.createElementNS(SVG_NS, 'g');
        chordLinesGroup.setAttribute('class', 'chord-lines');
        const altLabels = shapeGroup.querySelector('.altitude-labels');
        shapeGroup.insertBefore(chordLinesGroup, altLabels);
      }
      const existing = shapeGroup.querySelectorAll('.chord-line');
      for (let i = 0; i < existing.length; i++) {
        const line = existing[i];
        const a = parseInt(line.getAttribute('data-vertex-a'), 10);
        const b = parseInt(line.getAttribute('data-vertex-b'), 10);
        if ((a === va && b === vb)) {
          chordDrawingMode = null;
          document.removeEventListener('mousemove', updateChordTemp);
          document.removeEventListener('click', finishChord, true);
          document.removeEventListener('keydown', cancelChord);
          return;
        }
      }
      pushUndo();
      const points = getVertexCoords(shapeGroup);
      const x1 = points[va][0];
      const y1 = points[va][1];
      const x2 = points[vb][0];
      const y2 = points[vb][1];
      const chordLine = document.createElementNS(SVG_NS, 'line');
      chordLine.setAttribute('class', 'chord-line');
      chordLine.setAttribute('data-vertex-a', String(va));
      chordLine.setAttribute('data-vertex-b', String(vb));
      chordLine.setAttribute('x1', x1);
      chordLine.setAttribute('y1', y1);
      chordLine.setAttribute('x2', x2);
      chordLine.setAttribute('y2', y2);
      chordLine.setAttribute('stroke', '#333');
      chordLine.setAttribute('data-stroke', '#333');
      chordLine.setAttribute('stroke-width', '2');
      chordLine.setAttribute('data-stroke-width', '2');
      chordLine.setAttribute('stroke-dasharray', '8,4');
      chordLine.setAttribute('data-stroke-dasharray', '8,4');
      chordLine.setAttribute('pointer-events', 'stroke');
      chordLinesGroup.appendChild(chordLine);
      let chordLabelsGroup = shapeGroup.querySelector('.chord-labels');
      if (!chordLabelsGroup) {
        chordLabelsGroup = document.createElementNS(SVG_NS, 'g');
        chordLabelsGroup.setAttribute('class', 'chord-labels');
        shapeGroup.insertBefore(chordLabelsGroup, chordLinesGroup.nextSibling);
      }
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const chordLabel = document.createElementNS(SVG_NS, 'text');
      chordLabel.setAttribute('class', 'chord-label edge-label');
      chordLabel.setAttribute('data-vertex-a', String(va));
      chordLabel.setAttribute('data-vertex-b', String(vb));
      chordLabel.setAttribute('x', mx);
      chordLabel.setAttribute('y', my);
      chordLabel.setAttribute('text-anchor', 'middle');
      chordLabel.setAttribute('dominant-baseline', 'middle');
      chordLabel.setAttribute('data-offset-dx', '0');
      chordLabel.setAttribute('data-offset-dy', '0');
      chordLabel.setAttribute('pointer-events', 'all');
      chordLabelsGroup.appendChild(chordLabel);
      chordDrawingMode = null;
      document.removeEventListener('mousemove', updateChordTemp);
      document.removeEventListener('click', finishChord, true);
      document.removeEventListener('keydown', cancelChord);
    }
    function cancelChord(ev) {
      if (!chordDrawingMode) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        if (chordDrawingMode.tempLine) {
          chordDrawingMode.tempLine.remove();
          chordDrawingMode.tempLine = null;
        }
        chordDrawingMode = null;
        document.removeEventListener('mousemove', updateChordTemp);
        document.removeEventListener('click', finishChord, true);
        document.removeEventListener('keydown', cancelChord);
      }
    }
    document.addEventListener('mousemove', updateChordTemp);
    document.addEventListener('click', finishChord, true);
    document.addEventListener('keydown', cancelChord);
  }

  function showLineStyleContextMenu(line, titleText, clientX, clientY) {
    const strokeWidth = line.getAttribute('data-stroke-width') || line.getAttribute('stroke-width') || '2';
    const stroke = line.getAttribute('data-stroke') || line.getAttribute('stroke') || (line.getAttribute && window.getComputedStyle(line).stroke) || '#000000';
    showContextMenuAt(clientX, clientY, function (menu) {
      const title = document.createElement('div');
      title.className = 'context-menu-title';
      title.textContent = titleText;
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

  function showEdgeContextMenu(shapeGroup, edgeIndex, clientX, clientY) {
    const line = shapeGroup.querySelector('.shape-edge[data-edge-index="' + edgeIndex + '"]');
    if (!line) return;
    showLineStyleContextMenu(line, 'Edge', clientX, clientY);
  }

  function showChordContextMenu(shapeGroup, chordLine, clientX, clientY) {
    showLineStyleContextMenu(chordLine, 'Chord', clientX, clientY);
  }

  function showApothemContextMenu(shapeGroup, apothemLine, clientX, clientY) {
    showLineStyleContextMenu(apothemLine, 'Apothem', clientX, clientY);
  }

  function showCenterLineContextMenu(shapeGroup, centerLine, clientX, clientY) {
    showLineStyleContextMenu(centerLine, 'Center line', clientX, clientY);
  }

  function showCenterPointContextMenu(shapeGroup, centerEl, clientX, clientY) {
    const r = parseInt(centerEl.getAttribute('r') || centerEl.getAttribute('data-size') || '2', 10);
    const fill = centerEl.getAttribute('data-color') || centerEl.getAttribute('fill') || window.getComputedStyle(centerEl).fill || '#333333';
    showContextMenuAt(clientX, clientY, function (menu) {
      const title = document.createElement('div');
      title.className = 'context-menu-title';
      title.textContent = 'Center';
      menu.appendChild(title);
      const rowSize = document.createElement('div');
      rowSize.className = 'context-menu-row';
      rowSize.innerHTML = '<label>Point size</label>';
      const minR = 1, maxR = 8;
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
      function applySize(val) {
        currentR = val;
        sizeDisplay.textContent = currentR;
        centerEl.setAttribute('r', currentR);
        centerEl.setAttribute('data-size', String(currentR));
        btnMinus.disabled = currentR <= minR;
        btnPlus.disabled = currentR >= maxR;
      }
      btnMinus.addEventListener('click', function () {
        if (currentR > minR) applySize(currentR - 1);
      });
      btnPlus.addEventListener('click', function () {
        if (currentR < maxR) applySize(currentR + 1);
      });
      applySize(currentR);
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
          centerEl.style.fill = hex;
          centerEl.setAttribute('data-color', hex);
        });
        colorWrap.appendChild(swatch);
      });
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = (fill.startsWith('#') ? fill : '#333333').slice(0, 7);
      colorInput.style.width = '28px';
      colorInput.style.height = '24px';
      colorInput.style.border = 'none';
      colorInput.style.cursor = 'pointer';
      colorInput.addEventListener('input', function () {
        const hex = colorInput.value;
        centerEl.style.fill = hex;
        centerEl.setAttribute('data-color', hex);
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
          centerEl.style.fill = hex;
          centerEl.setAttribute('data-color', hex);
        });
        grayWrap.appendChild(swatch);
      });
      rowGray.appendChild(grayWrap);
      menu.appendChild(rowGray);
      const rowApothem = document.createElement('div');
      rowApothem.className = 'context-menu-row';
      rowApothem.innerHTML = '<label>Tools</label>';
      const btnApothem = document.createElement('button');
      btnApothem.type = 'button';
      btnApothem.className = 'context-menu-style-btn';
      btnApothem.textContent = 'Draw apothem';
      btnApothem.addEventListener('click', function () {
        hideContextMenu();
        startApothemDrawing(shapeGroup);
      });
      rowApothem.appendChild(btnApothem);
      const btnConnectVertex = document.createElement('button');
      btnConnectVertex.type = 'button';
      btnConnectVertex.className = 'context-menu-style-btn';
      btnConnectVertex.textContent = 'Connect to vertex';
      btnConnectVertex.addEventListener('click', function () {
        hideContextMenu();
        startCenterConnectToVertex(shapeGroup);
      });
      rowApothem.appendChild(btnConnectVertex);
      const btnConnectAll = document.createElement('button');
      btnConnectAll.type = 'button';
      btnConnectAll.className = 'context-menu-style-btn';
      btnConnectAll.textContent = 'Connect to all vertices';
      btnConnectAll.addEventListener('click', function () {
        hideContextMenu();
        connectCenterToAllVertices(shapeGroup);
      });
      rowApothem.appendChild(btnConnectAll);
      menu.appendChild(rowApothem);
    });
  }

  function startApothemDrawing(shapeGroup) {
    if (!shapeGroup || shapeGroup.dataset.shapeType !== 'regular-polygon') return;
    const points = getVertexCoords(shapeGroup);
    const n = points.length;
    const cx = points.reduce((s, p) => s + p[0], 0) / n;
    const cy = points.reduce((s, p) => s + p[1], 0) / n;
    const tempLine = document.createElementNS(SVG_NS, 'line');
    tempLine.setAttribute('x1', cx);
    tempLine.setAttribute('y1', cy);
    tempLine.setAttribute('x2', cx);
    tempLine.setAttribute('y2', cy);
    tempLine.setAttribute('stroke', '#666');
    tempLine.setAttribute('stroke-width', '2');
    tempLine.setAttribute('stroke-dasharray', '8,4');
    tempLine.setAttribute('class', 'apothem-temp');
    workspace.appendChild(tempLine);
    apothemDrawingMode = { shapeGroup: shapeGroup, tempLine: tempLine, n: n };
    function updateApothemTemp(ev) {
      if (!apothemDrawingMode || !apothemDrawingMode.tempLine) return;
      const [mx, my] = getWorkspacePoint(ev);
      apothemDrawingMode.tempLine.setAttribute('x2', mx);
      apothemDrawingMode.tempLine.setAttribute('y2', my);
    }
    function finishApothem(ev) {
      if (!apothemDrawingMode) return;
      if (apothemDrawingMode.tempLine) {
        apothemDrawingMode.tempLine.remove();
        apothemDrawingMode.tempLine = null;
      }
      if (ev.target.closest('#context-menu') || ev.target.closest('.vertex-label-editor')) return;
      const shapeGroup = apothemDrawingMode.shapeGroup;
      const [px, py] = getWorkspacePoint(ev);
      let edgeIndex = null;
      if (ev.target.classList.contains('shape-edge') && ev.target.closest('.shape-group') === shapeGroup) {
        edgeIndex = parseInt(ev.target.getAttribute('data-edge-index'), 10);
      }
      if (edgeIndex == null || isNaN(edgeIndex)) edgeIndex = getClosestEdgeIndex(shapeGroup, px, py);
      if (edgeIndex == null || edgeIndex < 0 || edgeIndex >= apothemDrawingMode.n) {
        apothemDrawingMode = null;
        document.removeEventListener('mousemove', updateApothemTemp);
        document.removeEventListener('click', finishApothem, true);
        document.removeEventListener('keydown', cancelApothem);
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      const shapeGroupForApothem = apothemDrawingMode.shapeGroup;
      const pts = getVertexCoords(shapeGroupForApothem);
      const centerX = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const centerY = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      let apothemLinesGroup = shapeGroupForApothem.querySelector('.apothem-lines');
      if (!apothemLinesGroup) {
        apothemLinesGroup = document.createElementNS(SVG_NS, 'g');
        apothemLinesGroup.setAttribute('class', 'apothem-lines');
        const altLabels = shapeGroupForApothem.querySelector('.altitude-labels');
        shapeGroupForApothem.insertBefore(apothemLinesGroup, altLabels);
      }
      const existing = shapeGroupForApothem.querySelector('.apothem-line[data-edge-index="' + edgeIndex + '"]');
      if (existing) {
        apothemDrawingMode = null;
        document.removeEventListener('mousemove', updateApothemTemp);
        document.removeEventListener('click', finishApothem, true);
        document.removeEventListener('keydown', cancelApothem);
        return;
      }
      pushUndo();
      const midX = (pts[edgeIndex][0] + pts[(edgeIndex + 1) % pts.length][0]) / 2;
      const midY = (pts[edgeIndex][1] + pts[(edgeIndex + 1) % pts.length][1]) / 2;
      const apothemLine = document.createElementNS(SVG_NS, 'line');
      apothemLine.setAttribute('class', 'apothem-line');
      apothemLine.setAttribute('data-edge-index', String(edgeIndex));
      apothemLine.setAttribute('x1', centerX);
      apothemLine.setAttribute('y1', centerY);
      apothemLine.setAttribute('x2', midX);
      apothemLine.setAttribute('y2', midY);
      apothemLine.setAttribute('stroke', '#333');
      apothemLine.setAttribute('data-stroke', '#333');
      apothemLine.setAttribute('stroke-width', '2');
      apothemLine.setAttribute('data-stroke-width', '2');
      apothemLine.setAttribute('stroke-dasharray', '8,4');
      apothemLine.setAttribute('data-stroke-dasharray', '8,4');
      apothemLine.setAttribute('pointer-events', 'stroke');
      apothemLinesGroup.appendChild(apothemLine);
      apothemDrawingMode = null;
      document.removeEventListener('mousemove', updateApothemTemp);
      document.removeEventListener('click', finishApothem, true);
      document.removeEventListener('keydown', cancelApothem);
    }
    function cancelApothem(ev) {
      if (!apothemDrawingMode) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        if (apothemDrawingMode.tempLine) {
          apothemDrawingMode.tempLine.remove();
          apothemDrawingMode.tempLine = null;
        }
        apothemDrawingMode = null;
        document.removeEventListener('mousemove', updateApothemTemp);
        document.removeEventListener('click', finishApothem, true);
        document.removeEventListener('keydown', cancelApothem);
      }
    }
    document.addEventListener('mousemove', updateApothemTemp);
    document.addEventListener('click', finishApothem, true);
    document.addEventListener('keydown', cancelApothem);
  }

  function addCenterLineToVertex(shapeGroup, vertexIndex) {
    if (!shapeGroup || shapeGroup.dataset.shapeType !== 'regular-polygon') return false;
    const points = getVertexCoords(shapeGroup);
    const n = points.length;
    if (vertexIndex < 0 || vertexIndex >= n) return false;
    let centerLinesGroup = shapeGroup.querySelector('.center-lines');
    if (!centerLinesGroup) {
      centerLinesGroup = document.createElementNS(SVG_NS, 'g');
      centerLinesGroup.setAttribute('class', 'center-lines');
      const centerEl = shapeGroup.querySelector('.shape-center');
      shapeGroup.insertBefore(centerLinesGroup, centerEl ? centerEl.nextSibling : null);
    }
    if (shapeGroup.querySelector('.center-line[data-vertex-index="' + vertexIndex + '"]')) return false;
    const cx = points.reduce((s, p) => s + p[0], 0) / n;
    const cy = points.reduce((s, p) => s + p[1], 0) / n;
    const vx = points[vertexIndex][0];
    const vy = points[vertexIndex][1];
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'center-line');
    line.setAttribute('data-vertex-index', String(vertexIndex));
    line.setAttribute('x1', cx);
    line.setAttribute('y1', cy);
    line.setAttribute('x2', vx);
    line.setAttribute('y2', vy);
    line.setAttribute('stroke', '#333');
    line.setAttribute('data-stroke', '#333');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('data-stroke-width', '2');
    line.setAttribute('stroke-dasharray', '8,4');
    line.setAttribute('data-stroke-dasharray', '8,4');
    line.style.strokeDasharray = '8,4';
    line.setAttribute('pointer-events', 'stroke');
    centerLinesGroup.appendChild(line);
    return true;
  }

  function startCenterConnectToVertex(shapeGroup) {
    if (!shapeGroup || shapeGroup.dataset.shapeType !== 'regular-polygon') return;
    const points = getVertexCoords(shapeGroup);
    const n = points.length;
    const cx = points.reduce((s, p) => s + p[0], 0) / n;
    const cy = points.reduce((s, p) => s + p[1], 0) / n;
    const tempLine = document.createElementNS(SVG_NS, 'line');
    tempLine.setAttribute('x1', cx);
    tempLine.setAttribute('y1', cy);
    tempLine.setAttribute('x2', cx);
    tempLine.setAttribute('y2', cy);
    tempLine.setAttribute('stroke', '#666');
    tempLine.setAttribute('stroke-width', '2');
    tempLine.setAttribute('stroke-dasharray', '8,4');
    tempLine.setAttribute('class', 'center-connect-temp');
    workspace.appendChild(tempLine);
    centerConnectDrawingMode = { shapeGroup: shapeGroup, tempLine: tempLine, n: n };
    function updateTemp(ev) {
      if (!centerConnectDrawingMode || !centerConnectDrawingMode.tempLine) return;
      const [mx, my] = getWorkspacePoint(ev);
      centerConnectDrawingMode.tempLine.setAttribute('x2', mx);
      centerConnectDrawingMode.tempLine.setAttribute('y2', my);
    }
    function finish(ev) {
      if (!centerConnectDrawingMode) return;
      if (centerConnectDrawingMode.tempLine) {
        centerConnectDrawingMode.tempLine.remove();
        centerConnectDrawingMode.tempLine = null;
      }
      if (ev.target.closest('#context-menu') || ev.target.closest('.vertex-label-editor')) return;
      const g = centerConnectDrawingMode.shapeGroup;
      let vertexIndex = null;
      if (ev.target.closest('.shape-group') === g) {
        if (ev.target.classList.contains('vertex')) {
          vertexIndex = parseInt(ev.target.getAttribute('data-index'), 10);
        } else if (ev.target.classList.contains('vertex-label')) {
          vertexIndex = parseInt(ev.target.getAttribute('data-vertex-index'), 10);
        }
      }
      if (vertexIndex == null || isNaN(vertexIndex)) {
        const [px, py] = getWorkspacePoint(ev);
        vertexIndex = getClosestVertexIndex(g, px, py);
      }
      if (vertexIndex != null && !isNaN(vertexIndex) && vertexIndex >= 0 && vertexIndex < centerConnectDrawingMode.n) {
        ev.preventDefault();
        ev.stopPropagation();
        pushUndo();
        addCenterLineToVertex(g, vertexIndex);
      }
      centerConnectDrawingMode = null;
      document.removeEventListener('mousemove', updateTemp);
      document.removeEventListener('click', finish, true);
      document.removeEventListener('keydown', cancel);
    }
    function cancel(ev) {
      if (!centerConnectDrawingMode) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        if (centerConnectDrawingMode.tempLine) {
          centerConnectDrawingMode.tempLine.remove();
          centerConnectDrawingMode.tempLine = null;
        }
        centerConnectDrawingMode = null;
        document.removeEventListener('mousemove', updateTemp);
        document.removeEventListener('click', finish, true);
        document.removeEventListener('keydown', cancel);
      }
    }
    document.addEventListener('mousemove', updateTemp);
    document.addEventListener('click', finish, true);
    document.addEventListener('keydown', cancel);
  }

  function connectCenterToAllVertices(shapeGroup) {
    if (!shapeGroup || shapeGroup.dataset.shapeType !== 'regular-polygon') return;
    const points = getVertexCoords(shapeGroup);
    const n = points.length;
    pushUndo();
    for (let i = 0; i < n; i++) addCenterLineToVertex(shapeGroup, i);
  }

  function showCircleLineContextMenu(shapeGroup, line, clientX, clientY) {
    const strokeWidth = line.getAttribute('data-stroke-width') || line.getAttribute('stroke-width') || '2';
    const stroke = line.getAttribute('data-stroke') || line.getAttribute('stroke') || '#000000';
    const titleText = line.classList.contains('circle-radius-line') ? 'Radius' : 'Diameter';
    showContextMenuAt(clientX, clientY, function (menu) {
      const title = document.createElement('div');
      title.className = 'context-menu-title';
      title.textContent = titleText;
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
      function applyWidth(val) {
        currentW = val;
        widthDisplay.textContent = currentW;
        line.setAttribute('stroke-width', String(val));
        line.setAttribute('data-stroke-width', String(val));
        var da = (line.getAttribute('data-stroke-dasharray') || '').trim();
        if (da.indexOf('0,') === 0 || da.indexOf('0 ,') === 0) {
          var gap = Math.max(Math.round(val * 2.2), 4);
          line.setAttribute('stroke-dasharray', '0, ' + gap);
          line.setAttribute('data-stroke-dasharray', '0, ' + gap);
        }
        btnMinus.disabled = currentW <= minW;
        btnPlus.disabled = currentW >= maxW;
      }
      btnMinus.addEventListener('click', function () { if (currentW > minW) applyWidth(currentW - 1); });
      btnPlus.addEventListener('click', function () { if (currentW < maxW) applyWidth(currentW + 1); });
      applyWidth(currentW);
      rowWidth.appendChild(btnMinus);
      rowWidth.appendChild(widthDisplay);
      rowWidth.appendChild(btnPlus);
      menu.appendChild(rowWidth);
      const rowStyle = document.createElement('div');
      rowStyle.className = 'context-menu-row';
      rowStyle.innerHTML = '<label>Line style</label>';
      const dasharray = (line.getAttribute('data-stroke-dasharray') || line.getAttribute('stroke-dasharray') || '').trim();
      const isDotted = (dasharray.indexOf('0,') === 0 || dasharray.indexOf('0 ,') === 0);
      const isDashed = !isDotted && (dasharray === '8,4' || (dasharray.indexOf(',') !== -1 && dasharray !== ''));
      const isSolid = !dasharray || dasharray === 'none' || (!isDashed && !isDotted);
      function setStyle(dasharrayValue) {
        if (dasharrayValue === 'dotted') {
          var gap = Math.max(Math.round(currentW * 2.2), 4);
          var dottedVal = '0, ' + gap;
          line.setAttribute('stroke-linecap', 'round');
          line.setAttribute('stroke-dasharray', dottedVal);
          line.setAttribute('data-stroke-linecap', 'round');
          line.setAttribute('data-stroke-dasharray', dottedVal);
        } else {
          line.setAttribute('stroke-linecap', 'butt');
          line.setAttribute('data-stroke-linecap', 'butt');
          line.setAttribute('stroke-dasharray', dasharrayValue || '');
          line.setAttribute('data-stroke-dasharray', dasharrayValue || '');
        }
      }
      const btnSolid = document.createElement('button');
      btnSolid.type = 'button';
      btnSolid.className = 'context-menu-style-btn' + (isSolid ? ' context-menu-style-active' : '');
      btnSolid.textContent = 'Solid';
      btnSolid.addEventListener('click', function () { setStyle(''); });
      const btnDashed = document.createElement('button');
      btnDashed.type = 'button';
      btnDashed.className = 'context-menu-style-btn' + (isDashed ? ' context-menu-style-active' : '');
      btnDashed.textContent = 'Dashed';
      btnDashed.addEventListener('click', function () { setStyle('8,4'); });
      const btnDotted = document.createElement('button');
      btnDotted.type = 'button';
      btnDotted.className = 'context-menu-style-btn' + (isDotted ? ' context-menu-style-active' : '');
      btnDotted.textContent = 'Dotted';
      btnDotted.addEventListener('click', function () { setStyle('dotted'); });
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

  function createShape(shapeType, x, y, polygonSides) {
    let points = shapes[shapeType];
    const sides = (shapeType === 'regular-polygon' && polygonSides != null)
      ? Math.max(MIN_REGULAR_POLYGON_SIDES, Math.min(MAX_REGULAR_POLYGON_SIDES, polygonSides))
      : DEFAULT_REGULAR_POLYGON_SIDES;
    if (shapeType === 'regular-polygon') points = regularPolygonPoints(sides);
    if (!points) return null;
    const coords = pointsToPolygon(points, x, y);
    const id = 'shape-' + ++shapeIdCounter;
    const g = document.createElementNS(SVG_NS, 'g');
    g.id = id;
    g.classList.add('shape-group');
    g.dataset.shapeId = id;
    g.dataset.shapeType = shapeType;
    if (shapeType === 'regular-polygon') g.dataset.sides = String(sides);

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
      circle.setAttribute('r', isCircle ? 5 : 3);
      circle.setAttribute('cx', p[0]);
      circle.setAttribute('cy', p[1]);
      circle.setAttribute('data-index', i);
      circle.setAttribute('pointer-events', 'all');
      g.appendChild(circle);
    });

    if (shapeType === 'regular-polygon') {
      const cx = coords.reduce((s, p) => s + p[0], 0) / n;
      const cy = coords.reduce((s, p) => s + p[1], 0) / n;
      const centerCircle = document.createElementNS(SVG_NS, 'circle');
      centerCircle.setAttribute('class', 'shape-center');
      centerCircle.setAttribute('cx', cx);
      centerCircle.setAttribute('cy', cy);
      centerCircle.setAttribute('r', 2);
      centerCircle.setAttribute('data-size', '2');
      centerCircle.setAttribute('pointer-events', 'all');
      g.appendChild(centerCircle);
    }

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

    if (isCircle) {
      const circleLinesGroup = document.createElementNS(SVG_NS, 'g');
      circleLinesGroup.setAttribute('class', 'circle-lines');
      g.insertBefore(circleLinesGroup, g.querySelector('.vertex-labels'));
    }

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
    if (isCircle) enableCircleLineLabelDrag(g);
    if (shapeType === 'regular-polygon') {
      enableChordLabelDrag(g);
      enableApothemLabelDrag(g);
      enableCenterLineLabelDrag(g);
    }
    enableAltitudeLabelDrag(g);
    enableShapeDragToTrash(g);
    g.addEventListener('dblclick', function (ev) {
      if (ev.target.classList.contains('circle-radius-line') || ev.target.classList.contains('circle-diameter-line')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) {
          clearTimeout(contextMenuTimeout);
          contextMenuTimeout = null;
        }
        openCircleLineLabelEditor(g, ev.target);
        return;
      }
      if (ev.target.classList.contains('circle-line-label')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) {
          clearTimeout(contextMenuTimeout);
          contextMenuTimeout = null;
        }
        const type = ev.target.getAttribute('data-type');
        const idx = type === 'radius' ? ev.target.getAttribute('data-radius-index') : ev.target.getAttribute('data-diameter-index');
        const line = type === 'radius'
          ? g.querySelector('.circle-radius-line[data-radius-index="' + idx + '"]')
          : g.querySelector('.circle-diameter-line[data-diameter-index="' + idx + '"]');
        if (line) openCircleLineLabelEditor(g, line);
        return;
      }
      if (ev.target.classList.contains('chord-line')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) { clearTimeout(contextMenuTimeout); contextMenuTimeout = null; }
        openChordLabelEditor(g, ev.target);
        return;
      }
      if (ev.target.classList.contains('chord-label')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) { clearTimeout(contextMenuTimeout); contextMenuTimeout = null; }
        const va = ev.target.getAttribute('data-vertex-a');
        const vb = ev.target.getAttribute('data-vertex-b');
        const chordLine = g.querySelector('.chord-line[data-vertex-a="' + va + '"][data-vertex-b="' + vb + '"]');
        if (chordLine) {
          const x = parseFloat(ev.target.getAttribute('x'));
          const y = parseFloat(ev.target.getAttribute('y'));
          openChordLabelEditor(g, chordLine, x, y - 18);
        }
        return;
      }
      if (ev.target.classList.contains('apothem-line')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) { clearTimeout(contextMenuTimeout); contextMenuTimeout = null; }
        openApothemLabelEditor(g, ev.target);
        return;
      }
      if (ev.target.classList.contains('apothem-label')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) { clearTimeout(contextMenuTimeout); contextMenuTimeout = null; }
        const edgeIndex = ev.target.getAttribute('data-edge-index');
        const apothemLine = g.querySelector('.apothem-line[data-edge-index="' + edgeIndex + '"]');
        if (apothemLine) {
          const x = parseFloat(ev.target.getAttribute('x'));
          const y = parseFloat(ev.target.getAttribute('y'));
          openApothemLabelEditor(g, apothemLine, x, y - 18);
        }
        return;
      }
      if (ev.target.classList.contains('center-line')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) { clearTimeout(contextMenuTimeout); contextMenuTimeout = null; }
        openCenterLineLabelEditor(g, ev.target);
        return;
      }
      if (ev.target.classList.contains('center-line-label')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) { clearTimeout(contextMenuTimeout); contextMenuTimeout = null; }
        const vertexIndex = ev.target.getAttribute('data-vertex-index');
        const centerLine = g.querySelector('.center-line[data-vertex-index="' + vertexIndex + '"]');
        if (centerLine) {
          const x = parseFloat(ev.target.getAttribute('x'));
          const y = parseFloat(ev.target.getAttribute('y'));
          openCenterLineLabelEditor(g, centerLine, x, y - 18);
        }
        return;
      }
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
      updateCircleLines(g);
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
    if (g.dataset.shapeType === 'regular-polygon') {
      const centerEl = g.querySelector('.shape-center');
      if (centerEl) {
        const cx = points.reduce((s, p) => s + p[0], 0) / n;
        const cy = points.reduce((s, p) => s + p[1], 0) / n;
        centerEl.setAttribute('cx', cx);
        centerEl.setAttribute('cy', cy);
      }
      updateChords(g);
      updateApothems(g);
      updateCenterLines(g);
    }
    updateRightAngleMarks(g);
  }

  function updateCenterLines(g) {
    const points = getVertexCoords(g);
    const n = points.length;
    const cx = points.reduce((s, p) => s + p[0], 0) / n;
    const cy = points.reduce((s, p) => s + p[1], 0) / n;
    g.querySelectorAll('.center-line').forEach(function (line) {
      const vi = parseInt(line.getAttribute('data-vertex-index'), 10);
      if (isNaN(vi) || vi < 0 || vi >= n) return;
      line.setAttribute('x1', cx);
      line.setAttribute('y1', cy);
      line.setAttribute('x2', points[vi][0]);
      line.setAttribute('y2', points[vi][1]);
    });
    updateCenterLineLabelPositions(g);
  }

  function setRegularPolygonSides(g, newN) {
    if (g.dataset.shapeType !== 'regular-polygon') return;
    newN = Math.max(MIN_REGULAR_POLYGON_SIDES, Math.min(MAX_REGULAR_POLYGON_SIDES, newN));
    const circles = g.querySelectorAll('.vertex');
    const nOld = circles.length;
    if (nOld === 0) return;
    const cx = Array.from(circles).reduce((s, c) => s + parseFloat(c.getAttribute('cx')), 0) / nOld;
    const cy = Array.from(circles).reduce((s, c) => s + parseFloat(c.getAttribute('cy')), 0) / nOld;
    pushUndo();
    g.querySelectorAll('.chord-line').forEach(function (el) { el.remove(); });
    g.querySelectorAll('.chord-label').forEach(function (el) { el.remove(); });
    g.querySelectorAll('.apothem-line').forEach(function (el) { el.remove(); });
    g.querySelectorAll('.apothem-label').forEach(function (el) { el.remove(); });
    g.querySelectorAll('.altitude-line').forEach(function (el) { el.remove(); });
    g.querySelectorAll('.altitude-label').forEach(function (el) { el.remove(); });
    g.querySelectorAll('.center-line').forEach(function (el) { el.remove(); });
    g.querySelectorAll('.center-line-label').forEach(function (el) { el.remove(); });
    const centerLinesGroup = g.querySelector('.center-lines');
    if (centerLinesGroup) centerLinesGroup.remove();
    const centerLineLabelsGroup = g.querySelector('.center-line-labels');
    if (centerLineLabelsGroup) centerLineLabelsGroup.remove();
    g.querySelectorAll('.right-angle-mark').forEach(function (el) { el.remove(); });
    const points = regularPolygonPoints(newN);
    const coords = pointsToPolygon(points, cx, cy);
    const polygon = g.querySelector('.shape-body');
    polygon.setAttribute('points', coords.map(p => p.join(',')).join(' '));
    const edgesGroup = g.querySelector('.shape-edges');
    edgesGroup.innerHTML = '';
    for (let i = 0; i < newN; i++) {
      const j = (i + 1) % newN;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'shape-edge');
      line.setAttribute('data-edge-index', String(i));
      line.setAttribute('x1', coords[i][0]);
      line.setAttribute('y1', coords[i][1]);
      line.setAttribute('x2', coords[j][0]);
      line.setAttribute('y2', coords[j][1]);
      line.setAttribute('stroke', '#000');
      line.setAttribute('stroke-width', '2');
      edgesGroup.appendChild(line);
    }
    g.querySelectorAll('.vertex').forEach(function (el) { el.remove(); });
    const centerCircleRef = g.querySelector('.shape-center');
    for (let i = 0; i < newN; i++) {
      const p = coords[i];
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.classList.add('vertex');
      circle.setAttribute('r', 3);
      circle.setAttribute('cx', p[0]);
      circle.setAttribute('cy', p[1]);
      circle.setAttribute('data-index', String(i));
      circle.setAttribute('pointer-events', 'all');
      g.insertBefore(circle, centerCircleRef);
    }
    const centerCircle = g.querySelector('.shape-center');
    if (centerCircle) {
      const cxNew = coords.reduce((s, p) => s + p[0], 0) / newN;
      const cyNew = coords.reduce((s, p) => s + p[1], 0) / newN;
      centerCircle.setAttribute('cx', cxNew);
      centerCircle.setAttribute('cy', cyNew);
    }
    const vertexLabelsGroup = g.querySelector('.vertex-labels');
    vertexLabelsGroup.innerHTML = '';
    coords.forEach(function (p, i) {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('class', 'vertex-label');
      text.setAttribute('data-vertex-index', String(i));
      text.setAttribute('x', p[0] + 8);
      text.setAttribute('y', p[1] - 8);
      text.setAttribute('text-anchor', 'start');
      text.setAttribute('dominant-baseline', 'auto');
      text.setAttribute('pointer-events', 'all');
      vertexLabelsGroup.appendChild(text);
    });
    const edgeLabelsGroup = g.querySelector('.edge-labels');
    edgeLabelsGroup.innerHTML = '';
    const cxNew = coords.reduce((s, p) => s + p[0], 0) / newN;
    const cyNew = coords.reduce((s, p) => s + p[1], 0) / newN;
    for (let i = 0; i < newN; i++) {
      const j = (i + 1) % newN;
      const mx = (coords[i][0] + coords[j][0]) / 2;
      const my = (coords[i][1] + coords[j][1]) / 2;
      const outX = mx - cxNew;
      const outY = my - cyNew;
      const len = Math.hypot(outX, outY) || 1;
      const dx = (outX / len) * EDGE_LABEL_OFFSET_DISTANCE;
      const dy = (outY / len) * EDGE_LABEL_OFFSET_DISTANCE;
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('class', 'edge-label');
      text.setAttribute('data-edge-index', String(i));
      text.setAttribute('data-offset-dx', String(dx));
      text.setAttribute('data-offset-dy', String(dy));
      text.setAttribute('x', mx + dx);
      text.setAttribute('y', my + dy);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      edgeLabelsGroup.appendChild(text);
    }
    g.dataset.sides = String(newN);
  }

  function updateApothems(g) {
    const circles = g.querySelectorAll('.vertex');
    const points = Array.from(circles).map(c => [
      parseFloat(c.getAttribute('cx')),
      parseFloat(c.getAttribute('cy'))
    ]);
    const n = points.length;
    const cx = points.reduce((s, p) => s + p[0], 0) / n;
    const cy = points.reduce((s, p) => s + p[1], 0) / n;
    g.querySelectorAll('.apothem-line').forEach(function (line) {
      const edgeIndex = parseInt(line.getAttribute('data-edge-index'), 10);
      if (isNaN(edgeIndex) || edgeIndex < 0 || edgeIndex >= n) return;
      const midX = (points[edgeIndex][0] + points[(edgeIndex + 1) % n][0]) / 2;
      const midY = (points[edgeIndex][1] + points[(edgeIndex + 1) % n][1]) / 2;
      line.setAttribute('x1', cx);
      line.setAttribute('y1', cy);
      line.setAttribute('x2', midX);
      line.setAttribute('y2', midY);
    });
    updateApothemLabelPositions(g);
  }

  function updateChords(g) {
    const circles = g.querySelectorAll('.vertex');
    const points = Array.from(circles).map(c => [
      parseFloat(c.getAttribute('cx')),
      parseFloat(c.getAttribute('cy'))
    ]);
    const n = points.length;
    g.querySelectorAll('.chord-line').forEach(function (line) {
      const a = parseInt(line.getAttribute('data-vertex-a'), 10);
      const b = parseInt(line.getAttribute('data-vertex-b'), 10);
      if (isNaN(a) || isNaN(b) || a < 0 || a >= n || b < 0 || b >= n) return;
      line.setAttribute('x1', points[a][0]);
      line.setAttribute('y1', points[a][1]);
      line.setAttribute('x2', points[b][0]);
      line.setAttribute('y2', points[b][1]);
    });
    g.querySelectorAll('.chord-label').forEach(function (label) {
      const a = parseInt(label.getAttribute('data-vertex-a'), 10);
      const b = parseInt(label.getAttribute('data-vertex-b'), 10);
      if (isNaN(a) || isNaN(b) || a < 0 || a >= n || b < 0 || b >= n) return;
      const mx = (points[a][0] + points[b][0]) / 2;
      const my = (points[a][1] + points[b][1]) / 2;
      const dx = label.hasAttribute('data-offset-dx') ? parseFloat(label.getAttribute('data-offset-dx')) : 0;
      const dy = label.hasAttribute('data-offset-dy') ? parseFloat(label.getAttribute('data-offset-dy')) : 0;
      label.setAttribute('x', mx + dx);
      label.setAttribute('y', my + dy);
    });
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
    updateAltitudeRightAngleMarks(g);
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

  function getCircleCenterAndRadius(g) {
    const points = getVertexCoords(g);
    if (points.length < 2) return null;
    const cx = points[0][0];
    const cy = points[0][1];
    const r = Math.hypot(points[1][0] - cx, points[1][1] - cy) || 1;
    return { cx: cx, cy: cy, r: r };
  }

  let pendingCircleLine = null;

  function addCircleRadius(g) {
    const geom = getCircleCenterAndRadius(g);
    if (!geom) return;
    let group = g.querySelector('.circle-lines');
    if (!group) {
      group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', 'circle-lines');
      g.insertBefore(group, g.querySelector('.vertex-labels'));
    }
    const count = g.querySelectorAll('.circle-radius-line').length;
    const angle = 0.5 + count * 0.7;
    const x2 = geom.cx + geom.r * Math.cos(angle);
    const y2 = geom.cy + geom.r * Math.sin(angle);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'circle-radius-line');
    line.setAttribute('data-type', 'radius');
    line.setAttribute('data-radius-index', String(count));
    line.setAttribute('data-angle', String(angle));
    line.setAttribute('x1', geom.cx);
    line.setAttribute('y1', geom.cy);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#000');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('pointer-events', 'stroke');
    group.appendChild(line);
  }

  function addCircleDiameter(g) {
    const geom = getCircleCenterAndRadius(g);
    if (!geom) return;
    let group = g.querySelector('.circle-lines');
    if (!group) {
      group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', 'circle-lines');
      g.insertBefore(group, g.querySelector('.vertex-labels'));
    }
    const count = g.querySelectorAll('.circle-diameter-line').length;
    const angle = count * 0.6;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x1 = geom.cx - geom.r * cos;
    const y1 = geom.cy - geom.r * sin;
    const x2 = geom.cx + geom.r * cos;
    const y2 = geom.cy + geom.r * sin;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'circle-diameter-line');
    line.setAttribute('data-type', 'diameter');
    line.setAttribute('data-diameter-index', String(count));
    line.setAttribute('data-angle', String(angle));
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#000');
    line.setAttribute('data-stroke', '#000');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('data-stroke-width', '2');
    line.setAttribute('pointer-events', 'stroke');
    group.appendChild(line);
  }

  function removeCircleRadius(g) {
    const lines = g.querySelectorAll('.circle-radius-line');
    if (lines.length === 0) return;
    lines[lines.length - 1].remove();
  }

  function removeCircleDiameter(g) {
    const lines = g.querySelectorAll('.circle-diameter-line');
    if (lines.length === 0) return;
    lines[lines.length - 1].remove();
  }

  function updateCircleLines(g) {
    const geom = getCircleCenterAndRadius(g);
    if (!geom) return;
    const { cx, cy, r } = geom;
    g.querySelectorAll('.circle-radius-line').forEach(function (line) {
      const angle = parseFloat(line.getAttribute('data-angle')) || 0;
      line.setAttribute('x1', cx);
      line.setAttribute('y1', cy);
      line.setAttribute('x2', cx + r * Math.cos(angle));
      line.setAttribute('y2', cy + r * Math.sin(angle));
    });
    g.querySelectorAll('.circle-diameter-line').forEach(function (line) {
      const angle = parseFloat(line.getAttribute('data-angle')) || 0;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      line.setAttribute('x1', cx - r * cos);
      line.setAttribute('y1', cy - r * sin);
      line.setAttribute('x2', cx + r * cos);
      line.setAttribute('y2', cy + r * sin);
    });
    updateCircleLineLabelPositions(g);
  }

  function getCircleLineMidpoint(lineEl) {
    const x1 = parseFloat(lineEl.getAttribute('x1'));
    const y1 = parseFloat(lineEl.getAttribute('y1'));
    const x2 = parseFloat(lineEl.getAttribute('x2'));
    const y2 = parseFloat(lineEl.getAttribute('y2'));
    return { mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
  }

  function updateCircleLineLabelPositions(g) {
    g.querySelectorAll('.circle-radius-line').forEach(function (line) {
      const idx = line.getAttribute('data-radius-index');
      const label = g.querySelector('.circle-line-label[data-type="radius"][data-radius-index="' + idx + '"]');
      if (!label) return;
      const mid = getCircleLineMidpoint(line);
      const dx = label.hasAttribute('data-offset-dx') ? parseFloat(label.getAttribute('data-offset-dx')) : 0;
      const dy = label.hasAttribute('data-offset-dy') ? parseFloat(label.getAttribute('data-offset-dy')) : 0;
      label.setAttribute('x', mid.mx + dx);
      label.setAttribute('y', mid.my + dy);
    });
    g.querySelectorAll('.circle-diameter-line').forEach(function (line) {
      const idx = line.getAttribute('data-diameter-index');
      const label = g.querySelector('.circle-line-label[data-type="diameter"][data-diameter-index="' + idx + '"]');
      if (!label) return;
      const mid = getCircleLineMidpoint(line);
      const dx = label.hasAttribute('data-offset-dx') ? parseFloat(label.getAttribute('data-offset-dx')) : 0;
      const dy = label.hasAttribute('data-offset-dy') ? parseFloat(label.getAttribute('data-offset-dy')) : 0;
      label.setAttribute('x', mid.mx + dx);
      label.setAttribute('y', mid.my + dy);
    });
  }

  function getOrCreateCircleLineLabel(g, lineEl) {
    const isRadius = lineEl.classList.contains('circle-radius-line');
    const idx = isRadius ? lineEl.getAttribute('data-radius-index') : lineEl.getAttribute('data-diameter-index');
    const type = isRadius ? 'radius' : 'diameter';
    const attr = isRadius ? 'data-radius-index' : 'data-diameter-index';
    let labelsGroup = g.querySelector('.circle-line-labels');
    if (!labelsGroup) {
      labelsGroup = document.createElementNS(SVG_NS, 'g');
      labelsGroup.setAttribute('class', 'circle-line-labels');
      g.appendChild(labelsGroup);
    }
    let label = g.querySelector('.circle-line-label[data-type="' + type + '"][' + attr + '="' + idx + '"]');
    if (!label) {
      const mid = getCircleLineMidpoint(lineEl);
      label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'circle-line-label edge-label');
      label.setAttribute('data-type', type);
      label.setAttribute(attr, idx);
      label.setAttribute('x', mid.mx);
      label.setAttribute('y', mid.my);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('pointer-events', 'all');
      label.setAttribute('data-offset-dx', '0');
      label.setAttribute('data-offset-dy', '0');
      labelsGroup.appendChild(label);
    }
    return label;
  }

  function openCircleLineLabelEditor(shapeGroup, lineEl, editorX, editorY) {
    const textEl = getOrCreateCircleLineLabel(shapeGroup, lineEl);
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
        updateCircleLineLabelPositions(shapeGroup);
      }
      fo.remove();
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = currentLabel; input.blur(); }
    });
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

  function addRightAngleMarkAtAltitudeFoot(g, altLine) {
    const aid = altLine.getAttribute('data-altitude-id');
    if (!aid || g.querySelector('.right-angle-mark[data-altitude-id="' + aid + '"]')) return;
    const fx = parseFloat(altLine.getAttribute('x2'));
    const fy = parseFloat(altLine.getAttribute('y2'));
    const vx = parseFloat(altLine.getAttribute('x1'));
    const vy = parseFloat(altLine.getAttribute('y1'));
    const edgeIndex = parseInt(altLine.getAttribute('data-edge-index'), 10);
    const points = getVertexCoords(g);
    const n = points.length;
    if (isNaN(edgeIndex) || edgeIndex < 0 || edgeIndex >= n) return;
    const ax = points[edgeIndex][0];
    const ay = points[edgeIndex][1];
    const bx = points[(edgeIndex + 1) % n][0];
    const by = points[(edgeIndex + 1) % n][1];
    let ux = bx - ax;
    let uy = by - ay;
    const edgeLen = Math.hypot(ux, uy) || 1e-6;
    ux /= edgeLen;
    uy /= edgeLen;
    let wx = vx - fx;
    let wy = vy - fy;
    const altLen = Math.hypot(wx, wy) || 1e-6;
    wx /= altLen;
    wy /= altLen;
    const s = RIGHT_ANGLE_MARK_SIZE;
    const xA = fx + wx * s;
    const yA = fy + wy * s;
    const xB = fx + wx * s + ux * s;
    const yB = fy + wy * s + uy * s;
    const xC = fx + ux * s;
    const yC = fy + uy * s;
    const xD = fx + ux * s + wx * s;
    const yD = fy + uy * s + wy * s;
    const mark = document.createElementNS(SVG_NS, 'g');
    mark.setAttribute('class', 'right-angle-mark');
    mark.setAttribute('data-altitude-id', aid);
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

  function updateAltitudeRightAngleMarks(g) {
    const points = getVertexCoords(g);
    const n = points.length;
    g.querySelectorAll('.right-angle-mark[data-altitude-id]').forEach(function (mark) {
      const aid = mark.getAttribute('data-altitude-id');
      const altLine = g.querySelector('.altitude-line[data-altitude-id="' + aid + '"]');
      if (!altLine) { mark.remove(); return; }
      const fx = parseFloat(altLine.getAttribute('x2'));
      const fy = parseFloat(altLine.getAttribute('y2'));
      const vx = parseFloat(altLine.getAttribute('x1'));
      const vy = parseFloat(altLine.getAttribute('y1'));
      const edgeIndex = parseInt(altLine.getAttribute('data-edge-index'), 10);
      if (isNaN(edgeIndex) || edgeIndex < 0 || edgeIndex >= n) return;
      const ax = points[edgeIndex][0];
      const ay = points[edgeIndex][1];
      const bx = points[(edgeIndex + 1) % n][0];
      const by = points[(edgeIndex + 1) % n][1];
      let ux = bx - ax;
      let uy = by - ay;
      const edgeLen = Math.hypot(ux, uy) || 1e-6;
      ux /= edgeLen;
      uy /= edgeLen;
      let wx = vx - fx;
      let wy = vy - fy;
      const altLen = Math.hypot(wx, wy) || 1e-6;
      wx /= altLen;
      wy /= altLen;
      const s = RIGHT_ANGLE_MARK_SIZE;
      const xA = fx + wx * s;
      const yA = fy + wy * s;
      const xB = fx + wx * s + ux * s;
      const yB = fy + wy * s + uy * s;
      const xC = fx + ux * s;
      const yC = fy + uy * s;
      const xD = fx + ux * s + wx * s;
      const yD = fy + uy * s + wy * s;
      const path = mark.querySelector('.right-angle-mark-line');
      if (path) {
        path.setAttribute('d', 'M' + xA + ',' + yA + 'L' + xB + ',' + yB + 'M' + xC + ',' + yC + 'L' + xD + ',' + yD);
        const edgeLine = g.querySelector('.shape-edge');
        const edgeStrokeWidth = edgeLine ? (edgeLine.getAttribute('data-stroke-width') || edgeLine.getAttribute('stroke-width') || '2') : '2';
        path.setAttributeNS(SVG_NS, 'stroke-width', edgeStrokeWidth);
        path.style.setProperty('stroke-width', edgeStrokeWidth + 'px');
      }
    });
  }

  function updateRightAngleMarks(g) {
    const points = getVertexCoords(g);
    const n = points.length;
    const marks = Array.from(g.querySelectorAll('.right-angle-mark'));
    marks.forEach(function (mark) {
      if (mark.hasAttribute('data-altitude-id')) return;
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
        if (altitudeDrawingMode || chordDrawingMode || apothemDrawingMode || centerConnectDrawingMode) return;
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
        if (rotatingShape.g.dataset.shapeType === 'circle' && rotatingShape.startRadiusAngles) {
          const radiusLines = rotatingShape.g.querySelectorAll('.circle-radius-line');
          radiusLines.forEach(function (line, i) {
            line.setAttribute('data-angle', String((rotatingShape.startRadiusAngles[i] || 0) + delta));
          });
          const diameterLines = rotatingShape.g.querySelectorAll('.circle-diameter-line');
          diameterLines.forEach(function (line, i) {
            line.setAttribute('data-angle', String((rotatingShape.startDiameterAngles[i] || 0) + delta));
          });
        }
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
          const shapeGroup = pendingVertex.closest('.shape-group');
          if (shapeGroup.dataset.shapeType === 'regular-polygon' && !pendingVertexCtrl && !pendingVertexShift) {
            pendingVertex = null;
            startX = ev.clientX;
            startY = ev.clientY;
            return;
          }
          pushUndo();
          const startPoints = getVertexCoords(shapeGroup);
          if (pendingVertexCtrl) {
            const isCircle = shapeGroup.dataset.shapeType === 'circle';
            const centerX = isCircle && startPoints.length >= 2 ? startPoints[0][0] : startPoints.reduce((s, p) => s + p[0], 0) / startPoints.length;
            const centerY = isCircle && startPoints.length >= 2 ? startPoints[0][1] : startPoints.reduce((s, p) => s + p[1], 0) / startPoints.length;
            const [mx, my] = getWorkspacePoint(ev);
            const rot = {
              g: shapeGroup,
              centerX: centerX,
              centerY: centerY,
              startPoints: startPoints,
              startAngle: Math.atan2(my - centerY, mx - centerX),
              draggedIndex: parseInt(pendingVertex.getAttribute('data-index'), 10)
            };
            if (isCircle) {
              rot.startRadiusAngles = Array.from(shapeGroup.querySelectorAll('.circle-radius-line')).map(function (line) { return parseFloat(line.getAttribute('data-angle')) || 0; });
              rot.startDiameterAngles = Array.from(shapeGroup.querySelectorAll('.circle-diameter-line')).map(function (line) { return parseFloat(line.getAttribute('data-angle')) || 0; });
            }
            rotatingShape = rot;
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

  function getClosestVertexIndex(g, px, py) {
    const points = getVertexCoords(g);
    let bestDist = Infinity;
    let bestVertex = null;
    for (let i = 0; i < points.length; i++) {
      const d = Math.hypot(px - points[i][0], py - points[i][1]);
      if (d < bestDist) {
        bestDist = d;
        bestVertex = i;
      }
    }
    return bestDist < EDGE_HIT_THRESHOLD ? bestVertex : null;
  }

  function getClosestChord(g, px, py) {
    const chordLines = g.querySelectorAll('.chord-line');
    let bestDist = Infinity;
    let bestLine = null;
    chordLines.forEach(function (line) {
      const x1 = parseFloat(line.getAttribute('x1'));
      const y1 = parseFloat(line.getAttribute('y1'));
      const x2 = parseFloat(line.getAttribute('x2'));
      const y2 = parseFloat(line.getAttribute('y2'));
      const { dist, t } = distanceToSegment(px, py, x1, y1, x2, y2);
      if (dist < bestDist && t >= 0.05 && t <= 0.95) {
        bestDist = dist;
        bestLine = line;
      }
    });
    return bestDist < EDGE_HIT_THRESHOLD ? bestLine : null;
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

  function openChordLabelEditor(shapeGroup, chordLine, editorX, editorY) {
    const va = chordLine.getAttribute('data-vertex-a');
    const vb = chordLine.getAttribute('data-vertex-b');
    let textEl = shapeGroup.querySelector('.chord-label[data-vertex-a="' + va + '"][data-vertex-b="' + vb + '"]');
    if (!textEl) {
      const chordLabelsGroup = shapeGroup.querySelector('.chord-labels');
      if (!chordLabelsGroup) return;
      const x1 = parseFloat(chordLine.getAttribute('x1'));
      const y1 = parseFloat(chordLine.getAttribute('y1'));
      const x2 = parseFloat(chordLine.getAttribute('x2'));
      const y2 = parseFloat(chordLine.getAttribute('y2'));
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      textEl = document.createElementNS(SVG_NS, 'text');
      textEl.setAttribute('class', 'chord-label edge-label');
      textEl.setAttribute('data-vertex-a', va);
      textEl.setAttribute('data-vertex-b', vb);
      textEl.setAttribute('x', mx);
      textEl.setAttribute('y', my);
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('dominant-baseline', 'middle');
      textEl.setAttribute('data-offset-dx', '0');
      textEl.setAttribute('data-offset-dy', '0');
      textEl.setAttribute('pointer-events', 'all');
      chordLabelsGroup.appendChild(textEl);
    }
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
        if (shapeGroup.dataset.shapeType === 'regular-polygon') updateChords(shapeGroup);
      }
      fo.remove();
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = currentLabel; input.blur(); }
    });
  }

  function openApothemLabelEditor(shapeGroup, apothemLine, editorX, editorY) {
    const edgeIndex = apothemLine.getAttribute('data-edge-index');
    let textEl = shapeGroup.querySelector('.apothem-label[data-edge-index="' + edgeIndex + '"]');
    if (!textEl) {
      let apothemLabelsGroup = shapeGroup.querySelector('.apothem-labels');
      if (!apothemLabelsGroup) {
        apothemLabelsGroup = document.createElementNS(SVG_NS, 'g');
        apothemLabelsGroup.setAttribute('class', 'apothem-labels');
        const apothemLinesGroup = shapeGroup.querySelector('.apothem-lines');
        shapeGroup.insertBefore(apothemLabelsGroup, apothemLinesGroup ? apothemLinesGroup.nextSibling : null);
      }
      const x1 = parseFloat(apothemLine.getAttribute('x1'));
      const y1 = parseFloat(apothemLine.getAttribute('y1'));
      const x2 = parseFloat(apothemLine.getAttribute('x2'));
      const y2 = parseFloat(apothemLine.getAttribute('y2'));
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      textEl = document.createElementNS(SVG_NS, 'text');
      textEl.setAttribute('class', 'apothem-label edge-label');
      textEl.setAttribute('data-edge-index', edgeIndex);
      textEl.setAttribute('x', mx);
      textEl.setAttribute('y', my);
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('dominant-baseline', 'middle');
      textEl.setAttribute('data-offset-dx', '0');
      textEl.setAttribute('data-offset-dy', '0');
      textEl.setAttribute('pointer-events', 'all');
      apothemLabelsGroup.appendChild(textEl);
    }
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
        updateApothemLabelPositions(shapeGroup);
      }
      fo.remove();
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = currentLabel; input.blur(); }
    });
  }

  function updateApothemLabelPositions(g) {
    g.querySelectorAll('.apothem-line').forEach(function (line) {
      const edgeIndex = line.getAttribute('data-edge-index');
      const x1 = parseFloat(line.getAttribute('x1'));
      const y1 = parseFloat(line.getAttribute('y1'));
      const x2 = parseFloat(line.getAttribute('x2'));
      const y2 = parseFloat(line.getAttribute('y2'));
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const labelEl = g.querySelector('.apothem-label[data-edge-index="' + edgeIndex + '"]');
      if (labelEl) {
        const dx = labelEl.hasAttribute('data-offset-dx') ? parseFloat(labelEl.getAttribute('data-offset-dx')) : 0;
        const dy = labelEl.hasAttribute('data-offset-dy') ? parseFloat(labelEl.getAttribute('data-offset-dy')) : 0;
        labelEl.setAttribute('x', mx + dx);
        labelEl.setAttribute('y', my + dy);
      }
    });
  }

  function openCenterLineLabelEditor(shapeGroup, centerLine, editorX, editorY) {
    const vertexIndex = centerLine.getAttribute('data-vertex-index');
    let textEl = shapeGroup.querySelector('.center-line-label[data-vertex-index="' + vertexIndex + '"]');
    if (!textEl) {
      let labelsGroup = shapeGroup.querySelector('.center-line-labels');
      if (!labelsGroup) {
        labelsGroup = document.createElementNS(SVG_NS, 'g');
        labelsGroup.setAttribute('class', 'center-line-labels');
        const centerLinesGroup = shapeGroup.querySelector('.center-lines');
        shapeGroup.insertBefore(labelsGroup, centerLinesGroup ? centerLinesGroup.nextSibling : null);
      }
      const x1 = parseFloat(centerLine.getAttribute('x1'));
      const y1 = parseFloat(centerLine.getAttribute('y1'));
      const x2 = parseFloat(centerLine.getAttribute('x2'));
      const y2 = parseFloat(centerLine.getAttribute('y2'));
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      textEl = document.createElementNS(SVG_NS, 'text');
      textEl.setAttribute('class', 'center-line-label edge-label');
      textEl.setAttribute('data-vertex-index', vertexIndex);
      textEl.setAttribute('x', mx);
      textEl.setAttribute('y', my);
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('dominant-baseline', 'middle');
      textEl.setAttribute('data-offset-dx', '0');
      textEl.setAttribute('data-offset-dy', '0');
      textEl.setAttribute('pointer-events', 'all');
      labelsGroup.appendChild(textEl);
    }
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
        updateCenterLineLabelPositions(shapeGroup);
      }
      fo.remove();
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = currentLabel; input.blur(); }
    });
  }

  function updateCenterLineLabelPositions(g) {
    g.querySelectorAll('.center-line').forEach(function (line) {
      const vertexIndex = line.getAttribute('data-vertex-index');
      const x1 = parseFloat(line.getAttribute('x1'));
      const y1 = parseFloat(line.getAttribute('y1'));
      const x2 = parseFloat(line.getAttribute('x2'));
      const y2 = parseFloat(line.getAttribute('y2'));
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const labelEl = g.querySelector('.center-line-label[data-vertex-index="' + vertexIndex + '"]');
      if (labelEl) {
        const dx = labelEl.hasAttribute('data-offset-dx') ? parseFloat(labelEl.getAttribute('data-offset-dx')) : 0;
        const dy = labelEl.hasAttribute('data-offset-dy') ? parseFloat(labelEl.getAttribute('data-offset-dy')) : 0;
        labelEl.setAttribute('x', mx + dx);
        labelEl.setAttribute('y', my + dy);
      }
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
    g.querySelectorAll('.shape-edge').forEach(function (line) {
      line.addEventListener('dblclick', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (contextMenuTimeout) {
          clearTimeout(contextMenuTimeout);
          contextMenuTimeout = null;
        }
        const edgeIndex = parseInt(this.getAttribute('data-edge-index'), 10);
        if (isNaN(edgeIndex)) return;
        const x1 = parseFloat(this.getAttribute('x1'));
        const y1 = parseFloat(this.getAttribute('y1'));
        const x2 = parseFloat(this.getAttribute('x2'));
        const y2 = parseFloat(this.getAttribute('y2'));
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        openEdgeLabelEditor(g, edgeIndex, mx, my - 18);
      });
    });
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

  function enableChordLabelDrag(g) {
    let draggingLabel = null;
    let pendingLabelDrag = null;
    let startX, startY, startTextX, startTextY;
    const DRAG_THRESHOLD = 3;

    g.addEventListener('mousedown', function (ev) {
      if (!ev.target.classList.contains('chord-label')) return;
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
        const va = draggingLabel.getAttribute('data-vertex-a');
        const vb = draggingLabel.getAttribute('data-vertex-b');
        const chordLine = shapeGroup ? shapeGroup.querySelector('.chord-line[data-vertex-a="' + va + '"][data-vertex-b="' + vb + '"]') : null;
        if (chordLine) {
          const x1 = parseFloat(chordLine.getAttribute('x1'));
          const y1 = parseFloat(chordLine.getAttribute('y1'));
          const x2 = parseFloat(chordLine.getAttribute('x2'));
          const y2 = parseFloat(chordLine.getAttribute('y2'));
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const tx = parseFloat(draggingLabel.getAttribute('x'));
          const ty = parseFloat(draggingLabel.getAttribute('y'));
          draggingLabel.setAttribute('data-offset-dx', String(tx - mx));
          draggingLabel.setAttribute('data-offset-dy', String(ty - my));
        }
      }
      draggingLabel = null;
      pendingLabelDrag = null;
    });
  }

  function enableApothemLabelDrag(g) {
    let draggingLabel = null;
    let pendingLabelDrag = null;
    let startX, startY, startTextX, startTextY;
    const DRAG_THRESHOLD = 3;

    g.addEventListener('mousedown', function (ev) {
      if (!ev.target.classList.contains('apothem-label')) return;
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
        const edgeIndex = draggingLabel.getAttribute('data-edge-index');
        const apothemLine = shapeGroup ? shapeGroup.querySelector('.apothem-line[data-edge-index="' + edgeIndex + '"]') : null;
        if (apothemLine) {
          const x1 = parseFloat(apothemLine.getAttribute('x1'));
          const y1 = parseFloat(apothemLine.getAttribute('y1'));
          const x2 = parseFloat(apothemLine.getAttribute('x2'));
          const y2 = parseFloat(apothemLine.getAttribute('y2'));
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const tx = parseFloat(draggingLabel.getAttribute('x'));
          const ty = parseFloat(draggingLabel.getAttribute('y'));
          draggingLabel.setAttribute('data-offset-dx', String(tx - mx));
          draggingLabel.setAttribute('data-offset-dy', String(ty - my));
        }
      }
      draggingLabel = null;
      pendingLabelDrag = null;
    });
  }

  function enableCenterLineLabelDrag(g) {
    let draggingLabel = null;
    let pendingLabelDrag = null;
    let startX, startY, startTextX, startTextY;
    const DRAG_THRESHOLD = 3;

    g.addEventListener('mousedown', function (ev) {
      if (!ev.target.classList.contains('center-line-label')) return;
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
        const vertexIndex = draggingLabel.getAttribute('data-vertex-index');
        const centerLine = shapeGroup ? shapeGroup.querySelector('.center-line[data-vertex-index="' + vertexIndex + '"]') : null;
        if (centerLine) {
          const x1 = parseFloat(centerLine.getAttribute('x1'));
          const y1 = parseFloat(centerLine.getAttribute('y1'));
          const x2 = parseFloat(centerLine.getAttribute('x2'));
          const y2 = parseFloat(centerLine.getAttribute('y2'));
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const tx = parseFloat(draggingLabel.getAttribute('x'));
          const ty = parseFloat(draggingLabel.getAttribute('y'));
          draggingLabel.setAttribute('data-offset-dx', String(tx - mx));
          draggingLabel.setAttribute('data-offset-dy', String(ty - my));
        }
      }
      draggingLabel = null;
      pendingLabelDrag = null;
    });
  }

  function enableCircleLineLabelDrag(g) {
    let draggingLabel = null;
    let pendingLabelDrag = null;
    let startX, startY, startTextX, startTextY;
    const DRAG_THRESHOLD = 3;

    g.addEventListener('mousedown', function (ev) {
      if (!ev.target.classList.contains('circle-line-label')) return;
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
        const type = draggingLabel.getAttribute('data-type');
        const idx = type === 'radius' ? draggingLabel.getAttribute('data-radius-index') : draggingLabel.getAttribute('data-diameter-index');
        const line = type === 'radius'
          ? g.querySelector('.circle-radius-line[data-radius-index="' + idx + '"]')
          : g.querySelector('.circle-diameter-line[data-diameter-index="' + idx + '"]');
        if (line) {
          const mid = getCircleLineMidpoint(line);
          const tx = parseFloat(draggingLabel.getAttribute('x'));
          const ty = parseFloat(draggingLabel.getAttribute('y'));
          draggingLabel.setAttribute('data-offset-dx', String(tx - mid.mx));
          draggingLabel.setAttribute('data-offset-dy', String(ty - mid.my));
        }
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
      } else if (pendingShapeDrag && !didMove) {
        const [px, py] = getWorkspacePoint(ev);
        const cx = ev.clientX;
        const cy = ev.clientY;
        if (ev.target.classList.contains('shape-center')) {
          if (contextMenuTimeout) clearTimeout(contextMenuTimeout);
          contextMenuTimeout = setTimeout(function () {
            contextMenuTimeout = null;
            showCenterPointContextMenu(g, ev.target, cx, cy);
          }, CLICK_MENU_DELAY);
        } else if (ev.target.classList.contains('center-line')) {
          if (contextMenuTimeout) clearTimeout(contextMenuTimeout);
          contextMenuTimeout = setTimeout(function () {
            contextMenuTimeout = null;
            showCenterLineContextMenu(g, ev.target, cx, cy);
          }, CLICK_MENU_DELAY);
        } else {
          if (ev.target.classList.contains('apothem-line')) {
            if (contextMenuTimeout) clearTimeout(contextMenuTimeout);
            contextMenuTimeout = setTimeout(function () {
              contextMenuTimeout = null;
              showApothemContextMenu(g, ev.target, cx, cy);
            }, CLICK_MENU_DELAY);
          } else {
          let chordLine = ev.target.classList.contains('chord-line') ? ev.target : null;
          if (!chordLine && g.dataset.shapeType === 'regular-polygon') chordLine = getClosestChord(g, px, py);
          if (chordLine) {
            if (contextMenuTimeout) clearTimeout(contextMenuTimeout);
            contextMenuTimeout = setTimeout(function () {
              contextMenuTimeout = null;
              showChordContextMenu(g, chordLine, cx, cy);
            }, CLICK_MENU_DELAY);
          } else if (ev.target.classList.contains('shape-edge')) {
            const edgeIndexAttr = ev.target.getAttribute('data-edge-index');
            const edgeIndex = edgeIndexAttr != null ? parseInt(edgeIndexAttr, 10) : null;
            if (edgeIndex !== null && !Number.isNaN(edgeIndex)) {
              if (contextMenuTimeout) clearTimeout(contextMenuTimeout);
              contextMenuTimeout = setTimeout(function () {
                contextMenuTimeout = null;
                showEdgeContextMenu(g, edgeIndex, cx, cy);
              }, CLICK_MENU_DELAY);
            }
          } else if (ev.target.classList.contains('shape-body')) {
            const edgeIndex = g.dataset.shapeType === 'circle' ? null : getClosestEdgeIndex(g, px, py);
            if (edgeIndex !== null) {
              if (contextMenuTimeout) clearTimeout(contextMenuTimeout);
              contextMenuTimeout = setTimeout(function () {
                contextMenuTimeout = null;
                showEdgeContextMenu(g, edgeIndex, cx, cy);
              }, CLICK_MENU_DELAY);
            }
          }
          }
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
      if (ev.target.classList.contains('vertex-label') || ev.target.classList.contains('edge-label') || ev.target.classList.contains('altitude-label') || ev.target.classList.contains('circle-line-label') || ev.target.classList.contains('chord-label') || ev.target.classList.contains('apothem-label') || ev.target.classList.contains('center-line-label')) return;
      if (altitudeDrawingMode || chordDrawingMode || apothemDrawingMode) return;
      if (g.dataset.shapeType === 'circle' && (ev.target.classList.contains('circle-radius-line') || ev.target.classList.contains('circle-diameter-line'))) {
        ev.preventDefault();
        ev.stopPropagation();
        pendingCircleLine = { line: ev.target, startX: ev.clientX, startY: ev.clientY, moved: false };
        const onMove = function (e) {
          if (pendingCircleLine && Math.hypot(e.clientX - pendingCircleLine.startX, e.clientY - pendingCircleLine.startY) >= 3) pendingCircleLine.moved = true;
        };
        const onUp = function (e) {
          document.removeEventListener('mouseup', onUp);
          document.removeEventListener('mousemove', onMove);
          if (pendingCircleLine && !pendingCircleLine.moved && ev.target === pendingCircleLine.line) {
            showCircleLineContextMenu(g, pendingCircleLine.line, e.clientX, e.clientY);
          }
          pendingCircleLine = null;
        };
        document.addEventListener('mouseup', onUp);
        document.addEventListener('mousemove', onMove);
        return;
      }
      ev.preventDefault();
      startShapeDrag(ev);
      document.addEventListener('mousemove', moveShapeDrag);
      document.addEventListener('mouseup', endShapeDrag);
    });
  }

  document.querySelectorAll('.shape-icon').forEach(icon => {
    icon.addEventListener('dragstart', function (ev) {
      ev.dataTransfer.setData('application/x-shape-type', this.dataset.shape);
      if (this.dataset.shape === 'regular-polygon' && this.dataset.sides) {
        ev.dataTransfer.setData('application/x-polygon-sides', this.dataset.sides);
      }
      ev.dataTransfer.effectAllowed = 'copy';
    });
  });

  (function initPaletteSidesControl() {
    const wrap = document.querySelector('.palette-regular-polygon');
    if (!wrap) return;
    const icon = wrap.querySelector('.shape-icon');
    const iconPath = wrap.querySelector('.shape-icon svg path');
    const valueEl = wrap.querySelector('.palette-sides-value');
    const btnMinus = wrap.querySelector('.palette-sides-control .palette-sides-btn:first-of-type');
    const btnPlus = wrap.querySelector('.palette-sides-control .palette-sides-btn:last-of-type');
    if (!icon || !iconPath || !valueEl || !btnMinus || !btnPlus) return;
    function updateDisplay() {
      const n = parseInt(icon.dataset.sides, 10) || DEFAULT_REGULAR_POLYGON_SIDES;
      const clamped = Math.max(MIN_REGULAR_POLYGON_SIDES, Math.min(MAX_REGULAR_POLYGON_SIDES, n));
      icon.dataset.sides = String(clamped);
      valueEl.textContent = String(clamped);
      const pts = regularPolygonPoints(clamped);
      const d = pts.map(function (p, i) {
        const x = (2 + p[0] * 20).toFixed(1);
        const y = (2 + p[1] * 20).toFixed(1);
        return (i === 0 ? 'M' : 'L') + x + ' ' + y;
      }).join(' ') + ' Z';
      iconPath.setAttribute('d', d);
    }
    btnMinus.addEventListener('click', function (ev) {
      ev.preventDefault();
      const n = parseInt(icon.dataset.sides, 10) || DEFAULT_REGULAR_POLYGON_SIDES;
      if (n > MIN_REGULAR_POLYGON_SIDES) {
        icon.dataset.sides = String(n - 1);
        updateDisplay();
      }
    });
    btnPlus.addEventListener('click', function (ev) {
      ev.preventDefault();
      const n = parseInt(icon.dataset.sides, 10) || DEFAULT_REGULAR_POLYGON_SIDES;
      if (n < MAX_REGULAR_POLYGON_SIDES) {
        icon.dataset.sides = String(n + 1);
        updateDisplay();
      }
    });
    updateDisplay();
  })();

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
    const polygonSides = type === 'regular-polygon' ? ev.dataTransfer.getData('application/x-polygon-sides') : null;
    const sides = polygonSides ? parseInt(polygonSides, 10) : null;
    ensureWorkspaceSize();
    pushUndo();
    const [x, y] = getWorkspacePoint(ev);
    createShape(type, x, y, type === 'regular-polygon' ? sides : undefined);
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

  workspace.addEventListener('click', function (ev) {
    const label = ev.target;
    if (!label.classList || (!label.classList.contains('vertex-label') && !label.classList.contains('edge-label') && !label.classList.contains('altitude-label') && !label.classList.contains('circle-line-label') && !label.classList.contains('chord-label') && !label.classList.contains('apothem-label') && !label.classList.contains('center-line-label'))) return;
    if (contextMenuTimeout) clearTimeout(contextMenuTimeout);
    const cx = ev.clientX;
    const cy = ev.clientY;
    contextMenuTimeout = setTimeout(function () {
      contextMenuTimeout = null;
      showLabelFontSizeContextMenu(label, cx, cy);
    }, CLICK_MENU_DELAY);
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
