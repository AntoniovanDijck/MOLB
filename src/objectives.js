/**
 * MOLB Game Tool - Objective Functions
 * Formules exact zoals in Excel
 */

/**
 * Calculate all scores for a solution
 * Excel formulas:
 * - Economic: SUM(taskTimes) / (taktTime * numStations)  [NOT maxStationTime!]
 * - Social: (MaxStdev - MIN(actualStdev, MaxStdev)) / MaxStdev
 * - Environmental: Based on total tool points in overview minus station tool usage
 * - Weighted: SUMPRODUCT(weights, scores) / SUM(weights)
 */
export function calculateAllScores(solution, config) {
    const stats = getSolutionStatistics(solution, config);

    // Get parameters from config
    const maxStdev = config.maxStdev || 24;
    const taktTime = config.taktTime || 47;

    // =======================================================
    // ECONOMIC SCORE (Efficiency)
    // Excel: =SUM(Overview!$E$7:$E$36)/(MAX(Balancing!G3)*COUNTA(Balancing!$M$9:$M$15))
    // G3 appears to be taktTime (47), NOT maxStationTime
    // = totalTaskTime / (taktTime * numberOfStations)
    // =======================================================
    const economicScore = stats.totalTime / (taktTime * stats.numStations);

    // =======================================================
    // SOCIAL SCORE (Workload Balance)
    // Excel: =($G$4-MIN(STDEV.P(Balancing!$N$9:$N$15),$G$4))/$G$4
    // = (maxStdev - MIN(actualStdev, maxStdev)) / maxStdev
    // =======================================================
    const clampedStdev = Math.min(stats.stdev, maxStdev);
    const socialScore = (maxStdev - clampedStdev) / maxStdev;

    // =======================================================
    // ENVIRONMENTAL SCORE (Tool Variety)
    // Excel: =(SUM(Overview!$G$7:$L$36)-SUM(Balancing!$O$9:$O$15))/(SUM(Overview!$G$7:$L$36)-Balancing!$G$5)
    //
    // Overview!G7:L36 = tool type indicators for each task (30 rows x 6 cols)
    // This represents all tasks that HAVE a tool type (count of tool assignments)
    // Balancing!O9:O15 = count of unique tool types per station
    // G5 = minimum possible = numStations (if each gets 1 tool type)
    //
    // Interpretation: 
    // - SUM(Overview!G7:L36) = count of tasks that have tool types (non-null)
    // - We need to match this exact logic
    // =======================================================
    const envScore = calculateEnvironmentalScore(solution, config);

    solution.scores = {
        economic: Math.min(1, Math.max(0, economicScore)),
        social: Math.min(1, Math.max(0, socialScore)),
        environmental: Math.min(1, Math.max(0, envScore)),
        weighted: 0
    };

    // =======================================================
    // WEIGHTED SCORE
    // Excel: =SUMPRODUCT(Balancing!$N$3:$N$5,Balancing!$O$3:$O$5)/SUM(Balancing!$N$3:$N$5)
    // = (w1*s1 + w2*s2 + w3*s3) / (w1 + w2 + w3)
    // =======================================================
    const weights = config.weights || { economic: 0.4, social: 0.3, environmental: 0.3 };
    const wSum = weights.economic + weights.social + weights.environmental;

    solution.scores.weighted = (
        solution.scores.economic * weights.economic +
        solution.scores.social * weights.social +
        solution.scores.environmental * weights.environmental
    ) / wSum;

    return solution.scores;
}

/**
 * Calculate environmental score
 * 
 * Excel formula interpretation:
 * - SUM(Overview!G7:L36) = total number of tasks (30)
 * - SUM(Balancing!O9:O15) = sum of unique tools per station (including 'None' as a tool type!)
 * - G5 = numStations
 * 
 * CRITICAL: Excel treats "None" (no tool) as a valid tool type!
 * So if a station has tasks with M1, M2, and null, it has 3 unique tool types.
 * 
 * Formula: (totalTasks - sumUniqueToolsPerStation) / (totalTasks - numStations)
 */
function calculateEnvironmentalScore(solution, config) {
    const numStations = solution.stations.length;

    // Count ALL tasks (including those without tools) - this is SUM(Overview!G7:L36)
    let totalTasks = 0;
    solution.stations.forEach(station => {
        totalTasks += station.tasks.length;
    });

    // Sum of unique tool types per station, treating null/'None' as a tool type
    // This is SUM(Balancing!O9:O15)
    let sumUniqueToolsPerStation = 0;
    solution.stations.forEach(station => {
        const uniqueTools = new Set();
        station.tasks.forEach(task => {
            // Treat null as 'None' tool type
            const toolType = task.toolType || 'None';
            uniqueTools.add(toolType);
        });
        sumUniqueToolsPerStation += uniqueTools.size;
    });

    // Minimum possible = numStations (G5) - if each station uses only 1 tool type
    const minPossible = numStations;

    // Formula: (totalTasks - sumUniqueToolsPerStation) / (totalTasks - minPossible)
    const denominator = totalTasks - minPossible;
    if (denominator <= 0) return 1;

    return (totalTasks - sumUniqueToolsPerStation) / denominator;
}

/**
 * Get statistics for a solution
 */
export function getSolutionStatistics(solution, config) {
    const stationTimes = solution.stations.map(s => s.totalTime);
    const totalTime = stationTimes.reduce((a, b) => a + b, 0);
    const numStations = solution.stations.length;

    const maxTime = Math.max(...stationTimes);
    const minTime = Math.min(...stationTimes);
    const avgTime = totalTime / numStations;

    // STDEV.P (population standard deviation) - same as Excel
    const variance = stationTimes.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) / numStations;
    const stdev = Math.sqrt(variance);

    // Efficiency = totalTime / (maxTime * numStations)
    const efficiency = totalTime / (maxTime * numStations);

    const theoreticalMin = Math.ceil(totalTime / config.taktTime);

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
