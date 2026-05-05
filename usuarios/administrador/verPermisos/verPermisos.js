// verPermiso.js - VISUALIZACIÓN DE PERMISOS (SOLO LECTURA)
// ACTUALIZADO: Incluye lógica de plan (Incidencias y Mapa de Alertas solo si el plan los incluye)

// =============================================
// VARIABLES GLOBALES
// =============================================
let permisoManager = null;
let areaManager = null;
let planManager = null;
let usuarioActual = null;
let permisoActual = null;
let areasMap = new Map();
let permisosPlan = null; // Para saber qué módulos dinámicos mostrar

// NOMBRES DE LOS MÓDULOS
const nombresModulos = {
    areas: 'Áreas',
    categorias: 'Categorías',
    sucursales: 'Sucursales',
    regiones: 'Regiones',
    incidencias: 'Incidencias',
    usuarios: 'Usuarios',
    riesgoNivel: 'RiesgoNivel',
    estadisticas: 'Estadísticas',
    tareas: 'Tareas',
    permisos: 'Permisos',
    loginMonitoreo: 'LoginMonitoreo',
    monitoreo: 'Mapa Alertas'
};

// ICONOS DE LOS MÓDULOS
const iconosModulos = {
    areas: 'fa-sitemap',
    categorias: 'fa-tags',
    sucursales: 'fa-store',
    regiones: 'fa-map-marked-alt',
    incidencias: 'fa-exclamation-triangle',
    usuarios: 'fa-users',
    riesgoNivel: '',
    estadisticas: 'fa-chart-line',
    tareas: 'fa-tasks',
    permisos: 'fa-map-marker-alt',
    loginMonitoreo: 'fa-map-marker-alt',
    monitoreo: 'fa-map-marker-alt'
};

// Módulos fijos (siempre visibles)
const modulosFijos = ['areas', 'categorias', 'sucursales', 'regiones', 'usuarios', 'estadisticas', 'tareas', 'permisos', 'loginMonitoreo', 'riesgoNivel'];

// Módulos dinámicos (dependen del plan)
const modulosDinamicos = ['incidencias', 'monitoreo'];

// ORDEN DE LOS MÓDULOS PARA MOSTRAR
const ordenModulos = ['areas', 'categorias', 'sucursales', 'regiones', 'riesgoNivel', 'incidencias', 'usuarios', 'permisos', 'estadisticas', 'tareas', 'monitoreo', 'loginMonitoreo'];

