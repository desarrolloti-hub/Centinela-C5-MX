// ========== permisos.js - GESTIÓN DE PERMISOS ==========
// Basado en la estructura de categorias.js - VERSIÓN CON LOCALSTORAGE ÚNICAMENTE
// ACTUALIZADO: Incluye módulos Usuarios, Estadísticas, Tareas, Permisos y Login/Monitoreo

// ========== VARIABLES GLOBALES ==========
let permisoManager = null;
let areaManager = null;
let planManager = null;
let adminActual = null;
let permisosPlan = null; // Para saber qué módulos dinámicos mostrar

// Configuración de paginación
const ITEMS_POR_PAGINA = 10;
let paginaActual = 1;
let terminoBusqueda = '';
let todosLosPermisos = []; // Almacena todos los permisos para búsqueda
let permisosFiltrados = []; // Permisos filtrados para mostrar

// Cache de áreas para mostrar nombres
let areasCache = new Map();

// Nombres amigables para los módulos (TODOS)
const nombresModulos = {
    areas: 'Áreas',
    categorias: 'Categorías',
    sucursales: 'Sucursales',
    regiones: 'Regiones',
    incidencias: 'Incidencias',
    usuarios: 'Usuarios',
    estadisticas: 'Estadísticas',
    tareas: 'Tareas',
    permisos: 'Permisos',
    loginMonitoreo: 'Login/Monitoreo'
};

// Módulos fijos (siempre visibles)
const modulosFijos = ['areas', 'categorias', 'sucursales', 'regiones', 'usuarios', 'estadisticas', 'tareas', 'permisos', 'loginMonitoreo'];

// Módulos dinámicos (dependen del plan)
const modulosDinamicos = ['incidencias', 'monitoreo'];

// Orden de los módulos para mostrar
const ordenModulos = ['areas', 'categorias', 'sucursales', 'regiones', 'incidencias', 'usuarios', 'estadisticas', 'tareas', 'permisos', 'loginMonitoreo'];

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', async function () {
    try {
        // Mostrar estado de carga
        showLoadingState();

        // Cargar usuario desde localStorage SOLAMENTE
        const usuarioCargado = cargarUsuarioDesdeStorage();

        if (!usuarioCargado) {
            showNoAdminMessage();
            return;
        }

        // Importar las clases necesarias
        const { PermisoManager } = await import('/clases/permiso.js');
        const { AreaManager } = await import('/clases/area.js');
        const { PlanPersonalizadoManager } = await import('/clases/plan.js');

        permisoManager = new PermisoManager();
        areaManager = new AreaManager();
        planManager = new PlanPersonalizadoManager();

        // Pequeña pausa para simular carga
        await new Promise(resolve => setTimeout(resolve, 800));

        // Cargar permisos del plan (para saber qué módulos dinámicos mostrar)
        await cargarPermisosDelPlan();

        // Cargar áreas primero para tener los nombres
        await loadAreas();

        // Luego cargar permisos
        await loadPermisos();

        // Configurar búsqueda y eventos
        configurarBusqueda();
        setupEvents();

    } catch (error) {
        showError(error.message || 'Error al cargar la página');
    }
});

// ========== CARGAR PERMISOS DEL PLAN (PARA INCIDENCIAS Y MAPA DE ALERTAS) ==========
async function cargarPermisosDelPlan() {
    try {
        let planId = adminActual?.plan;

        if (!planId) {
            const adminInfo = localStorage.getItem('adminInfo');
            if (adminInfo) {
                const adminData = JSON.parse(adminInfo);
                planId = adminData.plan;
                adminActual.plan = planId;
            }
        }

        if (!planId) {
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            planId = userData.plan;
            adminActual.plan = planId;
        }

        if (!planId || planId === 'sin-plan' || planId === 'gratis' || planId === 'null' || planId === 'undefined') {
            permisosPlan = { incidencias: false, monitoreo: false };
            return;
        }

        const plan = await planManager.obtenerPorId(planId);

        if (!plan) {
            permisosPlan = { incidencias: false, monitoreo: false };
            return;
        }

        const mapasActivos = plan.mapasActivos || {};

        permisosPlan = {
            incidencias: mapasActivos.incidencias === true,
            monitoreo: mapasActivos.alertas === true
        };

    } catch (error) {
        permisosPlan = { incidencias: false, monitoreo: false };
    }
}

