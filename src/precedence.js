/**
 * MOLB Game Tool - Precedence Graph
 * Handles precedence relations and topological ordering
 */

/**
 * Check if the precedence graph contains cycles
 * @param {ProblemConfig} config 
 * @returns {boolean} true if cycles exist
 */
export function hasCycles(config) {
    const visited = new Set();
    const recStack = new Set();

    function dfs(taskId) {
        visited.add(taskId);
        recStack.add(taskId);

        const successors = config.successors.get(taskId) || [];
        for (const succ of successors) {
            if (!visited.has(succ)) {
                if (dfs(succ)) return true;
            } else if (recStack.has(succ)) {
                return true;
            }
        }

        recStack.delete(taskId);
        return false;
    }

    for (const taskId of config.tasks.keys()) {
        if (!visited.has(taskId)) {
            if (dfs(taskId)) return true;
        }
    }

    return false;
}

/**
 * Get topologically sorted list of tasks
 * @param {ProblemConfig} config 
 * @returns {Task[]} sorted tasks or null if cycle exists
 */
export function topologicalSort(config) {
    if (hasCycles(config)) return null;

    const inDegree = new Map();
    for (const taskId of config.tasks.keys()) {
        inDegree.set(taskId, (config.precedence.get(taskId) || []).length);
    }

    const queue = [];
    for (const [taskId, degree] of inDegree) {
        if (degree === 0) queue.push(taskId);
    }

    const result = [];
    while (queue.length > 0) {
        const current = queue.shift();
        result.push(config.tasks.get(current));

        const successors = config.successors.get(current) || [];
        for (const succ of successors) {
            inDegree.set(succ, inDegree.get(succ) - 1);
            if (inDegree.get(succ) === 0) {
                queue.push(succ);
            }
        }
    }

    return result.length === config.tasks.size ? result : null;
}

/**
 * Get all tasks that are available to be assigned
 * (all predecessors have been assigned)
 * @param {ProblemConfig} config 
 * @param {Set<string>} assignedTasks - IDs of already assigned tasks
 * @returns {Task[]} available tasks
 */
export function getAvailableTasks(config, assignedTasks) {
    const available = [];

    for (const [taskId, task] of config.tasks) {
        if (assignedTasks.has(taskId)) continue;

        const predecessors = config.precedence.get(taskId) || [];
        const allPredsDone = predecessors.every(p => assignedTasks.has(p));

        if (allPredsDone) {
            available.push(task);
        }
    }

    return available;
}

/**
 * Calculate the positional weight of a task (sum of processing times of itself and all successors)
 * @param {ProblemConfig} config 
 * @param {string} taskId 
 * @param {Map} memo - memoization cache
 * @returns {number} positional weight
 */
export function getPositionalWeight(config, taskId, memo = new Map()) {
    if (memo.has(taskId)) return memo.get(taskId);

    const task = config.tasks.get(taskId);
    if (!task) return 0;

    let weight = task.processingTime;
    const successors = config.successors.get(taskId) || [];

    for (const succ of successors) {
        weight += getPositionalWeight(config, succ, memo);
    }

    memo.set(taskId, weight);
    return weight;
}

/**
 * Calculate slack for a task (difference between available time and required time)
 * @param {ProblemConfig} config 
 * @param {string} taskId 
 * @param {number} currentTime - current time in the schedule
 * @returns {number} slack value
 */
export function calculateSlack(config, taskId, currentTime = 0) {
    const memo = new Map();
    const weight = getPositionalWeight(config, taskId, memo);
    const task = config.tasks.get(taskId);

    // Simple slack calculation: remaining time until takt deadline minus required chain time
    const numStationsNeeded = Math.ceil(weight / config.taktTime);
    const availableTime = numStationsNeeded * config.taktTime;

    return availableTime - weight;
}

/**
 * Get all predecessors of a task (transitive closure)
 * @param {ProblemConfig} config 
 * @param {string} taskId 
 * @returns {Set<string>} all predecessor task IDs
 */
export function getAllPredecessors(config, taskId) {
    const result = new Set();
    const queue = [...(config.precedence.get(taskId) || [])];

    while (queue.length > 0) {
        const current = queue.shift();
        if (!result.has(current)) {
            result.add(current);
            const preds = config.precedence.get(current) || [];
            queue.push(...preds);
        }
    }

    return result;
}

/**
 * Get all successors of a task (transitive closure)
 * @param {ProblemConfig} config 
 * @param {string} taskId 
 * @returns {Set<string>} all successor task IDs
 */
export function getAllSuccessors(config, taskId) {
    const result = new Set();
    const queue = [...(config.successors.get(taskId) || [])];

    while (queue.length > 0) {
        const current = queue.shift();
        if (!result.has(current)) {
            result.add(current);
            const succs = config.successors.get(current) || [];
            queue.push(...succs);
        }
    }

    return result;
}
