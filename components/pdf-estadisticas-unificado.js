/**
 * PDF ESTADÍSTICAS UNIFICADO - Sistema Centinela
 * VERSIÓN: 1.4 - REORGANIZADO (Top sucursales y Pérdida vs Recuperación en Pág4)
 */

import { PDFBaseGenerator, coloresBase } from './pdf-base-generator.js';

// =============================================
// CONFIGURACIÓN DE COLORES UNIFICADA
// =============================================
export const coloresUnificados = {
    ...coloresBase,
    graficas: {
        actualizadores: '#3b82f6',
        reportadores: '#10b981',
        seguimientos: '#f97316',
        estadoPendiente: '#f97316',
        estadoFinalizada: '#10b981',
        riesgoCritico: '#ef4444',
        riesgoAlto: '#f97316',
        riesgoMedio: '#eab308',
        riesgoBajo: '#10b981',
        categorias: '#8b5cf6',
        sucursales: '#14b8a6',
        tiempo: '#ec4899',
        desempeno: '#8b5cf6',
        perdidas: '#ef4444',
        recuperaciones: '#10b981',
        neto: '#f59e0b',
        porcentaje: '#3b82f6',
        eventos: '#8b5cf6',
        promedio: '#ec4899',
        robo: '#ef4444',
        extravio: '#f59e0b',
        accidente: '#3b82f6',
        otro: '#8b5cf6',
        topSucursales: '#FF6600'
    }
};

const GRID_CONFIG = {
    ANCHO_CONTENEDOR: 90,
    ALTO_CONTENEDOR: 65,
    ALTO_CONTENEDOR_CIRCULAR: 90,
    MARGEN_PAGINA: 12,
    ESPACIADO_HORIZONTAL: 8,
    ESPACIADO_VERTICAL: 8,
    ALTURA_TITULO: 8,
    ALTURA_GRAFICA: 50,
    ALTURA_LEYENDA: 12,
    ALTURA_FILTROS: 10,
    ALTURA_KPI: 28,
    ALTURA_METRICA: 38
};

class PDFEstadisticasUnificadoGenerator extends PDFBaseGenerator {
    constructor() {
        super();
        this.datosIncidencias = null;
        this.datosRecuperacion = null;
        this.metricasIncidencias = null;
        this.estadisticasRecuperacion = null;
        this.sucursalesRecuperacion = [];
        this.filtrosAplicados = {};
        this.fechaInicio = null;
        this.fechaFin = null;
        
        this.sucursalesCache = [];
        this.categoriasCache = [];
        this.usuariosCache = [];

        this.graficasCapturadas = {
            actualizadores: null,
            reportadores: null,
            seguimientos: null,
            estado: null,
            riesgo: null,
            categorias: null,
            sucursalesIncidencias: null,
            tiempoResolucion: null,
            tipoEvento: null,
            evolucionMensual: null,
            topSucursalesRecuperacion: null,
            comparativa: null
        };

        this.fonts = {
            tituloPrincipal: 14,
            titulo: 12,
            subtitulo: 11,
            normal: 10,
            small: 9,
            mini: 8,
            micro: 7
        };
    }

    configurar(config) {
        if (config.organizacionActual) this.organizacionActual = config.organizacionActual;
        if (config.sucursalesCache) this.sucursalesCache = config.sucursalesCache;
        if (config.categoriasCache) this.categoriasCache = config.categoriasCache;
        if (config.usuariosCache) this.usuariosCache = config.usuariosCache;
        if (config.authToken) this.authToken = config.authToken;
    }

    async capturarTodasLasGraficas() {
        const incidenciasCanvasIds = [
            { id: 'graficoActualizadores', key: 'actualizadores' },
            { id: 'graficoReportadores', key: 'reportadores' },
            { id: 'graficoSeguimientos', key: 'seguimientos' },
            { id: 'graficoEstado', key: 'estado' },
            { id: 'graficoRiesgo', key: 'riesgo' },
            { id: 'graficoCategorias', key: 'categorias' },
            { id: 'graficoSucursales', key: 'sucursalesIncidencias' },
            { id: 'graficoTiempo', key: 'tiempoResolucion' }
        ];

        for (const item of incidenciasCanvasIds) {
            const canvas = document.getElementById(item.id);
            if (canvas && canvas instanceof HTMLCanvasElement) {
                try {
                    const scale = 2;
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvas.width * scale;
                    tempCanvas.height = canvas.height * scale;
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
                    this.graficasCapturadas[item.key] = tempCanvas.toDataURL('image/png', 1.0);
                } catch (error) {
                    console.error(`Error capturando gráfica ${item.id}:`, error);
                    this.graficasCapturadas[item.key] = null;
                }
            } else {
                this.graficasCapturadas[item.key] = null;
            }
        }

        const recuperacionCanvasIds = [
            { id: 'graficoTipoEvento', key: 'tipoEvento' },
            { id: 'graficoEvolucionMensual', key: 'evolucionMensual' },
            { id: 'graficoTopSucursales', key: 'topSucursalesRecuperacion' },
            { id: 'graficoComparativa', key: 'comparativa' }
        ];

        for (const item of recuperacionCanvasIds) {
            const canvas = document.getElementById(item.id);
            if (canvas && canvas instanceof HTMLCanvasElement) {
                try {
                    const scale = 2;
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvas.width * scale;
                    tempCanvas.height = canvas.height * scale;
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
                    this.graficasCapturadas[item.key] = tempCanvas.toDataURL('image/png', 1.0);
                } catch (error) {
                    console.error(`Error capturando gráfica ${item.id}:`, error);
                    this.graficasCapturadas[item.key] = null;
                }
            } else {
                this.graficasCapturadas[item.key] = null;
            }
        }
    }

