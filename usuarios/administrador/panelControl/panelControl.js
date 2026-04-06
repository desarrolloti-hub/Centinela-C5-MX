// ========== panelControl.js - VERSIÓN MODIFICADA ==========
// Se eliminó CARGOS, se agregó INCIDENCIAS DIARIAS
// SIN OVERLAY DE CARGA - EL PANEL SE MUESTRA DIRECTAMENTE

import { UserManager } from '/clases/user.js';
import { IncidenciaManager } from '/clases/incidencia.js';
import { RegionManager } from '/clases/region.js';
import { SucursalManager } from '/clases/sucursal.js';
import { AreaManager } from '/clases/area.js';

// ========== VARIABLES GLOBALES ==========
let usuarioActual = null;
let permisosPlan = { incidencias: false, monitoreo: false, permisosIncidencias: [] };

// Managers principales
const userManager = new UserManager();
const incidenciaManager = new IncidenciaManager();
const regionManager = new RegionManager();
const sucursalManager = new SucursalManager();
const areaManager = new AreaManager();

// Estadísticas del panel
let estadisticas = {
    incidencias: 0,
    incidenciasDiarias: 0,
    regiones: 0,
    sucursales: 0,
    areas: 0,
    usuarios: 0,
    incidenciasPendientes: 0,
    usuariosActivos: 0,
    sucursalesActivas: 0,
    eficiencia: 0
};

// ========== CONFIGURACIÓN DE TARJETAS DE ACCESO RÁPIDO ==========
const MODULOS_CONFIG = {
    'nuevaIncidencia': {
        selector: '#card-nueva-incidencia',
        url: '/usuarios/administrador/crearIncidencias/crearIncidencias.html',
        titulo: 'Nueva Incidencia',
        permisoRequerido: 'incidencias',
        subPermisoRequerido: 'crearIncidencias',
        grupo: 'acceso-rapido',
        brillo: true
    },
    'incidenciasLista': {
        selector: '#card-incidencias-lista',
        url: '/usuarios/administrador/incidencias/incidencias.html',
        titulo: 'Incidencias',
        permisoRequerido: 'incidencias',
        subPermisoRequerido: 'listaIncidencias',
        grupo: 'acceso-rapido',
        brillo: false
    },
    'mapaAlertas': {
        selector: '#card-mapa-alertas',
        url: '/usuarios/administrador/mapaAlertas/mapaAlertas.html',
        titulo: 'Mapa de Alertas',
        permisoRequerido: 'monitoreo',
        grupo: 'acceso-rapido',
        brillo: true
    },
    'listaExtravios': {
        selector: '#card-lista-extravios',
        url: '/usuarios/administrador/incidenciasRecuperacion/incidenciasRecuperacion.html',
        titulo: 'Lista de Extravíos',
        permisoRequerido: 'incidencias',
        subPermisoRequerido: 'listaIncidencias',
        grupo: 'acceso-rapido',
        brillo: false
    },
    // ÁREAS
    'areasLista': {
        selector: '#card-areas-lista',
        url: '/usuarios/administrador/areas/areas.html',
        titulo: 'Lista Áreas',
        permisoRequerido: 'areas',
        grupo: 'modulos-acceso',
        brillo: false
    },
    'areasNueva': {
        selector: '#card-areas-nueva',
        url: '/usuarios/administrador/crearAreas/crearAreas.html',
        titulo: 'Nueva Área',
        permisoRequerido: 'areas',
        grupo: 'modulos-acceso',
        brillo: false
    },
    // SUCURSALES
    'sucursalesLista': {
        selector: '#card-sucursales-lista',
        url: '/usuarios/administrador/sucursales/sucursales.html',
        titulo: 'Lista Sucursales',
        permisoRequerido: 'sucursales',
        grupo: 'modulos-acceso',
        brillo: false
    },
    'sucursalesNueva': {
        selector: '#card-sucursales-nueva',
        url: '/usuarios/administrador/crearSucursales/crearSucursales.html',
        titulo: 'Nueva Sucursal',
        permisoRequerido: 'sucursales',
        grupo: 'modulos-acceso',
        brillo: false
    },
    // REGIONES
    'regionesLista': {
        selector: '#card-regiones-lista',
        url: '/usuarios/administrador/regiones/regiones.html',
        titulo: 'Lista Regiones',
        permisoRequerido: 'regiones',
        grupo: 'modulos-acceso',
        brillo: false
    },
    'regionesNueva': {
        selector: '#card-regiones-nueva',
        url: '/usuarios/administrador/crearRegiones/crearRegiones.html',
        titulo: 'Nueva Región',
        permisoRequerido: 'regiones',
        grupo: 'modulos-acceso',
        brillo: false
    },
    'tablero-de-control': {
        selector: '#tablero-de-control',
        url: '/usuarios/administrador/loginMonitoreo/loginMonitoreo.html',
        titulo: 'Tablero de Control',
        permisoRequerido: 'monitoreo',
        grupo: 'acceso-rapido',
        brillo: false
    },
};

