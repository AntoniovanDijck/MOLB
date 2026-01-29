/**
 * MOLB Game Tool - Pareto Optimizer
 * Finds Pareto-optimal solutions automatically
 */

import { Task, ProblemConfig, Solution, Station } from './models.js';
import { hasCycles, topologicalSort, getAvailableTasks } from './precedence.js';
import { validateSolution } from './feasibility.js';
import { calculateAllScores, getSolutionStatistics } from './objectives.js';
import { findParetoFront, rankSolutions } from './pareto.js';
import { renderPrecedenceGraph } from './graph.js';
import { renderBestSolution, renderScoreBars, renderParetoChart, renderSolutionsTable, showToast } from './visualization.js';
import { GraphEditor } from './graph-editor.js';

// Global state
let config = new ProblemConfig();
let paretoFront = [];
let allSolutions = [];
let graphEditor = null;
let editorMode = false;

document.addEventListener('DOMContentLoaded', init);

function init() {
    // Start with empty graph - no default data
    config.taktTime = 47;
    config.setToolLimit('M1', 3);
    config.setToolLimit('M2', 3);
    config.setToolLimit('M3', 3);

    setupEventListeners();
    renderGraph();
}

function setupEventListeners() {
    document.getElementById('generateBtn').addEventListener('click', findParetoSolutions);
    document.getElementById('exportBtn').addEventListener('click', exportResults);

    // Editor mode toggle
    document.getElementById('editorModeBtn').addEventListener('click', toggleEditorMode);
    document.getElementById('clearGraphBtn').addEventListener('click', () => {
        if (confirm('Alle taken en verbindingen wissen?')) {
            graphEditor?.clear();
        }
    });

    // Graph export/import
    document.getElementById('exportGraphBtn').addEventListener('click', exportGraph);
    document.getElementById('importGraphBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', importGraph);
}

