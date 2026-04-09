// ========== panelControl.js - VERSIÓN SIMPLIFICADA ==========

import { UserManager } from '/clases/user.js';
import { IncidenciaManager } from '/clases/incidencia.js';
import { RegionManager } from '/clases/region.js';
import { SucursalManager } from '/clases/sucursal.js';
import { AreaManager } from '/clases/area.js';

let usuarioActual = null;

const userManager = new UserManager();
const incidenciaManager = new IncidenciaManager();
const regionManager = new RegionManager();
const sucursalManager = new SucursalManager();
const areaManager = new AreaManager();

let estadisticas = {
    incidencias: 0,
    incidenciasDiarias: 0,
    regiones: 0,
    sucursales: 0,
    areas: 0,
    usuarios: 0
};

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', async function () {
    try {
        await esperarAutenticacion(10000);
        usuarioActual = userManager.currentUser;

        if (!usuarioActual) {
            mostrarErrorSesion();
            return;
        }

        configurarEventosTarjetas();
        configurarEventosKPI();

        await cargarTodasLasEstadisticas();
        actualizarUI();

        setInterval(async () => {
            await cargarTodasLasEstadisticas();
            actualizarUI();
        }, 5 * 60 * 1000);

    } catch (error) {
        console.error('Error:', error);
    }
});

async function esperarAutenticacion(timeout = 10000) {
    const startTime = Date.now();
    while (!userManager.currentUser) {
        if (Date.now() - startTime > timeout) {
            throw new Error('Tiempo de espera agotado');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

// ========== CARGAR ESTADÍSTICAS ==========
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

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const incidenciasHoy = incidencias.filter(inc => {
            const fechaCreacion = inc.fechaCreacion;
            if (!fechaCreacion) return false;
            let fechaComparar = fechaCreacion.toDate ? fechaCreacion.toDate() : new Date(fechaCreacion);
            fechaComparar.setHours(0, 0, 0, 0);
            return fechaComparar.getTime() === hoy.getTime();
        });

        estadisticas.incidenciasDiarias = incidenciasHoy.length;
    } catch (error) {
        estadisticas.incidencias = 0;
        estadisticas.incidenciasDiarias = 0;
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
    } catch (error) {
        estadisticas.sucursales = 0;
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
        estadisticas.usuarios = totalUsuarios;
    } catch (error) {
        estadisticas.usuarios = 0;
    }
}

function actualizarUI() {
    const elementos = {
        'total-incidencias': estadisticas.incidencias,
        'total-incidencias-diarias': estadisticas.incidenciasDiarias,
        'total-regiones': estadisticas.regiones,
        'total-sucursales': estadisticas.sucursales,
        'total-areas': estadisticas.areas,
        'total-usuarios': estadisticas.usuarios
    };

    Object.entries(elementos).forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = valor;
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
    const kpis = [
        { id: 'kpi-incidencias', url: '/usuarios/administrador/incidencias/incidencias.html' },
        { id: 'kpi-incidencias-diarias', url: '/usuarios/administrador/incidencias/incidencias.html' },
        { id: 'kpi-regiones', url: '/usuarios/administrador/regiones/regiones.html' },
        { id: 'kpi-sucursales', url: '/usuarios/administrador/sucursales/sucursales.html' },
        { id: 'kpi-areas', url: '/usuarios/administrador/areas/areas.html' },
        { id: 'kpi-usuarios', url: '/usuarios/administrador/usuarios/usuarios.html' }
    ];

    kpis.forEach(kpi => {
        const tarjeta = document.getElementById(kpi.id);
        if (tarjeta) {
            tarjeta.style.cursor = 'pointer';
            tarjeta.removeEventListener('click', manejarClickKPI);
            tarjeta.addEventListener('click', (e) => manejarClickKPI(e, kpi.url));
        }
    });
}

function manejarClickKPI(e, url) {
    e.preventDefault();
    e.stopPropagation();
    window.location.href = url;
}

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
                           cursor: pointer;">
                    <i class="fas fa-sign-in-alt"></i> INICIAR SESIÓN
                </button>
            </div>
        `;
    }
}