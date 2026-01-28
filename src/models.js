/**
 * MOLB Game Tool - Data Models
 * Core data structures for the line balancing problem
 */

/**
 * Task: A single operation in the assembly line
 */
export class Task {
    constructor(id, processingTime, toolType, envScore = 1) {
        this.id = id;
        this.processingTime = processingTime;
        this.toolType = toolType;
        this.envScore = envScore; // Environmental impact score (0-10, lower is better)
    }
}

/**
 * Station: A workstation with assigned tasks
 */
export class Station {
    constructor(id) {
        this.id = id;
        this.tasks = [];
        this.totalTime = 0;
        this.tools = new Map(); // toolType -> count
    }

    addTask(task) {
        this.tasks.push(task);
        this.totalTime += task.processingTime;

        const currentCount = this.tools.get(task.toolType) || 0;
        this.tools.set(task.toolType, currentCount + 1);
    }

    getTaskIds() {
        return this.tasks.map(t => t.id);
    }

    clone() {
        const clone = new Station(this.id);
        clone.tasks = [...this.tasks];
        clone.totalTime = this.totalTime;
        clone.tools = new Map(this.tools);
        return clone;
    }
}

/**
 * Solution: A complete line balancing solution
 */
export class Solution {
    constructor(stations = []) {
        this.stations = stations;
        this.scores = {
            economic: 0,
            social: 0,
            environmental: 0,
            weighted: 0
        };
        this.isValid = true;
        this.validationErrors = [];
    }

    getNumStations() {
        return this.stations.length;
    }

    addStation(station) {
        this.stations.push(station);
    }

    getTotalTime() {
        return this.stations.reduce((sum, s) => sum + s.totalTime, 0);
    }

    getIdleTime(taktTime) {
        return this.stations.reduce((sum, s) => sum + (taktTime - s.totalTime), 0);
    }

    clone() {
        const clone = new Solution(this.stations.map(s => s.clone()));
        clone.scores = { ...this.scores };
        clone.isValid = this.isValid;
        clone.validationErrors = [...this.validationErrors];
        return clone;
    }

    toJSON() {
        return {
            stations: this.stations.map(s => ({
                id: s.id,
                tasks: s.getTaskIds(),
                totalTime: s.totalTime
            })),
            scores: this.scores,
            isValid: this.isValid
        };
    }

    static fromJSON(json, taskMap) {
        const stations = json.stations.map(sData => {
            const station = new Station(sData.id);
            sData.tasks.forEach(taskId => {
                const task = taskMap.get(taskId);
                if (task) station.addTask(task);
            });
            return station;
        });

        const solution = new Solution(stations);
        if (json.scores) solution.scores = json.scores;
        if (json.isValid !== undefined) solution.isValid = json.isValid;
        return solution;
    }

    getHash() {
        return this.stations.map(s => s.getTaskIds().sort().join(',')).join('|');
    }
}

/**
 * ProblemConfig: Configuration for the line balancing problem
 */
export class ProblemConfig {
    constructor() {
        this.tasks = new Map(); // id -> Task
        this.precedence = new Map(); // taskId -> [taskIds that must come before]
        this.successors = new Map(); // taskId -> [taskIds that come after]
        this.taktTime = 12;
        this.toolLimits = new Map(); // toolType -> max count per station
        this.weights = {
            economic: 0.4,
            social: 0.3,
            environmental: 0.3
        };
    }

    addTask(task) {
        this.tasks.set(task.id, task);
        if (!this.precedence.has(task.id)) {
            this.precedence.set(task.id, []);
        }
        if (!this.successors.has(task.id)) {
            this.successors.set(task.id, []);
        }

        // Auto-add tool limit if not exists
        if (!this.toolLimits.has(task.toolType)) {
            this.toolLimits.set(task.toolType, 2); // Default limit
        }
    }

    removeTask(taskId) {
        this.tasks.delete(taskId);
        this.precedence.delete(taskId);
        this.successors.delete(taskId);

        // Remove from other tasks' precedence/successors
        for (const [id, preds] of this.precedence) {
            this.precedence.set(id, preds.filter(p => p !== taskId));
        }
        for (const [id, succs] of this.successors) {
            this.successors.set(id, succs.filter(s => s !== taskId));
        }
    }

    addPrecedence(fromId, toId) {
        // fromId must be completed before toId can start
        if (!this.precedence.has(toId)) {
            this.precedence.set(toId, []);
        }
        if (!this.successors.has(fromId)) {
            this.successors.set(fromId, []);
        }

        const preds = this.precedence.get(toId);
        if (!preds.includes(fromId)) {
            preds.push(fromId);
        }

        const succs = this.successors.get(fromId);
        if (!succs.includes(toId)) {
            succs.push(toId);
        }
    }

    removePrecedence(fromId, toId) {
        const preds = this.precedence.get(toId);
        if (preds) {
            this.precedence.set(toId, preds.filter(p => p !== fromId));
        }

        const succs = this.successors.get(fromId);
        if (succs) {
            this.successors.set(fromId, succs.filter(s => s !== toId));
        }
    }

    getTaskList() {
        return Array.from(this.tasks.values());
    }

    getToolTypes() {
        const types = new Set();
        for (const task of this.tasks.values()) {
            types.add(task.toolType);
        }
        return Array.from(types);
    }

    setToolLimit(toolType, limit) {
        this.toolLimits.set(toolType, limit);
    }

    toJSON() {
        return {
            tasks: Array.from(this.tasks.values()).map(t => ({
                id: t.id,
                processingTime: t.processingTime,
                toolType: t.toolType,
                envScore: t.envScore
            })),
            precedence: Array.from(this.precedence.entries()).flatMap(([to, froms]) =>
                froms.map(from => ({ from, to }))
            ),
            taktTime: this.taktTime,
            toolLimits: Object.fromEntries(this.toolLimits),
            weights: this.weights
        };
    }

    static fromJSON(json) {
        const config = new ProblemConfig();

        json.tasks.forEach(t => {
            config.addTask(new Task(t.id, t.processingTime, t.toolType, t.envScore || 1));
        });

        json.precedence.forEach(p => {
            config.addPrecedence(p.from, p.to);
        });

        config.taktTime = json.taktTime;

        if (json.toolLimits) {
            Object.entries(json.toolLimits).forEach(([type, limit]) => {
                config.setToolLimit(type, limit);
            });
        }

        if (json.weights) {
            config.weights = json.weights;
        }

        return config;
    }
}
