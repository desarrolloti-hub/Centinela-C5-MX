// mapaCalorComponente.js - Componente COMPLETO del Mapa de Calor Estadístico
// Incluye: Mapa, Gráfica Top ubicaciones y Tabla de datos

class MapaCalorEstadistico {
    constructor() {
        this.mapa = null;
        this.incidenciaManager = null;
        this.mercanciaManager = null;
        this.sucursalManager = null;
        this.organizacionActual = null;
        
        // Datos principales
        this.incidenciasNormalesFiltradas = [];
        this.incidenciasRecuperacionFiltradas = [];
        this.sucursalesCache = [];
        this.agrupacionActual = 'sucursal'; // <-- CAMBIADO: default a sucursal
        this.datosPorUbicacion = new Map();
        
        // Charts
        this.charts = {};
        this.datosCargados = false;
        
        // Filtros externos
        this.filtrosExternos = null;
        this.onFiltrosAplicados = null;
        this.leafletLoaded = false;
        
        // Colores para niveles
        this.COLORES_NIVEL = {
            critico: '#ef4444',
            alto: '#f97316',
            medio: '#eab308',
            bajo: '#10b981'
        };
        
        // Mapa de estados de Mexico
        this.ESTADOS_COORDENADAS = {
            'Aguascalientes': [21.885, -102.291],
            'Baja California': [32.000, -115.500],
            'Baja California Sur': [25.000, -111.000],
            'Campeche': [19.830, -90.530],
            'Chiapas': [16.750, -92.630],
            'Chihuahua': [28.630, -106.070],
            'Ciudad de Mexico': [19.432, -99.133],
            'Coahuila': [27.000, -102.000],
            'Colima': [19.240, -103.720],
            'Durango': [24.020, -104.670],
            'Guanajuato': [21.020, -101.260],
            'Guerrero': [17.550, -99.500],
            'Hidalgo': [20.100, -98.750],
            'Jalisco': [20.659, -103.349],
            'Mexico': [19.350, -99.630],
            'Michoacan': [19.700, -101.190],
            'Morelos': [18.680, -99.100],
            'Nayarit': [21.500, -104.890],
            'Nuevo Leon': [25.670, -100.300],
            'Oaxaca': [17.070, -96.720],
            'Puebla': [19.040, -98.200],
            'Queretaro': [20.590, -100.390],
            'Quintana Roo': [19.600, -87.930],
            'San Luis Potosi': [22.150, -100.980],
            'Sinaloa': [24.800, -107.390],
            'Sonora': [29.300, -110.330],
            'Tabasco': [17.990, -92.920],
            'Tamaulipas': [24.290, -98.560],
            'Tlaxcala': [19.310, -98.240],
            'Veracruz': [19.170, -96.130],
            'Yucatan': [20.970, -89.620],
            'Zacatecas': [22.770, -102.580]
        };
        
        this.init();
    }
    
