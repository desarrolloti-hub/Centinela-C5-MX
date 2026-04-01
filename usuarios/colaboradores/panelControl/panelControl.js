// ========== panelControl.js - PANEL DE CONTROL COLABORADOR ==========
// CON ACCESO RÁPIDO Y MÓDULOS EN 3 COLUMNAS (SIN INCIDENCIAS EN MÓDULOS)

import { db } from '/config/firebase-config.js';
import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

let permisoManager = null;
let usuarioActual = null;
let permisosUsuario = null;
let unsubscribeFunctions = [];

// Configuración de KPIs
const KPI_CONFIG = {
    incidenciasCanalizadas: {
        modulo: 'incidencias',
        titulo: 'MIS INCIDENCIAS',
        subtitulo: 'Canalizadas',
        icono: 'fa-share-alt',
        color: 'danger'
    },
    areas: {
        modulo: 'areas',
        titulo: 'ÁREAS',
        subtitulo: 'Registradas',
        icono: 'fa-sitemap',
        color: 'blue'
    },
    categorias: {
        modulo: 'categorias',
        titulo: 'CATEGORÍAS',
        subtitulo: 'Registradas',
        icono: 'fa-tags',
        color: 'purple'
    },
    sucursales: {
        modulo: 'sucursales',
        titulo: 'SUCURSALES',
        subtitulo: 'Activas',
        icono: 'fa-store',
        color: 'yellow'
    },
    regiones: {
        modulo: 'regiones',
        titulo: 'REGIONES',
        subtitulo: 'Registradas',
        icono: 'fa-map-marked-alt',
        color: 'purple'
    },
    colaboradores: {
        modulo: 'usuarios',
        titulo: 'COLABORADORES',
        subtitulo: 'Activos',
        icono: 'fa-users',
        color: 'cyan'
    }
};

// Configuración de ACCESO RÁPIDO (sin Lista de Extravíos ni Tablero de Control)
const ACCESO_RAPIDO_CONFIG = [
    {
        id: 'nuevaIncidencia',
        titulo: 'Nueva Incidencia',
        descripcion: 'Crear nuevo reporte',
        icono: 'fa-triangle-exclamation',
        color: 'danger',
        url: '/usuarios/colaboradores/crearIncidencias/crearIncidencias.html',
        permiso: 'incidencias',
        brillo: true,
        animacion: true
    },
    {
        id: 'incidenciasLista',
        titulo: 'Incidencias',
        descripcion: 'Ver lista de incidencias',
        icono: 'fa-list',
        color: 'orange',
        url: '/usuarios/colaboradores/incidencias/incidencias.html',
        permiso: 'incidencias',
        brillo: false
    },
    {
        id: 'mapaAlertas',
        titulo: 'Mapa de Alertas',
        descripcion: 'Monitoreo en tiempo real',
        icono: 'fa-map-marker-alt',
        color: 'cyan',
        url: '/usuarios/colaboradores/mapa/mapa.html',
        permiso: 'monitoreo',
        brillo: false
    }
];

