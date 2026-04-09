// ========== VARIABLES GLOBALES ==========
let userManager = null;
let usuarioActual = null;
let historialManager = null;
let areaManager = null;
let areasMap = new Map(); // Cache de áreas por ID

// Configuración de paginación
const ITEMS_POR_PAGINA = 10;
let paginaActual = 1;
let terminoBusqueda = '';
let todosLosColaboradores = [];
let colaboradoresFiltrados = [];

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', async function () {
    try {
        await inicializarHistorial();

        const { UserManager } = await import('/clases/user.js');
        userManager = new UserManager();

        const { AreaManager } = await import('/clases/area.js');
        areaManager = new AreaManager();

        await new Promise(resolve => setTimeout(resolve, 1500));

        usuarioActual = obtenerUsuarioActual();

        if (!usuarioActual) {
            usuarioActual = {
                id: `usuario_${Date.now()}`,
                uid: `usuario_${Date.now()}`,
                nombreCompleto: 'Usuario',
                organizacion: 'Mi Organización',
                organizacionCamelCase: 'miOrganizacion',
                correoElectronico: 'usuario@ejemplo.com'
            };
        }

        localStorage.setItem('userInfo', JSON.stringify({
            id: usuarioActual.id,
            nombreCompleto: usuarioActual.nombreCompleto,
            organizacion: usuarioActual.organizacion,
            organizacionCamelCase: usuarioActual.organizacionCamelCase,
            correoElectronico: usuarioActual.correoElectronico,
            timestamp: new Date().toISOString()
        }));

        localStorage.removeItem('selectedCollaborator');

        await cargarAreas();
        await loadCollaborators();
        configurarBusqueda();
        setupEvents();

        await registrarAccesoVistaUsuarios();

    } catch (error) {
        console.error('Error inicializando:', error);
        showError(error.message || 'Error al cargar la página');
    }
});

// ========== CARGAR ÁREAS ==========
async function cargarAreas() {
    try {
        if (!areaManager || !usuarioActual?.organizacionCamelCase) return;

        const areas = await areaManager.getAreasByOrganizacion(usuarioActual.organizacionCamelCase);

        areasMap.clear();
        areas.forEach(area => {
            areasMap.set(area.id, area.nombreArea);
        });

    } catch (error) {
        console.error('Error cargando áreas:', error);
    }
}

async function inicializarHistorial() {
    try {
        const { HistorialUsuarioManager } = await import('/clases/historialUsuario.js');
        historialManager = new HistorialUsuarioManager();
    } catch (error) {
        console.error('Error inicializando historialManager:', error);
    }
}

async function registrarAccesoVistaUsuarios() {
    if (!historialManager) return;

    try {
        await historialManager.registrarActividad({
            usuario: usuarioActual,
            tipo: 'leer',
            modulo: 'usuarios',
            descripcion: 'Accedió a la vista de colaboradores',
            detalles: {
                totalColaboradores: todosLosColaboradores.length || 0,
                organizacion: usuarioActual?.organizacion
            }
        });
    } catch (error) {
        console.error('Error registrando acceso a usuarios:', error);
    }
}

async function registrarVisualizacionColaborador(colaborador) {
    if (!historialManager) return;

    try {
        const areaNombre = colaborador.areaAsignadaNombre || 'No asignada';
        const cargoNombre = colaborador.cargo?.nombre || 'No asignado';

        await historialManager.registrarActividad({
            usuario: usuarioActual,
            tipo: 'leer',
            modulo: 'usuarios',
            descripcion: `Visualizó detalles de colaborador: ${colaborador.nombreCompleto || colaborador.nombre}`,
            detalles: {
                colaboradorId: colaborador.id,
                colaboradorNombre: colaborador.nombreCompleto || colaborador.nombre,
                colaboradorEmail: colaborador.correoElectronico,
                colaboradorArea: areaNombre,
                colaboradorCargo: cargoNombre,
                colaboradorStatus: colaborador.status === true || colaborador.status === 'active' ? 'activo' : 'inactivo'
            }
        });
    } catch (error) {
        console.error('Error registrando visualización de colaborador:', error);
    }
}

