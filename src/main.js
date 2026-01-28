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

// Global state
let config = new ProblemConfig();
let paretoFront = [];
let allSolutions = [];

document.addEventListener('DOMContentLoaded', init);

function init() {
    initMOLBData();
    setupEventListeners();
    renderGraph();
}

function setupEventListeners() {
    document.getElementById('generateBtn').addEventListener('click', findParetoSolutions);
    document.getElementById('showGraphBtn').addEventListener('click', () => {
        document.getElementById('graphModalContent').innerHTML = renderPrecedenceGraph(config);
        document.getElementById('graphModal').classList.add('active');
    });
    document.getElementById('closeGraphModal').addEventListener('click', () => {
        document.getElementById('graphModal').classList.remove('active');
    });
    document.getElementById('exportBtn').addEventListener('click', exportResults);

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
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
        ['T2', 'T4'], ['T4', 'T7'], ['T7', 'T11'], ['T7', 'T12'], ['T11', 'T15'], ['T12', 'T15'],
        ['T15', 'T19'], ['T19', 'T23'], ['T19', 'T24'], ['T24', 'T27'], ['T26', 'T29'], ['T27', 'T29'], ['T29', 'T30'],
        ['T5', 'T8'], ['T8', 'T12'], ['T8', 'T13'], ['T12', 'T16'], ['T13', 'T16'], ['T13', 'T17'],
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
        <div class="stat-value">${(stats.bestScore * 100).toFixed(1)}%</div>
        <div class="stat-label">Beste Score</div>
      </div>
    </div>
    
    <h3 style="margin: 20px 0 10px; color: var(--accent-secondary);">🏆 Alle Pareto Oplossingen</h3>
    
    ${renderAllSolutionsList(paretoFront)}
    
    ${renderParetoChart(paretoFront, allSolutions, paretoFront[0])}
  `;
}

function renderAllSolutionsList(solutions) {
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
                <span class="solution-stations">${sol.stations.length} stations</span>
            </div>
            <div class="solution-scores">
                <span>E: ${sol.scores.economic.toFixed(2)}</span>
                <span>S: ${sol.scores.social.toFixed(2)}</span>
                <span>M: ${sol.scores.environmental.toFixed(2)}</span>
            </div>
            <div class="station-sets">${stationSets}</div>
        </div>`;
    }).join('');

    return `<div class="solutions-list">${cards}</div>`;
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