// ========== CONFIGURACIÓN DE NAVEGACIÓN PARA TARJETAS KPI ==========
const KPI_NAVEGACION = {
    'kpi-incidencias': {
        url: '/usuarios/administrador/incidencias/incidencias.html',
        titulo: 'Incidencias',
        permisoRequerido: 'incidencias'
    },
    'kpi-incidencias-diarias': {
        url: '/usuarios/administrador/incidencias/incidencias.html',
        titulo: 'Incidencias Diarias',
        permisoRequerido: 'incidencias'
    },
    'kpi-regiones': {
        url: '/usuarios/administrador/regiones/regiones.html',
        titulo: 'Regiones',
        permisoRequerido: 'regiones'
    },
    'kpi-sucursales': {
        url: '/usuarios/administrador/sucursales/sucursales.html',
        titulo: 'Sucursales',
        permisoRequerido: 'sucursales'
    },
    'kpi-areas': {
        url: '/usuarios/administrador/areas/areas.html',
        titulo: 'Áreas',
        permisoRequerido: 'areas'
    },
    'kpi-usuarios': {
        url: '/usuarios/administrador/usuarios/usuarios.html',
        titulo: 'Colaboradores',
        permisoRequerido: 'usuarios'
    }
};

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', async function () {
    try {
        // Esperar autenticación (máximo 10 segundos)
        await esperarAutenticacion(10000);
        usuarioActual = userManager.currentUser;

        if (!usuarioActual) {
            mostrarErrorSesion();
            return;
        }

        // Cargar permisos del plan
        await cargarPermisosDelPlan();

        // Aplicar filtros según permisos
        filtrarTarjetasPorPermisos();
        configurarEventosTarjetas();
        configurarEventosKPI();

        // Cargar datos (actualizarán la UI cuando lleguen)
        cargarTodasLasEstadisticas().then(() => {
            actualizarUI();
        });

        // Refrescar cada 5 minutos
        setInterval(async () => {
            await cargarTodasLasEstadisticas();
            actualizarUI();
        }, 5 * 60 * 1000);

    } catch (error) {
        mostrarError(error.message);
    }
});

