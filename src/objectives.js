/**
 * MOLB Game Tool - Objective Functions
 * Multi-objective scoring for line balancing solutions
 */

/**
 * Calculate all scores for a solution
 * @param {Solution} solution 
 * @param {ProblemConfig} config 
 */
export function calculateAllScores(solution, config) {
    const stats = getSolutionStatistics(solution, config);

    // Economic score: based on number of stations (fewer = better) and efficiency
    const minStations = Math.ceil(stats.totalTime / config.taktTime);
    const economicScore = (minStations / solution.stations.length) * stats.efficiency;

    // Social score: based on workload balance (lower variance = better)
    const maxVariance = Math.pow(config.taktTime / 2, 2);
    const socialScore = Math.max(0, 1 - (stats.variance / maxVariance));

    // Environmental score: based on tool variety (fewer unique tools = better)
    const allTools = new Set();
    solution.stations.forEach(s => s.tasks.forEach(t => allTools.add(t.toolType)));
    const maxTools = 3; // M1, M2, M3
    const envScore = 1 - ((allTools.size - 1) / (maxTools - 1)) * 0.2;

    solution.scores = {
        economic: Math.min(1, Math.max(0, economicScore)),
        social: Math.min(1, Math.max(0, socialScore)),
        environmental: Math.min(1, Math.max(0, envScore)),
        weighted: 0
    };

    // Calculate weighted score
    const weights = config.weights || { economic: 0.4, social: 0.3, environmental: 0.3 };
    solution.scores.weighted =
        solution.scores.economic * weights.economic +
        solution.scores.social * weights.social +
        solution.scores.environmental * weights.environmental;

    return solution.scores;
}

/**
 * Get statistics for a solution
 * @param {Solution} solution 
 * @param {ProblemConfig} config 
 */
export function getSolutionStatistics(solution, config) {
    const stationTimes = solution.stations.map(s => s.totalTime);
    const totalTime = stationTimes.reduce((a, b) => a + b, 0);
    const numStations = solution.stations.length;

    const maxTime = Math.max(...stationTimes);
    const minTime = Math.min(...stationTimes);
    const avgTime = totalTime / numStations;

    // Variance
    const variance = stationTimes.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) / numStations;
    const stdev = Math.sqrt(variance);

    // Efficiency
    const theoreticalMin = Math.ceil(totalTime / config.taktTime);
    const efficiency = totalTime / (numStations * config.taktTime);

    return {
        totalTime,
        numStations,
        maxTime,
        minTime,
        avgTime,
        variance,
        stdev,
        efficiency,
        theoreticalMin
    };
}
