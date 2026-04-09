window.appDebug = {
    estado: 'iniciando',
    controller: null
};

let Area, AreaManager;

// =============================================
// CONFIGURACIÓN DE PAGINACIÓN
// =============================================
const ITEMS_POR_PAGINA = 10;
let paginaActual = 1;
let terminoBusqueda = '';
let totalAreas = 0;
let totalPaginas = 0;
let areasActuales = []; // Solo las áreas de la página actual

// Filtros activos
let filtrosActivos = {
    estado: 'todos'
};

async function cargarDependencias() {
    try {
        const areaModule = await import('/clases/area.js');
        Area = areaModule.Area;
        AreaManager = areaModule.AreaManager;

        iniciarAplicacion();
    } catch (error) {
        console.error('[Error]', error.message);
        mostrarErrorInterfaz(error.message);
    }
}

function mostrarErrorInterfaz(mensaje) {
    const container = document.querySelector('.centinela-container') || document.body;
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-carga';
    errorDiv.innerHTML = `
        <h4><i class="fas fa-exclamation-triangle"></i> Error de Carga</h4>
        <p>${mensaje}</p>
    `;
    container.prepend(errorDiv);
}

function iniciarAplicacion() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarController);
    } else {
        inicializarController();
    }
}

function inicializarController() {
    try {
        const app = new AreasController();
        window.appDebug.controller = app;
        app.init();
    } catch (error) {
        console.error('[Error]', error.message);
        mostrarErrorInterfaz(error.message);
    }
}

class AreasController {
    constructor() {
        this.areaManager = null;
        this.filaExpandida = null;
        this.usuarioActual = null;
        this.todasLasAreasCache = [];

        this.cargarUsuarioDesdeStorage();
    }

    cargarUsuarioDesdeStorage() {
        try {
            let userData = null;

            const adminInfo = localStorage.getItem('adminInfo');
            if (adminInfo) {
                const adminData = JSON.parse(adminInfo);
                userData = {
                    id: adminData.id || `admin_${Date.now()}`,
                    nombre: adminData.nombreCompleto || 'Administrador',
                    nombreCompleto: adminData.nombreCompleto || 'Administrador',
                    rol: 'administrador',
                    organizacion: adminData.organizacion || 'Sin organización',
                    organizacionCamelCase: adminData.organizacionCamelCase || this.convertirACamelCase(adminData.organizacion),
                    correo: adminData.correoElectronico || '',
                    fotoUsuario: adminData.fotoUsuario,
                    fotoOrganizacion: adminData.fotoOrganizacion,
                    esSuperAdmin: adminData.esSuperAdmin || true,
                    esAdminOrganizacion: adminData.esAdminOrganizacion || true
                };
            }

            if (!userData) {
                const storedUserData = localStorage.getItem('userData');
                if (storedUserData) {
                    userData = JSON.parse(storedUserData);
                    userData.nombreCompleto = userData.nombreCompleto || userData.nombre || 'Usuario';
                }
            }

            if (!userData) {
                userData = {
                    id: `user_${Date.now()}`,
                    nombre: 'Usuario',
                    nombreCompleto: 'Usuario',
                    rol: 'colaborador',
                    organizacion: 'Sin organización',
                    organizacionCamelCase: 'sinOrganizacion',
                    correo: '',
                    fotoUsuario: null,
                    fotoOrganizacion: null,
                    esSuperAdmin: false,
                    esAdminOrganizacion: false
                };
            }

            if (!userData.id) userData.id = `user_${Date.now()}`;
            if (!userData.organizacion) userData.organizacion = 'Sin organización';
            if (!userData.organizacionCamelCase) {
                userData.organizacionCamelCase = this.convertirACamelCase(userData.organizacion);
            }
            if (!userData.rol) userData.rol = 'colaborador';
            if (!userData.nombreCompleto) userData.nombreCompleto = userData.nombre || 'Usuario';

            this.usuarioActual = userData;

        } catch (error) {
            console.error('Error cargando usuario:', error);
            this.usuarioActual = {
                id: `user_${Date.now()}`,
                nombre: 'Usuario',
                nombreCompleto: 'Usuario',
                rol: 'colaborador',
                organizacion: 'Sin organización',
                organizacionCamelCase: 'sinOrganizacion',
                correo: '',
                fotoUsuario: null,
                fotoOrganizacion: null,
                esSuperAdmin: false,
                esAdminOrganizacion: false
            };
        }
    }