// ========== CARGAR PERMISOS DEL PLAN ==========
async function cargarPermisosDelPlan() {
    try {
        if (!usuarioActual || !usuarioActual.id) {
            permisosPlan = { incidencias: false, monitoreo: false, permisosIncidencias: [] };
            return;
        }

        const planId = usuarioActual.plan;

        if (!planId || planId === 'sin-plan' || planId === 'gratis') {
            permisosPlan = { incidencias: false, monitoreo: false, permisosIncidencias: [] };
            return;
        }

        const { PlanPersonalizadoManager } = await import('/clases/plan.js');
        const planManager = new PlanPersonalizadoManager();
        const plan = await planManager.obtenerPorId(planId);

        if (!plan) {
            permisosPlan = { incidencias: false, monitoreo: false, permisosIncidencias: [] };
            return;
        }

        const mapasActivos = plan.mapasActivos;
        const tieneIncidencias = mapasActivos.incidencias === true;
        const tieneMonitoreo = mapasActivos.alertas === true;

        const permisosIncidencias = [];

        if (tieneIncidencias) {
            const moduloIncidencias = plan.obtenerMapasCompletos?.().find(m => m.id === 'incidencias');
            if (moduloIncidencias && moduloIncidencias.permisosActivos) {
                moduloIncidencias.permisosActivos.forEach(permiso => {
                    permisosIncidencias.push(permiso.id);
                });
            }
        }

        permisosPlan = {
            incidencias: tieneIncidencias,
            monitoreo: tieneMonitoreo,
            permisosIncidencias: permisosIncidencias
        };

        // Re-aplicar filtros después de cargar permisos
        filtrarTarjetasPorPermisos();
        configurarEventosKPI();

    } catch (error) {
        permisosPlan = { incidencias: false, monitoreo: false, permisosIncidencias: [] };
    }
}