// =============================================
// INICIALIZACIÓN
// =============================================
async function inicializarVerPermiso() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const permisoId = urlParams.get('id');

        if (!permisoId) {
            throw new Error('No se especificó el ID del permiso');
        }

        cargarUsuario();

        if (!usuarioActual) {
            throw new Error('No se pudo cargar información del usuario');
        }

        await inicializarManagers();

        // Cargar permisos del plan (para saber qué módulos dinámicos mostrar)
        await cargarPermisosDelPlan();

        await cargarAreas();
        await cargarPermiso(permisoId);

        mostrarInfoPermiso();
        configurarEventos();

    } catch (error) {
        mostrarError('Error al cargar el permiso: ' + error.message);

        const container = document.querySelector('.custom-container');
        if (container) {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin: 20px; padding: 20px;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h4>Error al cargar el permiso</h4>
                    <p>${error.message}</p>
                    <button class="btn-volver" onclick="window.location.href='../permisos/permisos.html'" style="margin-top: 15px;">
                        <i class="fas fa-arrow-left"></i> Volver a la lista
                    </button>
                </div>
            `;
        }
    }
}

async function inicializarManagers() {
    try {
        const { PermisoManager } = await import('/clases/permiso.js');
        const { AreaManager } = await import('/clases/area.js');
        const { PlanPersonalizadoManager } = await import('/clases/plan.js');

        permisoManager = new PermisoManager();
        areaManager = new AreaManager();
        planManager = new PlanPersonalizadoManager();

        if (usuarioActual?.organizacionCamelCase) {
            permisoManager.organizacionCamelCase = usuarioActual.organizacionCamelCase;
        }
    } catch (error) {
        throw error;
    }
}

// ========== CARGAR PERMISOS DEL PLAN (PARA INCIDENCIAS Y MAPA DE ALERTAS) ==========
async function cargarPermisosDelPlan() {
    try {
        let planId = usuarioActual?.plan;

        if (!planId) {
            const adminInfo = localStorage.getItem('adminInfo');
            if (adminInfo) {
                const adminData = JSON.parse(adminInfo);
                planId = adminData.plan;
                usuarioActual.plan = planId;
            }
        }

        if (!planId) {
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            planId = userData.plan;
            usuarioActual.plan = planId;
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

function cargarUsuario() {
    try {
        const adminInfo = localStorage.getItem('adminInfo');
        if (adminInfo) {
            const adminData = JSON.parse(adminInfo);
            usuarioActual = {
                id: adminData.id || adminData.uid,
                uid: adminData.uid || adminData.id,
                nombreCompleto: adminData.nombreCompleto || 'Administrador',
                organizacion: adminData.organizacion || 'Sin organización',
                organizacionCamelCase: adminData.organizacionCamelCase,
                plan: adminData.plan || null,
                correo: adminData.correoElectronico || ''
            };
            return;
        }

        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (userData && Object.keys(userData).length > 0) {
            usuarioActual = {
                id: userData.id || userData.uid,
                uid: userData.uid || userData.id,
                nombreCompleto: userData.nombreCompleto || 'Administrador',
                organizacion: userData.organizacion || 'Mi Organización',
                organizacionCamelCase: userData.organizacionCamelCase,
                plan: userData.plan || null,
                correo: userData.correoElectronico || ''
            };
            return;
        }

        if (window.userManager && window.userManager.currentUser) {
            const user = window.userManager.currentUser;
            usuarioActual = {
                id: user.id || user.uid,
                uid: user.uid || user.id,
                nombreCompleto: user.nombreCompleto || 'Administrador',
                organizacion: user.organizacion || 'Mi Organización',
                organizacionCamelCase: user.organizacionCamelCase,
                plan: user.plan || null,
                correo: user.correoElectronico || ''
            };
            return;
        }

        throw new Error('No hay sesión activa');

    } catch (error) {
        throw error;
    }
}

async function cargarAreas() {
    try {
        if (!usuarioActual?.organizacionCamelCase) {
            return;
        }

        const areas = await areaManager.getAreasByOrganizacion(usuarioActual.organizacionCamelCase);
        areasMap.clear();
        areas.forEach(area => {
            areasMap.set(area.id, {
                nombre: area.nombreArea,
                cargos: area.cargos || {}
            });
        });
    } catch (error) {
        // Error handling without console
    }
}

async function cargarPermiso(permisoId) {
    try {
        permisoActual = await permisoManager.obtenerPorId(
            permisoId,
            usuarioActual.organizacionCamelCase
        );

        if (!permisoActual) {
            throw new Error('Permiso no encontrado');
        }

    } catch (error) {
        throw error;
    }
}

// =============================================
// MOSTRAR INFORMACIÓN
// =============================================
function mostrarInfoPermiso() {
    if (!permisoActual) return;

    const setInputValue = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value || '-';
        }
    };

    setInputValue('infoOrganizacion', usuarioActual.organizacion);

    const area = areasMap.get(permisoActual.areaId);
    setInputValue('infoArea', area?.nombre || permisoActual.areaId || 'No especificada');

    let cargoNombre = permisoActual.cargoId;
    if (area && area.cargos && permisoActual.cargoId) {
        cargoNombre = area.cargos[permisoActual.cargoId]?.nombre || permisoActual.cargoId;
    }
    setInputValue('infoCargo', cargoNombre || 'No especificado');

    setInputValue('infoFechaCreacion', formatearFecha(permisoActual.fechaCreacion));
    setInputValue('infoFechaActualizacion', formatearFecha(permisoActual.fechaActualizacion));

    mostrarModulos();
}

// ========== MOSTRAR MÓDULOS (CON FILTRO DE PLAN) ==========
function mostrarModulos() {
    const container = document.getElementById('modulosContainer');
    if (!container) {
        return;
    }
    if (!permisoActual) return;

    let html = '';
    let modulosActivos = 0;
    let modulosInactivos = 0;

    ordenModulos.forEach(modulo => {
        // VERIFICAR SI EL MÓDULO DEBE MOSTRARSE SEGÚN EL PLAN
        if (!debeMostrarModulo(modulo)) {
            return; // Saltar este módulo
        }

        const activo = permisoActual.permisos?.[modulo] || false;
        const nombreMostrar = nombresModulos[modulo] || modulo;
        const icono = iconosModulos[modulo] || 'fa-circle';
        const estadoClase = activo ? 'activo' : 'inactivo';
        const estadoTexto = activo ? 'Con acceso' : 'Sin acceso';
        const colorIcono = activo ? '#10b981' : '#ef4444';

        if (activo) modulosActivos++;
        else modulosInactivos++;

        html += `
            <div class="modulo-item ${estadoClase}">
                <div class="modulo-icon" style="color: ${colorIcono};">
                    <i class="fas ${icono}"></i>
                </div>
                <div class="modulo-info">
                    <span class="modulo-nombre">${escapeHTML(nombreMostrar)}</span>
                    <span class="modulo-estado" style="color: ${colorIcono};">
                        <i class="fas ${activo ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                        ${estadoTexto}
                    </span>
                </div>
            </div>
        `;
    });

    // Resumen de módulos
    const resumenHtml = `
        <div style="grid-column: 1 / -1; margin-top: 15px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; text-align: center;">
            <span style="color: #10b981;">
                <i class="fas fa-check-circle"></i> ${modulosActivos} módulo${modulosActivos !== 1 ? 's' : ''} con acceso
            </span>
            <span style="color: #ef4444; margin-left: 20px;">
                <i class="fas fa-times-circle"></i> ${modulosInactivos} módulo${modulosInactivos !== 1 ? 's' : ''} sin acceso
            </span>
        </div>
    `;

    container.innerHTML = html + resumenHtml;
}

function formatearFecha(fecha) {
    if (!fecha) return 'No disponible';

    try {
        if (fecha instanceof Date) {
            return fecha.toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        if (typeof fecha === 'string') {
            const date = new Date(fecha);
            if (isNaN(date.getTime())) return 'Fecha inválida';
            return date.toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        if (fecha && typeof fecha.toDate === 'function') {
            return fecha.toDate().toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        return 'Fecha no disponible';
    } catch (error) {
        return 'Fecha inválida';
    }
}

// =============================================
// CONFIGURACIÓN DE EVENTOS
// =============================================
function configurarEventos() {
    try {
        const btnVolverLista = document.getElementById('btnVolverLista');
        if (btnVolverLista) {
            btnVolverLista.addEventListener('click', () => volverALista());
        }
    } catch (error) {

    }
}

// =============================================
// NAVEGACIÓN
// =============================================
function volverALista() {
    window.location.href = '../permisos/permisos.html';
}

function editarPermiso() {
    if (!permisoActual) return;

    const selectedPermiso = {
        id: permisoActual.id,
        areaId: permisoActual.areaId,
        cargoId: permisoActual.cargoId,
        permisos: permisoActual.permisos,
        organizacion: usuarioActual.organizacion,
        organizacionCamelCase: usuarioActual.organizacionCamelCase,
        fechaSeleccion: new Date().toISOString(),
        admin: usuarioActual.nombreCompleto
    };

    localStorage.setItem('selectedPermiso', JSON.stringify(selectedPermiso));
    window.location.href = `../editarPermisos/editarPermisos.html?id=${permisoActual.id}`;
}

// =============================================
// UTILIDADES
// =============================================
function escapeHTML(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function mostrarError(mensaje) {
    Swal.fire({
        icon: 'error',
        title: 'Error',
        text: mensaje,
        confirmButtonText: 'Entendido'
    });
}

// =============================================
// INICIALIZACIÓN
// =============================================
document.addEventListener('DOMContentLoaded', function () {
    inicializarVerPermiso();
});