// estadisticasUsuarios.js - Controlador para vista detallada por colaborador
// VERSIÓN 1.2 - Con ocultamiento de secciones sin datos

import { IncidenciaManager } from '/clases/incidencia.js';
import { SucursalManager } from '/clases/sucursal.js';
import { CategoriaManager } from '/clases/categoria.js';
import { UserManager } from '/clases/user.js';

// Variables globales
let incidenciaManager = null;
let sucursalManager = null;
let categoriaManager = null;
let userManager = null;
let organizacionActual = null;
let colaboradorActual = null;
let colaboradorId = null;
let todasIncidencias = [];
let incidenciasColaborador = [];
let colaboradoresDisponibles = [];
let categoriasCache = [];
let sucursalesCache = [];
let nivelesRiesgoCache = [];

// Gráficas
let graficoEvolucionMensual = null;
let graficoRiesgoColaborador = null;
let graficoEstadoColaborador = null;
let graficoTiempoCategorias = null;

// Colores para niveles de riesgo
const COLOR_RIESGO = {
    critico: '#ef4444',
    alto: '#f97316',
    medio: '#eab308',
    bajo: '#10b981'
};

// =============================================
// FUNCIONES AUXILIARES
// =============================================

function obtenerUsuarioActual() {
    try {
        const adminInfo = localStorage.getItem('adminInfo');
        if (adminInfo) {
            const adminData = JSON.parse(adminInfo);
            return {
                id: adminData.id || adminData.uid,
                uid: adminData.uid || adminData.id,
                nombreCompleto: adminData.nombreCompleto || 'Administrador',
                organizacion: adminData.organizacion,
                organizacionCamelCase: adminData.organizacionCamelCase,
                correoElectronico: adminData.correoElectronico || ''
            };
        }
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (userData && Object.keys(userData).length > 0) {
            return {
                id: userData.uid || userData.id,
                uid: userData.uid || userData.id,
                nombreCompleto: userData.nombreCompleto || userData.nombre || 'Usuario',
                organizacion: userData.organizacion || userData.empresa,
                organizacionCamelCase: userData.organizacionCamelCase,
                correoElectronico: userData.correo || userData.email || ''
            };
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function obtenerDatosOrganizacion() {
    try {
        const usuario = obtenerUsuarioActual();
        if (usuario) {
            organizacionActual = {
                nombre: usuario.organizacion || 'Mi Empresa',
                camelCase: usuario.organizacionCamelCase || ''
            };
            return;
        }
        organizacionActual = { nombre: 'Mi Empresa', camelCase: '' };
    } catch (error) {
        organizacionActual = { nombre: 'Mi Empresa', camelCase: '' };
    }
}

async function inicializarManagers() {
    try {
        incidenciaManager = new IncidenciaManager();
        sucursalManager = new SucursalManager();
        userManager = new UserManager();
        
        const { CategoriaManager } = await import('/clases/categoria.js');
        categoriaManager = new CategoriaManager();
        
        return true;
    } catch (error) {
        console.error('Error inicializando managers:', error);
        return false;
    }
}

async function cargarCategorias() {
    try {
        categoriasCache = await categoriaManager.obtenerCategoriasPorOrganizacion(organizacionActual.camelCase);
    } catch (error) {
        console.error('Error cargando categorías:', error);
        categoriasCache = [];
    }
}

async function cargarSucursales() {
    try {
        sucursalesCache = await sucursalManager.getSucursalesByOrganizacion(organizacionActual.camelCase);
    } catch (error) {
        console.error('Error cargando sucursales:', error);
        sucursalesCache = [];
    }
}

async function cargarNivelesRiesgo() {
    try {
        if (!organizacionActual?.camelCase) return;
        
        const { RiesgoNivelManager } = await import('/clases/riesgoNivel.js');
        const riesgoManager = new RiesgoNivelManager();
        const niveles = await riesgoManager.obtenerTodosNiveles(organizacionActual.camelCase);
        
        if (niveles && niveles.length > 0) {
            nivelesRiesgoCache = niveles;
            window.nivelesRiesgoEstaticos = niveles;
        } else {
            nivelesRiesgoCache = [
                { id: 'critico', nombre: 'Crítico', color: '#ef4444' },
                { id: 'alto', nombre: 'Alto', color: '#f97316' },
                { id: 'medio', nombre: 'Medio', color: '#eab308' },
                { id: 'bajo', nombre: 'Bajo', color: '#10b981' }
            ];
            window.nivelesRiesgoEstaticos = nivelesRiesgoCache;
        }
    } catch (error) {
        console.error('Error cargando niveles de riesgo:', error);
        nivelesRiesgoCache = [
            { id: 'critico', nombre: 'Crítico', color: '#ef4444' },
            { id: 'alto', nombre: 'Alto', color: '#f97316' },
            { id: 'medio', nombre: 'Medio', color: '#eab308' },
            { id: 'bajo', nombre: 'Bajo', color: '#10b981' }
        ];
        window.nivelesRiesgoEstaticos = nivelesRiesgoCache;
    }
}

function obtenerNombreCategoria(categoriaId) {
    const categoria = categoriasCache.find(c => c.id === categoriaId);
    return categoria ? categoria.nombre : 'No disponible';
}

function obtenerNombreSucursal(sucursalId) {
    const sucursal = sucursalesCache.find(s => s.id === sucursalId);
    return sucursal ? sucursal.nombre : 'No disponible';
}

function obtenerColorRiesgo(nivel) {
    const nivelConfig = nivelesRiesgoCache.find(n => n.id === nivel);
    return nivelConfig ? nivelConfig.color : (COLOR_RIESGO[nivel] || '#6c757d');
}

function obtenerNombreRiesgo(nivel) {
    const nivelConfig = nivelesRiesgoCache.find(n => n.id === nivel);
    return nivelConfig ? nivelConfig.nombre : (nivel || 'N/A');
}

function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(valor);
}

function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// =============================================
// CARGA DE DATOS DEL COLABORADOR
// =============================================

async function cargarColaboradores() {
    try {
        if (!organizacionActual?.camelCase) return [];
        
        const colaboradores = await userManager.getColaboradoresByOrganizacion(organizacionActual.camelCase, false);
        const administradores = await userManager.getAdministradores(false);
        
        const adminsDeOrganizacion = administradores.filter(admin => 
            admin.organizacionCamelCase === organizacionActual.camelCase
        );
        
        const incidencias = await incidenciaManager.getIncidenciasByOrganizacion(organizacionActual.camelCase);
        
        const colaboradoresActivos = new Map();
        
        colaboradores.forEach(col => {
            colaboradoresActivos.set(col.nombreCompleto, { 
                nombre: col.nombreCompleto, 
                email: col.correoElectronico || '' 
            });
        });
        
        adminsDeOrganizacion.forEach(admin => {
            colaboradoresActivos.set(admin.nombreCompleto, { 
                nombre: admin.nombreCompleto, 
                email: admin.correoElectronico || '' 
            });
        });
        
        incidencias.forEach(inc => {
            if (inc.creadoPorNombre && !colaboradoresActivos.has(inc.creadoPorNombre)) {
                colaboradoresActivos.set(inc.creadoPorNombre, { nombre: inc.creadoPorNombre, email: inc.creadoPorEmail || '' });
            }
            if (inc.actualizadoPorNombre && !colaboradoresActivos.has(inc.actualizadoPorNombre)) {
                colaboradoresActivos.set(inc.actualizadoPorNombre, { nombre: inc.actualizadoPorNombre, email: inc.actualizadoPorEmail || '' });
            }
            if (inc.seguimiento) {
                Object.values(inc.seguimiento).forEach(seg => {
                    if (seg.usuarioNombre && !colaboradoresActivos.has(seg.usuarioNombre)) {
                        colaboradoresActivos.set(seg.usuarioNombre, { nombre: seg.usuarioNombre, email: seg.usuarioEmail || '' });
                    }
                });
            }
        });
        
        colaboradoresDisponibles = Array.from(colaboradoresActivos.values())
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
        
        return colaboradoresDisponibles;
    } catch (error) {
        console.error('Error cargando colaboradores:', error);
        colaboradoresDisponibles = [];
        return [];
    }
}

async function cargarColaborador() {
    const urlParams = new URLSearchParams(window.location.search);
    colaboradorId = urlParams.get('id');
    
    if (!colaboradorId) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se especificó ningún colaborador',
            confirmButtonText: 'Volver'
        }).then(() => {
            window.location.href = '/usuarios/administrador/estadisticas/estadisticas.html';
        });
        return false;
    }
    
    try {
        await cargarColaboradores();
        
        const nombreColaborador = decodeURIComponent(colaboradorId);
        colaboradorActual = colaboradoresDisponibles.find(c => c.nombre === nombreColaborador);
        
        if (!colaboradorActual) {
            colaboradorActual = { nombre: nombreColaborador, email: '' };
        }
        
        document.getElementById('colaboradorNombre').textContent = colaboradorActual.nombre;
        document.getElementById('colaboradorRol').innerHTML = `<i class="fas fa-user-tag"></i> Colaborador`;
        document.getElementById('colaboradorEmail').innerHTML = `<i class="fas fa-envelope"></i> ${colaboradorActual.email || 'Correo no disponible'}`;
        
        const selector = document.getElementById('selectorColaborador');
        if (selector) {
            selector.value = colaboradorActual.nombre;
        }
        
        return true;
    } catch (error) {
        console.error('Error cargando colaborador:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo cargar la información del colaborador'
        });
        return false;
    }
}

