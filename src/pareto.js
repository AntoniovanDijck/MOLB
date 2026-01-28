/**
 * MOLB Game Tool - Pareto Analysis
 * Identifies non-dominated solutions and the Pareto front
 */

/**
 * Check if solution A dominates solution B
 * A dominates B if A is at least as good in all objectives and better in at least one
 * 
 * @param {Solution} a 
 * @param {Solution} b 
 * @returns {boolean} true if A dominates B
 */
export function dominates(a, b) {
    const aScores = [a.scores.economic, a.scores.social, a.scores.environmental];
    const bScores = [b.scores.economic, b.scores.social, b.scores.environmental];

    let atLeastAsGood = true;
    let betterInOne = false;

    for (let i = 0; i < 3; i++) {
        if (aScores[i] < bScores[i]) {
            atLeastAsGood = false;
            break;
        }
        if (aScores[i] > bScores[i]) {
            betterInOne = true;
        }
    }

    return atLeastAsGood && betterInOne;
}

/**
 * Find the Pareto-optimal solutions (non-dominated set)
 * @param {Solution[]} solutions 
 * @returns {Solution[]} Pareto-optimal solutions
 */
export function findParetoFront(solutions) {
    if (solutions.length === 0) return [];

    // Filter out invalid solutions first
    const validSolutions = solutions.filter(s => s.isValid);
    if (validSolutions.length === 0) return [];

    const paretoFront = [];

    for (const candidate of validSolutions) {
        let isDominated = false;

        for (const other of validSolutions) {
            if (candidate === other) continue;

            if (dominates(other, candidate)) {
                isDominated = true;
                break;
            }
        }

        if (!isDominated) {
            paretoFront.push(candidate);
        }
    }

    return paretoFront;
}

/**
 * Find the best solution based on weighted score
 * @param {Solution[]} solutions 
 * @returns {Solution|null}
 */
export function findBestSolution(solutions) {
    if (solutions.length === 0) return null;

    const validSolutions = solutions.filter(s => s.isValid);
    if (validSolutions.length === 0) return null;

    return validSolutions.reduce((best, current) =>
        current.scores.weighted > best.scores.weighted ? current : best
    );
}

/**
 * Find the best solution from the Pareto front based on weighted score
 * @param {Solution[]} solutions 
 * @returns {Solution|null}
 */
export function findBestParetoSolution(solutions) {
    const paretoFront = findParetoFront(solutions);
    return findBestSolution(paretoFront);
}

/**
 * Rank solutions by weighted score
 * @param {Solution[]} solutions 
 * @returns {Solution[]} sorted by weighted score (descending)
 */
export function rankSolutions(solutions) {
    return [...solutions]
        .filter(s => s.isValid)
        .sort((a, b) => b.scores.weighted - a.scores.weighted);
}

/**
 * Get dominated solutions (not in Pareto front)
 * @param {Solution[]} solutions 
 * @returns {Solution[]}
 */
export function getDominatedSolutions(solutions) {
    const paretoFront = findParetoFront(solutions);
    const paretoSet = new Set(paretoFront.map(s => s.getHash()));

    return solutions.filter(s => s.isValid && !paretoSet.has(s.getHash()));
}

/**
 * Calculate crowding distance for Pareto solutions
 * Used for selecting diverse solutions from the front
 * @param {Solution[]} paretoFront 
 * @returns {Map<string, number>} solution hash -> crowding distance
 */
export function calculateCrowdingDistance(paretoFront) {
    const distances = new Map();

    if (paretoFront.length <= 2) {
        paretoFront.forEach(s => distances.set(s.getHash(), Infinity));
        return distances;
    }

    // Initialize distances
    paretoFront.forEach(s => distances.set(s.getHash(), 0));

    // For each objective
    const objectives = ['economic', 'social', 'environmental'];

    for (const obj of objectives) {
        // Sort by this objective
        const sorted = [...paretoFront].sort((a, b) => a.scores[obj] - b.scores[obj]);

        // Set boundary solutions to infinity
        distances.set(sorted[0].getHash(), Infinity);
        distances.set(sorted[sorted.length - 1].getHash(), Infinity);

        // Calculate range
        const range = sorted[sorted.length - 1].scores[obj] - sorted[0].scores[obj];
        if (range === 0) continue;

        // Update intermediate solutions
        for (let i = 1; i < sorted.length - 1; i++) {
            const hash = sorted[i].getHash();
            const currentDist = distances.get(hash);

            if (currentDist !== Infinity) {
                const newDist = (sorted[i + 1].scores[obj] - sorted[i - 1].scores[obj]) / range;
                distances.set(hash, currentDist + newDist);
            }
        }
    }

    return distances;
}

/**
 * Select diverse solutions from the Pareto front
 * @param {Solution[]} paretoFront 
 * @param {number} count - number of solutions to select
 * @returns {Solution[]}
 */
export function selectDiverseSolutions(paretoFront, count) {
    if (paretoFront.length <= count) return paretoFront;

    const distances = calculateCrowdingDistance(paretoFront);

    // Sort by crowding distance (descending)
    const sorted = [...paretoFront].sort((a, b) =>
        distances.get(b.getHash()) - distances.get(a.getHash())
    );

    return sorted.slice(0, count);
}

/**
 * Analyze solutions and return comprehensive results
 * @param {Solution[]} solutions 
 * @param {ProblemConfig} config 
 * @returns {Object}
 */
export function analyzeSolutions(solutions, config) {
    const validSolutions = solutions.filter(s => s.isValid);
    const paretoFront = findParetoFront(solutions);
    const bestSolution = findBestParetoSolution(solutions);
    const dominatedCount = validSolutions.length - paretoFront.length;

    return {
        totalSolutions: solutions.length,
        validSolutions: validSolutions.length,
        invalidSolutions: solutions.length - validSolutions.length,
        paretoFrontSize: paretoFront.length,
        dominatedCount,
        bestSolution,
        paretoFront,
        rankedSolutions: rankSolutions(solutions)
    };
}
