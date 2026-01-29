/**
 * Interactive Precedence Graph Editor
 * Drag & drop editor with sidebar and connection handles
 */

export class GraphEditor {
    constructor(container, config, onChange) {
        this.container = container;
        this.config = config;
        this.onChange = onChange;

        this.selectedNode = null;
        this.draggingNode = null;
        this.drawingEdge = false;
        this.edgeStart = null;
        this.mousePos = { x: 0, y: 0 };
        this.hoveredNode = null;

        this.nodePositions = new Map();
        this.nodeRadius = 28;
        this.handleRadius = 8;

        this.init();
    }

    init() {
        // Create wrapper
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'graph-editor-wrapper';

        // Create canvas area
        this.canvasContainer = document.createElement('div');
        this.canvasContainer.className = 'graph-editor-canvas-area';

        this.canvas = document.createElement('canvas');
        this.canvas.className = 'graph-editor-canvas';
        this.ctx = this.canvas.getContext('2d');
        this.canvasContainer.appendChild(this.canvas);

        // Create sidebar with draggable items
        this.sidebar = document.createElement('div');
        this.sidebar.className = 'graph-editor-sidebar';
        this.sidebar.innerHTML = `
            <h4>🧩 Taken</h4>
            <div class="drag-item" data-tool="" draggable="true">
                <div class="drag-node grey"></div>
                <span>Geen tool</span>
            </div>
            <div class="drag-item" data-tool="M1" draggable="true">
                <div class="drag-node green"></div>
                <span>M1 Tool</span>
            </div>
            <div class="drag-item" data-tool="M2" draggable="true">
                <div class="drag-node blue"></div>
                <span>M2 Tool</span>
            </div>
            <div class="drag-item" data-tool="M3" draggable="true">
                <div class="drag-node orange"></div>
                <span>M3 Tool</span>
            </div>
            <hr>
            <h4>💡 Tips</h4>
            <ul class="tips-list">
                <li>Sleep taak naar canvas</li>
                <li>Sleep ● handle naar andere taak</li>
                <li>Dubbelklik om te bewerken</li>
                <li>Rechtsklik om te verwijderen</li>
            </ul>
        `;

        this.wrapper.appendChild(this.canvasContainer);
        this.wrapper.appendChild(this.sidebar);

        this.container.innerHTML = '';
        this.container.appendChild(this.wrapper);

        this.resize();
        this.initPositions();
        this.bindEvents();
        this.render();

        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvasContainer.getBoundingClientRect();
        this.canvas.width = rect.width || 600;
        this.canvas.height = rect.height || 500;
        this.render();
    }

    initPositions() {
        const tasks = Array.from(this.config.tasks.values());
        if (tasks.length === 0) return;

        const cols = Math.ceil(Math.sqrt(tasks.length));
        const rows = Math.ceil(tasks.length / cols);
        const cellW = this.canvas.width / (cols + 1);
        const cellH = this.canvas.height / (rows + 1);

        tasks.forEach((task, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            this.nodePositions.set(task.id, {
                x: cellW * (col + 1),
                y: cellH * (row + 1)
            });
        });
    }