async function cargarTodasLasIncidencias() {
    try {
        todasIncidencias = await incidenciaManager.getIncidenciasByOrganizacion(organizacionActual.camelCase);
        return todasIncidencias;
    } catch (error) {
        console.error('Error cargando incidencias:', error);
        todasIncidencias = [];
        return [];
    }
}

function cargarIncidenciasColaborador() {
    if (!colaboradorActual) return [];
    
    const nombreColaborador = colaboradorActual.nombre;
    
    incidenciasColaborador = todasIncidencias.filter(inc => {
        if (inc.creadoPorNombre === nombreColaborador) return true;
        if (inc.actualizadoPorNombre === nombreColaborador) return true;
        if (inc.seguimiento) {
            const seguimientos = Object.values(inc.seguimiento);
            if (seguimientos.some(seg => seg.usuarioNombre === nombreColaborador)) return true;
        }
        return false;
    });
    
    return incidenciasColaborador;
}

// =============================================
// CÁLCULO DE ESTADÍSTICAS
// =============================================

function calcularEstadisticasColaborador() {
    const total = incidenciasColaborador.length;
    
    const reportadas = incidenciasColaborador.filter(i => i.creadoPorNombre === colaboradorActual.nombre).length;
    const actualizadas = incidenciasColaborador.filter(i => i.actualizadoPorNombre === colaboradorActual.nombre).length;
    
    let seguimientos = 0;
    incidenciasColaborador.forEach(inc => {
        if (inc.seguimiento) {
            Object.values(inc.seguimiento).forEach(seg => {
                if (seg.usuarioNombre === colaboradorActual.nombre) seguimientos++;
            });
        }
    });
    
    const criticasAltas = incidenciasColaborador.filter(i => 
        i.nivelRiesgo === 'critico' || i.nivelRiesgo === 'alto'
    ).length;
    
    let tiempoTotal = 0;
    let incidenciasConTiempo = 0;
    
    incidenciasColaborador.forEach(inc => {
        if (inc.actualizadoPorNombre === colaboradorActual.nombre && inc.estado === 'finalizada') {
            const inicio = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
            let fechaFin = null;
            
            if (inc.fechaFinalizacion) {
                fechaFin = inc.fechaFinalizacion instanceof Date ? inc.fechaFinalizacion : new Date(inc.fechaFinalizacion);
            } else if (inc.fechaActualizacion) {
                fechaFin = inc.fechaActualizacion instanceof Date ? inc.fechaActualizacion : new Date(inc.fechaActualizacion);
            }
            
            if (fechaFin && inicio) {
                const diffHoras = (fechaFin - inicio) / (1000 * 60 * 60);
                if (diffHoras > 0 && diffHoras < 720) {
                    tiempoTotal += diffHoras;
                    incidenciasConTiempo++;
                }
            }
        }
    });
    
    const tiempoPromedio = incidenciasConTiempo > 0 ? Math.round(tiempoTotal / incidenciasConTiempo) : 0;
    
    const totalActividad = reportadas + actualizadas + seguimientos;
    let eficiencia = 0;
    
    if (total > 0) {
        const pesoCriticas = criticasAltas * 2;
        eficiencia = Math.min(100, Math.round(((totalActividad + pesoCriticas) / (total + criticasAltas)) * 50));
    }
    
    const finalizadas = incidenciasColaborador.filter(i => 
        i.estado === 'finalizada' && i.actualizadoPorNombre === colaboradorActual.nombre
    ).length;
    const tasaExito = actualizadas > 0 ? Math.round((finalizadas / actualizadas) * 100) : 0;
    
    return {
        total,
        reportadas,
        actualizadas,
        seguimientos,
        criticasAltas,
        tiempoPromedio,
        eficiencia,
        tasaExito
    };
}

function calcularEvolucionSemanal() {
    const semanasMap = new Map();
    const hoy = new Date();
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - 56); // 8 semanas atrás (56 días)
    
    // Inicializar últimas 8 semanas
    for (let i = 0; i < 8; i++) {
        const fechaSemana = new Date(inicioSemana);
        fechaSemana.setDate(inicioSemana.getDate() + (i * 7));
        const numSemana = getSemanaDelAno(fechaSemana);
        const anio = fechaSemana.getFullYear();
        const semanaKey = `${anio}-S${numSemana}`;
        
        // Formato: "Sem 12, 2024" o "24 Mar - 30 Mar"
        const inicioRango = new Date(fechaSemana);
        const finRango = new Date(fechaSemana);
        finRango.setDate(finRango.getDate() + 6);
        
        const nombreSemana = `${formatearFechaCorta(inicioRango)} - ${formatearFechaCorta(finRango)}`;
        
        semanasMap.set(semanaKey, {
            key: semanaKey,
            nombre: nombreSemana,
            semanaNum: numSemana,
            anio: anio,
            reportadas: 0,
            actualizadas: 0,
            seguimientos: 0,
            fechaInicio: inicioRango
        });
    }
    
    // Procesar incidencias y asignarlas a semanas
    incidenciasColaborador.forEach(inc => {
        const fecha = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
        
        // Encontrar a qué semana pertenece
        for (const [semanaKey, semanaData] of semanasMap.entries()) {
            const finSemana = new Date(semanaData.fechaInicio);
            finSemana.setDate(finSemana.getDate() + 7);
            
            if (fecha >= semanaData.fechaInicio && fecha < finSemana) {
                if (inc.creadoPorNombre === colaboradorActual.nombre) semanaData.reportadas++;
                if (inc.actualizadoPorNombre === colaboradorActual.nombre) semanaData.actualizadas++;
                
                if (inc.seguimiento) {
                    Object.values(inc.seguimiento).forEach(seg => {
                        if (seg.usuarioNombre === colaboradorActual.nombre) semanaData.seguimientos++;
                    });
                }
                break;
            }
        }
    });
    
    // Ordenar semanas por fecha
    const semanasOrdenadas = Array.from(semanasMap.values())
        .sort((a, b) => a.fechaInicio - b.fechaInicio);
    
    return {
        labels: semanasOrdenadas.map(s => s.nombre),
        reportadas: semanasOrdenadas.map(s => s.reportadas),
        actualizadas: semanasOrdenadas.map(s => s.actualizadas),
        seguimientos: semanasOrdenadas.map(s => s.seguimientos),
        semanasInfo: semanasOrdenadas
    };
}