    configurarDatos(datos) {
        this.datosIncidencias = datos.datosIncidencias;
        this.datosRecuperacion = datos.datosRecuperacion;
        
        if (this.datosIncidencias) {
            this.metricasIncidencias = this.datosIncidencias.metricas;
        }
        
        if (this.datosRecuperacion) {
            this.estadisticasRecuperacion = this.datosRecuperacion.estadisticas;
            this.sucursalesRecuperacion = this.datosRecuperacion.sucursalesResumen || [];
        }
        
        if (datos.filtrosAplicados) {
            this.filtrosAplicados = datos.filtrosAplicados;
            this.fechaInicio = datos.filtrosAplicados.fechaInicio;
            this.fechaFin = datos.filtrosAplicados.fechaFin;
        }
    }

    async generarReporte(datos, opciones = {}) {
        try {
            const { mostrarAlerta = true } = opciones;

            this.configurarDatos(datos);

            if (mostrarAlerta) {
                Swal.fire({
                    title: 'Generando Reporte PDF Unificado...',
                    html: `<div style="margin-bottom:10px;"><i class="fas fa-chart-pie" style="font-size:32px; color:#c9a03d;"></i></div>
                        <div class="progress-bar-container" style="width:100%; height:20px; background:rgba(0,0,0,0.1); border-radius:10px; margin-top:10px;">
                            <div class="progress-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #1a3b5d, #c9a03d); border-radius:10px;"></div>
                        </div>
                        <p style="margin-top:12px;">Capturando gráficas de incidencias y recuperación...</p>`,
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    didOpen: () => {
                        let progreso = 0;
                        const intervalo = setInterval(() => {
                            progreso += 3;
                            if (progreso <= 70) {
                                const barra = document.querySelector('.progress-bar');
                                if (barra) barra.style.width = progreso + '%';
                            }
                        }, 100);
                        window._intervaloProgreso = intervalo;
                    }
                });
            }

            await this.capturarTodasLasGraficas();
            await this.cargarLibrerias();
            await this.cargarLogoCentinela();
            await this.cargarLogoOrganizacion();

            if (mostrarAlerta && window._intervaloProgreso) {
                clearInterval(window._intervaloProgreso);
                const barra = document.querySelector('.progress-bar');
                if (barra) barra.style.width = '85%';
            }

            const pdf = new this.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            this.totalPaginas = 4;
            this.paginaActualReal = 1;

            await this._generarContenido(pdf);

            const fechaStr = this.formatearFechaArchivo();
            const nombreArchivo = `ESTADISTICAS_UNIFICADO_${this.organizacionActual?.nombre || 'organizacion'}_${fechaStr}.pdf`;

            if (mostrarAlerta) {
                if (window._intervaloProgreso) clearInterval(window._intervaloProgreso);
                Swal.close();
                await this.mostrarOpcionesDescarga(pdf, nombreArchivo);
            }

            return pdf;

        } catch (error) {
            console.error('Error generando reporte unificado:', error);
            if (window._intervaloProgreso) clearInterval(window._intervaloProgreso);
            if (mostrarAlerta) {
                Swal.close();
                Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo generar el reporte: ' + error.message });
            }
            throw error;
        }
    }

    async _generarContenido(pdf) {
        // =============================================
        // PÁGINA 1 - INCIDENCIAS (Métricas + Colaboradores + Estado/Riesgo)
        // =============================================
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADÍSTICO UNIFICADO', this.organizacionActual?.nombre || 'SISTEMA CENTINELA');

        let yPos = this.alturaEncabezado + 5;
        yPos = this._dibujarFiltrosCompactos(pdf, yPos);
        yPos += 5;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('1. INCIDENCIAS', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 50, yPos - 2);
        yPos += 6;

        if (this.metricasIncidencias) {
            yPos = this._dibujarMetricasIncidencias(pdf, this.metricasIncidencias, yPos);
        } else {
            yPos += 5;
        }
        yPos += 8;

        await this._dibujarGridColaboradores(pdf, yPos);
        yPos += 72;

        await this._dibujarGridEstadoRiesgo(pdf, yPos);
        yPos += 90;

        this.dibujarPiePagina(pdf);

        // =============================================
        // PÁGINA 2 - INCIDENCIAS (Categorías + Sucursales + Tiempo)
        // =============================================
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADÍSTICO UNIFICADO', 'CONTINUACIÓN - INCIDENCIAS');
        yPos = this.alturaEncabezado + 8;

        await this._dibujarGridCategoriasSucursales(pdf, yPos);
        yPos += 85;

        await this._dibujarGraficaTiempo(pdf, yPos);
        yPos += 85;

        if (this.datosIncidencias?.colaboradores?.length > 0) {
            this._dibujarTablaColaboradores(pdf, this.datosIncidencias.colaboradores.slice(0, 8), yPos);
        }

        this.dibujarPiePagina(pdf);

        // =============================================
        // PÁGINA 3 - RECUPERACIÓN (KPIs + 2 gráficas: Tipo evento + Evolución mensual)
        // =============================================
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADÍSTICO UNIFICADO', 'RECUPERACIÓN - GRÁFICAS');
        yPos = this.alturaEncabezado + 5;
        yPos = this._dibujarFiltrosCompactos(pdf, yPos);
        yPos += 5;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('2. RECUPERACIÓN', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 55, yPos - 2);
        yPos += 6;

        if (this.estadisticasRecuperacion) {
            yPos = this._dibujarKPIsRecuperacion(pdf, this.estadisticasRecuperacion, yPos);
        } else {
            yPos += 5;
        }
        yPos += 10;

        // SOLO las 2 primeras gráficas de recuperación en esta página
        await this._dibujarPrimerasGraficasRecuperacion(pdf, yPos);

        this.dibujarPiePagina(pdf);

   
        // =============================================
        // PÁGINA 4 - Top sucursales + Pérdida vs Recuperación + Tablas
        // =============================================
        pdf.addPage();
        this.paginaActualReal++;
        this.dibujarEncabezadoBase(pdf, 'REPORTE ESTADÍSTICO UNIFICADO', 'RECUPERACIÓN - TABLAS Y RESUMEN');
        yPos = this.alturaEncabezado + 8;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('3. GRÁFICAS ADICIONALES', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 70, yPos - 2);
        yPos += 8;

        // Las 2 gráficas restantes (Top sucursales y Pérdida vs Recuperación)
        await this._dibujarSegundasGraficasRecuperacion(pdf, yPos);
        yPos += 80;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('4. RESUMEN POR SUCURSAL', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 70, yPos - 2);
        yPos += 8;

        // Tabla Resumen por sucursal
        if (this.sucursalesRecuperacion.length > 0) {
            yPos = this._dibujarTablaResumenSucursales(pdf, this.sucursalesRecuperacion, yPos);
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.normal);
            pdf.setTextColor(100, 100, 100);
            pdf.text('No hay datos de sucursales para mostrar', GRID_CONFIG.MARGEN_PAGINA, yPos);
            yPos += 20;
        }