async function esperarAutenticacion(timeout = 10000) {
    const startTime = Date.now();
    while (!userManager.currentUser) {
        if (Date.now() - startTime > timeout) {
            throw new Error('Tiempo de espera agotado esperando autenticación');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

// ========== CARGAR TODAS LAS ESTADÍSTICAS ==========
async function cargarTodasLasEstadisticas() {
    try {
        const organizacion = usuarioActual.organizacionCamelCase;
        if (!organizacion) return;

        await Promise.all([
            cargarIncidencias(organizacion),
            cargarRegiones(organizacion),
            cargarSucursales(organizacion),
            cargarAreas(organizacion),
            cargarUsuarios(organizacion)
        ]);

    } catch (error) { }
}

async function cargarIncidencias(organizacion) {
    try {
        const incidencias = await incidenciaManager.getIncidenciasByOrganizacion(organizacion);
        estadisticas.incidencias = incidencias.length;
        estadisticas.incidenciasPendientes = incidencias.filter(i => i.estado === 'pendiente').length;

        // Contar incidencias del día actual
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const incidenciasHoy = incidencias.filter(inc => {
            const fechaCreacion = inc.fechaCreacion;
            if (!fechaCreacion) return false;

            let fechaComparar;
            if (fechaCreacion.toDate) {
                fechaComparar = fechaCreacion.toDate();
            } else if (fechaCreacion instanceof Date) {
                fechaComparar = fechaCreacion;
            } else {
                fechaComparar = new Date(fechaCreacion);
            }

            fechaComparar.setHours(0, 0, 0, 0);
            return fechaComparar.getTime() === hoy.getTime();
        });

        estadisticas.incidenciasDiarias = incidenciasHoy.length;

        const finalizadas = incidencias.filter(i => i.estado === 'finalizada').length;
        estadisticas.eficiencia = incidencias.length > 0 ? Math.round((finalizadas / incidencias.length) * 100) : 0;
    } catch (error) {
        estadisticas.incidencias = 0;
        estadisticas.incidenciasDiarias = 0;
        estadisticas.incidenciasPendientes = 0;
        estadisticas.eficiencia = 0;
    }
}

async function cargarRegiones(organizacion) {
    try {
        const regiones = await regionManager.getRegionesByOrganizacion(organizacion);
        estadisticas.regiones = regiones.length;
    } catch (error) {
        estadisticas.regiones = 0;
    }
}

async function cargarSucursales(organizacion) {
    try {
        const sucursales = await sucursalManager.getSucursalesByOrganizacion(organizacion);
        estadisticas.sucursales = sucursales.length;
        estadisticas.sucursalesActivas = sucursales.filter(s => s.estado !== 'inactiva').length;
    } catch (error) {
        estadisticas.sucursales = 0;
        estadisticas.sucursalesActivas = 0;
    }
}

async function cargarAreas(organizacion) {
    try {
        const areas = await areaManager.getAreasByOrganizacion(organizacion);
        estadisticas.areas = areas.length;
    } catch (error) {
        estadisticas.areas = 0;
    }
}

async function cargarUsuarios(organizacion) {
    try {
        let totalUsuarios = 0;
        const administradores = await userManager.getAdministradores(true);
        const adminsOrganizacion = administradores.filter(admin => admin.organizacionCamelCase === organizacion);
        const adminsExcluyendoActual = adminsOrganizacion.filter(admin => admin.id !== usuarioActual.id).length;
        totalUsuarios += adminsExcluyendoActual;
        const colaboradores = await userManager.getColaboradoresByOrganizacion(organizacion, true);
        totalUsuarios += colaboradores.length;
        const usuariosActivos = adminsOrganizacion.filter(a => a.estaActivo()).length + colaboradores.filter(c => c.estaActivo()).length;
        estadisticas.usuarios = totalUsuarios;
        estadisticas.usuariosActivos = usuariosActivos;
    } catch (error) {
        estadisticas.usuarios = 0;
        estadisticas.usuariosActivos = 0;
    }
}

// ========== ACTUALIZAR UI ==========
function actualizarUI() {
    const totalIncidencias = document.getElementById('total-incidencias');
    if (totalIncidencias) totalIncidencias.textContent = estadisticas.incidencias;

    const totalIncidenciasDiarias = document.getElementById('total-incidencias-diarias');
    if (totalIncidenciasDiarias) totalIncidenciasDiarias.textContent = estadisticas.incidenciasDiarias;

    const totalRegiones = document.getElementById('total-regiones');
    if (totalRegiones) totalRegiones.textContent = estadisticas.regiones;

    const totalSucursales = document.getElementById('total-sucursales');
    if (totalSucursales) totalSucursales.textContent = estadisticas.sucursales;

    const totalAreas = document.getElementById('total-areas');
    if (totalAreas) totalAreas.textContent = estadisticas.areas;

    const totalUsuarios = document.getElementById('total-usuarios');
    if (totalUsuarios) totalUsuarios.textContent = estadisticas.usuarios;
}

// ========== VERIFICAR PERMISO DE MÓDULO ==========
function tienePermisoModulo(config) {
    const permisoRequerido = config.permisoRequerido;

    if (permisoRequerido === 'incidencias') {
        if (!permisosPlan.incidencias) return false;
        if (config.subPermisoRequerido) {
            return permisosPlan.permisosIncidencias.includes(config.subPermisoRequerido);
        }
        return true;
    }

    if (permisoRequerido === 'monitoreo') {
        return permisosPlan.monitoreo === true;
    }

    return true;
}

// ========== FILTRAR TARJETAS ==========
function filtrarTarjetasPorPermisos() {
    Object.entries(MODULOS_CONFIG).forEach(([key, config]) => {
        const tarjeta = document.querySelector(config.selector);
        if (!tarjeta) return;

        const debeMostrarse = tienePermisoModulo(config);

        if (debeMostrarse) {
            tarjeta.style.display = 'flex';
            tarjeta.dataset.url = config.url;

            if (config.brillo) {
                tarjeta.classList.add('tarjeta-brillo');
            } else {
                tarjeta.classList.remove('tarjeta-brillo');
            }
        } else {
            tarjeta.style.display = 'none';
        }
    });

    filtrarKPIPorPermisos();
}

function filtrarKPIPorPermisos() {
    Object.entries(KPI_NAVEGACION).forEach(([id, config]) => {
        const kpiCard = document.getElementById(id);
        if (!kpiCard) return;

        let debeMostrarse = false;
        const permisoRequerido = config.permisoRequerido;

        if (permisoRequerido === 'incidencias') {
            debeMostrarse = permisosPlan.incidencias === true;
        } else if (permisoRequerido === 'monitoreo') {
            debeMostrarse = permisosPlan.monitoreo === true;
        } else {
            debeMostrarse = true;
        }

        kpiCard.style.display = debeMostrarse ? 'flex' : 'none';
    });
}

// ========== CONFIGURAR EVENTOS ==========
function configurarEventosTarjetas() {
    const tarjetas = document.querySelectorAll('.dashboard-card');
    tarjetas.forEach(tarjeta => {
        tarjeta.removeEventListener('click', manejarClickTarjeta);
        tarjeta.addEventListener('click', manejarClickTarjeta);
    });
}

function manejarClickTarjeta(e) {
    e.preventDefault();
    e.stopPropagation();
    const tarjeta = e.currentTarget;
    const url = tarjeta.dataset.url;
    if (url) {
        window.location.href = url;
    }
}

function configurarEventosKPI() {
    Object.entries(KPI_NAVEGACION).forEach(([id, config]) => {
        const tarjeta = document.getElementById(id);
        if (tarjeta) {
            tarjeta.style.cursor = 'pointer';
            tarjeta.removeEventListener('click', manejarClickKPI);
            tarjeta.addEventListener('click', (e) => manejarClickKPI(e, config));
        }
    });
}

function manejarClickKPI(e, config) {
    e.preventDefault();
    e.stopPropagation();

    let tieneAcceso = false;
    const permisoRequerido = config.permisoRequerido;

    if (permisoRequerido === 'incidencias') {
        tieneAcceso = permisosPlan.incidencias === true;
    } else if (permisoRequerido === 'monitoreo') {
        tieneAcceso = permisosPlan.monitoreo === true;
    } else {
        tieneAcceso = true;
    }

    if (!tieneAcceso) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Acceso Denegado',
                text: `No tienes permisos para acceder a ${config.titulo}. Contacta al administrador.`,
                icon: 'warning',
                confirmButtonColor: '#ff4d00',
                background: '#1a1a1a',
                color: '#fff'
            });
        }
        return;
    }

    window.location.href = config.url;
}