async function registrarCambioEstadoColaborador(colaborador, nuevoEstado, estadoAnterior) {
    if (!historialManager) return;

    try {
        const nuevoEstadoTexto = nuevoEstado ? 'activo' : 'inactivo';
        const estadoAnteriorTexto = estadoAnterior ? 'activo' : 'inactivo';

        await historialManager.registrarActividad({
            usuario: usuarioActual,
            tipo: 'editar',
            modulo: 'usuarios',
            descripcion: `${nuevoEstado ? 'Habilitó' : 'Inhabilitó'} colaborador: ${colaborador.nombreCompleto || colaborador.nombre}`,
            detalles: {
                colaboradorId: colaborador.id,
                colaboradorNombre: colaborador.nombreCompleto || colaborador.nombre,
                colaboradorEmail: colaborador.correoElectronico,
                estadoAnterior: estadoAnteriorTexto,
                estadoNuevo: nuevoEstadoTexto,
                fechaCambio: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error registrando cambio de estado de colaborador:', error);
    }
}

function obtenerUsuarioActual() {
    try {
        const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
        if (adminInfo && Object.keys(adminInfo).length > 0) {
            return {
                id: adminInfo.id || adminInfo.uid || `admin_${Date.now()}`,
                uid: adminInfo.uid || adminInfo.id,
                nombreCompleto: adminInfo.nombreCompleto || 'Administrador',
                organizacion: adminInfo.organizacion || 'Mi Organización',
                organizacionCamelCase: adminInfo.organizacionCamelCase || generarCamelCase(adminInfo.organizacion),
                correoElectronico: adminInfo.correoElectronico || ''
            };
        }

        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (userData && Object.keys(userData).length > 0) {
            return {
                id: userData.uid || userData.id || `user_${Date.now()}`,
                uid: userData.uid || userData.id,
                nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
                organizacion: userData.organizacion || userData.empresa || 'Mi Organización',
                organizacionCamelCase: userData.organizacionCamelCase || generarCamelCase(userData.organizacion || userData.empresa),
                correoElectronico: userData.correo || userData.email || ''
            };
        }

        return null;

    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        return null;
    }
}

function generarCamelCase(texto) {
    if (!texto || typeof texto !== 'string') return 'miOrganizacion';
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '');
}

function configurarBusqueda() {
    const inputBuscar = document.getElementById('buscarColaborador');
    const btnBuscar = document.getElementById('btnBuscarColaborador');
    const btnLimpiar = document.getElementById('btnLimpiarBusqueda');

    if (btnBuscar) {
        btnBuscar.addEventListener('click', () => {
            terminoBusqueda = inputBuscar?.value.trim() || '';
            paginaActual = 1;
            filtrarYRenderizar();
        });
    }

    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => {
            if (inputBuscar) inputBuscar.value = '';
            terminoBusqueda = '';
            paginaActual = 1;
            filtrarYRenderizar();
        });
    }

    if (inputBuscar) {
        let timeoutId;
        inputBuscar.addEventListener('input', (e) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                terminoBusqueda = e.target.value.trim();
                paginaActual = 1;
                filtrarYRenderizar();
            }, 300);
        });

        inputBuscar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                terminoBusqueda = e.target.value.trim();
                paginaActual = 1;
                filtrarYRenderizar();
            }
        });
    }
}

function filtrarYRenderizar() {
    if (!todosLosColaboradores.length) {
        colaboradoresFiltrados = [];
    } else if (!terminoBusqueda || terminoBusqueda.length < 2) {
        colaboradoresFiltrados = [...todosLosColaboradores];
    } else {
        const terminoLower = terminoBusqueda.toLowerCase();
        colaboradoresFiltrados = todosLosColaboradores.filter(col =>
            (col.nombreCompleto && col.nombreCompleto.toLowerCase().includes(terminoLower)) ||
            (col.correoElectronico && col.correoElectronico.toLowerCase().includes(terminoLower)) ||
            (col.areaAsignadaNombre && col.areaAsignadaNombre.toLowerCase().includes(terminoLower)) ||
            (col.cargo?.nombre && col.cargo.nombre.toLowerCase().includes(terminoLower))
        );
    }

    renderizarConPaginacion();
}