        yPos += 10;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.titulo);
        pdf.setTextColor(0, 0, 0);
        pdf.text('5. DESEMPEÑO', GRID_CONFIG.MARGEN_PAGINA, yPos);
        yPos += 6;
        
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(GRID_CONFIG.MARGEN_PAGINA, yPos - 2, GRID_CONFIG.MARGEN_PAGINA + 45, yPos - 2);
        yPos += 8;

        // Tabla de categorías
        if (this.datosIncidencias?.categoriasData?.length > 0) {
            this._dibujarTablaCategorias(pdf, this.datosIncidencias.categoriasData, yPos);
        }

        // =============================================
        // 🔥 AVISO DE PRIVACIDAD - SOLO EN ESTA ÚLTIMA PÁGINA
        // =============================================
        this._dibujarAvisoPrivacidad(pdf);

        this.dibujarPiePagina(pdf);
    }



    // =============================================
    // PRIMERAS GRÁFICAS DE RECUPERACIÓN (Página 3)
    // =============================================
    async _dibujarPrimerasGraficasRecuperacion(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoContenedor = GRID_CONFIG.ANCHO_CONTENEDOR;
        const altoContenedorCircular = GRID_CONFIG.ALTO_CONTENEDOR_CIRCULAR;
        const altoContenedorNormal = GRID_CONFIG.ALTO_CONTENEDOR;
        const espaciadoH = GRID_CONFIG.ESPACIADO_HORIZONTAL;

        const anchoTotal = (anchoContenedor * 2) + espaciadoH;
        const inicioX = margen + ((pdf.internal.pageSize.getWidth() - (margen * 2) - anchoTotal) / 2);
        
        const col1X = inicioX;
        const col2X = inicioX + anchoContenedor + espaciadoH;
        
        const fila1Y = yPos;

        // Gráfica 1: Distribución por tipo (circular con leyenda)
        await this._dibujarGraficaCircularConLeyenda(
            pdf, 'Distribución por tipo de evento',
            this.graficasCapturadas.tipoEvento,
            col1X, fila1Y, anchoContenedor, altoContenedorCircular
        );

        // Gráfica 2: Evolución mensual
        await this._dibujarGraficaNormalConTitulo(
            pdf, 'Evolución mensual',
            this.graficasCapturadas.evolucionMensual,
            col2X, fila1Y, anchoContenedor, altoContenedorNormal
        );
    }

    // =============================================
    // SEGUNDAS GRÁFICAS DE RECUPERACIÓN (Página 4)
    // =============================================
    async _dibujarSegundasGraficasRecuperacion(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoContenedor = GRID_CONFIG.ANCHO_CONTENEDOR;
        const altoContenedorNormal = GRID_CONFIG.ALTO_CONTENEDOR;
        const espaciadoH = GRID_CONFIG.ESPACIADO_HORIZONTAL;

        const anchoTotal = (anchoContenedor * 2) + espaciadoH;
        const inicioX = margen + ((pdf.internal.pageSize.getWidth() - (margen * 2) - anchoTotal) / 2);
        
        const col1X = inicioX;
        const col2X = inicioX + anchoContenedor + espaciadoH;
        
        const fila1Y = yPos;

        // Gráfica 3: Top sucursales con más pérdidas
        await this._dibujarGraficaNormalConTitulo(
            pdf, 'Top sucursales con más pérdidas',
            this.graficasCapturadas.topSucursalesRecuperacion,
            col1X, fila1Y, anchoContenedor, altoContenedorNormal
        );

        // Gráfica 4: Pérdida vs Recuperación
        await this._dibujarGraficaNormalConTitulo(
            pdf, 'Pérdida vs Recuperación',
            this.graficasCapturadas.comparativa,
            col2X, fila1Y, anchoContenedor, altoContenedorNormal
        );
    }

    // =============================================
    // FILTROS COMPACTOS
    // =============================================
    _dibujarFiltrosCompactos(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoContenido = pdf.internal.pageSize.getWidth() - (margen * 2);

        pdf.setFillColor(245, 245, 245);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, yPos, anchoContenido, 10, 2, 2, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);
        pdf.text('FILTROS:', margen + 5, yPos + 4);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);

        let filtroText = '';
        if (this.fechaInicio && this.fechaFin) {
            filtroText += `${this.formatearFechaVisualizacion(new Date(this.fechaInicio))} - ${this.formatearFechaVisualizacion(new Date(this.fechaFin))}`;
        } else {
            filtroText += 'Todo el historial';
        }

        filtroText += ' | ';
        
        if (this.filtrosAplicados.sucursalId && this.filtrosAplicados.sucursalId !== 'todas') {
            filtroText += `Sucursal: ${this.filtrosAplicados.sucursalId}`;
        } else {
            filtroText += 'Todas las sucursales';
        }

        filtroText += ' | ';

        if (this.filtrosAplicados.categoriaId && this.filtrosAplicados.categoriaId !== 'todas') {
            filtroText += `Categoría filtrada`;
        } else {
            filtroText += 'Todas las categorías';
        }

        if (this.filtrosAplicados.tipoEvento && this.filtrosAplicados.tipoEvento !== 'todos') {
            filtroText += ` | Tipo: ${this._capitalize(this.filtrosAplicados.tipoEvento)}`;
        }

        pdf.text(filtroText, margen + 45, yPos + 4);

        return yPos + 10;
    }

    // =============================================
    // MÉTRICAS DE INCIDENCIAS
    // =============================================
    _dibujarMetricasIncidencias(pdf, metricas, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoMetrica = (anchoPagina - (margen * 2) - 15) / 4;
        const espacioMetricas = 5;

        const metricasArray = [
            { titulo: 'CRÍTICAS', valor: metricas.criticas || 0, color: [239, 68, 68] },
            { titulo: 'ALTAS', valor: metricas.altas || 0, color: [249, 115, 22] },
            { titulo: 'PENDIENTES', valor: metricas.pendientes || 0, color: [245, 158, 11] },
            { titulo: 'TOTAL', valor: metricas.total || 0, color: [59, 130, 246] }
        ];

        for (let i = 0; i < metricasArray.length; i++) {
            const met = metricasArray[i];
            const xMetrica = margen + (i * (anchoMetrica + espacioMetricas));
            
            pdf.setFillColor(248, 248, 248);
            pdf.setDrawColor(220, 220, 220);
            pdf.roundedRect(xMetrica, yPos, anchoMetrica, 28, 2, 2, 'FD');

            pdf.setFillColor(met.color[0], met.color[1], met.color[2]);
            pdf.rect(xMetrica, yPos, anchoMetrica, 3, 'F');

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(0, 0, 0);
            pdf.text(met.titulo, xMetrica + 4, yPos + 11);

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.setTextColor(met.color[0], met.color[1], met.color[2]);
            pdf.text(met.valor.toString(), xMetrica + 4, yPos + 24);
        }

        return yPos + 32;
    }

    // =============================================
    // KPIs DE RECUPERACIÓN
    // =============================================
    _dibujarKPIsRecuperacion(pdf, estadisticas, yPos) {
        if (!estadisticas) return yPos;

        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoKPI = (anchoPagina - (margen * 2) - 15) / 3;
        const espacioKPI = 5;

        const formatter = new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });

        const kpisPrimeraFila = [
            { titulo: 'Total Perdido', valor: estadisticas.totalPerdido || 0, color: [239, 68, 68] },
            { titulo: 'Total Recuperado', valor: estadisticas.totalRecuperado || 0, color: [16, 185, 129] },
            { titulo: 'Pérdida Neta', valor: estadisticas.totalNeto || 0, color: [245, 158, 11] }
        ];

        for (let i = 0; i < kpisPrimeraFila.length; i++) {
            const kpi = kpisPrimeraFila[i];
            const xKPI = margen + (i * (anchoKPI + espacioKPI));
            
            pdf.setFillColor(248, 248, 248);
            pdf.setDrawColor(220, 220, 220);
            pdf.roundedRect(xKPI, yPos, anchoKPI, 28, 2, 2, 'FD');

            pdf.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
            pdf.rect(xKPI, yPos, anchoKPI, 3, 'F');

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(0, 0, 0);
            pdf.text(kpi.titulo, xKPI + 4, yPos + 11);

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
            pdf.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
            
            let valorTexto;
            if (typeof kpi.valor === 'number') {
                if (Math.abs(kpi.valor) >= 1000000) {
                    valorTexto = `$${(kpi.valor / 1000000).toFixed(1)}M`;
                } else if (Math.abs(kpi.valor) >= 1000) {
                    valorTexto = `$${(kpi.valor / 1000).toFixed(0)}K`;
                } else {
                    valorTexto = formatter.format(kpi.valor);
                }
            } else {
                valorTexto = kpi.valor;
            }
            pdf.text(valorTexto, xKPI + 4, yPos + 24);
        }

        yPos += 32;

        const kpisSegundaFila = [
            { titulo: 'Tasa Recuperación', valor: `${(estadisticas.porcentajeRecuperacion || 0).toFixed(2)}%`, color: [59, 130, 246] },
            { titulo: 'Total Eventos', valor: estadisticas.totalEventos || 0, color: [139, 92, 246] },
            { titulo: 'Promedio x Evento', valor: estadisticas.promedioPerdida || 0, color: [236, 72, 153] }
        ];

        for (let i = 0; i < kpisSegundaFila.length; i++) {
            const kpi = kpisSegundaFila[i];
            const xKPI = margen + (i * (anchoKPI + espacioKPI));
            
            pdf.setFillColor(248, 248, 248);
            pdf.setDrawColor(220, 220, 220);
            pdf.roundedRect(xKPI, yPos, anchoKPI, 28, 2, 2, 'FD');

            pdf.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
            pdf.rect(xKPI, yPos, anchoKPI, 3, 'F');

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(0, 0, 0);
            pdf.text(kpi.titulo, xKPI + 4, yPos + 11);

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
            pdf.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
            
            let valorTexto;
            if (typeof kpi.valor === 'number' && kpi.titulo !== 'Tasa Recuperación') {
                if (Math.abs(kpi.valor) >= 1000000) {
                    valorTexto = `$${(kpi.valor / 1000000).toFixed(1)}M`;
                } else if (Math.abs(kpi.valor) >= 1000) {
                    valorTexto = `$${(kpi.valor / 1000).toFixed(0)}K`;
                } else if (kpi.titulo === 'Promedio x Evento') {
                    valorTexto = formatter.format(kpi.valor);
                } else {
                    valorTexto = kpi.valor.toLocaleString('es-MX');
                }
            } else {
                valorTexto = kpi.valor;
            }
            pdf.text(valorTexto, xKPI + 4, yPos + 24);
        }

        return yPos + 32;
    }

    // =============================================
    // GRID DE COLABORADORES (3 gráficas)
    // =============================================
    async _dibujarGridColaboradores(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoGrafica = (anchoPagina - (margen * 2) - 16) / 3;
        const espacioGraficas = 8;

        await this._dibujarGraficaSimpleConTitulo(
            pdf, 'Colaboradores que más actualizan',
            this.graficasCapturadas.actualizadores,
            margen, yPos, anchoGrafica, 65
        );

        await this._dibujarGraficaSimpleConTitulo(
            pdf, 'Colaboradores con más reportes',
            this.graficasCapturadas.reportadores,
            margen + anchoGrafica + espacioGraficas, yPos, anchoGrafica, 65
        );

        await this._dibujarGraficaSimpleConTitulo(
            pdf, 'Colaboradores con más seguimientos',
            this.graficasCapturadas.seguimientos,
            margen + (anchoGrafica + espacioGraficas) * 2, yPos, anchoGrafica, 65
        );
    }

    // =============================================
    // GRID DE ESTADO Y RIESGO
    // =============================================
    async _dibujarGridEstadoRiesgo(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoGrafica = (anchoPagina - (margen * 2) - 15) / 2;
        const espacioGraficas = 15;

        await this._dibujarGraficaCircularConTitulo(
            pdf, 'Estado de Incidencias',
            this.graficasCapturadas.estado,
            margen, yPos, anchoGrafica, 75
        );

        await this._dibujarGraficaCircularConTitulo(
            pdf, 'Niveles de Riesgo',
            this.graficasCapturadas.riesgo,
            margen + anchoGrafica + espacioGraficas, yPos, anchoGrafica, 75
        );
    }

    // =============================================
    // GRID DE CATEGORÍAS Y SUCURSALES
    // =============================================
    async _dibujarGridCategoriasSucursales(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoGrafica = (anchoPagina - (margen * 2) - 15) / 2;
        const espacioGraficas = 15;

        await this._dibujarGraficaBarrasConTitulo(
            pdf, 'Incidencias por Categoría',
            this.graficasCapturadas.categorias,
            margen, yPos, anchoGrafica, 70
        );

        await this._dibujarGraficaBarrasConTitulo(
            pdf, 'Incidencias por Sucursal',
            this.graficasCapturadas.sucursalesIncidencias,
            margen + anchoGrafica + espacioGraficas, yPos, anchoGrafica, 70
        );
    }

    // =============================================
    // GRÁFICA DE TIEMPO DE RESOLUCIÓN
    // =============================================
    async _dibujarGraficaTiempo(pdf, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoGrafica = anchoPagina - (margen * 2);

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(margen, yPos, anchoGrafica, 70, 3, 3, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.normal);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Tiempo Promedio de Resolución por Colaborador', margen + 5, yPos + 7);

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(margen + 5, yPos + 11, margen + anchoGrafica - 5, yPos + 11);

        const graficaX = margen + 8;
        const graficaY = yPos + 18;
        const graficaAncho = anchoGrafica - 16;
        const graficaAlto = 48;

        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaAncho, graficaAlto, 'F');

        if (this.graficasCapturadas.tiempoResolucion) {
            try {
                pdf.addImage(this.graficasCapturadas.tiempoResolucion, 'PNG', graficaX + 1, graficaY + 1, graficaAncho - 2, graficaAlto - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error al cargar gráfica', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos de tiempo de resolución', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
        }
    }

    // =============================================
    // GRÁFICA SIMPLE CON TÍTULO
    // =============================================
    async _dibujarGraficaSimpleConTitulo(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
        const padding = 3;
        const alturaTitulo = 14;

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 4, y + alturaTitulo - 2, x + ancho - 4, y + alturaTitulo - 2);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });

        const graficaX = x + padding;
        const graficaY = y + alturaTitulo + 2;
        const graficaAncho = ancho - (padding * 2);
        const graficaAlto = alto - alturaTitulo - 6;

        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaAncho, graficaAlto, 'F');

        if (imagenDataURL) {
            try {
                pdf.addImage(imagenDataURL, 'PNG', graficaX + 1, graficaY + 1, graficaAncho - 2, graficaAlto - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error al cargar gráfica', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
        }
    }

    // =============================================
    // GRÁFICA CIRCULAR CON TÍTULO
    // =============================================
    async _dibujarGraficaCircularConTitulo(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
        const padding = 5;
        const alturaTitulo = 14;

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 4, y + alturaTitulo - 2, x + ancho - 4, y + alturaTitulo - 2);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });

        const graficaLado = Math.min(ancho - (padding * 2), alto - alturaTitulo - 15);
        const graficaX = x + (ancho - graficaLado) / 2;
        const graficaY = y + alturaTitulo + 5;

        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaLado, graficaLado, 'F');

        if (imagenDataURL) {
            try {
                pdf.addImage(imagenDataURL, 'PNG', graficaX + 1, graficaY + 1, graficaLado - 2, graficaLado - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error', graficaX + (graficaLado / 2), graficaY + (graficaLado / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos', graficaX + (graficaLado / 2), graficaY + (graficaLado / 2), { align: 'center' });
        }
    }

    // =============================================
    // GRÁFICA CIRCULAR CON LEYENDA
    // =============================================
    async _dibujarGraficaCircularConLeyenda(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
        const padding = 5;
        const alturaTitulo = 14;
        const alturaLeyenda = 12;

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 4, y + alturaTitulo - 2, x + ancho - 4, y + alturaTitulo - 2);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });

        const graficaLado = Math.min(ancho - (padding * 2), alto - alturaTitulo - alturaLeyenda - 10);
        const graficaX = x + (ancho - graficaLado) / 2;
        const graficaY = y + alturaTitulo + 5;

        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaLado, graficaLado, 'F');

        if (imagenDataURL) {
            try {
                pdf.addImage(imagenDataURL, 'PNG', graficaX + 1, graficaY + 1, graficaLado - 2, graficaLado - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error', graficaX + (graficaLado / 2), graficaY + (graficaLado / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos', graficaX + (graficaLado / 2), graficaY + (graficaLado / 2), { align: 'center' });
        }

        const leyendaY = graficaY + graficaLado + 3;
        const coloresLeyenda = [
            { color: '#ef4444', nombre: 'Robo' },
            { color: '#f59e0b', nombre: 'Extravío' },
            { color: '#3b82f6', nombre: 'Accidente' },
            { color: '#8b5cf6', nombre: 'Otro' }
        ];
        
        const anchoCuadro = 5;
        const espacioEntreItems = 18;
        const inicioXleyenda = x + (ancho / 2) - ((coloresLeyenda.length * espacioEntreItems) / 2);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.mini - 0.5);
        pdf.setTextColor(0, 0, 0);
        
        for (let i = 0; i < coloresLeyenda.length; i++) {
            const item = coloresLeyenda[i];
            const itemX = inicioXleyenda + (i * espacioEntreItems);
            
            pdf.setFillColor(item.color);
            pdf.rect(itemX, leyendaY, anchoCuadro, anchoCuadro, 'F');
            
            pdf.text(item.nombre, itemX + anchoCuadro + 2, leyendaY + 4);
        }
    }

    // =============================================
    // GRÁFICA NORMAL CON TÍTULO
    // =============================================
    async _dibujarGraficaNormalConTitulo(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
        const padding = 3;
        const alturaTitulo = 14;

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 4, y + alturaTitulo - 2, x + ancho - 4, y + alturaTitulo - 2);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });

        const graficaX = x + padding;
        const graficaY = y + alturaTitulo + 2;
        const graficaAncho = ancho - (padding * 2);
        const graficaAlto = alto - alturaTitulo - 6;

        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaAncho, graficaAlto, 'F');

        if (imagenDataURL) {
            try {
                pdf.addImage(imagenDataURL, 'PNG', graficaX + 1, graficaY + 1, graficaAncho - 2, graficaAlto - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error al cargar gráfica', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
        }
    }

    // =============================================
    // GRÁFICA DE BARRAS CON TÍTULO
    // =============================================
    async _dibujarGraficaBarrasConTitulo(pdf, titulo, imagenDataURL, x, y, ancho, alto) {
        const padding = 3;
        const alturaTitulo = 14;

        pdf.setFillColor(252, 252, 252);
        pdf.setDrawColor(200, 200, 200);
        pdf.roundedRect(x, y, ancho, alto, 3, 3, 'FD');

        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(x + 4, y + alturaTitulo - 2, x + ancho - 4, y + alturaTitulo - 2);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.mini);
        pdf.setTextColor(0, 0, 0);
        pdf.text(titulo, x + (ancho / 2), y + 5, { align: 'center' });

        const graficaX = x + padding;
        const graficaY = y + alturaTitulo + 2;
        const graficaAncho = ancho - (padding * 2);
        const graficaAlto = alto - alturaTitulo - 6;

        pdf.setFillColor(255, 255, 255);
        pdf.rect(graficaX, graficaY, graficaAncho, graficaAlto, 'F');

        if (imagenDataURL) {
            try {
                pdf.addImage(imagenDataURL, 'PNG', graficaX + 1, graficaY + 1, graficaAncho - 2, graficaAlto - 2);
            } catch (error) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(this.fonts.mini);
                pdf.setTextColor(100, 100, 100);
                pdf.text('Error al cargar gráfica', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
            }
        } else {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.mini);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Sin datos', graficaX + (graficaAncho / 2), graficaY + (graficaAlto / 2), { align: 'center' });
        }
    }

    // =============================================
    // TABLA DE COLABORADORES
    // =============================================
    _dibujarTablaColaboradores(pdf, colaboradores, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTotal = anchoPagina - (margen * 2);

        if (!colaboradores || colaboradores.length === 0) return;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Desempeño de Colaboradores', margen, yPos);
        yPos += 6;
        
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(margen, yPos - 1, margen + 70, yPos - 1);
        yPos += 6;

        const colAnchos = {
            nombre: 45,
            reportados: 22,
            actualizados: 22,
            seguimientos: 22,
            tiempo: 25,
            eficiencia: 25
        };

        const xInicio = margen;
        const altoFila = 7;

        // Cabecera
        pdf.setFillColor(26, 59, 93);
        pdf.rect(xInicio, yPos - 3, anchoTotal, altoFila + 2, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(255, 255, 255);

        let currentX = xInicio;
        pdf.text('Colaborador', currentX + 2, yPos);
        currentX += colAnchos.nombre;
        pdf.text('Rep', currentX + 2, yPos);
        currentX += colAnchos.reportados;
        pdf.text('Act', currentX + 2, yPos);
        currentX += colAnchos.actualizados;
        pdf.text('Seg', currentX + 2, yPos);
        currentX += colAnchos.seguimientos;
        pdf.text('Tiempo', currentX + 2, yPos);
        currentX += colAnchos.tiempo;
        pdf.text('Efic.', currentX + 2, yPos);

        yPos += altoFila + 2;

        // Cuerpo
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);

        for (let i = 0; i < Math.min(colaboradores.length, 10); i++) {
            const col = colaboradores[i];
            const tiempoPromedio = col.incidenciasResueltas > 0 ? Math.round(col.tiempoTotal / col.incidenciasResueltas) : 0;
            const totalActividad = (col.reportados || 0) + (col.actualizados || 0) + (col.seguimientos || 0);
            const maxActividad = Math.max(...colaboradores.map(c => (c.reportados || 0) + (c.actualizados || 0) + (c.seguimientos || 0)), 1);
            const eficiencia = Math.min(100, Math.round((totalActividad / maxActividad) * 100));

            if (i % 2 === 0) {
                pdf.setFillColor(248, 248, 252);
                pdf.rect(xInicio, yPos - 2.5, anchoTotal, altoFila + 1.5, 'F');
            }

            currentX = xInicio;
            
            let nombre = col.nombre || 'N/A';
            if (nombre.length > 20) nombre = nombre.substring(0, 18) + '..';
            pdf.text(nombre, currentX + 2, yPos);
            currentX += colAnchos.nombre;
            pdf.text((col.reportados || 0).toString(), currentX + 2, yPos);
            currentX += colAnchos.reportados;
            pdf.text((col.actualizados || 0).toString(), currentX + 2, yPos);
            currentX += colAnchos.actualizados;
            pdf.text((col.seguimientos || 0).toString(), currentX + 2, yPos);
            currentX += colAnchos.seguimientos;
            pdf.text(`${tiempoPromedio}h`, currentX + 2, yPos);
            currentX += colAnchos.tiempo;
            
            const barraX = currentX + 2;
            const barraAncho = 20;
            pdf.setFillColor(220, 220, 220);
            pdf.rect(barraX, yPos - 4, barraAncho, 4, 'F');
            pdf.setFillColor(16, 185, 129);
            pdf.rect(barraX, yPos - 4, barraAncho * (eficiencia / 100), 4, 'F');
            pdf.setTextColor(0, 0, 0);
            pdf.text(`${eficiencia}%`, barraX + barraAncho + 3, yPos);

            yPos += altoFila + 1.5;
        }
    }

    // =============================================
    // TABLA DE CATEGORÍAS
    // =============================================
    _dibujarTablaCategorias(pdf, categorias, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTotal = anchoPagina - (margen * 2);

        if (!categorias || categorias.length === 0) return;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Incidencias por Categoría', margen, yPos);
        yPos += 6;
        
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(margen, yPos - 1, margen + 70, yPos - 1);
        yPos += 6;

        const colAnchos = {
            categoria: anchoTotal - 50,
            cantidad: 50
        };

        const xInicio = margen;
        const altoFila = 7;

        // Cabecera
        pdf.setFillColor(26, 59, 93);
        pdf.rect(xInicio, yPos - 3, anchoTotal, altoFila + 2, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(255, 255, 255);
        pdf.text('Categoría', xInicio + 5, yPos);
        pdf.text('Cantidad', xInicio + colAnchos.categoria + 5, yPos);

        yPos += altoFila + 2;

        // Cuerpo
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);

        for (let i = 0; i < Math.min(categorias.length, 15); i++) {
            const cat = categorias[i];
            
            if (i % 2 === 0) {
                pdf.setFillColor(248, 248, 252);
                pdf.rect(xInicio, yPos - 2.5, anchoTotal, altoFila + 1.5, 'F');
            }

            let nombre = cat.nombre || 'N/A';
            if (nombre.length > 35) nombre = nombre.substring(0, 33) + '...';
            pdf.text(nombre, xInicio + 5, yPos);
            pdf.text(cat.cantidad.toString(), xInicio + colAnchos.categoria + 5, yPos);

            yPos += altoFila + 1.5;
        }
    }

    // =============================================
    // TABLA RESUMEN SUCURSALES
    // =============================================
    _dibujarTablaResumenSucursales(pdf, sucursales, yPos) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const anchoTotal = anchoPagina - (margen * 2);
        const altoPagina = pdf.internal.pageSize.getHeight();

        if (!sucursales || sucursales.length === 0) return yPos;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Resumen por Sucursal', margen, yPos);
        yPos += 6;
        
        pdf.setDrawColor(201, 160, 61);
        pdf.setLineWidth(0.5);
        pdf.line(margen, yPos - 1, margen + 60, yPos - 1);
        yPos += 6;

        const colAnchos = {
            sucursal: 35,
            eventos: 15,
            perdido: 30,
            recuperado: 30,
            neto: 30,
            porcentaje: 20
        };

        const xInicio = margen;
        const altoFila = 6.5;
        const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 });

        // Cabecera
        pdf.setFillColor(26, 59, 93);
        pdf.rect(xInicio, yPos - 3, anchoTotal, altoFila + 2, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(255, 255, 255);

        let currentX = xInicio;
        pdf.text('Sucursal', currentX + 2, yPos);
        currentX += colAnchos.sucursal;
        pdf.text('Evt', currentX + 2, yPos);
        currentX += colAnchos.eventos;
        pdf.text('Perdido', currentX + 2, yPos);
        currentX += colAnchos.perdido;
        pdf.text('Recuperado', currentX + 2, yPos);
        currentX += colAnchos.recuperado;
        pdf.text('Neta', currentX + 2, yPos);
        currentX += colAnchos.neto;
        pdf.text('% Rec', currentX + 2, yPos);

        yPos += altoFila + 2;

        // Calcular cuántas filas caben
        const espacioRestante = altoPagina - yPos - 35;
        const maxFilas = Math.min(Math.floor(espacioRestante / (altoFila + 1.5)), sucursales.length, 14);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);

        for (let i = 0; i < maxFilas; i++) {
            const suc = sucursales[i];
            
            if (i % 2 === 0) {
                pdf.setFillColor(248, 248, 252);
                pdf.rect(xInicio, yPos - 2.5, anchoTotal, altoFila + 1.5, 'F');
            }

            currentX = xInicio;
            
            let nombre = suc.nombre || 'N/A';
            if (nombre.length > 18) nombre = nombre.substring(0, 16) + '..';
            pdf.text(nombre, currentX + 2, yPos);
            currentX += colAnchos.sucursal;
            pdf.text((suc.eventos || 0).toString(), currentX + 2, yPos);
            currentX += colAnchos.eventos;
            
            let perdidoStr;
            const perdido = suc.perdido || 0;
            if (perdido >= 1000000) perdidoStr = `$${(perdido / 1000000).toFixed(1)}M`;
            else if (perdido >= 1000) perdidoStr = `$${(perdido / 1000).toFixed(0)}K`;
            else perdidoStr = formatter.format(perdido);
            pdf.setTextColor(239, 68, 68);
            pdf.text(perdidoStr, currentX + 2, yPos);
            currentX += colAnchos.perdido;
            
            let recuperadoStr;
            const recuperado = suc.recuperado || 0;
            if (recuperado >= 1000000) recuperadoStr = `$${(recuperado / 1000000).toFixed(1)}M`;
            else if (recuperado >= 1000) recuperadoStr = `$${(recuperado / 1000).toFixed(0)}K`;
            else recuperadoStr = formatter.format(recuperado);
            pdf.setTextColor(16, 185, 129);
            pdf.text(recuperadoStr, currentX + 2, yPos);
            currentX += colAnchos.recuperado;
            
            const neto = perdido - recuperado;
            let netoStr;
            if (Math.abs(neto) >= 1000000) netoStr = `$${(neto / 1000000).toFixed(1)}M`;
            else if (Math.abs(neto) >= 1000) netoStr = `$${(neto / 1000).toFixed(0)}K`;
            else netoStr = formatter.format(neto);
            pdf.setTextColor(neto > 0 ? 239 : 16, neto > 0 ? 68 : 185, neto > 0 ? 68 : 129);
            pdf.text(netoStr, currentX + 2, yPos);
            currentX += colAnchos.neto;
            
            pdf.setTextColor(59, 130, 246);
            pdf.text(`${(suc.porcentaje || 0).toFixed(1)}%`, currentX + 2, yPos);

            yPos += altoFila + 1.5;
        }

        if (sucursales.length > maxFilas) {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(this.fonts.micro);
            pdf.setTextColor(100, 100, 100);
            pdf.text(`* Mostrando ${maxFilas} de ${sucursales.length} sucursales`, margen, yPos + 3);
            yPos += 8;
        } else {
            yPos += 5;
        }

        return yPos;
    }

    _capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    dibujarEncabezadoBase(pdf, titulo, subtitulo) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const alturaEncabezado = 38;

        pdf.saveGraphicsState();

        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, anchoPagina, alturaEncabezado, 'F');

        pdf.setDrawColor(coloresBase.primario);
        pdf.setFillColor(coloresBase.primario);
        pdf.rect(0, 0, anchoPagina, 2, 'F');

        const dimensiones = this.dimensionesLogo;
        const yLogo = 18;
        const xLogoDerecha = anchoPagina - margen - (dimensiones.diametro * 2) - dimensiones.separacion;
        const xCentinela = xLogoDerecha;
        const xOrganizacion = xCentinela + dimensiones.diametro + dimensiones.separacion;

        this._dibujarLogos(pdf, xCentinela, xOrganizacion, yLogo, dimensiones.diametro / 2);

        pdf.setTextColor(coloresBase.primario);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(this.fonts.tituloPrincipal);
        pdf.text(titulo, anchoPagina / 2, 14, { align: 'center' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.small);
        pdf.setTextColor(0, 0, 0);
        pdf.text(subtitulo, anchoPagina / 2, 21, { align: 'center' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);
        pdf.text(`Generado: ${this.formatearFecha(new Date())}`, margen, 30);

        pdf.setDrawColor(coloresBase.secundario);
        pdf.setLineWidth(0.5);
        pdf.line(margen, alturaEncabezado - 2, anchoPagina - margen, alturaEncabezado - 2);

        pdf.restoreGraphicsState();
    }

    dibujarPiePagina(pdf) {
        const margen = GRID_CONFIG.MARGEN_PAGINA;
        const anchoPagina = pdf.internal.pageSize.getWidth();
        const altoPagina = pdf.internal.pageSize.getHeight();
        const alturaPie = 8;

        pdf.saveGraphicsState();
        
        pdf.setDrawColor(coloresBase.secundario);
        pdf.setLineWidth(0.3);
        pdf.line(margen, altoPagina - alturaPie - 2, anchoPagina - margen, altoPagina - alturaPie - 2);
        
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(this.fonts.micro);
        pdf.setTextColor(0, 0, 0);
        pdf.text('Sistema Centinela - Reporte Estadístico Unificado', margen, altoPagina - 4);

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(0, 0, 0);
        pdf.text(`Página ${this.paginaActualReal} de ${this.totalPaginas}`, anchoPagina - margen, altoPagina - 4, { align: 'right' });
        
        pdf.setDrawColor(coloresBase.primario);
        pdf.setFillColor(coloresBase.primario);
        pdf.rect(0, altoPagina - 1.5, anchoPagina, 1.5, 'F');
        
        pdf.restoreGraphicsState();
    }
    // =============================================
// AVISO DE PRIVACIDAD - SOLO EN ÚLTIMA PÁGINA
// =============================================
_dibujarAvisoPrivacidad(pdf) {
    const margen = GRID_CONFIG.MARGEN_PAGINA;
    const anchoContenido = pdf.internal.pageSize.getWidth() - (margen * 2);
    const altoPagina = pdf.internal.pageSize.getHeight();
    const alturaAviso = 30;

    pdf.saveGraphicsState();
    
    pdf.setFillColor(248, 248, 248);
    pdf.rect(margen, altoPagina - alturaAviso - 8, anchoContenido, alturaAviso, 'F');
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(this.fonts.mini);
    pdf.setTextColor(80, 80, 80);
    pdf.text("AVISO DE PRIVACIDAD", margen + 6, altoPagina - alturaAviso - 2);
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(this.fonts.mini - 0.5);
    pdf.setTextColor(100, 100, 100);
    
    const aviso = "La información contenida en este documento es responsabilidad exclusiva de quien utiliza el Sistema Centinela. Este reporte tiene carácter informativo y no constituye un documento legal oficial. Los datos aquí presentados son confidenciales y de uso interno.";
    const lineasAviso = this.dividirTextoEnLineas(pdf, aviso, anchoContenido - 20);
    
    let yAviso = altoPagina - alturaAviso + 6;
    for (let i = 0; i < Math.min(lineasAviso.length, 2); i++) {
        pdf.text(lineasAviso[i], margen + 6, yAviso + (i * 4.5));
    }
    
    pdf.restoreGraphicsState();
}
}

export const generadorPDFEstadisticasUnificado = new PDFEstadisticasUnificadoGenerator();
export default generadorPDFEstadisticasUnificado;