// Configuración de módulos agrupados por columnas (SIN INCIDENCIAS)
const COLUMNAS_CONFIG = [
    // FILA 1 - MÓDULOS PRINCIPALES
    {
        titulo: 'PANEL DE ÁREAS',
        icono: 'fa-layer-group',
        color: '#b16bff',
        permisos: ['areas'],
        tarjetas: [
            { modulo: 'areasLista', titulo: 'Lista Áreas', descripcion: 'Ver todas las áreas', icono: 'fa-list', color: 'purple', url: '/usuarios/colaboradores/areas/areas.html' },
            { modulo: 'areasNueva', titulo: 'Nueva Área', descripcion: 'Crear nueva área', icono: 'fa-plus-circle', color: 'purple', url: '/usuarios/colaboradores/crearAreas/crearAreas.html' }
        ]
    },
    {
        titulo: 'PANEL DE SUCURSALES',
        icono: 'fa-building',
        color: '#00cfff',
        permisos: ['sucursales'],
        tarjetas: [
            { modulo: 'sucursalesLista', titulo: 'Lista Sucursales', descripcion: 'Ver todas las sucursales', icono: 'fa-list', color: 'cyan', url: '/usuarios/colaboradores/sucursales/sucursales.html' },
            { modulo: 'sucursalesNueva', titulo: 'Nueva Sucursal', descripcion: 'Crear nueva sucursal', icono: 'fa-plus-circle', color: 'cyan', url: '/usuarios/colaboradores/crearSucursales/crearSucursales.html' }
        ]
    },
    {
        titulo: 'PANEL DE REGIONES',
        icono: 'fa-map',
        color: '#2f8cff',
        permisos: ['regiones'],
        tarjetas: [
            { modulo: 'regionesLista', titulo: 'Lista Regiones', descripcion: 'Ver todas las regiones', icono: 'fa-list', color: 'blue', url: '/usuarios/colaboradores/regiones/regiones.html' },
            { modulo: 'regionesNueva', titulo: 'Nueva Región', descripcion: 'Crear nueva región', icono: 'fa-plus-circle', color: 'blue', url: '/usuarios/colaboradores/crearRegiones/crearRegiones.html' }
        ]
    },
    // FILA 2 - MÓDULOS DE GESTIÓN
    {
        titulo: 'PANEL DE CATEGORÍAS',
        icono: 'fa-tags',
        color: '#b16bff',
        permisos: ['categorias'],
        tarjetas: [
            { modulo: 'categoriasLista', titulo: 'Lista Categorías', descripcion: 'Ver todas las categorías', icono: 'fa-list', color: 'purple', url: '/usuarios/colaboradores/categorias/categorias.html' },
            { modulo: 'categoriasNueva', titulo: 'Nueva Categoría', descripcion: 'Crear nueva categoría', icono: 'fa-plus-circle', color: 'purple', url: '/usuarios/colaboradores/crearCategorias/crearCategorias.html' }
        ]
    },
    {
        titulo: 'PANEL DE USUARIOS',
        icono: 'fa-users',
        color: '#00cfff',
        permisos: ['usuarios'],
        tarjetas: [
            { modulo: 'usuariosLista', titulo: 'Lista Usuarios', descripcion: 'Ver todos los usuarios', icono: 'fa-list', color: 'cyan', url: '/usuarios/colaboradores/usuarios/usuarios.html' },
            { modulo: 'usuariosNuevo', titulo: 'Nuevo Usuario', descripcion: 'Crear nuevo usuario', icono: 'fa-plus-circle', color: 'cyan', url: '/usuarios/colaboradores/crearUsuarios/crearUsuarios.html' }
        ]
    },
    {
        titulo: 'PANEL DE ESTADÍSTICAS',
        icono: 'fa-chart-line',
        color: '#b16bff',
        permisos: ['estadisticas'],
        tarjetas: [
            { modulo: 'estadisticasVer', titulo: 'Ver Estadísticas', descripcion: 'Visualizar reportes y gráficas', icono: 'fa-chart-simple', color: 'purple', url: '/usuarios/colaboradores/estadisticas/estadisticas.html' },
            { modulo: 'reportes', titulo: 'Reportes', descripcion: 'Generar reportes personalizados', icono: 'fa-file-alt', color: 'purple', url: '/usuarios/colaboradores/reportes/reportes.html' }
        ]
    },
    // FILA 3 - MÓDULOS DE TAREAS Y MONITOREO
    {
        titulo: 'PANEL DE TAREAS',
        icono: 'fa-tasks',
        color: '#ffcc00',
        permisos: ['tareas'],
        tarjetas: [
            { modulo: 'tareasLista', titulo: 'Mis Tareas', descripcion: 'Ver tareas asignadas', icono: 'fa-list-check', color: 'yellow', url: '/usuarios/colaboradores/tareas/tareas.html' },
            { modulo: 'tareasNueva', titulo: 'Nueva Tarea', descripcion: 'Crear nueva tarea', icono: 'fa-plus-circle', color: 'yellow', url: '/usuarios/colaboradores/tareas/tareas.html' }
        ]
    },
    {
        titulo: 'PANEL DE MONITOREO',
        icono: 'fa-map-marker-alt',
        color: '#ff4d00',
        permisos: ['monitoreo'],
        tarjetas: [
            { modulo: 'mapaAlertas', titulo: 'Mapa de Alertas', descripcion: 'Visualización en tiempo real', icono: 'fa-map', color: 'danger', url: '/usuarios/colaboradores/mapa/mapa.html' },
            { modulo: 'tableroControl', titulo: 'Tablero de Control', descripcion: 'Cuentas de monitoreo', icono: 'fa-dashboard', color: 'danger', url: '/usuarios/colaboradores/loginMonitoreo/loginMonitoreo.html' }
        ]
    }
];

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
        } catch (error) { }

        await obtenerPermisosUsuario();

        renderizarKPIs();
        renderizarAccesoRapido();
        renderizarColumnas();
        configurarEventosTarjetas();

        await cargarDatosKPIs();

        ocultarEstadoCarga();
    } catch (error) {
        ocultarEstadoCarga();
        mostrarError(error.message);
    }
});

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
        return false;
    } catch (error) {
        return false;
    }
}

