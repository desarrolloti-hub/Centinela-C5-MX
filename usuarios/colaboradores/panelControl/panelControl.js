// ========== panelControl.js - PANEL DE CONTROL CON PERMISOS ==========
// VERSIÓN ACTUALIZADA - Solo KPIs: Incidencias Canalizadas, Áreas, Categorías, Sucursales, Regiones, Colaboradores

import { db } from '/config/firebase-config.js';
import {
    collection,
    getDocs,
    query,
    where,
    orderBy,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// ========== VARIABLES GLOBALES ==========
let permisoManager = null;
let usuarioActual = null;
let permisosUsuario = null;
let unsubscribeFunctions = [];

// Configuración de KPIs según módulos (SOLO LOS SOLICITADOS)
const KPI_CONFIG = {
    // Incidencias canalizadas (para el usuario actual)
    incidenciasCanalizadas: {
        modulo: 'incidencias',
        titulo: 'MIS INCIDENCIAS',
        subtitulo: '',
        icono: 'fa-share-alt',
        color: 'danger'
    },
    // Áreas
    areas: {
        modulo: 'areas',
        titulo: 'ÁREAS',
        subtitulo: '',
        icono: 'fa-sitemap',
        color: 'blue'
    },
    // Categorías
    categorias: {
        modulo: 'categorias',
        titulo: 'CATEGORÍAS',
        subtitulo: '',
        icono: 'fa-tags',
        color: 'purple'
    },
    // Sucursales
    sucursales: {
        modulo: 'sucursales',
        titulo: 'SUCURSALES',
        subtitulo: 'Activas',
        icono: 'fa-store',
        color: 'yellow'
    },
    // Regiones
    regiones: {
        modulo: 'regiones',
        titulo: 'REGIONES',
        subtitulo: 'Registradas',
        icono: 'fa-map-marked-alt',
        color: 'purple'
    },
    // Colaboradores (Usuarios activos)
    colaboradores: {
        modulo: 'usuarios',
        titulo: 'COLABORADORES',
        subtitulo: '',
        icono: 'fa-users',
        color: 'cyan'
    }
};

// Mapeo de módulos a sus respectivas tarjetas y rutas
const MODULOS_CONFIG = {
    'areas': {
        modulo: 'areas',
        selector: '[data-modulo="areas"]',
        url: '/usuarios/colaboradores/areas/areas.html',
        titulo: 'Áreas',
        descripcion: 'Gestionar áreas de la organización',
        icono: 'fa-sitemap'
    },
    'categorias': {
        modulo: 'categorias',
        selector: '[data-modulo="categorias"]',
        url: '/usuarios/colaboradores/categorias/categorias.html',
        titulo: 'Categorías',
        descripcion: 'Administrar categorías y subcategorías',
        icono: 'fa-tags'
    },
    'sucursales': {
        modulo: 'sucursales',
        selector: '[data-modulo="sucursales"]',
        url: '/usuarios/colaboradores/sucursales/sucursales.html',
        titulo: 'Sucursales',
        descripcion: 'Gestionar sucursales activas',
        icono: 'fa-store'
    },
    'regiones': {
        modulo: 'regiones',
        selector: '[data-modulo="regiones"]',
        url: '/usuarios/colaboradores/regiones/regiones.html',
        titulo: 'Regiones',
        descripcion: 'Administrar regiones geográficas',
        icono: 'fa-map-marked-alt'
    },
    'incidencias': {
        modulo: 'incidencias',
        selector: '[data-modulo="incidencias"]',
        url: '/usuarios/colaboradores/incidencias/incidencias.html',
        titulo: 'Incidencias',
        descripcion: 'Gestionar reportes de incidencias',
        icono: 'fa-exclamation-triangle'
    },
    'usuarios': {
        modulo: 'usuarios',
        selector: '[data-modulo="usuarios"]',
        url: '/usuarios/colaboradores/usuarios/usuarios.html',
        titulo: 'Usuarios',
        descripcion: 'Gestionar usuarios del sistema',
        icono: 'fa-users'
    },
    'estadisticas': {
        modulo: 'estadisticas',
        selector: '[data-modulo="estadisticas"]',
        url: '/usuarios/colaboradores/estadisticas/estadisticas.html',
        titulo: 'Estadísticas',
        descripcion: 'Visualizar estadísticas y reportes',
        icono: 'fa-chart-line'
    },
    'tareas': {
        modulo: 'tareas',
        selector: '[data-modulo="tareas"]',
        url: '/usuarios/colaboradores/tareas/tareas.html',
        titulo: 'Tareas',
        descripcion: 'Gestionar tareas asignadas',
        icono: 'fa-tasks'
    },
    'monitoreo': {
        modulo: 'monitoreo',
        selector: '[data-modulo="monitoreo"]',
        url: '/usuarios/colaboradores/mapa/mapa.html',
        titulo: 'Mapa de Alertas',
        descripcion: 'Visualización de alertas en mapa',
        icono: 'fa-map-marker-alt'
    },
    'tablero-de-control': {
        selector: '#tablero-de-control',
        url: '/usuarios/colaboradores/loginMonitoreo/loginMonitoreo.html',
        titulo: 'Tablero de Control',
        permisoRequerido: 'monitoreo',
        grupo: 'acceso-rapido',
        brillo: false
    },
};

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', async function () {
    try {
        mostrarEstadoCarga();

        const usuarioCargado = cargarUsuarioDesdeStorage();

        if (!usuarioCargado) {
            mostrarErrorSesion();
            return;
        }

        try {
            const { PermisoManager } = await import('/clases/permiso.js');
            permisoManager = new PermisoManager();

            if (usuarioActual.organizacionCamelCase) {
                permisoManager.organizacionCamelCase = usuarioActual.organizacionCamelCase;
            }
        } catch (error) {
            // Error silencioso
        }

        await obtenerPermisosUsuario();

        // Filtrar tarjetas de módulos según permisos
        filtrarTarjetasPorPermisos();

        // Configurar eventos de las tarjetas
        configurarEventosTarjetas();

        // Cargar KPIs según permisos
        await cargarKPISegunPermisos();

        ocultarEstadoCarga();

    } catch (error) {
        ocultarEstadoCarga();
        mostrarError(error.message);
    }
});