// ========== CARGAR USUARIO DESDE LOCALSTORAGE SOLAMENTE ==========
function cargarUsuarioDesdeStorage() {
    try {
        // Intentar obtener de userData (formato estándar como en categorías)
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');

        if (userData && (userData.organizacion || userData.organizacionCamelCase)) {
            adminActual = {
                id: userData.id || userData.uid || 'admin',
                uid: userData.uid || userData.id || 'admin',
                nombreCompleto: userData.nombreCompleto || 'Administrador',
                organizacion: userData.organizacion || 'Sin organización',
                organizacionCamelCase: userData.organizacionCamelCase || '',
                rol: userData.rol || 'administrador',
                correoElectronico: userData.correoElectronico || '',
                plan: userData.plan || null
            };

            // También guardar como adminInfo para compatibilidad con otros módulos
            localStorage.setItem('adminInfo', JSON.stringify({
                id: adminActual.id,
                uid: adminActual.uid,
                nombreCompleto: adminActual.nombreCompleto,
                organizacion: adminActual.organizacion,
                organizacionCamelCase: adminActual.organizacionCamelCase,
                rol: adminActual.rol,
                correoElectronico: adminActual.correoElectronico,
                plan: adminActual.plan,
                timestamp: new Date().toISOString()
            }));

            return true;
        }

        // Fallback a adminInfo si existe (para compatibilidad)
        const adminInfo = localStorage.getItem('adminInfo');
        if (adminInfo) {
            const adminData = JSON.parse(adminInfo);
            adminActual = {
                id: adminData.id || adminData.uid,
                uid: adminData.uid || adminData.id,
                nombreCompleto: adminData.nombreCompleto || 'Administrador',
                organizacion: adminData.organizacion || 'Sin organización',
                organizacionCamelCase: adminData.organizacionCamelCase,
                rol: adminData.rol || 'administrador',
                correoElectronico: adminData.correoElectronico || '',
                plan: adminData.plan || null
            };

            return true;
        }

        return false;
    } catch (error) {
        return false;
    }
}

// ========== CARGAR ÁREAS ==========
async function loadAreas() {
    try {
        if (!adminActual?.organizacionCamelCase) {
            return;
        }

        const areas = await areaManager.getAreasByOrganizacion(adminActual.organizacionCamelCase);
        areasCache.clear();
        areas.forEach(area => {
            areasCache.set(area.id, {
                nombre: area.nombreArea,
                cargos: area.cargos || {}
            });
        });
    } catch (error) {
        // Error handling without console
    }
}

// ========== CONFIGURAR BÚSQUEDA ==========
function configurarBusqueda() {
    const inputBuscar = document.getElementById('buscarPermiso');
    const btnBuscar = document.getElementById('btnBuscarPermiso');
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

    // Búsqueda en tiempo real con debounce
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

// ========== FUNCIÓN DE FILTRADO ==========
function filtrarYRenderizar() {
    if (!todosLosPermisos.length) {
        permisosFiltrados = [];
    } else if (!terminoBusqueda || terminoBusqueda.length < 2) {
        // Si no hay término de búsqueda, mostrar todos
        permisosFiltrados = [...todosLosPermisos];
    } else {
        // Filtrar en memoria
        const terminoLower = terminoBusqueda.toLowerCase();
        permisosFiltrados = todosLosPermisos.filter(permiso => {
            const area = areasCache.get(permiso.areaId);
            const areaNombre = area?.nombre?.toLowerCase() || '';
            const cargoNombre = permiso.cargoNombre?.toLowerCase() || '';

            return areaNombre.includes(terminoLower) ||
                cargoNombre.includes(terminoLower);
        });
    }

    renderizarConPaginacion();
}

// ========== FUNCIONES DE PAGINACIÓN ==========
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
                <button class="page-link" onclick="window.irPaginaPermiso(${i})">${i}</button>
            </li>
        `;
    }

    pagination.innerHTML = html;
}

// Hacer la función global para que funcionen los botones
window.irPaginaPermiso = function (pagina) {
    paginaActual = pagina;
    renderizarConPaginacion();

    // Scroll suave hacia arriba
    document.querySelector('.card-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ========== RENDERIZAR CON PAGINACIÓN ==========
function renderizarConPaginacion() {
    const tbody = document.getElementById('permisosTableBody');
    if (!tbody) return;

    const totalItems = permisosFiltrados.length;
    const totalPaginas = Math.ceil(totalItems / ITEMS_POR_PAGINA);

    // Ajustar página actual si está fuera de rango
    if (paginaActual > totalPaginas && totalPaginas > 0) {
        paginaActual = totalPaginas;
    }

    const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA;
    const fin = Math.min(inicio + ITEMS_POR_PAGINA, totalItems);

    // Los permisos ya están ordenados en permisosFiltrados (más recientes primero)
    const permisosPagina = permisosFiltrados.slice(inicio, fin);

    // Actualizar información de paginación
    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        if (totalItems === 0) {
            paginationInfo.textContent = 'No se encontraron permisos';
        } else {
            paginationInfo.textContent = `Mostrando ${inicio + 1}-${fin} de ${totalItems} permisos`;
        }
    }

    // Mostrar/ocultar contenedor de paginación
    const paginacionContainer = document.querySelector('.pagination-container');
    if (paginacionContainer) {
        paginacionContainer.style.display = totalItems > ITEMS_POR_PAGINA ? 'flex' : 'none';
    }

    if (totalItems === 0) {
        if (!todosLosPermisos.length) {
            showEmptyState();
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="empty-state" style="text-align:center; padding:60px 20px;">
                        <div style="text-align:center;">
                            <i class="fas fa-search" style="font-size: 48px; color: rgba(255,255,255,0.3); margin-bottom: 16px;"></i>
                            <h5 style="color:white;">No se encontraron permisos</h5>
                            <p style="color: var(--color-text-dim); margin-top: 10px;">
                                ${terminoBusqueda ? `No hay resultados para "${terminoBusqueda}"` : ''}
                            </p>
                        </div>
                    </td>
                </tr>
            `;
        }
        renderizarPaginacion(0);
        return;
    }

    renderPermisosTable(permisosPagina);
    renderizarPaginacion(totalPaginas);
}