async function obtenerPermisosUsuario() {
    try {
        if (usuarioActual.rol === 'administrador' || usuarioActual.rol === 'master') {
            permisosUsuario = {
                areas: true, categorias: true, sucursales: true, regiones: true,
                incidencias: true, usuarios: true, estadisticas: true, tareas: true,
                monitoreo: true, permisos: true, admin: true
            };
            return;
        }

        if (!usuarioActual.areaId || !usuarioActual.cargoId) {
            permisosUsuario = {
                areas: false, categorias: false, sucursales: false, regiones: false,
                incidencias: true, usuarios: false, estadisticas: false, tareas: false,
                monitoreo: false, permisos: false, admin: false
            };
            return;
        }

        if (permisoManager) {
            const permiso = await permisoManager.obtenerPorCargoYArea(
                usuarioActual.cargoId, usuarioActual.areaId, usuarioActual.organizacionCamelCase
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
                    permisos: false, admin: false
                };
                return;
            }
        }

        permisosUsuario = {
            areas: false, categorias: false, sucursales: false, regiones: false,
            incidencias: true, usuarios: false, estadisticas: false, tareas: false,
            monitoreo: false, permisos: false, admin: false
        };
    } catch (error) {
        permisosUsuario = {
            areas: false, categorias: false, sucursales: false, regiones: false,
            incidencias: true, usuarios: false, estadisticas: false, tareas: false,
            monitoreo: false, permisos: false, admin: false
        };
    }
}

function renderizarKPIs() {
    const container = document.getElementById('kpi-container');
    if (!container) return;
    container.innerHTML = '';

    const kpisAMostrar = [];

    if (permisosUsuario.incidencias) kpisAMostrar.push('incidenciasCanalizadas');
    if (permisosUsuario.areas) kpisAMostrar.push('areas');
    if (permisosUsuario.categorias) kpisAMostrar.push('categorias');
    if (permisosUsuario.sucursales) kpisAMostrar.push('sucursales');
    if (permisosUsuario.regiones) kpisAMostrar.push('regiones');
    if (permisosUsuario.usuarios) kpisAMostrar.push('colaboradores');

    if (kpisAMostrar.length === 0) {
        container.innerHTML = `<div class="kpi-card" style="grid-column: 1/-1; text-align: center;">
            <i class="fa-solid fa-info-circle" style="font-size: 2rem;"></i>
            <p>No hay módulos disponibles con tus permisos</p>
        </div>`;
        return;
    }

    for (const kpiKey of kpisAMostrar) {
        const config = KPI_CONFIG[kpiKey];
        const card = document.createElement('div');
        card.className = 'kpi-card';
        if (config.color === 'danger') {
            card.classList.add('danger');
            card.id = 'kpi-incidencias';
        }
        card.setAttribute('data-modulo', config.modulo);
        card.innerHTML = `
            <i class="fa-solid ${config.icono}" style="color: var(--color-icon-${config.color});"></i>
            <span class="kpi-number" id="kpi-number-${config.modulo}">0</span>
            <h3>${config.titulo}</h3>
            <p>${config.subtitulo}</p>
        `;
        container.appendChild(card);
    }
}