// ========== CARGAR USUARIO DESDE LOCALSTORAGE ==========
function cargarUsuarioDesdeStorage() {
    try {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');

        if (userData && Object.keys(userData).length > 0) {
            usuarioActual = {
                id: userData.id || userData.uid || 'usuario',
                uid: userData.uid || userData.id || 'usuario',
                nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
                correo: userData.correoElectronico || userData.correo || '',
                organizacion: userData.organizacion || 'Mi Organización',
                organizacionCamelCase: userData.organizacionCamelCase || '',
                areaId: userData.areaAsignadaId || userData.areaId || '',
                areaNombre: userData.areaAsignadaNombre || userData.areaNombre || '',
                cargoId: userData.cargoId || '',
                cargoNombre: userData.cargoNombre || '',
                rol: userData.rol || 'colaborador'
            };

            return true;
        }

        const adminInfo = localStorage.getItem('adminInfo');
        if (adminInfo) {
            const adminData = JSON.parse(adminInfo);
            usuarioActual = {
                id: adminData.id || adminData.uid,
                uid: adminData.uid || adminData.id,
                nombreCompleto: adminData.nombreCompleto || 'Administrador',
                correo: adminData.correoElectronico || '',
                organizacion: adminData.organizacion || 'Mi Organización',
                organizacionCamelCase: adminData.organizacionCamelCase || '',
                areaId: adminData.areaAsignadaId || '',
                areaNombre: adminData.areaAsignadaNombre || '',
                cargoId: adminData.cargoId || '',
                cargoNombre: adminData.cargoNombre || '',
                rol: adminData.rol || 'administrador'
            };
            return true;
        }

        return false;

    } catch (error) {
        return false;
    }
}

