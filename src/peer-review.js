/**
 * MOLB Game Tool - Peer Review Module
 * Evaluates and improves solutions from other teams
 */

import { checkFeasibility, validateSolution } from './feasibility.js';
import { calculateAllScores } from './objectives.js';
import { findParetoFront, dominates, rankSolutions } from './pareto.js';
import { generateAllSolutions } from './heuristics.js';
import { Solution, ProblemConfig } from './models.js';

/**
 * Review result for a single solution
 */
export class ReviewResult {
    constructor(solution) {
        this.solution = solution;
        this.isValid = true;
        this.errors = [];
        this.isDominated = false;
        this.dominatedBy = null;
        this.improvementSuggestions = [];
    }
}

/**
 * Complete peer review report
 */
export class PeerReviewReport {
    constructor() {
        this.reviewedSolutions = [];
        this.validCount = 0;
        this.invalidCount = 0;
        this.dominatedCount = 0;
        this.paretoFrontCount = 0;
        this.improvedSolutions = [];
        this.suggestions = [];
    }

    getSummary() {
        return {
            total: this.reviewedSolutions.length,
            valid: this.validCount,
            invalid: this.invalidCount,
            dominated: this.dominatedCount,
            paretoOptimal: this.paretoFrontCount,
            improvements: this.improvedSolutions.length
        };
    }
}

/**
 * Review a set of solutions from another team
 * @param {Solution[]} solutions - solutions to review
 * @param {ProblemConfig} config - problem configuration
 * @param {boolean} generateImprovements - whether to search for better solutions
 * @returns {PeerReviewReport}
 */
export function reviewSolutions(solutions, config, generateImprovements = true) {
    const report = new PeerReviewReport();

    // Step 1: Validate all solutions
    for (const solution of solutions) {
        const result = new ReviewResult(solution);

        // Check feasibility
        const feasibility = checkFeasibility(solution, config);
        result.isValid = feasibility.isValid;
        result.errors = feasibility.errors;

        if (result.isValid) {
            // Calculate scores if valid
            calculateAllScores(solution, config);
            report.validCount++;
        } else {
            report.invalidCount++;
        }

        report.reviewedSolutions.push(result);
    }

    // Step 2: Check Pareto dominance among valid solutions
    const validSolutions = solutions.filter(s => s.isValid);
    const paretoFront = findParetoFront(validSolutions);
    const paretoSet = new Set(paretoFront.map(s => s.getHash()));

    for (const result of report.reviewedSolutions) {
        if (!result.isValid) continue;

        const hash = result.solution.getHash();
        if (paretoSet.has(hash)) {
            report.paretoFrontCount++;
        } else {
            result.isDominated = true;
            report.dominatedCount++;

            // Find which solution dominates this one
            for (const pareto of paretoFront) {
                if (dominates(pareto, result.solution)) {
                    result.dominatedBy = pareto;
                    break;
                }
            }
        }
    }

    // Step 3: Generate improved solutions if requested
    if (generateImprovements) {
        const ownSolutions = generateAllSolutions(config, {
            iterations: 50 // Quick search
        });

        // Validate and score our solutions
        for (const solution of ownSolutions) {
            validateSolution(solution, config);
            if (solution.isValid) {
                calculateAllScores(solution, config);
            }
        }

        const ownValid = ownSolutions.filter(s => s.isValid);

        // Check if any of our solutions dominate their Pareto front
        for (const ownSolution of ownValid) {
            let dominatesAny = false;

            for (const theirSolution of paretoFront) {
                if (dominates(ownSolution, theirSolution)) {
                    dominatesAny = true;
                    report.suggestions.push({
                        type: 'dominating_solution',
                        message: `Oplossing gevonden die hun Pareto-oplossing domineert`,
                        theirHash: theirSolution.getHash(),
                        ourSolution: ownSolution
                    });
                }
            }

            if (dominatesAny) {
                report.improvedSolutions.push(ownSolution);
            }
        }

        // Also find solutions that extend their Pareto front
        const combinedSolutions = [...validSolutions, ...ownValid];
        const combinedPareto = findParetoFront(combinedSolutions);

        for (const solution of combinedPareto) {
            if (!paretoSet.has(solution.getHash())) {
                // This is a new Pareto-optimal solution
                const isOurs = ownValid.some(s => s.getHash() === solution.getHash());
                if (isOurs && !report.improvedSolutions.some(s => s.getHash() === solution.getHash())) {
                    report.improvedSolutions.push(solution);
                    report.suggestions.push({
                        type: 'pareto_extension',
                        message: `Nieuwe Pareto-optimale oplossing gevonden`,
                        ourSolution: solution
                    });
                }
            }
        }
    }

    return report;
}