function renderizarAccesoRapido() {
    const container = document.getElementById('acceso-rapido-container');
    if (!container) return;
    container.innerHTML = '';

    for (const item of ACCESO_RAPIDO_CONFIG) {
        const tienePermiso = permisosUsuario[item.permiso] === true;
        if (!tienePermiso) continue;

        const card = document.createElement('div');
        card.className = 'dashboard-card';
        if (item.animacion) {
            card.id = 'card-nueva-incidencia';
        }
        card.setAttribute('data-url', item.url);
        card.setAttribute('data-titulo', item.titulo);

        // Estilo especial para nueva incidencia
        if (item.animacion) {
            card.style.border = '1px solid #ff4d00';
            card.style.animation = 'parpadeo 1.5s ease-in-out infinite';
        }

        card.innerHTML = `
            <div class="card-icon ${item.color}" style="${item.animacion ? 'animation: brilloIcono 1.5s ease-in-out infinite;' : ''}">
                <i class="fa-solid ${item.icono}"></i>
            </div>
            <div class="card-text">
                <h3 style="${item.animacion ? 'animation: brilloIcono 1.5s ease-in-out infinite;' : ''}">${item.titulo}</h3>
                <p>${item.descripcion}</p>
            </div>
            <div class="card-arrow">→</div>
        `;
        container.appendChild(card);
    }
}

function renderizarColumnas() {
    const container = document.getElementById('modulos-container');
    if (!container) return;
    container.innerHTML = '';

    for (const columna of COLUMNAS_CONFIG) {
        const tieneAlgunPermiso = columna.permisos.some(p => permisosUsuario[p] === true);
        if (!tieneAlgunPermiso) continue;

        const columnaDiv = document.createElement('div');
        columnaDiv.className = 'modulo-columna';

        columnaDiv.innerHTML = `
            <div class="modulo-header">
                <i class="fa-solid ${columna.icono}" style="color: ${columna.color};"></i>
                <h3>${columna.titulo}</h3>
            </div>
            <div class="modulo-tarjetas" id="tarjetas-${columna.titulo.replace(/\s/g, '')}">
            </div>
        `;

        container.appendChild(columnaDiv);

        const tarjetasContainer = columnaDiv.querySelector('.modulo-tarjetas');

        for (const tarjeta of columna.tarjetas) {
            let tienePermiso = false;

            if (tarjeta.modulo) {
                let moduloBase = tarjeta.modulo
                    .replace('Lista', '')
                    .replace('Nueva', '')
                    .replace('Nuevo', '')
                    .replace('Ver', '')
                    .toLowerCase();

                const moduloMap = {
                    'areas': 'areas',
                    'categorias': 'categorias',
                    'sucursales': 'sucursales',
                    'regiones': 'regiones',
                    'usuarios': 'usuarios',
                    'estadisticas': 'estadisticas',
                    'tareas': 'tareas',
                    'monitoreo': 'monitoreo',
                    'mapa': 'monitoreo',
                    'tablero': 'monitoreo'
                };

                const moduloKey = moduloMap[moduloBase] || moduloBase;
                tienePermiso = permisosUsuario[moduloKey] === true;
            } else {
                tienePermiso = true;
            }

            if (!tienePermiso) continue;

            const card = document.createElement('div');
            card.className = 'dashboard-card';
            card.setAttribute('data-url', tarjeta.url);
            card.setAttribute('data-titulo', tarjeta.titulo);
            card.innerHTML = `
                <div class="card-icon ${tarjeta.color}">
                    <i class="fa-solid ${tarjeta.icono}"></i>
                </div>
                <div class="card-text">
                    <h3>${tarjeta.titulo}</h3>
                    <p>${tarjeta.descripcion}</p>
                </div>
                <div class="card-arrow">→</div>
            `;
            tarjetasContainer.appendChild(card);
        }

        if (tarjetasContainer.children.length === 0) {
            columnaDiv.style.display = 'none';
        }
    }
}

function configurarEventosTarjetas() {
    const tarjetas = document.querySelectorAll('.dashboard-card');
    tarjetas.forEach(tarjeta => {
        tarjeta.addEventListener('click', (e) => {
            e.preventDefault();
            const url = tarjeta.dataset.url;
            if (url) window.location.href = url;
        });
    });
}