// ========== OBTENER PERMISOS DEL USUARIO ==========
async function obtenerPermisosUsuario() {
    try {
        // Administrador o master tienen todos los permisos
        if (usuarioActual.rol === 'administrador' || usuarioActual.rol === 'master') {
            permisosUsuario = {
                areas: true,
                categorias: true,
                sucursales: true,
                regiones: true,
                incidencias: true,
                usuarios: true,
                estadisticas: true,
                tareas: true,
                monitoreo: true,
                permisos: true,
                admin: true
            };
            return;
        }

        // Verificar si el usuario tiene área y cargo
        if (!usuarioActual.areaId || !usuarioActual.cargoId) {
            permisosUsuario = {
                areas: false,
                categorias: false,
                sucursales: false,
                regiones: false,
                incidencias: true,
                usuarios: false,
                estadisticas: false,
                tareas: false,
                monitoreo: false,
                permisos: false,
                admin: false
            };
            return;
        }

        // Buscar permiso en Firebase
        if (permisoManager) {
            const permiso = await permisoManager.obtenerPorCargoYArea(
                usuarioActual.cargoId,
                usuarioActual.areaId,
                usuarioActual.organizacionCamelCase
            );

            if (permiso) {
                permisosUsuario = {
                    areas: permiso.puedeAcceder('areas'),
                    categorias: permiso.puedeAcceder('categorias'),
                    sucursales: permiso.puedeAcceder('sucursales'),
                    regiones: permiso.puedeAcceder('regiones'),
                    incidencias: permiso.puedeAcceder('incidencias'),
                    usuarios: permiso.puedeAcceder('usuarios'),
                    estadisticas: permiso.puedeAcceder('estadisticas'),
                    tareas: permiso.puedeAcceder('tareas'),
                    monitoreo: permiso.puedeAcceder('monitoreo'),
                    permisos: false,
                    admin: false
                };
                return;
            }
        }

        // Permisos por defecto
        permisosUsuario = {
            areas: false,
            categorias: false,
            sucursales: false,
            regiones: false,
            incidencias: true,
            usuarios: false,
            estadisticas: false,
            tareas: false,
            monitoreo: false,
            permisos: false,
            admin: false
        };

    } catch (error) {
        permisosUsuario = {
            areas: false,
            categorias: false,
            sucursales: false,
            regiones: false,
            incidencias: true,
            usuarios: false,
            estadisticas: false,
            tareas: false,
            monitoreo: false,
            permisos: false,
            admin: false
        };
    }
}

// ========== CARGAR KPIs SEGÚN PERMISOS ==========
async function cargarKPISegunPermisos() {
    const container = document.getElementById('kpi-container');
    if (!container) return;

    // Limpiar contenedor
    container.innerHTML = '';

    // Determinar qué KPIs mostrar según permisos (SOLO LOS SOLICITADOS)
    const kpisAMostrar = [];

    // Siempre mostrar incidencias canalizadas si tiene permiso de incidencias
    if (permisosUsuario.incidencias) {
        kpisAMostrar.push('incidenciasCanalizadas');
    }

    // Áreas
    if (permisosUsuario.areas) {
        kpisAMostrar.push('areas');
    }

    // Categorías
    if (permisosUsuario.categorias) {
        kpisAMostrar.push('categorias');
    }

    // Sucursales
    if (permisosUsuario.sucursales) {
        kpisAMostrar.push('sucursales');
    }

    // Regiones
    if (permisosUsuario.regiones) {
        kpisAMostrar.push('regiones');
    }

    // Colaboradores (Usuarios activos)
    if (permisosUsuario.usuarios) {
        kpisAMostrar.push('colaboradores');
    }

    // Crear tarjetas KPI
    for (const kpiKey of kpisAMostrar) {
        const config = KPI_CONFIG[kpiKey];
        if (!config) continue;

        const card = crearTarjetaKPI(config);
        container.appendChild(card);
    }

    // Si no hay KPIs para mostrar, mostrar mensaje
    if (kpisAMostrar.length === 0) {
        container.innerHTML = `
            <div class="kpi-card" style="grid-column: 1/-1; text-align: center;">
                <i class="fa-solid fa-info-circle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                <p style="color: var(--color-dash-text);">No hay módulos disponibles con tus permisos actuales</p>
            </div>
        `;
        return;
    }

    // Cargar datos en tiempo real para cada KPI
    for (const kpiKey of kpisAMostrar) {
        await suscribirAKPI(kpiKey);
    }
}