// Export graph to JSON file
function exportGraph() {
    if (config.tasks.size === 0) {
        showToast('Geen graph om te exporteren', 'error');
        return;
    }

    const data = {
        tasks: Array.from(config.tasks.values()).map(t => ({
            id: t.id,
            processingTime: t.processingTime,
            toolType: t.toolType
        })),
        precedence: Array.from(config.precedence.entries()).flatMap(([to, froms]) =>
            froms.map(from => [from, to])
        ),
        positions: graphEditor ? Array.from(graphEditor.nodePositions.entries()) : []
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `molb-graph-${Date.now()}.json`;
    link.click();

    showToast('Graph geëxporteerd!', 'success');
}

// Import graph from JSON file
function importGraph(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);

            // Clear existing
            config.tasks.clear();
            config.precedence.clear();

            // Load tasks
            data.tasks.forEach(t => {
                config.addTask(new Task(t.id, t.processingTime, t.toolType, 1));
            });

            // Load precedence
            data.precedence.forEach(([from, to]) => {
                config.addPrecedence(from, to);
            });

            // Initialize editor with positions
            if (graphEditor && data.positions) {
                graphEditor.nodePositions.clear();
                data.positions.forEach(([id, pos]) => {
                    graphEditor.nodePositions.set(id, pos);
                });
                graphEditor.render();
            }

            renderGraph();
            showToast(`${config.tasks.size} taken geladen!`, 'success');

        } catch (err) {
            showToast('Ongeldig bestand: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
}

// Task data from sheet
function initMOLBData() {
    const tasks = [
        ['T1', 14, null], ['T2', 14, 'M3'], ['T3', 11, 'M1'], ['T4', 11, null],
        ['T5', 9, 'M3'], ['T6', 9, 'M2'], ['T7', 6, 'M3'], ['T8', 15, 'M2'],
        ['T9', 14, null], ['T10', 11, null], ['T11', 11, 'M3'], ['T12', 14, null],
        ['T13', 5, 'M1'], ['T14', 13, 'M1'], ['T15', 10, 'M2'], ['T16', 9, 'M2'],
        ['T17', 7, 'M1'], ['T18', 6, 'M1'], ['T19', 8, 'M1'], ['T20', 11, 'M3'],
        ['T21', 14, 'M3'], ['T22', 7, null], ['T23', 14, 'M1'], ['T24', 6, 'M2'],
        ['T25', 7, 'M2'], ['T26', 9, 'M1'], ['T27', 11, 'M2'], ['T28', 6, 'M3'],
        ['T29', 11, 'M3'], ['T30', 7, null]
    ];

    tasks.forEach(([id, time, tool]) => {
        config.addTask(new Task(id, time, tool || 'M1', 1));
    });

    // Precedence from diagram
    const prec = [
        ['T1', 'T3'], ['T3', 'T6'], ['T6', 'T10'], ['T6', 'T11'], ['T10', 'T14'], ['T11', 'T14'],
        ['T14', 'T18'], ['T18', 'T22'], ['T18', 'T23'], ['T22', 'T26'], ['T23', 'T26'],
        ['T23', 'T27'], ['T26', 'T27'],
        ['T2', 'T4'], ['T4', 'T7'], ['T4', 'T8'], // T4→T8 added
        ['T7', 'T11'], ['T7', 'T12'], ['T11', 'T15'], ['T12', 'T15'],
        ['T15', 'T19'], ['T19', 'T23'], ['T19', 'T24'], ['T24', 'T27'], ['T24', 'T28'],
        ['T26', 'T29'], ['T27', 'T29'], ['T29', 'T30'],
        ['T5', 'T8'], ['T8', 'T13'], ['T12', 'T13'], ['T12', 'T16'], ['T13', 'T16'], ['T13', 'T17'], // T8→T12 removed, T12→T13 added
        ['T16', 'T20'], ['T17', 'T21'], ['T20', 'T24'], ['T20', 'T25'], ['T21', 'T25'],
        ['T25', 'T28'], ['T28', 'T29'], ['T9', 'T17']
    ];
    prec.forEach(([from, to]) => config.addPrecedence(from, to));

    config.setToolLimit('M1', 3);
    config.setToolLimit('M2', 3);
    config.setToolLimit('M3', 3);
    config.taktTime = 47; // Max time per station
}

function renderGraph() {
    document.getElementById('graphContainer').innerHTML = renderPrecedenceGraph(config);
}

function toggleEditorMode() {
    editorMode = !editorMode;
    const editorBtn = document.getElementById('editorModeBtn');
    const clearBtn = document.getElementById('clearGraphBtn');
    const editorContainer = document.getElementById('graphEditorContainer');
    const graphContainer = document.getElementById('graphContainer');

    if (editorMode) {
        editorBtn.innerHTML = '👁️ Bekijken';
        editorBtn.classList.add('btn-primary');
        clearBtn.style.display = 'block';
        graphContainer.style.display = 'none';
        editorContainer.style.display = 'block';

        // Initialize editor
        if (!graphEditor) {
            graphEditor = new GraphEditor(editorContainer, config, () => {
                // Callback when graph changes
                showToast(`${config.tasks.size} taken, ${countEdges()} verbindingen`, 'success');
            });
        } else {
            graphEditor.resize();
            graphEditor.render();
        }
    } else {
        editorBtn.innerHTML = '✏️ Editor';
        editorBtn.classList.remove('btn-primary');
        clearBtn.style.display = 'none';
        graphContainer.style.display = 'block';
        editorContainer.style.display = 'none';

        // Re-render static graph
        renderGraph();
    }
}

function countEdges() {
    let count = 0;
    for (const froms of config.precedence.values()) {
        count += froms.length;
    }
    return count;
}

/**
 * Generate many solutions and find Pareto front
 */
async function findParetoSolutions() {
    const button = document.getElementById('generateBtn');
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> Zoeken...';
    document.getElementById('emptyResults').style.display = 'none';

    // Get weights from UI
    const wE = parseInt(document.getElementById('weightEcon').value) || 9;
    const wS = parseInt(document.getElementById('weightSocial').value) || 6;
    const wEnv = parseInt(document.getElementById('weightEnv').value) || 8;
    const total = wE + wS + wEnv;
    config.weights = { economic: wE / total, social: wS / total, environmental: wEnv / total };

    const maxStdev = parseInt(document.getElementById('maxStdev').value) || 24;
    const maxTime = parseInt(document.getElementById('maxTime').value) || 47;
    const toolVariety = parseInt(document.getElementById('toolVariety').value) || 3;

    // Set config values for scoring
    config.maxStdev = maxStdev;
    config.taktTime = maxTime;

    await new Promise(r => setTimeout(r, 50));

    try {
        allSolutions = [];
        const seen = new Set();

        // Generate solutions for different station counts (10-30)
        for (let numStations = 10; numStations <= 25; numStations++) {
            for (let iter = 0; iter < 100; iter++) {
                const sol = generateSolution(numStations, iter, maxStdev, maxTime, toolVariety);
                if (sol) {
                    const hash = sol.getHash();
                    if (!seen.has(hash)) {
                        seen.add(hash);
                        validateSolution(sol, config);
                        if (sol.isValid) {
                            calculateAllScores(sol, config);
                            allSolutions.push(sol);
                        }
                    }
                }
            }
        }

        if (allSolutions.length === 0) {
            showToast('Geen geldige oplossingen gevonden', 'error');
            button.disabled = false;
            button.innerHTML = '▶ ZOEK PARETO OPLOSSINGEN';
            return;
        }

        // Find Pareto front
        paretoFront = findParetoFront(allSolutions);

        // Sort Pareto by weighted score
        paretoFront.sort((a, b) => b.scores.weighted - a.scores.weighted);

        renderResults();
        showToast(`${allSolutions.length} oplossingen, ${paretoFront.length} Pareto-optimaal`, 'success');

    } catch (error) {
        console.error(error);
        showToast('Fout: ' + error.message, 'error');
    }

    button.disabled = false;
    button.innerHTML = '▶ ZOEK PARETO OPLOSSINGEN';
}

/**
 * Generate a single feasible solution
 */
function generateSolution(targetStations, seed, maxStdev, maxTime, toolVariety) {
    const solution = new Solution();
    const assigned = new Set();
    const taskList = Array.from(config.tasks.values());

    const totalTime = taskList.reduce((s, t) => s + t.processingTime, 0);
    const idealTimePerStation = Math.min(totalTime / targetStations, maxTime);

    // Build successor count for priority
    const successorCount = new Map();
    for (const task of taskList) {
        let count = 0;
        const queue = [task.id];
        const visited = new Set();
        while (queue.length > 0) {
            const curr = queue.shift();
            for (const [to, froms] of config.precedence) {
                if (froms.includes(curr) && !visited.has(to)) {
                    visited.add(to);
                    queue.push(to);
                    count++;
                }
            }
        }
        successorCount.set(task.id, count);
    }

    for (let s = 0; s < targetStations && assigned.size < taskList.length; s++) {
        const station = new Station(`WS${s + 1}`);
        let stationTime = 0;
        const stationTools = new Set();

        while (true) {
            const available = taskList.filter(t => {
                if (assigned.has(t.id)) return false;
                const preds = config.precedence.get(t.id) || [];
                return preds.every(p => assigned.has(p));
            });

            if (available.length === 0) break;

            // Score tasks
            const scored = available.map(t => {
                let score = 0;
                const remaining = idealTimePerStation - stationTime;

                if (t.processingTime <= remaining) score += 100;
                score += successorCount.get(t.id) * 3;
                if (stationTools.has(t.toolType)) score += 30;

                // Tool variety constraint
                if (!stationTools.has(t.toolType) && stationTools.size >= toolVariety) {
                    score -= 500;
                }

                score += (Math.sin(seed * t.processingTime) + 1) * 20;

                return { task: t, score };
            });

            scored.sort((a, b) => b.score - a.score);
            const best = scored[0];

            // Stop if adding would exceed max time
            if (stationTime + best.task.processingTime > maxTime) {
                break;
            }

            // Check tool variety
            if (!stationTools.has(best.task.toolType) && stationTools.size >= toolVariety) {
                break;
            }

            station.addTask(best.task);
            assigned.add(best.task.id);
            stationTime += best.task.processingTime;
            stationTools.add(best.task.toolType);
        }

        if (station.tasks.length > 0) {
            solution.addStation(station);
        }
    }

    if (assigned.size !== taskList.length) return null;

    // Check max time per station constraint
    const maxStationTime = Math.max(...solution.stations.map(s => s.totalTime));
    if (maxStationTime > maxTime) return null;

    // Check max stdev constraint
    const times = solution.stations.map(s => s.totalTime);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / times.length;
    const stdev = Math.sqrt(variance);

    if (stdev > maxStdev) return null;

    return solution;
}

function renderResults() {
    const content = document.getElementById('resultsContent');
    const graph = document.getElementById('graphContainer')?.innerHTML || '';

    // Stats
    const stats = {
        totalSolutions: allSolutions.length,
        paretoCount: paretoFront.length,
        stationRange: `${Math.min(...paretoFront.map(s => s.stations.length))}-${Math.max(...paretoFront.map(s => s.stations.length))}`,
        bestScore: paretoFront[0]?.scores.weighted || 0
    };

    // Filter out Pareto solutions from the list of all solutions
    const paretoHashes = new Set(paretoFront.map(s => s.getHash()));
    const otherSolutions = allSolutions
        .filter(s => !paretoHashes.has(s.getHash()))
        .sort((a, b) => b.scores.weighted - a.scores.weighted);

    content.innerHTML = `
    ${graph}
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.totalSolutions}</div>
        <div class="stat-label">Oplossingen</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.paretoCount}</div>
        <div class="stat-label">Pareto Front</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${((stats.bestScore || 0) * 100).toFixed(1)}%</div>
        <div class="stat-label">Beste Score</div>
      </div>
    </div>
    
    <h3 style="margin: 20px 0 10px; color: var(--accent-secondary);">🏆 Alle Pareto Oplossingen</h3>
    
    ${renderAllSolutionsList(paretoFront, 'pareto')}
    
    ${otherSolutions.length > 0 ? `
        <h3 style="margin: 40px 0 10px; color: var(--text-secondary); opacity: 0.8;">📉 Andere Oplossingen (${otherSolutions.length})</h3>
        ${renderAllSolutionsList(otherSolutions.slice(0, 20), 'other')}
        ${otherSolutions.length > 20 ? `<p style="text-align:center; padding: 10px; color: var(--text-muted); font-size: 13px;">... en nog ${otherSolutions.length - 20} andere oplossingen</p>` : ''}
    ` : ''}
    
    ${renderParetoChart(paretoFront, allSolutions, paretoFront[0])}
  `;
}

function renderAllSolutionsList(solutions, listType = 'pareto') {
    if (solutions.length === 0) return '';

    const cards = solutions.map((sol, i) => {
        const stationSets = sol.stations.map(s =>
            `<div class="station-set">
                <span class="station-id">${s.id}</span>
                <span class="station-tasks">${s.getTaskIds().join(', ')}</span>
                <span class="station-time">${s.totalTime}s</span>
            </div>`
        ).join('');

        return `
        <div class="solution-card">
            <div class="solution-header">
                <span class="solution-rank">#${i + 1}</span>
                <span class="solution-score">${(sol.scores.weighted * 100).toFixed(1)}%</span>
                <button class="btn btn-sm view-graph-btn" data-list-type="${listType}" data-solution-index="${i}">🔗 Graph</button>
                <button class="btn btn-sm download-solution-btn" data-list-type="${listType}" data-solution-index="${i}">📥 CSV</button>
            </div>
            <div class="solution-scores">
                <span>E: ${sol.scores.economic.toFixed(2)}</span>
                <span>S: ${sol.scores.social.toFixed(2)}</span>
                <span>M: ${sol.scores.environmental.toFixed(2)}</span>
                <span class="solution-stations">${sol.stations.length} stations</span>
            </div>
            <div class="station-sets">${stationSets}</div>
        </div>`;
    }).join('');

    // Add event listeners after render
    setTimeout(() => {
        document.querySelectorAll(`.download-solution-btn[data-list-type="${listType}"]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.solutionIndex);
                const list = listType === 'pareto' ? paretoFront : allSolutions.filter(s => !new Set(paretoFront.map(p => p.getHash())).has(s.getHash())).sort((a, b) => b.scores.weighted - a.scores.weighted);
                downloadSolutionCSV(list[index], index + 1);
            });
        });
        document.querySelectorAll(`.view-graph-btn[data-list-type="${listType}"]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.solutionIndex);
                const list = listType === 'pareto' ? paretoFront : allSolutions.filter(s => !new Set(paretoFront.map(p => p.getHash())).has(s.getHash())).sort((a, b) => b.scores.weighted - a.scores.weighted);
                showSolutionGraph(list[index], index + 1);
            });
        });
    }, 0);

    return `<div class="solutions-list">${cards}</div>`;
}