// Función auxiliar para obtener número de semana
function getSemanaDelAno(fecha) {
    const inicioAnio = new Date(fecha.getFullYear(), 0, 1);
    const dias = Math.floor((fecha - inicioAnio) / (24 * 60 * 60 * 1000));
    return Math.ceil((dias + inicioAnio.getDay() + 1) / 7);
}

// Función auxiliar para formatear fecha corta (ej: "24 Mar")
function formatearFechaCorta(fecha) {
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${fecha.getDate()} ${meses[fecha.getMonth()]}`;
}

function calcularDatosPorRiesgo() {
    const riesgoMap = new Map();
    
    if (nivelesRiesgoCache && nivelesRiesgoCache.length > 0) {
        nivelesRiesgoCache.forEach(nivel => {
            riesgoMap.set(nivel.id, 0);
        });
    }
    
    incidenciasColaborador.forEach(inc => {
        const nivel = inc.nivelRiesgo;
        if (riesgoMap.has(nivel)) {
            riesgoMap.set(nivel, riesgoMap.get(nivel) + 1);
        } else if (nivel) {
            riesgoMap.set(nivel, (riesgoMap.get(nivel) || 0) + 1);
        }
    });
    
    const labels = [];
    const data = [];
    const colors = [];
    
    if (nivelesRiesgoCache && nivelesRiesgoCache.length > 0) {
        nivelesRiesgoCache.forEach(nivel => {
            const cantidad = riesgoMap.get(nivel.id) || 0;
            if (cantidad > 0) {
                labels.push(nivel.nombre);
                data.push(cantidad);
                colors.push(nivel.color || '#6c757d');
            }
        });
    }
    
    for (const [nivelId, cantidad] of riesgoMap.entries()) {
        if (cantidad > 0 && !nivelesRiesgoCache.some(n => n.id === nivelId)) {
            labels.push(nivelId);
            data.push(cantidad);
            colors.push('#6c757d');
        }
    }
    
    const total = data.reduce((a, b) => a + b, 0);
    
    return { labels, data, colors, total };
}

function calcularDatosPorEstado() {
    let pendientes = 0;
    let finalizadas = 0;
    
    incidenciasColaborador.forEach(inc => {
        if (inc.estado === 'pendiente') pendientes++;
        else if (inc.estado === 'finalizada') finalizadas++;
    });
    
    return { pendientes, finalizadas };
}

function calcularDatosPorCategoria() {
    const categoriaMap = new Map();
    
    incidenciasColaborador.forEach(inc => {
        if (inc.categoriaId) {
            const nombreCat = obtenerNombreCategoria(inc.categoriaId);
            if (!categoriaMap.has(nombreCat)) {
                categoriaMap.set(nombreCat, 0);
            }
            categoriaMap.set(nombreCat, categoriaMap.get(nombreCat) + 1);
        }
    });
    
    const total = incidenciasColaborador.length;
    
    return Array.from(categoriaMap.entries())
        .map(([nombre, cantidad]) => ({ nombre, cantidad, porcentaje: total > 0 ? (cantidad / total) * 100 : 0 }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);
}

function calcularTiempoPorCategoria() {
    const categoriaMap = new Map();
    
    incidenciasColaborador.forEach(inc => {
        if (inc.actualizadoPorNombre === colaboradorActual.nombre && inc.estado === 'finalizada' && inc.categoriaId) {
            const inicio = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
            let fechaFin = null;
            
            if (inc.fechaFinalizacion) {
                fechaFin = inc.fechaFinalizacion instanceof Date ? inc.fechaFinalizacion : new Date(inc.fechaFinalizacion);
            } else if (inc.fechaActualizacion) {
                fechaFin = inc.fechaActualizacion instanceof Date ? inc.fechaActualizacion : new Date(inc.fechaActualizacion);
            }
            
            if (fechaFin && inicio) {
                const diffHoras = (fechaFin - inicio) / (1000 * 60 * 60);
                if (diffHoras > 0 && diffHoras < 720) {
                    const nombreCat = obtenerNombreCategoria(inc.categoriaId);
                    if (!categoriaMap.has(nombreCat)) {
                        categoriaMap.set(nombreCat, { total: 0, count: 0 });
                    }
                    const data = categoriaMap.get(nombreCat);
                    data.total += diffHoras;
                    data.count++;
                }
            }
        }
    });
    
    return Array.from(categoriaMap.entries())
        .map(([nombre, data]) => ({ nombre, promedio: Math.round(data.total / data.count), count: data.count }))
        .sort((a, b) => b.promedio - a.promedio)
        .slice(0, 8);
}

// =============================================
// RENDERIZADO
// =============================================

function actualizarKPIs() {
    const stats = calcularEstadisticasColaborador();
    
    setElementText('totalIncidencias', stats.total);
    setElementText('totalReportadas', stats.reportadas);
    setElementText('totalActualizadas', stats.actualizadas);
    setElementText('totalSeguimientos', stats.seguimientos);
    setElementText('eficienciaColaborador', `${stats.eficiencia}%`);
    setElementText('totalCriticasAltas', stats.criticasAltas);
    setElementText('tiempoPromedio', stats.tiempoPromedio);
    setElementText('tasaExito', `${stats.tasaExito}%`);
}

function renderizarGraficoEvolucionSemanal() {
    const datos = calcularEvolucionSemanal();
    const canvas = document.getElementById('graficoEvolucionMensual');
    if (!canvas) return;
    
    if (graficoEvolucionMensual) {
        graficoEvolucionMensual.destroy();
    }
    
    const tieneDatos = datos.reportadas.some(v => v > 0) || 
                       datos.actualizadas.some(v => v > 0) || 
                       datos.seguimientos.some(v => v > 0);
    
    if (datos.labels.length === 0 || !tieneDatos) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Sin datos de actividad en las últimas semanas', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    graficoEvolucionMensual = new Chart(canvas, {
        type: 'line',
        data: {
            labels: datos.labels,
            datasets: [
                {
                    label: 'Incidencias reportadas',
                    data: datos.reportadas,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#fff',
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    borderWidth: 2
                },
                {
                    label: 'Incidencias actualizadas',
                    data: datos.actualizadas,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: '#10b981',
                    pointBorderColor: '#fff',
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    borderWidth: 2
                },
                {
                    label: 'Seguimientos realizados',
                    data: datos.seguimientos,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#fff',
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: 'white', font: { size: 10 } },
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}`,
                        title: (tooltipItems) => {
                            const idx = tooltipItems[0].dataIndex;
                            return `Semana: ${datos.labels[idx]}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { 
                        color: '#aaa', 
                        stepSize: 1,
                        precision: 0
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    title: {
                        display: true,
                        text: 'Cantidad de actividades',
                        color: '#aaa',
                        font: { size: 10 }
                    }
                },
                x: {
                    ticks: { 
                        color: '#aaa', 
                        maxRotation: 45, 
                        minRotation: 30,
                        autoSkip: true,
                        font: { size: 9 }
                    },
                    grid: { display: false },
                    title: {
                        display: true,
                        text: 'Período semanal',
                        color: '#aaa',
                        font: { size: 10 }
                    }
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            }
        }
    });
    
    canvas.style.cursor = 'pointer';
}

function renderizarGraficoRiesgoColaborador() {
    const datos = calcularDatosPorRiesgo();
    const canvas = document.getElementById('graficoRiesgoColaborador');
    if (!canvas) return;
    
    if (graficoRiesgoColaborador) {
        graficoRiesgoColaborador.destroy();
    }
    
    if (datos.data.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Sin datos de riesgo', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    graficoRiesgoColaborador = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: datos.labels,
            datasets: [{
                data: datos.data,
                backgroundColor: datos.colors,
                borderWidth: 0,
                hoverOffset: 15,
                cutout: '60%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: 'white', font: { size: 11 } },
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const total = datos.total;
                            const porcentaje = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                            return `${ctx.label}: ${ctx.raw} (${porcentaje}%)`;
                        }
                    }
                }
            },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const nivelNombre = datos.labels[index];
                    const nivelId = nivelesRiesgoCache.find(n => n.nombre === nivelNombre)?.id || nivelNombre.toLowerCase();
                    
                    const incidenciasFiltradas = incidenciasColaborador.filter(i => i.nivelRiesgo === nivelId);
                    
                    if (incidenciasFiltradas.length === 0) {
                        Swal.fire({
                            icon: 'info',
                            title: 'Sin registros',
                            text: `No hay incidencias con nivel de riesgo: ${nivelNombre}`,
                            background: 'var(--color-bg-primary)',
                            color: 'white'
                        });
                        return;
                    }
                    
                    mostrarRegistrosIncidenciasEnSweet(
                        incidenciasFiltradas,
                        `Incidencias: ${nivelNombre}`,
                        `<i class="fas fa-exclamation-triangle" style="color: ${datos.colors[index]}"></i>`
                    );
                }
            }
        }
    });
    
    canvas.style.cursor = 'pointer';
}

function renderizarGraficoEstadoColaborador() {
    const datos = calcularDatosPorEstado();
    const canvas = document.getElementById('graficoEstadoColaborador');
    if (!canvas) return;
    
    if (graficoEstadoColaborador) {
        graficoEstadoColaborador.destroy();
    }
    
    const totalIncidencias = datos.pendientes + datos.finalizadas;
    
    if (totalIncidencias === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Sin datos de estado', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    graficoEstadoColaborador = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['Pendientes', 'Finalizadas'],
            datasets: [{
                data: [datos.pendientes, datos.finalizadas],
                backgroundColor: ['#f59e0b', '#10b981'],
                borderWidth: 0,
                hoverOffset: 15,
                cutout: '60%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: 'white', font: { size: 11 } },
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const total = totalIncidencias;
                            const porcentaje = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                            return `${ctx.label}: ${ctx.raw} (${porcentaje}%)`;
                        }
                    }
                }
            },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const estado = index === 0 ? 'pendiente' : 'finalizada';
                    const estadoNombre = index === 0 ? 'Pendientes' : 'Finalizadas';
                    
                    const incidenciasFiltradas = incidenciasColaborador.filter(i => i.estado === estado);
                    
                    if (incidenciasFiltradas.length === 0) {
                        Swal.fire({
                            icon: 'info',
                            title: 'Sin registros',
                            text: `No hay incidencias ${estadoNombre}`,
                            background: 'var(--color-bg-primary)',
                            color: 'white'
                        });
                        return;
                    }
                    
                    mostrarRegistrosIncidenciasEnSweet(
                        incidenciasFiltradas,
                        `Incidencias ${estadoNombre}`,
                        `<i class="fas ${index === 0 ? 'fa-clock' : 'fa-check-circle'}" style="color: ${index === 0 ? '#f59e0b' : '#10b981'}"></i>`
                    );
                }
            }
        }
    });
    
    canvas.style.cursor = 'pointer';
}

function renderizarTablaCategorias() {
    const datos = calcularDatosPorCategoria();
    const tbody = document.querySelector('#tablaCategoriasColaborador tbody');
    
    if (!tbody) return;
    
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Sin datos</td></tr>';
        return;
    }
    
    tbody.innerHTML = datos.map(c => `
        <tr>
            <td>${escapeHTML(c.nombre)}</td>
            <td><span class="badge-value">${c.cantidad}</span></td>
            <td>${c.porcentaje.toFixed(1)}%</td>
        </tr>
    `).join('');
}

function renderizarGraficoTiempoCategorias() {
    const datos = calcularTiempoPorCategoria();
    const canvas = document.getElementById('graficoTiempoCategorias');
    if (!canvas) return;
    
    if (graficoTiempoCategorias) {
        graficoTiempoCategorias.destroy();
    }
    
    if (datos.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Sin datos de tiempo por categoría', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    graficoTiempoCategorias = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: datos.map(d => d.nombre.length > 20 ? d.nombre.substring(0, 17) + '...' : d.nombre),
            datasets: [{
                label: 'Horas promedio de resolución',
                data: datos.map(d => d.promedio),
                backgroundColor: datos.map(d => {
                    if (d.promedio > 72) return '#ef4444';
                    if (d.promedio > 24) return '#f97316';
                    if (d.promedio > 8) return '#eab308';
                    return '#10b981';
                }),
                borderRadius: 8,
                barPercentage: 0.7,
                categoryPercentage: 0.8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: 'white', font: { size: 11 } },
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const horas = ctx.raw;
                            const dias = Math.floor(horas / 24);
                            const horasResto = horas % 24;
                            let texto = `${horas} horas`;
                            if (dias > 0) texto = `${dias} día${dias > 1 ? 's' : ''} y ${horasResto} horas`;
                            return `Tiempo promedio: ${texto} (${datos[ctx.dataIndex].count} incidencias)`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#aaa' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    title: {
                        display: true,
                        text: 'Horas',
                        color: '#aaa',
                        font: { size: 10 }
                    }
                },
                x: {
                    ticks: { color: '#aaa', maxRotation: 45, autoSkip: true },
                    grid: { display: false }
                }
            },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const categoriaNombre = datos[index].nombre;
                    const categoria = categoriasCache.find(c => c.nombre === categoriaNombre);
                    
                    if (categoria) {
                        const incidenciasFiltradas = incidenciasColaborador.filter(i => 
                            i.categoriaId === categoria.id && 
                            i.estado === 'finalizada' &&
                            i.actualizadoPorNombre === colaboradorActual.nombre
                        );
                        
                        if (incidenciasFiltradas.length === 0) {
                            Swal.fire({
                                icon: 'info',
                                title: 'Sin registros',
                                text: `No hay incidencias finalizadas en la categoría: ${categoriaNombre}`,
                                background: 'var(--color-bg-primary)',
                                color: 'white'
                            });
                            return;
                        }
                        
                        mostrarRegistrosIncidenciasEnSweet(
                            incidenciasFiltradas,
                            `Incidencias finalizadas: ${categoriaNombre}`,
                            '<i class="fas fa-tag"></i>'
                        );
                    }
                }
            }
        }
    });
    
    canvas.style.cursor = 'pointer';
}

function renderizarTablaIncidenciasRecientes() {
    const tbody = document.querySelector('#tablaIncidenciasRecientes tbody');
    const gridContainer = document.getElementById('incidenciasGrid');
    
    if (!tbody) return;
    
    const incidenciasRecientes = [...incidenciasColaborador]
        .sort((a, b) => {
            const fechaA = a.fechaInicio instanceof Date ? a.fechaInicio : new Date(a.fechaInicio);
            const fechaB = b.fechaInicio instanceof Date ? b.fechaInicio : new Date(b.fechaInicio);
            return fechaB - fechaA;
        })
        .slice(0, 10);
    
    if (incidenciasRecientes.length === 0) {
        tbody.innerHTML = '<td><td colspan="8" style="text-align:center;">No hay incidencias registradas</td></tr>';
        if (gridContainer) {
            gridContainer.innerHTML = '<div class="incidencia-card" style="text-align:center; padding:20px;">No hay incidencias registradas</div>';
        }
        return;
    }
    
    tbody.innerHTML = incidenciasRecientes.map(inc => {
        const fecha = inc.fechaInicio instanceof Date ? inc.fechaInicio.toLocaleDateString('es-MX') : (inc.fechaInicio ? new Date(inc.fechaInicio).toLocaleDateString('es-MX') : 'N/A');
        const riesgoColor = obtenerColorRiesgo(inc.nivelRiesgo);
        const riesgoTexto = obtenerNombreRiesgo(inc.nivelRiesgo);
        const estadoColor = inc.estado === 'finalizada' ? '#10b981' : '#f59e0b';
        const estadoTexto = inc.getEstadoTexto ? inc.getEstadoTexto() : (inc.estado || 'N/A');
        const detalles = inc.detalles ? (inc.detalles.length > 50 ? inc.detalles.substring(0, 50) + '...' : inc.detalles) : 'Sin detalles';
        const tienePDF = inc.pdfUrl && inc.pdfUrl.trim() !== '';
        const nombreSucursal = obtenerNombreSucursal(inc.sucursalId);
        
        let rol = '';
        if (inc.creadoPorNombre === colaboradorActual.nombre) rol = 'Creador';
        if (inc.actualizadoPorNombre === colaboradorActual.nombre) rol = rol ? 'Creador/Actualizador' : 'Actualizador';
        
        if (inc.seguimiento) {
            const tieneSeguimiento = Object.values(inc.seguimiento).some(seg => seg.usuarioNombre === colaboradorActual.nombre);
            if (tieneSeguimiento) rol = rol ? `${rol}/Seguimiento` : 'Seguimiento';
        }
        
        return `
            <tr>
                <td><i class="fas fa-hashtag"></i> <span title="${inc.id}">${inc.id.substring(0, 12)}...</span></td>
                <td><i class="fas fa-calendar-alt"></i> ${fecha}</td>
                <td><i class="fas fa-store"></i> ${escapeHTML(nombreSucursal)}</td>
                <td><span class="badge-riesgo" style="background: ${riesgoColor}20; color: ${riesgoColor};">${riesgoTexto}</span></td>
                <td><span class="badge-estado" style="background: ${estadoColor}20; color: ${estadoColor};">${estadoTexto}</span></td>
                <td>${escapeHTML(detalles)}</td>
                <td><span class="badge-rol">${rol || 'Participante'}</span></td>
                <td style="text-align: center;">
                    ${tienePDF ? 
                        `<button class="btn-pdf-mini" onclick="verPDFIncidencia('${inc.id}')"><i class="fas fa-file-pdf"></i> PDF</button>` : 
                        `<button class="btn-pdf-mini disabled" disabled><i class="fas fa-file-pdf"></i> Sin PDF</button>`
                    }
                </td>
            </tr>
        `;
    }).join('');
    
    if (gridContainer) {
        gridContainer.innerHTML = incidenciasRecientes.map(inc => {
            const fecha = inc.fechaInicio instanceof Date ? inc.fechaInicio.toLocaleDateString('es-MX') : (inc.fechaInicio ? new Date(inc.fechaInicio).toLocaleDateString('es-MX') : 'N/A');
            const riesgoColor = obtenerColorRiesgo(inc.nivelRiesgo);
            const riesgoTexto = obtenerNombreRiesgo(inc.nivelRiesgo);
            const estadoColor = inc.estado === 'finalizada' ? '#10b981' : '#f59e0b';
            const estadoTexto = inc.getEstadoTexto ? inc.getEstadoTexto() : (inc.estado || 'N/A');
            const detalles = inc.detalles ? (inc.detalles.length > 80 ? inc.detalles.substring(0, 80) + '...' : inc.detalles) : 'Sin detalles';
            const idCorto = inc.id.length > 16 ? inc.id.substring(0, 14) + '...' : inc.id;
            const tienePDF = inc.pdfUrl && inc.pdfUrl.trim() !== '';
            const nombreSucursal = obtenerNombreSucursal(inc.sucursalId);
            
            let rol = '';
            if (inc.creadoPorNombre === colaboradorActual.nombre) rol = 'Creador';
            if (inc.actualizadoPorNombre === colaboradorActual.nombre) rol = rol ? 'Creador/Actualizador' : 'Actualizador';
            
            if (inc.seguimiento) {
                const tieneSeguimiento = Object.values(inc.seguimiento).some(seg => seg.usuarioNombre === colaboradorActual.nombre);
                if (tieneSeguimiento) rol = rol ? `${rol}/Seguimiento` : 'Seguimiento';
            }
            
            return `
                <div class="incidencia-card" onclick="verDetallesIncidencia('${inc.id}')">
                    <div class="incidencia-header">
                        <span class="incidencia-id"><i class="fas fa-hashtag"></i> ${escapeHTML(idCorto)}</span>
                        <span class="incidencia-fecha"><i class="fas fa-calendar-alt"></i> ${fecha}</span>
                    </div>
                    <div class="incidencia-body">
                        <div class="incidencia-badges">
                            <span class="badge-riesgo-card" style="background: ${riesgoColor}20; color: ${riesgoColor};">${riesgoTexto}</span>
                            <span class="badge-estado-card" style="background: ${estadoColor}20; color: ${estadoColor};">${estadoTexto}</span>
                            <span class="badge-rol-card">${rol || 'Participante'}</span>
                        </div>
                        <div class="incidencia-detalles">
                            <i class="fas fa-store"></i> ${escapeHTML(nombreSucursal)}<br>
                            <i class="fas fa-file-alt"></i> ${escapeHTML(detalles)}
                        </div>
                    </div>
                    <div class="incidencia-footer">
                        ${tienePDF ? 
                            `<button class="btn-pdf-card" onclick="event.stopPropagation(); verPDFIncidencia('${inc.id}')">
                                <i class="fas fa-file-pdf"></i> Ver PDF
                            </button>` : 
                            `<button class="btn-pdf-card disabled" disabled>
                                <i class="fas fa-file-pdf"></i> Sin PDF
                            </button>`
                        }
                    </div>
                </div>
            `;
        }).join('');
    }
}

function actualizarFooter() {
    const fechaEl = document.getElementById('fechaActualizacion');
    if (fechaEl) {
        fechaEl.textContent = new Date().toLocaleString('es-MX');
    }
}

// =============================================
// OCULTAR SECCIONES SIN DATOS
// =============================================

// =============================================
// OCULTAR SECCIONES SIN DATOS
// =============================================

function ocultarSeccionesSinDatos() {
    const stats = calcularEstadisticasColaborador();
    const datosRiesgo = calcularDatosPorRiesgo();
    const datosEstado = calcularDatosPorEstado();
    const datosCategorias = calcularDatosPorCategoria();
    const datosTiempoCategorias = calcularTiempoPorCategoria();
    const evolucionSemanal = calcularEvolucionSemanal();
    
    // Obtener todos los contenedores principales
    const primeraFila = document.querySelector('.charts-row:first-child');
    const segundaFila = document.querySelectorAll('.charts-row')[1];
    const terceraFila = document.querySelectorAll('.charts-row')[2];
    
    // Evaluar visibilidad de cada card
    const tieneEvolucion = evolucionSemanal.labels.length > 0 && 
        (evolucionSemanal.reportadas.some(v => v > 0) || 
         evolucionSemanal.actualizadas.some(v => v > 0) || 
         evolucionSemanal.seguimientos.some(v => v > 0));
    
    const tieneRiesgo = datosRiesgo.data.length > 0;
    const tieneEstado = (datosEstado.pendientes + datosEstado.finalizadas) > 0;
    const tieneCategorias = datosCategorias.length > 0;
    const tieneTiempoCategorias = datosTiempoCategorias.length > 0;
    const tieneIncidencias = stats.total > 0;
    
    // Ocultar/mostrar KPIs principales
    const kpisGrid = document.querySelector('.kpis-grid');
    if (kpisGrid) {
        kpisGrid.style.display = stats.total === 0 ? 'none' : 'grid';
    }
    
    // Ocultar/mostrar KPIs secundarios
    const kpisSecundario = document.querySelector('.kpis-grid-secundario');
    if (kpisSecundario) {
        kpisSecundario.style.display = stats.total === 0 ? 'none' : 'grid';
    }
    
    // Ocultar/mostrar las filas completas si no tienen contenido visible
    if (primeraFila) {
        if (!tieneEvolucion && !tieneRiesgo) {
            primeraFila.style.display = 'none';
        } else {
            primeraFila.style.display = 'grid';
            if (!tieneEvolucion || !tieneRiesgo) {
                primeraFila.style.gridTemplateColumns = '1fr';
            } else {
                primeraFila.style.gridTemplateColumns = 'repeat(2, 1fr)';
            }
        }
    }
    
    if (segundaFila) {
        if (!tieneEstado && !tieneCategorias) {
            segundaFila.style.display = 'none';
        } else {
            segundaFila.style.display = 'grid';
            if (!tieneEstado || !tieneCategorias) {
                segundaFila.style.gridTemplateColumns = '1fr';
            } else {
                segundaFila.style.gridTemplateColumns = 'repeat(2, 1fr)';
            }
        }
    }
    
    if (terceraFila) {
        if (!tieneTiempoCategorias) {
            terceraFila.style.display = 'none';
        } else {
            terceraFila.style.display = 'grid';
            terceraFila.style.gridTemplateColumns = '1fr';
        }
    }
    
    // Ocultar/mostrar card de incidencias recientes
    const cardIncidencias = document.querySelector('.card.full-width');
    if (cardIncidencias) {
        cardIncidencias.style.display = tieneIncidencias ? 'block' : 'none';
    }
    
    // Ocultar/mostrar cards individualmente dentro de las filas
    const cardEvolucion = primeraFila?.querySelector('.card:first-child');
    const cardRiesgo = primeraFila?.querySelector('.card:last-child');
    const cardEstado = segundaFila?.querySelector('.card:first-child');
    const cardCategorias = segundaFila?.querySelector('.card:last-child');
    const cardTiempo = terceraFila?.querySelector('.card');
    
    if (cardEvolucion) cardEvolucion.style.display = tieneEvolucion ? 'block' : 'none';
    if (cardRiesgo) cardRiesgo.style.display = tieneRiesgo ? 'block' : 'none';
    if (cardEstado) cardEstado.style.display = tieneEstado ? 'block' : 'none';
    if (cardCategorias) cardCategorias.style.display = tieneCategorias ? 'block' : 'none';
    if (cardTiempo) cardTiempo.style.display = tieneTiempoCategorias ? 'block' : 'none';
}

// =============================================
// MANEJO DE CAMBIO DE COLABORADOR
// =============================================

function cargarSelectorColaboradores() {
    const selector = document.getElementById('selectorColaborador');
    if (!selector) return;
    
    if (!colaboradoresDisponibles || colaboradoresDisponibles.length === 0) {
        selector.innerHTML = '<option value="">No hay colaboradores disponibles</option>';
        return;
    }
    
    selector.innerHTML = '<option value="">-- Seleccionar colaborador --</option>';
    colaboradoresDisponibles.forEach(col => {
        const option = document.createElement('option');
        option.value = col.nombre;
        option.textContent = col.nombre;
        selector.appendChild(option);
    });
    
    selector.addEventListener('change', (e) => {
        const nuevoColaboradorNombre = e.target.value;
        if (nuevoColaboradorNombre && nuevoColaboradorNombre !== colaboradorActual?.nombre) {
            cambiarColaborador(nuevoColaboradorNombre);
        }
    });
}

async function cambiarColaborador(nuevoColaboradorNombre) {
    try {
        Swal.fire({
            title: 'Cambiando colaborador...',
            text: 'Cargando datos del colaborador',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
        
        const nuevaUrl = `${window.location.pathname}?id=${encodeURIComponent(nuevoColaboradorNombre)}`;
        window.history.pushState({}, '', nuevaUrl);
        
        colaboradorId = nuevoColaboradorNombre;
        colaboradorActual = colaboradoresDisponibles.find(c => c.nombre === nuevoColaboradorNombre);
        
        if (!colaboradorActual) {
            colaboradorActual = { nombre: nuevoColaboradorNombre, email: '' };
        }
        
        document.getElementById('colaboradorNombre').textContent = colaboradorActual.nombre;
        document.getElementById('colaboradorRol').innerHTML = `<i class="fas fa-user-tag"></i> Colaborador`;
        document.getElementById('colaboradorEmail').innerHTML = `<i class="fas fa-envelope"></i> ${colaboradorActual.email || 'Correo no disponible'}`;
        
        cargarIncidenciasColaborador();
        
        actualizarKPIs();
        renderizarGraficoEvolucionSemanal();
        renderizarGraficoRiesgoColaborador();
        renderizarGraficoEstadoColaborador();
        renderizarTablaCategorias();
        renderizarGraficoTiempoCategorias();
        renderizarTablaIncidenciasRecientes();
        actualizarFooter();
        ocultarSeccionesSinDatos();
        
        Swal.close();
        Swal.fire({
            icon: 'success',
            title: 'Colaborador cambiado',
            text: `Ahora visualizando: ${colaboradorActual.nombre}`,
            timer: 2000,
            showConfirmButton: false,
            toast: true,
            position: 'top-end'
        });
        
    } catch (error) {
        console.error('Error cambiando colaborador:', error);
        Swal.close();
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo cargar el nuevo colaborador: ' + error.message
        });
        
        const selector = document.getElementById('selectorColaborador');
        if (selector && colaboradorActual) {
            selector.value = colaboradorActual.nombre;
        }
    }
}

// =============================================
// FUNCIONES PARA SWEETALERTS
// =============================================

function mostrarRegistrosIncidenciasEnSweet(incidencias, titulo, icono) {
    if (!incidencias || incidencias.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin registros',
            text: 'No hay incidencias para mostrar',
            background: 'var(--color-bg-primary)',
            color: 'white'
        });
        return;
    }
    
    const totalCriticas = incidencias.filter(i => i.nivelRiesgo === 'critico').length;
    const totalAltas = incidencias.filter(i => i.nivelRiesgo === 'alto').length;
    const totalPendientes = incidencias.filter(i => i.estado === 'pendiente').length;
    const totalFinalizadas = incidencias.filter(i => i.estado === 'finalizada').length;
    const incidenciasMostrar = incidencias.slice(0, 15);
    const hayMas = incidencias.length > 15;
    
    let registrosHtml = `
        <div class="swal-resumen-stats">
            <div class="swal-stats-grid">
                <div class="swal-stat-item" style="border-left-color: #8b5cf6;">
                    <span class="swal-stat-label">Total incidencias</span>
                    <span class="swal-stat-value">${incidencias.length}</span>
                </div>
                <div class="swal-stat-item" style="border-left-color: #ef4444;">
                    <span class="swal-stat-label">Críticas + Altas</span>
                    <span class="swal-stat-value" style="color: #ef4444;">${totalCriticas + totalAltas}</span>
                </div>
                <div class="swal-stat-item" style="border-left-color: #f59e0b;">
                    <span class="swal-stat-label">Pendientes</span>
                    <span class="swal-stat-value" style="color: #f59e0b;">${totalPendientes}</span>
                </div>
                <div class="swal-stat-item" style="border-left-color: #10b981;">
                    <span class="swal-stat-label">Finalizadas</span>
                    <span class="swal-stat-value" style="color: #10b981;">${totalFinalizadas}</span>
                </div>
            </div>
        </div>
        <div class="swal-registros-list">
    `;
    
    incidenciasMostrar.forEach(inc => {
        const fecha = inc.fechaInicio instanceof Date 
            ? inc.fechaInicio.toLocaleDateString('es-MX') 
            : (inc.fechaInicio ? new Date(inc.fechaInicio).toLocaleDateString('es-MX') : 'N/A');
        
        let estadoColor = '#6c757d', estadoIcon = 'fa-circle';
        if (inc.estado === 'finalizada') { 
            estadoColor = '#10b981'; 
            estadoIcon = 'fa-check-circle'; 
        } else if (inc.estado === 'pendiente') { 
            estadoColor = '#f59e0b'; 
            estadoIcon = 'fa-clock'; 
        }
        
        let riesgoColor = '#6c757d', riesgoIcon = 'fa-chart-line';
        const riesgoTexto = obtenerNombreRiesgo(inc.nivelRiesgo);
        const nivelConfig = nivelesRiesgoCache.find(n => n.id === inc.nivelRiesgo);
        if (nivelConfig) {
            riesgoColor = nivelConfig.color;
            if (inc.nivelRiesgo === 'critico') riesgoIcon = 'fa-exclamation-triangle';
            else if (inc.nivelRiesgo === 'alto') riesgoIcon = 'fa-exclamation-circle';
            else if (inc.nivelRiesgo === 'medio') riesgoIcon = 'fa-chart-simple';
            else if (inc.nivelRiesgo === 'bajo') riesgoIcon = 'fa-check';
        }
        
        const detalles = inc.detalles 
            ? (inc.detalles.length > 80 ? inc.detalles.substring(0, 80) + '...' : inc.detalles) 
            : 'Sin detalles';
        
        const categoriaNombre = obtenerNombreCategoria(inc.categoriaId);
        const sucursalNombre = obtenerNombreSucursal(inc.sucursalId);
        
        registrosHtml += `
            <div class="swal-registro-card" data-incidencia-id="${inc.id}">
                <div class="swal-card-header">
                    <span class="swal-id"><i class="fas fa-hashtag"></i> ${escapeHTML(inc.id)}</span>
                    <span class="swal-fecha"><i class="fas fa-calendar-alt"></i> ${fecha}</span>
                </div>
                <div class="swal-card-body">
                    <div class="swal-info-principal">
                        <div class="swal-sucursal">
                            <i class="fas fa-store"></i> ${escapeHTML(sucursalNombre || 'Sin asignar')}
                        </div>
                        <div class="swal-tipo-evento">
                            <i class="fas ${riesgoIcon}" style="color: ${riesgoColor};"></i> ${riesgoTexto}
                            <span class="swal-estado-badge" style="margin-left: 8px; color: ${estadoColor};">
                                <i class="fas ${estadoIcon}"></i> ${inc.estado ? inc.estado.charAt(0).toUpperCase() + inc.estado.slice(1) : 'N/A'}
                            </span>
                        </div>
                    </div>
                    <div class="swal-montos">
                        <span class="swal-monto-perdido"><i class="fas fa-tag"></i> ${escapeHTML(categoriaNombre)}</span>
                        <span class="swal-monto-recuperado"><i class="fas fa-user"></i> ${escapeHTML(inc.creadoPorNombre || 'N/A')}</span>
                    </div>
                </div>
                <div class="swal-card-footer">
                    <div class="swal-narracion">
                        <i class="fas fa-file-alt"></i>
                        <span>${escapeHTML(detalles)}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    if (hayMas) {
        registrosHtml += `<div class="swal-mas-registros"><i class="fas fa-ellipsis-h"></i> y ${incidencias.length - 15} incidencias más.</div>`;
    }
    
    registrosHtml += `</div>`;
    
    Swal.fire({
        title: `${icono || ''} ${titulo}`,
        html: registrosHtml,
        width: '880px',
        background: 'transparent',
        showConfirmButton: true,
        confirmButtonText: '<i class="fas fa-check"></i> Cerrar',
        confirmButtonColor: '#28a745',
        customClass: { 
            popup: 'swal2-popup-custom', 
            title: 'swal2-title-custom', 
            confirmButton: 'swal2-confirm' 
        },
        backdrop: `rgba(0,0,0,0.8) left top no-repeat`
    });
}

// =============================================
// FUNCIONES GLOBALES
// =============================================

window.verDetallesIncidencia = function(incidenciaId) {
    window.location.href = `/usuarios/administrador/verIncidencias/verIncidencias.html?id=${incidenciaId}`;
};

window.verPDFIncidencia = async function(incidenciaId) {
    try {
        const incidencia = incidenciasColaborador.find(i => i.id === incidenciaId);
        
        if (!incidencia) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se encontró la incidencia'
            });
            return;
        }
        
        if (!incidencia.pdfUrl || incidencia.pdfUrl.trim() === '') {
            Swal.fire({
                icon: 'warning',
                title: 'PDF no disponible',
                text: 'Esta incidencia aún no tiene un PDF asociado.',
                confirmButtonText: 'Entendido'
            });
            return;
        }
        
        window.open(incidencia.pdfUrl, '_blank');
        
    } catch (error) {
        console.error('Error al abrir PDF:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo abrir el PDF: ' + error.message
        });
    }
};