    async init() {
        if (window.MapaCalorEstadisticoLoaded) return;
        window.MapaCalorEstadisticoLoaded = true;
        
        await this.cargarLeaflet();
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            setTimeout(() => this.setup(), 100);
        }
    }
    
    async cargarLeaflet() {
        return new Promise((resolve, reject) => {
            if (typeof L !== 'undefined') {
                this.leafletLoaded = true;
                resolve();
                return;
            }
            
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
            
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = () => {
                this.leafletLoaded = true;
                resolve();
            };
            script.onerror = () => {
                reject(new Error('No se pudo cargar Leaflet'));
            };
            document.head.appendChild(script);
        });
    }
    
    async setup() {
        try {
            this.addStyles();
            this.insertHTML();
            setTimeout(() => {
                this.inicializar();
            }, 300);
            this.setupEventListeners();
        } catch (error) {
            console.error('Error al inicializar MapaCalorEstadistico:', error);
        }
    }
    
    addStyles() {
        if (document.getElementById('mapa-calor-estadistico-styles')) return;
        
        const styles = `
            <style id="mapa-calor-estadistico-styles">
                .mapa-calor-container {
                    background: var(--color-bg-secondary);
                    border: 1px solid var(--color-border-light);
                    border-radius: var(--border-radius-large, 16px);
                    margin-bottom: 25px;
                    overflow: hidden;
                }
                
                .mapa-calor-header {
                    background: rgba(20, 20, 20, 0.95);
                    border-bottom: 1px solid var(--color-border-light);
                    padding: 12px 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 15px;
                }
                
                .mapa-calor-header h5 {
                    color: var(--color-text-primary);
                    font-family: var(--font-family-primary, 'Orbitron', sans-serif);
                    font-size: 0.8rem;
                    text-transform: uppercase;
                    margin: 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .mapa-calor-header h5 i {
                    color: var(--color-accent-primary);
                }
                
                .mapa-calor-legend {
                    display: flex;
                    gap: 20px;
                    flex-wrap: wrap;
                    align-items: center;
                    background: rgba(0, 0, 0, 0.4);
                    padding: 6px 15px;
                    border-radius: 30px;
                }
                
                .mapa-calor-legend-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.7rem;
                    color: var(--color-text-secondary);
                    font-family: var(--font-family-secondary, 'Rajdhani', sans-serif);
                }
                
                .mapa-calor-legend-box {
                    width: 16px;
                    height: 16px;
                    border-radius: 4px;
                    transition: all 0.2s ease;
                }
                
                .mapa-calor-legend-box.critico { background: #ef4444; box-shadow: 0 0 6px #ef4444; }
                .mapa-calor-legend-box.alto { background: #f97316; box-shadow: 0 0 6px #f97316; }
                .mapa-calor-legend-box.medio { background: #eab308; box-shadow: 0 0 6px #eab308; }
                .mapa-calor-legend-box.bajo { background: #10b981; box-shadow: 0 0 6px #10b981; }
                
                .mapa-calor-body {
                    padding: 20px;
                }
                
                .mapa-calor-filters {
                    display: none;
                }
                
                .mapa-calor-map {
                    position: relative;
                    width: 100%;
                    height: 450px;
                    border-radius: var(--border-radius-large, 16px);
                    overflow: hidden;
                    border: 1px solid var(--color-border-light);
                    margin-bottom: 20px;
                    background: #1a1a2e;
                }
                
                #mapaCalorComponente {
                    width: 100%;
                    height: 100%;
                    background: var(--color-bg-secondary);
                }
                
                .mapa-calor-map-legend {
                    position: absolute;
                    bottom: 15px;
                    right: 15px;
                    background: rgba(0, 0, 0, 0.85);
                    backdrop-filter: blur(8px);
                    padding: 10px 14px;
                    border-radius: 12px;
                    border: 1px solid var(--color-border-light);
                    z-index: 1000;
                    font-family: var(--font-family-secondary, 'Rajdhani', sans-serif);
                    font-size: 0.7rem;
                    min-width: 130px;
                }
                
                .mapa-calor-map-legend h6 {
                    color: var(--color-text-primary);
                    font-family: var(--font-family-primary, 'Orbitron', sans-serif);
                    font-size: 0.6rem;
                    margin-bottom: 6px;
                    text-align: center;
                }
                
                .mapa-calor-map-legend .legend-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 4px;
                }
                
                .mapa-calor-map-legend .legend-color {
                    width: 14px;
                    height: 14px;
                    border-radius: 3px;
                }
                
                .mapa-calor-map-legend .legend-text {
                    font-size: 0.6rem;
                }
                
                /* KPIs */
                .mapa-calor-stats {
                    display: grid;
                    grid-template-columns: repeat(5, 1fr);
                    gap: 12px;
                    margin-bottom: 20px;
                }
                
                .mapa-calor-stat-card {
                    background: rgba(0, 0, 0, 0.5);
                    border-radius: var(--border-radius-medium, 12px);
                    padding: 10px;
                    text-align: center;
                    border-left: 3px solid var(--color-accent-primary);
                }
                
                .mapa-calor-stat-card .stat-icon {
                    font-size: 1rem;
                    margin-bottom: 5px;
                    color: var(--color-accent-primary);
                }
                
                .mapa-calor-stat-card .stat-value {
                    font-size: 1.1rem;
                    font-weight: 800;
                    color: white;
                    font-family: var(--font-family-primary, 'Orbitron', sans-serif);
                }
                
                .mapa-calor-stat-card .stat-label {
                    font-size: 0.55rem;
                    color: var(--color-text-secondary);
                    text-transform: uppercase;
                    margin-top: 3px;
                }
                
                /* GRAFICA UNICA (Top ubicaciones) */
                .mapa-calor-chart-single {
                    margin-bottom: 20px;
                }
                
                .mapa-calor-card {
                    background: var(--color-bg-secondary);
                    border: 1px solid var(--color-border-light);
                    border-radius: var(--border-radius-large, 16px);
                    overflow: hidden;
                }
                
                .mapa-calor-card-header {
                    background: linear-gradient(135deg, rgba(20, 20, 20, 0.98), rgba(30, 30, 30, 0.95));
                    border-bottom: 1px solid var(--color-border-light);
                    padding: 10px 15px;
                }
                
                .mapa-calor-card-header h5 {
                    color: var(--color-text-primary);
                    font-family: var(--font-family-primary, 'Orbitron', sans-serif);
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    margin: 0;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                
                .mapa-calor-card-header h5 i {
                    color: var(--color-accent-primary);
                }
                
                .mapa-calor-card-body {
                    padding: 20px;
                    min-height: 320px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                
                .mapa-calor-card-body canvas {
                    max-width: 100%;
                    max-height: 280px;
                    cursor: pointer;
                }
                
                /* TABLA */
                .mapa-calor-table-container {
                    background: var(--color-bg-secondary);
                    border: 1px solid var(--color-border-light);
                    border-radius: var(--border-radius-large, 16px);
                    overflow: hidden;
                }
                
                .mapa-calor-table-header {
                    background: linear-gradient(135deg, rgba(20, 20, 20, 0.98), rgba(30, 30, 30, 0.95));
                    border-bottom: 1px solid var(--color-border-light);
                    padding: 10px 15px;
                }
                
                .mapa-calor-table-header h5 {
                    color: var(--color-text-primary);
                    font-family: var(--font-family-primary, 'Orbitron', sans-serif);
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    margin: 0;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                
                .mapa-calor-table-header h5 i {
                    color: var(--color-accent-primary);
                }
                
                .mapa-calor-table-responsive {
                    width: 100%;
                    overflow-x: auto;
                }
                
                .mapa-calor-table {
                    width: 100%;
                    border-collapse: collapse;
                    color: var(--color-text-secondary);
                    font-size: 0.75rem;
                    min-width: 500px;
                }
                
                .mapa-calor-table th,
                .mapa-calor-table td {
                    padding: 12px;
                    text-align: left;
                    border-bottom: 1px solid var(--color-border-light);
                }
                
                .mapa-calor-table th {
                    background: rgba(0, 0, 0, 0.3);
                    color: var(--color-text-primary);
                    font-family: var(--font-family-primary, 'Orbitron', sans-serif);
                    font-size: 0.6rem;
                    text-transform: uppercase;
                }
                
                .mapa-calor-table tbody tr:hover {
                    background: rgba(0, 207, 255, 0.08);
                    cursor: pointer;
                }
                
                .mapa-calor-color-indicator {
                    width: 12px;
                    height: 12px;
                    border-radius: 3px;
                    display: inline-block;
                    margin-right: 8px;
                }
                
                .mapa-calor-nivel-badge {
                    display: inline-block;
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 0.65rem;
                    font-weight: 600;
                }
                
                .custom-tooltip {
                    font-family: 'Orbitron', monospace !important;
                    font-size: 10px !important;
                    background: rgba(0, 0, 0, 0.95) !important;
                    border: 1px solid #00cfff !important;
                    border-radius: 8px !important;
                    padding: 6px 12px !important;
                    color: white !important;
                }
                
                .leaflet-popup-content-wrapper {
                    background: rgba(0, 0, 0, 0.95) !important;
                    border-radius: 12px !important;
                }
                
                .leaflet-popup-tip {
                    background: rgba(0, 0, 0, 0.95) !important;
                }
                
                .leaflet-popup-content {
                    color: #ffffff !important;
                    font-family: 'Rajdhani', sans-serif !important;
                }
                
                .loading-overlay-mapa {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    backdrop-filter: blur(8px);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                    border-radius: 16px;
                }
                
                .loading-spinner-mapa {
                    text-align: center;
                    color: white;
                }
                
                .loading-spinner-mapa i {
                    font-size: 2rem;
                    margin-bottom: 10px;
                    color: var(--color-accent-primary);
                }
                
                @media (max-width: 1024px) {
                    .mapa-calor-stats {
                        grid-template-columns: repeat(3, 1fr);
                    }
                }
                
                @media (max-width: 768px) {
                    .mapa-calor-stats {
                        grid-template-columns: repeat(2, 1fr);
                    }
                    .mapa-calor-map {
                        height: 350px;
                    }
                }
                
                @media (max-width: 550px) {
                    .mapa-calor-stats {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
        `;
        
        document.head.insertAdjacentHTML('beforeend', styles);
    }
    
    insertHTML() {
        let container = document.getElementById('mapaCalorComponenteContainer');
        
        if (!container) {
            const adminContainer = document.querySelector('.admin-container');
            const pageHeader = document.querySelector('.page-header');
            
            if (adminContainer && pageHeader) {
                container = document.createElement('div');
                container.id = 'mapaCalorComponenteContainer';
                pageHeader.insertAdjacentElement('afterend', container);
            } else {
                return;
            }
        }
        
        container.innerHTML = `
            <div class="mapa-calor-container">
                <div class="mapa-calor-header">
                    <h5><i class="fas fa-fire"></i> Mapa de Calor Estadístico</h5>
                    <div class="mapa-calor-legend">
                        <div class="mapa-calor-legend-item"><div class="mapa-calor-legend-box critico"></div><span>Crítico</span></div>
                        <div class="mapa-calor-legend-item"><div class="mapa-calor-legend-box alto"></div><span>Alto</span></div>
                        <div class="mapa-calor-legend-item"><div class="mapa-calor-legend-box medio"></div><span>Medio</span></div>
                        <div class="mapa-calor-legend-item"><div class="mapa-calor-legend-box bajo"></div><span>Bajo</span></div>
                    </div>
                </div>
                <div class="mapa-calor-body">
                    <!-- Filtros ocultos (se sincronizan con el módulo principal) -->
                    <div class="mapa-calor-filters">
                        <input type="date" id="mapaFechaInicio" style="display:none;">
                        <input type="date" id="mapaFechaFin" style="display:none;">
                        <select id="mapaFiltroNivelRiesgo" style="display:none;"></select>
                        <select id="mapaAgrupacion" style="display:none;"></select>
                    </div>
                    
                    <!-- Mapa -->
                    <div class="mapa-calor-map">
                        <div id="mapaCalorComponente"></div>
                        <div class="mapa-calor-map-legend" id="mapaMapLegend" style="display: none;">
                            <h6><i class="fas fa-palette"></i> Nivel de Riesgo</h6>
                            <div class="legend-item"><div class="legend-color critico"></div><span class="legend-text">Crítico</span></div>
                            <div class="legend-item"><div class="legend-color alto"></div><span class="legend-text">Alto</span></div>
                            <div class="legend-item"><div class="legend-color medio"></div><span class="legend-text">Medio</span></div>
                            <div class="legend-item"><div class="legend-color bajo"></div><span class="legend-text">Bajo</span></div>
                        </div>
                    </div>
                    
                    <!-- KPIs -->
                    <div class="mapa-calor-stats" id="mapaStatsContainer" style="display: none;">
                        <div class="mapa-calor-stat-card">
                            <div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div>
                            <div class="stat-value" id="mapaTotalIncidentes">0</div>
                            <div class="stat-label">Incidentes</div>
                        </div>
                        <div class="mapa-calor-stat-card">
                            <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
                            <div class="stat-value" id="mapaCriticasAltas">0</div>
                            <div class="stat-label">Críticas + Altas</div>
                        </div>
                        <div class="mapa-calor-stat-card">
                            <div class="stat-icon"><i class="fas fa-dollar-sign"></i></div>
                            <div class="stat-value" id="mapaTotalPerdido">$0</div>
                            <div class="stat-label">Total perdido</div>
                        </div>
                        <div class="mapa-calor-stat-card">
                            <div class="stat-icon"><i class="fas fa-percent"></i></div>
                            <div class="stat-value" id="mapaTasaRecuperacion">0%</div>
                            <div class="stat-label">Recuperación</div>
                        </div>
                        <div class="mapa-calor-stat-card">
                            <div class="stat-icon"><i class="fas fa-map-marker-alt"></i></div>
                            <div class="stat-value" id="mapaEstadoTop">-</div>
                            <div class="stat-label">Más incidentes</div>
                        </div>
                    </div>
                    
                    <!-- GRÁFICA UNICA: Top ubicaciones -->
                    <div class="mapa-calor-chart-single" id="mapaChartsContainer" style="display: none;">
                        <div class="mapa-calor-card">
                            <div class="mapa-calor-card-header">
                                <h5><i class="fas fa-chart-bar"></i> Top ubicaciones con más incidentes</h5>
                            </div>
                            <div class="mapa-calor-card-body">
                                <canvas id="mapaGraficoTop"></canvas>
                            </div>
                        </div>
                    </div>
                    
                    <!-- TABLA -->
                    <div class="mapa-calor-table-container" id="mapaTablaContainer" style="display: none;">
                        <div class="mapa-calor-table-header">
                            <h5><i class="fas fa-table"></i> Detalle por ubicación (Top 10)</h5>
                        </div>
                        <div class="mapa-calor-table-responsive">
                            <table class="mapa-calor-table" id="mapaDataTable">
                                <thead>
                                    <tr><th>Ubicación</th><th>Incidentes</th><th>Total perdido</th><th>Total recuperado</th><th>Nivel</th></tr>
                                </thead>
                                <tbody id="mapaTableBody">
                                    <tr><td colspan="5" style="text-align: center;">Selecciona fechas y haz clic en "Aplicar"</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    setupEventListeners() {
        // Escuchar el botón "Aplicar" del módulo principal
        const btnAplicar = document.getElementById('btnAplicarFiltros');
        if (btnAplicar) {
            btnAplicar.addEventListener('click', () => {
                const fechaInicio = document.getElementById('filtroFechaInicio')?.value;
                const fechaFin = document.getElementById('filtroFechaFin')?.value;
                const nivelRiesgo = document.getElementById('filtroNivelRiesgoMapa')?.value || 'todos';
                const agrupacion = document.getElementById('filtroAgrupacionMapa')?.value || 'sucursal';
                
                if (fechaInicio && fechaFin) {
                    this.sincronizarFiltros({
                        fechaInicio: fechaInicio,
                        fechaFin: fechaFin,
                        nivelRiesgo: nivelRiesgo,
                        agrupacion: agrupacion
                    });
                    this.aplicarFiltros();
                }
            });
        }
        
        // Escuchar cambios en el filtro de agrupación del módulo principal
        const agrupacionSelect = document.getElementById('filtroAgrupacionMapa');
        if (agrupacionSelect) {
            agrupacionSelect.addEventListener('change', (e) => {
                this.agrupacionActual = e.target.value;
                if (this.datosCargados) {
                    this.procesarDatosPorUbicacion();
                    this.actualizarMapa();
                    this.actualizarTabla();
                    this.actualizarGraficoTop();
                }
            });
        }
    }
    
    sincronizarFiltros(filtros) {
        if (!filtros) return;
        this.filtrosExternos = { ...filtros };
        if (filtros.agrupacion) {
            this.agrupacionActual = filtros.agrupacion;
        }
    }
    
    setOnFiltrosAplicados(callback) {
        this.onFiltrosAplicados = callback;
    }
    
    formatearMoneda(valor) {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(valor || 0);
    }
    
    formatearPorcentaje(valor) {
        return `${(valor || 0).toFixed(2)}%`;
    }
    
    async aplicarFiltros() {
        this.mostrarLoading(true);
        
        try {
            let fechaInicio, fechaFin, nivelRiesgoFiltro;
            
            if (this.filtrosExternos) {
                fechaInicio = this.filtrosExternos.fechaInicio;
                fechaFin = this.filtrosExternos.fechaFin;
                nivelRiesgoFiltro = this.filtrosExternos.nivelRiesgo || 'todos';
            } else {
                fechaInicio = document.getElementById('filtroFechaInicio')?.value;
                fechaFin = document.getElementById('filtroFechaFin')?.value;
                nivelRiesgoFiltro = document.getElementById('filtroNivelRiesgoMapa')?.value || 'todos';
            }
            
            if (!fechaInicio || !fechaFin) {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Fechas requeridas',
                        text: 'Selecciona un rango de fechas para analizar',
                        background: 'var(--color-bg-primary)',
                        color: 'white'
                    });
                }
                this.mostrarLoading(false);
                return;
            }
            
            const fechaInicioObj = new Date(fechaInicio);
            fechaInicioObj.setHours(0, 0, 0, 0);
            const fechaFinObj = new Date(fechaFin);
            fechaFinObj.setHours(23, 59, 59, 999);
            
            let incidenciasNormales = await this.incidenciaManager.getIncidenciasByOrganizacion(this.organizacionActual.camelCase);
            
            incidenciasNormales = incidenciasNormales.filter(inc => {
                const fechaInc = inc.fechaInicio instanceof Date ? inc.fechaInicio : new Date(inc.fechaInicio);
                return fechaInc >= fechaInicioObj && fechaInc <= fechaFinObj;
            });
            
            if (nivelRiesgoFiltro !== 'todos') {
                incidenciasNormales = incidenciasNormales.filter(inc => inc.nivelRiesgo === nivelRiesgoFiltro);
            }
            
            let incidenciasRecuperacion = await this.mercanciaManager.getRegistrosByOrganizacion(this.organizacionActual.camelCase);
            
            incidenciasRecuperacion = incidenciasRecuperacion.filter(r => {
                const fechaReg = r.fecha ? new Date(r.fecha) : null;
                return fechaReg && fechaReg >= fechaInicioObj && fechaReg <= fechaFinObj;
            });
            
            this.incidenciasNormalesFiltradas = incidenciasNormales;
            this.incidenciasRecuperacionFiltradas = incidenciasRecuperacion;
            
            const totalIncidencias = incidenciasNormales.length;
            
            if (totalIncidencias === 0) {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'info',
                        title: 'Sin datos',
                        text: 'No hay incidencias en el periodo seleccionado con el nivel de riesgo elegido',
                        background: 'var(--color-bg-primary)',
                        color: 'white'
                    });
                }
                this.mostrarLoading(false);
                this.limpiarVisualizacion();
                return;
            }
            
            this.datosCargados = true;
            
            this.calcularEstadisticasGenerales(incidenciasNormales, incidenciasRecuperacion);
            this.procesarDatosPorUbicacion();
            this.limpiarMapa();
            this.actualizarMapa();
            this.actualizarGraficoTop();
            this.actualizarTabla();
            this.mostrarResultados(true);
            
            if (this.onFiltrosAplicados && typeof this.onFiltrosAplicados === 'function') {
                this.onFiltrosAplicados({
                    fechaInicio,
                    fechaFin,
                    nivelRiesgo: nivelRiesgoFiltro,
                    totalIncidencias
                });
            }
            
        } catch (error) {
            console.error('Error analizando datos:', error);
        } finally {
            this.mostrarLoading(false);
        }
    }
    
    mostrarResultados(mostrar) {
        const statsContainer = document.getElementById('mapaStatsContainer');
        const chartsContainer = document.getElementById('mapaChartsContainer');
        const tablaContainer = document.getElementById('mapaTablaContainer');
        const mapLegend = document.getElementById('mapaMapLegend');
        
        if (statsContainer) statsContainer.style.display = mostrar ? 'grid' : 'none';
        if (chartsContainer) chartsContainer.style.display = mostrar ? 'block' : 'none';
        if (tablaContainer) tablaContainer.style.display = mostrar ? 'block' : 'none';
        if (mapLegend) mapLegend.style.display = mostrar ? 'block' : 'none';
    }
    
    calcularEstadisticasGenerales(incidenciasNormales, incidenciasRecuperacion) {
        const totalIncidentes = incidenciasNormales.length;
        const totalPerdido = incidenciasRecuperacion.reduce((sum, r) => sum + (r.montoPerdido || 0), 0);
        const totalRecuperado = incidenciasRecuperacion.reduce((sum, r) => sum + (r.montoRecuperado || 0), 0);
        const tasaRecuperacion = totalPerdido > 0 ? (totalRecuperado / totalPerdido) * 100 : 0;
        const criticasAltas = incidenciasNormales.filter(i => i.nivelRiesgo === 'critico' || i.nivelRiesgo === 'alto').length;
        
        const incidentesPorEstado = {};
        incidenciasNormales.forEach(inc => {
            const sucursal = this.sucursalesCache.find(s => s.id === inc.sucursalId);
            const estado = sucursal?.estado || 'Desconocido';
            incidentesPorEstado[estado] = (incidentesPorEstado[estado] || 0) + 1;
        });
        
        let estadoTop = 'Ninguno';
        let maxIncidentes = 0;
        for (const [estado, count] of Object.entries(incidentesPorEstado)) {
            if (count > maxIncidentes) {
                maxIncidentes = count;
                estadoTop = estado;
            }
        }
        
        const totalIncidentesEl = document.getElementById('mapaTotalIncidentes');
        const criticasAltasEl = document.getElementById('mapaCriticasAltas');
        const totalPerdidoEl = document.getElementById('mapaTotalPerdido');
        const tasaRecuperacionEl = document.getElementById('mapaTasaRecuperacion');
        const estadoTopEl = document.getElementById('mapaEstadoTop');
        
        if (totalIncidentesEl) totalIncidentesEl.textContent = totalIncidentes;
        if (criticasAltasEl) criticasAltasEl.textContent = criticasAltas;
        if (totalPerdidoEl) totalPerdidoEl.textContent = this.formatearMoneda(totalPerdido);
        if (tasaRecuperacionEl) tasaRecuperacionEl.textContent = this.formatearPorcentaje(tasaRecuperacion);
        if (estadoTopEl) estadoTopEl.textContent = estadoTop.length > 15 ? estadoTop.substring(0, 12) + '...' : estadoTop;
    }
    
    procesarDatosPorUbicacion() {
        this.datosPorUbicacion.clear();
        const agrupado = new Map();
        
        for (const incidencia of this.incidenciasNormalesFiltradas) {
            const sucursal = this.sucursalesCache.find(s => s.id === incidencia.sucursalId);
            let ubicacionNombre;
            let ubicacionCoordenadas;
            
            if (this.agrupacionActual === 'estado') {
                ubicacionNombre = sucursal?.estado || 'Desconocido';
                ubicacionCoordenadas = this.ESTADOS_COORDENADAS[ubicacionNombre] || [23.6345, -102.5528];
            } else {
                ubicacionNombre = sucursal?.nombre || 'Desconocido';
                ubicacionCoordenadas = sucursal?.latitud && sucursal?.longitud ? 
                    [parseFloat(sucursal.latitud), parseFloat(sucursal.longitud)] : [23.6345, -102.5528];
            }
            
            if (!agrupado.has(ubicacionNombre)) {
                agrupado.set(ubicacionNombre, {
                    nombre: ubicacionNombre,
                    coordenadas: ubicacionCoordenadas,
                    incidentesNormales: 0,
                    nivelDistribucion: { critico: 0, alto: 0, medio: 0, bajo: 0 },
                    totalPerdido: 0,
                    totalRecuperado: 0
                });
            }
            
            const data = agrupado.get(ubicacionNombre);
            data.incidentesNormales++;
            
            if (incidencia.nivelRiesgo === 'critico') data.nivelDistribucion.critico++;
            else if (incidencia.nivelRiesgo === 'alto') data.nivelDistribucion.alto++;
            else if (incidencia.nivelRiesgo === 'medio') data.nivelDistribucion.medio++;
            else if (incidencia.nivelRiesgo === 'bajo') data.nivelDistribucion.bajo++;
        }
        
        for (const registro of this.incidenciasRecuperacionFiltradas) {
            const sucursal = this.sucursalesCache.find(s => s.id === registro.sucursalId);
            let ubicacionNombre;
            
            if (this.agrupacionActual === 'estado') {
                ubicacionNombre = sucursal?.estado || 'Desconocido';
            } else {
                ubicacionNombre = sucursal?.nombre || 'Desconocido';
            }
            
            if (agrupado.has(ubicacionNombre)) {
                const data = agrupado.get(ubicacionNombre);
                data.totalPerdido += registro.montoPerdido || 0;
                data.totalRecuperado += registro.montoRecuperado || 0;
            }
        }
        
        const ubicaciones = Array.from(agrupado.values());
        
        for (const ubicacion of ubicaciones) {
            const distribucion = ubicacion.nivelDistribucion;
            const niveles = [
                { nivel: 'critico', count: distribucion.critico, color: this.COLORES_NIVEL.critico },
                { nivel: 'alto', count: distribucion.alto, color: this.COLORES_NIVEL.alto },
                { nivel: 'medio', count: distribucion.medio, color: this.COLORES_NIVEL.medio },
                { nivel: 'bajo', count: distribucion.bajo, color: this.COLORES_NIVEL.bajo }
            ];
            
            const nivelPredominante = niveles.reduce((max, n) => n.count > max.count ? n : max, { count: 0, nivel: 'bajo', color: this.COLORES_NIVEL.bajo });
            
            ubicacion.nivel = nivelPredominante.nivel;
            ubicacion.color = nivelPredominante.color;
            ubicacion.totalIncidentes = ubicacion.incidentesNormales;
            
            this.datosPorUbicacion.set(ubicacion.nombre, ubicacion);
        }
    }
    
    limpiarMapa() {
        if (!this.mapa) return;
        this.mapa.eachLayer(layer => {
            if (layer instanceof L.Marker || layer instanceof L.CircleMarker || layer instanceof L.GeoJSON) {
                this.mapa.removeLayer(layer);
            }
        });
    }
    
    actualizarMapa() {
        if (!this.mapa) return;
        
        if (this.datosPorUbicacion.size === 0) {
            this.mostrarMensajeInicialMapa();
            return;
        }
        
        const bounds = [];
        
        for (const [nombre, datos] of this.datosPorUbicacion) {
            const [lat, lng] = datos.coordenadas;
            bounds.push([lat, lng]);
            
            const icono = this.crearIconoPersonalizado(datos.color, datos.totalIncidentes, datos.nivel);
            
            L.marker([lat, lng], { icon: icono })
                .bindTooltip(`${nombre}<br>Incidentes: ${datos.totalIncidentes}<br>Nivel: ${datos.nivel.toUpperCase()}`, {
                    className: 'custom-tooltip',
                    sticky: true
                })
                .bindPopup(this.crearPopupContenido(datos))
                .addTo(this.mapa);
            
            const radio = Math.min(40 + (datos.totalIncidentes * 2), 120);
            L.circleMarker([lat, lng], {
                radius: radio,
                fillColor: datos.color,
                color: datos.color,
                weight: 1,
                opacity: 0.4,
                fillOpacity: 0.15
            }).addTo(this.mapa);
        }
        
        if (bounds.length > 0) {
            const group = L.featureGroup(bounds.map(b => L.marker(b)));
            this.mapa.fitBounds(group.getBounds().pad(0.2));
        }
    }
    
    crearIconoPersonalizado(color, incidentes, nivel) {
        const tamanio = Math.min(32 + Math.floor(incidentes / 5), 48);
        const canvas = document.createElement('canvas');
        canvas.width = tamanio;
        canvas.height = tamanio;
        const ctx = canvas.getContext('2d');
        
        const centerX = tamanio / 2;
        const centerY = tamanio / 2;
        const radius = tamanio / 2 - 2;
        
        ctx.clearRect(0, 0, tamanio, tamanio);
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.floor(tamanio / 3)}px "Orbitron", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        let texto = incidentes > 99 ? '99+' : incidentes.toString();
        ctx.fillText(texto, centerX, centerY);
        
        const iconUrl = canvas.toDataURL();
        return L.icon({
            iconUrl: iconUrl,
            iconSize: [tamanio, tamanio],
            iconAnchor: [tamanio / 2, tamanio / 2],
            popupAnchor: [0, -tamanio / 2]
        });
    }
    
    crearPopupContenido(datos) {
        let nivelTexto = '';
        switch (datos.nivel) {
            case 'critico': nivelTexto = 'CRITICO'; break;
            case 'alto': nivelTexto = 'ALTO'; break;
            case 'medio': nivelTexto = 'MEDIO'; break;
            case 'bajo': nivelTexto = 'BAJO'; break;
        }
        
        let contenido = `
            <div style="min-width: 260px; font-family: 'Rajdhani', sans-serif; color: #ffffff;">
                <div style="border-bottom: 2px solid ${datos.color}; padding-bottom: 8px; margin-bottom: 10px;">
                    <strong style="color: ${datos.color};">${this.escapeHTML(datos.nombre)}</strong>
                </div>
                <div style="background: ${datos.color}20; padding: 6px 10px; border-radius: 8px; margin-bottom: 10px;">
                    <strong style="color: ${datos.color};">Nivel predominante: ${nivelTexto}</strong>
                    <div style="font-size: 0.7rem; margin-top: 4px;">
                        Incidentes: ${datos.totalIncidentes}
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                    <div><strong>Críticos:</strong><br>${datos.nivelDistribucion.critico}</div>
                    <div><strong>Altos:</strong><br>${datos.nivelDistribucion.alto}</div>
                    <div><strong>Medios:</strong><br>${datos.nivelDistribucion.medio}</div>
                    <div><strong>Bajos:</strong><br>${datos.nivelDistribucion.bajo}</div>
                </div>
        `;
        
        if (datos.totalPerdido > 0 || datos.totalRecuperado > 0) {
            contenido += `
                <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 8px; margin-top: 5px;">
                    <div><strong>Perdido:</strong> ${this.formatearMoneda(datos.totalPerdido)}</div>
                    <div><strong>Recuperado:</strong> ${this.formatearMoneda(datos.totalRecuperado)}</div>
                </div>
            `;
        }
        
        contenido += `</div>`;
        return contenido;
    }
    
    actualizarGraficoTop() {
        const ubicaciones = Array.from(this.datosPorUbicacion.values())
            .sort((a, b) => b.totalIncidentes - a.totalIncidentes)
            .slice(0, 8);
        
        const labels = ubicaciones.map(u => u.nombre.length > 20 ? u.nombre.substring(0, 17) + '...' : u.nombre);
        const datos = ubicaciones.map(u => u.totalIncidentes);
        const colores = ubicaciones.map(u => u.color);
        
        const ctx = document.getElementById('mapaGraficoTop').getContext('2d');
        
        if (this.charts.top) {
            this.charts.top.data.labels = labels;
            this.charts.top.data.datasets[0].data = datos;
            this.charts.top.data.datasets[0].backgroundColor = colores;
            this.charts.top.update();
        } else {
            this.charts.top = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Total incidentes',
                        data: datos,
                        backgroundColor: colores,
                        borderRadius: 8
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { labels: { color: 'white' } } },
                    scales: {
                        x: { ticks: { color: '#aaa', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' } },
                        y: { ticks: { color: '#aaa', font: { size: 10 } }, grid: { display: false } }
                    }
                }
            });
        }
    }
    
    actualizarTabla() {
        const tbody = document.getElementById('mapaTableBody');
        if (!tbody) return;
        
        const ubicaciones = Array.from(this.datosPorUbicacion.values())
            .sort((a, b) => b.totalIncidentes - a.totalIncidentes)
            .slice(0, 10);
        
        if (ubicaciones.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay datos para mostrar</td></tr>';
            return;
        }
        
        tbody.innerHTML = ubicaciones.map(u => {
            let nivelTexto = '';
            let nivelColor = '';
            switch (u.nivel) {
                case 'critico': nivelTexto = 'Critico'; nivelColor = this.COLORES_NIVEL.critico; break;
                case 'alto': nivelTexto = 'Alto'; nivelColor = this.COLORES_NIVEL.alto; break;
                case 'medio': nivelTexto = 'Medio'; nivelColor = this.COLORES_NIVEL.medio; break;
                case 'bajo': nivelTexto = 'Bajo'; nivelColor = this.COLORES_NIVEL.bajo; break;
            }
            
            return `
                <tr onclick="window.mapaCalorComponente && window.mapaCalorComponente.verDetalleUbicacion('${this.escapeHTML(u.nombre)}')" style="cursor: pointer;">
                    <td><div class="mapa-calor-color-indicator" style="background: ${u.color};"></div>${this.escapeHTML(u.nombre)}</td>
                    <td><strong>${u.totalIncidentes}</strong></td>
                    <td>${this.formatearMoneda(u.totalPerdido)}</td>
                    <td>${this.formatearMoneda(u.totalRecuperado)}</td>
                    <td><span class="mapa-calor-nivel-badge" style="background: ${nivelColor}20; color: ${nivelColor};">${nivelTexto}</span></td>
                </tr>
            `;
        }).join('');
    }
    
    verDetalleUbicacion(nombre) {
        const datos = this.datosPorUbicacion.get(nombre);
        if (!datos) return;
        
        let contenido = `
            <div style="text-align: left;">
                <div style="background: ${datos.color}20; padding: 12px; border-radius: 12px; margin-bottom: 12px;">
                    <strong>Nivel predominante:</strong> ${datos.nivel.toUpperCase()}<br>
                    <strong>Incidentes totales:</strong> ${datos.totalIncidentes}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div><strong>Críticos:</strong> ${datos.nivelDistribucion.critico}</div>
                    <div><strong>Altos:</strong> ${datos.nivelDistribucion.alto}</div>
                    <div><strong>Medios:</strong> ${datos.nivelDistribucion.medio}</div>
                    <div><strong>Bajos:</strong> ${datos.nivelDistribucion.bajo}</div>
        `;
        
        if (datos.totalPerdido > 0) {
            contenido += `<div><strong>Total perdido:</strong> ${this.formatearMoneda(datos.totalPerdido)}</div>`;
        }
        if (datos.totalRecuperado > 0) {
            contenido += `<div><strong>Total recuperado:</strong> ${this.formatearMoneda(datos.totalRecuperado)}</div>`;
        }
        
        contenido += `</div></div>`;
        
        Swal.fire({
            title: `${nombre}`,
            html: contenido,
            icon: 'info',
            confirmButtonText: 'Cerrar',
            background: 'var(--color-bg-primary)',
            color: 'white',
            customClass: { popup: 'swal2-popup-custom' }
        });
    }
    
    limpiarVisualizacion() {
        this.datosCargados = false;
        this.datosPorUbicacion.clear();
        this.limpiarMapa();
        
        const statsContainer = document.getElementById('mapaStatsContainer');
        const chartsContainer = document.getElementById('mapaChartsContainer');
        const tablaContainer = document.getElementById('mapaTablaContainer');
        const mapLegend = document.getElementById('mapaMapLegend');
        
        if (statsContainer) statsContainer.style.display = 'none';
        if (chartsContainer) chartsContainer.style.display = 'none';
        if (tablaContainer) tablaContainer.style.display = 'none';
        if (mapLegend) mapLegend.style.display = 'none';
        
        const tbody = document.getElementById('mapaTableBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Selecciona fechas y haz clic en "Aplicar"</td></tr>';
        
        this.mostrarMensajeInicialMapa();
    }
    
    mostrarLoading(show) {
        const container = document.querySelector('.mapa-calor-map');
        if (!container) return;
        
        let overlay = document.querySelector('.loading-overlay-mapa');
        
        if (show) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'loading-overlay-mapa';
                overlay.innerHTML = `
                    <div class="loading-spinner-mapa">
                        <i class="fas fa-spinner fa-spin"></i>
                        <div>Analizando datos...</div>
                    </div>
                `;
                container.style.position = 'relative';
                container.appendChild(overlay);
            }
        } else {
            if (overlay) overlay.remove();
        }
    }
    
    escapeHTML(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    async inicializar() {
        try {
            const usuario = this.obtenerUsuarioActual();
            this.organizacionActual = {
                nombre: usuario.organizacion || 'Mi Empresa',
                camelCase: usuario.organizacionCamelCase || 'pollosRay'
            };
            
            const { IncidenciaManager } = await import('/clases/incidencia.js');
            const { MercanciaPerdidaManager } = await import('/clases/incidenciaRecuperacion.js');
            const { SucursalManager } = await import('/clases/sucursal.js');
            
            this.incidenciaManager = new IncidenciaManager();
            this.mercanciaManager = new MercanciaPerdidaManager();
            this.sucursalManager = new SucursalManager();
            
            await this.cargarSucursales();
            
            this.inicializarMapa();
            this.mostrarMensajeInicialMapa();
            
        } catch (error) {
            console.error('Error en inicializacion del mapa:', error);
        }
    }
    
    obtenerUsuarioActual() {
        try {
            const adminInfo = localStorage.getItem('adminInfo');
            if (adminInfo) {
                const data = JSON.parse(adminInfo);
                return {
                    id: data.id || data.uid,
                    organizacion: data.organizacion,
                    organizacionCamelCase: data.organizacionCamelCase || 'pollosRay'
                };
            }
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            return {
                organizacionCamelCase: userData.organizacionCamelCase || 'pollosRay'
            };
        } catch (error) {
            return { organizacionCamelCase: 'pollosRay' };
        }
    }
    
    async cargarSucursales() {
        try {
            if (this.organizacionActual.camelCase) {
                this.sucursalesCache = await this.sucursalManager.getSucursalesByOrganizacion(this.organizacionActual.camelCase);
            }
        } catch (error) {
            console.error('Error cargando sucursales:', error);
            this.sucursalesCache = [];
        }
    }
    
    inicializarMapa() {
        if (typeof L === 'undefined') {
            setTimeout(() => this.inicializarMapa(), 500);
            return;
        }
        
        const mapDiv = document.getElementById('mapaCalorComponente');
        if (!mapDiv) {
            console.error('No se encontró el div del mapa');
            return;
        }
        
        const boundsMexico = L.latLngBounds(
            L.latLng(14.5, -118.5),
            L.latLng(33.0, -86.5)
        );
        
        this.mapa = L.map('mapaCalorComponente', {
            maxBounds: boundsMexico,
            maxBoundsViscosity: 1.0,
            minZoom: 5,
            maxZoom: 18,
            zoomDelta: 0.5,
            wheelPxPerZoomLevel: 120
        }).setView([23.6345, -102.5528], 5.5);
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19,
            minZoom: 5,
            bounds: boundsMexico
        }).addTo(this.mapa);
        
        this.mapa.on('drag', () => {
            if (!boundsMexico.contains(this.mapa.getCenter())) {
                this.mapa.panTo(boundsMexico.getCenter());
            }
        });
    }
    
    mostrarMensajeInicialMapa() {
        if (!this.mapa) return;
        
        const mensaje = L.divIcon({
            html: '<div style="background: rgba(0,0,0,0.85); padding: 15px 25px; border-radius: 20px; color: white; text-align: center; border: 1px solid #00cfff;"><i class="fas fa-sliders-h" style="color: #00cfff;"></i><br><strong>Configura los filtros</strong><br>Selecciona fechas y haz clic en "Aplicar"</div>',
            iconSize: [220, 80],
            className: 'custom-div-icon'
        });
        L.marker([23.6345, -102.5528], { icon: mensaje }).addTo(this.mapa);
    }
}

// Inicializar el componente
window.mapaCalorComponente = new MapaCalorEstadistico();