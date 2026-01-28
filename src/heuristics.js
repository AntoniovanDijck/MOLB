/**
 * MOLB Game Tool - Heuristics
 * Different strategies for assigning tasks to stations
 */

import { getAvailableTasks, getPositionalWeight, calculateSlack } from './precedence.js';
import { canAddTaskToStation } from './feasibility.js';
import { Station, Solution } from './models.js';

/**
 * Priority function types
 */
export const HeuristicType = {
    LPT: 'lpt',           // Largest Processing Time
    SLACK: 'slack',       // Least Slack First
    RANDOM: 'random',     // Random Priority
    WEIGHT: 'weight',     // Positional Weight
    HYBRID: 'hybrid'      // Combination
};

/**
 * Sort tasks by Largest Processing Time first
 */
function sortByLPT(tasks) {
    return [...tasks].sort((a, b) => b.processingTime - a.processingTime);
}

/**
 * Sort tasks by Least Slack first
 */
function sortBySlack(tasks, config) {
    const slackMap = new Map();
    tasks.forEach(t => {
        slackMap.set(t.id, calculateSlack(config, t.id));
    });

    return [...tasks].sort((a, b) => slackMap.get(a.id) - slackMap.get(b.id));
}

/**
 * Sort tasks by positional weight (descending)
 */
function sortByWeight(tasks, config) {
    const memo = new Map();
    const weightMap = new Map();
    tasks.forEach(t => {
        weightMap.set(t.id, getPositionalWeight(config, t.id, memo));
    });

    return [...tasks].sort((a, b) => weightMap.get(b.id) - weightMap.get(a.id));
}

/**
 * Shuffle tasks randomly
 */
function shuffleTasks(tasks) {
    const shuffled = [...tasks];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Sort tasks based on heuristic type
 */
function sortByHeuristic(tasks, config, heuristic) {
    switch (heuristic) {
        case HeuristicType.LPT:
            return sortByLPT(tasks);
        case HeuristicType.SLACK:
            return sortBySlack(tasks, config);
        case HeuristicType.WEIGHT:
            return sortByWeight(tasks, config);
        case HeuristicType.RANDOM:
            return shuffleTasks(tasks);
        case HeuristicType.HYBRID:
            // Combine: primarily by weight, with random tie-breaking
            const weighted = sortByWeight(tasks, config);
            // Add small random perturbation to order
            return weighted.sort((a, b) => {
                const wA = getPositionalWeight(config, a.id, new Map());
                const wB = getPositionalWeight(config, b.id, new Map());
                if (Math.abs(wA - wB) < 0.1 * Math.max(wA, wB)) {
                    return Math.random() - 0.5;
                }
                return wB - wA;
            });
        default:
            return tasks;
    }
}

/**
 * Generate a single solution using a specific heuristic
 * @param {ProblemConfig} config 
 * @param {string} heuristic - HeuristicType
 * @returns {Solution}
 */
export function generateSolution(config, heuristic = HeuristicType.LPT) {
    const stations = [];
    const assignedTasks = new Set();
    let currentStation = new Station(`S${stations.length + 1}`);

    while (assignedTasks.size < config.tasks.size) {
        // Get available tasks (predecessors completed)
        let available = getAvailableTasks(config, assignedTasks);

        if (available.length === 0) {
            // No tasks available - should not happen if precedence is valid
            break;
        }

        // Sort by heuristic
        available = sortByHeuristic(available, config, heuristic);

        let taskAssigned = false;

        for (const task of available) {
            const check = canAddTaskToStation(task, currentStation, config, assignedTasks);

            if (check.canAdd) {
                currentStation.addTask(task);
                assignedTasks.add(task.id);
                taskAssigned = true;
                break;
            }
        }

        if (!taskAssigned) {
            // Current station is full, start a new one
            if (currentStation.tasks.length > 0) {
                stations.push(currentStation);
            }
            currentStation = new Station(`S${stations.length + 1}`);
        }
    }

    // Add last station if it has tasks
    if (currentStation.tasks.length > 0) {
        stations.push(currentStation);
    }

    return new Solution(stations);
}

/**
 * Generate multiple solutions using a specific heuristic
 * Random variations are introduced by shuffling equally-ranked tasks
 * @param {ProblemConfig} config 
 * @param {string} heuristic 
 * @param {number} iterations 
 * @returns {Solution[]}
 */
export function generateMultipleSolutions(config, heuristic, iterations = 50) {
    const solutions = [];
    const seenHashes = new Set();

    for (let i = 0; i < iterations; i++) {
        const solution = generateSolution(config, heuristic);
        const hash = solution.getHash();

        if (!seenHashes.has(hash)) {
            seenHashes.add(hash);
            solutions.push(solution);
        }
    }

    return solutions;
}

/**
 * Generate solutions using multiple heuristics
 * @param {ProblemConfig} config 
 * @param {Object} options
 * @returns {Solution[]}
 */
export function generateAllSolutions(config, options = {}) {
    const {
        useLPT = true,
        useSlack = true,
        useRandom = true,
        useHybrid = true,
        iterations = 100
    } = options;

    const allSolutions = [];
    const seenHashes = new Set();

    const heuristics = [];
    if (useLPT) heuristics.push(HeuristicType.LPT);
    if (useSlack) heuristics.push(HeuristicType.SLACK);
    if (useRandom) heuristics.push(HeuristicType.RANDOM);
    if (useHybrid) heuristics.push(HeuristicType.HYBRID);

    // Also add weight-based
    heuristics.push(HeuristicType.WEIGHT);

    const iterationsPerHeuristic = Math.ceil(iterations / heuristics.length);

    for (const heuristic of heuristics) {
        const solutions = generateMultipleSolutions(config, heuristic, iterationsPerHeuristic);

        for (const solution of solutions) {
            const hash = solution.getHash();
            if (!seenHashes.has(hash)) {
                seenHashes.add(hash);
                allSolutions.push(solution);
            }
        }
    }

    return allSolutions;
}