// =============================================
// FUNCIONES PARA PDF
// =============================================

async function capturarGraficasColaborador() {
    const graficas = {
        evolucion: null,
        riesgo: null,
        estado: null,
        tiempoCategorias: null
    };
    
    const canvasEvolucion = document.getElementById('graficoEvolucionMensual');
    if (canvasEvolucion && canvasEvolucion instanceof HTMLCanvasElement) {
        try {
            const scale = 3;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvasEvolucion.width * scale;
            tempCanvas.height = canvasEvolucion.height * scale;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.imageSmoothingEnabled = true;
            tempCtx.imageSmoothingQuality = 'high';
            tempCtx.drawImage(canvasEvolucion, 0, 0, tempCanvas.width, tempCanvas.height);
            graficas.evolucion = tempCanvas.toDataURL('image/png', 1.0);
        } catch (error) {
            console.error('Error capturando gráfica de evolución:', error);
        }
    }
    
    const canvasRiesgo = document.getElementById('graficoRiesgoColaborador');
    if (canvasRiesgo && canvasRiesgo instanceof HTMLCanvasElement) {
        try {
            const scale = 3;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvasRiesgo.width * scale;
            tempCanvas.height = canvasRiesgo.height * scale;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.imageSmoothingEnabled = true;
            tempCtx.imageSmoothingQuality = 'high';
            tempCtx.drawImage(canvasRiesgo, 0, 0, tempCanvas.width, tempCanvas.height);
            graficas.riesgo = tempCanvas.toDataURL('image/png', 1.0);
        } catch (error) {
            console.error('Error capturando gráfica de riesgo:', error);
        }
    }
    
    const canvasEstado = document.getElementById('graficoEstadoColaborador');
    if (canvasEstado && canvasEstado instanceof HTMLCanvasElement) {
        try {
            const scale = 3;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvasEstado.width * scale;
            tempCanvas.height = canvasEstado.height * scale;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.imageSmoothingEnabled = true;
            tempCtx.imageSmoothingQuality = 'high';
            tempCtx.drawImage(canvasEstado, 0, 0, tempCanvas.width, tempCanvas.height);
            graficas.estado = tempCanvas.toDataURL('image/png', 1.0);
        } catch (error) {
            console.error('Error capturando gráfica de estado:', error);
        }
    }
    
    const canvasTiempo = document.getElementById('graficoTiempoCategorias');
    if (canvasTiempo && canvasTiempo instanceof HTMLCanvasElement) {
        try {
            const scale = 3;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvasTiempo.width * scale;
            tempCanvas.height = canvasTiempo.height * scale;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.imageSmoothingEnabled = true;
            tempCtx.imageSmoothingQuality = 'high';
            tempCtx.drawImage(canvasTiempo, 0, 0, tempCanvas.width, tempCanvas.height);
            graficas.tiempoCategorias = tempCanvas.toDataURL('image/png', 1.0);
        } catch (error) {
            console.error('Error capturando gráfica de tiempo:', error);
        }
    }
    
    return graficas;
}