// ========== CREAR TARJETA KPI ==========
function crearTarjetaKPI(config) {
    const card = document.createElement('div');
    card.className = 'kpi-card';
    if (config.color === 'danger') card.classList.add('danger');
    card.id = `kpi-${config.modulo}`;
    card.setAttribute('data-modulo', config.modulo);

    const iconColorClass = config.color ? `kpi-icon ${config.color}` : 'kpi-icon';

    card.innerHTML = `
        <i class="fa-solid ${config.icono} ${iconColorClass}"></i>
        <span class="kpi-number" id="kpi-number-${config.modulo}">0</span>
        <h3 class="kpi-title">${config.titulo}</h3>
        <p class="kpi-subtitle">${config.subtitulo}</p>
    `;

    return card;
}

// ========== SUSCRIBIRSE A KPI EN TIEMPO REAL ==========
async function suscribirAKPI(kpiKey) {
    const config = KPI_CONFIG[kpiKey];
    if (!config) return;

    const organizacion = usuarioActual.organizacionCamelCase;
    if (!organizacion) return;

    const numberElement = document.getElementById(`kpi-number-${config.modulo}`);
    if (!numberElement) return;

    try {
        let unsubscribe = null;

        switch (kpiKey) {
            case 'incidenciasCanalizadas':
                unsubscribe = await suscribirIncidenciasCanalizadas(organizacion, numberElement);
                break;
            case 'areas':
                unsubscribe = await suscribirAColeccion(`areas_${organizacion}`, numberElement);
                break;
            case 'categorias':
                unsubscribe = await suscribirAColeccion(`categorias_${organizacion}`, numberElement);
                break;
            case 'sucursales':
                unsubscribe = await suscribirSucursalesActivas(organizacion, numberElement);
                break;
            case 'regiones':
                unsubscribe = await suscribirAColeccion(`regiones_${organizacion}`, numberElement);
                break;
            case 'colaboradores':
                unsubscribe = await suscribirColaboradoresActivos(organizacion, numberElement);
                break;
        }

        if (unsubscribe) {
            unsubscribeFunctions.push(unsubscribe);
        }

    } catch (error) {
        numberElement.textContent = '0';
    }
}

// ========== SUSCRIBIR A INCIDENCIAS CANALIZADAS ==========
async function suscribirIncidenciasCanalizadas(organizacion, numberElement) {
    const collectionName = `incidencias_${organizacion}`;
    const incidenciasCollection = collection(db, collectionName);

    // Si el usuario tiene área asignada, filtrar por canalizaciones a esa área
    let q;
    if (usuarioActual.areaId && usuarioActual.rol !== 'administrador' && usuarioActual.rol !== 'master') {
        q = query(incidenciasCollection, orderBy("fechaCreacion", "desc"));
    } else {
        q = query(incidenciasCollection, where("estado", "==", "pendiente"), orderBy("fechaCreacion", "desc"));
    }

    return onSnapshot(q, (snapshot) => {
        let count = 0;

        if (usuarioActual.areaId && usuarioActual.rol !== 'administrador' && usuarioActual.rol !== 'master') {
            // Filtrar incidencias canalizadas al área del usuario
            snapshot.forEach(doc => {
                const data = doc.data();
                const canalizaciones = data.canalizaciones || {};

                // Verificar si alguna canalización es para el área del usuario
                const esParaMiArea = Object.values(canalizaciones).some(c => c.areaId === usuarioActual.areaId);
                if (esParaMiArea && data.estado !== 'finalizada') {
                    count++;
                }
            });
        } else {
            // Admin o master: todas las pendientes
            count = snapshot.size;
        }

        numberElement.textContent = count;
    }, (error) => {
        numberElement.textContent = '0';
    });
}

// ========== SUSCRIBIR A COLECCIÓN GENÉRICA ==========
async function suscribirAColeccion(collectionName, numberElement) {
    const coleccion = collection(db, collectionName);
    return onSnapshot(coleccion, (snapshot) => {
        numberElement.textContent = snapshot.size;
    }, (error) => {
        numberElement.textContent = '0';
    });
}

// ========== SUSCRIBIR A SUCURSALES ACTIVAS ==========
async function suscribirSucursalesActivas(organizacion, numberElement) {
    const collectionName = `sucursales_${organizacion}`;
    const sucursalesCollection = collection(db, collectionName);

    return onSnapshot(sucursalesCollection, (snapshot) => {
        numberElement.textContent = snapshot.size;
    }, (error) => {
        numberElement.textContent = '0';
    });
}

