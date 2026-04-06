// estadisticasExtravios.js - Dashboard de Pérdidas y Recuperaciones
// VERSIÓN CON FILTROS MANUALES - Sin auto-refresco
// OPTIMIZADO - Sin scroll horizontal, gráficas mejoradas y CLICKEABLES
// CON EXPORTACIÓN A PDF

import { MercanciaPerdidaManager } from '/clases/incidenciaRecuperacion.js';

// =============================================
// VARIABLES GLOBALES
// =============================================
let mercanciaManager = null;
let organizacionActual = null;
let sucursalesCache = [];
let datosActuales = {
    registros: [],
    estadisticas: null
};

// Gráficas
let graficoTipoEvento = null;
let graficoEvolucionMensual = null;
let graficoTopSucursales = null;
let graficoComparativa = null;

// Almacenes para datos clickeables
window.registrosPorTipo = {};
window.registrosPorMes = {};
window.registrosPorSucursal = {};

// Configuración de colores para gráficas
const COLORS = {
    rojo: '#ef4444',
    rojoClaro: 'rgba(239, 68, 68, 0.1)',
    verde: '#10b981',
    verdeClaro: 'rgba(16, 185, 129, 0.1)',
    naranja: '#f59e0b',
    azul: '#3b82f6',
    morado: '#8b5cf6',
    rosa: '#ec4899',
    celeste: '#06b6d4',
    gris: '#6b7280'
};

// =============================================
// FUNCIÓN PARA OBTENER USUARIO ACTUAL
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
                correo: adminData.correoElectronico || '',
                email: adminData.correoElectronico || ''
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
                correo: userData.correo || userData.email || '',
                email: userData.correo || userData.email || ''
            };
        }

        return null;
    } catch (error) {
        console.error('Error obteniendo usuario actual:', error);
        return null;
    }
}

// =============================================
// OBTENER DATOS DE ORGANIZACIÓN
// =============================================
async function obtenerDatosOrganizacion() {
    try {
        const usuario = obtenerUsuarioActual();
        if (usuario) {
            organizacionActual = {
                nombre: usuario.organizacion || 'Mi Empresa',
                camelCase: usuario.organizacionCamelCase || ''
            };
            console.log('Organización:', organizacionActual);
            return;
        }
        
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
        
        organizacionActual = {
            nombre: userData.organizacion || adminInfo.organizacion || 'Mi Empresa',
            camelCase: userData.organizacionCamelCase || adminInfo.organizacionCamelCase || ''
        };
    } catch (error) {
        organizacionActual = { nombre: 'Mi Empresa', camelCase: '' };
    }
}

// =============================================
// CARGAR SUCURSALES PARA FILTRO
// =============================================
async function cargarSucursales() {
    try {
        if (!organizacionActual?.camelCase) {
            console.warn('No hay organización configurada');
            return;
        }
        
        const { SucursalManager } = await import('/clases/sucursal.js');
        const sucursalManager = new SucursalManager();
        
        const sucursales = await sucursalManager.getSucursalesByOrganizacion(
            organizacionActual.camelCase
        );
        
        sucursalesCache = sucursales.map(s => s.nombre);
        sucursalesCache = [...new Set(sucursalesCache)];
        
        const filtroSucursal = document.getElementById('filtroSucursal');
        if (filtroSucursal) {
            filtroSucursal.innerHTML = '<option value="todas">Todas las sucursales</option>';
            sucursalesCache.forEach(suc => {
                const option = document.createElement('option');
                option.value = suc;
                option.textContent = suc.length > 40 ? suc.substring(0, 37) + '...' : suc;
                filtroSucursal.appendChild(option);
            });
        }
        
        console.log(`${sucursalesCache.length} sucursales cargadas`);
        
    } catch (error) {
        console.error('Error cargando sucursales:', error);
        sucursalesCache = [];
        
        const filtroSucursal = document.getElementById('filtroSucursal');
        if (filtroSucursal) {
            filtroSucursal.innerHTML = '<option value="todas">Todas las sucursales</option>';
        }
    }
}