    bindEvents() {
        // Canvas events
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
        this.canvas.addEventListener('contextmenu', (e) => this.onContextMenu(e));

        // Drag & drop from sidebar
        this.sidebar.querySelectorAll('.drag-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('toolType', item.dataset.tool);
            });
        });

        this.canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        this.canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            const toolType = e.dataTransfer.getData('toolType');
            const pos = this.getMousePos(e);
            this.addTaskAt(pos, toolType || null);
        });
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    getNodeAt(pos) {
        for (const [id, nodePos] of this.nodePositions) {
            const dx = pos.x - nodePos.x;
            const dy = pos.y - nodePos.y;
            if (Math.sqrt(dx * dx + dy * dy) < this.nodeRadius) {
                return { id, type: 'node' };
            }
        }
        return null;
    }

    getHandleAt(pos) {
        // Check if clicking on a connection handle (right side of node)
        for (const [id, nodePos] of this.nodePositions) {
            const handleX = nodePos.x + this.nodeRadius + 5;
            const handleY = nodePos.y;
            const dx = pos.x - handleX;
            const dy = pos.y - handleY;
            if (Math.sqrt(dx * dx + dy * dy) < this.handleRadius + 3) {
                return id;
            }
        }
        return null;
    }

    onMouseDown(e) {
        const pos = this.getMousePos(e);

        // Check handle first
        const handleNode = this.getHandleAt(pos);
        if (handleNode) {
            this.drawingEdge = true;
            this.edgeStart = handleNode;
            this.render();
            return;
        }

        // Check node
        const nodeInfo = this.getNodeAt(pos);
        if (nodeInfo) {
            this.draggingNode = nodeInfo.id;
            this.selectedNode = nodeInfo.id;
        }
        this.render();
    }

    onMouseMove(e) {
        this.mousePos = this.getMousePos(e);

        // Update hover state
        const handleNode = this.getHandleAt(this.mousePos);
        const nodeInfo = this.getNodeAt(this.mousePos);
        this.hoveredNode = handleNode || (nodeInfo?.id);

        if (this.draggingNode) {
            this.nodePositions.set(this.draggingNode, { ...this.mousePos });
        }

        this.render();
    }

    onMouseUp(e) {
        const pos = this.getMousePos(e);

        if (this.drawingEdge) {
            const nodeInfo = this.getNodeAt(pos);
            if (nodeInfo && nodeInfo.id !== this.edgeStart) {
                this.addEdge(this.edgeStart, nodeInfo.id);
            }
            this.drawingEdge = false;
            this.edgeStart = null;
        }

        this.draggingNode = null;
        this.render();
    }

    onDoubleClick(e) {
        const pos = this.getMousePos(e);
        const nodeInfo = this.getNodeAt(pos);

        if (nodeInfo) {
            this.editTask(nodeInfo.id);
        }
    }

    onContextMenu(e) {
        e.preventDefault();
        const pos = this.getMousePos(e);
        const nodeInfo = this.getNodeAt(pos);

        if (nodeInfo) {
            if (confirm(`Taak ${nodeInfo.id} verwijderen?`)) {
                this.deleteTask(nodeInfo.id);
            }
        }
    }

    addTaskAt(pos, toolType = null) {
        const taskNum = this.config.tasks.size + 1;
        const id = `T${taskNum}`;

        const time = prompt('Verwerkingstijd (seconden):', '10');
        if (!time) return;

        const task = {
            id,
            processingTime: parseInt(time),
            toolType: toolType
        };
        this.config.tasks.set(id, task);
        this.nodePositions.set(id, pos);

        this.onChange();
        this.render();
    }

    addEdge(from, to) {
        const existing = this.config.precedence.get(to) || [];
        if (!existing.includes(from)) {
            existing.push(from);
            this.config.precedence.set(to, existing);
            this.onChange();
        }
        this.render();
    }

    editTask(id) {
        const task = this.config.tasks.get(id);
        if (!task) return;

        const time = prompt('Verwerkingstijd:', task.processingTime);
        if (time !== null) task.processingTime = parseInt(time);

        const tool = prompt('Tool type (M1/M2/M3, leeg = geen):', task.toolType || '');
        if (tool !== null) task.toolType = tool ? tool.toUpperCase() : null;

        this.onChange();
        this.render();
    }

    deleteTask(id) {
        this.config.tasks.delete(id);
        this.nodePositions.delete(id);
        this.config.precedence.delete(id);

        for (const [to, froms] of this.config.precedence) {
            const idx = froms.indexOf(id);
            if (idx > -1) froms.splice(idx, 1);
        }

        this.onChange();
        this.render();
    }

    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Clear
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, w, h);

        // Draw grid
        ctx.strokeStyle = '#1a1a2a';
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Draw edges
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 2;
        for (const [to, froms] of this.config.precedence) {
            const toPos = this.nodePositions.get(to);
            if (!toPos) continue;

            for (const from of froms) {
                const fromPos = this.nodePositions.get(from);
                if (!fromPos) continue;
                this.drawArrow(fromPos, toPos);
            }
        }

        // Draw edge being created
        if (this.drawingEdge && this.edgeStart) {
            const startPos = this.nodePositions.get(this.edgeStart);
            if (startPos) {
                ctx.strokeStyle = '#6366f1';
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(startPos.x + this.nodeRadius + 5, startPos.y);
                ctx.lineTo(this.mousePos.x, this.mousePos.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // Draw nodes
        for (const [id, pos] of this.nodePositions) {
            this.drawNode(id, pos);
        }
    }

    drawNode(id, pos) {
        const ctx = this.ctx;
        const task = this.config.tasks.get(id);
        const isSelected = this.selectedNode === id;
        const isHovered = this.hoveredNode === id;

        // Get color based on tool type
        let color = '#6b7280';
        if (task?.toolType === 'M1') color = '#22c55e';
        if (task?.toolType === 'M2') color = '#3b82f6';
        if (task?.toolType === 'M3') color = '#f59e0b';

        // Draw glow
        if (isSelected || isHovered) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 15;
        }

        // Draw circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this.nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (isSelected) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        ctx.shadowBlur = 0;

        // Draw connection handle (right side)
        const handleX = pos.x + this.nodeRadius + 5;
        const handleY = pos.y;
        ctx.beginPath();
        ctx.arc(handleX, handleY, this.handleRadius, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#6366f1' : '#4a5568';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(id.replace('T', ''), pos.x, pos.y - 4);

        // Draw time
        if (task) {
            ctx.font = '10px Inter, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.fillText(`${task.processingTime}s`, pos.x, pos.y + 10);
        }
    }

    drawArrow(from, to) {
        const ctx = this.ctx;
        const angle = Math.atan2(to.y - from.y, to.x - from.x);

        const startX = from.x + this.nodeRadius + 5 + this.handleRadius;
        const startY = from.y;
        const endX = to.x - Math.cos(angle) * (this.nodeRadius + 8);
        const endY = to.y - Math.sin(angle) * (this.nodeRadius + 8);

        // Draw curved line
        ctx.beginPath();
        ctx.moveTo(startX, startY);

        // Use quadratic curve for nicer look
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2 - 20;
        ctx.quadraticCurveTo(midX, midY, endX, endY);
        ctx.stroke();

        // Draw arrowhead
        const headLen = 10;
        const headAngle = Math.atan2(endY - midY, endX - midX);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headLen * Math.cos(headAngle - 0.4), endY - headLen * Math.sin(headAngle - 0.4));
        ctx.lineTo(endX - headLen * Math.cos(headAngle + 0.4), endY - headLen * Math.sin(headAngle + 0.4));
        ctx.closePath();
        ctx.fillStyle = '#4a5568';
        ctx.fill();
    }

    clear() {
        this.config.tasks.clear();
        this.config.precedence.clear();
        this.nodePositions.clear();
        this.selectedNode = null;
        this.onChange();
        this.render();
    }
}