// Download individual solution as CSV
function downloadSolutionCSV(solution, solutionNum) {
    let csv = 'Workstations,Assigned Tasks\n';

    // Collect all tasks with their workstation
    const allTasks = [];
    solution.stations.forEach(station => {
        station.getTaskIds().forEach(taskId => {
            const taskNum = parseInt(taskId.replace(/\D/g, ''));
            allTasks.push({ station: station.id, taskId, taskNum });
        });
    });

    // Sort by task number
    allTasks.sort((a, b) => a.taskNum - b.taskNum);

    // Write rows
    allTasks.forEach(({ station, taskNum }) => {
        csv += `${station},Task ${taskNum}\n`;
    });

    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pareto-${solutionNum}.csv`;
    link.click();

    showToast(`Oplossing ${solutionNum} gedownload!`, 'success');
}

// Workstation colors for graph visualization
const WS_COLORS = [
    '#6366f1', // purple - WS1
    '#22c55e', // green - WS2
    '#f59e0b', // orange - WS3
    '#3b82f6', // blue - WS4
    '#ec4899', // pink - WS5
    '#14b8a6', // teal - WS6
    '#f97316', // dark orange - WS7
    '#8b5cf6', // violet - WS8
    '#06b6d4', // cyan - WS9
    '#84cc16', // lime - WS10
];

// Show precedence graph for a solution with workstation colors
function showSolutionGraph(solution, solutionNum) {
    // Create task-to-workstation mapping
    const taskToWS = new Map();
    solution.stations.forEach((station, wsIndex) => {
        station.tasks.forEach(task => {
            taskToWS.set(task.id, { ws: station.id, color: WS_COLORS[wsIndex % WS_COLORS.length] });
        });
    });

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'graph-modal';
    modal.innerHTML = `
        <div class="graph-modal-content">
            <div class="graph-modal-header">
                <h3>🔗 Precedence Graph - Oplossing #${solutionNum}</h3>
                <button class="btn close-modal-btn">✕</button>
            </div>
            <div class="graph-modal-legend"></div>
            <canvas id="solutionGraphCanvas" width="800" height="500"></canvas>
        </div>
    `;
    document.body.appendChild(modal);

    // Add legend
    const legend = modal.querySelector('.graph-modal-legend');
    solution.stations.forEach((station, i) => {
        const color = WS_COLORS[i % WS_COLORS.length];
        legend.innerHTML += `<span class="legend-item" style="background:${color}">${station.id}</span>`;
    });

    // Close handlers
    modal.querySelector('.close-modal-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // Draw graph on canvas
    const canvas = modal.querySelector('#solutionGraphCanvas');
    const ctx = canvas.getContext('2d');

    // Use positions from graphEditor if available, otherwise auto-layout
    const positions = new Map();
    if (graphEditor && graphEditor.nodePositions.size > 0) {
        graphEditor.nodePositions.forEach((pos, id) => {
            positions.set(id, { x: pos.x * 0.9 + 50, y: pos.y * 0.9 + 50 });
        });
    } else {
        // Auto-layout in grid
        const tasks = Array.from(config.tasks.keys());
        const cols = Math.ceil(Math.sqrt(tasks.length));
        tasks.forEach((id, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            positions.set(id, { x: 80 + col * 100, y: 60 + row * 80 });
        });
    }

    // Draw edges first
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    config.precedence.forEach((predecessors, to) => {
        const toPos = positions.get(to);
        if (!toPos) return;
        predecessors.forEach(from => {
            const fromPos = positions.get(from);
            if (!fromPos) return;

            ctx.beginPath();
            ctx.moveTo(fromPos.x, fromPos.y);
            ctx.lineTo(toPos.x, toPos.y);
            ctx.stroke();

            // Arrowhead
            const angle = Math.atan2(toPos.y - fromPos.y, toPos.x - fromPos.x);
            const arrowLen = 10;
            ctx.beginPath();
            ctx.moveTo(toPos.x - 20 * Math.cos(angle), toPos.y - 20 * Math.sin(angle));
            ctx.lineTo(toPos.x - 20 * Math.cos(angle) - arrowLen * Math.cos(angle - 0.4),
                toPos.y - 20 * Math.sin(angle) - arrowLen * Math.sin(angle - 0.4));
            ctx.lineTo(toPos.x - 20 * Math.cos(angle) - arrowLen * Math.cos(angle + 0.4),
                toPos.y - 20 * Math.sin(angle) - arrowLen * Math.sin(angle + 0.4));
            ctx.closePath();
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fill();
        });
    });

    // Draw nodes
    config.tasks.forEach((task, id) => {
        const pos = positions.get(id);
        if (!pos) return;

        const wsInfo = taskToWS.get(id);
        const color = wsInfo ? wsInfo.color : '#666';

        // Node circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Task label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = id.replace('T', '');
        ctx.fillText(label, pos.x, pos.y);

        // Time below
        ctx.font = '9px Inter, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(`${task.processingTime}s`, pos.x, pos.y + 28);
    });
}

async function exportResults() {
    if (paretoFront.length === 0) {
        showToast('Genereer eerst oplossingen', 'error');
        return;
    }

    // Build CSV content
    let csv = '';

    paretoFront.forEach((sol, i) => {
        // Header for each solution
        csv += `Pareto Solution ${i + 1}\n`;
        csv += `Workstations,Assigned Tasks\n`;

        // Sort stations by ID (WS1, WS2, etc.)
        const sortedStations = [...sol.stations].sort((a, b) => {
            const numA = parseInt(a.id.replace(/\D/g, ''));
            const numB = parseInt(b.id.replace(/\D/g, ''));
            return numA - numB;
        });

        // Add each workstation row with sorted tasks
        sortedStations.forEach(station => {
            const sortedTasks = station.getTaskIds().sort((a, b) => {
                const numA = parseInt(a.replace(/\D/g, ''));
                const numB = parseInt(b.replace(/\D/g, ''));
                return numA - numB;
            });
            csv += `${station.id},"${sortedTasks.join(', ')}"\n`;
        });

        csv += '\n'; // Empty line between solutions
    });

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `molb-pareto-${Date.now()}.csv`;
    link.click();

    showToast(`${paretoFront.length} oplossingen geëxporteerd als CSV!`, 'success');
}