// ========== SUSCRIBIR A COLABORADORES ACTIVOS ==========
async function suscribirColaboradoresActivos(organizacion, numberElement) {
    const colaboradoresCollection = collection(db, `colaboradores_${organizacion}`);
    const colaboradoresQuery = query(colaboradoresCollection, where("status", "==", true));

    return onSnapshot(colaboradoresQuery, (snapshot) => {
        numberElement.textContent = snapshot.size;
    }, (error) => {
        numberElement.textContent = '0';
    });
}

// ========== FILTRAR TARJETAS POR PERMISOS ==========
function filtrarTarjetasPorPermisos() {
    if (!permisosUsuario) {
        return;
    }

    Object.entries(MODULOS_CONFIG).forEach(([key, config]) => {
        const tarjeta = document.querySelector(config.selector);
        if (!tarjeta) return;

        const debeMostrarse = verificarPermisoModulo(config);

        if (debeMostrarse) {
            tarjeta.style.display = 'flex';
            tarjeta.dataset.url = config.url;
            tarjeta.dataset.titulo = config.titulo;
            tarjeta.dataset.modulo = config.modulo;
        } else {
            tarjeta.style.display = 'none';
        }
    });
}

// ========== VERIFICAR PERMISO DE MÓDULO ==========
function verificarPermisoModulo(config) {
    if (usuarioActual.rol === 'administrador' || usuarioActual.rol === 'master') {
        return true;
    }

    if (config.modulo && permisosUsuario) {
        return permisosUsuario[config.modulo] === true;
    }

    return false;
}

// ========== CONFIGURAR EVENTOS DE TARJETAS ==========
function configurarEventosTarjetas() {
    const tarjetas = document.querySelectorAll('.dashboard-card');

    tarjetas.forEach(tarjeta => {
        tarjeta.addEventListener('click', (e) => {
            e.preventDefault();

            const url = tarjeta.dataset.url;
            const titulo = tarjeta.dataset.titulo;
            const modulo = tarjeta.dataset.modulo;

            if (url) {
                const config = {
                    modulo: modulo,
                    requiereAdmin: tarjeta.dataset.requiereAdmin === 'true'
                };

                if (verificarPermisoModulo(config)) {
                    window.location.href = url;
                } else {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Acceso Denegado',
                        text: `No tienes permisos para acceder a ${titulo}`,
                        timer: 2000,
                        showConfirmButton: false
                    });
                }
            }
        });
    });
}

// ========== MOSTRAR RESUMEN DE PERMISOS ==========
function mostrarResumenPermisos() {
    // Función vacía - se eliminaron los console.log
}

// ========== ESTADOS DE CARGA Y ERROR ==========
function mostrarEstadoCarga() {
    if (!document.getElementById('loading-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            backdrop-filter: blur(5px);
        `;
        overlay.innerHTML = `
            <div style="text-align: center;">
                <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: #c0c0c0; margin-bottom: 16px;"></i>
                <h3 style="color: white; font-family: 'Orbitron', sans-serif;">CARGANDO PANEL</h3>
                <p style="color: #a5a5a5;">Verificando permisos...</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }
}

function ocultarEstadoCarga() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
    }
}

function mostrarErrorSesion() {
    ocultarEstadoCarga();
    const container = document.querySelector('.right-layout');
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
                <i class="fas fa-user-slash" style="font-size: 64px; color: #ff4d4d; margin-bottom: 20px;"></i>
                <h2 style="color: white;">SESIÓN NO DETECTADA</h2>
                <p style="color: #a5a5a5; margin: 20px 0;">Inicia sesión para acceder al panel</p>
                <button onclick="window.location.href='/iniciar-sesion/'" 
                    style="background: linear-gradient(145deg, #0f0f0f, #1a1a1a);
                           border: 1px solid #c0c0c0;
                           color: white;
                           padding: 12px 24px;
                           border-radius: 8px;
                           cursor: pointer;">
                    <i class="fas fa-sign-in-alt"></i> INICIAR SESIÓN
                </button>
            </div>
        `;
    }
}

function mostrarError(mensaje) {
    ocultarEstadoCarga();
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
                           cursor: pointer;">
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

// Limpiar suscripciones al salir
window.addEventListener('beforeunload', () => {
    unsubscribeFunctions.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') unsubscribe();
    });
});