function cambiarGraficasAModoPDF() {
    const charts = [graficoEvolucionMensual, graficoRiesgoColaborador, graficoEstadoColaborador, graficoTiempoCategorias];
    
    charts.forEach(chart => {
        if (chart && chart.options) {
            if (chart.options.scales) {
                if (chart.options.scales.y && chart.options.scales.y.ticks) {
                    chart.options.scales.y.ticks.color = '#000000';
                }
                if (chart.options.scales.x && chart.options.scales.x.ticks) {
                    chart.options.scales.x.ticks.color = '#000000';
                }
            }
            if (chart.options.plugins && chart.options.plugins.legend) {
                if (chart.options.plugins.legend.labels) {
                    chart.options.plugins.legend.labels.color = '#000000';
                }
            }
            chart.update();
        }
    });
}

function restaurarGraficasAModoNormal() {
    const charts = [graficoEvolucionMensual, graficoRiesgoColaborador, graficoEstadoColaborador, graficoTiempoCategorias];
    
    charts.forEach(chart => {
        if (chart && chart.options) {
            if (chart.options.scales) {
                if (chart.options.scales.y && chart.options.scales.y.ticks) {
                    chart.options.scales.y.ticks.color = 'white';
                }
                if (chart.options.scales.x && chart.options.scales.x.ticks) {
                    chart.options.scales.x.ticks.color = 'white';
                }
            }
            if (chart.options.plugins && chart.options.plugins.legend) {
                if (chart.options.plugins.legend.labels) {
                    chart.options.plugins.legend.labels.color = 'white';
                }
            }
            chart.update();
        }
    });
}

