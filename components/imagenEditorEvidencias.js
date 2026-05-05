// /components/imagenEditorEvidencias.js
// Componente reutilizable para el editor de imágenes con herramientas de dibujo
// Modificado: permite mover las figuras después de dibujarlas
// Mejoras: responsive perfecto + cursores dinámicos

class ImageEditorModal {
    constructor() {
        this.modal = null;
        this.canvas = null;
        this.ctx = null;
        this.image = null;
        this.elements = [];
        this.currentTool = 'circle';
        this.currentColor = '#ff0000';
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.currentFile = null;
        this.currentIndex = -1;
        this.onSaveCallback = null;
        this.comentario = '';

        // Variables para mover elementos
        this.selectedElement = null;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        this.init();
    }

    init() {
        this.injectStyles();
        this.createModalStructure();
        this.setupEventListeners();
    }

    injectStyles() {
        if (document.getElementById('image-editor-modal-styles')) return;

        const styles = `
            /* =============================================
               MODAL EDITOR DE IMAGEN (COMPONENTE REUTILIZABLE)
               VERSIÓN MEJORADA: RESPONSIVE + CURSORES DINÁMICOS
               ============================================= */
            .image-editor-modal {
                display: none;
                position: fixed;
                z-index: 10000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                overflow: auto;
                background-color: rgba(0, 0, 0, 0.9);
                backdrop-filter: blur(5px);
            }

            .image-editor-modal .modal-content {
                position: relative;
                margin: 20px auto;
                width: 95%;
                max-width: 1400px;
                height: calc(100vh - 40px);
                background: var(--color-bg-secondary);
                border: 2px solid var(--color-accent-primary);
                border-radius: var(--border-radius-large);
                box-shadow: 0 0 30px rgba(0, 207, 255, 0.3);
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }

            .image-editor-modal .modal-header {
                padding: 20px 25px;
                background: rgba(20, 20, 20, 0.95);
                border-bottom: 2px solid var(--color-accent-primary);
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 10px;
            }

            .image-editor-modal .modal-header h5 {
                color: var(--color-text-primary);
                font-family: var(--font-family-primary);
                font-size: 20px;
                margin: 0;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .image-editor-modal .modal-header h5 i {
                color: var(--color-accent-primary);
            }

            .image-editor-modal .modal-close {
                background: none;
                border: none;
                color: var(--color-text-secondary);
                font-size: 28px;
                cursor: pointer;
                transition: all 0.3s ease;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
            }

            .image-editor-modal .modal-close:hover {
                color: var(--color-danger);
                background: rgba(220, 53, 69, 0.1);
                transform: rotate(90deg);
            }

            .image-editor-modal .modal-body {
                flex: 1;
                padding: 20px;
                overflow: auto;
            }

            /* Layout flex que se adapta */
            .image-editor-modal .editor-layout {
                display: flex;
                gap: 20px;
                height: 100%;
            }

            /* Panel del canvas (ocupa más espacio) */
            .image-editor-modal .editor-canvas-panel {
                flex: 2;
                display: flex;
                flex-direction: column;
                gap: 15px;
                min-width: 0; /* importante para evitar desborde */
            }

            .image-editor-modal .canvas-container {
                background: #1a1a1a;
                border-radius: var(--border-radius-medium);
                overflow: auto;
                display: flex;
                justify-content: center;
                align-items: center;
                border: 2px solid var(--color-border-light);
                flex: 1;
                min-height: 0; /* para que respete el alto */
            }

            .image-editor-modal #modalImageCanvas {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                /* cursor por defecto: crosshair para dibujar */
                cursor: crosshair;
            }

            /* Cursores dinámicos según el estado */
            .image-editor-modal #modalImageCanvas.moving {
                cursor: grab !important;
            }
            .image-editor-modal #modalImageCanvas.grabbing {
                cursor: grabbing !important;
            }
            .image-editor-modal #modalImageCanvas.drawing {
                cursor: crosshair !important;
            }

            /* Panel de herramientas */
            .image-editor-modal .editor-tools-panel {
                flex: 1;
                min-width: 280px;
                background: var(--color-bg-tertiary);
                border-radius: var(--border-radius-medium);
                padding: 20px;
                border: 1px solid var(--color-border-light);
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 20px;
            }

            .image-editor-modal .tools-section {
                /* sin margin-bottom, usamos gap del padre */
            }

            .image-editor-modal .tools-section h6 {
                color: var(--color-text-primary);
                font-family: var(--font-family-primary);
                font-size: 14px;
                margin-bottom: 15px;
                padding-bottom: 8px;
                border-bottom: 2px solid var(--color-accent-primary);
                text-transform: uppercase;
            }

            .image-editor-modal .tools-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
            }

            .image-editor-modal .tool-btn-large {
                background: linear-gradient(145deg, #0f0f0f, #1a1a1a);
                border: 2px solid var(--color-border-light);
                color: var(--color-text-primary);
                padding: 15px;
                border-radius: var(--border-radius-medium);
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                font-size: 14px;
            }

            .image-editor-modal .tool-btn-large:hover {
                border-color: var(--color-accent-primary);
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(0, 207, 255, 0.2);
            }

            .image-editor-modal .tool-btn-large.active {
                background: var(--color-accent-primary);
                color: #000;
                border-color: var(--color-accent-primary);
            }

            .image-editor-modal .tool-btn-large.active i {
                color: #000;
            }

            .image-editor-modal .tool-btn-large i {
                font-size: 24px;
                color: var(--color-accent-primary);
            }

            .image-editor-modal .color-picker {
                display: flex;
                gap: 10px;
                align-items: center;
            }

            .image-editor-modal #modalColorPicker {
                width: 50px;
                height: 50px;
                border: 2px solid var(--color-border-light);
                border-radius: var(--border-radius-small);
                cursor: pointer;
                background: transparent;
            }

            .image-editor-modal .color-value {
                background: var(--color-bg-secondary);
                padding: 8px 12px;
                border-radius: var(--border-radius-small);
                border: 1px solid var(--color-border-light);
                font-family: monospace;
                color: var(--color-text-secondary);
            }

            .image-editor-modal .action-buttons-vertical {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .image-editor-modal .action-buttons-vertical .tool-btn-large {
                width: 100%;
                flex-direction: row;
                justify-content: center;
            }

            .image-editor-modal #modalLimpiarTodo:hover {
                border-color: var(--color-warning);
            }

            .image-editor-modal #modalGuardarCambios:hover {
                border-color: var(--color-success);
            }

            .image-editor-modal #modalCancelar:hover {
                border-color: var(--color-danger);
            }

            .image-editor-modal .image-info {
                color: var(--color-text-secondary);
                font-size: 13px;
                text-align: center;
                padding: 8px;
                background: rgba(0, 0, 0, 0.3);
                border-radius: var(--border-radius-small);
            }

            /* ========== RESPONSIVE: MÓVIL ========== */
            @media (max-width: 768px) {
                .image-editor-modal .editor-layout {
                    flex-direction: column;
                }

                .image-editor-modal .modal-content {
                    width: 98%;
                    margin: 10px auto;
                    height: calc(100vh - 20px);
                }

                /* El canvas ocupa un alto fijo pero proporcionado */
                .image-editor-modal .canvas-container {
                    min-height: 300px;
                    height: auto;
                }

                /* El panel de herramientas se coloca debajo y tiene altura limitada con scroll */
                .image-editor-modal .editor-tools-panel {
                    min-width: auto;
                    max-height: 40%;
                    overflow-y: auto;
                }

                /* Ajustar grid de herramientas en móvil */
                .image-editor-modal .tools-grid {
                    grid-template-columns: 1fr 1fr;
                }
            }

            @media (max-width: 480px) {
                .image-editor-modal .modal-header h5 {
                    font-size: 18px;
                }

                .image-editor-modal .tools-grid {
                    grid-template-columns: 1fr;
                }

                .image-editor-modal .tool-btn-large {
                    padding: 12px;
                }
            }
        `;

        const styleElement = document.createElement('style');
        styleElement.id = 'image-editor-modal-styles';
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
    }

