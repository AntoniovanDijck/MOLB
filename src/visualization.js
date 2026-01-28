/**
 * MOLB Game Tool - Visualization Module
 * Renders solutions, charts, and Pareto fronts
 */

/**
 * Render the best solution card
 * @param {Solution} solution 
 * @param {ProblemConfig} config 
 * @returns {string} HTML
 */
export function renderBestSolution(solution, config) {
    if (!solution) {
        return `<div class="empty-state large">
      <span class="empty-icon">❌</span>
      <p>Geen valide oplossingen gevonden</p>
    </div>`;
    }

    const stationBoxes = solution.stations.map(station => `
    <div class="station-box">
      <div class="station-name">${station.id}</div>
      <div class="station-tasks">${station.getTaskIds().join(', ')}</div>
      <div class="station-time">${station.totalTime}s / ${config.taktTime}s</div>
    </div>
  `).join('');

    return `
    <div class="solution-card best">
      <div class="solution-header">
        <div class="solution-title">
          <span>🎯</span> Beste Oplossing
        </div>
        <div class="solution-score">${solution.scores.weighted.toFixed(3)}</div>
      </div>
      <div class="solution-meta">
        ${solution.stations.length} stations | Efficiency: ${(solution.scores.economic * 100).toFixed(1)}%
      </div>
      <div class="station-grid">
        ${stationBoxes}
      </div>
    </div>
  `;
}

/**
 * Render score bars
 * @param {Solution} solution 
 * @returns {string} HTML
 */
export function renderScoreBars(solution) {
    if (!solution) return '';

    const scores = [
        { label: 'Economisch', value: solution.scores.economic, class: 'econ' },
        { label: 'Sociaal', value: solution.scores.social, class: 'social' },
        { label: 'Milieu', value: solution.scores.environmental, class: 'env' }
    ];

    const bars = scores.map(s => `
    <div class="score-bar">
      <span class="score-label">${s.label}</span>
      <div class="score-track">
        <div class="score-fill ${s.class}" style="width: ${s.value * 100}%"></div>
      </div>
      <span class="score-value">${s.value.toFixed(2)}</span>
    </div>
  `).join('');

    return `
    <div class="solution-card">
      <div class="solution-title">📈 Scores</div>
      <div class="score-bars">${bars}</div>
    </div>
  `;
}

/**
 * Render Pareto front as SVG scatter plot
 * @param {Solution[]} paretoFront 
 * @param {Solution[]} allSolutions 
 * @param {Solution} bestSolution 
 * @returns {string} HTML
 */
export function renderParetoChart(paretoFront, allSolutions, bestSolution) {
    const width = 400;
    const height = 250;
    const padding = 40;

    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;

    // Scale functions
    const xScale = (v) => padding + v * plotWidth;
    const yScale = (v) => height - padding - v * plotHeight;

    // Render points
    const allPoints = allSolutions.filter(s => s.isValid).map(solution => {
        const isPareto = paretoFront.some(p => p.getHash() === solution.getHash());
        const isBest = bestSolution && solution.getHash() === bestSolution.getHash();

        const x = xScale(solution.scores.economic);
        const y = yScale(solution.scores.social);

        let fill = 'rgba(99, 102, 241, 0.3)';
        let stroke = 'rgba(99, 102, 241, 0.5)';
        let r = 5;

        if (isPareto) {
            fill = 'rgba(99, 102, 241, 0.8)';
            stroke = '#6366f1';
            r = 7;
        }

        if (isBest) {
            fill = '#f59e0b';
            stroke = '#fbbf24';
            r = 9;
        }

        return `<circle 
      cx="${x}" cy="${y}" r="${r}" 
      fill="${fill}" stroke="${stroke}" stroke-width="2"
      class="pareto-point ${isBest ? 'selected' : ''}"
      data-hash="${solution.getHash()}"
      data-econ="${solution.scores.economic.toFixed(2)}"
      data-social="${solution.scores.social.toFixed(2)}"
      data-env="${solution.scores.environmental.toFixed(2)}"
    />`;
    }).join('');

    // Axes
    const xAxis = `<line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="rgba(255,255,255,0.2)" />`;
    const yAxis = `<line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="rgba(255,255,255,0.2)" />`;

    // Labels
    const xLabel = `<text x="${width / 2}" y="${height - 8}" fill="rgba(255,255,255,0.5)" font-size="12" text-anchor="middle">Economisch →</text>`;
    const yLabel = `<text x="12" y="${height / 2}" fill="rgba(255,255,255,0.5)" font-size="12" text-anchor="middle" transform="rotate(-90 12 ${height / 2})">Sociaal →</text>`;

    return `
    <div class="pareto-container">
      <div class="pareto-title">
        <span>🔵</span> Pareto Front (${paretoFront.length} oplossingen)
      </div>
      <svg class="pareto-chart" viewBox="0 0 ${width} ${height}">
        ${xAxis}${yAxis}
        ${xLabel}${yLabel}
        ${allPoints}
      </svg>
    </div>
  `;
}