    convertirACamelCase(texto) {
        if (!texto) return 'sinOrganizacion';
        return texto
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase())
            .replace(/[^a-zA-Z0-9]/g, '');
    }

    configurarBusqueda() {
        const container = document.querySelector('.card');
        if (!container) return;

        let filtrosContainer = document.querySelector('.filtros-container');

        if (!filtrosContainer) {
            filtrosContainer = document.createElement('div');
            filtrosContainer.className = 'filtros-container';
            filtrosContainer.innerHTML = `
                <div class="filtros-header">
                    <h5><i class="fas fa-search"></i> Buscar áreas:</h5>
                </div>
                <div class="filtros-body">
                    <div class="filtro-grupo">
                        <label for="buscarArea">Nombre o descripción</label>
                        <input type="text" id="buscarArea" class="filtro-input" 
                               placeholder="Escribe para buscar" autocomplete="off">
                    </div>
                    <div class="filtro-acciones">
                        <button class="btn-buscar" id="btnBuscarArea">
                            <i class="fas fa-search"></i> Buscar
                        </button>
                        <button class="btn-limpiar" id="btnLimpiarBusquedaArea">
                            <i class="fas fa-times"></i> Limpiar
                        </button>
                    </div>
                </div>
            `;

            container.parentNode.insertBefore(filtrosContainer, container);
        }

        const inputBuscar = document.getElementById('buscarArea');
        const btnBuscar = document.getElementById('btnBuscarArea');
        const btnLimpiar = document.getElementById('btnLimpiarBusquedaArea');

        if (btnBuscar) {
            btnBuscar.addEventListener('click', () => {
                terminoBusqueda = inputBuscar?.value.trim() || '';
                paginaActual = 1;
                this.cargarAreasPagina(1);
            });
        }

        if (btnLimpiar) {
            btnLimpiar.addEventListener('click', () => {
                if (inputBuscar) inputBuscar.value = '';
                terminoBusqueda = '';
                paginaActual = 1;
                this.cargarAreasPagina(1);
            });
        }

        if (inputBuscar) {
            let timeoutId;
            inputBuscar.addEventListener('input', (e) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    terminoBusqueda = e.target.value.trim();
                    paginaActual = 1;
                    this.cargarAreasPagina(1);
                }, 500);
            });
        }
    }

    async cargarAreasPagina(pagina) {
        if (!this.usuarioActual?.organizacionCamelCase) {
            console.error('No hay organización configurada');
            return;
        }

        try {
            this.mostrarCargando();

            if (!this.areaManager) {
                const { AreaManager } = await import('/clases/area.js');
                this.areaManager = new AreaManager();
            }

            const todasLasAreas = await this.areaManager.getAreasByOrganizacion(
                this.usuarioActual.organizacionCamelCase,
                filtrosActivos.estado === 'activa' ? true : false,
                this.usuarioActual
            );

            todasLasAreas.sort((a, b) => {
                const fechaA = a.fechaCreacion ? new Date(a.fechaCreacion) : 0;
                const fechaB = b.fechaCreacion ? new Date(b.fechaCreacion) : 0;
                return fechaB - fechaA;
            });

            this.todasLasAreasCache = todasLasAreas;

            let areasFiltradas = [...todasLasAreas];
            if (terminoBusqueda && terminoBusqueda.length >= 2) {
                const terminoLower = terminoBusqueda.toLowerCase();
                areasFiltradas = areasFiltradas.filter(area =>
                    (area.nombreArea && area.nombreArea.toLowerCase().includes(terminoLower)) ||
                    (area.descripcion && area.descripcion.toLowerCase().includes(terminoLower))
                );
            }

            totalAreas = areasFiltradas.length;
            totalPaginas = Math.ceil(totalAreas / ITEMS_POR_PAGINA);

            if (paginaActual > totalPaginas && totalPaginas > 0) {
                paginaActual = totalPaginas;
            }

            const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA;
            const fin = Math.min(inicio + ITEMS_POR_PAGINA, totalAreas);
            areasActuales = areasFiltradas.slice(inicio, fin);

            this.actualizarTablaConPaginacion();
            this.ocultarCargando();

        } catch (error) {
            console.error('Error cargando áreas:', error);
            this.mostrarError('Error al cargar áreas: ' + error.message);
            this.ocultarCargando();
        }
    }

    irPagina(pagina) {
        if (pagina < 1 || pagina > totalPaginas || pagina === paginaActual) return;
        paginaActual = pagina;
        this.cargarAreasPagina(pagina);
        document.querySelector('.card-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    renderizarPaginacion() {
        const pagination = document.getElementById('pagination');
        if (!pagination) return;

        if (totalPaginas <= 1) {
            pagination.innerHTML = '';
            return;
        }

        let html = '';

        html += `
            <li class="page-item ${paginaActual === 1 ? 'disabled' : ''}">
                <button class="page-link" onclick="window.appDebug.controller.irPagina(${paginaActual - 1})" ${paginaActual === 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i>
                </button>
            </li>
        `;

        const maxPagesToShow = 5;
        let startPage = Math.max(1, paginaActual - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPaginas, startPage + maxPagesToShow - 1);

        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        if (startPage > 1) {
            html += `
                <li class="page-item">
                    <button class="page-link" onclick="window.appDebug.controller.irPagina(1)">1</button>
                </li>
                ${startPage > 2 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}
            `;
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `
                <li class="page-item ${i === paginaActual ? 'active' : ''}">
                    <button class="page-link" onclick="window.appDebug.controller.irPagina(${i})">${i}</button>
                </li>
            `;
        }

        if (endPage < totalPaginas) {
            html += `
                ${endPage < totalPaginas - 1 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}
                <li class="page-item">
                    <button class="page-link" onclick="window.appDebug.controller.irPagina(${totalPaginas})">${totalPaginas}</button>
                </li>
            `;
        }

        html += `
            <li class="page-item ${paginaActual === totalPaginas || totalPaginas === 0 ? 'disabled' : ''}">
                <button class="page-link" onclick="window.appDebug.controller.irPagina(${paginaActual + 1})" ${paginaActual === totalPaginas || totalPaginas === 0 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </li>
        `;

        pagination.innerHTML = html;
    }

    actualizarTablaConPaginacion() {
        const tbody = document.getElementById('tablaAreasBody');
        if (!tbody) return;

        this.filaExpandida = null;

        const itemsMostrados = areasActuales.length;

        const paginationInfo = document.getElementById('paginationInfo');
        if (paginationInfo) {
            if (totalAreas === 0) {
                paginationInfo.textContent = 'No se encontraron áreas';
            } else {
                const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA + 1;
                const fin = Math.min(inicio + itemsMostrados - 1, totalAreas);
                paginationInfo.textContent = `Mostrando ${inicio}-${fin} de ${totalAreas} áreas`;
            }
        }

        const paginacionContainer = document.querySelector('.pagination-container');
        if (paginacionContainer) {
            paginacionContainer.style.display = totalPaginas > 1 ? 'flex' : 'none';
        }

        if (areasActuales.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-5">
                        <div style="text-align:center; padding:40px;">
                            <i class="fas fa-search" style="font-size: 48px; color: rgba(255,255,255,0.3); margin-bottom: 16px;"></i>
                            <h5 style="color:white;">No se encontraron áreas</h5>
                            <p style="color: var(--color-text-dim); margin-top: 10px;">
                                ${terminoBusqueda ? `No hay resultados para "${terminoBusqueda}"` : 'No hay áreas registradas'}
                            </p>
                            ${!terminoBusqueda ? `
                                <button class="btn-nueva-area" onclick="window.appDebug.controller.irACrearArea()" style="margin-top: 16px;">
                                    <i class="fas fa-plus"></i> Crear Área
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
            this.renderizarPaginacion();
            return;
        }

        tbody.innerHTML = '';

        areasActuales.forEach((area) => {
            tbody.appendChild(this.crearFilaArea(area));
        });

        this.renderizarPaginacion();
    }

    async init() {
        this.actualizarBadgeEmpresa();
        this.configurarBusqueda();
        this.inicializarEventos();
        await this.cargarAreasPagina(1);
    }

    actualizarBadgeEmpresa() {
        const badgeEmpresa = document.getElementById('badge-empresa');
        const empresaNombre = badgeEmpresa?.querySelector('.empresa-nombre');

        if (badgeEmpresa && empresaNombre && this.usuarioActual?.organizacion) {
            empresaNombre.textContent = this.usuarioActual.organizacion;
            badgeEmpresa.style.display = 'inline-flex';
        }
    }

    inicializarEventos() {
        const btnNuevaArea = document.getElementById('btnNuevaArea');
        if (btnNuevaArea) {
            btnNuevaArea.addEventListener('click', () => this.irACrearArea());
        }
    }

    irACrearArea() {
        window.location.href = '../crearAreas/crearAreas.html';
    }

    irAEditarArea(areaId) {
        window.location.href = `../editarAreas/editarAreas.html?id=${areaId}`;
    }

    irAEditarCargo(areaId, cargoId, event) {
        event?.stopPropagation();
        window.location.href = `../editarAreas/editarAreas.html?id=${areaId}&editarCargo=${cargoId}`;
    }

    irACrearCargo(areaId, event) {
        event?.stopPropagation();
        window.location.href = `../editarAreas/editarAreas.html?id=${areaId}&nuevoCargo=true`;
    }

    toggleCargos(areaId, event) {
        if (event?.target.closest('.action-buttons, [data-action], .btn')) {
            return;
        }

        const fila = document.getElementById(`fila-${areaId}`);
        if (!fila) return;

        if (this.filaExpandida === areaId) {
            fila.classList.remove('expanded');
            const filaCargos = document.getElementById(`cargos-${areaId}`);
            if (filaCargos) filaCargos.remove();
            this.filaExpandida = null;
        } else {
            if (this.filaExpandida) {
                const filaAnterior = document.getElementById(`fila-${this.filaExpandida}`);
                if (filaAnterior) filaAnterior.classList.remove('expanded');
                const cargosAnteriores = document.getElementById(`cargos-${this.filaExpandida}`);
                if (cargosAnteriores) cargosAnteriores.remove();
            }

            fila.classList.add('expanded');
            this.filaExpandida = areaId;
            this.mostrarCargosDesplegables(areaId, fila);
        }
    }

    mostrarCargosDesplegables(areaId, filaReferencia) {
        const area = areasActuales.find(a => a.id === areaId);
        if (!area) return;

        const cargos = area.getCargosAsArray();
        const cantidad = area.getCantidadCargosTotal();
        const cargosActivos = cargos.filter(c => c.estado === 'activo').length;

        const filaCargos = document.createElement('tr');
        filaCargos.id = `cargos-${areaId}`;
        filaCargos.className = 'cargos-row';
        filaCargos.style.display = 'table-row';

        const celda = document.createElement('td');
        celda.colSpan = 8;
        celda.style.padding = '0';
        celda.style.borderTop = 'none';

        const botonAgregarHTML = `
            <button class="btn-nueva-area" style="min-width: auto; padding: 8px 16px !important;" onclick="window.appDebug.controller.irACrearCargo('${area.id}', event)">
                <i class="fas fa-plus"></i> Agregar Cargo
            </button>
        `;

        if (cargos.length === 0) {
            celda.innerHTML = `
                <div class="cargos-container" style="background: linear-gradient(to bottom, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.5)); padding: 20px; border-radius: 0 0 var(--border-radius-large) var(--border-radius-large);">
                    <div class="cargos-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
                        <h6 style="color: var(--color-text-primary); font-size: 1rem; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-list-ul"></i>
                            Cargos de <span style="color:#2f8cff;">"${this.escapeHTML(area.nombreArea)}"</span>
                        </h6>
                        ${botonAgregarHTML}
                    </div>
                    <div style="text-align:center; padding:30px; background:rgba(0,0,0,0.2); border-radius:8px;">
                        <i class="fas fa-briefcase" style="font-size:32px; color:#6b7280;"></i>
                        <p style="color:#6b7280; margin: 10px 0;">No hay cargos asignados</p>
                        ${botonAgregarHTML}
                    </div>
                </div>
            `;
        } else {
            let cargosHTML = '';
            cargos.forEach((cargo, index) => {
                const descripcionTruncada = cargo.descripcion && cargo.descripcion.length > 40
                    ? cargo.descripcion.substring(0, 37) + '...'
                    : cargo.descripcion || '';

                const nombreTruncado = cargo.nombre && cargo.nombre.length > 18
                    ? cargo.nombre.substring(0, 15) + '...'
                    : cargo.nombre || 'Sin nombre';

                const estadoCargo = cargo.estado || 'activo';
                const estadoBadge = estadoCargo === 'activo'
                    ? '<span class="badge-activo" style="font-size:0.7rem; padding:3px 8px;"><i class="fas fa-check-circle"></i> Activo</span>'
                    : '<span class="badge-inactivo" style="font-size:0.7rem; padding:3px 8px;"><i class="fas fa-pause-circle"></i> Inactivo</span>';

                cargosHTML += `
                    <tr style="opacity: ${estadoCargo === 'inactivo' ? '0.7' : '1'};">
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: middle; font-size: 0.85rem; width: 40px;">${index + 1}</td>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: middle; font-size: 0.85rem;">
                            <div style="display: flex; align-items: center; flex-wrap: nowrap; gap: 8px;">
                                <span style="max-width:120px; color: white;" title="${this.escapeHTML(cargo.nombre || '')}">${this.escapeHTML(nombreTruncado)}</span>
                            </div>
                        </td>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: middle; font-size: 0.85rem;">
                            <span style="max-width:200px; word-break: break-word; white-space: normal; line-height: 1.4; color: var(--color-text-dim);" title="${this.escapeHTML(cargo.descripcion || '')}">${this.escapeHTML(descripcionTruncada) || '-'}</span>
                        </td>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: middle; font-size: 0.85rem; width: 100px;">
                            ${estadoBadge}
                        </td>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: middle; font-size: 0.85rem; width: 150px;">
                            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                                <button class="btn" onclick="window.appDebug.controller.verDetallesCargo('${area.id}', '${cargo.id}', event)" title="Ver detalles">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn btn-warning" onclick="window.appDebug.controller.irAEditarCargo('${area.id}', '${cargo.id}', event)" title="Editar">
                                    <i class="fas fa-edit"></i>
                                </button>
                                ${estadoCargo === 'activo'
                        ? `<button class="btn btn-danger" onclick="window.appDebug.controller.inactivarCargo('${area.id}', '${cargo.id}', event)" title="Inactivar">
                                        <i class="fas fa-pause-circle"></i>
                                       </button>`
                        : `<button class="btn btn-success" onclick="window.appDebug.controller.reactivarCargo('${area.id}', '${cargo.id}', event)" title="Reactivar">
                                        <i class="fas fa-play-circle"></i>
                                       </button>`
                    }
                            </div>
                        </td>
                    </tr>
                `;
            });

            celda.innerHTML = `
                <div class="cargos-container" style="background: linear-gradient(to bottom, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.5)); padding: 20px; border-radius: 0 0 var(--border-radius-large) var(--border-radius-large);">
                    <div class="cargos-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
                        <h6 style="color: var(--color-text-primary); font-size: 1rem; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-list-ul"></i>
                            Cargos de <span style="color:#2f8cff;">"${this.escapeHTML(area.nombreArea)}"</span>
                            <span style="font-size:0.8rem; color: var(--color-text-dim); margin-left:10px;">
                                (${cargosActivos} activos de ${cantidad})
                            </span>
                        </h6>
                        ${botonAgregarHTML}
                    </div>
                    <div style="background: rgba(0, 0, 0, 0.2); border-radius: var(--border-radius-medium); overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; min-width: 100%;">
                            <thead>
                                <tr>
                                    <th style="width: 40px; padding: 12px; text-align: left; color: var(--color-text-dim); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.1); white-space: nowrap;">#</th>
                                    <th style="width: 20%; padding: 12px; text-align: left; color: var(--color-text-dim); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.1); white-space: nowrap;">Nombre</th>
                                    <th style="width: 35%; padding: 12px; text-align: left; color: var(--color-text-dim); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.1); white-space: nowrap;">Descripción</th>
                                    <th style="width: 100px; padding: 12px; text-align: left; color: var(--color-text-dim); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.1); white-space: nowrap;">Estado</th>
                                    <th style="width: 150px; padding: 12px; text-align: left; color: var(--color-text-dim); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.1); white-space: nowrap;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${cargosHTML}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        filaCargos.appendChild(celda);
        filaReferencia.parentNode.insertBefore(filaCargos, filaReferencia.nextSibling);
    }

    verDetallesCargo(areaId, cargoId, event) {
        event?.stopPropagation();

        const area = areasActuales.find(a => a.id === areaId);
        if (!area) return;

        const cargos = area.getCargosAsArray();
        const cargo = cargos.find(c => c.id === cargoId);

        if (!cargo) return;

        Swal.fire({
            title: cargo.nombre || 'Cargo',
            html: `
                <div style="text-align: left;">
                    <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--color-border-light);">
                        <h4 style="color: var(--color-accent-primary); margin: 0 0 10px 0; font-size: 0.9rem; text-transform: uppercase;">
                            <i class="fas fa-sitemap" style="margin-right: 8px;"></i>ÁREA
                        </h4>
                        <p style="color: var(--color-text-secondary); margin: 0;">${this.escapeHTML(area.nombreArea)}</p>
                    </div>

                    <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--color-border-light);">
                        <h4 style="color: var(--color-accent-primary); margin: 0 0 10px 0; font-size: 0.9rem; text-transform: uppercase;">
                            <i class="fas fa-align-left" style="margin-right: 8px;"></i>DESCRIPCIÓN
                        </h4>
                        <p style="color: var(--color-text-secondary); margin: 0;">${this.escapeHTML(cargo.descripcion) || 'No hay descripción disponible.'}</p>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <h4 style="color: var(--color-accent-primary); margin: 0 0 10px 0; font-size: 0.9rem; text-transform: uppercase;">
                            <i class="fas fa-info-circle" style="margin-right: 8px;"></i>ESTADO
                        </h4>
                        <p style="color: var(--color-text-secondary); margin: 0;">
                            ${cargo.estado === 'activo'
                    ? '<span class="badge-activo"><i class="fas fa-check-circle"></i> Activo</span>'
                    : '<span class="badge-inactivo"><i class="fas fa-pause-circle"></i> Inactivo</span>'}
                        </p>
                    </div>
                </div>
            `,
            icon: null,
            showConfirmButton: true,
            showCancelButton: true,
            confirmButtonText: 'CERRAR',
            cancelButtonText: 'CANCELAR',
            reverseButtons: false
        });
    }

    async inactivarCargo(areaId, cargoId, event) {
        event?.stopPropagation();

        const area = areasActuales.find(a => a.id === areaId);
        if (!area) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Área no encontrada' });
            return;
        }

        const cargos = area.getCargosAsArray();
        const cargo = cargos.find(c => c.id === cargoId);

        if (!cargo) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Cargo no encontrado' });
            return;
        }

        const result = await Swal.fire({
            title: '¿Inactivar cargo?',
            html: `
                <p style="color: var(--color-text-primary); margin: 10px 0; font-size: 1.1rem;">
                    <strong style="color: #ff4d4d;">"${this.escapeHTML(cargo.nombre || 'Sin nombre')}"</strong>
                </p>
                <p style="color: var(--color-text-dim); font-size: 0.8rem; margin-top: 15px;">
                    El cargo dejará de estar disponible, pero los datos se conservan.
                </p>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'INACTIVAR',
            cancelButtonText: 'CANCELAR',
            reverseButtons: false,
            focusCancel: true
        });

        if (result.isConfirmed) {
            try {
                await this.areaManager.inactivarCargo(
                    areaId,
                    cargoId,
                    this.usuarioActual.id,
                    this.usuarioActual.organizacionCamelCase,
                    this.usuarioActual
                );

                await Swal.fire({
                    icon: 'success',
                    title: 'Inactivado',
                    text: `"${cargo.nombre}" ha sido inactivado.`,
                    timer: 1500,
                    showConfirmButton: false
                });

                // Recargar la página actual para reflejar cambios
                await this.cargarAreasPagina(paginaActual);

            } catch (error) {
                Swal.fire({ icon: 'error', title: 'Error', text: error.message });
            }
        }
    }

    async reactivarCargo(areaId, cargoId, event) {
        event?.stopPropagation();

        const area = areasActuales.find(a => a.id === areaId);
        if (!area) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Área no encontrada' });
            return;
        }

        const cargos = area.getCargosAsArray();
        const cargo = cargos.find(c => c.id === cargoId);

        if (!cargo) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Cargo no encontrado' });
            return;
        }

        const result = await Swal.fire({
            title: '¿Reactivar cargo?',
            html: `
                <p style="color: var(--color-text-primary); margin: 10px 0; font-size: 1.1rem;">
                    <strong style="color: #28a745;">"${this.escapeHTML(cargo.nombre || 'Sin nombre')}"</strong>
                </p>
                <p style="color: var(--color-text-dim); font-size: 0.8rem; margin-top: 15px;">
                    El cargo volverá a estar disponible.
                </p>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'REACTIVAR',
            cancelButtonText: 'CANCELAR',
            reverseButtons: false,
            focusCancel: true
        });

        if (result.isConfirmed) {
            try {
                await this.areaManager.reactivarCargo(
                    areaId,
                    cargoId,
                    this.usuarioActual.id,
                    this.usuarioActual.organizacionCamelCase,
                    this.usuarioActual
                );

                await Swal.fire({
                    icon: 'success',
                    title: 'Reactivado',
                    text: `"${cargo.nombre}" ha sido reactivado.`,
                    timer: 1500,
                    showConfirmButton: false
                });

                // Recargar la página actual para reflejar cambios
                await this.cargarAreasPagina(paginaActual);

            } catch (error) {
                Swal.fire({ icon: 'error', title: 'Error', text: error.message });
            }
        }
    }

    solicitarInactivacion(areaId) {
        const area = areasActuales.find(a => a.id === areaId);
        if (!area) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Área no encontrada' });
            return;
        }

        const cargosActivos = area.getCantidadCargosActivos();

        if (cargosActivos > 0) {
            Swal.fire({
                icon: 'warning',
                title: 'No se puede inactivar',
                html: `
                    <p style="color: var(--color-text-primary); margin: 10px 0;">
                        El área <strong style="color: #ffcc00;">"${this.escapeHTML(area.nombreArea)}"</strong> tiene <strong style="color: #ff4d4d;">${cargosActivos} cargo(s) activo(s)</strong>.
                    </p>
                    <p style="color: var(--color-text-dim); font-size: 0.9rem; margin-top: 15px;">
                        Debes inactivar todos los cargos antes de poder inactivar el área.
                    </p>
                `,
                confirmButtonText: 'ENTENDIDO',
                confirmButtonColor: '#0B1E33'
            });
            return;
        }

        Swal.fire({
            title: '¿Inactivar área?',
            html: `
                <p style="color: var(--color-text-primary); margin: 10px 0; font-size: 1.1rem;">
                    <strong style="color: #ff4d4d;">"${this.escapeHTML(area.nombreArea)}"</strong>
                </p>
                <p style="color: var(--color-text-dim); font-size: 0.8rem; margin-top: 15px;">
                    El área dejará de estar visible en el sistema, pero los datos se conservan.
                </p>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'INACTIVAR',
            cancelButtonText: 'CANCELAR',
            reverseButtons: false,
            focusCancel: true
        }).then((result) => {
            if (result.isConfirmed) {
                this.inactivarArea(areaId);
            }
        });
    }

    async inactivarArea(areaId) {
        try {
            await this.areaManager.inactivarArea(
                areaId,
                this.usuarioActual.id,
                this.usuarioActual.organizacionCamelCase,
                this.usuarioActual
            );

            Swal.fire({
                icon: 'success',
                title: 'Inactivada',
                text: 'El área fue inactivada correctamente',
                timer: 2000,
                showConfirmButton: false
            });

            await this.cargarAreasPagina(1);
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo inactivar el área' });
        }
    }

    async reactivarArea(areaId) {
        try {
            await this.areaManager.reactivarArea(
                areaId,
                this.usuarioActual.id,
                this.usuarioActual.organizacionCamelCase,
                this.usuarioActual
            );

            Swal.fire({
                icon: 'success',
                title: 'Reactivada',
                text: 'El área fue reactivada correctamente',
                timer: 2000,
                showConfirmButton: false
            });

            await this.cargarAreasPagina(1);
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo reactivar el área' });
        }
    }

    ejecutarAccion(accion, areaId) {
        switch (accion) {
            case 'ver':
                this.verDetalles(areaId);
                break;
            case 'editar':
                this.irAEditarArea(areaId);
                break;
            case 'inactivar':
                this.solicitarInactivacion(areaId);
                break;
            case 'reactivar':
                this.reactivarArea(areaId);
                break;
        }
    }

    truncarTexto(texto, maxLongitud = 30) {
        if (!texto) return '';
        if (texto.length <= maxLongitud) return texto;
        return texto.substring(0, maxLongitud) + '...';
    }

    escapeHTML(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async verDetalles(areaId) {
        try {
            const area = areasActuales.find(a => a.id === areaId);
            if (!area) {
                this.mostrarError('Área no encontrada');
                return;
            }

            const cargosActivos = area.getCantidadCargosActivos();
            const cargosTotal = area.getCantidadCargosTotal();
            const nombreAreaTruncado = this.truncarTexto(area.nombreArea, 25);

            Swal.fire({
                title: nombreAreaTruncado,
                html: `
                    <div style="text-align: left;">
                        <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--color-border-light);">
                            <h4 style="color: var(--color-accent-primary); margin: 0 0 10px 0; font-size: 0.9rem; text-transform: uppercase;">
                                <i class="fas fa-align-left" style="margin-right: 8px;"></i>DESCRIPCIÓN
                            </h4>
                            <p style="color: var(--color-text-secondary); margin: 0;">${this.escapeHTML(area.descripcion) || 'No hay descripción disponible para esta área.'}</p>
                        </div>
                        
                        <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--color-border-light);">
                            <h4 style="color: var(--color-accent-primary); margin: 0 0 10px 0; font-size: 0.9rem; text-transform: uppercase;">
                                <i class="fas fa-briefcase" style="margin-right: 8px;"></i>CARGOS
                            </h4>
                            <p style="color: var(--color-text-secondary);">
                                ${cargosActivos} activos de ${cargosTotal} totales
                            </p>
                        </div>
                        
                        <div>
                            <h4 style="color: var(--color-accent-primary); margin: 0 0 10px 0; font-size: 0.9rem; text-transform: uppercase;">
                                <i class="fas fa-info-circle" style="margin-right: 8px;"></i>INFORMACIÓN DEL SISTEMA
                            </h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                <div>
                                    <small style="color: var(--color-accent-primary); display: block; font-size: 0.7rem; text-transform: uppercase;">FECHA CREACIÓN</small>
                                    <span style="color: var(--color-text-secondary);"><i class="fas fa-calendar" style="margin-right: 5px;"></i> ${area.getFechaCreacionFormateada?.() || 'No disponible'}</span>
                                </div>
                                <div>
                                    <small style="color: var(--color-accent-primary); display: block; font-size: 0.7rem; text-transform: uppercase;">ÚLTIMA ACTUALIZACIÓN</small>
                                    <span style="color: var(--color-text-secondary);"><i class="fas fa-clock" style="margin-right: 5px;"></i> ${area.getFechaActualizacionFormateada?.() || 'No disponible'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `,
                icon: null,
                showConfirmButton: true,
                showCancelButton: true,
                confirmButtonText: 'EDITAR ÁREA',
                cancelButtonText: 'CERRAR',
                reverseButtons: false
            }).then((result) => {
                if (result.isConfirmed) {
                    this.irAEditarArea(area.id);
                }
            });
        } catch (error) {
            this.mostrarError('Error al cargar detalles');
        }
    }

    crearFilaArea(area) {
        const fila = document.createElement('tr');
        fila.id = `fila-${area.id}`;
        fila.className = 'area-row';

        if (this.filaExpandida === area.id) {
            fila.classList.add('expanded');
        }

        const cargosActivos = area.getCantidadCargosActivos();
        const cargosTotal = area.getCantidadCargosTotal();

        fila.innerHTML = `
            <td class="text-center" style="width:50px;" data-label="">
                <span class="toggle-icon" style="background: transparent; border: none;"><i class="fas fa-chevron-right" style="color: white;"></i></span>
             </td>
            <td data-label="Nombre">
                <div style="display: flex; align-items: center;">
                    <div style="width:4px; height:24px; background:#2f8cff; border-radius:2px; margin-right:12px; flex-shrink:0;"></div>
                    <div>
                        <strong class="area-nombre" style="color:white;" title="${this.escapeHTML(area.nombreArea)}">${this.escapeHTML(area.nombreArea)}</strong>
                        ${area.descripcion ? `<div style="color: var(--color-text-dim); font-size:0.75rem; margin-top:2px;">${this.escapeHTML(area.descripcion.substring(0, 60))}${area.descripcion.length > 60 ? '...' : ''}</div>` : ''}
                    </div>
                </div>
            </td>
            <td data-label="Organización">${this.escapeHTML(area.organizacionCamelCase || this.usuarioActual.organizacion)}</td>
            <td data-label="Cargos">
                <span class="cargo-count-badge">
                    ${cargosActivos} ${cargosActivos === 1 ? 'activo' : 'activos'} / ${cargosTotal} total
                </span>
            </td>
            <td data-label="Estado">${area.getEstadoBadge ? area.getEstadoBadge() : '<span class="badge-activo">Activa</span>'}</td>
            <td data-label="Fecha Creación"><div style="color: var(--color-text-dim);">${area.getFechaCreacionFormateada?.() || 'No disponible'}</div></td>
            <td data-label="Acciones">
                <div class="action-buttons">
                    <button class="btn" data-action="ver" data-id="${area.id}" title="Ver detalles">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-warning" data-action="editar" data-id="${area.id}" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${area.estado === 'activa'
                ? `<button class="btn btn-danger" data-action="inactivar" data-id="${area.id}" title="Inactivar">
                            <i class="fas fa-pause-circle"></i>
                           </button>`
                : `<button class="btn btn-success" data-action="reactivar" data-id="${area.id}" title="Reactivar">
                            <i class="fas fa-play-circle"></i>
                           </button>`
            }
                </div>
            </td>
        `;

        fila.addEventListener('click', (e) => this.toggleCargos(area.id, e));

        const toggleIcon = fila.querySelector('.toggle-icon');
        if (toggleIcon) {
            toggleIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleCargos(area.id, e);
            });
        }

        const badgeCargos = fila.querySelector('.cargo-count-badge');
        if (badgeCargos) {
            badgeCargos.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleCargos(area.id, e);
            });
        }

        setTimeout(() => {
            fila.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    const id = btn.dataset.id;
                    this.ejecutarAccion(action, id);
                });
            });
        }, 50);

        return fila;
    }

    mostrarCargando() {
        const tbody = document.getElementById('tablaAreasBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-5">
                        <div class="spinner-border" role="status">
                            <span class="visually-hidden">Cargando...</span>
                        </div>
                        <p class="mt-3">Cargando áreas...</p>
                    </td>
                </tr>
            `;
        }
    }

    ocultarCargando() { }

    mostrarError(mensaje) {
        this.mostrarNotificacion(mensaje, 'error');
    }

    mostrarNotificacion(mensaje, tipo) {
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 5000,
            timerProgressBar: true
        });

        Toast.fire({ icon: tipo, title: mensaje });
    }
}

window.appDebug.controller = null;

cargarDependencias();