// ========== CARGAR PERMISOS ==========
async function loadPermisos() {
    try {
        showLoadingState();

        if (!adminActual?.organizacionCamelCase) {
            throw new Error('No hay organización definida');
        }

        // Obtener permisos usando el manager (DESDE FIREBASE)
        todosLosPermisos = await permisoManager.obtenerPorOrganizacion(
            adminActual.organizacionCamelCase
        );

        // Enriquecer permisos con nombres de área y cargo
        todosLosPermisos = todosLosPermisos.map(permiso => {
            const area = areasCache.get(permiso.areaId);
            let cargoNombre = '';

            if (area && area.cargos && permiso.cargoId) {
                cargoNombre = area.cargos[permiso.cargoId]?.nombre || '';
            }

            return {
                ...permiso,
                areaNombre: area?.nombre || 'Área no encontrada',
                cargoNombre: cargoNombre
            };
        });

        // ORDENAR POR FECHA DE CREACIÓN DESCENDENTE (MÁS RECIENTES PRIMERO)
        todosLosPermisos.sort((a, b) => {
            const fechaA = a.fechaCreacion ? new Date(a.fechaCreacion).getTime() : 0;
            const fechaB = b.fechaCreacion ? new Date(b.fechaCreacion).getTime() : 0;
            return fechaB - fechaA;
        });

        // Inicializar filtradas
        permisosFiltrados = [...todosLosPermisos];

        renderizarConPaginacion();

    } catch (error) {
        if (error.message.includes('organización')) {
            showEmptyState();
        } else {
            showFirebaseError(error);
        }
    }
}

// ========== VERIFICAR SI UN MÓDULO DEBE MOSTRARSE SEGÚN EL PLAN ==========
function debeMostrarModulo(modulo) {
    // Módulos fijos siempre se muestran
    if (modulosFijos.includes(modulo)) {
        return true;
    }

    // Módulos dinámicos dependen del plan
    if (modulosDinamicos.includes(modulo)) {
        if (modulo === 'incidencias') {
            return permisosPlan?.incidencias === true;
        }
        if (modulo === 'monitoreo') {
            return permisosPlan?.monitoreo === true;
        }
    }

    return true;
}