// =============================================
// INICIALIZACIÓN PRINCIPAL
// =============================================

async function inicializarDetalleColaborador() {
    try {
        await obtenerDatosOrganizacion();
        await inicializarManagers();
        await cargarCategorias();
        await cargarSucursales();
        await cargarNivelesRiesgo();
        
        const colaboradorCargado = await cargarColaborador();
        if (!colaboradorCargado) return;
        
        await cargarTodasLasIncidencias();
        cargarIncidenciasColaborador();
        
        cargarSelectorColaboradores();
        
        actualizarKPIs();
        renderizarGraficoEvolucionSemanal();
        renderizarGraficoRiesgoColaborador();
        renderizarGraficoEstadoColaborador();
        renderizarTablaCategorias();
        renderizarGraficoTiempoCategorias();
        renderizarTablaIncidenciasRecientes();
        actualizarFooter();
        ocultarSeccionesSinDatos();
        
        document.getElementById('btnVolver').addEventListener('click', () => {
            window.location.href = '/usuarios/administrador/estadisticas/estadisticas.html';
        });
        
        const btnPDF = document.getElementById('btnPDFColaborador');
        if (btnPDF) {
            btnPDF.addEventListener('click', async () => {
                try {
                    Swal.fire({
                        title: 'Generando PDF...',
                        text: 'Preparando el reporte del colaborador',
                        allowOutsideClick: false,
                        didOpen: () => {
                            Swal.showLoading();
                        }
                    });
                    
                    cambiarGraficasAModoPDF();
                    
                    await new Promise(resolve => setTimeout(resolve, 300));
                    
                    const chartImages = await capturarGraficasColaborador();
                    const stats = calcularEstadisticasColaborador();
                    const datosRiesgo = calcularDatosPorRiesgo();
                    const datosEstado = calcularDatosPorEstado();
                    const datosCategorias = calcularDatosPorCategoria();
                    const datosTiempoCategorias = calcularTiempoPorCategoria();
                    const evolucionSemanal = calcularEvolucionSemanal();

                    
                    try {
                        const { generadorPDFColaboradorDetalle } = await import('/components/pdfEstadisticasUsuarios.js');
                        
                        generadorPDFColaboradorDetalle.configurar({
                            organizacionActual: organizacionActual,
                            colaboradorActual: colaboradorActual,
                            incidenciasColaborador: incidenciasColaborador,
                            stats: stats,
                            datosRiesgo: datosRiesgo,
                            datosEstado: datosEstado,
                            datosCategorias: datosCategorias,
                            datosTiempoCategorias: datosTiempoCategorias,
                            evolucionSemanal: evolucionSemanal,
                            chartImages: chartImages
                        });
                        
                                               await generadorPDFColaboradorDetalle.generarReporte();
                    } catch (pdfError) {
                        console.warn('Componente PDF no disponible:', pdfError);
                        Swal.fire({
                            icon: 'warning',
                            title: 'PDF no disponible',
                            text: 'El módulo de generación de PDF no está disponible temporalmente.',
                            background: 'var(--color-bg-primary)',
                            color: 'white'
                        });
                    }
                    
                    restaurarGraficasAModoNormal();
                    Swal.close();
                    
                } catch (error) {
                    console.error('Error generando PDF:', error);
                    restaurarGraficasAModoNormal();
                    Swal.close();
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'No se pudo generar el PDF: ' + error.message
                    });
                }
            });
        }
        
    } catch (error) {
        console.error('Error inicializando detalle:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo cargar la página: ' + error.message
        });
    }
}

// Iniciar
document.addEventListener('DOMContentLoaded', inicializarDetalleColaborador);