async function cargarDatosKPIs() {
    const organizacion = usuarioActual.organizacionCamelCase;
    if (!organizacion) return;

    if (permisosUsuario.incidencias) {
        await suscribirIncidenciasCanalizadas(organizacion);
    }
    if (permisosUsuario.areas) {
        await suscribirAColeccion(`areas_${organizacion}`, 'areas');
    }
    if (permisosUsuario.categorias) {
        await suscribirAColeccion(`categorias_${organizacion}`, 'categorias');
    }
    if (permisosUsuario.sucursales) {
        await suscribirAColeccion(`sucursales_${organizacion}`, 'sucursales');
    }
    if (permisosUsuario.regiones) {
        await suscribirAColeccion(`regiones_${organizacion}`, 'regiones');
    }
    if (permisosUsuario.usuarios) {
        await suscribirColaboradoresActivos(organizacion);
    }
}

async function suscribirIncidenciasCanalizadas(organizacion) {
    const collectionName = `incidencias_${organizacion}`;
    const incidenciasCollection = collection(db, collectionName);
    const numberElement = document.getElementById('kpi-number-incidencias');
    if (!numberElement) return;

    let q;
    if (usuarioActual.areaId && usuarioActual.rol !== 'administrador' && usuarioActual.rol !== 'master') {
        q = query(incidenciasCollection, orderBy("fechaCreacion", "desc"));
    } else {
        q = query(incidenciasCollection, where("estado", "==", "pendiente"), orderBy("fechaCreacion", "desc"));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
        let count = 0;
        if (usuarioActual.areaId && usuarioActual.rol !== 'administrador' && usuarioActual.rol !== 'master') {
            snapshot.forEach(doc => {
                const data = doc.data();
                const canalizaciones = data.canalizaciones || {};
                const esParaMiArea = Object.values(canalizaciones).some(c => c.areaId === usuarioActual.areaId);
                if (esParaMiArea && data.estado !== 'finalizada') count++;
            });
        } else {
            count = snapshot.size;
        }
        numberElement.textContent = count;
    });
    unsubscribeFunctions.push(unsubscribe);
}

async function suscribirAColeccion(collectionName, moduloId) {
    const numberElement = document.getElementById(`kpi-number-${moduloId}`);
    if (!numberElement) return;
    const coleccion = collection(db, collectionName);
    const unsubscribe = onSnapshot(coleccion, (snapshot) => {
        numberElement.textContent = snapshot.size;
    });
    unsubscribeFunctions.push(unsubscribe);
}

async function suscribirColaboradoresActivos(organizacion) {
    const numberElement = document.getElementById('kpi-number-usuarios');
    if (!numberElement) return;
    const colaboradoresCollection = collection(db, `colaboradores_${organizacion}`);
    const colaboradoresQuery = query(colaboradoresCollection, where("status", "==", true));
    const unsubscribe = onSnapshot(colaboradoresQuery, (snapshot) => {
        numberElement.textContent = snapshot.size;
    });
    unsubscribeFunctions.push(unsubscribe);
}

// ========== UTILIDADES ==========
function mostrarEstadoCarga() {
    if (!document.getElementById('loading-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:flex;justify-content:center;align-items:center;z-index:9999;backdrop-filter:blur(5px);';
        overlay.innerHTML = `<div style="text-align:center;"><i class="fas fa-spinner fa-spin" style="font-size:48px;color:#c0c0c0;"></i><h3 style="color:white;">CARGANDO PANEL</h3><p style="color:#a5a5a5;">Verificando permisos...</p></div>`;
        document.body.appendChild(overlay);
    }
}

function ocultarEstadoCarga() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.remove();
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
        container.innerHTML = `<div style="text-align:center;padding:60px;"><i class="fas fa-exclamation-circle" style="font-size:64px;color:#ff4d4d;"></i><h2>ERROR</h2><p>${mensaje}</p><button onclick="window.location.reload()">REINTENTAR</button></div>`;
    }
}

window.addEventListener('beforeunload', () => {
    unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
});