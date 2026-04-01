// tareas.js - VERSIÓN FINAL CON CHECKLIST POR USUARIO Y CLICK EN TARJETA

import { TareaManager } from '/clases/tarea.js';
import { UserManager } from '/clases/user.js';
import { AreaManager } from '/clases/area.js';
import { CategoriaManager } from '/clases/categoria.js';

let historialManager = null;

class TareasController {
    constructor() {
        this.tareaManager = null;
        this.userManager = null;
        this.areaManager = null;
        this.categoriaManager = null;
        this.usuarioActual = null;

        this.todasLasTareas = [];
        this.tareasFiltradas = [];
        this.tipoActual = 'todas';
        this.terminoBusqueda = '';
        this.cargando = false;

        this.cacheUsuarios = {};
        this.cacheAreas = {};
        this.usuariosDisponibles = [];
        this.areasDisponibles = [];
        this.categoriasDisponibles = [];

        this.modoEdicion = false;
        this.tareaActual = null;
        this.tipoSeleccionado = 'personal';
        this.itemsActuales = [];

        this.usuarios = [];
        this.usuariosFiltrados = [];
        this.areas = [];
        this.areasFiltradas = [];
        this.cargos = [];
        this.cargosFiltrados = [];
        this.areaSeleccionada = null;
        this.categoriaSeleccionada = null;

        this.modalVisible = false;
        this.tareaModalActual = null;

        this.init();
    }

    async init() {
        try {
            await this._initHistorial();

            this.userManager = new UserManager();
            this.areaManager = new AreaManager();
            this.categoriaManager = new CategoriaManager();
            const { TareaManager } = await import('/clases/tarea.js');
            this.tareaManager = new TareaManager();

            await this._esperarUsuario();

            if (!this.usuarioActual) {
                window.location.href = '/usuarios/visitantes/inicioSesion/inicioSesion.html';
                return;
            }

            localStorage.setItem('adminInfo', JSON.stringify({
                id: this.usuarioActual.id,
                uid: this.usuarioActual.uid,
                nombreCompleto: this.usuarioActual.nombreCompleto,
                organizacion: this.usuarioActual.organizacion,
                organizacionCamelCase: this.usuarioActual.organizacionCamelCase,
                rol: this.usuarioActual.rol,
                correoElectronico: this.usuarioActual.correoElectronico,
                areaAsignadaId: this.usuarioActual.areaAsignadaId,
                cargoId: this.usuarioActual.cargoId
            }));

            await Promise.all([
                this._cargarUsuarios(),
                this._cargarAreas(),
                this._cargarCategorias()
            ]);

            await this._cargarTareas();

            this._configurarEventos();
            this._crearModalTarea();

        } catch (error) {
            this._mostrarError(error.message);
        }
    }

    _crearModalTarea() {
        // Verificar si ya existe el modal
        if (document.getElementById('modalTareaDetalle')) return;

        const modalHTML = `
            <div id="modalTareaDetalle" class="tarea-modal">
                <div class="tarea-modal-content">
                    <div class="tarea-modal-header">
                        <h3 id="modalTareaTitulo">Detalle de Nota</h3>
                        <button class="tarea-modal-close" id="cerrarModalTarea">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="tarea-modal-body" id="modalTareaBody">
                        <!-- Contenido dinámico -->
                    </div>
                    <div class="tarea-modal-footer" id="modalTareaFooter">
                        <!-- Botones dinámicos -->
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('modalTareaDetalle');
        const closeBtn = document.getElementById('cerrarModalTarea');

        closeBtn.addEventListener('click', () => {
            modal.classList.remove('show');
            this.modalVisible = false;
        });

        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
                this.modalVisible = false;
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modalVisible) {
                modal.classList.remove('show');
                this.modalVisible = false;
            }
        });
    }

    _abrirModalTarea(tarea) {
        this.tareaModalActual = tarea;
        const modal = document.getElementById('modalTareaDetalle');
        const modalTitulo = document.getElementById('modalTareaTitulo');
        const modalBody = document.getElementById('modalTareaBody');
        const modalFooter = document.getElementById('modalTareaFooter');

        const esCreador = tarea.creadoPor === this.usuarioActual?.id;
        const esAdmin = this.usuarioActual.rol === 'administrador' || this.usuarioActual.rol === 'admin';
        const puedeEditar = esCreador;

        // Tipo de nota
        const tipoClass = {
            'global': 'tipo-general',
            'general': 'tipo-general',
            'personal': 'tipo-personal',
            'compartida': 'tipo-compartida',
            'area': 'tipo-area'
        }[tarea.tipo] || 'tipo-general';

        const tipoTexto = {
            'global': 'General',
            'general': 'General',
            'personal': 'Personal',
            'compartida': 'Compartida',
            'area': 'Área'
        }[tarea.tipo] || 'General';

        const fecha = tarea.fechaCreacion ? new Date(tarea.fechaCreacion) : new Date();
        const fechaStr = fecha.toLocaleDateString('es-MX', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        const fechaLimite = tarea.fechaLimite ? new Date(tarea.fechaLimite) : null;
        const fechaLimiteStr = fechaLimite ? fechaLimite.toLocaleDateString('es-MX', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        }) : null;

        // Categoría y subcategoría
        let categoriaNombre = 'Sin categoría';
        let subcategoriaNombre = '';
        
        if (tarea.categoriaId && this.categoriasDisponibles) {
            const categoria = this.categoriasDisponibles.find(c => c.id === tarea.categoriaId);
            if (categoria) {
                categoriaNombre = categoria.nombre;
                if (tarea.subcategoriaId && categoria.subcategorias && categoria.subcategorias[tarea.subcategoriaId]) {
                    subcategoriaNombre = categoria.subcategorias[tarea.subcategoriaId].nombre || '';
                }
            }
        }

        const items = tarea.items ? Object.values(tarea.items) : [];
        const totalItems = items.length;
        const completados = items.filter(i => i.completado).length;

        // Construir lista de items con lógica de quien marcó
        let itemsHtml = '';
        if (items.length > 0) {
            itemsHtml = '<div class="modal-items-list">';
            items.forEach(item => {
                const marcadoPor = item.marcadoPor || null;
                const marcadoPorNombre = marcadoPor === this.usuarioActual.id ? 'tú' : (this.cacheUsuarios[marcadoPor] || 'otro usuario');
                const puedeDesmarcar = marcadoPor === this.usuarioActual.id;
                
                itemsHtml += `
                    <div class="modal-item-row ${item.completado ? 'completado' : ''}" data-item-id="${item.id}">
                        <div class="modal-item-checkbox-wrapper">
                            <input type="checkbox" class="modal-item-checkbox" 
                                   data-item-id="${item.id}"
                                   ${item.completado ? 'checked' : ''}
                                   ${item.completado && !puedeDesmarcar ? 'disabled' : ''}>
                        </div>
                        <div class="modal-item-texto">${this._escapeHTML(item.texto)}</div>
                        ${item.completado && marcadoPor ? `
                            <div class="modal-item-marcado-por">
                                <i class="fas fa-user-check"></i>
                                <span>Marcado por: ${this._escapeHTML(marcadoPorNombre)}</span>
                            </div>
                        ` : ''}
                    </div>
                `;
            });
            itemsHtml += `
                <div class="modal-progreso">
                    <span class="progreso-texto">${completados}/${totalItems} completados</span>
                    <div class="progreso-bar">
                        <div class="progreso-fill" style="width: ${totalItems > 0 ? (completados / totalItems) * 100 : 0}%"></div>
                    </div>
                </div>
            </div>`;
        } else {
            itemsHtml = '<p class="no-items">No hay items en el checklist</p>';
        }

        modalTitulo.innerHTML = `
            <span class="tarea-tipo-badge ${tipoClass}" style="font-size: 12px; margin-right: 12px;">${tipoTexto}</span>
            ${this._escapeHTML(tarea.nombreActividad || 'Sin título')}
        `;

        modalBody.innerHTML = `
            <div class="modal-metadatos">
                <div class="modal-categoria">
                    <i class="fas fa-tag"></i>
                    <span>Categoría: ${this._escapeHTML(categoriaNombre)}</span>
                    ${subcategoriaNombre ? `<span class="tarea-subcategoria"> / ${this._escapeHTML(subcategoriaNombre)}</span>` : ''}
                </div>
                <div class="modal-fechas">
                    <div class="modal-fecha-inicio">
                        <i class="fas fa-calendar-plus"></i>
                        <span>Creada: ${fechaStr}</span>
                    </div>
                    ${fechaLimiteStr ? `
                        <div class="modal-fecha-limite">
                            <i class="fas fa-calendar-check"></i>
                            <span>Límite: ${fechaLimiteStr}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="modal-creador">
                    <i class="fas fa-user"></i>
                    <span>Creador: ${this._escapeHTML(tarea.creadoPorNombre || 'Usuario')}</span>
                    ${esCreador ? '<span class="creador-badge">(tú)</span>' : ''}
                </div>
            </div>
            
            ${tarea.descripcion ? `
                <div class="modal-descripcion">
                    <h4><i class="fas fa-align-left"></i> Descripción</h4>
                    <p>${this._escapeHTML(tarea.descripcion)}</p>
                </div>
            ` : ''}
            
            <div class="modal-checklist">
                <h4><i class="fas fa-check-square"></i> Checklist</h4>
                ${itemsHtml}
            </div>
        `;

        modalFooter.innerHTML = '';
        if (puedeEditar) {
            modalFooter.innerHTML = `
                <button class="btn-modal-editar" id="btnModalEditar">
                    <i class="fas fa-edit"></i> Editar Nota
                </button>
                <button class="btn-modal-eliminar" id="btnModalEliminar">
                    <i class="fas fa-trash-alt"></i> Eliminar Nota
                </button>
            `;

            document.getElementById('btnModalEditar')?.addEventListener('click', () => {
                modal.classList.remove('show');
                this.modalVisible = false;
                this._abrirFormularioEdicion(tarea.id);
            });

            document.getElementById('btnModalEliminar')?.addEventListener('click', () => {
                modal.classList.remove('show');
                this.modalVisible = false;
                this._eliminarTarea(tarea.id);
            });
        }

        // Eventos de checkbox en modal
        modalBody.querySelectorAll('.modal-item-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', async (e) => {
                e.stopPropagation();
                const itemId = checkbox.dataset.itemId;
                const completado = checkbox.checked;
                
                // Deshabilitar temporalmente para evitar clics múltiples
                checkbox.disabled = true;
                
                await this._marcarItemModal(tarea.id, itemId, completado);
                
                // Recargar modal con datos actualizados
                const tareaActualizada = await this.tareaManager.getTareaById(
                    tarea.id, this.usuarioActual.organizacionCamelCase
                );
                if (tareaActualizada) {
                    this.tareaModalActual = tareaActualizada;
                    this._abrirModalTarea(tareaActualizada);
                } else {
                    checkbox.disabled = false;
                }
            });
        });

