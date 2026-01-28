/**
 * MOLB Game Tool - Objective Calculation
 * Formulas match the Excel game exactly
 */

/**
 * Calculate economic score
 * Formula: SUM(processing times) / (Takt Time × Number of Workstations)
 * = efficiency
 */
export function calculateEconomicScore(solution, config) {
    if (solution.stations.length === 0) return 0;

    const totalProcessingTime = solution.stations.reduce((sum, s) => sum + s.totalTime, 0);
    const numStations = solution.stations.length;

    // Economic = totalTime / (taktTime × stations)
    const efficiency = totalProcessingTime / (config.taktTime * numStations);

    return Math.min(1, efficiency); // Cap at 1
}

/**
 * Calculate social score
 * Formula: (MaxStdev - min(actualStdev, MaxStdev)) / MaxStdev
 * Lower stdev = higher score
 */
export function calculateSocialScore(solution, config) {
    if (solution.stations.length <= 1) return 1;

    const times = solution.stations.map(s => s.totalTime);
    const n = times.length;
    const mean = times.reduce((a, b) => a + b, 0) / n;

    // Population standard deviation (STDEV.P)
    const variance = times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / n;
    const stdev = Math.sqrt(variance);

    // Max Stdev from config (G4 in Excel = 24)
    const maxStdev = config.maxStdev || 24;

    // Social = (maxStdev - min(stdev, maxStdev)) / maxStdev
    const clampedStdev = Math.min(stdev, maxStdev);
    const score = (maxStdev - clampedStdev) / maxStdev;

    return Math.max(0, Math.min(1, score));
}

/**
 * Calculate environmental score
 * Formula: (TotalPossibleTools - UsedTools) / (TotalPossibleTools - MinVariety)
 * Fewer unique tools used = higher score
 */
export function calculateEnvironmentalScore(solution, config) {
    if (solution.stations.length === 0) return 0;

    // Count unique tools used per station (O column in Excel)
    let totalToolsUsed = 0;
    for (const station of solution.stations) {
        totalToolsUsed += station.tools.size; // Number of unique tool types per station
    }

    // Total possible tools = num tasks × num tool types (but simplified to count per station)
    // In Excel: SUM(Overview!$G$7:$L$36) = total possible tool assignments
    // We approximate as: numStations × maxToolTypes (3)
    const maxToolTypes = config.toolLimits.size || 3;
    const totalPossibleTools = solution.stations.length * maxToolTypes;

    // Min tools = variety setting (G5 = 3)
    const minVariety = config.minToolVariety || 3;

    // Environmental = (totalPossible - used) / (totalPossible - minVariety)
    const denominator = totalPossibleTools - minVariety;
    if (denominator <= 0) return 1;

    const score = (totalPossibleTools - totalToolsUsed) / denominator;

    return Math.max(0, Math.min(1, score));
}

/**
 * Calculate all scores for a solution
 */
export function calculateAllScores(solution, config) {
    solution.scores.economic = calculateEconomicScore(solution, config);
    solution.scores.social = calculateSocialScore(solution, config);
    solution.scores.environmental = calculateEnvironmentalScore(solution, config);

    // Weighted Sum = SUMPRODUCT(weights, scores) / SUM(weights)
    const wE = config.weights.economic || 9;
    const wS = config.weights.social || 6;
    const wEnv = config.weights.environmental || 8;

    const numerator =
        solution.scores.economic * wE +
        solution.scores.social * wS +
        solution.scores.environmental * wEnv;

    const denominator = wE + wS + wEnv;

    solution.scores.weighted = numerator / denominator;

    return solution;
}

/**
 * Recalculate weighted scores for all solutions with new weights
 */
export function updateWeightedScores(solutions, weights) {
    const wE = weights.economic || 9;
    const wS = weights.social || 6;
    const wEnv = weights.environmental || 8;
    const total = wE + wS + wEnv;

    for (const solution of solutions) {
        solution.scores.weighted = (
            solution.scores.economic * wE +
            solution.scores.social * wS +
            solution.scores.environmental * wEnv
        ) / total;
    }
    return solutions;
}

/**
 * Get statistics for a set of solutions
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