/**
 * Generate a formatted review report
 * @param {PeerReviewReport} report 
 * @returns {string} formatted report text
 */
export function formatReviewReport(report) {
    const summary = report.getSummary();

    let text = `# Peer Review Rapport\n\n`;
    text += `## Samenvatting\n`;
    text += `- Totaal geëvalueerde oplossingen: ${summary.total}\n`;
    text += `- Valide oplossingen: ${summary.valid}\n`;
    text += `- Ongeldige oplossingen: ${summary.invalid}\n`;
    text += `- Pareto-optimale oplossingen: ${summary.paretoOptimal}\n`;
    text += `- Gedomineerde oplossingen: ${summary.dominated}\n`;
    text += `- Verbeterde alternatieven gevonden: ${summary.improvements}\n\n`;

    if (summary.invalid > 0) {
        text += `## Ongeldige Oplossingen\n`;
        for (let i = 0; i < report.reviewedSolutions.length; i++) {
            const result = report.reviewedSolutions[i];
            if (!result.isValid) {
                text += `\n### Oplossing ${i + 1}\n`;
                text += `Fouten:\n`;
                result.errors.forEach(err => {
                    text += `- ${err}\n`;
                });
            }
        }
        text += '\n';
    }

    if (summary.dominated > 0) {
        text += `## Gedomineerde Oplossingen\n`;
        text += `De volgende oplossingen zijn niet Pareto-optimaal:\n`;
        for (let i = 0; i < report.reviewedSolutions.length; i++) {
            const result = report.reviewedSolutions[i];
            if (result.isDominated) {
                text += `- Oplossing ${i + 1}`;
                if (result.dominatedBy) {
                    const s = result.solution.scores;
                    const d = result.dominatedBy.scores;
                    text += ` (${s.economic.toFixed(2)}/${s.social.toFixed(2)}/${s.environmental.toFixed(2)}) `;
                    text += `gedomineerd door (${d.economic.toFixed(2)}/${d.social.toFixed(2)}/${d.environmental.toFixed(2)})`;
                }
                text += `\n`;
            }
        }
        text += '\n';
    }

    if (summary.improvements > 0) {
        text += `## Verbeteringen\n`;
        text += `Wij hebben ${summary.improvements} betere oplossingen gevonden:\n\n`;

        for (const suggestion of report.suggestions) {
            if (suggestion.type === 'dominating_solution') {
                const s = suggestion.ourSolution.scores;
                text += `- **Dominerende oplossing**: Econ=${s.economic.toFixed(2)}, `;
                text += `Soc=${s.social.toFixed(2)}, Mil=${s.environmental.toFixed(2)}\n`;
            } else if (suggestion.type === 'pareto_extension') {
                const s = suggestion.ourSolution.scores;
                text += `- **Pareto-uitbreiding**: Econ=${s.economic.toFixed(2)}, `;
                text += `Soc=${s.social.toFixed(2)}, Mil=${s.environmental.toFixed(2)}\n`;
            }
        }
    }

    return text;
}

/**
 * Import solutions from JSON
 * @param {Object} json 
 * @param {ProblemConfig} config 
 * @returns {Solution[]}
 */
export function importSolutionsFromJSON(json, config) {
    if (!json.solutions || !Array.isArray(json.solutions)) {
        throw new Error('Ongeldig formaat: verwacht een array van oplossingen');
    }

    const taskMap = config.tasks;
    return json.solutions.map(sData => Solution.fromJSON(sData, taskMap));
}

/**
 * Export solutions to JSON
 * @param {Solution[]} solutions 
 * @returns {Object}
 */
export function exportSolutionsToJSON(solutions) {
    return {
        solutions: solutions.map(s => s.toJSON()),
        exportedAt: new Date().toISOString()
    };
}