/**
 * Render solutions table
 * @param {Solution[]} solutions - ranked solutions
 * @param {number} limit 
 * @returns {string} HTML
 */
export function renderSolutionsTable(solutions, limit = 10) {
    const displayed = solutions.slice(0, limit);

    const rows = displayed.map((solution, index) => `
    <tr data-hash="${solution.getHash()}">
      <td>#${index + 1}</td>
      <td>${solution.stations.length}</td>
      <td>${solution.scores.economic.toFixed(3)}</td>
      <td>${solution.scores.social.toFixed(3)}</td>
      <td>${solution.scores.environmental.toFixed(3)}</td>
      <td><strong>${solution.scores.weighted.toFixed(3)}</strong></td>
    </tr>
  `).join('');

    return `
    <div class="solutions-table-container">
      <h3>Top ${limit} Oplossingen</h3>
      <table class="solutions-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Stations</th>
            <th>Econ</th>
            <th>Sociaal</th>
            <th>Milieu</th>
            <th>Totaal</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      ${solutions.length > limit ? `<p style="margin-top: 12px; color: var(--text-muted); font-size: 13px;">
        Toont ${limit} van ${solutions.length} oplossingen
      </p>` : ''}
    </div>
  `;
}

/**
 * Render statistics cards
 * @param {Object} stats 
 * @returns {string} HTML
 */
export function renderStats(stats) {
    return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.count}</div>
        <div class="stat-label">Oplossingen</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.minStations}-${stats.maxStations}</div>
        <div class="stat-label">Stations</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${(stats.bestWeighted * 100).toFixed(1)}%</div>
        <div class="stat-label">Beste Score</div>
      </div>
    </div>
  `;
}

/**
 * Render peer review results
 * @param {PeerReviewReport} report 
 * @returns {string} HTML
 */
export function renderPeerReviewResults(report) {
    const summary = report.getSummary();

    const reviewItems = report.reviewedSolutions.map((result, index) => {
        let statusClass = 'valid';
        let statusText = '✅ Valide';

        if (!result.isValid) {
            statusClass = 'invalid';
            statusText = '❌ Ongeldig';
        } else if (result.isDominated) {
            statusClass = 'dominated';
            statusText = '⚠️ Gedomineerd';
        }

        return `
      <div class="review-item">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>Oplossing ${index + 1}</strong>
          <span class="review-status ${statusClass}">${statusText}</span>
        </div>
        ${result.errors.length > 0 ? `
          <ul style="margin-top: 8px; color: var(--error); font-size: 13px;">
            ${result.errors.map(e => `<li>${e}</li>`).join('')}
          </ul>
        ` : ''}
      </div>
    `;
    }).join('');

    return `
    <div class="peer-review-results">
      <h3>🔄 Peer Review Resultaten</h3>
      
      <div class="stats-grid" style="margin: 16px 0;">
        <div class="stat-card">
          <div class="stat-value">${summary.valid}/${summary.total}</div>
          <div class="stat-label">Valide</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${summary.dominated}</div>
          <div class="stat-label">Gedomineerd</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${summary.improvements}</div>
          <div class="stat-label">Verbeteringen</div>
        </div>
      </div>
      
      ${reviewItems}
      
      ${summary.improvements > 0 ? `
        <div style="margin-top: 16px; padding: 12px; background: rgba(34, 197, 94, 0.1); border-radius: 8px;">
          <strong style="color: var(--success);">💡 ${summary.improvements} verbeterde oplossingen gevonden!</strong>
          <p style="margin-top: 8px; font-size: 13px; color: var(--text-secondary);">
            Klik op "Export Resultaten" om de verbeteringen te downloaden.
          </p>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render a solution detail view
 * @param {Solution} solution 
 * @param {ProblemConfig} config 
 * @returns {string} HTML
 */
export function renderSolutionDetail(solution, config) {
    const stations = solution.stations.map(station => {
        const taskDetails = station.tasks.map(t =>
            `<span class="task-chip">${t.id} (${t.processingTime}s, ${t.toolType})</span>`
        ).join(' ');

        const utilization = ((station.totalTime / config.taktTime) * 100).toFixed(1);

        return `
      <div class="station-detail">
        <div class="station-detail-header">
          <strong>${station.id}</strong>
          <span>${station.totalTime}s / ${config.taktTime}s (${utilization}%)</span>
        </div>
        <div class="station-tasks-detail">${taskDetails}</div>
      </div>
    `;
    }).join('');

    return `
    <div class="solution-detail">
      <h3>Oplossingsdetails</h3>
      ${stations}
    </div>
  `;
}

/**
 * Show toast notification
 * @param {string} message 
 * @param {string} type - 'success' | 'error' | 'info'
 */
export function showToast(message, type = 'info') {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
    <span>${message}</span>
  `;

    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto-remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