function irPagina(pagina) {
    paginaActual = pagina;
    renderizarConPaginacion();
    document.querySelector('.card-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderizarPaginacion(totalPaginas) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;

    if (totalPaginas <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';
    for (let i = 1; i <= totalPaginas; i++) {
        html += `
            <li class="page-item ${i === paginaActual ? 'active' : ''}">
                <button class="page-link" onclick="window.irPaginaColaborador(${i})">${i}</button>
            </li>
        `;
    }
    pagination.innerHTML = html;
}

window.irPaginaColaborador = function (pagina) {
    paginaActual = pagina;
    renderizarConPaginacion();
    document.querySelector('.card-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function renderizarConPaginacion() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    const totalItems = colaboradoresFiltrados.length;
    const totalPaginas = Math.ceil(totalItems / ITEMS_POR_PAGINA);

    if (paginaActual > totalPaginas && totalPaginas > 0) {
        paginaActual = totalPaginas;
    }

    const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA;
    const fin = Math.min(inicio + ITEMS_POR_PAGINA, totalItems);
    const colaboradoresPagina = colaboradoresFiltrados.slice(inicio, fin);

    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        if (totalItems === 0) {
            paginationInfo.textContent = 'No se encontraron colaboradores';
        } else {
            paginationInfo.textContent = `Mostrando ${inicio + 1}-${fin} de ${totalItems} colaboradores`;
        }
    }

    const paginacionContainer = document.querySelector('.pagination-container');
    if (paginacionContainer) {
        paginacionContainer.style.display = totalItems > ITEMS_POR_PAGINA ? 'flex' : 'none';
    }

    if (totalItems === 0) {
        if (!todosLosColaboradores.length) {
            showEmptyState();
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <div class="empty-state-content">
                            <i class="fas fa-search" style="font-size: 48px; color: rgba(255,255,255,0.3); margin-bottom: 16px;"></i>
                            <h3>No se encontraron colaboradores</h3>
                            <p>${terminoBusqueda ? `No hay resultados para "${terminoBusqueda}"` : ''}</p>
                        </div>
                    </div>
                </tr>
            `;
        }
        renderizarPaginacion(0);
        return;
    }

    renderCollaboratorsTable(colaboradoresPagina);
    renderizarPaginacion(totalPaginas);
}

// ========== CARGAR COLABORADORES ==========
async function loadCollaborators() {
    try {
        showLoadingState();

        const colaboradoresBasicos = await userManager.getColaboradoresByOrganizacion(
            usuarioActual.organizacionCamelCase,
            true
        );

        todosLosColaboradores = [];

        for (const col of colaboradoresBasicos) {
            let areaNombre = '';
            if (col.areaAsignadaId && areasMap.has(col.areaAsignadaId)) {
                areaNombre = areasMap.get(col.areaAsignadaId);
            }

            col.areaAsignadaNombre = areaNombre;

            let cargoNombre = col.cargo?.nombre || '';

            if (!cargoNombre && col.id) {
                try {
                    const colCompleto = await userManager.getUserById(col.id);
                    if (colCompleto && colCompleto.cargo?.nombre) {
                        cargoNombre = colCompleto.cargo.nombre;
                        col.cargo = colCompleto.cargo;
                    }
                } catch (err) {
                    // Error silencioso
                }
            }

            todosLosColaboradores.push(col);
        }

        localStorage.setItem('colaboradoresList', JSON.stringify(
            todosLosColaboradores.map(col => ({
                id: col.id,
                nombreCompleto: col.nombreCompleto,
                correoElectronico: col.correoElectronico,
                areaAsignadaNombre: col.areaAsignadaNombre || '',
                cargoNombre: col.cargo?.nombre || '',
                status: col.status,
                organizacion: col.organizacion,
                fotoUsuario: col.fotoUsuario,
            }))
        ));

        colaboradoresFiltrados = [...todosLosColaboradores];
        renderizarConPaginacion();

    } catch (error) {
        console.error('Error cargando colaboradores:', error);
        showFirebaseError(error);
    }
}

// ========== RENDERIZAR TABLA CON ÁREA Y CARGO ==========
function renderCollaboratorsTable(collaborators) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    collaborators.forEach(col => {
        const row = document.createElement('tr');
        const isActive = col.status === true || col.status === 'active';

        const fullName = col.nombreCompleto || '';
        const fotoUrl = col.getFotoUrl ? col.getFotoUrl() : (col.fotoUsuario || '');

        const areaNombre = col.areaAsignadaNombre || '';
        const cargoNombre = col.cargo?.nombre || '';

        row.className = isActive ? 'collaborator-row' : 'collaborator-row inactive';

        row.innerHTML = `
            <td data-label="NOMBRE">
                <div class="user-info">
                    <div class="user-avatar ${!fotoUrl ? 'no-photo' : ''}" 
                         ${fotoUrl ? `style="background-image: url('${fotoUrl}')"` : ''}>
                        ${!fotoUrl ? '<i class="fas fa-user"></i>' : ''}
                    </div>
                    <div class="user-details">
                        <span class="user-name">${escapeHTML(fullName)}</span>
                    </div>
                </div>
               </td>
            <td data-label="ÁREA">${escapeHTML(areaNombre || 'No asignada')}</td>
            <td data-label="CARGO">${escapeHTML(cargoNombre || 'No asignado')}</td>
            <td data-label="CORREO">${escapeHTML(col.correoElectronico || 'No disponible')}</td>
            <td data-label="ESTADO">
                <span class="status ${isActive ? 'active' : 'inactive'}">
                    <i class="fas ${isActive ? 'fa-check-circle' : 'fa-ban'}"></i> 
                    ${isActive ? 'Activo' : 'Inactivo'}
                </span>
                </td>
            <td data-label="ACCIONES">
                <div class="btn-group">
                    <button type="button" class="btn btn-view" data-action="view" 
                            data-id="${col.id}" data-name="${escapeHTML(fullName)}" title="Ver detalles">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn ${isActive ? 'btn-disable' : 'btn-enable'}" 
                            data-action="toggle" data-id="${col.id}" data-name="${escapeHTML(fullName)}" 
                            data-status="${isActive}" title="${isActive ? 'Inhabilitar' : 'Habilitar'}">
                        <i class="fas ${isActive ? 'fa-user-slash' : 'fa-user-check'}"></i>
                    </button>
                    <button type="button" class="btn btn-edit" data-action="edit" 
                            data-id="${col.id}" data-name="${escapeHTML(fullName)}" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
                </td>
        `;

        tbody.appendChild(row);
    });
}

function setupEvents() {
    const addBtn = document.getElementById('addBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            window.location.href = '../crearUsuarios/crearUsuarios.html';
        });
    }

    const tbody = document.getElementById('usersTableBody');
    if (tbody) {
        tbody.addEventListener('click', async (e) => {
            const button = e.target.closest('.btn');
            if (!button) return;

            const action = button.getAttribute('data-action');
            const collaboratorId = button.getAttribute('data-id');
            const collaboratorName = button.getAttribute('data-name');
            const currentStatus = button.getAttribute('data-status') === 'true';

            if (action === 'toggle') {
                await toggleUserStatus(collaboratorId, collaboratorName, !currentStatus);
            }
            else if (action === 'edit') {
                await editUser(collaboratorId, collaboratorName);
            }
            else if (action === 'view') {
                await viewUserDetails(collaboratorId, collaboratorName);
            }
        });
    }
}

async function toggleUserStatus(collaboratorId, collaboratorName, enable) {
    try {
        const collaborator = await userManager.getUserById(collaboratorId);
        if (!collaborator) throw new Error('Colaborador no encontrado');

        const estadoAnterior = collaborator.status === true || collaborator.status === 'active';

        const actionText = enable ? 'Habilitar' : 'Inhabilitar';
        const statusText = enable ? 'habilitado' : 'inhabilitado';
        const iconType = enable ? 'question' : 'warning';

        const result = await Swal.fire({
            title: `${actionText} colaborador`,
            html: `
                <div>
                    <p><strong>${escapeHTML(collaboratorName)}</strong></p>
                    <p>${collaborator.correoElectronico || 'No email'}</p>
                    <p>¿Estás seguro de ${statusText} al colaborador?</p>
                    ${enable ?
                    '<p><i class="fas fa-check-circle" style="color: #2ecc71;"></i> El usuario podrá acceder al sistema normalmente</p>' :
                    '<p><i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i> El usuario no podrá acceder al sistema hasta que sea habilitado nuevamente</p>'
                }
                </div>
            `,
            icon: iconType,
            showCancelButton: true,
            confirmButtonText: `Sí, ${statusText}`,
            cancelButtonText: 'Cancelar'
        });

        if (!result.isConfirmed) return;

        Swal.fire({
            title: `${actionText}...`,
            text: 'Por favor espera',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        if (enable) {
            await userManager.reactivarUsuario(
                collaboratorId,
                'colaborador',
                usuarioActual.organizacionCamelCase
            );
        } else {
            await userManager.inactivarUsuario(
                collaboratorId,
                'colaborador',
                usuarioActual.organizacionCamelCase,
                'Estado cambiado por usuario'
            );
        }

        await userManager.updateUser(
            collaboratorId,
            { status: enable },
            'colaborador',
            usuarioActual.organizacionCamelCase
        );

        await registrarCambioEstadoColaborador(collaborator, enable, estadoAnterior);

        Swal.close();
        await loadCollaborators();

        Swal.fire({
            icon: 'success',
            title: '¡Estado cambiado!',
            html: `<p><strong>${escapeHTML(collaboratorName)}</strong> ha sido ${statusText} exitosamente</p>`,
            timer: 2000,
            timerProgressBar: true,
            showConfirmButton: false
        });

    } catch (error) {
        console.error('Error cambiando estado:', error);
        Swal.close();
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'No se pudo cambiar el estado del colaborador'
        });
    }
}

async function editUser(collaboratorId, collaboratorName) {
    const selectedCollaborator = {
        id: collaboratorId,
        nombreCompleto: collaboratorName,
        organizacion: usuarioActual.organizacion,
        organizacionCamelCase: usuarioActual.organizacionCamelCase,
        fechaSeleccion: new Date().toISOString(),
        usuario: usuarioActual.nombreCompleto
    };

    localStorage.setItem('selectedCollaborator', JSON.stringify(selectedCollaborator));
    window.location.href = `../editarUsuarios/editarUsuarios.html?id=${collaboratorId}&org=${usuarioActual.organizacionCamelCase}`;
}

async function viewUserDetails(collaboratorId, collaboratorName) {
    try {
        const collaborator = await userManager.getUserById(collaboratorId);
        if (!collaborator) throw new Error('Colaborador no encontrado');

        if (collaborator.areaAsignadaId && !collaborator.areaAsignadaNombre) {
            if (areasMap.has(collaborator.areaAsignadaId)) {
                collaborator.areaAsignadaNombre = areasMap.get(collaborator.areaAsignadaId);
            }
        }

        await registrarVisualizacionColaborador(collaborator);
        showCollaboratorDetails(collaborator, collaboratorName);

    } catch (error) {
        console.error('Error obteniendo detalles:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudieron obtener los detalles del colaborador'
        });
    }
}

// ========== MOSTRAR DETALLES EN MODAL ==========
// ========== MOSTRAR DETALLES EN MODAL ==========
// ========== MOSTRAR DETALLES EN MODAL ==========
function showCollaboratorDetails(collaborator, collaboratorName) {
    let fechaCreacion = 'No disponible';
    let fechaUltimoLogin = 'No disponible';

    // Procesar fecha de creación
    if (collaborator.fechaCreacion) {
        try {
            if (typeof collaborator.fechaCreacion.toDate === 'function') {
                const date = collaborator.fechaCreacion.toDate();
                fechaCreacion = date.toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
            else if (typeof collaborator.fechaCreacion === 'string') {
                const date = new Date(collaborator.fechaCreacion);
                if (!isNaN(date.getTime())) {
                    fechaCreacion = date.toLocaleDateString('es-MX', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            }
            else if (collaborator.fechaCreacion.seconds) {
                const date = new Date(collaborator.fechaCreacion.seconds * 1000);
                fechaCreacion = date.toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
            else if (collaborator.fechaCreacion instanceof Date) {
                fechaCreacion = collaborator.fechaCreacion.toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        } catch (e) {
            fechaCreacion = 'No disponible';
        }
    }

    // Procesar fecha de último inicio de sesión (ultimoLogin)
    if (collaborator.ultimoLogin) {
        try {
            if (typeof collaborator.ultimoLogin.toDate === 'function') {
                const date = collaborator.ultimoLogin.toDate();
                fechaUltimoLogin = date.toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
            else if (typeof collaborator.ultimoLogin === 'string') {
                const date = new Date(collaborator.ultimoLogin);
                if (!isNaN(date.getTime())) {
                    fechaUltimoLogin = date.toLocaleDateString('es-MX', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            }
            else if (collaborator.ultimoLogin.seconds) {
                const date = new Date(collaborator.ultimoLogin.seconds * 1000);
                fechaUltimoLogin = date.toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
            else if (collaborator.ultimoLogin instanceof Date) {
                fechaUltimoLogin = collaborator.ultimoLogin.toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        } catch (e) {
            fechaUltimoLogin = 'No disponible';
        }
    }

    const isActive = collaborator.status === true || collaborator.status === 'active';
    const fotoUrl = collaborator.getFotoUrl ? collaborator.getFotoUrl() : (collaborator.fotoUsuario || '');

    const areaNombre = collaborator.areaAsignadaNombre || 'No asignada';
    const cargoNombre = collaborator.cargo?.nombre || 'No asignado';

    Swal.fire({
        title: `Detalles de: ${collaboratorName}`,
        html: `
            <div class="swal-details-container">
                <div class="swal-user-profile">
                    <div class="swal-user-avatar-large">
                        ${fotoUrl ?
                `<img src="${fotoUrl}" alt="${escapeHTML(collaboratorName)}">` :
                `<i class="fas fa-user"></i>`
            }
                    </div>
                    <div class="swal-user-info-large">
                        <h3>${escapeHTML(collaborator.nombreCompleto || 'Sin nombre')}</h3>
                        <p>${escapeHTML(cargoNombre)} · ${escapeHTML(areaNombre)}</p>
                    </div>
                </div>
                
                <div class="swal-details-grid">
                    <div class="swal-detail-card">
                        <p><strong>Email</strong> <span>${escapeHTML(collaborator.correoElectronico || 'No especificado')}</span></p>
                        <p><strong>Estado</strong> 
                            <span class="status-detail ${isActive ? 'active' : 'inactive'}">
                                <i class="fas ${isActive ? 'fa-check-circle' : 'fa-ban'}"></i> 
                                ${isActive ? 'Activo' : 'Inactivo'}
                            </span>
                        </p>
                        <p><strong>Teléfono</strong> <span>${escapeHTML(collaborator.telefono || 'No especificado')}</span></p>
                    </div>
                    <div class="swal-detail-card">
                        <p><strong>Fecha creación</strong> <span>${fechaCreacion}</span></p>
                        <p><strong>Último inicio de sesión</strong> 
                            <span>
                                ${fechaUltimoLogin}
                            </span>
                        </p>
                        <p><strong>Verificado</strong> 
                            <span class="${collaborator.verificado ? 'verified' : 'not-verified'}">
                                <i class="fas ${collaborator.verificado ? 'fa-check-circle' : 'fa-times-circle'}"></i> 
                                ${collaborator.verificado ? 'Sí' : 'No'}
                            </span>
                        </p>
                    </div>
                </div>
                
                ${!isActive ? `
                    <div class="swal-warning-alert">
                        <p><i class="fas fa-exclamation-triangle"></i> Este usuario está inhabilitado</p>
                    </div>
                ` : ''}
            </div>
        `,
        width: 700,
        showCloseButton: true,
        showConfirmButton: false
    });
}

function escapeHTML(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showEmptyState() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="empty-state">
                <div class="empty-state-content">
                    <i class="fas fa-users"></i>
                    <h3>No hay colaboradores en ${usuarioActual?.organizacion || 'tu organización'}</h3>
                    <p>Comienza agregando tu primer colaborador</p>
                    <button class="btn-nuevo-colaborador" id="addFirstCollaborator" style="margin-top: 16px;">
                        <i class="fas fa-plus"></i> Agregar Colaborador
                    </button>
                </div>
                </td>
            </tr>
    `;

    document.getElementById('addFirstCollaborator')?.addEventListener('click', () => {
        window.location.href = '../crearUsuarios/crearUsuarios.html';
    });

    const paginacionContainer = document.querySelector('.pagination-container');
    if (paginacionContainer) paginacionContainer.style.display = 'none';
}

function showLoadingState() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="loading-state">
                <div class="loading-content">
                    <div class="loading-spinner"></div>
                    <h3>Cargando colaboradores...</h3>
                </div>
                </td>
            </tr>
    `;

    const paginacionContainer = document.querySelector('.pagination-container');
    if (paginacionContainer) paginacionContainer.style.display = 'none';
}

function showFirebaseError(error) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="error-state">
                <div class="error-content firebase-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Error al cargar colaboradores</h3>
                    <p class="error-message">${escapeHTML(error.message || 'Error de conexión con Firebase')}</p>
                    <p>Verifica tu conexión a internet y recarga la página.</p>
                    <button onclick="window.location.reload()" class="reload-btn">
                        <i class="fas fa-sync-alt"></i> Recargar página
                    </button>
                </div>
                </td>
            </tr>
    `;

    const paginacionContainer = document.querySelector('.pagination-container');
    if (paginacionContainer) paginacionContainer.style.display = 'none';
}

function showError(message) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="error-state">
                <div class="error-content">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>${escapeHTML(message)}</h3>
                    <button onclick="window.location.reload()" class="reload-btn">
                        <i class="fas fa-sync-alt"></i> Reintentar
                    </button>
                </div>
                </td>
            </tr>
    `;

    const paginacionContainer = document.querySelector('.pagination-container');
    if (paginacionContainer) paginacionContainer.style.display = 'none';
}