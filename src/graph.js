/**
 * MOLB Game Tool - Precedence Graph Visualization
 * Renders an interactive visual graph of task dependencies
 */

/**
 * Calculate node positions using a layered layout algorithm
 * @param {ProblemConfig} config
 * @returns {Map<string, {x: number, y: number, layer: number}>}
 */
export function calculateNodePositions(config) {
    const positions = new Map();
    const layers = new Map(); // taskId -> layer number

    // Calculate layers using longest path from start
    function calculateLayer(taskId, memo = new Map()) {
        if (memo.has(taskId)) return memo.get(taskId);

        const predecessors = config.precedence.get(taskId) || [];
        if (predecessors.length === 0) {
            memo.set(taskId, 0);
            return 0;
        }

        let maxPredLayer = 0;
        for (const pred of predecessors) {
            maxPredLayer = Math.max(maxPredLayer, calculateLayer(pred, memo));
        }

        const layer = maxPredLayer + 1;
        memo.set(taskId, layer);
        return layer;
    }

    const memo = new Map();
    for (const taskId of config.tasks.keys()) {
        layers.set(taskId, calculateLayer(taskId, memo));
    }

    // Group tasks by layer
    const layerGroups = new Map();
    for (const [taskId, layer] of layers) {
        if (!layerGroups.has(layer)) {
            layerGroups.set(layer, []);
        }
        layerGroups.get(layer).push(taskId);
    }

    // Calculate positions
    const numLayers = Math.max(...layers.values()) + 1;
    const width = 900;
    const height = 500;
    const marginX = 60;
    const marginY = 50;

    const layerWidth = (width - 2 * marginX) / Math.max(numLayers - 1, 1);

    for (const [layer, taskIds] of layerGroups) {
        const numTasks = taskIds.length;
        const layerHeight = (height - 2 * marginY) / Math.max(numTasks - 1, 1);

        taskIds.forEach((taskId, index) => {
            positions.set(taskId, {
                x: marginX + layer * layerWidth,
                y: numTasks === 1 ? height / 2 : marginY + index * layerHeight,
                layer
            });
        });
    }

    return positions;
}

/**
 * Render the precedence graph as SVG
 * @param {ProblemConfig} config
 * @returns {string} SVG HTML
 */
export function renderPrecedenceGraph(config) {
    if (config.tasks.size === 0) {
        return `<div class="empty-state">Geen taken om te visualiseren</div>`;
    }

    const positions = calculateNodePositions(config);
    const width = 900;
    const height = 500;

    // Generate edges
    const edges = [];
    for (const [toId, fromIds] of config.precedence) {
        for (const fromId of fromIds) {
            const from = positions.get(fromId);
            const to = positions.get(toId);
            if (from && to) {
                edges.push({ from: fromId, to: toId, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
            }
        }
    }

    // Arrow marker definition
    const defs = `
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="rgba(99, 102, 241, 0.6)" />
      </marker>
    </defs>
  `;

    // Render edges with arrows
    const edgeElements = edges.map(edge => {
        // Shorten line to not overlap with node circles
        const dx = edge.x2 - edge.x1;
        const dy = edge.y2 - edge.y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nodeRadius = 22;

        const x1 = edge.x1 + (dx / len) * nodeRadius;
        const y1 = edge.y1 + (dy / len) * nodeRadius;
        const x2 = edge.x2 - (dx / len) * (nodeRadius + 5);
        const y2 = edge.y2 - (dy / len) * (nodeRadius + 5);

        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" 
      stroke="rgba(99, 102, 241, 0.4)" stroke-width="2" 
      marker-end="url(#arrowhead)" class="graph-edge" />`;
    }).join('');

    // Color map for tool types
    const toolColors = {
        'M1': '#22c55e',
        'M2': '#3b82f6',
        'M3': '#f59e0b',
        'default': '#6366f1'
    };

    // Render nodes
    const nodeElements = Array.from(positions.entries()).map(([taskId, pos]) => {
        const task = config.tasks.get(taskId);
        const color = toolColors[task?.toolType] || toolColors.default;

        return `
      <g class="graph-node" data-task="${taskId}">
        <circle cx="${pos.x}" cy="${pos.y}" r="22" 
          fill="${color}" stroke="white" stroke-width="2" />
        <text x="${pos.x}" y="${pos.y + 1}" 
          text-anchor="middle" dominant-baseline="middle" 
          fill="white" font-size="12" font-weight="600">${taskId.replace('T', '')}</text>
        <text x="${pos.x}" y="${pos.y + 35}" 
          text-anchor="middle" fill="rgba(255,255,255,0.5)" font-size="10">${task?.processingTime || 0}s</text>
      </g>
    `;
    }).join('');

    // Legend
    const legend = `
    <g transform="translate(${width - 120}, 20)">
      <text x="0" y="0" fill="rgba(255,255,255,0.7)" font-size="11" font-weight="600">Gereedschap:</text>
      <circle cx="10" cy="20" r="8" fill="${toolColors.M1}" />
      <text x="25" y="24" fill="rgba(255,255,255,0.6)" font-size="11">M1</text>
      <circle cx="55" cy="20" r="8" fill="${toolColors.M2}" />
      <text x="70" y="24" fill="rgba(255,255,255,0.6)" font-size="11">M2</text>
      <circle cx="10" cy="45" r="8" fill="${toolColors.M3}" />
      <text x="25" y="49" fill="rgba(255,255,255,0.6)" font-size="11">M3</text>
    </g>
  `;

    return `
    <div class="precedence-graph-container">
      <div class="graph-header">
        <h3>📊 Precedence Graph</h3>
        <span class="graph-info">${config.tasks.size} taken, ${edges.length} relaties</span>
      </div>
      <svg class="precedence-graph" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        ${defs}
        ${edgeElements}
        ${nodeElements}
        ${legend}
      </svg>
    </div>
  `;
}