// ========== GENERAR BADGES DE PERMISOS (con lógica de plan) ==========
function generarBadgesPermisos(permisos) {
    let badges = '';

    ordenModulos.forEach(modulo => {
        // Verificar si el módulo debe mostrarse según el plan
        if (!debeMostrarModulo(modulo)) {
            return; // Saltar este módulo
        }

        const activo = permisos?.[modulo] || false;
        const nombreMostrar = nombresModulos[modulo] || modulo;

        badges += `
            <span class="permiso-badge ${activo ? 'activo' : 'inactivo'}" title="${activo ? 'Tiene acceso' : 'Sin acceso'}">
                ${nombreMostrar}
            </span>
        `;
    });

    // Si no hay badges generados, mostrar un badge de "Sin permisos"
    if (!badges) {
        badges = `<span class="permiso-badge inactivo">Sin módulos</span>`;
    }

    return badges;
}

// ========== RENDERIZAR TABLA DE PERMISOS ==========
function renderPermisosTable(permisos) {
    const tbody = document.getElementById('permisosTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    permisos.forEach(permiso => {
        const row = document.createElement('tr');

        // Construir badges de permisos (ya con lógica de plan)
        const permisosHTML = generarBadgesPermisos(permiso.permisos);

        // Usar data-label para responsive
        row.innerHTML = `
            <td data-label="Área">
                <div style="display: flex; align-items: center;">
                    <strong style="color:white;" title="${escapeHTML(permiso.areaNombre || '')}">${escapeHTML(permiso.areaNombre)}</strong>
                </div>
            </td>
            <td data-label="Cargo">
                <div style="display: flex; align-items: center;">
                    <span>${escapeHTML(permiso.cargoNombre || 'Cargo no encontrado')}</span>
                </div>
            </td>
            <td data-label="Permisos">
                <div class="permisos-container">
                    ${permisosHTML}
                </div>
            </td>
            <td data-label="Acciones">
                <div class="btn-group" style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button type="button" class="btn" data-action="view" data-permiso-id="${permiso.id}" data-permiso-area="${permiso.areaNombre}" data-permiso-cargo="${permiso.cargoNombre}" title="Ver detalles">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-warning" data-action="edit" data-permiso-id="${permiso.id}" data-permiso-area="${permiso.areaNombre}" data-permiso-cargo="${permiso.cargoNombre}" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(row);
    });
}

// ========== CONFIGURAR EVENTOS ==========
function setupEvents() {
    const addBtn = document.getElementById('addBtn');
    if (addBtn) {
        addBtn.addEventListener('click', (e) => {
            // No prevenir el default para que el enlace funcione
        });
    }

    const tableBody = document.getElementById('permisosTableBody');
    if (tableBody) {
        tableBody.addEventListener('click', async (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            const permisoId = button.getAttribute('data-permiso-id');
            const permisoArea = button.getAttribute('data-permiso-area');
            const permisoCargo = button.getAttribute('data-permiso-cargo');
            const action = button.getAttribute('data-action');

            if (action === 'edit' || button.classList.contains('btn-warning')) {
                await editPermiso(permisoId, permisoArea, permisoCargo);
            }
            else if (action === 'view' || (button.classList.contains('btn') && !button.classList.contains('btn-warning'))) {
                verPermiso(permisoId, permisoArea, permisoCargo);
            }
        });
    }
}

// ========== VER PERMISO ==========
function verPermiso(permisoId, areaNombre, cargoNombre) {
    window.location.href = `../verPermisos/verPermisos.html?id=${permisoId}`;
}

// ========== EDITAR PERMISO ==========
async function editPermiso(permisoId, areaNombre, cargoNombre) {
    const permiso = todosLosPermisos.find(p => p.id === permisoId);
    if (!permiso) return;

    const selectedPermiso = {
        id: permisoId,
        areaId: permiso.areaId,
        cargoId: permiso.cargoId,
        areaNombre: areaNombre,
        cargoNombre: cargoNombre,
        permisos: permiso.permisos,
        organizacion: adminActual.organizacion,
        organizacionCamelCase: adminActual.organizacionCamelCase,
        fechaSeleccion: new Date().toISOString(),
        admin: adminActual.nombreCompleto
    };

    localStorage.setItem('selectedPermiso', JSON.stringify(selectedPermiso));
    window.location.href = `../editarPermisos/editarPermisos.html?id=${permisoId}`;
}

// ========== ESTADOS DE CARGA Y ERROR ==========
function showLoadingState() {
    const tbody = document.getElementById('permisosTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="4" style="text-align:center; padding:60px 20px;">
                <div style="text-align:center;">
                    <i class="fas fa-spinner fa-spin" style="font-size:48px; color:var(--color-accent-primary); margin-bottom:16px;"></i>
                    <h5 style="color:white;">Cargando permisos...</h5>
                    <p style="color:var(--color-text-dim);">Obteniendo datos desde Firebase</p>
                </div>
            </td>
        </tr>
    `;

    const paginacionContainer = document.querySelector('.pagination-container');
    if (paginacionContainer) {
        paginacionContainer.style.display = 'none';
    }
}

function showEmptyState() {
    const tbody = document.getElementById('permisosTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="4" style="text-align:center; padding:60px 20px;">
                <div style="text-align:center;">
                    <i class="fas fa-shield-alt" style="font-size:48px; color:rgba(0,207,255,0.3); margin-bottom:16px;"></i>
                    <h5 style="color:white;">No hay permisos configurados en ${adminActual?.organizacion || 'tu organización'}</h5>
                    <p style="color:var(--color-text-dim); max-width:400px; margin:10px auto;">
                        Los permisos te permiten controlar a qué módulos puede acceder cada cargo en las diferentes áreas.
                    </p>
                    <a href="../crearPermisos/crearPermisos.html" class="btn-nuevo-permiso-header" style="display:inline-flex; margin-top:16px;">
                        <i class="fas fa-plus-circle"></i> Crear Primer Permiso
                    </a>
                </div>
            </td>
        </tr>
    `;

    const paginacionContainer = document.querySelector('.pagination-container');
    if (paginacionContainer) {
        paginacionContainer.style.display = 'none';
    }
}

function showNoAdminMessage() {
    const tbody = document.getElementById('permisosTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="4" style="text-align:center; padding:60px 20px;">
                <div style="text-align:center;">
                    <i class="fas fa-user-slash" style="font-size:48px; color:#ef4444; margin-bottom:16px;"></i>
                    <h5 style="color:white;">No se detectó sesión activa de administrador</h5>
                    <p style="color:var(--color-text-dim);">Para gestionar permisos, debes iniciar sesión como administrador.</p>
                    <div style="display:flex; gap:10px; justify-content:center; margin-top:16px;">
                        <button onclick="window.location.reload()" class="btn" style="padding:8px 16px !important; min-width:auto !important;">
                            <i class="fas fa-sync-alt"></i> Recargar
                        </button>
                        <button onclick="window.location.href='/usuarios/visitantes/inicioSesion/inicioSesion.html'" class="btn btn-warning" style="padding:8px 16px !important; min-width:auto !important;">
                            <i class="fas fa-sign-in-alt"></i> Iniciar sesión
                        </button>
                    </div>
                </div>
            </td>
        </tr>
    `;

    const paginacionContainer = document.querySelector('.pagination-container');
    if (paginacionContainer) {
        paginacionContainer.style.display = 'none';
    }
}

function showFirebaseError(error) {
    const tbody = document.getElementById('permisosTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="4" style="text-align:center; padding:60px 20px;">
                <div style="text-align:center;">
                    <i class="fas fa-exclamation-triangle" style="font-size:48px; color:#f97316; margin-bottom:16px;"></i>
                    <h5 style="color:white;">Error al cargar permisos</h5>
                    <p style="color:var(--color-text-dim); max-width:400px; margin:0 auto;">${escapeHTML(error.message || 'Error de conexión con Firebase')}</p>
                    <button onclick="window.location.reload()" class="btn" style="margin-top:16px; padding:8px 16px !important; min-width:auto !important;">
                        <i class="fas fa-sync-alt"></i> Recargar
                    </button>
                </div>
            </td>
        </tr>
    `;

    const paginacionContainer = document.querySelector('.pagination-container');
    if (paginacionContainer) {
        paginacionContainer.style.display = 'none';
    }
}

function showError(message) {
    const tbody = document.getElementById('permisosTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="4" style="text-align:center; padding:60px 20px;">
                <div style="text-align:center;">
                    <i class="fas fa-exclamation-circle" style="font-size:48px; color:#ef4444; margin-bottom:16px;"></i>
                    <h5 style="color:white;">${escapeHTML(message)}</h5>
                    <button onclick="window.location.reload()" class="btn" style="margin-top:16px; padding:8px 16px !important; min-width:auto !important;">
                        <i class="fas fa-sync-alt"></i> Reintentar
                    </button>
                </div>
            </td>
        </tr>
    `;

    const paginacionContainer = document.querySelector('.pagination-container');
    if (paginacionContainer) {
        paginacionContainer.style.display = 'none';
    }
}

// ========== UTILIDADES ==========
function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}