        modal.classList.add('show');
        this.modalVisible = true;
    }

    async _marcarItemModal(tareaId, itemId, completado) {
        try {
            const tarea = this.todasLasTareas.find(t => t.id === tareaId);
            const item = tarea?.items?.[itemId];
            const itemTexto = item?.texto || 'Item sin texto';

            // Registrar quién marcó/desmarcó
            const marcadoPor = completado ? this.usuarioActual.id : null;
            const marcadoPorNombre = completado ? this.usuarioActual.nombreCompleto : null;

            await this.tareaManager.marcarItemTareaConAutor(
                tareaId, itemId, completado, marcadoPor, marcadoPorNombre,
                this.usuarioActual, this.usuarioActual.organizacionCamelCase
            );

            // Actualizar caché local
            if (tarea && tarea.items && tarea.items[itemId]) {
                tarea.items[itemId].completado = completado;
                tarea.items[itemId].marcadoPor = marcadoPor;
                tarea.items[itemId].marcadoPorNombre = marcadoPorNombre;
                tarea._calcularProgreso();
            }

            await this._registrarMarcadoItem(tarea, itemId, itemTexto, completado);

        } catch (error) {
            console.error('Error marcando item:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error.message || 'No se pudo actualizar el item',
                timer: 2000,
                showConfirmButton: false,
                background: 'var(--color-bg-secondary)'
            });
        }
    }

    async _initHistorial() {
        try {
            const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
            historialManager = new HistorialUsuarioManager();
        } catch (error) {
            console.error('Error inicializando historialManager:', error);
        }
    }

    async _registrarMarcadoItem(tarea, itemId, itemTexto, completado) {
        if (!historialManager) return;
        try {
            await historialManager.registrarActividad({
                usuario: this.usuarioActual,
                tipo: 'editar',
                modulo: 'tareas',
                descripcion: completado ? 
                    `Marcó como completado item en nota "${tarea.nombreActividad}"` : 
                    `Desmarcó item en nota "${tarea.nombreActividad}"`,
                detalles: {
                    tareaId: tarea.id,
                    tareaTitulo: tarea.nombreActividad,
                    itemId: itemId,
                    itemTexto: itemTexto
                }
            });
        } catch (error) {
            console.error('Error registrando marcado de item:', error);
        }
    }

    async _esperarUsuario() {
        for (let i = 0; i < 30; i++) {
            if (this.userManager.currentUser) {
                this.usuarioActual = this.userManager.currentUser;
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return this._cargarUsuarioLocalStorage();
    }

    _cargarUsuarioLocalStorage() {
        try {
            const adminInfo = localStorage.getItem('adminInfo');
            if (adminInfo) {
                const data = JSON.parse(adminInfo);
                this.usuarioActual = {
                    id: data.id || data.uid,
                    uid: data.uid || data.id,
                    nombreCompleto: data.nombreCompleto || 'Usuario',
                    organizacion: data.organizacion || 'Sin organización',
                    organizacionCamelCase: data.organizacionCamelCase || this._generarCamelCase(data.organizacion),
                    rol: data.rol || 'administrador',
                    correoElectronico: data.correoElectronico || '',
                    areaAsignadaId: data.areaAsignadaId,
                    cargoId: data.cargoId
                };
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    _generarCamelCase(texto) {
        if (!texto) return 'sinOrganizacion';
        return texto.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');
    }

    async _cargarUsuarios() {
        try {
            if (!this.usuarioActual?.organizacionCamelCase) return;

            const colaboradores = await this.userManager.getColaboradoresByOrganizacion(
                this.usuarioActual.organizacionCamelCase, true
            );
            const administradores = await this.userManager.getAdministradores(true);

            this.usuariosDisponibles = [
                ...colaboradores.filter(u => u.id !== this.usuarioActual.id),
                ...administradores.filter(a => a.organizacionCamelCase === this.usuarioActual.organizacionCamelCase && a.id !== this.usuarioActual.id)
            ];

            this.usuariosDisponibles.forEach(u => {
                this.cacheUsuarios[u.id] = u.nombreCompleto || 'Usuario';
            });

        } catch (error) {
            this.usuariosDisponibles = [];
        }
    }

    async _cargarAreas() {
        try {
            if (!this.usuarioActual?.organizacionCamelCase) return;

            this.areasDisponibles = await this.areaManager.getAreasByOrganizacion(
                this.usuarioActual.organizacionCamelCase
            );
            this.areasDisponibles = this.areasDisponibles.filter(a => a.estado === 'activa');

        } catch (error) {
            this.areasDisponibles = [];
        }
    }

    async _cargarCategorias() {
        try {
            if (!this.usuarioActual?.organizacionCamelCase) return;
            
            this.categoriasDisponibles = await this.categoriaManager.obtenerCategoriasPorOrganizacion(
                this.usuarioActual.organizacionCamelCase
            );
        } catch (error) {
            this.categoriasDisponibles = [];
        }
    }

    _esTareaVisible(tarea) {
        const esCreador = tarea.creadoPor === this.usuarioActual.id;
        const esAdmin = this.usuarioActual.rol === 'administrador' || this.usuarioActual.rol === 'admin';
        
        if (tarea.tipo === 'personal') {
            return esCreador;
        }
        
        if (tarea.tipo === 'global' || tarea.tipo === 'general') {
            return true;
        }
        
        if (tarea.tipo === 'compartida') {
            if (esCreador) return true;
            return tarea.usuariosCompartidosIds && tarea.usuariosCompartidosIds.includes(this.usuarioActual.id);
        }
        
        if (tarea.tipo === 'area') {
            if (esAdmin) return true;
            if (!tarea.areaId) return false;
            if (!this.usuarioActual.areaAsignadaId) return false;
            
            const perteneceAlArea = tarea.areaId === this.usuarioActual.areaAsignadaId;
            
            if (tarea.cargosIds && tarea.cargosIds.length > 0) {
                return perteneceAlArea && tarea.cargosIds.includes(this.usuarioActual.cargoId);
            }
            
            return perteneceAlArea;
        }
        
        return false;
    }

    async _cargarTareas() {
        if (this.cargando) return;
        this.cargando = true;

        try {
            if (!this.usuarioActual?.organizacionCamelCase) {
                throw new Error('No hay organización definida');
            }

            this._mostrarCarga();

            const todasLasTareas = await this.tareaManager.getTodasLasTareas(
                this.usuarioActual.organizacionCamelCase
            );

            this.todasLasTareas = todasLasTareas.filter(tarea => this._esTareaVisible(tarea));

            console.log(`📋 Total tareas en org: ${todasLasTareas.length}, Visibles para ${this.usuarioActual.nombreCompleto} (${this.usuarioActual.rol}): ${this.todasLasTareas.length}`);

            this._aplicarFiltros();

        } catch (error) {
            this._mostrarErrorEnGrid(error.message);
        } finally {
            this.cargando = false;
        }
    }

    _aplicarFiltros() {
        let tareasFiltradas = [...this.todasLasTareas];

        if (this.terminoBusqueda && this.terminoBusqueda.length >= 2) {
            tareasFiltradas = tareasFiltradas.filter(t =>
                (t.nombreActividad && t.nombreActividad.toLowerCase().includes(this.terminoBusqueda)) ||
                (t.descripcion && t.descripcion.toLowerCase().includes(this.terminoBusqueda))
            );
        }

        if (this.tipoActual !== 'todas') {
            tareasFiltradas = tareasFiltradas.filter(t => {
                if (this.tipoActual === 'generales') {
                    return t.tipo === 'global' || t.tipo === 'general';
                }
                if (this.tipoActual === 'personales') {
                    return t.tipo === 'personal';
                }
                if (this.tipoActual === 'compartidas') {
                    return t.tipo === 'compartida';
                }
                if (this.tipoActual === 'area') {
                    return t.tipo === 'area';
                }
                return true;
            });
        }

        tareasFiltradas.sort((a, b) => b.fechaCreacion - a.fechaCreacion);

        this.tareasFiltradas = tareasFiltradas;
        this._renderizarTareas();
    }

    _renderizarTareas() {
        const container = document.getElementById('tareasGrid');
        if (!container) return;

        if (!this.tareasFiltradas || this.tareasFiltradas.length === 0) {
            container.innerHTML = this._getEmptyStateHTML();
            return;
        }

        let html = '';
        this.tareasFiltradas.forEach(tarea => {
            html += this._crearTarjetaNota(tarea);
        });

        container.innerHTML = html;

        // Evento de clic en tarjeta para abrir modal
        container.querySelectorAll('.tarea-card').forEach(card => {
            const tareaId = card.dataset.tareaId;
            card.addEventListener('click', (e) => {
                // No abrir modal si se hizo clic en botones internos
                if (e.target.closest('.btn-card-action')) return;
                if (e.target.closest('.tarea-item-checkbox')) return;
                
                const tarea = this.todasLasTareas.find(t => t.id === tareaId);
                if (tarea) {
                    this._abrirModalTarea(tarea);
                }
            });
        });

        // Eventos de edición y eliminación (solo para creador)
        container.querySelectorAll('.btn-card-action.edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const tareaId = btn.dataset.id;
                this._abrirFormularioEdicion(tareaId);
            });
        });

        container.querySelectorAll('.btn-card-action.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const tareaId = btn.dataset.id;
                this._eliminarTarea(tareaId);
            });
        });
    }

    _crearTarjetaNota(tarea) {
        const tipoClass = {
            'global': 'tipo-general',
            'general': 'tipo-general',
            'personal': 'tipo-personal',
            'compartida': 'tipo-compartida',
            'area': 'tipo-area'
        }[tarea.tipo] || 'tipo-general';

        const tipoTexto = {
            'global': 'General',
            'general': 'General',
            'personal': 'Personal',
            'compartida': 'Compartida',
            'area': 'Área'
        }[tarea.tipo] || 'General';

        const fecha = tarea.fechaCreacion ? new Date(tarea.fechaCreacion) : new Date();
        const fechaStr = fecha.toLocaleDateString('es-MX', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        const fechaLimite = tarea.fechaLimite ? new Date(tarea.fechaLimite) : null;
        const fechaLimiteStr = fechaLimite ? fechaLimite.toLocaleDateString('es-MX', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        }) : null;

        const esCreador = tarea.creadoPor === this.usuarioActual?.id;
        const puedeEditar = esCreador;

        let categoriaNombre = 'Sin categoría';
        let subcategoriaNombre = '';
        
        if (tarea.categoriaId && this.categoriasDisponibles) {
            const categoria = this.categoriasDisponibles.find(c => c.id === tarea.categoriaId);
            if (categoria) {
                categoriaNombre = categoria.nombre;
                if (tarea.subcategoriaId && categoria.subcategorias && categoria.subcategorias[tarea.subcategoriaId]) {
                    subcategoriaNombre = categoria.subcategorias[tarea.subcategoriaId].nombre || '';
                }
            }
        }

        const items = tarea.items ? Object.values(tarea.items) : [];
        const totalItems = items.length;
        const completados = items.filter(i => i.completado).length;

        let itemsPreview = '';
        if (items.length > 0) {
            itemsPreview = '<div class="tarea-items-preview">';
            items.slice(0, 3).forEach(item => {
                // Verificar si el usuario actual puede desmarcar este item
                const puedeDesmarcar = item.completado ? (item.marcadoPor === this.usuarioActual.id) : true;
                
                itemsPreview += `
                    <div class="tarea-item-preview ${item.completado ? 'completado' : ''}">
                        <input type="checkbox" class="tarea-item-checkbox" 
                               data-tarea-id="${tarea.id}" 
                               data-item-id="${item.id}"
                               ${item.completado ? 'checked' : ''}
                               ${item.completado && !puedeDesmarcar ? 'disabled' : ''}>
                        <span>${this._escapeHTML(item.texto)}</span>
                    </div>
                `;
            });
            if (items.length > 3) {
                itemsPreview += `<div class="tarea-mas-items">+${items.length - 3} items más</div>`;
            }
            itemsPreview += `
                <div class="tarea-progreso">
                    <span class="progreso-texto">${completados}/${totalItems} completados</span>
                    <div class="progreso-bar">
                        <div class="progreso-fill" style="width: ${totalItems > 0 ? (completados / totalItems) * 100 : 0}%"></div>
                    </div>
                </div>
            </div>`;
        }

        return `
            <div class="tarea-card" data-tarea-id="${tarea.id}">
                <div class="tarea-header">
                    <h3 class="tarea-titulo">${this._escapeHTML(tarea.nombreActividad || 'Sin título')}</h3>
                    <span class="tarea-tipo-badge ${tipoClass}">${tipoTexto}</span>
                </div>
                
                <div class="tarea-metadatos">
                    <div class="tarea-categoria">
                        <i class="fas fa-tag"></i>
                        <span>${this._escapeHTML(categoriaNombre)}</span>
                        ${subcategoriaNombre ? `<span class="tarea-subcategoria"> / ${this._escapeHTML(subcategoriaNombre)}</span>` : ''}
                    </div>
                    <div class="tarea-fechas">
                        <span class="tarea-fecha-inicio">
                            <i class="fas fa-calendar-plus"></i> ${fechaStr}
                        </span>
                        ${fechaLimiteStr ? `
                            <span class="tarea-fecha-limite">
                                <i class="fas fa-calendar-check"></i> Límite: ${fechaLimiteStr}
                            </span>
                        ` : ''}
                    </div>
                </div>
                
                ${tarea.descripcion ? `
                    <div class="tarea-contenido">
                        ${this._escapeHTML(tarea.descripcion)}
                    </div>
                ` : ''}
                
                ${itemsPreview}
                
                <div class="tarea-footer">
                    <span class="tarea-creador">
                        <i class="fas fa-user"></i>
                        ${this._escapeHTML(tarea.creadoPorNombre || 'Usuario')}
                        ${esCreador ? '<span class="creador-badge">(tú)</span>' : ''}
                    </span>
                </div>
                
                ${puedeEditar ? `
                    <div class="tarea-acciones">
                        <button class="btn-card-action edit" data-id="${tarea.id}">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="btn-card-action delete" data-id="${tarea.id}">
                            <i class="fas fa-trash-alt"></i> Eliminar
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // ========== FUNCIONES DEL FORMULARIO ==========

    _mostrarFormularioCreacion() {
        this.modoEdicion = false;
        this.tareaActual = null;
        this.tipoSeleccionado = 'personal';
        this.areaSeleccionada = null;
        this.categoriaSeleccionada = null;
        this.itemsActuales = [];

        const notaId = document.getElementById('notaId');
        const notaTitulo = document.getElementById('notaTitulo');
        const notaDescripcion = document.getElementById('notaDescripcion');
        const tieneRecordatorio = document.getElementById('tieneRecordatorio');
        const fechaLimite = document.getElementById('fechaLimite');
        const fechaContainer = document.getElementById('fechaContainer');
        const categoriaNota = document.getElementById('categoriaNota');
        const subcategoriaNota = document.getElementById('subcategoriaNota');

        if (notaId) notaId.value = '';
        if (notaTitulo) notaTitulo.value = '';
        if (notaDescripcion) notaDescripcion.value = '';
        if (tieneRecordatorio) tieneRecordatorio.checked = false;
        if (fechaLimite) fechaLimite.value = this._getFechaPorDefecto('personal');
        if (fechaContainer) fechaContainer.style.display = 'none';
        if (categoriaNota) categoriaNota.value = '';
        if (subcategoriaNota) {
            subcategoriaNota.innerHTML = '<option value="">-- Selecciona subcategoría --</option>';
            subcategoriaNota.disabled = true;
        }

        this._renderizarItemsInline([]);
        this._seleccionarTipoFormulario('personal');

        const formulario = document.getElementById('formularioCreacion');
        if (formulario) formulario.style.display = 'block';

        setTimeout(() => {
            if (formulario) formulario.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (notaTitulo) notaTitulo.focus();
        }, 100);
    }

    _ocultarFormulario() {
        const formulario = document.getElementById('formularioCreacion');
        if (formulario) formulario.style.display = 'none';
    }

    _seleccionarTipoFormulario(tipo) {
        this.tipoSeleccionado = tipo;

        document.querySelectorAll('.tipo-option').forEach(opt => {
            if (opt.dataset.tipo === tipo) {
                opt.classList.add('seleccionado');
            } else {
                opt.classList.remove('seleccionado');
            }
        });

        const titulos = {
            'general': 'Nueva Nota General',
            'personal': 'Nueva Nota Personal',
            'compartida': 'Nueva Nota Compartida',
            'area': 'Nueva Nota por Área'
        };
        const formularioTitulo = document.getElementById('formularioTitulo');
        if (formularioTitulo) formularioTitulo.textContent = titulos[tipo] || 'Nueva Nota';

        this._renderizarCamposEspecificosInline(tipo);
        this._actualizarFechaPorDefecto();
    }

    _actualizarFechaPorDefecto() {
        const fechaInput = document.getElementById('fechaLimite');
        if (fechaInput) {
            fechaInput.value = this._getFechaPorDefecto(this.tipoSeleccionado);
        }
    }

    _getFechaPorDefecto(tipo) {
        const fecha = new Date();
        switch (tipo) {
            case 'general': fecha.setDate(fecha.getDate() + 30); break;
            case 'area': fecha.setDate(fecha.getDate() + 14); break;
            default: fecha.setDate(fecha.getDate() + 7);
        }
        return fecha.toISOString().split('T')[0];
    }

    _agregarItemFormulario() {
        const itemsList = document.getElementById('itemsList');
        if (!itemsList) return;

        const noItems = itemsList.querySelector('.no-items');
        if (noItems) noItems.remove();

        const newItemId = `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const html = `
            <div class="item-row" data-item-id="${newItemId}">
                <input type="checkbox" class="item-checkbox">
                <input type="text" class="item-texto" value="" placeholder="Escribe un item...">
                <button type="button" class="btn-eliminar-item" title="Eliminar item">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        itemsList.insertAdjacentHTML('beforeend', html);

        const newRow = itemsList.lastElementChild;
        const input = newRow.querySelector('.item-texto');
        const deleteBtn = newRow.querySelector('.btn-eliminar-item');

        if (input) input.focus();

        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                newRow.remove();
            });
        }
    }

    _renderizarItemsInline(items) {
        const container = document.getElementById('itemsList');
        if (!container) return;

        if (!items || items.length === 0) {
            container.innerHTML = '<p class="no-items">No hay items. Agrega uno nuevo.</p>';
            return;
        }

        let html = '';
        items.forEach(item => {
            html += `
                <div class="item-row" data-item-id="${item.id}">
                    <input type="checkbox" class="item-checkbox" ${item.completado ? 'checked' : ''}>
                    <input type="text" class="item-texto" value="${this._escapeHTML(item.texto)}" placeholder="Escribe un item...">
                    <button type="button" class="btn-eliminar-item" title="Eliminar item">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        });

        container.innerHTML = html;

        container.querySelectorAll('.item-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const row = e.target.closest('.item-row');
                if (row) {
                    const texto = row.querySelector('.item-texto');
                    if (e.target.checked) {
                        if (texto) texto.style.textDecoration = 'line-through';
                        if (texto) texto.style.color = 'var(--color-text-dim)';
                    } else {
                        if (texto) texto.style.textDecoration = 'none';
                        if (texto) texto.style.color = 'var(--color-text-primary)';
                    }
                }
            });
        });

        container.querySelectorAll('.btn-eliminar-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const row = e.target.closest('.item-row');
                if (row) row.remove();
            });
        });
    }

    _renderizarCamposEspecificosInline(tipo) {
        const container = document.getElementById('camposEspecificos');
        if (!container) return;

        let html = '';
        html += this._getHTMLCategorias();

        switch (tipo) {
            case 'personal':
                break;
            case 'compartida':
                html += this._getHTMLUsuariosCreacion();
                break;
            case 'area':
                html += this._getHTMLAreasCreacion();
                break;
            case 'general':
                html += this._getHTMLGeneral();
                break;
        }

        container.innerHTML = html;

        if (tipo === 'compartida' && html.includes('usuariosContainer')) {
            this._configurarSelectorUsuariosCreacion();
        } else if (tipo === 'area' && html.includes('areasContainer')) {
            this._configurarSelectorAreasCreacion();
        }

        this._configurarSelectorCategorias();
    }

    _getHTMLCategorias() {
        if (this.categoriasDisponibles.length === 0) {
            return `
                <div class="form-field">
                    <label class="form-label">Categoría</label>
                    <select class="form-control" id="categoriaNota">
                        <option value="">Sin categoría</option>
                    </select>
                    <small class="form-text text-muted">No hay categorías disponibles</small>
                </div>
                <div class="form-field">
                    <label class="form-label">Subcategoría</label>
                    <select class="form-control" id="subcategoriaNota" disabled>
                        <option value="">-- Selecciona subcategoría --</option>
                    </select>
                </div>
            `;
        }

        let options = '<option value="">Sin categoría</option>';
        this.categoriasDisponibles.forEach(cat => {
            options += `<option value="${cat.id}">${this._escapeHTML(cat.nombre)}</option>`;
        });

        return `
            <div class="form-field">
                <label class="form-label">Categoría</label>
                <select class="form-control" id="categoriaNota">
                    ${options}
                </select>
            </div>
            <div class="form-field">
                <label class="form-label">Subcategoría</label>
                <select class="form-control" id="subcategoriaNota" disabled>
                    <option value="">-- Selecciona subcategoría --</option>
                </select>
            </div>
        `;
    }

    _configurarSelectorCategorias() {
        const categoriaSelect = document.getElementById('categoriaNota');
        const subcategoriaSelect = document.getElementById('subcategoriaNota');

        if (!categoriaSelect) return;

        categoriaSelect.addEventListener('change', async (e) => {
            const categoriaId = e.target.value;
            
            if (!categoriaId) {
                if (subcategoriaSelect) {
                    subcategoriaSelect.innerHTML = '<option value="">-- Selecciona subcategoría --</option>';
                    subcategoriaSelect.disabled = true;
                }
                return;
            }

            const categoria = this.categoriasDisponibles.find(c => c.id === categoriaId);
            if (!categoria || !categoria.subcategorias || Object.keys(categoria.subcategorias).length === 0) {
                if (subcategoriaSelect) {
                    subcategoriaSelect.innerHTML = '<option value="">-- No hay subcategorías --</option>';
                    subcategoriaSelect.disabled = true;
                }
                return;
            }

            let options = '<option value="">-- Selecciona subcategoría --</option>';
            Object.values(categoria.subcategorias).forEach(sub => {
                options += `<option value="${sub.id}">${this._escapeHTML(sub.nombre)}</option>`;
            });

            if (subcategoriaSelect) {
                subcategoriaSelect.innerHTML = options;
                subcategoriaSelect.disabled = false;
            }
        });
    }

    _getHTMLUsuariosCreacion() {
        if (this.usuariosDisponibles.length === 0) {
            return '<p class="no-items">No hay usuarios disponibles</p>';
        }

        let html = `
            <div class="campos-especificos">
                <h6 class="section-title"><i class="fas fa-users"></i> Compartir con usuarios</h6>
                
                <div class="acciones-rapidas">
                    <button type="button" class="btn-accion-rapida" id="seleccionarTodosUsuarios">
                        <i class="fas fa-check-double"></i> Seleccionar Todos
                    </button>
                    <button type="button" class="btn-accion-rapida" id="deseleccionarTodosUsuarios">
                        <i class="fas fa-times"></i> Deseleccionar Todos
                    </button>
                </div>
                
                <div class="usuarios-container" id="usuariosContainer">
        `;

        this.usuariosDisponibles.forEach(usuario => {
            const iniciales = this._obtenerIniciales(usuario.nombreCompleto);
            html += `
                <div class="usuario-item" data-usuario-id="${usuario.id}">
                    <input type="checkbox" class="usuario-checkbox" value="${usuario.id}">
                    <div class="usuario-avatar">${iniciales}</div>
                    <div class="usuario-info">
                        <span class="usuario-nombre">${this._escapeHTML(usuario.nombreCompleto)}</span>
                        <span class="usuario-correo">${this._escapeHTML(usuario.correoElectronico || '')}</span>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div class="selected-summary" id="selectedUsersSummary">
                    <i class="fas fa-users"></i>
                    <span id="selectedUsersCount">0</span> usuarios seleccionados
                </div>
            </div>
        `;

        return html;
    }

    _configurarSelectorUsuariosCreacion() {
        const container = document.getElementById('usuariosContainer');
        if (!container) return;

        container.querySelectorAll('.usuario-item').forEach(item => {
            const checkbox = item.querySelector('.usuario-checkbox');

            item.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    this._actualizarEstiloItem(item, checkbox.checked);
                }
                this._actualizarContadorUsuarios();
            });

            checkbox.addEventListener('change', (e) => {
                this._actualizarEstiloItem(item, e.target.checked);
                this._actualizarContadorUsuarios();
            });
        });

        const seleccionarTodos = document.getElementById('seleccionarTodosUsuarios');
        const deseleccionarTodos = document.getElementById('deseleccionarTodosUsuarios');

        if (seleccionarTodos) {
            seleccionarTodos.addEventListener('click', () => {
                container.querySelectorAll('.usuario-checkbox').forEach(cb => {
                    cb.checked = true;
                    this._actualizarEstiloItem(cb.closest('.usuario-item'), true);
                });
                this._actualizarContadorUsuarios();
            });
        }

        if (deseleccionarTodos) {
            deseleccionarTodos.addEventListener('click', () => {
                container.querySelectorAll('.usuario-checkbox').forEach(cb => {
                    cb.checked = false;
                    this._actualizarEstiloItem(cb.closest('.usuario-item'), false);
                });
                this._actualizarContadorUsuarios();
            });
        }

        this._actualizarContadorUsuarios();
    }

    _getHTMLAreasCreacion() {
        if (this.areasDisponibles.length === 0) {
            return '<p class="no-items">No hay áreas disponibles</p>';
        }

        let html = `
            <div class="campos-especificos">
                <h6 class="section-title"><i class="fas fa-building"></i> Asignar a Área</h6>
                
                <div class="areas-container" id="areasContainer">
        `;

        this.areasDisponibles.forEach(area => {
            const iniciales = this._obtenerIniciales(area.nombreArea);
            const totalCargos = area.cargos ? Object.keys(area.cargos).length : 0;

            html += `
                <div class="area-item" data-area-id="${area.id}">
                    <input type="radio" class="area-radio" name="areaSeleccionada" value="${area.id}">
                    <div class="area-icon">${iniciales}</div>
                    <div class="area-info">
                        <span class="area-nombre">${this._escapeHTML(area.nombreArea)}</span>
                        <span class="area-descripcion">${this._escapeHTML(area.descripcion || 'Sin descripción')}</span>
                        <span class="area-badge">${totalCargos} cargos</span>
                    </div>
                </div>
            `;
        });

        html += `</div>`;

        html += `
            <div id="cargosSection" style="margin-top: 20px; display: none;">
                <h6 class="section-title"><i class="fas fa-user-tag"></i> Cargos específicos (opcional)</h6>
                <div class="cargos-container" id="cargosContainer">
                    <div class="loading-cargos"><i class="fas fa-spinner fa-spin"></i> Cargando cargos...</div>
                </div>
                <div class="selected-summary" id="selectedCargosSummary" style="display: none;">
                    <i class="fas fa-users"></i>
                    <span id="selectedCargosCount">0</span> cargos seleccionados
                </div>
            </div>
        `;

        html += `</div>`;

        return html;
    }

    _configurarSelectorAreasCreacion() {
        const areasContainer = document.getElementById('areasContainer');
        if (!areasContainer) return;

        areasContainer.querySelectorAll('.area-item').forEach(item => {
            const radio = item.querySelector('.area-radio');

            item.addEventListener('click', (e) => {
                if (e.target !== radio) {
                    radio.checked = true;
                    this._seleccionarAreaCreacion(item.dataset.areaId);
                }
            });

            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this._seleccionarAreaCreacion(item.dataset.areaId);
                }
            });
        });
    }

    async _seleccionarAreaCreacion(areaId) {
        document.querySelectorAll('.area-item').forEach(item => {
            if (item.dataset.areaId === areaId) {
                item.classList.add('seleccionado');
            } else {
                item.classList.remove('seleccionado');
            }
        });

        this.areaSeleccionada = this.areasDisponibles.find(a => a.id === areaId);
        const cargosSection = document.getElementById('cargosSection');
        if (cargosSection) cargosSection.style.display = 'block';
        await this._cargarCargosAreaCreacion(areaId);
    }

    async _cargarCargosAreaCreacion(areaId) {
        const area = this.areasDisponibles.find(a => a.id === areaId);
        if (!area) return;

        const cargosContainer = document.getElementById('cargosContainer');
        if (!cargosContainer) return;

        let cargos = [];
        if (area.cargos) {
            cargos = Object.entries(area.cargos)
                .filter(([_, cargo]) => cargo.estado !== 'inactivo')
                .map(([id, cargo]) => ({ id, ...cargo }));
        }

        if (cargos.length === 0) {
            cargosContainer.innerHTML = '<p class="no-items">No hay cargos disponibles en esta área</p>';
            return;
        }

        let html = '';
        cargos.forEach(cargo => {
            html += `
                <div class="cargo-item" data-cargo-id="${cargo.id}">
                    <input type="checkbox" class="cargo-checkbox" value="${cargo.id}">
                    <div class="cargo-icon"><i class="fas fa-user-tie"></i></div>
                    <div class="cargo-info">
                        <span class="cargo-nombre">${this._escapeHTML(cargo.nombre)}</span>
                        <span class="cargo-descripcion">${this._escapeHTML(cargo.descripcion || '')}</span>
                    </div>
                </div>
            `;
        });

        cargosContainer.innerHTML = html;

        cargosContainer.querySelectorAll('.cargo-item').forEach(item => {
            const checkbox = item.querySelector('.cargo-checkbox');

            item.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    this._actualizarEstiloItem(item, checkbox.checked);
                }
                this._actualizarContadorCargos();
            });

            checkbox.addEventListener('change', (e) => {
                this._actualizarEstiloItem(item, e.target.checked);
                this._actualizarContadorCargos();
            });
        });

        this._actualizarContadorCargos();
    }

    _getHTMLGeneral() {
        return `
            <div class="campos-especificos">
                <div class="visibility-info" style="padding: 15px; text-align: center;">
                    <i class="fas fa-eye" style="font-size: 24px; margin-right: 10px;"></i>
                    <span>Esta nota será visible para <strong>todos los usuarios</strong> de la organización</span>
                </div>
            </div>
        `;
    }

    _actualizarEstiloItem(item, seleccionado) {
        if (seleccionado) {
            item.classList.add('seleccionado');
        } else {
            item.classList.remove('seleccionado');
        }
    }

    _actualizarContadorUsuarios() {
        const count = document.querySelectorAll('.usuario-checkbox:checked').length;
        const span = document.getElementById('selectedUsersCount');
        if (span) span.textContent = count;
    }

    _actualizarContadorCargos() {
        const count = document.querySelectorAll('.cargo-checkbox:checked').length;
        const summary = document.getElementById('selectedCargosSummary');
        const span = document.getElementById('selectedCargosCount');

        if (summary && span) {
            if (count > 0) {
                span.textContent = count;
                summary.style.display = 'flex';
            } else {
                summary.style.display = 'none';
            }
        }
    }

    async _guardarNota() {
        const titulo = document.getElementById('notaTitulo');
        if (!titulo || !titulo.value.trim()) {
            this._mostrarError('El título es requerido');
            return;
        }

        const tipo = this.tipoSeleccionado;
        const notaId = document.getElementById('notaId')?.value || '';
        const descripcion = document.getElementById('notaDescripcion')?.value.trim() || '';
        const tieneRecordatorio = document.getElementById('tieneRecordatorio')?.checked || false;
        const fechaLimiteInput = document.getElementById('fechaLimite')?.value || '';
        const categoriaSelect = document.getElementById('categoriaNota');
        const subcategoriaSelect = document.getElementById('subcategoriaNota');
        const categoriaId = categoriaSelect ? categoriaSelect.value : '';
        const subcategoriaId = subcategoriaSelect ? subcategoriaSelect.value : '';

        const items = {};
        document.querySelectorAll('#itemsList .item-row').forEach((row, index) => {
            const checkbox = row.querySelector('.item-checkbox');
            const input = row.querySelector('.item-texto');
            const texto = input ? input.value.trim() : '';

            if (texto) {
                const itemId = row.dataset.itemId || `item_${Date.now()}_${index}`;
                items[itemId] = {
                    id: itemId,
                    texto: texto,
                    completado: checkbox ? checkbox.checked : false,
                    fechaCreacion: new Date().toISOString(),
                    marcadoPor: null,
                    marcadoPorNombre: null
                };
            }
        });

        let usuariosCompartidosIds = [];
        let areaId = null;
        let cargosIds = [];

        if (tipo === 'compartida') {
            usuariosCompartidosIds = Array.from(document.querySelectorAll('.usuario-checkbox:checked')).map(cb => cb.value);
            if (!usuariosCompartidosIds.includes(this.usuarioActual.id)) {
                usuariosCompartidosIds.push(this.usuarioActual.id);
            }
        } else if (tipo === 'area') {
            const areaRadio = document.querySelector('.area-radio:checked');
            if (areaRadio) {
                areaId = areaRadio.value;
                cargosIds = Array.from(document.querySelectorAll('.cargo-checkbox:checked')).map(cb => cb.value);
            } else {
                this._mostrarError('Debes seleccionar un área');
                return;
            }
        }

        let fechaLimite = null;
        if (tieneRecordatorio && fechaLimiteInput) {
            fechaLimite = new Date(fechaLimiteInput);
            fechaLimite.setHours(23, 59, 59, 999);
        }

        const tipoFirestore = tipo === 'general' ? 'global' : tipo;

        const tareaData = {
            nombreActividad: titulo.value.trim(),
            descripcion: descripcion,
            items: items,
            tipo: tipoFirestore,
            fechaLimite: fechaLimite,
            tieneRecordatorio: tieneRecordatorio,
            categoriaId: categoriaId || null,
            subcategoriaId: subcategoriaId || null
        };

        if (tipo === 'compartida') {
            tareaData.usuariosCompartidosIds = usuariosCompartidosIds;
        } else if (tipo === 'area') {
            tareaData.areaId = areaId;
            tareaData.cargosIds = cargosIds;
        }

        Swal.fire({
            title: 'Guardando...',
            html: '<i class="fas fa-spinner fa-spin"></i>',
            allowOutsideClick: false,
            showConfirmButton: false,
            background: 'var(--color-bg-secondary)'
        });

        try {
            if (notaId) {
                await this.tareaManager.actualizarTarea(
                    notaId, tareaData,
                    this.usuarioActual, this.usuarioActual.organizacionCamelCase
                );
            } else {
                await this.tareaManager.crearTarea(tareaData, this.usuarioActual);
            }

            Swal.close();

            await Swal.fire({
                icon: 'success',
                title: 'Éxito',
                text: `Nota ${notaId ? 'actualizada' : 'creada'} correctamente`,
                timer: 1500,
                showConfirmButton: false,
                background: 'var(--color-bg-secondary)'
            });

            this._ocultarFormulario();
            await this._cargarTareas();

        } catch (error) {
            Swal.close();
            this._mostrarError(error.message);
        }
    }

    async _eliminarTarea(tareaId) {
        const result = await Swal.fire({
            title: '¿Eliminar nota?',
            text: 'Esta acción no se puede deshacer',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            background: 'var(--color-bg-secondary)',
            confirmButtonColor: '#dc3545'
        });

        if (!result.isConfirmed) return;

        Swal.fire({
            title: 'Eliminando...',
            html: '<i class="fas fa-spinner fa-spin"></i>',
            allowOutsideClick: false,
            showConfirmButton: false,
            background: 'var(--color-bg-secondary)'
        });

        try {
            await this.tareaManager.eliminarTarea(
                tareaId, this.usuarioActual, this.usuarioActual.organizacionCamelCase
            );

            Swal.close();

            await Swal.fire({
                icon: 'success',
                title: 'Eliminada',
                text: 'La nota se eliminó correctamente',
                timer: 1500,
                showConfirmButton: false,
                background: 'var(--color-bg-secondary)'
            });

            await this._cargarTareas();

        } catch (error) {
            Swal.close();
            this._mostrarError(error.message);
        }
    }

    async _abrirFormularioEdicion(tareaId) {
        Swal.fire({
            title: 'Cargando...',
            html: '<i class="fas fa-spinner fa-spin"></i>',
            allowOutsideClick: false,
            showConfirmButton: false,
            background: 'var(--color-bg-secondary)'
        });

        try {
            this.tareaActual = await this.tareaManager.getTareaById(
                tareaId, this.usuarioActual.organizacionCamelCase
            );

            if (!this.tareaActual) throw new Error('Nota no encontrada');

            if (this.tareaActual.creadoPor !== this.usuarioActual.id) {
                Swal.close();
                this._mostrarError('No tienes permiso para editar esta nota');
                return;
            }

            Swal.close();

            this.modoEdicion = true;
            this.tipoSeleccionado = this.tareaActual.tipo === 'global' ? 'general' : this.tareaActual.tipo;
            this.areaSeleccionada = null;

            const notaIdInput = document.getElementById('notaId');
            const notaTitulo = document.getElementById('notaTitulo');
            const notaDescripcion = document.getElementById('notaDescripcion');
            const tieneRecordatorio = document.getElementById('tieneRecordatorio');
            const fechaLimite = document.getElementById('fechaLimite');
            const fechaContainer = document.getElementById('fechaContainer');
            const categoriaSelect = document.getElementById('categoriaNota');
            const subcategoriaSelect = document.getElementById('subcategoriaNota');

            if (notaIdInput) notaIdInput.value = this.tareaActual.id;
            if (notaTitulo) notaTitulo.value = this.tareaActual.nombreActividad || '';
            if (notaDescripcion) notaDescripcion.value = this.tareaActual.descripcion || '';

            const items = this.tareaActual.items ? Object.values(this.tareaActual.items) : [];
            this._renderizarItemsInline(items);

            const tieneRecordatorioVal = this.tareaActual.tieneRecordatorio || false;
            if (tieneRecordatorio) tieneRecordatorio.checked = tieneRecordatorioVal;
            if (fechaContainer) fechaContainer.style.display = tieneRecordatorioVal ? 'block' : 'none';

            if (this.tareaActual.fechaLimite) {
                const fecha = new Date(this.tareaActual.fechaLimite);
                if (fechaLimite) fechaLimite.value = fecha.toISOString().split('T')[0];
            } else {
                if (fechaLimite) fechaLimite.value = '';
            }

            if (this.tareaActual.categoriaId && this.categoriasDisponibles.length > 0 && categoriaSelect) {
                categoriaSelect.value = this.tareaActual.categoriaId;
                const categoria = this.categoriasDisponibles.find(c => c.id === this.tareaActual.categoriaId);
                if (categoria && categoria.subcategorias && subcategoriaSelect) {
                    let options = '<option value="">-- Selecciona subcategoría --</option>';
                    Object.values(categoria.subcategorias).forEach(sub => {
                        options += `<option value="${sub.id}" ${this.tareaActual.subcategoriaId === sub.id ? 'selected' : ''}>${this._escapeHTML(sub.nombre)}</option>`;
                    });
                    subcategoriaSelect.innerHTML = options;
                    subcategoriaSelect.disabled = false;
                }
            }

            const titulos = {
                'general': 'Editar Nota General',
                'personal': 'Editar Nota Personal',
                'compartida': 'Editar Nota Compartida',
                'area': 'Editar Nota por Área'
            };
            const formularioTitulo = document.getElementById('formularioTitulo');
            if (formularioTitulo) formularioTitulo.textContent = titulos[this.tipoSeleccionado] || 'Editar Nota';

            document.querySelectorAll('.tipo-option').forEach(opt => {
                if (opt.dataset.tipo === this.tipoSeleccionado) {
                    opt.classList.add('seleccionado');
                } else {
                    opt.classList.remove('seleccionado');
                }
            });

            await this._renderizarCamposEspecificosEdicion(this.tipoSeleccionado, this.tareaActual);

            const formulario = document.getElementById('formularioCreacion');
            if (formulario) formulario.style.display = 'block';

            setTimeout(() => {
                if (formulario) formulario.scrollIntoView({ behavior: 'smooth', block: 'start' });
                if (notaTitulo) {
                    notaTitulo.focus();
                    notaTitulo.select();
                }
            }, 100);

        } catch (error) {
            Swal.close();
            this._mostrarError('Error al cargar la nota');
        }
    }

    async _renderizarCamposEspecificosEdicion(tipo, tareaData) {
        const container = document.getElementById('camposEspecificos');
        if (!container) return;

        let html = this._getHTMLCategorias();

        switch (tipo) {
            case 'personal':
                break;
            case 'compartida':
                html += this._getHTMLUsuariosEdicion(tareaData);
                break;
            case 'area':
                html += this._getHTMLAreasEdicion(tareaData);
                break;
            case 'general':
                html += this._getHTMLGeneral();
                break;
        }

        container.innerHTML = html;

        if (tipo === 'compartida' && html.includes('usuariosContainer')) {
            this._configurarSelectorUsuariosEdicion(tareaData);
        } else if (tipo === 'area' && html.includes('areasContainer')) {
            await this._configurarSelectorAreasEdicion(tareaData);
        }

        this._configurarSelectorCategorias();
        
        if (tareaData.categoriaId) {
            const categoriaSelect = document.getElementById('categoriaNota');
            if (categoriaSelect) {
                categoriaSelect.value = tareaData.categoriaId;
                const event = new Event('change');
                categoriaSelect.dispatchEvent(event);
                
                setTimeout(() => {
                    if (tareaData.subcategoriaId) {
                        const subcategoriaSelect = document.getElementById('subcategoriaNota');
                        if (subcategoriaSelect) {
                            subcategoriaSelect.value = tareaData.subcategoriaId;
                        }
                    }
                }, 100);
            }
        }
    }

    _getHTMLUsuariosEdicion(tareaData) {
        if (this.usuariosDisponibles.length === 0) {
            return '<p class="no-items">No hay usuarios disponibles</p>';
        }

        const seleccionados = tareaData?.usuariosCompartidosIds || [];

        let html = `
            <div class="campos-especificos">
                <h6 class="section-title"><i class="fas fa-users"></i> Compartir con usuarios</h6>
                
                <div class="acciones-rapidas">
                    <button type="button" class="btn-accion-rapida" id="seleccionarTodosUsuarios">
                        <i class="fas fa-check-double"></i> Seleccionar Todos
                    </button>
                    <button type="button" class="btn-accion-rapida" id="deseleccionarTodosUsuarios">
                        <i class="fas fa-times"></i> Deseleccionar Todos
                    </button>
                </div>
                
                <div class="usuarios-container" id="usuariosContainer">
        `;

        this.usuariosDisponibles.forEach(usuario => {
            const iniciales = this._obtenerIniciales(usuario.nombreCompleto);
            const seleccionado = seleccionados.includes(usuario.id) ? 'checked' : '';

            html += `
                <div class="usuario-item" data-usuario-id="${usuario.id}">
                    <input type="checkbox" class="usuario-checkbox" value="${usuario.id}" ${seleccionado}>
                    <div class="usuario-avatar">${iniciales}</div>
                    <div class="usuario-info">
                        <span class="usuario-nombre">${this._escapeHTML(usuario.nombreCompleto)}</span>
                        <span class="usuario-correo">${this._escapeHTML(usuario.correoElectronico || '')}</span>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div class="selected-summary" id="selectedUsersSummary">
                    <i class="fas fa-users"></i>
                    <span id="selectedUsersCount">${seleccionados.length}</span> usuarios seleccionados
                </div>
            </div>
        `;

        return html;
    }

    _configurarSelectorUsuariosEdicion(tareaData) {
        const container = document.getElementById('usuariosContainer');
        if (!container) return;

        container.querySelectorAll('.usuario-item').forEach(item => {
            const checkbox = item.querySelector('.usuario-checkbox');

            if (checkbox.checked) {
                item.classList.add('seleccionado');
            }

            item.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    this._actualizarEstiloItem(item, checkbox.checked);
                }
                this._actualizarContadorUsuarios();
            });

            checkbox.addEventListener('change', (e) => {
                this._actualizarEstiloItem(item, e.target.checked);
                this._actualizarContadorUsuarios();
            });
        });

        const seleccionarTodos = document.getElementById('seleccionarTodosUsuarios');
        const deseleccionarTodos = document.getElementById('deseleccionarTodosUsuarios');

        if (seleccionarTodos) {
            seleccionarTodos.addEventListener('click', () => {
                container.querySelectorAll('.usuario-checkbox').forEach(cb => {
                    cb.checked = true;
                    this._actualizarEstiloItem(cb.closest('.usuario-item'), true);
                });
                this._actualizarContadorUsuarios();
            });
        }

        if (deseleccionarTodos) {
            deseleccionarTodos.addEventListener('click', () => {
                container.querySelectorAll('.usuario-checkbox').forEach(cb => {
                    cb.checked = false;
                    this._actualizarEstiloItem(cb.closest('.usuario-item'), false);
                });
                this._actualizarContadorUsuarios();
            });
        }

        this._actualizarContadorUsuarios();
    }

    _getHTMLAreasEdicion(tareaData) {
        if (this.areasDisponibles.length === 0) {
            return '<p class="no-items">No hay áreas disponibles</p>';
        }

        const areaSeleccionada = tareaData?.areaId || null;
        const cargosSeleccionados = tareaData?.cargosIds || [];

        let html = `
            <div class="campos-especificos">
                <h6 class="section-title"><i class="fas fa-building"></i> Asignar a Área</h6>
                
                <div class="areas-container" id="areasContainer">
        `;

        this.areasDisponibles.forEach(area => {
            const iniciales = this._obtenerIniciales(area.nombreArea);
            const totalCargos = area.cargos ? Object.keys(area.cargos).length : 0;
            const seleccionado = areaSeleccionada === area.id ? 'checked' : '';

            html += `
                <div class="area-item" data-area-id="${area.id}">
                    <input type="radio" class="area-radio" name="areaSeleccionada" value="${area.id}" ${seleccionado}>
                    <div class="area-icon">${iniciales}</div>
                    <div class="area-info">
                        <span class="area-nombre">${this._escapeHTML(area.nombreArea)}</span>
                        <span class="area-descripcion">${this._escapeHTML(area.descripcion || 'Sin descripción')}</span>
                        <span class="area-badge">${totalCargos} cargos</span>
                    </div>
                </div>
            `;
        });

        html += `</div>`;

        html += `
            <div id="cargosSection" style="margin-top: 20px; ${!areaSeleccionada ? 'display: none;' : ''}">
                <h6 class="section-title"><i class="fas fa-user-tag"></i> Cargos específicos (opcional)</h6>
                <div class="cargos-container" id="cargosContainer">
                    <div class="loading-cargos"><i class="fas fa-spinner fa-spin"></i> Cargando cargos...</div>
                </div>
                <div class="selected-summary" id="selectedCargosSummary" style="${cargosSeleccionados.length === 0 ? 'display: none;' : ''}">
                    <i class="fas fa-users"></i>
                    <span id="selectedCargosCount">${cargosSeleccionados.length}</span> cargos seleccionados
                </div>
            </div>
        `;

        html += `</div>`;

        return html;
    }

    async _configurarSelectorAreasEdicion(tareaData) {
        const areasContainer = document.getElementById('areasContainer');
        if (!areasContainer) return;

        areasContainer.querySelectorAll('.area-item').forEach(item => {
            const radio = item.querySelector('.area-radio');

            if (radio.checked) {
                item.classList.add('seleccionado');
            }

            item.addEventListener('click', (e) => {
                if (e.target !== radio) {
                    radio.checked = true;
                    this._seleccionarAreaEdicion(item.dataset.areaId, tareaData);
                }
            });

            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this._seleccionarAreaEdicion(item.dataset.areaId, tareaData);
                }
            });
        });

        if (tareaData?.areaId) {
            await this._cargarCargosAreaEdicion(tareaData.areaId, tareaData);
        }
    }

    async _seleccionarAreaEdicion(areaId, tareaData) {
        document.querySelectorAll('.area-item').forEach(item => {
            if (item.dataset.areaId === areaId) {
                item.classList.add('seleccionado');
            } else {
                item.classList.remove('seleccionado');
            }
        });

        this.areaSeleccionada = this.areasDisponibles.find(a => a.id === areaId);
        const cargosSection = document.getElementById('cargosSection');
        if (cargosSection) cargosSection.style.display = 'block';
        await this._cargarCargosAreaEdicion(areaId, tareaData);
    }

    async _cargarCargosAreaEdicion(areaId, tareaData = null) {
        const area = this.areasDisponibles.find(a => a.id === areaId);
        if (!area) return;

        const cargosContainer = document.getElementById('cargosContainer');
        if (!cargosContainer) return;

        let cargos = [];
        if (area.cargos) {
            cargos = Object.entries(area.cargos)
                .filter(([_, cargo]) => cargo.estado !== 'inactivo')
                .map(([id, cargo]) => ({ id, ...cargo }));
        }

        if (cargos.length === 0) {
            cargosContainer.innerHTML = '<p class="no-items">No hay cargos disponibles en esta área</p>';
            return;
        }

        const cargosSeleccionados = tareaData?.cargosIds || [];

        let html = '';
        cargos.forEach(cargo => {
            const seleccionado = cargosSeleccionados.includes(cargo.id) ? 'checked' : '';
            html += `
                <div class="cargo-item" data-cargo-id="${cargo.id}">
                    <input type="checkbox" class="cargo-checkbox" value="${cargo.id}" ${seleccionado}>
                    <div class="cargo-icon"><i class="fas fa-user-tie"></i></div>
                    <div class="cargo-info">
                        <span class="cargo-nombre">${this._escapeHTML(cargo.nombre)}</span>
                        <span class="cargo-descripcion">${this._escapeHTML(cargo.descripcion || '')}</span>
                    </div>
                </div>
            `;
        });

        cargosContainer.innerHTML = html;

        cargosContainer.querySelectorAll('.cargo-item').forEach(item => {
            const checkbox = item.querySelector('.cargo-checkbox');

            if (checkbox.checked) {
                item.classList.add('seleccionado');
            }

            item.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    this._actualizarEstiloItem(item, checkbox.checked);
                }
                this._actualizarContadorCargos();
            });

            checkbox.addEventListener('change', (e) => {
                this._actualizarEstiloItem(item, e.target.checked);
                this._actualizarContadorCargos();
            });
        });

        this._actualizarContadorCargos();
    }

    // ========== CONFIGURACIÓN DE EVENTOS ==========

    _configurarEventos() {
        const btnCrearNota = document.getElementById('btnCrearNota');
        if (btnCrearNota) {
            btnCrearNota.addEventListener('click', () => {
                this._mostrarFormularioCreacion();
            });
        }

        const cerrarFormulario = document.getElementById('cerrarFormulario');
        if (cerrarFormulario) {
            cerrarFormulario.addEventListener('click', () => {
                this._ocultarFormulario();
            });
        }

        const cancelarNota = document.getElementById('cancelarNota');
        if (cancelarNota) {
            cancelarNota.addEventListener('click', () => {
                this._ocultarFormulario();
            });
        }

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.tipoActual = btn.dataset.tipo;
                this._aplicarFiltros();
            });
        });

        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.terminoBusqueda = e.target.value.trim().toLowerCase();
                    this._aplicarFiltros();
                }, 300);
            });
        }

        document.querySelectorAll('.tipo-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const tipo = opt.dataset.tipo;
                this._seleccionarTipoFormulario(tipo);
            });
        });

        const guardarNota = document.getElementById('guardarNota');
        if (guardarNota) {
            guardarNota.addEventListener('click', () => this._guardarNota());
        }

        const tieneRecordatorio = document.getElementById('tieneRecordatorio');
        if (tieneRecordatorio) {
            tieneRecordatorio.addEventListener('change', (e) => {
                const fechaContainer = document.getElementById('fechaContainer');
                if (fechaContainer) {
                    fechaContainer.style.display = e.target.checked ? 'block' : 'none';
                }
            });
        }

        const btnAgregarItem = document.getElementById('btnAgregarItem');
        if (btnAgregarItem) {
            btnAgregarItem.addEventListener('click', () => {
                this._agregarItemFormulario();
            });
        }
    }

    // ========== ESTADOS DE UI ==========

    _mostrarCarga() {
        const container = document.getElementById('tareasGrid');
        if (container) {
            container.innerHTML = `
                <div class="loading-state">
                    <div class="loading-content">
                        <div class="loading-spinner"></div>
                        <h3>Cargando notas...</h3>
                    </div>
                </div>
            `;
        }
    }

    _mostrarErrorEnGrid(mensaje) {
        const container = document.getElementById('tareasGrid');
        if (container) {
            container.innerHTML = `
                <div class="error-state">
                    <div class="error-content">
                        <i class="fas fa-exclamation-circle"></i>
                        <h3>Error</h3>
                        <p>${this._escapeHTML(mensaje)}</p>
                        <button onclick="window.location.reload()" class="reload-btn">
                            <i class="fas fa-sync-alt"></i> Reintentar
                        </button>
                    </div>
                </div>
            `;
        }
    }

    _getEmptyStateHTML() {
        return `
            <div class="empty-state">
                <div class="empty-state-content">
                    <i class="fas fa-sticky-note"></i>
                    <h3>No hay notas</h3>
                    <p>No se encontraron notas para mostrar</p>
                </div>
            </div>
        `;
    }

    // ========== UTILIDADES ==========

    _obtenerIniciales(nombre) {
        if (!nombre) return 'U';
        return nombre.split(' ').map(p => p[0]).join('').toUpperCase().substring(0, 2);
    }

    _escapeHTML(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    _mostrarError(mensaje) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: mensaje,
            background: 'var(--color-bg-secondary)',
            confirmButtonColor: '#2f8cff'
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new TareasController();
});