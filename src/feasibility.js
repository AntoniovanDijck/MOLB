/**
 * MOLB Game Tool - Feasibility Checker
 * Validates solutions against all constraints
 */

import { getAllPredecessors } from './precedence.js';

/**
 * Check if a solution is feasible
 * @param {Solution} solution 
 * @param {ProblemConfig} config 
 * @returns {{isValid: boolean, errors: string[]}}
 */
export function checkFeasibility(solution, config) {
    const errors = [];

    // Check 1: All tasks are assigned exactly once
    const assignedTasks = new Set();
    for (const station of solution.stations) {
        for (const task of station.tasks) {
            if (assignedTasks.has(task.id)) {
                errors.push(`Taak ${task.id} is meerdere keren toegewezen`);
            }
            assignedTasks.add(task.id);
        }
    }

    for (const taskId of config.tasks.keys()) {
        if (!assignedTasks.has(taskId)) {
            errors.push(`Taak ${taskId} is niet toegewezen`);
        }
    }

    // Check 2: Takt time not exceeded per station
    for (const station of solution.stations) {
        if (station.totalTime > config.taktTime) {
            errors.push(`Station ${station.id}: tijd ${station.totalTime}s overschrijdt takt-tijd ${config.taktTime}s`);
        }
    }

    // Check 3: Tool limits per station
    for (const station of solution.stations) {
        for (const [toolType, count] of station.tools) {
            const limit = config.toolLimits.get(toolType);
            if (limit !== undefined && count > limit) {
                errors.push(`Station ${station.id}: ${count}x ${toolType} overschrijdt limiet van ${limit}`);
            }
        }
    }

    // Check 4: Precedence relations
    const taskToStation = new Map();
    solution.stations.forEach((station, index) => {
        station.tasks.forEach(task => {
            taskToStation.set(task.id, index);
        });
    });

    for (const [taskId, predecessors] of config.precedence) {
        const taskStation = taskToStation.get(taskId);
        if (taskStation === undefined) continue;

        for (const predId of predecessors) {
            const predStation = taskToStation.get(predId);
            if (predStation === undefined) {
                errors.push(`Precedence fout: ${predId} → ${taskId}, maar ${predId} is niet toegewezen`);
                continue;
            }

            if (predStation > taskStation) {
                errors.push(`Precedence fout: ${predId} moet vóór ${taskId}, maar staat in later station`);
            } else if (predStation === taskStation) {
                // Check order within station
                const station = solution.stations[taskStation];
                const predIndex = station.tasks.findIndex(t => t.id === predId);
                const taskIndex = station.tasks.findIndex(t => t.id === taskId);

                if (predIndex > taskIndex) {
                    errors.push(`Precedence fout: ${predId} moet vóór ${taskId} binnen station ${station.id}`);
                }
            }
        }
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Check if a task can be added to a station
 * @param {Task} task 
 * @param {Station} station 
 * @param {ProblemConfig} config 
 * @param {Set<string>} assignedTasks - already assigned task IDs
 * @returns {{canAdd: boolean, reason: string|null}}
 */
export function canAddTaskToStation(task, station, config, assignedTasks) {
    // Check takt time
    if (station.totalTime + task.processingTime > config.taktTime) {
        return { canAdd: false, reason: 'Takt-tijd overschreden' };
    }

    // Check tool limit
    const currentToolCount = station.tools.get(task.toolType) || 0;
    const limit = config.toolLimits.get(task.toolType);
    if (limit !== undefined && currentToolCount + 1 > limit) {
        return { canAdd: false, reason: `Gereedschapslimiet ${task.toolType} bereikt` };
    }

    // Check precedence - all predecessors must already be assigned
    const predecessors = config.precedence.get(task.id) || [];
    for (const predId of predecessors) {
        if (!assignedTasks.has(predId)) {
            return { canAdd: false, reason: `Wacht op taak ${predId}` };
        }
    }

    return { canAdd: true, reason: null };
}

/**
 * Validate a solution and update its validity status
 * @param {Solution} solution 
 * @param {ProblemConfig} config 
 * @returns {Solution} the same solution with updated validity
 */
export function validateSolution(solution, config) {
    const result = checkFeasibility(solution, config);
    solution.isValid = result.isValid;
    solution.validationErrors = result.errors;
    return solution;
}