// ========== MOSTRAR ERROR ==========
function mostrarErrorSesion() {
    const container = document.querySelector('.right-layout');
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
                <i class="fas fa-user-slash" style="font-size: 64px; color: #ff4d4d; margin-bottom: 20px;"></i>
                <h2 style="color: white;">SESIÓN NO DETECTADA</h2>
                <p style="color: #a5a5a5; margin: 20px 0;">Inicia sesión para acceder al panel</p>
                <button onclick="window.location.href='/index.html'" 
                    style="background: linear-gradient(145deg, #0f0f0f, #1a1a1a);
                           border: 1px solid #c0c0c0;
                           color: white;
                           padding: 12px 24px;
                           border-radius: 8px;
                           cursor: pointer;
                           font-family: 'Orbitron', sans-serif;">
                    <i class="fas fa-sign-in-alt"></i> INICIAR SESIÓN
                </button>
            </div>
        `;
    }
}

function mostrarError(mensaje) {
    const container = document.querySelector('.right-layout');
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
                <i class="fas fa-exclamation-circle" style="font-size: 64px; color: #ff4d4d; margin-bottom: 20px;"></i>
                <h2 style="color: white;">ERROR</h2>
                <p style="color: #a5a5a5; margin: 20px 0;">${escapeHTML(mensaje)}</p>
                <button onclick="window.location.reload()" 
                    style="background: linear-gradient(145deg, #0f0f0f, #1a1a1a);
                           border: 1px solid #c0c0c0;
                           color: white;
                           padding: 12px 24px;
                           border-radius: 8px;
                           cursor: pointer;
                           font-family: 'Orbitron', sans-serif;">
                    <i class="fas fa-sync-alt"></i> REINTENTAR
                </button>
            </div>
        `;
    }
}

function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.panelDebug = {
    userManager,
    incidenciaManager,
    regionManager,
    sucursalManager,
    areaManager,
    usuarioActual,
    estadisticas,
    permisosPlan,
    MODULOS_CONFIG,
    KPI_NAVEGACION
};