    createModalStructure() {
        let existingModal = document.getElementById('imageEditorModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'imageEditorModal';
        modal.className = 'image-editor-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h5><i class="fas fa-edit"></i> Editor de Imagen</h5>
                    <button type="button" class="modal-close" id="btnCerrarModal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="editor-layout">
                        <div class="editor-canvas-panel">
                            <div class="canvas-container">
                                <canvas id="modalImageCanvas"></canvas>
                            </div>
                            <div class="image-info" id="modalImageInfo">
                                Cargando imagen...
                            </div>
                        </div>
                        <div class="editor-tools-panel">
                            <div class="tools-section">
                                <h6>Selecciona un color para dibujar</h6>
                                <div class="color-picker">
                                    <input type="color" id="modalColorPicker" value="#ff0000">
                                    <span class="color-value" id="modalColorValue">#ff0000</span>
                                </div>
                            </div>
                            <div class="tools-section">
                                <h6>Herramientas de dibujo</h6>
                                <div class="tools-grid">
                                    <button type="button" class="tool-btn-large active" id="modalToolCircle">
                                        <i class="fas fa-circle"></i>
                                        <span>Círculo</span>
                                    </button>
                                    <button type="button" class="tool-btn-large" id="modalToolArrow">
                                        <i class="fas fa-arrow-right"></i>
                                        <span>Flecha</span>
                                    </button>
                                    <button type="button" class="tool-btn-large" id="modalToolRectangle">
                                        <i class="fas fa-square"></i>
                                        <span>Rectángulo</span>
                                    </button>
                                </div>
                            </div>
                            <div class="tools-section">
                                <h6>Comentario</h6>
                                <textarea id="modalComentario" class="form-control" rows="3"
                                    placeholder="Agrega un comentario"></textarea>
                            </div>
                            <div class="tools-section">
                                <h6>Acciones</h6>
                                <div class="action-buttons-vertical">
                                    <button type="button" class="tool-btn-large" id="modalLimpiarTodo">
                                        <i class="fas fa-eraser"></i>
                                        <span>Limpiar todo</span>
                                    </button>
                                    <button type="button" class="tool-btn-large" id="modalGuardarCambios">
                                        <i class="fas fa-save"></i>
                                        <span>Guardar cambios</span>
                                    </button>
                                    <button type="button" class="tool-btn-large" id="modalCancelar">
                                        <i class="fas fa-times"></i>
                                        <span>Cancelar</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.modal = modal;
        this.canvas = document.getElementById('modalImageCanvas');
        this.ctx = this.canvas?.getContext('2d');
    }

    setupEventListeners() {
        if (!this.modal) return;

        document.getElementById('btnCerrarModal')?.addEventListener('click', () => this.hide());
        document.getElementById('modalCancelar')?.addEventListener('click', () => this.hide());

        document.getElementById('modalToolCircle')?.addEventListener('click', () => {
            this.setTool('circle');
            this.updateActiveTool('modalToolCircle');
            this.updateCursorStyle();
        });

        document.getElementById('modalToolArrow')?.addEventListener('click', () => {
            this.setTool('arrow');
            this.updateActiveTool('modalToolArrow');
            this.updateCursorStyle();
        });

        document.getElementById('modalToolRectangle')?.addEventListener('click', () => {
            this.setTool('rectangle');
            this.updateActiveTool('modalToolRectangle');
            this.updateCursorStyle();
        });

        document.getElementById('modalColorPicker')?.addEventListener('input', (e) => {
            this.currentColor = e.target.value;
            document.getElementById('modalColorValue').textContent = e.target.value;
        });

        document.getElementById('modalLimpiarTodo')?.addEventListener('click', () => {
            this.elements = [];
            this.selectedElement = null;
            this.redrawCanvas();
            this.updateCursorStyle();
        });

        document.getElementById('modalGuardarCambios')?.addEventListener('click', () => {
            this.saveImage();
        });

        if (this.canvas) {
            // Eventos para dibujar y mover
            this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
            this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
            this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
            this.canvas.addEventListener('mouseout', () => this.handleMouseUp());

            // Detectar movimiento sobre el canvas para cambiar cursor si hay elemento debajo
            this.canvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'block') {
                this.hide();
            }
            // Eliminar elemento seleccionado con Delete o Supr
            if ((e.key === 'Delete' || e.key === 'Supr') && this.selectedElement) {
                const index = this.elements.indexOf(this.selectedElement);
                if (index !== -1) {
                    this.elements.splice(index, 1);
                    this.selectedElement = null;
                    this.redrawCanvas();
                    this.updateCursorStyle();
                }
                e.preventDefault();
            }
        });
    }

    // Actualiza la clase CSS del canvas según el estado
    updateCursorStyle() {
        if (!this.canvas) return;
        // Remover clases
        this.canvas.classList.remove('moving', 'grabbing', 'drawing');
        if (this.isDragging && this.selectedElement) {
            this.canvas.classList.add('grabbing');
        } else if (this.selectedElement && !this.isDrawing) {
            this.canvas.classList.add('moving');
        } else {
            this.canvas.classList.add('drawing');
        }
    }

    // Cambia el cursor cuando el ratón pasa sobre una figura movible
    onCanvasMouseMove(e) {
        if (!this.image || this.isDrawing || this.isDragging) return;

        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        const element = this.getElementAt(mouseX, mouseY);
        if (element) {
            this.canvas.classList.add('moving');
            this.canvas.classList.remove('drawing');
        } else {
            this.canvas.classList.remove('moving');
            this.canvas.classList.add('drawing');
        }
    }

    updateActiveTool(activeId) {
        const tools = ['modalToolCircle', 'modalToolArrow', 'modalToolRectangle'];
        tools.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                if (id === activeId) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            }
        });
    }

    show(file, index, comentario = '', onSaveCallback) {
        if (!this.modal || !this.canvas || !this.ctx) return;

        this.currentFile = file;
        this.currentIndex = index;
        this.comentario = comentario;
        this.onSaveCallback = onSaveCallback;
        this.elements = [];
        this.selectedElement = null;

        // Activar herramienta por defecto: círculo
        this.setTool('circle');
        this.updateActiveTool('modalToolCircle');
        this.updateCursorStyle();

        const reader = new FileReader();
        reader.onload = (e) => {
            this.image = new Image();
            this.image.onload = () => {
                // Calcular dimensiones máximas para que quepa en el contenedor
                const container = this.canvas.parentElement;
                const maxWidth = container.clientWidth - 40;
                const maxHeight = container.clientHeight - 40;
                let width = this.image.width;
                let height = this.image.height;

                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (maxHeight / height) * width;
                    height = maxHeight;
                }

                this.canvas.width = width;
                this.canvas.height = height;
                this.redrawCanvas();

                document.getElementById('modalImageInfo').textContent =
                    `Editando: ${file.name} (${Math.round(width)}x${Math.round(height)})`;

                document.getElementById('modalComentario').value = comentario || '';
            };
            this.image.src = e.target.result;
        };
        reader.readAsDataURL(file);

        this.modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        // Escuchar cambios de tamaño de la ventana para reajustar
        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        if (!this.modal || this.modal.style.display !== 'block' || !this.image) return;
        const container = this.canvas.parentElement;
        const maxWidth = container.clientWidth - 40;
        const maxHeight = container.clientHeight - 40;
        let width = this.image.width;
        let height = this.image.height;
        if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
        }
        if (height > maxHeight) {
            width = (maxHeight / height) * width;
            height = maxHeight;
        }
        this.canvas.width = width;
        this.canvas.height = height;
        this.redrawCanvas();
        document.getElementById('modalImageInfo').textContent =
            `Editando: ${this.currentFile.name} (${Math.round(width)}x${Math.round(height)})`;
    }

    hide() {
        if (!this.modal) return;
        this.modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        this.image = null;
        this.elements = [];
        this.selectedElement = null;
        window.removeEventListener('resize', () => this.handleResize());
    }

    setTool(tool) {
        this.currentTool = tool;
        this.updateCursorStyle();
    }

    redrawCanvas() {
        if (!this.ctx || !this.image || !this.canvas) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);

        // Dibujar todos los elementos
        this.elements.forEach(el => {
            this.drawElement(el, false);
        });

        // Si hay un elemento seleccionado, dibujarlo con resaltado
        if (this.selectedElement) {
            this.drawElement(this.selectedElement, true);
        }
    }

    drawElement(el, highlight = false) {
        if (!this.ctx) return;

        this.ctx.save();
        if (highlight) {
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = '#00cfff';
        }

        this.ctx.beginPath();
        this.ctx.strokeStyle = el.color;
        this.ctx.fillStyle = el.color;
        this.ctx.lineWidth = 3;

        if (el.type === 'circle') {
            this.ctx.arc(el.x, el.y, el.radius, 0, 2 * Math.PI);
            this.ctx.stroke();
        } else if (el.type === 'arrow') {
            const angle = Math.atan2(el.endY - el.startY, el.endX - el.startX);
            const arrowLength = 15;

            this.ctx.beginPath();
            this.ctx.moveTo(el.startX, el.startY);
            this.ctx.lineTo(el.endX, el.endY);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(el.endX, el.endY);
            this.ctx.lineTo(
                el.endX - arrowLength * Math.cos(angle - Math.PI / 6),
                el.endY - arrowLength * Math.sin(angle - Math.PI / 6)
            );
            this.ctx.lineTo(
                el.endX - arrowLength * Math.cos(angle + Math.PI / 6),
                el.endY - arrowLength * Math.sin(angle + Math.PI / 6)
            );
            this.ctx.closePath();
            this.ctx.fillStyle = el.color;
            this.ctx.fill();
        } else if (el.type === 'rectangle') {
            this.ctx.strokeRect(el.x, el.y, el.width, el.height);
        }

        this.ctx.restore();
    }

    // Encontrar qué elemento está bajo el cursor
    getElementAt(x, y) {
        for (let i = this.elements.length - 1; i >= 0; i--) {
            const el = this.elements[i];
            if (el.type === 'circle') {
                const dx = x - el.x;
                const dy = y - el.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (Math.abs(dist - el.radius) <= 10) {
                    return el;
                }
            } else if (el.type === 'arrow') {
                const ax = el.endX - el.startX;
                const ay = el.endY - el.startY;
                const len = Math.sqrt(ax * ax + ay * ay);
                if (len === 0) continue;
                const u = ((x - el.startX) * ax + (y - el.startY) * ay) / (len * len);
                if (u >= 0 && u <= 1) {
                    const ix = el.startX + u * ax;
                    const iy = el.startY + u * ay;
                    const dist = Math.hypot(x - ix, y - iy);
                    if (dist <= 10) return el;
                }
                const angle = Math.atan2(ay, ax);
                const arrowLength = 15;
                const tipX = el.endX;
                const tipY = el.endY;
                const leftX = tipX - arrowLength * Math.cos(angle - Math.PI / 6);
                const leftY = tipY - arrowLength * Math.sin(angle - Math.PI / 6);
                const rightX = tipX - arrowLength * Math.cos(angle + Math.PI / 6);
                const rightY = tipY - arrowLength * Math.sin(angle + Math.PI / 6);
                if (this.pointInTriangle(x, y, tipX, tipY, leftX, leftY, rightX, rightY)) {
                    return el;
                }
            } else if (el.type === 'rectangle') {
                const left = Math.min(el.x, el.x + el.width);
                const right = Math.max(el.x, el.x + el.width);
                const top = Math.min(el.y, el.y + el.height);
                const bottom = Math.max(el.y, el.y + el.height);
                if (x >= left - 5 && x <= right + 5 && y >= top - 5 && y <= bottom + 5) {
                    if (x >= left && x <= right && y >= top && y <= bottom) return el;
                    if (Math.abs(x - left) <= 10 || Math.abs(x - right) <= 10 ||
                        Math.abs(y - top) <= 10 || Math.abs(y - bottom) <= 10) {
                        return el;
                    }
                }
            }
        }
        return null;
    }

    pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
        const v0x = cx - ax;
        const v0y = cy - ay;
        const v1x = bx - ax;
        const v1y = by - ay;
        const v2x = px - ax;
        const v2y = py - ay;
        const dot00 = v0x * v0x + v0y * v0y;
        const dot01 = v0x * v1x + v0y * v1y;
        const dot02 = v0x * v2x + v0y * v2y;
        const dot11 = v1x * v1x + v1y * v1y;
        const dot12 = v1x * v2x + v1y * v2y;
        const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
        const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
        const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
        return (u >= 0) && (v >= 0) && (u + v < 1);
    }

    handleMouseDown(e) {
        if (!this.image || !this.canvas) return;

        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        const element = this.getElementAt(mouseX, mouseY);
        if (element) {
            this.selectedElement = element;
            this.isDragging = true;
            this.dragStartX = mouseX;
            this.dragStartY = mouseY;
            if (element.type === 'circle') {
                this.dragOffsetX = element.x - mouseX;
                this.dragOffsetY = element.y - mouseY;
            } else if (element.type === 'arrow') {
                this.dragOffsetX = element.startX - mouseX;
                this.dragOffsetY = element.startY - mouseY;
            } else if (element.type === 'rectangle') {
                this.dragOffsetX = element.x - mouseX;
                this.dragOffsetY = element.y - mouseY;
            }
            this.redrawCanvas();
            this.updateCursorStyle();
            e.preventDefault();
            return;
        }

        this.selectedElement = null;
        this.isDrawing = true;
        this.startX = mouseX;
        this.startY = mouseY;
        this.updateCursorStyle();
    }

    handleMouseMove(e) {
        if (!this.image || !this.canvas) return;

        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        if (this.isDragging && this.selectedElement) {
            const el = this.selectedElement;
            const newX = mouseX + this.dragOffsetX;
            const newY = mouseY + this.dragOffsetY;
            if (el.type === 'circle') {
                el.x = newX;
                el.y = newY;
            } else if (el.type === 'arrow') {
                const dx = el.endX - el.startX;
                const dy = el.endY - el.startY;
                el.startX = newX;
                el.startY = newY;
                el.endX = el.startX + dx;
                el.endY = el.startY + dy;
            } else if (el.type === 'rectangle') {
                el.x = newX;
                el.y = newY;
            }
            this.redrawCanvas();
            e.preventDefault();
        } else if (this.isDrawing) {
            this.redrawCanvas();
            this.ctx.save();
            this.ctx.strokeStyle = this.currentColor;
            this.ctx.fillStyle = this.currentColor;
            this.ctx.lineWidth = 3;

            const dx = mouseX - this.startX;
            const dy = mouseY - this.startY;

            if (this.currentTool === 'circle') {
                const radius = Math.sqrt(dx * dx + dy * dy);
                this.ctx.beginPath();
                this.ctx.arc(this.startX, this.startY, radius, 0, 2 * Math.PI);
                this.ctx.stroke();
            } else if (this.currentTool === 'arrow') {
                this.ctx.beginPath();
                this.ctx.moveTo(this.startX, this.startY);
                this.ctx.lineTo(mouseX, mouseY);
                this.ctx.stroke();
                const angle = Math.atan2(dy, dx);
                const arrowLength = 15;
                this.ctx.beginPath();
                this.ctx.moveTo(mouseX, mouseY);
                this.ctx.lineTo(mouseX - arrowLength * Math.cos(angle - Math.PI / 6),
                    mouseY - arrowLength * Math.sin(angle - Math.PI / 6));
                this.ctx.lineTo(mouseX - arrowLength * Math.cos(angle + Math.PI / 6),
                    mouseY - arrowLength * Math.sin(angle + Math.PI / 6));
                this.ctx.closePath();
                this.ctx.fill();
            } else if (this.currentTool === 'rectangle') {
                this.ctx.strokeRect(this.startX, this.startY, dx, dy);
            }
            this.ctx.restore();
        }
    }

    handleMouseUp() {
        if (this.isDrawing) {
            if (this.image && this.canvas) {
                const onMouseUpFinal = (e) => {
                    const rect = this.canvas.getBoundingClientRect();
                    const scaleX = this.canvas.width / rect.width;
                    const scaleY = this.canvas.height / rect.height;
                    const endX = (e.clientX - rect.left) * scaleX;
                    const endY = (e.clientY - rect.top) * scaleY;
                    const dx = endX - this.startX;
                    const dy = endY - this.startY;
                    const minDistance = 5;

                    if (Math.abs(dx) > minDistance || Math.abs(dy) > minDistance) {
                        if (this.currentTool === 'circle') {
                            const radius = Math.sqrt(dx * dx + dy * dy);
                            this.elements.push({
                                type: 'circle',
                                x: this.startX,
                                y: this.startY,
                                radius: radius,
                                color: this.currentColor
                            });
                        } else if (this.currentTool === 'arrow') {
                            this.elements.push({
                                type: 'arrow',
                                startX: this.startX,
                                startY: this.startY,
                                endX: endX,
                                endY: endY,
                                color: this.currentColor
                            });
                        } else if (this.currentTool === 'rectangle') {
                            this.elements.push({
                                type: 'rectangle',
                                x: this.startX,
                                y: this.startY,
                                width: dx,
                                height: dy,
                                color: this.currentColor
                            });
                        }
                    }
                    this.redrawCanvas();
                    document.removeEventListener('mouseup', onMouseUpFinal);
                };
                document.addEventListener('mouseup', onMouseUpFinal);
            }
        }
        this.isDrawing = false;
        this.isDragging = false;
        this.selectedElement = null;
        this.updateCursorStyle();
    }

    saveImage() {
        if (!this.canvas || !this.currentFile) return;

        const comentario = document.getElementById('modalComentario').value;

        this.canvas.toBlob((blob) => {
            const editedFile = new File([blob], `edited_${this.currentFile.name}`, {
                type: 'image/png'
            });

            if (this.onSaveCallback) {
                this.onSaveCallback(this.currentIndex, editedFile, comentario, this.elements);
            }

            this.hide();
        }, 'image/png');
    }
}

window.ImageEditorModal = ImageEditorModal;