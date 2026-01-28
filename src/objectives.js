/**
 * MOLB Game Tool - Objective Calculation
 * Computes economic, social, and environmental scores
 */

/**
 * Calculate economic score
 * Based on efficiency: minimizing idle time
 * Score = 1 - (total idle time / total available time)
 * 
 * @param {Solution} solution 
 * @param {ProblemConfig} config 
 * @returns {number} normalized score 0-1 (1 = best)
 */
export function calculateEconomicScore(solution, config) {
    if (solution.stations.length === 0) return 0;

    const totalAvailableTime = solution.stations.length * config.taktTime;
    const totalUsedTime = solution.stations.reduce((sum, s) => sum + s.totalTime, 0);
    const totalIdleTime = totalAvailableTime - totalUsedTime;

    // Efficiency score
    const efficiency = 1 - (totalIdleTime / totalAvailableTime);

    // Also penalize number of stations (more stations = more resources)
    // Minimum possible stations
    const minStations = Math.ceil(totalUsedTime / config.taktTime);
    const stationPenalty = minStations / solution.stations.length;

    // Combined score (weighted average)
    return 0.7 * efficiency + 0.3 * stationPenalty;
}

/**
 * Calculate social score
 * Based on workload balance: minimize variation between stations
 * Score = 1 - (std dev / mean), clamped to [0, 1]
 * 
 * @param {Solution} solution 
 * @param {ProblemConfig} config 
 * @returns {number} normalized score 0-1 (1 = best)
 */
export function calculateSocialScore(solution, config) {
    if (solution.stations.length <= 1) return 1;

    const times = solution.stations.map(s => s.totalTime);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;

    if (mean === 0) return 1;

    const variance = times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / times.length;
    const stdDev = Math.sqrt(variance);

    // Coefficient of variation (lower is better)
    const cv = stdDev / mean;

    // Convert to score (1 = perfectly balanced)
    const score = Math.max(0, 1 - cv);

    return score;
}

/**
 * Calculate environmental score
 * Based on tool usage and environmental impact scores
 * Lower environmental impact = higher score
 * 
 * @param {Solution} solution 
 * @param {ProblemConfig} config 
 * @returns {number} normalized score 0-1 (1 = best)
 */
export function calculateEnvironmentalScore(solution, config) {
    if (solution.stations.length === 0) return 0;

    let totalEnvImpact = 0;
    let maxPossibleImpact = 0;

    for (const station of solution.stations) {
        for (const task of station.tasks) {
            totalEnvImpact += task.envScore;
            maxPossibleImpact += 10; // Max env score per task
        }
    }

    if (maxPossibleImpact === 0) return 1;

    // Also consider tool diversity per station
    // Fewer unique tools per station = less environmental impact from tool changes
    let toolDiversityPenalty = 0;
    for (const station of solution.stations) {
        const uniqueTools = station.tools.size;
        toolDiversityPenalty += uniqueTools - 1; // Penalty for each additional tool type
    }

    // Normalize tool penalty
    const maxToolDiversity = solution.stations.length * config.toolLimits.size;
    const normalizedToolPenalty = maxToolDiversity > 0
        ? toolDiversityPenalty / maxToolDiversity
        : 0;

    // Calculate base environmental score
    const baseScore = 1 - (totalEnvImpact / maxPossibleImpact);

    // Combine with tool diversity (higher weight on base score)
    return 0.8 * baseScore + 0.2 * (1 - normalizedToolPenalty);
}

/**
 * Calculate all scores for a solution
 * @param {Solution} solution 
 * @param {ProblemConfig} config 
 * @returns {Solution} solution with updated scores
 */
export function calculateAllScores(solution, config) {
    solution.scores.economic = calculateEconomicScore(solution, config);
    solution.scores.social = calculateSocialScore(solution, config);
    solution.scores.environmental = calculateEnvironmentalScore(solution, config);

    // Calculate weighted score
    solution.scores.weighted =
        solution.scores.economic * config.weights.economic +
        solution.scores.social * config.weights.social +
        solution.scores.environmental * config.weights.environmental;

    return solution;
}

/**
 * Recalculate weighted scores for all solutions with new weights
 * @param {Solution[]} solutions 
 * @param {Object} weights 
 * @returns {Solution[]}
 */
export function updateWeightedScores(solutions, weights) {
    for (const solution of solutions) {
        solution.scores.weighted =
            solution.scores.economic * weights.economic +
            solution.scores.social * weights.social +
            solution.scores.environmental * weights.environmental;
    }
    return solutions;
}

/**
 * Get statistics for a set of solutions
 * @param {Solution[]} solutions 
 * @returns {Object} statistics
 */
export function getSolutionStatistics(solutions) {
    if (solutions.length === 0) {
        return {
            count: 0,
            bestWeighted: null,
            avgStations: 0,
            minStations: 0,
            maxStations: 0
        };
    }

    const stationCounts = solutions.map(s => s.stations.length);
    const weightedScores = solutions.map(s => s.scores.weighted);

    return {
        count: solutions.length,
        bestWeighted: Math.max(...weightedScores),
        avgWeighted: weightedScores.reduce((a, b) => a + b, 0) / weightedScores.length,
        avgStations: stationCounts.reduce((a, b) => a + b, 0) / stationCounts.length,
        minStations: Math.min(...stationCounts),
        maxStations: Math.max(...stationCounts),
        avgEconomic: solutions.reduce((sum, s) => sum + s.scores.economic, 0) / solutions.length,
        avgSocial: solutions.reduce((sum, s) => sum + s.scores.social, 0) / solutions.length,
        avgEnvironmental: solutions.reduce((sum, s) => sum + s.scores.environmental, 0) / solutions.length
    };
}