// =============================================
// CARGAR REGISTROS CON FILTROS
// =============================================
async function cargarRegistrosConFiltros() {
    if (!organizacionActual?.camelCase || !mercanciaManager) {
        console.error('No hay organización o manager configurado');
        mostrarError('No se pudo inicializar el módulo de datos');
        return;
    }
    
    try {
        mostrarLoading();
        
        const sucursal = document.getElementById('filtroSucursal')?.value || 'todas';
        const fechaInicio = document.getElementById('fechaInicio')?.value;
        const fechaFin = document.getElementById('fechaFin')?.value;
        const tipoEvento = document.getElementById('filtroTipoEvento')?.value || 'todos';
        
        const todosRegistros = await mercanciaManager.getRegistrosByOrganizacion(
            organizacionActual.camelCase
        );
        
        let registrosFiltrados = todosRegistros;
        
        // Filtro por sucursal
        if (sucursal !== 'todas') {
            registrosFiltrados = registrosFiltrados.filter(r => 
                r.nombreEmpresaCC === sucursal
            );
        }
        
        // Filtro por fecha
        if (fechaInicio) {
            const fechaInicioObj = new Date(fechaInicio);
            fechaInicioObj.setHours(0, 0, 0, 0);
            registrosFiltrados = registrosFiltrados.filter(r => {
                const fechaRegistro = r.fecha ? new Date(r.fecha) : null;
                return fechaRegistro && fechaRegistro >= fechaInicioObj;
            });
        }
        
        if (fechaFin) {
            const fechaFinObj = new Date(fechaFin);
            fechaFinObj.setHours(23, 59, 59, 999);
            registrosFiltrados = registrosFiltrados.filter(r => {
                const fechaRegistro = r.fecha ? new Date(r.fecha) : null;
                return fechaRegistro && fechaRegistro <= fechaFinObj;
            });
        }
        
        // Filtro por tipo de evento
        if (tipoEvento !== 'todos') {
            registrosFiltrados = registrosFiltrados.filter(r => 
                r.tipoEvento === tipoEvento
            );
        }
        
        datosActuales.registros = registrosFiltrados;
        
        const estadisticas = calcularEstadisticas(registrosFiltrados);
        datosActuales.estadisticas = estadisticas;
        
        mostrarKPIs(estadisticas);
        actualizarGraficas(registrosFiltrados, estadisticas);
        actualizarTablaResumen(registrosFiltrados);
        mostrarContenedores();
        
        document.getElementById('fechaActualizacion').textContent = new Date().toLocaleString('es-MX');
        
    } catch (error) {
        console.error('Error cargando registros con filtros:', error);
        mostrarError('No se pudieron cargar los datos: ' + error.message);
    }
}

// =============================================
// CALCULAR ESTADÍSTICAS
// =============================================
function calcularEstadisticas(registros) {
    if (!registros || registros.length === 0) {
        return {
            totalPerdido: 0,
            totalRecuperado: 0,
            totalNeto: 0,
            porcentajeRecuperacion: 0,
            totalEventos: 0,
            promedioPerdida: 0
        };
    }
    
    let totalPerdido = 0;
    let totalRecuperado = 0;
    
    registros.forEach(r => {
        totalPerdido += r.montoPerdido || 0;
        totalRecuperado += r.montoRecuperado || 0;
    });
    
    const totalNeto = totalPerdido - totalRecuperado;
    const porcentajeRecuperacion = totalPerdido > 0 
        ? (totalRecuperado / totalPerdido) * 100 
        : 0;
    const promedioPerdida = registros.length > 0 
        ? totalPerdido / registros.length 
        : 0;
    
    return {
        totalPerdido,
        totalRecuperado,
        totalNeto,
        porcentajeRecuperacion,
        totalEventos: registros.length,
        promedioPerdida
    };
}

// =============================================
// MOSTRAR KPIs
// =============================================
function mostrarKPIs(estadisticas) {
    const formatter = new Intl.NumberFormat('es-MX', { 
        style: 'currency', 
        currency: 'MXN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    document.getElementById('totalPerdidas').textContent = formatter.format(estadisticas.totalPerdido);
    document.getElementById('totalRecuperado').textContent = formatter.format(estadisticas.totalRecuperado);
    document.getElementById('totalNeto').textContent = formatter.format(estadisticas.totalNeto);
    document.getElementById('porcentajeRecuperacion').textContent = `${estadisticas.porcentajeRecuperacion.toFixed(2)}%`;
    document.getElementById('totalEventos').textContent = estadisticas.totalEventos;
    document.getElementById('promedioPerdida').textContent = formatter.format(estadisticas.promedioPerdida);
}

// =============================================
// ACTUALIZAR GRÁFICAS
// =============================================
function actualizarGraficas(registros, estadisticas) {
    if (!registros || registros.length === 0) {
        actualizarGraficaVacia();
        return;
    }
    
    actualizarGraficoTipoEvento(registros);
    actualizarGraficoEvolucionMensual(registros);
    actualizarGraficoTopSucursales(registros);
    actualizarGraficoComparativa(estadisticas);
}

// =============================================
// GRÁFICA POR TIPO DE EVENTO (Donut CLICKEABLE)
// =============================================
function actualizarGraficoTipoEvento(registros) {
    const tipos = {
        'robo': 0,
        'extravio': 0,
        'accidente': 0,
        'otro': 0
    };
    
    // Guardar registros por tipo para el click
    window.registrosPorTipo = {
        'robo': [],
        'extravio': [],
        'accidente': [],
        'otro': []
    };
    
    const nombresTipos = {
        'robo': 'Robo',
        'extravio': 'Extravío',
        'accidente': 'Accidente',
        'otro': 'Otro'
    };
    
    const colores = {
        'robo': COLORS.rojo,
        'extravio': COLORS.naranja,
        'accidente': COLORS.azul,
        'otro': COLORS.morado
    };
    
    // Agrupar registros por tipo y sumar montos
    registros.forEach(r => {
        const tipo = r.tipoEvento || 'otro';
        tipos[tipo] = (tipos[tipo] || 0) + (r.montoPerdido || 0);
        window.registrosPorTipo[tipo].push(r);
    });
    
    const ctx = document.getElementById('graficoTipoEvento').getContext('2d');
    const labels = Object.keys(tipos).map(k => nombresTipos[k] || k);
    const data = Object.values(tipos);
    const backgroundColors = Object.keys(tipos).map(k => colores[k] || COLORS.gris);
    
    if (graficoTipoEvento) {
        graficoTipoEvento.data.labels = labels;
        graficoTipoEvento.data.datasets[0].data = data;
        graficoTipoEvento.data.datasets[0].backgroundColor = backgroundColors;
        graficoTipoEvento.update();
    } else {
        graficoTipoEvento = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: backgroundColors,
                    borderWidth: 0,
                    hoverOffset: 15,
                    cutout: '65%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                onClick: (event, activeElements) => {
                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const tipoKey = Object.keys(tipos)[index];
                        const tipoNombre = nombresTipos[tipoKey];
                        const registrosTipo = window.registrosPorTipo[tipoKey] || [];
                        
                        if (registrosTipo.length === 0) {
                            Swal.fire({
                                icon: 'info',
                                title: 'Sin registros',
                                text: `No hay registros de tipo ${tipoNombre}`,
                                background: 'var(--color-bg-primary)',
                                color: 'white'
                            });
                            return;
                        }
                        
                        mostrarRegistrosEnSweet(registrosTipo, `Registros de tipo: ${tipoNombre}`, `<i class="fas fa-tag"></i> ${tipoNombre}`);
                    }
                },
                plugins: {
                    legend: { 
                        labels: { color: 'white', font: { size: 11, family: "'Rajdhani', sans-serif" } }, 
                        position: 'bottom',
                        rtl: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                                const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
                                return `${ctx.label}: ${formatter.format(ctx.raw)} (${pct}%)`;
                            }
                        },
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: '#fff',
                        bodyColor: '#ddd'
                    }
                }
            }
        });
    }
}

// =============================================
// GRÁFICA DE EVOLUCIÓN MENSUAL (Línea CLICKEABLE)
// =============================================
function actualizarGraficoEvolucionMensual(registros) {
    const meses = {};
    const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    // Guardar registros por mes para el click
    window.registrosPorMes = {};
    
    registros.forEach(r => {
        if (r.fecha) {
            const fecha = new Date(r.fecha);
            const mesKey = `${fecha.getFullYear()}-${fecha.getMonth() + 1}`;
            const mesNombre = `${mesesNombres[fecha.getMonth()]} ${fecha.getFullYear()}`;
            
            if (!meses[mesKey]) {
                meses[mesKey] = {
                    nombre: mesNombre,
                    perdido: 0,
                    recuperado: 0
                };
                window.registrosPorMes[mesKey] = [];
            }
            meses[mesKey].perdido += r.montoPerdido || 0;
            meses[mesKey].recuperado += r.montoRecuperado || 0;
            window.registrosPorMes[mesKey].push(r);
        }
    });
    
    const mesesOrdenados = Object.keys(meses).sort();
    const labels = mesesOrdenados.map(m => meses[m].nombre);
    const perdidosData = mesesOrdenados.map(m => meses[m].perdido);
    const recuperadosData = mesesOrdenados.map(m => meses[m].recuperado);
    
    const ctx = document.getElementById('graficoEvolucionMensual').getContext('2d');
    
    if (graficoEvolucionMensual) {
        graficoEvolucionMensual.data.labels = labels;
        graficoEvolucionMensual.data.datasets[0].data = perdidosData;
        graficoEvolucionMensual.data.datasets[1].data = recuperadosData;
        graficoEvolucionMensual.update();
    } else {
        graficoEvolucionMensual = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Pérdidas',
                        data: perdidosData,
                        borderColor: COLORS.rojo,
                        backgroundColor: COLORS.rojoClaro,
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: COLORS.rojo,
                        pointBorderColor: '#fff',
                        pointRadius: 5,
                        pointHoverRadius: 8,
                        borderWidth: 2
                    },
                    {
                        label: 'Recuperaciones',
                        data: recuperadosData,
                        borderColor: COLORS.verde,
                        backgroundColor: COLORS.verdeClaro,
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: COLORS.verde,
                        pointBorderColor: '#fff',
                        pointRadius: 5,
                        pointHoverRadius: 8,
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                onClick: (event, activeElements) => {
                    if (activeElements.length > 0) {
                        const datasetIndex = activeElements[0].datasetIndex;
                        const index = activeElements[0].index;
                        const mesKey = mesesOrdenados[index];
                        const registrosMes = window.registrosPorMes[mesKey] || [];
                        const mesNombre = meses[mesKey]?.nombre || 'Mes desconocido';
                        const tipo = datasetIndex === 0 ? 'Pérdidas' : 'Recuperaciones';
                        
                        if (registrosMes.length === 0) {
                            Swal.fire({
                                icon: 'info',
                                title: 'Sin registros',
                                text: `No hay registros para ${mesNombre}`,
                                background: 'var(--color-bg-primary)',
                                color: 'white'
                            });
                            return;
                        }
                        
                        mostrarRegistrosEnSweet(registrosMes, `Registros de ${mesNombre}`, `<i class="fas fa-calendar-alt"></i> ${mesNombre}`);
                    }
                },
                plugins: {
                    legend: { labels: { color: 'white', font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
                                return `${ctx.dataset.label}: ${formatter.format(ctx.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: (value) => {
                                const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact' });
                                return formatter.format(value);
                            },
                            color: '#aaa'
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: {
                        ticks: { color: '#aaa', maxRotation: 45, minRotation: 45, autoSkip: true },
                        grid: { display: false }
                    }
                }
            }
        });
    }
}

// =============================================
// GRÁFICA TOP SUCURSALES (Barras horizontales CLICKEABLES)
// =============================================
function actualizarGraficoTopSucursales(registros) {
    const sucursalesMap = {};
    
    // Guardar registros por sucursal para el click
    window.registrosPorSucursal = {};
    
    registros.forEach(r => {
        const sucursal = r.nombreEmpresaCC || 'Sin asignar';
        if (!sucursalesMap[sucursal]) {
            sucursalesMap[sucursal] = {
                perdido: 0,
                recuperado: 0,
                eventos: 0
            };
            window.registrosPorSucursal[sucursal] = [];
        }
        sucursalesMap[sucursal].perdido += r.montoPerdido || 0;
        sucursalesMap[sucursal].recuperado += r.montoRecuperado || 0;
        sucursalesMap[sucursal].eventos += 1;
        window.registrosPorSucursal[sucursal].push(r);
    });
    
    const sucursalesArray = Object.entries(sucursalesMap)
        .map(([nombre, datos]) => ({ nombre, ...datos }))
        .sort((a, b) => b.perdido - a.perdido)
        .slice(0, 8);
    
    const labels = sucursalesArray.map(s => s.nombre.length > 25 ? s.nombre.substring(0, 22) + '...' : s.nombre);
    const perdidosData = sucursalesArray.map(s => s.perdido);
    const nombresCompletos = sucursalesArray.map(s => s.nombre);
    
    const ctx = document.getElementById('graficoTopSucursales').getContext('2d');
    
    if (graficoTopSucursales) {
        graficoTopSucursales.data.labels = labels;
        graficoTopSucursales.data.datasets[0].data = perdidosData;
        graficoTopSucursales.data.datasets[0].backgroundColor = '#ffffff';
        graficoTopSucursales.data.datasets[0].borderColor = '#ffffff';
        graficoTopSucursales.update();
    } else {
        graficoTopSucursales = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Monto perdido',
                    data: perdidosData,
                    backgroundColor: '#ffffff',
                    borderColor: '#ffffff',
                    borderRadius: 8,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: true,
                onClick: (event, activeElements) => {
                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const sucursalNombre = nombresCompletos[index];
                        const registrosSucursal = window.registrosPorSucursal[sucursalNombre] || [];
                        
                        if (registrosSucursal.length === 0) {
                            Swal.fire({
                                icon: 'info',
                                title: 'Sin registros',
                                text: `No hay registros para ${sucursalNombre}`,
                                background: 'var(--color-bg-primary)',
                                color: 'white'
                            });
                            return;
                        }
                        
                        mostrarRegistrosEnSweet(registrosSucursal, `Registros de ${sucursalNombre}`, `<i class="fas fa-building"></i> ${sucursalNombre}`);
                    }
                },
                plugins: {
                    legend: { 
                        labels: { 
                            color: 'white', 
                            font: { size: 10 } 
                        } 
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
                                return `${ctx.dataset.label}: ${formatter.format(ctx.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            callback: (value) => {
                                const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact' });
                                return formatter.format(value);
                            },
                            color: '#aaa'
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        ticks: { color: '#aaa', font: { size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }
}

// =============================================
// GRÁFICA COMPARATIVA (Barras CLICKEABLES)
// =============================================
function actualizarGraficoComparativa(estadisticas) {
    const ctx = document.getElementById('graficoComparativa').getContext('2d');
    
    if (graficoComparativa) {
        graficoComparativa.data.datasets[0].data = [estadisticas.totalPerdido, estadisticas.totalRecuperado];
        graficoComparativa.update();
    } else {
        graficoComparativa = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Pérdidas', 'Recuperaciones'],
                datasets: [{
                    label: 'Monto total',
                    data: [estadisticas.totalPerdido, estadisticas.totalRecuperado],
                    backgroundColor: [COLORS.rojo, COLORS.verde],
                    borderRadius: 12,
                    barPercentage: 0.6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                onClick: (event, activeElements) => {
                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const tipo = index === 0 ? 'Pérdidas' : 'Recuperaciones';
                        const registros = datosActuales.registros || [];
                        
                        if (registros.length === 0) {
                            Swal.fire({
                                icon: 'info',
                                title: 'Sin registros',
                                text: `No hay registros para mostrar`,
                                background: 'var(--color-bg-primary)',
                                color: 'white'
                            });
                            return;
                        }
                        
                        if (tipo === 'Pérdidas') {
                            mostrarRegistrosEnSweet(registros, 'Todos los registros de pérdidas', `<i class="fas fa-chart-line"></i> Todos los registros`);
                        } else {
                            const registrosConRecuperacion = registros.filter(r => (r.montoRecuperado || 0) > 0);
                            if (registrosConRecuperacion.length === 0) {
                                Swal.fire({
                                    icon: 'info',
                                    title: 'Sin recuperaciones',
                                    text: 'No hay registros con recuperaciones registradas',
                                    background: 'var(--color-bg-primary)',
                                    color: 'white'
                                });
                                return;
                            }
                            mostrarRegistrosEnSweet(registrosConRecuperacion, 'Registros con recuperaciones', `<i class="fas fa-undo-alt"></i> Recuperaciones registradas`);
                        }
                    }
                },
                plugins: {
                    legend: { labels: { color: 'white', font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
                                return `${ctx.dataset.label}: ${formatter.format(ctx.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: (value) => {
                                const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact' });
                                return formatter.format(value);
                            },
                            color: '#aaa'
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: {
                        ticks: { color: '#aaa', font: { size: 12, weight: 'bold' } },
                        grid: { display: false }
                    }
                }
            }
        });
    }
}

// =============================================
// FUNCIÓN PARA MOSTRAR REGISTROS EN SWEETALERT
// =============================================
// =============================================
// FUNCIÓN PARA MOSTRAR REGISTROS EN SWEETALERT - VERSIÓN MEJORADA
// =============================================
function mostrarRegistrosEnSweet(registros, titulo, icono = '<i class="fas fa-chart-simple"></i>') {
    if (!registros || registros.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin registros',
            text: 'No hay registros para mostrar',
            background: 'var(--color-bg-primary)',
            color: 'white',
            customClass: {
                popup: 'swal2-popup-custom'
            }
        });
        return;
    }
    
    const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
    const totalPerdido = registros.reduce((acc, r) => acc + (r.montoPerdido || 0), 0);
    const totalRecuperado = registros.reduce((acc, r) => acc + (r.montoRecuperado || 0), 0);
    const tasaRecuperacion = totalPerdido > 0 ? ((totalRecuperado / totalPerdido) * 100).toFixed(2) : 0;
    
    // Limitar a los primeros 15 registros para no saturar el modal
    const registrosMostrar = registros.slice(0, 15);
    const hayMas = registros.length > 15;
    
    let registrosHtml = `
        <div class="swal-resumen-stats">
            <div class="swal-stats-grid">
                <div class="swal-stat-item" style="border-left-color: #8b5cf6;">
                    <span class="swal-stat-label">Total registros</span>
                    <span class="swal-stat-value">${registros.length}</span>
                </div>
                <div class="swal-stat-item" style="border-left-color: #ef4444;">
                    <span class="swal-stat-label">Total perdido</span>
                    <span class="swal-stat-value" style="color: #ef4444;">${formatter.format(totalPerdido)}</span>
                </div>
                <div class="swal-stat-item" style="border-left-color: #10b981;">
                    <span class="swal-stat-label">Total recuperado</span>
                    <span class="swal-stat-value" style="color: #10b981;">${formatter.format(totalRecuperado)}</span>
                </div>
                <div class="swal-stat-item" style="border-left-color: #3b82f6;">
                    <span class="swal-stat-label">Tasa recuperación</span>
                    <span class="swal-stat-value" style="color: #3b82f6;">${tasaRecuperacion}%</span>
                </div>
            </div>
        </div>
        <div class="swal-registros-list">
    `;
    
    registrosMostrar.forEach(registro => {
        const fecha = registro.getFechaFormateada ? registro.getFechaFormateada() : (registro.fecha ? new Date(registro.fecha).toLocaleDateString('es-MX') : 'N/A');
        const tipoTexto = registro.getTipoEventoTexto ? registro.getTipoEventoTexto() : (registro.tipoEvento || 'N/A');
        const estadoTexto = registro.getEstadoTexto ? registro.getEstadoTexto() : (registro.estado || 'activo');
        
        // Clase de color para el estado
        let estadoColor = '#6c757d';
        let estadoIcon = 'fa-circle';
        if (estadoTexto === 'Recuperado') {
            estadoColor = '#10b981';
            estadoIcon = 'fa-check-circle';
        } else if (estadoTexto === 'Activo') {
            estadoColor = '#f59e0b';
            estadoIcon = 'fa-exclamation-circle';
        } else if (estadoTexto === 'Cerrado') {
            estadoColor = '#6c757d';
            estadoIcon = 'fa-ban';
        }
        
        // Traducción de tipo de evento para mostrar bonito
        let tipoIcon = 'fa-tag';
        let tipoDisplay = tipoTexto;
        if (tipoTexto === 'robo' || tipoTexto === 'Robo') {
            tipoIcon = 'fa-mask';
            tipoDisplay = 'Robo';
        } else if (tipoTexto === 'extravio' || tipoTexto === 'Extravío') {
            tipoIcon = 'fa-map-marker-alt';
            tipoDisplay = 'Extravío';
        } else if (tipoTexto === 'accidente' || tipoTexto === 'Accidente') {
            tipoIcon = 'fa-car-crash';
            tipoDisplay = 'Accidente';
        }
        
        registrosHtml += `
            <div class="swal-registro-card" onclick="window.verDetalleRegistroDesdeSweet('${registro.id}')">
                <div class="swal-card-header">
                    <span class="swal-id"><i class="fas fa-hashtag"></i> ${escapeHTML(registro.id.substring(0, 12))}...</span>
                    <span class="swal-fecha"><i class="fas fa-calendar-alt"></i> ${fecha}</span>
                </div>
                <div class="swal-card-body">
                    <div class="swal-info-principal">
                        <div class="swal-sucursal">
                            <i class="fas fa-store"></i> ${escapeHTML(registro.nombreEmpresaCC || 'Sin asignar')}
                        </div>
                        <div class="swal-tipo-evento">
                            <i class="fas ${tipoIcon}"></i> ${tipoDisplay}
                            <span class="swal-estado-badge" style="margin-left: 8px; color: ${estadoColor};">
                                <i class="fas ${estadoIcon}"></i> ${estadoTexto}
                            </span>
                        </div>
                    </div>
                    <div class="swal-montos">
                        <span class="swal-monto-perdido"><i class="fas fa-arrow-down"></i> ${formatter.format(registro.montoPerdido || 0)}</span>
                        <span class="swal-monto-recuperado"><i class="fas fa-arrow-up"></i> ${formatter.format(registro.montoRecuperado || 0)}</span>
                    </div>
                </div>
                ${registro.narracionEventos ? `
                <div class="swal-card-footer">
                    <div class="swal-narracion">
                        <i class="fas fa-file-alt"></i>
                        <span>${escapeHTML(registro.narracionEventos.substring(0, 100))}${registro.narracionEventos.length > 100 ? '...' : ''}</span>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    });
    
    if (hayMas) {
        registrosHtml += `
            <div class="swal-mas-registros">
                <i class="fas fa-ellipsis-h"></i> y ${registros.length - 15} registros más. Haz clic en un registro para ver detalles completos.
            </div>
        `;
    }
    
    registrosHtml += `</div>`;
    
    Swal.fire({
        title: `${icono} ${titulo}`,
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
        backdrop: `
            rgba(0,0,0,0.8)
            left top
            no-repeat
        `
    });
}

// =============================================
// FUNCIÓN GLOBAL PARA VER DETALLE DE REGISTRO DESDE SWEET
// =============================================
// =============================================
// FUNCIÓN GLOBAL PARA VER DETALLE DE REGISTRO DESDE SWEET - VERSIÓN MEJORADA
// =============================================
window.verDetalleRegistroDesdeSweet = function(registroId) {
    Swal.close();
    
    const registro = datosActuales.registros.find(r => r.id === registroId);
    
    if (!registro) {
        Swal.fire({
            icon: 'error',
            title: 'Registro no encontrado',
            text: 'No se pudo encontrar el registro seleccionado',
            background: 'var(--color-bg-primary)',
            color: 'white',
            customClass: {
                popup: 'swal2-popup-custom'
            }
        });
        return;
    }
    
    const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
    const fecha = registro.getFechaFormateada ? registro.getFechaFormateada() : (registro.fecha ? new Date(registro.fecha).toLocaleDateString('es-MX') : 'N/A');
    const tipoTexto = registro.getTipoEventoTexto ? registro.getTipoEventoTexto() : (registro.tipoEvento || 'N/A');
    const estadoTexto = registro.getEstadoTexto ? registro.getEstadoTexto() : (registro.estado || 'activo');
    
    let estadoColor = '#6c757d';
    let estadoIcon = 'fa-circle';
    if (estadoTexto === 'Recuperado') {
        estadoColor = '#10b981';
        estadoIcon = 'fa-check-circle';
    } else if (estadoTexto === 'Activo') {
        estadoColor = '#f59e0b';
        estadoIcon = 'fa-exclamation-circle';
    }
    
    let tipoIcon = 'fa-tag';
    if (tipoTexto === 'robo' || tipoTexto === 'Robo') tipoIcon = 'fa-mask';
    else if (tipoTexto === 'extravio' || tipoTexto === 'Extravío') tipoIcon = 'fa-map-marker-alt';
    else if (tipoTexto === 'accidente' || tipoTexto === 'Accidente') tipoIcon = 'fa-car-crash';
    
    const detallesHtml = `
        <div style="display: flex; flex-direction: column; gap: 16px;">
            <div class="swal-resumen-stats" style="margin-bottom: 0;">
                <div class="swal-stats-grid">
                    <div class="swal-stat-item" style="border-left-color: #8b5cf6;">
                        <span class="swal-stat-label">ID Registro</span>
                        <span class="swal-stat-value" style="font-size: 0.8rem; word-break: break-all;">${escapeHTML(registro.id)}</span>
                    </div>
                    <div class="swal-stat-item" style="border-left-color: #3b82f6;">
                        <span class="swal-stat-label">Fecha</span>
                        <span class="swal-stat-value" style="font-size: 0.9rem;">${fecha}</span>
                    </div>
                    <div class="swal-stat-item" style="border-left-color: ${estadoColor};">
                        <span class="swal-stat-label">Estado</span>
                        <span class="swal-stat-value" style="color: ${estadoColor};"><i class="fas ${estadoIcon}"></i> ${estadoTexto}</span>
                    </div>
                </div>
            </div>
            
            <div style="background: rgba(0,0,0,0.4); border-radius: 16px; padding: 16px; border: 1px solid rgba(255,255,255,0.08);">
                <div style="display: flex; flex-wrap: wrap; gap: 20px; justify-content: space-between;">
                    <div>
                        <div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af; letter-spacing: 1px;">Sucursal</div>
                        <div style="font-size: 1rem; font-weight: 600; margin-top: 4px;"><i class="fas fa-store" style="color: var(--color-accent-primary);"></i> ${escapeHTML(registro.nombreEmpresaCC || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af; letter-spacing: 1px;">Tipo de evento</div>
                        <div style="font-size: 1rem; font-weight: 600; margin-top: 4px;"><i class="fas ${tipoIcon}"></i> ${tipoTexto}</div>
                    </div>
                    ${registro.hora ? `
                    <div>
                        <div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af; letter-spacing: 1px;">Hora</div>
                        <div style="font-size: 1rem; font-weight: 600; margin-top: 4px;"><i class="fas fa-clock"></i> ${escapeHTML(registro.hora)}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <div style="display: flex; flex-wrap: wrap; gap: 16px;">
                <div style="flex: 1; background: rgba(239, 68, 68, 0.1); border-radius: 16px; padding: 16px; border-left: 3px solid #ef4444;">
                    <div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af;">Monto perdido</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #ef4444; font-family: var(--font-family-primary);">${formatter.format(registro.montoPerdido || 0)}</div>
                </div>
                <div style="flex: 1; background: rgba(16, 185, 129, 0.1); border-radius: 16px; padding: 16px; border-left: 3px solid #10b981;">
                    <div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af;">Monto recuperado</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #10b981; font-family: var(--font-family-primary);">${formatter.format(registro.montoRecuperado || 0)}</div>
                </div>
            </div>
            
            ${registro.narracionEventos ? `
            <div style="background: rgba(0,0,0,0.3); border-radius: 16px; padding: 16px;">
                <div style="font-size: 0.7rem; text-transform: uppercase; color: #9ca3af; margin-bottom: 8px;"><i class="fas fa-file-alt"></i> Narración del evento</div>
                <div style="font-size: 0.85rem; line-height: 1.5; color: #d1d5db;">${escapeHTML(registro.narracionEventos)}</div>
            </div>
            ` : ''}
        </div>
    `;
    
    Swal.fire({
        title: `<i class="fas fa-info-circle" style="color: var(--color-accent-primary);"></i> Detalles del registro`,
        html: detallesHtml,
        width: '700px',
        background: 'transparent',
        confirmButtonText: '<i class="fas fa-check"></i> Cerrar',
        customClass: {
            popup: 'swal2-popup-custom',
            title: 'swal2-title-custom',
            confirmButton: 'swal2-confirm'
        }
    });
};

// =============================================
// ACTUALIZAR GRÁFICA VACÍA
// =============================================
function actualizarGraficaVacia() {
    const canvasIds = ['graficoTipoEvento', 'graficoEvolucionMensual', 'graficoTopSucursales', 'graficoComparativa'];
    
    canvasIds.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = '12px "Rajdhani", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Sin datos para mostrar', canvas.width / 2, canvas.height / 2);
        }
    });
}

// =============================================
// ACTUALIZAR TABLA DE RESUMEN
// =============================================
function actualizarTablaResumen(registros) {
    const tbody = document.getElementById('tablaResumenBody');
    if (!tbody) return;
    
    const sucursalesMap = {};
    
    registros.forEach(r => {
        const sucursal = r.nombreEmpresaCC || 'Sin asignar';
        if (!sucursalesMap[sucursal]) {
            sucursalesMap[sucursal] = {
                eventos: 0,
                perdido: 0,
                recuperado: 0
            };
        }
        sucursalesMap[sucursal].eventos++;
        sucursalesMap[sucursal].perdido += r.montoPerdido || 0;
        sucursalesMap[sucursal].recuperado += r.montoRecuperado || 0;
    });
    
    const sucursalesArray = Object.entries(sucursalesMap)
        .map(([nombre, datos]) => ({ 
            nombre, 
            ...datos,
            neto: datos.perdido - datos.recuperado,
            porcentaje: datos.perdido > 0 ? (datos.recuperado / datos.perdido) * 100 : 0
        }))
        .sort((a, b) => b.perdido - a.perdido);
    
    const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
    
    if (sucursalesArray.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center"><i class="fas fa-inbox"></i> No hay datos para mostrar con los filtros seleccionados</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = sucursalesArray.map(s => `
        <tr>
            <td title="${escapeHTML(s.nombre)}">${escapeHTML(s.nombre.length > 35 ? s.nombre.substring(0, 32) + '...' : s.nombre)}</td>
            <td>${s.eventos}</td>
            <td style="color: ${COLORS.rojo}; font-weight: 600;">${formatter.format(s.perdido)}</td>
            <td style="color: ${COLORS.verde}; font-weight: 600;">${formatter.format(s.recuperado)}</td>
            <td style="color: ${s.neto > 0 ? COLORS.rojo : COLORS.verde};">${formatter.format(s.neto)}</td>
            <td><span style="background: rgba(59,130,246,0.2); padding: 4px 8px; border-radius: 20px;">${s.porcentaje.toFixed(2)}%</span></td>
        </tr>
    `).join('');
}

// =============================================
// MOSTRAR CONTENEDORES
// =============================================
function mostrarContenedores() {
    const emptyState = document.getElementById('emptyState');
    const kpisContainer = document.getElementById('kpisContainer');
    const graficasContainer = document.getElementById('graficasContainer');
    
    if (emptyState) emptyState.style.display = 'none';
    if (kpisContainer) kpisContainer.style.display = 'grid';
    if (graficasContainer) graficasContainer.style.display = 'block';
}

function mostrarEmptyState() {
    const emptyState = document.getElementById('emptyState');
    const kpisContainer = document.getElementById('kpisContainer');
    const graficasContainer = document.getElementById('graficasContainer');
    
    if (emptyState) emptyState.style.display = 'block';
    if (kpisContainer) kpisContainer.style.display = 'none';
    if (graficasContainer) graficasContainer.style.display = 'none';
}

function mostrarLoading() {
    const loadingIds = ['totalPerdidas', 'totalRecuperado', 'totalNeto', 'porcentajeRecuperacion', 'totalEventos', 'promedioPerdida'];
    loadingIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '...';
    });
}

// =============================================
// LIMPIAR FILTROS
// =============================================
function limpiarFiltros() {
    const filtroSucursal = document.getElementById('filtroSucursal');
    const fechaInicio = document.getElementById('fechaInicio');
    const fechaFin = document.getElementById('fechaFin');
    const filtroTipoEvento = document.getElementById('filtroTipoEvento');
    
    if (filtroSucursal) filtroSucursal.value = 'todas';
    if (fechaInicio) fechaInicio.value = '';
    if (fechaFin) fechaFin.value = '';
    if (filtroTipoEvento) filtroTipoEvento.value = 'todos';
    
    mostrarEmptyState();
}

// =============================================
// GENERAR REPORTE PDF
// =============================================
async function generarReportePDF() {
    try {
        if (!datosActuales.registros || datosActuales.registros.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Sin datos',
                text: 'No hay datos para exportar. Aplica filtros primero.',
                background: 'var(--color-bg-primary)',
                color: 'white'
            });
            return;
        }

        // Mostrar loading
        Swal.fire({
            title: 'Generando PDF...',
            text: 'Capturando gráficas y procesando datos',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        // Obtener datos de la tabla de resumen actual
        const sucursalesResumen = [];
        const tbody = document.getElementById('tablaResumenBody');
        if (tbody) {
            const filas = tbody.querySelectorAll('tr');
            filas.forEach(fila => {
                const celdas = fila.querySelectorAll('td');
                if (celdas.length >= 6 && !celdas[0].textContent.includes('No hay datos')) {
                    sucursalesResumen.push({
                        nombre: celdas[0].textContent.trim(),
                        eventos: parseInt(celdas[1].textContent) || 0,
                        perdido: parseFloat(celdas[2].textContent.replace(/[^0-9.-]/g, '')) || 0,
                        recuperado: parseFloat(celdas[3].textContent.replace(/[^0-9.-]/g, '')) || 0,
                        neto: parseFloat(celdas[4].textContent.replace(/[^0-9.-]/g, '')) || 0,
                        porcentaje: parseFloat(celdas[5].textContent) || 0
                    });
                }
            });
        }

        // Obtener filtros actuales
        const filtros = {
            sucursal: document.getElementById('filtroSucursal')?.value || 'todas',
            fechaInicio: document.getElementById('fechaInicio')?.value,
            fechaFin: document.getElementById('fechaFin')?.value,
            tipoEvento: document.getElementById('filtroTipoEvento')?.value || 'todos'
        };

        // Preparar datos para PDF
        const datosPDF = {
            estadisticas: datosActuales.estadisticas,
            registros: datosActuales.registros,
            sucursalesResumen: sucursalesResumen,
            filtros: filtros
        };

        // Importar generador PDF
        const { generadorPDFEstadisticasExtravios } = await import('/components/estadisticasExtraviosPDF.js');

        // Generar PDF
        await generadorPDFEstadisticasExtravios.generarReporte(datosPDF, {
            mostrarAlerta: true,
            tituloPersonalizado: 'REPORTE DE PÉRDIDAS Y RECUPERACIONES'
        });

    } catch (error) {
        console.error('Error generando PDF:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo generar el PDF: ' + error.message,
            background: 'var(--color-bg-primary)',
            color: 'white'
        });
    }
}

// =============================================
// FUNCIONES AUXILIARES
// =============================================
function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarError(mensaje) {
    Swal.fire({
        icon: 'error',
        title: 'Error',
        text: mensaje,
        confirmButtonText: 'Entendido',
        background: 'var(--color-bg-primary)',
        color: 'white'
    });
}

// =============================================
// CONFIGURAR EVENTOS
// =============================================
function configurarEventos() {
    const btnAplicar = document.getElementById('btnAplicarFiltros');
    const btnLimpiar = document.getElementById('btnLimpiarFiltros');
    const btnEmptyAplicar = document.getElementById('btnEmptyAplicar');
    const btnPDF = document.getElementById('btnGenerarPDF');
    
    if (btnAplicar) btnAplicar.addEventListener('click', cargarRegistrosConFiltros);
    if (btnLimpiar) btnLimpiar.addEventListener('click', limpiarFiltros);
    if (btnEmptyAplicar) btnEmptyAplicar.addEventListener('click', cargarRegistrosConFiltros);
    if (btnPDF) btnPDF.addEventListener('click', generarReportePDF);
    
    const fechaInicio = document.getElementById('fechaInicio');
    const fechaFin = document.getElementById('fechaFin');
    
    if (fechaInicio) fechaInicio.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') cargarRegistrosConFiltros();
    });
    
    if (fechaFin) fechaFin.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') cargarRegistrosConFiltros();
    });
}

// =============================================
// INICIALIZACIÓN
// =============================================
async function inicializarDashboard() {
    try {
        console.log('🚀 Dashboard inicializado correctamente');
        
        await obtenerDatosOrganizacion();
        
        if (!organizacionActual?.camelCase) {
            console.error('No se pudo obtener la organización');
            mostrarEmptyState();
            return;
        }
        
        mercanciaManager = new MercanciaPerdidaManager();
        await cargarSucursales();
        configurarEventos();
        mostrarEmptyState();
        
    } catch (error) {
        console.error('Error inicializando dashboard:', error);
        mostrarError('No se pudo cargar el dashboard');
        mostrarEmptyState();
    }
}

document.addEventListener('DOMContentLoaded', inicializarDashboard);